#!/usr/bin/env python3
"""Set Values index: total raw (ungraded) market value of every card in a set, with Type > Year > Maker rollups.

Allowed sources only (never invented numbers; sets with no allowed source are "pending"):
  * Pokemon  -> pokemontcg.io v2 (TCGplayer market price, USD, informational), base/unlimited printing per card.
  * Yu-Gi-Oh -> YGOPRODeck v7 (per-printing set_price, USD). Responses cached locally in .cache/; card images
               re-hosted as thumbnails in data/ygo_thumbs.json (no hotlinking).
  * Sports / Disney -> pending until an allowed source exists; a per-set plug-in file (see plugin()) can supply them.
  No PriceCharting / SportsCardsPro / PokeData data is used.
Failsafe: a set whose fetch fails keeps its previous entry (status "stale"); if nothing could be fetched the old
files are left untouched. History: one snapshot per day in data/set_index_history.json (raw + PSA 10 when present).
"""
import json, os, re, sys, time, datetime as dt, urllib.request, urllib.parse, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, "data", *p)
UA = {"User-Agent": "Mozilla/5.0 (CardDesk set-index; personal dashboard)"}
TODAY = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4))).date().isoformat()

def get(url, data=None, tries=6, headers=None):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            err = e
            time.sleep(4 * (i + 1))
    raise err

def load(p, default):
    try: return json.load(open(p))
    except Exception: return default

# ---------------- fetchers: each returns (cards[{name,price,psa10,img}], meta{logo,count}) ----------------
CACHE = os.path.join(ROOT, ".cache", "set_index")
def cached(name, url, max_age_h=36):
    """YGOPRODeck asks clients to store data locally: keep raw responses in .cache/ (never committed)."""
    os.makedirs(CACHE, exist_ok=True); f = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9_.-]", "_", name) + ".json")
    if os.path.exists(f) and time.time() - os.path.getmtime(f) < max_age_h * 3600: return json.load(open(f))
    d = get(url); json.dump(d, open(f, "w")); return d

VAR = ["normal", "holofoil", "unlimited", "unlimitedHolofoil"]
def pokemontcg(key):
    """pokemontcg.io v2: TCGplayer market price (USD) per card; base (non-1st-ed, non-reverse) printing."""
    cards, page = [], 1
    hdr = {"X-Api-Key": os.environ["POKEMONTCG_API_KEY"]} if os.environ.get("POKEMONTCG_API_KEY") else {}
    while True:
        q = urllib.parse.urlencode({"q": f"set.id:{key}", "pageSize": 100, "page": page, "select": "id,name,number,tcgplayer,images"})
        j = get("https://api.pokemontcg.io/v2/cards?" + q, headers=hdr)
        for d in j["data"]:
            tp = (d.get("tcgplayer") or {}).get("prices") or {}
            price = None
            for v in VAR + [k for k in tp if k not in VAR]:
                if v in tp and "1st" not in v.lower() and "reverse" not in v.lower():
                    price = tp[v].get("market") or tp[v].get("mid")
                    if price: break
            cards.append({"name": f"{d['name']} #{d.get('number','')}", "price": price, "img": (d.get("images") or {}).get("small"),
                          "url": (d.get("tcgplayer") or {}).get("url")})
        if page * 100 >= j.get("totalCount", 0): break
        page += 1; time.sleep(1)
    if not cards: raise ValueError("no cards")
    return cards, {"count": len(cards)}

THUMBS = {k: v for k, v in load(D("ygo_thumbs.json"), {}).items() if len(v) < 6000}  # drop legacy large thumbs
def thumb(cid):
    """Re-host YGOPRODeck images (no hotlinking): small JPEG thumbnail stored as data URI in data/ygo_thumbs.json."""
    k = str(cid)
    if k in THUMBS: return "ygo:" + k
    try:
        import io, base64
        from PIL import Image
        raw = urllib.request.urlopen(urllib.request.Request(f"https://images.ygoprodeck.com/images/cards_small/{cid}.jpg", headers=UA), timeout=30).read()
        im = Image.open(io.BytesIO(raw)).convert("RGB"); im.thumbnail((84, 122))
        b = io.BytesIO(); im.save(b, "JPEG", quality=62, optimize=True); THUMBS[k] = "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
        return "ygo:" + k
    except Exception:
        return None

def ygoprodeck(key):
    """YGOPRODeck v7: per-printing set_price (USD), every printing (code+rarity) in the set counted once."""
    d = cached("ygo_" + key, "https://db.ygoprodeck.com/api/v7/cardinfo.php?" + urllib.parse.urlencode({"cardset": key}))["data"]
    cards, seen = [], set()
    for c in d:
        for ps in c.get("card_sets", []):
            if ps.get("set_name") != key: continue
            k = (ps.get("set_code"), ps.get("set_rarity"))
            if k in seen: continue
            seen.add(k)
            p = float(ps.get("set_price") or 0) or None
            cards.append({"name": f"{c['name']} ({ps.get('set_code')}, {ps.get('set_rarity_code','').strip('()') or ps.get('set_rarity')})",
                          "price": p, "cid": c["id"]})
    if not cards: raise ValueError("no cards")
    return cards, {"count": len(cards)}

def none(key): raise ValueError("pending: no licensed/allowed bulk price source yet")

# Plug-in: <SET_PRICES_DIR>/<set id>.json = {"source": "...", "allowed": true, "cards": [{"name","price","psa10"?,"img"?}]}
# (e.g. from the price bot). Only used when the file declares an allowed source.
PLUG = os.environ.get("SET_PRICES_DIR", os.path.join(ROOT, "data", "set_prices"))
def plugin(sid):
    f = os.path.join(PLUG, sid + ".json")
    if not os.path.exists(f): return None
    j = json.load(open(f))
    if not j.get("allowed") or re.search(r"pricecharting|sportscardspro|pokedata", j.get("source", ""), re.I): return None
    cards = [{"name": c["name"], "price": c.get("price"), "psa10": c.get("psa10"), "img": c.get("img")} for c in j["cards"]]
    return cards, {"count": len(cards), "label": j["source"]}

FETCH = {"pokemontcg": pokemontcg, "ygoprodeck": ygoprodeck, "none": none}
SRC = {"pokemontcg": "pokemontcg.io · TCGplayer market (raw, informational)", "ygoprodeck": "YGOPRODeck v7 · set price (raw)",
       "none": "pending: no allowed source yet"}

def change(hist, total, days):
    if not hist or total is None: return None
    cutoff = (dt.date.fromisoformat(TODAY) - dt.timedelta(days=days)).isoformat()
    old = [v for d, v in hist if d <= cutoff and v]
    return round((total / old[-1] - 1) * 100, 2) if old else None

def rollups(out, series):
    """Type > Year > Maker (skipped for Pokemon) totals. Change compares the same sets' totals then vs now."""
    groups = {}
    for x in out:
        if x.get("total") is None: continue
        path = [x["type"], x["year"] or "?"] + ([] if x["type"] == "Pokémon" else [x["maker"] or "?"])
        for i in range(1, len(path) + 1):
            groups.setdefault(" > ".join(path[:i]), []).append(x)
    res = []
    for k, xs in sorted(groups.items()):
        g = {"path": k.split(" > "), "level": ["type", "year", "maker"][len(k.split(" > ")) - 1],
             "total": round(sum(x["total"] for x in xs), 2), "sets": len(xs), "cards": sum(x["priced"] or 0 for x in xs)}
        for days, f in ((7, "chg7"), (30, "chg30")):
            cutoff = (dt.date.fromisoformat(TODAY) - dt.timedelta(days=days)).isoformat()
            now = then = 0
            for x in xs:
                old = [v for d, v in series.get(x["id"], []) if d <= cutoff and v]
                if old: now += x["total"]; then += old[-1]
            g[f] = round((now / then - 1) * 100, 2) if then else None
        res.append(g)
    return res

def build(s):
    pl = plugin(s["id"])
    cards, meta = pl or FETCH[s["source"]](s["key"])
    priced = [c for c in cards if c["price"]]
    if not priced: raise ValueError("no priced cards")
    total = round(sum(c["price"] for c in priced), 2)
    top = sorted(priced, key=lambda c: -c["price"])[:5]
    t5 = []
    for c in top:
        if c.get("cid") and not c.get("img"): c["img"] = thumb(c["cid"])
        t5.append({"name": c["name"], "share": round(c["price"] / total * 100, 1), "img": c.get("img"), "price": round(c["price"], 2), "url": c.get("url")})
    g = [c["psa10"] for c in cards if c.get("psa10")]
    return {"total": total, "psa10_total": round(sum(g), 2) if g else None, "psa10_priced": len(g), "cards": meta["count"], "priced": len(priced),
            "top5": t5, "plugin_label": meta.get("label"), "logo": s.get("logo"), "key_img": next((c["img"] for c in t5 if c["img"]), None)}

def main():
    only = set(sys.argv[1:])
    reg = load(D("sets.json"), {})["sets"]
    old = {x["id"]: x for x in load(D("set_index.json"), {}).get("sets", [])}
    hist = load(D("set_index_history.json"), {"snapshots": []})
    series = {}
    for snap in hist["snapshots"]:
        for k, v in snap["totals"].items(): series.setdefault(k, []).append((snap["date"], v))
    out, ok = [], 0
    def work(s):
        if only and s["id"] not in only: return s, old.get(s["id"]), "skip"
        try: return s, build(s), None
        except Exception as e: return s, None, repr(e)[:160]
    with cf.ThreadPoolExecutor(2) as ex:
        results = list(ex.map(work, reg))
    for s, r, err in results:
        base = {k: s.get(k) for k in ("id", "name", "cat", "game", "source", "why", "type", "year", "maker", "set", "keyset", "note")}
        base["source_label"] = (r or {}).get("plugin_label") or SRC[s["source"]]
        if r and err is None:
            ok += 1; base.update(r); base.update(status="ok", as_of=TODAY)
        elif r and err == "skip":
            base.update({k: v for k, v in r.items() if k not in base})
        elif s["id"] in old and old[s["id"]].get("total") is not None:
            base.update({k: v for k, v in old[s["id"]].items() if k not in base}); base.update(status="stale", error=err)
        else:
            base.update(status="pending", total=None, error=err)
        h = [p for p in series.get(s["id"], []) if p[0] != TODAY]
        if base.get("status") == "ok": h.append((TODAY, base["total"]))
        base["chg7"], base["chg30"] = change(h, base.get("total"), 7), change(h, base.get("total"), 30)
        base["spark"] = [v for _, v in h[-30:]]
        print(f"{base['status']:8} {s['id']:60} {base.get('total')} {err or ''}", flush=True)
        out.append(base)
    if ok == 0:
        print("No set fetched; keeping previous data/set_index.json"); return 1
    snap_tot = {x["id"]: x["total"] for x in out if x.get("status") == "ok"}
    hist["snapshots"] = [s for s in hist["snapshots"] if s["date"] != TODAY]
    prev = next((s for s in hist["snapshots"][::-1]), None)
    if only and prev:  # partial run: carry other totals forward only if already in today's set
        pass
    hist["snapshots"].append({"date": TODAY, "totals": snap_tot})
    hist["snapshots"] = sorted(hist["snapshots"], key=lambda s: s["date"])[-400:]
    idx_roll = rollups(out, series)
    idx = {"rollups": idx_roll, "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "date": TODAY,
           "note": "Raw/ungraded totals = sum of every priced card in the set. Sports sets show aggregates only.",
           "sources": SRC, "sets": out}
    snap_psa = {x["id"]: x["psa10_total"] for x in out if x.get("status") == "ok" and x.get("psa10_total")}
    if snap_psa: hist["snapshots"][-1]["psa10"] = snap_psa
    used = {t["img"][4:] for x in out for t in (x.get("top5") or []) if (t.get("img") or "").startswith("ygo:")}
    thumbs = {k: v for k, v in THUMBS.items() if k in used}
    for p, obj in ((D("set_index.json"), idx), (D("set_index_history.json"), hist), (D("ygo_thumbs.json"), thumbs)):
        tmp = p + ".tmp"; json.dump(obj, open(tmp, "w"), ensure_ascii=False, separators=(",", ":")); os.replace(tmp, p)
    print(f"ok {ok}/{len(reg)}"); return 0

if __name__ == "__main__":
    sys.exit(main())
