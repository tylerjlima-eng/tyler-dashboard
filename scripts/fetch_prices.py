#!/usr/bin/env python3
"""Daily price snapshot. Sources: PriceCharting / SportsCardsPro product pages (prices derived from
completed eBay sales), YGOPRODeck API (TCGplayer/eBay/Cardmarket prices). Stdlib only. No secrets."""
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo
import json, re, html, time, urllib.request, urllib.parse, datetime, os
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
    if "/game/" not in final and item.get("path"):
        raise RuntimeError("product page not found (redirected to search) - check path")
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
    t = re.search(r"<title>([^<]+)", h)
    parts = [x.strip() for x in html.unescape(t.group(1)).split("|")] if t else []
    return {"url": final.split("?")[0], "title": parts[0] if parts else None, "set": parts[1] if len(parts) > 1 else None, "prices": cur, "monthly": hist}
def ygoprodeck(name):
    _, b = get("https://db.ygoprodeck.com/api/v7/cardinfo.php?name=" + urllib.parse.quote(name))
    p = json.loads(b)["data"][0]["card_prices"][0]
    return {k.replace("_price", ""): float(v) for k, v in p.items() if float(v or 0) > 0}
def pct(a, b): return round((a - b) / b * 100, 1) if a and b else None
def main():
    watch = json.load(open(D("watchlist.json")))
    hist = json.load(open(D("history.json"))) if os.path.exists(D("history.json")) else {}
    today = datetime.datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")  # snapshot day in Tyler's time zone
    try:
        P = json.load(open(D("prices.json"))); prev_updated = P.get("updated")
        prev = {(i.get("path") or i.get("q")): i for i in P.get("items", []) if not i.get("stale_since") or True}
    except Exception: prev, prev_updated = {}, None
    out, errors = [], []
    def grab(it):
        rec, errs = dict(it), []
        for attempt in range(4):
            try: rec.update(pricecharting(it)); break
            except Exception as e:
                if attempt == 3 or "redirected to search" in str(e):
                    errs.append({"item": it["name"], "source": "pricecharting", "error": str(e)[:200]})
                    old = prev.get(it.get("path") or it.get("q"))
                    if old and old.get("prices"):  # carry forward last good values, clearly marked stale
                        rec.update({k: old[k] for k in ("url", "title", "set", "prices", "monthly") if k in old}); rec["stale_since"] = old.get("stale_since") or prev_updated
                    break
                time.sleep(15 * (attempt + 1) if "429" in str(e) else 3)
        time.sleep(1.5)
        if it.get("ygo"):
            try: rec["ygoprodeck"] = ygoprodeck(it["ygo"])
            except Exception as e: errs.append({"item": it["name"], "source": "ygoprodeck", "error": str(e)[:200]})
        return rec, errs
    with ThreadPoolExecutor(2) as ex: fetched = list(ex.map(grab, watch))
    for it, (rec, errs) in zip(watch, fetched):
        key = it.get("path") or it.get("q"); errors += errs
        p = rec.get("prices", {})
        if p and not rec.get("stale_since"): hist.setdefault(key, {})[today] = {g: p[g] for g in ("Ungraded", "PSA 10") if g in p}
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
        out.append(rec)
    json.dump(hist, open(D("history.json"), "w"), separators=(",", ":"))
    json.dump({"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "items": out, "errors": errors}, open(D("prices.json"), "w"), indent=1)
    print(f"{len(out)} items, {len(errors)} errors"); [print(e) for e in errors]
if __name__ == "__main__": main()
