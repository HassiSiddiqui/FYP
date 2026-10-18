"""SFE-GAT replication package (SilentAssist FYP).

Kept deliberately light: importing ``sfegat`` does not import torch.
Submodules:

- ``sfegat.data``        BNCI 001-2014 (BCI IV-2a) .mat loader -> (X, y, meta)
- ``sfegat.preprocess``  filter bank + Welch band power (Eqs. 6-8), feature cache
- ``sfegat.graph``       Hilbert PLV, whole-matrix z-score, threshold (Eqs. 1-5)

Model / training modules are owned by the trainer and are added after ADR-0001.
"""

__version__ = "0.1.0"

__all__ = ["data", "preprocess", "graph", "__version__"]
