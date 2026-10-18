# Base-Paper Brief: SFE-GAT, dissected (Paper Analyst, Phase 1)

**Paper.** X. Gao, G. Cao, G. Ma, "SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding", *Sensors* 2026, 26(5), 1730, doi:10.3390/s26051730 (local copy `sensors-26-01730-v2.pdf`; text extraction `docs/research/_paper-text.txt`). Cited below as **[P]**, with section, equation, table or figure numbers.

**How this brief was produced.** The `-layout` extraction garbles the equations, Table 1 and the figures. So, besides reading `_paper-text.txt`, I:

- re-extracted Table 1 with `pdftotext -table` and `-raw`;
- decompressed the PDF content streams with a stdlib-only Python script (zlib, no installs) and read the glyphs, fonts and positions of every equation;
- read the horizontal rules of Table 1, which give its row grouping;
- read the **bar labels of Fig. 3** in plotting order (PDF objects 882/894);
- read the **vector box-plot geometry of Fig. 4** (PDF object 905: box edges, median line, mean cross, whisker caps), and calibrated it against the gridlines.

The Fig. 4 calibration was validated against the SFE-GAT box, whose statistics follow from Fig. 3a: the median read as 80.21 against a true 80.21, and the whiskers as 61.51/89.20 against 61.46/89.24. The reading error is therefore ≤ 0.05 pp. The scripts are in the session scratchpad and are not project files.

**Cross-check against the public code.** I made two read-only WebFetch passes over https://github.com/GaoHSin/SFE-GAT (`SFE-GAT.py`, `PLV&PSD.ipynb`). What came back was a model-generated *summary* of the files, not verbatim code. Every code-derived statement is therefore tagged **[CODE-SUMMARY, verify]**. The Reference-Code Auditor's brief is authoritative for the code.

---

## 1. Pipeline at a glance, with shapes for one trial and one batch

C = 22 electrodes, B = 8 bands, fs = 250 Hz, window t = 2–6 s, giving T = 1000 samples (or 1001 if both endpoints are included, as MNE/MOABB crop does: see A21). Classes n = 4.

| Stage | Op | One trial: in → out | Batch of 64 (PyG flattening) |
|---|---|---|---|
| raw | crop 2–6 s, 22 EEG channels (EOG dropped) | X ∈ ℝ^{22×1000} | — |
| Eq. 1 | Hilbert phase → PLV | θ ∈ ℝ^{22×1000} → PLV ∈ [0,1]^{22×22}, symmetric, diag = 1 | — |
| Eq. 2–4 | whole-matrix z-score, zero diagonal | PLV′ ∈ ℝ^{22×22} | — |
| Eq. 5 | threshold τ | A ∈ ℝ^{22×22} (weighted, sparse) → `edge_index` ∈ ℤ^{2×E}, E ≤ 462 | 2 × ΣE |
| Eq. 6 | 8 zero-phase Butterworth band-passes | x_k ∈ ℝ^{22×1000}, k = 1..8 | — |
| Eq. 7 | Welch PSD, Hann, nperseg 250, 50 % overlap → 7 segments, 1 Hz bins | PSD_k ∈ ℝ^{22×126} | — |
| Eq. 8 | in-band integral | H ∈ ℝ^{22×8} | X ∈ ℝ^{1408×8} |
| Table 1 row 1 ("stem") | GATv2Conv(8→32, heads 4, concat) | ℝ^{22×8} → ℝ^{22×128} | ℝ^{1408×128} |
| Block ℓ = 1..3: Eq. 9–12 | GATv2Conv(128→32×4) + ReLU | ℝ^{22×128} → ℝ^{22×128}; attention α ∈ ℝ^{(E+22)×4} (self-loops added) | — |
| Eq. 13–14 | BatchNorm(128) over all nodes in the batch | ℝ^{22×128} | statistics over 1408 nodes |
| Eq. 15 | GCNConv(128→32) + ReLU (+ BN(32): see §3) | Z ∈ ℝ^{22×32} | — |
| Eq. 16 | σ(Z Zᵀ) | P ∈ (0,1)^{22×22} (only entries on existing edges matter) | — |
| Eq. 17/18 | mask; Â = A ⊙ M | M ∈ {0,1}^{22×22}; Â ∈ ℝ^{22×22} | — |
| Eq. 20–21 | GATv2Conv(128→32×4) + BN(128) | ℝ^{22×128} | — |
| Eq. 22 | global mean pool | h_graph ∈ ℝ^{128} | ℝ^{64×128} |
| Eq. 23–24 | Dropout(0.5), Linear(128→4), softmax | ŷ ∈ Δ^3 | ℝ^{64×4} |

Total trainable parameters under the Table 1 reconstruction: **149,796** (≈ 0.15M, as stated) [P §3.3]. See §3.

---

## 2. Equation by equation (Eqs. 1–28)

Glyph identities were read from the PDF fonts. The PazoMath-Italic font maps `a`→α, `m`→μ, `s`→σ, `e`→ϵ, `t`→τ, `q`→θ, `g`→γ, `b`→β. This was verified from its ToUnicode CMap (PDF object 381).

### Graph construction [P §2.1]

**Eq. 1. PLV.**
$$\Delta\theta_{ij}(t)=\theta_i(t)-\theta_j(t),\qquad \mathrm{PLV}_{ij}=\Big|\tfrac{1}{T}\textstyle\sum_{t=1}^{T} e^{\,\mathrm{i}\,\Delta\theta_{ij}(t)}\Big|$$
with θ_i(t) = arg(x_i(t) + i·𝓗{x_i}(t)), the Hilbert analytic signal.
- In: x ∈ ℝ^{22×T}. Out: PLV ∈ [0,1]^{22×22}, symmetric, PLV_ii = 1.
- **Not stated:** the band in which the phase is taken. The text says "each electrode's signal", which implies broadband 0.5–100 Hz [A10]. Whether PLV is per trial is also not stated in the text; the evidence says per trial [A11].

**Eq. 2. Whole-matrix moments.**
$$\mu=\tfrac{1}{C^2}\textstyle\sum_{i=1}^{C}\sum_{j=1}^{C}\mathrm{PLV}_{ij},\qquad \sigma=\sqrt{\tfrac{1}{C^2}\textstyle\sum_{i,j}(\mathrm{PLV}_{ij}-\mu)^2}$$
- The printed equation uses PLV′ (prime) inside both sums, which is circular and therefore a notation slip. Read it as raw PLV.
- σ is the population SD (ddof = 0).
- **Both sums include the diagonal (PLV_ii = 1), because zeroing (Eq. 4) comes after.** This matters for Python↔JS parity.

**Eq. 3. Standardise.**
$$\mathrm{PLV}'_{ij}=\frac{\mathrm{PLV}_{ij}-\mu}{\sigma+\epsilon},\quad \epsilon=10^{-8}$$
- The PDF geometry confirms that ϵ sits *in the denominator*: the fraction bar spans x = 366.9–396.0 and "σ + ϵ" lies below it.
- The numerator is printed as "P_ij", a symbol slip for PLV_ij.

**Eq. 4.** PLV′_ii = 0 for all i ∈ [1, C].
- This is moot for message passing: PyG's GATv2Conv and GCNConv add self-loops by default (`add_self_loops=True`) ([PyG gatv2_conv.py](https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gatv2_conv.py), [PyG gcn_conv.py](https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gcn_conv.py)).
- It only keeps i→i out of the edge list and the mask.

**Eq. 5. Threshold.**
$$A_{ij}=\begin{cases}\mathrm{PLV}'_{ij},&\mathrm{PLV}'_{ij}>\tau\\ 0,&\text{otherwise}\end{cases}$$
- τ is in z-units and **its value is never given** [A1].
- A is *weighted*, and the weights are z-scores, so they can be negative only if τ < 0.
- Because the z-score is taken per matrix, graph density is roughly constant across trials. For example, τ = 0 keeps roughly the above-mean half of the off-diagonal entries. This is my inference, not stated in the paper.

**Eq. 6. Filter bank.**
$$x_k(t)=\mathrm{Bandpass}\big(x(t),f^k_{\text{low}},f^k_{\text{high}}\big),\quad f^k_{\text{low}}=8+4(k-1),\ f^k_{\text{high}}=f^k_{\text{low}}+4,\ k=1..8$$
- The bands are 8–12, 12–16, …, 36–40 Hz, so **B = 8**, which matches Table 1's input width of 8.
- The filter is a "zero-phase 4th-order Butterworth (scipy.signal) with Rp = 0.5 dB and Rs = 40 dB" [P §2.1].
- **Rp/Rs do nothing for a Butterworth.** SciPy uses them only for Chebyshev and elliptic designs ([scipy.signal.iirfilter](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.iirfilter.html)).
- A band-pass `butter(N=4)` has order 2N = 8 ([scipy.signal.butter](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.butter.html)). SciPy recommends `output='sos'` for narrow-band designs (same page). Zero-phase filtering (`sosfiltfilt`) squares the magnitude response.

**Eq. 7. PSD (as printed).**
$$\mathrm{PSD}_k(f)=\tfrac{1}{T}\Big|\textstyle\sum_{t=1}^{T}x_k(t)e^{-\mathrm{i}2\pi f t}\Big|^2$$
- **This is the single periodogram, not Welch.** The text then says Welch, with 1-s segments (250 samples), 50 % overlap and a Hann window.
- Implement Welch as `scipy.signal.welch(fs=250, nperseg=250, noverlap=125, window='hann')`. The defaults are detrend 'constant', scaling 'density' and mean averaging ([scipy.signal.welch](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html)).
- On 1000 samples this gives 7 segments and 1 Hz bins, 0–125 Hz (126 bins).

**Eq. 8. Band power.**
$$\mathrm{PSD}^{\text{band}}_k=\int_{f^k_{\text{low}}}^{f^k_{\text{high}}}\mathrm{PSD}_k(f)\,df,\quad h_i=[\mathrm{PSD}^{\text{band}}_1,\dots,\mathrm{PSD}^{\text{band}}_B]\in\mathbb{R}^B,\quad H=[h_1,\dots,h_C]^\top\in\mathbb{R}^{C\times B}$$
- Not specified: the quadrature rule, whether the band edges are inclusive (12 Hz falls in two bands), units (V² vs µV²), and any log or normalisation [A14].
- Band-passing first and then integrating over the *same* band is nearly redundant with integrating the raw PSD. The filter only adds roll-off shaping (my analysis).

### Graph evolution block [P §2.2]

**Eq. 9. Attention energy, as printed.**
$$e_{ij}=\mathrm{LeakyReLU}\big(\mathbf{a}^\top[\mathbf{W}h_i\,\Vert\,\mathbf{W}h_j]\big)$$
- **This is the original GAT ("static") score, not GATv2.** GATv2 moves the nonlinearity inside: $e_{ij}=\mathbf{a}^\top\mathrm{LeakyReLU}(\mathbf{W}[h_i\Vert h_j])$ (Brody, Alon & Yahav, "How Attentive are Graph Attention Networks?", ICLR 2022, [arXiv:2105.14491](https://arxiv.org/abs/2105.14491)).
- PyG's `GATv2Conv` computes `x_i + x_j` (from `lin_r`/`lin_l`), then `leaky_relu(·, 0.2)`, then `(x * att).sum(-1)`, then a softmax over neighbours ([PyG 2.6.1 source](https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gatv2_conv.py)).
- **Table 1's parameter counts match PyG `GATv2Conv` exactly and *not* `GATConv`** (§3). So the implementation is GATv2 and Eq. 9 is a typo [A20].
- In: h ∈ ℝ^{128} (ℝ^8 for the stem). Per head k = 1..4: W_l^k, W_r^k ∈ ℝ^{32×128}, a^k ∈ ℝ^{32}.

**Eq. 10.**
$$\alpha_{ij}=\frac{\exp(e_{ij})}{\sum_{k\in\mathcal N(i)}\exp(e_{ik})}$$
𝓝(i) includes i itself, because of the default self-loops.

**Eq. 11.**
$$h'_i=\sigma\Big(\mathbf W\textstyle\sum_{j\in\mathcal N(i)}\alpha_{ij}h_j\Big)$$
- PyG computes $h'_i=\Vert_{k=1}^{4}\sum_j\alpha^k_{ij}\,\mathbf W^k_l h_j+b$, with heads concatenated (ℝ^{4·32 = 128}) and no activation inside the layer.
- The activation is applied outside, in Eq. 12.

**Eq. 12.**
$$H^{(evo)}_{gat}=\mathrm{ReLU}(\mathrm{GATv2}(H,A))\in\mathbb R^{22\times128}$$
- The order is **ReLU then BN**. Fig. 1 labels the box "Batch Norm + ReLU" [A17].
- GATv2 consumes only the *topology* of A. The parameter count rules out `edge_dim` (§3).

**Eq. 13. BatchNorm.**
$$h^{bn}_{:,j}=\gamma_j\cdot\frac{h_{:,j}-\mu_j}{\sigma_j}+\beta_j$$
- In practice the denominator is √(σ_j² + ε_BN), with ε_BN at the PyTorch default of 1e-5 (not stated).
- The statistics run over every node of every graph in the mini-batch (1408 rows for a batch of 64). There are 128 features, so 256 parameters, which matches Table 1.
- The running-stat momentum is not stated (PyTorch default 0.1).

**Eq. 14.**
$$H^{(evo)}_{bn}=\mathrm{BatchNorm}(H^{(evo)}_{gat})$$

**Eq. 15. GAE encoder.**
$$Z_{enc}=\mathrm{ReLU}\big(\mathrm{GCNConv}(H^{(evo)}_{bn},A)\big)\in\mathbb R^{22\times32}$$
- GCNConv computes $\hat D^{-1/2}(A+I)\hat D^{-1/2}HW+b$ and, if given `edge_weight`, uses it in the normalisation ([PyG gcn_conv.py](https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gcn_conv.py)).
- Whether A is passed weighted or binary is not stated [A12].
- **Table 1 lists 4192 parameters, not 4128.** That implies an extra 64-parameter affine layer, almost certainly BN(32) (§3). The code summary describes `GCNEncoder` as GCN → ReLU → BatchNorm [CODE-SUMMARY, verify].

**Eq. 16. Inner-product decoder.**
$$P_{\hat A}(i,j)=\sigma(z_i^\top z_j)$$
- **Consequence of the literal Eq. 15 (ReLU, no BN):** z ≥ 0, so z_iᵀz_j ≥ 0 and **P ≥ 0.5 everywhere**. In training (Eq. 17) every edge is then kept with probability ≥ 0.5. In evaluation (Eq. 18) any threshold ≤ 0.5 prunes nothing.
- With BN(32) after the ReLU (Table 1 and code), z can be negative and P spans (0,1).
- This is my analysis, and it is decisive for A2.

**Unnumbered, between Eqs. 16 and 17.** Â = A ⊙ M, where ⊙ is the Hadamard product.
- **Edges can only be removed, never added.** Across blocks, $A^{(\ell+1)}=A^{(\ell)}\odot M^{(\ell)}$, so the evolution is a monotone sparsification of the PLV support. This is consistent with Fig. 6 ("sparser").
- R-SFE-GAT can therefore only prune its random initial edges.

**Eq. 17. Training mask.**
$$M=\mathbb I(P_{\hat A}>R),\quad R_{ij}\overset{iid}{\sim}U(0,1)$$
- This is equivalent to M_ij ~ Bernoulli(P_ij).
- Unspecified: whether R is symmetric (per undirected edge) or per directed entry; and whether it is resampled per sample and per forward pass (presumably yes) [A16].

**Eq. 18. Evaluation mask.**
$$M=\mathbb I(P_{\hat A}>\eta)$$
- **The threshold symbol is inconsistent.** The prose says "a fixed threshold **τ**", the same glyph as the PLV threshold in Eq. 5 (PazoMath `t` = τ). The equation itself prints a bold **ø** (URW Palladio Bold code 248 = `oslash`; PDF Encoding object 146).
- No value is given. "η" is our project label, not the paper's [A2].

**Eq. 19.**
$$(H,A)\leftarrow\mathrm{GraphEvolutionLayer}(H,A)$$
- The block returns (H_bn^{(evo)} ∈ ℝ^{22×128}, Â). Z (32-d) is used only for the mask: Table 1's next-block input width is 128, not 32.
- L = 3 blocks.

### Classifier [P §2.3]

- **Eq. 20.** $H^{(cls)}_{gat}=\mathrm{GATv2}(H_{evolved},A_{evolved})$. No ReLU is written, but Fig. 1 shows "Batch Norm + ReLU" in the classifier column too [A17].
- **Eq. 21.** $H^{(cls)}_{bn}=\mathrm{BatchNorm}(H^{(cls)}_{gat})$.
- **Eq. 22.** $h_{graph}=\tfrac1C\sum_{i=1}^{C}H_{cls}[i,:]\in\mathbb R^{128}$.
- **Eq. 23.** $h_{drop}=\mathrm{Dropout}(h_{graph},p=0.5)$. The code uses p = 0.2 [CODE-SUMMARY, verify] [A18].
- **Eq. 24.** $\hat y=\mathrm{Softmax}(W_{fc}h_{drop}+b_{fc})$, with W_fc ∈ ℝ^{4×128} and b_fc ∈ ℝ^4. In training the softmax is folded into `CrossEntropyLoss` on the logits.

### Metrics [P §3.2]

**Eq. 25.**
$$\mathrm{ACC}=\tfrac1n\textstyle\sum_{i=1}^{n}TP_i/I_i$$
- This is mean per-class recall (balanced accuracy), where I_i is the number of samples of class i.
- On BCI IV-2a's balanced 72-per-class test sets it equals plain accuracy.

**Eq. 26.** Macro precision $\tfrac1n\sum_i\frac{TP_i}{TP_i+FP_i}$.

**Eq. 27.** $F1=\tfrac1n\sum_i\frac{2P_iR_i}{P_i+R_i}$. This is the mean of per-class F1 (sklearn `f1_score(average='macro')`), *not* F1 of macro-P and macro-R.

**Eq. 28.** Cohen's κ, $\frac{P_o-P_e}{1-P_e}$.
- **With balanced true classes, P_e = Σ_i (72/288)(pred_i/288) = 0.25 exactly, whatever the predictions.** So κ = (acc − 0.25)/0.75 is a deterministic function of accuracy, and is *not* an independent metric here.
- All 18 per-subject κ values in Fig. 3 satisfy this to 3 d.p. This is my verification; see the consistency checks in §5.

---

## 3. Table 1 rebuilt, and the parameter audit

**A clean extraction exists.** `pdftotext -table -f 9 -l 9` gives the table below. The PDF content stream (object 840) shows **a horizontal rule (y = 319.29) between the first GATv2Conv row and the GraphEvoBlock-1 rows**, and that first row has an *empty* "Blocks" cell. So the 8-input GATv2Conv is a **separate stem/input layer, not part of block 1**.

| Blocks | Layer | In | Hidden | Out | Heads | Params (paper) |
|---|---|---|---|---|---|---|
| (stem, unlabelled) | GATv2Conv | 8 | 32 | 128 | 4 | 2560 |
| GraphEvoBlock-1 | GATv2Conv / BatchNorm / GAE / MC-EdgeGen | 128 / 128 / 128 / – | 32 / 128 / 32 / – | 128 / 128 / 32 / – | 4 / – / – / – | 33,280 / 256 / 4192 / – |
| GraphEvoBlock-2 | (same) | | | | | 33,280 / 256 / 4192 / – |
| GraphEvoBlock-3 | (same) | | | | | 33,280 / 256 / 4192 / – |
| Classifier | GATv2Conv / BatchNorm / GlobalMeanPool / Dropout / Linear | 128 / 128 / 128 / 128 / 128 | 32 / 128 / – / – / 4 | 128 / 128 / 128 / 128 / 4 | 4 / – / – / – / – | 33,280 / 256 / – / – / 516 |

**PyG `GATv2Conv` parameterisation (2.6.1).**
- `lin_l = Linear(in, heads·out, bias=True)`.
- `lin_r` is the same shape, but a separate layer because `share_weights=False` by default.
- `att ∈ ℝ^{1×heads×out}`.
- `bias ∈ ℝ^{heads·out}` if `concat` else ℝ^{out}.
- `res` only if `residual=True`; `lin_edge` (no bias) only if `edge_dim` is set.

Source: [PyG gatv2_conv.py @2.6.1](https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gatv2_conv.py).

The counts below were computed with plain Python and checked by hand.

| Candidate | Formula | Count | Matches? |
|---|---|---|---|
| GATv2Conv(8→32, h = 4, **concat**, no share) | 2·(8·128 + 128) + 128 + 128 | **2560** | ✔ 2560 |
| … with concat = False (mean of heads) | 2·1152 + 128 + 32 | 2464 | ✘ |
| … with share_weights = True | 1152 + 128 + 128 | 1408 | ✘ |
| … with edge_dim = 1 (weights used as edge features) | 2560 + 128 | 2688 | ✘ |
| GATConv v1 (8→32, h = 4) | 8·128 + 3·128 | 1408 | ✘ |
| GATv2Conv(128→32, h = 4, **concat**) | 2·(128·128 + 128) + 128 + 128 | **33,280** | ✔ 33,280 |
| … concat = False | | 33,184 | ✘ |
| … edge_dim = 1 | | 33,408 | ✘ |
| BatchNorm(128) | γ, β | **256** | ✔ |
| GCNConv(128→32) | 128·32 + 32 | 4128 | ✘ (64 short) |
| **GCNConv(128→32) + BN(32)** (or LayerNorm(32)) | 4128 + 64 | **4192** | ✔ |
| Linear(128→4) | 512 + 4 | **516** | ✔ |

**Deductions.**

1. **Heads are concatenated**, giving 4 × 32 = 128. That is the only reading that gives 2560 and 33,280.
2. **`share_weights=False` and no `edge_dim`.** GATv2 never sees the PLV edge weights, only the topology.
3. **The paper's code is PyG GATv2Conv, not GATConv**, which settles the Eq. 9 typo.
4. **The GAE encoder is GCNConv(128→32) plus a 64-parameter norm on Z.** BN(32) is the most likely, and the code summary says "GCN → ReLU → BatchNorm" [CODE-SUMMARY, verify]. Eq. 15 omits it.
5. **The total supports a stem plus 3 blocks, i.e. 4 GATv2 layers before the classifier and 5 GATv2 in all:**
   - H1, Table-literal: 2560 + 3 × (33,280 + 256 + 4192) + (33,280 + 256 + 516) = **149,796 ≈ 0.15M** ✔.
   - With BN(128) after the stem: 150,052. Without the GAE's BN(32): 149,604. Both still round to 0.15M.
   - H2, text-literal (block 1's GATv2 is the 8→128 layer, so only 3 GATv2 before the classifier): 116,516 ≈ **0.12M** ✘.
   - Mean-pooled heads with 32-d features throughout: 40,644 ✘.
6. **The stem is described nowhere in §2.** It appears only in Table 1. No BN or activation is listed after it. The code summary says the stem has "no activation and no BatchNorm" [CODE-SUMMARY, verify].
7. The **"Hidden Channels" column means per-head `out_channels` = 32**. "Output Channels" = 128 is the concatenated width.

---

## 4. Hyperparameters: stated vs. missing

### Stated in the paper

| Item | Value | Source |
|---|---|---|
| Dataset | BCI Competition IV-2a: 9 subjects, 4 classes, 22 EEG channels, 250 Hz, 0.5–100 Hz band-pass + 50 Hz notch, 2 sessions × 288 trials (72 per class) | [P §3.1]; confirmed by the dataset description (Brunner et al. 2008, [desc_2a.pdf](https://www.bbci.de/competition/iv/desc_2a.pdf)) |
| Window | t = 2–6 s (cue appears at t = 2 s for 1.25 s; MI until t = 6 s) | [P §3.1]; desc_2a.pdf |
| Artifact handling | none; "no additional preprocessing" | [P §3.1] |
| PLV | Hilbert phase, Eq. 1 | [P §2.1] |
| z-score ϵ | 1e-8 | [P Eq. 3] |
| Filter bank | 8–40 Hz, 4 Hz steps (B = 8), zero-phase 4th-order Butterworth (scipy), "Rp 0.5 dB, Rs 40 dB" | [P §2.1] |
| Welch | 1-s segments (250 samples), 50 % overlap, Hann | [P §2.1] |
| GATv2 | heads 4, hidden 32/head, output 128 | [P Table 1] |
| GAE | GCN 128→32, inner-product sigmoid decoder | [P Eq. 15–16, Table 1] |
| Blocks | L = 3 | [P §2.2] |
| Classifier | GATv2 → BN → mean pool → Dropout p = 0.5 → Linear 128→4 → softmax | [P §2.3, Table 1] |
| Optimiser | SGD, lr 0.01, batch 64, weight decay 1e-3, CE loss, 500 epochs | [P §3.3] |
| Size | ≈ 0.15M trainable parameters | [P §3.3] |
| Stack | PyTorch 2.7.0, PyG 2.6.1, Python 3.10.16, CUDA 12.4, Ubuntu 22.04, RTX 3090, Xeon 8358P | [P §3.3] |
| Protocols | SD: session 1 → session 2, no CV; SI: LOSO, 9 folds | [P §3.3] |
| Latency | 0.066 ms/sample, "minimal pure PyTorch implementation" | [P §3.8] |

### Missing or unstated (each needs a decision)

**Graph construction**
- τ (Eq. 5).
- η, the evaluation mask threshold (Eq. 18).
- The PLV band, and Hilbert edge handling.
- Whether A is weighted or binary in GCN.

**Features**
- PSD units (MOABB returns volts; the GDF is in µV).
- Log or normalisation of H.
- The quadrature rule, and band-edge inclusivity.
- Filter form (`ba` or `sos`; `filtfilt` or `sosfiltfilt`).
- Whether the window is 1000 or 1001 samples.

**Architecture**
- Activation or BN after the stem.
- ReLU in the classifier.
- Residual connections (code only).
- GATv2 attention dropout (PyG default 0).
- negative_slope (PyG default 0.2).
- BN ε and momentum.
- Weight initialisation (PyG Glorot by default).

**Edge mask and GAE**
- Whether a GAE reconstruction loss exists, and its weight λ.
- The gradient estimator for the mask.
- R symmetry, and its resampling granularity.

**Training**
- SGD momentum (PyTorch default 0) and Nesterov.
- LR schedule.
- Seeds, and the number of runs averaged.
- Checkpoint selection (last epoch? best?).
- Validation split (none mentioned).

**Protocols**
- SD: per-subject models or one pooled model (see A15).
- LOSO: training sessions (8×288 or 8×576) and the test session.

**Analyses**
- t-SNE perplexity and input (which split; graph-level or node-level).
- The latency protocol (batch size, device, whether preprocessing is included).
- R-GAT random-adjacency density.
- PLV-GAT depth.
- OpenBMI preprocessing (1000 Hz → 250 Hz? channel mapping? 4-class → 2-class logit mapping).

---

## 5. Numbers we must reproduce

### Table 3 [P §3.8]

**Subject-dependent (SD)**

| Model | Acc | κ | Prec | F1 |
|---|---|---|---|---|
| EEGNet | 0.7222 | 0.6243 | 0.7433 | 0.7182 |
| DGCNN | 0.7465 | 0.6497 | 0.7612 | 0.7461 |
| FBCNet | 0.7465 | 0.6535 | 0.7819 | 0.7396 |
| EEGConformer | 0.7014 | 0.5524 | 0.7075 | 0.6996 |
| LightConvNet | 0.7674 | 0.6790 | 0.7891 | 0.7509 |
| IFNet | 0.7569 | 0.6626 | 0.7654 | 0.7560 |
| SF-TGCN | 0.7604 | 0.6628 | 0.7743 | 0.7592 |
| MSVTNet | 0.7604 | 0.6641 | 0.7808 | 0.7490 |
| **SFE-GAT** | **0.7770** | **0.7027** | **0.7802** | **0.7771** |

**Subject-independent (SI) and latency**

| Model | Acc | κ | Prec | F1 | Latency (ms/sample) |
|---|---|---|---|---|---|
| EEGNet | 0.5972 | 0.4591 | 0.6471 | 0.5850 | 0.014 |
| DGCNN | 0.6389 | 0.5069 | 0.6862 | 0.6289 | 0.047 |
| FBCNet | 0.4896 | 0.3140 | 0.5490 | 0.4475 | 0.052 |
| EEGConformer | 0.5903 | 0.4455 | 0.6162 | 0.5823 | 2.095 |
| LightConvNet | 0.5174 | 0.3460 | 0.5968 | 0.4893 | 0.021 |
| IFNet | 0.6181 | 0.4817 | 0.6927 | 0.6045 | 0.035 |
| SF-TGCN | 0.6563 | 0.5239 | 0.7032 | 0.6459 | 0.072 |
| MSVTNet | 0.6458 | 0.5072 | 0.7012 | 0.6317 | 1.478 |
| **SFE-GAT** | **0.6659** | **0.5545** | **0.6648** | **0.6640** | **0.066** |

### Fig. 3: per-subject values

These are the exact bar labels, read in plotting order from PDF objects 882 (SD) and 894 (SI). "k/288" is the implied number of correct test trials.

| Subject | SD Acc % (k/288) | SD Prec | SD F1 | SD κ | SI Acc % (k/288) | SI Prec | SI F1 | SI κ |
|---|---|---|---|---|---|---|---|---|
| A01 | 80.21 (231) | 0.810 | 0.804 | 0.736 | 70.14 (202) | 0.704 | 0.701 | 0.602 |
| A02 | 61.46 (177) | 0.630 | 0.620 | 0.486 | 52.08 (150) | 0.515 | 0.517 | 0.361 |
| A03 | 89.24 (257) | 0.895 | 0.893 | 0.856 | 77.43 (223) | 0.775 | 0.775 | 0.699 |
| A04 | 70.49 (203) | 0.709 | 0.705 | 0.606 | 67.71 (195) | 0.676 | 0.676 | 0.569 |
| A05 | 72.92 (210) | 0.729 | 0.728 | 0.639 | 55.21 (159) | 0.549 | 0.550 | 0.403 |
| A06 | 71.88 (207) | 0.717 | 0.715 | 0.625 | 56.94 (164) | 0.565 | 0.565 | 0.426 |
| A07 | 86.11 (248) | 0.864 | 0.862 | 0.815 | 74.31 (214) | 0.742 | 0.738 | 0.657 |
| A08 | 85.07 (245) | 0.853 | 0.851 | 0.801 | 79.17 (228) | 0.794 | 0.792 | 0.722 |
| A09 | 81.94 (236) | 0.814 | 0.816 | 0.759 | 66.32 (191) | 0.662 | 0.662 | 0.551 |
| **Mean** | **77.70** (2014/2592) | 0.7801 | 0.7771 | 0.7026 | **66.59** (1726/2592) | 0.6647 | 0.6640 | 0.5544 |

**Consistency checks (mine).**
- Every accuracy is an exact multiple of 1/288. So all 288 test trials were used per subject, and no 1023-marked artifact trials were rejected.
- In LOSO the test set per subject is **one session (288)**. If it were 576 trials, all 9 numerators would have to be even by chance (p ≈ 0.2 %).
- The κ values all equal (acc − 0.25)/0.75.
- The means reproduce Table 3 to within rounding.

### Ablations (Fig. 4, SD holdout, 9-subject distributions)

These are the means (the "Mean" cross markers) read from the vector box plots, accurate to ±0.05 pp. The text values are given in brackets [P §3.5].

| Variant | Acc mean (median; Q1–Q3; whiskers) | Precision mean | F1 mean | κ mean |
|---|---|---|---|---|
| PLV-GAT (no evolution) | **65.22** (65.22; 58.82–73.98; 47.48–77.31) [text: −12.5 pp → 65.20] | 65.27 | 65.43 | 0.589 |
| SFE-GCN (GAT→GCN) | **71.45** (78.01; 62.69–78.98; 54.68–81.02) [text: −6.25 pp → 71.45] | 71.34 | 72.04 | 0.642 |
| FE-GAT (no GAE/MC) | **75.32** (75.92; 69.89–83.12; 60.22–87.80) [text: −2.43 pp → 75.27] | 74.94 | 75.27 | 0.676 |
| SFE-GAT | **77.69** (80.21; 71.88–85.11; 61.51–89.20) | 78.01 | 77.69 | 0.703 |
| R-GAT (random A, no evolution) | **47.80** (51.99; 36.99–58.60; 24.41–64.09) [text 47.8] | 44.68 [44.7] | 38.28 [38.3] | 0.280 [0.280] |
| R-SFE-GAT (random A + evolution) | **59.57** (62.31; 50.32–67.47; 43.82–72.42) [text 59.5] | 54.79 [54.9] | 56.93 [56.9] | 0.504 [0.505] |

The full quartiles and whiskers for Precision, F1 and κ are in the appendix (§11).

### Table 2: average over all subjects of t-SNE cluster quality per evolution stage [P §3.6]

| | evo0 | evo1 | evo2 | evo3 |
|---|---|---|---|---|
| Silhouette | 0.3088 | 0.3264 | 0.3797 | 0.3992 |
| DBI | 0.9427 | 0.8855 | 0.8114 | 0.7909 |

Unstated: the t-SNE input (node-level or pooled), perplexity, seed, and split.

### Fig. 6: edge retention, A01, holdout

Counts out of 72 trials per class (Left/Right/Feet/Tongue) for k = 0 (before evolution) and k = 3. The heat maps are **raster images** (`/Image13`… in PDF objects 957/984), so there are no numbers to extract.

The qualitative target: k = 0 is "localized and dense"; k = 3 is "sparser, concentrated on a few long-range/inter-regional connections", with class-differentiated patterns [P §3.7].

### Table 4: OpenBMI zero-shot, L vs R, session 1; mean ± SD across subjects [P §3.9]

| Model | Acc % | κ |
|---|---|---|
| EEGNet | 68.51 ± 12.7 | 0.52 ± 0.15 |
| DGCNN | 65.49 ± 13.1 | 0.48 ± 0.17 |
| FBCNet | 64.57 ± 13.5 | 0.47 ± 0.16 |
| EEGConformer | 58.18 ± 14.2 | 0.40 ± 0.18 |
| LightConvNet | 69.48 ± 12.4 | 0.53 ± 0.14 |
| IFNet | 66.28 ± 13.3 | 0.49 ± 0.16 |
| SF-TGCN | 64.54 ± 13.5 | 0.47 ± 0.17 |
| MSVTNet | 59.56 ± 15.5 | 0.42 ± 0.19 |
| **SFE-GAT** | **67.18 ± 13.6** | **0.51 ± 0.16** |

### Latency

0.066 ms/sample on an RTX 3090, excluding preprocessing as far as can be told [P §3.8]. Batch size and timing method are unstated. **This is not comparable to our CPU or browser numbers.** We should report our own ms/sample, both for the model only and for DSP plus model.

---

## 6. Ambiguities and inconsistencies (A1–A23)

**A1. τ (PLV threshold) has no value.**
- It is in z-units (Eq. 5).
- The code notebook defaults to `threshold=0.3` and uses `>=` in one function and `>` in another. It is unclear whether 0.3 is applied to z-scores or to raw PLV [CODE-SUMMARY, verify].

**A2. The evaluation threshold (our "η") has no value, and its symbol is inconsistent.**
- The prose calls it τ, colliding with Eq. 5. The equation prints a bold ø.
- If Eq. 15 is literal (ReLU, no BN), P ≥ 0.5, so any η ≤ 0.5 is a no-op.
- The code passes no threshold or training flag to `monte_carlo_new_edge_index`, and that function is not in the public file [CODE-SUMMARY, verify].

**A3. GAE loss.**
- §3.3 says the loss is categorical cross-entropy, with nothing else.
- §2.2 calls the GAE "unsupervised" and says it "drives the model to learn … by reconstructing the graph topology". That is the language of a Kipf–Welling reconstruction BCE (Kipf & Welling, "Variational Graph Auto-Encoders", [arXiv:1611.07308](https://arxiv.org/abs/1611.07308)).
- The code summary says no reconstruction loss is computed in `SFE-GAT.py`, but the training script is not public [CODE-SUMMARY, verify].

**A4. The gradient path through the hard Monte Carlo mask (the central ambiguity). My analysis:**

1. M = 𝟙(P > R) is piecewise constant, so ∂M/∂P = 0 almost everywhere.
2. Â = A ⊙ M, where A is data and does not depend on the parameters.
3. **GATv2 has no `edge_dim`** (Table 1 counts), so it ignores edge values, and the classifier sees only Â's topology.
4. Z feeds only P → M.

The result: **the CE loss has *no* gradient path into any GAE (GCN + BN(32)) parameter.**
- This holds *even with a straight-through or Gumbel estimator*, unless the mask values also enter an operator that affects the logits. Examples: scaling the attention α_ij by M_ij, or adding `edge_dim=1`. The first is not in the paper; the second would change Table 1's counts to 33,408.
- Under the literal equations, the 3 × 4192 = 12,576 GAE parameters stay at their initial values, and the "evolution" is a feature-dependent pruning through a random projection. In PyTorch, parameters whose `.grad` is None are skipped by SGD, including its weight decay **[UNVERIFIED in docs; standard torch.optim behaviour]**.
- The "differentiable sampling strategy" claim in §1 is therefore not supported by Eqs. 15–18. The options are (i) none, the literal reading; (ii) a recon loss; (iii) straight-through (Bengio, Léonard & Courville 2013, [arXiv:1308.3432](https://arxiv.org/abs/1308.3432)) or Gumbel-Softmax/Concrete (Jang, Gu & Poole 2017, [arXiv:1611.01144](https://arxiv.org/abs/1611.01144); Maddison, Mnih & Teh 2017, [arXiv:1611.00712](https://arxiv.org/abs/1611.00712)) plus a weighted message-passing hook.
- Discussion calls the sampling "a guided form of DropEdge" (Rong et al., "DropEdge", ICLR 2020, [arXiv:1907.10903](https://arxiv.org/abs/1907.10903)). DropEdge is itself non-differentiable, which supports reading (i).

**A5. Head merging. Settled: concat** (§3). There is no real ambiguity once the parameters are counted.

**A6. Table 1.**
- The 8-input GATv2Conv row is a stem outside block 1, shown by the PDF rule and the empty Blocks cell.
- GAE = 4192 ≠ GCN(128→32) = 4128, which implies BN(32).
- Neither the stem nor the encoder BN is described in §2.
- With them, the total is 149,796 (≈ 0.15M ✔). Without the stem it would be 0.12M ✘.

**A7. 77.70 % vs 77.05 % SD accuracy.** **77.70 is correct, and 77.05 in §3.8 is a typo.** Four lines of evidence:
- (a) The mean of the 9 Fig. 3a accuracies is 77.70 (2014/2592 = 0.77701).
- (b) Every improvement quoted in the same §3.8 sentence is computed from 77.70: 77.70 − 72.22 = 5.48; −74.65 = 3.05; −70.14 = 7.56; −76.74 = 0.96; −75.69 = 2.01; −76.04 = 1.66.
- (c) The abstract and Table 3 both say 0.7770.
- (d) The Fig. 4 SFE-GAT mean reads 77.69.

**A8. Welch, Eq. 7, and the band-pass.**
- Eq. 7 is a periodogram, not Welch.
- Filtering to a band and then integrating the PSD over the same band is redundant except for roll-off.
- Code differences: `nperseg = 2·fs = 500`, not 250; Simpson integration; Butterworth **order 5** with `sos` + `sosfiltfilt`, not 4 [CODE-SUMMARY, verify].
- Rp/Rs are meaningless for a Butterworth (SciPy docs, above).

**A9. Hilbert edge effects.** The analytic signal of a 4-s crop has edge distortion. Whether the Hilbert transform was applied before or after cropping is unstated.

**A10. PLV band.**
- The text implies broadband (raw 0.5–100 Hz).
- PLV on broadband EEG is dominated by low frequencies and volume conduction. This is a known PLV pitfall (Lachaux et al., "Measuring phase synchrony in brain signals", *Hum. Brain Mapp.* 8:194–208, 1999). The MI-EEG Scientist should elaborate.
- Per-band PLV would give B graphs, but the architecture takes a single A. So per-band PLV is **not** consistent with the model unless the bands are averaged.

**A11. PLV per trial or per class/subject?** **Per trial.**
- Fig. 6a shows *before-evolution* edge counts that vary between 0 and 72 across trials. A fixed graph would give counts of exactly 0 or 72.
- The notebook asserts one PLV per trial (`len(plv) == len(label)`) [CODE-SUMMARY, verify].

**A12. Weighted vs binary A.**
- Eq. 5 defines weights, but GATv2 cannot use them (no `edge_dim`).
- GCNConv *can* use them (Eq. 15 passes A).
- The code stores only `edge_index`, so everything is binary [CODE-SUMMARY, verify].

**A13. Stem activation.** None is described or listed in the paper. The code applies no activation and no BN [CODE-SUMMARY, verify].

**A14. Feature scaling.**
- No log or normalisation is stated; the code applies none [CODE-SUMMARY, verify].
- The stem has no BN in front of it, so raw scale matters. In volts (MOABB/MNE convention), band powers are about 1e-11. In µV² they are about 1–100.
- **We must fix the units explicitly.** The magnitudes here are [UNVERIFIED estimate].

**A15. SD protocol wording.**
- "the 288 trials × 9 subjects from the first session were used as the training set, and the 288 trials × 9 subjects from the second session constituted the test set" [P §3.3]. This could mean **one pooled model** trained on all 9 subjects' session-1 data.
- "Subject-dependent" and the per-subject Fig. 3a suggest per-subject models, which is the standard reading.

**A16. Monte Carlo mask granularity.**
- R is "of matching dimensions", i.e. C×C i.i.d., which gives asymmetric masks and therefore directed graphs.
- The code decodes only existing directed edges (`decode(z, edge_index)`), so it is per directed edge [CODE-SUMMARY, verify].
- The resampling cadence (per forward pass, per sample) is unstated.

**A17. BN vs ReLU order.**
- Eqs. 12–14 say GATv2 → ReLU → BN.
- Fig. 1's boxes read "Batch Norm" over "+ ReLU", in both the block and the classifier. This was read from Figure 1's vector text: "Batch" at (195, 103) and "+ ReLU" at (208, 88); classifier "Batch Norm" at (835–872, 302) and "+ ReLU" at (850, 287).
- Eqs. 20–21 have *no* ReLU in the classifier.
- The code applies ReLU → BN in the blocks (with a **residual** `conv(x).relu() + x_in`) and in the classifier (`conv4(...).relu()` then BN). The GCN encoder is also ReLU → BN [CODE-SUMMARY, verify].
- Fig. 1 also carries an unexplained "x n" label near the classifier column, at (871–880, 231).

**A18. Dropout.** The paper says 0.5 (Eq. 23); the code uses 0.2 in the head and 0 in the blocks [CODE-SUMMARY, verify].

**A19. Residual connections in the evolution blocks.** These are in the code only. The paper never mentions them [CODE-SUMMARY, verify].

**A20. Eq. 9 is the GATv1 formula** (§2). The implementation evidently uses GATv2 (parameter counts).

**A21. Window length.**
- "t = 2 s to t = 6 s" is 1000 samples if half-open, 1001 if closed (MNE `crop`/epochs include both ends).
- Welch on either length gives 7 segments, but the PLV T and the filter outputs differ slightly. Python and JS must agree.

**A22. Baseline κ values are internally inconsistent with their accuracies (my check).**
- With balanced 72×4 test sets, the mean κ must equal (mean acc − 0.25)/0.75 exactly, because the relation is linear.
- SFE-GAT satisfies this (0.7027 ✔, 0.5545 ✔). **Every baseline in Table 3 falls short**, by between 0.004 and 0.050 (e.g. EEGConformer SD 0.5524 vs an implied 0.6019).
- **The Fig. 4 ablations do too.** PLV-GAT κ 0.589 vs an implied 0.536; R-GAT 0.280 vs 0.304; R-SFE-GAT 0.505 vs 0.461. **Only the full-model numbers are self-consistent.**
- **Table 4's κ values are impossible for balanced binary Cohen's κ.** Mean κ should be 2·acc − 1: SFE-GAT 67.18 % → 0.344, against 0.51 reported. They match neither the 2-class nor the 4-class chance correction (0.562).
- Possible benign explanations include different test sets, trial rejection, or numbers copied from other setups. This is **for the scientific-integrity red team, not something we "fix"**. We report our κ computed exactly by Eq. 28.

**A23. Overclaims.**
- The text says SFE-GAT's precision is "significantly higher" than the baselines'. But SD precision 0.7802 is below FBCNet (0.7819), LightConvNet (0.7891) and MSVTNet (0.7808). SI precision 0.6648 is below DGCNN, IFNet, SF-TGCN and MSVTNet [P Table 3].
- No statistical test is reported.
- Minor arithmetic slips in §3.5: R-SFE vs R-GAT is quoted as +11.8 points, but 59.5 − 47.8 = 11.7 (the unrounded box means give 11.77). Precision is quoted as +10.2, but 54.9 − 44.7 = 10.2 while the box means give 10.11.
- Table 3 labels the model "Proposed (2025)".

**Other ambiguities to register.**

*Training and model selection*
- No validation set is described.
- The hyperparameters were "selected based on preliminary experiments", which risks tuning on session 2. We must not.
- Seeds and the number of runs are unstated.
- Whether the last epoch or the best epoch was used is unstated.

*LOSO sessions*
- Training: 8 subjects × session 1, or × both sessions.
- Test: which of the held-out subject's sessions. Only "288 per subject" is evidenced.

*OpenBMI (Table 4)*
- A 4-class model is evaluated on a 2-class task, and the logit mapping is unstated.
- OpenBMI is recorded at 1000 Hz with 62 channels (Lee et al., *GigaScience* 8:giz002, 2019). The resampling and channel mapping are unstated.

*Ablation variants*
- How deep PLV-GAT is.
- R-GAT/R-SFE-GAT: the density and distribution of the random adjacency, and whether it is redrawn per trial.
- Whether "SFE-GCN" replaces the stem and classifier GATs as well.

*Fig. 5 / Table 2*
- What "node features" means: per-node points, or pooled per trial.

---

## 7. Cross-check with the public code (summary-level; the Reference-Code Auditor is authoritative)

The repo holds `SFE-GAT.py`, `PLV&PSD.ipynb` and `README.md`. The README states "a portion of the source code… The complete codebase will be made available in a future release". **No licence file was shown** ([repo](https://github.com/GaoHSin/SFE-GAT)).

These points are [CODE-SUMMARY, verify]:
- **Architecture:** stem `GATv2Conv(8, hidden, heads, concat=True)`, then 3 `GraphEvoBlock`s, then a final GATv2.
- **Inside each block:** `GCNEncoder` = GCN → ReLU → BN(32), and `GAE.decode` over the existing `edge_index`.
- **Mask sampling** is in an external `monte_carlo_new_edge_index(edge_index, edge_probs)`, which is *not* in the public file.
- **No recon loss.**
- **The evo-block call signature mismatch would raise a `TypeError` as published.**

The code therefore *confirms* the Table 1 reading in §3, the head concatenation and the GAE BN(32). It *contradicts* the paper on several points: dropout, residual, Welch nperseg, filter order, Simpson integration, and the binary edges.

---

## 8. Implementation notes that follow from the analysis

1. **Parameter-count test.**
   - `sum(p.numel())` must equal **149,796** for the Table-1-faithful build: stem with no BN, GAE with BN(32), no residual-projection parameters.
   - Add a test asserting 2560 / 33,280 / 256 / 4192 / 516 per module.
2. **Use PyG `GATv2Conv(in, 32, heads=4, concat=True)` with defaults:** `share_weights=False`, `add_self_loops=True`, `negative_slope=0.2`, `dropout=0`, no `edge_dim`. The JS port must replicate `lin_l` (source/j), `lin_r` (target/i), self-loops and the per-target softmax.
3. **BN uses batch statistics in training and running statistics in eval.** The JS export must carry `running_mean`/`running_var` for 4 × BN(128) and 3 × BN(32).
4. **Masks are cumulative.** Store A^{(0..3)} per trial for the browser's evo0→evo3 animation, which mirrors Fig. 6.
5. **Kappa is redundant with accuracy on BCI IV-2a.** Report it anyway, computed via `sklearn.metrics.cohen_kappa_score` for transparency.

---

## Decisions the debates must settle

Each entry lists the options, my recommendation, and the evidence. "Faithful" means paper-text-first, then Table 1, then code as tie-breaker, with every deviation logged in `docs/traceability.md`.

**D1. τ (PLV z-threshold).**
- Options: {0, 0.3, 0.5, 1.0}.
- Recommend **τ = 0.3, applied to z-scored PLV with strict `>`**, matching Eq. 5 and the code default. Run a sensitivity check over {0, 0.5, 1.0} using a session-1 *internal* validation split only.
- Evidence: A1. The paper gives no value.

**D2. η (evaluation mask threshold).**
- Options: {0.5, 0.7, 0.9, "expected mask" (keep if P > 0.5)}.
- Recommend **η = 0.5**, the Bernoulli-mode decision, which is consistent with the training mask in expectation. It is only meaningful together with D6's BN(32), since otherwise P ≥ 0.5. Run a sensitivity check over {0.7, 0.9} on session-1 validation only.
- Evidence: A2 and the Eq. 16 analysis.

**D3. GAE loss.**
- Options: (a) CE only (literal §3.3; code summary); (b) CE + λ·Σ_ℓ recon-BCE (prose §2.2; Kipf & Welling).
- Recommend **(a) as the primary replication**, with (b, λ = 1, PyG `GAE.recon_loss` with negative sampling) as a pre-registered variant. Document that under (a) the GAE weights receive no gradient.
- Evidence: A3, A4.

**D4. Gradient path / "differentiable sampling".**
- Options: none (hard mask, literal); straight-through on M; Gumbel-sigmoid; P-weighted attention.
- Recommend **none for the primary run**, and state explicitly that the paper's claim is not realised by its equations. Any ST/Gumbel variant must add a weighted operator (α_ij·M_ij), which is a deviation outside Table 1. Run it as an ablation only if time allows.
- Evidence: the A4 derivation and the Table 1 counts (no `edge_dim`).

**D5. Head merging.** **Concat (settled).** The evidence is the §3 counts: 2560 and 33,280 are reproduced only by concat with `share_weights=False`.

**D6. Architecture (Table 1).**
- Options: H1, stem + 3 blocks (5 GATv2, GAE with BN(32), 149,796 params); H2, text-only (4 GATv2, 116,516).
- Recommend **H1** (§3, A6): the PDF rule, the 0.15M total, and code corroboration.

**D7. SD reference number.** Recommend **77.70 % / κ 0.7027**. Log 77.05 as a typo. Evidence: A7.

**D8. BN/ReLU order and stem activation.**
- Options: (i) ReLU → BN everywhere, including the classifier; (ii) Fig. 1's BN → ReLU; (iii) literal, with no ReLU in the classifier.
- Recommend **(i) for the blocks (Eqs. 12–14 and code agree)**, **ReLU → BN in the classifier** (code and Fig. 1 both show a ReLU there; log it as a deviation from Eq. 20), and **no activation after the stem**.
- Evidence: A13, A17.

**D9. Residual connections (code-only).**
- Options: paper (none) vs code (`relu(conv(x)) + x`).
- Recommend **none in the primary run**, since the paper is the source of truth, and residual as a variant if the replication undershoots by more than the tolerance.
- Evidence: A19.

**D10. Dropout.** Recommend **0.5** (explicit, Eq. 23), with 0.2 as a variant. Evidence: A18.

**D11. Feature pipeline.**
- Recommend `butter(N=4, Wn=[lo,hi], btype='bandpass', fs=250, output='sos')` + `sosfiltfilt`. The paper says order 4 and zero-phase; SciPy says use sos.
- Recommend Welch with `nperseg=250, noverlap=125, window='hann'` (paper), and Simpson over the **inclusive** [lo, hi] 1-Hz bins (5 points, so Simpson is well-posed).
- Recommend **µV units**, scaling MOABB volts by 1e6. Use no log in the primary run, and log10 as a variant only if training fails.
- Evidence: A8, A14, SciPy docs.

**D12. PLV signal.**
- Options: broadband crop (literal); 8–30 Hz; mean of per-band PLVs.
- Recommend **broadband, per trial, Hilbert on the 2–6 s crop** (literal), with an 8–30 Hz variant as sensitivity.
- Evidence: A9–A11.

**D13. Edge weights.**
- Recommend that GATv2 uses the topology only (forced by the counts), and that **GCN receives the weighted A** (literal Eq. 15). A binary-GCN variant should match the code.
- Evidence: A12.

**D14. MC mask.** Recommend **per directed edge, resampled every forward pass and every trial**, with **cumulative pruning** across blocks. Evidence: A16, Eq. 17, and the code's `decode(z, edge_index)`.

**D15. SD protocol.** Recommend **9 per-subject models** (session 1 → session 2). Log the pooled reading as an alternative and do not run it unless time allows. Evidence: A15.

**D16. LOSO.** Recommend training on **both sessions of the 8 other subjects** and testing on the held-out subject's **session 2** (288 trials, matching the evidence). Evidence: §5 k/288 test.

**D17. Selection and seeds.** Recommend the **last epoch (500)**, no early stopping, no test-set peeking, and **3 seeds**, reported as mean ± SD with every per-seed value. Evidence: the paper is silent, and CLAUDE.md §6 forbids tuning on the test session.

**D18. SGD momentum.** Recommend **0**: the PyTorch default and the literal reading, since "SGD" is written without momentum. A momentum-0.9 variant is allowed only via session-1 validation.

**D19. "Successfully reproduced" tolerance.**
- Recommend: **SD mean accuracy within ±3 pp of 77.70, and SI within ±4 pp of 66.59** (3 seeds), plus a per-subject rank correlation with Fig. 3 of ρ ≥ 0.7. Report regardless of outcome.
- Evidence: one test trial = 0.35 pp. The seed variance of GNNs on 288-trial sets is plausibly 1–2 pp **[UNVERIFIED]**.

**D20. Ablation definitions.**
- PLV-GAT = stem + classifier only.
- SFE-GCN = every GATv2Conv → GCNConv(·, 128).
- FE-GAT = blocks without GAE/MC.
- R-* use a symmetric Erdős–Rényi A with density matched to the mean PLV graph density, redrawn per trial.
- Evidence: §6 "Other ambiguities to register". These definitions are my proposal.

**D21. Latency protocol.** Report ms/sample on our CPU for both model-only and DSP + model, at batch sizes 1 and 288, as the median of ≥ 100 runs. Do not compare directly with the 3090 figure.

**D22. Scope of Table 4 (OpenBMI) and Table 2/Fig. 5 (t-SNE).** Recommend **reproducing Table 2 / Fig. 5 / Fig. 6** (cheap), and **OpenBMI out of scope** (large download, underspecified protocol, inconsistent κ). Evidence: A22, §5.

---

## Open questions for the user

1. **Fidelity policy.** Do you agree that the primary replication follows the *paper's text* (paper > Table 1 > code as tie-breaker)? Code-only features such as the residual, dropout 0.2, nperseg 500 and order-5 filters would then be run only as labelled variants.
2. **Full code.** The authors' README says the full code is "available from the corresponding author upon reasonable request" (cghcust@163.com) [P, Data Availability]. We will not contact anyone. Do *you* want to request it? It would settle A1–A4 and A16.
3. **Seeds and time budget.** Should we use 1 seed (fastest) or 3 seeds (recommended)? This multiplies the run times below.
4. **Python version.** The paper used Python 3.10 / PyTorch 2.7.0 / PyG 2.6.1. The system has Python 3.14. Current PyTorch lists Windows support for Python 3.10–3.14 ([pytorch.org get-started](https://pytorch.org/get-started/locally/)), but I could not confirm that **2.7.0** wheels exist for 3.14 **[UNVERIFIED]**. Should we (a) build the venv on 3.14 with the current torch/PyG (version drift, documented), or (b) install a separate Python 3.10/3.12 to match the paper (an extra install)?
5. **OpenBMI (Table 4).** Is it out of scope? That is my recommendation.
6. **Deployment subject.** A03 is the best SD subject (89.24 %); A02 is BCI-illiterate. Debate topic 3 will decide, but do you have a preference, e.g. a "typical" subject such as A01 (80.21 %, which is also the paper's Fig. 5/6 subject)?

## Things requiring user approval

All installs go into `research/.venv`, and all data into `research/data/` (CLAUDE.md §1). The sizes are approximate and **[UNVERIFIED]**; the MI-EEG Scientist's brief should give exact dataset sizes.

**Installs and downloads**

1. **Create `research/.venv`** with the Python version chosen in question 4.
2. **Install, CPU-only:**
   - `torch` (Windows CPU wheel, roughly 150–250 MB download).
   - `torch_geometric` 2.6.x (a few MB, pure Python; no `torch_scatter`/`torch_sparse` needed for GATv2Conv/GCNConv).
   - `numpy`, `scipy`, `scikit-learn`, `mne`, `moabb`, `pyyaml`, `pytest`, `matplotlib` (roughly 150–300 MB together).
3. **Download BCI IV-2a** via MOABB `BNCI2014_001`: 18 .mat files (9 subjects × 2 sessions), roughly 0.4–0.8 GB **[UNVERIFIED]**.

**Long runs** (8-core CPU, no GPU). These are my estimates, not measurements **[UNVERIFIED]**. Each training iteration is about 15–40 ms on CPU (64 graphs × 22 nodes, 5 GATv2 + 3 GCN).

| Run | Workload | Estimated time |
|---|---|---|
| Preprocessing (PLV + filter bank + Welch, 5,184 trials) | — | < 5 min |
| **SD**, 9 subjects | 288 trials → 5 it/epoch × 500 = 2,500 it per subject | ≈ 1–2 min per subject, **≈ 6–15 min per seed** |
| **LOSO**, 9 folds | 4,608 training trials → 72 it/epoch × 500 = 36,000 it per fold | ≈ 9–24 min per fold, **≈ 1.4–3.6 h per seed**. Training on session 1 only would roughly halve this. |
| **Ablations**, 5 variants × SD | — | ≈ 0.5–1.3 h per seed |
| **Variants** (D3b, D9, D10, D12, …), SD only | — | ≈ 6–15 min each per seed |

**At 3 seeds the full suite is ≈ 6–16 h**, which is above the 15-minute threshold. I suggest first approving a **≤ 5-minute timing benchmark** to replace these estimates with measured ones.

---

## Appendix (§11): Fig. 4 full box-plot readings

Values in % (κ × 100). Each cell is mean / median / Q1–Q3 / whisker low–high, all ±0.05.

| Variant | Precision | F1 | κ ×100 |
|---|---|---|---|
| PLV-GAT | 65.27 / 66.72 / 59.52–73.98 / 46.99–78.28 | 65.43 / 64.68 / 59.30–74.09 / 48.98–76.72 | 58.87 / 60.37 / 52.58–69.30 / 40.70–70.32 |
| SFE-GCN | 71.34 / 76.50 / 62.69–79.41 / 55.32–81.62 | 72.04 / 77.47 / 64.30–79.62 / 53.23–81.29 | 64.19 / 70.38 / 56.18–74.09 / 41.61–76.08 |
| FE-GAT | 74.94 / 74.79 / 69.63–81.50 / 58.28–88.01 | 75.27 / 76.40 / 68.92–82.58 / 60.32–88.22 | 67.58 / 68.22 / 59.62–77.31 / 46.61–83.49 |
| SFE-GAT | 78.01 / 81.02 / 71.72–85.32 / 63.01–89.52 | 77.69 / 80.38 / 71.51–85.11 / 61.99–89.30 | 70.27 / 73.60 / 62.47–80.11 / 48.60–85.59 |
| R-GAT | 44.68 / 45.92 / 38.22–55.21 / 20.59–60.22 | 38.28 / 41.40 / 28.01–46.72 / 18.71–54.79 | 27.96 / 31.61 / 15.92–35.00 / 10.70–46.02 |
| R-SFE-GAT | 54.79 / 55.70 / 48.38–62.31 / 38.49–67.58 | 56.93 / 56.40 / 45.38–66.02 / 43.23–70.11 | 50.43 / 50.21 / 41.29–59.20 / 36.18–65.32 |

The legend colour mapping was read from the legend swatches: pink = PLV-GAT, cream = SFE-GCN, blue = FE-GAT, orange = SFE-GAT, purple = R-GAT, green = R-SFE-GAT. The quartile convention matches numpy's linear interpolation: Q1/Q3 of the SFE-GAT accuracies are the 3rd and 7th sorted values (71.88 / 85.07).

---

## References

- **[P]** Gao, X.; Cao, G.; Ma, G. SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding. *Sensors* 2026, 26, 1730. https://doi.org/10.3390/s26051730 (local: `sensors-26-01730-v2.pdf`).
- Authors' repository (partial code, read-only): https://github.com/GaoHSin/SFE-GAT; files `SFE-GAT.py` and `PLV&PSD.ipynb` (read via WebFetch summaries, 2026-10-14).
- Brunner, C.; Leeb, R.; Müller-Putz, G.; Schlögl, A.; Pfurtscheller, G. BCI Competition 2008 – Graz data set A (dataset description). https://www.bbci.de/competition/iv/desc_2a.pdf
- Brody, S.; Alon, U.; Yahav, E. How Attentive are Graph Attention Networks? ICLR 2022. https://arxiv.org/abs/2105.14491
- Veličković, P. et al. Graph Attention Networks. ICLR 2018. https://arxiv.org/abs/1710.10903
- Kipf, T.N.; Welling, M. Variational Graph Auto-Encoders. NeurIPS BDL Workshop 2016. https://arxiv.org/abs/1611.07308
- Kipf, T.N.; Welling, M. Semi-Supervised Classification with Graph Convolutional Networks. ICLR 2017. https://arxiv.org/abs/1609.02907
- Rong, Y.; Huang, W.; Xu, T.; Huang, J. DropEdge: Towards Deep Graph Convolutional Networks on Node Classification. ICLR 2020. https://arxiv.org/abs/1907.10903
- Bengio, Y.; Léonard, N.; Courville, A. Estimating or Propagating Gradients Through Stochastic Neurons for Conditional Computation. 2013. https://arxiv.org/abs/1308.3432
- Jang, E.; Gu, S.; Poole, B. Categorical Reparameterization with Gumbel-Softmax. ICLR 2017. https://arxiv.org/abs/1611.01144
- Maddison, C.J.; Mnih, A.; Teh, Y.W. The Concrete Distribution. ICLR 2017. https://arxiv.org/abs/1611.00712
- Lachaux, J.-P.; Rodriguez, E.; Martinerie, J.; Varela, F.J. Measuring phase synchrony in brain signals. *Hum. Brain Mapp.* 1999, 8, 194–208. https://doi.org/10.1002/(SICI)1097-0193(1999)8:4<194::AID-HBM4>3.0.CO;2-C
- Lee, M.-H. et al. EEG dataset and OpenBMI toolbox for three BCI paradigms. *GigaScience* 2019, 8, giz002. https://doi.org/10.1093/gigascience/giz002
- PyTorch Geometric 2.6.1, `GATv2Conv` source: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gatv2_conv.py
- PyTorch Geometric 2.6.1, `GCNConv` source: https://raw.githubusercontent.com/pyg-team/pytorch_geometric/2.6.1/torch_geometric/nn/conv/gcn_conv.py
- SciPy `signal.butter`: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.butter.html
- SciPy `signal.iirfilter` (rp/rs apply only to Chebyshev/elliptic): https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.iirfilter.html
- SciPy `signal.welch`: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html
- PyTorch install matrix (Windows Python 3.10–3.14): https://pytorch.org/get-started/locally/
