
from __future__ import annotations
import argparse
import math
from pathlib import Path
import numpy as np
import pandas as pd

CAMPAIGNS = [
    ("C01","Brand Search Core",500000,250000,900000,4_800_000,4.8e-6,0.075,0.080),
    ("C02","Brand Search Expansion",350000,150000,700000,3_200_000,4.0e-6,0.062,0.068),
    ("C03","Generic Search High Intent",650000,300000,1_400_000,6_500_000,2.6e-6,0.048,0.052),
    ("C04","Generic Search Mid Intent",550000,250000,1_300_000,5_000_000,2.2e-6,0.039,0.043),
    ("C05","Shopping Best Seller",800000,400000,1_600_000,7_800_000,2.7e-6,0.055,0.060),
    ("C06","Shopping Long Tail",450000,200000,1_100_000,4_600_000,2.1e-6,0.038,0.048),
    ("C07","Retargeting",300000,150000,600000,3_900_000,6.0e-6,0.085,0.100),
    ("C08","Competitor",400000,150000,900000,3_600_000,2.8e-6,0.032,0.035),
    ("C09","Prospecting",700000,300000,1_800_000,6_800_000,1.8e-6,0.027,0.028),
    ("C10","Seasonal",500000,200000,1_300_000,6_200_000,2.4e-6,0.045,0.050),
    ("C11","New Product Launch",600000,250000,1_500_000,5_800_000,2.0e-6,0.035,0.040),
    ("C12","Low Efficiency Legacy",300000,100000,500000,2_000_000,1.5e-6,0.022,0.020),
]

SCENARIOS = {
    "normal": dict(spend_cv=0.20, revenue_noise=0.08, seasonality=0.10, beta_mult=1.0),
    "narrow_spend": dict(spend_cv=0.07, revenue_noise=0.08, seasonality=0.10, beta_mult=1.0),
    "high_volatility": dict(spend_cv=0.22, revenue_noise=0.22, seasonality=0.12, beta_mult=1.0),
    "strong_seasonality": dict(spend_cv=0.22, revenue_noise=0.10, seasonality=0.30, beta_mult=1.0),
    "fast_saturation": dict(spend_cv=0.20, revenue_noise=0.10, seasonality=0.10, beta_mult=1.8),
    "mixed": dict(spend_cv=0.24, revenue_noise=0.16, seasonality=0.20, beta_mult=1.25),
}

def clipped_lognormal(rng, mean, cv, lo, hi):
    sigma2 = math.log(1 + cv * cv)
    sigma = math.sqrt(sigma2)
    mu = math.log(max(mean,1e-9)) - 0.5 * sigma2
    x = rng.lognormal(mu, sigma)
    return float(np.clip(x, lo, hi))

def generate_one(out_dir: Path, scenario: str, seed: int, days: int = 365):
    cfg = SCENARIOS[scenario]
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2027-01-01", periods=days, freq="D")
    rows = []
    truth_rows = []
    bounds_rows = []

    for idx, (cid, name, base, lo, hi, alpha, beta, ctr0, cvr0) in enumerate(CAMPAIGNS):
        phase = 0.37 * idx
        # scenario-specific heterogeneity to avoid making every campaign identical
        camp_noise = cfg["revenue_noise"] * (0.85 + 0.3 * rng.random())
        camp_season = cfg["seasonality"] * (0.75 + 0.5 * rng.random())
        beta_i = beta * cfg["beta_mult"] * (0.90 + 0.20 * rng.random())
        alpha_i = alpha * (0.92 + 0.16 * rng.random())

        truth_rows.append({
            "campaign_id": cid,
            "campaign_name": name,
            "base_daily_budget": base,
            "min_daily_budget": lo,
            "max_daily_budget": hi,
            "alpha_revenue": alpha_i,
            "beta_revenue": beta_i,
            "base_ctr": ctr0,
            "base_cvr": cvr0,
            "revenue_noise_std": camp_noise,
            "seasonality_strength": camp_season,
            "phase": phase,
            "scenario": scenario,
            "seed": seed,
        })
        bounds_rows.append({
            "campaign_id": cid,
            "min_daily_budget": lo,
            "max_daily_budget": hi,
        })

        for d_idx, date in enumerate(dates):
            weekday_factor = [0.93,0.96,1.00,1.03,1.08,1.05,0.95][date.weekday()]
            seasonal = 1 + camp_season * math.sin(2*math.pi*(date.dayofyear/365.0) + phase)
            promo = 1.0
            if 60 <= d_idx <= 68 or 250 <= d_idx <= 258:
                promo = 1.18 + 0.05*rng.random()

            target_spend = base * weekday_factor * (0.97 + 0.06 * rng.random())
            spend = clipped_lognormal(
                rng, target_spend, cfg["spend_cv"], lo, hi
            )
            expected_revenue = alpha_i * (1 - math.exp(-beta_i * spend))
            expected_revenue *= seasonal * promo
            noise = max(0.0, rng.normal(1.0, camp_noise))
            revenue = max(0.0, expected_revenue * noise)

            # Coherent funnel-like synthetic observables
            cpc = max(120.0, 520.0 + 0.00012 * spend + 35*rng.normal())
            clicks = max(1.0, spend / cpc)
            impressions = max(int(round(clicks / max(ctr0 * (0.95 + 0.1*rng.random()), 1e-5))), 1)
            cvr = max(0.002, cvr0 * (1.03 - 0.00000025 * max(spend-base, 0)) * (0.92 + 0.16*rng.random()))
            conversions = max(0.0, clicks * cvr)
            ctr = clicks / impressions * 100 if impressions > 0 else 0
            cpc_calc = spend / clicks if clicks > 0 else 0
            cvr_calc = conversions / clicks * 100 if clicks > 0 else 0
            cpa = spend / conversions if conversions > 0 else 0
            roas = revenue / spend * 100 if spend > 0 else 0

            rows.append({
                "id": f"naver-independent-{scenario}-{seed}-{date.date()}-{cid}",
                "advertiser_id": f"independent_adv_{seed}",
                "platform": "naver",
                "account_id": f"independent_account_{seed}",
                "date": date.date().isoformat(),
                "campaign_id": cid,
                "campaign_name": name,
                "channel": "Naver",
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "revenue": revenue,
                "ctr": ctr,
                "cpc": cpc_calc,
                "cvr": cvr_calc,
                "cpa": cpa,
                "roas": roas,
                "synced_at": f"{date.date().isoformat()}T23:59:59Z",
            })

    out_dir.mkdir(parents=True, exist_ok=True)
    perf = pd.DataFrame(rows)
    truth = pd.DataFrame(truth_rows)
    bounds = pd.DataFrame(bounds_rows)
    perf.to_csv(out_dir/"naver_synthetic_performance.csv", index=False, encoding="utf-8-sig")
    truth.to_csv(out_dir/"naver_synthetic_ground_truth.csv", index=False, encoding="utf-8-sig")
    bounds.to_csv(out_dir/"campaign_budget_bounds.csv", index=False, encoding="utf-8-sig")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output-root", type=Path, default=Path("independent_validation/scenarios"))
    p.add_argument("--seeds", default="101,202,303")
    p.add_argument("--scenarios", default=",".join(SCENARIOS))
    args = p.parse_args()

    seeds = [int(x.strip()) for x in args.seeds.split(",") if x.strip()]
    scenarios = [x.strip() for x in args.scenarios.split(",") if x.strip()]
    for s in scenarios:
        if s not in SCENARIOS:
            raise ValueError(f"Unknown scenario: {s}")
        for seed in seeds:
            target = args.output_root / f"{s}_seed{seed}"
            generate_one(target, s, seed)
            print("[GENERATED]", target)
    print("[DONE] Independent scenarios generated.")

if __name__ == "__main__":
    main()
