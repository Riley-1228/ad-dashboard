
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import math
import sys
import importlib
import numpy as np
import pandas as pd


@dataclass(frozen=True)
class GuardrailConfig:
    review_policy: str = "freeze"  # "freeze" or "restrict"
    review_max_change_pct: float = 0.10


def load_json(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def build_guarded_bounds(
    decisions: pd.DataFrame,
    original_effective_bounds: dict[str, list[float] | tuple[float, float]],
    cfg: GuardrailConfig,
) -> tuple[dict[str, tuple[float, float]], list[str]]:
    required = {"campaign_id", "action", "current_budget"}
    missing = required - set(decisions.columns)
    if missing:
        raise ValueError(f"Safety decisions missing columns: {sorted(missing)}")

    if cfg.review_policy not in {"freeze", "restrict"}:
        raise ValueError("review_policy must be 'freeze' or 'restrict'")
    if not (0 <= cfg.review_max_change_pct <= 1):
        raise ValueError("review_max_change_pct must be in [0, 1]")

    result: dict[str, tuple[float, float]] = {}
    notes: list[str] = []

    for r in decisions.itertuples(index=False):
        cid = str(r.campaign_id)
        if cid not in original_effective_bounds:
            raise ValueError(f"{cid}: missing original effective bounds")

        lo0, hi0 = map(float, original_effective_bounds[cid])
        current = float(r.current_budget)
        action = str(r.action)

        if not (math.isfinite(lo0) and math.isfinite(hi0) and lo0 <= hi0):
            raise ValueError(f"{cid}: invalid original effective bounds")
        if not math.isfinite(current):
            raise ValueError(f"{cid}: invalid current budget")
        if not (lo0 - 1e-6 <= current <= hi0 + 1e-6):
            raise ValueError(f"{cid}: current budget is outside original effective bounds")

        if action == "ELIGIBLE":
            lo, hi = lo0, hi0
        elif action == "HOLD_CURRENT":
            lo = hi = current
            notes.append(f"{cid}: HOLD_CURRENT -> fixed at current")
        elif action == "REVIEW":
            if cfg.review_policy == "freeze":
                lo = hi = current
                notes.append(f"{cid}: REVIEW -> fixed at current in strict shadow mode")
            else:
                delta = cfg.review_max_change_pct
                lo = max(lo0, current * (1 - delta))
                hi = min(hi0, current * (1 + delta))
                if lo > hi + 1e-8:
                    raise ValueError(f"{cid}: REVIEW restriction is infeasible")
                notes.append(
                    f"{cid}: REVIEW -> restricted to +/-{100*delta:.1f}% around current"
                )
        else:
            raise ValueError(f"{cid}: unknown safety action {action!r}")

        result[cid] = (float(lo), float(hi))

    if set(result) != set(original_effective_bounds):
        raise ValueError("Safety decisions and original effective bounds have different campaign IDs")

    return result, notes


def reconstruct_curves(
    m,
    pwl_path: Path,
    train: pd.DataFrame,
    business_bounds: dict[str, tuple[float, float]],
):
    pwl = pd.read_csv(pwl_path)
    required = {
        "campaign_id", "breakpoint_index", "budget_KRW",
        "expected_revenue_KRW", "concavity_enforced"
    }
    missing = required - set(pwl.columns)
    if missing:
        raise ValueError(f"PWL table missing columns: {sorted(missing)}")

    curves = {}
    for cid, sub in pwl.groupby("campaign_id", sort=True):
        cid = str(cid)
        sub = sub.sort_values("breakpoint_index")
        b = sub["budget_KRW"].to_numpy(float)
        y = sub["expected_revenue_KRW"].to_numpy(float)

        if len(b) < 2 or not np.all(np.diff(b) > 0):
            raise ValueError(f"{cid}: invalid PWL breakpoints")
        if not np.isfinite(b).all() or not np.isfinite(y).all():
            raise ValueError(f"{cid}: nonfinite PWL values")

        slopes = np.diff(y) / np.diff(b)
        intercepts = y[:-1] - slopes * b[:-1]
        if (slopes < -1e-8).any():
            raise ValueError(f"{cid}: PWL is not monotone nondecreasing")
        if (np.diff(slopes) > 1e-7).any():
            raise ValueError(f"{cid}: PWL is not concave")

        tr = train.loc[train["campaign_id"].astype(str) == cid]
        if tr.empty:
            raise ValueError(f"{cid}: missing training observations")
        support = (float(tr.spend.min()), float(tr.spend.max()))
        blo, bhi = business_bounds[cid]

        curves[cid] = m.PWLCurve(
            cid,
            b,
            y,
            slopes,
            intercepts,
            support,
            blo,
            bhi,
            bool(sub["concavity_enforced"].iloc[0]),
            0.0,
        )
    return curves


def attach_bounds(curves, guarded_bounds):
    from dataclasses import replace
    return {
        cid: replace(curve, budget_lb=guarded_bounds[cid][0], budget_ub=guarded_bounds[cid][1])
        for cid, curve in curves.items()
    }


def evaluate_curve_portfolio(curves, allocation: dict[str, float]) -> float:
    total = 0.0
    for cid, c in curves.items():
        x = float(allocation[cid])
        total += float(np.interp(x, c.breakpoints, c.revenues))
    return total


def check_budget_feasibility(bounds: dict[str, tuple[float, float]], budget: float) -> None:
    lo_sum = sum(v[0] for v in bounds.values())
    hi_sum = sum(v[1] for v in bounds.values())
    if budget < lo_sum - 0.01 or budget > hi_sum + 0.01:
        raise ValueError(
            f"Total budget {budget:.2f} infeasible under guardrails "
            f"[{lo_sum:.2f}, {hi_sum:.2f}]"
        )


def run_guarded_reoptimization(
    demo_dir: Path,
    safety_decisions_path: Path,
    performance_path: Path,
    business_bounds_path: Path,
    frozen_dir: Path,
    output_dir: Path,
    cfg: GuardrailConfig,
):
    demo_dir = Path(demo_dir)
    frozen_dir = Path(frozen_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Force imports from the frozen V2 directory, not mutable working copies.
    sys.path.insert(0, str(frozen_dir.resolve()))
    m = importlib.import_module("naver_budget_optimizer")
    rv2 = importlib.import_module("run_v2")
    est2 = importlib.import_module("response_estimator_v2")

    meta = load_json(demo_dir / "run_metadata_v2.json")
    decisions = pd.read_csv(safety_decisions_path)
    performance = est2.load_observations(performance_path)
    train, _ = est2.chronological_split(
        performance, float(meta["config_experiment"]["train_fraction"])
    )

    bdf = pd.read_csv(
        business_bounds_path,
        usecols=["campaign_id", "min_daily_budget", "max_daily_budget"],
    )
    business_bounds = {
        str(r.campaign_id): (float(r.min_daily_budget), float(r.max_daily_budget))
        for r in bdf.itertuples(index=False)
    }

    original_effective = {
        str(cid): (float(vals[0]), float(vals[1]))
        for cid, vals in meta["effective_bounds"].items()
    }
    guarded_bounds, notes = build_guarded_bounds(
        decisions, original_effective, cfg
    )
    curves = reconstruct_curves(
        m, demo_dir / "pwl_breakpoints_v2.csv", train, business_bounds
    )
    curves = attach_bounds(curves, guarded_bounds)

    ref = performance
    current = {
        str(k): float(v)
        for k, v in ref.groupby("campaign_id").spend.mean().items()
    }
    total_budget = float(meta["total_daily_budget_KRW"])
    check_budget_feasibility(guarded_bounds, total_budget)

    names = (
        ref.groupby("campaign_id").campaign_name.first().astype(str).to_dict()
    )
    totals = ref.groupby("campaign_id")[["revenue", "spend"]].sum()
    vw_roas = (100 * totals.revenue / totals.spend.replace(0, np.nan)).to_dict()
    if not np.isfinite(list(vw_roas.values())).all():
        raise ValueError("Undefined historical ROAS")

    if "conversions" in ref.columns:
        conv = pd.to_numeric(ref.conversions, errors="raise")
        good = ref.loc[conv > 0].copy()
        good["_aor"] = good.revenue / good.conversions
        aor = good.groupby("campaign_id")._aor.mean().to_dict()
    else:
        aor = {}
    aor = {cid: float(aor.get(cid, float("nan"))) for cid in curves}

    v1cfg = m.OptimizerConfig(
        lambda_alpha=float(meta["config_experiment"]["lambda_value"]),
        lambda_beta=float(meta["config_experiment"]["lambda_value"]),
        train_fraction=float(meta["config_experiment"]["train_fraction"]),
        max_budget_change_pct=None,
        sensitivity_lambdas=[],
        total_daily_budget=total_budget,
    )

    campaign_table, portfolio_table, solver_info = rv2.run_gurobi(
        m=m,
        curves=curves,
        current=current,
        budget=total_budget,
        names=names,
        aor=aor,
        vw_roas=vw_roas,
        effective=guarded_bounds,
        config=v1cfg,
    )

    campaign_table.to_csv(
        output_dir / "guarded_campaign_allocations.csv",
        index=False,
        encoding="utf-8-sig",
    )
    portfolio_table.to_csv(
        output_dir / "guarded_strategy_comparison.csv",
        index=False,
        encoding="utf-8-sig",
    )

    original_opt = pd.read_csv(demo_dir / "campaign_allocations_v2.csv")
    original_opt = original_opt.loc[
        original_opt["strategy"].astype(str) == "Gurobi_Optimized"
    ].set_index("campaign_id")

    guarded_opt = campaign_table.loc[
        campaign_table["strategy"].astype(str) == "Gurobi_Optimized"
    ].set_index("campaign_id")

    comparison = []
    for cid in sorted(curves):
        comparison.append(
            {
                "campaign_id": cid,
                "safety_action": str(
                    decisions.set_index("campaign_id").loc[cid, "action"]
                ),
                "current_budget": current[cid],
                "original_v2_budget": float(original_opt.loc[cid, "optimized_budget"]),
                "guarded_v2_budget": float(guarded_opt.loc[cid, "optimized_budget"]),
                "guarded_lower": guarded_bounds[cid][0],
                "guarded_upper": guarded_bounds[cid][1],
            }
        )
    comparison = pd.DataFrame(comparison)
    comparison.to_csv(
        output_dir / "guarded_budget_comparison.csv",
        index=False,
        encoding="utf-8-sig",
    )

    original_alloc = {
        str(cid): float(v)
        for cid, v in original_opt["optimized_budget"].items()
    }
    guarded_alloc = {
        str(cid): float(v)
        for cid, v in guarded_opt["optimized_budget"].items()
    }

    evaluation = pd.DataFrame(
        [
            {
                "allocation": "Current",
                "v2_estimated_revenue_krw": evaluate_curve_portfolio(curves, current),
            },
            {
                "allocation": "Original_V2",
                "v2_estimated_revenue_krw": evaluate_curve_portfolio(curves, original_alloc),
            },
            {
                "allocation": "Guarded_V2",
                "v2_estimated_revenue_krw": evaluate_curve_portfolio(curves, guarded_alloc),
            },
        ]
    )
    current_value = float(
        evaluation.loc[evaluation.allocation == "Current", "v2_estimated_revenue_krw"].iloc[0]
    )
    evaluation["estimated_lift_vs_current_pct"] = (
        100 * (evaluation.v2_estimated_revenue_krw - current_value) / current_value
    )
    evaluation.to_csv(
        output_dir / "guarded_estimated_evaluation.csv",
        index=False,
        encoding="utf-8-sig",
    )

    result_meta = {
        "guardrail_version": "guarded-reoptimization-1.0",
        "review_policy": cfg.review_policy,
        "review_max_change_pct": cfg.review_max_change_pct,
        "production_write_enabled": False,
        "shadow_only": True,
        "source_demo_dir": str(demo_dir.resolve()),
        "safety_decisions_path": str(Path(safety_decisions_path).resolve()),
        "total_daily_budget_KRW": total_budget,
        "solver": solver_info,
        "guarded_bounds": guarded_bounds,
        "notes": notes,
        "important": [
            "HOLD_CURRENT campaigns are fixed inside the optimization model.",
            "In strict mode REVIEW campaigns are also fixed at current until human review.",
            "Eligible campaigns absorb the remaining budget subject to their original effective bounds.",
            "Estimated revenue is model-based and is not an independent accuracy certificate.",
            "Real advertising writes remain disabled.",
        ],
    }
    (output_dir / "guarded_reoptimization_metadata.json").write_text(
        json.dumps(result_meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return campaign_table, portfolio_table, comparison, evaluation, result_meta
