
from __future__ import annotations
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def true_revenue(truth_row, x, mean_multiplier=1.0):
    a = float(truth_row.alpha_revenue)
    b = float(truth_row.beta_revenue)
    return a * (1 - math.exp(-b * float(x))) * mean_multiplier

def mean_multiplier(truth_row):
    # Independent evaluator uses deterministic period-average seasonality only.
    # It does NOT reuse any tuned V2 parameter.
    s = float(truth_row.seasonality_strength)
    phase = float(truth_row.phase)
    dates = pd.date_range("2027-01-01", periods=365, freq="D")
    vals = [1 + s*math.sin(2*math.pi*(d.dayofyear/365.0)+phase) for d in dates]
    promo = np.ones(len(dates))
    promo[60:69] *= 1.205
    promo[250:259] *= 1.205
    return float(np.mean(np.array(vals) * promo))

def solve_oracle(truth, current, bounds, total_budget, max_change):
    ids = list(truth.campaign_id.astype(str))
    eff = {}
    for cid in ids:
        lo, hi = bounds[cid]
        if max_change is not None:
            lo = max(lo, current[cid]*(1-max_change))
            hi = min(hi, current[cid]*(1+max_change))
        eff[cid] = (lo, hi)

    mult = {r.campaign_id: mean_multiplier(r) for r in truth.itertuples(index=False)}

    def alloc_at_mu(mu):
        out = {}
        for r in truth.itertuples(index=False):
            cid = str(r.campaign_id)
            lo, hi = eff[cid]
            a = float(r.alpha_revenue) * mult[cid]
            b = float(r.beta_revenue)
            # R'(x)=a*b*exp(-b*x)=mu
            if mu <= 0:
                x = hi
            else:
                x = -math.log(mu/(a*b))/b if mu < a*b else lo
                x = min(max(x, lo), hi)
            out[cid] = x
        return out

    lo_mu, hi_mu = 1e-12, 1e6
    for _ in range(120):
        mid = math.sqrt(lo_mu*hi_mu)
        a = alloc_at_mu(mid)
        s = sum(a.values())
        if s > total_budget:
            lo_mu = mid
        else:
            hi_mu = mid
    alloc = alloc_at_mu(hi_mu)

    # tiny budget reconciliation within bounds
    diff = total_budget - sum(alloc.values())
    for cid in ids:
        if abs(diff) < 1e-6:
            break
        lo, hi = eff[cid]
        room = hi-alloc[cid] if diff > 0 else alloc[cid]-lo
        step = math.copysign(min(abs(diff), max(room,0.0)), diff)
        alloc[cid] += step
        diff -= step

    return alloc, eff

def evaluate_policy(truth, allocation):
    total = 0.0
    for r in truth.itertuples(index=False):
        total += true_revenue(r, allocation[str(r.campaign_id)], mean_multiplier(r))
    return total

def run_one(case_dir: Path, frozen_dir: Path, output_root: Path, max_change: float):
    perf = case_dir/"naver_synthetic_performance.csv"
    bounds_path = case_dir/"campaign_budget_bounds.csv"
    truth_path = case_dir/"naver_synthetic_ground_truth.csv"
    truth = pd.read_csv(truth_path)
    perf_df = pd.read_csv(perf)
    bounds_df = pd.read_csv(bounds_path)
    current = perf_df.groupby("campaign_id").spend.mean().astype(float).to_dict()
    bounds = {str(r.campaign_id):(float(r.min_daily_budget),float(r.max_daily_budget))
              for r in bounds_df.itertuples(index=False)}
    B = float(sum(current.values()))

    out = output_root/case_dir.name
    out.mkdir(parents=True, exist_ok=True)

    # Use the frozen runner and frozen estimator exactly as preserved.
    cmd = [
        sys.executable, str(frozen_dir/"run_v2.py"),
        "--mode","demo",
        "--performance",str(perf),
        "--bounds",str(bounds_path),
        "--max-change",str(max_change),
        "--lambda-value","0.01",
        "--budget",str(B),
        "--output-root",str(out),
    ]
    proc = subprocess.run(cmd, cwd=frozen_dir, capture_output=True, text=True)
    (out/"stdout.txt").write_text(proc.stdout + "\n--- STDERR ---\n" + proc.stderr, encoding="utf-8")
    if proc.returncode != 0:
        raise RuntimeError(f"{case_dir.name}: frozen V2 runner failed; see {out/'stdout.txt'}")

    demo_dirs = sorted([p for p in out.iterdir() if p.is_dir() and p.name.startswith("demo_")])
    if not demo_dirs:
        raise RuntimeError(f"{case_dir.name}: no demo output")
    demo = demo_dirs[-1]

    c1 = pd.read_csv(demo/"campaign_allocations_v1.csv")
    c2 = pd.read_csv(demo/"campaign_allocations_v2.csv")
    a1 = c1[c1.strategy=="Gurobi_Optimized"].set_index("campaign_id").optimized_budget.astype(float).to_dict()
    a2 = c2[c2.strategy=="Gurobi_Optimized"].set_index("campaign_id").optimized_budget.astype(float).to_dict()
    oracle, eff = solve_oracle(truth, current, bounds, B, max_change)

    v_cur = evaluate_policy(truth, current)
    v1 = evaluate_policy(truth, a1)
    v2 = evaluate_policy(truth, a2)
    vo = evaluate_policy(truth, oracle)

    def row(label, val, alloc):
        return {
            "case": case_dir.name,
            "strategy": label,
            "true_expected_revenue": val,
            "lift_vs_current_pct": 100*(val-v_cur)/v_cur,
            "oracle_gap_pct": 100*(vo-val)/vo,
            "budget_reallocation_from_current_krw": 0.5*sum(abs(alloc[c]-current[c]) for c in alloc),
            "budget_l1_to_oracle_krw": sum(abs(alloc[c]-oracle[c]) for c in alloc),
        }

    summary = pd.DataFrame([
        row("Current", v_cur, current),
        row("V1", v1, a1),
        row("V2", v2, a2),
        row("Oracle", vo, oracle),
    ])
    summary.to_csv(out/"truth_summary.csv", index=False, encoding="utf-8-sig")

    detail = pd.DataFrame({
        "campaign_id": sorted(current),
        "current_budget":[current[c] for c in sorted(current)],
        "v1_budget":[a1[c] for c in sorted(current)],
        "v2_budget":[a2[c] for c in sorted(current)],
        "oracle_budget":[oracle[c] for c in sorted(current)],
        "effective_lower":[eff[c][0] for c in sorted(current)],
        "effective_upper":[eff[c][1] for c in sorted(current)],
    })
    detail.to_csv(out/"budget_comparison.csv", index=False, encoding="utf-8-sig")
    return summary

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--scenarios-root", type=Path, default=HERE/"scenarios")
    p.add_argument("--frozen-dir", type=Path, default=ROOT/"frozen_v2")
    p.add_argument("--output-root", type=Path, default=HERE/"results")
    p.add_argument("--max-change", type=float, default=0.30)
    args = p.parse_args()

    required = ["run_v2.py","response_estimator_v2.py","naver_budget_optimizer.py"]
    for f in required:
        if not (args.frozen_dir/f).is_file():
            raise FileNotFoundError(f"Missing frozen file: {args.frozen_dir/f}")

    cases = sorted([p for p in args.scenarios_root.iterdir() if p.is_dir()])
    if not cases:
        raise RuntimeError("No independent scenarios found. Run generate_test_scenarios.py first.")

    all_rows = []
    for case in cases:
        print("[RUN]", case.name, flush=True)
        all_rows.append(run_one(case, args.frozen_dir, args.output_root, args.max_change))
    merged = pd.concat(all_rows, ignore_index=True)
    merged.to_csv(args.output_root/"all_results.csv", index=False, encoding="utf-8-sig")

    # aggregate only V1/V2 rows
    v = merged[merged.strategy.isin(["V1","V2"])].copy()
    agg = (v.groupby("strategy")
             .agg(
                 cases=("case","nunique"),
                 mean_lift_vs_current_pct=("lift_vs_current_pct","mean"),
                 median_lift_vs_current_pct=("lift_vs_current_pct","median"),
                 mean_oracle_gap_pct=("oracle_gap_pct","mean"),
                 median_oracle_gap_pct=("oracle_gap_pct","median"),
                 mean_budget_l1_to_oracle_krw=("budget_l1_to_oracle_krw","mean"),
                 pct_cases_beating_current=("lift_vs_current_pct", lambda s: 100*(s>0).mean()),
             )
             .reset_index())
    agg.to_csv(args.output_root/"aggregate_results.csv", index=False, encoding="utf-8-sig")
    print("[DONE] Independent validation completed.")
    print("Aggregate:", (args.output_root/"aggregate_results.csv").resolve())

if __name__ == "__main__":
    main()
