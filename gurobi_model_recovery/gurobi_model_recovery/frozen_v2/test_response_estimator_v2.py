"""V2 tests: synthetic fixtures here are separate from the uploaded benchmark.
Passing tests establishes implementation checks, not real advertising accuracy.
The optional Gurobi test reports SKIPPED if no local solver/license is available.
"""
from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

import response_estimator_v2 as v2
import run_v2 as runner


@pytest.fixture(scope="module")
def observations():
    rng=np.random.default_rng(42017)
    dates=pd.date_range("2023-02-15",periods=260)
    spend=rng.uniform(60000,750000,len(dates))
    phase=2*np.pi*np.arange(len(dates))/365.2425
    factor=np.exp(0.18*np.sin(phase)-0.09*np.cos(phase))
    revenue=2_400_000*(-np.expm1(-spend/250000))*factor
    revenue*=np.exp(rng.normal(0,0.025,len(dates)))
    return pd.DataFrame({"date":dates,"campaign_id":"FixtureA","campaign_name":"Independent fixture",
                         "spend":spend,"revenue":revenue})


@pytest.fixture(scope="module")
def cfg():
    return v2.V2Config(stability_folds=0,start_kappas=(0.3,2.0),max_nfev=500)


@pytest.fixture(scope="module")
def fitted(observations,cfg):
    return v2.ResponseEstimatorV2(cfg).fit_campaign(observations.iloc[:210])


@pytest.mark.parametrize("name,value",[("lambda_level",-1),("lambda_shape",float("nan")),
                                     ("robust_delta",0),("lambda_calendar",-0.1)])
def test_invalid_config(name,value):
    with pytest.raises(ValueError):
        v2.V2Config(**{name:value})


def test_soft_loss_is_implemented_exactly():
    e=np.array([-20,-.3,0,.1,7.0]);d=.15
    expected=d*d*2*(np.sqrt(1+(e/d)**2)-1)
    np.testing.assert_allclose(v2.soft_l1_residuals(e,d)**2,expected,atol=1e-12)


def test_soft_loss_linear_near_zero():
    e=np.array([-1e-9,0,1e-9])
    np.testing.assert_allclose(v2.soft_l1_residuals(e,.15),e,atol=1e-17)


@pytest.mark.parametrize("kind",["negative_spend","nan_revenue","duplicate","multiple_accounts","timestamp"])
def test_bad_observations_rejected(observations,kind):
    df=observations.copy()
    if kind=="negative_spend":df.loc[0,"spend"]=-1
    if kind=="nan_revenue":df.loc[0,"revenue"]=np.nan
    if kind=="duplicate":df=pd.concat([df,df.iloc[[0]]],ignore_index=True)
    if kind=="multiple_accounts":df["account_id"]="a";df.loc[0,"account_id"]="b"
    if kind=="timestamp":df.loc[0,"date"]+=pd.Timedelta(hours=1)
    with pytest.raises(ValueError):v2.validate_observations(df)


def test_dates_split_no_leakage(observations):
    tr,va=v2.chronological_split(observations,.8)
    assert len(tr)==208 and len(va)==52
    assert tr.date.max()<va.date.min()
    assert set(tr.date).isdisjoint(va.date)


def test_validation_outcomes_never_enter_fit(observations,cfg,fitted):
    # fit_all API accepts training data only; no hidden use of validation labels.
    changed=observations.copy();changed.loc[210:,"revenue"]*=10000
    new=v2.ResponseEstimatorV2(cfg).fit_campaign(changed.iloc[:210])
    assert new.kappa==pytest.approx(fitted.kappa,rel=1e-12)
    assert new.level_at_reference==pytest.approx(fitted.level_at_reference,rel=1e-12)
    np.testing.assert_allclose(new.calendar_coefficients,fitted.calendar_coefficients,rtol=1e-12)


def test_training_only_calendar_center(observations,fitted):
    expected=v2.calendar_matrix(observations.iloc[:210].date,fitted.feature_names).mean(axis=0)
    np.testing.assert_allclose(expected,fitted.feature_center)
    assert fitted.spend_scale==pytest.approx(observations.iloc[:210].spend.mean())


def test_extra_hidden_columns_ignored(observations,cfg,fitted):
    df=observations.iloc[:210].copy()
    df["alpha_revenue"]=999999999;df["beta_revenue"]=0.0099;df["oracle_budget"]=1
    got=v2.ResponseEstimatorV2(cfg).fit_campaign(df)
    assert got.kappa==pytest.approx(fitted.kappa,rel=1e-12)
    assert got.level_at_reference==pytest.approx(fitted.level_at_reference,rel=1e-12)


def test_supported_fit(observations,fitted):
    assert fitted.success
    assert fitted.mode=="calendar_robust_saturation"
    assert set(fitted.feature_names)=={"annual_sin","annual_cos",*[f"weekday_{i}" for i in range(1,7)]}
    pred=fitted.predict(observations.spend,observations.date)
    assert np.isfinite(pred).all() and (pred>=0).all()
    assert "OBSERVATIONAL_NOT_CAUSALLY_IDENTIFIED" in fitted.warnings


def test_loss_sum_consistency(fitted):
    assert fitted.objective==pytest.approx(fitted.robust_data_loss+fitted.regularization_loss,abs=1e-10)


def test_saturation_shape(observations,fitted):
    b,r,m,a=v2.pwl_arrays(fitted,10000,2000000,observations.date,80)
    assert (np.diff(b)>0).all() and (r>=0).all()
    assert m.min()>=0 and np.max(np.diff(m))<=1e-8
    for x in b[::7]:
        # Concave PWL hypograph = minimum of affine segment extensions.
        assert np.min(m*x+a)==pytest.approx(np.interp(x,b,r),rel=1e-9,abs=1e-5)


def test_zero_spend_prediction(observations,fitted):
    np.testing.assert_allclose(fitted.predict(np.zeros(len(observations)),observations.date),0)


def test_representative_is_calendar_average(observations,fitted):
    x=250000.0
    expected=fitted.predict(np.full(len(observations),x),observations.date).mean()
    assert float(fitted.representative_revenue(x,observations.date))==pytest.approx(expected)


def test_analytic_marginal_matches_finite_difference(observations,fitted):
    x=280000.;h=0.1
    left=fitted.representative_revenue(x-h,observations.date)
    right=fitted.representative_revenue(x+h,observations.date)
    assert float(fitted.representative_slope(x,observations.date))==pytest.approx((right-left)/(2*h),rel=1e-7)


def test_near_breakpoint_both_sides():
    b=np.array([0,100000,200000]);m=np.array([8.,2.])
    assert v2.one_sided_marginal_roas(b,m,100000+1e-8)==(800.,200.)
    assert v2.one_sided_marginal_roas(b,m,100000-1e-8)==(800.,200.)


def test_endpoint_derivative_is_explicitly_missing():
    assert v2.one_sided_marginal_roas([0,100,200],[8,2],0)==(None,800.)
    assert v2.one_sided_marginal_roas([0,100,200],[8,2],200)==(200.,None)


def test_marginal_rejects_outside():
    with pytest.raises(ValueError):v2.one_sided_marginal_roas([0,100],[2],201)


@pytest.mark.parametrize("case",["constant_spend","zero_revenue","too_short"])
def test_fallback_is_not_success(observations,cfg,case):
    df=observations.copy()
    if case=="constant_spend":df["spend"]=200000.
    if case=="zero_revenue":df["revenue"]=0.
    if case=="too_short":df=df.iloc[:12]
    fit=v2.ResponseEstimatorV2(cfg).fit_campaign(df)
    assert not fit.success and fit.mode=="fallback_hold_current"
    assert (fit.representative_slope([1,2,3],df.date)==0).all()


def test_fallback_fixes_budget_for_shared_comparison(observations,cfg):
    df=observations.copy();df["spend"]=200000.
    fit=v2.ResponseEstimatorV2(cfg).fit_campaign(df)
    bounds,flags=runner.operational_bounds({"FixtureA":(10000,800000)},
                       {"FixtureA":fit},{"FixtureA":200000},.3,"review")
    assert bounds["FixtureA"]==(200000,200000)
    assert flags


def test_support_restriction_explicit(observations,fitted):
    b,flags=runner.operational_bounds({"FixtureA":(1000,2000000)},
              {"FixtureA":fitted},{"FixtureA":fitted.spend_scale},None,"restrict")
    assert b["FixtureA"]==fitted.observed_support


def test_infeasible_bounds_not_relaxed(fitted):
    with pytest.raises(ValueError):
        runner.operational_bounds({"FixtureA":(1,2)},{"FixtureA":fitted},{"FixtureA":200000},.3,"review")


def test_allocation_total_checked():
    with pytest.raises(ValueError):runner.check_allocation({"a":5},{"a":(0,10)},6)
    runner.check_allocation({"a":6},{"a":(0,10)},6)


def test_currency_scaling_invariance(observations,cfg,fitted):
    df=observations.iloc[:210].copy();df["spend"]/=1000.;df["revenue"]/=1000.
    got=v2.ResponseEstimatorV2(cfg).fit_campaign(df)
    assert got.kappa==pytest.approx(fitted.kappa,rel=2e-4)
    assert got.level_at_reference*1000==pytest.approx(fitted.level_at_reference,rel=2e-4)


def test_metrics_not_forced_positive():
    got=v2.regression_metrics([1,2,3],[10,10,10],2)
    assert got["r2"]<0 and got["rmse_gain_vs_train_mean_pct"]<0


def test_stability_refits_only_training(observations,cfg):
    short=observations.iloc[:120]
    estimator=v2.ResponseEstimatorV2(replace(cfg,stability_folds=2))
    f=estimator.fit_campaign(short)
    table=estimator.slope_stability(short,f,short.date)
    assert len(table)==6
    assert table.omitted_block.nunique()==2
    assert table.refit_success.all()


def test_json_no_nan(tmp_path):
    p=tmp_path/"x.json";runner.save_json(p,{"a":np.nan,"x":np.array([1,2])})
    assert json.loads(p.read_text())=={"a":None,"x":[1,2]}


def test_loader_does_not_read_hidden_fields(tmp_path,observations):
    p=tmp_path/"obs.csv";df=observations.copy();df["oracle_budget"]=1;df.to_csv(p,index=False)
    assert "oracle_budget" not in v2.load_observations(p)


def test_cli_preserves_default_scenario():
    args=runner.make_parser().parse_args([])
    assert args.mode=="diagnostics" and args.max_change==.3 and args.lambda_value==.01
    assert args.support_policy=="review"


@pytest.mark.gurobi
def test_v2_curves_use_existing_gurobi_lp(observations,fitted):
    gp=pytest.importorskip("gurobipy")
    try:
        import naver_budget_optimizer as m
    except ImportError:
        pytest.skip("Existing V1 module not next to the new files")
    try:
        env=gp.Env(empty=True);env.setParam("OutputFlag",0);env.start()
    except gp.GurobiError as exc:
        pytest.skip(f"Local Gurobi environment unavailable: {exc}")
    env.dispose()  # Do not keep a second license session open during the runner test.
    b,r,s,a=v2.pwl_arrays(fitted,10000,800000,observations.date,20)
    c=m.PWLCurve("FixtureA",b,r,s,a,fitted.observed_support,10000.,800000.,False,0.)
    curves={"FixtureA":c};bounds={"FixtureA":(10000.,800000.)}
    table,port,info=runner.run_gurobi(m,curves,{"FixtureA":250000.},250000.,
                     {"FixtureA":"Fixture"},{"FixtureA":1000.},{"FixtureA":300.},bounds,
                     m.OptimizerConfig(max_budget_change_pct=.3,sensitivity_lambdas=[]))
    assert info["is_optimal"] and info["num_integer_variables"]==0
    assert port.is_feasible.all()
    assert table.optimized_budget.to_numpy()==pytest.approx(np.full(4,250000.))
