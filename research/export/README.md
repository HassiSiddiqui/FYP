# research/export — browser data export (EXPORT builder)

Writes the GENERATED files the POC loads as classic scripts (docs/architecture.md §7):

| File | Namespace | Script |
|---|---|---|
| `POC/js/data/sfegat-weights.js` | `SA.data.sfegatWeights` | `sfegat_weights.py` (alias `export_sfegat.py`) |
| `POC/js/data/mi-replay.js` | `SA.data.miReplay` | `mi_replay.py` (alias `export_replay.py`) |
| `POC/js/data/montage-data.js` | `SA.data.montage` | `montage.py` |

All commands run from `research/` with the venv Python.

## The one command (real export, then tests)

```
cd C:/Users/AK/Documents/FYP/research
.venv/Scripts/python.exe -m export.run_all --run-dir runs/20261014-1549-planb-sd-p0 && .venv/Scripts/python.exe -m pytest -q tests/test_export.py tests/test_sfegat_parity.py
```

`--run-dir` may be omitted: the newest `runs/*-planb-sd-p0` holding `sd_A01/model.pt` is used
(preferring one that also has `calib_A01/result.json`). `--model` / `--calib` override the paths.

- Model: `sd_A01/model.pt` = the P0 SD A01 seed-0 model trained on all 288 A01T trials (ADR-0001 D21).
- Temperature: `calib_A01/result.json["temperature"]` — fold 0 of the D21 4-fold cross-fit on A01T
  (216 train / 72 held out). This is the D21 *fallback* (one fold), disclosed in the manifest.
- Replay: the first 5 A01E trials per class, in trial order, passing the D26 margin rule. Never
  filtered by correctness. Excluded trials are listed in `manifest.selection.excluded`.
- Run time: about 4–5 min while training jobs occupy the CPU (mostly the torch import and 288 forwards).

## Stubs

`.venv/Scripts/python.exe -m export.stubs` — untrained `SFEGAT()` (seed 0, `run.stub: true`,
temperature null) + 4 real A01E trials (1 per class) + the real montage. Only for wiring; the real
export overwrites them.

## Parity reference (ADR-0001 D23/D27)

Every replay export also writes `research/.cache/parity/`:
`mi_replay_f32.npy` (the exported float32 bytes), `sfegat_reference.npz` (float64 Python stages:
P, Z, H, h0..h3, z1..z3, p1..p3, cls, edge sets A0..A3, logits, probs, probsCal) and
`mi_replay_log.json` (margin log, full-E and subset accuracy, float32-vs-float64 disagreements).

`node research/export/node_runner.js sfegat <in.json> <out.json>` runs the browser modules
(`POC/js/core, config, data, dsp, eeg` via `research/tests/js/run_node.js`) on every record and
dumps the same stages; `tests/test_sfegat_parity.py` compares them.

## Honesty

The replay accuracy is the A01 replication number reported by the trainer, shown next to the
paper's 80.21 %. Plan B, 1 seed: PRELIMINARY. Licence of embedding IV-2a trials:
"BCI Competition IV 2a / BNCI Horizon 001-2014, Brunner et al. 2008 — CC BY-NC-ND 4.0 (pending
supervisor confirmation)".
