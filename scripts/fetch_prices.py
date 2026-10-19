#!/usr/bin/env python3
"""Daily price snapshot. Sources: PriceCharting / SportsCardsPro product pages (prices derived from
completed eBay sales), YGOPRODeck API (TCGplayer/eBay/Cardmarket prices). Stdlib only. No secrets."""
import json, re, time, urllib.request, urllib.parse, datetime, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, "data", *p)
UA = {"User-Agent": "Mozilla/5.0 (tyler-dashboard price snapshot; personal use)"}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r: return r.geturl(), r.read().decode("utf-8", "replace")
def money(s): return float(s.replace("$", "").replace(",", "")) if s and "$" in s else None
GRADES = {"used": "Ungraded", "cib": "Grade 7", "new": "Grade 8", "graded": "Grade 9", "boxonly": "Grade 9.5", "manualonly": "PSA 10"}
def pricecharting(item):
    base = "https://www.sportscardspro.com/game/" if item["cat"] == "sports" else "https://www.pricecharting.com/game/"
    if item.get("path"): url = base + urllib.parse.quote(item["path"], safe="/&")
    else: url = "https://www.pricecharting.com/search-products?type=prices&q=" + urllib.parse.quote_plus(item["q"])
    final, h = get(url)
    if "/game/" not in final:
        m = re.search(r'href="(https://www\.(?:pricecharting|sportscardspro)\.com)?(/game/[^"?#]+)"', h)
        if not m: raise RuntimeError("no product match")
        final, h = get((m.group(1) or "https://www.pricecharting.com") + m.group(2))
    cur = {}
    for k, idn in [("used", "used_price"), ("cib", "complete_price"), ("new", "new_price"), ("graded", "graded_price"), ("boxonly", "box_only_price"), ("manualonly", "manual_only_price")]:
        m = re.search(r'id="%s"[^>]*>\s*<span class="price js-price">\s*([^<]+)' % idn, h)
        v = money(m.group(1).strip()) if m else None
        if v: cur[GRADES[k]] = v
    hist = {}
    m = re.search(r"chart_data = (\{.*?\});", h)
    if m:
        for k, pts in json.loads(m.group(1)).items():
            if k in GRADES: hist[GRADES[k]] = [[p[0] // 1000, p[1] / 100] for p in pts if p[1]][-13:]
    t = re.search(r"<title>([^<|]+)", h)
    return {"url": final.split("?")[0], "title": t.group(1).strip() if t else None, "prices": cur, "monthly": hist}
def ygoprodeck(name):
    _, b = get("https://db.ygoprodeck.com/api/v7/cardinfo.php?name=" + urllib.parse.quote(name))
    p = json.loads(b)["data"][0]["card_prices"][0]
    return {k.replace("_price", ""): float(v) for k, v in p.items() if float(v or 0) > 0}
def pct(a, b): return round((a - b) / b * 100, 1) if a and b else None
def main():
    watch = json.load(open(D("watchlist.json")))
    hist = json.load(open(D("history.json"))) if os.path.exists(D("history.json")) else {}
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    out, errors = [], []
    for it in watch:
        key = it.get("path") or it.get("q"); rec = dict(it)
        try: rec.update(pricecharting(it))
        except Exception as e: errors.append({"item": it["name"], "source": "pricecharting", "error": str(e)[:200]})
        if it.get("ygo"):
            try: rec["ygoprodeck"] = ygoprodeck(it["ygo"])
            except Exception as e: errors.append({"item": it["name"], "source": "ygoprodeck", "error": str(e)[:200]})
        p = rec.get("prices", {})
        if p: hist.setdefault(key, {})[today] = {g: p[g] for g in ("Ungraded", "PSA 10") if g in p}
        days = sorted(hist.get(key, {}))
        def ago(n, g):
            t = (datetime.date.fromisoformat(today) - datetime.timedelta(days=n)).isoformat()
            c = [d for d in days if d <= t]
            return hist[key][c[-1]].get(g) if c else None
        rec["change"] = {}
        for g in ("Ungraded", "PSA 10"):
            now = p.get(g); m = rec.get("monthly", {}).get(g, [])
            prevm = m[-2][1] if len(m) >= 2 else None
            d30 = ago(30, g)
            rec["change"][g] = {"1d": pct(now, ago(1, g)), "7d": pct(now, ago(7, g)), "30d": pct(now, d30) if d30 else pct(now, prevm),
                                "30d_src": "daily snapshots" if d30 else ("PriceCharting monthly history (vs prior month point)" if prevm else None)}
        out.append(rec); time.sleep(1)
    json.dump(hist, open(D("history.json"), "w"), separators=(",", ":"))
    json.dump({"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "items": out, "errors": errors}, open(D("prices.json"), "w"), indent=1)
    print(f"{len(out)} items, {len(errors)} errors"); [print(e) for e in errors]
if __name__ == "__main__": main()
