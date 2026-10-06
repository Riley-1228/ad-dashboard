
from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import json
import math
import pandas as pd


@dataclass(frozen=True)
class GateConfig:
    # These are conservative development defaults, not universal industry thresholds.
    min_training_days: int = 180
    max_slope_spread_review: float = 0.25
    min_validation_gain_vs_train_mean_pct: float = 0.0
    independent_min_pct_cases_beating_current: float = 80.0
    independent_max_mean_oracle_gap_pct: float = 0.50
    independent_min_mean_lift_vs_current_pct: float = 0.0


def _require_columns(df: pd.DataFrame, columns: list[str], label: str) -> None:
    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise ValueError(f"{label}: missing columns {missing}")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _solver_optimal(meta: dict) -> bool:
    solvers = meta.get("solver", {})
    if not isinstance(solvers, dict) or not solvers:
        return False
    for name in ("V1", "V2"):
        info = solvers.get(name)
        if not isinstance(info, dict) or not bool(info.get("is_optimal")):
            return False
    return True


def evaluate_independent_validation(path: Path, cfg: GateConfig) -> dict:
    df = pd.read_csv(path)
    _require_columns(
        df,
        [
            "strategy",
            "cases",
            "mean_lift_vs_current_pct",
            "mean_oracle_gap_pct",
            "pct_cases_beating_current",
        ],
        "aggregate_results",
    )
    row = df.loc[df["strategy"].astype(str) == "V2"]
    if len(row) != 1:
        raise ValueError("aggregate_results: exactly one V2 row is required")
    r = row.iloc[0]

    checks = {
        "mean_lift_positive": float(r.mean_lift_vs_current_pct)
        > cfg.independent_min_mean_lift_vs_current_pct,
        "cases_beating_current": float(r.pct_cases_beating_current)
        >= cfg.independent_min_pct_cases_beating_current,
        "oracle_gap": float(r.mean_oracle_gap_pct)
        <= cfg.independent_max_mean_oracle_gap_pct,
    }
    return {
        "passed": all(checks.values()),
        "checks": checks,
        "metrics": {
            "cases": int(r.cases),
            "mean_lift_vs_current_pct": float(r.mean_lift_vs_current_pct),
            "mean_oracle_gap_pct": float(r.mean_oracle_gap_pct),
            "pct_cases_beating_current": float(r.pct_cases_beating_current),
        },
    }


def campaign_gate(
    validation: pd.DataFrame,
    slopes: pd.DataFrame,
    allocations: pd.DataFrame,
    cfg: GateConfig,
) -> pd.DataFrame:
    _require_columns(
        validation,
        [
            "campaign_id",
            "v2_success",
            "v2_rmse_gain_vs_train_mean_pct",
            "rmse_change_v2_vs_v1_pct",
        ],
        "validation_comparison",
    )
    _require_columns(
        slopes,
        ["campaign_id", "slope_spread_ratio_at_reference", "successful_refits", "requested_refits"],
        "slope_stability_summary",
    )
    _require_columns(
        allocations,
        [
            "campaign_id",
            "strategy",
            "current_budget",
            "optimized_budget",
            "is_in_observed_support",
        ],
        "campaign_allocations_v2",
    )

    opt = allocations.loc[allocations["strategy"].astype(str) == "Gurobi_Optimized"].copy()
    if opt["campaign_id"].duplicated().any():
        raise ValueError("campaign_allocations_v2: duplicate optimized campaign rows")

    df = (
        validation.merge(slopes, on="campaign_id", how="inner", validate="one_to_one")
        .merge(
            opt[
                [
                    "campaign_id",
                    "current_budget",
                    "optimized_budget",
                    "is_in_observed_support",
                ]
            ],
            on="campaign_id",
            how="inner",
            validate="one_to_one",
        )
    )

    rows = []
    for r in df.itertuples(index=False):
        reasons: list[str] = []
        action = "ELIGIBLE"

        if not bool(r.v2_success):
            reasons.append("V2_FIT_FAILED")
            action = "HOLD_CURRENT"

        if float(r.v2_rmse_gain_vs_train_mean_pct) <= cfg.min_validation_gain_vs_train_mean_pct:
            reasons.append("NO_VALIDATION_GAIN_VS_TRAIN_MEAN")
            action = "HOLD_CURRENT"

        if not bool(r.is_in_observed_support):
            reasons.append("OPTIMUM_OUTSIDE_TRAINING_SPEND_SUPPORT")
            action = "HOLD_CURRENT"

        full_refits = int(r.successful_refits) >= int(r.requested_refits)
        if not full_refits:
            reasons.append("SLOPE_REFIT_INCOMPLETE")
            action = "HOLD_CURRENT"

        spread = float(r.slope_spread_ratio_at_reference)
        if math.isfinite(spread) and spread > cfg.max_slope_spread_review:
            reasons.append("SLOPE_SENSITIVE")
            if action != "HOLD_CURRENT":
                action = "REVIEW"

        if float(r.rmse_change_v2_vs_v1_pct) > 0:
            reasons.append("V2_VALIDATION_RMSE_WORSE_THAN_V1")
            if action == "ELIGIBLE":
                action = "REVIEW"

        rows.append(
            {
                "campaign_id": r.campaign_id,
                "action": action,
                "reasons": ";".join(reasons),
                "current_budget": float(r.current_budget),
                "candidate_budget": float(r.optimized_budget),
                "is_in_observed_support": bool(r.is_in_observed_support),
                "v2_rmse_gain_vs_train_mean_pct": float(r.v2_rmse_gain_vs_train_mean_pct),
                "rmse_change_v2_vs_v1_pct": float(r.rmse_change_v2_vs_v1_pct),
                "slope_spread_ratio_at_reference": spread,
            }
        )

    return pd.DataFrame(rows).sort_values("campaign_id").reset_index(drop=True)


def evaluate_gate(
    demo_dir: Path,
    aggregate_results_path: Path,
    cfg: GateConfig | None = None,
) -> tuple[pd.DataFrame, dict]:
    cfg = cfg or GateConfig()
    demo_dir = Path(demo_dir)

    meta = load_json(demo_dir / "run_metadata_v2.json")
    validation = pd.read_csv(demo_dir / "validation_comparison.csv")
    slopes = pd.read_csv(demo_dir / "slope_stability_summary.csv")
    allocations = pd.read_csv(demo_dir / "campaign_allocations_v2.csv")
    independent = evaluate_independent_validation(Path(aggregate_results_path), cfg)

    campaigns = campaign_gate(validation, slopes, allocations, cfg)

    training_days = int(meta.get("training_dates", 0))
    meta_checks = {
        "demo_completed": str(meta.get("status", "")).startswith("V2_DEMO_COMPLETED"),
        "gurobi_executed": bool(meta.get("gurobi_executed")),
        "solver_optimal_v1_v2": _solver_optimal(meta),
        "inputs_unchanged": bool(meta.get("inputs_unchanged")),
        "enough_training_days": training_days >= cfg.min_training_days,
        "ground_truth_not_used_for_fitting": not bool(meta.get("ground_truth_used_for_fitting")),
        "not_production_approved_by_runner": not bool(meta.get("production_approved")),
    }

    counts = campaigns["action"].value_counts().to_dict()
    hard_block = not independent["passed"] or not all(meta_checks.values())
    if hard_block:
        portfolio_action = "BLOCK"
    elif counts.get("HOLD_CURRENT", 0) > 0 or counts.get("REVIEW", 0) > 0:
        portfolio_action = "SHADOW_WITH_GUARDRAILS"
    else:
        portfolio_action = "SHADOW_ELIGIBLE"

    summary = {
        "gate_version": "safety-gate-1.0",
        "portfolio_action": portfolio_action,
        "production_write_enabled": False,
        "note": (
            "This gate can qualify a model for read-only/shadow evaluation only. "
            "It never authorizes automatic real-ad budget writes."
        ),
        "config": asdict(cfg),
        "meta_checks": meta_checks,
        "independent_validation": independent,
        "campaign_counts": {
            "total": int(len(campaigns)),
            "eligible": int((campaigns.action == "ELIGIBLE").sum()),
            "review": int((campaigns.action == "REVIEW").sum()),
            "hold_current": int((campaigns.action == "HOLD_CURRENT").sum()),
        },
        "campaigns_requiring_constraint_rerun": campaigns.loc[
            campaigns.action != "ELIGIBLE", "campaign_id"
        ].astype(str).tolist(),
        "important": (
            "Do not manually replace held campaign budgets after optimization because that "
            "breaks total-budget optimality. Freeze/restrict them in a new optimization run."
        ),
    }
    return campaigns, summary
