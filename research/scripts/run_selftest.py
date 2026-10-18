"""Run the POC in-page selftest in headless Edge (docs/architecture.md §8.3).

Usage:  research/.venv/Scripts/python.exe research/scripts/run_selftest.py [--budget MS] [--json OUT]

Fresh --user-data-dir under research/.cache/edge-profile/ per run (deleted
afterwards); never touches the user's browser profile. Parses the
pre#selftest-report JSON and the SELFTEST-DONE sentinel; exit 1 on any failure
or a missing sentinel.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "POC" / "index.html"
PROFILE_BASE = ROOT / "research" / ".cache" / "edge-profile"
EDGE_CANDIDATES = [
    r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    r"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
]


def edge_path() -> str:
    for c in EDGE_CANDIDATES:
        if os.path.exists(c):
            return c
    raise SystemExit("msedge.exe not found")


def run_edge(url: str, tag: str, budget_ms: int, extra: list[str] | None = None, timeout_s: int = 180) -> str:
    profile = PROFILE_BASE / f"{tag}-{os.getpid()}"
    profile.mkdir(parents=True, exist_ok=True)
    cmd = [
        edge_path(), "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        f"--user-data-dir={profile.as_posix()}", f"--virtual-time-budget={budget_ms}",
    ] + (extra or []) + [url]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout_s)
        return out.stdout.decode("utf-8", errors="replace")
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def parse_report(dom: str):
    m = re.search(r'<pre id="selftest-report"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        return None, None, "no #selftest-report in dumped DOM"
    txt = html.unescape(m.group(1))
    s = re.search(r"SELFTEST-DONE pass=(\d+) fail=(\d+)\s*$", txt.strip())
    body = txt[: s.start()] if s else txt
    try:
        rep = json.loads(body)
    except Exception as e:  # noqa: BLE001
        return None, s, f"report JSON unparsable: {e}; head={txt[:300]!r}"
    return rep, s, None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=int, default=60000, help="virtual time budget (ms)")
    ap.add_argument("--json", type=str, default=None, help="write the parsed report here")
    a = ap.parse_args()
    url = INDEX.resolve().as_uri() + "?selftest=1"
    dom = run_edge(url, "selftest", a.budget, ["--dump-dom"])
    rep, sentinel, err = parse_report(dom)
    if err:
        print("SELFTEST ERROR:", err)
        return 1
    if a.json:
        Path(a.json).write_text(json.dumps(rep, indent=1, ensure_ascii=False), encoding="utf-8")
    for c in rep.get("checks", []):
        flag = "PASS" if c.get("ok") else "FAIL"
        if c.get("skipped"):
            flag = "SKIP"
        print(f"{flag} {c.get('domain')}/{c.get('id')} ({c.get('ms')}ms) :: {str(c.get('detail'))[:300]}")
    if not sentinel:
        print(f"SELFTEST INCOMPLETE (no sentinel): pass={rep.get('pass')} fail={rep.get('fail')} done={rep.get('done')}")
        return 1
    print(f"SELFTEST-DONE pass={sentinel.group(1)} fail={sentinel.group(2)}")
    return 0 if sentinel.group(2) == "0" else 1


if __name__ == "__main__":
    sys.exit(main())
