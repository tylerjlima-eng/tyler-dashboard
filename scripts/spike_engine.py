"""Spike engine implementing /workspace/dashboard/research/spike-rule.md.

Variant B (snapshot) runs on history.json  {card_key: {YYYY-MM-DD: {grade: value}}}.
Variant A (sales) runs where a sales list exists: {card_key: {grade: [[iso_date_or_epoch, price], ...]}}
(no such list exists in the repo today; pass --sales FILE when one does).

Output: out/signals.json. Per card+grade the object matches what app.js reads from
prices.json items[].signal[grade]: {flag, pct (percent), now, base, basis, floor, day_jump?}
plus extra provenance fields (variant, n_*, as_of, last_snapshot). Flags: SPIKE_ALERT, SPIKE_WATCH,
DROP_ALERT, DROP_WATCH, normal, insufficient_data, below_price_floor.
"""
import json, math, statistics as st, datetime as dt, argparse, os

GRADES = ("Ungraded", "PSA 10")

def classify(pct, absd, floor):
    if abs(absd) < floor: return "normal"
    if pct >= 0.50: return "SPIKE_ALERT"
    if pct >= 0.25: return "SPIKE_WATCH"
    if pct <= -0.40: return "DROP_ALERT"
    if pct <= -0.25: return "DROP_WATCH"
    return "normal"

def mod_z_filter(prices, cut=3.5):
    prices = [p for p in prices if p and p > 0]
    if len(prices) < 4: return prices
    x = [math.log(p) for p in prices]
    m = st.median(x); mad = st.median([abs(v - m) for v in x])
    if mad == 0:
        c = math.exp(m); return [p for p in prices if 0.5 * c <= p <= 2 * c]
    return [p for p, v in zip(prices, x) if abs(0.6745 * (v - m) / mad) <= cut]

def _d(s): return dt.date.fromisoformat(s) if isinstance(s, str) else dt.datetime.fromtimestamp(s, dt.timezone.utc).date()

# ---------------- Variant A: sales ----------------
def sales_signal(sales, today, min_s=3, min_b=5):
    """sales: [(date|epoch, price)] for ONE card+grade bucket."""
    td = _d(today); rows = [(( td - _d(t)).days, p) for t, p in sales]
    for sd, bd in ((7, 30), (14, 60)):
        short = mod_z_filter([p for a, p in rows if 0 <= a < sd])
        base = mod_z_filter([p for a, p in rows if sd <= a < sd + bd])
        if len(short) >= min_s and len(base) >= min_b: break
    else:
        return {"flag": "insufficient_data", "variant": "sales", "n_short": len(short), "n_base": len(base)}
    ms, mb = st.median(short), st.median(base)
    if mb < 3: return {"flag": "below_price_floor", "variant": "sales", "now": ms, "base": mb}
    p, floor = ms / mb - 1, max(5.0, 0.10 * mb)
    flag = classify(p, ms - mb, floor)
    need = math.ceil(len(short) / 2)
    hi = sum(x >= 1.25 * mb for x in short); lo = sum(x <= 0.75 * mb for x in short)
    if flag.startswith("SPIKE") and hi < need: flag = "normal"
    if flag.startswith("DROP") and lo < need: flag = "normal"
    return {"flag": flag, "pct": round(p * 100, 1), "now": round(ms, 2), "base": round(mb, 2), "floor": round(floor, 2),
            "basis": f"median of sold prices, last {sd}d vs prior {bd}d", "variant": "sales",
            "n_short": len(short), "n_base": len(base), "confirm": f"{hi if p>0 else lo} of {len(short)} recent sales beyond ±25% of baseline"}

# ---------------- Variant B: snapshots ----------------
def dedupe(series):
    """Keep a snapshot only when the value changed (rule B 'Storage'); unchanged feeds are not extra observations."""
    out = []
    for d, v in series:
        if v is None or v <= 0: continue
        if not out or out[-1][1] != v: out.append((d, v))
    return out

def snapshot_signal(series, today):
    """series: sorted [(YYYY-MM-DD, value)] raw daily snapshots for ONE card+grade+source."""
    raw = [(d, v) for d, v in series if v]
    if not raw: return {"flag": "insufficient_data", "variant": "snapshot", "n_snapshots": 0}
    td = _d(today); age = lambda d: (td - _d(d)).days
    snaps = dedupe(raw); vals = [v for _, v in snaps]
    now = st.median(vals[-3:])
    out = {"variant": "snapshot", "now": round(now, 2), "n_snapshots": len(raw), "n_changes": len(snaps),
           "days_of_history": age(raw[0][0]) + 1, "last_snapshot": raw[-1][0]}
    base_vals = [v for d, v in snaps if 8 <= age(d) <= 37]
    # p7: snapshot nearest t-7d (+/-2d) from the raw daily series
    near7 = sorted([(abs(age(d) - 7), v) for d, v in raw if abs(age(d) - 7) <= 2])
    p7 = near7[0][1] if near7 else None
    # day jump with next-changed-snapshot confirmation
    if len(vals) >= 2:
        floor_dj = max(5.0, 0.10 * vals[-2])
        if len(vals) >= 3:
            pre = vals[-3]; j1 = vals[-2] / pre - 1; j2 = vals[-1] / pre - 1
            if abs(j1) >= 0.30 and abs(vals[-2] - pre) >= max(5.0, 0.10 * pre) and abs(j2) >= 0.25 and (j1 > 0) == (j2 > 0):
                out["day_jump"] = "confirmed"
        d1 = vals[-1] / vals[-2] - 1
        if "day_jump" not in out and abs(d1) >= 0.30 and abs(vals[-1] - vals[-2]) >= floor_dj:
            out["day_jump"] = "pending confirmation"; out["d1_pct"] = round(d1 * 100, 1)
    if len(base_vals) < 5:
        out.update(flag="insufficient_data", basis=f"cold start: {len(base_vals)} changed snapshots 8-37d old (need 5)")
        if out.get("day_jump") == "confirmed":
            p = vals[-1] / vals[-3] - 1; f = max(5.0, 0.10 * vals[-3])
            out.update(flag=classify(p, vals[-1] - vals[-3], f), pct=round(p * 100, 1), base=vals[-3], floor=round(f, 2),
                       basis="cold start: confirmed day jump vs pre-jump snapshot")
        return out
    base = st.median(base_vals)
    if base < 3: out.update(flag="below_price_floor", base=round(base, 2)); return out
    floor = max(5.0, 0.10 * base)
    d30 = now / base - 1; d7 = now / p7 - 1 if p7 else None
    c = [x for x in (d30, d7) if x is not None]; p = max(c) if max(c) > 0 else min(c)
    out.update(flag=classify(p, now - base, floor), pct=round(p * 100, 1), base=round(base, 2), floor=round(floor, 2),
               d30_pct=round(d30 * 100, 1), d7_pct=None if d7 is None else round(d7 * 100, 1),
               basis="median of last 3 changed snapshots vs median of changed snapshots 8-37d old")
    if out.get("day_jump") == "pending confirmation" and out["flag"].endswith("ALERT"):
        out["flag"] = out["flag"].replace("ALERT", "WATCH")  # unconfirmed 1-day move can't alert
    return out

def run(history, today, sales=None, names=None):
    res = {}
    for k, days in history.items():
        ds = sorted(days); r = {"name": (names or {}).get(k)}
        for g in GRADES:
            if sales and g in sales.get(k, {}): r[g] = sales_signal(sales[k][g], today)
            else: r[g] = snapshot_signal([(d, days[d].get(g)) for d in ds], today)
        res[k] = r
    return res

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", default="/workspace/dashboard/data/history.json")
    ap.add_argument("--prices", default="/workspace/dashboard/data/prices.json")
    ap.add_argument("--sales"); ap.add_argument("--today")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out/signals.json"))
    a = ap.parse_args()
    H = json.load(open(a.history)); P = json.load(open(a.prices)) if os.path.exists(a.prices) else {}
    names = {(i.get("path") or i.get("q")): i["name"] for i in P.get("items", [])}
    today = a.today or dt.datetime.now(__import__("zoneinfo").ZoneInfo("America/New_York")).date().isoformat()
    res = run(H, today, json.load(open(a.sales)) if a.sales else None, names)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    doc = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "as_of": today,
           "prices_updated": P.get("updated"), "rule": "research/spike-rule.md", "items": res}
    json.dump(doc, open(a.out, "w"), indent=1)
    from collections import Counter
    print(Counter(s["flag"] for r in res.values() for g, s in r.items() if g in GRADES))
    for k, r in res.items():
        for g in GRADES:
            s = r[g]
            if s.get("day_jump") or s["flag"] not in ("normal", "insufficient_data", "below_price_floor"):
                print(r["name"], g, s)
