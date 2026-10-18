# ErrP research brief (Workstream B)

**Author:** Phase-1 ErrP Scientist agent · **Date:** 2026-10-14 · **Status:** research only. Nothing was installed or downloaded. The only network access was read-only WebSearch/WebFetch, plus HTTP `HEAD` requests to read file sizes.

Citation keys like [Ferrez08] point to §16 (References). **[UNVERIFIED]** marks anything I could not confirm from a primary or official source in this session.

---

## 0. Summary

- **Morphology.** For an interaction/observation ErrP, the error-minus-correct difference wave at FCz/Cz has four peaks. There is a small positivity at about 200 ms, a sharp negativity (Ne) at about 250–270 ms, a larger positivity (Pe) at about 320–350 ms, and a broader negativity at about 430–500 ms. The signal lives in the 1–10 Hz band [Ferrez08; Chavarriaga10; Chavarriaga14; FerrezGraz08].
- **README value of −8.4 µV at FCz.** As a grand-average Ne, this is not plausible. Published first-negativity amplitudes are about −1.5 to −4 µV [Keyl19; Yasemin23], so −8.4 µV is roughly twice the largest reported value. It *is* plausible as a single-trial instantaneous minimum. Recommendation: label it as a single-trial value and generate the synthetic epoch to match (§1.3).
- **Target population.** In people with SCI, ErrP amplitudes are clearly smaller. The wN1 window mean at FCz is −0.27 µV in SCI against −1.55 µV in controls [Keyl19]. Four of eight SCI participants in [LopesDias21] showed no clear ErrP. Any claim about real-world performance must carry this caveat.
- **Methods.** Use windowed means with shrinkage LDA (sLDA). It is the most robust method in an 11-dataset comparison (72.35% balanced accuracy on average, and 77.14% on the BNCI monitoring dataset) [Yasemin23]. It is also trivially portable to JS for the 1e-4 parity test. xDAWN + Riemannian and EEGNet should be Python-only comparators.
- **Recommended dataset.** BNCI Horizon 2020 **013-2015 "Monitoring error-related potentials"** [Chavarriaga10]. It has 6 subjects, 2 sessions 50–643 days apart, 64-channel Biosemi at 512 Hz, and an error probability of about 0.20 (close to our MI error rate of about 0.22). It is **3.42 GB** across 12 `.mat` files, needs no login, and loads in MOABB ≥ 1.2.0 as `BNCI2015_013`. Its licence is **CC BY-NC-ND 4.0**, which constrains the replay export (§11). The MOABB loader has a label-naming trap (§5.2).
- **Kaggle "BCI Challenge @ NER 2015".** It needs a Kaggle login and acceptance of the competition rules, which **violates our no-login rule**. Reject it as the primary dataset.
- **Threshold.** Derive it from a 4-cell cost matrix: roll back iff the calibrated P(err | x) > t* = C_FP / (C_FP + C_FN − C_TP). With the costs I propose (C_FN = 8, C_FP = 4, C_TP = 1 token-equivalents), **t* = 0.364**.
- **Key finding: at our prior, a typical ErrP decoder can make things worse.** At π = 0.223 with equal costs, rollback only helps if LR+ = TPR/(1−TNR) > 3.48. The cross-session numbers in [Chavarriaga10] give LR+ = 2.61, which would **increase** expected cost by 21%. If the policy engine already filters out uncertain actions, the executed-action error rate π falls and the bar rises further (LR+ > 5.1 at π = 0.10). So π must be measured on *executed* actions, not taken as 1 − 0.777.
- **KG update.** A detected ErrP should update the resolver by Bayes using the detector's likelihood ratio. It should not flip the ranking outright. The alternative offered after rollback is "best hypothesis excluding the rolled-back one" (the second-best-guess rule of [Perrin12]), which yields Bedside Lamp. A separate, tempered and decaying penalty persists in the KG.

---

## 1. ErrP morphology

### 1.1 Types of ErrP
| Type | Elicited by | Typical components | Source |
|---|---|---|---|
| Response ERN/Ne + Pe | Subject's own wrong motor response | Negativity ~50–100 ms after the response, then a positivity ~200–500 ms | [Ferrez08] intro; [Chavarriaga10] intro |
| Feedback ErrP / FRN | Feedback that an outcome was bad | Negativity ~250 ms after feedback | [Ferrez08]; [Chavarriaga10] |
| **Interaction ErrP** | The *interface* misinterprets the user's command (our case: the MI/KG pipeline does the wrong thing) | +200, **−250/270**, **+320/330**, −430/450 ms at FCz | [Ferrez08]; [FerrezGraz08] |
| Observation/monitoring ErrP | Watching an autonomous agent err (BNCI 013-2015) | +200, **−260**, **+330** ms at FCz | [Chavarriaga10] |

SilentAssist is an interaction setting: the patient issues a command and the home does something wrong. The recommended dataset is an observation setting. [Chavarriaga10] reports that observation waveforms are "similar to … interaction error potential". This is a dataset shift to document, not a blocker.

### 1.2 Latency, topography, band (verified)
- **[Ferrez08]** (5 subjects, 64-channel Biosemi at 512 Hz, error rate 20%) gives the difference wave at FCz: "A first positive peak shows up after 200 ms … Negative and positive peaks show up about 250 and 320 ms … A second broader negative peak occurs about 450 ms." The focus is fronto-central, with the ACC/RCZ as the source.
  - Preprocessing: CAR, 1–10 Hz band-pass ("as ErrP are known to be a relatively slow cortical potential"), decimation from 512 to 64 Hz.
  - Features: a 150–650 ms window at FCz and Cz, giving 64 dimensions.
- **[FerrezGraz08]** (online MI + ErrP) reports Ne at 270 ms, Pe at 330 ms and the late negativity at 430 ms. It used a 150 ms window starting at 250 ms, at FCz and Cz.
- **[Chavarriaga10]** (the BNCI dataset) uses CAR and a 1–10 Hz band-pass. It reports "negative peak at 260 ms and two positive peaks at 200 ms and 330 ms", stable across sessions.
- **[Chavarriaga14]** (review) says features are low-passed "below 10 or 20 Hz", with samples "usually between 200 and 600 ms", at "fronto-central areas (e.g., FCz, Cz)".
- **[Iwane23]** used 1–10 Hz with a causal 4th-order Butterworth filter. ERN is at about 0.25 s and Pe at about 0.35 s. Amplitude grows and latency shortens with error magnitude.
- **[Keyl19]** reports control-group peak latencies at FCz of P1 181 ms, N1 254 ms and P2 347 ms, filtered 1–10 Hz.
- **Error-rate modulation.** Amplitude falls as errors become more frequent (smaller at 40–50% error rates than at 20%) [Ferrez08; Chavarriaga10]. Cross-session accuracy in [Chavarriaga10] drops from TNR/TPR 75.8/63.2% at p = 0.2 to 64.4/59.4% at p = 0.4. At SI accuracy (π ≈ 0.33) we should therefore expect weaker ErrPs.

### 1.3 Amplitudes, and whether −8.4 µV is plausible
Verified numbers:

| Measure | Value | Source |
|---|---|---|
| Control group, FCz, wN1 window mean (ErrP vs CorrP) | −1.55 vs −0.01 µV (difference ≈ −1.54 µV) | [Keyl19] |
| Control group, FCz, wP2 window mean | +2.79 vs −0.23 µV | [Keyl19] |
| **SCI group**, FCz, wN1 / wP2 | **−0.27 / +1.29 µV** (significantly smaller) | [Keyl19] |
| Largest first-negative peak across 11 public ErrP datasets (at Fz) | ≈ −4.06 µV (HRIcursor), −3.15 (Coadapt), −2.79 (TactileVT) | [Yasemin23] |
| Largest positive peak across the same datasets | ≈ +8.02 µV (Kaggle), +7.62 µV (Coadapt) | [Yasemin23] |
| Topography colour scale for the grand-average ErrP | ±5 µV | [Chavarriaga14] Fig. 2 |

**Verdict.**
- **As an averaged Ne at FCz:** −8.4 µV is about 2× the largest reported grand-average first negativity. That is physiologically implausible for healthy users and even less plausible for SCI or ALS users.
- **As the minimum of a single filtered trial in 200–350 ms:** −8.4 µV is plausible, because single trials are the ERP plus ongoing EEG. The size of 1–10 Hz background EEG at FCz in BNCI session 1 is **[UNVERIFIED]**. Measure the single-trial SD after download, and accept −8.4 µV if it falls inside the observed distribution of error-trial minima.
- **Proposal:**
  - The Scripted-mode synthetic epoch uses a literature-sized template: +1.5 µV at 200 ms, −4 µV at 260 ms, +6 µV at 340 ms, −3 µV at 450 ms. Add seeded 1–10 Hz noise, then pick the seed whose measured FCz minimum in 200–350 ms is −8.4 µV.
  - In Replay mode, the UI shows the *measured* value of the real epoch, not −8.4.
  - The UI label stays as in the README. `docs/errp.md` states that it is a single-trial value.

---

## 2. Detection methods and reported single-trial performance

| Method | Features / pipeline | Reported performance | Protocol | Source |
|---|---|---|---|---|
| Gaussian classifier (prototypes) | FCz+Cz, 1–10 Hz, 64 Hz, 150–650 ms | Error 79.2%, correct 83.5% (with a classifier from 3 months earlier) | Cross-day | [Ferrez08] |
| Same (online MI + ErrP) | FCz+Cz, 250–400 ms | Online correct 84.7%, error 78.8% | Online, 2 subjects | [FerrezGraz08] |
| Gaussian classifier, **BNCI 013-2015** | FCz/Cz chosen per subject, 1–10 Hz, 64 Hz | **Correct (TNR) 75.81%, error (TPR) 63.21%**, so BA ≈ 69.5% | **Train session 1 → test session 2** | [Chavarriaga10] |
| **sLDA + "Overlap" windowed means** (100 ms windows, 50 ms step) | 1–10 Hz, 4th-order Butterworth, BNCI window 0.2–0.7 s | **BNCI 77.14% BA**; Kaggle 66.00%; mean of 11 datasets 72.35% (best overall) | 10-fold CV, apparently within-session | [Yasemin23] |
| sLDA + FCz/Cz amplitudes | — | BNCI 67.86%, mean 66.96% | same | [Yasemin23] |
| sLDA + xDAWN | — | BNCI 64.42%, mean 69.05% | same | [Yasemin23] |
| sLDA + spatio-temporal interval means | 57 channels, intervals from r² peaks in 150–900 ms | Accuracy 89.1%, AUC 0.90 (classifier B); AUC 0.79 (classifier A) | Online speller | [Schmidt12] |
| LDA (PCA-reduced) | 8 fronto-central channels, 200–800 ms, 64 Hz | Online 72.5–74.3% | Online, 12 subjects | [Iturrate15] |
| CCA + amplitude/PSD/Riemannian tangent space → diagonal LDA | 16 channels, 1–10 Hz causal | **BA 89.16% (session 1 → session 2)** | Cross-session | [Iwane23] |
| xDAWN covariances + tangent space + elastic net (Kaggle winner) | 1–40 Hz, 1.3 s, 56 channels | Private LB AUC **0.84585** (no leak) / 0.87224 (leak); subject-wise CV 0.7696 | **Cross-subject** | [Barachant15] |
| Riemannian "super-trial" covariance + TS + LR | 100–600 ms | 78.2% vs 75.9% for a windowed-mean baseline | 10×10-fold within-subject | [Tang21] |
| EEGNet-8,2 (2,290 params on ERN) | 1–40 Hz, 128 Hz, 0–1.25 s, 56 channels | Within-subject: beats xDAWN+RG (p < 0.05). Cross-subject: xDAWN+RG beats all CNNs. Numbers only in figures **[UNVERIFIED exact AUC]** | 4-fold blockwise; 30-fold cross-subject | [Lawhern18] |

Takeaways:
1. On ErrPs, method choice matters less than paradigm and signal quality. [Yasemin23]: "accuracy depends strongly on the user task and on signal quality". [Chavarriaga14]: methods "seem to obtain comparable results", typically 70–80%.
2. sLDA is the robust default [Yasemin23; Blankertz11]. With Ledoit–Wolf shrinkage (`sklearn LinearDiscriminantAnalysis(solver='lsqr', shrinkage='auto')`) it is closed-form. Its browser forward pass is one dot product, so JS↔Python parity at 1e-4 is trivial.
3. Riemannian methods are stronger cross-subject [Barachant15; Lawhern18]. A JS port would need symmetric eigendecomposition and matrix logarithm. That is feasible, but parity is harder.
4. EEGNet gains are mainly within-subject, with large training sets. With about 100 errors per session per subject, it is likely to overfit **[UNVERIFIED for BNCI]**.

---

## 3. ErrP for automatic correction and BCI adaptation

| Study | Use of ErrP | Quantitative result | Source |
|---|---|---|---|
| Ferrez & Millán 2008 (Graz) | **Online MI + ErrP. A detected ErrP cancels the wrong cursor move.** The decision is ready about 400 ms after feedback ("At t = 1.4 s the system detects ErrP and cancels the wrong movement") | MI error rate about 30% → **7%** online; rejection rate 30–35%; bit rate ×3 | [FerrezGraz08] |
| Chavarriaga & Millán 2010 | ErrP as a negative reward. The policy update reduces P(action \| target), with a learning rate scaled by the policy's binary entropy | Optimal strategy learned in "much less than 50 trials" | [Chavarriaga10] |
| Iturrate et al. 2015 | ErrP as ±1 reward for Q-learning (γ = 0.4, α = 0.1, ε-greedy 100% → 20%); 3 neuroprostheses | Online decoding 72.5–74.3%; about 12.4 targets per run vs about 2.3 for a random policy | [Iturrate15] |
| **Perrin et al. 2012** | P300 speller. **When an ErrP is detected, the system re-decides using the second-best guess of the probabilistic classifier** (16 subjects) | Some users still preferred the speller without correction [Chavarriaga14 §8] | [Perrin12] |
| Schmidt et al. 2012 | ErrP veto; the bias was set so **false alarms ≤ 5%** | Spelling speed **+49.0%**; ErrP AUC 0.90 | [Schmidt12] |
| Spüler et al. 2012 (Clin Neurophysiol) | Online ErrP correction in a P300 BCI, including users with severe motor impairment | +0.37 bits/trial (impaired users) vs +0.73 bits/trial (able-bodied), per [Chavarriaga14] | [Spuler12a] |
| Spüler et al. 2012 (PLoS ONE) | **ErrP-labelled online classifier adaptation** (c-VEP) | 96% accuracy, 144 bit/min | [Spuler12b] |
| Llera et al. 2011 | Interaction ErrP as a reinforcement signal to adapt classifier parameters; sensitivity to ErrP misclassification analysed | Qualitative (MEG and simulation) | [Llera11] |
| Lopes-Dias et al. 2019 | Asynchronous ErrP during continuous robot control | Online TPR 70%, TNR 86.8% | [LopesDias19] |
| Lopes-Dias et al. 2021 | Generic (no-calibration) ErrP classifier tested on **SCI** users | Above chance in 11/16; 4 of 8 SCI users had no clear ErrP | [LopesDias21] |
| Artusi 2011; Kreilinger 2009; Dal Seno 2010 | Correction gains | Error 26% → 14% (20% discarded); MI accuracy 70 → 80%; "little or no improvement" | as cited in [Chavarriaga14] |

**Lessons for SilentAssist:**
1. The false-positive rate dominates usefulness [Chavarriaga14 §5, §8]. This is why [Schmidt12] capped false alarms at 5%.
2. Second-best re-decision [Perrin12] maps exactly onto "roll back → offer Bedside Lamp".
3. ErrP-driven learning [Chavarriaga10; Iturrate15] "may mask these false detections" better than hard correction [Chavarriaga14 §8]. That argues for a *soft, decaying* KG penalty (§10).

---

## 4. Applicability notes
- **Time-locking.** ErrPs are locked to the *perceived* outcome. The UI must timestamp the frame on which the device state change becomes visible: the `OFF ➔ ON` animation in Screen 5. Ambiguous or slow animations will smear the ErrP.
- **Decision latency.** The window ends around 650–700 ms [Ferrez08; Yasemin23]. "Observing post-action EEG…" therefore needs about 0.8–1.0 s before the rollback decision.
- **Transfer.** Cursor and monitoring ErrPs differ from smart-home feedback ErrPs. The task-independence results in [Iturrate15] and cross-paradigm transfer work (Kim & Kirchner 2016 **[UNVERIFIED citation details]**) suggest partial transfer, with lower accuracy to be expected.

---

## 5. Public ErrP datasets (verified)

### 5.1 Comparison
| Dataset | Paradigm | Subjects × sessions | Channels / fs | Error rate | Size | Licence / access | MOABB | Verdict |
|---|---|---|---|---|---|---|---|---|
| **BNCI 013-2015 "Monitoring error-related potentials"** (Chavarriaga & Millán) | Observation, discrete cursor steps | **6 × 2** sessions, 51/50/54/211/628/643 days apart | 64 Biosemi, **512 Hz**, full DC | **≈0.20** | **3,416,997,751 B = 3.42 GB** (12 files, 240–385 MB each) | **CC BY-NC-ND 4.0**; open, no login | **Yes, `BNCI2015_013`, added in 1.2.0** | **Recommended** |
| Kaggle "BCI Challenge @ NER 2015" (`inria-bci-challenge`) | Interaction, P300-speller feedback; data credited to Perrin et al. 2012 | 26 (16 train + 10 test), 5 sessions **[UNVERIFIED session count]**; 340 feedbacks per subject | 56 EEG + EOG; recorded at 600 Hz, distributed at 200 Hz | ≈0.23 (3.4:1) | **[UNVERIFIED]** | **Kaggle login + rules acceptance required. Violates the no-login rule.** Licence terms **[UNVERIFIED]** | Not found in MOABB **[UNVERIFIED, partial listing]** | Reject as primary |
| Iwane et al. 2023 (EPFL) | Execution error during joystick cursor control (rotation 3–60°) | 16 × 3 sessions | 16 EEG + 3 EOG, 512 Hz | 30% of trials | **8.0 GB** (`data.zip`) | **CC BY 4.0**, open | No | Backup if NC-ND is unacceptable; continuous paradigm, so less like ours |
| Kueper et al. 2023 IntEr-HRI (orthosis errors) | Interaction with an assistive active orthosis | 8 | BrainVision **[UNVERIFIED channels/fs]** | — | 1.8 GB (EEG.zip, v1) | **CC BY 4.0**, open | No | Interesting assistive context; errors are asynchronous during movement |
| Spüler & Niethammer 2015 | Continuous feedback, execution vs outcome errors | 10 | — | — | — | "will be made publicly available on the website of the first author", but no URL found **[UNVERIFIED availability]** | No | Not usable |
| Ehrlich & Cheng 2019 (`dataset-ErrP-HRI`, GitHub) | Robot-action observation | — | — | — | — | Licence not shown **[UNVERIFIED]** | No | Not assessed |

### 5.2 BNCI 013-2015: exact details (from the official description PDF and MOABB source)
- **URLs.**
  - Listing: `http://bnci-horizon-2020.eu/database/data-sets` (entry 22).
  - Description: `https://bnci-horizon-2020.eu/database/data-sets/013-2015/description.pdf`, which redirects to `https://lampx.tugraz.at/~bci/database/013-2015/description.pdf`.
  - Files: `https://bnci-horizon-2020.eu/database/data-sets/013-2015/SubjectNN_sK.mat` (NN = 01–06, K = 1, 2), which redirect to `https://lampx.tugraz.at/~bci/database/013-2015/…`.
- **Sizes (HTTP HEAD, Content-Length).**

  | Subject | s1 (B) | s2 (B) | Total |
  |---|---|---|---|
  | S01 | 269,644,558 | 261,040,751 | 530.7 MB |
  | S02 | 265,085,116 | 259,522,116 | 524.6 MB |
  | S03 | 240,489,597 | 255,208,946 | 495.7 MB |
  | S04 | 362,356,809 | 299,789,088 | 662.1 MB |
  | S05 | 256,008,782 | 280,920,562 | 536.9 MB |
  | S06 | 281,694,891 | 385,236,535 | 666.9 MB |
  | **All** | | | **3.417 GB** |

- **Protocol.**
  - 20 positions on screen; the cursor moves one step about every 2000 ms.
  - "Probability of about 0.20 for the cursor to move in the wrong direction".
  - "10 blocks of 3 min each (approximately 50 trials per block)". The paper says about 64 trials per block, so expect roughly 500–640 trials and about 100–130 errors per session per subject.
  - The subject has no control over the cursor; this is a monitoring task.
- **Format.**
  - MATLAB file with a variable `run` holding 10 cells. Each cell has `run{i}.eeg` (n_samples × n_channels) and `run{i}.header`.
  - Header fields: `.SampleRate`, `.Label`, `.EVENT.POS`, `.EVENT.TYP`.
  - Triggers are bit-coded. **Events 5 and 10 are correct; 6 and 9 are errors.** The `.mat` version (v5 vs v7.3/HDF5) is **[UNVERIFIED]**.
- **MOABB loader (read from source, `moabb/datasets/bnci/base.py::_convert_run_epfl` and `bnci_2015.py`).**
  - Trigger 6/9 maps to code **2 ("error")** and 5/10 to code **1 ("correct")**.
  - The class declares `events={"Target": 1, "NonTarget": 2}`. **So in MOABB, "Target" means correct and "NonTarget" means error.** This is counter-intuitive.
  - The MOABB docs summary lists "809 NonTarget / 235 Target", which would contradict that mapping. **First data check after download: errors must be the ~20% minority class.**
  - `sessions_per_subject=20`. Each of the 10 blocks × 2 files becomes its own "session" (presumably indices 0–9 = s1 and 10–19 = s2 **[UNVERIFIED order]**). For cross-session evaluation we must regroup them.
  - Default `interval=[0, 0.6]` is too short for Pe and baseline, so epoch ourselves with MNE.
  - The last header label is dropped (`Label[:-1]`), µV are converted to V, and no filtering is applied.
- **MOABB version.** PyPI `moabb` 1.7.2 (2026-09-14) requires Python ≥ 3.11 and lists 3.14, so it is compatible with our system Python 3.14.
- **Cache location.** MOABB/MNE cache to `~/mne_data` by default. **We must point `MNE_DATA` (and MOABB's download path) at `research/data/`** to obey CLAUDE.md.

### 5.3 Recommendation
**BNCI 013-2015 via MOABB `BNCI2015_013`**, for these reasons:
- It is the closest match to our loop: a discrete action with a binary correct/wrong outcome, an error rate of 0.20 against our MI error of about 0.22, and the FCz/Cz focus.
- It has **two sessions weeks to years apart**, so we can run a cross-session evaluation that mirrors our SFE-GAT SD protocol (session 1 → session 2).
- It has two published baselines on the same data: [Chavarriaga10] cross-session and [Yasemin23] sLDA.
- No login is needed, and the MOABB loader exists.

Costs: only 6 subjects; a 3.42 GB download; NC-ND licence; monitoring rather than interaction. **Fallback:** Iwane 2023 (CC BY 4.0, 8 GB, 16 subjects, 3 sessions) if the user or supervisor rules NC-ND unacceptable for the replay export.

---

## 6. Proposed preprocessing and features (for the ErrP-design debate)
1. **Reference.** CAR over all 64 channels, as in [Ferrez08] and [Chavarriaga10]. See §11 for the browser implication.
2. **Filter.** 1–10 Hz, 4th-order Butterworth, **causal** (`sosfilt`) on continuous data. This makes it online-valid like [Iwane23], and the same SOS coefficients ship to JS.
   - Zero-phase `filtfilt` would leak post-stimulus information backwards in time. It is acceptable offline but not online.
3. **Epoch.** −0.2 to +0.8 s around the cursor-move event (events 5/6/9/10).
4. **Baseline.** Subtract the mean of −0.2 to 0 s.
5. **Decimate.** 512 → 64 Hz (keep 1 sample in 8, after the 10 Hz low-pass), as in [Ferrez08].
6. **Features.** Windowed means over 100 ms windows with a 50 ms step in 0.2–0.7 s, giving 9 windows [Yasemin23 "Overlap"]. Use channels Fz, FC1, FCz, FC2, C1, Cz, C2, CPz (8 channels, as in [Iturrate15]), for **72 features**.
7. **Classifier.** sLDA (Ledoit–Wolf) [Blankertz11]. Then Platt calibration (§8) and a prior-shift correction to the deployment π [Saerens02].
8. **Comparators, Python only.**
   - (a) FCz+Cz decimated amplitudes + sLDA, as a [Ferrez08]-style baseline.
   - (b) `XdawnCovariances(nfilter=4)` + `TangentSpace` + logistic regression (pyRiemann 0.12 is a pure-Python wheel).
   - (c) The MDM variant.
   - (d) EEGNet-8,2 (optional, needs PyTorch).
9. **Artifact policy.** None, mirroring the "no artifact removal" rule for SFE-GAT. Report EOG correlation as a sanity check, as [Ferrez08] did.

---

## 7. Evaluation protocol and metrics
- **Primary, cross-session within-subject.** Train on all of session 1 (10 blocks) and test on session 2. Session 2 is never used for any choice, matching [Chavarriaga10] and our SFE-GAT rule.
- **Model selection inside session 1.** Use **leave-one-block-out CV** (10 folds). Random trial-level k-fold leaks slow drifts between temporally adjacent trials and inflates accuracy. [Yasemin23] used 10-fold, so their 77.14% is probably optimistic for us **[UNVERIFIED whether their folds were blocked]**.
  - The out-of-fold session-1 scores train the Platt calibrator and fix the window and channel choices.
- **Secondary.** Within-session blocked 10-fold, for comparability with [Yasemin23]. Also leave-one-subject-out (6 folds) for a calibration-free scenario, comparable in spirit to [LopesDias21].
- **Metrics, per subject plus mean ± SD:**
  - **balanced accuracy** = (TPR + TNR)/2;
  - **TPR** (error-detection sensitivity) and **TNR** (specificity) at the cost-derived threshold *and* at 0.5;
  - **ROC AUC**;
  - calibration: **Brier score**, **ECE** (10 equal-mass bins), log-loss;
  - **expected cost per executed action** at π_deploy (§9) and **LR+ = TPR/(1−TNR)**.
- **Chance level.** Use a label-permutation test (1000 permutations, run within the training session's CV) rather than 50%, because classes are imbalanced and n is small [Combrisson15 **[UNVERIFIED citation details]**].
- **Reference numbers to sit next to ours:**
  - [Chavarriaga10] cross-session: TNR 75.81 / TPR 63.21, BA ≈ 69.5%.
  - [Yasemin23] sLDA-Overlap: 77.14% BA (10-fold).
  - Success band (proposal for debate): cross-session BA within ±5 pp of 69.5%.

---

## 8. Posterior calibration
- **Why.** LDA's Gaussian posterior is miscalibrated under shrinkage and class imbalance. The cost threshold (§9) and the Bayesian KG update (§10) both need a *calibrated* P(err | x).
- **Platt (sigmoid on the LDA score)** [Platt99]. It has 2 parameters and needs little data. Fit it on session-1 **out-of-fold** scores (leave-one-block-out) and apply it to session 2.
- **Isotonic regression** [Zadrozny02]. It is non-parametric and tends to overfit with fewer than about 1000 calibration points [NiculescuMizil05]. With about 100–130 errors per session, **prefer Platt**. Report isotonic as a sensitivity check.
- **Prior shift.** The training prior is π_tr ≈ 0.20 (measured on session 1). The deployment prior π_dep comes from the executed-action error rate. Apply [Saerens02]:
  `p' = (π_dep/π_tr)·p / [ (π_dep/π_tr)·p + ((1−π_dep)/(1−π_tr))·(1−p) ]`.
- **Export.** In JS, calibration is `σ(A·s + B)` followed by the prior-shift formula. That is 4 scalars in `SA.config` / `errp-model.js`.

---

## 9. Cost-sensitive rollback threshold

### 9.1 Model
Each executed action has an error with prior π. The detector sees x, gives a calibrated q = P(err | x) at π, and we roll back iff q > t.

Cost matrix:

| | Rolled back | Not rolled back |
|---|---|---|
| Action was wrong (error) | C_TP (cost of recovery after a correct rollback, e.g. one "Retry" token) | **C_FN = C_miss** (wrong home state persists) |
| Action was right | **C_FP = C_false** (correct action undone, must be redone) | C_TN = 0 |

Expected cost at an operating point:

`E[C] = π·[TPR·C_TP + (1−TPR)·C_FN] + (1−π)·[(1−TNR)·C_FP + TNR·C_TN]`

With C_TP = C_TN = 0 this reduces to the brief's form: `C_miss·π·(1−TPR) + C_false·(1−π)·(1−TNR)`.

Bayes-optimal rule [Elkan01]: roll back iff
**q > t\* = (C_FP − C_TN) / [(C_FP − C_TN) + (C_FN − C_TP)]**.

Equivalently, choose the ROC point where the slope equals (1−π)(C_FP − C_TN) / [π(C_FN − C_TP)].

ErrP rollback beats "never roll back" only if **LR+ = TPR/(1−TNR) > ((1−π)/π) · (C_FP − C_TN)/(C_FN − C_TP)**.

### 9.2 Plausible priors on π
- SFE-GAT SD accuracy 0.7770 gives π_MI = 0.223. SI accuracy 0.6659 gives π_MI = 0.334 (paper Table 3).
- But **π for ErrP is the error rate of executed actions.** It combines MI errors that passed the policy gate with KG resolution errors. With the README canonical MI 0.92 and an illustrative entity probability of 0.80, π = 1 − 0.92 × 0.80 = 0.264.
- If the policy only EXECUTES at high confidence, π could be about 0.05–0.10. Here is the break-even LR+ (rows are π; columns are cost scenarios C_FN, C_FP, C_TP):

| π | (1,1,0) | (2,1,0) | (8,4,1) | (20,4,1) |
|---|---|---|---|---|
| 0.05 | 19.0 | 9.5 | 10.86 | 4.0 |
| 0.10 | 9.0 | 4.5 | 5.14 | 1.89 |
| 0.15 | 5.67 | 2.83 | 3.24 | 1.19 |
| **0.223** | 3.48 | 1.74 | **1.99** | 0.73 |
| 0.334 | 1.99 | 1.0 | 1.14 | 0.42 |

LR+ from the literature:
- [Chavarriaga10] cross-session: **2.61**.
- [FerrezGraz08] online: 0.788/0.153 = **5.15**.
- A symmetric 77% BA decoder: 3.37.
- [Schmidt12]-style with false alarms ≤ 5% and TPR 0.5 (TPR assumed): 10.

### 9.3 Proposed costs, in MI-token equivalents, from the README flow
- **C_FP = 4.** A correct "Turn On Ceiling" was rolled back. The patient must re-navigate: Return to Home or Back, Lights, the fixture, Turn On. That is about 3–4 tokens, ignoring decoding errors.
- **C_FN = 8.** The wrong light stays ON. The patient must notice, go Back, NEXT to the wrong fixture, Select, Turn Off, and then still do the intended action. That is about 7–8 tokens, plus environmental discomfort.
- **C_TP = 1.** After a correct rollback, the [Perrin12]-style alternative "Bedside Lamp [Retry]" costs one Both-Feet token.
- **C_TN = 0.**
- **High-risk tier** (thermal, AC < 18 °C or > 30 °C): C_FN = 20, a safety-weighted value for debate. These actions already pass caregiver approval, so ErrP is a second safeguard there.

These give **t\* = 4/(4 + 8 − 1) = 0.364** for normal actions and t\* = 4/23 = 0.174 for the high-risk tier.

### 9.4 Worked example (computed with stdlib Python; binormal ROC, equal variance, d′ = √2·Φ⁻¹(AUC))
**At fixed published operating points, π = 0.223, costs (8, 4, 1).**
- **No ErrP:** E[C] = 0.223 × 8 = **1.784** tokens per action.
- **Always roll back:** 3.331.

| Decoder | TPR / TNR | PPV = P(err \| rollback) | E[C] | Δ vs none |
|---|---|---|---|---|
| [Chavarriaga10] cross-session | 0.632 / 0.758 | 0.429 | 1.549 | −13% |
| Symmetric BA 0.77 | 0.771 / 0.771 | 0.492 | 1.290 | −28% |
| [FerrezGraz08] online | 0.788 / 0.847 | 0.596 | 1.029 | −42% |

With **equal costs (1, 1, 0)**, the [Chavarriaga10] decoder gives E[C] = 0.270 against 0.223 with no ErrP. That is **+21%, so ErrP makes things worse.**

Note the PPV: even a decent decoder at π = 0.22 is right only about half the time when it fires. This is why rollback should be cheap to reverse ([Retry] / [Return to Home]), and why the KG penalty must be soft.

**Cost-optimal threshold on a binormal ROC with AUC 0.78 (d′ = 1.092), π = 0.223, costs (8, 4, 1).**

| Threshold rule | TPR / TNR | E[C] |
|---|---|---|
| **Cost-optimal, q > t\* = 0.364** | **0.466 / 0.880** | **1.428 (−20% vs none)** |
| Naive q > 0.5 | 0.275 / 0.954 | 1.496 |
| Equal-error point (maximises BA) | 0.707 / 0.707 | 1.589 |

So **maximising balanced accuracy is the wrong operating point** for rollback at this prior. The cost-optimal point is specificity-heavy, which matches the ≤ 5% false-alarm design in [Schmidt12].

At SI accuracy (π = 0.334, same costs, AUC 0.78) the optimum is TPR 0.665 / TNR 0.747 and E[C] = 1.791 against 2.672 (−33%). For the high-risk tier (20, 4, 1) at π = 0.223 the optimum is TPR 0.797 / TNR 0.603, giving −48%.

**Implementation.**
- `SA.config.errp.costs = {fn: 8, fp: 4, tp: 1, tn: 0}` per risk tier, with `SA.config.errp.prior`.
- The threshold is *computed* as t\*, not hard-coded.
- Python reports E[C] on session 2 at t\*, with π reweighted to π_dep.

---

## 10. Closing the loop with the KG: Bayesian down-weighting

### 10.1 One-shot update within the episode
Hypotheses are pairs H = (verb v, entity e). The prior is P(v)·P(e | context), where P(v) is the calibrated MI softmax and P(e | context) is the resolver's normalised score. The executed hypothesis is h\* = (v\*, e\*). An ErrP observation x has likelihood ratio Λ(x) = p(x | err)/p(x | ok).

From the calibrated detector, recover the ratio with the training prior: Λ = [q/(1−q)]·[(1−π_tr)/π_tr]. Then:

`P(H | x) ∝ P(H) · (Λ if H ≠ h* else 1)`

**Worked example** (README canonical case: MI "Turn On" 0.92; illustrative entity prior Ceiling 0.80, Bedside 0.15, Living 0.05; π = 0.264):

| Evidence | P(err \| x) | P(Ceiling) | P(Bedside) | P(Living) |
|---|---|---|---|---|
| Prior | 0.264 | 0.800 | 0.150 | 0.050 |
| Hard ErrP, [Chavarriaga10] decoder (LR+ 2.61) | 0.484 | 0.633 | 0.275 | 0.092 |
| Hard ErrP, sLDA BA 77% (LR+ 3.37) | 0.548 | 0.585 | 0.311 | 0.104 |
| Soft, q = 0.80 at π_tr = 0.2 (Λ = 16) | 0.852 | 0.355 | 0.484 | 0.161 |
| Soft, q = 0.95 (Λ = 76) | 0.965 | 0.269 | 0.548 | 0.183 |

(Entity marginals include the "wrong verb, right entity" hypotheses.)

Observations:
1. A single hard ErrP from a realistic decoder **does not** push Bedside above Ceiling. So "offer Bedside Lamp" should not depend on flipping the ranking. Use the **second-best rule** [Perrin12]: after a rollback, condition on "h\* was wrong" and offer argmax over H ≠ h\*. Here that is (Turn On, Bedside) with 0.138/0.264 = **52%** of the error mass. The next is (other verb, Ceiling) at 24%, which the UI could surface as "Did you mean a different action?".
2. ErrP evidence is *not attributable*: it says "something was wrong", not whether the verb (MI) or the entity (KG) was wrong. High MI confidence pushes the blame onto the entity. With MI at 0.60, much of the blame would go to the verb.

### 10.2 Persistent penalty (what the KG stores)
- Store an `:ErrPFeedback` record for (user, context/room, verb, entity, timestamp, q).
- The resolver adds a tempered log-likelihood-ratio term: `score_e ← score_e · (1/Λ̂)^γ · decay`, with Λ̂ = the LR+ at the operating threshold.
  - **Temper with γ ≈ 0.5**, because of false-positive ErrPs and the attribution problem.
  - **Decay** with a half-life of about N = 20 interactions in that context.
  - **Floor the multiplier at 0.5**, so false alarms can never lock a device out.
- With LR+ = 3.37 and γ = 0.5 the multiplier is 0.545. On the KG engineer's raw score 0.94 that gives about 0.51, before decay.
- **Disconfirmation:**
  - If the patient then re-selects the rolled-back entity and no ErrP follows, cancel the penalty.
  - If they accept the alternative (Retry → Bedside, no ErrP), it becomes a confirmed label. Strengthen the penalty to γ = 1, and the epoch can serve as an adaptation sample [Spuler12b; Llera11].
- This mirrors the entropy-scaled policy update in [Chavarriaga10] and the reward-based learning in [Iturrate15]. Learning-style use "may mask these false detections" [Chavarriaga14].

---

## 11. Browser / export implications
- **Detector in JS.**
  - SOS causal filter, CAR, baseline, decimation, 72 windowed means, dot product, Platt, then the prior shift. About 100 lines.
  - `errp-model.js` holds the SOS coefficients, channel list, windows, the w vector (72), b, A, B, π_tr. It is under 5 KB.
  - The parity test is JS vs Python on exported epochs at 1e-4. Float64 throughout, because causal IIR filters accumulate error. Keep Python and JS in float64.
- **Filter warm-up.** A causal 1 Hz high-pass needs warm-up, so replay segments should be **raw −2.0 to +1.0 s** around the event, with the filter run from the segment start in both Python (for the parity test) and JS.
- **CAR needs all 64 channels.** Options to debate:
  - (a) Export all 64 channels raw at 512 Hz: 3 s × 512 × 64 × 4 B ≈ 393 KB per epoch, about 524 KB in base64. That allows about 5–6 epochs within 3 MB.
  - (b) Export only the 8 feature channels plus a precomputed CAR signal. The CAR channel is a derivative, which hits the ND issue below.
  - (c) Train with a reference computable from the exported subset (e.g. the 8-channel average, or linked TP9/TP10 **[UNVERIFIED that these exist in the BNCI label set]**). Roughly 8 channels × 3 s × 512 × 4 B = 49 KB per epoch, so 20 epochs ≈ 1.3 MB in base64.
  - **I recommend (c)** if accuracy drops by less than about 2 pp against CAR in Python; otherwise (a).
- **Licence (CC BY-NC-ND 4.0).**
  - The licence allows sharing *verbatim* copies or excerpts non-commercially with attribution. It prohibits sharing *adapted* material.
  - Excerpting raw samples (channel and time subsets) is arguably reproduction, not adaptation. Exporting filtered, re-referenced or resampled data is arguably adaptation.
  - So export **raw µV excerpts** and do all processing in JS. This also makes the in-browser detection genuine.
  - While the POC stays local (CLAUDE.md) there is no sharing at all. But the FYP submission or viva handout may count as sharing. **Not legal advice: needs a user or supervisor decision.**
  - Trained model weights are a derived model, not the dataset. The licence status of distributing them is **[UNVERIFIED]**.
- **Honesty labels.**
  - The UI must say "Replayed BNCI 013-2015 epoch (subject N, session 2, trial k, true label: error/correct)", with the CC BY-NC-ND attribution.
  - Scripted mode says "Synthetic ErrP epoch".
  - No clinical claims, and note that SCI/ALS amplitudes are reduced [Keyl19].
- **[Simulate ErrP]** picks a held-out session-2 error epoch, or synthesises one, and runs the detector. **Fail loudly if the detector says "correct"**: show the probability, never flip a flag. To keep the demo deterministic, the export script should pre-select replay epochs that the session-1-trained model classifies correctly (a true positive and a true negative). Document that selection openly, alongside the honest session-2 metrics.

---

## 11b. Verification checks to run right after download (cheap, must pass before any modelling)
1. Error proportion per session is about 20% (it identifies which MOABB label is the error).
2. Per-session trial counts are about 500–640.
3. MOABB session indices 0–9 come from `_s1` and 10–19 from `_s2` (check against the file order and the measurement date).
4. The grand-average difference wave at FCz reproduces Ne at about 260 ms and Pe at about 330 ms [Chavarriaga10]. Record the peak µV, which settles §1.3 empirically.
5. HEOG correlation with FCz is low [Chavarriaga10].

---

## 12. Decisions the debates must settle

1. **Dataset.**
   - Options: (A) BNCI 013-2015 via MOABB; (B) Kaggle NER 2015; (C) Iwane 2023 (CC BY); (D) Kueper IntEr-HRI.
   - **Recommendation: A.** It is the closest paradigm, has 2 sessions for cross-session evaluation, two published baselines, no login, and a 3.42 GB download. (B) violates the no-login rule. (C) is the fallback if NC-ND blocks the export.
   - Evidence: §5.
2. **Features and classifier for the browser.**
   - Options: (A) Overlap windowed means + sLDA; (B) xDAWN+TS+LR; (C) EEGNet.
   - **Recommendation: A in the browser. B and C as Python comparators, with a pre-registered rule:** switch only if cross-session BA is ≥ 3 pp better on at least 4 of 6 subjects.
   - Evidence: [Yasemin23] (sLDA most robust; 77.14% BNCI), the parity cost, and the small data size.
3. **Reference scheme.**
   - Options: (A) CAR-64; (B) an 8-channel subset average; (C) mastoid-like electrodes.
   - **Recommendation:** B if it costs less than 2 pp against A in Python, since it keeps exports small and verbatim.
4. **Epoch window and filter.**
   - **Recommendation:** causal 4th-order Butterworth 1–10 Hz; window 0.2–0.7 s; baseline −0.2 to 0 s; 64 Hz.
   - Evidence: [Ferrez08; Yasemin23; Iwane23].
5. **Evaluation protocol.**
   - **Recommendation:** primary is cross-session S1 → S2. Selection uses leave-one-block-out inside S1. Secondary is blocked within-session CV and LOSO. Report BA, TPR, TNR, AUC, Brier, ECE, E[C] and LR+.
   - Success band: BA ≥ 64.5% (≥ [Chavarriaga10] − 5 pp).
6. **Calibration.** Platt vs isotonic. **Recommendation: Platt plus the Saerens prior shift**, because of the small number of error trials [NiculescuMizil05].
7. **Cost matrix and threshold.**
   - **Recommendation:** costs (C_FN 8, C_FP 4, C_TP 1, C_TN 0), giving t\* = 0.364. The high-risk tier uses C_FN = 20, giving t\* = 0.174.
   - Compute t\* in code from `SA.config`. Never default to 0.5; never use the BA-maximising point.
   - Evidence: §9.4 and [Schmidt12].
8. **Deployment prior π.**
   - Options: (A) 1 − SD accuracy = 0.223; (B) the measured executed-action error rate after policy gating; (C) 0.264 from the canonical MI × KG.
   - **Recommendation: B where measurable** (from replay or simulation). Otherwise A, with a sensitivity table.
   - **Warning:** if π < about 0.12 under the proposed costs, ErrP rollback likely does more harm than good (§9.2), and the system should switch to "flag only, no auto-rollback".
9. **KG penalty.**
   - Options: (A) none; (B) hard exclusion of the rolled-back entity; (C) Bayesian LR update with tempering, decay and a floor.
   - **Recommendation: C for persistence, plus the second-best rule for the immediate alternative.** γ = 0.5, half-life 20 interactions, floor multiplier 0.5.
   - Evidence: §10, [Perrin12; Chavarriaga10; Chavarriaga14 §8].
10. **Meaning of −8.4 µV.** **Recommendation:** a single-trial FCz minimum in 200–350 ms of the 1–10 Hz signal. In the synthetic template it is literature-sized; in Replay it is measured. Document this in `docs/errp.md`. Evidence: §1.3.
11. **Repeated ErrP after Retry.** **Recommendation:** at most one automatic alternative per episode. A second ErrP returns the patient to Home and logs a caregiver-visible event, with no rollback loop.
12. **Replay epoch selection.** **Recommendation:** pre-select correctly classified held-out epochs for the deterministic demo. Disclose this, and also ship one misclassified epoch, visible in the harness, for honesty.

---

## 13. Open questions for the user
1. Is **CC BY-NC-ND 4.0** acceptable for an FYP whose POC might be handed to the panel or university, given that we embed raw excerpts and a trained model? If not, should we use Iwane 2023 (CC BY 4.0, 8.0 GB) instead?
2. Do you agree to rule out Kaggle NER 2015 because it needs a login? Or would you download it yourself, manually, outside the agents?
3. Do you accept the token-equivalent cost values (C_FN 8, C_FP 4, C_TP 1; high-risk C_FN 20)? Do you or your supervisor have patient-centred preferences, such as "never undo a correct action"?
4. If ErrP turns out harmful at the measured π, should the system degrade to "flag only, ask to confirm" rather than auto-rollback? The README mandates automatic rollback in the demo path. I propose keeping that path, but disclosing it in the docs.
5. Is EEGNet worth installing PyTorch for on the ErrP track (it is needed anyway for SFE-GAT), and running about 1 h of CPU training as a comparator?
6. Should the brief's SCI/ALS amplitude caveat ([Keyl19]: wN1 −0.27 µV in SCI) appear in the UI's honesty label, or only in the docs?

## 14. Things requiring user approval
| Item | Size / time | Notes |
|---|---|---|
| Create `research/.venv` (shared with Workstream A) | — | Python 3.14.7; MOABB 1.7.2 supports 3.14 |
| `pip install mne moabb scikit-learn scipy numpy pyriemann pyyaml pytest` | ≈ 150–300 MB installed **[UNVERIFIED estimate]** | pyRiemann 0.12 is a pure-Python wheel; the rest are standard wheels |
| (Optional) `torch` (CPU) for EEGNet | ≈ 200–800 MB **[UNVERIFIED estimate]** | Shared with SFE-GAT |
| **Download BNCI 013-2015, all 6 subjects** | **3.42 GB** (12 files; per-subject 0.50–0.67 GB, §5.2) | Est. 5–25 min at 20–100 Mbit/s. Set `MNE_DATA=research/data/`. A MOABB/MNE cache or conversion may need an extra 3–7 GB of disk **[UNVERIFIED]** |
| Minimal alternative: subjects 1–2 only | 1.06 GB | For pipeline bring-up; not enough for honest evaluation |
| Fallback download: Iwane 2023 `data.zip` | 8.0 GB | Only if NC-ND is rejected |
| ErrP sLDA runs (6 subjects × cross-session + 10-fold + LOSO, Platt, permutation test 1000×) | ≈ 5–15 min CPU **[estimate]** | Below the 15-min approval threshold, but listed for transparency |
| xDAWN+TS comparator | ≈ 5–10 min CPU **[estimate]** | — |
| EEGNet comparator (cross-session only, 6 subjects × about 300 epochs) | **≈ 1 h on 8 CPU cores [UNVERIFIED estimate]** | Needs approval (> 15 min) |

---

## 15. References
- **[Barachant15]** A. Barachant, R. Cycon. Winning solution, BCI Challenge @ NER 2015 (code and README with LB/CV AUCs; GPL-3.0). https://github.com/alexandrebarachant/bci-challenge-ner-2015
- **[BarachantCongedo14]** A. Barachant, M. Congedo. "A Plug&Play P300 BCI Using Information Geometry." arXiv:1409.0107 (2014). https://arxiv.org/abs/1409.0107
- **[BNCI-list]** BNCI Horizon 2020 database, data sets (entry 22 "Monitoring error-related potentials (013-2015)", licence CC BY-NC-ND 4.0). http://bnci-horizon-2020.eu/database/data-sets
- **[BNCI-desc]** R. Chavarriaga, J. d. R. Millán. "Monitoring Error-related potentials", dataset description PDF (2015). https://lampx.tugraz.at/~bci/database/013-2015/description.pdf
- **[Blankertz11]** B. Blankertz, S. Lemm, M. Treder, S. Haufe, K.-R. Müller. "Single-trial analysis and classification of ERP components — a tutorial." NeuroImage 56(2):814–825 (2011). doi:10.1016/j.neuroimage.2010.06.048 **[DOI not re-verified this session]**
- **[Chavarriaga10]** R. Chavarriaga, J. d. R. Millán. "Learning from EEG error-related potentials in noninvasive brain-computer interfaces." IEEE TNSRE 18(4):381–388 (2010). doi:10.1109/TNSRE.2010.2053387. Full text: https://infoscience.epfl.ch/record/149292
- **[Chavarriaga14]** R. Chavarriaga, A. Sobolewski, J. d. R. Millán. "Errare machinale est: the use of error-related potentials in brain-machine interfaces." Front. Neurosci. 8:208 (2014). https://www.frontiersin.org/articles/10.3389/fnins.2014.00208/full
- **[Combrisson15]** E. Combrisson, K. Jerbi. "Exceeding chance level by chance: the caveat of theoretical chance levels in brain signal classification and statistical assessment of decoding accuracy." J. Neurosci. Methods 250:126–136 (2015). **[UNVERIFIED this session]**
- **[Elkan01]** C. Elkan. "The foundations of cost-sensitive learning." Proc. IJCAI 2001, pp. 973–978. **[page numbers UNVERIFIED]**
- **[Ferrez08]** P. W. Ferrez, J. d. R. Millán. "Error-related EEG potentials generated during simulated brain-computer interaction." IEEE TBME 55(3):923–929 (2008). doi:10.1109/TBME.2007.908083. https://infoscience.epfl.ch/record/145985
- **[FerrezGraz08]** P. W. Ferrez, J. d. R. Millán. "Simultaneous real-time detection of motor imagery and error-related potentials for improved BCI accuracy." Proc. 4th Int. BCI Workshop & Training Course, Graz (2008). https://publications.idiap.ch/attachments/papers/2008/ferrez_graz_2008.pdf
- **[Iturrate15]** I. Iturrate, R. Chavarriaga, L. Montesano, J. Minguez, J. d. R. Millán. "Teaching brain-machine interfaces as an alternative paradigm to neuroprosthetics control." Sci. Rep. 5:13893 (2015). doi:10.1038/srep13893. https://pmc.ncbi.nlm.nih.gov/articles/PMC4564803
- **[Iwane23]** F. Iwane, A. Sobolewski, R. Chavarriaga, J. d. R. Millán. "EEG error-related potentials encode magnitude of errors and individual perceptual thresholds." iScience 26(9):107524 (2023). doi:10.1016/j.isci.2023.107524. https://pmc.ncbi.nlm.nih.gov/articles/PMC10448161/ · Data (CC BY 4.0, 8.0 GB): https://zenodo.org/records/6415455
- **[Kaggle15]** "BCI Challenge @ NER 2015", Kaggle `inria-bci-challenge`. https://www.kaggle.com/c/inria-bci-challenge (page body not retrievable without JS/login). Organiser page: https://neuro.embs.org/2015/bci-challenge/
- **[Keyl19]** P. Keyl, M. Schneiders, C. Schuld, S. Franz, M. Hommelsen, N. Weidner, R. Rupp. "Differences in characteristics of error-related potentials between individuals with spinal cord injury and age- and sex-matched able-bodied controls." Front. Neurol. 9:1192 (2019). doi:10.3389/fneur.2018.01192. https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2018.01192/full
- **[Kueper23]** N. Kueper et al. "EEG and EMG dataset for the detection of errors introduced by an active orthosis device" (Zenodo, CC BY 4.0, 1.8 GB). https://zenodo.org/records/7951044 · arXiv:2305.11996
- **[Lawhern18]** V. J. Lawhern et al. "EEGNet: a compact convolutional neural network for EEG-based brain–computer interfaces." J. Neural Eng. 15(5):056013 (2018). https://arxiv.org/abs/1611.08024 (ERN-dataset details from https://arxiv.org/html/1611.08024v4)
- **[Llera11]** A. Llera, M. A. J. van Gerven, V. Gómez, O. Jensen, H. J. Kappen. "On the use of interaction error potentials for adaptive brain computer interfaces." Neural Networks 24:1120–1127 (2011). https://www.mbfys.ru.nl/staff/v.gomez/Llera10_final.pdf
- **[LopesDias19]** C. Lopes-Dias, A. I. Sburlea, G. R. Müller-Putz. "Online asynchronous decoding of error-related potentials during the continuous control of a robot." Sci. Rep. (2019). doi:10.1038/s41598-019-54109-x. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6879530/
- **[LopesDias21]** C. Lopes-Dias et al. "Online asynchronous detection of error-related potentials in participants with a spinal cord injury using a generic classifier." J. Neural Eng. 18:046022 (2021). https://arxiv.org/abs/2011.13347
- **[MOABB-doc]** MOABB `BNCI2015_013` documentation (added 1.2.0; CC BY-NC-ND 4.0). https://moabb.neurotechx.com/docs/generated/moabb.datasets.BNCI2015_013.html · Loader source: https://github.com/NeuroTechX/moabb/tree/develop/moabb/datasets/bnci (`base.py::_convert_run_epfl`, `bnci_2015.py`) · PyPI 1.7.2: https://pypi.org/project/moabb/
- **[NiculescuMizil05]** A. Niculescu-Mizil, R. Caruana. "Predicting good probabilities with supervised learning." Proc. ICML 2005. **[UNVERIFIED this session]**
- **[Perrin12]** M. Perrin, E. Maby, S. Daligault, O. Bertrand, J. Mattout. "Objective and subjective evaluation of online error correction during P300-based spelling." Adv. Hum.-Comput. Interact. 2012:578295. doi:10.1155/2012/578295
- **[Platt99]** J. Platt. "Probabilistic outputs for support vector machines and comparisons to regularized likelihood methods." In Advances in Large Margin Classifiers, MIT Press (1999). **[UNVERIFIED this session]**
- **[pyRiemann]** pyRiemann 0.12 (PyPI, pure-Python wheel). https://pypi.org/project/pyriemann/
- **[Rivet09]** B. Rivet, A. Souloumiac, V. Attina, G. Gibert. "xDAWN algorithm to enhance evoked potentials: application to brain–computer interface." IEEE TBME 56(8):2035–2043 (2009). **[UNVERIFIED this session]**
- **[Saerens02]** M. Saerens, P. Latinne, C. Decaestecker. "Adjusting the outputs of a classifier to new a priori probabilities: a simple procedure." Neural Computation 14(1):21–41 (2002). **[UNVERIFIED this session]**
- **[Schmidt12]** N. M. Schmidt, B. Blankertz, M. S. Treder. "Online detection of error-related potentials boosts the performance of mental typewriters." BMC Neurosci. 13:19 (2012). doi:10.1186/1471-2202-13-19. https://pmc.ncbi.nlm.nih.gov/articles/PMC3315432/
- **[SFE-GAT]** Gao, Cao, Ma. "SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding." Sensors 26:1730 (2026), Table 3 (SD 0.7770, SI 0.6659). Local: `sensors-26-01730-v2.pdf`
- **[Spuler12a]** M. Spüler, M. Bensch, S. Kleih, W. Rosenstiel, M. Bogdan, A. Kübler. "Online use of error-related potentials in healthy users and people with severe motor impairment increases performance of a P300-BCI." Clin. Neurophysiol. 123(7):1328–1337 (2012). doi:10.1016/j.clinph.2011.11.082
- **[Spuler12b]** M. Spüler, W. Rosenstiel, M. Bogdan. "Online adaptation of a c-VEP brain-computer interface (BCI) based on error-related potentials and unsupervised learning." PLoS ONE 7:e51077 (2012). doi:10.1371/journal.pone.0051077
- **[SpulerNiethammer15]** M. Spüler, C. Niethammer. "Error-related potentials during continuous feedback: using EEG to detect errors of different type and severity." Front. Hum. Neurosci. 9:155 (2015). doi:10.3389/fnhum.2015.00155
- **[Tang21]** Y. Tang, J. J. Zhang, P. M. Corballis, L. E. Hallum. "Towards the classification of error-related potentials using Riemannian geometry." arXiv:2109.13085 (2021). https://ar5iv.labs.arxiv.org/html/2109.13085
- **[Yasemin23]** M. Yasemin, A. Cruz, U. J. Nunes, G. Pires. "Single trial detection of error-related potentials in brain–machine interfaces: a survey and comparison of methods." J. Neural Eng. 20(1):016015 (2023). doi:10.1088/1741-2552/acabe9
- **[Zadrozny02]** B. Zadrozny, C. Elkan. "Transforming classifier scores into accurate multiclass probability estimates." Proc. KDD 2002. **[UNVERIFIED this session]**
