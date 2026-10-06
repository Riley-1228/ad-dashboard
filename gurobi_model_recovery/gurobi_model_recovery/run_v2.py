"""Standalone V2 experiment. Adds outputs_v2 only; never overwrites V1.

Default: diagnostics (no solver). Demo explicitly uses the existing V1
BudgetOptimizer Gurobi LP class. Never substitutes another solver.
Only observed performance and approved business bounds are read; no truth file.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, replace
from datetime import datetime, timezone
import hashlib
import importlib
from importlib import metadata as package_metadata
import json
import math
from pathlib import Path
import platform
import sys
import time

import numpy as np
import pandas as pd
from response_estimator_v2 import (
    VERSION, V2Config, ResponseEstimatorV2, load_observations,
    chronological_split, pwl_arrays, regression_metrics, one_sided_marginal_roas,
)

HERE = Path(__file__).resolve().parent


def json_safe(obj):
    if isinstance(obj, dict):
        return {str(k):json_safe(v) for k,v in obj.items()}
    if isinstance(obj, (list,tuple)):
        return [json_safe(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return json_safe(obj.tolist())
    if isinstance(obj, np.generic):
        return json_safe(obj.item())
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    if isinstance(obj, (Path,pd.Timestamp)):
        return str(obj)
    return obj


def save_json(path, content):
    Path(path).write_text(json.dumps(json_safe(content), indent=2, ensure_ascii=False,
                                    allow_nan=False), encoding="utf-8")


def save_csv(path, table):
    table.to_csv(path, index=False, encoding="utf-8-sig")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_bounds(path, campaigns):
    df = pd.read_csv(path, usecols=["campaign_id","min_daily_budget","max_daily_budget"])
    if df.isna().any().any() or df.campaign_id.duplicated().any():
        raise ValueError("Missing or duplicate budget-policy rows")
    bounds = {str(r.campaign_id):(float(r.min_daily_budget),float(r.max_daily_budget))
              for r in df.itertuples(index=False)}
    if set(bounds)!=set(campaigns):
        raise ValueError("Budget-policy campaign IDs differ from performance IDs")
    if any(not np.isfinite(v).all() or not 0<=v[0]<v[1] for v in bounds.values()):
        raise ValueError("Require finite business bounds 0 <= lower < upper")
    return bounds


def operational_bounds(business, fits, current, delta, support_policy):
    """Shared V1/V2 comparison region. Never relax an infeasible policy silently."""
    if delta is not None and (not math.isfinite(delta) or not 0<=delta<=1):
        raise ValueError("max-change must be a fraction in [0,1]")
    result = {}; flags = []
    for cid,(lo,hi) in business.items():
        if delta is not None:
            lo,hi = max(lo,(1-delta)*current[cid]),min(hi,(1+delta)*current[cid])
        if support_policy=="restrict":
            a,b = fits[cid].observed_support
            lo,hi = max(lo,a),min(hi,b)
        if lo>hi+1e-8:
            raise ValueError(f"{cid}: business/change/support bounds conflict")
        if fits[cid].mode=="fallback_hold_current":
            if not lo-1e-8 <= current[cid] <= hi+1e-8:
                raise ValueError(f"{cid}: cannot hold current within selected bounds")
            lo=hi=current[cid]
            flags.append(f"{cid}: fallback -> budget fixed at current for BOTH models")
        result[cid]=(float(lo),float(hi))
    return result,flags


def check_allocation(allocation, effective, budget):
    if set(allocation)!=set(effective):
        raise ValueError("Allocation campaign IDs do not match")
    vals=np.array(list(allocation.values()),float)
    if not np.isfinite(vals).all():
        raise ValueError("Nonfinite allocated budget")
    if abs(sum(allocation.values())-budget)>0.01:
        raise ValueError("Budget conservation error exceeds 0.01 KRW")
    for cid,x in allocation.items():
        lo,hi=effective[cid]
        if x<lo-0.01 or x>hi+0.01:
            raise ValueError(f"{cid}: allocated budget violates shared effective bounds")


def attach_bounds(curves, effective):
    # Keep interpolation grid; variable domain can be a strict subset or a singleton.
    return {cid:replace(c, budget_lb=effective[cid][0], budget_ub=effective[cid][1])
            for cid,c in curves.items()}


def compare_validation(train, val, fits, v1fits):
    rows=[]; predictions=[]
    for cid,fit in sorted(fits.items()):
        va=val[val.campaign_id==cid]; tr=train[train.campaign_id==cid]
        y=va.revenue.to_numpy(float); x=va.spend.to_numpy(float)
        p2=fit.predict(x,va.date)
        m2=regression_metrics(y,p2,float(tr.revenue.mean()))
        f1=v1fits[cid]
        if f1 is not None and f1.success:
            p1=f1.alpha_hat*(-np.expm1(-f1.beta_hat*x))
            m1=regression_metrics(y,p1,float(tr.revenue.mean()))
        else:
            p1=np.full_like(y,np.nan)
            m1={key:float("nan") for key in m2}
        rows.append({"campaign_id":cid, "n_validation":len(va),
                     "v1_success":bool(f1 is not None and f1.success),
                     "v2_success":fit.success,"v2_mode":fit.mode,
                     **{f"v1_{k}":v for k,v in m1.items()},
                     **{f"v2_{k}":v for k,v in m2.items()},
                     "rmse_change_v2_vs_v1_pct":100*(m2["rmse_krw"]-m1["rmse_krw"])/m1["rmse_krw"]
                     if m1["rmse_krw"]>0 else float("nan")})
        for d,actual,a,b in zip(va.date,y,p1,p2):
            predictions.append({"campaign_id":cid,"date":d.date().isoformat(),
                                "actual_revenue_krw":actual,"v1_prediction_krw":a,"v2_prediction_krw":b})
    return pd.DataFrame(rows),pd.DataFrame(predictions)


def curves_frame(curves, effective, reference_label):
    rows=[]
    for cid,c in sorted(curves.items()):
        for k,(x,y) in enumerate(zip(c.breakpoints,c.revenues)):
            rows.append({"campaign_id":cid,"breakpoint_index":k,"budget_KRW":x,
                         "expected_revenue_KRW":y,
                         "in_training_spend_support":c.observed_support[0]<=x<=c.observed_support[1],
                         "within_effective_bounds":effective[cid][0]<=x<=effective[cid][1],
                         "effective_lower_krw":effective[cid][0],"effective_upper_krw":effective[cid][1],
                         "calendar_reference":reference_label,"concavity_enforced":c.concavity_enforced})
    return pd.DataFrame(rows)


def run_gurobi(m, curves, current, budget, names, aor, vw_roas, effective, config):
    """Use verified constructor/env/set_data signatures; no test-helper imports."""
    m.require_gurobi()
    tic=time.perf_counter()
    with m.gp.Env(empty=True) as env:
        env.setParam("OutputFlag",0);env.start()
        with m.BudgetOptimizer(env,config) as opt:
            opt.set_data(pwl_curves=curves, current_budgets=current,total_budget=budget,
                         campaign_names=names,mean_aor=aor)
            opt.build_model(); model=opt.solve()
            info={"solver":"Gurobi","status_code":int(model.Status),
                  "version":list(m.gp.gurobi.version()),"num_variables":int(model.NumVars),
                  "num_constraints":int(model.NumConstrs),"num_integer_variables":int(model.NumIntVars),
                  "num_sos":int(model.NumSOS),"num_general_constraints":int(model.NumGenConstrs),
                  "is_optimal":model.Status==m.GRB.OPTIMAL}
            if not info["is_optimal"]:
                raise RuntimeError(f"Gurobi did not certify OPTIMAL; status={model.Status}")
            optimum=opt.get_campaign_results()
            # Do not rely on V1's exact-equality diagnostic knot handling.
            for r in optimum:
                c=curves[r.campaign_id]
                left,right=one_sided_marginal_roas(c.breakpoints,c.slopes,r.optimized_budget)
                r.marginal_roas_left=float("nan") if left is None else left
                r.marginal_roas_right=float("nan") if right is None else right
            portfolio=opt.get_portfolio_result(optimum,"S4_Gurobi_Optimized",time.perf_counter()-tic)
            info["objective_value"]=float(model.ObjVal)
            info["max_hypograph_error"]=max(abs(opt.y_vars[cid].X-
                 np.interp(opt.x_vars[cid].X,c.breakpoints,c.revenues)) for cid,c in curves.items())
            if info["max_hypograph_error"]>0.1:
                raise RuntimeError("Hypograph tightness error exceeds 0.1 KRW")
    comparator=m.StrategyComparator(curves,current,vw_roas,effective,names,aor)
    baseline=[comparator.evaluate_current(budget),comparator.evaluate_equal(budget),
              comparator.evaluate_roas_proportional(budget)]
    portfolios=[p for _,p in baseline]+[portfolio]
    comparator.add_lift_vs_current(portfolios,portfolios[0])
    feasible=[p.expected_total_revenue for p in portfolios[:-1] if p.is_feasible]
    if feasible and portfolio.expected_total_revenue < max(feasible)-max(0.01,budget*1e-7):
        raise RuntimeError("Optimized objective below a feasible baseline")
    records=[]
    for label,results in zip(["Current","Equal","Historical_ROAS","Gurobi_Optimized"],
                             [r for r,_ in baseline]+[optimum]):
        p=portfolios[["Current","Equal","Historical_ROAS","Gurobi_Optimized"].index(label)]
        if p.is_feasible:
            check_allocation({r.campaign_id:r.optimized_budget for r in results},effective,budget)
        for r in results:
            row=asdict(r);cid=r.campaign_id;lo,hi=effective[cid]
            row.update(strategy=label,conversion_kpis_approximate=True,is_feasible=p.is_feasible,
                       effective_lower_krw=lo,effective_upper_krw=hi,
                       at_effective_lower=abs(r.optimized_budget-lo)<0.01,
                       at_effective_upper=abs(r.optimized_budget-hi)<0.01)
            records.append(row)
    return pd.DataFrame(records),pd.DataFrame([asdict(p) for p in portfolios]),info


def make_parser():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mode",choices=["diagnostics","demo"],default="diagnostics")
    p.add_argument("--performance",type=Path,default=HERE/"naver_synthetic_performance.csv")
    p.add_argument("--bounds",type=Path,default=HERE/"campaign_budget_bounds.csv")
    p.add_argument("--max-change",type=float,default=0.30)
    p.add_argument("--budget",type=float)
    p.add_argument("--lambda-value",type=float,default=0.01,
                   help="Numeric default for V1 and V2; different parameterizations imply different penalties.")
    p.add_argument("--train-fraction",type=float,default=0.8)
    p.add_argument("--stability-folds",type=int,default=4)
    p.add_argument("--support-policy",choices=["review","restrict"],default="review")
    p.add_argument("--reference",choices=["full_demo","training"],default="full_demo")
    p.add_argument("--output-root",type=Path,default=HERE/"outputs_v2")
    return p


def main(argv=None):
    args=make_parser().parse_args(argv)
    cfg=V2Config(lambda_level=args.lambda_value,lambda_shape=args.lambda_value,
                 stability_folds=args.stability_folds)
    stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    out=args.output_root/f"{args.mode}_{stamp}"
    out.mkdir(parents=True,exist_ok=False)
    meta={"version":VERSION,"mode":args.mode,"status":"STARTED","production_approved":False,
          "python":platform.python_version(),"config_v2":asdict(cfg),
          "config_experiment":vars(args),"ground_truth_used_for_fitting":False,
          "ground_truth_evaluated":False,"gurobi_executed":False,
          "unrecorded_promotions_inferred":False,"inputs_unchanged":False,
          "warnings":[],"limitations":[
              "Development dataset and prior ground truth have already been inspected; not an untouched test.",
              "Calendar controls and robust residual loss do not establish causal effects or remove all confounding.",
              "Robust fitted location is a revenue proxy, not guaranteed unbiased conditional mean.",
              "V2 log-reference-level/log-shape penalties differ from V1 alpha/beta relative penalties.",
              "V1 uses original adjusted PWL; V2 uses plain concave PWL. Pipeline comparison is not pure estimator ablation.",
              "Calendar mean for a fixed daily allocation is a scenario assumption, not a live platform budget schedule.",
              "Training-block deletion slope ranges are sensitivity diagnostics, not confidence intervals.",
              "No ground-truth comparison or real advertising writes are performed.",
          ]}
    inputs={}
    try:
        m=importlib.import_module("naver_budget_optimizer")
        for name in ("OptimizerConfig","ResponseEstimator","PWLBuilder","PWLCurve","BudgetOptimizer","StrategyComparator"):
            if not hasattr(m,name):
                raise RuntimeError(f"Incompatible V1 file: missing {name}")
        for path in [args.performance,args.bounds,Path(m.__file__),Path(__file__),HERE/"response_estimator_v2.py"]:
            inputs[str(path.resolve())]=sha256(path)
        meta["input_sha256"]=inputs
        meta["package_versions"]={n:package_metadata.version(n) for n in ["numpy","pandas","scipy"]}
        df=load_observations(args.performance)
        # No implicit zero-fill: only the supplied dense daily panel is accepted for this runner.
        date_count=df.date.nunique()
        if any(n!=date_count for n in df.groupby("campaign_id").size()):
            raise ValueError("Incomplete campaign/date panel: resolve missing rows explicitly")
        if len(pd.date_range(df.date.min(),df.date.max(),freq="D"))!=date_count:
            raise ValueError("Missing full calendar days: resolve explicitly, do not silently zero-fill")
        train,val=chronological_split(df,args.train_fraction)
        ref=df if args.reference=="full_demo" else train
        ref_dates=np.sort(ref.date.unique())
        current={str(k):float(v) for k,v in ref.groupby("campaign_id").spend.mean().items()}
        B=float(args.budget) if args.budget is not None else sum(current.values())
        if not math.isfinite(B) or B<=0:
            raise ValueError("budget must be finite and positive")
        bounds=load_bounds(args.bounds,current)
        print(f"[1/4] Loaded {len(df)} rows; {len(current)} campaigns; B={B:,.2f}",flush=True)
        print("[2/4] Fitting V2 from training observations only...",flush=True)
        estimator=ResponseEstimatorV2(cfg);fits={};stabilities=[]
        for cid,tr in train.groupby("campaign_id",sort=True):
            fit=estimator.fit_campaign(tr);fits[str(cid)]=fit
            stabilities.append(estimator.slope_stability(tr,fit,ref_dates))
            print(f"  {cid}: {fit.mode}; training-block checks finished",flush=True)
        common,flags=operational_bounds(bounds,fits,current,args.max_change,args.support_policy)
        meta["warnings"]+=flags
        if not sum(x[0] for x in common.values())-0.001<=B<=sum(x[1] for x in common.values())+0.001:
            raise ValueError("Total budget infeasible under shared bounds; no automatic relaxation")
        v1cfg=m.OptimizerConfig(lambda_alpha=args.lambda_value,lambda_beta=args.lambda_value,
                                train_fraction=args.train_fraction,max_budget_change_pct=args.max_change,
                                sensitivity_lambdas=[],total_daily_budget=B)
        v1fits={}
        for cid in fits:
            try:
                v1fits[cid]=m.ResponseEstimator(v1cfg).fit_all(
                    train[train.campaign_id==cid],val[val.campaign_id==cid])[cid]
            except (ValueError, RuntimeError, FloatingPointError) as exc:
                v1fits[cid]=None
                meta["warnings"].append(f"V1/{cid}: FIT_UNAVAILABLE: {exc}")
        comp,predictions=compare_validation(train,val,fits,v1fits)
        save_csv(out/"validation_comparison.csv",comp)
        save_csv(out/"validation_predictions.csv",predictions)
        stability_table=pd.concat(stabilities,ignore_index=True)
        save_csv(out/"slope_stability_v2.csv",stability_table)
        stability_summary=[]
        for cid,f in sorted(fits.items()):
            sub=stability_table.loc[(stability_table.campaign_id==cid) &
                np.isclose(stability_table.probe_spend_krw,f.spend_scale)]
            good=sub.loc[sub.refit_success,"marginal_roas_pct"].to_numpy(float)
            spread=float(np.ptp(good)/max(abs(np.median(good)),1e-12)) if len(good)>=2 else np.nan
            stability_summary.append({"campaign_id":cid,"successful_refits":int(len(good)),
                "requested_refits":cfg.stability_folds,"slope_spread_ratio_at_reference":spread,
                "min_marginal_roas_pct":float(min(good)) if len(good) else np.nan,
                "max_marginal_roas_pct":float(max(good)) if len(good) else np.nan,
                "is_confidence_interval":False})
            if cfg.stability_folds and len(good)<cfg.stability_folds:
                meta["warnings"].append(f"{cid}: TRAINING_BLOCK_REFIT_FAILURE")
            if np.isfinite(spread) and spread>0.25:
                meta["warnings"].append(f"{cid}: TRAINING_BLOCK_SLOPE_SENSITIVE (heuristic 25% flag)")
        save_csv(out/"slope_stability_summary.csv",pd.DataFrame(stability_summary))
        diag=[];v2curves={}
        for cid,f in sorted(fits.items()):
            r=asdict(f);r["alpha_at_calendar_zero"]=f.alpha_at_calendar_zero;r["beta"]=f.beta
            r["reference_calendar_mean_factor"]=float(f.calendar_factor(ref_dates).mean())
            for key in ("feature_names","feature_center","calendar_coefficients","warnings","bounds_active"):
                r[key]=json.dumps(json_safe(r[key]))
            diag.append(r)
            b,y,s,a=pwl_arrays(f,*bounds[cid],ref_dates,20)
            v2curves[cid]=m.PWLCurve(cid,b,y,s,a,f.observed_support,*bounds[cid],False,0.0)
        save_csv(out/"fit_diagnostics_v2.csv",pd.DataFrame(diag))
        save_json(out/"fits_v2.json",{cid:asdict(f) for cid,f in fits.items()})
        save_csv(out/"pwl_breakpoints_v2.csv",curves_frame(v2curves,common,args.reference))
        for cid,f in fits.items():
            meta["warnings"] += [f"{cid}: {w}" for w in f.warnings]
        if (comp.v2_rmse_krw > comp.v1_rmse_krw).any():
            meta["warnings"].append("V2_HAS_CAMPAIGNS_WITH_WORSE_VALIDATION_RMSE; no forced improvement")
        meta.update(rows=len(df),campaigns=len(fits),training_dates=int(train.date.nunique()),
                    validation_dates=int(val.date.nunique()),total_daily_budget_KRW=B,
                    effective_bounds=common,fallback_campaigns=[c for c,f in fits.items() if not f.success],
                    training_start=str(train.date.min().date()),training_end=str(train.date.max().date()),
                    validation_start=str(val.date.min().date()),validation_end=str(val.date.max().date()),
                    reference_start=str(pd.Timestamp(ref_dates[0]).date()),
                    reference_end=str(pd.Timestamp(ref_dates[-1]).date()))
        print("[3/4] Diagnostics and PWL tables written.",flush=True)
        if args.mode=="demo":
            if any(f is None or not f.success for f in v1fits.values()):
                raise RuntimeError("V1 comparison fit failed; diagnostics saved, no solver run")
            v1curves=m.PWLBuilder(bounds,20,0.10).build_all(v1fits,train)
            names=ref.groupby("campaign_id").campaign_name.first().astype(str).to_dict()
            totals=ref.groupby("campaign_id")[["revenue","spend"]].sum()
            vw=(100*totals.revenue/totals.spend.replace(0,np.nan)).to_dict()
            if not np.isfinite(list(vw.values())).all():
                raise ValueError("Undefined historical ROAS; no silent baseline substitution")
            # Preserve V1's AOR definition for fair output comparison; never used in revenue fitting.
            if "conversions" in ref:
                conv=pd.to_numeric(ref.conversions,errors="raise")
                if not np.isfinite(conv).all() or (conv<0).any():
                    raise ValueError("Invalid conversions")
                good=ref.loc[conv>0].copy();good["_aor"]=good.revenue/good.conversions
                aor=good.groupby("campaign_id")._aor.mean().to_dict()
            else:
                aor={}
            aor={cid:float(aor.get(cid,float("nan"))) for cid in fits}
            print("[4/4] Solving paired V1/V2 Gurobi models with identical effective bounds...",flush=True)
            all_campaign={};all_port={};meta["solver"]={}
            for label,curves in [("V1",v1curves),("V2",v2curves)]:
                tab,port,info=run_gurobi(m,attach_bounds(curves,common),current,B,names,aor,vw,common,v1cfg)
                all_campaign[label]=tab;all_port[label]=port;meta["solver"][label]=info
                meta["gurobi_executed"]=True
                save_csv(out/f"campaign_allocations_{label.lower()}.csv",tab)
                save_csv(out/f"strategy_comparison_{label.lower()}.csv",port)
                for r in tab[tab.strategy=="Gurobi_Optimized"].itertuples():
                    if not r.is_in_observed_support:
                        meta["warnings"].append(f"{label}/{r.campaign_id}: OUTSIDE_TRAINING_SPEND_SUPPORT")
            a=all_campaign["V1"].query("strategy=='Gurobi_Optimized'").set_index("campaign_id")
            b=all_campaign["V2"].query("strategy=='Gurobi_Optimized'").set_index("campaign_id")
            change=pd.DataFrame({"current_budget":a.current_budget,"v1_budget":a.optimized_budget,
                                 "v2_budget":b.optimized_budget,"difference_krw":b.optimized_budget-a.optimized_budget})
            save_csv(out/"v1_v2_budget_comparison.csv",change.reset_index())
            cross=[]
            for evaluator,curves in [("V1",v1curves),("V2",v2curves)]:
                for label,allocation in [("Current",current),("V1_Optimized",a.optimized_budget.to_dict()),
                                          ("V2_Optimized",b.optimized_budget.to_dict())]:
                    feasible=all(common[c][0]-0.01<=allocation[c]<=common[c][1]+0.01 for c in curves)
                    feasible=feasible and abs(sum(allocation.values())-B)<0.01
                    value=sum(np.interp(allocation[c],curves[c].breakpoints,curves[c].revenues) for c in curves) if feasible else np.nan
                    cross.append({"evaluation_curve":evaluator,"allocation_source":label,
                                  "is_feasible":feasible,"estimated_revenue_krw":value,
                                  "is_independent_accuracy_test":False})
            save_csv(out/"cross_evaluation.csv",pd.DataFrame(cross))
            meta["status"]="V2_DEMO_COMPLETED_NOT_PRODUCTION_APPROVAL"
            print("[DONE] V2 Gurobi demo completed. This is not a predictive-accuracy certificate.")
        else:
            meta["status"]="V2_DIAGNOSTICS_COMPLETED_NOT_SOLVED"
            print("[DONE] V2 diagnostics completed. Gurobi was NOT executed.")
        if any(sha256(p)!=h for p,h in inputs.items()):
            raise RuntimeError("An input changed during execution")
        meta["inputs_unchanged"]=True
        for w in meta["warnings"]:
            print("[REVIEW]",w)
        save_json(out/"run_metadata_v2.json",meta)
        print("Output folder:",out.resolve())
        return 0
    except Exception as exc:
        meta["status"]="BLOCKED_OR_FAILED";meta["error"]=f"{type(exc).__name__}: {exc}"
        meta["inputs_unchanged"]=all(Path(p).is_file() and sha256(p)==h for p,h in inputs.items())
        save_json(out/"run_metadata_v2.json",meta)
        print("[BLOCKED OR FAILED]",meta["error"])
        print("Output folder:",out.resolve())
        return 2


if __name__=="__main__":
    raise SystemExit(main())
