export function calculateMetrics(data) {
  const spend = data.reduce((sum, row) => sum + row.spend, 0)
  const impressions = data.reduce(
    (sum, row) => sum + row.impressions,
    0
  )
  const clicks = data.reduce((sum, row) => sum + row.clicks, 0)
  const conversions = data.reduce(
    (sum, row) => sum + row.conversions,
    0
  )
  const revenue = data.reduce((sum, row) => sum + row.revenue, 0)

  return {
    spend,
    impressions,
    clicks,
    conversions,
    revenue,

    ctr: impressions > 0
      ? (clicks / impressions) * 100
      : 0,

    cpc: clicks > 0
      ? spend / clicks
      : 0,

    cpa: conversions > 0
      ? spend / conversions
      : 0,

    cvr: clicks > 0
      ? (conversions / clicks) * 100
      : 0,

    roas: spend > 0
      ? revenue / spend
      : 0,
  }
}