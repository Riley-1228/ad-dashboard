# Recovery r1 model note (not a replacement for the archived source documents)

This note describes the experimentally repaired implementation. It does not
claim Gurobi has been run successfully in the review environment.

## Core daily LP

For campaigns i and segments k, let x_i be daily spend in KRW and y_i be
modeled revenue in KRW. A validated concave PWL curve is specified by
strictly increasing b_ik and nonnegative revenue r_ik, with nonnegative,
non-increasing segment slopes.

\[
 m_{ik}=\frac{r_{i,k+1}-r_{ik}}{b_{i,k+1}-b_{ik}},\qquad
 a_{ik}=r_{ik}-m_{ik}b_{ik}.
\]

\[
\begin{aligned}
\max_{x,y}\quad &\sum_i y_i\\
\text{s.t.}\quad &\sum_i x_i=B,\\
&L_i\le x_i\le U_i,\\
&0\le y_i\le m_{ik}x_i+a_{ik}\quad \forall i,k.
\end{aligned}
\]

All y_i coefficients are +1. Under this objective and the concavity
conditions, each y_i is tight at the modeled PWL value at optimum. No
SOS2/setPWLObj is used. Risk/KPI objectives that change these conditions
must be separately reviewed. Upper bounds constrain y_i; y_i itself is
not an upper bound on the response function.

Optional budget-change constraints intersect business bounds with
[(1-delta)x_i^0, (1+delta)x_i^0]. All comparison strategies use that same
intersection. Conflict or insufficient total capacity is not silently
relaxed.

## Estimation loss

The curve family and data-derived heuristic reference parameters from the
original implementation are retained. For n training observations:

\[
L_i=\frac1n\sum_d\left(\frac{r_d-\alpha(1-e^{-\beta x_d})}{s_r}\right)^2
+\lambda_\alpha(\alpha/\alpha_0-1)^2
+\lambda_\beta(\beta/\beta_0-1)^2.
\]

Numerical variables are alpha/s_r and beta*s_x. The square-sum of the
residual vector (twice SciPy least_squares.cost) equals this stated loss.
The curve estimator is a local numerical fit; it is not a guarantee of
parameter identification or causal response accuracy.

## Reference data and four baselines

The default demonstration uses the complete historical reference window
for x_i^0 (mean daily spend) and B=sum_i x_i^0, but training-only rows for
curve fitting. Baseline ROAS is 100*sum(revenue)/sum(spend).

Current, Equal and Historical ROAS allocations are reconciled to the same
budget and effective bounds by capacity-preserving redistribution. Current
allocations requiring projection are labelled S1_Current_Projected, not
silently treated as the untouched observed allocation.

Gurobi revenue is compared only with feasible baselines under the same
PWL functions. Strict improvement is not required. This comparison is of
MODELED revenue, not actual ad uplift.

## Held-over limitations

The original AOR conversion approximation and extrapolation/shape policy
are retained and labeled experimental. The original ground-truth evaluator
is available for a later explicit call, but the default runner does not
read hidden alpha/beta parameters or evaluate ground truth automatically.
The separate policy file contains only campaign IDs and min/max budgets.
