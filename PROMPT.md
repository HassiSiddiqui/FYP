# Mission Prompt — SilentAssist FYP-I

> `CLAUDE.md` in this folder holds the standing rules and loads automatically. The base paper is `sensors-26-01730-v2.pdf`.
> Paste everything below the line into Claude Code from the `FYP` folder.

---

## 0. Who you are and what this is

You are the **lead architect and orchestrator** of SilentAssist, my Final Year Project at FAST-NUCES Islamabad (Department of AI & Data Science, supervisor Dr. Adil Majeed, team Ali Farqaleet, Abdul Haseeb, Issa Sultan). SilentAssist is an adaptive, EEG-based assistive home and cognitive-support system for people with ALS, tetraplegia, or a spinal cord injury. It is a closed loop:

1. **SFE-GAT**, our base paper, decodes four motor-imagery classes from EEG. Those classes are left hand, right hand, both feet, and tongue, which are exactly our four navigation tokens and exactly the four classes of BCI Competition IV-2a.
2. The **CogLign knowledge graph** resolves the decoded intent into a concrete device in context.
3. A **policy engine** decides whether to act: execute, confirm, reject, or ask the caregiver.
4. **ErrP detection** watches the brain's reaction to each action and **rolls it back** if the brain flags it as an error.

There are therefore **two graphs** in this system, and the build must make both visible: the *brain functional-connectivity graph* that SFE-GAT evolves, and the *semantic knowledge graph* that CogLign reasons over.

**I am explicitly opting in to multi-agent orchestration.** Use the Workflow tool and fan out agents. This job is far bigger than the default size guideline, and I approve up to roughly 25 agents in total across all phases. Make agents **debate each other** on every decision that matters. Think deeply, research before you build, and verify before you claim anything.

Obey `CLAUDE.md` at all times. Above all, **nothing is committed, pushed, or published anywhere. Everything stays local.**

## 1. Inputs, read first

1. `README.md` is the functional spec. **Everything in it must be built**, with labels, values, initial states, and shortcuts reproduced exactly.
2. `sensors-26-01730-v2.pdf` is the base paper, SFE-GAT. If PDF tools fail, extract the text with `pdftotext -layout` (it's available). **Table 1 and the equations extract poorly, so cross-check them** against the figures and the authors' public repository (https://github.com/GaoHSin/SFE-GAT, read-only).
3. `CLAUDE.md` holds the standing rules.

## 2. Workstreams

### A. SFE-GAT replication (Python, `research/sfegat/`)

Reproduce the paper end to end on **BCI Competition IV-2a** (e.g. MOABB `BNCI2014_001`).

**Ask me before creating `research/.venv`, installing PyTorch / PyTorch Geometric, or downloading the data.** Check first whether a GPU is present (`nvidia-smi`), and estimate the run time.

- **Data.** 22 EEG channels at 250 Hz, task window t = 2–6 s, and no artifact removal. Subject-dependent (SD): session 1 trains, session 2 tests, with no tuning on session 2. Subject-independent (SI): leave-one-subject-out (LOSO), 9 folds.
- **Graph construction (Eqs. 1–5).** Get the phase per channel with the Hilbert transform. Compute PLV, z-score it over the whole matrix (ε = 1e-8), zero the diagonal, and keep edges above threshold τ.
- **Node features (Eqs. 6–8).** Filter bank from 8 to 40 Hz in 4 Hz steps (B = 8 bands), each a zero-phase 4th-order Butterworth. Welch PSD with 250-sample Hann windows and 50% overlap, integrated over each band. That gives H ∈ ℝ^{22×8}.
- **Evolution block (Eqs. 9–19), ×3.**
  - GATv2 with 4 heads, hidden 32, output 128, followed by ReLU and then BatchNorm.
  - GAE: a GCN encoder (128→32) with ReLU, and an inner-product sigmoid decoder giving P_Â.
  - Edge mask: during training, M = 𝟙(P_Â > R) with R ~ U(0,1); during evaluation, M = 𝟙(P_Â > η). Then Â = A ⊙ M.
- **Classifier (Eqs. 20–24).** GATv2, then BN, then global mean pool, then Dropout(0.5), then Linear(128→4), then softmax. The total should be about 0.15M parameters, so check it.
- **Training.** SGD with lr 0.01, batch 64, weight decay 1e-3, cross-entropy loss, 500 epochs, seeded.
- **Evaluation.**
  - Metrics: accuracy, macro precision, macro F1, and Cohen's κ, per subject plus the mean.
  - Compare against the paper: Table 3 (SD 0.7770 / κ 0.7027; SI 0.6659 / κ 0.5545) and Fig. 3 per subject.
  - Ablations (Fig. 4): PLV-GAT, SFE-GCN, FE-GAT, R-GAT, R-SFE-GAT.
  - Visual analyses: t-SNE plus Silhouette/DBI per evolution stage (Table 2), edge-retention counts before and after evolution (Fig. 6), and inference latency.
- **Paper ambiguities.** Each one gets settled in the replication debate and written into `docs/traceability.md`. At minimum:
  1. the values of τ and η;
  2. whether the GAE has a reconstruction loss, or learns only through cross-entropy;
  3. how gradients flow through the hard Monte Carlo mask, given that the paper claims a "differentiable sampling strategy" (straight-through? Gumbel? none?);
  4. whether GATv2 heads are concatenated or averaged;
  5. the inconsistency in Table 1;
  6. the paper's own SD accuracy conflict, with 77.70% in the abstract and Table 3 against 77.05% in the body text.
- **Export.** Train a deployment model on one subject (chosen by the debate, with the reason recorded) and export:
  - `POC/js/data/sfegat-weights.js`: weights plus BN running statistics;
  - `POC/js/data/mi-replay.js`: a small set of **held-out session-2 trials** per class, with their ground-truth labels, kept under about 3 MB using Float32 + base64.

### B. ErrP detection (Python `research/errp/` + browser)

The base paper does not cover ErrP, but **SilentAssist requires it. Treat it as a first-class research contribution, not decoration.**

- **Research.** Interaction / feedback ErrP morphology: the frontocentral negativity (Ne/ERN) around 200–300 ms after feedback, the positivity (Pe) around 300–500 ms, the FCz/Cz focus, and the 1–10 Hz band. Cover detection methods (windowed-mean / downsampled amplitudes + shrinkage LDA, xDAWN + Riemannian, EEGNet), studies that use ErrP for automatic error correction and BCI adaptation, and **public ErrP datasets.** Candidates to verify: the BNCI Horizon 2020 monitoring-ErrP dataset (Chavarriaga & Millán) and the Kaggle "BCI Challenge @ NER 2015" feedback-ErrP dataset. **Ask me before downloading.**
- **Implementation.** Epoch the data, band-pass it, baseline-correct, extract features, train the classifier, and calibrate the posterior. Report balanced accuracy, TPR/TNR, and AUC using the dataset's proper cross-validation scheme.
- **Decision theory.** A missed error leaves the home in a state the patient didn't want, while a false rollback undoes a correct action. Choose the rollback threshold from an **explicit cost model**, which gets debated, rather than defaulting to 0.5.
- **Closing the loop with the KG.** A detected ErrP is negative evidence. It should down-weight the rejected entity for that context in the CogLign resolver, and this is what makes Bedside Lamp the offered alternative. Whether and how much to down-weight is debated.
- **Browser.**
  - Run the same detector on exported weights.
  - Play back real ErrP / non-ErrP epochs (`POC/js/data/errp-replay.js`), or in Scripted mode a synthetic epoch on which the README's `-8.4 µV` deflection at FCz is drawn.
  - `[Simulate ErrP]` injects an error epoch, and the detector must **genuinely detect it**. It must not simply flip a flag.

### C. CogLign knowledge graph (`kg/` + browser)

- **Ontology.** Base it on **SAREF** (devices, functions, commands, states, properties), use **BOT** for rooms, and add our own extensions for risk tier, user context, and the history of ErrP feedback. Write it in Turtle: `kg/silentassist.ttl` is canonical, and `POC/js/kg/ontology.js` wraps the identical text, with a test that they match.
- **Competency questions.** Write them in `docs/kg.md`, each with its SPARQL query and the expected answer.
- **Browser engine.** A Turtle parser, an indexed triple store, and a SPARQL subset: PREFIX, SELECT, BGP, FILTER, OPTIONAL, ORDER BY, LIMIT.
- **Resolver scoring.** A documented weighted function of type match, spatial match with the active room, state compatibility (Turn On prefers devices that are OFF), recency, and the ErrP penalty. Calibrate it so the canonical case returns **`:BedroomCeilingLight` at 0.94** with Bedside Lamp as runner-up. Explain the 0.94, rather than hard-coding it.
- **KG view.** The CogLign panel shows the **actual query that ran**. An inline-SVG subgraph view highlights the winning entity and the runner-up.

### D. The prototype (`POC/`), covering everything in the README

- **Four tokens with every shortcut.** Right Hand = NEXT (`→`/`D`), Left Hand = PREVIOUS (`←`/`A`), Both Feet = SELECT (`Enter`/`Space`/`S`), Tongue = BACK (`Esc`/`Backspace`/`W`). The operator buttons are worded exactly as in README §2. `C` toggles the caregiver dashboard. `Space` must not scroll, and `Backspace` must not navigate the browser.
- **Three decoder modes,** switchable in the harness and always labelled on screen:
  1. **Scripted.** Reproduces the README canonical values exactly: MI 92%, Semantic 89%, SPARQL 0.94, ErrP −8.4 µV.
  2. **Replay.** A real held-out BCI IV-2a trial goes through the **in-browser SFE-GAT forward pass**: filter bank, Welch PSD, Hilbert PLV, graph, 3 evolution blocks, then the classifier. Its softmax becomes the neural confidence. The UI shows the subject and trial id, and the true label next to the prediction.
  3. **Synthetic.** Generated multichannel EEG with class-specific ERD, fed through the same pipeline.
- **Brain-graph view.** A 22-electrode scalp map (the montage in the paper's Fig. 2a) that animates the graph through evo0 → evo3: the initial PLV edges, then sparsification and strengthening, mirroring the paper's Fig. 6. It's also shown live in the caregiver dashboard.
- **Screens 1–6 and the Caregiver Dashboard, exactly as written in README §3.** That includes:
  - the status pills;
  - hub subtitles rendered live from the store;
  - the three light fixtures and their initial states;
  - the actions Turn On, Turn Off, Adjust Brightness (25/50/75/100%), and Back;
  - the CogLign panel fields.
- **Screen 5's full post-action observation,** on FCz/Cz:
  - **No ErrP:** `No Error Detected • Action Confirmed`, and the entry is written to the audit log.
  - **ErrP:** `ErrP Deflection at FCz (-8.4 µV)` → automatic rollback → `Action Rolled Back` → the Bedside Lamp alternative with `[Retry]` / `[Return to Home]`.
- **Fans, AC, and TV work end to end:**
  - Fan: Off/Low/Medium/High.
  - AC: Power, Temp ±, Mode Cool/Fan/Dry. An AC setpoint below 18°C or above 30°C is a High-risk thermal hazard and goes to caregiver approval.
  - TV: Power, Channel ±, Volume ±.
- **Presets.** Night Mode, All Lights Off, Cooling Mode, and Watch TV each show their device diff before committing. They go through the same policy, ErrP, and rollback path, atomically.
- **Policy engine.** EXECUTE / CONFIRM (costs the patient one extra Both-Feet token) / REJECT / CAREGIVER APPROVAL, with a visible reasoning trace. The thresholds and the way the neural and semantic scores combine are settled by debate.
- **Caregiver dashboard.** A live shadow table, gauges (Neural, Semantic, ErrP health), the approval queue with Approve/Reject (the result is reported back to the patient and spoken), and a SHA-256 hash-chained audit log (`crypto.subtle` with an FNV-1a fallback) with a "Chain verified ✓" badge.
- **Operator Harness, labelled "not patient-facing":**
  - the token buttons and the confidence sliders (in Scripted mode);
  - the decoder-mode switch and a replay-trial picker;
  - an active-room selector;
  - `[No ErrP]` / `[Simulate ErrP]`;
  - toggles for voice, decode animation, ErrP auto-confirm, and reduced motion;
  - `[Reset Demo]`, which restores the exact README initial state.
- **Design.** A clinical-calm, low-glare dark theme. A focused card that's unmistakable from across a room without relying on colour: thick outline, slight scale, and a "● Focused" text marker. Patient text ≥ 20px, titles ≥ 28px, WCAG AA or better, the listbox/option ARIA pattern, and an `aria-live` region that mirrors speech. Honour `prefers-reduced-motion`. No layout breakage at 1366×768, 1920×1080, or 90–150% zoom.

**Proposed browser layout** (the architecture debate may change it; record any change in an ADR):

```
POC/index.html
POC/css/   tokens base layout components screens harness caregiver
POC/js/core/      namespace config bus store clock
POC/js/input/     tokenbus keyboard harness-input
POC/js/dsp/       fft butterworth(filtfilt) welch hilbert
POC/js/eeg/       plv graph psd-features gatv2 gcn batchnorm gae sfegat decoder synth
POC/js/errp/      features classifier detector synth
POC/js/kg/        ontology turtle triplestore sparql resolver kg-view
POC/js/brain/     montage brain-graph-view
POC/js/policy/    risk policy
POC/js/safety/    rollback audit approvals
POC/js/voice/     speech
POC/js/ui/        navigator render components/* screens/*
POC/js/data/      sfegat-weights mi-replay errp-model errp-replay   (generated by the export scripts)
POC/js/selftest/  selftest   (?selftest=1)
POC/js/app.js
```

## 3. Orchestration plan (Workflow)

Run it in phases. Pass the phase outputs forward as files in `docs/`, so every agent works from shared written context.

### Phase 1: Research (parallel, 6 agents)

Each agent writes a cited brief to `docs/research/`.

| Agent | Brief |
| :--- | :--- |
| **Paper Analyst** | Dissect SFE-GAT equation by equation. Rebuild Table 1 from the text and the parameter counts. List every hyperparameter, every ambiguity, and every number we must reproduce. |
| **Reference-Code Auditor** | Read the authors' public repo (read-only). Map each paper equation to their code, and record where the code resolves or contradicts the paper (τ, η, GAE loss, gradient path, head merging). Note the licence and what we can and cannot reuse; **we write our own implementation**. |
| **MI-EEG Scientist** | BCI IV-2a details (montage, the session/label quirks in MOABB), PLV and PSD pitfalls, the baseline numbers in Table 3, and the risk that the SD/SI evaluation leaks. |
| **ErrP Scientist** | Everything in Workstream B: morphology, methods, datasets, metrics, cost-sensitive thresholds, and ErrP-driven correction and adaptation. |
| **Knowledge-Graph Engineer** | SAREF/BOT/SOSA, intent → entity disambiguation, scoring schemes, the minimal SPARQL engine, and the competency questions. |
| **Assistive-UX & Safety Analyst** | BCI/ALS interface guidelines, MI fatigue and the cost of each command, caregiver workflows, WCAG 2.2, confidence-gated actuation, and audit/rollback, framed in ISO 14971 vocabulary without claiming compliance. |

**Checkpoint 1.** Summarise the research for me in chat, list the open questions, and **ask for approval for the venv, the installs, and the dataset downloads.**

### Phase 2: Debates (adversarial; each one produces a transcript plus an ADR)

The protocol for every topic:
1. **Two proposers** write competing positions grounded in the briefs.
2. **A critic** attacks both: hidden assumptions, README violations, paper infidelity, failure modes.
3. The proposers rebut once.
4. **A fresh judge** rules. The ruling gives the decision, the rejected alternatives with reasons, the residual dissent, and the conditions under which to revisit.
5. Save the transcript to `docs/debate/<topic>.md` and the ruling to `docs/adr/NNNN-<topic>.md`.

Topics:
1. **Replication fidelity.** Resolve every ambiguity in the paper listed in Workstream A, and decide what counts as "successfully reproduced", such as a tolerance band around the paper's numbers.
2. **ErrP design.** Which dataset, which features and classifier, the cost model and rollback threshold, and how strongly ErrP feedback penalises KG candidates.
3. **Paper vs. README fidelity in the browser.** How the Scripted, Replay, and Synthetic modes coexist, which one is the viva default, and which subject the deployment model uses.
4. **Knowledge graph.** The ontology's alignment and scope, the SPARQL subset, and the scoring function and its calibration to 0.94.
5. **Policy and risk.** The thresholds, how the scores combine (min, weighted, or Bayesian), the risk tier of every action, and the thermal rule.
6. **Architecture.** Module boundaries, the bus event catalogue, the store schema, the screen graph, and the Python package layout.
7. **Assistive UX.** Focus treatment, navigation per screen, how CONFIRM is designed, audio behaviour, and how the two graph views are presented without overwhelming the screen.

**Checkpoint 2.** Give me one line per ADR.

### Phase 3: Build (parallel, file ownership is exclusive)

First, the orchestrator freezes the **interface contracts** in `docs/architecture.md`: the `SA.*` APIs, bus events, store schema, config keys, the export file formats, and the Python package APIs. There's no git, so **each builder exclusively owns its own directories**, and no two agents ever edit the same file.

| Builder | Owns |
| :--- | :--- |
| SFE-GAT trainer | `research/sfegat/`, `research/configs/`, `research/tests/` (sfegat) |
| ErrP trainer | `research/errp/`, its tests |
| Export & parity engineer | `research/export/`, `POC/js/data/`. Also owns **the parity tests: the JS forward-pass logits must match PyTorch within 1e-4 on the exported trials, for both SFE-GAT and ErrP.** |
| Browser DSP / EEG engineer | `POC/js/dsp/`, `POC/js/eeg/`, `POC/js/errp/`, `POC/js/brain/` |
| KG engineer | `kg/`, `POC/js/kg/` |
| Policy & safety engineer | `POC/js/policy/`, `POC/js/safety/` |
| UI engineer | `POC/js/ui/`, `POC/js/input/`, `POC/js/voice/`, `POC/css/` |
| Core & test engineer | `POC/js/core/`, `POC/js/app.js`, `POC/index.html`, `POC/js/selftest/` |

Training runs need my approval when they're long (see `CLAUDE.md`). Until the real exports exist, the browser builders work against **stub data files that match the frozen formats.**

### Phase 4: Integration and red-team (debate again)

- The orchestrator integrates the pieces.
- **Three red-team agents** independently try to break the build:
  1. README conformance, accessibility, and UX;
  2. correctness and robustness of the code;
  3. **scientific integrity**: replication honesty, leakage, the ErrP evaluation, and whether the claims in the docs are actually supported.
- A **defender** answers each finding: either fix it, or argue with evidence that it isn't a defect.
- A **judge** decides what gets fixed.
- Loop until the acceptance checklist in §5 passes. Use at most 3 rounds, then report what remains.

### Phase 5: Docs

Write:
- `docs/architecture.md` (Mermaid diagrams of the modules, the data flow, and the closed loop);
- `docs/traceability.md` (paper equation → Python function → JS function → test id);
- `docs/replication.md` (our numbers against the paper's, per subject, with ablations, figures, and honest discussion);
- `docs/errp.md`;
- `docs/kg.md`;
- `docs/verification.md`.

Then append to `README.md`: **Architecture**, **Replication Results**, **ErrP**, **Live Demo Script (5 min)**, and **Verification**.

The demo script is an exact keystroke sequence:
1. Scripted EXECUTE.
2. ErrP rollback leading to Bedside Lamp, then Retry.
3. Slider-forced CONFIRM, then REJECT.
4. A thermal hazard that goes to caregiver approval.
5. Switch to Replay and decode a real held-out trial with the in-browser SFE-GAT, while the brain graph evolves evo0→evo3.
6. Replay a real ErrP epoch and show the detection.

## 4. Verification (local only)

- **Python:** `pytest` in `research/.venv`, plus the parity tests.
- **JavaScript syntax:** `node --check` on every JS file (Node is installed).
- **Headless self-test** with the Edge that ships with Windows. The self-test writes a pass/fail report into `#selftest-report`:
  `msedge --headless=new --disable-gpu --dump-dom "file:///C:/Users/AK/Documents/FYP/POC/index.html?selftest=1"`
- **Screenshots:** `msedge --headless=new --screenshot=<path> --window-size=1366,768` (and 1920,1080). Save them under `docs/verification/` and **look at them**.

## 5. Acceptance checklist (every box must pass)

- [ ] Opens by double-click, offline, with zero console errors. Every script is a namespaced module, and there is no ES module/fetch/CDN anywhere.
- [ ] Every README label, value, initial state, and shortcut matches. The full patient journey works with the four tokens only.
- [ ] The SFE-GAT replication is run, and SD/SI results are reported per subject next to the paper's, with ablations. Every ambiguity in the paper is resolved in an ADR.
- [ ] The in-browser SFE-GAT and ErrP forward passes match PyTorch within 1e-4 (the parity tests pass).
- [ ] Replay mode decodes real held-out trials and shows the prediction next to the truth. The brain graph visibly evolves evo0→evo3.
- [ ] The ErrP detector is trained and evaluated on a real public dataset, with honest metrics. In the browser it genuinely detects injected or replayed error epochs and doesn't fire on correct ones. Rollback is atomic, presets included.
- [ ] The KG answers every competency question. The resolver ranks BedroomCeilingLight (0.94) first and BedsideLamp second, with the score explained. ErrP feedback penalises the rejected entity. The SPARQL shown is the query that actually ran.
- [ ] The sliders produce EXECUTE, CONFIRM, and REJECT. The thermal hazard produces CAREGIVER APPROVAL. The audit chain verifies, and tampering with an entry breaks it.
- [ ] All 7 debates have a transcript and an ADR. Every research claim is cited.
- [ ] `[Reset Demo]` restores the exact initial state.
- [ ] Nothing was committed, pushed, uploaded, or published. All work is inside this folder.

## 6. How to report back

Report at three checkpoints: after research (with the install/download approval request), after the debates (the ADRs in one line each), and at the end. The final report covers:
- what was built;
- the **real** replication and ErrP numbers next to the paper's;
- the self-test and parity results;
- any unchecked boxes and why;
- every deviation from the paper;
- how to run the demo.

Be rigorous, skeptical, and honest. Build something the panel will remember.
