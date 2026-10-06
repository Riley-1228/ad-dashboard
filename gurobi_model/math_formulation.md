# Mathematical Formulation: Digital Advertising Budget Optimization
## Naver Campaign-Level PWL Revenue Maximization Model

---

## 1. Sets and Indices

| Symbol | Description |
|--------|-------------|
| $\mathcal{I}$ | Set of campaigns, indexed by $i \in \{1, \ldots, N\}$, where $N = 12$ |
| $\mathcal{K}_i$ | Set of PWL breakpoint indices for campaign $i$, indexed by $k \in \{1, \ldots, K_i\}$ |
| $\mathcal{D}$ | Set of historical observation dates, indexed by $d \in \{1, \ldots, D\}$ |

The model operates at the **daily budget allocation** level. The historical dataset covers $D = 365$ days and $N = 12$ campaigns, yielding $N \times D = 4{,}380$ observations.

---

## 2. Parameters

### 2.1 Budget Parameters

| Symbol | Description | Unit |
|--------|-------------|------|
| $B$ | Total daily advertising budget available | KRW |
| $L_i$ | Minimum allowable daily budget for campaign $i$ | KRW |
| $U_i$ | Maximum allowable daily budget for campaign $i$ | KRW |
| $x_i^0$ | Current (baseline) daily budget for campaign $i$ | KRW |
| $\Delta_i^{\max}$ | Maximum allowable absolute change from current budget (optional) | KRW |
| $\delta_i^{\max}$ | Maximum allowable percentage change from current budget (optional) | fraction |

The ground-truth bounds used in the synthetic dataset (serving as default values for $L_i$ and $U_i$) are:

| Campaign | $x_i^0$ (KRW) | $L_i$ (KRW) | $U_i$ (KRW) |
|----------|----------------|--------------|--------------|
| C01 | 500,000 | 250,000 | 900,000 |
| C02 | 350,000 | 150,000 | 700,000 |
| C03 | 650,000 | 300,000 | 1,400,000 |
| C04 | 550,000 | 250,000 | 1,300,000 |
| C05 | 800,000 | 400,000 | 1,600,000 |
| C06 | 450,000 | 200,000 | 1,100,000 |
| C07 | 300,000 | 150,000 | 600,000 |
| C08 | 400,000 | 150,000 | 900,000 |
| C09 | 700,000 | 300,000 | 1,800,000 |
| C10 | 500,000 | 200,000 | 1,300,000 |
| C11 | 600,000 | 250,000 | 1,500,000 |
| C12 | 300,000 | 100,000 | 500,000 |

**Note**: In deployment, $L_i$ and $U_i$ are business-defined constraints supplied by the planner. They are independent of the statistical estimation stage.

### 2.2 PWL Representation Parameters

These parameters are the **output of the statistical estimation stage** and the **input to the optimization stage**. They define the estimated revenue response function for each campaign.

| Symbol | Description |
|--------|-------------|
| $K_i$ | Number of breakpoints for campaign $i$ (typically 10 to 50) |
| $b_{ik}$ | The $k$-th budget breakpoint for campaign $i$, where $b_{i1} = L_i$ and $b_{i K_i} = U_i$ |
| $r_{ik}$ | Estimated expected daily revenue at breakpoint $b_{ik}$ for campaign $i$ |

The breakpoints satisfy:

$$b_{i1} < b_{i2} < \cdots < b_{i K_i}, \quad b_{i1} = L_i, \quad b_{i K_i} = U_i$$

The estimated revenue values satisfy the concavity condition (derived from a concave response function):

$$\frac{r_{i,k+1} - r_{ik}}{b_{i,k+1} - b_{ik}} \geq \frac{r_{i,k+2} - r_{i,k+1}}{b_{i,k+2} - b_{i,k+1}}, \quad \forall i \in \mathcal{I}, \; k \in \{1, \ldots, K_i - 2\}$$

This ensures that successive PWL slopes are non-increasing, which is the formal definition of a concave piecewise-linear function.

### 2.3 Historical KPI Parameters (Derived from Data)

These are campaign-level aggregates computed from historical observations for use in KPI constraints and baseline comparisons.

| Symbol | Description |
|--------|-------------|
| $\overline{\text{ROAS}}_i$ | Historical mean ROAS for campaign $i$ (KRW revenue per KRW spend $\times 100$) |
| $\overline{\text{CPA}}_i$ | Historical mean CPA for campaign $i$ (KRW spend per conversion) |
| $\overline{\text{CVR}}_i$ | Historical mean conversion rate for campaign $i$ (conversions per click, fraction) |
| $\hat{q}_i(x_i)$ | Estimated expected daily conversions for campaign $i$ at budget $x_i$ |

Conversions are estimated from revenue as:

$$\hat{q}_i(x_i) = \frac{\hat{R}_i(x_i)}{\overline{\text{AOR}}_i}$$

where $\overline{\text{AOR}}_i$ is the historical average order revenue (revenue per conversion) for campaign $i$.

### 2.4 Risk / Volatility Parameters (Optional Extension)

| Symbol | Description |
|--------|-------------|
| $\sigma_i$ | Estimated revenue volatility (standard deviation of daily revenue) for campaign $i$ |
| $\rho$ | Risk-aversion coefficient (scalar, $\rho \geq 0$); $\rho = 0$ means risk-neutral |
| $\eta_i$ | Volatility weight: $\eta_i = \sigma_i / \hat{R}_i(x_i^0)$ (coefficient of variation at baseline) |

### 2.5 Portfolio-Level Constraint Parameters (Optional Extensions)

| Symbol | Description |
|--------|-------------|
| $\text{ROAS}^{\min}$ | Minimum required portfolio-level ROAS |
| $\text{CPA}^{\max}$ | Maximum allowable portfolio-level CPA |
| $M_i$ | Binary flag: $M_i = 1$ if campaign $i$ is mandatory (must receive at least $L_i$) |

---

## 3. Decision Variables

### 3.1 Core Decision Variable

$$x_i \in [L_i, U_i] \subset \mathbb{R}_{\geq 0}, \quad \forall i \in \mathcal{I}$$

$x_i$ is the daily budget allocated to campaign $i$ (continuous, KRW).

### 3.2 PWL Interpolation Variables (Auxiliary)

When the PWL function is encoded as a general constraint rather than a native PWL objective, the following auxiliary variables are introduced:

$$\lambda_{ik} \geq 0, \quad \forall i \in \mathcal{I}, \; k \in \{1, \ldots, K_i\}$$

$\lambda_{ik}$ is the convex combination weight on breakpoint $k$ for campaign $i$.

$$y_i \in \mathbb{R}, \quad \forall i \in \mathcal{I}$$

$y_i$ is the estimated revenue for campaign $i$ (intermediate variable linking PWL to objective).

**Note**: When `model.setPWLObj()` is used in gurobipy (the recommended Gurobi API path), the $\lambda_{ik}$ and $y_i$ variables are managed internally by Gurobi. The modeler only supplies the breakpoint arrays $(b_{ik}, r_{ik})$.

### 3.3 Auxiliary Variables for Optional Extensions

| Variable | Description | Domain |
|----------|-------------|--------|
| $d_i^+$ | Positive budget change (increase) from current allocation | $\mathbb{R}_{\geq 0}$ |
| $d_i^-$ | Negative budget change (decrease) from current allocation | $\mathbb{R}_{\geq 0}$ |
| $p$ | Portfolio-level risk penalty term | $\mathbb{R}_{\geq 0}$ |

---

## 4. Statistical Estimation Stage: Response Curve Fitting

This stage is entirely separate from the Gurobi optimization. It transforms raw historical observations into the breakpoint parameters $(b_{ik}, r_{ik})$.

### 4.1 True Response Model (Synthetic Data Generation)

The synthetic revenue observations were generated from:

$$R_i^{(d)} = \alpha_i \left(1 - e^{-\beta_i x_i^{(d)}}\right) \cdot S^{(d)} + \epsilon_i^{(d)}$$

where $S^{(d)}$ is a seasonality multiplier and $\epsilon_i^{(d)} \sim \mathcal{N}(0, \sigma_i^2)$ is noise.

### 4.2 Estimation Approach: Nonlinear Least Squares with Regularization

For each campaign $i$, fit:

$$\hat{\alpha}_i, \hat{\beta}_i = \arg\min_{\alpha_i > 0,\; \beta_i > 0} \sum_{d=1}^{D} \left[ R_i^{(d)} - \alpha_i \left(1 - e^{-\beta_i x_i^{(d)}}\right) \right]^2 + \lambda_{\alpha} \left(\frac{\alpha_i}{\alpha_i^{\text{prior}}} - 1\right)^2 + \lambda_{\beta} \left(\frac{\beta_i}{\beta_i^{\text{prior}}} - 1\right)^2$$

The regularization terms prevent unbounded extrapolation when the historical spend range is narrow relative to the saturation region. Prior values $\alpha_i^{\text{prior}}$ and $\beta_i^{\text{prior}}$ can be initialized from the historical mean revenue and a rough saturation estimate.

**Alternative: Log-Linear Approximation**

For campaigns with very poor identification (coefficient of variation of spend < 0.15), use a log-linearization:

$$\ln R_i^{(d)} \approx \ln \alpha_i + \ln\left(1 - e^{-\beta_i x_i^{(d)}}\right)$$

or apply a Taylor expansion around the observed mean spend $\bar{x}_i$:

$$R_i(x_i) \approx \hat{R}_i(\bar{x}_i) + \hat{m}_i (x_i - \bar{x}_i) - \hat{c}_i (x_i - \bar{x}_i)^2$$

where $\hat{m}_i > 0$ and $\hat{c}_i > 0$ are estimated first and second-order coefficients.

### 4.3 Breakpoint Generation

Given estimated parameters $(\hat{\alpha}_i, \hat{\beta}_i)$, generate $K_i$ evenly spaced breakpoints over the feasible budget range:

$$b_{ik} = L_i + \frac{(k-1)}{K_i - 1} (U_i - L_i), \quad k = 1, \ldots, K_i$$

The corresponding estimated revenue at each breakpoint is:

$$r_{ik} = \hat{\alpha}_i \left(1 - e^{-\hat{\beta}_i \cdot b_{ik}}\right), \quad k = 1, \ldots, K_i$$

**Concavity enforcement**: Since the saturation function $\alpha(1 - e^{-\beta x})$ is strictly concave for $\alpha, \beta > 0$, the generated $(b_{ik}, r_{ik})$ pairs are automatically concave. If estimation noise causes a non-concave segment (slope increase), apply isotonic regression on the slopes to enforce the non-increasing slope condition before passing to Gurobi.

**Extrapolation beyond observed spend**: When $U_i$ exceeds the historical maximum spend by more than 50%, apply a conservative saturation floor by capping $r_{iK_i}$ at $\hat{\alpha}_i \cdot (1 - e^{-\hat{\beta}_i \cdot U_i^{\text{obs}} \cdot 1.5})$ to limit overconfident extrapolation.

**Recommended number of breakpoints**: $K_i = 20$ provides a good approximation of the smooth curve with negligible solver overhead for $N \leq 50$ campaigns. Increase to $K_i = 50$ only if precision requirements demand it.

---

## 5. Core Optimization Model

### 5.1 Objective Function: Maximize Expected Total Revenue

$$\max_{x} \quad Z = \sum_{i \in \mathcal{I}} \hat{R}_i(x_i)$$

where $\hat{R}_i(x_i)$ is the PWL approximation of the estimated revenue response function, evaluated at the allocated budget $x_i$:

$$\hat{R}_i(x_i) = r_{ik} + \frac{r_{i,k+1} - r_{ik}}{b_{i,k+1} - b_{ik}} (x_i - b_{ik}), \quad \text{for } x_i \in [b_{ik}, b_{i,k+1}]$$

In Gurobi, this is represented directly via `model.setPWLObj(x_i, b_i, r_i)` where `b_i` and `r_i` are the breakpoint and revenue arrays for campaign $i$.

### 5.2 Constraint C1: Total Budget Conservation

$$\sum_{i \in \mathcal{I}} x_i = B$$

The total allocated budget must exactly equal the available budget. This can be relaxed to $\leq B$ (underspend allowed) depending on business policy.

### 5.3 Constraint C2: Campaign Budget Bounds

$$L_i \leq x_i \leq U_i, \quad \forall i \in \mathcal{I}$$

Each campaign must receive at least its minimum and at most its maximum daily budget.

### 5.4 PWL Representation Constraint (Explicit Formulation via SOS2)

When using SOS2-based explicit PWL encoding (equivalent to `setPWLObj`), the following constraints are added:

$$x_i = \sum_{k=1}^{K_i} \lambda_{ik} \cdot b_{ik}, \quad \forall i \in \mathcal{I}$$

$$y_i = \sum_{k=1}^{K_i} \lambda_{ik} \cdot r_{ik}, \quad \forall i \in \mathcal{I}$$

$$\sum_{k=1}^{K_i} \lambda_{ik} = 1, \quad \forall i \in \mathcal{I}$$

$$\lambda_{ik} \geq 0, \quad \forall i \in \mathcal{I}, \; k \in \{1, \ldots, K_i\}$$

$$\boldsymbol{\lambda}_i \in \text{SOS2}, \quad \forall i \in \mathcal{I}$$

The SOS2 condition means that at most two consecutive $\lambda_{ik}$ are nonzero, enforcing that $x_i$ lies in exactly one segment $[b_{ik}, b_{i,k+1}]$.

**Important**: When the PWL function is concave and is being maximized, the SOS2 constraint is automatically satisfied by the LP relaxation (the simplex algorithm naturally finds a basic feasible solution on an extreme point of the convex hull). Therefore, `setPWLObj` with a concave function is solved as a pure LP by Gurobi's specialized piecewise-linear simplex algorithm, without any integer branching.

---

## 6. Optional Extensions

### 6.1 Extension E1: Maximum Budget Change Constraint

To limit disruption to campaign operations, restrict the deviation from the current budget:

$$x_i - x_i^0 \leq \delta_i^{\max} \cdot x_i^0, \quad \forall i \in \mathcal{I}$$

$$x_i^0 - x_i \leq \delta_i^{\max} \cdot x_i^0, \quad \forall i \in \mathcal{I}$$

Equivalently:

$$(1 - \delta_i^{\max}) \cdot x_i^0 \leq x_i \leq (1 + \delta_i^{\max}) \cdot x_i^0, \quad \forall i \in \mathcal{I}$$

This replaces or tightens the bounds $[L_i, U_i]$ when $\delta_i^{\max}$ is binding.

To also track the absolute budget shift, introduce auxiliary variables:

$$d_i^+ - d_i^- = x_i - x_i^0, \quad \forall i \in \mathcal{I}$$

$$d_i^+, d_i^- \geq 0, \quad \forall i \in \mathcal{I}$$

### 6.2 Extension E2: Mandatory Campaign Spending

If a campaign $i$ is designated mandatory (e.g., brand campaigns that must always run at minimum spend), the lower bound is enforced:

$$x_i \geq L_i^{\text{mandatory}}, \quad \forall i : M_i = 1$$

This is already covered by constraint C2 when $L_i = L_i^{\text{mandatory}}$.

### 6.3 Extension E3: Minimum Portfolio ROAS Constraint

Define the estimated portfolio-level ROAS as:

$$\text{ROAS}^{\text{portfolio}} = \frac{\sum_{i \in \mathcal{I}} \hat{R}_i(x_i)}{\sum_{i \in \mathcal{I}} x_i} \times 100$$

The minimum ROAS constraint is:

$$\sum_{i \in \mathcal{I}} \hat{R}_i(x_i) \geq \frac{\text{ROAS}^{\min}}{100} \cdot \sum_{i \in \mathcal{I}} x_i = \frac{\text{ROAS}^{\min}}{100} \cdot B$$

Since $\sum_i x_i = B$ (constraint C1), this simplifies to:

$$\sum_{i \in \mathcal{I}} \hat{R}_i(x_i) \geq \frac{\text{ROAS}^{\min}}{100} \cdot B$$

This is a linear constraint in $y_i$ (the PWL revenue variables).

### 6.4 Extension E4: Maximum Portfolio CPA Constraint

Define the estimated number of conversions for campaign $i$:

$$\hat{q}_i(x_i) = \frac{\hat{R}_i(x_i)}{\overline{\text{AOR}}_i}$$

where $\overline{\text{AOR}}_i$ is the average order revenue for campaign $i$.

The portfolio CPA constraint is:

$$\frac{\sum_{i \in \mathcal{I}} x_i}{\sum_{i \in \mathcal{I}} \hat{q}_i(x_i)} \leq \text{CPA}^{\max}$$

This is nonlinear as written. Reformulate by multiplying both sides by $\sum_i \hat{q}_i(x_i)$:

$$\sum_{i \in \mathcal{I}} x_i \leq \text{CPA}^{\max} \cdot \sum_{i \in \mathcal{I}} \hat{q}_i(x_i)$$

$$B \leq \text{CPA}^{\max} \cdot \sum_{i \in \mathcal{I}} \frac{\hat{R}_i(x_i)}{\overline{\text{AOR}}_i}$$

Since $\hat{R}_i(x_i)$ is a linear expression in $y_i$, this is a linear constraint.

### 6.5 Extension E5: Risk-Adjusted Objective

Replace the pure revenue maximization objective with a mean-variance trade-off:

$$\max_{x} \quad Z^{\text{risk}} = \sum_{i \in \mathcal{I}} \hat{R}_i(x_i) - \rho \cdot \sum_{i \in \mathcal{I}} \sigma_i^2 \cdot x_i^2$$

where $\rho > 0$ is the risk-aversion coefficient and $\sigma_i^2$ is the variance of daily revenue for campaign $i$ (estimated from residuals of the response curve fit).

**Model class**: This extension promotes the model from LP to QP (quadratic objective with linear constraints), which Gurobi solves efficiently with the barrier algorithm.

Alternatively, use a simpler linear risk penalty based on coefficient of variation:

$$\max_{x} \quad Z^{\text{risk-linear}} = \sum_{i \in \mathcal{I}} \left(1 - \rho \cdot \hat{\eta}_i\right) \hat{R}_i(x_i)$$

where $\hat{\eta}_i = \sigma_i / \hat{R}_i(x_i^0)$ is the estimated coefficient of variation. This keeps the model as LP/concave-PWL.

### 6.6 Extension E6: Budget Stability Penalty

Add a penalty for large budget deviations from the current allocation to encourage stability:

$$\max_{x} \quad Z^{\text{stable}} = \sum_{i \in \mathcal{I}} \hat{R}_i(x_i) - \mu \cdot \sum_{i \in \mathcal{I}} \left( d_i^+ + d_i^- \right)$$

where $\mu > 0$ is the stability penalty coefficient (KRW revenue penalized per KRW of budget change) and $d_i^+, d_i^-$ are as defined in E1.

**Model class**: This remains LP when $d_i^+$ and $d_i^-$ are linearized as in E1.

---

## 7. Marginal Economics

### 7.1 Marginal Revenue

The marginal revenue of campaign $i$ at budget $x_i$ is the slope of the PWL segment containing $x_i$:

$$\text{MR}_i(x_i) = \frac{d\hat{R}_i}{dx_i}\bigg|_{x_i = x_i^*} = \frac{r_{i,k+1} - r_{ik}}{b_{i,k+1} - b_{ik}}, \quad \text{for } x_i^* \in [b_{ik}, b_{i,k+1}]$$

### 7.2 Marginal ROAS

The marginal ROAS at the optimal allocation $x_i^*$ measures the incremental revenue generated by the next unit of budget (KRW) spent on campaign $i$:

$$\text{mROAS}_i(x_i^*) = \text{MR}_i(x_i^*) \times 100$$

At the portfolio optimum, the marginal ROAS should be approximately equalized across all campaigns that are not at their bounds (Karush-Kuhn-Tucker optimality condition):

$$\text{MR}_i(x_i^*) = \mu^*, \quad \forall i : L_i < x_i^* < U_i$$

where $\mu^*$ is the shadow price (dual variable) of the total budget constraint C1. This is a key diagnostic: campaigns at their upper bound have $\text{MR}_i > \mu^*$ (budget-constrained, starved) and campaigns at their lower bound have $\text{MR}_i < \mu^*$ (over-allocated).

### 7.3 Interpretation at Optimality

| Condition | Interpretation |
|-----------|---------------|
| $\text{mROAS}_i(x_i^*) > \mu^* \times 100$ and $x_i^* = U_i$ | Campaign is return-constrained; increase $U_i$ to unlock revenue |
| $\text{mROAS}_i(x_i^*) < \mu^* \times 100$ and $x_i^* = L_i$ | Campaign is over-funded relative to marginal return; reduce $L_i$ to free budget |
| $\text{mROAS}_i(x_i^*) = \mu^* \times 100$ and $L_i < x_i^* < U_i$ | Campaign is at the efficient allocation frontier |

---

## 8. Baseline Strategy Formulations

All four strategies are evaluated on the same estimated PWL response functions $\{\hat{R}_i(\cdot)\}$.

### Strategy S1: Current Allocation

$$x_i^{\text{current}} = x_i^0, \quad \forall i \in \mathcal{I}$$

$$Z^{\text{current}} = \sum_{i \in \mathcal{I}} \hat{R}_i(x_i^0)$$

This represents the status quo. Since $x_i^0$ is a fixed parameter (not a decision variable), no optimization is needed.

### Strategy S2: Equal Allocation

$$x_i^{\text{equal}} = \frac{B}{N}, \quad \forall i \in \mathcal{I}$$

subject to $L_i \leq \frac{B}{N} \leq U_i$ for all $i$ (if violated, clip to bounds and redistribute).

$$Z^{\text{equal}} = \sum_{i \in \mathcal{I}} \hat{R}_i\!\left(\frac{B}{N}\right)$$

### Strategy S3: Historical ROAS Proportional Allocation

$$x_i^{\text{roas}} = B \cdot \frac{\overline{\text{ROAS}}_i}{\displaystyle\sum_{j \in \mathcal{I}} \overline{\text{ROAS}}_j}, \quad \forall i \in \mathcal{I}$$

subject to clipping to $[L_i, U_i]$ and redistribution of residual budget:

$$x_i^{\text{roas}} = \text{clip}\left(B \cdot \frac{\overline{\text{ROAS}}_i}{\sum_j \overline{\text{ROAS}}_j}, \; L_i, \; U_i\right)$$

followed by normalization so that $\sum_i x_i^{\text{roas}} = B$.

$$Z^{\text{roas}} = \sum_{i \in \mathcal{I}} \hat{R}_i\!\left(x_i^{\text{roas}}\right)$$

**Important limitation**: ROAS-proportional allocation commits more budget to campaigns with high average ROAS, ignoring diminishing returns. A campaign with high ROAS at its current spend level may have low marginal ROAS at a higher spend level. The Gurobi model explicitly corrects for this.

### Strategy S4: Gurobi PWL Optimized Allocation

$$x^* = \arg\max_{x \in \mathcal{F}} \sum_{i \in \mathcal{I}} \hat{R}_i(x_i)$$

where $\mathcal{F}$ is the feasible region defined by constraints C1 and C2.

$$Z^* = \sum_{i \in \mathcal{I}} \hat{R}_i(x_i^*)$$

### Comparative Revenue Lift

$$\text{Revenue Lift vs Current} = \frac{Z^* - Z^{\text{current}}}{Z^{\text{current}}} \times 100\%$$

$$\text{Revenue Lift vs ROAS-Proportional} = \frac{Z^* - Z^{\text{roas}}}{Z^{\text{roas}}} \times 100\%$$

---

## 9. Model Class Classification

| Model Configuration | Model Class | Solver Algorithm |
|--------------------|-------------|-----------------|
| Core model (PWL concave objective + linear constraints) | LP (concave PWL simplex) | PWL Simplex |
| Core + E1 (budget change bounds, linear) | LP | Simplex / Barrier |
| Core + E3 (min portfolio ROAS, linear) | LP | Simplex / Barrier |
| Core + E4 (max portfolio CPA, linear) | LP | Simplex / Barrier |
| Core + E5a (quadratic risk penalty) | QP (convex) | Barrier |
| Core + E5b (linear risk weight) | LP (concave PWL) | PWL Simplex |
| Core + E6 (budget stability penalty) | LP | Simplex / Barrier |
| Core + E1 + E5a + any linear extensions | QP (convex) | Barrier |

**Key result**: The core model with only concave PWL objectives and linear constraints is solved as a pure LP by Gurobi. No binary variables are needed, and the SOS2 constraint is automatically satisfied. This means the model scales efficiently to hundreds of campaigns.

---

## 10. Estimation-to-Optimization Interface

### 10.1 Pipeline Overview

The full pipeline from raw data to Gurobi input follows three stages:

```
Stage 1 (Statistical):
  Daily observations {(x_i^(d), R_i^(d))} 
      --> Nonlinear least squares (scipy.optimize.curve_fit)
      --> Estimated parameters (alpha_hat_i, beta_hat_i)
      --> Goodness-of-fit metrics (R^2, RMSE, confidence intervals)

Stage 2 (PWL Generation):
  (alpha_hat_i, beta_hat_i, L_i, U_i, K_i)
      --> Breakpoint grid: b_{ik} = L_i + (k-1)/(K_i-1) * (U_i - L_i)
      --> Revenue values:  r_{ik} = alpha_hat_i * (1 - exp(-beta_hat_i * b_{ik}))
      --> Concavity check: enforce non-increasing slopes via isotonic regression
      --> Output: DataFrame of (campaign_id, k, b_{ik}, r_{ik})

Stage 3 (Optimization):
  (b_{ik}, r_{ik}, B, L_i, U_i, optional constraints)
      --> Gurobi model with setPWLObj(x_i, b_i, r_i)
      --> Solve --> x_i*, Z*, dual variables (shadow prices)
      --> Post-process: compute marginal ROAS, KPIs, comparison table
```

### 10.2 Handling Narrow Historical Spend Variation

When the historical spend range for campaign $i$ is narrow (coefficient of variation < 0.15 or max/min ratio < 1.5), the saturation parameter $\beta_i$ is poorly identified. The following strategies are applied:

**Strategy A: Constrained Estimation**
Bound $\beta_i$ from below using a physical constraint: the spend at which 90% saturation is reached cannot be less than the historical minimum spend $\min_d x_i^{(d)}$:

$$\beta_i \leq \frac{-\ln(0.10)}{\min_d x_i^{(d)}} = \frac{2.303}{\min_d x_i^{(d)}}$$

Bound $\alpha_i$ from below by the historical maximum observed revenue:

$$\alpha_i \geq \max_d R_i^{(d)}$$

**Strategy B: Regularized Estimation with Industry Priors**
Use a soft regularization penalty (as in Section 4.2) with prior $\beta_i^{\text{prior}}$ derived from the industry benchmark: typical digital advertising saturation occurs between 2x and 5x the minimum budget.

**Strategy C: Conservative Breakpoint Extension**
Even if estimation is uncertain, extend breakpoints to $U_i$ using the fitted curve but apply a conservative extrapolation factor:

$$r_{ik}^{\text{conservative}} = r_{ik} \cdot \left(1 - \gamma \cdot \max\left(0, \frac{b_{ik} - \max_d x_i^{(d)}}{\max_d x_i^{(d)}}\right)\right)$$

where $\gamma \in [0.1, 0.3]$ is a conservatism discount applied to extrapolated revenue.

### 10.3 Validation Against Ground Truth

After the model is built using only historical observations:

1. Compare $\hat{\alpha}_i$ vs $\alpha_i^{\text{true}}$ and $\hat{\beta}_i$ vs $\beta_i^{\text{true}}$ for each campaign.
2. Compute relative error: $|\hat{\alpha}_i - \alpha_i^{\text{true}}| / \alpha_i^{\text{true}}$ and same for $\beta_i$.
3. Evaluate the ground-truth revenue at the Gurobi-optimal allocation: $Z^{\text{true}} = \sum_i \alpha_i^{\text{true}} (1 - e^{-\beta_i^{\text{true}} x_i^*})$.
4. Compare $Z^{\text{estimated}}$ vs $Z^{\text{true}}$ as the estimation bias.
5. Repeat for all four baseline strategies.

---

## 11. Complete Core Model Formulation

$$\boxed{
\begin{aligned}
&\max_{x, y, \lambda} && \sum_{i \in \mathcal{I}} y_i \\[6pt]
&\text{subject to} \\[4pt]
&\textbf{C1:} && \sum_{i \in \mathcal{I}} x_i = B \\[4pt]
&\textbf{C2:} && L_i \leq x_i \leq U_i, && \forall i \in \mathcal{I} \\[4pt]
&\textbf{C3:} && x_i = \sum_{k=1}^{K_i} \lambda_{ik} \cdot b_{ik}, && \forall i \in \mathcal{I} \\[4pt]
&\textbf{C4:} && y_i = \sum_{k=1}^{K_i} \lambda_{ik} \cdot r_{ik}, && \forall i \in \mathcal{I} \\[4pt]
&\textbf{C5:} && \sum_{k=1}^{K_i} \lambda_{ik} = 1, && \forall i \in \mathcal{I} \\[4pt]
&\textbf{C6:} && \lambda_{ik} \geq 0, && \forall i \in \mathcal{I},\; k \in \{1,\ldots,K_i\} \\[4pt]
&\textbf{C7:} && \boldsymbol{\lambda}_i \in \text{SOS2}, && \forall i \in \mathcal{I} \\[4pt]
&\text{(In Gurobi: C3--C7 are handled by } \texttt{setPWLObj}\text{)}
\end{aligned}
}$$

### Complete Extended Model Formulation

$$\begin{aligned}
&\max_{x, y, \lambda, d^+, d^-} && \sum_{i \in \mathcal{I}} (1 - \rho\hat{\eta}_i) y_i - \mu \sum_{i \in \mathcal{I}}(d_i^+ + d_i^-) \\[6pt]
&\text{subject to} \\[4pt]
&\textbf{C1:} && \sum_{i \in \mathcal{I}} x_i = B \\[4pt]
&\textbf{C2:} && L_i \leq x_i \leq U_i, && \forall i \in \mathcal{I} \\[4pt]
&\textbf{C3--C7:} && \text{PWL representation (as above)} \\[4pt]
&\textbf{E1:} && (1-\delta_i^{\max}) x_i^0 \leq x_i \leq (1+\delta_i^{\max}) x_i^0, && \forall i \in \mathcal{I} \\[4pt]
&\textbf{E2:} && x_i \geq L_i^{\text{mandatory}}, && \forall i : M_i = 1 \\[4pt]
&\textbf{E3:} && \sum_{i \in \mathcal{I}} y_i \geq \frac{\text{ROAS}^{\min}}{100} \cdot B \\[4pt]
&\textbf{E4:} && B \leq \text{CPA}^{\max} \cdot \sum_{i \in \mathcal{I}} \frac{y_i}{\overline{\text{AOR}}_i} \\[4pt]
&\textbf{E6:} && d_i^+ - d_i^- = x_i - x_i^0, && \forall i \in \mathcal{I} \\[4pt]
&\textbf{E6:} && d_i^+, d_i^- \geq 0, && \forall i \in \mathcal{I}
\end{aligned}$$

---

## 12. Output Specification

### 12.1 Campaign-Level Output

For each campaign $i \in \mathcal{I}$:

| Field | Formula |
|-------|---------|
| Current budget | $x_i^0$ |
| Optimized budget | $x_i^*$ |
| Budget change (KRW) | $x_i^* - x_i^0$ |
| Budget change (%) | $(x_i^* - x_i^0) / x_i^0 \times 100$ |
| Expected revenue | $\hat{R}_i(x_i^*)$ |
| Expected conversions | $\hat{R}_i(x_i^*) / \overline{\text{AOR}}_i$ |
| Expected ROAS | $\hat{R}_i(x_i^*) / x_i^* \times 100$ |
| Expected CPA | $x_i^* / \hat{q}_i(x_i^*)$ |
| Marginal ROAS | $\text{MR}_i(x_i^*) \times 100$ |

### 12.2 Portfolio-Level Output

| Field | Formula |
|-------|---------|
| Total budget | $B = \sum_i x_i^*$ |
| Expected total revenue | $Z^* = \sum_i \hat{R}_i(x_i^*)$ |
| Expected total conversions | $\sum_i \hat{q}_i(x_i^*)$ |
| Portfolio ROAS | $Z^* / B \times 100$ |
| Portfolio CPA | $B / \sum_i \hat{q}_i(x_i^*)$ |
| Revenue lift vs current | $(Z^* - Z^{\text{current}}) / Z^{\text{current}} \times 100\%$ |
| ROAS lift vs current | $(\text{ROAS}^* - \text{ROAS}^{\text{current}}) / \text{ROAS}^{\text{current}} \times 100\%$ |
