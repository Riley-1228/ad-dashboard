"""AdScope experimental response estimator V2.0.0; no ground-truth access.

Model (spend x in KRW, calendar vector z centered on TRAINING dates):
  R(x,t) = A * (1-exp(-k*x/s))/(1-exp(-k)) * exp(z(t) @ theta)
  s = mean training spend; A = fitted revenue at x=s and z=0.

This is an observational, robust conditional-location model, NOT a causal
advertising response certificate. A robust fitted location is used as a
revenue proxy; unbiased conditional-mean calibration is not guaranteed.
Calendar coefficients are estimated, not taken from synthetic generator data.
No inferred 'promotion flags', outcomes, clicks, CTR, CVR or oracle parameters
are used as regressors. Unrecorded promotions remain an identification issue.

All numerical defaults are experimental assumptions, not industry standards.
V2's loss/parameterization differ from V1: lambda=0.01 is NOT equal shrinkage.
References:
https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html
https://developers.google.com/meridian/docs/advanced-modeling/control-variables
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import math
import numpy as np
import pandas as pd
from scipy.optimize import least_squares

VERSION = "response-estimator-v2.0.0"


@dataclass(frozen=True)
class V2Config:
    lambda_level: float = 0.01
    lambda_shape: float = 0.01
    lambda_calendar: float = 0.01
    shape_prior_log_scale: float = math.log(100.0)
    robust_delta: float = 0.15
    min_train_rows: int = 56
    annual_min_span_days: int = 180
    include_annual: bool = True
    include_weekday: bool = True
    kappa_min: float = 0.001
    kappa_max: float = 30.0
    start_kappas: tuple[float, ...] = (0.1, 0.5, 2.0, 8.0)
    max_nfev: int = 800
    stability_folds: int = 4

    def __post_init__(self):
        for name in ("lambda_level", "lambda_shape", "lambda_calendar"):
            value = getattr(self, name)
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"{name} must be finite and nonnegative")
        for name in ("shape_prior_log_scale", "robust_delta", "kappa_min", "kappa_max"):
            value = getattr(self, name)
            if not math.isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be finite and positive")
        if self.kappa_max <= self.kappa_min:
            raise ValueError("kappa_max must exceed kappa_min")
        if self.min_train_rows < 14 or self.max_nfev < 1:
            raise ValueError("min_train_rows >=14 and max_nfev >=1 are required")
        if self.stability_folds not in (0, 2, 3, 4, 5, 6):
            raise ValueError("stability_folds must be 0 or an integer in 2..6")
        if not self.start_kappas or any(
            not self.kappa_min < x < self.kappa_max for x in self.start_kappas
        ):
            raise ValueError("start_kappas must be strictly inside kappa bounds")


def validate_observations(df: pd.DataFrame) -> pd.DataFrame:
    """Reject invalid or ambiguous grain; do not impute absent rows as zero."""
    cols = ["date", "campaign_id", "campaign_name", "spend", "revenue"]
    missing = set(cols) - set(df.columns)
    if missing:
        raise ValueError(f"Missing observation columns: {sorted(missing)}")
    out = df.copy()
    if out.empty or out[cols].isna().any().any():
        raise ValueError("Empty observations or missing required values")
    out["date"] = pd.to_datetime(out["date"], errors="raise")
    if out.date.isna().any() or out.date.dt.tz is not None:
        raise ValueError("Dates must be nonmissing, timezone-naive daily dates")
    if (out.date != out.date.dt.normalize()).any():
        raise ValueError("Expected daily dates without time components")
    out["campaign_id"] = out.campaign_id.astype(str)
    if out.campaign_id.str.strip().eq("").any():
        raise ValueError("Empty campaign ID")
    for col in ("spend", "revenue"):
        out[col] = pd.to_numeric(out[col], errors="raise")
        if not np.isfinite(out[col]).all() or (out[col] < 0).any():
            raise ValueError(f"Invalid {col}: expected finite nonnegative values")
    if out.duplicated(["date", "campaign_id"]).any():
        raise ValueError("Duplicate date/campaign rows; aggregate explicitly first")
    for col in ("platform", "advertiser_id", "account_id"):
        if col in out and (out[col].isna().any() or out[col].nunique() != 1):
            raise ValueError(f"Filter to exactly one nonmissing {col} before fitting")
    return out.sort_values(["date", "campaign_id"]).reset_index(drop=True)


def load_observations(path: str | Path) -> pd.DataFrame:
    # Read the approved observation schema only, ignoring hidden extra fields.
    allowed = {"date", "campaign_id", "campaign_name", "spend", "revenue",
               "conversions", "clicks", "impressions", "platform", "account_id", "advertiser_id"}
    return validate_observations(pd.read_csv(path, usecols=lambda c: c in allowed))


def chronological_split(df: pd.DataFrame, train_fraction: float = 0.8):
    if not math.isfinite(train_fraction) or not 0 < train_fraction < 1:
        raise ValueError("train_fraction must be in (0,1)")
    dates = np.sort(df.date.unique())
    n = int(len(dates) * train_fraction)
    if n < 1 or n >= len(dates):
        raise ValueError("Need nonempty train and validation date sets")
    train = df.loc[df.date <= dates[n - 1]].copy()
    val = df.loc[df.date > dates[n - 1]].copy()
    if set(train.campaign_id) != set(val.campaign_id):
        raise ValueError("Each campaign must occur in both chronological partitions")
    return train, val


def calendar_matrix(dates, names: tuple[str, ...]) -> np.ndarray:
    d = pd.DatetimeIndex(pd.to_datetime(dates))
    if d.isna().any():
        raise ValueError("Missing calendar date")
    # Generic astronomical year basis; no generator phase or promotion schedule.
    elapsed = (d - pd.Timestamp("2000-01-01")).total_seconds().to_numpy() / 86400.0
    phase = 2.0 * np.pi * elapsed / 365.2425
    values = []
    for name in names:
        if name == "annual_sin":
            values.append(np.sin(phase))
        elif name == "annual_cos":
            values.append(np.cos(phase))
        elif name.startswith("weekday_"):
            values.append((d.dayofweek.to_numpy() == int(name.split("_")[1])).astype(float))
        else:
            raise ValueError(f"Unknown calendar feature: {name}")
    return np.column_stack(values) if values else np.empty((len(d), 0))


def soft_l1_residuals(e: np.ndarray, delta: float) -> np.ndarray:
    """Squared output sums to sum(delta^2 * 2*(sqrt(1+(e/delta)^2)-1))."""
    return e * np.sqrt(2.0 / (np.hypot(1.0, e / delta) + 1.0))


@dataclass
class V2Fit:
    campaign_id: str
    level_at_reference: float
    kappa: float
    spend_scale: float
    revenue_scale: float
    feature_names: tuple[str, ...]
    feature_center: list[float]
    calendar_coefficients: list[float]
    observed_support: tuple[float, float]
    train_start: str
    train_end: str
    n_train: int
    success: bool
    mode: str
    message: str
    data_mse_scaled: float = float("nan")
    robust_data_loss: float = float("nan")
    regularization_loss: float = float("nan")
    objective: float = float("nan")
    fitted_calendar_r2_for_spend: float = float("nan")
    residual_spend_cv: float = float("nan")
    jacobian_condition: float = float("nan")
    start_slope_spread_ratio: float = float("nan")
    bounds_active: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def beta(self) -> float:
        return self.kappa / self.spend_scale

    @property
    def alpha_at_calendar_zero(self) -> float:
        return self.level_at_reference / (-np.expm1(-self.kappa))

    def calendar_factor(self, dates) -> np.ndarray:
        z = calendar_matrix(dates, self.feature_names)
        exponent = (z - np.asarray(self.feature_center)) @ np.asarray(self.calendar_coefficients)
        if not np.isfinite(exponent).all() or (np.abs(exponent) > 50).any():
            raise ValueError(f"{self.campaign_id}: unsafe calendar extrapolation")
        return np.exp(exponent)

    def _check_spend(self, spend):
        x = np.asarray(spend, dtype=float)
        if not np.isfinite(x).all() or (x < 0).any():
            raise ValueError("Spend must be finite and nonnegative")
        return x

    def predict(self, spend, dates) -> np.ndarray:
        x = self._check_spend(spend)
        g = self.calendar_factor(dates)
        if x.ndim > 1 or (x.ndim == 1 and len(x) != len(g)):
            raise ValueError("spend and date lengths differ")
        if self.mode == "fallback_hold_current":
            return np.full(len(g), self.level_at_reference, dtype=float)
        return self.alpha_at_calendar_zero * (-np.expm1(-self.beta * x)) * g

    def representative_revenue(self, spend, reference_dates) -> np.ndarray:
        x = self._check_spend(spend)
        if self.mode == "fallback_hold_current":
            return np.full_like(x, self.level_at_reference, dtype=float)
        factor = float(np.mean(self.calendar_factor(reference_dates)))
        return self.alpha_at_calendar_zero * (-np.expm1(-self.beta * x)) * factor

    def representative_slope(self, spend, reference_dates) -> np.ndarray:
        x = self._check_spend(spend)
        if self.mode == "fallback_hold_current":
            return np.zeros_like(x, dtype=float)
        factor = float(np.mean(self.calendar_factor(reference_dates)))
        return self.alpha_at_calendar_zero * self.beta * np.exp(-self.beta * x) * factor


class ResponseEstimatorV2:
    def __init__(self, config: V2Config | None = None):
        self.config = config or V2Config()

    def _fallback(self, cid, tr, reason):
        x, y = tr.spend.to_numpy(float), tr.revenue.to_numpy(float)
        return V2Fit(
            campaign_id=cid, level_at_reference=float(np.mean(y)), kappa=1.0,
            spend_scale=max(float(np.mean(x)), 1.0), revenue_scale=max(float(np.mean(y)), 1.0),
            feature_names=(), feature_center=[], calendar_coefficients=[],
            observed_support=(float(x.min()), float(x.max())),
            train_start=str(tr.date.min().date()), train_end=str(tr.date.max().date()),
            n_train=len(tr), success=False, mode="fallback_hold_current", message=reason,
            warnings=[reason, "FALLBACK_FLAT_FORECAST_NOT_A_RESPONSE_ESTIMATE"],
        )

    def fit_campaign(self, train: pd.DataFrame) -> V2Fit:
        tr = validate_observations(train)
        if tr.campaign_id.nunique() != 1:
            raise ValueError("fit_campaign expects one campaign")
        cid = str(tr.campaign_id.iloc[0]); cfg = self.config
        x, y = tr.spend.to_numpy(float), tr.revenue.to_numpy(float)
        if len(x) < cfg.min_train_rows:
            return self._fallback(cid, tr, "INSUFFICIENT_TRAINING_ROWS")
        if np.mean(x) <= 0 or np.mean(y) <= 0:
            return self._fallback(cid, tr, "NO_POSITIVE_SPEND_OR_REVENUE_SIGNAL")
        if len(np.unique(x)) < 5 or np.ptp(x) <= 1e-6 * max(np.mean(x), 1.0):
            return self._fallback(cid, tr, "NO_USABLE_SPEND_VARIATION")
        span = int((tr.date.max() - tr.date.min()).days)
        names = []
        if cfg.include_annual and span >= cfg.annual_min_span_days:
            names += ["annual_sin", "annual_cos"]
        if cfg.include_weekday:
            # Monday is the omitted reference category.
            names += [f"weekday_{i}" for i in range(1, 7)]
        names = tuple(names)
        raw = calendar_matrix(tr.date, names)
        center = raw.mean(axis=0); z = raw - center
        p = len(names); sx = float(x.mean()); sy = float(y.mean())
        xs = x / sx; target = y / sy; root_n = np.sqrt(len(x))

        # theta0=log(A/sy), theta1=log(kappa). No hidden alpha/beta priors.
        def pred(theta):
            a, k = np.exp(theta[:2])
            return a * (-np.expm1(-k * xs)) / (-np.expm1(-k)) * np.exp(z @ theta[2:])

        def data_residual(theta):
            return pred(theta) - target

        def penalty_residual(theta):
            return np.r_[
                np.sqrt(cfg.lambda_level) * theta[0],
                np.sqrt(cfg.lambda_shape) * theta[1] / cfg.shape_prior_log_scale,
                np.sqrt(cfg.lambda_calendar / max(p, 1)) * theta[2:],
            ]

        def residual(theta):
            return np.r_[soft_l1_residuals(data_residual(theta), cfg.robust_delta) / root_n,
                         penalty_residual(theta)]

        lower = np.r_[math.log(0.01), math.log(cfg.kappa_min), np.full(p, -1.0)]
        upper = np.r_[math.log(100.0), math.log(cfg.kappa_max), np.full(p, 1.0)]
        attempts = []; failure_messages = []
        for start in cfg.start_kappas:
            try:
                result = least_squares(
                    residual, np.r_[0.0, math.log(start), np.zeros(p)],
                    bounds=(lower, upper), method="trf", x_scale="jac", loss="linear",
                    ftol=1e-9, xtol=1e-9, gtol=1e-9, max_nfev=cfg.max_nfev,
                )
                if result.success and np.isfinite(result.fun).all() and np.isfinite(result.x).all():
                    attempts.append(result)
                else:
                    failure_messages.append(str(result.message))
            except (ValueError, RuntimeError, FloatingPointError) as exc:
                failure_messages.append(f"{type(exc).__name__}: {exc}")
        if not attempts:
            return self._fallback(cid, tr, "ALL_NUMERICAL_STARTS_FAILED: " + "; ".join(failure_messages))
        best = min(attempts, key=lambda r: float(r.fun @ r.fun))
        theta = best.x; e = data_residual(theta)
        fit = V2Fit(
            campaign_id=cid, level_at_reference=float(np.exp(theta[0]) * sy),
            kappa=float(np.exp(theta[1])), spend_scale=sx, revenue_scale=sy,
            feature_names=names, feature_center=center.tolist(),
            calendar_coefficients=theta[2:].tolist(),
            observed_support=(float(x.min()), float(x.max())),
            train_start=str(tr.date.min().date()), train_end=str(tr.date.max().date()),
            n_train=len(tr), success=True, mode="calendar_robust_saturation", message=str(best.message),
            data_mse_scaled=float(np.mean(e * e)),
            robust_data_loss=float(np.mean(soft_l1_residuals(e, cfg.robust_delta)**2)),
            regularization_loss=float(penalty_residual(theta) @ penalty_residual(theta)),
            objective=float(best.fun @ best.fun),
        )
        if failure_messages:
            fit.warnings.append(f"{len(failure_messages)}_NUMERICAL_STARTS_FAILED")
        labels = ["log_reference_level", "log_kappa", *names]
        fit.bounds_active = [labels[j] for j in range(len(theta))
                             if min(theta[j]-lower[j], upper[j]-theta[j]) < 1e-5]
        if fit.bounds_active:
            fit.warnings.append("PARAMETER_BOUND_ACTIVE")
        if names and span < 365:
            fit.warnings.append("LESS_THAN_ONE_YEAR_OF_CALENDAR_TRAINING")
        if x.std() / sx < 0.15:
            fit.warnings.append("NARROW_SPEND_COVERAGE")
        calendar_design = np.column_stack([np.ones(len(x)), z])
        fitted_x = calendar_design @ np.linalg.lstsq(calendar_design, xs, rcond=None)[0]
        residue_x = xs - fitted_x
        fit.residual_spend_cv = float(residue_x.std())
        fit.fitted_calendar_r2_for_spend = float(1.0 - np.sum(residue_x**2) / np.sum((xs-xs.mean())**2))
        if fit.residual_spend_cv < 0.05:
            fit.warnings.append("LITTLE_SPEND_VARIATION_AFTER_CALENDAR")
        # Diagnostic of data information, excluding prior/regularization rows.
        eps = 1e-5
        jac = np.column_stack([(data_residual(theta + np.eye(len(theta))[j]*eps)
                                - data_residual(theta - np.eye(len(theta))[j]*eps))/(2*eps)
                               for j in range(len(theta))])
        singular = np.linalg.svd(jac, compute_uv=False)
        fit.jacobian_condition = float(singular[0] / singular[-1]) if singular[-1] > 1e-14 else float("inf")
        if fit.jacobian_condition > 1e6:
            fit.warnings.append("WEAK_LOCAL_IDENTIFICATION")
        slopes = []
        for r in attempts:
            aa, kk = np.exp(r.x[:2])
            slopes.append(sy * aa * kk / sx / (-np.expm1(-kk)) * np.exp(-kk)
                          * float(np.mean(np.exp(z @ r.x[2:]))))
        fit.start_slope_spread_ratio = float(np.ptp(slopes)/max(abs(np.median(slopes)), 1e-12))
        if fit.start_slope_spread_ratio > 0.25:
            fit.warnings.append("MULTISTART_SLOPE_DISAGREEMENT")
        fit.warnings.append("OBSERVATIONAL_NOT_CAUSALLY_IDENTIFIED")
        return fit

    def fit_all(self, train: pd.DataFrame) -> dict[str, V2Fit]:
        tr = validate_observations(train)
        return {str(cid): self.fit_campaign(g) for cid, g in tr.groupby("campaign_id", sort=True)}

    def slope_stability(self, train: pd.DataFrame, full_fit: V2Fit, reference_dates) -> pd.DataFrame:
        """Delete contiguous TRAINING blocks; ranges are NOT confidence intervals."""
        cols = ["campaign_id", "omitted_block", "probe_spend_krw", "refit_success", "mode",
                "marginal_roas_pct", "base_marginal_roas_pct", "message"]
        nfold = self.config.stability_folds
        if nfold == 0:
            return pd.DataFrame(columns=cols)
        tr = train.sort_values("date").reset_index(drop=True)
        probes = np.array([0.7, 1.0, 1.3]) * full_fit.spend_scale
        rows = []
        for j, omitted in enumerate(np.array_split(np.arange(len(tr)), nfold)):
            refit = self.fit_campaign(tr.drop(index=omitted))
            slopes = refit.representative_slope(probes, reference_dates)
            base = full_fit.representative_slope(probes, reference_dates)
            for x, s, b in zip(probes, slopes, base):
                rows.append(dict(campaign_id=full_fit.campaign_id, omitted_block=j,
                                 probe_spend_krw=float(x), refit_success=refit.success, mode=refit.mode,
                                 marginal_roas_pct=float(100*s) if refit.success else float("nan"),
                                 base_marginal_roas_pct=float(100*b), message=refit.message))
        return pd.DataFrame(rows, columns=cols)


def regression_metrics(actual, predicted, training_mean: float) -> dict:
    y, p = np.asarray(actual, float), np.asarray(predicted, float)
    if y.shape != p.shape or y.size == 0 or not np.isfinite(np.r_[y,p]).all():
        raise ValueError("Metrics require matching, nonempty finite arrays")
    mse = float(np.mean((y-p)**2)); denominator = float(np.sum((y-y.mean())**2))
    baseline = float(np.sqrt(np.mean((y-training_mean)**2)))
    return {"rmse_krw": math.sqrt(mse), "mae_krw": float(np.mean(abs(y-p))),
            "r2": 1.0-float(np.sum((y-p)**2))/denominator if denominator > 0 else float("nan"),
            "train_mean_baseline_rmse_krw": baseline,
            "rmse_gain_vs_train_mean_pct": 100*(baseline-math.sqrt(mse))/baseline if baseline > 0 else float("nan")}


def pwl_arrays(fit: V2Fit, lower: float, upper: float, reference_dates, n_points: int = 20):
    """Raw concave model, no heuristic revenue discount. Flag extrapolation separately."""
    if not np.isfinite([lower, upper]).all() or not 0 <= lower < upper or n_points < 2:
        raise ValueError("Require finite 0 <= lower < upper and at least 2 points")
    b = np.linspace(lower, upper, n_points)
    r = np.asarray(fit.representative_revenue(b, reference_dates))
    m = np.diff(r)/np.diff(b); a = r[:-1]-m*b[:-1]
    tol = 1e-8*max(1.0, float(np.max(abs(m))))
    if not np.isfinite(np.r_[b,r,m,a]).all() or np.min(r)<0 or np.min(m)<-tol or (np.diff(m)>tol).any():
        raise ValueError(f"{fit.campaign_id}: invalid PWL shape; no silent repair")
    return b, r, m, a


def one_sided_marginal_roas(b, slopes, x: float) -> tuple[float | None, float | None]:
    """None for a derivative outside the represented domain; robust knot detection."""
    b = np.asarray(b, float); m = np.asarray(slopes, float)
    if b.ndim != 1 or len(b)<2 or len(m)!=len(b)-1 or (np.diff(b)<=0).any():
        raise ValueError("Invalid PWL structure")
    if not np.isfinite(np.r_[b,m,x]).all():
        raise ValueError("Nonfinite PWL input")
    tol = min(max(1e-6, 1e-9*max(abs(x),1)), float(np.min(np.diff(b)))*0.1)
    if x < b[0]-tol or x > b[-1]+tol:
        raise ValueError("Budget outside PWL domain")
    k = int(np.argmin(abs(b-x)))
    if abs(b[k]-x)<=tol:
        return (float(m[k-1]*100) if k>0 else None,
                float(m[k]*100) if k<len(m) else None)
    j = int(np.clip(np.searchsorted(b,x,side="right")-1,0,len(m)-1))
    return float(m[j]*100), float(m[j]*100)
