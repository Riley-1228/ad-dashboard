
from pathlib import Path
import json
import tempfile
import pandas as pd

from optimization_safety_gate import GateConfig, evaluate_independent_validation


def test_independent_validation_pass():
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "aggregate.csv"
        pd.DataFrame(
            [
                {
                    "strategy": "V1",
                    "cases": 18,
                    "mean_lift_vs_current_pct": -1.5,
                    "mean_oracle_gap_pct": 2.3,
                    "pct_cases_beating_current": 0.0,
                },
                {
                    "strategy": "V2",
                    "cases": 18,
                    "mean_lift_vs_current_pct": 0.65,
                    "mean_oracle_gap_pct": 0.13,
                    "pct_cases_beating_current": 100.0,
                },
            ]
        ).to_csv(p, index=False)
        result = evaluate_independent_validation(p, GateConfig())
        assert result["passed"] is True


def test_independent_validation_blocks_weak_model():
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "aggregate.csv"
        pd.DataFrame(
            [
                {
                    "strategy": "V2",
                    "cases": 18,
                    "mean_lift_vs_current_pct": -0.1,
                    "mean_oracle_gap_pct": 1.2,
                    "pct_cases_beating_current": 50.0,
                }
            ]
        ).to_csv(p, index=False)
        result = evaluate_independent_validation(p, GateConfig())
        assert result["passed"] is False
