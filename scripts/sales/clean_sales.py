"""Wrong-bucket filter for out/sales.json (output of sales_scraper.py).

Every row is either KEPT (out/sales_clean.json, same schema as sales.json) or QUARANTINED
(out/sales_quarantine.json, with the reason(s)). Nothing gets edited or synthesized; rows are only sorted into one file or the other.
Rules run on the listing title against the watchlist card and the bucket grade. They're conservative: a number/grader
rule only fires when the title states a conflicting value explicitly.

Usage: python3 clean_sales.py [--sales out/sales.json] [--watchlist ...]
"""
import argparse, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
GRADERS = r"(?:BGS|CGC|SGC|BECKETT|TAG|ACE|HGA|GMA|KSA|MNT|ISA|AGS|CSG|PGS|ARS|BVG)"

BLOCK = [  # (reason, regex) applied to every bucket
    ("sealed_product", r"\b(booster|(?<!mega )(?<!mega-)packs?(?!\s*(?:fresh|pulled))|box(es)?|blister|etb|elite trainer|sealed|tin|bundle|wax|hobby case|unopened)\b"),
    ("lot_or_multi", r"\b(lot|lots|bulk|set of|complete set|x\s?[2-9]|[2-9]\s?x|[2-9]\s?cards|playset)\b"),
    ("reprint_or_anniversary", r"\b(reprint|re-print|rp|30th|25th anniv\w*|celebrations?|classic collection|anniversary|replica|reproduction|repro)\b"),
    ("altered_or_authentic_only", r"\b(psa\s*aa|authentic\s*altered|altered|trimmed|psa\s*authentic|authentic only|\bauth\b|psa\s*a\b|(?:sgc|bgs|cgc)\s*a\b|\(authentic\)|bgs\s*authentic)\b"),
    ("proxy_custom_fanart", r"\b(proxy|custom|fan\s*art|orica|fake|novelty|metal card|gold plated|24k|sticker|coin|jumbo|oversized?)\b"),
    ("digital", r"\b(digital|nft|tcg live|ptcgo|code card|online code|topps bunt|bunt)\b"),
    ("non_english", r"\b(japanese|japan|jpn|korean|chinese|french|german|italian|spanish|portuguese|s-chinese|t-chinese)\b"),
]
LOT_EXCEPT = re.compile(r"\b(\d+\s?cards?)\b")  # placeholder (not used)

def card_meta(item):
    n = item["name"]; p = item["path"].split("/")[-1]; cat = item["cat"]
    m = {"cat": cat, "first_ed": bool(re.search(r"1st", n + p, re.I)), "num": None, "code": None}
    if cat == "yugioh":
        c = re.search(r"([A-Z0-9]{2,5})-(EN)?([0-9]{3})", n)
        if c: m["code"] = (c.group(1).upper(), c.group(3))
    elif cat == "pokemon":
        c = re.search(r"#\s*([A-Z]*\d+)", n) or re.search(r"\b(GG\d+|SV\d+)\b", n)
        if c: m["num"] = c.group(1).upper()
    else:
        c = re.search(r"#\s*([A-Z]*-?\d+)", n)
        if c: m["num"] = c.group(1).upper().replace("-", "")
        m["all_nums"] = [x.upper().replace("-", "") for x in re.findall(r"[A-Z]*-?\d+", n.split("#", 1)[1].split(" ")[0])] if "#" in n else []
        m["variant_words"] = set(re.findall(r"[a-z]+", n.lower()))
    # sets printed in both 1st Edition and Unlimited (edition mismatch is detectable/meaningful only here)
    m["has_unlimited"] = bool(re.search(r"legend-of-blue-eyes|metal-raiders|magic-ruler|pharaoh's-servant|legacy-of-darkness|magician's-force|starter-deck|duelist-genesis|maximum-crisis|pokemon-base-set|pokemon-neo-genesis", item["path"]))
    m["set_has_tin"] = "tin" in item["path"].split("/")[0]
    m["anniv_set"] = "anniversary" in item["path"]
    return m

SPORTS_PARALLEL = ["silver", "refractor", "auto", "autograph", "gold", "green", "red", "blue", "purple", "orange",
                   "pink", "mojo", "wave", "cracked ice", "hyper", "shimmer", "disco", "camo", "tie-dye", "prizm silver",
                   "x-fractor", "xfractor", "sepia", "black", "parallel"]
TEAM_SAFE = re.compile(r"blue jays|red sox|golden state|red wings|green bay|orange county", re.I)

def check(title, grade, meta):
    """-> list of reasons (empty = keep)."""
    t = title.lower(); r = []
    for reason, rx in BLOCK:
        if reason == "sealed_product" and meta["cat"] == "yugioh" and meta.get("sealed"): continue
        if reason == "sealed_product" and meta.get("set_has_tin") and re.search(r"\btins?\b", t) and not re.search(r"sealed|unopened|booster|(?<!mega )(?<!mega-)\bpacks?\b", t): continue
        if reason == "reprint_or_anniversary" and meta.get("anniv_set") and not re.search(r"reprint|replica|repro|30th|celebrations|classic collection", t): continue
        if re.search(rx, t): r.append("mega_box_variant" if reason == "sealed_product" and "mega box" in t else reason)
    gm = re.findall(r"\b(PSA|%s)\s*(?:(?:GEM|MINT|MT|NM|NM-MT|EX|EX-MT|VG|VG-EX|GOOD|GD|FAIR|FR|POOR|PR|PRISTINE|BLACK|LABEL)[\s\-/+]*){0,3}(\d{1,2}(?:\.5)?)\b(?!\s*/)" % GRADERS[3:-1], title, re.I)
    if grade == "PSA 10":
        if re.search(r"\b(not graded|ungraded|raw|no grade|psa ready|psa 10\?|ready for grading|candidate|potential)\b", t):
            r.append("not_graded_in_psa10")
        if re.search(r"\b%s\b" % GRADERS, title, re.I) and not re.search(r"\bpsa\b", t): r.append("wrong_grader")
        if any(g.upper() == "PSA" and n != "10" for g, n in gm): r.append("wrong_grade")
        if not re.search(r"\bpsa\s?\d", t) and not re.search(r"\bpsa\b", t) and "not_graded_in_psa10" not in r and "wrong_grader" not in r:
            r.append("psa_not_stated")
    elif grade == "Ungraded":
        if gm or re.search(r"\bgraded\b(?!\s*ready)|\bslab(bed)?\b", t) and not re.search(r"\bungraded|not graded\b", t):
            r.append("graded_in_ungraded")
    # edition
    if meta["cat"] in ("yugioh", "pokemon"):
        has1 = re.search(r"\b1st\b|first edition|1st ed|\b1\.\s?ed\b|\b1\.\s?auflage\b", t)
        if not meta["has_unlimited"]: pass
        elif meta["first_ed"] and re.search(r"\bunlimited\b|\bunl\b|\bunlim\b", t): r.append("wrong_edition_unlimited")
        if meta["has_unlimited"] and not meta["first_ed"] and has1: r.append("wrong_edition_1st")
        # every Base Set 1st Edition card is shadowless, so 'shadowless' only marks a wrong variant on Unlimited pages
        if meta["cat"] == "pokemon" and not meta["first_ed"] and re.search(r"\bshadowless\b", t): r.append("wrong_variant_shadowless")
        # on a 1st Ed page, 'Shadowless' without '1st' is the separate Unlimited-Shadowless print
        if meta["cat"] == "pokemon" and meta["first_ed"] and re.search(r"\bshadowless\b", t) and not has1: r.append("wrong_variant_shadowless")
    # card number
    if meta.get("code"):
        s, n = meta["code"]
        codes = re.findall(r"\b([a-z0-9]{2,5})-(?:en|e|eng)?(\d{3})\b", t)
        if codes and not any(c == s.lower() and d == n for c, d in codes): r.append("wrong_card_number")
    elif meta.get("num") and meta["cat"] == "pokemon":
        want = meta["num"].lstrip("0") or "0"
        nums = [a.upper().lstrip("0") for a, _ in re.findall(r"\b([a-z]*\d+)\s*/\s*([a-z]*\d+)\b", t)]
        nums += [a.upper().lstrip("0") for a in re.findall(r"#\s*([a-z]*\d+)\b", t)]
        if nums and want not in nums and not any(re.sub(r"^[A-Z]+", "", x) == re.sub(r"^[A-Z]+", "", want) for x in nums):
            r.append("wrong_card_number")
    elif meta.get("num"):
        nums = [x.upper().replace("-", "") for x in re.findall(r"#\s*([a-z]*-?\d+)\b", t)]
        wants = meta["all_nums"]
        if nums and not any(w in nums or w.lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ") in [x.lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for x in nums] for w in wants):
            r.append("wrong_card_number")
        tt = re.sub(r"mba\s+(silver|gold|bronze)|no green", " ", TEAM_SAFE.sub(" ", t))
        extra = [w for w in SPORTS_PARALLEL if re.search(r"\b%s\b" % re.escape(w), tt) and w.split()[0] not in meta["variant_words"]]
        if "autograph" in meta["variant_words"] or "auto" in meta["variant_words"]:
            extra = [w for w in extra if w not in ("auto", "autograph")]
        if extra: r.append("parallel_or_variant:" + "|".join(extra))
    return sorted(set(r))

def clean(sales, watchlist):
    wl = {i["path"]: i for i in watchlist if i.get("path")}
    kept, quar = {}, {}
    for key, rec in sales.items():
        item = wl.get(key)
        if not item: continue
        meta = card_meta(item); meta["sealed"] = "sealed" in key or "tin" in item["name"].lower()
        k = {x: v for x, v in rec.items() if not isinstance(v, list)}; q = dict(k)
        for g, rows in rec.items():
            if not isinstance(rows, list): continue
            k[g], q[g] = [], []
            for row in rows:
                rs = check(row["title"], g, meta)
                if meta["sealed"]: rs = [x for x in rs if x != "sealed_product"]
                (q[g].append(dict(row, reasons=rs)) if rs else k[g].append(row))
        kept[key] = k; quar[key] = q
    return kept, quar

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sales", default=os.path.join(".cache", "sales", "sales.json"))
    ap.add_argument("--watchlist", default="data/watchlist.json")
    ap.add_argument("--out", default=os.path.join(".cache", "sales", "sales_clean.json"))
    ap.add_argument("--quarantine", default=os.path.join(".cache", "sales", "sales_quarantine.json"))
    a = ap.parse_args()
    k, q = clean(json.load(open(a.sales)), json.load(open(a.watchlist)))
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump(k, open(a.out, "w"), indent=1)
    json.dump(q, open(a.quarantine, "w"), indent=1)
    from collections import Counter
    c = Counter(x.split(":")[0] for r in q.values() for g, L in r.items() if isinstance(L, list) for row in L for x in row["reasons"])
    nk = sum(len(L) for r in k.values() for L in r.values() if isinstance(L, list))
    nq = sum(len(L) for r in q.values() for L in r.values() if isinstance(L, list))
    print("kept", nk, "quarantined", nq, dict(c))
