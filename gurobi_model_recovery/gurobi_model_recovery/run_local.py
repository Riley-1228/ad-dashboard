"""Reproducible local runner. Default = diagnostics only, no solver substitution."""
from __future__ import annotations
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import platform
import numpy as np
import pandas as pd
from naver_budget_optimizer import (
    DataLoader, OptimizerConfig, ResponseEstimator, PWLBuilder,
    StrategyComparator, effective_bounds, run_demonstration,
)

HERE = Path(__file__).resolve().parent


def json_safe(v):
    if isinstance(v, dict):
        return {str(k): json_safe(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [json_safe(x) for x in v]
    if isinstance(v, np.generic):
        return json_safe(v.item())
    if isinstance(v, float) and not math.isfinite(v):
        return None
    if isinstance(v, (Path, pd.Timestamp)):
        return str(v)
    return v


def save_json(path, value):
    path.write_text(json.dumps(json_safe(value), indent=2, ensure_ascii=False, allow_nan=False), encoding='utf-8')


def load_policy(path, campaigns):
    columns = ['campaign_id', 'min_daily_budget', 'max_daily_budget']
    policy = pd.read_csv(path, usecols=columns)
    if policy.campaign_id.isna().any() or policy.campaign_id.duplicated().any():
        raise ValueError('Missing/duplicate campaign IDs in budget policy')
    bounds = {r.campaign_id: (float(r.min_daily_budget), float(r.max_daily_budget))
              for r in policy.itertuples(index=False)}
    if set(bounds) != set(campaigns):
        raise ValueError('Budget-policy campaign IDs do not match observations')
    return bounds


def write_tables(out, fits, curves):
    pd.DataFrame([asdict(f) for f in fits.values()]).to_csv(
        out/'estimation_diagnostics.csv', index=False, encoding='utf-8-sig')
    points=[]
    for cid, c in curves.items():
        for k, (x,y) in enumerate(zip(c.breakpoints,c.revenues)):
            points.append({'campaign_id':cid,'breakpoint_index':k,'budget_KRW':x,
                           'expected_revenue_KRW':y,
                           'in_training_spend_support': c.observed_support[0] <= x <= c.observed_support[1],
                           'concavity_enforced':c.concavity_enforced})
    pd.DataFrame(points).to_csv(out/'pwl_breakpoints.csv',index=False,encoding='utf-8-sig')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['diagnostics','demo'], default='diagnostics')
    parser.add_argument('--performance',type=Path,default=HERE/'naver_synthetic_performance.csv')
    parser.add_argument('--bounds',type=Path,default=HERE/'campaign_budget_bounds.csv')
    parser.add_argument('--output',type=Path)
    parser.add_argument('--budget',type=float)
    parser.add_argument('--max-change',type=float,default=None)
    parser.add_argument(
        '--lambda-value',
        type=float,
        default=0.01,
        help='Use this value for both lambda_alpha and lambda_beta.',
    )
    parser.add_argument('--sensitivity', action='store_true')
    args = parser.parse_args()

    if not math.isfinite(args.lambda_value) or args.lambda_value < 0:
        parser.error('--lambda-value must be finite and non-negative.')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    out=args.output or HERE/'outputs'/f'{args.mode}_{stamp}'
    out.mkdir(parents=True,exist_ok=True)
    config = OptimizerConfig(
        lambda_alpha=args.lambda_value,
        lambda_beta=args.lambda_value,
        total_daily_budget=args.budget,
        max_budget_change_pct=args.max_change,
        sensitivity_lambdas=(
            [0, 0.001, 0.01, 0.1]
            if args.sensitivity
            else []
        ),
    )
    metadata={'mode':args.mode,'python':platform.python_version(),'config':asdict(config),
              'dataset_kind':'synthetic, not real advertising observations',
              'evaluation':'Full-dataset budget/reference demonstration; response fit uses first 80% of dates. Final 20% is validation, not an untouched final test.',
              'ground_truth_used_for_fitting':False,
              'policy_source':'Approved synthetic min/max budgets extracted to separate 3-column file.',
              'conversion_model':'AOR approximation; conversions/CPA are not independently validated.',
              'gurobi_executed':False}
    try:
        if args.mode=='diagnostics':
            loader=DataLoader(str(args.performance));df=loader.load();tr,va=loader.split(df,config.train_fraction)
            fits=ResponseEstimator(config).fit_all(tr,va)
            bounds=load_policy(args.bounds,fits)
            curves=PWLBuilder(bounds,config.n_pwl_breakpoints,0.10).build_all(fits,tr)
            current=loader.campaign_mean_spend(df)
            B=args.budget if args.budget is not None else sum(current.values())
            eff=effective_bounds(curves,current,args.max_change)
            if not np.isfinite(B) or not sum(v[0] for v in eff.values()) <= B <= sum(v[1] for v in eff.values()):
                raise ValueError('Budget is infeasible under the effective bounds')
            write_tables(out,fits,curves)
            count_zero=int(((df.conversions==0)&(df.revenue>0)).sum())
            metadata.update(status='DIAGNOSTICS_COMPLETED_NOT_SOLVED',rows=len(df),campaigns=len(fits),
                            dates=int(df.date.nunique()),training_dates=int(tr.date.nunique()),
                            validation_dates=int(va.date.nunique()),
                            total_daily_budget_KRW=B,
                            fits_converged=sum(f.success for f in fits.values()),
                            zero_conversion_positive_revenue_rows=count_zero,
                            expected_core_lp_variables=2*len(curves),
                            expected_core_lp_constraints=1+sum(len(c.slopes) for c in curves.values()),
                            limitations=['Narrow spend coverage','Shared spend/revenue seasonality confounding',
                                         '10% extrapolation adjustment is a heuristic, not a confidence bound',
                                         'Fixed prior and 0.01 regularization are not tuned for accuracy'])
            print('[DONE] Diagnostics only. Gurobi was NOT executed.')
            print(f'Rows={len(df)}, campaigns={len(fits)}, fitted={metadata["fits_converged"]}, B={B:,.2f}')
        else:
            result=run_demonstration(str(args.performance),config=config,budget_bounds_filepath=str(args.bounds))
            write_tables(out,result['fits'],result['pwl_curves'])
            tables=[]
            for key in ['s1_results','s2_results','s3_results','gurobi_campaign_results']:
                label={'s1_results':'Current','s2_results':'Equal','s3_results':'Historical_ROAS',
                       'gurobi_campaign_results':'Gurobi_Optimized'}[key]
                for item in result[key]:
                    record=asdict(item);record['strategy']=label
                    record['conversion_kpis_approximate']=True;tables.append(record)
            pd.DataFrame(tables).to_csv(out/'campaign_allocations.csv',index=False,encoding='utf-8-sig')
            pd.DataFrame([asdict(p) for p in result['all_portfolios']]).to_csv(
                out/'strategy_comparison.csv',index=False,encoding='utf-8-sig')
            feasible=[p.expected_total_revenue for p in result['all_portfolios'][:-1] if p.is_feasible]
            opt=result['gurobi_portfolio'];tol=max(1e-3,abs(opt.expected_total_revenue)*1e-7)
            if feasible and opt.expected_total_revenue < max(feasible)-tol:
                raise RuntimeError('Optimized estimated revenue is below a feasible baseline')
            if abs(opt.total_budget-result['total_budget']) > 1e-3:
                raise RuntimeError('Budget conservation failed')
            if result['solver_metadata']['max_hypograph_error']>1.0:
                raise RuntimeError('Hypograph tightness check failed')
            if not result['sensitivity_df'].empty:
                result['sensitivity_df'].to_csv(out/'fit_sensitivity.csv',index=False,encoding='utf-8-sig')
            metadata.update(status='GUROBI_DEMO_COMPLETED',gurobi_executed=True,
                            solver=result['solver_metadata'],total_daily_budget_KRW=result['total_budget'])
            print('[DONE] Gurobi demo completed. This is not a predictive-accuracy certificate.')
        save_json(out/'run_metadata.json',metadata)
        print('Output folder:',out.resolve())
        return 0
    except Exception as exc:
        metadata.update(status='BLOCKED_OR_FAILED',error=f'{type(exc).__name__}: {exc}')
        save_json(out/'run_metadata.json',metadata)
        print('[BLOCKED OR FAILED]',exc)
        print('See:',out/'run_metadata.json')
        return 2


if __name__=='__main__':
    raise SystemExit(main())
