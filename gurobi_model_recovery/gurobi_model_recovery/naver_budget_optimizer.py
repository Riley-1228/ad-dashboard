"""
naver_budget_optimizer.py
=========================
Digital Advertising Budget Allocation Optimizer - Version 1 Recovery r1
ProgressMedia / Naver Advertising

Architecture
------------
Stage 1  DataLoader          : Load and validate historical performance data
Stage 2  ResponseEstimator   : Fit concave saturation curves per campaign
                               (scipy nonlinear least squares, normalized loss,
                               regularization, chronological 80/20 split)
Stage 3  PWLBuilder          : Convert fitted curves to PWL breakpoints with
                               shape validation (strictly increasing budgets,
                               nonneg values, nonneg nonincreasing slopes)
Stage 4  BudgetOptimizer     : Gurobi LP hypograph model — maximize total
                               expected revenue subject to budget conservation
                               and campaign bounds
Stage 5  StrategyComparator  : Evaluate Current, Equal, ROAS-proportional, and
                               Gurobi-Optimized allocations on the same PWL curves
Stage 6  GroundTruthEvaluator: Post-development comparison against synthetic
                               ground-truth response parameters (isolated)

Notes
-----
- CPA output uses the point-estimate AOR approximation and is labelled
  accordingly.  The CPA hard constraint is DISABLED in the base run.
- Risk penalty and ROAS/CPA hard constraints are DISABLED in the base run.
- The optional 30 % budget-change constraint is DISABLED by default
  (set max_budget_change_pct=0.30 to enable).
- Ground-truth parameters are loaded ONLY in Stage 6.
"""

from __future__ import annotations

import warnings
import time
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

import numpy as np
import pandas as pd
from scipy.optimize import least_squares
if TYPE_CHECKING:
    import gurobipy as gp_types
try:
    import gurobipy as gp
    from gurobipy import GRB
except ImportError:
    gp = None
    GRB = None


def require_gurobi():
    if gp is None:
        raise RuntimeError(
            "BLOCKED: gurobipy is not installed. Install requirements.txt "
            "and check your Gurobi license before running the solver."
        )


# ---------------------------------------------------------------------------
# Configuration dataclass
# ---------------------------------------------------------------------------

@dataclass
class OptimizerConfig:
    """All tunable hyper-parameters for Version 1.

    Estimation
    ----------
    lambda_alpha, lambda_beta : float
        Dimensionless regularization strengths for the normalized parameter
        penalties.  Default = 0.01 (provisional; see sensitivity_lambdas).
    n_pwl_breakpoints : int
        Number of breakpoints per campaign for the PWL approximation.
    train_fraction : float
        Fraction of chronologically ordered days used for training.

    Optimization
    ------------
    total_daily_budget : float or None
        Total daily budget (KRW).  None -> computed from data as sum of
        campaign mean historical spend.
    max_budget_change_pct : float or None
        Optional maximum fractional change from x_i^0.  None -> disabled.
    time_limit_sec : float
        Gurobi time limit per solve call.

    Sensitivity analysis
    --------------------
    sensitivity_lambdas : list[float]
        Lambda values to sweep in the regularization sensitivity analysis.
    """
    lambda_alpha: float = 0.01
    lambda_beta: float = 0.01
    n_pwl_breakpoints: int = 20
    train_fraction: float = 0.80
    total_daily_budget: Optional[float] = None
    max_budget_change_pct: Optional[float] = None   # 0.30 to enable +-30 %
    time_limit_sec: float = 60.0
    sensitivity_lambdas: list = field(
        default_factory=lambda: [0.0, 0.001, 0.01, 0.1]
    )


# ---------------------------------------------------------------------------
# Stage 1 — DataLoader
# ---------------------------------------------------------------------------

class DataLoader:
    """Load and validate naver_synthetic_performance.csv."""

    REQUIRED_COLUMNS = {
        "date", "campaign_id", "campaign_name",
        "spend", "revenue", "clicks", "conversions", "impressions",
    }

    def __init__(self, filepath: str):
        self.filepath = filepath
        self.df: Optional[pd.DataFrame] = None

    def load(self) -> pd.DataFrame:
        """Read CSV, parse dates, sort, validate."""
        df = pd.read_csv(self.filepath)
        missing = self.REQUIRED_COLUMNS - set(df.columns)
        if missing:
            raise ValueError(f"Missing columns: {missing}")
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values(["date", "campaign_id"]).reset_index(drop=True)

        # Do not use assert for external data validation: python -O removes it.
        if df.empty or df["date"].isna().any() or df["campaign_id"].isna().any():
            raise ValueError("Empty data or missing date/campaign ID")
        for col in ("spend", "revenue", "clicks", "conversions", "impressions"):
            df[col] = pd.to_numeric(df[col], errors="raise")
            if not np.isfinite(df[col]).all() or (df[col] < 0).any():
                raise ValueError(f"Non-finite or negative values in {col}")
        if df.duplicated(["date", "campaign_id"]).any():
            raise ValueError("Duplicate date/campaign rows: aggregate explicitly first")
        for col in ("advertiser_id", "account_id", "platform"):
            if col in df and (df[col].isna().any() or df[col].nunique() != 1):
                raise ValueError(f"V1 requires one non-missing {col}; filter explicitly")

        self.df = df
        return df

    def split(self, df: pd.DataFrame, train_fraction: float
              ) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Chronological 80/20 split by unique dates."""
        dates = sorted(df["date"].unique())
        if not 0 < train_fraction < 1 or len(dates) < 2:
            raise ValueError("Need at least 2 dates and 0 < train_fraction < 1")
        n_train = int(len(dates) * train_fraction)
        if not 1 <= n_train < len(dates):
            raise ValueError("Training and validation periods must both be nonempty")
        cutoff = dates[n_train - 1]
        train = df[df["date"] <= cutoff].copy()
        val = df[df["date"] > cutoff].copy()
        return train, val

    def campaign_mean_spend(self, df: pd.DataFrame) -> dict[str, float]:
        """Volume-weighted mean spend per campaign."""
        return df.groupby("campaign_id")["spend"].mean().to_dict()

    def campaign_volume_weighted_roas(self, df: pd.DataFrame) -> dict[str, float]:
        """Volume-weighted ROAS = 100 * sum(revenue) / sum(spend)."""
        g = df.groupby("campaign_id").agg(
            total_revenue=("revenue", "sum"),
            total_spend=("spend", "sum"),
        )
        return (100.0 * g["total_revenue"] / g["total_spend"].replace(0, np.nan)).to_dict()


# ---------------------------------------------------------------------------
# Stage 2 — ResponseEstimator
# ---------------------------------------------------------------------------

@dataclass
class CampaignFitResult:
    """Result of fitting a single campaign's response curve."""
    campaign_id: str
    alpha_hat: float
    beta_hat: float
    alpha_ref: float           # prior / reference alpha
    beta_ref: float            # prior / reference beta
    alpha_lb: float
    alpha_ub: float
    beta_lb: float
    beta_ub: float
    revenue_scale: float       # normalisation denominator (train mean revenue)
    spend_scale: float         # normalisation denominator (train mean spend)
    train_loss_data: float     # mean normalised squared prediction error (train)
    train_loss_reg: float      # regularisation penalty at solution
    val_rmse: float
    val_mae: float
    bounds_active: list[str]   # which bounds are active at solution
    success: bool
    message: str
    lambda_alpha: float
    lambda_beta: float


class ResponseEstimator:
    """
    Fit R_i(x) = alpha_i * (1 - exp(-beta_i * x)) per campaign using
    normalised nonlinear least squares with L2 regularisation toward
    data-derived reference parameters.

    Estimation loss (all terms dimensionless):

        loss_i =
            mean_train[ ((R_obs - alpha*(1-exp(-beta*x))) / revenue_scale)^2 ]
          + lambda_alpha * (alpha / alpha_ref - 1)^2
          + lambda_beta  * (beta  / beta_ref  - 1)^2

    where:
        revenue_scale = mean of observed revenue on training data for campaign i
        spend_scale   = mean of observed spend on training data for campaign i
        alpha_ref     = revenue_scale   (saturation level ~ observed revenue mean)
        beta_ref      = 1 / (3 * spend_scale)  (implies ~28 % saturation at mean
                        spend; purely data-derived, no ground-truth used)

    Initial parameter values:
        alpha_init = alpha_ref
        beta_init  = beta_ref

    Note: because alpha_init = alpha_ref and beta_init = beta_ref, the
    regularisation penalty equals zero at initialisation.  The lambda values
    are PROVISIONAL defaults (lambda=0.01) to stabilise extrapolation and are
    not calibrated to a specific residual-to-penalty ratio.

    Parameter bounds (all training-data derived):
        alpha in [0.5 * revenue_scale, 10 * revenue_scale]
        beta  in [1e-4 / spend_scale,  7.0 / spend_scale]
          (beta * spend_scale ranges from ~1e-4 to ~7.0, imposing
           saturation between ~0.01 % and ~99.9 % at mean spend)

    All scales and reference parameters are derived from the TRAINING period
    only.  No ground-truth parameters are used.

    Limitations
    -----------
    - Spend variation is narrow (CV 0.11-0.26), so the estimated curve is
      a poorly constrained extrapolation beyond observed spend support.
    - Spend and revenue share seasonal and promotional drivers; the fitted
      curve captures a confounded spend-revenue association, NOT a causal
      advertising response function.
    - The validation set (final 20 % of dates) is used for diagnostic
      assessment, not for regularisation selection.
    """

    def __init__(self, config: OptimizerConfig):
        self.config = config

    @staticmethod
    def _saturation_curve(x: np.ndarray, alpha: float, beta: float) -> np.ndarray:
        return alpha * (1.0 - np.exp(-beta * x))

    def _fit_campaign(
        self,
        cid: str,
        train: pd.DataFrame,
        val: pd.DataFrame,
        lambda_alpha: float,
        lambda_beta: float,
    ) -> CampaignFitResult:
        """Fit one campaign.  Returns CampaignFitResult."""
        x_tr = train["spend"].values.astype(float)
        r_tr = train["revenue"].values.astype(float)
        x_val = val["spend"].values.astype(float)
        r_val = val["revenue"].values.astype(float)

        # Scales (training only)
        revenue_scale = float(np.mean(r_tr)) if np.mean(r_tr) > 0 else 1.0
        spend_scale = float(np.mean(x_tr)) if np.mean(x_tr) > 0 else 1.0

        # Reference / prior parameters (training-data derived, no GT used)
        alpha_ref = revenue_scale
        beta_ref = 1.0 / (3.0 * spend_scale)

        # Bounds
        alpha_lb = 0.5 * revenue_scale
        alpha_ub = 10.0 * revenue_scale
        beta_lb = 1e-4 / spend_scale   # ~0.01 % saturation at mean spend
        beta_ub = 7.0  / spend_scale   # ~99.9 % saturation at mean spend

        alpha_init = np.clip(alpha_ref, alpha_lb, alpha_ub)
        beta_init = np.clip(beta_ref, beta_lb, beta_ub)

        if len(x_tr) < 2 or len(x_val) == 0:
            raise ValueError(f"{cid}: insufficient train/validation observations")
        if (lambda_alpha < 0 or lambda_beta < 0
                or not np.isfinite([lambda_alpha, lambda_beta]).all()):
            raise ValueError("Regularization strengths must be finite and nonnegative")
        if not np.isfinite(np.r_[x_tr, r_tr, x_val, r_val]).all():
            raise ValueError(f"{cid}: non-finite fit data")
        if np.mean(x_tr) <= 0 or np.mean(r_tr) <= 0:
            raise ValueError(f"{cid}: V1 needs positive mean spend/revenue; no silent curve fallback")

        # Same specified loss, now represented exactly as least-squares residuals.
        # a = alpha / revenue_scale, b = beta * spend_scale.
        # Division by sqrt(n) makes the squared residual sum a MEAN data loss.
        z = x_tr / spend_scale
        t = r_tr / revenue_scale
        n_tr = len(z)
        root_n = np.sqrt(n_tr)
        a_ref = alpha_ref / revenue_scale
        b_ref = beta_ref * spend_scale

        def residuals(theta):
            a, b = theta
            prediction = a * (-np.expm1(-b * z))
            return np.r_[
                (t - prediction) / root_n,
                np.sqrt(lambda_alpha) * (a / a_ref - 1.0),
                np.sqrt(lambda_beta) * (b / b_ref - 1.0),
            ]

        def jacobian(theta):
            a, b = theta
            e = np.exp(-b * z)
            j = np.zeros((n_tr + 2, 2))
            j[:n_tr, 0] = np.expm1(-b * z) / root_n
            j[:n_tr, 1] = -a * z * e / root_n
            j[n_tr, 0] = np.sqrt(lambda_alpha) / a_ref
            j[n_tr + 1, 1] = np.sqrt(lambda_beta) / b_ref
            return j

        success = False
        message = ""
        alpha_hat, beta_hat = alpha_init, beta_init
        try:
            fitted = least_squares(
                residuals,
                [alpha_init / revenue_scale, beta_init * spend_scale],
                jac=jacobian,
                bounds=([alpha_lb / revenue_scale, beta_lb * spend_scale],
                        [alpha_ub / revenue_scale, beta_ub * spend_scale]),
                method="trf", x_scale="jac", max_nfev=5000,
                ftol=1e-10, xtol=1e-10, gtol=1e-10,
            )
            alpha_hat = float(fitted.x[0] * revenue_scale)
            beta_hat = float(fitted.x[1] / spend_scale)
            success = bool(fitted.success and np.isfinite(fitted.x).all())
            message = str(fitted.message)
        except (ValueError, RuntimeError, FloatingPointError) as exc:
            message = str(exc)

        # Training loss components
        pred_tr = alpha_hat * (1.0 - np.exp(-beta_hat * x_tr))
        train_loss_data = float(np.mean(((r_tr - pred_tr) / revenue_scale) ** 2))
        train_loss_reg = (
            lambda_alpha * (alpha_hat / alpha_ref - 1.0) ** 2
            + lambda_beta * (beta_hat / beta_ref - 1.0) ** 2
        )

        # Validation metrics
        pred_val = alpha_hat * (1.0 - np.exp(-beta_hat * x_val))
        val_rmse = float(np.sqrt(np.mean((r_val - pred_val) ** 2)))
        val_mae = float(np.mean(np.abs(r_val - pred_val)))

        # Which bounds are active (within 0.1 % tolerance)
        bounds_active = []
        if abs(alpha_hat - alpha_lb) / (alpha_ub - alpha_lb + 1e-12) < 1e-3:
            bounds_active.append("alpha_lb")
        if abs(alpha_hat - alpha_ub) / (alpha_ub - alpha_lb + 1e-12) < 1e-3:
            bounds_active.append("alpha_ub")
        if abs(beta_hat - beta_lb) / (beta_ub - beta_lb + 1e-12) < 1e-3:
            bounds_active.append("beta_lb")
        if abs(beta_hat - beta_ub) / (beta_ub - beta_lb + 1e-12) < 1e-3:
            bounds_active.append("beta_ub")

        return CampaignFitResult(
            campaign_id=cid,
            alpha_hat=alpha_hat,
            beta_hat=beta_hat,
            alpha_ref=alpha_ref,
            beta_ref=beta_ref,
            alpha_lb=alpha_lb,
            alpha_ub=alpha_ub,
            beta_lb=beta_lb,
            beta_ub=beta_ub,
            revenue_scale=revenue_scale,
            spend_scale=spend_scale,
            train_loss_data=train_loss_data,
            train_loss_reg=train_loss_reg,
            val_rmse=val_rmse,
            val_mae=val_mae,
            bounds_active=bounds_active,
            success=success,
            message=message,
            lambda_alpha=lambda_alpha,
            lambda_beta=lambda_beta,
        )

    def fit_all(
        self,
        df_train: pd.DataFrame,
        df_val: pd.DataFrame,
        lambda_alpha: Optional[float] = None,
        lambda_beta: Optional[float] = None,
    ) -> dict[str, CampaignFitResult]:
        """Fit all campaigns and return dict keyed by campaign_id."""
        la = lambda_alpha if lambda_alpha is not None else self.config.lambda_alpha
        lb_ = lambda_beta if lambda_beta is not None else self.config.lambda_beta
        results: dict[str, CampaignFitResult] = {}
        for cid in sorted(df_train["campaign_id"].unique()):
            tr = df_train[df_train["campaign_id"] == cid].copy()
            va = df_val[df_val["campaign_id"] == cid].copy()
            results[cid] = self._fit_campaign(cid, tr, va, la, lb_)
        return results

    def sensitivity_analysis(
        self,
        df_train: pd.DataFrame,
        df_val: pd.DataFrame,
        lambdas: Optional[list] = None,
    ) -> pd.DataFrame:
        """Sweep lambda values; return summary DataFrame."""
        lambdas = self.config.sensitivity_lambdas if lambdas is None else lambdas
        rows = []
        for lam in lambdas:
            fits = self.fit_all(df_train, df_val, lambda_alpha=lam, lambda_beta=lam)
            for cid, f in fits.items():
                rows.append(
                    {
                        "lambda": lam,
                        "campaign_id": cid,
                        "success": f.success,
                        "alpha_hat": f.alpha_hat,
                        "beta_hat": f.beta_hat,
                        "train_loss_data": f.train_loss_data,
                        "train_loss_reg": f.train_loss_reg,
                        "val_rmse": f.val_rmse,
                        "val_mae": f.val_mae,
                        "bounds_active": ",".join(f.bounds_active) or "none",
                    }
                )
        return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Stage 3 — PWLBuilder
# ---------------------------------------------------------------------------

@dataclass
class PWLCurve:
    """PWL breakpoints for one campaign, validated and ready for Gurobi."""
    campaign_id: str
    breakpoints: np.ndarray   # shape (K,), budget values
    revenues: np.ndarray      # shape (K,), estimated revenue values
    slopes: np.ndarray        # shape (K-1,) segment slopes  m_{ik}
    intercepts: np.ndarray    # shape (K-1,) segment intercepts a_{ik}
    observed_support: tuple[float, float]   # (min_spend, max_spend) in training
    budget_lb: float
    budget_ub: float
    concavity_enforced: bool  # True if isotonic correction was applied
    extrapolation_discount: float  # factor applied beyond observed support


class PWLBuilder:
    """
    Convert fitted (alpha, beta) curves into validated PWL breakpoints.

    Breakpoint generation
    ---------------------
    1. Generate K evenly-spaced points over [L_i, U_i].
    2. Evaluate r_{ik} = alpha_hat * (1 - exp(-beta_hat * b_{ik})).
    3. For breakpoints OUTSIDE observed spend support:
       apply a configurable conservative revenue discount
       (default: 10 % discount beyond observed range).
    4. Validate and enforce:
       (a) strictly increasing breakpoints
       (b) nonnegative revenue values
       (c) nonneg slopes
       (d) non-increasing slopes (concavity)
       If (d) is violated, apply isotonic regression on slopes, then
       reintegrate to recover corrected revenue values.
    5. Report which breakpoints lie outside observed support.
    6. Re-check budget feasibility if bounds were tightened.

    Exactness condition
    -------------------
    The LP hypograph representation y_i <= m_{ik} * x_i + a_{ik} is EXACT
    (tight at optimum) when:
      - all slopes m_{ik} are nonneg and non-increasing (concavity),
      - y_i has a strictly positive objective coefficient (+1).
    Both conditions are enforced here and in the optimizer.
    """

    def __init__(
        self,
        budget_bounds: dict[str, tuple[float, float]],
        n_breakpoints: int = 20,
        extrapolation_discount: float = 0.10,
    ):
        """
        budget_bounds : {campaign_id: (L_i, U_i)}
        extrapolation_discount : fractional revenue reduction applied to
            breakpoints that fall outside the observed spend support.
            0.0 = no discount; 0.10 = 10 % discount (conservative default).
        """
        self.budget_bounds = budget_bounds
        self.n_breakpoints = n_breakpoints
        self.extrapolation_discount = extrapolation_discount

    def _enforce_concavity(self, revenues: np.ndarray) -> tuple[np.ndarray, bool]:
        """
        Enforce concavity by running isotonic regression on the slope sequence
        (non-increasing constraint).  Returns corrected revenues and a flag.
        """
        n = len(revenues)
        if n < 2:
            return revenues, False
        slopes = np.diff(revenues)
        # Pool adjacent violators (non-increasing isotonic regression)
        corrected = _isotonic_non_increasing(slopes)
        if np.allclose(slopes, corrected, atol=1e-8):
            return revenues, False
        # Reintegrate from first revenue value
        new_rev = np.empty(n)
        new_rev[0] = revenues[0]
        for k in range(1, n):
            new_rev[k] = new_rev[k - 1] + corrected[k - 1]
            new_rev[k] = max(new_rev[k], 0.0)
        return new_rev, True

    def build(
        self,
        fit: CampaignFitResult,
        df_train: pd.DataFrame,
    ) -> PWLCurve:
        """Build and validate the PWL curve for one campaign."""
        cid = fit.campaign_id
        if not fit.success:
            raise ValueError(f"{cid}: refusing to optimize a failed response fit: {fit.message}")
        L, U = self.budget_bounds[cid]
        K = self.n_breakpoints
        if not np.isfinite([L, U]).all() or not 0 <= L < U or K < 2:
            raise ValueError(f"{cid}: need finite 0 <= L < U and at least 2 breakpoints")
        if not 0 <= self.extrapolation_discount <= 1:
            raise ValueError("extrapolation_discount must lie in [0, 1]")

        # Observed spend support (training period only)
        tr_c = df_train[df_train["campaign_id"] == cid]["spend"]
        obs_min, obs_max = float(tr_c.min()), float(tr_c.max())

        # (1) Breakpoints
        bpts = np.linspace(L, U, K)

        # (2) Evaluate saturation curve
        alpha, beta = fit.alpha_hat, fit.beta_hat
        revs = alpha * (1.0 - np.exp(-beta * bpts))

        # (3) Apply extrapolation discount outside observed support
        disc = self.extrapolation_discount
        if disc > 0.0:
            for k, b in enumerate(bpts):
                if b < obs_min:
                    fraction = (obs_min - b) / max(obs_min - L, 1.0)
                    revs[k] *= max(0.0, 1.0 - disc * fraction)
                elif b > obs_max:
                    fraction = (b - obs_max) / max(U - obs_max, 1.0)
                    revs[k] *= max(0.0, 1.0 - disc * fraction)

        # (4a) Strictly increasing breakpoints (always true for linspace)
        assert np.all(np.diff(bpts) > 0), "Non-strictly-increasing breakpoints"

        # (4b) Nonneg revenues
        revs = np.maximum(revs, 0.0)

        # (4c) Nonneg slopes — enforce monotone non-decreasing revenue
        for k in range(1, K):
            if revs[k] < revs[k - 1]:
                revs[k] = revs[k - 1]

        # (4d) Non-increasing slopes — concavity enforcement
        revs, concavity_enforced = self._enforce_concavity(revs)

        # Full post-adjustment validation
        assert np.all(np.diff(bpts) > 0), "Breakpoints not strictly increasing after adjustment"
        assert np.all(revs >= -1e-9), "Negative revenue after adjustment"
        slopes = np.diff(revs) / np.diff(bpts)
        assert np.all(slopes >= -1e-9), "Negative slope after adjustment"
        slope_diffs = np.diff(slopes)
        assert np.all(slope_diffs <= 1e-9), "Non-concave curve after enforcement"

        # Segment intercepts: a_{ik} = r_{ik} - m_{ik} * b_{ik}
        intercepts = revs[:-1] - slopes * bpts[:-1]

        return PWLCurve(
            campaign_id=cid,
            breakpoints=bpts,
            revenues=revs,
            slopes=slopes,
            intercepts=intercepts,
            observed_support=(obs_min, obs_max),
            budget_lb=L,
            budget_ub=U,
            concavity_enforced=concavity_enforced,
            extrapolation_discount=disc,
        )

    def build_all(
        self,
        fits: dict[str, CampaignFitResult],
        df_train: pd.DataFrame,
    ) -> dict[str, PWLCurve]:
        curves: dict[str, PWLCurve] = {}
        for cid, fit in fits.items():
            curves[cid] = self.build(fit, df_train)
        return curves


def _isotonic_non_increasing(values: np.ndarray) -> np.ndarray:
    """Pool Adjacent Violators for non-increasing sequence."""
    v = values.copy().astype(float)
    n = len(v)
    # Maintain a stack of blocks; each block has a mean value and a count
    blocks = []  # list of [mean, count]
    for x in v:
        blocks.append([x, 1])
        # Merge while last two blocks violate non-increasing
        while len(blocks) > 1 and blocks[-1][0] > blocks[-2][0]:
            last = blocks.pop()
            prev = blocks.pop()
            merged_count = prev[1] + last[1]
            merged_mean = (prev[0] * prev[1] + last[0] * last[1]) / merged_count
            blocks.append([merged_mean, merged_count])
    result = np.empty(n)
    idx = 0
    for mean, count in blocks:
        result[idx: idx + count] = mean
        idx += count
    return result


# ---------------------------------------------------------------------------
# Stage 4 — BudgetOptimizer (Gurobi LP)
# ---------------------------------------------------------------------------

@dataclass
class AllocationResult:
    """Per-campaign budget and KPI results."""
    campaign_id: str
    campaign_name: str
    current_budget: float
    optimized_budget: float
    budget_change: float
    budget_change_pct: float
    expected_revenue: float
    expected_conversions: float     # approximate via AOR; labelled
    expected_roas: float
    expected_cpa: float             # approximate; may be NaN
    marginal_roas_left: float       # left slope at optimal x_i*
    marginal_roas_right: float      # right slope at optimal x_i*
    is_at_lower_bound: bool
    is_at_upper_bound: bool
    is_in_observed_support: bool


@dataclass
class PortfolioResult:
    """Portfolio-level summary."""
    strategy_name: str
    total_budget: float
    expected_total_revenue: float
    expected_total_conversions: float   # approximate
    expected_portfolio_roas: float
    expected_portfolio_cpa: float       # approximate
    revenue_lift_vs_current: Optional[float]
    roas_lift_vs_current: Optional[float]
    is_feasible: bool
    solve_time_sec: float


class BudgetOptimizer:
    """
    Gurobi LP hypograph model for revenue-maximizing budget allocation.

    Formulation (Version 1 core)
    ----------------------------
    Variables:
        x_i in [L_i, U_i]   — allocated budget for campaign i
        y_i in [0, +inf)     — hypograph variable: upper bound on R_i(x_i)

    Objective:
        maximize  sum_i  y_i

    Constraints:
        C1  sum_i x_i = B                          (budget conservation)
        C2  L_i <= x_i <= U_i                      (campaign bounds; via var lb/ub)
        C3  y_i <= m_{ik} * x_i + a_{ik}          (PWL hypograph, one per segment)
              for each campaign i and segment k
        C4  (optional) x_i >= (1-delta) * x_i^0
            (optional) x_i <= (1+delta) * x_i^0   (+-delta budget change)

    Exactness: C3 is tight at the LP optimum because:
        (a) all slopes m_{ik} are nonneg and non-increasing,
        (b) y_i has objective coefficient +1 > 0.
    This guarantees y_i* = R_i(x_i*) at every optimal solution.

    Reconsideration needed if objective coefficients on y_i become
    non-positive (e.g., risk-adjusted formulations with discount > 1).
    """

    def __init__(self, env: "gp_types.Env", config: OptimizerConfig):
        require_gurobi()
        self.env = env
        self.config = config
        self.model: Optional["gp_types.Model"] = None
        self.x_vars: dict[str, "gp_types.Var"] = {}
        self.y_vars: dict[str, "gp_types.Var"] = {}
        self.pwl_curves: dict[str, PWLCurve] = {}
        self.campaign_names: dict[str, str] = {}
        self.current_budgets: dict[str, float] = {}
        self.mean_aor: dict[str, float] = {}  # average order revenue per campaign
        self.total_budget: float = 0.0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.model is not None:
            self.model.dispose()
        return False

    def set_data(
        self,
        pwl_curves: dict[str, PWLCurve],
        current_budgets: dict[str, float],
        total_budget: float,
        campaign_names: dict[str, str],
        mean_aor: dict[str, float],
    ) -> None:
        """Load all data before building the model."""
        self.pwl_curves = pwl_curves
        self.current_budgets = current_budgets
        self.total_budget = total_budget
        self.campaign_names = campaign_names
        self.mean_aor = mean_aor

    def build_model(self) -> None:
        """Construct the LP model."""
        self.model = gp.Model("BudgetAllocationLP", env=self.env)
        self.model.Params.OutputFlag = 0
        self.model.Params.TimeLimit = self.config.time_limit_sec

        campaigns = sorted(self.pwl_curves.keys())
        effective_bounds(self.pwl_curves, self.current_budgets, self.config.max_budget_change_pct)

        # --- Decision variables ---
        # x_i: allocated budget
        self.x_vars = {
            cid: self.model.addVar(
                lb=self.pwl_curves[cid].budget_lb,
                ub=self.pwl_curves[cid].budget_ub,
                name=f"x_{cid}",
            )
            for cid in campaigns
        }
        # y_i: hypograph variable (upper bound on R_i(x_i))
        self.y_vars = {
            cid: self.model.addVar(lb=0.0, ub=GRB.INFINITY, name=f"y_{cid}")
            for cid in campaigns
        }

        # --- Objective: maximize sum_i y_i ---
        self.model.setObjective(
            gp.quicksum(self.y_vars[cid] for cid in campaigns),
            GRB.MAXIMIZE,
        )

        # --- C1: Budget conservation ---
        self.model.addConstr(
            gp.quicksum(self.x_vars[cid] for cid in campaigns) == self.total_budget,
            name="C1_budget_conservation",
        )

        # --- C3: PWL hypograph constraints ---
        # y_i <= m_{ik} * x_i + a_{ik}  for all i, k
        for cid in campaigns:
            curve = self.pwl_curves[cid]
            xi = self.x_vars[cid]
            yi = self.y_vars[cid]
            for k, (m, a) in enumerate(
                zip(curve.slopes, curve.intercepts)
            ):
                self.model.addConstr(
                    yi <= m * xi + a,
                    name=f"C3_pwl_{cid}_seg{k}",
                )

        # --- C4 (optional): +-delta budget-change constraints ---
        delta = self.config.max_budget_change_pct
        if delta is not None:
            for cid in campaigns:
                x0 = self.current_budgets[cid]
                xi = self.x_vars[cid]
                self.model.addConstr(
                    xi >= (1.0 - delta) * x0,
                    name=f"C4_min_change_{cid}",
                )
                self.model.addConstr(
                    xi <= (1.0 + delta) * x0,
                    name=f"C4_max_change_{cid}",
                )

        self.model.update()

    def solve(self) -> "gp_types.Model":
        """Optimize and return the Gurobi model."""
        if self.model is None:
            raise RuntimeError("Call build_model() before solve().")
        self.model.optimize()
        return self.model

    def _evaluate_pwl(self, cid: str, budget: float) -> float:
        """Evaluate the PWL revenue function at a given budget."""
        curve = self.pwl_curves[cid]
        bpts = curve.breakpoints
        revs = curve.revenues
        # Clip to feasible range
        budget = float(np.clip(budget, bpts[0], bpts[-1]))
        return float(np.interp(budget, bpts, revs))

    def _marginal_roas(
        self, cid: str, budget: float
    ) -> tuple[float, float]:
        """
        Return (left_mROAS, right_mROAS) at the given budget.

        At a PWL breakpoint the left and right slopes may differ.
        A numerical tolerance is used because solver output can differ
        slightly from the exact breakpoint value due to floating-point
        precision.

        Revenue-per-KRW slopes are multiplied by 100 to express mROAS (%).
        """
        curve = self.pwl_curves[cid]
        bpts = np.asarray(curve.breakpoints, dtype=float)
        slopes = np.asarray(curve.slopes, dtype=float)

        budget_cl = float(np.clip(budget, bpts[0], bpts[-1]))

        if len(bpts) < 2 or len(slopes) != len(bpts) - 1:
            raise ValueError(
                f"{cid}: invalid PWL structure for marginal ROAS."
            )

        # Tolerance scaled to the magnitude of the budget.
        atol = max(1e-6, 1e-9 * max(1.0, abs(budget_cl)))

        # Check whether the solution is numerically at a breakpoint.
        matches = np.where(
            np.isclose(
                bpts,
                budget_cl,
                rtol=1e-10,
                atol=atol,
            )
        )[0]

        if len(matches) > 0:
            k = int(matches[0])

            # Lower endpoint: only the right derivative exists.
            if k == 0:
                slope = slopes[0]
                return slope * 100.0, slope * 100.0

            # Upper endpoint: only the left derivative exists.
            if k == len(bpts) - 1:
                slope = slopes[-1]
                return slope * 100.0, slope * 100.0

            # Interior breakpoint:
            # left slope = segment k-1
            # right slope = segment k
            left_slope = slopes[k - 1]
            right_slope = slopes[k]

            return left_slope * 100.0, right_slope * 100.0

        # Not at a breakpoint: both one-sided derivatives equal
        # the slope of the active segment.
        idx = np.searchsorted(
            bpts,
            budget_cl,
            side="right",
        ) - 1

        idx = int(
            np.clip(
                idx,
                0,
                len(slopes) - 1,
            )
        )

        slope = slopes[idx]

        return slope * 100.0, slope * 100.0

    def get_campaign_results(self) -> list[AllocationResult]:
        """Extract per-campaign results after solve()."""
        status = self.model.Status
        if status not in (GRB.OPTIMAL, GRB.SUBOPTIMAL):
            return []

        results = []
        for cid in sorted(self.pwl_curves.keys()):
            xi_val = self.x_vars[cid].X
            yi_val = self.y_vars[cid].X
            x0 = self.current_budgets[cid]
            name = self.campaign_names.get(cid, cid)

            exp_rev = self._evaluate_pwl(cid, xi_val)
            aor = self.mean_aor.get(cid, np.nan)
            exp_conv = exp_rev / aor if (aor > 0 and not np.isnan(aor)) else np.nan
            exp_roas = (exp_rev / xi_val * 100.0) if xi_val > 0 else np.nan
            exp_cpa = (xi_val / exp_conv) if (not np.isnan(exp_conv) and exp_conv > 0) else np.nan

            left_mr, right_mr = self._marginal_roas(cid, xi_val)

            curve = self.pwl_curves[cid]
            obs_min, obs_max = curve.observed_support
            in_support = obs_min <= xi_val <= obs_max

            results.append(
                AllocationResult(
                    campaign_id=cid,
                    campaign_name=name,
                    current_budget=x0,
                    optimized_budget=xi_val,
                    budget_change=xi_val - x0,
                    budget_change_pct=(xi_val - x0) / x0 * 100.0 if x0 > 0 else np.nan,
                    expected_revenue=exp_rev,
                    expected_conversions=exp_conv,
                    expected_roas=exp_roas,
                    expected_cpa=exp_cpa,
                    marginal_roas_left=left_mr,
                    marginal_roas_right=right_mr,
                    is_at_lower_bound=abs(xi_val - curve.budget_lb) < 1.0,
                    is_at_upper_bound=abs(xi_val - curve.budget_ub) < 1.0,
                    is_in_observed_support=in_support,
                )
            )
        return results

    def get_portfolio_result(
        self,
        campaign_results: list[AllocationResult],
        strategy_name: str,
        solve_time: float,
        reference_revenue: Optional[float] = None,
        reference_roas: Optional[float] = None,
    ) -> PortfolioResult:
        """Aggregate campaign results into a portfolio summary."""
        total_rev = sum(r.expected_revenue for r in campaign_results)
        total_spend = sum(r.optimized_budget for r in campaign_results)

        valid_conv = [r.expected_conversions for r in campaign_results
                      if not np.isnan(r.expected_conversions)]
        total_conv = sum(valid_conv) if len(valid_conv) == len(campaign_results) and valid_conv else np.nan

        port_roas = (total_rev / total_spend * 100.0) if total_spend > 0 else np.nan
        port_cpa = (total_spend / total_conv
                    if (not np.isnan(total_conv) and total_conv > 0) else np.nan)

        rev_lift = (
            (total_rev - reference_revenue) / reference_revenue * 100.0
            if reference_revenue and reference_revenue > 0 else None
        )
        roas_lift = (
            (port_roas - reference_roas) / reference_roas * 100.0
            if reference_roas and reference_roas > 0 else None
        )

        return PortfolioResult(
            strategy_name=strategy_name,
            total_budget=total_spend,
            expected_total_revenue=total_rev,
            expected_total_conversions=total_conv,
            expected_portfolio_roas=port_roas,
            expected_portfolio_cpa=port_cpa,
            revenue_lift_vs_current=rev_lift,
            roas_lift_vs_current=roas_lift,
            is_feasible=True,
            solve_time_sec=solve_time,
        )


# ---------------------------------------------------------------------------
# Stage 5 — StrategyComparator
# ---------------------------------------------------------------------------

def _project_to_bounds(
    allocation: dict[str, float],
    budget: float,
    bounds: dict[str, tuple[float, float]],
    max_iter: int = 1000,
) -> tuple[dict[str, float], bool]:
    """
    Algorithm P: bound-preserving iterative projection.

    Projects an unconstrained allocation onto:
        sum_i x_i = budget
        L_i <= x_i <= U_i

    Returns (projected_allocation, is_feasible).

    First checks whether the total budget is compatible with the bounds:
        sum_i L_i <= budget <= sum_i U_i

    If not, returns the original allocation and is_feasible=False.
    """
    L_sum = sum(v[0] for v in bounds.values())
    U_sum = sum(v[1] for v in bounds.values())
    if budget < L_sum - 1e-3 or budget > U_sum + 1e-3:
        return allocation, False

    campaigns = sorted(allocation.keys())
    if not campaigns or set(campaigns) != set(bounds):
        raise ValueError("Allocation and bounds must have identical nonempty campaign keys")
    if not np.isfinite(budget) or any(
        not np.isfinite([allocation[c], *bounds[c]]).all()
        or not 0 <= bounds[c][0] <= bounds[c][1]
        for c in campaigns
    ):
        return allocation, False
    x = {c: float(allocation[c]) for c in campaigns}

    for _ in range(max_iter):
        # Clip to bounds
        for c in campaigns:
            x[c] = float(np.clip(x[c], bounds[c][0], bounds[c][1]))
        # Scale to match budget
        total = sum(x.values())
        if abs(total - budget) < 1e-3:
            break
        slack = budget - total
        # Distribute slack proportional to remaining capacity
        if slack > 0:
            cap = {c: bounds[c][1] - x[c] for c in campaigns}
        else:
            cap = {c: x[c] - bounds[c][0] for c in campaigns}
        total_cap = sum(cap.values())
        if total_cap < 1e-9:
            break
        for c in campaigns:
            x[c] += slack * cap[c] / total_cap
    # Final clip
    for c in campaigns:
        x[c] = float(np.clip(x[c], bounds[c][0], bounds[c][1]))
    feasible = (abs(sum(x.values()) - budget) <= 1e-3 and all(
        bounds[c][0] - 1e-6 <= x[c] <= bounds[c][1] + 1e-6 for c in campaigns
    ))
    return x, feasible


def effective_bounds(curves, current_budgets, delta=None):
    """Use the SAME campaign/change bounds for optimizer and all baselines."""
    if delta is not None and (not np.isfinite(delta) or delta < 0):
        raise ValueError("Budget-change limit must be finite and nonnegative")
    result = {}
    for cid, curve in curves.items():
        lo, hi = curve.budget_lb, curve.budget_ub
        if delta is not None:
            x0 = current_budgets[cid]
            lo, hi = max(lo, (1-delta)*x0), min(hi, (1+delta)*x0)
        if lo > hi:
            raise ValueError(f"{cid}: business and budget-change bounds conflict")
        result[cid] = (lo, hi)
    return result


class StrategyComparator:
    """
    Evaluate four allocation strategies on the same PWL revenue curves.

    S1: Current allocation  — x_i = x_i^0 (mean historical spend)
        If B != sum(x_i^0), define Budget-Matched Current Proportions:
        x_i = B * (x_i^0 / sum_j x_j^0), projected to bounds.
    S2: Equal allocation    — x_i = B / N, projected to bounds
    S3: ROAS-proportional   — x_i = B * ROAS_i / sum_j ROAS_j, projected
    S4: Gurobi optimized    — solved LP
    """

    def __init__(
        self,
        pwl_curves: dict[str, PWLCurve],
        current_budgets: dict[str, float],
        volume_weighted_roas: dict[str, float],
        budget_bounds: dict[str, tuple[float, float]],
        campaign_names: dict[str, str],
        mean_aor: dict[str, float],
    ):
        self.pwl_curves = pwl_curves
        self.current_budgets = current_budgets
        self.vw_roas = volume_weighted_roas
        self.budget_bounds = budget_bounds
        self.campaign_names = campaign_names
        self.mean_aor = mean_aor
        self.campaigns = sorted(pwl_curves.keys())

    def _eval_portfolio(
        self,
        allocation: dict[str, float],
        strategy_name: str,
        is_feasible: bool,
        solve_time: float = 0.0,
    ) -> tuple[list[AllocationResult], PortfolioResult]:
        """Evaluate any allocation on PWL curves."""
        results = []
        for cid in self.campaigns:
            xi_val = allocation[cid]
            x0 = self.current_budgets[cid]
            name = self.campaign_names.get(cid, cid)
            curve = self.pwl_curves[cid]

            exp_rev = float(np.interp(
                xi_val, curve.breakpoints, curve.revenues
            ))
            aor = self.mean_aor.get(cid, np.nan)
            exp_conv = exp_rev / aor if (aor > 0 and not np.isnan(aor)) else np.nan
            exp_roas = (exp_rev / xi_val * 100.0) if xi_val > 0 else np.nan
            exp_cpa = (xi_val / exp_conv
                       if (not np.isnan(exp_conv) and exp_conv > 0) else np.nan)

            results.append(
                AllocationResult(
                    campaign_id=cid,
                    campaign_name=name,
                    current_budget=x0,
                    optimized_budget=xi_val,
                    budget_change=xi_val - x0,
                    budget_change_pct=(xi_val - x0) / x0 * 100.0 if x0 > 0 else np.nan,
                    expected_revenue=exp_rev,
                    expected_conversions=exp_conv,
                    expected_roas=exp_roas,
                    expected_cpa=exp_cpa,
                    marginal_roas_left=np.nan,
                    marginal_roas_right=np.nan,
                    is_at_lower_bound=abs(xi_val - curve.budget_lb) < 1.0,
                    is_at_upper_bound=abs(xi_val - curve.budget_ub) < 1.0,
                    is_in_observed_support=(
                        curve.observed_support[0] <= xi_val <= curve.observed_support[1]
                    ),
                )
            )

        total_rev = sum(r.expected_revenue for r in results)
        total_spend = sum(r.optimized_budget for r in results)
        valid_conv = [r.expected_conversions for r in results
                      if not np.isnan(r.expected_conversions)]
        total_conv = sum(valid_conv) if len(valid_conv) == len(results) and valid_conv else np.nan
        port_roas = (total_rev / total_spend * 100.0) if total_spend > 0 else np.nan
        port_cpa = (total_spend / total_conv
                    if (not np.isnan(total_conv) and total_conv > 0) else np.nan)

        portfolio = PortfolioResult(
            strategy_name=strategy_name,
            total_budget=total_spend,
            expected_total_revenue=total_rev,
            expected_total_conversions=total_conv,
            expected_portfolio_roas=port_roas,
            expected_portfolio_cpa=port_cpa,
            revenue_lift_vs_current=None,
            roas_lift_vs_current=None,
            is_feasible=is_feasible,
            solve_time_sec=solve_time,
        )
        return results, portfolio

    def evaluate_current(self, total_budget: float) -> tuple[list, PortfolioResult]:
        """S1: current allocation (or budget-matched proportions if B != sum(x0))."""
        x0_sum = sum(self.current_budgets.values())
        if x0_sum <= 0:
            raise ValueError("Current proportions require positive total reference spend")
        same_budget = abs(x0_sum - total_budget) < 1e-3
        alloc = {c: total_budget * self.current_budgets[c] / x0_sum
                 for c in self.campaigns}
        projected, feasible = _project_to_bounds(alloc, total_budget, self.budget_bounds)
        changed = any(abs(projected[c] - alloc[c]) > 1e-3 for c in self.campaigns)
        label = "S1_Current" if same_budget and not changed else "S1_Current_Projected"
        return self._eval_portfolio(projected, label, feasible)

    def evaluate_equal(self, total_budget: float) -> tuple[list, PortfolioResult]:
        """S2: equal allocation, projected to bounds."""
        N = len(self.campaigns)
        alloc = {c: total_budget / N for c in self.campaigns}
        alloc, feasible = _project_to_bounds(
            alloc, total_budget, self.budget_bounds
        )
        return self._eval_portfolio(alloc, "S2_Equal", feasible)

    def evaluate_roas_proportional(
        self, total_budget: float
    ) -> tuple[list, PortfolioResult]:
        """S3: volume-weighted ROAS proportional, projected to bounds."""
        total_roas = sum(self.vw_roas[c] for c in self.campaigns)
        if not np.isfinite(total_roas) or total_roas <= 0:
            return self._eval_portfolio(
                {c: self.budget_bounds[c][0] for c in self.campaigns},
                "S3_ROAS_Proportional",
                False,
            )
        alloc = {
            c: total_budget * self.vw_roas[c] / total_roas
            for c in self.campaigns
        }
        alloc, feasible = _project_to_bounds(
            alloc, total_budget, self.budget_bounds
        )
        return self._eval_portfolio(alloc, "S3_ROAS_Proportional", feasible)

    def add_lift_vs_current(
        self,
        all_portfolios: list[PortfolioResult],
        current_portfolio: PortfolioResult,
    ) -> None:
        """Fill in revenue_lift_vs_current and roas_lift_vs_current in-place."""
        ref_rev = current_portfolio.expected_total_revenue
        ref_roas = current_portfolio.expected_portfolio_roas
        for p in all_portfolios:
            if p is current_portfolio or not p.is_feasible or not current_portfolio.is_feasible:
                continue
            p.revenue_lift_vs_current = (
                (p.expected_total_revenue - ref_rev) / ref_rev * 100.0
                if ref_rev > 0 else None
            )
            p.roas_lift_vs_current = (
                (p.expected_portfolio_roas - ref_roas) / ref_roas * 100.0
                if ref_roas and ref_roas > 0 else None
            )


# ---------------------------------------------------------------------------
# Stage 6 — GroundTruthEvaluator
# ---------------------------------------------------------------------------

class GroundTruthEvaluator:
    """
    Compare optimized allocation against ground-truth response curves.

    IMPORTANT: This class is isolated from all other stages.
    Ground-truth parameters must NOT be used in estimation, PWL building,
    optimization, or policy tuning.  Call this ONLY after the model
    is fully developed.

    Reference environment caveat
    ----------------------------
    The ground-truth parameters define a base response curve without
    the seasonal multipliers, promotion effects, or multiplicative noise
    present in the historical observations.  A seasonal-average fitted
    prediction will NOT match an unadjusted base response curve.
    This comparison therefore measures structural fit quality and
    allocation direction, not absolute revenue accuracy.
    """

    def __init__(self, gt_filepath: str):
        self.gt_filepath = gt_filepath
        self.gt: Optional[pd.DataFrame] = None

    def load(self) -> pd.DataFrame:
        """Load ground-truth parameters (isolated call)."""
        self.gt = pd.read_csv(self.gt_filepath)
        return self.gt

    def true_revenue(self, cid: str, budget: float) -> float:
        """Evaluate true saturation curve R_i(x) = alpha*(1-exp(-beta*x))."""
        if self.gt is None:
            raise RuntimeError("Call load() first.")
        row = self.gt[self.gt["campaign_id"] == cid].iloc[0]
        return float(row["alpha_revenue"] * (1.0 - np.exp(-row["beta_revenue"] * budget)))

    def compare(
        self,
        fits: dict[str, CampaignFitResult],
        pwl_curves: dict[str, PWLCurve],
        allocation: dict[str, float],
    ) -> pd.DataFrame:
        """
        For each campaign: compare fitted vs true curve at allocated budget,
        and report estimated vs true alpha/beta parameters.
        """
        if self.gt is None:
            raise RuntimeError("Call load() first.")
        rows = []
        for cid in sorted(fits.keys()):
            x_opt = allocation.get(cid, np.nan)
            fit = fits[cid]
            curve = pwl_curves[cid]
            true_rev = self.true_revenue(cid, x_opt)
            est_rev_curve = fit.alpha_hat * (1.0 - np.exp(-fit.beta_hat * x_opt))
            pwl_rev = float(np.interp(x_opt, curve.breakpoints, curve.revenues))

            row = self.gt[self.gt["campaign_id"] == cid].iloc[0]
            true_alpha = float(row["alpha_revenue"])
            true_beta = float(row["beta_revenue"])

            rows.append(
                {
                    "campaign_id": cid,
                    "x_opt_KRW": x_opt,
                    "true_revenue": true_rev,
                    "fitted_curve_revenue": est_rev_curve,
                    "pwl_revenue": pwl_rev,
                    "true_alpha": true_alpha,
                    "fitted_alpha": fit.alpha_hat,
                    "alpha_pct_error": (fit.alpha_hat - true_alpha) / true_alpha * 100,
                    "true_beta": true_beta,
                    "fitted_beta": fit.beta_hat,
                    "beta_pct_error": (fit.beta_hat - true_beta) / true_beta * 100,
                    "revenue_pct_error_at_opt": (
                        (pwl_rev - true_rev) / true_rev * 100 if true_rev > 0 else np.nan
                    ),
                }
            )
        return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Reporting helpers
# ---------------------------------------------------------------------------

def print_estimation_diagnostics(fits: dict[str, CampaignFitResult]) -> None:
    print("\n" + "=" * 80)
    print("ESTIMATION DIAGNOSTICS")
    print("=" * 80)
    print(
        f"{'CID':<5} {'alpha_hat':>14} {'beta_hat':>12} "
        f"{'train_loss_data':>16} {'train_loss_reg':>14} "
        f"{'val_rmse':>14} {'val_mae':>14} "
        f"{'success':<8} {'bounds'}"
    )
    print("-" * 120)
    for cid, f in sorted(fits.items()):
        print(
            f"{cid:<5} {f.alpha_hat:>14,.0f} {f.beta_hat:>12.4e} "
            f"{f.train_loss_data:>16.6f} {f.train_loss_reg:>14.6f} "
            f"{f.val_rmse:>14,.0f} {f.val_mae:>14,.0f} "
            f"{'YES' if f.success else 'NO':<8} {','.join(f.bounds_active) or 'none'}"
        )


def print_campaign_results(results: list[AllocationResult], strategy_name: str) -> None:
    print(f"\n{'=' * 80}")
    print(f"CAMPAIGN-LEVEL RESULTS — {strategy_name}")
    print(f"{'=' * 80}")
    header = (
        f"{'CID':<5} {'Campaign':<30} {'Curr Budget':>13} "
        f"{'Opt Budget':>13} {'Change':>11} {'Chg %':>7} "
        f"{'Exp Revenue':>14} {'ROAS%':>8} {'mROAS_L':>9} {'mROAS_R':>9} "
        f"{'In Support':<11} {'At LB':<7} {'At UB':<7}"
    )
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r.campaign_id:<5} {r.campaign_name:<30} "
            f"{r.current_budget:>13,.0f} {r.optimized_budget:>13,.0f} "
            f"{r.budget_change:>+11,.0f} {r.budget_change_pct:>+6.1f}% "
            f"{r.expected_revenue:>14,.0f} {r.expected_roas:>7.1f}% "
            f"{r.marginal_roas_left:>9.1f} {r.marginal_roas_right:>9.1f} "
            f"{'YES' if r.is_in_observed_support else 'NO':<11} "
            f"{'YES' if r.is_at_lower_bound else 'NO':<7} "
            f"{'YES' if r.is_at_upper_bound else 'NO':<7}"
        )


def print_portfolio_comparison(portfolios: list[PortfolioResult]) -> None:
    print("\n" + "=" * 90)
    print("PORTFOLIO COMPARISON — ALL STRATEGIES")
    print("=" * 90)
    header = (
        f"{'Strategy':<28} {'Budget':>14} {'Exp Revenue':>14} "
        f"{'Port ROAS%':>11} {'Rev Lift%':>10} {'ROAS Lift%':>11} "
        f"{'Feasible':<10} {'Time(s)':>8}"
    )
    print(header)
    print("-" * len(header))
    for p in portfolios:
        rev_lift = f"{p.revenue_lift_vs_current:+.2f}%" if p.revenue_lift_vs_current is not None else "  baseline"
        roas_lift = f"{p.roas_lift_vs_current:+.2f}%" if p.roas_lift_vs_current is not None else "  baseline"
        print(
            f"{p.strategy_name:<28} {p.total_budget:>14,.0f} "
            f"{p.expected_total_revenue:>14,.0f} "
            f"{p.expected_portfolio_roas:>10.1f}% "
            f"{rev_lift:>10} {roas_lift:>11} "
            f"{'YES' if p.is_feasible else 'NO':<10} {p.solve_time_sec:>8.3f}"
        )


def print_sensitivity_summary(sens_df: pd.DataFrame) -> None:
    print("\n" + "=" * 80)
    print("REGULARIZATION SENSITIVITY ANALYSIS")
    print("=" * 80)
    summary = (
        sens_df.groupby("lambda")
        .agg(
            n_success=("success", "sum"),
            n_bounds_active=("bounds_active", lambda x: (x != "none").sum()),
            mean_val_rmse=("val_rmse", "mean"),
            mean_alpha=("alpha_hat", "mean"),
            mean_beta=("beta_hat", "mean"),
        )
        .reset_index()
    )
    print(summary.to_string(index=False))


def print_ground_truth_comparison(gt_df: pd.DataFrame) -> None:
    print("\n" + "=" * 80)
    print("GROUND-TRUTH COMPARISON (POST-DEVELOPMENT — ISOLATED)")
    print("Caveat: True curves exclude seasonality/promotions; fitted curves include them.")
    print("=" * 80)
    cols = [
        "campaign_id", "x_opt_KRW",
        "true_revenue", "pwl_revenue", "revenue_pct_error_at_opt",
        "true_alpha", "fitted_alpha", "alpha_pct_error",
        "true_beta", "fitted_beta", "beta_pct_error",
    ]
    print(gt_df[cols].to_string(index=False, float_format="{:,.2f}".format))


# ---------------------------------------------------------------------------
# Main demonstration pipeline
# ---------------------------------------------------------------------------

def run_demonstration(
    performance_filepath: str,
    ground_truth_filepath: Optional[str] = None,
    config: Optional[OptimizerConfig] = None,
    budget_bounds_filepath: Optional[str] = None,
) -> dict:
    """
    Run the full Version 1 demonstration pipeline.

    Returns a dict with all key results for programmatic access.
    """
    require_gurobi()
    if config is None:
        config = OptimizerConfig()

    t0_total = time.perf_counter()

    # ------------------------------------------------------------------
    # Stage 1: Load data
    # ------------------------------------------------------------------
    print("\n[Stage 1] Loading and validating data...")
    loader = DataLoader(performance_filepath)
    df = loader.load()
    df_train, df_val = loader.split(df, config.train_fraction)
    print(f"  Full dataset : {len(df)} rows | "
          f"{df['date'].min().date()} to {df['date'].max().date()}")
    print(f"  Training     : {len(df_train)} rows | "
          f"{df_train['date'].min().date()} to {df_train['date'].max().date()}")
    print(f"  Validation   : {len(df_val)} rows | "
          f"{df_val['date'].min().date()} to {df_val['date'].max().date()}")

    # Compute campaign-level mean spend from FULL dataset (as x_i^0)
    current_budgets = loader.campaign_mean_spend(df)
    B_default = sum(current_budgets.values())
    total_budget = config.total_daily_budget if config.total_daily_budget is not None else B_default
    print(f"  B_default    : {B_default:,.2f} KRW/day")
    print(f"  total_budget : {total_budget:,.2f} KRW/day")

    # Volume-weighted ROAS (full dataset)
    vw_roas = loader.campaign_volume_weighted_roas(df)

    # Campaign metadata
    campaign_names = df.groupby("campaign_id")["campaign_name"].first().to_dict()

    # Average Order Revenue (point estimate: AOR = revenue / conversions per day)
    # Labelled as approximate; CPA output uses this approximation
    df_aor = df.copy()
    df_aor = df_aor[df_aor["conversions"] > 0]
    mean_aor = (
        df_aor.groupby("campaign_id")
        .apply(lambda g: (g["revenue"] / g["conversions"]).mean())
        .to_dict()
    )
    # For campaigns with no conversion data, AOR = NaN
    for cid in campaign_names:
        if cid not in mean_aor:
            mean_aor[cid] = np.nan

    # Budget bounds: from ground truth file (policy input only, no GT curves used)
    policy_path = budget_bounds_filepath
    if policy_path is None and ground_truth_filepath is not None:
        warnings.warn("Legacy bounds source: reading ONLY policy columns from ground-truth file. "
                      "Use budget_bounds_filepath for new runs.", UserWarning)
        policy_path = ground_truth_filepath
    gt_bounds = pd.read_csv(policy_path, usecols=[
        "campaign_id", "min_daily_budget", "max_daily_budget"
    ]) if policy_path else None
    if gt_bounds is not None:
        budget_bounds = {
            row["campaign_id"]: (
                float(row["min_daily_budget"]),
                float(row["max_daily_budget"]),
            )
            for _, row in gt_bounds.iterrows()
        }
    else:
        # Fallback: use +-50% of mean spend as bounds
        budget_bounds = {
            cid: (max(1.0, 0.5 * v), 2.0 * v)
            for cid, v in current_budgets.items()
        }

    if set(budget_bounds) != set(current_budgets):
        raise ValueError("Budget-policy campaigns do not match performance campaigns")
    if not np.isfinite(total_budget) or total_budget < 0:
        raise ValueError("total_daily_budget must be finite and nonnegative")
    for cid, (lo, hi) in budget_bounds.items():
        if not np.isfinite([lo, hi]).all() or not 0 <= lo < hi:
            raise ValueError(f"{cid}: invalid budget bounds")

    # Feasibility check
    L_sum = sum(v[0] for v in budget_bounds.values())
    U_sum = sum(v[1] for v in budget_bounds.values())
    if not (L_sum <= total_budget <= U_sum):
        raise ValueError(
            f"Budget {total_budget:,.0f} is infeasible: "
            f"sum(L_i)={L_sum:,.0f}, sum(U_i)={U_sum:,.0f}"
        )

    # ------------------------------------------------------------------
    # Stage 2: Response curve estimation (training data only)
    # ------------------------------------------------------------------
    print("\n[Stage 2] Estimating response curves...")
    estimator = ResponseEstimator(config)
    fits = estimator.fit_all(df_train, df_val)
    print_estimation_diagnostics(fits)

    # ------------------------------------------------------------------
    # Stage 2b: Regularization sensitivity analysis
    # ------------------------------------------------------------------
    print("\n[Stage 2b] Regularization sensitivity analysis...")
    sens_df = estimator.sensitivity_analysis(df_train, df_val)
    if not sens_df.empty:
        print_sensitivity_summary(sens_df)
    else:
        print("  Skipped: no sensitivity settings requested")

    # ------------------------------------------------------------------
    # Stage 3: PWL breakpoint generation
    # ------------------------------------------------------------------
    print("\n[Stage 3] Building PWL breakpoints...")
    pwl_builder = PWLBuilder(
        budget_bounds=budget_bounds,
        n_breakpoints=config.n_pwl_breakpoints,
        extrapolation_discount=0.10,
    )
    pwl_curves = pwl_builder.build_all(fits, df_train)
    comparison_bounds = effective_bounds(pwl_curves, current_budgets, config.max_budget_change_pct)
    if not sum(v[0] for v in comparison_bounds.values()) <= total_budget <= sum(v[1] for v in comparison_bounds.values()):
        raise ValueError("Total budget is infeasible after applying budget-change bounds")
    n_enforced = sum(1 for c in pwl_curves.values() if c.concavity_enforced)
    print(f"  {len(pwl_curves)} PWL curves built | "
          f"{n_enforced} required concavity enforcement")

    # ------------------------------------------------------------------
    # Stage 4: Gurobi LP optimization
    # ------------------------------------------------------------------
    print(f"\n[Stage 4] Solving Gurobi LP (budget={total_budget:,.0f} KRW)...")
    t_solve = time.perf_counter()
    gurobi_campaign_results = []
    gurobi_portfolio = None

    with gp.Env(empty=True) as env:
        env.setParam("OutputFlag", 0)
        env.setParam("TimeLimit", config.time_limit_sec)
        env.start()

        with BudgetOptimizer(env, config) as optimizer:
            optimizer.set_data(
                pwl_curves=pwl_curves,
                current_budgets=current_budgets,
                total_budget=total_budget,
                campaign_names=campaign_names,
                mean_aor=mean_aor,
            )
            optimizer.build_model()
            model = optimizer.solve()

            solve_time = time.perf_counter() - t_solve
            status = model.Status
            print(f"  Gurobi status : {status} | solve time: {solve_time:.3f}s")

            solver_metadata = {
                "solver": "Gurobi", "status_code": int(status),
                "version": list(gp.gurobi.version()),
                "num_variables": int(model.NumVars),
                "num_constraints": int(model.NumConstrs),
                "num_integer_variables": int(model.NumIntVars),
                "num_sos": int(model.NumSOS),
                "num_general_constraints": int(model.NumGenConstrs),
                "is_optimal": status == GRB.OPTIMAL,
            }
            if status == GRB.OPTIMAL:
                solver_metadata["objective_value"] = float(model.ObjVal)
                solver_metadata["max_hypograph_error"] = max(
                    abs(optimizer.y_vars[c].X - optimizer._evaluate_pwl(c, optimizer.x_vars[c].X))
                    for c in pwl_curves)
                gurobi_campaign_results = optimizer.get_campaign_results()
                gurobi_portfolio = optimizer.get_portfolio_result(
                    gurobi_campaign_results,
                    "S4_Gurobi_Optimized",
                    solve_time,
                )
                print_campaign_results(gurobi_campaign_results, "S4_Gurobi_Optimized")
            else:
                raise RuntimeError(f"No certified OPTIMAL result; Gurobi status={status}")

    # ------------------------------------------------------------------
    # Stage 5: Strategy comparison
    # ------------------------------------------------------------------
    print("\n[Stage 5] Comparing four allocation strategies...")
    comparator = StrategyComparator(
        pwl_curves=pwl_curves,
        current_budgets=current_budgets,
        volume_weighted_roas=vw_roas,
        budget_bounds=comparison_bounds,
        campaign_names=campaign_names,
        mean_aor=mean_aor,
    )

    s1_results, s1_portfolio = comparator.evaluate_current(total_budget)
    s2_results, s2_portfolio = comparator.evaluate_equal(total_budget)
    s3_results, s3_portfolio = comparator.evaluate_roas_proportional(total_budget)

    all_portfolios = [s1_portfolio, s2_portfolio, s3_portfolio]
    if gurobi_portfolio:
        all_portfolios.append(gurobi_portfolio)

    comparator.add_lift_vs_current(all_portfolios, s1_portfolio)
    print_portfolio_comparison(all_portfolios)

    # ------------------------------------------------------------------
    # Stage 6: Ground-truth evaluation (isolated, post-development)
    # ------------------------------------------------------------------
    gt_comparison = None
    if ground_truth_filepath and gurobi_campaign_results:
        print("\n[Stage 6] Ground-truth evaluation (post-development, isolated)...")
        gurobi_alloc = {
            r.campaign_id: r.optimized_budget for r in gurobi_campaign_results
        }
        gt_evaluator = GroundTruthEvaluator(ground_truth_filepath)
        gt_evaluator.load()
        gt_comparison = gt_evaluator.compare(fits, pwl_curves, gurobi_alloc)
        print_ground_truth_comparison(gt_comparison)

    total_time = time.perf_counter() - t0_total
    print(f"\n[Done] Total pipeline time: {total_time:.2f}s")

    return {
        "config": config,
        "solver_metadata": solver_metadata,
        "comparison_bounds": comparison_bounds,
        "evaluation_label": "full-dataset reference demo with training-only curve fit; not an untouched final test",
        "df": df,
        "df_train": df_train,
        "df_val": df_val,
        "current_budgets": current_budgets,
        "total_budget": total_budget,
        "budget_bounds": budget_bounds,
        "fits": fits,
        "sensitivity_df": sens_df,
        "pwl_curves": pwl_curves,
        "gurobi_campaign_results": gurobi_campaign_results,
        "gurobi_portfolio": gurobi_portfolio,
        "s1_results": s1_results,
        "s1_portfolio": s1_portfolio,
        "s2_results": s2_results,
        "s2_portfolio": s2_portfolio,
        "s3_results": s3_results,
        "s3_portfolio": s3_portfolio,
        "all_portfolios": all_portfolios,
        "gt_comparison": gt_comparison,
        "campaign_names": campaign_names,
        "mean_aor": mean_aor,
        "vw_roas": vw_roas,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    from pathlib import Path
    here = Path(__file__).resolve().parent
    run_demonstration(
        performance_filepath=str(here / "naver_synthetic_performance.csv"),
        budget_bounds_filepath=str(here / "campaign_budget_bounds.csv"),
        ground_truth_filepath=None,
        config=OptimizerConfig(sensitivity_lambdas=[]),
    )
