# Audit of uploaded gurobi_model.zip and recovery r1

## A. What the supplied source actually contains

The archive has 12 files: three optimizer implementations, two test suites,
two markdown documents, two synthetic datasets, campaign_stats.csv,
compute_stats.py, and console.log.

### Canonical source comparison

- `naver_budget_optimizer.py` and `_fixed2.py` have identical Python ASTs.
  Their only textual difference is the comments on beta bounds.
- `_fixed_optimizer.py` has earlier beta bounds (1e-8/spend_scale to
  1e-5/spend_scale). The main file and `_fixed2.py` use
  1e-4/spend_scale to 7.0/spend_scale and a corrected residual closure.
- Both test files import `naver_budget_optimizer`, not `_fixed2`.
- `_test_fixed.py` differs from the main tests in its T03 assertion only.

### Last recorded execution (source evidence, not our rerun)

`console.log` ends with 30 passed in 1.18s for `_test_fixed.py`.
Immediately preceding work records 1 failed / 29 passed for the original
`test_naver_budget_optimizer.py`. The failed test was
`TestResponseEstimator.test_T03_larger_lambda_increases_reg_penalty`.
The last modification changed that test, not the optimizer implementation.
See `evidence/source_log_tail.txt` for the actual excerpt.

### Defects and inconsistencies found by this review

1. **Fitting objective mismatch.** Main implementation lines 274-279 pass
   unaveraged data residuals to curve_fit, so the numerical objective is
   SUM(data residual^2) + penalty. Lines 310-316 report MEAN(data residual^2)
   + penalty, contrary to the documented fitted objective.
2. **Regularization test assumption.** Main tests lines 287-313 test an
   individual alpha-deviation trend. `_test_fixed.py` lines 287-318 replace
   that with a claimed universal increase of the WEIGHTED penalty when
   lambda increases. Neither is a general guarantee for jointly refitted
   alpha/beta. We do not accept passing that altered assertion as proof
   of the estimator's correctness.
3. **Conditional tests.** Main tests T13/T14 check constraints/dominance
   only inside `if model.Status == GRB.OPTIMAL`, allowing other statuses
   to avoid those assertions. Recovery requires OPTIMAL explicitly.
4. **Current baseline bounds.** Main evaluate_current marks same-budget
   current spending feasible without checking campaign bounds.
5. **Comparison constraints.** Original run applies optional change bounds
   only to Gurobi, not to all comparator allocations.
6. **Policy/hidden-data separation.** Original run reads the entire
   ground-truth file early for budget bounds despite the Stage-6-only
   comment. Only the budget columns are used there, but isolation is not
   as strict as claimed. The recovery default uses a separate policy file.
7. **Version mismatch.** Original specification specifies LP hypographs,
   while original math_formulation.md still describes the earlier SOS2 /
   setPWLObj approach. The original documents are archived unchanged.
8. **Silent execution/validation edge cases.** Failed fits could be passed
   to PWL; projection returned True without checking the final sum;
   total_daily_budget=0 fell back to default via truthiness; partial known
   conversions were summed as a full portfolio total.

These are review findings, not claims made by the original sources.

## B. Explicit recovery changes (our work)

- Selected the original main optimizer as the base, not a guessed latest file.
- Represented the stated mean loss using residual/sqrt(n), fitted scaled
  alpha and beta with scipy.optimize.least_squares and an analytic Jacobian.
- Replaced T03's invalid general monotonicity premise with direct penalty and
  feasible-initial-loss checks; added duplicate-observation invariance and
  captured-residual objective tests. Assertions were not loosened to hide
  an implementation failure.
- Added failed-fit/input guards, checked projection results, aligned optional
  comparator bounds, and required explicit optimal status in the demo/tests.
- Added a separate three-column budget policy without hidden response data.
- Added a local dependency/license smoke check and a runner with diagnostic
  and Gurobi modes. No alternative solver is silently substituted.
- Preserved both synthetic input files byte-for-byte.
- Added explicit status/output files and this limitation record.

See `evidence/implementation_changes.patch` and `evidence/test_changes.patch`
for full changes against the supplied source. Source hashes are in
`evidence/original_manifest.json`.

## C. What was actually executed here

Review environment: Python 3.13.5, NumPy 2.3.5, pandas 2.2.3,
SciPy 1.17.0, pytest 9.0.2. gurobipy was not installed. Network restrictions
prevented package installation/download.

Commands:

```
python check_environment.py
python -m pytest -q -rs
python run_local.py --mode diagnostics --output evidence/data_diagnostics
```

Results:

- Environment check: BLOCKED at gurobipy, no license smoke solve performed.
- Recovery tests: **35 passed, 10 skipped**, no test failures in the final run.
- All 10 skips require Gurobi; they are NOT passes. No recovered Gurobi
  implementation has been executed here.
- Two passing tests use SciPy/HiGHS on a small synthetic LP fixture to check
  LP mathematics and bounds/dominance, independently of Gurobi.
- Actual 4,380-row data diagnostics: 12 campaigns, 365 dates;
  292 training dates, 73 validation dates; 12 numerical fits converged;
  all 12 PWL shapes passed the checks.
- Default reference daily budget: 5,993,525.794684932 KRW.
- Expected base model size: 24 continuous variables and 229 constraints;
  source-derived, not extracted from a Gurobi run here.
- 32 zero-conversion, positive-revenue records flagged and preserved.

Logs: `evidence/pytest_recovery_all.txt`, `evidence/environment_check.txt`,
`evidence/diagnostics_run.txt`, `evidence/data_diagnostics/run_metadata.json`.

## D. Next action and completion criteria

The next blocker is LOCAL Gurobi installation/license validation, not more
Modeler tokens. Set up the independent recovery environment, run
check_environment.py, then the full pytest suite. Resolve failures or skips
before interpreting the actual Gurobi demo's outputs.

The first milestone is four-strategy synthetic results with recorded solver
status, budget/bounds checks and LP consistency, not proof of real-world
predictive accuracy. Response estimation validation, extrapolation policy,
independent conversion modeling, risk, multi-period planning and AdScope
integration remain separate work. See README.md for preserved limitations.

Public technical references consulted for the proposed recovery:
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html
- https://docs.gurobi.com/projects/intelligence/en/current/faq.html
- https://docs.gurobi.com/projects/intelligence/en/current/modeler.html
- https://support.gurobi.com/hc/en-us/articles/29682074018833-What-does-Restricted-license-for-non-production-use-only-mean
