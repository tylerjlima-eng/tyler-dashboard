"""Failsafe: copy the freshly computed signals over data/signals.json only if they look healthy.

Keeps the previous data/signals.json (exit 0, prints KEEP) when:
  - the new file is missing / unreadable / has no items, or
  - more than --max-insufficient (default 0.8; a healthy sales run is ~50%, a snapshot-only cold start is 100%) of card x grade entries are insufficient_data, or
  - fewer than --min-sales (default 0.25) of entries come from the sales variant (scrape mostly failed), or
  - the sales-variant share fell below half of the previous file's (partial scrape failure).
Usage: python scripts/sales/promote_signals.py --new .cache/sales/signals.new.json --dest data/signals.json
"""
import argparse, json, os, shutil, sys

GRADES = ("Ungraded", "PSA 10")

def assess(doc):
    ents = [v[g] for v in (doc.get("items") or {}).values() for g in GRADES if isinstance(v.get(g), dict)]
    if not ents: return 0, 1.0, 0.0
    n = len(ents)
    return n, sum(e.get("flag") == "insufficient_data" for e in ents) / n, sum(e.get("variant") == "sales" for e in ents) / n

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--new", default=os.path.join(".cache", "sales", "signals.new.json"))
    ap.add_argument("--dest", default=os.path.join("data", "signals.json"))
    ap.add_argument("--max-insufficient", type=float, default=0.8)
    ap.add_argument("--min-sales", type=float, default=0.25)
    a = ap.parse_args(argv)
    try: doc = json.load(open(a.new))
    except Exception as e:
        print(f"KEEP previous {a.dest}: new signals unreadable ({e})"); return 0
    n, insuf, sales = assess(doc)
    msg = f"entries={n} insufficient={insuf:.0%} sales_variant={sales:.0%}"
    try: _, _, prev_sales = assess(json.load(open(a.dest)))
    except Exception: prev_sales = 0.0
    msg += f" prev_sales_variant={prev_sales:.0%}"
    if n == 0 or insuf > a.max_insufficient or sales < a.min_sales or sales < prev_sales / 2:
        print(f"KEEP previous {a.dest}: {msg}"); return 0
    tmp = a.dest + ".tmp"; shutil.copyfile(a.new, tmp); os.replace(tmp, a.dest)
    print(f"PROMOTED {a.new} -> {a.dest}: {msg}"); return 0

if __name__ == "__main__": sys.exit(main())
