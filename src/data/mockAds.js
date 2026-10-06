// src/data/mockAds.js

// --------------------------------------------------
// AdScope Mock Performance Data
//
// 목적:
// - 최소 70일 이상 V2 학습 테스트
// - 캠페인별 Response Curve 학습
// - 예산 Scaling / Marginal ROAS 테스트
// - Meta / Google / Naver 매체별 최적화 테스트
//
// 기간: 180일
// 캠페인: 매체당 4개 = 총 12개
// --------------------------------------------------

function createSeededRandom(
  seed = 20260930
) {
  let value = seed % 2147483647

  if (value <= 0) {
    value += 2147483646
  }

  return () => {
    value =
      (
        value *
        16807
      ) %
      2147483647

    return (
      value -
      1
    ) /
      2147483646
  }
}

const random =
  createSeededRandom(
    20260930
  )

function randomBetween(
  min,
  max
) {
  return (
    min +
    (
      max -
      min
    ) *
      random()
  )
}

function clamp(
  value,
  min,
  max
) {
  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  )
}

function formatDate(
  date
) {
  return date
    .toISOString()
    .slice(
      0,
      10
    )
}

// --------------------------------------------------
// 캠페인 설정
//
// baseDailyBudget:
//   평상시 캠페인 일예산 중심값
//
// maxRevenue:
//   충분히 큰 예산을 투입했을 때
//   접근하는 일매출 수준
//
// responseK:
//   포화 속도
//   높을수록 비교적 빨리 효율 둔화
// --------------------------------------------------

const campaigns = [
  {
    brand: 'LUMENA',
    channel: 'Google',
    campaign:
      'Google - 브랜드 검색',
    product:
      '무선 공기청정기',
    baseDailyBudget:
      520000,
    maxRevenue:
      3900000,
    responseK:
      1.85,
    ctrBase:
      0.055,
    cvrBase:
      0.062,
  },
  {
    brand: 'LUMENA',
    channel: 'Google',
    campaign:
      'Google - 일반 검색',
    product:
      '무선 공기청정기',
    baseDailyBudget:
      720000,
    maxRevenue:
      4450000,
    responseK:
      1.55,
    ctrBase:
      0.038,
    cvrBase:
      0.051,
  },
  {
    brand: 'ADAPTO',
    channel: 'Google',
    campaign:
      'Google - PMax',
    product:
      'Ultra Marine Serum',
    baseDailyBudget:
      610000,
    maxRevenue:
      3650000,
    responseK:
      1.65,
    ctrBase:
      0.031,
    cvrBase:
      0.047,
  },
  {
    brand: 'ADAPTO',
    channel: 'Google',
    campaign:
      'Google - 리타겟팅',
    product:
      'Ultra Marine Serum',
    baseDailyBudget:
      360000,
    maxRevenue:
      2800000,
    responseK:
      2.05,
    ctrBase:
      0.046,
    cvrBase:
      0.072,
  },

  {
    brand: 'LUMENA',
    channel: 'Meta',
    campaign:
      'Meta - 신규 고객 확보',
    product:
      '무선 공기청정기',
    baseDailyBudget:
      650000,
    maxRevenue:
      3750000,
    responseK:
      1.45,
    ctrBase:
      0.019,
    cvrBase:
      0.041,
  },
  {
    brand: 'LUMENA',
    channel: 'Meta',
    campaign:
      'Meta - 리타겟팅',
    product:
      '무선 공기청정기',
    baseDailyBudget:
      390000,
    maxRevenue:
      2950000,
    responseK:
      2.10,
    ctrBase:
      0.027,
    cvrBase:
      0.068,
  },
  {
    brand: 'ADAPTO',
    channel: 'Meta',
    campaign:
      'Meta - 어드밴티지 쇼핑',
    product:
      'Ultra Marine Serum',
    baseDailyBudget:
      580000,
    maxRevenue:
      3500000,
    responseK:
      1.60,
    ctrBase:
      0.023,
    cvrBase:
      0.052,
  },
  {
    brand: 'ADAPTO',
    channel: 'Meta',
    campaign:
      'Meta - 크리에이터 테스트',
    product:
      'Ultra Marine Serum',
    baseDailyBudget:
      310000,
    maxRevenue:
      2050000,
    responseK:
      1.35,
    ctrBase:
      0.021,
    cvrBase:
      0.038,
  },

  {
    brand: 'LUMENA',
    channel: 'Naver',
    campaign:
      'Naver - 브랜드검색',
    product:
      '무선 공기청정기',
    baseDailyBudget:
      430000,
    maxRevenue:
      3350000,
    responseK:
      1.95,
    ctrBase:
      0.061,
    cvrBase:
      0.069,
  },
  {
    brand: 'LUMENA',
    channel: 'Naver',
    campaign:
      'Naver - 파워링크',
    product:
      '무선 공기청정기',
    baseDailyBudget:
      590000,
    maxRevenue:
      3600000,
    responseK:
      1.55,
    ctrBase:
      0.047,
    cvrBase:
      0.054,
  },
  {
    brand: 'ADAPTO',
    channel: 'Naver',
    campaign:
      'Naver - 쇼핑검색',
    product:
      'Ultra Marine Serum',
    baseDailyBudget:
      520000,
    maxRevenue:
      3250000,
    responseK:
      1.70,
    ctrBase:
      0.041,
    cvrBase:
      0.061,
  },
  {
    brand: 'ADAPTO',
    channel: 'Naver',
    campaign:
      'Naver - 브랜드 키워드',
    product:
      'Ultra Marine Serum',
    baseDailyBudget:
      340000,
    maxRevenue:
      2700000,
    responseK:
      2.00,
    ctrBase:
      0.058,
    cvrBase:
      0.075,
  },
]

// --------------------------------------------------
// 날짜
// --------------------------------------------------

const MOCK_DAYS = 180

const mockStartDate =
  new Date(
    '2026-03-04T00:00:00'
  )

// --------------------------------------------------
// Response Curve
//
// R(x) = A *
//        (1 - exp(-k*x/s))
//        /
//        (1 - exp(-k))
//
// 프로젝트 V2와 같은 포화형태를 흉내냄.
// --------------------------------------------------

function responseRevenue(
  spend,
  campaign
) {
  const scale =
    campaign.baseDailyBudget

  const normalizedSpend =
    spend /
    scale

  const numerator =
    1 -
    Math.exp(
      -campaign.responseK *
      normalizedSpend
    )

  const denominator =
    1 -
    Math.exp(
      -campaign.responseK
    )

  return (
    campaign.maxRevenue *
    (
      numerator /
      denominator
    )
  )
}

// --------------------------------------------------
// Mock 생성
// --------------------------------------------------

function generateMockAds() {
  const rows = []

  for (
    let dayIndex = 0;
    dayIndex < MOCK_DAYS;
    dayIndex += 1
  ) {
    const date =
      new Date(
        mockStartDate
      )

    date.setDate(
      mockStartDate.getDate() +
      dayIndex
    )

    const dayOfWeek =
      date.getDay()

    // 주말 효과
    const weekendFactor =
      (
        dayOfWeek === 0 ||
        dayOfWeek === 6
      )
        ? 0.91
        : 1

    // 장기적으로 약간 성장하는 효과
    const trendFactor =
      1 +
      (
        dayIndex /
        MOCK_DAYS
      ) *
        0.08

    campaigns.forEach(
      (
        campaign,
        campaignIndex
      ) => {
        // ------------------------------
        // Spend
        //
        // 같은 금액만 반복되면
        // Response Curve를 학습하기
        // 어려우므로 약 ±30% 변동.
        // ------------------------------

        const budgetNoise =
          randomBetween(
            0.70,
            1.30
          )

        const weeklyWave =
          1 +
          0.08 *
          Math.sin(
            (
              dayIndex +
              campaignIndex *
                3
            ) /
              7
          )

        const spend =
          Math.round(
            campaign
              .baseDailyBudget *
            budgetNoise *
            weeklyWave
          )

        // ------------------------------
        // Revenue
        // ------------------------------

        const baseRevenue =
          responseRevenue(
            spend,
            campaign
          )

        // 현실적인 일별 노이즈
        const revenueNoise =
          randomBetween(
            0.88,
            1.12
          )

        const revenue =
          Math.round(
            baseRevenue *
            revenueNoise *
            weekendFactor *
            trendFactor
          )

        // ------------------------------
        // Funnel metrics
        // ------------------------------

        const cpc =
          campaign.channel ===
            'Google'
            ? randomBetween(
              850,
              1650
            )
            : campaign.channel ===
                'Naver'
              ? randomBetween(
                650,
                1400
              )
              : randomBetween(
                500,
                1100
              )

        const clicks =
          Math.max(
            1,
            Math.round(
              spend /
              cpc
            )
          )

        const ctr =
          clamp(
            campaign.ctrBase *
            randomBetween(
              0.88,
              1.12
            ),
            0.005,
            0.12
          )

        const impressions =
          Math.max(
            clicks,
            Math.round(
              clicks /
              ctr
            )
          )

        const cvr =
          clamp(
            campaign.cvrBase *
            randomBetween(
              0.85,
              1.15
            ),
            0.005,
            0.20
          )

        const conversions =
          Math.max(
            1,
            Math.round(
              clicks *
              cvr
            )
          )

        const reach =
          Math.round(
            impressions *
            randomBetween(
              0.62,
              0.82
            )
          )

        rows.push({
          date:
            formatDate(
              date
            ),

          brand:
            campaign.brand,

          channel:
            campaign.channel,

          campaign:
            campaign.campaign,

          adSet:
            `${campaign.campaign} - 기본 세트`,

          content:
            `${campaign.campaign} - 소재 A`,

          product:
            campaign.product,

          contentFormat:
            campaign.channel ===
              'Meta'
              ? 'Video'
              : 'Image',

          hookType:
            campaign.channel ===
              'Meta'
              ? 'Problem-Solution'
              : 'Search Intent',

          videoLength:
            campaign.channel ===
              'Meta'
              ? '15s'
              : '-',

          spend,

          impressions,

          reach,

          clicks,

          conversions,

          revenue,
        })
      }
    )
  }

  return rows
}

export const mockAds =
  generateMockAds()