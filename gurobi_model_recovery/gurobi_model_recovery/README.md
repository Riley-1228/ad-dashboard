# AdScope / Naver optimizer: recovery r1

This is an explicitly modified, experimental recovery copy of the user's
`gurobi_model.zip`. It is not a certified production model. The original ZIP
has not been changed. Keep your original `gurobi_model/` folder.

## Start here (Windows / VS Code)

Extract this folder beside `backend/`, `src/`, and your original `gurobi_model/`.
Do not put its files into `backend`, `src`, or an existing virtual environment.
Right-click **gurobi_model_recovery** in VS Code -> Open in Integrated Terminal.
Use a separate virtual environment, not the existing backend environment.

```console
python --version
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe check_environment.py
```

Use Python 3.10 or newer. The non-Gurobi checks in this package were executed
with Python 3.13.5, NumPy 2.3.5, pandas 2.2.3, SciPy 1.17.0 and pytest 9.0.2.
Dependencies on other supported versions have not been retested here.

`check_environment.py` must print a local Gurobi smoke-test PASS before you
proceed to solver tests. Missing packages or a license/environment problem
produce BLOCKED and a nonzero exit code. Do not share license secrets.

A restricted license has usage and size restrictions; an installation or
smoke-test PASS is not permission for a commercial deployment. Obtain a
license appropriate to your organization and usage.

Official references:
- https://docs.gurobi.com/projects/intelligence/en/current/faq.html
- https://docs.gurobi.com/projects/intelligence/en/current/modeler.html
- https://support.gurobi.com/hc/en-us/articles/29682074018833-What-does-Restricted-license-for-non-production-use-only-mean

## Test before using optimization outputs

```console
./.venv/Scripts/python.exe -m pytest -q -rs
```

Inspect both failures and skipped tests. A skipped Gurobi test does NOT count
as a passed optimization test. This package has 45 collected test cases.
Our recorded run: **35 passed, 10 skipped**. All 10 skipped cases require
Gurobi. `gurobipy` was unavailable in the review environment, and attempts to
install/download it were blocked by network access. No Gurobi solve of the
recovery copy has been performed here.

Two of the passing cases use SciPy/HiGHS to independently check the small
fixture's LP mathematics. They are not Gurobi executions, and no solver
fallback is substituted into the Gurobi run.

## Run data/estimation diagnostics (no Gurobi solve)

```console
./.venv/Scripts/python.exe run_local.py --mode diagnostics
```

This reads the supplied 4,380 synthetic observations and the separate budget
policy CSV. It fits 12 response curves, generates 20 breakpoints each, and
writes diagnostics. It does not optimize budgets. This run was actually
executed during review; see `evidence/data_diagnostics/`.

## Run the Gurobi demonstration (after solver tests pass locally)

```console
./.venv/Scripts/python.exe run_local.py --mode demo
```

The default demonstration has fixed mean-reference daily budget
5,993,525.794684932 KRW, 12 campaigns, 24 continuous variables and 229 explicit
linear constraints (including the total-budget equality; excluding variable
bounds). No integer variables or SOS constraints are intended in this base
model. These counts follow from the source and must be confirmed by a real
Gurobi run's `run_metadata.json`.

Outputs are written to a new timestamped directory under `outputs/`:
- `estimation_diagnostics.csv`
- `pwl_breakpoints.csv`
- `campaign_allocations.csv` (all four strategies)
- `strategy_comparison.csv`
- `run_metadata.json` (actual solver status, size, and consistency checks)

No real ad account, database, or FastAPI endpoint is called by this runner.
There is no automatic advertising-budget deployment.

Optional later commands:

```console
./.venv/Scripts/python.exe run_local.py --mode demo --budget 5500000
./.venv/Scripts/python.exe run_local.py --mode demo --max-change 0.30
./.venv/Scripts/python.exe run_local.py --mode demo --sensitivity
```

The optional sensitivity output is estimation diagnostics only. Comparisons
of the optimized allocations across every lambda remain a separate task.

## Source and version policy

`naver_budget_optimizer.py` is the only canonical implementation in this
recovery folder. It is based on the original main implementation, NOT on
choosing `_fixed2.py` by name. The original main implementation and `_fixed2.py`
have identical Python ASTs; they differ only in comments.

`test_naver_budget_optimizer.py` is the original test suite with explicitly
recorded repairs. `test_recovery.py` adds regression checks. `_test_fixed.py`
is not promoted to canonical: its claimed monotonicity of weighted
regularization loss at fitted solutions is not a valid general guarantee.

`source_docs/` contains the user's original specification and formulation
without changes. They disagree: the formulation still describes the earlier
SOS2/setPWLObj implementation, while the revised specification and Python
implementation use the LP hypograph. Do not use that old formulation/PDF as
an exact description of this recovery implementation. `RECOVERY_MODEL.md`
records the current limited scope without silently editing the source docs.

## Important limitations still open

- Optimization input is synthetic, not actual advertising performance.
- Estimated spend-response curves are descriptive associations, not
  experimentally identified causal lift curves.
- Spend coverage is narrow and shares seasonal/promotion drivers with revenue.
- The fixed priors/bounds and lambda=0.01 are heuristic defaults, not tuned.
- The existing extrapolation discount and isotonic correction are retained;
  they are not a statistical lower confidence bound. Some corrected points
  can be raised by shape correction. A conservative guarantee is NOT claimed.
- The full-reference demo uses all dates for current-spend/ROAS/AOR reference
  summaries but only the first 80% for curve fitting. Its final 20% is
  predictive validation, not an untouched final optimization test.
- Conversion/CPA outputs use an AOR approximation, not an independently fitted
  conversion curve. Unknown campaign conversions invalidate the full
  portfolio conversion/CPA total instead of silently omitting that campaign.
- The supplied data has 32 zero-conversion, positive-revenue observations;
  they are flagged and preserved, not silently corrected.
- Risk, hard ROAS/CPA targets, multi-period planning, production tenant
  isolation and dashboard integration are outside this recovery run.
- Fixed-spend campaigns with L=U are not supported by the current breakpoint
  builder; it requires L<U. Zero-mean-spend/revenue campaigns fail explicitly
  pending a separately specified cold-start policy.

## Why the regularization repair matters

The original code minimized a SUM of normalized residual squares plus the
penalty but reported a MEAN data loss. The new code divides each data
residual by sqrt(number_of_training_rows), making the fitted objective
match the documented mean loss plus regularization. It also fits
alpha/revenue_scale and beta*spend_scale for numerical scaling.

Consequently, old fitted parameters and forecasts should not be reused as
if they were results of this repaired formulation.

SciPy reference:
https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html
