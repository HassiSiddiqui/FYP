"""SFE-GAT model (Eqs. 9-24), primary configuration P0 from the replication debate.

Primary (paper-literal where the paper is explicit):
- stem GATv2(8 -> 32x4 concat), no activation / BN (Table 1, 2,560 params)
- 3 x EvoBlock: GATv2(128 -> 32x4 concat) -> ReLU -> BN(128);
  GAE encoder GCN(128 -> 32, weighted A) -> ReLU -> BN(32);
  inner-product decoder P = sigmoid(z_i . z_j) on existing directed edges;
  mask M = 1(P > R), R ~ U(0,1) in training, M = 1(P > eta) in eval; A_hat = A * M
- classifier GATv2 -> ReLU -> BN(128) -> mean pool -> Dropout(0.5) -> Linear(128 -> 4)
Total 149,796 trainable parameters.

The hard mask has no gradient path into the GAE (Eqs. 15-18 as written; the released
code behaves the same). Under the CE-only loss the GAE weights stay at initialisation.
That is documented, not hidden.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GATv2Conv, GCNConv, global_mean_pool

EXPECTED_PARAMS = 149_796


class EvoBlock(nn.Module):
    def __init__(self, dim=128, hidden=32, heads=4, bottleneck=32, residual=False,
                 eta=0.5, gcn_edge_weight=True):
        super().__init__()
        self.gat = GATv2Conv(dim, hidden, heads=heads, concat=True)
        self.bn = nn.BatchNorm1d(hidden * heads)
        self.enc = GCNConv(hidden * heads, bottleneck)
        self.bn_z = nn.BatchNorm1d(bottleneck)
        self.residual = residual
        self.eta = eta
        self.gcn_edge_weight = gcn_edge_weight

    def forward(self, x, edge_index, edge_weight=None):
        h = F.relu(self.gat(x, edge_index))                       # Eq. 12
        if self.residual:                                         # code-only variant V1
            h = h + x
        h = self.bn(h)                                            # Eqs. 13-14
        ew = edge_weight if self.gcn_edge_weight else None
        z = self.bn_z(F.relu(self.enc(h, edge_index, ew)))        # Eq. 15 (+ BN32 per Table 1)
        p = torch.sigmoid((z[edge_index[0]] * z[edge_index[1]]).sum(-1))  # Eq. 16
        thr = torch.rand_like(p) if self.training else torch.full_like(p, self.eta)
        keep = p > thr                                            # Eqs. 17-18
        ew_out = edge_weight[keep] if edge_weight is not None else None
        return h, edge_index[:, keep], ew_out, p


class SFEGAT(nn.Module):
    def __init__(self, in_dim=8, hidden=32, heads=4, n_blocks=3, n_classes=4,
                 dropout=0.5, residual=False, eta=0.5, gcn_edge_weight=True,
                 evolve=True):
        super().__init__()
        d = hidden * heads
        self.stem = GATv2Conv(in_dim, hidden, heads=heads, concat=True)
        self.blocks = nn.ModuleList([EvoBlock(d, hidden, heads, 32, residual, eta,
                                              gcn_edge_weight) for _ in range(n_blocks)])
        self.cls_gat = GATv2Conv(d, hidden, heads=heads, concat=True)
        self.cls_bn = nn.BatchNorm1d(d)
        self.dropout = dropout
        self.lin = nn.Linear(d, n_classes)
        self.evolve = evolve  # False -> FE-GAT ablation (mask disabled, edges fixed)

    def forward(self, x, edge_index, batch, edge_weight=None, return_trace=False):
        trace = [edge_index] if return_trace else None
        x = self.stem(x, edge_index)
        for blk in self.blocks:
            x, ei, ew, _ = blk(x, edge_index, edge_weight)
            if self.evolve:
                edge_index, edge_weight = ei, ew
            if return_trace:
                trace.append(edge_index)
        x = self.cls_bn(F.relu(self.cls_gat(x, edge_index)))     # Eqs. 20-21 (ReLU per code)
        g = global_mean_pool(x, batch)                            # Eq. 22
        g = F.dropout(g, p=self.dropout, training=self.training)  # Eq. 23
        out = self.lin(g)                                         # Eq. 24 (softmax in loss)
        return (out, trace, g) if return_trace else out


def n_params(m):
    return sum(p.numel() for p in m.parameters() if p.requires_grad)
