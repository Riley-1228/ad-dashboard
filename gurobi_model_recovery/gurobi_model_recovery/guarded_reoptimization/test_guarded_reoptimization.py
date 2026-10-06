
import pandas as pd
import pytest

from guarded_reoptimization import GuardrailConfig, build_guarded_bounds, check_budget_feasibility


def _decisions():
    return pd.DataFrame([
        {"campaign_id":"C01","action":"ELIGIBLE","current_budget":100.0},
        {"campaign_id":"C02","action":"REVIEW","current_budget":200.0},
        {"campaign_id":"C03","action":"HOLD_CURRENT","current_budget":300.0},
    ])


def test_strict_freezes_review_and_hold():
    bounds = {"C01":(70.0,130.0),"C02":(140.0,260.0),"C03":(210.0,390.0)}
    result, notes = build_guarded_bounds(
        _decisions(), bounds, GuardrailConfig(review_policy="freeze")
    )
    assert result["C01"] == (70.0,130.0)
    assert result["C02"] == (200.0,200.0)
    assert result["C03"] == (300.0,300.0)


def test_review_restrict_intersects_existing_bounds():
    bounds = {"C01":(70.0,130.0),"C02":(195.0,260.0),"C03":(210.0,390.0)}
    result, _ = build_guarded_bounds(
        _decisions(),
        bounds,
        GuardrailConfig(review_policy="restrict", review_max_change_pct=0.10),
    )
    assert result["C02"] == (195.0,220.00000000000003)
    assert result["C03"] == (300.0,300.0)


def test_infeasible_total_budget_blocks():
    with pytest.raises(ValueError):
        check_budget_feasibility({"C01":(100.0,100.0),"C02":(200.0,200.0)}, 400.0)
