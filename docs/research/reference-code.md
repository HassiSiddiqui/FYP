# Reference-Code Audit: GaoHSin/SFE-GAT

**Role:** Reference-Code Auditor (Phase 1)
**Date:** 2026-10-14
**Scope:** I read the authors' public repository read-only through WebFetch (GitHub HTML page, GitHub REST API, raw.githubusercontent.com). I mapped it against the base paper (Gao, Cao & Ma, *Sensors* 2026, 26, 1730, doi:10.3390/s26051730; local text `docs/research/_paper-text.txt`). Nothing was cloned, downloaded to disk, installed or executed.

> **Bottom line.** The repository is a partial, non-runnable fragment: 3 files, about 12 KB. It **does** settle the architecture: the layer list, head concatenation, BN placement, a residual connection, the GCN-encoder BatchNorm, the stem GATv2, and the exact parameter count of **149,796 ≈ 0.15 M**, which reconciles the garbled Table 1. It also gives the PLV threshold default (**τ = 0.3 on z-scored PLV**) and the PSD/filter code. It does **not** contain `compute_plv`, `z_score_norm`, `monte_carlo_new_edge_index`, η, any training loop, loss, optimizer, seeds, the data-preparation script, or trained weights. There is **no LICENSE**. The released code also shows that **no gradient can pass through the edge mask**, and that, unless the unreleased training script adds a GAE reconstruction loss, **the GAE weights receive no gradient at all**. So the paper's "differentiable sampling strategy" claim is not realised in the released code.

---

## 1. Repository inventory (verified)

| Item | Value | Source |
|---|---|---|
| Files | `PLV&PSD.ipynb` (7,611 B), `README.md` (493 B), `SFE-GAT.py` (3,944 B). No directories; tree `truncated: false` | [API contents][api-contents], [API tree][api-tree] |
| Branches | `main` only (HEAD `88ed7f28df0e…`). There is no `master` | [API branches][api-branches] |
| Commits | 3, all on 2026-01-12: `599ec62` "Initial commit" 04:58Z; `7d80e82` "Update README.md" 05:01Z; `88ed7f2` "Add files via upload" 05:02Z | [API commits][api-commits] |
| Repo metadata | created 2026-01-12, pushed 2026-01-12T05:02:08Z (no pushes since), `license: null`, 1 star, 0 forks, 0 open issues, no releases or packages | [API repo][api-repo], [repo page][repo] |
| README (paraphrased) | Holds "a portion of the source code" behind the manuscript. The rest is being refactored and "will be made available in a future release". Until then the full code is available from the corresponding author on reasonable request for review and academic research | [README raw][readme] |
| Paper's Data Availability claim | "The source code, trained models, and preprocessing scripts are publicly available at https://github.com/GaoHSin/SFE-GAT" | paper p.16, `_paper-text.txt` l.1036–1039 |

**Discrepancy:** the paper says code, **trained models and preprocessing scripts** are public. The repo has no trained models, no data-preprocessing script (the `.npz` creator), no training or evaluation script, and three helper functions it calls are undefined. The corresponding author is Guohua Cao, `cghcust@163.com` (paper p.1).

---

## 2. What the code actually implements

### 2.1 `SFE-GAT.py` (102 lines; source [SFE-GAT.py][sfegat-py])

**Imports.** PyTorch plus `torch_geometric.nn` (`GCNConv, GATConv, GATv2Conv, GAT, GraphNorm, EdgeCNN, GAE, BatchNorm`, `global_mean_pool, global_max_pool, global_add_pool`). Six of these are imported but never used.

**`GCNEncoder(in, out)`**
- `GCNConv(in, out)` with all defaults.
- `forward`: `relu(conv1(x, edge_index))`, then `BatchNorm(out)`.
- So the order is **GCN → ReLU → BN**. There is no edge weight.

**`GraphEvoBlock(in, hidden, bottleneck, heads=4, dropout=0)`**
- `conv = GATv2Conv(in, hidden, heads=heads, concat=True)`.
- `bn = BatchNorm(hidden*heads)`.
- `gae1 = GAE(GCNEncoder(hidden*heads, bottleneck))`.
- `forward(x, edge_index, monte_carlo_new_edge_index)` runs these steps in order:
  1. `x = conv(x, edge_index).relu() + x_in`: **GATv2 → ReLU → residual add**.
  2. `x = bn(x)`.
  3. `x = F.dropout(x, p=dropout)`, where p = 0 in every instance.
  4. `edge_probs = gae1.decode(gae1(x, edge_index), edge_index)`: the GAE is encoded on the **post-BN features and the block's input graph**, and decoded **only on the existing edges**.
  5. `edge_index_out = monte_carlo_new_edge_index(edge_index, edge_probs)`.
  6. It returns `(x, edge_index_out)`.

**`SFE_GAT(hidden_channels, heads, n_classes=4)`**
- `conv1 = GATv2Conv(8, hidden, heads, concat=True)` is a **stem layer** with no activation and no BN after it.
- `evo1/2/3 = GraphEvoBlock(hidden*heads, hidden, bottleneck=32, heads, dropout=0)`.
- `conv4 = GATv2Conv(hidden*heads, hidden, heads, concat=True)`.
- `bn = BatchNorm(hidden*heads)`. Its comment says "GraphNorm", but the layer is BatchNorm.
- `lin = Linear(hidden*heads, n_classes)`.
- `forward(x, edge_index, batch)` runs:
  1. `conv1`.
  2. `evo1 → evo2 → evo3`, each consuming the previous block's edges.
  3. `conv4(x, edge_index3).relu()`.
  4. `bn`.
  5. `global_mean_pool`.
  6. `F.dropout(p=0.2)`.
  7. `lin`. It returns **logits**: there is no softmax, so CE is applied outside.
- Helpers:
  - `edge_vision` returns `(edge_index, e1, e2, e3)`, which is used for the Fig. 6 edge counts.
  - `get_embeddings` returns `{'evo0': raw input x, 'evo1', 'evo2', 'evo3'}`, which is used for the Fig. 5 / Table 2 t-SNE. Note that `evo0` is the **raw 8-band PSD input**, not a learned embedding.
- `hidden_channels` and `heads` have no defaults in the file. Table 1 and the parameter count fix them at 32 and 4 (see §2.3).

**Defects that make it non-runnable as released** (from the audit of [SFE-GAT.py][sfegat-py]):
- `GraphEvoBlock.forward` requires the 3rd argument `monte_carlo_new_edge_index`, but `SFE_GAT.forward`, `edge_vision` and `get_embeddings` call `evoN(x, edge_index)` with two arguments, which raises a `TypeError`.
- `monte_carlo_new_edge_index` is not defined anywhere.
- It gets no `training` flag, so the train/eval switch (Eq. 17 vs 18) must come from a global or closure that we cannot see. **[UNVERIFIED]** how it is done.

### 2.2 `PLV&PSD.ipynb` (5 cells; kernel "Python 3 (ipykernel)", `language_info.version` 3.13.2; source [notebook][nb])

| Function | Behaviour (paraphrased, short quotes only) |
|---|---|
| `load_data(subject='A01', flag='T', n_classes=4)` | Loads `./data_save/2a/{subject}{flag}.npz` with keys `data` and `label`. `flag` is `T` or `E`, the BCI IV-2a file naming. Optional 2-class filter for the first two labels. Labels are made zero-based with `label - label.min()`. The script that **creates** these `.npz` files is **not released** |
| `get_plv(data, label, norm=True, …)` | Calls `compute_plv(data)`, then `z_score_norm(plv)` if `norm`. **Both functions are undefined.** It asserts `len(plv) == len(label)`, so the PLV is **one C×C matrix per trial** |
| `aggregate_eeg_data` | Replicates each trial along a new last axis, giving one copy per band (8) |
| `bandpass(…, poles=5)` / `batch_bandpass(data_np, band, fs, poles=5)` | `scipy.signal.butter(poles, [lo, hi], 'bandpass', fs=fs, output='sos')` then `sosfiltfilt(…, axis=2)`. This is a **5th-order** Butterworth prototype, so the bandpass SOS order is 2N = 10 per pass ([SciPy butter][scipy-butter]), applied zero-phase. Syntax error: `assert len(band) == data_np.shape[3] + 1, ` has a trailing comma and no message |
| `bandpower(data, low, high, fs)` | `win = 2*fs` gives **500 samples (2 s)**. `sig.welch(data, fs, nperseg=win)` uses SciPy defaults: Hann window, `noverlap = nperseg//2` (50 %), `detrend='constant'`, `scaling='density'` ([SciPy welch][scipy-welch]). It selects bins with `low <= f <= high` (**both edges inclusive**, so adjacent bands share their edge bin) and integrates with `scipy.integrate.simpson(psd[idx], dx=freq_res)`. The result is **absolute** power: no log, no relative normalisation |
| `bandpowercalc` | Triple Python loop over trial × channel × band. Output shape is `(trials, 22, 8)` |
| `get_nodeFeature(data_np, fs=250)` | `band = range(8, 41, 4)` gives edges [8, 12, …, 40] and **B = 8 bands**. It calls `batch_bandpass` without `poles`, so the order is 5 |
| `get_adj(plv, threshold=0.3)` | `(plv > threshold).float() * plv`, which keeps z-scored PLV values above **0.3** as weights |
| `get_input_PyG(data_np, plv, label, threshold=0.3)` | For each trial: `edge_index = where(adj[i] >= threshold)`, then `Data(x=psd[i], edge_index=edge_index, y=label[i])`. **No `edge_attr` or `edge_weight` is stored**, so the PLV weights are **discarded** and the graph that reaches the model is **binary** |

### 2.3 Parameter count: the code reconciles Table 1

This is computed from the PyG 2.6.1 layer definitions:
- `GATv2Conv` creates `lin_l` and `lin_r`, each a Linear with bias (because `share_weights=False`), plus `att (1, H, C)` and `bias (H·C)` when `concat=True` ([gatv2_conv.py][pyg-gatv2]).
- `GCNConv` creates a Linear without bias plus a separate bias ([gcn_conv.py][pyg-gcn]).
- PyG `BatchNorm` wraps `BatchNorm1d` and contributes 2·C affine parameters ([batch_norm.py][pyg-bn]).

| Layer | Formula | Params |
|---|---|---|
| Stem `GATv2Conv(8→32×4)` | 2·(8·128+128)+128+128 | **2,560** |
| Per evo block: `GATv2Conv(128→32×4)` | 2·(128·128+128)+128+128 | **33,280** |
| Per evo block: `BatchNorm(128)` | 2·128 | **256** |
| Per evo block: GAE = `GCNConv(128→32)` + `BatchNorm(32)` | 128·32+32+64 | **4,192** |
| Classifier `GATv2Conv(128→32×4)` + `BatchNorm(128)` | 33,280+256 | 33,536 |
| `Linear(128→4)` | 128·4+4 | **516** |
| **Total** | 2,560 + 3·(33,280+256+4,192) + 33,536 + 516 | **149,796 ≈ 0.15 M** ✓ |

I ran the arithmetic locally in plain Python. The garbled Table 1 extraction (`_paper-text.txt` l.556–585) contains exactly these values:
- one 2,560;
- four 33,280s;
- four 256s;
- three 4,192s;
- one 516.

They sum to 149,796, which matches the paper's "approximately 0.15M trainable parameters" (p.9). If the first evolution block's GATv2 took the 8-dim input directly (no stem), the total would be 116,516 ≈ 0.12 M, which does not match.

**Conclusions:**
- There is a **stem GATv2 (8→128) before 3 evolution blocks**, giving 5 GATv2 layers in total.
- The "4192" GAE row includes the encoder's **BatchNorm(32)**, which Eq. 15 omits.
- Heads are **concatenated**: 4×32 = 128.

---

## 3. Equation → code map

| Paper | Paper statement | Code location | Status |
|---|---|---|---|
| Eq. 1 PLV | Hilbert phase, \|mean e^{iΔφ}\| per channel pair | `PLV&PSD.ipynb: get_plv → compute_plv` | **Missing.** `compute_plv` is not released. Per-trial is confirmed by the `len(plv)==len(label)` assert. Band and window are **[UNVERIFIED]** |
| Eq. 2–3 z-score | Whole-matrix μ, σ; (P−μ)/(σ+ε), ε = 1e-8 | `get_plv → z_score_norm` (norm=True by default) | **Missing.** Scope is unknown: per trial or per dataset |
| Eq. 4 zero diagonal | PLV_ii = 0 | Not visible | **Missing.** It is harmless for GATv2, which removes and re-adds self-loops ([gatv2_conv.py][pyg-gatv2]), and for GCNConv, whose `gcn_norm` adds remaining self-loops ([gcn_conv.py][pyg-gcn]). It **does** matter for the GAE decoder, which would score self-edges if they were present |
| Eq. 5 threshold | A_ij = PLV_ij if PLV_ij > τ | `get_adj(plv, threshold=0.3)`; `get_input_PyG(…, threshold=0.3)` | **Resolved: τ = 0.3 on z-scored PLV** (default argument; the actual call site is not released). The **weights are dropped** and only `edge_index` is kept |
| Eq. 6 filter bank | 8–40 Hz, 4 Hz steps, zero-phase 4th-order Butterworth, "Rp = 0.5 dB, Rs = 40 dB" | `get_nodeFeature → batch_bandpass(poles=5)` | **Contradiction:** the code uses **order 5**, the paper order 4. Rp/Rs do not apply to `scipy.signal.butter`, which has no such arguments ([SciPy butter][scipy-butter]); they look copied from a Chebyshev/elliptic description |
| Eq. 7 Welch | 1-s segments (250 samples), 50 % overlap, Hann | `bandpower: nperseg = 2*fs` | **Contradiction:** the code uses **500-sample (2 s)** segments: 0.5 Hz resolution and 3 segments on a 4-s epoch, against 1 Hz and 7 segments in the paper. Overlap and window match through SciPy defaults ([SciPy welch][scipy-welch]) |
| Eq. 8 band integral | ∫_{f_lo}^{f_hi} PSD | `bandpower: simpson(psd[lo<=f<=hi], dx)` | **Resolved:** Simpson rule over inclusive bins, absolute power, no log |
| Eq. 9–11 GATv2 | LeakyReLU attention, softmax over N(i) | PyG `GATv2Conv` defaults: `negative_slope=0.2`, attention `dropout=0`, `add_self_loops=True`, `share_weights=False`, `edge_dim=None` ([gatv2_conv.py][pyg-gatv2]) | **Resolved.** There is no edge feature, so PLV weights do not enter attention |
| Eq. 12 | H = ReLU(GATv2(H, A)) | `GraphEvoBlock.forward: conv(x).relu() + x_in` | **Extends the paper:** there is a **residual** (+x_in) after the ReLU that the paper never mentions. It adds no parameters |
| Eq. 13–14 BN | BN after the GAT | `self.bn` after the residual | **Resolved:** the order is GATv2 → ReLU → +residual → BN. PyG BN normalises over **all nodes in the mini-batch** (64 graphs × 22 nodes = 1,408 rows), with running stats in eval, `momentum=0.1`, `eps=1e-5` ([batch_norm.py][pyg-bn]) |
| Eq. 15 encoder | Z = ReLU(GCNConv(H_bn, A)) | `GCNEncoder: relu(GCNConv) → BatchNorm(32)` | **Extends the paper:** a **BN(32)** comes after the ReLU; Table 1's 4,192 confirms it. The GCN has no edge weight and uses `normalize=True` with self-loops ([gcn_conv.py][pyg-gcn]). Bottleneck = 32 |
| Eq. 16 decoder | P = σ(z_iᵀ z_j) | `gae1.decode(z, edge_index)` → PyG `InnerProductDecoder(sigmoid=True)` ([autoencoder.py][pyg-gae]) | **Resolved:** sigmoid on, and it is evaluated **only on the edges of the current A** (an E-vector, not C×C) |
| Â = A ⊙ M | Mask sparsifies A | `monte_carlo_new_edge_index(edge_index, edge_probs)` returns a new **`edge_index`** | **Partially resolved.** Edges can only be **dropped, never added**, and the edge set shrinks monotonically A ⊇ Â₁ ⊇ Â₂ ⊇ Â₃. Sampling details are missing |
| Eq. 17 train mask | M = 𝟙(P > R), R ~ U(0,1) | Inside the missing function | **Missing** |
| Eq. 18 eval mask | M = 𝟙(P > η) | Inside the missing function | **η is not in the repo: unresolved** |
| Eq. 19, L = 3 | Stacked blocks | `evo1, evo2, evo3` | **Resolved:** 3 blocks, preceded by a stem GATv2 that the paper text does not describe but Table 1 counts |
| Eq. 20–21 classifier | GATv2 → BN | `conv4(x, e3).relu() → bn` | **Resolved:** **ReLU before BN** (Fig. 1 says "Batch Norm + ReLU"; Eq. 20–21 omit the ReLU) |
| Eq. 22 mean pool | | `global_mean_pool(x, batch)` | Resolved |
| Eq. 23 dropout | p = 0.5 | `F.dropout(x, p=0.2)` | **Contradiction:** the code uses **0.2**, the paper 0.5 |
| Eq. 24 softmax | ŷ = softmax(W h + b) | Returns logits | Consistent: softmax sits inside CE (training script not released) |
| §3.3 training | SGD lr 0.01, batch 64, wd 1e-3, CE, 500 epochs | None | **Missing:** no loop, momentum, scheduler, seed, early stopping or checkpoint selection |
| Fig. 5 / Table 2 | t-SNE per stage evo0–evo3 | `get_embeddings` | Resolved: node-level embeddings after each evo block; evo0 = raw PSD |
| Fig. 6 | Edge retention counts | `edge_vision` | Resolved: returns the edge sets e0–e3 |

---

## 4. Requested items: resolved, contradicted, or still open

| Item | Paper | Code | Verdict |
|---|---|---|---|
| **τ** | "threshold τ" (value not given in extracted text) | **0.3**, on **z-scored** PLV, kept where `> 0.3` | **Resolved by code** (default argument) |
| **η** | "fixed threshold η" (no value) | Absent | **Unresolved** |
| **PLV computation** | Eq. 1 on "each electrode's signal"; no band filter mentioned | Per trial (assert). Function missing | Band (broadband vs μ/β) and window (2–6 s?) are **[UNVERIFIED]**. The data in `.npz` is presumably the 2–6 s crop (paper §3.1), but the crop script is missing |
| **PLV edge weights** | Eq. 5 keeps PLV_ij as edge weight; Fig. 1 labels "Edge features" | **Discarded**: binary `edge_index` only; GATv2 `edge_dim=None`; no `edge_weight` to the GCN | **Contradiction**: the code treats A as binary |
| **PSD** | Welch, 250-sample Hann, 50 %, band integral | Welch, **500**-sample Hann, 50 %, Simpson over inclusive bins, absolute power | **Contradiction on segment length** |
| **Filter** | 4th-order zero-phase Butterworth | **5th-order** `sosfiltfilt` | **Contradiction** |
| **GAE loss** | Only "categorical cross-entropy" is named (§3.3). §2.2 says the GAE "drives the model to learn … by reconstructing the graph topology" | No `recon_loss` call anywhere. `GAE` is imported (it provides `recon_loss` ([autoencoder.py][pyg-gae])), but the training script is unreleased | **Unresolved / contradictory.** See §5 |
| **Gradient through MC mask** | "differentiable sampling strategy" (p.2) | The mask returns an **integer `edge_index`**, so the gradient path is **none** (no straight-through, no Gumbel) | **Contradiction**, structural: see §5 |
| **Heads** | 4 heads, hidden 32 → 128 (Table 1) | `concat=True` everywhere | **Resolved: concatenate** |
| **BN/ReLU order** | Eq. 12/14: ReLU(GATv2) → BN | Evo block: GATv2 → ReLU → **+residual** → BN. Classifier: GATv2 → ReLU → BN. Encoder: GCN → ReLU → **BN** | **Resolved by code**, with two additions the paper omits (residual, encoder BN) |
| **Number of layers** | L = 3 blocks + classifier | Stem GATv2 + 3 evo blocks + classifier GATv2, so **5 GATv2, 3 GCN** | **Resolved by code**; confirmed by the Table 1 parameter sum |
| **Dropout** | 0.5 after pooling | **0.2** after pooling; evo-block dropout 0; attention dropout 0 (default) | **Contradiction** |
| **Optimizer / schedule** | SGD 0.01, wd 1e-3, batch 64, 500 epochs | Absent | Momentum, Nesterov, LR schedule and checkpoint choice (last vs best epoch) are **[UNVERIFIED]** |
| **Data loading** | BCI IV-2a, 22 ch, 250 Hz, t = 2–6 s | Pre-saved `./data_save/2a/A0xT.npz` / `A0xE.npz` (keys `data`, `label`) | No MOABB or `.gdf` code. The file naming points to the original GDF release with T/E sessions. **How E-session labels were obtained is [UNVERIFIED]**: the original `A0xE.gdf` carries no class labels, which are published separately as true-label files ([BCI IV results page][bciiv-results]); **[UNVERIFIED]** in-session |
| **Normalisation** | None mentioned beyond the PLV z-score | None: raw absolute band power goes straight into the stem GATv2 (there is no BN before evo1's GAT) | **Open:** the feature scale depends on the `.npz` units (V vs µV), which are unknown. MNE/MOABB return volts, giving band power around 1e-12 V². **[UNVERIFIED]** for their pipeline |
| **Train/test split** | SD: session T train, E test; SI: LOSO | `flag='T'/'E'` per subject | SD loading is **per subject**. Whether the SD model is per-subject or pooled ("288 trials × 9 subjects" p.9 is ambiguous) is unresolved. The SI training composition (T only, or T + E of the other 8) is **[UNVERIFIED]** |
| **Seeds** | Not stated | None | **Unresolved** |
| **Label mapping** | 4 classes | `label - label.min()` gives 0..3 (works for 1–4 or 769–772 event codes) | Resolved for indexing only |

---

## 5. Gradient-flow analysis: the most important finding

1. **The mask is non-differentiable by construction.** `monte_carlo_new_edge_index` returns an `edge_index`, which is a `LongTensor` of node indices. Message passing in the next layer depends on *which* edges exist, not on any continuous weight. So ∂L/∂P_Â = 0 through this path. That rules out a straight-through estimator or a Gumbel relaxation in the released forward pass: there is no float tensor for the gradient to ride on ([SFE-GAT.py][sfegat-py]).
2. **The GAE output never reaches the classifier's features.** `x` after BN goes to the next block. The GAE latent `z` is used only to compute `edge_probs`.
3. **So, under a CE-only loss, every GAE parameter has `grad = None`.** That is 3 × 4,192 = **12,576 parameters, 8.4 % of the model**. PyTorch SGD skips parameters whose `p.grad is None`, which means **not even weight decay touches them** ([torch/optim/sgd.py v2.7.0][torch-sgd]). They stay at their Glorot/zero initialisation for the whole run. Their BN(32) running statistics still update during training forward passes.
4. **The topology still co-evolves**, because the edge probabilities σ(zᵢᵀzⱼ) are a fixed random GCN projection of the *learned* GAT features. As the GATs train, the retained edges change. This is a "random-projection edge sampler" that is guided by learned features but not trained itself.
5. **The only way the GAE learns is an auxiliary reconstruction loss in the unreleased training script.** `GAE.recon_loss(z, pos_edge_index)`, which is BCE on positive edges plus negatively sampled edges ([autoencoder.py][pyg-gae]), is the obvious candidate given that the code imports `GAE`. The paper's text supports reconstruction learning (§2.2, l.352–374), but its loss statement (§3.3) names only CE. **[UNVERIFIED]** which one they ran.
6. **Implication for the ablations.** The paper reports "removing the GAE + MC edge evolution → −2.43 %" (FE-GAT, p.10). If the GAE is untrained, that gap measures *feature-conditioned random DropEdge* rather than learned structure. The paper's own Discussion (l.911–913) calls the mechanism "a guided form of DropEdge", which is consistent with this reading.

---

## 6. Environment and versions

| Component | Paper (§3.3) | Repo hint | Our machine | Compatibility |
|---|---|---|---|---|
| Python | 3.10.16 | Notebook kernel 3.13.2 | 3.14.7 | — |
| PyTorch | 2.7.0 (CUDA 12.4) | — | no GPU | **torch 2.7.0 has no cp314 wheel.** The official CPU index lists `cp314-cp314-win_amd64` wheels for torch **2.9.0, 2.9.1, 2.10.0, 2.11.0, 2.12.0/2.12.1, 2.13.0, 2.14.0/2.14.1** ([download.pytorch.org/whl/cpu/torch][torch-cpu-index]). So on Python 3.14 we cannot pin the paper's torch version |
| PyG | 2.6.1 | — | — | `torch_geometric` is a pure-Python `py3-none-any` wheel: 2.6.1 (2024-09-26), 2.7.0 (2025-10-15), 2.8.0 (2026-06-05), 2.8.0.post1 (2026-07-20), 2.8.1 (2026-10-12). The latest metadata says `requires_python >=3.10` with classifiers up to 3.14 ([PyPI torch-geometric][pyg-pypi]). The model needs **no** compiled extensions: GATv2Conv, GCNConv, GAE, BatchNorm and global_mean_pool all run on the pure-PyTorch path. Whether 2.6.1 runs cleanly against torch ≥ 2.9 on 3.14 is **[UNVERIFIED]** |
| SciPy | — | `simpson` import (the modern name) | — | The notebook uses `scipy.integrate.simpson`, which is fine on current SciPy. A cp314 Windows wheel for SciPy is **[UNVERIFIED]** in-session |
| OS / HW | Ubuntu 22.04, RTX 3090, Xeon 8358P | — | Windows 11, 8 CPU cores, no GPU | The model is tiny (0.15 M params, 22-node graphs). CPU is viable (estimate in §10) |

**Recommendation:** keep system Python 3.14.7 and use **torch 2.9.1+cpu** (or the newest CPU wheel at least 2 weeks old) plus **torch_geometric 2.7.0 or 2.8.0.post1**. Record the version deviation from the paper (2.7.0 / 2.6.1) in `docs/traceability.md`. If exact parity with the paper's stack is demanded, a Python 3.10–3.12 interpreter would have to be installed, which needs user approval. The model's numerics do not depend on those versions in any documented way.

---

## 7. Licence and reuse

- **No LICENSE file; the API reports `license: null`** ([API repo][api-repo]). By default the code is fully protected by copyright: "Unless you include a license that specifies otherwise, nobody else can copy, distribute, or modify your work." GitHub's terms allow viewing and forking on GitHub, not reuse ([choosealicense.com/no-permission][nolicense]).
- The **paper** is CC BY 4.0 (p.1 footer, l.41–46), so we may reuse and describe the *method*, equations and numbers with attribution. That licence does not extend to the repository code.
- **Policy for SilentAssist:**
  - We write our **own** implementation from the paper plus PyG's public API.
  - Docs may describe the authors' design choices (as this brief does) and quote single short lines for traceability.
  - We do **not** copy files, functions or notebook cells.
  - Using PyG's built-in `GATv2Conv`, `GCNConv`, `GAE` and `BatchNorm` is fine: PyG is MIT-licensed ([PyG LICENSE][pyg-license]). That is our dependency, not their code.
  - The `.npz` format, function names and file layout are not reused.

---

## 8. Other observations useful for implementation

- **Edge-count budget (estimate).** With per-trial whole-matrix z-scoring and τ = 0.3, if the off-diagonal z-values were roughly Gaussian, P(z > 0.3) ≈ 38 %. That gives about 175 of 462 directed pairs (about 8 neighbours per node) before evolution. This is an **estimate, not measured**; the real distribution is skewed by volume conduction. A test should log the actual edge counts per trial.
- **Symmetry.** The z-scored PLV is symmetric, so `edge_index` contains both directions. The inner-product decoder is symmetric, but whether the missing MC function samples the two directions independently (which breaks symmetry) or once per pair is **[UNVERIFIED]**.
- **Monotone sparsification.** Decoding only on existing edges means Â₃ ⊆ Â₂ ⊆ Â₁ ⊆ A. This matches Fig. 6's "sparser" evolved graph. A node can lose all its edges, but GATv2's self-loops keep it alive.
- **BN and batch composition.** Node-level BN mixes all 22×64 nodes, so a smaller last batch (288 mod 64 = 32) changes the statistics slightly. That is standard PyG behaviour ([batch_norm.py][pyg-bn]).
- **Latency claim.** The paper measured inference with "a minimal pure PyTorch implementation" (l.836–837), so its 0.066 ms/sample figure did not come from this PyG code.
- **OpenBMI 2-class path.** `load_data(n_classes=2)` keeps the first two labels (left and right hand), which matches §3.9 / Table 4.

---

## 9. Recommended implementation stance

I recommend this precedence rule for the debates to adopt or reject: **(1)** explicit numeric statements in the paper text win (dropout 0.5, Butterworth order 4, Welch 250); **(2)** where the paper is silent or garbled, the released code wins (stem GATv2, residual, encoder BN, ReLU-before-BN in the classifier, concat heads, binary edges, τ = 0.3); **(3)** the Table 1 parameter sum (149,796) is the tiebreaker for structure; **(4)** anything neither source fixes (η, mask gradient, GAE loss, seeds) gets an ADR, with sensitivity runs **on session-1 validation only**.

---

## Decisions the debates must settle

1. **η (evaluation mask threshold).**
   - Options: (a) 0.5; (b) tune on a session-1 validation split; (c) use the expected mask (keep edges with P > E[R] = 0.5, the same as a); (d) match training edge density.
   - **Recommendation: (a) η = 0.5.** It is the mode of Bernoulli(P), so the deterministic eval graph equals the most likely training graph. Run a sensitivity sweep {0.3, 0.4, 0.5, 0.6, 0.7} **on session-1 validation only**.
   - Evidence: Eq. 17–18 (p.7) and the Bernoulli interpretation (l.911–913); the code is silent.
2. **GAE learning signal.**
   - Options: (a) CE only, GAE frozen at init, which is exactly what the released code and §3.3 imply; (b) CE + λ·Σ_blocks `recon_loss` (PyG BCE with negative sampling), which follows the §2.2 wording; (c) a soft/straight-through mask so CE reaches the GAE.
   - **Recommendation: (a) as the "as-published" primary run, with (b) at λ ∈ {0.1, 1.0} as a declared variant.** Report both, and select by session-1 validation only.
   - Evidence: §5 of this brief; [SFE-GAT.py][sfegat-py]; [autoencoder.py][pyg-gae]; [sgd.py][torch-sgd].
3. **Gradient path through the MC mask.**
   - Options: none (hard index selection, matching the code); straight-through `m = hard + p − p.detach()` used as edge weights (needs edge-weight-aware layers, so GATv2 would require `edge_dim`, adding parameters); Gumbel-sigmoid.
   - **Recommendation: none**, to stay code-faithful and parameter-count-faithful (any `edge_dim` breaks 149,796). Document the "differentiable" claim as unsupported by the released code.
   - Evidence: §5; [gatv2_conv.py][pyg-gatv2] (lin_edge exists only when `edge_dim` is set).
4. **Stem GATv2 and residual connection.**
   - Options: paper-text-literal (3 blocks, the first taking 8-dim input, no residual) vs code (stem plus residual).
   - **Recommendation: the code version.** Table 1 sums to 149,796 only with the stem, and the residual adds no parameters but likely matters for 3-block stability.
   - Evidence: §2.3.
5. **Dropout: 0.5 (paper) vs 0.2 (code).**
   - **Recommendation: 0.5** (explicit in Eq. 23 and the mission spec). Log 0.2 as an ablation.
   - Evidence: l.442–445; [SFE-GAT.py][sfegat-py].
6. **Filter order: 4 (paper) vs 5 (code); Welch segment: 250 (paper) vs 500 (code).**
   - **Recommendation: paper values (4, 250)**, with the code values as a one-off sensitivity check.
   - Evidence: l.240–257; [notebook][nb].
7. **Edge weights.**
   - Options: binary A (code) vs PLV-weighted A in the GCN encoder (Eq. 5).
   - **Recommendation: binary (code).** GATv2 cannot consume weights without `edge_dim`, and the released `Data` has no weights.
   - Evidence: §2.2.
8. **Node-feature scaling.**
   - Options: raw V² (MOABB units); µV² (×1e12); log band power; train-fit standardisation.
   - **Recommendation: µV²**, a units choice and not a transform, with no other normalisation (faithful). Run log-power as a declared variant only if training stalls.
   - Evidence: the notebook has no normalisation; MNE/MOABB units are volts (**[UNVERIFIED]** in-session for their pipeline).
9. **PLV band and window.**
   - Options: broadband 2–6 s epoch as delivered (0.5–100 Hz + 50 Hz notch); 8–30 Hz pre-filtered; per filter-bank band.
   - **Recommendation: broadband 2–6 s, per trial.** The paper describes no band-limiting for PLV, and per-trial is confirmed by the code's assert.
   - Evidence: l.163–176; [notebook][nb].
10. **SD protocol: per-subject vs pooled model.**
    - **Recommendation: per-subject models** (the code loads `A0xT` per subject; the Fig. 3a per-subject bars). Flag the pooled reading of "288 × 9" as the alternative.
    - Evidence: p.9 l.539–542; [notebook][nb].
11. **Checkpoint selection.**
    - **Recommendation: last epoch (500).** There is no validation-based early stopping in either source, and selecting on session 2 is forbidden.
    - Evidence: §3.3; CLAUDE.md §6.

## Open questions for the user

1. The repo README says the **full code is available from the corresponding author on request** (`cghcust@163.com`). Do you want to email the authors yourself, asking for `compute_plv`, `z_score_norm`, `monte_carlo_new_edge_index`, η, the training loop (loss terms, momentum, seed), and the `.npz` creation script? I cannot send email, and CLAUDE.md forbids outbound posting.
2. Are you comfortable with **torch 2.9.x / PyG 2.7–2.8 on Python 3.14** instead of the paper's torch 2.7.0 / PyG 2.6.1 / Python 3.10? The alternative is installing a separate Python 3.10–3.12 interpreter.
3. For the ambiguous items, should the **"as-published" primary run follow the code** (CE-only, frozen GAE, binary edges) even though that contradicts the paper's "differentiable" claim, with the paper-literal reading as a variant? Or the reverse?
4. SD protocol: per-subject models (my reading) or one pooled model across 9 subjects' session-1 data?

## Things requiring user approval

| Item | Size / time | Notes |
|---|---|---|
| Create `research/.venv` (Python 3.14.7) | < 1 min, about 20 MB | Per CLAUDE.md §1 |
| `pip install torch==2.9.1+cpu` (or newer, at least 2 weeks old) from `download.pytorch.org/whl/cpu` | about 110–250 MB wheel, about 0.5–1 GB installed **[UNVERIFIED size]** | No CUDA, since there is no GPU |
| `pip install torch_geometric==2.7.0` (or 2.8.0.post1) | about 1–2 MB pure Python wheel **[UNVERIFIED size]** | No `torch_scatter`/`torch_sparse` needed |
| `numpy`, `scipy`, `scikit-learn`, `mne`, `moabb`, `pyyaml`, `pytest`, `matplotlib` | about 150–300 MB total **[UNVERIFIED]** | MOABB/MNE are for data access (the MI-EEG Scientist's brief owns this) |
| Download BCI IV-2a via MOABB `BNCI2014_001` into `research/data/` | about 0.4–0.5 GB for 9 subjects × 2 sessions **[UNVERIFIED]** | The MI-EEG brief should confirm size and labels |
| Training runs on CPU (estimate, **[UNVERIFIED]**) | **SD:** 288 trials → 5 batches/epoch × 500 = 2,500 steps/subject. At about 20–60 ms/step on 8 cores that is about 1–3 min/subject, **about 10–30 min** for 9 subjects. **SI LOSO:** 2,304–4,608 training trials → 36–72 steps/epoch × 500 = 18k–36k steps/fold, so about 6–36 min/fold and **about 1–5 h** for 9 folds. **Ablations (5 variants × SD):** about 1–2.5 h. Sensitivity sweeps (η, λ) are extra | Each run over 15 min needs approval (CLAUDE.md §1). Feature extraction must be vectorised: the notebook's triple loop is about 0.9 M `welch` calls for 5,184 trials |

## References

- [repo]: https://github.com/GaoHSin/SFE-GAT (repo page, read 2026-10-14)
- [api-repo]: https://api.github.com/repos/GaoHSin/SFE-GAT (metadata: `license: null`, created/pushed 2026-01-12)
- [api-contents]: https://api.github.com/repos/GaoHSin/SFE-GAT/contents
- [api-tree]: https://api.github.com/repos/GaoHSin/SFE-GAT/git/trees/main?recursive=1
- [api-branches]: https://api.github.com/repos/GaoHSin/SFE-GAT/branches
- [api-commits]: https://api.github.com/repos/GaoHSin/SFE-GAT/commits
- [readme]: https://raw.githubusercontent.com/GaoHSin/SFE-GAT/main/README.md
- [sfegat-py]: https://raw.githubusercontent.com/GaoHSin/SFE-GAT/main/SFE-GAT.py (commit 88ed7f2)
- [nb]: https://raw.githubusercontent.com/GaoHSin/SFE-GAT/main/PLV%26PSD.ipynb (commit 88ed7f2)
- Base paper: Gao, X.; Cao, G.; Ma, G. "SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding." *Sensors* 2026, 26, 1730. https://doi.org/10.3390/s26051730 (local: `sensors-26-01730-v2.pdf`, text `docs/research/_paper-text.txt`)
- [pyg-gatv2]: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gatv2_conv.py
- [pyg-gcn]: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gcn_conv.py
- [pyg-gae]: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/models/autoencoder.py
- [pyg-bn]: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/norm/batch_norm.py
- [pyg-license]: https://github.com/pyg-team/pytorch_geometric/blob/master/LICENSE (MIT; **[UNVERIFIED]** in-session, not fetched)
- [pyg-pypi]: https://pypi.org/pypi/torch-geometric/json
- [torch-cpu-index]: https://download.pytorch.org/whl/cpu/torch/
- [torch-sgd]: https://raw.githubusercontent.com/pytorch/pytorch/v2.7.0/torch/optim/sgd.py
- [scipy-welch]: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html
- [scipy-butter]: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.butter.html
- [nolicense]: https://choosealicense.com/no-permission/
- [bciiv-results]: https://www.bbci.de/competition/iv/results/ (true labels for evaluation sessions; **[UNVERIFIED]** in-session, not fetched)
- Kipf, T.N.; Welling, M. "Variational Graph Auto-Encoders." arXiv:1611.07308 (2016): the GAE formulation PyG implements (paper ref [30]).

[repo]: https://github.com/GaoHSin/SFE-GAT
[api-repo]: https://api.github.com/repos/GaoHSin/SFE-GAT
[api-contents]: https://api.github.com/repos/GaoHSin/SFE-GAT/contents
[api-tree]: https://api.github.com/repos/GaoHSin/SFE-GAT/git/trees/main?recursive=1
[api-branches]: https://api.github.com/repos/GaoHSin/SFE-GAT/branches
[api-commits]: https://api.github.com/repos/GaoHSin/SFE-GAT/commits
[readme]: https://raw.githubusercontent.com/GaoHSin/SFE-GAT/main/README.md
[sfegat-py]: https://raw.githubusercontent.com/GaoHSin/SFE-GAT/main/SFE-GAT.py
[nb]: https://raw.githubusercontent.com/GaoHSin/SFE-GAT/main/PLV%26PSD.ipynb
[pyg-gatv2]: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gatv2_conv.py
[pyg-gcn]: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gcn_conv.py
[pyg-gae]: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/models/autoencoder.py
[pyg-bn]: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/norm/batch_norm.py
[pyg-license]: https://github.com/pyg-team/pytorch_geometric/blob/master/LICENSE
[pyg-pypi]: https://pypi.org/pypi/torch-geometric/json
[torch-cpu-index]: https://download.pytorch.org/whl/cpu/torch/
[torch-sgd]: https://raw.githubusercontent.com/pytorch/pytorch/v2.7.0/torch/optim/sgd.py
[scipy-welch]: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html
[scipy-butter]: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.butter.html
[nolicense]: https://choosealicense.com/no-permission/
[bciiv-results]: https://www.bbci.de/competition/iv/results/
