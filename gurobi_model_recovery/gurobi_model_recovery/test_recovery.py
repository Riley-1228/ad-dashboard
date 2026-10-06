"""Additional recovery regressions. Reference LP checks are NOT Gurobi tests."""
from dataclasses import replace
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from scipy.optimize import linprog
import naver_budget_optimizer as m
from test_naver_budget_optimizer import make_gurobi_env
from test_naver_budget_optimizer import make_synthetic_df, make_budget_bounds, make_simple_pwl_curves, CAMPAIGNS, CAMPAIGN_NAMES


def split_fixture():
    df=make_synthetic_df()
    return m.DataLoader('').split(df,0.8)


def test_residual_squares_equal_reported_mean_objective(monkeypatch):
    captured=[]
    real=m.least_squares
    def checked(fun,x0,**kwargs):
        result=real(fun,x0,**kwargs)
        captured.append(float(np.dot(fun(result.x),fun(result.x))))
        return result
    monkeypatch.setattr(m,'least_squares',checked)
    tr,va=split_fixture()
    fits=m.ResponseEstimator(m.OptimizerConfig()).fit_all(tr,va)
    for fit,loss in zip(fits.values(),captured):
        assert fit.success
        assert fit.train_loss_data+fit.train_loss_reg == pytest.approx(loss,rel=1e-9,abs=1e-12)


def test_repeating_training_rows_does_not_change_mean_loss_fit():
    tr,va=split_fixture();est=m.ResponseEstimator(m.OptimizerConfig())
    a=est.fit_all(tr,va);b=est.fit_all(pd.concat([tr,tr,tr],ignore_index=True),va)
    for cid in a:
        assert a[cid].alpha_hat == pytest.approx(b[cid].alpha_hat,rel=1e-5)
        assert a[cid].beta_hat == pytest.approx(b[cid].beta_hat,rel=1e-5)


def test_failed_fit_cannot_be_used_for_pwl():
    tr,va=split_fixture();f=m.ResponseEstimator(m.OptimizerConfig()).fit_all(tr,va)['C_A']
    with pytest.raises(ValueError,match='failed response fit'):
        m.PWLBuilder(make_budget_bounds()).build(replace(f,success=False,message='test failure'),tr)


@pytest.mark.parametrize('fraction',[0,1,-.1,1.1])
def test_invalid_split_fractions(fraction):
    with pytest.raises(ValueError): m.DataLoader('').split(make_synthetic_df(),fraction)


def test_infinite_input_rejected(tmp_path):
    df=make_synthetic_df();df.loc[0,'spend']=np.inf;f=tmp_path/'bad.csv';df.to_csv(f,index=False)
    with pytest.raises(ValueError):m.DataLoader(str(f)).load()


def test_duplicate_grain_rejected(tmp_path):
    df=make_synthetic_df();df=pd.concat([df,df.iloc[:1]]);f=tmp_path/'bad.csv';df.to_csv(f,index=False)
    with pytest.raises(ValueError,match='Duplicate'):m.DataLoader(str(f)).load()


def test_current_outside_bounds_is_not_silently_feasible():
    bounds=make_budget_bounds();curves=make_simple_pwl_curves(bounds)
    current={'C_A':100000.,'C_B':500000.,'C_C':300000.}
    comp=m.StrategyComparator(curves,current,{c:200. for c in CAMPAIGNS},bounds,CAMPAIGN_NAMES,{c:1000 for c in CAMPAIGNS})
    rows,p=comp.evaluate_current(sum(current.values()))
    assert p.is_feasible
    assert p.strategy_name=='S1_Current_Projected'
    for row in rows:assert bounds[row.campaign_id][0]<=row.optimized_budget<=bounds[row.campaign_id][1]


def test_projection_reports_unresolved_budget_if_max_iter_zero():
    alloc,ok=m._project_to_bounds({'A':1.,'B':1.},10.,{'A':(0.,10.),'B':(0.,10.)},max_iter=0)
    assert not ok


def test_policy_file_contains_no_hidden_response_parameters():
    p=pd.read_csv(Path(__file__).parent/'campaign_budget_bounds.csv')
    assert set(p.columns)=={'campaign_id','min_daily_budget','max_daily_budget'}
    assert len(p)==12


@pytest.mark.parametrize('delta',[None,0.30])
def test_independent_highs_reference_lp_and_baselines(delta):
    """Cross-check mathematical LP with SciPy/HiGHS, NOT gurobipy execution."""
    bounds=make_budget_bounds();curves=make_simple_pwl_curves(bounds,n_pts=20)
    current={'C_A':400000.,'C_B':250000.,'C_C':300000.};B=sum(current.values())
    eff=m.effective_bounds(curves,current,delta)
    comp=m.StrategyComparator(curves,current,{c:400. for c in CAMPAIGNS},eff,CAMPAIGN_NAMES,{c:10000. for c in CAMPAIGNS})
    n=len(CAMPAIGNS);a=[];rhs=[]
    for j,cid in enumerate(CAMPAIGNS):
        curve=curves[cid]
        for slope,intercept in zip(curve.slopes,curve.intercepts):
            row=np.zeros(2*n);row[j]=-slope;row[n+j]=1.;a.append(row);rhs.append(intercept)
    solved=linprog(np.r_[np.zeros(n),-np.ones(n)],A_ub=a,b_ub=rhs,
                   A_eq=[np.r_[np.ones(n),np.zeros(n)]],b_eq=[B],
                   bounds=[eff[c] for c in CAMPAIGNS]+[(0,None)]*n,method='highs')
    assert solved.success,solved.message
    assert abs(sum(solved.x[:n])-B)<1e-3
    for j,cid in enumerate(CAMPAIGNS):
        assert solved.x[n+j]==pytest.approx(np.interp(solved.x[j],curves[cid].breakpoints,curves[cid].revenues),abs=1e-3)
    for fn in (comp.evaluate_current,comp.evaluate_equal,comp.evaluate_roas_proportional):
        rows,p=fn(B);assert p.is_feasible
        for r in rows:assert eff[r.campaign_id][0]-1e-3<=r.optimized_budget<=eff[r.campaign_id][1]+1e-3
        assert -solved.fun>=p.expected_total_revenue-1e-3


def test_all_12_campaigns_fit_and_pwl_validate():
    root=Path(__file__).parent;loader=m.DataLoader(str(root/'naver_synthetic_performance.csv'))
    df=loader.load();tr,va=loader.split(df,.8)
    fits=m.ResponseEstimator(m.OptimizerConfig()).fit_all(tr,va)
    p=pd.read_csv(root/'campaign_budget_bounds.csv')
    bounds={r.campaign_id:(r.min_daily_budget,r.max_daily_budget) for r in p.itertuples()}
    curves=m.PWLBuilder(bounds).build_all(fits,tr)
    assert len(df)==4380 and len(curves)==12
    for c in curves.values():
        assert (np.diff(c.breakpoints)>0).all()
        assert (c.revenues>=0).all()
        assert (c.slopes>=-1e-9).all()
        assert (np.diff(c.slopes)<=1e-9).all()

@pytest.mark.gurobi
def test_marginal_roas_detects_near_breakpoint():
    bounds = make_budget_bounds()
    curves = make_simple_pwl_curves(
        bounds,
        n_pts=20,
    )

    current = {
        "C_A": 400000.0,
        "C_B": 250000.0,
        "C_C": 300000.0,
    }

    total_budget = sum(current.values())

    mean_aor = {
        "C_A": 10000.0,
        "C_B": 10000.0,
        "C_C": 10000.0,
    }

    config = m.OptimizerConfig(
        time_limit_sec=10.0,
    )

    with make_gurobi_env() as env:
        with m.BudgetOptimizer(
            env,
            config,
        ) as optimizer:
            optimizer.set_data(
                curves,
                current,
                total_budget,
                CAMPAIGN_NAMES,
                mean_aor,
            )

            cid = "C_A"
            curve = curves[cid]

            # Choose an interior breakpoint.
            k = 5
            exact_breakpoint = float(
                curve.breakpoints[k]
            )

            # Simulate the tiny floating-point deviation
            # that can occur in solver output.
            near_breakpoint = (
                exact_breakpoint + 1e-8
            )

            left, right = (
                optimizer._marginal_roas(
                    cid,
                    near_breakpoint,
                )
            )

            expected_left = (
                curve.slopes[k - 1] * 100.0
            )

            expected_right = (
                curve.slopes[k] * 100.0
            )

            assert left == pytest.approx(
                expected_left,
                rel=1e-10,
                abs=1e-8,
            )

            assert right == pytest.approx(
                expected_right,
                rel=1e-10,
                abs=1e-8,
            )