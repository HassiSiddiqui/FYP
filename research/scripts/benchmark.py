"""Timing benchmark for an SFE-GAT-shaped PyG model on CPU (<= ~5 min).

This is NOT the replication model (the trainer owns sfegat/model.py after ADR-0001).
It reproduces the Table-1 structure (149,796 params) so the per-step cost is right:

  stem  GATv2(8 -> 32 x 4, concat)                          2,560
  3 x   GATv2(128 -> 32 x 4) -> ReLU [-> +res] -> BN(128)   33,280 + 256
        GAE: GCN(128 -> 32) -> ReLU -> BN(32)               4,192
        mask: P = sigmoid(z_i . z_j) on existing edges; train keep P > U(0,1),
              eval keep P > eta (cumulative pruning)
  cls   GATv2(128 -> 32 x 4) -> ReLU -> BN(128) -> mean pool -> Dropout -> Linear(128,4)
                                                            33,280 + 256 + 516
Also times ``SFEGATDense``: the same model written densely over [B, 22, 22]
adjacency (identical parameter names; PyG weights load with strict=True and eval
logits match to ~1e-7), which avoids PyG scatter overhead for 22-node graphs.

Usage:
  python scripts/benchmark.py [--epochs 10] [--threads 4] [--variant paper] [--tau 0.3]
Writes research/runs/benchmark-<timestamp>/{config,metrics,env}.json
"""

import argparse
import json
import os
import platform
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from sfegat import graph, preprocess  # noqa: E402

from torch_geometric.loader import DataLoader  # noqa: E402
from torch_geometric.nn import GATv2Conv, GCNConv, global_mean_pool  # noqa: E402

EXPECTED_PARAMS = 149_796


class EvoBlock(nn.Module):
    def __init__(self, dim=128, hidden=32, heads=4, bottleneck=32, residual=False, eta=0.5):
        super().__init__()
        self.gat = GATv2Conv(dim, hidden, heads=heads, concat=True)
        self.bn = nn.BatchNorm1d(hidden * heads)
        self.enc = GCNConv(hidden * heads, bottleneck)
        self.bn_z = nn.BatchNorm1d(bottleneck)
        self.residual = residual
        self.eta = eta

    def forward(self, x, edge_index):
        h = F.relu(self.gat(x, edge_index))
        if self.residual:
            h = h + x
        h = self.bn(h)
        z = self.bn_z(F.relu(self.enc(h, edge_index)))
        p = torch.sigmoid((z[edge_index[0]] * z[edge_index[1]]).sum(-1))
        thr = torch.rand_like(p) if self.training else torch.full_like(p, self.eta)
        keep = p > thr
        return h, edge_index[:, keep], p


class SFEGATBench(nn.Module):
    def __init__(self, in_dim=8, hidden=32, heads=4, n_blocks=3, n_classes=4,
                 dropout=0.5, residual=False, eta=0.5):
        super().__init__()
        d = hidden * heads
        self.stem = GATv2Conv(in_dim, hidden, heads=heads, concat=True)
        self.blocks = nn.ModuleList(
            [EvoBlock(d, hidden, heads, 32, residual, eta) for _ in range(n_blocks)])
        self.cls_gat = GATv2Conv(d, hidden, heads=heads, concat=True)
        self.cls_bn = nn.BatchNorm1d(d)
        self.dropout = dropout
        self.lin = nn.Linear(d, n_classes)

    def forward(self, x, edge_index, batch):
        x = self.stem(x, edge_index)
        for blk in self.blocks:
            x, edge_index, _ = blk(x, edge_index)
        x = self.cls_bn(F.relu(self.cls_gat(x, edge_index)))
        x = global_mean_pool(x, batch)
        x = F.dropout(x, p=self.dropout, training=self.training)
        return self.lin(x)


def n_params(m):
    return sum(p.numel() for p in m.parameters() if p.requires_grad)


def make_dataset(subjects, session, variant, tau, weighted):
    out = []
    for s in subjects:
        c = preprocess.load_features(s, session, variant)
        g = graph.zscore_threshold(c["plv"], tau=tau, weighted=weighted)
        out += graph.to_pyg_list(c["H"], g["edge_index"], c["y"])
    return out


def run_epochs(model, loader, opt, epochs):
    """Returns (per-step compute times in s, per-epoch wall times in s)."""
    steps, epochs_t = [], []
    model.train()
    for _ in range(epochs):
        e0 = time.perf_counter()
        for b in loader:
            t0 = time.perf_counter()
            opt.zero_grad(set_to_none=True)
            loss = F.cross_entropy(model(b.x, b.edge_index, b.batch), b.y)
            loss.backward()
            opt.step()
            steps.append((time.perf_counter() - t0, b.num_graphs))
        epochs_t.append(time.perf_counter() - e0)
    return steps, epochs_t


@torch.no_grad()
def eval_time(model, data_list, bs=64):
    model.eval()
    loader = DataLoader(data_list, batch_size=bs, shuffle=False)
    t0 = time.perf_counter()
    correct = 0
    for b in loader:
        correct += int((model(b.x, b.edge_index, b.batch).argmax(-1) == b.y).sum())
    return time.perf_counter() - t0, correct / len(data_list)


def bench(data_list, threads, epochs, args, label):
    torch.set_num_threads(threads)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    model = SFEGATBench(dropout=args.dropout, residual=args.residual, eta=args.eta)
    opt = torch.optim.SGD(model.parameters(), lr=0.01, weight_decay=1e-3)
    g = torch.Generator().manual_seed(args.seed)
    loader = DataLoader(data_list, batch_size=64, shuffle=True, generator=g)
    run_epochs(model, loader, opt, 1)  # warm-up
    steps, ep = run_epochs(model, loader, opt, epochs)
    full = [t for t, n in steps if n == 64]
    ev, acc = eval_time(model, data_list)
    r = {
        "label": label, "threads": threads, "graphs": len(data_list), "epochs_timed": epochs,
        "ms_per_step_full64_median": 1e3 * float(np.median(full)) if full else None,
        "ms_per_step_full64_mean": 1e3 * float(np.mean(full)) if full else None,
        "ms_per_step_all_mean": 1e3 * float(np.mean([t for t, _ in steps])),
        "s_per_epoch_wall_mean": float(np.mean(ep)),
        "s_per_epoch_wall_median": float(np.median(ep)),
        "eval_s_full_set": ev, "train_acc_after_bench": acc,
        "params": n_params(model),
    }
    print(json.dumps(r, indent=1), flush=True)
    return r


def _parallel_worker(payload):
    """Spawned worker: 1 thread, A01T, returns mean s/epoch over ``epochs``."""
    seed, epochs, variant, tau, weighted = payload
    torch.set_num_threads(1)
    ds = make_dataset([1], "T", variant, tau, weighted)
    torch.manual_seed(seed)
    model = SFEGATBench()
    opt = torch.optim.SGD(model.parameters(), lr=0.01, weight_decay=1e-3)
    loader = DataLoader(ds, batch_size=64, shuffle=True,
                        generator=torch.Generator().manual_seed(seed))
    run_epochs(model, loader, opt, 1)
    _, ep = run_epochs(model, loader, opt, epochs)
    return float(np.mean(ep))


def parallel_probe(n_proc, epochs, args):
    """Run ``n_proc`` single-thread trainers concurrently; measure real contention."""
    import multiprocessing as mp
    ctx = mp.get_context("spawn")
    with ctx.Pool(n_proc) as pool:
        eps = pool.map(_parallel_worker,
                       [(args.seed + i, epochs, args.variant, args.tau, args.weighted)
                        for i in range(n_proc)])
    r = {"n_proc": n_proc, "threads_each": 1, "s_per_epoch_each": eps,
         "s_per_epoch_mean": float(np.mean(eps)),
         "effective_s_per_epoch_throughput": float(np.mean(eps)) / n_proc}
    print(json.dumps(r, indent=1), flush=True)
    return r


# ---------------------------------------------------------------- dense equivalent
# 22-node graphs are tiny, so a dense [B, N, N] formulation avoids PyG scatter
# overhead. Parameter names/shapes mirror the PyG layers exactly, so a PyG
# state_dict loads with strict=True (checked by ``dense_parity``).

class DenseGATv2(nn.Module):
    """PyG GATv2Conv semantics: add_self_loops, negative_slope 0.2, concat heads.

    adj[b, i, j] = 1 iff edge j -> i (source j, target i). Diagonal forced to 1.
    """

    def __init__(self, in_dim, out, heads=4, slope=0.2):
        super().__init__()
        self.h, self.c, self.slope = heads, out, slope
        self.lin_l = nn.Linear(in_dim, heads * out)
        self.lin_r = nn.Linear(in_dim, heads * out)
        self.att = nn.Parameter(torch.empty(1, heads, out))
        self.bias = nn.Parameter(torch.zeros(heads * out))
        nn.init.xavier_uniform_(self.att)

    def forward(self, x, adj):
        B, N, _ = x.shape
        xl = self.lin_l(x).view(B, N, self.h, self.c)
        xr = self.lin_r(x).view(B, N, self.h, self.c)
        s = F.leaky_relu(xr.unsqueeze(2) + xl.unsqueeze(1), self.slope)  # [B,i,j,H,C]
        e = (s * self.att.view(1, 1, 1, self.h, self.c)).sum(-1)          # [B,i,j,H]
        eye = torch.eye(N, dtype=torch.bool, device=x.device)
        m = (adj.bool() | eye).unsqueeze(-1)
        a = torch.softmax(e.masked_fill(~m, float("-inf")), dim=2)
        out = torch.einsum("bijh,bjhc->bihc", a, xl).reshape(B, N, self.h * self.c)
        return out + self.bias


class DenseGCN(nn.Module):
    """PyG GCNConv semantics: A + I, symmetric norm by in-degree, bias after."""

    def __init__(self, in_dim, out):
        super().__init__()
        self.lin = nn.Linear(in_dim, out, bias=False)
        self.bias = nn.Parameter(torch.zeros(out))

    def forward(self, x, adj):
        N = x.shape[1]
        a = adj.float().clone()
        a[:, torch.arange(N), torch.arange(N)] = 1.0
        dinv = a.sum(-1).clamp(min=1e-12).pow(-0.5)
        a = dinv.unsqueeze(-1) * a * dinv.unsqueeze(-2)
        return torch.bmm(a, self.lin(x)) + self.bias


def _bn(bn, x):
    B, N, D = x.shape
    return bn(x.reshape(B * N, D)).view(B, N, D)


class DenseEvoBlock(nn.Module):
    def __init__(self, dim=128, hidden=32, heads=4, bottleneck=32, residual=False, eta=0.5):
        super().__init__()
        self.gat = DenseGATv2(dim, hidden, heads)
        self.bn = nn.BatchNorm1d(hidden * heads)
        self.enc = DenseGCN(hidden * heads, bottleneck)
        self.bn_z = nn.BatchNorm1d(bottleneck)
        self.residual, self.eta = residual, eta

    def forward(self, x, adj):
        h = F.relu(self.gat(x, adj))
        if self.residual:
            h = h + x
        h = _bn(self.bn, h)
        z = _bn(self.bn_z, F.relu(self.enc(h, adj)))
        p = torch.sigmoid(torch.bmm(z, z.transpose(1, 2)))  # p[b,i,j] = sig(z_i . z_j)
        thr = torch.rand_like(p) if self.training else torch.full_like(p, self.eta)
        return h, adj & (p > thr), p


class SFEGATDense(nn.Module):
    def __init__(self, in_dim=8, hidden=32, heads=4, n_blocks=3, n_classes=4,
                 dropout=0.5, residual=False, eta=0.5):
        super().__init__()
        d = hidden * heads
        self.stem = DenseGATv2(in_dim, hidden, heads)
        self.blocks = nn.ModuleList(
            [DenseEvoBlock(d, hidden, heads, 32, residual, eta) for _ in range(n_blocks)])
        self.cls_gat = DenseGATv2(d, hidden, heads)
        self.cls_bn = nn.BatchNorm1d(d)
        self.dropout = dropout
        self.lin = nn.Linear(d, n_classes)

    def forward(self, x, adj):
        """x [B, N, F] float32, adj [B, N, N] bool (diag False)."""
        x = self.stem(x, adj)
        for blk in self.blocks:
            x, adj, _ = blk(x, adj)
        x = _bn(self.cls_bn, F.relu(self.cls_gat(x, adj))).mean(1)
        x = F.dropout(x, p=self.dropout, training=self.training)
        return self.lin(x)


def dense_tensors(subjects, session, variant, tau, weighted=False):
    Xs, As, ys = [], [], []
    for s in subjects:
        c = preprocess.load_features(s, session, variant)
        g = graph.zscore_threshold(c["plv"], tau=tau, weighted=weighted,
                                   return_edge_index=False)
        Xs.append(c["H"]); As.append(g["mask"]); ys.append(c["y"])
    # mask[i, j] symmetric, so it is also the "edge j -> i" adjacency.
    return (torch.as_tensor(np.concatenate(Xs), dtype=torch.float32),
            torch.as_tensor(np.concatenate(As)),
            torch.as_tensor(np.concatenate(ys)))


@torch.no_grad()
def dense_parity(args):
    """Load a PyG model's weights into the dense model; compare eval logits."""
    torch.manual_seed(args.seed)
    pm = SFEGATBench(eta=args.eta).eval()
    dm = SFEGATDense(eta=args.eta).eval()
    dm.load_state_dict(pm.state_dict(), strict=True)
    X, A, _ = dense_tensors([1], "T", args.variant, args.tau)
    ds = make_dataset([1], "T", args.variant, args.tau, False)
    b = next(iter(DataLoader(ds[:64], batch_size=64, shuffle=False)))
    lp = pm(b.x, b.edge_index, b.batch)
    ld = dm(X[:64], A[:64])
    err = float((lp - ld).abs().max())
    r = {"max_abs_logit_diff": err, "argmax_agree": float((lp.argmax(-1) == ld.argmax(-1))
                                                          .float().mean()),
         "dense_params": n_params(dm)}
    print("dense parity", r, flush=True)
    return r


def bench_dense(subjects, threads, epochs, args, label, bs=64):
    torch.set_num_threads(threads)
    torch.manual_seed(args.seed)
    X, A, y = dense_tensors(subjects, "T", args.variant, args.tau)
    model = SFEGATDense(dropout=args.dropout, residual=args.residual, eta=args.eta)
    opt = torch.optim.SGD(model.parameters(), lr=0.01, weight_decay=1e-3)
    g = torch.Generator().manual_seed(args.seed)
    steps, eps = [], []
    for ep in range(epochs + 1):  # first epoch = warm-up
        model.train()
        e0 = time.perf_counter()
        perm = torch.randperm(len(y), generator=g)
        for i in range(0, len(y), bs):
            idx = perm[i:i + bs]
            t0 = time.perf_counter()
            opt.zero_grad(set_to_none=True)
            F.cross_entropy(model(X[idx], A[idx]), y[idx]).backward()
            opt.step()
            if ep > 0:
                steps.append((time.perf_counter() - t0, len(idx)))
        if ep > 0:
            eps.append(time.perf_counter() - e0)
    model.eval()
    t0 = time.perf_counter()
    with torch.no_grad():
        acc = float(torch.cat([model(X[i:i + bs], A[i:i + bs]).argmax(-1)
                               for i in range(0, len(y), bs)]).eq(y).float().mean())
    ev = time.perf_counter() - t0
    full = [t for t, n in steps if n == bs]
    r = {"label": label, "threads": threads, "graphs": len(y), "epochs_timed": epochs,
         "ms_per_step_full64_median": 1e3 * float(np.median(full)),
         "ms_per_step_full64_mean": 1e3 * float(np.mean(full)),
         "s_per_epoch_wall_mean": float(np.mean(eps)),
         "eval_s_full_set": ev, "train_acc_after_bench": acc, "params": n_params(model)}
    print(json.dumps(r, indent=1), flush=True)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--parallel", type=int, default=4,
                    help="also run N concurrent 1-thread trainers (0 = skip)")
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--variant", default="paper")
    ap.add_argument("--tau", type=float, default=0.3)
    ap.add_argument("--weighted", action="store_true")
    ap.add_argument("--residual", action="store_true")
    ap.add_argument("--eta", type=float, default=0.5)
    ap.add_argument("--dropout", type=float, default=0.5)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--skip-loso", action="store_true")
    ap.add_argument("--skip-1thread", action="store_true")
    ap.add_argument("--skip-dense", action="store_true")
    args = ap.parse_args()
    t_start = time.perf_counter()

    m = SFEGATBench()
    params = n_params(m)
    print("params", params, "expected", EXPECTED_PARAMS)
    assert params == EXPECTED_PARAMS, params

    sd = make_dataset([1], "T", args.variant, args.tau, args.weighted)
    dens = float(np.mean([d.edge_index.shape[1] for d in sd])) / (22 * 21)
    results = {"params": params, "mean_edge_density_A01T": dens}
    results["sd_4t"] = bench(sd, args.threads, args.epochs, args, "A01T 288 graphs")
    if not args.skip_1thread:
        results["sd_1t"] = bench(sd, 1, 3, args, "A01T 288 graphs, 1 thread")
    if not args.skip_loso:
        loso = make_dataset(range(2, 10), "T", args.variant, args.tau, args.weighted)
        results["loso_4t"] = bench(loso, args.threads, 2, args, "LOSO-T fold: S2-9 T, 2304 graphs")
    if not args.skip_dense:
        results["dense_parity"] = dense_parity(args)
        assert results["dense_parity"]["max_abs_logit_diff"] < 1e-4, results["dense_parity"]
        results["dense_sd_4t"] = bench_dense([1], args.threads, args.epochs, args,
                                             "DENSE A01T 288 graphs")
        if not args.skip_loso:
            results["dense_loso_4t"] = bench_dense(range(2, 10), args.threads, 2, args,
                                                   "DENSE LOSO-T fold: 2304 graphs")
    if args.parallel > 0:
        results["parallel"] = parallel_probe(args.parallel, 3, args)

    # ---------------- projections (train + one eval pass of the 288-trial test set per epoch)
    E = 500
    sd_ep = results["sd_4t"]["s_per_epoch_wall_mean"]
    ev = results["sd_4t"]["eval_s_full_set"]
    if "loso_4t" in results:
        lo_ep = results["loso_4t"]["s_per_epoch_wall_mean"]
    else:
        lo_ep = sd_ep * 2304 / 288
    proj = {
        "SD_9subj_x500_train_only_h": 9 * E * sd_ep / 3600,
        "SD_9subj_x500_with_epoch_eval_h": 9 * E * (sd_ep + ev) / 3600,
        "LOSO_T_9folds_x500_train_only_h": 9 * E * lo_ep / 3600,
        "LOSO_T_9folds_x500_with_epoch_eval_h": 9 * E * (lo_ep + ev) / 3600,
        "LOSO_TE_9folds_4608_x500_train_only_h_est": 9 * E * lo_ep * 2 / 3600,
    }
    # ablation sweep: 5 variants (PLV-GAT, SFE-GCN, FE-GAT, R-GAT, R-SFE-GAT) at
    # full-model cost (upper bound; PLV-GAT / FE-GAT have no evolution blocks).
    proj["ablation_sweep_SD_5var_h_upper"] = 5 * proj["SD_9subj_x500_train_only_h"]
    proj["ablation_sweep_LOSO_T_5var_h_upper"] = 5 * proj["LOSO_T_9folds_x500_train_only_h"]
    if "sd_1t" in results:
        # 4 independent single-thread processes in parallel (ideal scaling assumed)
        one = results["sd_1t"]["s_per_epoch_wall_mean"]
        proj["SD_9subj_x500_4proc_1thread_h_ideal"] = 9 * E * one / 4 / 3600
        proj["LOSO_T_9folds_x500_4proc_1thread_h_ideal"] = 9 * E * one * 2304 / 288 / 4 / 3600
    if "parallel" in results:
        # measured: N concurrent 1-thread jobs, each epoch takes s_per_epoch_mean
        pe = results["parallel"]["effective_s_per_epoch_throughput"]
        proj["SD_9subj_x500_parallel_measured_h"] = 9 * E * pe / 3600
        proj["LOSO_T_9folds_x500_parallel_measured_h"] = 9 * E * pe * 2304 / 288 / 3600
        proj["ablation_sweep_SD_5var_parallel_measured_h_upper"] = 5 * 9 * E * pe / 3600
    if "dense_sd_4t" in results:
        dsd = results["dense_sd_4t"]["s_per_epoch_wall_mean"]
        dev = results["dense_sd_4t"]["eval_s_full_set"]
        dlo = results.get("dense_loso_4t", {}).get("s_per_epoch_wall_mean", dsd * 8)
        proj["DENSE_SD_9subj_x500_train_only_h"] = 9 * E * dsd / 3600
        proj["DENSE_SD_9subj_x500_with_epoch_eval_h"] = 9 * E * (dsd + dev) / 3600
        proj["DENSE_LOSO_T_9folds_x500_train_only_h"] = 9 * E * dlo / 3600
        proj["DENSE_ablation_sweep_SD_5var_h_upper"] = 5 * 9 * E * dsd / 3600
    results["projections"] = proj
    results["bench_wall_s"] = time.perf_counter() - t_start
    print(json.dumps(proj, indent=1))
    print("benchmark wall time %.1f s" % results["bench_wall_s"])

    run_id = "benchmark-" + time.strftime("%Y%m%d-%H%M%S")
    out = os.path.join(ROOT, "runs", run_id)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "config.json"), "w") as f:
        json.dump(vars(args), f, indent=1)
    with open(os.path.join(out, "metrics.json"), "w") as f:
        json.dump(results, f, indent=1)
    import torch_geometric
    import scipy
    env = {"python": sys.version, "platform": platform.platform(), "torch": torch.__version__,
           "torch_geometric": torch_geometric.__version__, "numpy": np.__version__,
           "scipy": scipy.__version__, "cpu_count": os.cpu_count(),
           "torch_threads": torch.get_num_threads()}
    with open(os.path.join(out, "env.json"), "w") as f:
        json.dump(env, f, indent=1)
    print("wrote", out)


if __name__ == "__main__":
    main()
