
# Optimization Safety Gate

This package is the next stage after independent synthetic validation.

Purpose:
- Do NOT tune V2 further using revealed ground truth.
- Convert diagnostics into explicit operational decisions:
  - ELIGIBLE
  - REVIEW
  - HOLD_CURRENT
- Produce a portfolio-level shadow-test decision.
- Never enable real budget writes.

Inputs:
1. A completed outputs_v2/demo_* folder containing:
   - run_metadata_v2.json
   - validation_comparison.csv
   - slope_stability_summary.csv
   - campaign_allocations_v2.csv
2. independent_validation/results/aggregate_results.csv

Outputs:
- campaign_safety_decisions.csv
- portfolio_safety_decision.json

Important:
If one or more campaigns are HOLD_CURRENT, do not manually overwrite their optimized
budgets after the solve. That would break the fixed total-budget optimization.
The next engineering step is to freeze those campaigns inside the optimizer and re-solve
the remaining budget across eligible campaigns.

This gate supports SHADOW evaluation only. It does not authorize production writes.
