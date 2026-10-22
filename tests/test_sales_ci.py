"""Tests for the sales-signal CI step. Run from the repo root:  python -m pytest tests/test_sales_ci.py
Format test needs a populated page cache (.cache/sales-pages or $SALES_CACHE_DIR); it serves pages from cache only (no network)."""
import json, os, re, shutil, subprocess, sys, pathlib, pytest

ROOT = pathlib.Path(os.environ.get("REPO_ROOT", pathlib.Path(__file__).resolve().parents[1]))
S = ROOT / "scripts" / "sales"
FLAGS = {"SPIKE_ALERT", "SPIKE_WATCH", "DROP_ALERT", "DROP_WATCH", "normal", "insufficient_data", "below_price_floor"}
GRADES = ("Ungraded", "PSA 10")
CACHE = pathlib.Path(os.environ.get("SALES_CACHE_DIR", ROOT / ".cache" / "sales-pages"))

def run(cmd, cwd, env=None, check=True):
    p = subprocess.run([sys.executable, *cmd], cwd=cwd, capture_output=True, text=True, env={**os.environ, **(env or {})})
    if check: assert p.returncode == 0, p.stderr[-2000:]
    return p

@pytest.fixture()
def repo(tmp_path):
    r = tmp_path / "repo"; (r / "data").mkdir(parents=True)
    for f in ("watchlist.json", "history.json", "prices.json", "signals.json"):
        if (ROOT / "data" / f).exists(): shutil.copy(ROOT / "data" / f, r / "data" / f)
    shutil.copytree(S, r / "scripts" / "sales")
    return r

def test_no_hardcoded_workspace_paths():
    for f in S.glob("*.py"):
        assert "/workspace" not in f.read_text(), f

def test_workflow_steps_and_minimal_commit():
    wf = (ROOT / ".github" / "workflows" / "refresh-prices.yml").read_text()
    order = ["fetch_prices.py", "sales_scraper.py", "clean_sales.py", "spike_engine.py --history", "--sales .cache/sales/sales_clean.json --out", "promote_signals.py", "Commit snapshot"]
    pos = [wf.index(x) for x in order]; assert pos == sorted(pos)
    add = re.search(r"git add (.*)", wf).group(1)
    assert "data/signals.json" in add and "sales" not in add and ".cache" not in add

@pytest.mark.skipif(not CACHE.is_dir() or not any(CACHE.iterdir()) if CACHE.exists() else True, reason="no sales page cache")
def test_pipeline_output_matches_dashboard_and_alert_format(repo):
    env = {"SALES_CACHE_DIR": str(CACHE)}
    run(["scripts/sales/sales_scraper.py", "--max-age-h", "1e9"], repo, env)
    run(["scripts/sales/clean_sales.py"], repo)
    run(["scripts/sales/spike_engine.py", "--sales", ".cache/sales/sales_clean.json"], repo)
    assert "PROMOTED" in run(["scripts/sales/promote_signals.py"], repo).stdout
    doc = json.loads((repo / "data" / "signals.json").read_text())
    assert {"generated", "as_of", "prices_updated", "rule", "items"} <= set(doc) and re.fullmatch(r"\d{4}-\d\d-\d\d", doc["as_of"])
    wl = json.loads((repo / "data" / "watchlist.json").read_text())
    keys = {i.get("path") or i.get("q") for i in wl}            # app.js: sg.items[i.path||i.q]
    assert keys <= set(doc["items"])
    n_sales = 0
    for k, v in doc["items"].items():
        for g in GRADES:                                          # app.js reads x.Ungraded / x["PSA 10"]
            s = v[g]; assert s["flag"] in FLAGS
            if s["flag"].startswith(("SPIKE", "DROP")):          # signals strip + alert key path|grade|flag|as_of, pct, now
                assert isinstance(s["pct"], (int, float)) and isinstance(s["now"], (int, float))
            n_sales += s.get("variant") == "sales"
    assert n_sales > 0.25 * 2 * len(doc["items"])
    assert not list((repo / "data").glob("sales*"))               # raw sales never land in data/

def _write(p, doc): p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(doc))

def test_failsafe_keeps_previous_on_cold_start_snapshot_only(repo):
    before = (repo / "data" / "signals.json").read_bytes()
    _write(repo / "data" / "history.json", {})   # cold start: no history, no --sales
    run(["scripts/sales/spike_engine.py", "--history", "data/history.json"], repo)
    out = run(["scripts/sales/promote_signals.py"], repo).stdout
    assert out.startswith("KEEP") and (repo / "data" / "signals.json").read_bytes() == before

def test_failsafe_keeps_previous_when_new_missing(repo):
    before = (repo / "data" / "signals.json").read_bytes()
    out = run(["scripts/sales/promote_signals.py", "--new", "nope.json"], repo).stdout
    assert out.startswith("KEEP") and (repo / "data" / "signals.json").read_bytes() == before

def test_failsafe_keeps_previous_on_partial_scrape(repo):
    before = (repo / "data" / "signals.json").read_bytes()
    prev = json.loads(before); items = prev["items"]
    for i, v in enumerate(items.values()):                         # 90% of sales signals lost
        for g in GRADES:
            if v[g].get("variant") == "sales" and i % 10: v[g] = {"flag": "normal", "variant": "snapshot", "now": 1}
    _write(repo / ".cache" / "sales" / "signals.new.json", prev)
    assert run(["scripts/sales/promote_signals.py"], repo).stdout.startswith("KEEP")
    assert (repo / "data" / "signals.json").read_bytes() == before

def test_scraper_total_failure_exits_nonzero(repo, tmp_path):
    code = ("import sys,urllib.request,time;sys.argv=['x','--limit','2'];time.sleep=lambda s:None;"
            "urllib.request.urlopen=lambda *a,**k:(_ for _ in ()).throw(OSError('blocked'));"
            "sys.path.insert(0,'scripts/sales');import sales_scraper;sales_scraper.main()")
    p = subprocess.run([sys.executable, "-c", code], cwd=repo, capture_output=True, text=True,
                       env={**os.environ, "SALES_CACHE_DIR": str(tmp_path / "empty")})
    assert p.returncode == 2, p.stderr[-500:]
