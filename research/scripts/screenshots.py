"""Headless-Edge screenshots of POC/index.html (docs/architecture.md §8.3).

Usage: research/.venv/Scripts/python.exe research/scripts/screenshots.py [--name boot]
Writes docs/verification/<name>-<W>x<H>.png at 1366x768 and 1920x1080.
Fresh --user-data-dir per shot (deleted afterwards).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_selftest import INDEX, ROOT, run_edge  # noqa: E402

OUT = ROOT / "docs" / "verification"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="boot")
    ap.add_argument("--query", default="", help="extra query string, e.g. 'dashboard=1'")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    url = INDEX.resolve().as_uri() + (("?" + a.query) if a.query else "")
    ok = True
    for w, h in [(1366, 768), (1920, 1080)]:
        png = OUT / f"{a.name}-{w}x{h}.png"
        run_edge(url, f"shot{w}", 5000, [f"--screenshot={png.as_posix()}", f"--window-size={w},{h}", "--hide-scrollbars"])
        exists = png.exists() and png.stat().st_size > 0
        ok &= exists
        print(("OK  " if exists else "MISSING ") + str(png))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
