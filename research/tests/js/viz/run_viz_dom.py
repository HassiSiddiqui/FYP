"""Run the VIZ DOM harness (viz-dom.html) in headless Edge and print/parse its report.

Usage: research/.venv/Scripts/python.exe research/tests/js/viz/run_viz_dom.py [--screenshot]
Exit 1 on any failed check or missing sentinel. Uses a fresh --user-data-dir per run (CLAUDE.md / §8.3).
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys

EDGE = r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "viz-dom.html")
PROFILE_BASE = os.path.join(ROOT, "research", ".cache", "edge-profile")


def edge(args, tag):
    prof = os.path.join(PROFILE_BASE, "%s-%d" % (tag, os.getpid()))
    os.makedirs(PROFILE_BASE, exist_ok=True)
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
           "--user-data-dir=" + prof] + args
    try:
        return subprocess.run(cmd, capture_output=True, timeout=120).stdout.decode("utf-8", "replace")
    finally:
        shutil.rmtree(prof, ignore_errors=True)


def main():
    url = "file:///" + PAGE.replace("\\", "/")
    dom = edge(["--virtual-time-budget=20000", "--dump-dom", url], "viz-dom")
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    txt = html.unescape(m.group(1)) if m else ""
    if "VIZ-DOM-DONE" not in txt:
        print("NO SENTINEL; got:", txt[:500])
        return 1
    rep = json.loads(txt[: txt.rindex("VIZ-DOM-DONE")])
    for c in rep["checks"]:
        print(("PASS " if c["ok"] else "FAIL ") + c["id"] + ("  " + c["detail"] if c["detail"] else ""))
    print("VIZ-DOM pass=%d fail=%d" % (rep["pass"], rep["fail"]))
    if "--screenshot" in sys.argv:
        out = os.path.join(ROOT, "research", ".cache", "viz-dom.png")
        edge(["--virtual-time-budget=20000", "--window-size=1366,1400", "--screenshot=" + out, url], "viz-shot")
        print("screenshot:", out)
    return 1 if rep["fail"] else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
