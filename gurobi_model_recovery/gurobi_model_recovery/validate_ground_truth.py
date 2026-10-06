"""Read-only, post-development validation of the AdScope synthetic V1 runs.

Place this file beside run_local.py and the two original synthetic CSVs.
Run: ../.venv/Scripts/python.exe validate_ground_truth.py

The existing Gurobi allocations are NOT changed or re-fitted. A separate
continuous exponential oracle is calculated using the KKT conditions and
one-dimensional bisection. This program does NOT import or run gurobipy.

Two reference environments are deliberately kept separate:
  generator_period_mean: original synthetic V1 seasonal/promotional expected
    revenue averaged across the supplied dates for a CONSTANT daily allocation.
  base_no_seasonality: a controlled alpha*(1-exp(-beta*x)) reference, not a
    reconstruction of the seasonal historical observations.

This is a synthetic policy check, NOT a causal estimate or an untouched test.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

VERSION = "ground-truth-validator-1.0"
HERE = Path(__file__).resolve().parent
STRATEGIES = ("Current", "Equal", "Historical_ROAS", "Gurobi_Optimized")
IDS = tuple(f"C{i:02d}" for i in range(1, 13))
# These are the explicit constants of the generator supplied earlier in this
# conversation. They are NOT inferred from observed spend/revenue or the CSV.
PHASES = {cid: i * 0.35 for i, cid in enumerate(IDS)}
PROMOTIONS = (("2025-11-10", "2025-11-20"), ("2026-05-01", "2026-05-10"))
BUDGET_ATOL = 0.001  # KRW, validation of serialized allocation sums and bounds


class ValidationError(ValueError):
    """Inputs do not describe the supported, comparable frozen experiments."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path) -> dict:
    require(path.is_file(), f"Missing file: {path}")
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    require(isinstance(value, dict), f"Expected JSON object: {path}")
    return value


def read_csv(path: Path, required: tuple[str, ...]) -> pd.DataFrame:
    require(path.is_file(), f"Missing file: {path}")
    frame = pd.read_csv(path, encoding="utf-8-sig", dtype={"campaign_id": str})
    missing = sorted(set(required) - set(frame.columns))
    require(not missing, f"{path.name}: missing columns {missing}")
    require(len(frame) > 0, f"Empty CSV: {path}")
    return frame


def numeric(frame: pd.DataFrame, columns: tuple[str, ...], label: str) -> None:
    for column in columns:
        frame[column] = pd.to_numeric(frame[column], errors="raise")
        require(bool(np.isfinite(frame[column].to_numpy(dtype=float)).all()),
                f"{label}: non-finite {column}")


def json_safe(value):
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, np.ndarray):
        return json_safe(value.tolist())
    if isinstance(value, np.generic):
        return json_safe(value.item())
    if isinstance(value, (Path, pd.Timestamp)):
        return str(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(json_safe(data), ensure_ascii=False,
                               allow_nan=False, indent=2), encoding="utf-8")


def matches_run(meta: dict, change: float | None) -> bool:
    config = meta.get("config", {})
    if (meta.get("mode") != "demo" or
            meta.get("status") != "GUROBI_DEMO_COMPLETED" or
            meta.get("gurobi_executed") is not True or
            meta.get("solver", {}).get("is_optimal") is not True):
        return False
    try:
        if any(not math.isclose(float(config[k]), 0.01, rel_tol=0, abs_tol=1e-12)
               for k in ("lambda_alpha", "lambda_beta")):
            return False
        actual = config.get("max_budget_change_pct")
        return actual is None if change is None else (
            actual is not None and math.isclose(float(actual), change, rel_tol=0, abs_tol=1e-12))
    except (KeyError, TypeError, ValueError):
        return False


def select_run(outputs: Path, explicit: Path | None, change: float | None,
               selection_log: list) -> Path:
    label = "lambda=0.01, no change limit" if change is None else "lambda=0.01, change limit=0.30"
    if explicit is not None:
        path = explicit.expanduser().resolve()
        require(matches_run(read_json(path / "run_metadata.json"), change),
                f"Selected folder does not match {label}: {path}")
        selection_log.append({"scenario": label, "explicit": True, "selected": str(path)})
        return path
    require(outputs.is_dir(), f"Missing outputs folder: {outputs}")
    candidates, ignored = [], []
    for path in sorted(outputs.iterdir()):
        meta_path = path / "run_metadata.json"
        if not path.is_dir() or not meta_path.is_file():
            continue
        try:
            meta = read_json(meta_path)
        except (ValueError, OSError) as exc:
            ignored.append({"folder": str(path), "reason": str(exc)})
            continue
        if matches_run(meta, change) and (path / "campaign_allocations.csv").is_file():
            candidates.append(path)
    require(bool(candidates), f"No completed run for {label} under {outputs}. "
            "Keep the original demo folders or pass --baseline-run / --change30-run.")
    # Existing run_local.py names contain UTC timestamps. Select by that suffix,
    # not Windows folder modified time, which can change on copying or opening.
    timestamped = [p for p in candidates if p.name.startswith("demo_")]
    if timestamped:
        chosen = max(timestamped, key=lambda p: p.name[5:])
    else:
        require(len(candidates) == 1, "Multiple renamed matching folders; select explicitly.")
        chosen = candidates[0]
    selection_log.append({"scenario": label, "explicit": False, "selected": str(chosen.resolve()),
                          "matching_candidates": [str(p.resolve()) for p in candidates],
                          "unreadable_metadata": ignored})
    return chosen.resolve()


@dataclass
class Run:
    label: str
    path: Path
    metadata: dict
    allocations: pd.DataFrame
    current: np.ndarray
    lower: np.ndarray
    upper: np.ndarray
    total: float
    curves: pd.DataFrame


def load_run(path: Path, label: str, change: float | None,
             policy: pd.DataFrame, means: np.ndarray) -> Run:
    meta = read_json(path / "run_metadata.json")
    require(matches_run(meta, change), f"Unexpected run configuration: {path}")
    require("synthetic" in meta.get("dataset_kind", "").lower(), "Synthetic runs only.")
    require(meta.get("ground_truth_used_for_fitting") is False,
            f"{path.name}: metadata does not declare ground-truth-free fitting.")
    solver = meta["solver"]
    require(solver.get("num_integer_variables") == 0 and solver.get("num_sos") == 0,
            "This validator supports the agreed continuous V1, not integer/SOS models.")
    frame = read_csv(path / "campaign_allocations.csv",
                     ("campaign_id", "strategy", "current_budget", "optimized_budget", "expected_revenue"))
    numeric(frame, ("current_budget", "optimized_budget", "expected_revenue"), path.name)
    require(set(frame.strategy) == set(STRATEGIES), f"{path.name}: unexpected strategy labels.")
    require(not frame.duplicated(["strategy", "campaign_id"]).any(), "Duplicate campaign-strategy rows.")
    for strategy in STRATEGIES:
        require(set(frame.loc[frame.strategy == strategy, "campaign_id"]) == set(IDS),
                f"{path.name}: campaign IDs differ for {strategy}.")
    current_rows = frame[frame.strategy == "Current"].set_index("campaign_id").loc[list(IDS)]
    current = current_rows.current_budget.to_numpy(float)
    require(np.allclose(current, means, rtol=0, atol=BUDGET_ATOL),
            f"{path.name}: current budgets do not match full-period means of the supplied observations.")
    total = float(meta["total_daily_budget_KRW"])
    require(math.isfinite(total) and total > 0, "Invalid total budget.")
    require(abs(total - float(current.sum())) <= BUDGET_ATOL,
            "This validation compares the agreed default budget, not a custom-budget baseline.")
    lower = policy.min_daily_budget.to_numpy(float).copy()
    upper = policy.max_daily_budget.to_numpy(float).copy()
    if change is not None:
        lower = np.maximum(lower, (1 - change) * current)
        upper = np.minimum(upper, (1 + change) * current)
    require(np.all(lower <= upper), "Empty effective campaign bounds.")
    require(lower.sum() - BUDGET_ATOL <= total <= upper.sum() + BUDGET_ATOL,
            "Total budget infeasible under effective bounds.")
    for strategy in STRATEGIES:
        group = frame[frame.strategy == strategy].set_index("campaign_id").loc[list(IDS)]
        x = group.optimized_budget.to_numpy(float)
        require(np.allclose(group.current_budget, current, atol=BUDGET_ATOL, rtol=0),
                f"Inconsistent reference budget: {strategy}")
        require(abs(x.sum() - total) <= BUDGET_ATOL and
                np.all(x >= lower - BUDGET_ATOL) and np.all(x <= upper + BUDGET_ATOL),
                f"{path.name}: infeasible saved allocation for {strategy}. No silent repair performed.")
    require(np.allclose(current_rows.optimized_budget, current, rtol=0, atol=BUDGET_ATOL),
            "Current strategy was not the original current allocation.")
    curves = read_csv(path / "pwl_breakpoints.csv",
                      ("campaign_id", "breakpoint_index", "budget_KRW", "expected_revenue_KRW"))
    numeric(curves, ("breakpoint_index", "budget_KRW", "expected_revenue_KRW"), path.name)
    require(set(curves.campaign_id) == set(IDS), "PWL campaign IDs do not match.")
    for cid in IDS:
        c = curves[curves.campaign_id == cid].sort_values("breakpoint_index")
        b, r = c.budget_KRW.to_numpy(float), c.expected_revenue_KRW.to_numpy(float)
        require(len(b) >= 2 and np.all(np.diff(b) > 0) and np.all(r >= 0), "Invalid PWL points.")
        slopes = np.diff(r) / np.diff(b)
        require(np.all(slopes >= -1e-8) and np.all(np.diff(slopes) <= 1e-8), "Non-concave PWL input.")
        require(abs(b[0] - policy.loc[cid, "min_daily_budget"]) < BUDGET_ATOL and
                abs(b[-1] - policy.loc[cid, "max_daily_budget"]) < BUDGET_ATOL,
                "Policy file differs from the bounds used to build this run's PWL curves.")
        for row in frame[frame.campaign_id == cid].itertuples(index=False):
            predicted = float(np.interp(row.optimized_budget, b, r))
            require(abs(predicted - row.expected_revenue) < 0.02,
                    f"{path.name}: allocations and PWL file are not from the same calculation.")
    expected_constraints = 1 + len(curves) - len(IDS) + (2 * len(IDS) if change is not None else 0)
    require(solver.get("num_variables") == 2 * len(IDS) and
            solver.get("num_constraints") == expected_constraints and
            solver.get("num_general_constraints") == 0,
            "Saved model size differs from the agreed core V1. Extra constraints need an explicit oracle formulation.")
    return Run(label, path, meta, frame, current, lower, upper, total,
               curves.sort_values(["campaign_id", "breakpoint_index"]).reset_index(drop=True))


def revenue(alpha: np.ndarray, beta: np.ndarray, x: np.ndarray) -> np.ndarray:
    return alpha * (-np.expm1(-beta * x))


def oracle(alpha, beta, lower, upper, total) -> tuple[np.ndarray, dict]:
    """Global continuous exponential oracle; no Gurobi or PWL approximation.

    For positive A,beta, R'' < 0. The budget multiplier nu satisfies:
    x_i(nu) = clip((log(A_i*beta_i) - log(nu))/beta_i, L_i, U_i).
    Bisection on log(nu) gives the unique allocation, up to numerical tolerance.
    A concave tangent upper bound checks the numerical certificate afterwards.
    """
    alpha, beta, lower, upper = [np.asarray(a, dtype=float) for a in (alpha, beta, lower, upper)]
    require(alpha.ndim == 1 and len(alpha) > 0 and
            all(a.shape == alpha.shape for a in (beta, lower, upper)), "Oracle shape mismatch.")
    require(all(np.isfinite(a).all() for a in (alpha, beta, lower, upper)), "Non-finite oracle inputs.")
    require(np.all(alpha > 0) and np.all(beta > 0) and np.all(lower >= 0) and np.all(upper >= lower),
            "Oracle requires positive alpha/beta and valid nonnegative bounds.")
    require(math.isfinite(total) and lower.sum() - 1e-6 <= total <= upper.sum() + 1e-6,
            "Oracle total budget infeasible.")
    log_product = np.log(alpha) + np.log(beta)
    lo = float(np.min(log_product - beta * upper))
    hi = float(np.max(log_product - beta * lower))
    tol = max(1e-7, abs(total) * 1e-13)
    steps = 0
    if abs(total - float(lower.sum())) <= tol:
        x, log_nu = lower.copy(), hi
    elif abs(total - float(upper.sum())) <= tol:
        x, log_nu = upper.copy(), lo
    else:
        for steps in range(1, 301):
            log_nu = (lo + hi) / 2
            x = np.clip((log_product - log_nu) / beta, lower, upper)
            difference = float(x.sum()) - total
            if abs(difference) <= tol:
                break
            if difference > 0:
                lo = log_nu
            else:
                hi = log_nu
        require(abs(float(x.sum()) - total) <= max(tol * 10, 1e-5), "Oracle bisection did not converge.")
        # Remove only the tiny numerical budget residual, never a policy-level gap.
        residual = total - float(x.sum())
        room = upper - x if residual >= 0 else x - lower
        j = int(np.argmax(room))
        require(room[j] + 1e-8 >= abs(residual), "Insufficient numerical residual room.")
        x[j] += residual
    nu = math.exp(log_nu)
    objective = float(revenue(alpha, beta, x).sum())
    gradient = alpha * beta * np.exp(-beta * x)
    # Concavity: R(z)<=R(x)+gradient(x)*(z-x). This is an upper
    # bound over the equality-budget box for any nonnegative nu.
    d = gradient - nu
    best_box = np.where(d >= 0, upper, lower)
    tangent_gap = float(nu * (total - x.sum()) + np.sum(d * (best_box - x)))
    upper_bound = objective + max(0.0, tangent_gap)
    budget_error = abs(float(x.sum()) - total)
    bound_error = max(0.0, float(np.max(lower - x)), float(np.max(x - upper)))
    require(budget_error < BUDGET_ATOL and bound_error < BUDGET_ATOL, "Oracle solution infeasible.")
    require(upper_bound - objective <= max(0.001, abs(objective) * 1e-9),
            "Oracle numerical upper-bound check failed.")
    return x, {"method": "analytic_KKT_log_multiplier_bisection",
               "iterations": steps, "objective_krw": objective,
               "concave_tangent_upper_bound_krw": upper_bound,
               "numerical_certificate_gap_krw": upper_bound - objective,
               "budget_error_krw": budget_error, "bound_error_krw": bound_error,
               "budget_shadow_price_revenue_per_krw": nu,
               "is_gurobi_run": False, "reference": "continuous exponential response, not PWL"}


def reference_factors(truth: pd.DataFrame, dates: pd.DatetimeIndex) -> dict[str, np.ndarray]:
    # Original generator: revenue=max(0, R_base * seasonal * promo * N(1,sigma)).
    # E[max(0,Z)] for Z~N(1,sigma^2) is Phi(1/sigma)+sigma*phi(1/sigma).
    days = dates.dayofyear.to_numpy(dtype=float)
    promo = np.ones(len(dates))
    for start, end in PROMOTIONS:
        promo[(dates >= pd.Timestamp(start)) & (dates <= pd.Timestamp(end))] = 1.25
    factors = []
    for cid in IDS:
        strength = float(truth.loc[cid, "seasonality_strength"])
        sigma = float(truth.loc[cid, "revenue_noise_std"])
        require(0 <= strength < 1 and sigma >= 0, "Invalid original generator season/noise parameters.")
        seasonal = 1 + strength * np.sin(2 * math.pi * days / 365 + PHASES[cid])
        if sigma == 0:
            clipped_noise_mean = 1.0
        else:
            z = 1.0 / sigma
            clipped_noise_mean = 0.5 * (1 + math.erf(z / math.sqrt(2))) + sigma * math.exp(-z*z/2) / math.sqrt(2*math.pi)
        factors.append(float(np.mean(seasonal * promo)) * clipped_noise_mean)
    return {"generator_period_mean": np.array(factors), "base_no_seasonality": np.ones(len(IDS))}


def evaluate(runs: list[Run], truth: pd.DataFrame, factors: dict[str, np.ndarray],
             support: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, list, list]:
    summary, campaigns, certificates, flags = [], [], [], []
    beta = truth.beta_revenue.to_numpy(float)
    for run in runs:
        for reference, factor in factors.items():
            alpha = truth.alpha_revenue.to_numpy(float) * factor
            x_oracle, certificate = oracle(alpha, beta, run.lower, run.upper, run.total)
            oracle_values = revenue(alpha, beta, x_oracle)
            oracle_total = float(oracle_values.sum())
            certificate.update(scenario=run.label, environment=reference)
            certificates.append(certificate)
            current_true = float(revenue(alpha, beta, run.current).sum())
            for strategy in (*STRATEGIES, "Oracle"):
                if strategy == "Oracle":
                    x = x_oracle
                else:
                    selected = run.allocations[run.allocations.strategy == strategy].set_index("campaign_id").loc[list(IDS)]
                    x = selected.optimized_budget.to_numpy(float)
                values = revenue(alpha, beta, x)
                total_true = float(values.sum())
                regret = oracle_total - total_true
                require(regret >= -0.02, "Candidate exceeds certified oracle; check numerical or input consistency.")
                lift = (total_true / current_true - 1) * 100 if current_true > 0 else None
                if strategy == "Gurobi_Optimized" and total_true < current_true - 0.02:
                    flags.append(f"{run.label}/{reference}: saved Gurobi policy is BELOW Current under this synthetic reference. Do not hide this result or tune on ground truth.")
                distance = float(np.abs(x - x_oracle).sum() / 2)
                summary.append({"scenario": run.label, "environment": reference,
                    "strategy": strategy, "source_run": run.path.name,
                    "total_budget_krw": float(x.sum()),
                    "synthetic_expected_daily_revenue_krw": total_true,
                    "synthetic_expected_roas_pct": total_true / run.total * 100,
                    "oracle_daily_revenue_krw": oracle_total,
                    "oracle_regret_krw": max(0.0, regret),
                    "oracle_gap_pct": max(0.0, regret) / oracle_total * 100,
                    "lift_vs_current_pct": lift,
                    "budget_reallocation_to_oracle_krw": distance,
                    "budget_reallocation_to_oracle_pct": distance / run.total * 100,
                    "is_feasible": True})
                for j, cid in enumerate(IDS):
                    campaigns.append({"scenario": run.label, "environment": reference,
                        "strategy": strategy, "campaign_id": cid,
                        "campaign_name": str(truth.loc[cid, "campaign_name"]),
                        "current_budget_krw": run.current[j], "candidate_budget_krw": x[j],
                        "oracle_budget_krw": x_oracle[j],
                        "effective_lower_krw": run.lower[j], "effective_upper_krw": run.upper[j],
                        "truth_revenue_multiplier": factor[j],
                        "synthetic_expected_daily_revenue_krw": values[j],
                        "oracle_campaign_daily_revenue_krw": oracle_values[j],
                        "true_marginal_roas_pct": alpha[j]*beta[j]*math.exp(-beta[j]*x[j])*100,
                        "in_training_spend_support": bool(support.loc[cid, "min"] <= x[j] <= support.loc[cid, "max"])})
    return pd.DataFrame(summary), pd.DataFrame(campaigns), certificates, flags


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--outputs-dir", type=Path, default=HERE / "outputs")
    parser.add_argument("--baseline-run", type=Path, help="Optional explicit lambda=.01 folder with no change limit")
    parser.add_argument("--change30-run", type=Path, help="Optional explicit lambda=.01 folder with change=.30")
    parser.add_argument("--performance", type=Path, default=HERE / "naver_synthetic_performance.csv")
    parser.add_argument("--truth", type=Path, default=HERE / "naver_synthetic_ground_truth.csv")
    parser.add_argument("--bounds", type=Path, default=HERE / "campaign_budget_bounds.csv")
    parser.add_argument("--output", type=Path, help="NEW folder only; existing folders are never overwritten")
    args = parser.parse_args()
    try:
        for path in (args.performance, args.truth, args.bounds):
            require(path.is_file(), f"Missing {path}. Put this script beside run_local.py and the original CSVs.")
        data = read_csv(args.performance, ("campaign_id", "date", "spend", "platform", "account_id", "advertiser_id"))
        numeric(data, ("spend",), args.performance.name)
        require(set(data.campaign_id) == set(IDS), "Generator V1 expects C01 through C12.")
        require(set(data.platform) == {"naver"} and set(data.account_id) == {"SYNTH-001"} and
                set(data.advertiser_id) == {"synthetic-advertiser-001"},
                "Only the original synthetic V1 dataset is supported, not real advertiser data.")
        data["date"] = pd.to_datetime(data.date, format="%Y-%m-%d", errors="raise")
        dates = pd.DatetimeIndex(sorted(data.date.unique()))
        expected_dates = pd.date_range("2025-09-01", "2026-08-31")
        require(dates.equals(expected_dates), "Generator reference expects the original 365 dates.")
        require(len(data) == 4380 and not data.duplicated(["campaign_id", "date"]).any(),
                "Expected a dense 365 x 12 synthetic panel without duplicate rows.")
        require(bool((data.spend >= 0).all()), "Negative spend in observations.")
        truth = read_csv(args.truth, ("campaign_id", "campaign_name", "alpha_revenue", "beta_revenue", "seasonality_strength", "revenue_noise_std"))
        numeric(truth, ("alpha_revenue", "beta_revenue", "seasonality_strength", "revenue_noise_std"), args.truth.name)
        policy = read_csv(args.bounds, ("campaign_id", "min_daily_budget", "max_daily_budget"))
        numeric(policy, ("min_daily_budget", "max_daily_budget"), args.bounds.name)
        for name, frame in (("truth", truth), ("policy", policy)):
            require(set(frame.campaign_id) == set(IDS) and not frame.campaign_id.duplicated().any(), f"{name}: campaign ID mismatch.")
        truth, policy = [f.set_index("campaign_id").loc[list(IDS)] for f in (truth, policy)]
        require(bool((truth.alpha_revenue > 0).all() and (truth.beta_revenue > 0).all()), "Nonpositive response parameters.")
        require(bool((policy.min_daily_budget >= 0).all() and (policy.max_daily_budget >= policy.min_daily_budget).all()), "Invalid policy bounds.")
        means = data.groupby("campaign_id").spend.mean().loc[list(IDS)].to_numpy(float)
        selection = []
        p0 = select_run(args.outputs_dir, args.baseline_run, None, selection)
        p30 = select_run(args.outputs_dir, args.change30_run, 0.30, selection)
        runs = [load_run(p0, "no_change_limit", None, policy, means),
                load_run(p30, "change30", 0.30, policy, means)]
        require(abs(runs[0].total - runs[1].total) < BUDGET_ATOL, "Run budgets differ.")
        require(np.allclose(runs[0].current, runs[1].current, rtol=0, atol=BUDGET_ATOL), "Run reference allocations differ.")
        c0, c1 = runs[0].curves, runs[1].curves
        require(c0[["campaign_id", "breakpoint_index"]].equals(c1[["campaign_id", "breakpoint_index"]]) and
                np.allclose(c0[["budget_KRW", "expected_revenue_KRW"]], c1[["budget_KRW", "expected_revenue_KRW"]], rtol=1e-10, atol=0.001),
                "Run PWL curves differ. This paired check must change ONLY the budget-change constraint.")
        fraction = float(runs[0].metadata["config"]["train_fraction"])
        require(0 < fraction < 1 and fraction == runs[1].metadata["config"]["train_fraction"], "Invalid/different date split.")
        training_dates = dates[:int(len(dates) * fraction)]
        support = data[data.date.isin(training_dates)].groupby("campaign_id").spend.agg(["min", "max"])
        factors = reference_factors(truth, dates)
        input_paths = [args.performance, args.truth, args.bounds]
        for run in runs:
            input_paths.extend(run.path / n for n in ("run_metadata.json", "campaign_allocations.csv", "pwl_breakpoints.csv"))
        before_hashes = {str(p.resolve()): sha256(p) for p in input_paths}
        summaries, campaigns, certificates, flags = evaluate(runs, truth, factors, support)
        require(all(sha256(Path(p)) == h for p, h in before_hashes.items()), "Input file changed during evaluation.")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        out = args.output or args.outputs_dir / f"ground_truth_{stamp}"
        require(not out.exists(), f"Refusing to overwrite output folder: {out}")
        out.mkdir(parents=True, exist_ok=False)
        summaries.to_csv(out / "ground_truth_summary.csv", index=False, encoding="utf-8-sig")
        campaigns.to_csv(out / "ground_truth_campaigns.csv", index=False, encoding="utf-8-sig")
        limits = [
            "Synthetic post-development evaluation only; this is NOT real Naver performance or a causal validation.",
            "The final 20% has already been used for tuning decisions. This is NOT a new untouched holdout.",
            "Full-period current budgets are frozen from the earlier demonstration. They are not configured platform budgets.",
            "Each strategy and oracle uses one constant daily allocation across all reference dates, not day-specific foresight.",
            "The period-mean reference reconstructs the original generator's explicit phases/promotions from the supplied generation code, not from the ground-truth CSV alone.",
            "The controlled base reference switches off seasonality, promotion and noise; do not call it the full historical generating environment.",
            "Expected noise is integrated analytically after zero clipping; rounding revenue to cents is omitted (at most 0.005 KRW per row).",
            "Only revenue and ROAS are validated. Conversions and CPA require a separately specified ground-truth mechanism.",
            "Oracle regret combines response-estimation, extrapolation-policy and PWL approximation effects; it is NOT a Gurobi MIPGap or proof of a solver bug.",
            "Original run metadata lacks input hashes, so past byte-for-byte provenance cannot be proven. This run verifies budget means, policy/PWL endpoints, identical PWL curves and saved revenue consistency, and captures hashes now.",
            "If ground-truth feedback is used for further tuning, validate on new independent synthetic experiments before claiming generalization."]
        metadata = {"validator_version": VERSION, "completed_at_utc": stamp,
            "status": "VALIDATION_COMPLETED_NOT_A_PRODUCTION_APPROVAL",
            "python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
            "selected_runs": selection, "fitting_performed": False, "gurobi_executed_by_validator": False,
            "existing_allocations_modified": False, "lambda_frozen": 0.01,
            "scenarios": {"no_change_limit": None, "change30": 0.30},
            "reference_start": dates[0].date().isoformat(), "reference_end": dates[-1].date().isoformat(),
            "generator_reference": {"name": "original_synthetic_v1", "phase_by_campaign": PHASES,
                "seasonal_formula": "1 + seasonality_strength * sin(2*pi*day_of_year/365 + phase)",
                "promotion_windows_inclusive": PROMOTIONS, "promotion_multiplier": 1.25,
                "noise": "max(0, Normal(mean=1, std=revenue_noise_std)) expectation",
                "weekday_note": "Original weekday factors affected generated spend, not conditional revenue; do not apply them twice.",
                "mean_multiplier_by_campaign": {cid: factors["generator_period_mean"][j] for j, cid in enumerate(IDS)}},
            "input_sha256": before_hashes, "script_sha256": sha256(Path(__file__)),
            "checks": {"paired_same_budget_and_curves": True, "all_saved_allocations_feasible": True,
                "all_oracle_certificates_checked": True, "inputs_unchanged": True},
            "oracle_certificates": certificates, "review_flags": flags, "limitations": limits,
            "outputs": ["ground_truth_summary.csv", "ground_truth_campaigns.csv", "ground_truth_validation_metadata.json"]}
        save_json(out / "ground_truth_validation_metadata.json", metadata)
        print("[DONE] Ground-truth validation completed. No existing files were changed.")
        for run in runs:
            print(f"[SOURCE] {run.label}: {run.path}")
        view = summaries[(summaries.environment == "generator_period_mean") &
                         (summaries.strategy.isin(["Current", "Gurobi_Optimized", "Oracle"]))]
        print("\nReference: original-generator period mean; constant daily budget; synthetic only.")
        print(view[["scenario", "strategy", "synthetic_expected_daily_revenue_krw", "lift_vs_current_pct", "oracle_gap_pct"]].to_string(index=False, float_format=lambda v: f"{v:,.4f}"))
        for flag in flags:
            print("[REVIEW]", flag)
        print("Output folder:", out.resolve())
        print("DONE means computation finished, NOT that the saved policy improved on Current.")
        return 0
    except (ValidationError, ValueError, KeyError, OSError, TypeError) as exc:
        print(f"[BLOCKED] {type(exc).__name__}: {exc}", file=sys.stderr)
        print("No success claim made. Check paths and source run metadata; do not change the data just to pass.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
