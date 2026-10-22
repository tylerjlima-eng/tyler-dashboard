"""Scrape the public 'Sold Listings' tables on PriceCharting / SportsCardsPro product pages.

robots.txt (checked 2026-10-19) only disallows /stripe-connect, /publish-offer, /buy; /game/* is allowed.
ToS: "Price Data" (incl. historical pricing) is PriceCharting property. Personal use is OK; showing it in an
app/site that third parties can reach needs express written permission (see SALES_OPTIONS.md).
Every row is a real sale as listed on the page; nothing is synthesized. Dates are the page's sale date (day only).

Usage: python3 sales_scraper.py --keys KEY1,KEY2  |  --limit N   [--grades "Ungraded,PSA 10"] [--max-age-h 12]
"""
import argparse, datetime as dt, hashlib, html, json, os, re, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "TylerDashboardSalesResearch/0.1 (personal card-price tracker; github.com/tylerjlima-eng; 1 req/s)"
CACHE = os.environ.get("SALES_CACHE_DIR", os.path.join(".cache", "sales-pages"))  # not committed; CI restores it via actions/cache
_last = [0.0]

def fetch(url, max_age_h=12, tries=4):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".html")
    if os.path.exists(fn) and time.time() - os.path.getmtime(fn) < max_age_h * 3600:
        return open(fn, encoding="utf-8").read(), dt.datetime.fromtimestamp(os.path.getmtime(fn), dt.timezone.utc)
    for i in range(tries):
        wait = 1.0 - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
            body = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
            open(fn, "w", encoding="utf-8").write(body)
            return body, dt.datetime.now(dt.timezone.utc)
        except urllib.error.HTTPError as e:
            if e.code == 404 or (400 <= e.code < 500 and e.code != 429): raise
            err = e
        except Exception as e: err = e
        time.sleep(2 ** (i + 1))
    raise err

def text(s): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

def tab_map(page):
    """{'Ungraded': 'completed-auctions-used', 'PSA 10': 'completed-auctions-manual-only', ...} from the page's own selector."""
    return {re.sub(r"\s*\(\d+\)$", "", text(lbl)): cls for cls, lbl in
            re.findall(r'<option value="(completed-auctions-[a-z-]+)">(.*?)</option>', page)}

def parse_tab(page, cls):
    m = re.search(r'<div class="%s"[^>]*>(.*?)</table>' % re.escape(cls), page, re.S)
    if not m: return []
    out = []
    for rid, row in re.findall(r'<tr id="([^"]+)"[^>]*>(.*?)</tr>', m.group(1), re.S):
        d = re.search(r'<td class="date">\s*(\d{4}-\d{2}-\d{2})', row)
        p = re.search(r'class="js-price"[^>]*>\s*\$([\d,]+\.?\d*)', row)
        t = re.search(r'<td class="title">(.*?)</td>', row, re.S)
        if not (d and p and t): continue
        title = text(t.group(1)); src = re.search(r"\[([^\]]+)\]\s*$", title)
        a = re.search(r'href="([^"]+)"', t.group(1))
        url = html.unescape(a.group(1)).split("?")[0] if a else None
        out.append({"date": d.group(1), "price": float(p.group(1).replace(",", "")),
                    "title": re.sub(r"\s*\[[^\]]+\]\s*$", "", title),
                    "source": (src.group(1) if src else rid.split("-")[0]).lower(),
                    "url": url, "sale_id": rid})
    return out

def product_url(item):
    host = "www.sportscardspro.com" if item["cat"] == "sports" else "www.pricecharting.com"
    return f"https://{host}/game/{item['path']}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--watchlist", default="data/watchlist.json")
    ap.add_argument("--keys"); ap.add_argument("--limit", type=int)
    ap.add_argument("--grades", default="Ungraded,PSA 10")
    ap.add_argument("--max-age-h", type=float, default=12)
    ap.add_argument("--out", default=os.path.join(".cache", "sales", "sales.json"))
    a = ap.parse_args()
    wl = [i for i in json.load(open(a.watchlist)) if i.get("path")]  # q-only items have no product page
    if a.keys: ks = a.keys.split(","); wl = [i for i in wl if i["path"] in ks]
    if a.limit: wl = wl[:a.limit]
    grades = [g.strip() for g in a.grades.split(",")]
    res = {}  # fresh each run: only this run's scrape feeds the signals
    ok = fail = 0
    for it in wl:
        url = product_url(it)
        try: page, ts = fetch(url, a.max_age_h)
        except Exception as e: print("FAIL", it["path"], e, file=sys.stderr); fail += 1; continue
        ok += 1
        tm = tab_map(page); rec = {"fetched_at": ts.isoformat(timespec="seconds"), "product_url": url, "name": it["name"]}
        for g in grades:
            if g in tm: rec[g] = parse_tab(page, tm[g])
        res[it["path"]] = rec
        print(it["path"], {g: len(rec.get(g, [])) for g in grades})
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(res, open(a.out, "w"), indent=1)
    print("ok", ok, "failed", fail, file=sys.stderr)
    if wl and ok == 0: sys.exit(2)  # total failure -> non-zero so the workflow keeps the previous signals.json

if __name__ == "__main__": main()
