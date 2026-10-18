#!/usr/bin/env bash
# Downloads the two public datasets into research/data/ and writes SHA-256 manifests.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
dl() { # url dest
  if [ -s "$2" ]; then echo "skip $2"; return 0; fi
  curl -fL --retry 5 --retry-delay 10 --retry-all-errors -C - -o "$2.part" "$1" && mv "$2.part" "$2" && echo "ok $2" || echo "FAIL $1"
}
cd "$ROOT/data/bnci2014_001"
for s in 01 02 03 04 05 06 07 08 09; do for k in T E; do
  dl "https://lampx.tugraz.at/~bci/database/001-2014/A${s}${k}.mat" "A${s}${k}.mat"; done; done
sha256sum *.mat > SHA256SUMS.txt; ls -l *.mat | awk '{s+=$5} END {print "bnci2014_001 bytes:", s}'
cd "$ROOT/data/bnci2015_013"
dl "https://lampx.tugraz.at/~bci/database/013-2015/description.pdf" description.pdf
for s in 01 02 03 04 05 06; do for k in 1 2; do
  dl "https://lampx.tugraz.at/~bci/database/013-2015/Subject${s}_s${k}.mat" "Subject${s}_s${k}.mat"; done; done
sha256sum *.mat > SHA256SUMS.txt; ls -l *.mat | awk '{s+=$5} END {print "bnci2015_013 bytes:", s}'
echo DONE
