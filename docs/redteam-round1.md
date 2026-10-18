# Red-team round 1: findings ledger (fixer)

**Date:** 2026-10-14, evening before the mid evaluation. **Scope:** findings RT1-01…RT1-14 (UI/demo) and RT2-01…RT2-16 (replication/ErrP honesty).
**Verdicts:**
- **fixed:** code or doc changed, and the change was re-tested.
- **rejected:** no code change, with the evidence given.
- **deferred:** handed to its owner or left for after the mid evaluation, with the reason.

The docs writer owns `README.md`, `docs/STUDY-GUIDE.md`, `docs/replication.md` and `docs/verification.md`. The fixer did not edit those files, so findings that live there are marked **deferred → docs writer** with the exact text the writer needs.

## Verification after fixes (real counts)

| Check | Result |
|---|---|
| `node --check` on all 13 changed JS files | 13/13 OK |
| `node research/tests/js/run_node.js lint` | 81 files, 0 problems |
| `node research/tests/js/run_node.js cases` (headless Node) | `SELFTEST-DONE pass=71 fail=0` (DOM-only cases skipped) |
| `node --test` core, safety ×4, ui, viz, eeg | tests 54, pass 54, fail 0 |
| Headless Edge selftest (`research/scripts/run_selftest.py`) | `SELFTEST-DONE pass=76 fail=0` (was 74/0; 2 new cases plus existing ones). JSON: `research/.cache/redteam1/selftest_after_fix.json` |
| Headless Edge viz DOM (`research/tests/js/viz/run_viz_dom.py`) | `VIZ-DOM pass=35 fail=0` |
| Overflow probe (`research/.cache/redteam1/ovf_probe.js`), 1366×768 and 1280×720, Scripted and Replay | Caregiver button right edge 1354 (≤ 1366) and 1268 (≤ 1280). Decoder pill not clipped. Evo chips inside the brain card. `docW` equals the viewport. |

New selftests:
- `ui/rollback-journey` now also asserts that `ui.alert === null` and that `#sa-alert` is `display:none` on the Hub after [Return to Home] (RT1-01).
- `ui/reject-alert-visible`: Neural MI 40 % → Turn On → the REJECT banner is visible (RT1-02).
- `ui/flag-only-setting`: for the `setting` and `power` classes, an error epoch gives `flag` and a correct epoch gives `keep` (RT1-03).

**Training note:** run `20261014-1549-planb-sd-p0` has **finished**. All 9 `sd_A0x/result.json` files and `summary_sd.json` (17:18) exist. `runs/planb-sd.log` ends with a `BrokenPipeError` from a multiprocessing pool worker after the jobs completed; all results were written, but the docs writer should mention it. The fixer did not restart or touch training.

## Ledger

| ID | Sev | Verdict | What was done / evidence |
|---|---|---|---|
| RT1-01 | blocker | **fixed** | `navigator.js` now mirrors every `voice:say` with `priority:'safety'` into `store.ui.alert`, so the existing clear-on-next-token and Reset logic also clears the episode's ErrP status. Selftest `ui/rollback-journey` asserts that `#sa-alert` is hidden on the Hub after [Return to Home] (Edge: 17 assertions pass). |
| RT1-02 | major | **fixed** | Root cause confirmed: `caption.render` blanks `textContent` for one frame, and `render.js` then re-added `is-empty`. Now `caption.render` records the intended text (`el.__saText`), and `render.js` derives `is-empty` from it. The clear path goes through `caption.render(el,{text:''})`. Selftest `ui/reject-alert-visible` (Edge: banner text present and `display ≠ none`). |
| RT1-03 | major | **fixed** | `detector.observe`: for flag-only classes (t* = ∞), `q > max(SA.config.errp.flagOnlyThreshold = 0.5, π)` gives `'flag'`. These classes still never roll back. Contract amendment recorded in `docs/architecture.md` §2.3. Selftest `ui/flag-only-setting`. Fan/TV + [Simulate ErrP] now shows `Possible Error Detected • not rolled back (setting: flag only)` (or `(flag only)` for power). |
| RT1-04 | major | **fixed (honesty) / claim withdrawn** | Pruning cannot be faked; see RT2-01. `brain-graph-view.js` detects when no stage removes an edge and leads the caption with "On this model the mask keeps every edge (P ≈ 1), so evo0–evo3 are identical — no pruning learned (PRELIMINARY)". PROMPT §5 "brain graph visibly evolves evo0→evo3" must be reported as **NOT MET** (ADR 0001 amendment §3). A selftest that runs `diffSteps` on shipped data is **deferred**: it would only assert the known-negative result. |
| RT1-05 | major | **rejected (as a code defect)** + presenter guidance | This is ADR 0002 D13 prior-shift working as designed: at CONFIRM/PREVIEW, π = 0.02 and the seed-509 epoch gives q = 0.274 < t* = 0.294 → keep. Changing the rule or the epoch to force a rollback would breach D19 ("no scripted posterior"). Mitigation: the S5 rollback note now states q (RT2-06). Presenter: set Neural MI to 70–75 % before the preset rollback demo, and never show ErrP after a CONFIRM on a light. |
| RT1-06 | major | **fixed** | `queue.js` lists live (non-seeded) requests above seeded examples. `dashboard.js` `#cv-patient` now names the patient's own pending request first. The seeded example still runs the real path (architecture.md:252 unchanged). |
| RT1-07 | major | **fixed** | `layout.css`: the top bar wraps to 2 rows (`flex-wrap:wrap`; grid row `minmax(var(--topbar-h), auto)`). The decoder pill is `min-width:max-content`, so "PRELIMINARY (Plan B)" is never truncated. Probe: Replay at 1366 gives decoder pill [984,1303] with no overflow and Caregiver button [1150,1354]. At 1280 the button is at [1064,1268]. |
| RT1-08 | minor | **fixed** | `#sa-graphs .bv-status` now wraps to 2 lines (line-clamp 2) instead of an ellipsis on 1 line. The exemplar caption also discloses the selection (RT2-07). |
| RT1-09 | minor | **partly fixed** | Evo chips may wrap (`flex-wrap:wrap`). Probe: chip right edges are now inside the card (≤ 1323 < 1336). SPARQL overlap and the 7.5 px KG labels are **deferred**: presenting at 1920×1080 or 90 % zoom avoids them. |
| RT1-10 | minor | **fixed** | Dashboard buttons ([Approve], [Reject], [Verify chain], [Tamper demo]) have `tabIndex=0`; the dashboard is `display:none` when closed. On open, focus moves to the first Approve (a live request, because of RT1-06). The queue's 1 s re-render restores focus to the same button. Patient-side harness buttons keep `tabindex=-1` (asserted by `ui/readme-strings`). |
| RT1-11 | minor | **fixed** | `render.js` sets `data-kind="ok"` for "Caregiver approved the request". `components.css` renders it with an ok border and a ✓ glyph instead of the red ⚠. |
| RT1-12 | minor | **fixed** | Gauge sub-label is now "subject 1, session 2 AUC 0.89 (BA 0.82) • 6-subject mean cross-session BA 0.71 ± 0.09 · PRELIMINARY". Fixes a latent bug: `met.ba` never existed, and the exported field is `baAtTBA`. |
| RT1-13 | minor | **rejected (honest as built)** + guidance | The strip already shows Pred/Truth/✗. Replay now also shows full-session accuracy (RT2-07). Presenter: decode on S1 or the Hub; pick A01E-t020/t024 from the Replay dropdown for a correct decode; say "A01 SD 34.37 % (99/288) vs paper 80.21 %". |
| RT1-14 | minor | **noted** (guidance) | RT1-01/02/03/06/07 are fixed, so steps 2 ("Reset to clear the stale banner"), "narrate REJECT from panel", "avoid ErrP on Fan/TV", "approve the SECOND card" and "avoid Replay at 1280/1366" no longer apply. Still applies: Neural MI 70 % for the preset rollback; Tamper demo LAST (the chain is never truncated, by contract); [Reset Demo] sits under More controls below 900 px height. |
| RT2-01 | blocker | **deferred → docs writer** (STUDY-GUIDE) | Fixer re-checked `research/.cache/redteam2/mask_check.json`: eval keep fraction 1.0 at all 3 blocks, min P 0.9939 (T) and 0.9988 (E); `mask_train_check.json` keep ≥ 0.99998. Recorded in ADR 0001 amendment §3 and shown in the UI (RT1-04). The STUDY-GUIDE lines 370/390–392/402/1207 text proposed in RT2-01 should be applied as written. |
| RT2-02 | blocker | **fixed** | CAP_MODEL is now "Edges kept by the model's evolution mask (GAE untrained under the paper's CE-only loss) — model behaviour, not neurophysiology", prefixed by the no-pruning sentence when it applies. CAP_SCRIPTED is now "…Switch to Replay to see the SFE-GAT graph stages evo0→evo3 for a real trial." `viz-dom.html:79` and ADR 0005 (l.312–313) are amended with an "Amended 2026-10-14" note. |
| RT2-03 | blocker | **fixed (record) / floor.py deferred** | ADR 0001 now has an "Amendment 2026-10-14 (revisit condition 3 fired)" section: a per-subject k/288 table for **all 9 subjects** (training has completed; every subject is below B0), audit findings (i)–(iii), G3 not run (protocol deviation), and a caveat that B0 is not yet logged under `research/runs/`. `research/sfegat/floor.py` is **deferred** to after the mid-eval: no time left in the box, and the B0 values must not be cited as pre-registered until it runs. |
| RT2-04 | major | **deferred** | STUDY-GUIDE lines 392/1222 → docs writer, text as proposed. Fixer confirmed `model.py:44` uses `torch.rand_like` (global RNG) and that `research/tests/` has no `test_model.py` or `test_protocol.py`. `test_model.py` (param count 149,796, GAE no-grad, κ identity) is post-mid-eval. |
| RT2-05 | major | **deferred → docs writer** | Real numbers now exist for all 9 SD subjects (`summary_sd.json`): A01 99, A02 85, A03 107, A04 111, A05 76, A06 87, A07 113, A08 98, A09 149 (/288). 9-subject mean 35.68 % (floored). D32 no longer blocks a mean, because all 9 are complete; the mean must still carry the "below B0" label. |
| RT2-06 | major | **fixed** | The S5 rollback note (`navigator.js` `epochNote`) now reads e.g. "ErrP epoch: Synthetic (generated, SYN-error-seed509; seed selected to show the README value; α = 1.0; synthetic TPR 0.51 / FPR 0.005 at π = 0.18) · FCz value is a descriptive single-trial minimum; detection uses 72 features; q = 0.80". Replay epochs read "Replay (BNCI 013-2015, id)". 72 = `errpModel.w.length` (checked). The README status string is unchanged. STUDY-GUIDE:637 → docs writer (now true; needs a screenshot). |
| RT2-07 | major | **fixed** | The harness Replay option reads, from `SA.data.miReplay.manifest` and floored: "model accuracy on all 288 A01E trials: 34.37 % (99/288; paper A01: 80.21 %) · these 20 trials: first 5 per class in trial order, not chosen by correctness (10/20 correct)". The scripted exemplar caption keeps the ADR 0004 prefix and appends "· picked because it decodes correctly (viva script); not representative". |
| RT2-08 | major | **fixed (ADR) / replication.md deferred** | The D9 measured addendum and the evidence-ordered causes are in ADR 0001 amendment §2–§3. The replication.md wording belongs to the docs writer. |
| RT2-09 | major | **deferred → docs writer** | `docs/replication.md` is owned by the docs writer. Inputs: the ADR 0001 amendment table, T* provenance (§6), replay 10/20 vs 99/288, D26 0/288 excluded, and superseded run 20261014-1547. |
| RT2-10 | minor | **fixed** | The deviation is recorded in ADR 0001 amendment §5. `plan_b.yaml` label kept. |
| RT2-11 | minor | **fixed (UI + ADR)** | The harness strip says "temperature-scaled (T* = 8.0, fit on 72 A01T trials)" instead of "calibrated". The A01E NLL 1.426 vs ln 4 = 1.386 is recorded (ADR amendment §6; checked against `calib_check.json`). Folds 1–3 are post-mid-eval. |
| RT2-12 | minor | **fixed** | `docs/errp.md` line 3 and `research/errp/evaluate.py` docstring now give the precise S2-usage statement. The permutation claim now says "within-session S1-LOBO AUC, labels permuted across the whole session; cross-session not permutation-tested" (checked at `evaluate.py:98-103, 153-156`). |
| RT2-13 | minor | **fixed** | "Impact" bullet added to `docs/errp.md` §6 item 1, plus a matching §7 caveat (segment pipeline only; continuous online use unvalidated). |
| RT2-14 | minor | **deferred → docs writer** | STUDY-GUIDE:865 heading text as proposed in the finding. |
| RT2-15 | minor | **fixed in UI/ADR; STUDY-GUIDE deferred** | The UI and ADR use floored k/288 values (34.37 %, 29.51 % with the chance-bound note). STUDY-GUIDE → docs writer. |
| RT2-16 | minor | **deferred → docs writer** | The README is source of truth and owned by the docs writer. Add the "Note on §1" paragraph to the appended Replication Results section, with A01 as 34.37 % (99/288), floored. |

## Files changed by the fixer

- `POC/js/ui/render.js`, `POC/js/ui/components/caption.js`, `POC/js/ui/navigator.js`: RT1-01, RT1-02, RT1-11, RT2-06
- `POC/js/errp/detector.js`, `POC/js/config/errp.js`: RT1-03, RT1-12 (config note)
- `POC/js/brain/brain-graph-view.js`, `POC/js/eeg/decoder.js`: RT1-04, RT2-02, RT2-07
- `POC/js/ui/harness.js`: RT2-07, RT2-11
- `POC/js/ui/caregiver/gauges.js`, `queue.js`, `dashboard.js`, `audit-view.js`: RT1-06, RT1-10, RT1-12
- `POC/css/layout.css`, `POC/css/caregiver.css`, `POC/css/components.css`: RT1-07, RT1-08, RT1-09, RT1-11
- `POC/js/selftest/cases/ui.js`, `research/tests/js/viz/viz-dom.html`: tests
- `docs/adr/0001-replication-fidelity.md` (amendment), `docs/adr/0005-assistive-ux.md` (captions), `docs/architecture.md` (flag-only rule), `docs/errp.md`, `research/errp/evaluate.py` (docstring only)
