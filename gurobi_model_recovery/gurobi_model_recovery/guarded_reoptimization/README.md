
# Guarded Reoptimization

This is the stage after Safety Gate.

Default strict shadow policy:
- ELIGIBLE: keep the original effective optimization bounds.
- REVIEW: freeze at current budget until human review.
- HOLD_CURRENT: freeze at current budget.
- Re-solve the remaining total budget across eligible campaigns with Gurobi.

Why re-solve?
Do not take the old optimized allocation and manually replace unsafe campaign budgets.
That breaks budget conservation and optimality. Safety decisions must be represented
inside the optimization constraints.

Default mode is deliberately conservative:
`--review-policy freeze`

An optional exploratory mode exists:
`--review-policy restrict --review-max-change 0.10`
This is not an industry-standard threshold and should not replace human approval.

Real ad-account writes are always disabled by this package.

Outputs:
- guarded_campaign_allocations.csv
- guarded_strategy_comparison.csv
- guarded_budget_comparison.csv
- guarded_estimated_evaluation.csv
- guarded_reoptimization_metadata.json
