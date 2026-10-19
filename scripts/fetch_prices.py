#!/usr/bin/env python3
"""Daily price snapshot. Sources: PriceCharting / SportsCardsPro product pages (prices derived from
completed eBay sales), YGOPRODeck API (TCGplayer/eBay/Cardmarket prices). Stdlib only. No secrets."""
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo
import statistics, json, re, html, time, urllib.request, urllib.parse, datetime, os
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
    im = re.search(r'id="product_details".*?(https://storage\.googleapis\.com/images\.pricecharting\.com/\w+)/\d+\.jpg', h, re.S)
    return {"img": im.group(1) + "/240.jpg" if im else None, "img_lg": im.group(1) + "/1600.jpg" if im else None,
            "url": final.split("?")[0], "title": parts[0] if parts else None, "set": parts[1] if len(parts) > 1 else None, "prices": cur, "monthly": hist}
def ygoprodeck(card_id, set_code):
    """Keyed on passcode + set_code (name lookups can return alt-art passcodes). set_price is a lowest ASKING price
    for that printing; "0" means missing."""
    _, b = get("https://db.ygoprodeck.com/api/v7/cardinfo.php?id=%d" % card_id)
    c = json.loads(b)["data"][0]
    sp = [float(x["set_price"]) for x in c.get("card_sets", []) if x.get("set_code") == set_code and float(x.get("set_price") or 0) > 0]
    return {"set_code": set_code, "set_price": min(sp) if sp else None,
            "all_printings_low": {k.replace("_price", ""): float(v) for k, v in c["card_prices"][0].items() if float(v or 0) > 0}}
def tcgdex(card_id):
    """Pokemon fallback (Cardmarket EUR sold averages). Never mixed with USD PriceCharting values."""
    _, b = get("https://api.tcgdex.net/v2/en/cards/" + urllib.parse.quote(card_id))
    cm = (json.loads(b).get("pricing") or {}).get("cardmarket") or {}
    keep = {k: cm.get(k) for k in ("updated", "avg", "trend", "avg7", "avg30", "low")}
    t, a30 = keep.get("trend"), keep.get("avg30")
    keep["suspect"] = bool(t and a30 and max(t, a30) / max(min(t, a30), 0.01) > 10)  # trend vs avg30 disagree >10x
    keep["avg7_vs_avg30_pct"] = None if keep["suspect"] or not (keep.get("avg7") and a30) else round((keep["avg7"] / a30 - 1) * 100, 1)
    return keep
WATCH, ALERT, DROP_WATCH, DROP_ALERT = 0.25, 0.50, -0.25, -0.40
def classify(p, absd, floor):
    if p is None or abs(absd) < floor: return "normal"
    return "SPIKE_ALERT" if p >= ALERT else "SPIKE_WATCH" if p >= WATCH else "DROP_ALERT" if p <= DROP_ALERT else "DROP_WATCH" if p <= DROP_WATCH else "normal"
def signal(series, today, monthly):
    """Snapshot-variant spike rule (research/spike-rule.md B) adapted to PriceCharting guide values.
    series: sorted [(date, value)] of our daily snapshots. monthly: PriceCharting monthly guide history."""
    if not series: return {"flag": "insufficient_data"}
    td = datetime.date.fromisoformat(today); age = lambda d: (td - datetime.date.fromisoformat(d)).days
    vals = [v for _, v in series]; now = statistics.median(vals[-3:])
    base_vals = [v for d, v in series if 8 <= age(d) <= 37]
    if len(base_vals) >= 5: base, basis = statistics.median(base_vals), "median of our snapshots 8-37 days old"
    elif len(monthly) >= 2: base, basis = monthly[-2][1], "PriceCharting prior-month guide value (cold start)"
    else: return {"flag": "insufficient_data", "now": now}
    if base < 3: return {"flag": "below_price_floor", "now": now, "base": base}
    near7 = [v for d, v in series if abs(age(d) - 7) <= 2]
    d30 = now / base - 1; d7 = now / near7[-1] - 1 if near7 else None
    cands = [x for x in (d30, d7) if x is not None]; p = max(cands) if max(cands) > 0 else min(cands)
    floor = max(5.0, 0.10 * base); flag = classify(p, now - base, floor)
    out = {"flag": flag, "pct": round(p * 100, 1), "now": now, "base": round(base, 2), "basis": basis, "floor": round(floor, 2)}
    if len(vals) >= 3:  # day jump needs confirmation by the next snapshot
        pre = vals[-3]; j1, j2 = vals[-2] / pre - 1, vals[-1] / pre - 1
        if abs(vals[-1] / vals[-2] - 1) >= 0.30 and abs(vals[-1] - vals[-2]) >= floor: out["day_jump"] = "pending confirmation"
        elif abs(j1) >= 0.30 and abs(j2) >= 0.25 and (j1 > 0) == (j2 > 0): out["day_jump"] = "confirmed"
    return out
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
        if it.get("ygo_id"):
            try: rec["ygoprodeck"] = ygoprodeck(it["ygo_id"], it["ygo_set"])
            except Exception as e: errs.append({"item": it["name"], "source": "ygoprodeck", "error": str(e)[:200]})
        if it.get("tcgdex") and (not rec.get("prices") or rec.get("stale_since")):  # fallback only when PriceCharting failed
            try: rec["tcgdex_cardmarket"] = tcgdex(it["tcgdex"])
            except Exception as e: errs.append({"item": it["name"], "source": "tcgdex", "error": str(e)[:200]})
        if not rec.get("img"):  # image fallbacks: YGOPRODeck card art, TCGdex scan, else last known
            if it.get("ygo_id"): rec["img"] = rec["img_lg"] = "https://images.ygoprodeck.com/images/cards_small/%d.jpg" % it["ygo_id"]
            elif it.get("tcgdex"):
                try:
                    _, b = get("https://api.tcgdex.net/v2/en/cards/" + urllib.parse.quote(it["tcgdex"])); base = json.loads(b).get("image")
                    if base: rec["img"], rec["img_lg"] = base + "/low.webp", base + "/high.webp"
                except Exception: pass
            if not rec.get("img") and prev.get(it.get("path") or it.get("q"), {}).get("img"): rec["img"] = prev[it.get("path") or it.get("q")]["img"]
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
        rec["signal"] = {g: signal([(d, hist[key][d][g]) for d in days if g in hist[key][d]], today, rec.get("monthly", {}).get(g, [])) for g in ("Ungraded", "PSA 10")}
        out.append(rec)
    json.dump(hist, open(D("history.json"), "w"), separators=(",", ":"))
    json.dump({"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "items": out, "errors": errors}, open(D("prices.json"), "w"), indent=1)
    print(f"{len(out)} items, {len(errors)} errors"); [print(e) for e in errors]
if __name__ == "__main__": main()
