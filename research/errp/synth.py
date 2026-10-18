"""Synthetic ErrP / correct epochs (ADR 0002 D21). Generated in Python, exported; no JS RNG.

Background: 64 unit-variance 1/f sources + 10 Hz alpha, mixed by the symmetric square root of the
deployment subject's S1 pre-stimulus CAR (+causal band-pass) spatial covariance, + small sensor noise,
scaled so post-pipeline FCz SD equals the subject's S1 value; + per-channel DC ~ U(-2000, 2000) uV.
ErrP: Gaussian bumps (sigma 30 ms) at the S1 error-minus-correct FCz component latencies, shifted
earlier by the measured filter group delay, topography = S1 difference at each component's peak,
normalised so alpha = 1 reproduces the filtered grand-average difference at FCz; scaled by alpha
under caps FCz |Ne| <= 4.1 uV and Pe <= 8 uV.
"""
from __future__ import annotations

import numpy as np

from . import features, model, preprocess


def _pink(rng, n_src, n):
    w = rng.standard_normal((n_src, n))
    W = np.fft.rfft(w, axis=-1)
    f = np.fft.rfftfreq(n)
    g = np.zeros_like(f)
    g[1:] = 1.0 / np.sqrt(f[1:])
    x = np.fft.irfft(W * g, n=n, axis=-1)
    x -= x.mean(axis=-1, keepdims=True)
    return x / x.std(axis=-1, keepdims=True)


class Generator:
    def __init__(self, Xraw_s1, y_s1, channels, cfg, mdl):
        self.cfg, self.m = cfg, mdl
        self.fs, self.n = cfg["fs"], cfg["epoch"]["n_samples"]
        self.sos = preprocess.design_sos(cfg)
        self.fcz = channels.index("FCz")
        self.ch_idx = features.channel_indices(channels, cfg["features"]["channels"])
        self.wins = features.windows(cfg)
        self.fwin = features.fcz_window(cfg)
        Xp = preprocess.preprocess(Xraw_s1, self.sos, cfg)
        ev = cfg["epoch"]["event_index"]
        # spatial covariance of CAR + filtered pre-stimulus (skip first 256 samples of filter transient)
        pre = Xp[:, :, 256:ev]
        pre = pre - pre.mean(axis=-1, keepdims=True)
        C = np.einsum("ect,edt->cd", pre, pre) / (pre.shape[0] * pre.shape[2])
        ev_, V = np.linalg.eigh(C)
        self.mix = (V * np.sqrt(np.clip(ev_, 0, None))) @ V.T
        cor = Xp[y_s1 == 0]
        self.target_sd = float(cor[:, self.fcz, 410:].std())
        diff = Xp[y_s1 == 1].mean(0) - cor.mean(0)  # (64, 922)
        self.diff = diff
        self.gd_ms = preprocess.group_delay_ms(self.sos, self.fs)["at_4Hz_ms"]
        self.components = self._find_components(diff)
        self.comp = self._build_component()
        self.scale = 1.0
        bg = np.stack([self._background(np.random.default_rng([9999, k])) for k in range(40)])
        sd = preprocess.preprocess(bg, self.sos, cfg)[:, self.fcz, 410:].std()
        self.scale = self.target_sd / sd
        self.comp_ne, self.comp_pe = self.realised(1.0)

    def realised(self, alpha):
        ev = self.cfg["epoch"]["event_index"]
        cf = preprocess.preprocess(self.comp_at(alpha)[None], self.sos, self.cfg)[0, self.fcz]
        return (float(-cf[self.fwin[0]:self.fwin[1]].min()),
                float(cf[ev + int(0.25 * self.fs):ev + int(0.55 * self.fs)].max()))

    def _find_components(self, diff):
        ev, fs = self.cfg["epoch"]["event_index"], self.fs
        d = diff[self.fcz]
        specs = [("P2/early+", 0.10, 0.25, +1), ("Ne", 0.20, 0.35, -1), ("Pe", 0.30, 0.55, +1),
                 ("lateN", 0.50, 0.75, -1)]
        out = []
        for name, a, b, sgn in specs:
            i0, i1 = ev + int(a * fs), ev + int(b * fs)
            k = i0 + int(np.argmax(sgn * d[i0:i1]))
            if sgn * d[k] > 0:
                out.append(dict(name=name, peak_idx=int(k), latency_ms=(k - ev) / fs * 1000.0,
                                fcz_uv=float(d[k]), topo=diff[:, k].copy()))
        return out[:4]

    def _build_component(self):
        """Per component: unit Gaussian bump (sigma 30 ms) with the component's topography. Its latency is
        shifted earlier by the numerically measured lag between the raw bump and its filtered peak (the
        filter group delay seen by a 30 ms bump). Gains are fitted jointly (least squares on FCz, +-20 ms
        around each peak) so that alpha = 1 reproduces the filtered S1 grand-average difference at FCz."""
        t = np.arange(self.n)
        ev = self.cfg["epoch"]["event_index"]
        sig = self.cfg["synth"]["sigma_ms"] / 1000.0 * self.fs
        flt = lambda one: preprocess.preprocess(one[None], self.sos, self.cfg)[0]
        probe = np.zeros((64, self.n))
        probe[self.fcz] = np.exp(-0.5 * ((t - ev) / sig) ** 2)
        pf = flt(probe)[self.fcz]
        self.bump_lag = int(np.argmax(pf[ev:ev + int(0.3 * self.fs)]))
        bases = []
        for c in self.components:
            mu = c["peak_idx"] - self.bump_lag
            g = np.exp(-0.5 * ((t - mu) / sig) ** 2)
            topo = c["topo"] / c["topo"][self.fcz]  # unit at FCz
            bases.append(np.outer(topo, g))
        half = int(0.02 * self.fs)
        rows = np.unique(np.concatenate([np.arange(c["peak_idx"] - half, c["peak_idx"] + half + 1)
                                         for c in self.components]))
        Bf = np.stack([flt(bb)[self.fcz, rows] for bb in bases], axis=1)
        gains, *_ = np.linalg.lstsq(Bf, self.diff[self.fcz, rows], rcond=None)
        for c, gn in zip(self.components, gains):
            c["gain"] = float(gn)
            c["bump_lag_ms"] = self.bump_lag / self.fs * 1000.0
        self.bases = bases
        self.gains = gains
        return sum(gn * bb for gn, bb in zip(gains, bases))

    def comp_at(self, alpha):
        """alpha-scaled component with per-component caps: Ne |FCz| <= ne_cap, Pe FCz <= pe_cap."""
        sc = self.cfg["synth"]
        out = np.zeros((64, self.n))
        for c, gn, bb in zip(self.components, self.gains, self.bases):
            a = alpha
            if c["name"] == "Ne":
                a = min(alpha, sc["ne_cap_uv"] / abs(c["fcz_uv"]))
            elif c["name"] == "Pe":
                a = min(alpha, sc["pe_cap_uv"] / abs(c["fcz_uv"]))
            out += a * gn * bb
        return out

    def _background(self, rng):
        src = _pink(rng, 64, self.n)
        tt = np.arange(self.n) / self.fs
        src += 0.5 * np.sin(2 * np.pi * 10.0 * tt[None, :] + rng.uniform(0, 2 * np.pi, (64, 1)))
        x = self.mix @ src * self.scale
        x += 0.05 * self.target_sd * rng.standard_normal(x.shape)
        return x

    def epoch(self, seed: int, alpha: float | None):
        rng = np.random.default_rng([20261015, int(seed)])
        x = self._background(rng)
        if alpha:
            x = x + self.comp_at(alpha)
        x = x + rng.uniform(-2000, 2000, (64, 1))
        return x

    def evaluate(self, raw, pi):
        raw32 = raw.astype("<f4").astype(np.float64)
        Xp = preprocess.preprocess(raw32[None], self.sos, self.cfg)
        F = features.window_means(Xp, self.ch_idx, self.wins)[0]
        s = float(F @ np.asarray(self.m["w"]) + self.m["b"])
        qtr = float(model.platt_contract(s, self.m["platt"]["A"], self.m["platt"]["B"]))
        q = float(model.prior_shift(qtr, self.m["piTrain"], pi))
        fz = float(features.fcz_min(Xp, self.fcz, self.fwin)[0])
        return q, fz


def build(gen: Generator, cfg: dict) -> dict:
    sc = cfg["synth"]
    t = model.t_star(**cfg["costs"]["light-select"])
    pi_lo, pi_c = sc["pi_low"], cfg["canonical_pi"]
    seeds = range(sc["n_seeds"])
    alpha_ok, report = None, []
    # per-component gain caps inside comp_at, AND the realised composite FCz Ne/Pe must satisfy the caps
    def within(a):
        ne, pe = gen.realised(a)
        return ne <= sc["ne_cap_uv"] + 1e-9 and pe <= sc["pe_cap_uv"] + 1e-9
    grid = [a for a in sc["alpha_grid"] if within(a)] or [sc["alpha_grid"][0]]
    for a in grid:
        qs = np.array([gen.evaluate(gen.epoch(s, a), pi_lo)[0] for s in seeds])
        frac = float(np.mean(qs > t + sc["margin"]))
        ne, pe = gen.realised(a)
        report.append(dict(alpha=a, frac_q_gt_t_plus_margin_at_pi_low=frac, realised_fcz_ne_uv=ne,
                           realised_fcz_pe_uv=pe))
        if frac >= 0.80:
            alpha_ok = a
            break
    shortfall = alpha_ok is None
    alpha = alpha_ok if alpha_ok is not None else (grid[-1] if grid else sc["alpha_grid"][0])
    # synthetic TPR / FPR at canonical pi and at pi_low (rule q > max(t*, pi))
    def rate(a, pi):
        return float(np.mean([model.decide(gen.evaluate(gen.epoch(s, a), pi)[0], t, pi) for s in seeds]))
    tpr = {str(pi_c): rate(alpha, pi_c), str(pi_lo): rate(alpha, pi_lo)}
    fpr = {str(pi_c): rate(None, pi_c), str(pi_lo): rate(None, pi_lo)}
    err_seed = None
    for s in range(sc["max_seed_search"]):
        q, fz = gen.evaluate(gen.epoch(s, alpha), pi_lo)
        if round(fz, 1) == sc["target_fcz_min_uv"] and q >= t + sc["margin"]:
            err_seed = s
            break
    cor_seed = None
    for s in range(sc["max_seed_search"]):
        q, _ = gen.evaluate(gen.epoch(s, None), sc["pi_cor"])
        if q <= 0.10:
            cor_seed = s
            break
    return dict(alpha=alpha, alpha_search=report, alpha_shortfall=shortfall, alpha_grid=grid,
                caps="per-component gain caps (Ne <= 4.1/|GA Ne|, Pe <= 8/GA Pe) and realised composite FCz |Ne| <= 4.1, Pe <= 8 uV; alpha grid restricted to values meeting the caps",
                tpr=tpr, fpr=fpr, nSeeds=sc["n_seeds"], errSeed=err_seed, corSeed=cor_seed, tStarLight=t,
                components=[{k: v for k, v in c.items() if k != "topo"} for c in gen.components],
                comp_fcz_ne_uv_at_alpha1=gen.comp_ne, comp_fcz_pe_uv_at_alpha1=gen.comp_pe, bump_lag_ms=gen.bump_lag / gen.fs * 1000.0,
                scale=gen.scale, target_fcz_sd_uv=gen.target_sd, group_delay_ms=gen.gd_ms,
                note="detection depends on the prior pi; above c ~ 0.90 the detector may keep")
