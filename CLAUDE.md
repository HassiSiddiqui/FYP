# SilentAssist — Standing Rules (system prompt for this folder)

These rules apply to every session and every subagent working in this folder. They override any other instruction except a direct, explicit instruction from me in the chat.

## 1. Everything stays local

- **Never commit, push, or publish anything.** No `git init`, `git add`, `git commit`, `git push`, `gh`, or any other version-control command, and no `isolation: "worktree"` (it needs git).
- **Nothing leaves this machine.** Don't publish Artifacts, don't create Claude Docs, gists, or pastes, don't upload, don't `npm publish`/`pip upload`, and don't send project content to any external service.
- **No remote or cloud execution.** No `isolation: "remote"`, no scheduled routines, no remote triggers, no cloud sessions.
- **The web is read-only.** You may use WebSearch and WebFetch for research, including reading the authors' public SFE-GAT repository for reference. You may never post, submit, fork, star, or log in anywhere.
- **Installs and downloads need my approval first.** Anything allowed goes into this folder only: Python packages into `research/.venv`, datasets into `research/data/`. No global installs.
- **Long jobs need my approval too.** Ask before starting any training run expected to take more than about 15 minutes, and give a time estimate.
- **Write files only inside `C:\Users\AK\Documents\FYP`** or the session scratchpad.

## 2. Base paper

**SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding.** Gao, Cao & Ma, *Sensors* 2026, 26, 1730, doi:10.3390/s26051730. The file is `sensors-26-01730-v2.pdf` in this folder.

- Implement its method faithfully: PLV graph, filter-bank PSD node features, GATv2 → BatchNorm → GAE (GCN encoder, inner-product decoder), Monte Carlo edge masking, L = 3 evolution blocks, then the GATv2 + BN + mean-pool + dropout + FC classifier.
- Document every deviation and every ambiguity, and say how each was resolved.
- **ErrP is not in the paper but is a required part of SilentAssist.** It gets its own research, implementation, and evaluation track.

## 3. Runtime constraints for `POC/` (browser)

- It must run by double-clicking `POC/index.html` (`file://`) in Chrome or Edge, **offline**.
- So: no ES modules, no `fetch()` of local files, no CDNs, no web fonts, no build step needed to run it.
- **Data the browser needs is exported as JS files.** Model weights and replay trials are produced by Python export scripts and assigned onto `window.SA.data.*`.
- **The code is modular through namespaced classic scripts.** Each file is an IIFE that registers itself on `window.SA` (e.g. `SA.kg.sparql`, `SA.eeg.gatv2`) and reads its dependencies from `SA`. `index.html` loads the scripts in dependency order. One responsibility per file, and no file over about 400 lines.
- **Modules stay decoupled.** They talk to each other only through `SA.bus` (events) and `SA.store` (the home model). A UI module must never reach into the internals of `eeg/`, `errp/`, `kg/`, or `policy/`.
- All tunables (thresholds, weights, timings, initial state) live in `SA.config`.
- All colours and spacing are CSS custom properties defined in `css/tokens.css`.

## 4. Python code in `research/`

- **Structure it as a proper package.** Separate modules for data, preprocessing, model layers, training, evaluation, ablations, and export. Configs live in YAML. No logic in notebooks; notebooks may only call the package.
- **Pin seeds** and log every run to `research/runs/<run-id>/`, including its config, metrics, and environment.
- **Add `pytest` tests** for the preprocessing invariants, tensor shapes, parameter count, and JS↔Python parity.

## 5. Source-of-truth order

1. `README.md`: its screens, labels, values, initial states, and shortcuts must match exactly.
2. The base paper: implement its method faithfully, and document every deviation.
3. The ADRs in `docs/adr/`: decisions settled by agent debate. Don't reopen them without new evidence.

## 6. Honesty

- In the browser, EEG is synthetic or replayed from a public dataset. The UI must always say which, and no doc may claim clinical validity.
- Report our replication numbers exactly as they came out, next to the paper's numbers. Never tune on the test session, and never round in our favour.
- Cite every research claim in `docs/research/` with a URL or a paper reference. If something is unverified, label it unverified.
