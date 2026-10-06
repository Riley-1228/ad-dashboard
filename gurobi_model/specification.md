# Digital Advertising Budget Allocation Optimization
## Naver Campaign-Level PWL Revenue Maximization — Version 1

---

## Overview

This system determines how a fixed daily advertising budget should be allocated across a portfolio of 12 Naver campaigns. The model accounts for diminishing marginal returns and campaign-level revenue saturation, replacing heuristic rules with a mathematically rigorous LP optimization based on estimated concave revenue response functions.

The system is structured in four strictly separated stages:

1. **Statistical estimation**: fit campaign-level revenue response curves from historical observations (no ground-truth parameters used)
2. **PWL breakpoint generation**: convert estimated curves into validated concave breakpoint arrays
3. **LP optimization**: allocate budget using the explicit LP hypograph formulation in Gurobi
4. **Ground-truth validation**: compare estimated curves and allocation results against synthetic ground truth (post-development only)

The model operates at the **daily budget allocation** level. Total budget and per-campaign bounds are configurable. The default total budget ($B = 5{,}993{,}525.79$ KRW/day) is computed from the mean historical spend in the performance dataset.

---

## Objective

Maximize total expected daily revenue across all campaigns given a fixed total advertising budget, subject to campaign minimum and maximum budget bounds. The revenue response for each campaign is modeled as a concave piecewise-linear function of spend, derived from a fitted saturation curve. The model must produce allocations whose expected revenue is at least as high as the best feasible heuristic baseline within documented numerical tolerance.

---

## Constraints

### C1: Total Budget Conservation
The sum of budgets allocated across all campaigns must equal the fixed total daily budget B.

### C2: Campaign Minimum and Maximum Budget Bounds
Each campaign must receive at least its minimum daily budget (L_i) and at most its maximum daily budget (U_i). These are business-defined bounds, independent of the statistical estimation stage.

### C3: PWL Hypograph Constraints
For each campaign and each PWL segment, the estimated revenue variable y_i is bounded above by the linear function defining that segment: y_i <= m_is * x_i + a_is. This encodes the concave PWL revenue function as a set of explicit linear constraints.

### C4: Revenue Nonnegativity
The estimated revenue variable y_i must be nonnegative for all campaigns.

### E1: Maximum Budget Change (Optional, Disabled in Base Run)
The change in allocated budget relative to the current allocation must not exceed a configurable percentage (default: 30%) for each campaign.

### E2: Mandatory Campaign Spending (Optional, Disabled in Base Run)
Certain campaigns may be required to receive at least a specified minimum spend regardless of optimization outcome.

### E3: Minimum Portfolio ROAS (Optional, Disabled in Base Run)
The total expected revenue must exceed a minimum portfolio ROAS threshold multiplied by the total budget.

### E4: Maximum Portfolio CPA (Optional, Disabled in Base Run)
The portfolio cost per acquisition must not exceed a maximum threshold. Disabled by default because the AOR point estimate introduces material uncertainty.

### E6: Budget Stability Penalty (Optional, Disabled in Base Run)
A penalty term in the objective discourages large budget deviations from the current allocation.

---

## Input

### Historical Performance Data
Daily observed performance per campaign. Used exclusively for response curve estimation. Not modified.
- Fields:
  - date (date): Observation date (2025-09-01 to 2026-08-31)
  - campaign_id (string): Campaign identifier (C01 to C12)
  - campaign_name (string): Descriptive name
  - spend (float): Daily advertising spend (KRW)
  - impressions (int): Number of ad impressions
  - clicks (float): Number of clicks
  - conversions (float): Number of conversions (may be non-integer due to attribution)
  - revenue (float): Revenue generated (KRW)
  - ctr (float): Click-through rate (%)
  - cpc (float): Cost per click (KRW)
  - cvr (float): Conversion rate (%)
  - cpa (float): Cost per acquisition (KRW); undefined (NaN) when conversions = 0
  - roas (float): Return on ad spend (%)
  - synced_at (datetime): Data sync timestamp

### Business Constraints Configuration
Per-campaign operational constraints. Provided separately from the performance data. In this demonstration, derived from naver_synthetic_ground_truth.csv (bounds columns only). Not used for fitting.
- Fields:
  - campaign_id (string): Campaign identifier
  - min_daily_budget (int): Minimum allowable daily budget L_i (KRW)
  - max_daily_budget (int): Maximum allowable daily budget U_i (KRW)

### Optimization Parameters
Scalar parameters controlling the optimization run.
- Fields:
  - total_daily_budget (float): Total budget B (KRW); default = sum of mean historical spend
  - n_breakpoints (int): Number of PWL breakpoints K_i per campaign; default = 20
  - max_budget_change_pct (float or None): Maximum fractional budget change for E1; None = disabled
  - min_portfolio_roas (float or None): Minimum portfolio ROAS for E3; None = disabled
  - enable_cpa_constraint (bool): Whether to enable E4; default = False
  - stability_penalty_mu (float): Budget stability penalty coefficient for E6; 0.0 = disabled
  - extrapolation_discount_rate (float): Conservative extrapolation discount gamma; default = 0.10
  - extrapolation_max_discount (float): Maximum extrapolation discount gamma_max; default = 0.50
  - train_fraction (float): Fraction of data used for training in chronological split; default = 0.80
  - time_limit_seconds (float): Gurobi solver time limit; default = 60

---

## Estimated Parameters (Internal Intermediate Outputs, Not Inputs)

These are computed internally by the estimation stage and passed to the optimization stage. They are never read from external files.

### Response Curve Estimates
- campaign_id (string)
- alpha_hat (float): Estimated saturation revenue level
- beta_hat (float): Estimated saturation rate
- rmse_train (float): Training RMSE
- rmse_val (float): Validation RMSE
- r2_train (float): In-sample R-squared
- residual_std (float): Standard deviation of training residuals
- obs_coverage (float): Fraction of [L_i, U_i] covered by historical spend observations
- narrow_spend_flag (bool): True if CV(spend) < 0.15

### PWL Breakpoints
- campaign_id (string)
- breakpoints (array of float): b_ik values
- revenues (array of float): r_ik values
- slopes (array of float): m_is values (length K_i - 1)
- intercepts (array of float): a_is values
- extrapolation_flags (array of bool): per-breakpoint extrapolation indicator
- shape_valid (bool): True if all 4 shape checks pass
- shape_report (dict): Details of any shape check failures and corrections applied

---

## Output

### Campaign-Level Solution Table
For each campaign:
- campaign_id (string)
- campaign_name (string)
- current_budget (float): x_i^0 = mean historical spend (KRW)
- optimized_budget (float): x_i* from Gurobi (KRW)
- budget_change (float): x_i* - x_i^0 (KRW)
- budget_change_pct (float): percentage change from current
- expected_revenue (float): y_i* = R_hat_i(x_i*) (KRW)
- expected_conversions (float): approximate, based on AOR point estimate
- expected_roas (float): y_i* / x_i* * 100 (%)
- expected_cpa (float or None): x_i* / expected_conversions; None if undefined
- marginal_roas_left (float): left PWL slope at x_i* * 100
- marginal_roas_right (float): right PWL slope at x_i* * 100; equals left if interior of segment
- obs_coverage (float): observed spend coverage fraction
- extrapolation_flag (bool): True if x_i* exceeds maximum observed spend

### Portfolio-Level Summary
- total_budget (float): B (KRW)
- expected_total_revenue (float): sum of y_i* (KRW)
- expected_total_conversions (float): approximate
- portfolio_roas (float): expected_total_revenue / B * 100 (%)
- portfolio_cpa (float or None): approximate; None if total conversions undefined
- revenue_lift_vs_current (float): (Z_S4 - Z_S1) / Z_S1 * 100 (%)
- roas_lift_vs_current (float): (ROAS_S4 - ROAS_S1) / ROAS_S1 * 100 (%)
- solver_status (string): Gurobi status string
- is_optimal (bool): True if status is OPTIMAL
- budget_constraint_shadow_price (float): dual variable of C1 = marginal revenue of one additional KRW of budget

### Strategy Comparison Table
Side-by-side comparison of S1 (Current), S2 (Equal), S3 (ROAS Proportional), S4 (Gurobi Optimized):
- strategy (string)
- total_budget (float)
- expected_total_revenue (float)
- portfolio_roas (float)
- portfolio_cpa (float or None)
- revenue_lift_vs_s1 (float)
- feasible (bool): False if bound-preserving projection cannot satisfy the budget target

### Estimation Report
Per-campaign:
- campaign_id, alpha_hat, beta_hat, rmse_train, rmse_val, r2_train, residual_std, obs_coverage, narrow_spend_flag, shape_valid, shape_report

### Validation Report (Loaded After Optimization)
- Per-campaign: alpha_hat vs alpha_true, beta_hat vs beta_true, relative errors
- Revenue at x_i*: Z_estimated vs Z_true(x*) vs Z_true_baseline(x^0)
- Strategy comparison under true response curves
- Caveat: true curves are base-season (no seasonality multiplier); comparison is framed accordingly

---

## Test Scenarios

### T1: Full-Dataset Demonstration (Baseline Optimization)
**Description**: Optimize using mean historical spend as current budgets and default total budget. Verify the model solves optimally, all constraints are satisfied, and the optimizer outperforms or matches the best heuristic baseline.

**Input Data**:
- Total budget B = sum of mean daily spend per campaign from full 365-day dataset (= 5,993,525.79 KRW)
- L_i, U_i from ground-truth bounds
- x_i^0 = mean historical spend per campaign
- No optional constraints active

**Acceptance Criteria**:
- is_optimal = True
- All x_i* in [L_i, U_i] within tolerance 1e-4
- sum(x_i*) = B within tolerance 1e-4
- Z_S4 >= Z_best_baseline - 1e-6 * |Z_S4|
- All 4 shape checks pass for all campaigns
- Strategy comparison table contains all 4 strategies

### T2: Reduced Budget Scenario
**Description**: Reduce total budget by 20%. Verify reallocation shifts spending toward high-efficiency campaigns.

**Input Data**:
- Total budget B = 0.80 * 5,993,525.79 = 4,794,820.63 KRW
- Same bounds and response curves as T1

**Acceptance Criteria**:
- is_optimal = True
- All x_i* in [L_i, U_i]
- sum(x_i*) = B within tolerance 1e-4
- C12 (Low Efficiency Legacy) receives allocation at or near L_12
- Z_S4 >= Z_S1_budget_matched - 1e-6 * |Z_S4|

### T3: Budget Change Constraint (30% Limit)
**Description**: Apply E1 with max_budget_change_pct = 0.30. Verify all campaigns are within the 30% change limit.

**Input Data**:
- Same as T1 plus max_budget_change_pct = 0.30

**Acceptance Criteria**:
- is_optimal = True
- For all i: |x_i* - x_i^0| / x_i^0 <= 0.30 + 1e-4
- Z_S4_E1 <= Z_S4 + 1e-6 * |Z_S4| (constraint tightening cannot improve the unconstrained optimum)

### T4: Strategy Comparison Completeness
**Description**: Verify all four allocation strategies produce valid, feasible outputs under the same budget and response curves.

**Input Data**: Same as T1

**Acceptance Criteria**:
- All four strategies have feasible = True
- All four strategies use the same total budget B
- S3 ROAS-proportional uses volume-weighted historical ROAS
- Budget-preserved projection satisfies bounds for all strategies
- Strategy comparison table populated with all KPIs

### T5: Infeasible Budget (sum L_i > B)
**Description**: Set total budget below the sum of minimum campaign budgets. Verify the model correctly identifies infeasibility.

**Input Data**:
- Total budget B = sum(L_i) - 1 (just below feasibility threshold)

**Acceptance Criteria**:
- is_optimal = False
- Solver status indicates infeasibility
- expected_total_revenue = None
- All baseline strategies with the same budget are also reported as infeasible

### T6: Ground-Truth Validation
**Description**: After T1 optimization is complete, load ground-truth parameters and compare estimated curves and allocation quality against true response curves.

**Input Data**: naver_synthetic_ground_truth.csv loaded after T1

**Acceptance Criteria**:
- Validation report generated without using ground truth during estimation
- Relative parameter errors (alpha, beta) computed and reported per campaign
- Z_estimated(x*) and Z_true(x*) both computed and compared
- Validation caveat about seasonal multiplier documented in report

### T7: Shape Validation and PWL Integrity
**Description**: Verify that all 4 shape checks pass for all 12 campaigns and that the PWL constraints correctly encode the estimated revenue functions.

**Input Data**: Same as T1

**Acceptance Criteria**:
- shape_valid = True for all campaigns after any corrections
- For all i and all breakpoints k: r_ik = R_hat_i(b_ik) within tolerance
- For any x_i in [L_i, U_i]: y_i* <= R_hat_i(x_i) + 1e-4 (hypograph bound)
- At optimum: y_i* >= R_hat_i(x_i*) - 1e-4 (binding at optimum)

---

## Out of Scope

- Multi-period or sequential budget planning (model operates on a single representative daily period)
- Cross-campaign interaction effects or cannibalization
- Automatic hyperparameter tuning of the statistical fitting procedure using ground-truth parameters
- Real-time budget pacing or intraday optimization
- Platform-specific constraints such as Naver auction dynamics or bid strategy interactions
- Portfolio-level attribution or multi-touch modeling
- Risk extension E5 (deferred; requires a properly specified allocation-dependent uncertainty model)
- Conversion model validation (AOR treated as a point estimate; CPA hard constraint disabled by default)
