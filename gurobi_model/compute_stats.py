
import pandas as pd
import numpy as np

perf = pd.read_csv('/tmp/naver_synthetic_performance.csv')
perf['date'] = pd.to_datetime(perf['date'])

camp_stats = perf.groupby('campaign_id').agg(
    campaign_name=('campaign_name', 'first'),
    mean_spend=('spend', 'mean'),
    std_spend=('spend', 'std'),
    min_spend=('spend', 'min'),
    max_spend=('spend', 'max'),
    mean_revenue=('revenue', 'mean'),
    std_revenue=('revenue', 'std'),
    mean_conversions=('conversions', 'mean'),
    std_conversions=('conversions', 'std'),
    total_spend=('spend', 'sum'),
    total_revenue=('revenue', 'sum'),
    total_conversions=('conversions', 'sum'),
    n_days=('date', 'nunique'),
).reset_index().sort_values('campaign_id')

camp_stats['cv_spend'] = camp_stats['std_spend'] / camp_stats['mean_spend']
camp_stats['spend_range_ratio'] = camp_stats['max_spend'] / camp_stats['min_spend']
camp_stats['hist_roas_volume'] = 100.0 * camp_stats['total_revenue'] / camp_stats['total_spend']
camp_stats['aor_point'] = camp_stats['mean_revenue'] / camp_stats['mean_conversions']
camp_stats['cv_conversions'] = camp_stats['std_conversions'] / camp_stats['mean_conversions']
camp_stats['rev_residual_std'] = camp_stats['std_revenue']

b_default = camp_stats['mean_spend'].sum()

print("=== CAMPAIGN MEAN DAILY SPEND (x_i^0) ===")
for _, r in camp_stats.iterrows():
    tag = "NARROW" if r['cv_spend'] < 0.15 else "ok"
    print(
        f"  {r['campaign_id']}  mean_spend={r['mean_spend']:>12,.2f}"
        f"  cv={r['cv_spend']:.4f} {tag}"
        f"  range_ratio={r['spend_range_ratio']:.2f}"
        f"  hist_ROAS={r['hist_roas_volume']:.1f}%"
    )

print(f"\nB_default = {b_default:,.2f} KRW/day")

print("\n=== REVENUE VOLATILITY (std of daily revenue) ===")
for _, r in camp_stats.iterrows():
    print(
        f"  {r['campaign_id']}  mean_rev={r['mean_revenue']:>12,.0f}"
        f"  std_rev={r['std_revenue']:>10,.0f}"
        f"  cv_rev={r['std_revenue']/r['mean_revenue']:.3f}"
    )

print("\n=== CONVERSION STATS AND POINT-ESTIMATE AOR ===")
for _, r in camp_stats.iterrows():
    print(
        f"  {r['campaign_id']}  mean_conv={r['mean_conversions']:>6.1f}"
        f"  cv_conv={r['cv_conversions']:.3f}"
        f"  AOR_point={r['aor_point']:>8,.0f} KRW"
    )

print("\n=== HISTORICAL ROAS (volume-weighted: 100*sum(rev)/sum(spend)) ===")
total_rev = camp_stats['total_revenue'].sum()
total_spend = camp_stats['total_spend'].sum()
port_roas = 100.0 * total_rev / total_spend
print(f"  Portfolio ROAS = {port_roas:.2f}%")
for _, r in camp_stats.iterrows():
    print(f"  {r['campaign_id']}  {r['hist_roas_volume']:.2f}%")

# Save for use in later scripts
camp_stats.to_csv('/tmp/campaign_stats.csv', index=False)
print("\nSaved to /tmp/campaign_stats.csv")
