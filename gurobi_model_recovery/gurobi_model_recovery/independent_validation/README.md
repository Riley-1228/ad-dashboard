
# Independent Synthetic Validation

Purpose:
- Freeze V2 first.
- Generate new synthetic scenarios that were not used to tune V2.
- Run frozen V1/V2 under the same total budget and +/-30% change constraint.
- Evaluate both allocations against each scenario's known synthetic truth.
- Do NOT modify frozen_v2 after seeing these results.

Files:
- generate_test_scenarios.py
- run_independent_validation.py
- test_independent_validation.py

Recommended first run:
1. python -m pytest -q independent_validation/test_independent_validation.py
2. python independent_validation/generate_test_scenarios.py
3. python independent_validation/run_independent_validation.py

Default scenarios:
- normal
- narrow_spend
- high_volatility
- strong_seasonality
- fast_saturation
- mixed

Default seeds:
- 101
- 202
- 303

Total independent cases: 18

Main outputs:
- independent_validation/results/all_results.csv
- independent_validation/results/aggregate_results.csv

Interpretation:
- V2 is stronger only if it improves across many independent cases, not just one.
- pct_cases_beating_current is especially important.
- oracle_gap_pct measures distance from the known synthetic optimum; it is not Gurobi MIPGap.
- These remain synthetic experiments, not causal proof for real Naver advertising.
