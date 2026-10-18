# SilentAssist: Viva Study Guide

**For:** the SilentAssist team (Ali Farqaleet, Abdul Haseeb, Issa Sultan), FAST-NUCES Islamabad, supervisor Dr. Adil Majeed.
**Purpose:** to help you understand *everything* in the project well enough to explain it in the mid evaluation on 2026-10-15.
**How to read it:** each section starts simple and then goes deeper. Each one ends with a **"Seedhi baat:"** summary in Roman Urdu. If you are short on time, read every "Seedhi baat" first, then Section 10 (viva questions).

**Honesty rules used in this guide:**
- Every number comes from the paper, the README, an ADR, or a calculation shown here. Nothing is invented.
- Our own results are now filled in (updated 2026-10-14 evening, after Plan B SD training finished). They come from `docs/replication.md` and `docs/errp.md`, are reported as k/288 floored, and are labelled PRELIMINARY. Anything that was not run says so ("not run (post-mid-eval)").
- Illustrative numbers (made up only to explain a formula) are always labelled **"illustrative"**.

**Where things come from:**

| Source | What it decides |
|---|---|
| `README.md` | Screens, labels, values, keyboard shortcuts. Must match byte for byte. |
| `sensors-26-01730-v2.pdf` | The base paper, SFE-GAT (Gao, Cao & Ma, *Sensors* 2026, 26, 1730). |
| `docs/adr/0001` | How we replicate SFE-GAT and settle its ambiguities. |
| `docs/adr/0002` | ErrP detector, cost model, rollback, and the ErrP → KG penalty. |
| `docs/adr/0003` | Knowledge graph, the 0.94 score, and the policy engine. |
| `docs/adr/0004` | Browser architecture, decoder modes, export formats, tests. |
| `docs/adr/0005` | Assistive UX: focus, navigation, CONFIRM, voice, layout. |

---

## Table of contents

1. Big picture: the closed loop
2. EEG and motor imagery basics, and the BCI IV-2a dataset
3. SFE-GAT from zero
4. What is wrong or ambiguous in the paper, and how to discuss it
5. ErrP: detecting the brain's "that was wrong" signal
6. The CogLign knowledge graph
7. Policy and safety
8. The prototype
9. Plan B vs Plan A, and honest limitations
10. 30 viva questions with model answers
11. Glossary

---

## 1. Big picture: the closed loop

### 1.1 The problem

Some people cannot move or speak reliably, for example people with **ALS**, **tetraplegia**, or a **spinal cord injury (SCI)**. They still need to control their home: lights, fan, AC, TV. SilentAssist lets them do this using **brain signals (EEG)** only, with no mouse, keyboard or voice.

The user does not "think of a word". They **imagine a movement**. This is called **motor imagery (MI)**. We use exactly four imagined movements, and each one is a navigation **token**:

| Imagined movement (MI class) | Token | Keyboard (for the demo) | Operator button (exact README text) |
|---|---|---|---|
| **Right Hand** | **NEXT** (move forward through cards) | `→` / `D` | `[Right Hand ► Next]` |
| **Left Hand** | **PREVIOUS** (move backward) | `←` / `A` | `[Left Hand ◄ Previous]` |
| **Both Feet** | **SELECT / CONFIRM** | `Enter` / `Space` / `S` | `[Both Feet ✓ Select]` |
| **Tongue** | **BACK / CANCEL** | `Esc` / `Backspace` / `W` | `[Tongue ✕ Back]` |

The `C` key opens the **Caregiver Dashboard**.

These four classes are **exactly** the four classes of the public dataset **BCI Competition IV-2a**, which our base paper (SFE-GAT) uses. That is why we chose them.

### 1.2 The four stages of the loop

```
   +-------------------+     +-----------------------+     +------------------+
   | 1. SFE-GAT        |     | 2. CogLign KG         |     | 3. Policy engine |
   | EEG -> MI class   | --> | intent -> which exact | --> | EXECUTE/CONFIRM/ |
   | + confidence n    |     | device? score, s      |     | REJECT/CAREGIVER |
   +-------------------+     +-----------------------+     +------------------+
            ^                                                        |
            |                                                        v
   +-------------------+                                   +------------------+
   | 4. ErrP detector  | <-------- brain reacts ---------- |   Home acts      |
   | "was that wrong?" |   (EEG 0.2-0.7 s after action)    | (light ON, etc.) |
   | -> keep or        |                                   +------------------+
   |    ROLL BACK      |
   +-------------------+
```

1. **SFE-GAT** (the base paper's neural network) decodes the EEG into one of the 4 MI classes and gives a confidence, called **n** (neural score).
2. **CogLign knowledge graph (KG)** works out *which* device the user means in this context (room, device type, state, habit). It gives a score; the "SPARQL Match" is **0.94** in the canonical case, and the **Semantic Context** score **s** is **0.89**.
3. **Policy engine** combines the two: **c = n × s**. Based on c and the device's **risk tier**, it decides **EXECUTE**, **CONFIRM**, **REJECT**, or **CAREGIVER APPROVAL**.
4. **ErrP detection.** After the action, the brain automatically produces an **Error-Related Potential (ErrP)** if the user sees something wrong. If we detect it, we **roll back** the action and offer an alternative.

**Two graphs.** The project has two different graphs. Do not mix them up in the viva:

| | Brain graph | Knowledge graph |
|---|---|---|
| What it is | 22 EEG electrodes as nodes; edges = phase synchrony (PLV) | Rooms, devices, states, history as RDF triples |
| Who uses it | SFE-GAT (Section 3) | CogLign resolver (Section 6) |
| What changes it | The model's learned edge mask (evolution blocks) | Device state changes and ErrP feedback |

### 1.3 The README canonical story (learn this by heart)

This is the story the README tells, and the one the Scripted demo reproduces exactly:

1. **Screen 1 — Mode Selection.** User picks *Visual Navigation* (or *Audio-Assisted Navigation*). Pills show `EEG: Simulation Mode` • `Environment: Smart-Home Simulator`.
2. **Screen 2 — Assistive Home Hub.** Five cards: **Lights** (1 Active of 3), **Fans** (Ceiling Fan: OFF), **Air Conditioner** (24°C • Cool Mode), **TV & Media** (Smart TV: Standby), **Presets** (4 Multi-Device Semantic Routines). User selects *Lights*.
3. **Screen 3 — Lights Fixtures.** **Bedroom Ceiling Light** (OFF), **Bedside Lamp** (OFF), **Living Room Light** (ON). User selects *Bedroom Ceiling Light*.
4. **Screen 4 — Actions + CogLign panel.** Actions: **Turn On**, **Turn Off**, **Adjust Brightness**, **Back**. The panel shows:
   - *Decoded Intent:* `Turn On Light`
   - *Spatial Context:* `Master Bedroom (Active User Room)`
   - *Resolved Entity:* `:BedroomCeilingLight`
   - *SPARQL Match:* Score 0.94
   - *Confidence Telemetry:* Neural MI (92%), Semantic Context (89%), Risk Tier (Low: Autonomic)
   - *Policy Decision:* **EXECUTE**
5. **Screen 5 — Result + post-action EEG.** `Bedroom Ceiling Light: OFF ➔ ON`, then `“Observing post-action EEG...”` on electrodes **FCz** and **Cz**.
   - **Success path** (`[No ErrP]`): `No Error Detected • Action Confirmed`. The light stays ON. The event goes into the caregiver audit log.
   - **Correction path** (`[Simulate ErrP]`): `Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)` → automatic rollback `ON ➔ OFF` → `Action Rolled Back` → alternative **Bedside Lamp** with `[Retry]` or `[Return to Home]`.
6. **Screen 6 — Semantic Presets.** **Night Mode**, **All Lights Off**, **Cooling Mode**, **Watch TV**.
7. **Caregiver Dashboard** (`C`): live device "shadow" table, gauges (neural, semantic, ErrP health), a **High-Risk Action Approval Queue** (thermal hazard example with `[Approve]`/`[Reject]`), and a tamper-evident audit log.

Token count for the canonical journey: SELECT on S1, SELECT on Lights, SELECT on Bedroom Ceiling Light, SELECT on Turn On = **4 tokens**. (Focus starts on the first card each time, so no NEXT is needed.)

### 1.4 What is real and what is simulated

- In the browser, **EEG is never live**. It is either **Scripted** (operator sets values; the README numbers), **Replay** (real recorded trials from public datasets, decoded by our in-browser SFE-GAT), or **Synthetic** (generated). The UI always says which.
- **No clinical claim.** This is a proposal-stage prototype (FYP-I).

**Seedhi baat:** SilentAssist ek band loop hai: dimagh ka signal (EEG) → SFE-GAT 4 mein se ek class batata hai → Knowledge Graph batata hai kaunsa device → Policy decide karti hai karna hai ya nahi → ErrP check karta hai ke user ko ghalti lagi ya nahi, aur lagi to wapas (rollback). Do graph hain: brain graph (electrodes) aur knowledge graph (ghar ki cheezein). Canonical kahani yaad karo: Bedroom Ceiling Light, 0.94, 92%, 89%, EXECUTE, phir ErrP −8.4 µV pe rollback aur Bedside Lamp.

---

## 2. EEG and motor imagery basics, and the BCI IV-2a dataset

### 2.1 What EEG is

- **EEG (electroencephalography)** records tiny voltages on the scalp, measured in **microvolts (µV)**, using electrodes.
- Each electrode has a standard name from the 10-20 / 10-10 system. Letters give the region: **F** = frontal, **C** = central, **P** = parietal, **z** = midline. Odd numbers are on the left, even numbers on the right. So **C3** is left central, **C4** is right central, **Cz** is the top centre, and **FCz** is between frontal and central on the midline.
- EEG is a mix of rhythms (oscillations). Two matter for motor imagery:
  - **mu rhythm**, about 8–13 Hz, over the motor cortex;
  - **beta rhythm**, about 13–30 Hz.

### 2.2 Motor imagery and ERD

When you **imagine** moving your right hand, the mu/beta power over the **left** motor cortex (around C3) goes **down**. This drop is called **ERD (event-related desynchronisation)**. The brain is contralateral: right body ↔ left brain.

```
 Imagine RIGHT hand  -> mu/beta power drops near C3 (left side)
 Imagine LEFT hand   -> mu/beta power drops near C4 (right side)
 Imagine BOTH FEET   -> drop near Cz (top centre; feet area is deep on the midline)
 Imagine TONGUE      -> more lateral/bilateral pattern (less clear-cut)
```

So a classifier can tell the classes apart by looking at **which electrodes** lose power in **which frequency bands**, and at **how the electrodes are coordinated**. SFE-GAT uses both: band power as node features, and phase synchrony as graph edges.

### 2.3 BCI Competition IV-2a (the dataset)

| Fact | Value |
|---|---|
| Subjects | 9 (A01–A09) |
| Classes | left hand, right hand, both feet, tongue |
| Sessions | 2 per subject, on different days: **T** (training) and **E** (evaluation) |
| Trials | 6 runs × 48 = **288 per session**, **72 per class** (perfectly balanced) |
| Channels | **22 EEG** + 3 EOG (eye). EOG "must not be used for classification" |
| Sampling rate | **250 Hz** |
| Recording filter | 0.5–100 Hz band-pass, 50 Hz notch |
| Reference | left mastoid |
| Trial timing | t = 0 fixation cross + beep; **t = 2 s arrow cue**; imagery until **t = 6 s** |

**Our window:** we cut **[2.0, 6.0) s** after trial start, which is exactly **1,000 samples** (4 s × 250 Hz). MNE would give 1001 samples if both ends are included, so we crop to 1000 (ADR 0001 D10).

**Trial timeline:**

```
 t=0 s        t=2 s            t=3.25 s                   t=6 s
   |  fixation  | arrow cue shown |   keep imagining ...     | break
   +------------+=================+==========================+------
                <------------- our window: 1000 samples ----->
```

**Data files:** 18 `.mat` files (A01T … A09E), about 780 MB, from the BNCI Horizon 2020 database ("001-2014"). All 18 passed SHA-256 checks on 2026-10-14 (ADR 0001, Gate 0).

### 2.4 Two evaluation protocols

| | Subject-dependent (SD) | Subject-independent (SI / LOSO) |
|---|---|---|
| Train on | subject k, session T (288 trials) | the **other 8** subjects |
| Test on | subject k, session E (288 trials) | subject k, session E (288 trials) |
| Models | 9 (one per subject) | 9 folds |
| Paper's mean accuracy | **77.70 %** (κ 0.7027) | **66.59 %** (κ 0.5545) |
| What it shows | How well it works after calibrating on *you* | How well it works on a *new* person |

SI is harder because every brain is different. **LOSO** = Leave-One-Subject-Out.

### 2.5 The biggest trap: leakage

**Leakage** means test data influences training choices, which makes results look better than they really are. Example: two well-known IV-2a codes picked their "best epoch" by checking accuracy on session E. ATCNet's authors re-ran with a proper split and got 81.10 % instead of 85.4 % (bci-eeg brief).

Our rules (ADR 0001 D13):
- Train for a fixed 500 epochs and use the **last** epoch. No early stopping, no validation on E.
- Session E is evaluated **exactly once** per run.
- The code itself refuses: `train()` raises an error if given test data (`test_trainer_refuses_test_data`).
- **Leakage alarm:** if our SD mean comes out above 82.70 %, we audit the pipeline before reporting anything.

**Seedhi baat:** EEG scalp pe µV mein bijli ke signals hain. Haath/paon/zabaan ka sirf *sochna* (motor imagery) mu/beta power ko ulti taraf ke dimagh mein kam karta hai (ERD). Dataset BCI IV-2a: 9 log, 4 class, 22 channel, 250 Hz, har session mein 288 trial (72 har class). SD = apne T pe train, apne E pe test; LOSO = baqi 8 logon pe train. Test data ko kabhi training ke faislon mein use nahi karte (leakage).

---

## 3. SFE-GAT from zero

**Paper:** "SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding", X. Gao, G. Cao, G. Ma, *Sensors* 2026, 26(5), 1730.

**One-sentence idea:** turn each EEG trial into a **graph** (electrodes = nodes, synchrony = edges, band power = node features), then let a graph attention network **refine both the features and the graph structure** over 3 blocks, and finally classify the graph into one of 4 MI classes.

### 3.0 The whole pipeline in one picture

```
 raw trial X: 22 ch x 1000 samples (4 s @ 250 Hz)
      |                                  |
      | (a) STRUCTURE                    | (b) FEATURES
      v                                  v
 Hilbert phase -> PLV 22x22         8 band-pass filters (8-12 ... 36-40 Hz)
 z-score, zero diag, keep z > tau   Welch PSD -> integrate per band
      |                                  |
      v                                  v
 adjacency A (edges)                H: 22 x 8 node features
      \                                 /
       +------------> graph (H, A) <---+
                          |
             stem GATv2 (8 -> 128)
                          |
        +--- Evolution block x3 -----------------------+
        |  GATv2 -> ReLU -> BatchNorm   (new features)  |
        |  GAE: GCN encoder -> z, P = sigmoid(z_i.z_j)  |
        |  Monte Carlo mask: keep edge if P > R (train) |
        |                    keep edge if P > 0.5 (eval)|
        +----------------------------------------------+
                          |
     classifier: GATv2 -> ReLU -> BN -> mean pool -> Dropout(0.5)
                 -> Linear(128 -> 4) -> softmax
                          |
                 left / right / feet / tongue
```

Shapes for one trial: X ∈ ℝ^{22×1000} → H ∈ ℝ^{22×8} → hidden ℝ^{22×128} → pooled ℝ^{128} → logits ℝ^{4}.

### 3.1 Graph structure: Phase Locking Value (PLV)

**Intuition.** Two electrodes are "connected" if their signals rise and fall **in step** (a stable phase difference), even if their amplitudes differ.

**Step 1: phase with the Hilbert transform.** For each channel x_i(t), the Hilbert transform builds the **analytic signal** x_i(t) + i·𝓗{x_i}(t). Its angle is the instantaneous phase θ_i(t). Think of it as turning a wave into a rotating arrow, and reading the arrow's angle at each moment.

**Step 2: PLV (Eq. 1).**

  PLV_ij = | (1/T) · Σ_t exp( i · (θ_i(t) − θ_j(t)) ) |

Each time point gives a unit arrow pointing at the phase difference. We average the arrows and take the length.
- If the phase difference is **constant**, all arrows point the same way, so the length is about **1**.
- If it is **random**, the arrows cancel, so the length is about **0**.

**Worked example (computed, 4 time points):**

| Phase differences Δθ (radians) | Arrows | PLV |
|---|---|---|
| 0.1, 0.2, 0.1, 0.0 | almost the same direction | **0.9975** (strongly locked) |
| 0.0, 0.5, 1.0, 1.5 | spread over 1.5 rad | **0.8503** |
| 0, π/2, π, 3π/2 | point in all four directions | **0.0000** (no locking) |

```
 locked:   -> -> -> ->      average arrow long  => PLV ~ 1
 random:   ->  ^  <-  v     average arrow ~ 0   => PLV ~ 0
```

PLV gives a symmetric 22 × 22 matrix with 1 on the diagonal (every channel is locked with itself).

**Step 3: z-score over the whole matrix (Eqs. 2–4).** μ and σ are taken over all 22² = 484 entries **including the diagonal** (σ with ddof = 0, and ε = 1e-8 added to σ). Then z_ij = (PLV_ij − μ)/(σ + ε), and the diagonal is set to 0.

**Step 4: threshold (Eq. 5).** Keep edge i→j if **z_ij > τ**, with weight z_ij. We use **τ = 0.3** (the authors' code default; the paper gives no value).

**Worked example (computed, 3 channels):**

```
 PLV = | 1.0  0.9  0.3 |     mu = 0.6889, sigma = 0.3071
       | 0.9  1.0  0.4 |
       | 0.3  0.4  1.0 |

 z (diag zeroed) = |  0      0.687  -1.266 |    keep z > 0.3:   1 <-> 2 only
                   |  0.687  0      -0.941 |
                   | -1.266 -0.941   0     |
```

Because the z-score is per trial, every trial keeps roughly the same *fraction* of edges. On subject A01 session T, τ = 0.3 keeps about **38.2 %** of the possible edges (measured mean evo0 density 0.382, from the calibration benchmark).

### 3.2 Node features: filter bank + Welch PSD

**Goal:** for each electrode, measure how much power it has in each of 8 frequency bands. That captures ERD.

1. **Filter bank (Eq. 6).** 8 band-pass filters: 8–12, 12–16, 16–20, 20–24, 24–28, 28–32, 32–36 and 36–40 Hz. Each is a **4th-order Butterworth**, applied **zero-phase** (forward and backward, `sosfiltfilt`), so the signal is not shifted in time.
   - *Butterworth* = a filter with a maximally flat passband (no ripple).
   - The paper also mentions "Rp = 0.5 dB, Rs = 40 dB". These parameters **do nothing for a Butterworth**; they are for Chebyshev and elliptic filters. A good, confident viva point.
2. **Welch PSD (Eq. 7).** PSD = power spectral density, i.e. power per frequency. Welch's method:
   - cut the 1000 samples into segments of **250 samples (1 s)** with **50 % overlap** (step 125);
   - number of segments = (1000 − 250)/125 + 1 = **7**;
   - multiply each segment by a **Hann window** (a smooth taper that reduces spectral leakage);
   - FFT each segment, square the magnitude, and **average** the 7 spectra;
   - frequency resolution = fs / nperseg = 250 / 250 = **1 Hz** per bin.
   - Why average? A single periodogram is very noisy, and averaging reduces the variance. (The paper's Eq. 7 actually prints a single periodogram, while its text says Welch. We follow the text.)
3. **Integrate per band (Eq. 8).** Add up (integrate) the PSD inside each band. We use Simpson's rule over the inclusive bins, e.g. 8, 9, 10, 11 and 12 Hz (5 points).

Result: **H ∈ ℝ^{22×8}**: 22 electrodes, 8 band powers each, in **µV²** (no log and no normalisation in P0).

```
 Welch on 1000 samples:
 |--seg1--|
      |--seg2--|
           |--seg3--| ... 7 segments, each Hann-windowed, FFT, |.|^2, then averaged
```

**Browser reuse:** our JavaScript FFT, Butterworth, sosfilt/sosfiltfilt, Welch, Hilbert and integration already match SciPy: **81/81 parity tests pass**, with a worst-case relative error of at most 1.8e-12.

### 3.3 Graphs and graph neural networks (GNNs) in 60 seconds

- A **graph** = nodes + edges. Here: 22 electrode nodes, and edges from PLV.
- A **GNN layer** updates each node by **collecting messages from its neighbours** and mixing them with its own features ("message passing").
- After a few layers, each node's vector summarises its neighbourhood.
- **Pooling** turns all the node vectors into one graph vector for classification.

### 3.4 GATv2: graph attention

**Problem with plain averaging:** not all neighbours are equally useful. **Attention** learns a weight α_ij for "how much node i listens to neighbour j".

**GATv2 score** (Brody, Alon & Yahav, ICLR 2022):

  e_ij = aᵀ · LeakyReLU( W_l·h_j + W_r·h_i )
  α_ij = softmax over the neighbours j of e_ij
  h_i' = Σ_j α_ij · W_l·h_j  (+ bias)

- The difference from the original GAT: in GATv2 the nonlinearity (LeakyReLU) is **inside**, before multiplying by a. This makes the attention "dynamic": the ranking of neighbours can depend on the query node. In the original GAT it is "static".
- The paper prints the **old GAT formula** (Eq. 9), but its parameter counts only match **GATv2**. So Eq. 9 is a typo.

**Worked example (illustrative scores):** node i has 3 neighbours (including itself, through the self-loop) with scores e = 1.0, 2.0 and 0.5.
  exp: 2.718, 7.389, 1.649; sum 11.756; so **α = 0.231, 0.629, 0.140**. The node takes 63 % of its new vector from neighbour 2.

**Multi-head:** 4 heads, each 32-dimensional, **concatenated**: 4 × 32 = **128**. (Averaging the heads would give the wrong parameter count; see 3.10.)

**Important detail:** GATv2 uses only the **topology** of A (which edges exist), not the PLV weights. The parameter count rules out edge features.

### 3.5 BatchNorm (BN)

For each feature column, over all nodes in the mini-batch (64 graphs × 22 nodes = 1,408 rows):

  ĥ = γ · (h − μ_batch) / √(σ²_batch + 1e-5) + β

- Training uses the batch statistics, and updates **running** averages (momentum 0.1).
- Evaluation uses the **running** statistics. This is why our exported weights include the BN running mean and variance.
- **Worked example:** values 2, 4, 6 have mean 4 and variance 2.667, so they normalise to **−1.225, 0, +1.225** (before γ and β).
- Why: it keeps activations at a stable scale, so training is faster and more stable.
- Parameters: one γ and one β per feature, so BN(128) has **256** parameters.

### 3.6 GCN: graph convolution

A GCN layer (Kipf & Welling) does a **normalised average** over neighbours and then a linear map:

  H' = D̂^{-1/2} (A + I) D̂^{-1/2} · H · W + b

- A + I adds self-loops (each node includes itself).
- D̂^{-1/2} … D̂^{-1/2} divides by the square roots of the node degrees, so high-degree nodes do not dominate.
- There is no attention: the neighbour weights come from the graph, not learned per pair.
- In SFE-GAT the GCN is **only the encoder of the GAE** (128 → 32). We pass the **z-scored PLV values** as edge weights (ADR 0001 D10, from Eqs. 5 and 15).

### 3.7 GAE: graph autoencoder (edge probabilities)

A **graph autoencoder** tries to predict which edges should exist:

1. **Encoder:** Z = BN₃₂(ReLU(GCN(H, A))), so each node gets a 32-dimensional vector z_i.
2. **Decoder (inner product):** P_ij = σ(z_iᵀ z_j), where σ is the sigmoid. If two nodes have similar z vectors, P is close to 1.

We compute P only on the **existing** edges.

Why the BN after the ReLU matters: ReLU outputs are ≥ 0, so without BN z_iᵀz_j ≥ 0 and P ≥ 0.5 always. With BN(32) after it, z can be negative and P *can* span (0, 1). Table 1's count (4,192 = 4,128 for the GCN + 64 for BN) confirms the BN.

**What actually happens on our trained model (measured, PRELIMINARY):** P ≥ 0.994 on every edge of every A01 trial (576 trials, T + E). The GAE receives no gradient under the CE-only loss, so its GCN stays a fixed random projection. As the learned GATv2 features grow in scale, the inner products become large and the sigmoid saturates near 1. Even the untrained seed-0 model keeps every edge at η = 0.5 (min P 0.64). Source: ADR 0001 amendment §3, `research/.cache/redteam2/mask_check.json`.

### 3.8 Monte Carlo edge mask (the "structure evolution")

```
 Training (Eq. 17):   draw R ~ Uniform(0,1) per edge;  keep edge if P > R
                      (= keep it with probability P, a Bernoulli sample)
 Evaluation (Eq. 18): keep edge if P > eta = 0.5     (deterministic)
 New graph:           A_hat = A (*) M   (Hadamard = element-wise product)
```

**Worked example (illustrative):**

| Edge | P | R (training draw) | Training: keep? | Evaluation (η = 0.5): keep? |
|---|---|---|---|---|
| e1 | 0.9 | 0.5 | yes (0.9 > 0.5) | yes |
| e2 | 0.3 | 0.4 | no | no |
| e3 | 0.6 | 0.7 | no (this time) | yes |

Key facts:
- Edges can only be **removed, never added**. *By design*, the graph can only get sparser across the 3 blocks (cumulative pruning). Nodes survive through the self-loops. **On our trained P0 model it does not get sparser at all:** eval-mode pruning removes 0 edges in all 3 blocks, so evo0 = evo1 = evo2 = evo3 (e.g. 172/172/172/172 on replay trial A01E-t000). P0 is therefore functionally FE-GAT. PROMPT §5 "brain graph visibly evolves" is **not met**, and the UI says so.
- In training, the randomness is *meant* to act like a **guided DropEdge** (the paper's own Discussion uses this phrase): edges with low P would be dropped more often. On our model P ≈ 1, so the training-time mask drops only about 10⁻⁴–10⁻⁵ of edges and regularises almost nothing.
- R is drawn with `torch.rand_like`, i.e. from the **global** PyTorch RNG seeded by `torch.manual_seed(0)`. Runs are reproducible (an earlier launch reproduced A01–A03 exactly), but ADR 0001 D8/D14 asked for a **dedicated** seeded generator (seed s + 2000), and that is not done yet. There is also no `test_model.py` yet (post-mid-eval).

### 3.9 Three evolution blocks, then the classifier

**One block** (ℓ = 1, 2, 3):
1. H_ℓ = BN₁₂₈(ReLU(GATv2(H_{ℓ−1}, A^{(ℓ−1)}))): new node features.
2. Z = BN₃₂(ReLU(GCN(H_ℓ, A^{(ℓ−1)}))): the encoder.
3. P_e = σ(z_srcᵀ z_dst) for each edge.
4. The mask gives A^{(ℓ)}, with the same number of edges or fewer (on our trained model: the same).

So "structure-feature evolution" = **features** refined by GATv2 and **structure** refined by the mask, three times. In our replication only the feature half does anything. The stages are called **evo0** (the original PLV graph), **evo1**, **evo2** and **evo3**.

**Before block 1:** a **stem** GATv2(8 → 32 × 4 = 128) with no activation and no BN. It lifts the 8 band powers to 128 dimensions. It appears only in Table 1, not in the text.

**Classifier (Eqs. 20–24):** GATv2(128 → 128) → **ReLU** → BN(128) → **global mean pool** (average of the 22 node vectors) → **Dropout(0.5)** → Linear(128 → 4) → softmax.
- The ReLU is in Fig. 1 and the code but not in Eq. 20. We include it and log it as a deviation.
- Dropout randomly zeros half the features during training to reduce overfitting.

### 3.10 Parameter count: 149,796 (≈ 0.15 M)

| Part | Formula | Params |
|---|---|---|
| Stem GATv2(8 → 32×4) | 2·(8·128 + 128) + 128 (att) + 128 (bias) | 2,560 |
| Block GATv2(128 → 32×4) | 2·(128·128 + 128) + 128 + 128 | 33,280 |
| Block BN(128) | 2·128 | 256 |
| Block GAE: GCN(128→32) + BN(32) | 128·32 + 32 + 64 | 4,192 |
| × 3 blocks | 3 × (33,280 + 256 + 4,192) | 113,184 |
| Classifier GATv2 + BN(128) | 33,280 + 256 | 33,536 |
| Linear(128 → 4) | 128·4 + 4 | 516 |
| **Total** | 2,560 + 113,184 + 33,536 + 516 | **149,796** |

This matches the paper's "approximately 0.15M". If the 8-input GATv2 were block 1's own layer (the text-only reading), the total would be 116,516 ≈ 0.12 M, which contradicts the paper. So the stem is a separate layer. The authors' code agrees (149,796).

**Of these, only 137,220 receive a gradient.** The 12,576 GAE parameters (3 × 4,192) get no gradient under the cross-entropy-only loss (Section 4.1).

### 3.11 Training setup

| Setting | Value |
|---|---|
| Loss | cross-entropy only |
| Optimiser | SGD, lr 0.01, momentum 0, weight decay 1e-3 |
| Batch | 64 graphs (288 = 4 × 64 + 32; the last small batch is kept) |
| Epochs | 500; the last epoch is used |
| Seed (Plan B) | 0 |
| Hardware | CPU only (Intel i7-10510U laptop, 4 cores). Measured ≈ 566 ms per step per process when 4 processes run in parallel |
| Deployment subject | **A01** (the paper's own Fig. 5/6 subject; typical at 80.21 % in the paper; declared before any of our results, so not cherry-picked) |

### 3.12 Metrics, and why κ = (acc − 0.25)/0.75

- **Accuracy:** correct / total. The paper defines it as mean per-class recall, which equals plain accuracy when the classes are balanced (72 each).
- **Macro precision:** the precision of each class, averaged.
- **Macro F1:** the F1 of each class (harmonic mean of precision and recall), averaged.
- **Cohen's κ:** agreement corrected for chance, κ = (P_o − P_e)/(1 − P_e).
  - P_o = observed accuracy.
  - P_e = chance agreement = Σ over classes k of (fraction of true labels in k) × (fraction of predictions in k).
  - **In IV-2a every class has exactly 72/288 = 0.25 of the true labels.** So P_e = Σ_k 0.25 × pred_k = 0.25 × Σ_k pred_k = 0.25 × 1 = **0.25**, *whatever the model predicts*.
  - Therefore **κ = (acc − 0.25)/0.75**. Check: (0.7770 − 0.25)/0.75 = **0.7027** ✓, the paper's SD κ.
  - Consequence: on IV-2a, κ is **not independent** of accuracy. It is a rescaling where 0 = chance (25 %) and 1 = perfect. We have a pytest that checks the identity to 1e-9.
  - Viva point: the paper's **baseline** and **ablation** κ values (Table 3 baselines, Fig. 4) do **not** satisfy this identity, which suggests they were taken from other sources or computed differently. The SFE-GAT κ values themselves do satisfy it.

### 3.13 Ablations (Fig. 4): what each part is worth

| Variant | What changes | Paper mean SD accuracy |
|---|---|---|
| **SFE-GAT** (full) | — | 77.69 (≈ 77.70) |
| FE-GAT | no GAE and no mask; the graph stays fixed | 75.32 (about −2.4 pp) |
| SFE-GCN | GATv2 replaced by GCN | 71.45 (−6.25 pp) |
| PLV-GAT | no evolution blocks | 65.22 (−12.5 pp) |
| R-SFE-GAT | random graph + evolution | 59.57 |
| R-GAT | random graph, no evolution | 47.80 |

How to read it: attention matters (GAT > GCN), the PLV structure matters (PLV ≫ random), and evolution adds a little on top (+2.4 pp over FE-GAT). The values were read from the paper's vector box plots (±0.05 pp).

**Our ablations:** under Plan B we run A3 (FE-GAT), A1 (PLV-GAT) and A4 (R-GAT) if time allows, and report the **direction only**. **Result: none were run tonight** (Plan B as run = SD × 9 + calibration fold 0; ADR 0001 amendment §5). Post-mid-eval. Note that on our model P0 is already functionally FE-GAT, because the mask removes no edges (§3.8).

### 3.14 Visual analyses: t-SNE, Silhouette, DBI, edge retention

- **t-SNE** squashes high-dimensional vectors into 2-D so that similar points land close together. It is good for pictures; distances between far-apart clusters are not meaningful.
- **Silhouette score** (−1 to 1, **higher is better**): for each point, (b − a)/max(a, b), where a = mean distance to its own class and b = mean distance to the nearest other class.
- **Davies–Bouldin Index, DBI** (≥ 0, **lower is better**): the average of "how spread out the clusters are ÷ how far apart they are".
- **The paper's Table 2** (mean over subjects):

| | evo0 | evo1 | evo2 | evo3 |
|---|---|---|---|---|
| Silhouette | 0.3088 | 0.3264 | 0.3797 | 0.3992 |
| DBI | 0.9427 | 0.8855 | 0.8114 | 0.7909 |

  The classes separate more after each evolution block.
- **Our protocol (ADR 0001 D28):** node-level features (288 trials × 22 nodes = 6,336 points per stage) on session E, t-SNE perplexity 30, scores computed on the 2-D coordinates. **Not run tonight (post-mid-eval).** Fig. 6 edge retention is predictable already: on our trained model evo0 and evo3 have identical edges.
- **Fig. 6 edge retention:** count how many trials keep each edge at evo0 vs evo3. The paper: evo0 is "localized and dense"; evo3 is "sparser", with a few long-range connections. We always say that evolved graphs are **model-internal structure, not neural connectivity**.

### 3.15 Our results so far (PRELIMINARY, Plan B: 1 seed; run `research/runs/20261014-1549-planb-sd-p0/`)

| | Paper | Ours |
|---|---|---|
| SD mean accuracy | 77.70 % (κ 0.7027) | **35.68 % (925/2592), κ 0.1424**: Not reproduced (Δ −42.02 pp) |
| SI (LOSO) mean accuracy | 66.59 % (κ 0.5545) | **not run (post-mid-eval)** |
| Per subject (Fig. 3, SD) | A01 80.21, A02 61.46, A03 89.24, A04 70.49, A05 72.92, A06 71.88, A07 86.11, A08 85.07, A09 81.94 | A01 34.37 (99/288), A02 29.51 (85/288), A03 37.15 (107/288), A04 38.54 (111/288), A05 26.38 (76/288), A06 30.20 (87/288), A07 39.23 (113/288), A08 34.02 (98/288), A09 51.73 (149/288) |
| Floor B0 (log10 PSD + logistic regression, ad hoc, not yet a logged run) | — | ≈ 50 % mean; **above P0 on all 9 subjects** |
| Training accuracy at epoch 500 | — | 91–99 % (overfit); A01 held-out session-T accuracy 37.5 % (27/72) |
| Browser model A01, temperature scaling | — | T* = 8.0 from calibration fold 0 (72 held-out A01T trials) |

Every percentage is k/288, floored. A05 (76/288) is not above chance (p = 0.31), and A02 (85/288) is exactly at the 95 % chance bound. Why the gap exists, and how to say it: §9.3 and `docs/replication.md` §4.

**Pre-registered verdict bands (ADR 0001 D16)**, fixed before any result existed:

| Protocol | Reproduced | Consistent | Not reproduced |
|---|---|---|---|
| SD (target 77.70) | within ±3.0 pp (74.70–80.70) | 3–5 pp away | more than 5 pp away |
| SI (target 66.59) | within ±4.0 pp | 4–6 pp away | more than 6 pp away |

Every Plan B verdict carries "(PRELIMINARY, 1 seed)". The SI verdict is capped at "Consistent" until Plan A, because Plan B's LOSO trains on session T only. **Our SD verdict: Not reproduced (PRELIMINARY, 1 seed).**

**Seedhi baat:** Har trial ko graph banate hain: 22 electrode = nodes, PLV (phase kitna saath chalta hai) = edges, aur 8 bands ki power (Welch) = node features. GATv2 attention se seekhta hai kaunsa padosi zyada important hai; GAE har edge ki probability P deta hai aur Monte Carlo mask kam-P wale edges hata deta hai — yeh 3 dafa hota hai (evo0→evo3). Phir mean pool aur Linear se 4 class. Total 149,796 parameters. IV-2a mein classes barabar hain, is liye kappa = (acc − 0.25)/0.75 hamesha. Hamara SD result 35.68 % hai (paper 77.70 %) — not reproduced, PRELIMINARY, 1 seed; aur hamare trained model par mask koi edge nahi hatata (evo0 = evo3).

---

## 4. What is wrong or ambiguous in the paper, and how to discuss it

**Tone for the viva:** confident and respectful. Say "the paper does not specify X, so we chose Y, for reason Z, and we recorded it in ADR 0001". Never say "the paper is wrong" without the evidence. Every journal paper leaves gaps; finding them shows you read it carefully.

**Our rule for filling gaps (ADR 0001 D1, the precedence ladder):**

```
 1. Explicit equations/prose in the paper      -> always win
 2. Checkable numbers (Table 1 counts, 0.15M)  -> decide structure
 3. Authors' released code                     -> only fills gaps
 4. Our ADR choice, justified                  -> when nothing above decides
```

And: the main configuration (**P0**) was **frozen before any result existed**. No variant is ever promoted because it scored better.

### 4.1 The gradient path ("differentiable sampling" claim)

**What the paper says:** the graph is updated "through a differentiable sampling strategy" (§1, line 92 of our text extraction).

**What the equations actually do:** M = 𝟙(P > R) is an **indicator (step) function**. Its derivative is **0 almost everywhere**. The mask only changes **which edges exist**, and the next GATv2 layer only uses topology. So no gradient flows from the loss back into P, and therefore none reaches the GAE.

```
 loss  <-  classifier  <-  GATv2(H, A_hat)  <-  A_hat = A * 1(P > R)
                                                        ^
                                         step function: dM/dP = 0
                                         => GAE gets NO gradient
```

**Consequence (checked directly on our model, 2026-10-14):** with cross-entropy as the only loss, all **12,576 GAE parameters** (3 × 4,192, about 8.4 % of the model) have `grad = None` after `backward()`. They keep their random (Glorot) initial values. Their BN running statistics still update. In that check, one training-mode forward and backward pass on `research/sfegat/model.py` gave 149,796 parameters in total, 12,576 GAE parameters all with `grad = None`, and 137,220 parameters with a gradient. ADR 0001 also requires a permanent pytest for this, `research/tests/test_model.py::test_gae_receives_no_grad`.

So the "evolution" in practice is **feature-conditioned pruning through a fixed random GCN projection of learned GAT features**. That is exactly what the paper's own Discussion calls "a guided form of DropEdge" (line 913).

**How to say it in the viva:**
> "We implemented Eqs. 15–18 exactly as written. Because the mask is a hard threshold, no gradient reaches the GAE under the stated cross-entropy loss, so its weights stay at their seeded initialisation. The released code behaves the same way. We report this as a finding about the paper, not a defect of our build, and we have two pre-registered variants that test the likely intended readings: V6 adds a GAE reconstruction loss, and V7 uses a straight-through estimator."

**Why not just add a straight-through or Gumbel estimator?** Either one does nothing unless the mask enters the logit path through some extra operator (for example, weighting attention by the mask). That operator is neither in the paper nor in the parameter count, so adding it would no longer be the paper's method. It is tested separately as V7.

### 4.2 77.70 % vs 77.05 %

**The conflict:** the abstract and Table 3 say SD accuracy **77.70 %**, but one sentence in the body says **77.05 %**.

**How we settled it (three independent checks all agree on 77.70):**
1. The mean of the nine per-subject bars in Fig. 3a is 2014/2592 = **77.70 %**.
2. κ = 0.7027 = (0.7770 − 0.25)/0.75 exactly.
3. All eight "improvement over baseline" numbers in §3.8 equal 77.70 minus the baseline.

So 77.05 is a typo. Our SD target is **77.70 % / κ 0.7027**.

### 4.3 τ and η: thresholds with no values

| Symbol | Where | Paper gives | We use | Label we must use |
|---|---|---|---|---|
| τ | PLV edge threshold (Eq. 5) | no value | **0.3**, strict `>`, on the per-trial whole-matrix z-score | "released-code default argument; call site unreleased; not confirmed by the paper" |
| η | evaluation mask threshold (Eq. 18) | no value; the glyph is garbled (prose says "τ", the equation prints a bold ø) | **0.5**, strict `>` | "η is the PROMPT's symbol; the value is an ADR convention, not from the paper" |

**Why 0.5 for η?** It is the most likely outcome (the mode) of a Bernoulli(P) draw, so evaluation matches the "typical" training mask. It is a real decision, because with BN(32), P can fall on either side of 0.5.

**We do not tune τ or η on results.** A sensitivity sweep (τ ∈ {0, 0.3, 0.5, 1.0} × η ∈ {0.3 … 0.7}) is planned after the mid evaluation, using cross-validation **inside session T only**, and is descriptive only.

### 4.4 The partial repository

The paper's Data Availability statement says "source code, trained models, and preprocessing scripts are publicly available". The repository (GaoHSin/SFE-GAT) actually has **3 files, about 12 KB**:
- no training loop, loss, optimiser or seeds;
- no trained weights and no preprocessing script;
- three functions it calls are undefined (`compute_plv`, `z_score_norm`, `monte_carlo_new_edge_index`), so it does not run (the evolution-block call raises a `TypeError`);
- **no licence**, so we cannot copy it. We wrote our own implementation and used the code only to fill gaps (ladder level 3).

What it *did* settle: head concatenation, BN placement, the stem layer, the GCN encoder's BN, τ = 0.3 as a default, and the parameter count 149,796.

**How to say it:** "The released code is a partial fragment; the README of the repository says the rest will come later. We used it only where the paper is silent, and never to override the paper."

### 4.5 Other small issues (good to know, one line each)

| # | Issue | Our resolution |
|---|---|---|
| a | Eq. 9 prints the original GAT score, not GATv2 | Parameter counts prove GATv2 (typo) |
| b | Table 1: the 8-input GATv2 row has an empty "Blocks" cell | Separate stem layer; gives 149,796 ≈ 0.15 M |
| c | Eq. 15 omits the BN(32) that Table 1 counts (4,192) | Include BN(32) |
| d | Eq. 20 omits the ReLU that Fig. 1 and the code show | Include ReLU; logged as a deviation |
| e | Code has a residual connection and dropout 0.2; paper has neither residual and dropout 0.5 | Follow the paper (P0); the code's version is variant V5 |
| f | "Rp/Rs" for a Butterworth filter | No effect; documented |
| g | Eq. 7 is a single periodogram but the text says Welch | Follow the text (Welch) |
| h | Baseline and ablation κ values violate κ = (acc − 0.25)/0.75 | Reported as an inconsistency; not used |
| i | LOSO: "remaining subjects" — T only, or T + E? | Plan A uses T + E (literal reading); Plan B uses T only and discloses it |
| j | Latency 0.066 ms/sample on an RTX 3090 | Never compared with our CPU numbers |

**Seedhi baat:** Paper mein kuch cheezein gayab ya ghalat hain: τ aur η ki value nahi di (hum ne 0.3 aur 0.5 liye aur saaf likha), 77.05 typo hai (asal 77.70, teen checks se), aur "differentiable sampling" ka daawa equations se poora nahi hota — hard mask ki wajah se GAE ko gradient nahi milta. Repo adhoora hai aur licence nahi. Viva mein izzat se, saboot ke saath, aur confidence se baat karo.

---

## 5. ErrP: detecting the brain's "that was wrong" signal

**ErrP is not in the base paper.** SilentAssist adds it as its own research contribution (ADR 0002).

### 5.1 What an ErrP is

When a person **sees a mistake** (their own, or a machine's), the brain produces a characteristic voltage wave over the fronto-central scalp, strongest at **FCz** and **Cz**. It comes from the anterior cingulate cortex, the brain's "error monitor".

Types:
- **Response ERN/Ne:** after your *own* wrong movement.
- **Feedback ErrP:** after being told an outcome was bad.
- **Interaction ErrP:** when an **interface** does something you did not intend. **This is SilentAssist's case**: the home turns on the wrong light.
- **Observation/monitoring ErrP:** watching an autonomous agent make a mistake. **This is our dataset's case.**

### 5.2 The shape: Ne and Pe

Error-minus-correct difference wave at FCz (literature: Ferrez & Millán 2008; Chavarriaga & Millán 2010):

```
  µV
  +6 |                    Pe (~320-350 ms)
     |                   /\
  +2 |    small +        /  \
     |   (~200 ms)/\    /    \
   0 |-----------/--\--/------\------_____------> time after feedback
     |               \/        \    /
  -2 |               Ne         \__/  late negativity (~430-500 ms)
     |          (~250-270 ms)
```

- **Ne** (error negativity): sharp negative peak at about 250–270 ms.
- **Pe** (error positivity): larger positive peak at about 320–350 ms.
- Band: slow waves, **1–10 Hz**.
- Real grand-average amplitudes are small: the first negativity is about **−1.5 to −4 µV** in published data.
- In people with spinal cord injury, ErrPs are about **5× smaller** (Keyl et al. 2019: wN1 −0.27 µV vs −1.55 µV in controls). This is an important honesty caveat for our target users.

### 5.3 The README's −8.4 µV

The README says `ErrP Deflection at FCz (-8.4 µV)`.
- As a **grand-average** Ne, −8.4 µV would be about twice the largest value reported. Not plausible.
- As a **single-trial minimum** (one noisy epoch = ERP + background EEG), it is plausible.
- So we define it (ADR 0002 D20) as: **"single-trial FCz minimum, 200–350 ms in filtered-signal time (causal 1–10 Hz, CAR, baseline −0.2–0 s); descriptive only; detection uses 72 multichannel features."**
- In **Scripted** mode the value is **computed** from a synthetic epoch that was chosen (by seed search) to have exactly −8.4 µV at FCz and to be genuinely detected by the trained detector. It is not a hard-coded string.
- In **Replay** mode the UI shows the **measured** value of the real epoch, with the caption "descriptive single-trial value; detection uses 72 features; q = …".
- **Verified on screen (2026-10-14):**
  - **Scripted:** the note reads "ErrP epoch: Synthetic (generated, SYN-error-seed509; seed selected to show the README value; α = 1.0; synthetic TPR 0.51 / FPR 0.005 at π = 0.18) · FCz value is a descriptive single-trial minimum; detection uses 72 features; q = 0.80". Screenshot: `docs/verification/s5-rollback-1366x768.png`.
  - **Replay:** the note reads "ErrP epoch: Replay (BNCI 013-2015, BNCI013-S01s2-t018) · FCz value is a descriptive single-trial minimum; detection uses 72 features; q = 0.60", with a measured "FCz (-21.8 µV)". Screenshot: `docs/verification/demo-replay-errp-1366x768.png`.

### 5.4 The dataset: BNCI 013-2015 (Monitoring ErrP)

| Fact | Value |
|---|---|
| Authors | Chavarriaga & Millán (2010) |
| Paradigm | **Observation**: a cursor moves on a screen toward a target; about **20 %** of moves go the wrong way; the subject only watches |
| Subjects / sessions | **6** subjects × **2** sessions, recorded 50–643 days apart |
| EEG | **64** channels (Biosemi), **512 Hz** |
| Trials | 10 blocks per session, about 50 trials per block |
| Labels | event codes 5 and 10 = correct; **6 and 9 = error** |
| Licence | **CC BY-NC-ND 4.0** (embedding excerpts "pending supervisor confirmation") |
| Paper's own baseline | session 1 → session 2: TNR 75.81 %, TPR 63.21 %, so balanced accuracy ≈ 69.5 %, LR+ = 2.61 |

Why this dataset: free with no login (the Kaggle ErrP dataset needs a login, which our rules forbid), error rate close to our MI error rate, two sessions far apart (so a real cross-session test, like SD for MI), and published baselines on the same data.

Honest mismatch: it is **monitoring**, not **interaction**. The literature reports similar waveforms, but this is a documented dataset shift.

### 5.5 The detector pipeline (ADR 0002 D4–D5)

```
 epoch: 64 ch, -1.0 s ... +0.8 s around the event (922 samples @ 512 Hz)
   |
   | CAR: subtract the mean of all 64 channels at each time point
   | causal 4th-order Butterworth 1-10 Hz (sosfilt, online-valid)
   | baseline: subtract the mean of -0.2 ... 0 s
   v
 8 channels: Fz, FC1, FCz, FC2, C1, Cz, C2, CPz
 9 windows:  0.20-0.30, 0.25-0.35, ... 0.60-0.70 s  (100 ms each, 50 ms step)
 feature = mean amplitude in each window   -> 8 x 9 = 72 features
   |
   v
 shrinkage LDA (sLDA): score = w . x + b
   |
 Platt scaling -> q_tr = P(error | x) at the training error rate
   |
 prior shift to the current situation's prior pi -> q
   |
 decision: roll back iff q > max(t*, pi)
```

- **CAR** (common average reference) removes signals common to all channels.
- **Causal** filter (only past samples) is used instead of zero-phase filtering, because a real system cannot look into the future. Training, evaluation, export and the browser all use the **same** pipeline.
- **Shrinkage LDA:** linear discriminant analysis where the covariance estimate is "shrunk" toward a simpler matrix. With 72 features and only a few hundred trials, plain LDA would overfit; shrinkage fixes that. It was the most robust method across 11 ErrP datasets (Yasemin et al. 2023), and it is trivial to run in JavaScript (a dot product).
- **Platt scaling:** a logistic regression on the sLDA scores, fitted on out-of-fold scores, so that q is a calibrated probability.
- **Evaluation:** primary = cross-session (train session 1, test session 2) per subject. Selection and calibration use leave-one-block-out inside session 1 only. Session 2 is never used for any choice. Labelled "paper-like, not paper-identical". A 1,000-permutation test checks that the **within-session** (session-1 leave-one-block-out) AUC is above chance, with labels permuted across the whole session. The cross-session result is not permutation-tested.
- **Deployment subject:** chosen among S01, S03, S05, S06 by session-1 AUC. **S02 and S04 are ineligible** because their session-2 EEG was looked at during design (a pre-registered contamination rule).
- **Success band (pre-registered):** mean cross-session balanced accuracy ≥ **64.5 %** (the paper's 69.5 − 5 pp), and AUC above the 95th permutation percentile for at least 5 of 6 subjects.

**Our ErrP results (PRELIMINARY, Plan B; run `errp-B-slda-20261014-160835-36b562d0`; full table in `docs/errp.md` §3):**

| Measure | Result | Target / paper |
|---|---|---|
| Cross-session balanced accuracy (session 1 → 2, threshold chosen on session 1), mean ± SD over 6 | **0.710 ± 0.092** | ≥ 0.645 (**met**); paper ≈ 0.695 |
| Session-2 AUC, mean ± SD | 0.780 ± 0.099 | — |
| Within-session S1-LOBO AUC > 95th percentile of the permutation null | **6 of 6** subjects (p = 0.001, the floor for 1000 permutations) | ≥ 5 of 6 (**met**) |
| Deployed subject S01 | S2 AUC 0.890, BA 0.823 (TPR 0.761, TNR 0.886) | — |
| Mode gate | auto-rollback for 5 subjects; S06 → flag only | — |
| Synthetic demo epoch (seed 509) | FCz minimum −8.42 µV; q = 0.672 / 0.803 / 0.912 at π = 0.10 / 0.181 / 0.36 (rollback at all three); correct epoch q ≤ 0.085 (keep) | — |
| JS vs Python on the shipped bytes | features ≤ 6.2e-15 µV, q ≤ 4.4e-16 | ≤ 1e-6 |

**Wording to use:** "6/6 within-session permutation-significant; cross-session BA 0.71 ± 0.09, not permutation-tested". Never say "6/6 cross-session significant". Caveat: S02 and S04 session-2 EEG was viewed during design, so they were excluded from deployment selection.

### 5.6 Prior shift: why the same epoch can mean different things

q_tr is calibrated at the training error rate π_tr (about 0.20). In SilentAssist, the **prior** π (how likely the action was wrong *before* looking at the EEG) depends on how confident the system was:

  **π = 1 − c**, where c is the policy's combined confidence. Canonical: π = 1 − 0.819 = **0.181**.

Prior shift (Saerens et al. 2002):
  Λ = [q_tr / (1 − q_tr)] × [(1 − π_tr) / π_tr]    (likelihood ratio: how much the EEG favours "error")
  q = Λπ / (Λπ + 1 − π)

**Worked example (illustrative numbers):** q_tr = 0.70, π_tr = 0.20.
- Λ = (0.70/0.30) × (0.80/0.20) = 2.333 × 4 = **9.33**.
- At π = 0.181: q = 9.33 × 0.181 / (9.33 × 0.181 + 0.819) = 1.689 / 2.508 = **0.673**.

### 5.7 The cost-based threshold (do not just use 0.5)

Rolling back has costs both ways:

| | Rolled back | Kept |
|---|---|---|
| **Action was wrong** | C_TP: cost of recovering (Retry) | **C_FN**: wrong state stays (missed error) |
| **Action was right** | **C_FP**: a correct action is undone and must be redone | 0 |

The Bayes-optimal rule (Elkan 2001): roll back iff

  **q > t\* = C_FP / (C_FP + C_FN − C_TP)**

Costs are measured in **MI tokens** (how many extra imagined movements the patient must make), computed automatically from the screen graph (shortest paths), not typed by hand.

**Worked example: the README light case (`light-select`, ADR 0002 D13):** C_FP = 5, C_FN = 7, C_TP = 2.92.

  t* = 5 / (5 + 7 − 2.92) = 5 / 9.08 = **0.551 ≈ 0.55**

Continue the illustrative example: q = 0.673 > max(0.55, 0.181) → **roll back**.

**Extra floor q > π:** this is the same as Λ > 1, i.e. the EEG must favour "error". Evidence that favours "correct" can never cause a rollback.

**The uncomfortable but honest finding.** Rollback only beats "never roll back" if the detector's likelihood ratio LR+ = TPR/(1 − TNR) exceeds a break-even value:

  break-even LR+ = [(1 − π)/π] × C_FP / (C_FN − C_TP) = (0.819/0.181) × 5/4.08 = **≈ 5.5**

Published detectors have LR+ of 2.61 (Chavarriaga 2010) to 5.15 (Ferrez 2008), **below** this break-even. So a fixed operating point could do more harm than good. That is why we use the **per-epoch Bayes rule on calibrated q** (only very confident detections roll back), plus a per-subject **mode gate**: if a nested check on session 1 says auto-rollback would raise the expected cost, the mode becomes `'flag'` (show "Possible Error Detected • not rolled back (flag only)" and log it, with no state change). Scripted mode is always `'auto'` so the README path is reproduced.

Other cost classes:
- `setting` (fan speed, TV channel/volume, brightness), Low tier: t* = 1.0, so **never auto-rolled back**; flag only.
- `preset` (e.g. Night Mode): t* ≈ 0.29, with the q > π' floor.
- **High-tier, caregiver-approved actions are never auto-rolled back** (two humans approved them); the ErrP is logged only.
- At most **one** automatic alternative per episode; a second rollback returns to Home and writes a caregiver-visible log entry.

### 5.8 How "Simulate ErrP" stays honest

- `[Simulate ErrP]` **injects an epoch** (synthetic error epoch in Scripted mode; a real error epoch in Replay). The detector computes q and decides. It **never just flips a flag**.
- If the detector disagrees (q below the threshold), the UI says so ("detector disagreed") and does **not** force a rollback.
- `[No ErrP]` injects a correct epoch the same way.
- The synthetic epochs are generated in Python from the deployment subject's real statistics (background covariance, ErrP latencies and topographies), with literature-sized caps (|Ne| ≤ 4.1 µV, Pe ≤ 8 µV), and the seed is chosen deterministically.

**Seedhi baat:** ErrP dimagh ka "yeh ghalat hua" signal hai, FCz/Cz pe, ~250 ms pe negative (Ne) aur ~330 ms pe positive (Pe), 1–10 Hz. −8.4 µV ek single trial ki value hai, average nahi. Detector: 8 channel × 9 window = 72 features → shrinkage LDA → Platt → prior shift → rollback sirf tab jab q > max(t*, π); light ke liye t* = 5/(5+7−2.92) ≈ 0.55. Dataset BNCI 013-2015 (6 log, 64 channel, 512 Hz). Imaandari: aam detector ka LR+ break-even (≈5.5) se kam hai, is liye sirf bohat confident detection pe rollback.

---

## 6. The CogLign knowledge graph

**Job:** turn a decoded *intent* ("Turn On Light") into a *specific device* in context (`:BedroomCeilingLight`), with a score that can be explained.

### 6.1 RDF in one minute

**RDF** stores knowledge as **triples**: *subject – predicate – object*. Every fact is one small sentence.

```
 :BedroomCeilingLight   a                    sa:CeilingLight .
 :MasterBedroom         bot:containsElement  :BedroomCeilingLight .
 :BedroomCeilingLight   rdfs:label           "Bedroom Ceiling Light" .

     (:MasterBedroom) --bot:containsElement--> (:BedroomCeilingLight) --a--> (sa:CeilingLight)
```

- Names are **IRIs** (web-style identifiers). `:BedroomCeilingLight` is short for `https://silentassist.example/home#BedroomCeilingLight`.
- A set of triples is a **graph**: subjects and objects are nodes, predicates are labelled edges.
- `a` is short for `rdf:type` ("is a").

### 6.2 Turtle: the file format

**Turtle** (`.ttl`) is a compact, human-readable way to write RDF:
- `@prefix` declares short names;
- `;` repeats the subject with a new predicate;
- `,` repeats the subject and predicate with a new object;
- `.` ends the statement.

```turtle
@prefix saref: <https://saref.etsi.org/core/> .
@prefix bot:   <https://w3id.org/bot#> .
@prefix sa:    <https://silentassist.example/ns#> .
@prefix :      <https://silentassist.example/home#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .

:BedroomCeilingLight a sa:CeilingLight ;
    rdfs:label "Bedroom Ceiling Light" ;
    saref:hasFunction sa:OnOffFunction , sa:DimmingFunction ;
    sa:hasRiskTier sa:LowRisk .
```

Our canonical file is `kg/silentassist.ttl` (about 470 triples). The browser gets a byte-identical copy in `POC/js/kg/ontology.js`, and a test checks that they match.

### 6.3 SAREF, BOT and SOSA: why use standards

| Vocabulary | What it models | Example use |
|---|---|---|
| **SAREF** v4.1.1 (ETSI smart-appliance ontology) | devices, functions, commands, states | `saref:hasFunction`, `saref:hasStateOfInterest`, `saref:hasStateValue` |
| **BOT** (W3C Building Topology Ontology) | buildings, storeys, rooms | `bot:containsElement` (room → device) |
| **SOSA** (W3C sensors/observations) | observations | the room-selector observation (where the user is), ErrP observations |
| `sa:` (ours) | our extensions | risk tiers, thermal rule, ErrP feedback, history |

Why standards: other systems can understand our data, the modelling choices are already tested by experts, and examiners like it. Details:
- SAREF v4.1.1 **deleted** old terms like `saref:OnState` and `saref:LightingDevice`, so we mint `sa:On`, `sa:Off`, `sa:Standby` instead.
- We **copy** only two upstream axioms (Actuator ⊑ Device, Appliance ⊑ Device) instead of importing whole ontologies.

**Home model (ADR 0003 D18):** two rooms. **Master Bedroom** has the Bedroom Ceiling Light, Bedside Lamp, Ceiling Fan, Air Conditioner and **Smart TV** (the user is bed-bound). **Living Room** has the Living Room Light.

### 6.4 SPARQL: querying the graph

**SPARQL** is the query language for RDF, like SQL for tables. You write a **pattern** with variables (`?x`), and the engine finds every way to match it.

**The real panel query (competency question CQ5, "candidates for Turn On Light"):**

```sparql
SELECT ?device ?label ?room ?active WHERE {
  ?device a sa:Light ; rdfs:label ?label ;
          saref:hasFunction ?fn ; saref:hasStateOfInterest ?soi .
  ?fn saref:hasCommand sa:TurnOn .
  ?soi saref:hasStateKind sa:PowerState ; saref:hasStateValue ?v .
  ?v sa:isActive ?active .
  OPTIONAL { ?room bot:containsElement ?device . }
} ORDER BY ?label
```

Read it as: "find every device that **is a Light**, has a function that supports **TurnOn**, and has a power state; give me its label, its room (if any) and whether it is currently on".

Expected answer (reset state):

| ?device | ?room | ?active |
|---|---|---|
| `:BedroomCeilingLight` | `:MasterBedroom` | false |
| `:BedsideLamp` | `:MasterBedroom` | false |
| `:LivingRoomLight` | `:LivingRoom` | true |

The `?device a sa:Light` line is a **hard type gate**: a fan can never be a candidate for "Turn On Light". `sa:CeilingLight` is a subclass of `sa:Light`; the store **materialises** subclass typing at load time, so this simple pattern finds both ceiling lights and lamps.

**Our engine** (already built and tested, no external library): `turtle.js` (parser), `triplestore.js` (indexed store with SPO/POS/OSP indexes), `sparql.js`. Supported: PREFIX, SELECT [DISTINCT], basic graph patterns, OPTIONAL, FILTER, ORDER BY, LIMIT, OFFSET. Unsupported features throw "Unsupported SPARQL feature". Libraries like Comunica or Oxigraph were rejected because they are too big or need ES modules/wasm, which `file://` blocks. The panel shows **the exact query string that ran** (a selftest checks this).

### 6.5 The resolver score and the 0.94 arithmetic

**Score (ADR 0003 D6):**

  **S(d) = gate(d) · (0.35·f_T + 0.30·f_S + 0.20·f_X + 0.15·f_R)**

| Feature | Meaning | Weight |
|---|---|---|
| f_T | type matches the intent (is a Light) | 0.35 |
| f_S | device is in the **active room** (Master Bedroom) | 0.30 |
| f_X | the command would **change** its state (Turn On a light that is OFF) | 0.20 |
| f_R | **recency/habit**: share of the last 10 confirmed "turn on light" actions | 0.15 |

The seeded history (labelled "Synthetic seed history" in the UI) is 10 events: 6 ceiling, 2 lamp, 2 living.

**Canonical arithmetic:**

| Candidate | f_T | f_S | f_X | f_R | S |
|---|---|---|---|---|---|
| Bedroom Ceiling Light | 1 | 1 | 1 (OFF → ON) | 6/10 | 0.35 + 0.30 + 0.20 + 0.15 × 0.6 = **0.94** |
| Bedside Lamp | 1 | 1 | 1 | 2/10 | 0.35 + 0.30 + 0.20 + 0.03 = **0.88** |
| Living Room Light | 1 | 0 | 0 (already ON) | 2/10 | 0.35 + 0 + 0 + 0.03 = **0.38** |

**What is pinned and what we chose (be honest about this in the viva):**
- The ceiling light is perfect on type, space and state. So the README's 0.94 pins exactly one thing: **w_R × (1 − f_R) = 0.06**.
- **Our free choice:** w_R = 0.15 with f_R = 6/10. (w_R = 0.20 with f_R = 7/10 would also give 0.94.)
- **Weight order** 0.35 > 0.30 > 0.20 > 0.15 follows the cue order type > space > state > habit.
- **Computed live, but calibrated to hit 0.94 (say both halves):** S is recomputed from SPARQL results on every decision, so it is not a hard-coded string. However, the weights and the synthetic 6/10 history were *chosen* so that the canonical case lands on the README's 0.94. The computation is genuine; the target was fixed by the README. Sensitivity: f_R = 0.4, 0.5, 0.6, 0.7, 0.8 gives S = 0.91, 0.925, 0.94, 0.955, 0.97. A Node unit test (`kg/tests/resolver.test.js`, "history mutation moves S") changes the history and checks that S changes. In the demo, after "Retry → Bedside Lamp" is confirmed, the history becomes 5/10 and 3/10, and the scores become 0.925 and 0.895.

### 6.6 From 0.94 to "Semantic Context (89%)"

  **s = round2( S × P(active room) ) = round2(0.94 × 0.95) = round2(0.893) = 0.89 → "89%"**

- P(active room) = 0.95 is the confidence of the (simulated) room-selector observation.
- Honest disclosure: given 0.94, the README's 89 % forces P(room) to lie between 0.9415 and 0.9521, so **0.95 is README-pinned**.
- We round to 2 decimals because the policy uses the **displayed** number, so anyone can redo the panel maths by hand: 0.92 × 0.89 = 0.8188 ≈ 0.819.

### 6.7 The ErrP penalty, and why Bedside Lamp is offered

After a rollback we need (1) an **alternative to offer now**, and (2) a **memory** so the system does not keep making the same mistake.

**(1) Episode layer, the offer:** the alternative = the best candidate **excluding** the one just rolled back (the "second-best rule", Perrin et al. 2012). Here: Bedside Lamp (0.88).

**(2) Persistent layer, the penalty (ADR 0002 D18):**

  S'(d) = S(d) × M(d),  M(d) = max(0.5, min(1, Π_k Λ_k^(−γ · 2^(−n_k/20))))

- Λ_k is the ErrP likelihood ratio of observation k (how strongly the EEG said "error"); γ = 0.5.
- n_k = how many decisions have happened in the same (room, command) context since then, so the penalty **fades after about 20 interactions** (half-life 20). It counts interactions, not minutes, so the demo is deterministic.
- **Floor 0.5:** one ErrP can at most halve a score.
- **Worked example (using the illustrative Λ = 9.33 from 5.6):** Λ^(−0.5) = 0.327 → clamped to the floor **0.5**. Ceiling light: 0.94 × 0.5 = **0.47 < Bedside Lamp 0.88**. The ranking flips, and it agrees with the second-best rule.
- In fact, any `light-select` rollback at π = 0.181 needs Λ > about 5.5, which always hits the 0.5 floor, so in the canonical case the flip is guaranteed.
- **M is used for ranking and display only. It never changes the s that feeds the policy.** Otherwise one false rollback could push c below 0.50 and lock the user out (REJECT forever).
- Its only policy effect is the **h-flag**: if M < 0.9, an EXECUTE becomes CONFIRM (one extra Both-Feet token as a safety check).
- The panel always shows the unpenalised score plus a trace line, e.g. `ErrP memory ×0.50 (ranking only) → CONFIRM`.
- `[Reset Demo]` clears the memory.

### 6.8 Competency questions

16 competency questions (CQ1–CQ16) define what the KG must answer, each with a SPARQL query and an expected answer, run as tests under Node and in `?selftest=1`. Examples: "which lights are on" (CQ1), "devices in the active room" (CQ2), "is 17 °C a thermal hazard" (CQ11: yes; 18, 24 and 30: no), "what would All Lights Off change" (CQ14: only Living Room Light ON → OFF), "what ErrP feedback exists" (CQ15: none at reset; after `[Simulate ErrP]`, one row whose posterior equals the detector's q).

**Seedhi baat:** Knowledge graph RDF triples (subject–predicate–object) mein ghar ko describe karta hai, Turtle file mein, SAREF/BOT standards ke saath. SPARQL se "kaunsi lights Turn On ho sakti hain" poochte hain. Score = 0.35·type + 0.30·room + 0.20·state + 0.15·habit; ceiling light = 0.35+0.30+0.20+0.15×0.6 = 0.94, lamp 0.88. Semantic 89% = 0.94 × 0.95. ErrP ke baad ceiling ka score ×0.5 (0.47) ho jata hai, is liye Bedside Lamp (0.88) offer hota hai — lekin yeh penalty sirf ranking mein hai, policy ke s mein nahi.

---

## 7. Policy and safety

### 7.1 The product rule

  **c = round4( n × s )**

- n = neural confidence (the slider in Scripted mode, default 0.92; the calibrated SFE-GAT softmax in Replay).
- s = semantic context (0.89 in the canonical case).
- Canonical: c = 0.92 × 0.89 = **0.8188**, shown as **0.819**.

**Why a product?** Both must be good. If either the brain decoding *or* the context is weak, c drops. Alternatives considered and rejected (ADR 0003 D12):
- **weighted average**: "compensatory", so a very confident KG could hide a bad neural decode;
- **min**: throws information away;
- **log-odds (Bayesian) combination**: gives 0.989, which is overconfident because s is not a true probability.

Honest caveat: s is a heuristic score times a simulated room confidence, so c is a **monotone confidence, not a calibrated probability**.

### 7.2 The decision procedure (first matching rule wins)

```
 1. no-op? (command would not change anything)      -> REJECT ("No change: ... already ON")
 2. n < 0.40  or  c < 0.50                           -> REJECT ("Not sure, please try again")
 3. tier = High                                      -> CAREGIVER APPROVAL
 4. tier = Medium:  c >= 0.85 -> EXECUTE, else CONFIRM
 5. tier = Low:     c >= 0.75 -> EXECUTE, else CONFIRM
 6. EXECUTE and ErrP h-flag (M < 0.9)                -> CONFIRM
```

**Where 0.75 and 0.85 come from:** Chow's rule (act only if the chance of error is worth less than the cost of asking): c > 1 − C_confirm / C_err. With C_confirm = 1.17 tokens (the expected cost of a confirm step) and assumed error costs of 5 tokens (Low) and 10 tokens (Medium), this gives 0.77 and 0.88. We **rounded down** to 0.75 / 0.85 and disclose it. Rounding down keeps a 0.069 margin for the canonical case and keeps in-band AC steps (c = 0.874) at EXECUTE.

**The policy takes no credit for ErrP.** We do not lower thresholds because "ErrP will catch mistakes anyway". The two safety layers stay independent.

**Values the demo will hit (ADR 0003 D14):**

| Case | n | s | c | Tier | Decision |
|---|---|---|---|---|---|
| Canonical README | 0.92 | 0.89 | 0.819 | Low | **EXECUTE** |
| Neural slider 80 | 0.80 | 0.89 | 0.712 | Low | **CONFIRM** |
| Neural slider 60 | 0.60 | 0.89 | 0.534 | Low | CONFIRM |
| Neural slider 55 | 0.55 | 0.89 | 0.490 | Low | **REJECT** |
| Neural slider 35 | 0.35 | — | — | — | **REJECT** (neural floor) |
| Retry → Bedside Lamp | 0.92 | 0.84 (0.88 × 0.95) | 0.773 | Low | **EXECUTE** (margin 0.023) |
| AC Temp − within 18–30 °C | 0.92 | 0.95 | 0.874 | Medium | **EXECUTE** |
| AC Temp − from 18 to 17 °C | 0.92 | 0.95 | 0.874 | **High** | **CAREGIVER APPROVAL** |
| Turn Off Living Room Light from the bedroom | 0.92 | 0.57 | 0.524 | Low | CONFIRM |
| Re-select ceiling light after a false rollback | 0.92 | 0.89 | 0.819 | Low | EXECUTE → h-flag → **CONFIRM** |
| Turn On a light that is already ON | — | — | — | — | **REJECT** (no-op) |

(Note: ADR 0005 quotes c = 0.769 for Retry using the unrounded s = 0.836. The policy ADR 0003 rounds s first, giving 0.773. Both are EXECUTE.)

**What CONFIRM looks like:** a one-option dialog "✓ Confirm: Turn On Bedroom Ceiling Light", with the diff line and the policy's reason. **Both Feet** confirms, **Tongue** cancels, Left/Right just re-prompt. There is no Cancel card for a stray NEXT to land on, and no time-out that could execute by itself. Cost: one extra token nominally, about 1.175 tokens expected (because MI decoding is not perfect).

### 7.3 Risk tiers

| Device / action | Tier | Label |
|---|---|---|
| Lights (on, off, brightness), Ceiling Fan, Smart TV | **Low** | `Low: Autonomic` (README) |
| Air Conditioner: power, mode, setpoint in [18, 30] °C | **Medium** | `Medium: Guarded` |
| Air Conditioner: setpoint **< 18 °C or > 30 °C** | **High** | `High: Caregiver Approval` |

Presets take the **highest tier of their steps**, computed live: Night Mode Medium, All Lights Off Low, Cooling Mode Medium, Watch TV Low.

Tiers are stored on the **device** (`sa:hasRiskTier`), not on the command, because the same command "TurnOn" is Low for a light but Medium for the AC.

### 7.4 The thermal rule

- People with SCI or ALS often have **impaired thermoregulation** (they cannot sweat or shiver normally), so extreme AC settings are a genuine hazard.
- Rule: a setpoint **below 18 °C or above 30 °C** (strict: 18 and 30 are safe) makes the action **High → CAREGIVER APPROVAL**. It is applied to every SetTemperature, including preset steps, whatever the AC's power state.
- Advisory band: setpoints in [18, 20) or (26, 30] get a one-line advisory ("outside the 20–26 °C comfort band"), with no tier change.
- Demo: the AC starts at 24 °C. The 6th Temp − press reaches 18 °C (Medium, EXECUTE); the **7th reaches 17 °C (High → caregiver)**. The AC range is 16–32 °C so the UI can actually reach the hazard.
- While waiting, the patient sees "Waiting for caregiver approval" with the rule that fired, and can withdraw with Tongue. A request is **never auto-approved**; it expires after 5 minutes.

### 7.5 Rollback (sagas)

Every actuation is recorded as a **saga**: a list of steps, each with the device's state **before** and **after**.

```
 execute:   step1 (Living light ON->OFF), step2 (AC 24->25)      [Night Mode]
 rollback:  undo step2 (AC 25->24), then undo step1 (OFF->ON)    reverse order
```

- Rollback is **atomic**: all steps are compensated in reverse order, comparing the state before each compensation.
- Compensations bypass the policy (they restore a known safe state), but a compensation that would *enter* a hazardous state goes to the caregiver.
- Rollback is triggered only by the ErrP detector's decision (Section 5), never by a hidden flag.

### 7.6 The tamper-evident audit log (hash chain)

Each log entry stores the **hash of the previous entry** plus its own content, and its own hash is computed over both:

```
 entry 1: {seq:1, type, data, prev: 000...}       -> h1 = SHA-256(canonical JSON)
 entry 2: {seq:2, type, data, prev: h1}           -> h2 = SHA-256(...)
 entry 3: {seq:3, type, data, prev: h2}           -> h3 = SHA-256(...)
```

- If anyone edits entry 2, its hash changes, so entry 3's `prev` no longer matches. Verification walks the chain and reports **"Chain broken at #2"**. Otherwise it shows **"Chain verified ✓ (SHA-256)"**.
- Hashing uses the browser's `crypto.subtle` (SHA-256). If that is unavailable, it falls back to FNV-1a, labelled honestly as "integrity only, not tamper-proof".
- Canonical JSON (sorted keys) means the same content always gives the same hash.
- The dashboard has `[Verify chain]` and `[Tamper demo]` buttons.
- `[Reset Demo]` **appends** a RESET entry; it never wipes the log (append-only).
- Limitation to admit: a hash chain detects edits, but someone who can rewrite the *whole* chain could recompute all hashes. A keyed version (HMAC with a caregiver PIN) is listed for post-mid-eval.

**Seedhi baat:** c = n × s (0.92 × 0.89 = 0.819). Pehle no-op aur kam confidence (n < 0.40 ya c < 0.50) REJECT; High risk → caregiver; Low mein c ≥ 0.75 EXECUTE warna CONFIRM; Medium mein 0.85. AC 18 se neeche ya 30 se upar = High (thermal hazard). Rollback saga hai — saare steps ulti tarteeb mein wapas. Audit log hash chain hai: kisi entry ko chhero to chain toot jati hai.

---

## 8. The prototype (`POC/`)

**Status note:** the browser build is complete and verified: headless Edge selftest 76/76, with results in `docs/verification.md`. This section explains the **design**. The exact demo keystrokes are in README §8 "Live Demo Script (5 min)". One known gap: on the trained model the brain graph does **not** visibly evolve (evo0 = evo3), and the caption says so.

### 8.1 How it runs

- Double-click `POC/index.html`. It runs from `file://`, **offline**, in Edge (the verified viva browser) or Chrome. No server, no install, no internet.
- Because of `file://`, browsers block ES modules (`import`) and `fetch()` of local files. So:
  - every JS file is a **classic script**, wrapped in an **IIFE** (immediately invoked function expression) that registers itself on a global namespace `window.SA`:

    ```js
    (function (root) {
      'use strict';
      var SA = root.SA = root.SA || {};
      SA.kg = SA.kg || {};
      /* ... module code ... */
    })(typeof window !== 'undefined' ? window : globalThis);
    ```
  - the `typeof window` trick lets the **same file** load in the browser *and* in Node.js for tests;
  - data the browser needs (model weights, replay trials) is exported by Python as **JS files** that assign to `SA.data.*` (Float32, little-endian, base64);
  - `index.html` loads about 80 scripts in a fixed dependency order.
- **No module touches the DOM at load time.** DOM work happens only in `init()` after `DOMContentLoaded`. This is what lets Node load every file without a browser.
- Files stay under about 400 lines (hard limit 450), one responsibility each.

### 8.2 How modules talk: `SA.bus` and `SA.store`

```
  keyboard / harness            eeg/decoder              ui/navigator
  "input:token"  ------------>  "eeg:decoded"  -------->  moves focus / selects
                                                              |
                                                     "ui:actionRequested"
                                                              v
                    safety/episode: KG resolve -> policy decide -> execute
                                    -> ErrP observe -> keep / roll back
                                                              |
                      "device:stateChanged", "errp:observed", "audit:appended"
                                                              v
                                    UI screens, KG mirror, caregiver dashboard
```

- **`SA.bus`**: a simple publish/subscribe event bus (`on`, `once`, `emit`). Events emitted during a dispatch are queued, so the order is deterministic.
- **`SA.store`**: the single home model (devices, UI focus, decoder settings, telemetry). Each top-level slice has **exactly one writer**; writing someone else's slice throws an error.
- **UI modules never call the brain/KG/policy modules directly.** They only read the store and listen to the bus. A grep test enforces this. This is good software engineering: you can replace the decoder without touching the UI.
- All tunables (thresholds, weights, timings, initial state) live in `SA.config`; model constants (τ, η, filter coefficients) come only from the exported model manifest, so a re-export cannot silently break parity.

### 8.3 Three decoder modes

| Mode | What drives the tokens | Pill | Use |
|---|---|---|---|
| **Scripted** (default, and the Reset state) | Operator keys/buttons; confidence from the sliders (92 / 89) | `EEG: Simulation Mode` | Reproduces the README exactly |
| **Replay** | A **real held-out** BCI IV-2a trial (A01, session E) run through the **in-browser SFE-GAT forward pass** | `EEG: Replay Mode (BCI IV-2a A01, session E)` | Shows real decoding, prediction next to the truth |
| **Synthetic** | Generated 22-channel EEG with class-specific ERD | `EEG: Synthetic Mode (generated, seed n)` | Pipeline demonstration only, no accuracy claim |

Key honesty rules:
- In Replay, the harness button **"Decode trial ► inject token"** decodes a trial; **if the model is wrong, the wrong token acts for real** (we never override a mis-decode with the right answer). The strip shows e.g. `Pred: Both Feet (0.71) • Truth: Both Feet ✓/✗ · PRELIMINARY (Plan B)`. (That example is the ADR's illustration, not a result.)
- The README keys and buttons always emit their labelled token (scripted), in every mode.
- The replay set is **20 trials** (5 per class), the **first** eligible trials in A01E order, **never selected by correctness**. A test checks that every exported trial hash matches an A01**E** trial and none matches A01**T** (no training data shown as "held-out").
- If weights are still a stub, the UI shows a red **"STUB WEIGHTS — not a trained model"** banner. The current `errp-model.js` on disk is marked `stub: true`, so the real trained export must replace it before Replay ErrP numbers are shown.
- **Parity requirement:** the JS forward pass must match PyTorch within **1e-4** on the logits (target ~1e-9). If parity is not green, Replay is disabled and shown as "parity pending", never faked.

### 8.4 Screens

| Screen | Contents (README-exact titles) |
|---|---|
| S1 Mode Selection | Visual Navigation, Audio-Assisted Navigation |
| S2 Assistive Home Hub | Lights (1 Active of 3), Fans (Ceiling Fan: OFF), Air Conditioner (24°C • Cool Mode), TV & Media (Smart TV: Standby), Presets (4 Multi-Device Semantic Routines) |
| S3 Lights Fixtures | Bedroom Ceiling Light (OFF), Bedside Lamp (OFF), Living Room Light (ON) |
| S4 Actions + CogLign panel | Turn On, Turn Off, Adjust Brightness (25/50/75/100 %), Back |
| Fan / AC / TV screens | Fan: Off/Low/Medium/High. AC: Power, Temp −/+, Mode Cool/Fan/Dry (16–32 °C). TV: Power, Channel −/+ (1–99, wraps), Volume −/+ |
| S5 Result | `OFF ➔ ON`, “Observing post-action EEG...” on FCz/Cz, then the success or rollback path |
| S6 Presets | Night Mode, All Lights Off, Cooling Mode, Watch TV (each shows its device diff before committing) |
| Caregiver Dashboard (`C`) | Approval queue with [Approve]/[Reject], gauges, shadow table, live brain graph, hash-chained audit log |

Below the stage is the **Operator Harness** (labelled "not patient-facing"): the four README token buttons, `[No ErrP]`, `[Simulate ErrP]`, decoder-mode select, sliders, room selector, toggles (voice, ErrP auto-confirm, reduced motion) and `[Reset Demo]`. `[Reset Demo]` restores the exact README initial state (and appends a RESET audit entry).

### 8.5 Accessibility design (ADR 0005)

- **Focus you can see from across the room, without relying on colour:** a 6 px outline, 4 % scale-up, and a "● Focused" text marker.
- Patient text ≥ 20 px, titles ≥ 28 px; WCAG AA contrast; dark, low-glare theme.
- ARIA listbox/option pattern; an `aria-live` caption bar mirrors everything that is spoken.
- Voice: only **offline** local voices (Web Speech API); if none exists, it says "Voice: text only". The display text `-8.4 µV` is spoken as "minus 8 point 4 microvolts".
- Wrap-around lists, an "n of m" position line, focus memory on BACK, no auto-advancing timers, 250 ms debounce, `Space` does not scroll and `Backspace` does not navigate the browser.
- Respects `prefers-reduced-motion`.

### 8.6 The two graph views

- **KG subgraph** (inline SVG, ≤ 8 nodes): patient, two rooms, three lights, the intent; winner "1st · 0.94" (solid ring), runner-up "2nd · 0.88" (dashed), third "3rd · 0.38".
- **Brain graph**: 22-electrode scalp map with FCz and Cz ringed; stage chips evo0 → evo3 each with its **computed** edge count; caption, amended after red-team round 1: "On this model the mask keeps every edge (P ≈ 1), so evo0–evo3 are identical — no pruning learned (PRELIMINARY) • Edges kept by the model's evolution mask (GAE untrained under the paper's CE-only loss) — model behaviour, not neurophysiology". The old wording, "learned mask", was withdrawn because nothing is learned. In Scripted mode it shows a labelled illustrative exemplar, not a fake animation tied to key presses.

### 8.7 Tests (what exists and what is planned)

**Already passing (real results):**
- **DSP parity: 81/81** JS-vs-SciPy cases pass at tolerance 1e-9; worst relative error 1.76e-12 (`research/.cache/parity/dsp_parity_report.json`).
- **Model structure check (2026-10-14):** our PyTorch SFE-GAT has exactly **149,796** parameters, and the 12,576 GAE parameters receive no gradient (137,220 do).
- **Data integrity:** all 18 IV-2a files and all 12 BNCI 013-2015 files pass SHA-256 checks.

**Planned / being built tonight (check `docs/verification.md` for results):**
- `node --check` on every JS file; grep tests (no `fetch`/`import`/CDN; UI never calls domain internals; file length).
- Node loads every script in `index.html` order with no DOM (`load-only`), proving no load-time DOM access.
- SFE-GAT and ErrP **parity tests**: JS logits vs PyTorch within 1e-4.
- KG: TTL ≡ `ontology.js` byte-for-byte; all 16 competency questions.
- Policy: every row of the decision table in Section 7.2; 17 °C → CAREGIVER; 18 and 30 °C → not High.
- Safety: tamper one audit entry → "Chain broken at #k"; reset during an ErrP observation causes no device change.
- **In-page self-test** (`index.html?selftest=1`), run in **headless Edge** with a project-local profile and a virtual time budget; it ends with the sentinel line `SELFTEST-DONE pass=N fail=M`.
- Screenshots at 1366×768 and 1920×1080.

**Results, re-run on 2026-10-14 evening (`docs/verification.md`):**
- Headless Edge in-page selftest: **`SELFTEST-DONE pass=76 fail=0`**.
- Headless Node: pass=71 fail=0 (DOM-only cases skipped).
- Lint and `node --check`: 81 files, 0 problems.
- Node unit tests 54/54; KG tests 54/54; viz DOM 35/35.
- **pytest 103 passed, 1 xfailed** (the documented ErrP segment-vs-continuous deviation).
- **Parity:** DSP 81/81 (worst 1.8e-12); SFE-GAT logits on the trained weights ≤ 9.8e-15 on all 20 replay trials; ErrP q ≤ 4.4e-16. The gate is 1e-4.
- Screenshots of S1, S4, S5 rollback, the caregiver approval and Replay decoding are in `docs/verification/`.
- A 5-minute demo was rehearsed key by key with 0 console errors.

**Seedhi baat:** Prototype `file://` pe offline chalta hai, is liye har JS file IIFE hai jo `window.SA` pe register hoti hai, aur modules sirf `SA.bus` (events) aur `SA.store` (ghar ka data) se baat karte hain. Teen modes: Scripted (README ke exact numbers), Replay (asli held-out EEG trial, browser mein SFE-GAT; ghalat decode bhi asli asar karta hai), Synthetic. Pakke test: selftest 76/76, pytest 103 pass, parity DSP 81/81 aur SFE-GAT logits 1e-14 tak barabar, 149,796 parameters, GAE ko gradient nahi.

---

## 9. Plan B vs Plan A, and honest limitations

### 9.1 Why there are two plans

We train on a **CPU-only laptop** (i7-10510U, 4 cores). Measured cost: about 566 ms per training step per process with 4 processes in parallel. Full LOSO on sessions T + E with 3 seeds would take far longer than one night. So:

| | **Plan B (tonight, for the mid eval)** | **Plan A (after the mid eval)** |
|---|---|---|
| Seeds | 1 (seed 0) | 3 (seeds 0, 1, 2), every seed reported |
| SD | 9 per-subject models | same, × 3 seeds |
| LOSO | **not run** (Plan B as run was SD × 9 + calibration fold 0 only; a disclosed deviation) | T + E (the literal reading of "remaining subjects") |
| Ablations | **none run** | all 5 (PLV-GAT, SFE-GCN, FE-GAT, R-GAT, R-SFE-GAT) |
| Variants | **none run** (V5 was planned) | V1–V12, incl. reconstruction loss (V6), straight-through (V7), τ/η sweep (V8) |
| Label | **"PRELIMINARY (Plan B: 1 seed)"** on every number | FINAL |

**Plan A was designed to be only a config change** (`plan_a.yaml` vs `plan_b.yaml`), so that nobody could say we changed the method after seeing results. **As built tonight that is only partly true.** The model flags (log10 features, residual, dropout, GCN edge weights, `evolve` for FE-GAT) are config switches. But `research/sfegat/train.py` runs only `sd` and `calib` jobs, so LOSO, the ablations other than FE-GAT, V6, V7 and the B0 `floor.py` still need code. Say so if asked. The P0 model itself will not change.

### 9.2 Honest limitations (say these before the examiner does)

**Replication**
1. **Our SD replication is 35.68 % (925/2592) against the paper's 77.70 %: Not reproduced (PRELIMINARY, 1 seed).** Every subject is below the simple B0 floor. With one seed, the run-to-run spread is unknown. SI (LOSO) and the ablations were not run.
2. Test-set sampling noise alone is about ±1.6–1.8 pp on the 9-subject mean (2,592 test trials; 95 % interval) and about ±5.5 pp for a single subject (288 trials). That is tiny compared with a 42 pp gap.
3. τ and η are not given in the paper; ours are documented conventions.
4. The paper's "differentiable sampling" is not realised by its equations or code; the GAE does not learn under CE-only loss. **Measured:** on our trained A01 model the mask keeps 100 % of edges (P ≥ 0.994), so evo0–evo3 are identical, and the brain-graph view says so.
5. CPU timing is not comparable to the paper's RTX 3090 latency.
5a. Plan A is **not yet** a pure config change: LOSO, most ablations, V6 and V7 still need code (see §9.1).

**ErrP**
6. The dataset is **monitoring** (watching a cursor), not **interaction** (your own command going wrong).
7. Only **6 subjects**.
8. People with SCI show ErrPs about **5× smaller**; our target users may give weaker signals.
9. Published detectors sit **below** the cost break-even (LR+ 2.61–5.15 vs ≈ 5.5), so auto-rollback may not always help; we use a calibrated per-epoch rule and a per-subject mode gate.
10. MI and ErrP epochs in Replay come from **different datasets and people**; we never pretend an ErrP was caused by a specific MI trial.

**Knowledge graph and policy**
11. The 0.94 depends on a **synthetic 10-event history** and a **simulated room confidence 0.95** (README-pinned); real interaction logs are needed to calibrate them.
12. c = n × s is a **monotone confidence, not a probability**.
13. The 0.75/0.85 thresholds were rounded down from 0.77/0.88; this is disclosed.
14. Only one person-in-one-home; no multi-user or real device integration.

**Prototype**
15. EEG is never live; Scripted mode is operator-driven.
16. "Caregiver view — simulated, no authentication".
17. Verified in Edge only; Chrome unverified, Firefox untested.
18. Dataset licences (IV-2a unverified; BNCI 013-2015 CC BY-NC-ND) — embedding excerpts is "pending supervisor confirmation".
19. **Not clinically validated** and not a medical device. We use ISO 14971 risk *vocabulary* without claiming compliance.

**How to frame it:** "We designed the evaluation so that the honest answer is visible. Every limitation has a planned next step in the ADRs."

**Seedhi baat:** Plan B aaj raat: 1 seed, sirf SD (LOSO baad mein), har number pe "PRELIMINARY". Plan A baad mein: 3 seeds, LOSO T+E, saari ablations — model flags config mein hain, lekin LOSO, ablations, V6/V7 ka code abhi likhna hai. Kamzoriyan khud pehle bata do: SD sirf 35.68 % (paper 77.70 %, not reproduced), ErrP dataset monitoring hai aur sirf 6 log, SCI mein ErrP chhota, 0.94 synthetic history pe, koi clinical claim nahi.

### 9.3 How to present the replication gap in the viva

The numbers to know by heart are below. Full table: `docs/replication.md`.

| | Ours (P0, Plan B, 1 seed) | Paper |
|---|---|---|
| SD mean | **35.68 % (925/2592), κ 0.1424** | 77.70 %, κ 0.7027 |
| A01 (the browser model) | **34.37 % (99/288)** | 80.21 % |
| Best / worst subject | A09 51.73 % (149/288) / A05 26.38 % (76/288, not above chance) | A03 89.24 % / A02 61.46 % |
| Simple floor B0 (log10 PSD + logistic regression, ad hoc) | ≈ 50 % mean, above P0 on 9/9 subjects | — |
| SI (LOSO), ablations | not run (post-mid-eval) | 66.59 %; Fig. 4 |

**Five talking points. Say them in this order, before the examiner asks.**

1. **"We pre-registered what success means, and we did not meet it."**
   - The ±3 pp / ±5 pp verdict bands (ADR 0001 D16) and the B0 floor were fixed before any result existed.
   - Our 35.68 % is "Not reproduced", and we report it as k/288, floored, next to the paper's Fig. 3a.
   - Nothing was tuned on session E: 500 fixed epochs, last epoch, one evaluation.
   - Showing a failed replication honestly is the scientific result here.
2. **"It is a generalisation failure, not a bug or a leak."**
   - Training accuracy reaches 91–99 %, but on 72 held-out trials from the **same** session T, A01 gets only 37.5 %.
   - So the model memorises 288 trials with about 150 k parameters.
   - JS and PyTorch agree to 1e-14, so the browser runs exactly the model we report.
   - A plain logistic regression on log band power (≈ 50 %) beats it on every subject, which tells us the data pipeline carries signal.
3. **"The likely causes are details the paper leaves open."**
   - The paper states no feature scaling. Raw µV² band powers are heavy-tailed (A01T max 81 µV² vs median 1.75), and there is no BN before the stem.
   - Between sessions, A02's mean band power triples (3.21 → 9.00 µV²).
   - The training script is not public, and the public code differs from the text: residual, dropout 0.2, filter order 5.
   - We say "underspecified", not "wrong".
4. **"The 'structure evolution' cannot learn as written, and we measured it."**
   - The mask is a hard threshold, and the loss is cross-entropy only, so the GAE gets no gradient.
   - On our trained model every edge probability is ≥ 0.994, so evo0–evo3 are identical. The model is functionally FE-GAT.
   - The brain graph on screen says this rather than faking pruning.
   - This is worth only about 2.4 pp in the paper's own ablation, so it is a finding about the paper's claim, not the cause of a 42 pp gap.
5. **"Each hypothesis has a named, pre-registered test."**
   - V10 (log10 features) for the scale problem; V6 (GAE reconstruction loss) and V7 (straight-through mask) for the evolution claim; V5 (the authors' code settings); seeds 1–2; LOSO; ablations; and `floor.py` to log B0 as a registered run.
   - Be honest that LOSO, the ablations, V6 and V7 still need code. Only the model flags are config switches today.
   - The browser keeps working regardless, because it shows the real model's real confidence, labelled PRELIMINARY.

**Do not say:**
- "close to the paper";
- "the paper is wrong";
- "the brain graph shows learned pruning";
- "calibrated" (say "temperature-scaled, T* = 8.0, fit on 72 A01T trials");
- "6/6 permutation-significant cross-session ErrP". The permutation test was within-session; cross-session BA is 0.710 ± 0.092 and was not permutation-tested.

**Seedhi baat:** Seedha bolo: "Humne pehle se tay kiya tha ke ±3 pp ho to reproduced; hamara 35.68 % hai, paper 77.70 % — not reproduced." Phir wajah: overfitting (train 99 %, held-out T par 37.5 %), raw µV² features, session shift, aur GAE ko gradient nahi (sab edges rehte hain). Leak nahi, bug nahi (parity 1e-14). Agla qadam: V10, V6, V7, seeds, LOSO — har ek ka naam pehle se likha hua hai.

---

## 10. 30 viva questions with model answers

Answer in 2–4 sentences. Start with the direct answer, then one reason, then (if useful) where it is documented.

### Big picture

**Q1. What is SilentAssist in one sentence?**
An EEG-based assistive smart-home system for people with severe motor impairment: four imagined movements navigate the interface, a knowledge graph resolves which device is meant, a confidence-gated policy decides whether to act, and ErrP detection rolls back actions the brain flags as errors.

**Q2. Why exactly four commands, and why these four?**
Left hand, right hand, both feet and tongue are the four classes of BCI Competition IV-2a, the dataset our base paper uses, so we can train and evaluate on real data. Four tokens (Next, Previous, Select, Back) are enough to navigate any list-based interface, and fewer classes means higher decoding accuracy.

**Q3. What is the "closed loop"?**
Decode → resolve → decide → act → observe the brain's reaction → keep or roll back. The ErrP stage feeds back into the knowledge graph as negative evidence, so the next decision is better informed.

**Q4. What are the "two graphs"?**
The brain functional-connectivity graph (22 electrodes, PLV edges) that SFE-GAT evolves, and the semantic knowledge graph (rooms, devices, states) that CogLign queries with SPARQL. One is learned per trial; the other is symbolic and persistent.

### SFE-GAT

**Q5. Explain SFE-GAT briefly.**
Each trial becomes a graph: nodes are 22 electrodes with 8 filter-bank band powers as features, and edges come from thresholded z-scored PLV. A stem GATv2 and three evolution blocks refine the node features (GATv2 + BN) and prune the edges (GAE edge probabilities + Monte Carlo mask). A final GATv2, mean pooling, dropout and a linear layer classify the 4 classes. 149,796 parameters.

**Q6. What is PLV and why use it?**
Phase Locking Value measures how consistently two channels keep the same phase difference over time: |mean of e^{iΔθ}|, from 0 (random) to 1 (locked). It captures functional coupling independent of amplitude, which band power alone misses.

**Q7. Why z-score the PLV matrix before thresholding?**
It makes the threshold relative to each trial's own distribution, so every trial keeps a similar fraction of edges regardless of overall synchrony level. We include the diagonal in μ and σ (as Eqs. 2–4 imply) and then zero it.

**Q8. Why Welch instead of a plain FFT?**
A single periodogram has high variance. Welch averages 7 Hann-windowed, 50 %-overlapping 1-second segments, which gives a stable estimate with 1 Hz resolution. The paper's Eq. 7 prints a periodogram, but its text says Welch, and we follow the text.

**Q9. What is the difference between GAT and GATv2?**
In GAT the LeakyReLU is applied after the attention vector, so the ranking of neighbours is the same for every query node ("static attention"). GATv2 applies the nonlinearity before the attention vector, so attention is dynamic. The paper prints the GAT formula, but the parameter counts (2,560 and 33,280) only match GATv2.

**Q10. What does the Monte Carlo edge mask do?**
In training, each edge is kept with probability P from the GAE decoder (keep if P > R, R uniform), which acts like a guided DropEdge regulariser. In evaluation, edges with P > η = 0.5 are kept. Edges are only removed, never added, so *by design* the graph can only get sparser from evo0 to evo3. **On our trained model it does not:** every P ≥ 0.994, so 0 edges are removed in all 3 blocks and evo0 = evo3. The GAE gets no gradient under the paper's CE-only loss. The brain-graph view says this on screen.

**Q11. How do you know the model has 149,796 parameters, and why does it matter?**
We recomputed it from the PyG layer definitions (stem 2,560 + 3 × 37,728 + 33,536 + 516) and checked it on our PyTorch model. It matches the paper's "≈ 0.15M" and the authors' code, and it settles structural ambiguities: heads are concatenated, there is a separate stem layer, and the GAE has a BN(32).

**Q12. Why is κ exactly (acc − 0.25)/0.75 here?**
Cohen's κ = (P_o − P_e)/(1 − P_e), and P_e = Σ_k (true share_k × predicted share_k). In IV-2a every class is exactly 25 % of the test labels, so P_e = 0.25 × Σ predicted shares = 0.25 regardless of the model. So κ is just accuracy rescaled so that chance = 0. Example: (0.7770 − 0.25)/0.75 = 0.7027, the paper's value.

**Q13. SD vs LOSO: what is the difference and which is harder?**
SD trains and tests on the same person (session T → session E); LOSO trains on the other 8 people and tests on the held-out person. LOSO is harder because EEG varies a lot between people: the paper reports 77.70 % SD vs 66.59 % SI.

**Q14. What are your replication results?**
Our Plan B SD run (9 subjects, 1 seed, 500 epochs) reached **35.68 % (925/2592), κ 0.1424**, against the paper's 77.70 % / κ 0.7027. Per subject (k/288): A01 99, A02 85, A03 107, A04 111, A05 76, A06 87, A07 113, A08 98, A09 149, i.e. 26.38–51.73 %. We pre-registered the verdict bands before any result (within ±3 pp of 77.70 % is "reproduced", 3–5 pp "consistent", beyond 5 pp "not reproduced"), so the verdict is **Not reproduced (PRELIMINARY, 1 seed)**. Every subject is also below a simple log-band-power logistic-regression floor (≈ 50 %), which triggered our pre-registered audit. Its findings:
- no leakage;
- heavy overfitting (91–99 % training accuracy vs 37.5 % on held-out session-T trials for A01);
- unnormalised µV² features;
- session power shift;
- a mask that removes no edges.

SI (LOSO) and the ablations were not run tonight. Use the five talking points in §9.3.

**Q15. How did you avoid data leakage?**
Session E is never used for any choice: fixed 500 epochs, last-epoch model, no early stopping or validation on E, evaluated once per run. In `train.py`, session E is passed only to `predict()` after `fit()` has returned; the training loop never receives it. There is **no automated guard test for this yet** (a protocol test is planned post-mid-eval), so say "by construction", not "enforced by a test". The deployment subject (A01) was chosen before any result. Replay trials are hash-checked to be A01E, never A01T.

**Q16. What do the ablations show?**
In the paper: removing evolution costs about 2.4 pp (FE-GAT 75.32), replacing attention with GCN costs 6.25 pp, no evolution blocks costs 12.5 pp (PLV-GAT 65.22), and a random graph collapses to 47.80. So PLV structure and attention matter most, and evolution adds a smaller gain. Our ablations were **not run tonight** (post-mid-eval). One honest observation: on our trained model the mask removes no edges, so our full model already behaves like FE-GAT.

**Q17. What do Silhouette and DBI tell you?**
Silhouette (higher is better) and Davies–Bouldin (lower is better) measure how well the classes cluster. In the paper's Table 2, Silhouette rises from 0.3088 to 0.3992 and DBI falls from 0.9427 to 0.7909 from evo0 to evo3, i.e. features become more class-separable with each block.

### Paper critique

**Q18. Did you find problems in the paper?**
Yes, handled respectfully and documented in ADR 0001: τ and η have no values; 77.05 in the text is a typo for 77.70 (Fig. 3 mean, κ, and all 8 deltas agree); Eq. 9 is GAT not GATv2; Table 1's stem layer is not in the text; and the released code is a partial fragment with no licence, no training script and undefined functions.

**Q19. The paper says "differentiable sampling". Is it?**
Not as written. The mask is an indicator function, so its gradient is zero almost everywhere, and the next GATv2 uses only topology. Under the stated cross-entropy loss, the GAE gets no gradient; we checked this on our model (12,576 GAE parameters with no gradient). The paper's own Discussion calls it "a guided form of DropEdge", which matches. We test the plausible intended versions as variants V6 (reconstruction loss) and V7 (straight-through).

**Q20. Why τ = 0.3 and η = 0.5?**
τ = 0.3 is the default argument in the authors' released code (the call site is unreleased), applied to the z-scored PLV. η = 0.5 is our convention: the mode of the Bernoulli(P) training mask. Both were fixed before any result, and a sensitivity sweep on session T only is planned after the mid eval.

### ErrP

**Q21. What is an ErrP and where do you measure it?**
An error-related potential is the brain's automatic response to seeing an error: a negativity (Ne) around 250 ms and a positivity (Pe) around 330 ms after the event, in the 1–10 Hz band, strongest at FCz and Cz over the fronto-central cortex.

**Q22. Is −8.4 µV realistic?**
As an average Ne, no: published averages are about −1.5 to −4 µV. As a single-trial minimum it is plausible, because one trial includes background EEG. We define it as a descriptive single-trial FCz minimum in 200–350 ms; detection uses 72 multichannel features, not that one number.

**Q23. How does your ErrP detector work?**
CAR, causal 1–10 Hz Butterworth, baseline correction, then mean amplitudes in 9 windows (0.2–0.7 s) on 8 fronto-central channels = 72 features, classified by shrinkage LDA. Platt scaling calibrates the score, and a prior shift adjusts it to the current action's prior π = 1 − c. Trained on BNCI 013-2015 session 1, tested cross-session on session 2.

**Q24. Why not roll back whenever P(error) > 0.5?**
Because the two mistakes cost different amounts. We minimise expected cost: roll back iff q > t* = C_FP/(C_FP + C_FN − C_TP). For the light case, costs in MI tokens are 5, 7 and 2.92, so t* = 5/9.08 ≈ 0.55, and we also require q > π so evidence favouring "correct" never triggers a rollback.

**Q25. Can ErrP-based rollback make things worse?**
Yes, and we say so. At π = 0.181 the detector needs LR+ above about 5.5 to beat "never roll back", and published detectors report 2.61–5.15. That is why we use calibrated per-epoch decisions, only roll back on strong evidence, flag-only for cheap settings, never auto-roll back caregiver-approved actions, and have a per-subject gate that can switch to flag-only.

### KG and policy

**Q26. Where does the 0.94 come from? Isn't it hard-coded?**
S = 0.35·type + 0.30·room + 0.20·state + 0.15·recency. The ceiling light matches type, room and state, and has 6 of the last 10 confirmed activations: 0.35 + 0.30 + 0.20 + 0.15 × 0.6 = 0.94; the lamp gets 0.88 and the living room light 0.38. It is computed live from SPARQL results and changes when the history changes. The README pins only w_R(1 − f_R) = 0.06; the weight split and the synthetic 6/10 history are our disclosed choices.

**Q27. How do 92 % and 89 % become EXECUTE?**
Semantic s = 0.94 × 0.95 (room confidence) = 0.893 → 0.89. Combined c = n × s = 0.92 × 0.89 = 0.819. The tier is Low (lights), and Low executes at c ≥ 0.75, so the decision is EXECUTE with a 0.069 margin.

**Q28. Why is Bedside Lamp offered after the rollback?**
Two layers agree. The offer is the best candidate excluding the rolled-back one (second-best rule): the lamp at 0.88. And the persistent ErrP penalty multiplies the ceiling light's score by at least 0.5 (0.94 → 0.47), so the ranking itself flips. The penalty affects ranking only, never the policy's s, so a false rollback cannot lock the user out.

**Q29. What happens if the user sets the AC to 17 °C?**
Any setpoint below 18 °C or above 30 °C is a High-risk thermal hazard (people with SCI/ALS often cannot regulate body temperature). The policy returns CAREGIVER APPROVAL; the patient sees "Waiting for caregiver approval" and can withdraw with Tongue; the caregiver approves or rejects on the dashboard. It is never auto-approved.

**Q30. How is the audit log tamper-evident?**
Each entry includes the hash of the previous entry and is hashed with SHA-256 over canonical JSON, forming a chain. Changing any entry changes its hash and breaks every later link, so verification reports "Chain broken at #k". Reset appends a RESET entry instead of wiping the log. Limitation: someone who can rewrite the whole chain could recompute it; a keyed HMAC version is planned.

### Bonus quick ones

- **Is this clinically validated?** No. It is a proposal-stage prototype; EEG in the browser is scripted, replayed or synthetic, and the UI always says which.
- **Why a browser and not Python for the demo?** It runs anywhere by double-click, offline. The in-browser SFE-GAT must match PyTorch to within 1e-4 on the logits (parity test); if parity is not green, Replay is disabled rather than faked. **Parity passed:** the worst logit difference on all 20 exported trials is 9.8e-15 (`docs/verification.md` §2).
- **Why A01 as the deployment subject?** It is the paper's own figure subject, typical (80.21 % vs 77.70 % mean) rather than the best (A03, 89.24 %), and it was chosen before any of our results.
- **What would you do with more time?** Plan A (3 seeds, LOSO on T+E, all ablations), V6/V7 to test the intended GAE learning, an interaction-ErrP dataset, real interaction logs to calibrate the KG score, and a user study.

**Seedhi baat:** Har jawab seedha shuru karo, ek wajah do, aur ADR ka hawala do. Sab se zaroori: 0.94 ka hisaab, κ = (acc−0.25)/0.75, GAE ko gradient nahi, t* ≈ 0.55, aur imaandari se "35.68 % vs 77.70 % — not reproduced, PRELIMINARY" (§9.3 ke 5 points).

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **ADR** | Architecture Decision Record: a short document recording one decision, the rejected alternatives and when to revisit it (`docs/adr/`). |
| **ALS** | Amyotrophic lateral sclerosis: a disease that progressively paralyses the muscles. |
| **Analytic signal** | x(t) + i·𝓗{x}(t); its angle is the instantaneous phase. |
| **AUC** | Area under the ROC curve: the probability that a random error epoch scores higher than a random correct one (0.5 = chance, 1 = perfect). |
| **Balanced accuracy (BA)** | (TPR + TNR)/2; fair when classes are imbalanced. |
| **Band power** | Power of a signal inside a frequency band (here 8 bands, 8–40 Hz). |
| **BatchNorm (BN)** | Normalises each feature over the mini-batch, then scales (γ) and shifts (β). |
| **BCI** | Brain–computer interface. |
| **BCI IV-2a** | BCI Competition IV dataset 2a: 9 subjects, 4 MI classes, 22 EEG channels, 250 Hz, 288 trials per session. |
| **BNCI 013-2015** | Monitoring-ErrP dataset (Chavarriaga & Millán): 6 subjects, 2 sessions, 64 channels, 512 Hz. |
| **BOT** | W3C Building Topology Ontology (buildings, storeys, rooms). |
| **Butterworth filter** | IIR filter with a maximally flat passband. |
| **CAR** | Common average reference: subtract the mean of all channels at each time point. |
| **Causal filter** | Uses only past samples (`sosfilt`); valid in real time. |
| **Cohen's κ** | Chance-corrected agreement; on IV-2a, κ = (acc − 0.25)/0.75. |
| **CONFIRM** | Policy decision that asks for one extra Both-Feet token before acting. |
| **Competency question (CQ)** | A question the KG must be able to answer; used as a test. |
| **Cross-entropy (CE)** | The classification loss; the only loss in our primary configuration. |
| **DBI** | Davies–Bouldin Index; lower = better-separated clusters. |
| **DropEdge** | Regularisation that randomly removes graph edges during training. |
| **EEG** | Electroencephalography: scalp voltages in µV. |
| **ERD** | Event-related desynchronisation: power drop in mu/beta during (imagined) movement. |
| **ErrP** | Error-related potential: brain response to perceiving an error (Ne ~250 ms, Pe ~330 ms, FCz/Cz). |
| **evo0 … evo3** | The brain graph before evolution (evo0) and after each of the 3 evolution blocks. |
| **FCz, Cz** | Midline fronto-central and central electrodes; where ErrPs are strongest. |
| **FNV-1a** | A simple non-cryptographic hash; our fallback when SHA-256 is unavailable (integrity only). |
| **GAE** | Graph autoencoder: GCN encoder + inner-product decoder, giving edge probabilities. |
| **GATv2** | Graph attention network v2 (Brody et al. 2022): dynamic attention over neighbours. |
| **GCN** | Graph convolutional network: degree-normalised neighbour averaging + linear map. |
| **h-flag** | When the ErrP memory M(d) < 0.9, an EXECUTE is downgraded to CONFIRM. |
| **Hash chain** | Each log entry contains the previous entry's hash, so edits are detectable. |
| **Hilbert transform** | Builds the analytic signal, used to get phase. |
| **IIFE** | Immediately invoked function expression: `(function(root){ ... })(window)`; our module pattern for `file://`. |
| **IRI** | Internationalised resource identifier: the global name of an RDF node. |
| **Leakage** | Test data influencing training choices; inflates results. |
| **LOSO** | Leave-one-subject-out (subject-independent) evaluation. |
| **LR+** | Positive likelihood ratio = TPR/(1 − TNR). |
| **Macro F1 / precision** | Per-class metric, averaged over classes. |
| **Monte Carlo mask** | Random edge keep/drop: keep if P > R with R ~ U(0,1) (training); P > η (evaluation). |
| **MI** | Motor imagery: imagining a movement without doing it. |
| **n, s, c** | Neural confidence, semantic context score, combined confidence c = n × s. |
| **Ne / Pe** | Error negativity (~250 ms) / error positivity (~330 ms) in the ErrP. |
| **P0** | Our primary, pre-registered replication configuration. |
| **Parity test** | Checks that the JS implementation gives the same numbers as Python/PyTorch (within a tolerance). |
| **Plan A / Plan B** | Full post-mid-eval protocol / reduced overnight protocol (1 seed, PRELIMINARY). |
| **Platt scaling** | Logistic regression on classifier scores to get calibrated probabilities. |
| **PLV** | Phase Locking Value: |mean e^{iΔθ}|, 0 to 1. |
| **Prior π** | Probability the action was wrong before seeing the EEG; π = 1 − c. |
| **Prior shift** | Adjusting a calibrated posterior from the training prior to the current prior. |
| **PSD** | Power spectral density: power per frequency. |
| **RDF** | Resource Description Framework: knowledge as subject–predicate–object triples. |
| **Rollback / saga** | Undoing an action's steps in reverse order, atomically. |
| **SAREF** | ETSI Smart Applications REFerence ontology (devices, functions, commands, states). |
| **SCI** | Spinal cord injury. |
| **SD** | Subject-dependent evaluation (train T, test E, same person). |
| **Shrinkage LDA (sLDA)** | Linear discriminant analysis with a regularised covariance; robust with few trials. |
| **Silhouette score** | −1 to 1; higher = points closer to their own class than to others. |
| **SOSA** | W3C Sensor, Observation, Sample and Actuator ontology. |
| **SPARQL** | Query language for RDF graphs. |
| **t\*** | Cost-optimal rollback threshold = C_FP/(C_FP + C_FN − C_TP). |
| **τ (tau)** | PLV z-score edge threshold (0.3). |
| **η (eta)** | Evaluation edge-mask threshold (0.5). |
| **Temperature scaling** | Divides logits by a fitted T to calibrate softmax confidence. |
| **Token** | One navigation command (NEXT, PREVIOUS, SELECT, BACK) from one MI class. |
| **t-SNE** | Non-linear 2-D projection for visualising high-dimensional features. |
| **Turtle** | Compact text format for RDF (`.ttl`). |
| **Welch's method** | PSD estimate by averaging windowed, overlapping segment periodograms. |

**Seedhi baat:** Yeh glossary viva se pehle ek dafa parh lo. Agar examiner koi lafz pooche jo yaad na ho, to pehle seedha matlab batao, phir project mein uska role.

---

*Document status: written 2026-10-14 from README.md, PROMPT.md, the base paper, the Phase-1 research briefs and ADRs 0001–0005, plus `docs/architecture.md`. Updated the evening of 2026-10-14, after Plan B SD training finished. Every former "[results pending]" marker now holds the real numbers from `docs/replication.md` and `docs/errp.md`, exactly as computed and labelled PRELIMINARY, or says "not run (post-mid-eval)". The red-team round 1 corrections RT2-01, RT2-04, RT2-05, RT2-14 and RT2-15 are applied. §9.3 was added.*
