# MI-EEG Scientist brief: BCI Competition IV-2a, MOABB, PLV/PSD pitfalls, baselines, leakage, CPU feasibility

Author: Phase-1 MI-EEG Scientist agent · Date: 2026-10-14 · Scope: Workstream A (SFE-GAT replication) inputs.
Status: research only. Nothing was installed and no dataset was downloaded. Dataset sizes come from HTTP `HEAD` requests, which return no file body.
Convention: every claim has a citation tag `[Rn]` (see **References**). **[UNVERIFIED]** marks a claim not confirmed against a primary source in this session. **[EST]** marks a quantitative estimate of mine that has to be calibrated by measurement.

---

## 0. TL;DR (the ten things the replication must not get wrong)

1. **Data.** IV-2a has 9 subjects × 2 sessions (T = training day, E = evaluation day) × 6 runs × 48 trials, so 288 trials per session and 72 per class. There are 22 EEG and 3 EOG channels at 250 Hz, recorded 0.5–100 Hz with a 50 Hz notch, referenced to the left mastoid [R1]. EOG "must not be used for classification" [R1].
2. **Window.** The cue appears at t = 2 s and motor imagery ends at t = 6 s, measured from trial start (t = 0, fixation cross plus beep) [R1]. MOABB's `BNCI2014_001` places its event at **trial start** (`trigger[run.trial - 1] = run.y`) and uses `interval=[2, 6]` [R4][R5]. In the GDF route, by contrast, the class events 769–772 sit at the **cue** (t = 2 s) [R1]. Mixing the two conventions silently shifts the window by 2 s.
3. **Session E labels.** The BNCI `.mat` files that MOABB uses contain labels for **both** sessions (MOABB writes `run.y` for the E files as well) [R5]. The GDF E files carry only "cue unknown" (783) events [R1].
4. **MOABB defaults that break fidelity.**
   - `MotorImagery()` band-passes 8–32 Hz by default. Pass `fmin=None, fmax=None` [R6].
   - MNE epochs include both endpoints, so [2, 6] s gives **1001** samples. Crop to 1000 [R19][R7].
   - `paradigm.get_data` returns µV (`unit_factor=1e6`), while `dataset.get_data` returns raw data in **V** [R9][R5].
   - MOABB writes `~/mne_data` and `~/.mne` config unless `MNE_DATA` is set, which would violate CLAUDE.md's "write only inside FYP" rule [R10].
5. **Download.** 18 files, A01T.mat … A09E.mat, **779,873,919 bytes (≈780 MB, 744 MiB)**, hosted at `https://lampx.tugraz.at/~bci/database/001-2014/`. The `bnci-horizon-2020.eu` URL 302-redirects there (HEAD check, 2026-10-14) [R18][R5].
6. **Resolving the paper's 77.70 / 77.05 conflict.** Three checks point the same way:
   - Fig. 3a's per-subject accuracies average to **77.70%**.
   - All eight "improvement over baseline" deltas in §3.8 equal 77.70 minus the baseline.
   - κ = 0.7027 equals (0.7770 − 0.25)/0.75 exactly.
   **77.05 is a typo** (§3 below).
7. **SI test set size.** Every SI per-subject accuracy in Fig. 3b is an integer count out of **288** (not 576), so the held-out subject is tested on **one session** (§3.3).
8. **Kappa identity.** With 72 trials per class, Cohen's κ = (acc − 0.25)/0.75 *exactly*. Two consequences:
   - This should be a pytest invariant.
   - The paper's **baseline** κ values in Table 3 and its **ablation** κ values both violate the identity. Treat them as internally inconsistent (§3.4).
9. **Leakage.** Two well-known IV-2a reference codes select the best epoch **on the test session**:
   - EEG-Conformer reports `bestAcc` over epochs evaluated on session E [R25b].
   - ATCNet's original script uses `validation_data=(X_test, y_test)` with `ModelCheckpoint(save_best_only=True)` [R26b]. Its authors now say that approach "does not align with current best practices", and their Train/Val/Test re-run gives **81.10%** against the paper's 85.4% [R26].

   We must train for the fixed 500 epochs, take the last epoch, and never touch session E for any choice.
10. **Compute.**
    - Python 3.14 is viable. torch 2.14.1 (cp314 win_amd64, 124 MB), PyG 2.8.1 (pure Python, 3.14 classifier), and the whole scientific stack incl. MOABB 1.7.2 have 3.14 Windows wheels [R14–R17]. **No new interpreter is needed.**
    - The CPU is an **i7-10510U: 4 cores / 8 threads, 15 W laptop part, 15.6 GB RAM** (local check), not a workstation.
    - [EST] Budget: SD 9 subjects × 500 epochs ≈ 15–30 min sequential. LOSO ≈ 1.8–3.6 h (2304 training graphs per fold) or 3.6–7 h (4608). Fig. 4's ablations ≈ 1.2–2.5 h. Running 3–4 processes in parallel should cut wall time about 2.5×. A ≤3-minute micro-benchmark must calibrate all of this before any approval request (§8).

---

## 1. BCI Competition IV-2a: dataset facts

### 1.1 Recording and paradigm (primary source: Brunner et al., desc_2a.pdf [R1])

| Item | Value | Source |
|---|---|---|
| Subjects | 9 (A01–A09) | [R1] |
| Classes | left hand (1), right hand (2), both feet (3), tongue (4) | [R1] |
| Sessions | 2, recorded on different days. "T" carries labels; "E" was originally held out | [R1] |
| Runs per session | 6, separated by short breaks | [R1] |
| Trials | 48 per run (12 per class), so **288 per session** (72 per class) | [R1] |
| EOG calibration block | about 5 min at session start: 2 min eyes open, 1 min eyes closed, 1 min eye movements. **A04T has only the eye-movement block** | [R1] |
| EEG | 22 Ag/AgCl electrodes at 3.5 cm spacing, monopolar. **Reference: left mastoid; ground: right mastoid** | [R1] |
| EOG | 3 monopolar channels at 1 mV sensitivity. "must not be used for classification" | [R1] |
| Sampling / filters | 250 Hz; band-pass 0.5–100 Hz; 50 Hz notch on; EEG amplifier sensitivity 100 µV | [R1] |
| Trial timing | t = 0: fixation cross and short beep. t = 2 s: arrow cue for 1.25 s. MI continues until the cross disappears at t = 6 s, then a short black-screen break. No feedback | [R1] |
| Artifact marks | Expert visual inspection. Rejected trials carry GDF event 1023 and `h.ArtifactSelection`. The competition scored only artifact-free trials | [R1] |
| Competition scoring | κ, computed per time point on artifact-free trials. Methods had to be causal. Winner κ = 0.57 (Ang et al., FBCSP) | [R1][R2] |

GDF event codes [R1]:

| Code | Meaning |
|---|---|
| 276 | idling, eyes open |
| 277 | idling, eyes closed |
| 768 | trial start |
| 769 / 770 / 771 / 772 | cue left / right / foot / tongue |
| 783 | cue unknown (E sessions) |
| 1023 | rejected trial |
| 1072 | eye movements |
| 32766 | new run |

In the GDF files, runs are separated by 100 NaN samples [R1].

### 1.2 Channel order: matches the paper's Fig. 2a numbering 1–22

The MOABB channel list (`bnci_2014.py`) is [R4]:

| # | Name | # | Name | # | Name | # | Name |
|---|---|---|---|---|---|---|---|
| 1 | **Fz** | 7 | C5 | 13 | C6 | 19 | P1 |
| 2 | FC3 | 8 | **C3** | 14 | CP3 | 20 | **Pz** |
| 3 | FC1 | 9 | C1 | 15 | CP1 | 21 | P2 |
| 4 | FCz | 10 | **Cz** | 16 | CPz | 22 | POz |
| 5 | FC2 | 11 | C2 | 17 | CP2 | 23–25 | EOG1, EOG2, EOG3 (`eog`) |
| 6 | FC4 | 12 | **C4** | 18 | CP4 | | |

The paper's Fig. 2a lays the montage out in rows: 1 / 2–6 / 7–13 / 14–18 / 19–21 / 22, with Fz, C3, Cz, C4 and Pz labelled [R23, Fig. 2a; pdftotext]. That matches the table above: row 1 = Fz; row 2 = FC3…FC4; row 3 = C5…C6; row 4 = CP3…CP4; row 5 = P1, Pz, P2; row 6 = POz. The bold names are the labelled electrodes (C3 = 8, Cz = 10, C4 = 12, Pz = 20).

For the POC, README Screen 5's **FCz is channel 4 and Cz is channel 10**. MOABB sets the montage to MNE's `colin27_1005` [R5], so 2-D scalp positions for the brain-graph view can be exported from that montage.

### 1.3 Files, host, size, and how labels are exposed

- **BNCI `.mat` route (what MOABB uses).** Files are `A{ss}{T|E}.mat` under `BNCI_URL = "https://lampx.tugraz.at/~bci/database/"` + `001-2014/` [R5][R4].
- **Sizes.** HEAD requests on 2026-10-14 [R18] returned 18 files, each 37.2–46.3 MB (A04T is smallest at 37,150,377 B because of its short EOG block). The total is **779,873,919 B ≈ 780 MB**. Last-Modified is 12 Oct 2022.
- **Struct layout.** Each file holds a `data` struct array with one element per run. Fields used by MOABB: `X` (samples × 25, **µV**), `trial` (**1-indexed sample of trial start**), `y`, `fs`, `classes`, `artifacts`, `age`, `gender` [R5].
  - Runs with no trials (the EOG calibration runs) return `None` and are skipped [R5].
  - The MOABB source still carries `# FIXME: deal with run with no event (1:3)` [R4].
- **Session E labels.** MOABB writes `trigger[run.trial-1] = run.y` for **both** T and E files [R5], so labelled E sessions are available. Its docs list 144 trials per class per subject, i.e. 72 × 2 sessions [R12].
- **GDF route (not recommended).** The competition GDFs mark E trials as 783 "cue unknown". The true labels were published separately after the competition [R1][R3]. Using GDF means joining two files and handling the 2-s cue offset. **Avoid it.**
- **Rejected trials in MOABB.** `artifact_handling` defaults to `"ignore"`, which keeps all 288 trials. Other options are `"annotate"`, `"annotate_bad"` and `"reject"`, and actual rejection happens only with `reject_by_annotation=True` at epoching [R5][R12].
  - The paper reports "288 trials" per session [R23 §3.1], so **it kept the rejected trials**. MOABB's default matches this.
  - The number of artifact-flagged trials per subject is **[UNVERIFIED]**. Compute it after download and report it.

---

## 2. MOABB API for this dataset (current version 1.7.2, 14 Sep 2026, Requires-Python ≥3.11, classifiers 3.11–3.14 [R13])

### 2.1 How MOABB exposes the data (verified in `develop` source)

- `BNCI2014_001()` uses events `{"left_hand":1, "right_hand":2, "feet":3, "tongue":4}`, `interval=[2, 6]`, `sessions_per_subject=2` [R4].
- Session keys are **`"0train"` and `"1test"`** (built from `f"{session_idx}{_map[r]}"` with `_map={"T":"train","E":"test"}`). Runs are named `"0".."5"` [R4]. Older MOABB (<1.0) used different session names **[UNVERIFIED]**, so pin the version and never hard-code without a test.
- Raw units: `convert_units(run.X, from_unit="uV", to_unit="V")`, so the `Raw` object is in **volts** [R5].
- Paradigm arrays are multiplied by `dataset.unit_factor`, which defaults to `1e6`, so `paradigm.get_data` returns **µV** [R7][R9].
- Epoch times are computed as `tmin = paradigm.tmin + dataset.interval[0]`. Then `tmax = dataset.interval[1]` if `paradigm.tmax is None`, else `paradigm.tmax + interval[0]` [R7].
- `mne.Epochs` is called with `tmin, tmax, baseline, event_repeated="drop", on_missing="ignore", reject_by_annotation=True` [R8]. There is **no 1/sfreq correction** [R7][R8].
- MNE's documentation: "The closest or matching samples corresponding to the start and end time are included" [R19]. **So [2, 6] s at 250 Hz gives 1001 samples. [EST: arithmetic; confirm with an assert after download]**
- Filtering is applied to the **continuous** raw before epoching via `raw.filter(l_freq=fmin, h_freq=fmax, method="iir", picks="data")` with MNE's default IIR, a 4th-order Butterworth applied forward-backward [R8][R6]. `MotorImagery` defaults to **fmin=8, fmax=32** [R6]. Setting both `fmin` and `fmax` to None gives an identity "No Filter" step [R8].
- Channel picking: if `channels=None`, `pick_channels_for_modalities(info, return_all_modalities=False)` is used [R8]. That this excludes EOG is likely but **[UNVERIFIED]**, so pass the 22 names explicitly. `mne.pick_channels(..., ordered=True)` then keeps Fig. 2a order [R8].
- **MOABB's evaluation classes do not reproduce the paper's protocol.** `CrossSessionEvaluation` uses `LeaveOneGroupOut` over sessions, i.e. trains on T and tests on E *and* trains on E and tests on T [R11]. `WithinSessionEvaluation` does k-fold inside a session [R11]. Do not use either for the SD numbers.
- **Data path side effects.** If neither `MNE_DATASETS_BNCI_PATH` nor `MNE_DATA` is set, MOABB creates `~/mne_data` and calls `set_config("MNE_DATA", ...)`, which writes to MNE's home config [R10]. **To stay CLAUDE.md-compliant, set the environment variables `MNE_DATA` and `MNE_DATASETS_BNCI_PATH` to `C:/Users/AK/Documents/FYP/research/data` in-process before importing MOABB/MNE.** MNE reads environment variables before its config file [R10, docstring "environment variable or config parameter"]. Also set `MPLCONFIGDIR` and pip's `--cache-dir` inside the project **[recommendation]**.

### 2.2 Recipe for raw epochs t = 2–6 s (1000 samples, µV, no filtering)

Option A, the paradigm API (simple, and it gives 1001 samples unless corrected):

```python
import os; os.environ["MNE_DATA"] = os.environ["MNE_DATASETS_BNCI_PATH"] = r"C:\Users\AK\Documents\FYP\research\data"
from moabb.datasets import BNCI2014_001
from moabb.paradigms import MotorImagery
CH = ["Fz","FC3","FC1","FCz","FC2","FC4","C5","C3","C1","Cz","C2","C4","C6",
      "CP3","CP1","CPz","CP2","CP4","P1","Pz","P2","POz"]
ds = BNCI2014_001()                      # artifact_handling="ignore" (default) → all 288 trials
para = MotorImagery(n_classes=4, fmin=None, fmax=None, tmin=0.0, tmax=4.0 - 1/250,
                    channels=CH, resample=None)   # epoch = [2.0, 5.996] s → 1000 samples
X, y, meta = para.get_data(ds, subjects=[1])      # X: (576, 22, 1000) in µV; meta.session ∈ {"0train","1test"}
assert X.shape[1:] == (22, 1000)
```

Option B, raw-level (recommended; full control, and it allows padded extraction for the browser export):

```python
raw = ds.get_data(subjects=[1])[1]["1test"]["0"]   # MNE Raw, volts, includes STI channel
ev = mne.find_events(raw, stim_channel="STI")       # sample index = trial START (t=0)
x = raw.get_data(picks=CH)[:, ev[i,0] + 500 : ev[i,0] + 1500] * 1e6   # exactly [2.0, 6.0) s, µV
```

Equivalent without MOABB: `scipy.io.loadmat(f, struct_as_record=False, squeeze_me=True)["data"]`. For each run with `len(run.trial) > 0`, take the slice `run.X[run.trial[i]-1+500 : run.trial[i]-1+1500, :22]` [R5]. This uses the same bytes and the same conventions as MOABB.

### 2.3 Pitfalls checklist (each should be a pytest)

| # | Pitfall | Guard |
|---|---|---|
| P1 | Silent 8–32 Hz MOABB filter | `fmin=None, fmax=None`; assert PSD at 35–40 Hz is non-negligible |
| P2 | 1001 vs 1000 samples (inclusive tmax) | Explicit slice `[500:1500]`; assert `shape[-1] == 1000` |
| P3 | Event at trial start (MOABB) vs cue (GDF) | Assert a visual-evoked deflection over POz (ch 22) about 100–250 ms after t = 2 s in the trial average **[sanity test I propose; expected latency is generic VEP knowledge, UNVERIFIED for this dataset]** |
| P4 | Volts vs µV (factor 1e6, so 1e12 in power) | Assert median per-trial EEG SD in roughly 5–50 µV **[EST]** |
| P5 | EOG channels leaking into the 22 nodes | Explicit `CH` list; assert no `eog` type |
| P6 | Session-name drift across MOABB versions | Pin `moabb==1.7.2`; assert set of sessions == {"0train","1test"} |
| P7 | Class balance | Assert 72/72/72/72 per session per subject (holds only with `artifact_handling="ignore"`) |
| P8 | Label order | Assert MOABB labels map to the README tokens: left_hand→PREVIOUS, right_hand→NEXT, feet→SELECT, tongue→BACK |
| P9 | NaN gaps (GDF has 100 NaNs between runs [R1]) | Assert `np.isfinite(X).all()` |
| P10 | Home-directory writes | Run with `MNE_DATA` set; assert `~/mne_data` was not created |

---

## 3. Internal-consistency checks on the paper's numbers (inputs for the "replication fidelity" debate)

### 3.1 Per-subject values (Fig. 3)

Subject order comes from `pdftotext -raw` content-stream order, cross-checked against κ = (acc − 0.25)/0.75 [R23]:

| Subject | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | Mean |
|---|---|---|---|---|---|---|---|---|---|---|
| SD acc (%) | 80.21 | 61.46 | 89.24 | 70.49 | 72.92 | 71.88 | 86.11 | 85.07 | 81.94 | **77.70** |
| SD κ | 0.736 | 0.486 | 0.856 | 0.606 | 0.639 | 0.625 | 0.815 | 0.801 | 0.759 | 0.7027 |
| SI acc (%) | 70.14 | 52.08 | 77.43 | 67.71 | 55.21 | 56.94 | 74.31 | 79.17 | 66.32 | **66.59** |
| SI κ | 0.602 | 0.361 | 0.699 | 0.569 | 0.403 | 0.426 | 0.657 | 0.722 | 0.551 | 0.5545 |

The A04–A06 assignment rests on raw text order and on matching κ values to accuracies by x-position. It is **[UNVERIFIED against the rendered figure]**, so check it visually in the PDF.

### 3.2 77.70 vs 77.05

Three pieces of evidence support 77.70:

- The SD mean of the nine Fig. 3a values is 77.70 (77.7022).
- §3.8's "improvements" of 5.48, 3.05, 3.05, 7.56, 0.96, 2.01, 1.66 and 1.66 equal 77.70 minus the Table 3 baseline accuracies exactly.
- κ = 0.7027 = (0.7770 − 0.25)/0.75.

**Conclusion: 77.05 in the body text is a typo, and our target is 77.70.** Arithmetic is in §3.4 of this brief, based on [R23].

### 3.3 Size of the SI test set

At two decimals, the 1/576 granularity (0.174 pp) is resolvable. All nine SI accuracies are integer counts out of 288: 70.14% = 202/288, 52.08% = 150/288, …, 66.32% = 191/288. Under a 576-trial test, each value would need an even numerator by chance, a probability of about (1/2)^9 ≈ 0.2%.

**Inference:** the LOSO test set is one session (288 trials) of the held-out subject. Which session (T or E), and which data the eight training subjects contributed (T only, giving 2304 graphs, or T+E, giving 4608), is **not stated** [R23 §3.3]. *This is my inference from the reported numbers.*

### 3.4 The κ identity, and where the paper violates it

With true class marginals of exactly 1/4, p_e = Σ_k ¼·p̂_k = ¼ for any predictions. So κ = (p_o − ¼)/¾ per subject, and the mean of κ equals (mean acc − ¼)/¾. This holds for every IV-2a session, since each has 72 trials per class [R1]. It is my derivation, using Eq. (28) of [R23].

- **SFE-GAT** satisfies it: SD 0.7770 gives 0.7027 and SI 0.6659 gives 0.5545, both as reported.
- **Every Table 3 baseline** reports a κ *below* the identity:
  - EEGNet SD: 0.6243 reported vs 0.6296 implied.
  - EEGConformer SD: 0.5524 reported vs 0.6019 implied.
  - SF-TGCN SD: 0.6628 reported vs 0.6805 implied.

  So the baseline κ values were not computed on the same balanced 288-trial test sets as their accuracies (for example, copied from elsewhere or computed on artifact-free trials). **Treat Table 3 baselines as approximate.**
- **Ablation text (§3.5):**
  - R-GAT acc 47.8% implies κ 0.304, but 0.280 is reported. R-SFE-GAT 59.5% implies 0.460, but 0.505 is reported.
  - The F1 delta "18.7" is 56.9 − 38.3 = 18.6, and the accuracy delta "11.8" is 59.5 − 47.8 = 11.7.

  These are minor internal inconsistencies. Our replication should report raw values and not try to match them.
- **Pytest:** for full balanced test sets, assert `abs(kappa - (acc-0.25)/0.75) < 1e-9`.

### 3.5 Test-set sampling noise (what a tolerance band must at least absorb)

- **Per subject (n = 288) at 77.7%:** the binomial 95% CI half-width is **±4.8 pp**.
- **Pooled over 9 subjects (n = 2592):** **±1.6 pp** (SD) and ±1.8 pp (SI at 66.6%).
- **Chance level.** The 95% upper bound of chance is **29.5%** (n = 288), 28.1% (n = 576) and 26.4% (n = 2592), by exact binomial at p = 0.25.

These are my computations. For the methodology, see Müller-Putz et al. 2008 [R36] and Combrisson & Jerbi 2015 [R37, not re-fetched].

---

## 4. PLV pitfalls (Eqs. 1–5)

1. **Broadband phase is close to meaningless.** The analytic-signal phase is interpretable as an oscillation phase only for narrowband signals. Standard PLV (Lachaux et al. 1999) band-passes *before* the Hilbert transform [R35][R38].
   - The paper applies Hilbert to "each electrode's signal" with no stated band [R23 §2.1].
   - The authors' notebook applies **no filter before** PLV; its `compute_plv` is called but not defined in the public repo [R22b].
   - On 0.5–100 Hz data with a 1/f spectrum, broadband instantaneous phase is dominated by the highest-power, lowest-frequency components (delta/theta, drifts, ocular activity). The resulting PLV mostly indexes slow common-mode coupling rather than mu/beta synchrony **[UNVERIFIED for this dataset. It follows from the 1/f spectral shape; measure it with a narrowband-vs-broadband comparison]**.
   - Options and a recommendation are in Decision D3.
2. **Volume conduction and the common reference inflate zero-lag PLV.**
   - Neighbouring electrodes 3.5 cm apart [R1] see the same sources almost instantaneously.
   - A shared left-mastoid reference [R1] adds a common signal to every channel.
   - Both effects push PLV towards 1 for nearby pairs regardless of true interaction. This is the "volume conduction" and "common reference" problem [R38]; PLI [R39], wPLI [R40] and imaginary coherency [R41] were designed to discount zero-lag coupling.
   - Implication: the paper's Fig. 6a finding that pre-evolution edges are "localized and dense" [R23 §3.7] is exactly what volume conduction predicts.
   - **Docs and the POC brain-graph view must describe the evolved graph as a model-internal structure, not as a demonstrated neural network change** (honesty rule, CLAUDE.md §6).
   - We still implement PLV as the paper specifies (fidelity). Any PLI/wPLI comparison is an optional, clearly labelled extension.
3. **Hilbert edge effects.**
   - `scipy.signal.hilbert` uses an FFT of length N (default `N = x.shape[axis]`), which implicitly treats the epoch as periodic. The discontinuity between the epoch's ends distorts the phase near both edges **[UNVERIFIED magnitude; standard FFT property]**.
   - Mitigations: compute on a padded segment then crop, or taper. The paper is silent; the debate options are in D2.
   - **Parity hazard:** N = 1000 is not a power of two. A JS radix-2 FFT that zero-pads to 1024 will **not** match scipy. The browser FFT must handle arbitrary N (mixed-radix or Bluestein) or use an exact DFT for N = 1000.
4. **Estimator bias with finite samples.** Sample PLV is biased upwards for finite N, and the bias grows as the effective number of independent samples falls [R42][R43]. With T = 1000 samples the bias is small for broadband signals but larger for narrowband ones, where autocorrelation reduces the effective N **[UNVERIFIED magnitude]**. Per-trial z-scoring (Eq. 2–3) removes any global offset, so the bias matters little for edge *ranking*.
5. **The z-score domain.** Read literally, Eq. 2 computes µ and σ over **all C² entries, including the diagonal of 1s**, and Eq. 4 zeroes the diagonal afterwards [R23]. Including the 22 diagonal ones raises µ and σ. Decide whether to follow this literally (recommended: yes, and document it).
   - The repo thresholds z-scored PLV at **0.3** (`plv > threshold` for weights, `>= threshold` for `edge_index`) [R22b].
   - The repo builds `Data(x, edge_index, y)` **without `edge_attr`**, so PLV weights are not passed to GATv2 [R22b].
   - These are for the Paper Analyst and Reference-Code Auditor to settle.
6. **The z-score must be per trial.** Each trial's matrix is normalised by its own statistics. A z-score over a stack of trials (`z_score_norm(plv)` on an `(n_trials, 22, 22)` array, implementation not public [R22b]) would mix train and test statistics. That is a leakage risk if it is applied across sessions (§7).

## 5. Filter-bank and Welch PSD pitfalls (Eqs. 6–8)

1. **Filter specification conflict.**
   - The paper says "zero-phase 4th-order Butterworth … with passband ripple Rp = 0.5 dB and stopband attenuation Rs = 40 dB" [R23 §2.1]. Rp and Rs are not Butterworth design parameters; they belong to `iirdesign` or Chebyshev/elliptic filters.
   - The repo uses `sig.butter(5, [lo, hi], 'bandpass', fs=250, output='sos')` with `sosfiltfilt` [R22b], so order **5**, not 4.
   - SciPy's `butter(N, band)` yields a 2N-order band-pass, and filtfilt squares the magnitude response. At the band edges the Butterworth power gain is 0.5 per pass, so **0.25 after filtfilt (−6 dB)** (standard filter theory).
   - **Use the `sos` form.** Narrow 4 Hz bands at 8 Hz with `ba` coefficients are numerically fragile. The repo already uses SOS [R22b].
2. **Edge transients.** `sosfiltfilt` pads with `padtype='odd'` and `padlen = 3·(2·n_sections + 1 − …)`, i.e. about 27 samples (108 ms) for a 4-section filter [R21]. A 4 Hz-wide 8–12 Hz band-pass rings for hundreds of ms **[EST]**, so the first and last few hundred ms of a 4 s epoch are partly transient.
   - The authors filter **after** cropping, operating on NPZ epochs along the time axis [R22b], so literal fidelity means crop first and then filter.
   - The JS port must reproduce the odd-extension padding exactly for parity.
3. **Welch segment length conflict.**
   - The paper specifies 1 s segments (250 samples), 50% overlap and a Hann window [R23 §2.1]. On 1000 samples that gives **7 segments and 1 Hz resolution**.
   - The repo uses `nperseg = 2*fs = 500`, which gives 3 segments and 0.5 Hz resolution [R22b].
   - SciPy defaults are a periodic Hann window (`'hann_periodic'` in SciPy 1.18), `noverlap = nperseg//2`, `detrend='constant'`, `scaling='density'`, one-sided, mean averaging [R20]. **The JS port must use the periodic Hann (sym=False) and constant detrend.**
4. **Band integration.**
   - The repo selects bins with `freqs >= low & freqs <= high`, inclusive at both ends, so the 12, 16, …, 36 Hz bins are counted in two adjacent bands. It integrates with `scipy.integrate.simpson(psd, dx=Δf)` [R22b].
   - With 1 Hz bins each band has 5 points (odd count), so composite Simpson is unambiguous. With 0.5 Hz bins it has 9 points.
   - Eq. 8 is a continuous integral and does not specify the quadrature. Pick one, and mirror it in JS.
5. **Is the band-pass redundant?** Welch PSD of a band-passed signal integrated over that band equals roughly the raw PSD weighted by |H(f)|² over the band. The filter mainly attenuates the band-edge bins and spectral leakage from outside the band. This is not wrong, but it means the expensive 8× filtering contributes little information. It must still be reproduced for fidelity and parity.
6. **Units and dynamic range.**
   - Band power in V²·s (MOABB raw) is about 1e-12 of the value in µV² (paradigm/.mat). Band power is heavy-tailed across channels, bands and subjects.
   - **Neither the paper nor the repo applies a log transform** [R23][R22b], and there is no input normalisation before the first GATv2 (BN comes *after* it [R23 Eq. 12–14]).
   - This makes the absolute unit a hidden hyperparameter. Options are in D4.
7. **Variance.** 7 Hann segments with 50% overlap give roughly 2×7 ≈ 14 degrees of freedom per bin **[EST]**, so per-bin relative SD is about 0.38. Band integration over 5 bins reduces this. Features are noisy per trial, which is expected for single-trial MI.

---

## 6. Table 3 baselines: what their original papers report on IV-2a (sanity bands)

| Model | SFE-GAT paper Table 3 (SD / SI acc) [R23] | Original or independent IV-2a report | Protocol notes |
|---|---|---|---|
| EEGNet (Lawhern 2018) | 72.22 / 59.72 | Original paper: 4-fold within-subject CV, not T→E, so not directly comparable [R32][R24]. Independent T→E reruns: **73.15** (FBCNet authors, EEGNet-8,2) [R24]; **68.67** (ATCNet repo, proper Train/Val/Test) [R26]; **77.39** (CTNet, 30% val split, 2–6 s) [R27]. LOSO: **56.85** (CTNet) [R27] | Wide spread (68–77%) across pipelines |
| DGCNN (Song 2018/2020) | 74.65 / 63.89 | Emotion-recognition model; no original IV-2a result [R33] | Number is the SFE-GAT authors' own rerun |
| FBCNet (Mane 2021) | 74.65 / 48.96 | **76.20** hold-out T→E, 0–4 s post-cue, 20% val from T (κ 0.683); 79.03 10-fold CV [R24] | Table 3 is 1.55 pp below the original |
| EEG-Conformer (Song 2023) | 70.14 / 59.03 | Repo reports **78.66** hold-out [R25], but the code reports the **best test-epoch accuracy** (`bestAcc`) [R25b]. CTNet rerun: 77.66; LOSO 53.41 [R27] | Original number is optimistically selected on test |
| LightConvNet (Ma 2023) | 76.74 / 51.74 | **79.48** (abstract via search snippet) **[UNVERIFIED: primary text not fetched]** [R28] | |
| IFNet (Wang 2023) | 75.69 / 61.81 | Repo README: IFNet **V2** 79.78%. The original IFNet number is shown only as an image **[UNVERIFIED]** [R29] | |
| SF-TGCN (Tang 2024) | 76.04 / 65.63 | Original number **[UNVERIFIED]**: paper not reachable [R31] | |
| MSVTNet (Liu 2024) | 76.04 / 64.58 | A secondary comparison table gives 75.50% / κ 0.6733 **[UNVERIFIED secondary]**. Original not fetched [R30] | |
| *Reference points* | | FBCSP competition winner κ 0.57, about 67.75% [R2][R24]. ATCNet 85.4% in its paper vs **81.10%** in the authors' corrected Train/Val/Test rerun [R26]. CTNet 82.52% SD, 58.64% LOSO [R27] | |

**Sanity bands for our replication** [my synthesis of the above]:

- **SD (T→E, per subject, no test peeking).** A correctly working pipeline on IV-2a should land in **roughly 65–80%** mean accuracy. Below about 60% suggests a pipeline bug, since a log-band-power + linear baseline and FBCSP reach about 65–68% [R2][R24]. Above about 82% for this small PSD-feature GNN should trigger a leakage audit.
- **SI (LOSO).** Literature reruns cluster at **about 50–65%** [R27][R23]. SFE-GAT's 66.59% is at the top of that range.
- **Cheap floor check (recommended).** Fit a logistic regression or LDA on log(H) with H ∈ ℝ^{22×8} (176 features), on the same splits. It runs in seconds. If SFE-GAT does not beat it, investigate before claiming anything **[EST: expected about 55–70% SD; UNVERIFIED]**.

---

## 7. Leakage risks (SD and LOSO) and how to block each

| # | Risk | Where it bites | Evidence it happens in this literature | Guard |
|---|---|---|---|---|
| L1 | **Model or epoch selection on the test session** (best epoch, early stopping, checkpoint on test) | SD and SI | Conformer `bestAcc` over per-epoch test evaluations [R25b]. ATCNet `validation_data=(X_test, …)` with `save_best_only=True` [R26b]. The corrected ATCNet drops from 85.4 to 81.10 [R26] | Fixed 500 epochs; report the **last** epoch. Test-set evaluation is called **once**, after training (enforced by code structure: the trainer never receives E) |
| L2 | **Hyperparameters (τ, η, the PSD unit or log choice, LR) tuned on E** | SD | Paper: "selected based on preliminary experiments" without saying on which data [R23 §3.3] | Take values from the paper or repo. If tuning is unavoidable, use stratified CV **inside session T only**, and log it in an ADR |
| L3 | **Normalisation fit on test** (global z-score or StandardScaler over T+E, or over all subjects incl. the LOSO test subject) | SD and SI | Conformer computes its z-score from training data only (correct) [R25b]; the repo's `z_score_norm` scope is unknown [R22b] | Per-trial operations (PLV z-score, per-trial PSD) are leakage-free. Any dataset-level scaler is fit on training graphs only and saved with the model |
| L4 | **BatchNorm in train mode at test time** (normalising with test-batch statistics) | SD and SI | Generic; PyG `BatchNorm` normalises across all nodes in the batch | `model.eval()` for every test pass. Pytest: identical logits for batch size 1 vs 64 in eval mode |
| L5 | **Channel-wise scaling or alignment using the test subject's data** (Euclidean alignment, per-subject z-score) | SI | Common in cross-subject work; it is transductive | Not in the paper, so don't. If ever used, label it "transductive" |
| L6 | **Seed or run cherry-picking** (best of N seeds) | Both | — | Report mean ± SD over the pre-declared seeds (e.g. 0, 1, 2) |
| L7 | **Deployment-subject choice by test accuracy** (POC) | Demo | — | Allowed only if disclosed in the ADR as a demo choice. The exported replay trials must be **session E** trials never seen in training (enforced by a test comparing trial hashes) |
| L8 | **Pooled vs per-subject "SD"** | SD | §3.3 of the paper describes "288 trials × 9 subjects from the first session … as the training set" [R23], which reads ambiguously as one pooled model | Settle in D5. Either way E is never used for training |
| L9 | **Non-causal filtering across trial boundaries** (filtering continuous data before epoching lets the 2–6 s window see post-6 s samples) | Both | MOABB filters the continuous raw [R7] | Crop first, then filter, as the authors did [R22b]. That makes the label-leak path impossible |
| L10 | **Artifact-based trial removal using the expert marks on E** | Both | Competition scoring excluded artifact trials [R1] | Keep all 288 (paper). Optionally report artifact-free accuracy as a secondary, clearly labelled number |

---

## 8. Feasibility on this machine (CPU-only)

### 8.1 Environment facts (checked locally on 2026-10-14)

- **Hardware:** Intel Core **i7-10510U** (4 cores / 8 threads, 1.8 GHz base, a 15 W laptop part), **15.6 GB RAM**, 311 GB free on C:. No NVIDIA GPU (per orchestrator).
- **Python:** the Python install manager is present. `py -0p` lists only `3.14` (`pythoncore-3.14-64`); `venv` and `ensurepip` import fine. `uv` is **not** installed.
- **Note:** running `py help` printed "Python install manager was successfully updated to 26.4". This appears to be a post-update notice from the Windows install manager. No install was requested by this agent, and **[UNVERIFIED]** whether the command itself triggered the update.

### 8.2 Wheel availability for Python 3.14 on Windows (PyPI metadata, 2026-10-14)

| Package | Version | Windows cp314 / universal wheel | Size |
|---|---|---|---|
| torch | 2.14.1 (30 Sep 2026); Requires ≥3.10; 3.14 classifier | `torch-2.14.1-cp314-cp314-win_amd64.whl` (CPU build on PyPI) | **124.1 MB** [R14][R15] |
| torch-geometric | 2.8.1 (12 Oct 2026); 3.14 classifier; `py3-none-any`. Extensions `pyg-lib`, `torch-scatter`, `torch-sparse` are **optional** | pure Python | 1.3 MB [R16] |
| numpy / scipy / scikit-learn / pandas / matplotlib | 2.5.4 / 1.18.1 / 1.9.1 / 3.0.6 / 3.11.2 | cp314 win_amd64 | 12.7 / 37.4 / 8.4 / 9.8 / 9.5 MB [R17] |
| mne | 1.13.2 (≥3.11) | py3-none-any | 7.7 MB [R17] |
| moabb | 1.7.2 (≥3.11; 3.14 classifier) | py3-none-any. All compiled transitive deps (h5py, pyyaml, aiohttp, psutil, xxhash, coverage, pillow, contourpy, kiwisolver, …) have cp314 Windows wheels | 1.0 MB + deps [R13][R17] |
| torch 2.7.0 (the paper's version) | — | Windows wheels for cp39–cp313 only, **no cp314** | 212.5 MB [R17] |

**Conclusion.** A `research/.venv` built from the existing **Python 3.14** (`py -3.14 -m venv research\.venv`) is fully supported, and no second interpreter is needed. Matching the paper's exact stack (Python 3.10, torch 2.7.0, PyG 2.6.1 [R23 §3.3]) would require installing Python ≤3.13. The python.org 3.12.10 installer is 26.96 MB [R17], and either the installer or `py install 3.12` writes to the user profile, *outside* the project folder. I do not recommend this: version drift is a much smaller source of discrepancy than the paper's ambiguities.

**Download and disk estimate.**

- Core stack (torch, PyG, numpy, scipy, scikit-learn, pandas, matplotlib + pillow/fonttools, sympy, networkx, pyyaml, pytest, jinja2, fsspec, …): **≈ 230 MB download**.
- MNE + MOABB + deps: about 25 MB more.
- Installed footprint: **≈ 0.9–1.2 GB [EST; torch's unpacked size UNVERIFIED]**.
- Dataset: **780 MB**.
- Use `pip --cache-dir research/.pip-cache`, or `--no-cache-dir`, to avoid writing `%LOCALAPPDATA%\pip`.

### 8.3 CPU training-time estimate [EST: must be calibrated]

**Assumptions:**

- 22 nodes per graph. After τ there are roughly 150–250 directed edges plus 22 self-loops.
- Batch of 64 graphs ≈ 1408 nodes and 10–16 k edges.
- Per-batch forward cost: three 128→128 GATv2 layers (each 2 × 1408×128×128 linear) plus the 8→128 layer, three GCN 128→32 encoders, and a dense 64×22×22 decoder ≈ 0.3 GFLOP.
- Forward + backward ≈ 1 GFLOP per step.
- On a 15 W 4-core CPU with small matmuls (about 20–50 GFLOP/s effective), plus PyTorch/PyG per-op overhead (several hundred ops at about 10–20 µs each) and PyG collation, I expect **≈ 40–80 ms per SGD step** in one process **[EST]**.
- The parameter count (about 0.12–0.15 M) is irrelevant to speed at this size.

| Job | Graphs | Steps (500 epochs) | Sequential [EST] | Wall time, 3–4 parallel single-thread processes [EST] |
|---|---|---|---|---|
| SD, 1 subject | 288 train (5 batches/epoch) | 2,500 | 1.7–3.3 min | — |
| **SD, 9 subjects × 1 seed** | — | 22,500 | **15–30 min** | 6–12 min |
| SD, 9 subjects × 3 seeds | — | 67,500 | 45–90 min | 18–35 min |
| LOSO fold, T-only training (2304) | 36 batches/epoch | 18,000 | 12–24 min | — |
| **LOSO, 9 folds, 2304 train** | — | 162,000 | **1.8–3.6 h** | 45–90 min |
| LOSO, 9 folds, 4608 train (T+E of 8 subjects) | 72 batches/epoch | 324,000 | 3.6–7.2 h | 1.5–3 h |
| **Ablations (Fig. 4): 5 variants × 9 subjects × 1 seed (SD)** | — | 112,500 | **1.2–2.5 h** (PLV-GAT and R-GAT are cheaper) | 30–60 min |
| t-SNE / Silhouette / DBI, edge counts, latency | — | inference only | < 10 min | — |
| Preprocessing (filter bank + Welch + Hilbert PLV, 5184 trials) | — | — | < 2 min | — |

**Caveats:**

- The U-series CPU will thermally throttle under sustained all-core load, possibly costing 20–40% **[EST]**. Keep it plugged in, on the "Best performance" power mode.
- Pin `torch.set_num_threads(1)` per worker when running processes in parallel.
- Use `num_workers=0`, because Windows DataLoader workers use spawn, which is slow.
- **Pre-collate the batches.** Every graph has 22 nodes, so each epoch's batches can be built once from tensors instead of through `Batch.from_data_list`.

**Mandatory calibration step (≤3 min, after the venv is approved).** Run SD on A01 for 10 epochs and measure seconds per step for (a) PyG sparse and (b) a dense-batched implementation (B×22×22 attention with −inf masking and self-loops, mathematically identical to GATv2). Multiply out the table above and present the result to the user with the approval request. A dense implementation is likely several times faster on CPU **[EST]** and also serves as the JS-parity reference. It must be verified equal to PyG within 1e-5 by pytest.

### 8.4 Concrete time budget and an honest fallback plan

**Plan A (full, the recommendation):**

1. Calibration (3 min).
2. SD × 9 subjects × 3 seeds × 500 epochs.
3. LOSO × 9 folds × 1 seed × 500 epochs, using the D6 training set.
4. Ablations × 5 × 9 subjects × 1 seed.
5. Visual analyses.

Expected wall time with parallel processes is **≈ 3–5 h** (2304-graph LOSO) or ≈ 4–7 h (4608-graph LOSO) **[EST]**. Each stage over 15 minutes needs the user's go-ahead (CLAUDE.md §1).

**Plan B (reduced but honest), if calibration shows Plan A over about 8 h:**

- (i) SD stays complete: all 9 subjects, 500 epochs, at least 1 seed (non-negotiable; it is cheap).
- (ii) LOSO uses T-only training data (2304 graphs) and the full 500 epochs.
- (iii) Ablations use 1 seed. R-GAT and R-SFE-GAT may use 3 subjects (A01, A03, A08), **explicitly labelled as a partial ablation**.
- (iv) Use the dense implementation for training, with PyG kept as the verified reference.

**Never acceptable:**

- Subsampling test sets.
- Fewer epochs chosen by looking at test curves.
- Dropping hard subjects (A02).
- Reporting partial runs as full.

If epochs must be cut, the cut is decided **before** training. It is justified by the **training-loss** plateau on session T (or a T-internal validation split), and recorded as a deviation in an ADR.

---

## 9. Pre-training sanity tests (proposed `research/tests/`)

1. **Shapes and counts.** `(288, 22, 1000)` per subject-session; 72 trials per class; finite values; µV scale (P2, P4, P7, P9).
2. **Cue alignment.** The trial-average VEP over POz follows t = 2 s (P3).
3. **ERD sanity.** Mu (8–12 Hz) power over C3 (ch 8) should be lower for right-hand than left-hand trials, and over C4 (ch 12) the reverse, averaged over session T. This is contralateral ERD [R44]. It catches label or channel-order errors **[expected direction per [R44]; per-subject strength UNVERIFIED]**.
4. **κ identity** (§3.4).
5. **PLV invariants.** PLV is symmetric, lies in [0, 1], and has a unit diagonal before z-scoring. After Eq. 3–4 the diagonal is 0 and the z-score mean over the C² entries is 0.
6. **PSD invariants.** All values are positive. Shape is 22×8. Band order is 8–12 … 36–40.
7. **Leakage guards.** The trainer API cannot receive E (SD) or the held-out subject (LOSO). Eval-mode logits do not depend on batch size (L4).
8. **Floor baseline.** Log-band-power + logistic regression accuracy, logged per subject (§6).

---

## Decisions the debates must settle

**D1. Data access path.**

- **Options:**
  - (a) MOABB 1.7.2 `BNCI2014_001`.
  - (b) A direct `scipy.io.loadmat` loader on the same 18 BNCI `.mat` files, downloaded over plain HTTPS into `research/data/`, with a SHA-256 manifest.
  - (c) Competition GDF plus separate true-label files.
- **Recommendation:** **(b) as the canonical loader**, with an optional pytest that cross-checks (a) when MOABB is installed.
- **Evidence:**
  - The files and conventions are identical to MOABB's (`trial-1` start index, µV, skip runs without trials) [R5].
  - It avoids about 25 dependencies and MOABB's home-directory writes [R10].
  - It makes the 2-s offset and the 1000-sample crop explicit (P2, P3).
  - (c) needs label joins and has the cue-offset trap [R1].
- **Fallback:** if the debate prefers MOABB for provenance, use it with `MNE_DATA` set and `fmin=fmax=None`.

**D2. Window and edge handling.**

- **Options:**
  - (a) Literal: crop [2.0, 6.0) to 1000 samples, then filter with `sosfiltfilt` default padding, then Hilbert on 1000 samples.
  - (b) Extract a padded [1.5, 6.5) window, filter and Hilbert it, then crop to [2, 6).
- **Recommendation:** **(a)**, with (b) as a labelled sensitivity run.
- **Evidence:**
  - The authors' notebook filters already-cropped NPZ epochs [R22b], and the paper says only the 2–6 s window was extracted [R23 §3.1].
  - (a) is simplest for JS parity. (b) reduces Hilbert and filter edge effects (§4.3, §5.2) but uses pre-cue samples.

**D3. PLV band.**

- **Options:**
  - (a) Broadband, as recorded (0.5–100 Hz).
  - (b) Narrowband 8–30 Hz before Hilbert.
  - (c) Per-band PLV (8 graphs).
- **Recommendation:** **(a) for the primary replication** (fidelity: paper text and repo show no pre-filter [R23][R22b]). Run (b) as an ablation, because it is the methodologically standard form [R35][R38].
- **Evidence:** §4.1. (c) changes the architecture, so reject it.

**D4. PSD scale and Welch parameters.**

- **Options:**
  - Units: (a) raw band power in µV²; (b) log10(µV²); (c) V².
  - `nperseg`: 250 (paper) vs 500 (repo).
  - Filter order: 4 (paper) vs 5 (repo).
- **Recommendation:** **µV², nperseg = 250, order 4 (paper > repo per CLAUDE.md §5)**, with log10 as a pre-declared sensitivity variant.
  - If the µV² model fails to train on session T (training accuracy stuck near chance), switching to log10 is a documented deviation decided **on training data only**.
- **Evidence:**
  - No log appears in the paper or the repo [R23][R22b].
  - The `.mat` files are stored in µV [R5].
  - V² is 1e-12 of µV² and would starve the first linear layer (§5.6).

**D5. SD protocol.**

- **Options:** (a) 9 per-subject models trained on T and tested on E; (b) one pooled model trained on all 9 T sessions and tested on all E sessions.
- **Recommendation:** **(a) primary**. Run (b) as a cheap sensitivity check (≈ one LOSO fold of compute).
- **Evidence:**
  - "Subject-dependent" conventionally means per subject, and Fig. 3a is per subject.
  - The paper's own sentence "288 trials × 9 subjects from the first session were used as the training set" [R23 §3.3] admits (b).

**D6. LOSO data.**

- **Options:**
  - Training set: (a) the 8 other subjects × T only (2304 graphs); (b) 8 × (T+E) (4608).
  - Test set: E only, T only, or T+E of the held-out subject.
- **Recommendation:** **Test = held-out subject's session E (288 trials).** Training = (b) 4608 if the calibrated budget allows, else (a), recorded as a deviation.
- **Evidence:**
  - Every Fig. 3b value is k/288 (§3.3), so the test set is one session.
  - E keeps the test trials identical to SD, which makes per-subject SD vs SI comparisons like-for-like.
  - "the remaining subjects were used for training" [R23 §3.3] has no session qualifier, which favours (b) literally.

**D7. Model selection.**

- **Options:** (a) fixed 500 epochs, last epoch; (b) a validation split from T with best-val checkpointing; (c) best test epoch.
- **Recommendation:** **(a)**. (b) only as a labelled extra. **(c) is forbidden.**
- **Evidence:** the paper trains for 500 epochs with no validation mentioned [R23 §3.3]; the leakage precedents are in L1 [R25b][R26][R26b].

**D8. Seeds and reporting.**

- **Recommendation:** pre-declare seeds {0, 1, 2}. Report mean ± SD for SD and the ablations, and at least 1 seed for LOSO (3 if the budget allows). Report per-subject accuracy, macro-precision, macro-F1 and κ, plus the κ-identity check.
- **Evidence:** §3.5. Test noise alone is ±1.6 pp on the 9-subject mean, so seed variance must be visible.

**D9. "Successfully reproduced" tolerance.**

- **Options:** (a) ±2 pp; (b) ±5 pp on the mean; (c) inside the paper's per-subject 95% CIs.
- **Recommendation:** **(b): SD mean in [72.7, 82.7]% and SI mean in [61.6, 71.6]%**, *and* a Spearman ρ > 0 between our per-subject accuracies and Fig. 3. Results outside the band are reported as "not reproduced", with analysis.
- **Evidence:**
  - Test-sampling CI ±1.6–1.8 pp (§3.5), plus unknown seed variance.
  - Unresolved ambiguities: τ, η, PLV band, units, LOSO data.
  - Independent reruns of the same baselines differ by 1.5–8.5 pp from their originals (§6: FBCNet 76.20→74.65; Conformer 78.66→70.14 or 77.66; EEGNet 68.67–77.39).

**D10. GNN implementation for training.**

- **Options:** (a) PyG `GATv2Conv`/`GCNConv` sparse; (b) a dense batched re-implementation.
- **Recommendation:** **PyG is the reference** (it reproduces the Table 1 parameter counts exactly: `GATv2Conv(8,32,heads=4)` = 2·(8·128+128)+128+128 = **2,560** and `GATv2Conv(128,32,heads=4)` = **33,280**, which also implies `concat=True`, `share_weights=False`, `bias=True` [R45][R23 Table 1]). Use **dense for training if it is faster**, with a pytest asserting PyG ≡ dense to 1e-5. The dense version is the JS-parity source.
- **Evidence:** §8.3. Also note GCN 128→32 = 4,128 parameters, while Table 1 lists 4,192 (a 64-parameter gap, possibly a BN(32)). Hand this to the Paper Analyst **[UNVERIFIED]**.

**D11. Python and interpreter version.**

- **Options:** (a) existing 3.14 + torch 2.14.1 + PyG 2.8.1; (b) install 3.12 or 3.13 to pin torch 2.7.0 / PyG 2.6.1 like the paper.
- **Recommendation:** **(a)**.
- **Evidence:** all wheels exist (§8.2). (b) needs an interpreter installed outside the project folder, for negligible fidelity gain.

**D12. Rejected trials.**

- **Recommendation:** keep all 288 (`artifact_handling="ignore"`). Optionally report the artifact-free accuracy as a secondary metric.
- **Evidence:** the paper uses 288 [R23 §3.1]; MOABB's default does the same [R5].

**D13. How evolved graphs are interpreted in docs and the UI.**

- **Recommendation:** describe edge retention as model behaviour. Do not claim "long-range task-core network" neurophysiology without controls (PLI/wPLI or a surrogate test).
- **Evidence:** volume conduction and the common reference [R38][R39][R40]. The authors' own Fig. 6a "localized and dense" pattern [R23].

---

## Open questions for the user

1. **Compute envelope.** Is it acceptable to run training for about 3–7 h of wall time in total, split into approved stages (SD ≈ 20–35 min; LOSO ≈ 1–3 h; ablations ≈ 0.5–1 h) on this laptop, plugged in? Can any of it run overnight?
2. If the calibrated budget is too high, do you prefer **Plan B** (LOSO trained on T sessions only; partial R-GAT/R-SFE-GAT ablation on 3 subjects, labelled), or would you rather wait for the full run?
3. Is **Python 3.14** for `research/.venv` acceptable, rather than installing a second interpreter to match the paper's Python 3.10 / torch 2.7.0?
4. **MOABB or direct loader?** Is installing MOABB (plus about 25 deps) acceptable, or do you prefer the dependency-light direct `.mat` loader on the same files (D1)?
5. Are **3 seeds** for SD and the ablations wanted, or is 1 seed enough given the time?

## Things requiring user approval

| # | Action | Size / time | Location |
|---|---|---|---|
| A1 | Create `research/.venv` with `py -3.14 -m venv` | ~25 MB | `C:\Users\AK\Documents\FYP\research\.venv` |
| A2 | `pip install` the core stack: torch 2.14.1 (CPU), torch-geometric 2.8.1, numpy, scipy, scikit-learn, pandas, matplotlib, pyyaml, pytest (+ mne 1.13.2 and optionally moabb 1.7.2) | **≈ 230 MB download** (+≈25 MB with MNE/MOABB); **≈ 0.9–1.2 GB installed [EST]**; about 5–15 min | venv only; pip cache redirected inside the project |
| A3 | Download BNCI2014-001 (A01T…A09E.mat) from `lampx.tugraz.at` | **779,873,919 B ≈ 780 MB**; about 2–10 min depending on bandwidth **[EST]** | `research/data/bnci2014_001/` (+ SHA-256 manifest) |
| A4 | Calibration micro-benchmark (A01, 10 epochs, sparse vs dense) | ≤ 3 min | `research/runs/` |
| A5 | SD training: 9 subjects × 3 seeds × 500 epochs | **[EST] 18–35 min wall** (45–90 min sequential) | `research/runs/` |
| A6 | LOSO training: 9 folds × 1 seed × 500 epochs | **[EST] 45–90 min wall** (2304 graphs) or **1.5–3 h** (4608 graphs) | `research/runs/` |
| A7 | Ablations (Fig. 4): 5 variants × 9 subjects × 1 seed | **[EST] 30–60 min wall** | `research/runs/` |
| A8 | Optional sensitivity runs (PLV 8–30 Hz, log-PSD, pooled SD, padded window) | **[EST]** about 15–30 min each, at 1 seed and SD only | `research/runs/` |

Not requested: installing another Python interpreter (it would land outside the project folder), `uv`, GDF data (≈ 420 MB **[UNVERIFIED]**), and any GPU or cloud execution.

## References

- **[R1]** Brunner C., Leeb R., Müller-Putz G.R., Schlögl A., Pfurtscheller G. *BCI Competition 2008 – Graz data set A* (desc_2a.pdf). https://www.bbci.de/competition/iv/desc_2a.pdf (fetched and extracted with pdftotext, 2026-10-14)
- **[R2]** BCI Competition IV results, Data set 2a ranking (Ang κ 0.57, …). https://www.bbci.de/competition/iv/results/index.html
- **[R3]** BCI Competition IV main page (news: true labels of evaluation sets released). https://www.bbci.de/competition/iv/
- **[R4]** MOABB source, `moabb/datasets/bnci/bnci_2014.py` (BNCI2014_001 class, `_load_data_001_2014`, channel list, session/run naming). https://github.com/NeuroTechX/moabb/blob/develop/moabb/datasets/bnci/bnci_2014.py
- **[R5]** MOABB source, `moabb/datasets/bnci/base.py` (`BNCI_URL`, `_convert_mi`, `_convert_run`: `trigger[run.trial-1]=run.y`, uV→V, artifact handling). https://github.com/NeuroTechX/moabb/blob/develop/moabb/datasets/bnci/base.py
- **[R6]** MOABB source, `moabb/paradigms/motor_imagery.py` (`MotorImagery` defaults fmin=8, fmax=32; IIR description). https://github.com/NeuroTechX/moabb/blob/develop/moabb/paradigms/motor_imagery.py
- **[R7]** MOABB source, `moabb/paradigms/base.py` (tmin/tmax from `dataset.interval`; filter before epoching; `unit_factor` scaling). https://github.com/NeuroTechX/moabb/blob/develop/moabb/paradigms/base.py
- **[R8]** MOABB source, `moabb/datasets/preprocessing.py` (`RawToEpochs` → `mne.Epochs(...)`; `raw.filter(..., method="iir")`). https://github.com/NeuroTechX/moabb/blob/develop/moabb/datasets/preprocessing.py
- **[R9]** MOABB source, `moabb/datasets/base.py` (`unit_factor=1e6` default). https://github.com/NeuroTechX/moabb/blob/develop/moabb/datasets/base.py
- **[R10]** MOABB source, `moabb/datasets/download.py` (`get_dataset_path`: creates `~/mne_data`, `set_config("MNE_DATA", …)`). https://github.com/NeuroTechX/moabb/blob/develop/moabb/datasets/download.py
- **[R11]** MOABB source, `moabb/evaluations/evaluations.py` (`CrossSessionEvaluation` uses `LeaveOneGroupOut` over sessions). https://github.com/NeuroTechX/moabb/blob/develop/moabb/evaluations/evaluations.py
- **[R12]** MOABB docs, `BNCI2014_001`. https://moabb.neurotechx.com/docs/generated/moabb.datasets.BNCI2014_001.html
- **[R13]** PyPI, moabb 1.7.2. https://pypi.org/project/moabb/ and https://pypi.org/pypi/moabb/json
- **[R14]** PyPI, torch 2.14.1. https://pypi.org/project/torch/
- **[R15]** PyPI, torch 2.14.1 files (cp314 win_amd64 124.1 MB). https://pypi.org/project/torch/2.14.1/#files
- **[R16]** PyPI, torch-geometric 2.8.1. https://pypi.org/project/torch-geometric/
- **[R17]** PyPI JSON API, queried 2026-10-14, for numpy, scipy, scikit-learn, pandas, matplotlib, mne, h5py, etc., torch 2.7.0 (https://pypi.org/pypi/torch/2.7.0/json) and torch-geometric 2.6.1. https://pypi.org/pypi/<package>/json. Python 3.12.10 installer size: https://www.python.org/ftp/python/3.12.10/
- **[R18]** HTTP HEAD responses (Content-Length, Last-Modified) for `https://lampx.tugraz.at/~bci/database/001-2014/A0{1..9}{T,E}.mat`, and the 302 from `https://bnci-horizon-2020.eu/database/data-sets/001-2014/A01T.mat`, 2026-10-14.
- **[R19]** MNE-Python, `mne.Epochs` documentation (tmin/tmax: "closest or matching samples … are included"). https://mne.tools/stable/generated/mne.Epochs.html
- **[R20]** SciPy, `scipy.signal.welch` documentation (defaults). https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html
- **[R21]** SciPy, `scipy.signal.sosfiltfilt` documentation (padtype/padlen). https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.sosfiltfilt.html
- **[R22]** Gao X. et al., SFE-GAT public repository (README: partial code). https://github.com/GaoHSin/SFE-GAT
  - **[R22b]** `PLV&PSD.ipynb` (`butter(5, …, output='sos')`, `sosfiltfilt`, `welch(nperseg=2*fs)`, `simpson`, `threshold=0.3`, NPZ input, no log). https://raw.githubusercontent.com/GaoHSin/SFE-GAT/main/PLV%26PSD.ipynb
  - **[R22c]** `SFE-GAT.py` (`GATv2Conv(..., concat=True)`, GAE(GCNEncoder), dropout p = 0.2 in forward). https://raw.githubusercontent.com/GaoHSin/SFE-GAT/main/SFE-GAT.py
- **[R23]** Gao X., Cao G., Ma G. *SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding.* Sensors 2026, 26, 1730. doi:10.3390/s26051730 (local `sensors-26-01730-v2.pdf`; `docs/research/_paper-text.txt`)
- **[R24]** Mane R. et al. *FBCNet: A Multi-view Convolutional Neural Network for Brain-Computer Interface.* arXiv:2104.01233 (Tables II and V). https://ar5iv.labs.arxiv.org/html/2104.01233
- **[R25]** Song Y., Zheng Q., Liu B., Gao X. *EEG Conformer: Convolutional Transformer for EEG Decoding and Visualization.* IEEE TNSRE 31:710–719, 2023. doi:10.1109/TNSRE.2022.3230250. Repo: https://github.com/eeyhsong/EEG-Conformer
  - **[R25b]** `conformer.py`: test evaluation every epoch, `bestAcc` returned. https://raw.githubusercontent.com/eeyhsong/EEG-Conformer/main/conformer.py
- **[R26]** Altaheri H. et al. *Physics-informed attention temporal convolutional network for EEG-based motor imagery classification* (ATCNet). IEEE TII 2023. doi:10.1109/TII.2022.3197419. Repo README with the "does not align with current best practices" note and the 81.10% rerun: https://github.com/Altaheri/EEG-ATCNet
  - **[R26b]** `main_TrainTest.py`: `validation_data=(X_test, y_test_onehot)`, `ModelCheckpoint(monitor='val_accuracy', save_best_only=True)`. https://raw.githubusercontent.com/Altaheri/EEG-ATCNet/main/main_TrainTest.py
- **[R27]** Zhao W., Jiang X., Zhang B., Xiao S., Weng S. *CTNet: a convolutional transformer network for EEG-based motor imagery classification.* Sci Rep 14:20237, 2024. doi:10.1038/s41598-024-71118-7. https://pmc.ncbi.nlm.nih.gov/articles/PMC11364810/
- **[R28]** Ma X. et al. *A Temporal Dependency Learning CNN With Attention Mechanism for MI-EEG Decoding* (LightConvNet). IEEE TNSRE 31:3188–3200, 2023. doi:10.1109/TNSRE.2023.3299355. Repo: https://github.com/Ma-Xinzhi/LightConvNet (79.48% from a search snippet of the abstract **[UNVERIFIED]**)
- **[R29]** Wang J., Yao L., Wang Y. *IFNet: An Interactive Frequency Convolutional Neural Network for Enhancing Motor Imagery Decoding From EEG.* IEEE TNSRE 31:1900–1911, 2023. doi:10.1109/TNSRE.2023.3257319. Repo: https://github.com/Jiaheng-Wang/IFNet
- **[R30]** Liu K. et al. *MSVTNet: Multi-Scale Vision Transformer Neural Network for EEG-Based Motor Imagery Decoding.* IEEE JBHI 2024. doi:10.1109/JBHI.2024.3450753 (via https://dpeeg.readthedocs.io/0.4.0/generated/dpeeg.models.MSVTNet.html; original numbers **[UNVERIFIED]**)
- **[R31]** Tang X., Zhang J., Qi Y., Liu K., Li R., Wang H. *A spatial filter temporal graph convolutional network for decoding motor imagery EEG signals* (SF-TGCN). Expert Syst. Appl. 238:121915, 2024 (citation as given in [R23] ref. 12; not fetched **[UNVERIFIED]**)
- **[R32]** Lawhern V.J. et al. *EEGNet: a compact convolutional neural network for EEG-based brain–computer interfaces.* J. Neural Eng. 15:056013, 2018. arXiv:1611.08024. https://ar5iv.labs.arxiv.org/html/1611.08024
- **[R33]** Song T., Zheng W., Song P., Cui Z. *EEG emotion recognition using dynamical graph convolutional neural networks* (DGCNN). IEEE Trans. Affect. Comput. 11:532–541 (citation as given in [R23] ref. 40)
- **[R34]** Ang K.K. et al. *Filter bank common spatial pattern algorithm on BCI competition IV datasets 2a and 2b.* Front. Neurosci. 6:39, 2012 (citation as given in [R23] ref. 27)
- **[R35]** Lachaux J.-P., Rodriguez E., Martinerie J., Varela F.J. *Measuring phase synchrony in brain signals.* Hum. Brain Mapp. 8(4):194–208, 1999. doi:10.1002/(SICI)1097-0193(1999)8:4<194::AID-HBM4>3.0.CO;2-C. https://pmc.ncbi.nlm.nih.gov/articles/PMC6873296
- **[R36]** Müller-Putz G.R., Scherer R., Brunner C., Leeb R., Pfurtscheller G. *Better than random? A closer look on BCI results.* Int. J. Bioelectromagnetism 10(1):52–55, 2008. https://infoscience.epfl.ch/record/164768
- **[R37]** Combrisson E., Jerbi K. *Exceeding chance level by chance: The caveat of theoretical chance levels in brain signal classification and statistical assessment of decoding accuracy.* J. Neurosci. Methods 250:126–136, 2015 (not fetched this session)
- **[R38]** Bastos A.M., Schoffelen J.-M. *A Tutorial Review of Functional Connectivity Analysis Methods and Their Interpretational Pitfalls.* Front. Syst. Neurosci. 9:175, 2016. doi:10.3389/fnsys.2015.00175. https://www.frontiersin.org/articles/10.3389/fnsys.2015.00175/pdf
- **[R39]** Stam C.J., Nolte G., Daffertshofer A. *Phase lag index: assessment of functional connectivity from multi channel EEG and MEG with diminished bias from common sources.* Hum. Brain Mapp. 28(11):1178–1193, 2007.
- **[R40]** Vinck M. et al. *An improved index of phase-synchronization for electrophysiological data in the presence of volume-conduction, noise and sample-size bias.* NeuroImage 55(4):1548–1565, 2011. https://www.psychologie.hhu.de/fileadmin/redaktion/Fakultaeten/Mathematisch-Naturwissenschaftliche_Fakultaet/Psychologie/CompPsy/Papers/Vinck2011a.pdf
- **[R41]** Nolte G. et al. *Identifying true brain interaction from EEG data using the imaginary part of coherency.* Clin. Neurophysiol. 115(10):2292–2307, 2004. doi:10.1016/j.clinph.2004.04.029
- **[R42]** Aydore S., Pantazis D., Leahy R.M. *A note on the phase locking value and its properties.* NeuroImage 74:231–244, 2013. doi:10.1016/j.neuroimage.2013.02.008. https://pmc.ncbi.nlm.nih.gov/articles/PMC3674231
- **[R43]** Vinck M. et al. *The pairwise phase consistency: a bias-free measure of rhythmic neuronal synchronization.* NeuroImage 51:112–122, 2010. https://dare.uva.nl/id/7b042c12-e2cb-4520-a7ba-58828c2e6169 (volume/pages not re-fetched)
- **[R44]** Pfurtscheller G., Lopes da Silva F.H. *Event-related EEG/MEG synchronization and desynchronization: basic principles.* Clin. Neurophysiol. 110:1842–1857, 1999. doi:10.1016/S1388-2457(99)00141-8
- **[R45]** PyTorch Geometric source, `torch_geometric/nn/conv/gatv2_conv.py` (defaults `concat=True`, `share_weights=False`, `bias=True`, `add_self_loops=True`; `lin_l`/`lin_r`/`att`/`bias` parameters) and `gcn_conv.py`. https://github.com/pyg-team/pytorch_geometric/tree/master/torch_geometric/nn/conv
