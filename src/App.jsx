import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  useTranslation,
} from 'react-i18next'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'

import { mockAds } from './data/mockAds'
import './App.css'

const API_BASE_URL =
  'http://127.0.0.1:8001'

function handleOperatorUnauthorized(
  response
) {
  if (response.status !== 401) {
    return false
  }

  localStorage.removeItem(
    'adscope_operator_access_token'
  )

  localStorage.removeItem(
    'adscope_operator_user'
  )

  window.location.href =
    '/operator/login'

  return true
}


function handleClientUnauthorized(
  response
) {
  if (response.status !== 401) {
    return false
  }

  localStorage.removeItem(
    'adscope_client_access_token'
  )

  localStorage.removeItem(
    'adscope_client_id'
  )

  localStorage.removeItem(
    'adscope_client_advertiser_id'
  )

  localStorage.removeItem(
    'adscope_client_email'
  )

  localStorage.removeItem(
    'adscope_client_name'
  )

  localStorage.removeItem(
    'adscope_client_brand'
  )

  window.location.href =
    '/client/login'

  return true
}



/* 여기부터 새로 추가 */
async function operatorFetch(
  url,
  options = {}
) {
  const token =
    localStorage.getItem(
      'adscope_operator_access_token'
    )

  const response = await fetch(
    url,
    {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization:
          `Bearer ${token}`,
      },
    }
  )

  if (
    handleOperatorUnauthorized(
      response
    )
  ) {
    return null
  }

  return response
}


async function clientFetch(
  url,
  options = {}
) {
  const token =
    localStorage.getItem(
      'adscope_client_access_token'
    )

  const response = await fetch(
    url,
    {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization:
          `Bearer ${token}`,
      },
    }
  )

  if (
    handleClientUnauthorized(
      response
    )
  ) {
    return null
  }

  return response
}

function formatAlertDateTime(
  value
) {
  if (!value) {
    return '-'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value
  }

  return new Intl.DateTimeFormat(
    'ko-KR',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }
  ).format(date)
}


function getAnomalyGuidance(
  alert
) {
  const metric =
    String(
      alert?.metric || ''
    ).toLowerCase()

  const reasonCode =
    String(
      alert?.reasonCode || ''
    )

  const direction =
    String(
      alert?.direction || ''
    )


  if (
    reasonCode ===
    'TRACKING_CONVERSION_ZERO'
  ) {
    return {
      possibleCauses: [
        '전환 태그 또는 Conversion API가 정상적으로 수집되지 않고 있을 수 있습니다.',
        '랜딩페이지 또는 완료 페이지 변경으로 전환 이벤트가 누락됐을 수 있습니다.',
        '광고 플랫폼과 실제 주문·문의 데이터 사이에 집계 차이가 발생했을 수 있습니다.',
      ],

      actions: [
        '광고 플랫폼의 전환 추적 상태와 최근 태그 변경 이력을 확인합니다.',
        '실제 주문·문의 데이터와 광고 플랫폼 전환 데이터를 비교합니다.',
        '완료 페이지 또는 Conversion API 이벤트가 정상 발생하는지 테스트합니다.',
        '추적 상태가 확인될 때까지 해당 캠페인의 급격한 예산 증액은 보류합니다.',
      ],
    }
  }


  if (
    reasonCode ===
    'TRACKING_REVENUE_ZERO'
  ) {
    return {
      possibleCauses: [
        '전환은 발생하지만 매출 value 값이 전달되지 않고 있을 수 있습니다.',
        '결제 완료 이벤트의 revenue 또는 currency parameter가 누락됐을 수 있습니다.',
        '광고 플랫폼과 주문 시스템 사이의 매출 연동에 문제가 있을 수 있습니다.',
      ],

      actions: [
        '전환 건수가 존재하는데 매출만 0인지 먼저 확인합니다.',
        '결제 완료 이벤트의 value 및 currency parameter를 확인합니다.',
        '광고 플랫폼 매출과 실제 주문 매출을 비교합니다.',
        '매출 추적이 복구될 때까지 ROAS 기준의 예산 판단은 보류합니다.',
      ],
    }
  }


  if (
    metric === 'cpa' &&
    direction === 'increase'
  ) {
    return {
      possibleCauses: [
        '전환 수가 감소했거나 동일한 전환을 얻는 데 더 많은 광고비가 사용됐을 수 있습니다.',
        'CPC 상승으로 전환당 광고비가 증가했을 수 있습니다.',
        'CVR 하락으로 클릭 대비 전환 효율이 악화됐을 수 있습니다.',
        '전환 추적 누락으로 CPA가 실제보다 높게 계산됐을 가능성도 있습니다.',
      ],

      actions: [
        'CPA와 함께 CPC, CVR, 전환 수를 비교해 상승 원인을 분해합니다.',
        '최근 소재, 검색어, 타겟팅 또는 입찰 변경 여부를 확인합니다.',
        '전환 추적 상태가 정상인지 확인합니다.',
        '실제 성과 악화가 지속되면 캠페인 예산 축소 또는 재배분을 검토합니다.',
      ],
    }
  }


  if (
    metric === 'roas' &&
    direction === 'decrease'
  ) {
    return {
      possibleCauses: [
        '광고비 증가 대비 매출 증가폭이 부족했을 수 있습니다.',
        '매출 자체가 감소했을 수 있습니다.',
        'CPA 상승 또는 CVR 하락이 동시에 발생했을 수 있습니다.',
        'Revenue Tracking 이상으로 매출이 과소 집계됐을 가능성도 있습니다.',
      ],

      actions: [
        '광고비 증가와 매출 감소 중 어느 요인의 영향이 큰지 확인합니다.',
        'CPA, CVR, CPC, 전환 수를 함께 비교합니다.',
        'Revenue Tracking 상태를 확인합니다.',
        '이상이 지속되면 해당 캠페인의 예산 동결 또는 축소를 검토합니다.',
      ],
    }
  }


  if (
    metric === 'cvr' &&
    direction === 'decrease'
  ) {
    return {
      possibleCauses: [
        '광고 클릭 이후 랜딩페이지 전환 효율이 낮아졌을 수 있습니다.',
        '유입 타겟 또는 검색어 품질이 변화했을 수 있습니다.',
        '페이지 오류나 결제·문의 과정의 문제가 발생했을 수 있습니다.',
      ],

      actions: [
        '랜딩페이지 및 전환 경로가 정상 작동하는지 확인합니다.',
        '최근 검색어와 타겟 유입 품질 변화를 확인합니다.',
        '기기별·캠페인별 CVR 변화를 비교합니다.',
        '성과 저하가 지속되는 소재나 타겟의 조정을 검토합니다.',
      ],
    }
  }


  if (
    metric === 'ctr' &&
    direction === 'decrease'
  ) {
    return {
      possibleCauses: [
        '광고 소재의 반응도가 떨어졌을 수 있습니다.',
        '타겟 또는 노출 위치가 달라졌을 수 있습니다.',
        '광고 피로도가 증가했을 수 있습니다.',
      ],

      actions: [
        '최근 소재별 CTR을 비교합니다.',
        '노출량 증가와 CTR 하락이 동시에 발생했는지 확인합니다.',
        '성과가 낮은 소재 교체 또는 신규 소재 테스트를 검토합니다.',
      ],
    }
  }


  if (
    metric === 'cpc' &&
    direction === 'increase'
  ) {
    return {
      possibleCauses: [
        '경쟁 심화로 클릭 단가가 상승했을 수 있습니다.',
        '입찰가 또는 자동 입찰 전략이 변경됐을 수 있습니다.',
        'CTR 저하로 광고 효율이 떨어졌을 수 있습니다.',
      ],

      actions: [
        '최근 입찰 설정 변경 여부를 확인합니다.',
        'CPC와 CTR 변화를 함께 비교합니다.',
        '검색어·타겟·게재 위치별 CPC 상승 구간을 확인합니다.',
        '고비용 저효율 구간의 입찰 또는 예산 조정을 검토합니다.',
      ],
    }
  }


  if (
    metric === 'revenue' &&
    direction === 'decrease'
  ) {
    return {
      possibleCauses: [
        '전환 수 또는 객단가가 감소했을 수 있습니다.',
        '광고 유입 품질이 악화됐을 수 있습니다.',
        '매출 추적 데이터가 일부 누락됐을 수 있습니다.',
      ],

      actions: [
        '전환 수와 CPA, ROAS를 함께 확인합니다.',
        '실제 주문 매출과 광고 플랫폼 매출을 비교합니다.',
        '특정 캠페인이나 상품에서 감소가 집중됐는지 확인합니다.',
      ],
    }
  }


  if (
    metric === 'conversions' &&
    direction === 'decrease'
  ) {
    return {
      possibleCauses: [
        '클릭 수가 감소했거나 CVR이 하락했을 수 있습니다.',
        '전환 추적 문제가 발생했을 수 있습니다.',
        '광고 유입 또는 랜딩페이지 성과가 악화됐을 수 있습니다.',
      ],

      actions: [
        '클릭 수와 CVR을 함께 비교합니다.',
        '전환 추적 상태를 확인합니다.',
        '랜딩페이지 및 주요 전환 경로를 점검합니다.',
      ],
    }
  }


  return {
    possibleCauses: [
      '최근 광고 성과가 기존 기준 범위를 벗어났습니다.',
      '광고 설정 변경, 시장 변동 또는 데이터 집계 문제가 영향을 줬을 수 있습니다.',
    ],

    actions: [
      '동일 기간의 관련 지표를 함께 비교합니다.',
      '최근 캠페인 설정 변경 여부를 확인합니다.',
      '이상이 지속되는지 추가 데이터를 확인합니다.',
    ],
  }
}

function calculateRoas(
  revenue,
  spend
) {
  return spend > 0
    ? (revenue / spend) * 100
    : 0
}

function calculateCpa(
  spend,
  conversions
) {
  return conversions > 0
    ? spend / conversions
    : 0
}

function calculateCtr(
  clicks,
  impressions
) {
  return impressions > 0
    ? (clicks / impressions) * 100
    : 0
}

function calculateCpc(
  spend,
  clicks
) {
  return clicks > 0
    ? spend / clicks
    : 0
}

function calculateCvr(
  conversions,
  clicks
) {
  return clicks > 0
    ? (conversions / clicks) * 100
    : 0
}

function calculateCpm(
  spend,
  impressions
) {
  return impressions > 0
    ? (spend / impressions) * 1000
    : 0
}

function getSharedProposalTokenFromPath() {
  const match =
    window.location.pathname.match(
      /^\/client\/proposal\/([^/]+)$/
    )

  return match
    ? decodeURIComponent(match[1])
    : null
}

function formatAxisValue(value) {
  if (Math.abs(value) >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억`
  }

  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(0)}만`
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(0)}천`
  }

  return value
}

function formatDisplayValue(
  value,
  format = 'auto',
  metric = null
) {
  const number = Number(value) || 0

  if (format === 'full') {
    return number.toLocaleString()
  }

  if (format === 'compact') {
    if (Math.abs(number) >= 100000000) {
      return `${(number / 100000000).toFixed(1)}억`
    }

    if (Math.abs(number) >= 10000) {
      return `${(number / 10000).toFixed(0)}만`
    }

    if (Math.abs(number) >= 1000) {
      return `${(number / 1000).toFixed(0)}천`
    }

    return number.toLocaleString()
  }

  if (format === 'currency') {
    return `₩${Math.round(number).toLocaleString()}`
  }

  if (format === 'percent') {
    return `${number.toFixed(2)}%`
  }

  // auto
  if (metric === 'ctr' || metric === 'cvr') {
    return `${number.toFixed(2)}%`
  }

  if (metric === 'roas') {
    return number.toFixed(2)
  }

  if (
    metric === 'spend' ||
    metric === 'revenue' ||
    metric === 'cpc' ||
    metric === 'cpa'
  ) {
    return `₩${Math.round(number).toLocaleString()}`
  }

  return number.toLocaleString()
}

const dimensions = [
  { key: 'date', label: '날짜' },
  { key: 'brand', label: '브랜드' },
  { key: 'channel', label: '광고 매체' },
  { key: 'campaign', label: '캠페인' },
  { key: 'content', label: '콘텐츠명' },
  { key: 'product', label: '제품' },
]

const measures = [
  { key: 'spend', label: '광고비' },
  { key: 'revenue', label: '매출' },
  { key: 'impressions', label: '노출 수' },
  { key: 'clicks', label: '클릭 수' },
  { key: 'conversions', label: '전환 수' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
  { key: 'cpa', label: 'CPA' },
  { key: 'cvr', label: 'CVR' },
  { key: 'roas', label: 'ROAS' },
]

const allFields = [...dimensions, ...measures]

const chartColors = [
  '#5965F2',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#84CC16',
]

function getLabel(key) {
  return allFields.find((field) => field.key === key)?.label || key
}


function calculateMetric(
  rows,
  metric,
  aggregationType = 'sum'
) {
  if (!rows || rows.length === 0) {
    return 0
  }

  const values = rows.map(
    (row) => Number(row[metric]) || 0
  )

  if (aggregationType === 'avg') {
    const total = values.reduce(
      (sum, value) => sum + value,
      0
    )

    return total / values.length
  }

  if (aggregationType === 'max') {
    return Math.max(...values)
  }

  if (aggregationType === 'min') {
    return Math.min(...values)
  }

  return values.reduce(
    (sum, value) => sum + value,
    0
  )
}

function calculatePerformanceMetrics(rows) {
  // -----------------------------------------
  // 비정상 음수 원천값 방어
  // 광고 성과 지표는 최적화/성과 계산에서
  // 0 미만 값으로 사용하지 않음
  // -----------------------------------------

  const safeRows = rows.map((row) => ({
    ...row,

    spend:
      Math.max(
        0,
        Number(row.spend) || 0
      ),

    revenue:
      Math.max(
        0,
        Number(row.revenue) || 0
      ),

    impressions:
      Math.max(
        0,
        Number(row.impressions) || 0
      ),

    clicks:
      Math.max(
        0,
        Number(row.clicks) || 0
      ),

    conversions:
      Math.max(
        0,
        Number(row.conversions) || 0
      ),
  }))

  const spend = calculateMetric(
    safeRows,
    'spend',
    'sum'
  )

  const revenue = calculateMetric(
    safeRows,
    'revenue',
    'sum'
  )

  const impressions = calculateMetric(
    safeRows,
    'impressions',
    'sum'
  )

  const clicks = calculateMetric(
    safeRows,
    'clicks',
    'sum'
  )

  const conversions = calculateMetric(
    safeRows,
    'conversions',
    'sum'
  )

  const roas =
    calculateRoas(
      revenue,
      spend
    )

  const cpa =
    calculateCpa(
      spend,
      conversions
    )

  const cpc =
    calculateCpc(
      spend,
      clicks
    )

  const ctr =
    calculateCtr(
      clicks,
      impressions
    )

  const cvr =
    calculateCvr(
      conversions,
      clicks
    )

  const cpm =
    calculateCpm(
      spend,
      impressions
    )

  return {
    spend,
    revenue,
    impressions,
    clicks,
    conversions,
    roas,
    cpa,
    cpc,
    ctr,
    cvr,
    cpm,
  }
}

function calculateChangeRate(
  currentValue,
  previousValue
) {
  const current =
    Number(currentValue) || 0

  const previous =
    Number(previousValue) || 0

  if (previous === 0) {
    return null
  }

  return (
    ((current - previous) / previous) *
    100
  )
}

function ClientLoginPage() {
  const { t } =
    useTranslation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleLogin(event) {
    event.preventDefault()

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/client-auth/login`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                email,
                password,
              }),
          }
        )

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        result.status !==
        'authenticated'
      ) {
        alert(
          result.message ||
          '로그인에 실패했습니다.'
        )

        return
      }

      localStorage.setItem(
        'adscope_client_access_token',
        result.accessToken
      )

      localStorage.setItem(
        'adscope_client_id',
        String(result.user.clientId)
      )

      localStorage.setItem(
        'adscope_client_advertiser_id',
        String(result.user.advertiserId)
      )

      localStorage.setItem(
        'adscope_client_email',
        result.user.email || ''
      )

      localStorage.setItem(
        'adscope_client_name',
        result.user.name || ''
      )

      localStorage.setItem(
        'adscope_client_brand',
        result.user.brandName || ''
      )


      window.location.href =
        '/client/dashboard'

    } catch (error) {
      console.error(
        'CLIENT LOGIN FAILED',
        error
      )

      alert(
        '로그인 중 오류가 발생했습니다.'
      )
    }
  }

  return (
    <div className="client-login-page">
      <div className="client-login-card">

        <div className="client-login-brand">
          <h1>AdScope</h1>
          <span>Client Portal</span>
        </div>

        <div className="client-login-heading">
          <h2>
            {t('client.login.title')}
          </h2>
          <p>
            {t('client.login.description')}
          </p>
        </div>

        <form
          className="client-login-form"
          onSubmit={handleLogin}
        >
          <label>
            {t('client.login.email')}
          </label>

          <input
            type="email"
            value={email}
            placeholder="name@company.com"
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />

          <label>
            {t('client.login.password')}
          </label>

          <input
            type="password"
            value={password}
            placeholder={
              t(
                'client.login.passwordPlaceholder'
              )
            }
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
          />

          <button type="submit">
            {t('client.login.submit')}
          </button>
        </form>

        <p className="client-login-help">
          {t('client.login.help')}
        </p>

      </div>
    </div>
  )
}

function ClientPortalHeader({
  activePage,
}) {
  const { t, i18n } =
    useTranslation()

  const clientId =
    localStorage.getItem(
      'adscope_client_id'
    )

  const [
    unreadCount,
    setUnreadCount,
  ] = useState(0)



  function logoutClient() {
    localStorage.removeItem(
      'adscope_client_access_token'
    )

    localStorage.removeItem(
      'adscope_client_id'
    )

    localStorage.removeItem(
      'adscope_client_advertiser_id'
    )

    localStorage.removeItem(
      'adscope_client_email'
    )

    localStorage.removeItem(
      'adscope_client_name'
    )

    localStorage.removeItem(
      'adscope_client_brand'
    )

    window.location.href =
      '/client/login'
  }

  useEffect(() => {
    if (!clientId) {
      setUnreadCount(0)
      return
    }

    let isMounted = true

    async function loadUnreadCount() {
      try {
        const response =
          await clientFetch(
            `${API_BASE_URL}/message-unread-count?readerType=client`
          )

        if (!response) {
          return
        }

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          )
        }

        const result =
          await response.json()

        if (
          isMounted &&
          result.status === 'ok'
        ) {
          setUnreadCount(
            Number(
              result.unreadCount || 0
            )
          )
        }
      } catch (error) {
        console.error(
          'FAILED TO LOAD HEADER UNREAD COUNT',
          error
        )
      }
    }

    loadUnreadCount()

    window.addEventListener(
      'client-messages-read',
      loadUnreadCount
    )

    const intervalId =
      window.setInterval(
        loadUnreadCount,
        5000
      )

    return () => {
      isMounted = false

      window.removeEventListener(
        'client-messages-read',
        loadUnreadCount
      )

      window.clearInterval(
        intervalId
      )
    }
  }, [clientId])

  return (
    <header className="client-portal-header">
      <div>
        <h1>AdScope</h1>
        <span>Client Portal</span>
      </div>

      <nav className="client-portal-nav">
        <button
          type="button"
          className={
            activePage === 'dashboard'
              ? 'active'
              : ''
          }
          onClick={() => {
            window.location.href =
              '/client/dashboard'
          }}
        >
          {t('nav.home')}
        </button>

        <button
          type="button"
          className={
            activePage === 'performance'
              ? 'active'
              : ''
          }
          onClick={() => {
            window.location.href =
              '/client/performance'
          }}
        >
          {t('nav.performance')}
        </button>

        <button
          type="button"
          className={
            activePage === 'proposals'
              ? 'active'
              : ''
          }
          onClick={() => {
            window.location.href =
              '/client/proposals'
          }}
        >
          {t('nav.proposals')}
        </button>

        <button
          type="button"
          className={
            activePage === 'messages'
              ? 'active'
              : ''
          }
          onClick={() => {
            window.location.href =
              '/client/messages'
          }}
        >
          {t('nav.messages')}

          {unreadCount > 0 && (
            <span className="nav-unread-badge">
              {unreadCount}
            </span>
          )}
        </button>

        <div className="language-switcher">
          <button
            type="button"
            className={
              i18n.language === 'ko'
                ? 'active'
                : ''
            }
            onClick={() => {
              i18n.changeLanguage('ko')
            }}
          >
            한국어
          </button>

          <button
            type="button"
            className={
              i18n.language === 'en'
                ? 'active'
                : ''
            }
            onClick={() => {
              i18n.changeLanguage('en')
            }}
          >
            English
          </button>
        </div>

        <button
          type="button"
          onClick={logoutClient}
        >
          {t('common.logout')}
        </button>
      </nav>
    </header>
  )
}

function ClientDashboardPage() {

  const clientId =
    localStorage.getItem(
      'adscope_client_id'
    )

  const clientName =
    localStorage.getItem(
      'adscope_client_name'
    )

  const clientBrand =
    localStorage.getItem(
      'adscope_client_brand'
    )

  const [
    clientProposals,
    setClientProposals,
  ] = useState([])

  const [
    clientProposalsLoading,
    setClientProposalsLoading,
  ] = useState(true)


  useEffect(() => {
    if (!clientId) {
      window.location.href =
        '/client/login'

      return
    }
    async function loadClientPortalProposals() {
      try {
        const token =
          localStorage.getItem(
            'adscope_client_access_token'
          )

        const response =
          await fetch(
            `${API_BASE_URL}/client-portal/proposals`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          )

        if (
          handleClientUnauthorized(
            response
          )
        ) {
          return
        }

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          )
        }

        const result =
          await response.json()

        const proposals =
          Array.isArray(result)
            ? result
            : Array.isArray(result.proposals)
              ? result.proposals
              : []

        setClientProposals(
          proposals.filter(
            (proposal) =>
              proposal.status !== 'cancelled' &&
              proposal.trashStatus !== 'trashed'
          )
        )
      } catch (error) {
        console.error(
          'FAILED TO LOAD CLIENT PORTAL PROPOSALS',
          error
        )
      } finally {
        setClientProposalsLoading(false)
      }
    }

    loadClientPortalProposals()
  }, [clientId])

  const latestProposal =
    [...clientProposals]
      .sort(
        (a, b) =>
          new Date(
            b.updatedAt || b.createdAt || 0
          ) -
          new Date(
            a.updatedAt || a.createdAt || 0
          )
      )[0] || null

  return (
    <div className="client-portal-page">
      <ClientPortalHeader
        activePage="dashboard"
      />

      <main className="client-portal-content">
        <section className="client-portal-welcome">
          <div>
            <h2>
              {clientBrand
                ? `${clientBrand} 광고 성과 대시보드`
                : '광고 성과 대시보드'}
            </h2>

            <p>
              {clientName
                ? `${clientName}님, 현재 광고 성과와 최근 제안 내용을 확인할 수 있습니다.`
                : '현재 광고 성과와 최근 제안 내용을 확인할 수 있습니다.'}
            </p>
          </div>
        </section>

        <section className="client-dashboard-metrics">
          <div>
            <span>총 광고비</span>
            <strong>311,111,111원</strong>
          </div>

          <div>
            <span>매출</span>
            <strong>1,634,238,991원</strong>
          </div>

          <div>
            <span>ROAS</span>
            <strong>525.3%</strong>
          </div>

          <div>
            <span>CPA</span>
            <strong>2,923원</strong>
          </div>
        </section>

        <section className="client-dashboard-grid">
          <div className="client-dashboard-card">
            <div className="client-dashboard-card-header">
              <h3>최근 제안</h3>
              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    '/client/proposals'
                }}
              >
                전체 보기
              </button>
            </div>

            {clientProposalsLoading ? (
              <div className="client-dashboard-item">
                <span>
                  제안 정보를 불러오는 중입니다.
                </span>
              </div>
            ) : latestProposal ? (
              <div className="client-dashboard-item">
                <div>
                  <strong>
                    {latestProposal.scenarioName ||
                      '광고 예산 최적화 제안'}
                  </strong>

                  <span>
                    {latestProposal.status === 'reviewing'
                      ? '검토가 필요한 제안입니다.'
                      : latestProposal.status === 'revision_requested'
                        ? '수정 요청이 전달된 제안입니다.'
                        : latestProposal.status === 'approved'
                          ? '승인 완료된 제안입니다.'
                          : '제안 상태를 확인해주세요.'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (latestProposal.shareUrl) {
                      window.location.href =
                        latestProposal.shareUrl
                    }
                  }}
                >
                  제안 보기
                </button>
              </div>
            ) : (
              <div className="client-dashboard-item">
                <span>
                  아직 공유된 제안이 없습니다.
                </span>
              </div>
            )}
          </div>

          <div className="client-dashboard-card">
            <div className="client-dashboard-card-header">
              <h3>최근 메시지</h3>
              <button type="button">
                전체 보기
              </button>
            </div>

            <div className="client-dashboard-item">
              <div>
                <strong>
                  운영 담당자
                </strong>

                <span>
                  새로운 광고 예산 최적화 제안이 공유되었습니다.
                </span>
              </div>

              <button type="button">
                메시지 보기
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function ClientProposalsPage() {

  const clientId =
    localStorage.getItem(
      'adscope_client_id'
    )

  const [
    clientProposals,
    setClientProposals,
  ] = useState([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  useEffect(() => {
    if (!clientId) {
      window.location.href =
        '/client/login'

      return
    }
    async function loadClientProposals() {
      try {
        const token =
          localStorage.getItem(
            'adscope_client_access_token'
          )

        const response =
          await fetch(
            `${API_BASE_URL}/client-portal/proposals`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          )

        if (
          handleClientUnauthorized(
            response
          )
        ) {
          return
        }

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          )
        }

        const result =
          await response.json()

        const proposals =
          Array.isArray(result)
            ? result
            : Array.isArray(result.proposals)
              ? result.proposals
              : []

        setClientProposals(
          proposals
            .filter(
              (proposal) =>
                proposal.status !== 'cancelled' &&
                proposal.trashStatus !== 'trashed'
            )
            .sort(
              (a, b) =>
                new Date(
                  b.updatedAt ||
                  b.createdAt ||
                  0
                ) -
                new Date(
                  a.updatedAt ||
                  a.createdAt ||
                  0
                )
            )
        )
      } catch (error) {
        console.error(
          'FAILED TO LOAD CLIENT PROPOSALS',
          error
        )
      } finally {
        setLoading(false)
      }
    }

    loadClientProposals()
  }, [clientId])

  return (
    <div className="client-portal-page">
      <ClientPortalHeader
        activePage="proposals"
      />

      <main className="client-portal-content">
        <section className="client-portal-welcome">
          <div>
            <h2>
              제안 및 승인
            </h2>

            <p>
              전달받은 광고 예산 최적화 제안을
              확인하고 검토할 수 있습니다.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="client-proposal-empty">
            제안 정보를 불러오는 중입니다.
          </div>
        ) : clientProposals.length === 0 ? (
          <div className="client-proposal-empty">
            아직 전달받은 제안이 없습니다.
          </div>
        ) : (
          <div className="client-proposal-list">
            {clientProposals.map(
              (proposal) => (
                <div
                  key={proposal.id}
                  className="client-proposal-list-item"
                >
                  <div className="client-proposal-list-main">
                    <div>
                      <strong>
                        {proposal.scenarioName ||
                          '광고 예산 최적화 제안'}
                      </strong>

                      <span>
                        {proposal.updatedAt
                          ? new Date(
                            proposal.updatedAt
                          ).toLocaleString()
                          : '-'}
                      </span>
                    </div>

                    <span className="client-proposal-status">
                      {proposal.status === 'reviewing'
                        ? '검토 필요'
                        : proposal.status === 'revision_requested'
                          ? '수정 요청'
                          : proposal.status === 'approved'
                            ? '승인 완료'
                            : '제안 준비'}
                    </span>
                  </div>

                  <div className="client-proposal-list-metrics">
                    <div>
                      <span>총예산</span>
                      <strong>
                        {Math.round(
                          proposal.totalBudget || 0
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>예상 매출</span>
                      <strong>
                        {Math.round(
                          proposal.summary
                            ?.projectedRevenue || 0
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>예상 ROAS</span>
                      <strong>
                        {Number(
                          proposal.summary
                            ?.projectedRoas || 0
                        ).toFixed(1)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>예상 CPA</span>
                      <strong>
                        {proposal.summary
                          ?.projectedCpa != null
                          ? `${Math.round(
                            proposal.summary
                              .projectedCpa
                          ).toLocaleString()}원`
                          : '-'}
                      </strong>
                    </div>
                  </div>

                  <div className="client-proposal-list-actions">
                    <button
                      type="button"
                      disabled={!proposal.shareUrl}
                      onClick={() => {
                        if (
                          proposal.shareUrl
                        ) {
                          window.location.href =
                            proposal.shareUrl
                        }
                      }}
                    >
                      제안 보기
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function InternalApp() {



  const [selectedChannel, setSelectedChannel] =
    useState('전체')

  const [chartType, setChartType] =
    useState('line')

  const [xField, setXField] =
    useState(null)

  const [yFields, setYFields] =
    useState([])

  const [groupField, setGroupField] =
    useState(null)

  const [filterField, setFilterField] =
    useState(null)

  const [filterValue, setFilterValue] =
    useState('전체')

  const [draggedField, setDraggedField] =
    useState(null)

  const [savedCharts, setSavedCharts] =
    useState([])

  const [dashboardLoaded, setDashboardLoaded] =
    useState(false)

  const [editingChartId, setEditingChartId] =
    useState(null)

  const [dragInfo, setDragInfo] =
    useState(null)

  const [sortOrder, setSortOrder] =
    useState('none')

  const [topN, setTopN] =
    useState('all')

  const [aggregation, setAggregation] =
    useState('sum')

  const [numberFormat, setNumberFormat] =
    useState('auto')

  const [chartTitle, setChartTitle] =
    useState('')

  const [chartDescription, setChartDescription] =
    useState('')

  const [legendVisible, setLegendVisible] =
    useState(true)

  const [xAxisVisible, setXAxisVisible] =
    useState(true)

  const [yAxisVisible, setYAxisVisible] =
    useState(true)

  const [infoOpen, setInfoOpen] =
    useState(true)

  const [dataOpen, setDataOpen] =
    useState(true)

  const [displayOpen, setDisplayOpen] =
    useState(true)

  const [globalChannel, setGlobalChannel] =
    useState('전체')

  const [globalCampaign, setGlobalCampaign] =
    useState('전체')

  const [globalProduct, setGlobalProduct] =
    useState('전체')

  const [dashboardCardSize, setDashboardCardSize] =
    useState('medium')

  const [dashboardColumns, setDashboardColumns] =
    useState('2')

  const [globalBrand, setGlobalBrand] =
    useState('전체')

  const [activePage, setActivePage] =
    useState('dashboard')

  const [
    anomalyAlerts,
    setAnomalyAlerts,
  ] = useState([])

  const [
    anomalyAlertSummary,
    setAnomalyAlertSummary,
  ] = useState({
    total: 0,
    open: 0,
    critical: 0,
    warning: 0,
    acknowledged: 0,
    resolved: 0,
  })

  const [
    anomalyAlertsLoading,
    setAnomalyAlertsLoading,
  ] = useState(false)

  const [
    anomalyAlertsError,
    setAnomalyAlertsError,
  ] = useState('')

  const [advertisers, setAdvertisers] =
    useState([])



  const [
    selectedAdvertiserId,
    setSelectedAdvertiserId,
  ] = useState(() => {
    return (
      localStorage.getItem(
        'selectedAdvertiserId'
      ) || ''
    )
  })

  const [advertisersLoading, setAdvertisersLoading] =
    useState(true)

  const [
    advertiserManagerOpen,
    setAdvertiserManagerOpen,
  ] = useState(false)

  const [
    advertiserManagerMode,
    setAdvertiserManagerMode,
  ] = useState('list')

  const [
    editingAdvertiserId,
    setEditingAdvertiserId,
  ] = useState(null)

  const [
    advertiserForm,
    setAdvertiserForm,
  ] = useState({
    name: '',
    companyName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  })

  const [performanceTab, setPerformanceTab] =
    useState('summary')

  const [
    performanceDataSource,
    setPerformanceDataSource,
  ] = useState(() => {
    return (
      localStorage.getItem(
        'performanceDataSource'
      ) || 'mock'
    )
  })

  const [
    performancePeriod,
    setPerformancePeriod,
  ] = useState(() => {
    return (
      localStorage.getItem(
        'performancePeriod'
      ) || '7d'
    )
  })

  useEffect(() => {
    const loadAdvertisers = async () => {
      setAdvertisersLoading(true)

      try {
        const token =
          localStorage.getItem(
            'adscope_operator_access_token'
          )

        const response = await fetch(
          `${API_BASE_URL}/advertisers`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        )

        if (
          handleOperatorUnauthorized(
            response
          )
        ) {
          return
        }

        const result = await response.json()

        if (result.status !== 'ok') {
          console.error(
            '광고주 목록 조회 실패:',
            result
          )
          return
        }

        const loadedAdvertisers =
          result.advertisers || []

        setAdvertisers(
          loadedAdvertisers
        )

        if (loadedAdvertisers.length === 0) {
          setSelectedAdvertiserId('')
          localStorage.removeItem(
            'selectedAdvertiserId'
          )
          return
        }

        const storedAdvertiserId =
          localStorage.getItem(
            'selectedAdvertiserId'
          )

        const storedAdvertiserExists =
          loadedAdvertisers.some(
            (advertiser) =>
              advertiser.id ===
              storedAdvertiserId
          )

        if (storedAdvertiserExists) {
          setSelectedAdvertiserId(
            storedAdvertiserId
          )
        } else {
          const firstAdvertiserId =
            loadedAdvertisers[0].id

          setSelectedAdvertiserId(
            firstAdvertiserId
          )

          localStorage.setItem(
            'selectedAdvertiserId',
            firstAdvertiserId
          )
        }
      } catch (error) {
        console.error(
          '광고주 목록 조회 오류:',
          error
        )
      } finally {
        setAdvertisersLoading(false)
      }
    }

    loadAdvertisers()
  }, [])

  useEffect(() => {
    if (!selectedAdvertiserId) {
      return
    }

    localStorage.setItem(
      'selectedAdvertiserId',
      selectedAdvertiserId
    )
  }, [selectedAdvertiserId])

  async function loadAnomalyAlerts() {
    if (!selectedAdvertiserId) {
      setAnomalyAlerts([])
      setAnomalyAlertSummary({
        total: 0,
        open: 0,
        critical: 0,
        warning: 0,
        acknowledged: 0,
        resolved: 0,
      })
      return
    }

    try {
      setAnomalyAlertsLoading(true)
      setAnomalyAlertsError('')

      const [
        summaryResponse,
        alertsResponse,
      ] = await Promise.all([
        operatorFetch(
          `${API_BASE_URL}/anomaly-alerts/summary?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        ),

        operatorFetch(
          `${API_BASE_URL}/anomaly-alerts?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        ),
      ])

      if (
        !summaryResponse ||
        !alertsResponse
      ) {
        return
      }

      if (
        !summaryResponse.ok ||
        !alertsResponse.ok
      ) {
        throw new Error(
          '이상 알림 데이터를 불러오지 못했습니다.'
        )
      }

      const summary =
        await summaryResponse.json()

      const alerts =
        await alertsResponse.json()

      if (
        summary.status === 'ok'
      ) {
        setAnomalyAlertSummary({
          total:
            Number(summary.total) || 0,

          open:
            Number(summary.open) || 0,

          critical:
            Number(summary.critical) || 0,

          warning:
            Number(summary.warning) || 0,

          acknowledged:
            Number(
              summary.acknowledged
            ) || 0,

          resolved:
            Number(
              summary.resolved
            ) || 0,
        })
      }

      if (
        alerts.status === 'ok'
      ) {
        setAnomalyAlerts(
          Array.isArray(
            alerts.alerts
          )
            ? alerts.alerts
            : []
        )
      }

    } catch (error) {
      console.error(
        'FAILED TO LOAD ANOMALY ALERTS',
        error
      )

      setAnomalyAlertsError(
        error.message ||
        '이상 알림 조회 중 오류가 발생했습니다.'
      )

    } finally {
      setAnomalyAlertsLoading(false)
    }
  }

  async function updateAnomalyAlertStatus(
    alertId,
    status
  ) {
    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/anomaly-alerts/${alertId}`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              status,
            }),
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `Alert 상태 변경 실패: ${response.status}`
        )
      }

      await loadAnomalyAlerts()

    } catch (error) {
      console.error(
        'FAILED TO UPDATE ANOMALY ALERT',
        error
      )

      setAnomalyAlertsError(
        error.message ||
        'Alert 상태 변경 중 오류가 발생했습니다.'
      )
    }
  }


  useEffect(() => {
    if (!selectedAdvertiserId) {
      return
    }

    loadAnomalyAlerts()

  }, [
    selectedAdvertiserId,
  ])



  useEffect(() => {
    localStorage.setItem(
      'performanceDataSource',
      performanceDataSource
    )
  }, [
    performanceDataSource,
  ])

  useEffect(() => {
    localStorage.setItem(
      'performancePeriod',
      performancePeriod
    )
  }, [
    performancePeriod,
  ])



  const [
    internalCampaignSort,
    setInternalCampaignSort,
  ] = useState('roas_desc')

  const [
    selectedInternalCampaign,
    setSelectedInternalCampaign,
  ] = useState(null)


  const [
    internalChannelSort,
    setInternalChannelSort,
  ] = useState('roas_desc')

  const [
    selectedInternalChannel,
    setSelectedInternalChannel,
  ] = useState(null)

  const [
    internalProductSort,
    setInternalProductSort,
  ] = useState('roas_desc')

  const [
    selectedInternalProduct,
    setSelectedInternalProduct,
  ] = useState(null)

  const [
    internalContentSort,
    setInternalContentSort,
  ] = useState('roas_desc')

  const [
    selectedInternalContent,
    setSelectedInternalContent,
  ] = useState(null)

  const [
    optimizationMode,
    setOptimizationMode,
  ] = useState('naverCampaign')

  const [optimizationBudget, setOptimizationBudget] =
    useState('')

  const [
    optimizationObjective,
    setOptimizationObjective,
  ] = useState('revenue')

  const [
    budgetChangeLimit,
    setBudgetChangeLimit,
  ] = useState(30)

  const [
    targetRoas,
    setTargetRoas,
  ] = useState('')

  const [
    targetCpa,
    setTargetCpa,
  ] = useState('')

  const [
    riskLevel,
    setRiskLevel,
  ] = useState('medium')

  const [
    optimizationApiResult,
    setOptimizationApiResult,
  ] = useState(null)

  const [
    optimizationApiError,
    setOptimizationApiError,
  ] = useState('')

  const [
    optimizationApiLoading,
    setOptimizationApiLoading,
  ] = useState(false)

  const [
    campaignBudgetPolicies,
    setCampaignBudgetPolicies,
  ] = useState([])

  const [
    campaignBudgetPolicyDrafts,
    setCampaignBudgetPolicyDrafts,
  ] = useState({})

  const [
    campaignBudgetPolicyMeta,
    setCampaignBudgetPolicyMeta,
  ] = useState({
    campaignCount: 0,

    optimizationEligibleCount: 0,

    excludedCampaignCount: 0,

    policyReadyCount: 0,

    missingPolicyCount: 0,

    currentTotalDailyBudget: 0,

    optimizationCurrentTotalDailyBudget: 0,
  })

  const [
    campaignBudgetPolicyLoading,
    setCampaignBudgetPolicyLoading,
  ] = useState(false)

  const [
    campaignBudgetPolicyError,
    setCampaignBudgetPolicyError,
  ] = useState('')

  const [
    campaignBudgetPolicySaving,
    setCampaignBudgetPolicySaving,
  ] = useState(false)

  const [
    budgetScalingResult,
    setBudgetScalingResult,
  ] = useState(null)

  const [
    budgetScalingLoading,
    setBudgetScalingLoading,
  ] = useState(false)

  const [
    budgetScalingError,
    setBudgetScalingError,
  ] = useState('')

  const [
    budgetScalingMultipliers,
    setBudgetScalingMultipliers,
  ] = useState([
    0.80,
    0.90,
    1.00,
    1.10,
    1.20,
    1.30,
  ])

  const [
    campaignBudgetBulkMinPct,
    setCampaignBudgetBulkMinPct,
  ] = useState('')

  const [
    campaignBudgetBulkMaxPct,
    setCampaignBudgetBulkMaxPct,
  ] = useState('')

  const [
    naverPreviewResult,
    setNaverPreviewResult,
  ] = useState(null)

  const [
    naverPreviewError,
    setNaverPreviewError,
  ] = useState('')

  const [
    naverPreviewLoading,
    setNaverPreviewLoading,
  ] = useState(false)

  const [
    riskScenarioComparison,
    setRiskScenarioComparison,
  ] = useState(null)

  const [
    riskScenarioLoading,
    setRiskScenarioLoading,
  ] = useState(false)

  const [
    savedOptimizationScenarios,
    setSavedOptimizationScenarios,
  ] = useState(() => {
    try {
      const saved =
        localStorage.getItem(
          'savedOptimizationScenarios'
        )

      return saved
        ? JSON.parse(saved)
        : []
    } catch (error) {
      console.error(
        'FAILED TO LOAD SAVED SCENARIOS',
        error
      )

      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(
        'savedOptimizationScenarios',
        JSON.stringify(
          savedOptimizationScenarios
        )
      )
    } catch (error) {
      console.error(
        'FAILED TO SAVE SCENARIOS',
        error
      )
    }
  }, [
    savedOptimizationScenarios,
  ])

  useEffect(() => {
    setSelectedScenarioIds([])
    setSelectedFinalScenarioId(null)
    setRevisionScenarioId('')
    setEditingScenarioId(null)
  }, [selectedAdvertiserId])

  const [
    scenarioName,
    setScenarioName,
  ] = useState('')

  const [
    selectedScenarioIds,
    setSelectedScenarioIds,
  ] = useState([])

  const [
    editingScenarioId,
    setEditingScenarioId,
  ] = useState(null)

  const [
    editingScenarioName,
    setEditingScenarioName,
  ] = useState('')

  const [
    scenarioNotes,
    setScenarioNotes,
  ] = useState({})

  const advertiserOptimizationScenarios =
    useMemo(() => {
      if (!selectedAdvertiserId) {
        return []
      }

      return savedOptimizationScenarios.filter(
        (scenario) =>
          scenario.advertiserId ===
          selectedAdvertiserId
      )
    }, [
      savedOptimizationScenarios,
      selectedAdvertiserId,
    ])

  const selectedScenarios = useMemo(() => {
    return selectedScenarioIds
      .map((scenarioId) =>
        advertiserOptimizationScenarios.find(
          (scenario) =>
            scenario.id === scenarioId
        )
      )
      .filter(Boolean)
  }, [
    selectedScenarioIds,
    savedOptimizationScenarios,
  ])

  const [
    selectedFinalScenarioId,
    setSelectedFinalScenarioId,
  ] = useState(null)

  const [
    taskStatusFilter,
    setTaskStatusFilter,
  ] = useState('all')

  const [
    taskAssigneeFilter,
    setTaskAssigneeFilter,
  ] = useState('all')

  const [
    taskSortOption,
    setTaskSortOption,
  ] = useState('priority')

  const [
    selectedTaskProposalId,
    setSelectedTaskProposalId,
  ] = useState(null)

  const [
    taskTrashOpen,
    setTaskTrashOpen,
  ] = useState(false)

  const [
    mediaDataPanelOpen,
    setMediaDataPanelOpen,
  ] = useState(false)

  const [
    performanceDataMenuOpen,
    setPerformanceDataMenuOpen,
  ] = useState(false)

  const [
    adConnections,
    setAdConnections,
  ] = useState([])



  const [
    realDailyAdPerformance,
    setRealDailyAdPerformance,
  ] = useState([])

  const [
    isNaverSyncing,
    setIsNaverSyncing,
  ] = useState(false)

  const [
    naverSyncStatus,
    setNaverSyncStatus,
  ] = useState('idle')

  const [
    naverLatestDate,
    setNaverLatestDate,
  ] = useState(null)

  const [
    naverBackfillJob,
    setNaverBackfillJob,
  ] = useState(null)

  const [
    isNaverBackfilling,
    setIsNaverBackfilling,
  ] = useState(false)

  const naverBackfillRunnerRef =
    useRef(false)

  const [
    naverBackfillError,
    setNaverBackfillError,
  ] = useState('')



  const normalizedRealAds =
    realDailyAdPerformance.map(
      (row) => ({
        id: row.id,
        date: row.date,

        channel:
          row.channel || 'Naver',

        campaign:
          row.campaign ||
          row.campaignName ||
          row.campaignId ||
          'Naver Campaign',

        campaignId:
          row.campaignId || '',

        brand:
          'Naver Connected Account',

        content:
          'Naver Campaign',

        product:
          'Naver Ads',

        spend:
          Number(row.spend) || 0,

        impressions:
          Number(row.impressions) || 0,

        clicks:
          Number(row.clicks) || 0,

        conversions:
          Number(row.conversions) || 0,

        revenue:
          Number(row.revenue) || 0,

        ctr:
          Number(row.ctr) || 0,

        cpc:
          Number(row.cpc) || 0,

        cvr:
          Number(row.cvr) || 0,

        cpa:
          Number(row.cpa) || 0,

        roas:
          Number(row.roas) || 0,

        platform:
          row.platform || 'naver',

        source:
          'real',
      })
    )


  const [
    naverConnectOpen,
    setNaverConnectOpen,
  ] = useState(false)

  const [
    naverApiUrl,
    setNaverApiUrl,
  ] = useState(
    'https://api.searchad.naver.com'
  )

  const [
    naverAccessToken,
    setNaverAccessToken,
  ] = useState('')

  const [
    naverSecretKey,
    setNaverSecretKey,
  ] = useState('')

  const [
    naverAccountId,
    setNaverAccountId,
  ] = useState('')

  const [
    googleConnectOpen,
    setGoogleConnectOpen,
  ] = useState(false)

  const [
    googleApiUrl,
    setGoogleApiUrl,
  ] = useState('')

  const [
    googleAccessToken,
    setGoogleAccessToken,
  ] = useState('')

  const [
    googleAccountId,
    setGoogleAccountId,
  ] = useState('')

  const [
    metaConnectOpen,
    setMetaConnectOpen,
  ] = useState(false)

  const [
    metaApiUrl,
    setMetaApiUrl,
  ] = useState('')

  const [
    metaAccessToken,
    setMetaAccessToken,
  ] = useState('')

  const [
    metaAccountId,
    setMetaAccountId,
  ] = useState('')

  const [
    tiktokConnectOpen,
    setTiktokConnectOpen,
  ] = useState(false)

  const [
    tiktokApiUrl,
    setTiktokApiUrl,
  ] = useState('')

  const [
    tiktokAccessToken,
    setTiktokAccessToken,
  ] = useState('')

  const [
    tiktokAccountId,
    setTiktokAccountId,
  ] = useState('')

  const [
    revisionScenarioId,
    setRevisionScenarioId,
  ] = useState('')

  const [
    manualRevisionBudgets,
    setManualRevisionBudgets,
  ] = useState({})

  const [
    revisionEditMode,
    setRevisionEditMode,
  ] = useState('scenario')

  const revisionScenario =
    advertiserOptimizationScenarios.find(
      (scenario) =>
        scenario.id === revisionScenarioId
    ) || null

  const [
    isClientHubOpen,
    setIsClientHubOpen,
  ] = useState(false)

  const [
    internalUnreadCount,
    setInternalUnreadCount,
  ] = useState(0)

  const [
    selectedHubProposalId,
    setSelectedHubProposalId,
  ] = useState(null)

  const [
    clientHubMessage,
    setClientHubMessage,
  ] = useState('')

  const [
    sharedProposal,
    setSharedProposal,
  ] = useState(null)

  const [
    sharedProposalLoading,
    setSharedProposalLoading,
  ] = useState(false)

  const [
    sharedProposalError,
    setSharedProposalError,
  ] = useState('')

  const [
    sharedRevisionReason,
    setSharedRevisionReason,
  ] = useState('')



  const [
    sharedProposalSubmitting,
    setSharedProposalSubmitting,
  ] = useState(false)

  const sharedProposalToken =
    getSharedProposalTokenFromPath()

  const [
    clientProposals,
    setClientProposals,
  ] = useState(() => {
    try {
      const saved =
        localStorage.getItem(
          'clientProposals'
        )

      return saved
        ? JSON.parse(saved)
        : []
    } catch (error) {
      console.error(
        'FAILED TO LOAD CLIENT PROPOSALS',
        error
      )

      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(
        'clientProposals',
        JSON.stringify(
          clientProposals
        )
      )
    } catch (error) {
      console.error(
        'FAILED TO SAVE CLIENT PROPOSALS',
        error
      )
    }
  }, [
    clientProposals,
  ])

  useEffect(() => {
    loadClientProposalsFromServer()
    loadAdConnectionsFromServer()
    loadRealDailyAdPerformance()
    loadInternalUnreadCount()
  }, [selectedAdvertiserId])

  useEffect(() => {
    if (!selectedAdvertiserId) {
      return
    }

    loadInternalUnreadCount()

    const intervalId =
      window.setInterval(
        loadInternalUnreadCount,
        3000
      )

    return () => {
      window.clearInterval(
        intervalId
      )
    }
  }, [selectedAdvertiserId])

  useEffect(() => {
    applyPerformancePeriod(
      performancePeriod
    )
  }, [
    performanceDataSource,
    realDailyAdPerformance,
    performancePeriod,
  ])

  useEffect(() => {
    if (
      performanceDataSource !== 'naver' ||
      !selectedAdvertiserId
    ) {
      setNaverBackfillJob(null)
      return
    }

    async function initializeNaverPerformance() {
      const connections =
        await loadAdConnectionsFromServer()

      const connectedNaver =
        connections.find(
          (connection) =>
            connection.platform === 'naver' &&
            connection.status === 'connected'
        )

      if (!connectedNaver) {
        setNaverBackfillJob(null)
        return
      }

      await syncNaverLatest()

      await loadNaverBackfillStatus()
    }

    initializeNaverPerformance()
  }, [
    performanceDataSource,
    selectedAdvertiserId,
  ])

  useEffect(() => {
    if (
      performanceDataSource !== 'naver'
    ) {
      return
    }

    if (!naverBackfillJob) {
      return
    }

    if (
      naverBackfillJob.status ===
      'completed'
    ) {
      return
    }

    if (
      naverBackfillRunnerRef.current
    ) {
      return
    }

    console.log(
      'STARTING NAVER BACKFILL RUNNER'
    )

    runNaverBackfill()
  }, [
    performanceDataSource,
    naverBackfillJob?.id,
    naverBackfillJob?.status,
  ])



  function updateClientProposalPriority(
    proposalId,
    priority
  ) {
    setClientProposals(
      (previous) =>
        previous.map(
          (proposal) =>
            proposal.id === proposalId
              ? {
                ...proposal,
                priority,
                updatedAt:
                  new Date().toISOString(),
              }
              : proposal
        )
    )
  }

  const filteredClientTasks = useMemo(() => {
    const priorityOrder = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    }

    const filtered =
      clientProposals.filter(
        (proposal) => {
          const notDeleted =
            proposal.trashStatus !== 'trashed' &&
            proposal.status !== 'cancelled'

          const statusMatched =
            taskStatusFilter === 'all' ||
            proposal.taskStatus ===
            taskStatusFilter

          const assigneeMatched =
            taskAssigneeFilter === 'all' ||
            proposal.assignee ===
            taskAssigneeFilter

          return (
            notDeleted &&
            statusMatched &&
            assigneeMatched
          )
        }
      )

    return [...filtered].sort(
      (first, second) => {
        if (
          taskSortOption === 'priority'
        ) {
          return (
            (priorityOrder[
              second.priority || 'normal'
            ] || 0) -
            (priorityOrder[
              first.priority || 'normal'
            ] || 0)
          )
        }

        if (
          taskSortOption === 'dueDate'
        ) {
          if (
            !first.dueDate &&
            !second.dueDate
          ) {
            return 0
          }

          if (!first.dueDate) {
            return 1
          }

          if (!second.dueDate) {
            return -1
          }

          return (
            new Date(first.dueDate) -
            new Date(second.dueDate)
          )
        }

        if (
          taskSortOption === 'updatedAt'
        ) {
          return (
            new Date(
              second.updatedAt ||
              second.createdAt
            ) -
            new Date(
              first.updatedAt ||
              first.createdAt
            )
          )
        }

        return 0
      }
    )
  }, [
    clientProposals,
    taskStatusFilter,
    taskAssigneeFilter,
    taskSortOption,
  ])

  const selectedTaskProposal = useMemo(() => {
    if (!selectedTaskProposalId) {
      return null
    }

    return (
      clientProposals.find(
        (proposal) =>
          proposal.id === selectedTaskProposalId
      ) || null
    )
  }, [
    selectedTaskProposalId,
    clientProposals,
  ])

  const selectedHubProposal = useMemo(() => {
    if (clientProposals.length === 0) {
      return null
    }

    if (!selectedHubProposalId) {
      return clientProposals[0]
    }

    return (
      clientProposals.find(
        (proposal) =>
          proposal.id === selectedHubProposalId
      ) || clientProposals[0]
    )
  }, [
    clientProposals,
    selectedHubProposalId,
  ])

  const selectedHubUnreadClientCount =
    useMemo(() => {
      if (!selectedHubProposal) {
        return 0
      }

      return (
        selectedHubProposal.messages || []
      ).filter(
        (message) =>
          message.senderType === 'client' &&
          !message.isRead
      ).length
    }, [
      selectedHubProposal,
    ])

  useEffect(() => {
    if (
      isClientHubOpen &&
      !selectedHubProposalId &&
      selectedHubProposal
    ) {
      setSelectedHubProposalId(
        selectedHubProposal.id
      )
    }
  }, [
    isClientHubOpen,
    selectedHubProposalId,
    selectedHubProposal,
  ])

  useEffect(() => {
    if (!isClientHubOpen) {
      return
    }

    if (!selectedHubProposal?.id) {
      return
    }

    function refreshClientHubData() {
      if (
        !selectedHubProposal?.id ||
        !selectedAdvertiserId
      ) {
        return
      }

      loadClientProposalMessages(
        selectedHubProposal.id,
        selectedAdvertiserId
      )

      loadClientProposalEvents(
        selectedHubProposal.id,
        {
          actorType: 'operator',
          advertiserId:
            selectedAdvertiserId,
        }
      )
    }

    // Hub를 열거나 제안이 바뀌었을 때 즉시 1회 실행
    refreshClientHubData()

    // 이후 3초마다 새 메시지 확인
    const intervalId =
      window.setInterval(
        refreshClientHubData,
        3000
      )

    return () => {
      window.clearInterval(
        intervalId
      )
    }
  }, [
    isClientHubOpen,
    selectedHubProposal?.id,
    selectedAdvertiserId,
  ])

  useEffect(() => {
    if (!sharedProposalToken) {
      return
    }

    loadSharedClientProposal(
      sharedProposalToken
    )
  }, [
    sharedProposalToken,
  ])

  const clientHubTimeline = useMemo(() => {
    if (!selectedHubProposal) {
      return []
    }

    const messageEvents =
      (
        selectedHubProposal.messages ||
        []
      ).map((message) => ({
        id:
          `message_${message.id}`,

        type:
          'message',

        createdAt:
          message.createdAt,

        data:
          message,
      }))

    const statusEvents =
      (
        selectedHubProposal.history ||
        []
      ).map(
        (historyItem, index) => ({
          id:
            `${historyItem.type ||
            'status'
            }_${historyItem.createdAt
            }_${index}`,

          type:
            historyItem.type ||
            'status',

          createdAt:
            historyItem.createdAt,

          data:
            historyItem,
        })
      )

    return [
      ...messageEvents,
      ...statusEvents,
    ].sort(
      (first, second) =>
        new Date(first.createdAt) -
        new Date(second.createdAt)
    )
  }, [
    selectedHubProposal,
  ])

  const taskAssignees = useMemo(() => {
    return [
      ...new Set(
        clientProposals
          .map(
            (proposal) =>
              proposal.assignee
          )
          .filter(Boolean)
      ),
    ]
  }, [
    clientProposals,
  ])

  const trashedClientTasks = useMemo(
    () =>
      clientProposals.filter(
        (proposal) =>
          proposal.trashStatus === 'trashed'
      ),
    [clientProposals]
  )

  const metaConnection =
    adConnections.find(
      (connection) =>
        connection.platform === 'meta'
    )

  const taskDashboardSummary = useMemo(() => {
    const today =
      new Date()

    today.setHours(
      0,
      0,
      0,
      0
    )

    return clientProposals.reduce(
      (summary, proposal) => {
        if (
          proposal.status === 'cancelled' ||
          proposal.trashStatus === 'trashed'
        ) {
          return summary
        }
        if (
          proposal.taskStatus === 'waiting'
        ) {
          summary.waiting += 1
        }

        if (
          proposal.taskStatus === 'in_progress'
        ) {
          summary.inProgress += 1
        }

        if (
          proposal.taskStatus === 'reviewing'
        ) {
          summary.reviewing += 1
        }

        if (
          proposal.taskStatus === 'done'
        ) {
          summary.done += 1
        }

        if (
          proposal.dueDate &&
          proposal.taskStatus !== 'done'
        ) {
          const dueDate =
            new Date(
              `${proposal.dueDate}T00:00:00`
            )

          if (
            dueDate.getTime() <
            today.getTime()
          ) {
            summary.overdue += 1
          }
        }

        return summary
      },
      {
        waiting: 0,
        inProgress: 0,
        reviewing: 0,
        done: 0,
        overdue: 0,
      }
    )
  }, [
    clientProposals,
  ])

  const activeClientTaskCount =
    clientProposals.filter(
      (proposal) =>
        proposal.status !== 'cancelled' &&
        proposal.trashStatus !== 'trashed'
    ).length

  useEffect(() => {
    try {
      localStorage.setItem(
        'clientProposals',
        JSON.stringify(
          clientProposals
        )
      )
    } catch (error) {
      console.error(
        'FAILED TO SAVE CLIENT PROPOSALS',
        error
      )
    }
  }, [
    clientProposals,
  ])

  const scenarioComparisonInsight = useMemo(() => {
    if (selectedScenarios.length !== 2) {
      return null
    }

    const [scenarioA, scenarioB] =
      selectedScenarios

    const revenueDifference =
      scenarioB.summary.projectedRevenue -
      scenarioA.summary.projectedRevenue

    const roasDifference =
      scenarioB.summary.projectedRoas -
      scenarioA.summary.projectedRoas

    const cpaA =
      scenarioA.summary.projectedCpa

    const cpaB =
      scenarioB.summary.projectedCpa

    const cpaDifference =
      cpaA !== null &&
        cpaA !== undefined &&
        cpaB !== null &&
        cpaB !== undefined
        ? cpaB - cpaA
        : null

    const allocationDifferences = [
      ...new Set(
        selectedScenarios.flatMap(
          (scenario) =>
            scenario.allocations.map(
              (item) => item.channel
            )
        )
      ),
    ].map((channel) => {
      const allocationA =
        scenarioA.allocations.find(
          (item) =>
            item.channel === channel
        )

      const allocationB =
        scenarioB.allocations.find(
          (item) =>
            item.channel === channel
        )

      return {
        channel,

        scenarioABudget:
          allocationA?.optimizedBudget || 0,

        scenarioBBudget:
          allocationB?.optimizedBudget || 0,

        difference:
          (allocationB?.optimizedBudget || 0) -
          (allocationA?.optimizedBudget || 0),
      }
    })

    let summary = ''

    if (
      revenueDifference > 0 &&
      roasDifference > 0
    ) {
      summary =
        '두 번째 시나리오는 첫 번째 시나리오보다 예상 매출과 ROAS가 모두 높습니다.'
    } else if (
      revenueDifference > 0 &&
      roasDifference <= 0
    ) {
      summary =
        '두 번째 시나리오는 예상 매출은 높지만 ROAS는 낮아, 성장성과 효율성 사이의 트레이드오프가 있습니다.'
    } else if (
      revenueDifference <= 0 &&
      roasDifference > 0
    ) {
      summary =
        '두 번째 시나리오는 예상 매출은 낮지만 ROAS가 높아, 효율 중심 운영에 더 적합합니다.'
    } else {
      summary =
        '첫 번째 시나리오가 예상 매출과 ROAS 기준에서 상대적으로 우수합니다.'
    }

    return {
      revenueDifference,
      roasDifference,
      cpaDifference,
      allocationDifferences,
      summary,
    }
  }, [
    selectedScenarios,
  ])

  function getOptimizationObjectiveLabel(
    objective
  ) {
    switch (objective) {
      case 'revenue':
        return '예상 매출 최대화'

      case 'conversions':
        return '예상 전환 최대화'

      case 'revenueWithRoas':
        return '목표 ROAS 이상에서 매출 최대화'

      case 'conversionsWithCpa':
        return '목표 CPA 이하에서 전환 최대화'

      case 'riskAdjustedRevenue':
        return '리스크를 고려한 매출 최대화'

      default:
        return objective || '-'
    }
  }

  function deleteSavedOptimizationScenario(
    scenarioId
  ) {
    setSavedOptimizationScenarios(
      (previous) =>
        previous.filter(
          (scenario) =>
            scenario.id !== scenarioId
        )
    )

    setSelectedScenarioIds(
      (previous) =>
        previous.filter(
          (id) =>
            id !== scenarioId
        )
    )
  }

  function startEditingScenarioName(
    scenario
  ) {
    setEditingScenarioId(
      scenario.id
    )

    setEditingScenarioName(
      scenario.name || ''
    )
  }

  function saveEditedScenarioName(
    scenarioId
  ) {
    const nextName =
      editingScenarioName.trim()

    if (!nextName) {
      return
    }

    setSavedOptimizationScenarios(
      (previous) =>
        previous.map(
          (scenario) =>
            scenario.id === scenarioId
              ? {
                ...scenario,
                name: nextName,
              }
              : scenario
        )
    )

    setEditingScenarioId(null)
    setEditingScenarioName('')
  }

  function updateScenarioStatus(
    scenarioId,
    status
  ) {
    setSavedOptimizationScenarios(
      (previous) =>
        previous.map(
          (scenario) =>
            scenario.id === scenarioId
              ? {
                ...scenario,
                status,
              }
              : scenario
        )
    )
  }

  function selectFinalScenario(
    scenarioId
  ) {
    setSavedOptimizationScenarios(
      (previous) => {
        const selectedScenario =
          previous.find(
            (scenario) =>
              scenario.id === scenarioId &&
              scenario.advertiserId ===
              selectedAdvertiserId
          )

        if (!selectedScenario) {
          return previous
        }

        const shouldRemoveFinal =
          selectedScenario.isFinal === true

        setSelectedFinalScenarioId(
          shouldRemoveFinal
            ? null
            : scenarioId
        )

        return previous.map(
          (scenario) => {
            if (
              scenario.advertiserId !==
              selectedAdvertiserId
            ) {
              return scenario
            }

            return {
              ...scenario,

              isFinal:
                shouldRemoveFinal
                  ? false
                  : scenario.id === scenarioId,
            }
          }
        )
      }
    )
  }

  async function loadClientProposalsFromServer() {
    if (!selectedAdvertiserId) {
      setClientProposals([])
      return
    }

    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/operator-client-proposals?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        Array.isArray(
          result.proposals
        )
      ) {
        setClientProposals(
          result.proposals
        )
      } else {
        setClientProposals([])
      }
    } catch (error) {
      console.error(
        'FAILED TO LOAD CLIENT PROPOSALS FROM SERVER',
        error
      )

      setClientProposals([])
    }
  }

  async function loadInternalUnreadCount() {
    try {
      if (!selectedAdvertiserId) {
        setInternalUnreadCount(0)
        return
      }

      const response =
        await operatorFetch(
          `${API_BASE_URL}/message-unread-count?readerType=internal&advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (result.status === 'ok') {
        setInternalUnreadCount(
          Number(
            result.unreadCount || 0
          )
        )
      }
    } catch (error) {
      console.error(
        'FAILED TO LOAD INTERNAL UNREAD COUNT',
        error
      )

      setInternalUnreadCount(0)
    }
  }



  async function loadAdConnectionsFromServer() {
    if (!selectedAdvertiserId) {
      setAdConnections([])
      return []
    }

    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/ad-connections?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        )

      if (!response) {
        return []
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        result.status !== 'ok' ||
        !Array.isArray(
          result.connections
        )
      ) {
        throw new Error(
          result.message ||
          '매체 연결 정보를 불러오지 못했습니다.'
        )
      }

      setAdConnections(
        result.connections
      )

      return result.connections
    } catch (error) {
      console.error(
        'FAILED TO LOAD AD CONNECTIONS',
        error
      )

      setAdConnections([])

      return []
    }
  }


  async function loadRealDailyAdPerformance() {
    try {
      if (!selectedAdvertiserId) {
        setRealDailyAdPerformance([])
        return
      }



      // 현재 선택된 광고주의 연결 계정 조회
      const connectionsResponse =
        await operatorFetch(
          `${API_BASE_URL}/ad-connections?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        )

      if (!connectionsResponse) {
        return
      }

      if (!connectionsResponse.ok) {
        throw new Error(
          'Failed to load ad connections'
        )
      }

      const connectionsData =
        await connectionsResponse.json()

      if (connectionsData.status !== 'ok') {
        throw new Error(
          connectionsData.message ||
          'Failed to load ad connections'
        )
      }

      const connections =
        Array.isArray(
          connectionsData.connections
        )
          ? connectionsData.connections
          : []

      const connectedNaver =
        connections.find(
          (connection) =>
            connection.platform ===
            'naver' &&
            connection.status ===
            'connected'
        )

      if (!connectedNaver) {
        setRealDailyAdPerformance([])
        return
      }

      const accountId =
        connectedNaver.customerId ||
        connectedNaver.accountId

      if (!accountId) {
        setRealDailyAdPerformance([])
        return
      }

      // 현재 광고주의 Naver 일별 성과 조회
      const response =
        await operatorFetch(
          `${API_BASE_URL}/ad-performance/daily?platform=naver&advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          'Failed to load daily ad performance'
        )
      }

      const data = await response.json()

      const performance =
        Array.isArray(data.performance)
          ? data.performance
          : []

      setRealDailyAdPerformance(
        performance
      )



    } catch (error) {
      console.error(
        'Failed to load daily Naver performance:',
        error
      )

      setRealDailyAdPerformance([])
    }
  }




  async function reloadAdvertisers(
    preferredAdvertiserId = null
  ) {
    try {
      setAdvertisersLoading(true)

      const response =
        await operatorFetch(
          `${API_BASE_URL}/advertisers`
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          'Failed to reload advertisers'
        )
      }

      const result = await response.json()

      if (result.status !== 'ok') {
        throw new Error(
          result.message ||
          '광고주 목록 조회에 실패했습니다.'
        )
      }

      const loadedAdvertisers =
        Array.isArray(result.advertisers)
          ? result.advertisers
          : []

      setAdvertisers(loadedAdvertisers)

      const activeAdvertisers =
        loadedAdvertisers.filter(
          (advertiser) =>
            advertiser.status !== 'archived'
        )

      if (activeAdvertisers.length === 0) {
        setSelectedAdvertiserId('')

        localStorage.removeItem(
          'selectedAdvertiserId'
        )

        return
      }

      const preferredAdvertiser =
        preferredAdvertiserId
          ? activeAdvertisers.find(
            (advertiser) =>
              advertiser.id ===
              preferredAdvertiserId
          )
          : null

      const currentAdvertiser =
        activeAdvertisers.find(
          (advertiser) =>
            advertiser.id ===
            selectedAdvertiserId
        )

      const nextAdvertiserId =
        preferredAdvertiser?.id ||
        currentAdvertiser?.id ||
        activeAdvertisers[0].id

      setSelectedAdvertiserId(
        nextAdvertiserId
      )

      localStorage.setItem(
        'selectedAdvertiserId',
        nextAdvertiserId
      )
    } catch (error) {
      console.error(
        '광고주 목록 새로고침 오류:',
        error
      )

      alert(
        '광고주 목록을 새로고침하지 못했습니다.'
      )
    } finally {
      setAdvertisersLoading(false)
    }
  }

  async function createAdvertiser() {
    const advertiserName =
      advertiserForm.name.trim()

    if (!advertiserName) {
      alert('광고주명을 입력해주세요.')
      return
    }

    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/advertisers`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              name: advertiserName,
              companyName:
                advertiserForm.companyName.trim() ||
                null,
              contactName:
                advertiserForm.contactName.trim() ||
                null,
              contactEmail:
                advertiserForm.contactEmail.trim() ||
                null,
              contactPhone:
                advertiserForm.contactPhone.trim() ||
                null,
            }),
          }
        )
      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          'Failed to create advertiser'
        )
      }

      const result = await response.json()

      if (
        result.status !== 'ok' ||
        !result.advertiser?.id
      ) {
        alert(
          result.message ||
          '광고주 추가에 실패했습니다.'
        )
        return
      }

      await reloadAdvertisers(
        result.advertiser.id
      )

      setAdvertiserForm({
        name: '',
        companyName: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
      })

      setEditingAdvertiserId(null)
      setAdvertiserManagerMode('list')
    } catch (error) {
      console.error(
        '광고주 추가 오류:',
        error
      )

      alert('광고주 추가에 실패했습니다.')
    }
  }

  async function updateAdvertiser() {
    if (!editingAdvertiserId) {
      alert('수정할 광고주가 선택되지 않았습니다.')
      return
    }

    const advertiserName =
      advertiserForm.name.trim()

    if (!advertiserName) {
      alert('광고주명을 입력해주세요.')
      return
    }

    try {


      const response =
        await operatorFetch(
          `${API_BASE_URL}/advertisers/${encodeURIComponent(
            editingAdvertiserId
          )}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json',

            },
            body: JSON.stringify({
              name: advertiserName,
              companyName:
                advertiserForm.companyName.trim(),
              contactName:
                advertiserForm.contactName.trim(),
              contactEmail:
                advertiserForm.contactEmail.trim(),
              contactPhone:
                advertiserForm.contactPhone.trim(),
            }),
          }
        )
      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          'Failed to update advertiser'
        )
      }

      const result = await response.json()

      if (result.status !== 'ok') {
        alert(
          result.message ||
          '광고주 수정에 실패했습니다.'
        )
        return
      }

      await reloadAdvertisers()

      setEditingAdvertiserId(null)
      setAdvertiserManagerMode('list')
    } catch (error) {
      console.error(
        '광고주 수정 오류:',
        error
      )

      alert('광고주 수정에 실패했습니다.')
    }
  }

  async function changeAdvertiserStatus(
    advertiserId,
    nextStatus
  ) {
    if (
      nextStatus !== 'active' &&
      nextStatus !== 'archived'
    ) {
      return
    }

    const targetAdvertiser =
      advertisers.find(
        (advertiser) =>
          advertiser.id === advertiserId
      )

    if (!targetAdvertiser) {
      alert('광고주를 찾을 수 없습니다.')
      return
    }

    if (nextStatus === 'archived') {
      const confirmed = window.confirm(
        `${targetAdvertiser.name} 광고주를 비활성화하시겠습니까?`
      )

      if (!confirmed) {
        return
      }
    }

    try {


      const response =
        await operatorFetch(
          `${API_BASE_URL}/advertisers/${encodeURIComponent(
            advertiserId
          )}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              status: nextStatus,
            }),
          }
        )
      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          'Failed to change advertiser status'
        )
      }

      const result = await response.json()

      if (result.status !== 'ok') {
        alert(
          result.message ||
          '광고주 상태 변경에 실패했습니다.'
        )
        return
      }

      const preferredAdvertiserId =
        nextStatus === 'active'
          ? advertiserId
          : null

      await reloadAdvertisers(
        preferredAdvertiserId
      )
    } catch (error) {
      console.error(
        '광고주 상태 변경 오류:',
        error
      )

      alert(
        '광고주 상태를 변경하지 못했습니다.'
      )
    }
  }

  async function deleteAdvertiser(
    advertiserId
  ) {
    const targetAdvertiser =
      advertisers.find(
        (advertiser) =>
          advertiser.id ===
          advertiserId
      )

    if (!targetAdvertiser) {
      alert(
        '광고주를 찾을 수 없습니다.'
      )
      return
    }

    const confirmed =
      window.confirm(
        `'${targetAdvertiser.name}' 광고주를 영구 삭제하시겠습니까?\n\n삭제된 광고주는 복원할 수 없습니다.`
      )

    if (!confirmed) {
      return
    }

    try {


      const response =
        await operatorFetch(
          `${API_BASE_URL}/advertisers/${encodeURIComponent(
            advertiserId
          )}`,
          {
            method: 'DELETE',


          }
        )

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (result.status === 'in_use') {
        alert(
          result.message ||
          '연결된 데이터가 있어 삭제할 수 없습니다.'
        )
        return
      }

      if (result.status !== 'deleted') {
        alert(
          result.message ||
          '광고주 삭제에 실패했습니다.'
        )
        return
      }

      await reloadAdvertisers()

    } catch (error) {
      console.error(
        '광고주 삭제 오류:',
        error
      )

      alert(
        '광고주 삭제에 실패했습니다.'
      )
    }
  }

  async function syncNaverLatest() {
    if (!selectedAdvertiserId) {
      return null
    }

    if (isNaverSyncing) {
      return
    }

    setIsNaverSyncing(true)
    setNaverSyncStatus('syncing')

    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/ad-connections/naver/sync-latest?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`,
          {
            method: 'POST',
          }
        )

      if (!response) {
        return null
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (result.status !== 'ok') {
        throw new Error(
          result.message ||
          'Naver 최신 데이터 동기화에 실패했습니다.'
        )
      }

      if (result.syncMode === 'up_to_date') {
        setNaverSyncStatus('latest')

        setNaverLatestDate(
          result.latestDate || null
        )
      } else {
        setNaverSyncStatus('updated')

        setNaverLatestDate(
          result.syncUntil ||
          result.previousLatestDate ||
          null
        )
      }

      await loadRealDailyAdPerformance()

      return result
    } catch (error) {
      console.error(
        'FAILED TO SYNC NAVER LATEST',
        error
      )

      setNaverSyncStatus('error')

      return null
    } finally {
      setIsNaverSyncing(false)
    }
  }

  async function loadNaverBackfillStatus() {
    if (!selectedAdvertiserId) {
      setNaverBackfillJob(null)
      setNaverBackfillError('')
      return null
    }

    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/ad-connections/naver/backfill/status?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        )

      if (!response) {
        return null
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        result.hasJob &&
        result.job
      ) {
        setNaverBackfillJob(
          result.job
        )
      } else {
        setNaverBackfillJob(null)
      }

      setNaverBackfillError('')

      return result
    } catch (error) {
      console.error(
        'FAILED TO LOAD NAVER BACKFILL STATUS',
        error
      )

      setNaverBackfillJob(null)

      setNaverBackfillError(
        error.message ||
        'Backfill 상태를 확인할 수 없습니다.'
      )

      return null
    }
  }

  async function startNaverHistoricalBackfill() {
    try {
      const statusResponse =
        await operatorFetch(
          `${API_BASE_URL}/ad-connections/naver/backfill/status?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`
        )

      if (!statusResponse) {
        return null
      }

      if (!statusResponse.ok) {
        throw new Error(
          `Status HTTP ${statusResponse.status}`
        )
      }

      const statusResult =
        await statusResponse.json()

      // 이미 진행 중이거나 완료된 Job이 있으면
      // 새 Job을 만들지 않는다.
      if (
        statusResult.hasJob &&
        statusResult.job
      ) {
        setNaverBackfillJob(
          statusResult.job
        )

        return statusResult
      }

      setNaverBackfillError('')

      const response =
        await operatorFetch(
          `${API_BASE_URL}/ad-connections/naver/backfill/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                advertiserId:
                  selectedAdvertiserId,
              }),
          }
        )

      if (!response) {
        return null
      }

      if (!response.ok) {
        throw new Error(
          `Start HTTP ${response.status}`
        )
      }

      // 아래 기존 코드 그대로 유지

      const result =
        await response.json()

      if (result.status !== 'ok') {
        throw new Error(
          result.message ||
          'Historical Backfill Job 생성에 실패했습니다.'
        )
      }

      await loadNaverBackfillStatus()

      return result
    } catch (error) {
      console.error(
        'FAILED TO START NAVER BACKFILL',
        error
      )

      setNaverBackfillError(
        error.message ||
        '과거 데이터 수집을 시작할 수 없습니다.'
      )

      return null
    }
  }

  async function runNaverBackfill() {
    if (naverBackfillRunnerRef.current) {
      return
    }

    naverBackfillRunnerRef.current = true
    setIsNaverBackfilling(true)
    setNaverBackfillError('')

    try {
      let shouldContinue = true
      let safetyCount = 0

      while (
        shouldContinue &&
        safetyCount < 200
      ) {
        safetyCount += 1

        const statusResult =
          await loadNaverBackfillStatus()

        if (
          !statusResult ||
          !statusResult.hasJob ||
          !statusResult.job
        ) {
          shouldContinue = false
          break
        }

        const job =
          statusResult.job

        if (job.status === 'completed') {
          shouldContinue = false
          break
        }

        if (
          job.status === 'retry_pending'
        ) {
          const retryResponse =
            await operatorFetch(
              `${API_BASE_URL}/ad-connections/naver/backfill/retry`,
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                },
                body:
                  JSON.stringify({
                    maxRetries: 3,
                    advertiserId:
                      selectedAdvertiserId,
                  }),
              }
            )

          if (!retryResponse) {
            return
          }

          if (!retryResponse.ok) {
            throw new Error(
              `Retry HTTP ${retryResponse.status}`
            )
          }

          const retryResult =
            await retryResponse.json()

          if (
            retryResult.status !== 'ok'
          ) {
            throw new Error(
              retryResult.message ||
              'Backfill 재시도에 실패했습니다.'
            )
          }

          await loadNaverBackfillStatus()

          if (
            retryResult.jobStatus ===
            'completed'
          ) {
            shouldContinue = false
          }

          continue
        }

        const processResponse =
          await operatorFetch(
            `${API_BASE_URL}/ad-connections/naver/backfill/process`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  batchDays: 7,
                  advertiserId:
                    selectedAdvertiserId,
                }),
            }
          )

        if (!processResponse) {
          return
        }

        if (!processResponse.ok) {
          throw new Error(
            `Process HTTP ${processResponse.status}`
          )
        }

        const processResult =
          await processResponse.json()

        if (
          processResult.status !== 'ok'
        ) {
          throw new Error(
            processResult.message ||
            'Naver Historical Backfill 처리에 실패했습니다.'
          )
        }

        await loadNaverBackfillStatus()

        await loadRealDailyAdPerformance()

        await loadNaverBackfillStatus()

        if (
          processResult.jobStatus ===
          'completed'
        ) {
          shouldContinue = false
        }
      }

      await loadNaverBackfillStatus()
      await loadRealDailyAdPerformance()

    } catch (error) {
      console.error(
        'FAILED TO RUN NAVER BACKFILL',
        error
      )

      setNaverBackfillError(
        error.message ||
        '과거 데이터 수집 중 오류가 발생했습니다.'
      )
    } finally {
      naverBackfillRunnerRef.current = false
      setIsNaverBackfilling(false)
    }
  }

  async function handleNaverRangeSync() {


    if (!startDate || !endDate) {
      alert(
        '동기화할 시작일과 종료일을 선택해주세요.'
      )
      return
    }

    if (startDate > endDate) {
      alert(
        '시작일은 종료일보다 늦을 수 없습니다.'
      )
      return
    }

    if (isNaverSyncing) {
      return
    }

    setIsNaverSyncing(true)

    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/ad-connections/naver/sync-performance-range`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                since: startDate,
                until: endDate,
                advertiserId:
                  selectedAdvertiserId,
              }),
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const data = await response.json()

      if (data.status !== 'ok') {
        throw new Error(
          data.message ||
          'Naver 데이터 동기화에 실패했습니다.'
        )
      }

      await loadRealDailyAdPerformance()

      alert(
        [
          'Naver 데이터 동기화가 완료되었습니다.',
          `기간: ${startDate} ~ ${endDate}`,
          `성공: ${data.successfulDays ?? 0}일`,
          `실패: ${data.failedDays ?? 0}일`,
          `저장: ${data.totalSaved ?? 0}건`,
        ].join('\n')
      )
    } catch (error) {
      console.error(
        'Naver range sync failed:',
        error
      )

      alert(
        `Naver 데이터 동기화 실패: ${error.message ||
        '알 수 없는 오류'
        }`
      )
    } finally {
      setIsNaverSyncing(false)
    }
  }

  function applyPerformancePeriod(
    period,
    rows = performanceSourceRows
  ) {
    const validDates = rows
      .map((row) => row.date)
      .filter(Boolean)
      .sort()

    if (validDates.length === 0) {
      return
    }

    const latestDate =
      validDates[validDates.length - 1]

    if (period === 'all') {
      setStartDate(validDates[0])
      setEndDate(latestDate)
      return
    }

    const daysByPeriod = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    }

    const days = daysByPeriod[period]

    if (!days) {
      return
    }

    const latest = new Date(
      `${latestDate}T00:00:00`
    )

    const calculatedStart =
      new Date(latest)

    calculatedStart.setDate(
      calculatedStart.getDate() -
      (days - 1)
    )

    const calculatedStartString =
      [
        calculatedStart.getFullYear(),
        String(
          calculatedStart.getMonth() + 1
        ).padStart(2, '0'),
        String(
          calculatedStart.getDate()
        ).padStart(2, '0'),
      ].join('-')

    setStartDate(
      calculatedStartString
    )

    setEndDate(
      latestDate
    )
  }



  async function saveClientProposalToServer(
    proposalId,
    patch
  ) {
    if (!selectedAdvertiserId) {
      return null
    }

    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/client-proposals/${proposalId}?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify(
                patch
              ),
          }
        )

      if (!response) {
        return null
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()



      return result.proposal
    } catch (error) {
      console.error(
        'FAILED TO UPDATE CLIENT PROPOSAL ON SERVER',
        error
      )

      return null
    }
  }



  async function saveClientProposalEventToServer(
    proposalId,
    eventType,
    {
      status = null,
      message = null,
      actorType = 'operator',
      advertiserId = null,
      clientId = null,
    } = {}
  ) {
    const eventPayload = {
      id:
        `event_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      proposalId,

      eventType,

      status,

      message,

      createdAt:
        new Date().toISOString(),
    }

    try {
      let requestUrl =
        `${API_BASE_URL}/client-proposals/${proposalId}/events`

      let response = null

      // -----------------------------------------
      // Operator
      // -----------------------------------------
      if (actorType === 'operator') {
        if (!advertiserId) {
          throw new Error(
            'Operator event에는 advertiserId가 필요합니다.'
          )
        }

        requestUrl +=
          `?advertiserId=${encodeURIComponent(
            advertiserId
          )}`

        response =
          await operatorFetch(
            requestUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify(
                  eventPayload
                ),
            }
          )
      }

      // -----------------------------------------
      // Client
      // -----------------------------------------
      else if (actorType === 'client') {
        if (!clientId) {
          throw new Error(
            'Client event에는 clientId가 필요합니다.'
          )
        }

        requestUrl +=
          `?clientId=${encodeURIComponent(
            clientId
          )}`

        response =
          await clientFetch(
            requestUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify(
                  eventPayload
                ),
            }
          )
      }

      // -----------------------------------------
      // 잘못된 actorType
      // -----------------------------------------
      else {
        throw new Error(
          '잘못된 actorType입니다.'
        )
      }

      if (!response) {
        return false
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (result.status !== 'saved') {
        throw new Error(
          result.message ||
          'Proposal event 저장 실패'
        )
      }

      return true

    } catch (error) {
      console.error(
        'FAILED TO SAVE CLIENT PROPOSAL EVENT',
        error
      )

      return false
    }
  }

  async function startClientProposalRevision(
    proposalId
  ) {
    const updatedAt =
      new Date().toISOString()

    const updatedProposal =
      await saveClientProposalToServer(
        proposalId,
        {
          taskStatus: 'in_progress',
          updatedAt,
        }
      )

    if (!updatedProposal) {
      alert(
        '수정 작업 시작 중 오류가 발생했습니다.'
      )
      return
    }

    await saveClientProposalEventToServer(
      proposalId,
      'revision_started',
      {
        status: 'in_progress',
        message: '수정 작업을 시작했습니다.',
      }
    )

    setClientProposals((current) =>
      current.map((proposal) =>
        proposal.id === proposalId
          ? {
            ...proposal,
            ...updatedProposal,
          }
          : proposal
      )
    )
  }

  async function applyRevisionScenario(
    proposalId,
    scenario
  ) {
    if (!scenario) {
      return
    }

    const confirmed =
      window.confirm(
        `"${scenario.name || getOptimizationObjectiveLabel(
          scenario.objective
        )}" 시나리오를 수정안으로 적용하시겠습니까?`
      )

    if (!confirmed) {
      return
    }

    const updatedAt =
      new Date().toISOString()

    const updatedProposal =
      await saveClientProposalToServer(
        proposalId,
        {
          totalBudget:
            scenario.totalBudget,

          summary:
            scenario.summary,

          allocations:
            scenario.allocations,

          taskStatus:
            'reviewing',

          updatedAt,
        }
      )

    if (!updatedProposal) {
      alert(
        '수정안 적용 중 오류가 발생했습니다.'
      )
      return
    }

    await saveClientProposalEventToServer(
      proposalId,
      'revision_scenario_applied',
      {
        status: 'reviewing',
        message:
          `"${scenario.name || getOptimizationObjectiveLabel(
            scenario.objective
          )}" 시나리오를 수정안으로 적용했습니다.`,
      }
    )

    setClientProposals(
      (current) =>
        current.map(
          (proposal) =>
            proposal.id === proposalId
              ? {
                ...proposal,
                ...updatedProposal,
              }
              : proposal
        )
    )

    setRevisionScenarioId('')
  }

  async function applyManualRevision(
    proposalId
  ) {
    if (!manualRevisionProjection) {
      alert(
        '수정안 성과를 계산할 수 없습니다.'
      )
      return
    }

    const currentProposal =
      clientProposals.find(
        (proposal) =>
          proposal.id === proposalId
      )

    if (!currentProposal) {
      alert(
        '현재 제안 정보를 찾을 수 없습니다.'
      )
      return
    }

    const confirmed =
      window.confirm(
        '직접 수정한 예산과 예상 성과를 수정안으로 적용하시겠습니까?'
      )

    if (!confirmed) {
      return
    }

    const updatedAt =
      new Date().toISOString()

    const updatedProposal =
      await saveClientProposalToServer(
        proposalId,
        {
          previousRevision: {
            totalBudget:
              currentProposal?.totalBudget ??
              (currentProposal?.allocations || [])
                .reduce(
                  (sum, allocation) =>
                    sum +
                    Number(
                      allocation.optimizedBudget || 0
                    ),
                  0
                ),

            summary:
              currentProposal?.summary,

            allocations:
              currentProposal?.allocations,
          },

          totalBudget:
            manualRevisionProjection.totalBudget,

          allocations:
            manualRevisionProjection.allocations,

          summary:
            manualRevisionProjection.summary,

          taskStatus:
            'reviewing',

          updatedAt,
        }
      )

    if (!updatedProposal) {
      alert(
        '직접 수정안 적용 중 오류가 발생했습니다.'
      )
      return
    }

    await saveClientProposalEventToServer(
      proposalId,
      'manual_revision_applied',
      {
        status: 'reviewing',
        message:
          '매체별 예산을 직접 수정하고 예상 성과를 재계산하여 수정안으로 적용했습니다.',
      }
    )

    setClientProposals(
      (current) =>
        current.map(
          (proposal) =>
            proposal.id === proposalId
              ? {
                ...proposal,
                ...updatedProposal,
              }
              : proposal
        )
    )

    setManualRevisionBudgets({})
  }

  async function moveClientTaskToTrash(
    proposalId
  ) {
    const confirmed =
      window.confirm(
        '완료된 업무를 휴지통으로 이동하시겠습니까?'
      )

    if (!confirmed) {
      return
    }

    const updatedAt =
      new Date().toISOString()

    const updatedProposal =
      await saveClientProposalToServer(
        proposalId,
        {
          trashStatus: 'trashed',
          trashedAt: updatedAt,
          updatedAt,
        }
      )

    if (!updatedProposal) {
      alert(
        '휴지통 이동 중 오류가 발생했습니다.'
      )
      return
    }

    setClientProposals(
      (current) =>
        current.map(
          (proposal) =>
            proposal.id === proposalId
              ? {
                ...proposal,
                ...updatedProposal,
              }
              : proposal
        )
    )

    if (
      selectedTaskProposalId ===
      proposalId
    ) {
      setSelectedTaskProposalId(null)
    }
  }

  async function restoreClientTaskFromTrash(
    proposalId
  ) {
    const confirmed =
      window.confirm(
        '이 업무를 복원하시겠습니까?'
      )

    if (!confirmed) {
      return
    }

    const updatedAt =
      new Date().toISOString()

    const updatedProposal =
      await saveClientProposalToServer(
        proposalId,
        {
          trashStatus: 'active',
          trashedAt: '',
          updatedAt,
        }
      )

    if (!updatedProposal) {
      alert(
        '업무 복원 중 오류가 발생했습니다.'
      )
      return
    }

    setClientProposals(
      (current) =>
        current.map(
          (proposal) =>
            proposal.id === proposalId
              ? {
                ...proposal,
                ...updatedProposal,
              }
              : proposal
        )
    )
  }

  async function permanentlyDeleteClientTask(
    proposalId
  ) {
    const confirmed =
      window.confirm(
        '이 업무를 영구 삭제하시겠습니까?\n\n영구 삭제 후에는 복원할 수 없습니다.'
      )

    if (!confirmed) {
      return
    }

    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/client-proposals/${proposalId}`,
          {
            method: 'DELETE',
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        result.status !== 'deleted'
      ) {
        throw new Error(
          result.message ||
          '영구 삭제에 실패했습니다.'
        )
      }

      setClientProposals(
        (current) =>
          current.filter(
            (proposal) =>
              proposal.id !== proposalId
          )
      )

      if (
        selectedTaskProposalId ===
        proposalId
      ) {
        setSelectedTaskProposalId(null)
      }

      if (
        selectedHubProposalId ===
        proposalId
      ) {
        setSelectedHubProposalId(null)
      }
    } catch (error) {
      console.error(
        'FAILED TO PERMANENTLY DELETE CLIENT TASK',
        error
      )

      alert(
        '영구 삭제 중 오류가 발생했습니다.'
      )
    }
  }

  async function emptyClientTaskTrash() {
    if (trashedClientTasks.length === 0) {
      return
    }

    const confirmed =
      window.confirm(
        `휴지통의 ${trashedClientTasks.length}개 업무를 모두 영구 삭제하시겠습니까?\n\n삭제 후에는 복원할 수 없습니다.`
      )

    if (!confirmed) {
      return
    }

    try {
      const results =
        await Promise.all(
          trashedClientTasks.map(
            async (proposal) => {
              const response =
                await operatorFetch(
                  `${API_BASE_URL}/client-proposals/${proposal.id}`,
                  {
                    method: 'DELETE',
                  }
                )

              if (!response) {
                return null
              }

              if (!response.ok) {
                throw new Error(
                  `HTTP ${response.status}`
                )
              }

              const result =
                await response.json()

              if (
                result.status !== 'deleted'
              ) {
                throw new Error(
                  result.message ||
                  '영구 삭제에 실패했습니다.'
                )
              }

              return proposal.id
            }
          )
        )

      const deletedIds =
        new Set(
          results.filter(Boolean)
        )

      setClientProposals(
        (current) =>
          current.filter(
            (proposal) =>
              !deletedIds.has(
                proposal.id
              )
          )
      )

      setSelectedTaskProposalId(
        (current) =>
          current &&
            deletedIds.has(current)
            ? null
            : current
      )

      setTaskTrashOpen(false)
    } catch (error) {
      console.error(
        'FAILED TO EMPTY CLIENT TASK TRASH',
        error
      )

      alert(
        '휴지통 비우기 중 오류가 발생했습니다.'
      )
    }
  }



  async function loadClientProposalMessages(
    proposalId,
    advertiserId
  ) {
    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/client-proposals/${proposalId}/messages?advertiserId=${encodeURIComponent(
            advertiserId
          )}`
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        !Array.isArray(
          result.messages
        )
      ) {
        return
      }

      let nextMessages =
        result.messages

      /*
       * 현재 운영자가 보고 있는 대화에
       * Client의 안 읽은 메시지가 있는지 확인
       */
      const hasUnreadClientMessage =
        result.messages.some(
          (message) =>
            message.senderType === 'client' &&
            !message.isRead
        )

      /*
       * 안 읽은 Client 메시지가 있으면
       * 서버에서도 즉시 읽음 처리
       */
      if (hasUnreadClientMessage) {
        const readResponse =
          await operatorFetch(
            `${API_BASE_URL}/client-proposals/${proposalId}/messages/read?advertiserId=${encodeURIComponent(
              advertiserId
            )}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  readerType: 'internal',
                }),
            }
          )

        if (!readResponse) {
          return
        }

        if (!readResponse.ok) {
          console.error(
            'FAILED TO MARK INTERNAL MESSAGES AS READ',
            readResponse.status
          )
        } else {
          /*
           * 서버 읽음 처리 성공 시
           * 화면에서도 즉시 읽음 상태로 변경
           */
          nextMessages =
            result.messages.map(
              (message) =>
                message.senderType ===
                  'client'
                  ? {
                    ...message,
                    isRead: true,
                  }
                  : message
            )

          /*
           * 상단 광고주 소통 unread 숫자도
           * 서버 기준으로 다시 계산
           */
          await loadInternalUnreadCount()
        }
      }

      setClientProposals(
        (previous) =>
          previous.map(
            (proposal) =>
              proposal.id === proposalId
                ? {
                  ...proposal,
                  messages:
                    nextMessages,
                }
                : proposal
          )
      )
    } catch (error) {
      console.error(
        'FAILED TO LOAD CLIENT MESSAGES',
        error
      )
    }
  }

  async function loadSharedClientProposal(
    shareToken
  ) {
    setSharedProposalLoading(true)
    setSharedProposalError('')

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/shared/client-proposals/${encodeURIComponent(
            shareToken
          )}`
        )

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        result.status !== 'ok' ||
        !result.proposal
      ) {
        throw new Error(
          result.message ||
          '공유된 제안을 불러올 수 없습니다.'
        )
      }

      setSharedProposal(
        result.proposal
      )

      const viewResponse =
        await fetch(
          `${API_BASE_URL}/shared/client-proposals/${encodeURIComponent(
            shareToken
          )}/view`,
          {
            method: 'POST',
          }
        )

      if (!viewResponse.ok) {
        throw new Error(
          `VIEW HTTP ${viewResponse.status}`
        )
      }

      const viewResult =
        await viewResponse.json()


    } catch (error) {
      console.error(
        'FAILED TO LOAD SHARED PROPOSAL',
        error
      )

      setSharedProposalError(
        '공유된 제안을 불러오지 못했습니다.'
      )
    } finally {
      setSharedProposalLoading(false)
    }
  }


  async function submitSharedProposalAction(
    action
  ) {
    if (
      !sharedProposalToken ||
      sharedProposalSubmitting
    ) {
      return
    }

    if (
      action === 'revision_requested' &&
      !sharedRevisionReason.trim()
    ) {
      window.alert(
        '수정 요청 사유를 입력해주세요.'
      )

      return
    }

    const confirmed =
      window.confirm(
        action === 'approved'
          ? '이 제안을 승인하시겠습니까?'
          : '수정 요청을 전달하시겠습니까?'
      )

    if (!confirmed) {
      return
    }

    setSharedProposalSubmitting(true)

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/shared/client-proposals/${encodeURIComponent(
            sharedProposalToken
          )}/action`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                action,

                message:
                  action ===
                    'revision_requested'
                    ? sharedRevisionReason.trim()
                    : null,
              }),
          }
        )

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (result.status !== 'ok') {
        throw new Error(
          result.message ||
          '광고주 응답 처리에 실패했습니다.'
        )
      }

      setSharedProposal(
        (previous) => ({
          ...previous,

          status:
            result.proposalStatus,
        })
      )

      if (
        action ===
        'revision_requested'
      ) {
        setSharedRevisionReason('')
      }
    } catch (error) {
      console.error(
        'FAILED TO SUBMIT SHARED PROPOSAL ACTION',
        error
      )

      window.alert(
        '요청 처리 중 오류가 발생했습니다.'
      )
    } finally {
      setSharedProposalSubmitting(false)
    }
  }

  async function loadClientProposalEvents(
    proposalId,
    {
      actorType = 'operator',
      advertiserId = null,
      clientId = null,
    } = {}
  ) {
    try {
      let requestUrl =
        `${API_BASE_URL}/client-proposals/${proposalId}/events`

      let response = null

      // -----------------------------------------
      // Operator
      // -----------------------------------------
      if (actorType === 'operator') {
        const resolvedAdvertiserId =
          advertiserId ||
          selectedAdvertiserId

        if (!resolvedAdvertiserId) {
          throw new Error(
            'Operator event 조회에는 advertiserId가 필요합니다.'
          )
        }

        requestUrl +=
          `?advertiserId=${encodeURIComponent(
            resolvedAdvertiserId
          )}`

        response =
          await operatorFetch(
            requestUrl
          )
      }

      // -----------------------------------------
      // Client
      // -----------------------------------------
      else if (actorType === 'client') {
        if (!clientId) {
          throw new Error(
            'Client event 조회에는 clientId가 필요합니다.'
          )
        }

        requestUrl +=
          `?clientId=${encodeURIComponent(
            clientId
          )}`

        response =
          await clientFetch(
            requestUrl
          )
      }

      // -----------------------------------------
      // 잘못된 actorType
      // -----------------------------------------
      else {
        throw new Error(
          '잘못된 actorType입니다.'
        )
      }

      if (!response) {
        return []
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        result.status !== 'ok' ||
        !Array.isArray(
          result.events
        )
      ) {
        throw new Error(
          result.message ||
          '이벤트 정보를 불러오지 못했습니다.'
        )
      }

      setClientProposals(
        (previous) =>
          previous.map(
            (proposal) =>
              proposal.id === proposalId
                ? {
                  ...proposal,

                  history:
                    result.events.map(
                      (eventItem) => ({
                        id:
                          eventItem.id,

                        type:
                          eventItem.eventType,

                        status:
                          eventItem.status,

                        message:
                          eventItem.message,

                        createdAt:
                          eventItem.createdAt,
                      })
                    ),
                }
                : proposal
          )
      )

      return result.events

    } catch (error) {
      console.error(
        'FAILED TO LOAD CLIENT EVENTS',
        error
      )

      return []
    }
  }

  async function sendClientHubMessage() {


    const message =
      clientHubMessage.trim()


    if (
      !selectedHubProposal ||
      !message
    ) {
      return
    }

    const newMessage = {
      id:
        `message_${Date.now()}`,

      proposalId:
        selectedHubProposal.id,

      senderType:
        'internal',

      senderName:
        '운영 담당자',

      message,

      createdAt:
        new Date().toISOString(),
    }



    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/client-proposals/${selectedHubProposalId}/messages?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                newMessage
              ),
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()



      setClientProposals(
        (previous) =>
          previous.map(
            (proposal) =>
              proposal.id ===
                selectedHubProposal.id
                ? {
                  ...proposal,

                  messages: [
                    ...(proposal.messages ||
                      []),
                    newMessage,
                  ],

                  updatedAt:
                    new Date().toISOString(),
                }
                : proposal
          )
      )

      setClientHubMessage('')
    } catch (error) {
      console.error(
        'FAILED TO SAVE CLIENT MESSAGE',
        error
      )
    }
  }

  async function sendAutomaticClientHubMessage(
    proposalId,
    message,
    actionUrl = null,
    actionLabel = null
  ) {
    if (
      !proposalId ||
      !message
    ) {
      return null
    }

    const newMessage = {
      id:
        `message_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      proposalId,

      senderType:
        'internal',

      senderName:
        '운영 담당자',

      message,

      actionUrl,

      actionLabel,

      createdAt:
        new Date().toISOString(),
    }

    try {
      if (!selectedAdvertiserId) {
        return null
      }

      const response =
        await operatorFetch(
          `${API_BASE_URL}/client-proposals/${proposalId}/messages?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                newMessage
              ),
          }
        )

      if (!response) {
        return null
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()



      setClientProposals(
        (previous) =>
          previous.map(
            (proposal) =>
              proposal.id === proposalId
                ? {
                  ...proposal,

                  messages: [
                    ...(proposal.messages || []),
                    newMessage,
                  ],

                  updatedAt:
                    new Date().toISOString(),
                }
                : proposal
          )
      )

      return newMessage
    } catch (error) {
      console.error(
        'FAILED TO SAVE AUTOMATIC CLIENT MESSAGE',
        error
      )

      return null
    }
  }

  function updateClientProposalTaskLocal(
    proposalId,
    field,
    value
  ) {
    setClientProposals(
      (previous) =>
        previous.map(
          (proposal) =>
            proposal.id === proposalId
              ? {
                ...proposal,
                [field]: value,
              }
              : proposal
        )
    )
  }


  async function createClientProposal(
    scenario
  ) {



    if (!scenario?.isFinal) {
      return
    }

    const existingProposal =
      clientProposals.find(
        (proposal) =>
          proposal.scenarioId ===
          scenario.id &&
          proposal.status !==
          'cancelled'
      )

    if (existingProposal) {
      return
    }

    const proposal = {
      id:
        `proposal_${Date.now()}`,

      advertiserId:
        selectedAdvertiserId,

      clientId:
        'client_demo_001',

      scenarioId:
        scenario.id,

      scenarioName:
        scenario.name,

      createdAt:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString(),

      status:
        'preparing',

      messages: [],

      shareToken:
        null,

      shareUrl:
        null,

      shareStatus:
        'not_shared',

      sharedAt:
        null,

      firstViewedAt:
        null,

      lastViewedAt:
        null,

      viewCount:
        0,

      clientResponse:
        null,

      clientComment:
        '',

      internalNote:
        '',

      revisionReason:
        '',

      assignee:
        '',

      dueDate:
        '',

      taskStatus:
        'waiting',

      priority:
        'normal',

      history: [
        {
          status: 'preparing',
          createdAt:
            new Date().toISOString(),
        },
      ],

      totalBudget:
        scenario.totalBudget,

      summary: {
        projectedRevenue:
          scenario.summary
            .projectedRevenue,

        projectedRoas:
          scenario.summary
            .projectedRoas,

        projectedCpa:
          scenario.summary
            .projectedCpa,
      },

      allocations:
        scenario.allocations,
    }



    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/client-proposals`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                proposal
              ),
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()



      setClientProposals(
        (previous) => [
          proposal,
          ...previous,
        ]
      )

      const shareResult =
        await createClientProposalShareLink(
          proposal.id
        )

      if (
        shareResult?.shareUrl
      ) {
        const sharedAt =
          shareResult.sharedAt ||
          new Date().toISOString()

        const sharedProposal =
          await saveClientProposalToServer(
            proposal.id,
            {
              status: 'reviewing',
              shareStatus: 'shared',
              shareToken:
                shareResult.shareToken,
              shareUrl:
                shareResult.shareUrl,
              sharedAt,
              updatedAt:
                sharedAt,
            }
          )

        if (sharedProposal) {
          setClientProposals(
            (previous) =>
              previous.map(
                (item) =>
                  item.id === proposal.id
                    ? {
                      ...item,
                      ...sharedProposal,
                    }
                    : item
              )
          )
        }

        await sendAutomaticClientHubMessage(
          proposal.id,
          '새로운 광고 예산 최적화 제안이 공유되었습니다. 아래 버튼에서 제안을 확인해주세요.',
          shareResult.shareUrl,
          '제안 확인하기'
        )
      }
    } catch (error) {
      console.error(
        'FAILED TO SAVE CLIENT PROPOSAL TO SERVER',
        error
      )
    }
  }

  async function cancelClientProposal(
    proposalId
  ) {
    const updatedAt =
      new Date().toISOString()

    const updatedProposal =
      await saveClientProposalToServer(
        proposalId,
        {
          status: 'cancelled',
          taskStatus: 'done',
          shareStatus: 'cancelled',
          updatedAt,
        }
      )

    if (!updatedProposal) {
      alert(
        '제안 취소 중 오류가 발생했습니다.'
      )
      return
    }

    await saveClientProposalEventToServer(
      proposalId,
      'proposal_cancelled',
      {
        status: 'cancelled',
        message:
          '광고주 제안이 취소되었습니다.',
      }
    )

    setClientProposals(
      (current) =>
        current.map(
          (proposal) =>
            proposal.id === proposalId
              ? {
                ...proposal,
                ...updatedProposal,
              }
              : proposal
        )
    )
  }







  function requestClientRevision(
    proposalId
  ) {
    const changedAt =
      new Date().toISOString()

    setClientProposals(
      (previous) =>
        previous.map(
          (proposal) => {
            if (
              proposal.id !== proposalId
            ) {
              return proposal
            }

            const updatedProposal = {
              ...proposal,

              status:
                'revision_requested',

              taskStatus:
                'waiting',

              updatedAt:
                changedAt,

              history: [
                ...(proposal.history || []),

                {
                  type:
                    'status',

                  status:
                    'revision_requested',

                  createdAt:
                    changedAt,
                },
              ],
            }

            saveClientProposalToServer(
              proposalId,
              {
                status:
                  'revision_requested',

                taskStatus:
                  'waiting',

                revisionReason:
                  updatedProposal.revisionReason,

                updatedAt:
                  changedAt,
              }
            )

            saveClientProposalEventToServer(
              proposalId,
              'revision_requested',
              {
                status:
                  'revision_requested',

                message:
                  '광고주가 수정 요청을 등록했습니다.',
              }
            )

            return updatedProposal
          }
        )
    )
  }
  async function persistClientProposalEvent(
    proposalId,
    eventType,
    payload = {}
  ) {
    // 현재 단계: 로컬 프로토타입
    // 추후 단계: 이 부분을 실제 백엔드 API 호출로 교체

    const occurredAt =
      new Date().toISOString()

    setClientProposals(
      (previous) =>
        previous.map(
          (proposal) => {
            if (
              proposal.id !== proposalId
            ) {
              return proposal
            }

            return {
              ...proposal,

              ...payload,

              updatedAt:
                occurredAt,

              history: [
                ...(proposal.history || []),

                {
                  type:
                    eventType,

                  createdAt:
                    occurredAt,

                  ...payload.historyData,
                },
              ],
            }
          }
        )
    )

    return occurredAt
  }

  async function createClientProposalShareLink(
    proposalId
  ) {
    try {
      const response =
        await operatorFetch(
          `${API_BASE_URL}/client-proposals/${proposalId}/share`,
          {
            method: 'POST',
          }
        )

      if (!response) {
        return null
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        !result.shareUrl ||
        !result.shareToken
      ) {
        throw new Error(
          '공유 링크 생성 응답이 올바르지 않습니다.'
        )
      }

      setClientProposals(
        (previous) =>
          previous.map(
            (proposal) =>
              proposal.id === proposalId
                ? {
                  ...proposal,

                  shareToken:
                    result.shareToken,

                  shareUrl:
                    result.shareUrl,

                  shareStatus:
                    'shared',

                  sharedAt:
                    result.sharedAt ||
                    proposal.sharedAt,

                  updatedAt:
                    result.sharedAt ||
                    new Date().toISOString(),
                }
                : proposal
          )
      )



      return result
    } catch (error) {
      console.error(
        'FAILED TO CREATE CLIENT SHARE LINK',
        error
      )

      return null
    }
  }

  async function reshareClientProposal(
    proposalId
  ) {
    const shareResult =
      await createClientProposalShareLink(
        proposalId
      )

    if (!shareResult) {
      alert(
        '광고주 재공유 링크 생성에 실패했습니다.'
      )
      return
    }

    const updatedAt =
      new Date().toISOString()

    const updatedProposal =
      await saveClientProposalToServer(
        proposalId,
        {
          status: 'reviewing',
          taskStatus: 'done',
          shareStatus: 'shared',
          updatedAt,
        }
      )

    if (!updatedProposal) {
      alert(
        '재공유 상태 저장에 실패했습니다.'
      )
      return
    }

    await saveClientProposalEventToServer(
      proposalId,
      'revision_reshared',
      {
        status: 'reviewing',
        message:
          '수정안을 광고주에게 재공유했습니다.',
      }
    )

    setClientProposals(
      (current) =>
        current.map(
          (proposal) =>
            proposal.id === proposalId
              ? {
                ...proposal,
                ...updatedProposal,
                shareToken:
                  shareResult.shareToken,
                shareUrl:
                  shareResult.shareUrl,
                shareStatus: 'shared',
              }
              : proposal
        )
    )
    if (shareResult.shareUrl) {
      await sendAutomaticClientHubMessage(
        proposalId,
        '수정된 광고 예산 최적화 제안이 다시 공유되었습니다. 광고주 요청사항을 반영하여 예산 배분 및 예상 성과를 업데이트했습니다.',
        shareResult.shareUrl,
        '수정된 제안 확인하기'
      )
    }
  }

  async function shareClientProposal(
    proposalId
  ) {
    const confirmed =
      window.confirm(
        '이 제안을 광고주에게 공유하시겠습니까?'
      )

    if (!confirmed) {
      return
    }

    const result =
      await createClientProposalShareLink(
        proposalId
      )

    if (!result) {
      return
    }

    await saveClientProposalEventToServer(
      proposalId,
      'shared',
      {
        status:
          'sent',


        message:
          '광고주에게 제안이 공유되었습니다.',

        actorType:
          'operator',

        advertiserId:
          selectedAdvertiserId,
      }
    )
  }

  function approveClientProposal(
    proposalId
  ) {
    const changedAt =
      new Date().toISOString()

    setClientProposals(
      (previous) =>
        previous.map(
          (proposal) => {
            if (
              proposal.id !== proposalId
            ) {
              return proposal
            }

            const updatedProposal = {
              ...proposal,

              status:
                'approved',

              updatedAt:
                changedAt,

              history: [
                ...(proposal.history || []),

                {
                  type:
                    'status',

                  status:
                    'approved',

                  createdAt:
                    changedAt,
                },
              ],
            }

            saveClientProposalToServer(
              proposalId,
              {
                status:
                  'approved',

                updatedAt:
                  changedAt,
              }
            )

            saveClientProposalEventToServer(
              proposalId,
              'approved',
              {
                status:
                  'approved',

                message:
                  '광고주가 제안을 승인했습니다.',

                actorType:
                  'client',

                clientId:
                  clientId,
              }
            )

            return updatedProposal
          }
        )
    )
  }

  function getRecommendedNextAction(
    proposal
  ) {
    const proposalStatus =
      proposal.status

    const taskStatus =
      proposal.taskStatus || 'waiting'

    if (
      proposalStatus ===
      'revision_requested' &&
      taskStatus === 'waiting'
    ) {
      return '수정 작업 시작 필요'
    }

    if (
      proposalStatus ===
      'revision_requested' &&
      taskStatus === 'in_progress'
    ) {
      return '수정안 작성 진행 중'
    }

    if (
      proposalStatus ===
      'revision_requested' &&
      taskStatus === 'reviewing'
    ) {
      return '수정안 내부 검토 필요'
    }

    if (
      proposalStatus === 'sent'
    ) {
      return '광고주 검토 요청'
    }

    if (
      proposalStatus === 'reviewing'
    ) {
      return '광고주 피드백 대기'
    }

    if (
      proposalStatus === 'approved' &&
      taskStatus !== 'done'
    ) {
      return '승인 완료 · 집행 준비 필요'
    }

    if (
      proposalStatus === 'approved' &&
      taskStatus === 'done'
    ) {
      return '집행 준비 가능'
    }

    if (
      proposalStatus ===
      'review_completed' &&
      taskStatus === 'done'
    ) {
      return '업무 완료'
    }

    if (
      proposalStatus ===
      'preparing'
    ) {
      return '제안 내용 정리 필요'
    }

    return '상태 확인 필요'
  }

  function getClientProposalAttention(
    proposal
  ) {
    const now =
      new Date()

    const sharedAt =
      proposal.sharedAt
        ? new Date(
          proposal.sharedAt
        )
        : null

    const firstViewedAt =
      proposal.firstViewedAt
        ? new Date(
          proposal.firstViewedAt
        )
        : null

    const updatedAt =
      proposal.updatedAt
        ? new Date(
          proposal.updatedAt
        )
        : null

    const dayMs =
      1000 * 60 * 60 * 24

    const daysSinceShared =
      sharedAt
        ? Math.floor(
          (
            now.getTime() -
            sharedAt.getTime()
          ) / dayMs
        )
        : null

    const daysSinceViewed =
      firstViewedAt
        ? Math.floor(
          (
            now.getTime() -
            firstViewedAt.getTime()
          ) / dayMs
        )
        : null

    const daysSinceUpdate =
      updatedAt
        ? Math.floor(
          (
            now.getTime() -
            updatedAt.getTime()
          ) / dayMs
        )
        : null

    if (
      proposal.shareStatus ===
      'shared' &&
      !proposal.firstViewedAt &&
      daysSinceShared !== null &&
      daysSinceShared >= 3
    ) {
      return {
        level: 'warning',
        label: '미열람',
        message:
          '공유 후 3일 이상 열람되지 않았습니다. 광고주에게 리마인드가 필요합니다.',
      }
    }

    if (
      proposal.status ===
      'reviewing' &&
      daysSinceViewed !== null &&
      daysSinceViewed >= 5
    ) {
      return {
        level: 'warning',
        label: '검토 지연',
        message:
          '광고주 검토가 5일 이상 진행 중입니다. 후속 연락을 권장합니다.',
      }
    }

    if (
      proposal.status ===
      'revision_requested'
    ) {
      return {
        level: 'urgent',
        label: '수정 요청',
        message:
          proposal.taskStatus ===
            'waiting'
            ? '광고주 수정 요청이 접수되었습니다. 수정 작업을 시작해야 합니다.'
            : '광고주 수정 요청 건이 진행 중입니다.',
      }
    }

    if (
      proposal.status ===
      'approved' &&
      proposal.taskStatus !==
      'done'
    ) {
      return {
        level: 'success',
        label: '승인 완료',
        message:
          '광고주 승인이 완료되었습니다. 집행 준비 업무를 진행하세요.',
      }
    }

    if (
      proposal.status ===
      'review_completed' &&
      proposal.taskStatus ===
      'done'
    ) {
      return {
        level: 'complete',
        label: '완료',
        message:
          '광고주 검토와 내부 후속 업무가 모두 완료되었습니다.',
      }
    }

    if (
      daysSinceUpdate !== null &&
      daysSinceUpdate >= 7 &&
      proposal.taskStatus !==
      'done'
    ) {
      return {
        level: 'warning',
        label: '장기 미처리',
        message:
          '최근 7일간 업데이트가 없습니다. 업무 상태를 확인해주세요.',
      }
    }

    return null
  }

  function getClientProposalProgress(
    proposal
  ) {
    return {
      sent:
        proposal.status !== 'preparing',

      shared:
        proposal.shareStatus === 'shared',

      viewed:
        Boolean(
          proposal.firstViewedAt
        ),

      reviewing:
        [
          'reviewing',
          'revision_requested',
          'approved',
          'review_completed',
        ].includes(
          proposal.status
        ),

      approved:
        [
          'approved',
          'review_completed',
        ].includes(
          proposal.status
        ),
    }
  }



  function updateClientProposalStatus(
    proposalId,
    nextStatus
  ) {
    setClientProposals(
      (previous) =>
        previous.map(
          (proposal) => {
            if (
              proposal.id !== proposalId
            ) {
              return proposal
            }

            const allowedStatuses =
              getAllowedClientProposalStatuses(
                proposal.status
              )

            if (
              !allowedStatuses.includes(
                nextStatus
              )
            ) {
              return proposal
            }

            const changedAt =
              new Date().toISOString()

            const updatedProposal = {
              ...proposal,

              status:
                nextStatus,

              updatedAt:
                changedAt,

              history: [
                ...(proposal.history || []),

                {
                  status:
                    nextStatus,

                  createdAt:
                    changedAt,
                },
              ],
            }

            saveClientProposalToServer(
              proposal.id,
              {
                status:
                  nextStatus,

                updatedAt:
                  changedAt,
              }
            )

            return updatedProposal
          }
        )
    )
  }

  function getAllowedClientProposalStatuses(
    currentStatus
  ) {
    switch (currentStatus) {
      case 'preparing':
        return [
          'preparing',
          'sent',
        ]

      case 'sent':
        return [
          'sent',
          'reviewing',
        ]

      case 'reviewing':
        return [
          'reviewing',
          'revision_requested',
          'approved',
        ]

      case 'revision_requested':
        return [
          'revision_requested',
          'preparing',
        ]

      case 'approved':
        return [
          'approved',
          'review_completed',
        ]

      case 'review_completed':
        return [
          'review_completed',
        ]

      default:
        return [
          'preparing',
        ]
    }
  }

  function getClientProposalStatusLabel(
    status
  ) {
    switch (status) {
      case 'preparing':
        return '제안 준비'

      case 'sent':
        return '제안 완료'

      case 'reviewing':
        return '광고주 검토 중'

      case 'revision_requested':
        return '수정 요청'

      case 'approved':
        return '승인'

      case 'review_completed':
        return '검토 완료'

      default:
        return '제안 준비'
    }
  }



  const [startDate, setStartDate] =
    useState(() => {
      const dates = mockAds
        .map((row) => row.date)
        .filter(Boolean)
        .sort()

      return dates[0] || ''
    })

  const [endDate, setEndDate] =
    useState(() => {
      const dates = mockAds
        .map((row) => row.date)
        .filter(Boolean)
        .sort()

      return dates[dates.length - 1] || ''
    })

  const dashboardCanvasSize = useMemo(() => {
    const padding = 96
    const gap = 28

    const sizeMap = {
      small: {
        width: 460,
        height: 360,
      },

      medium: {
        width: 560,
        height: 440,
      },

      large: {
        width: 680,
        height: 520,
      },
    }

    const {
      width: cardWidth,
      height: cardHeight,
    } =
      sizeMap[dashboardCardSize] ||
      sizeMap.medium

    const columns =
      Number(dashboardColumns) || 2

    if (savedCharts.length === 0) {
      return {
        width:
          columns * cardWidth +
          (columns - 1) * gap +
          padding,

        height: 800,
      }
    }

    const maxRight = Math.max(
      ...savedCharts.map((chart) =>
        (chart.x ?? 0) +
        (chart.width || cardWidth)
      )
    )

    const maxBottom = Math.max(
      ...savedCharts.map((chart) =>
        (chart.y ?? 0) +
        (chart.height || cardHeight)
      )
    )

    const arrangedWidth =
      columns * cardWidth +
      (columns - 1) * gap +
      padding

    return {
      width: Math.max(
        arrangedWidth,
        maxRight + padding
      ),

      height: Math.max(
        800,
        maxBottom + padding
      ),
    }
  }, [
    savedCharts,
    dashboardCardSize,
    dashboardColumns,
  ])

  const performanceSourceRows =
    performanceDataSource === 'naver'
      ? normalizedRealAds
      : mockAds

  const globalChannelOptions = [
    ...new Set(
      performanceSourceRows
        .filter((row) =>
          globalBrand === '전체'
            ? true
            : row.brand === globalBrand
        )
        .map((row) => row.channel)
    ),
  ]

  const globalCampaignOptions = [
    ...new Set(
      performanceSourceRows
        .filter((row) => {
          const brandMatch =
            globalBrand === '전체' ||
            row.brand === globalBrand

          const channelMatch =
            globalChannel === '전체' ||
            row.channel === globalChannel

          return brandMatch && channelMatch
        })
        .map((row) => row.campaign)
    ),
  ]


  const globalProductOptions = [
    ...new Set(
      performanceSourceRows
        .filter((row) => {
          const brandMatch =
            globalBrand === '전체' ||
            row.brand === globalBrand

          const channelMatch =
            globalChannel === '전체' ||
            row.channel === globalChannel

          const campaignMatch =
            globalCampaign === '전체' ||
            row.campaign === globalCampaign

          return (
            brandMatch &&
            channelMatch &&
            campaignMatch
          )
        })
        .map((row) => row.product)
    ),
  ]

  const primaryMetric =
    yFields.length > 0
      ? yFields[0]
      : null

  useEffect(() => {
    if (!primaryMetric) {
      return
    }

    const currencyMetrics = [
      'spend',
      'revenue',
      'cpc',
      'cpa',
    ]

    const percentMetrics = [
      'ctr',
      'cvr',
    ]

    if (
      numberFormat === 'percent' &&
      !percentMetrics.includes(primaryMetric)
    ) {
      setNumberFormat('auto')
    }

    if (
      numberFormat === 'currency' &&
      !currencyMetrics.includes(primaryMetric)
    ) {
      setNumberFormat('auto')
    }
  }, [
    primaryMetric,
    numberFormat,
  ])



  useEffect(() => {
    const savedDashboard =
      localStorage.getItem('adScopeDashboard')

    if (savedDashboard) {
      try {
        const parsedDashboard =
          JSON.parse(savedDashboard)

        setSavedCharts(parsedDashboard)
      } catch (error) {
        console.error(
          '저장된 대시보드를 불러오지 못했습니다.',
          error
        )
      }
    }

    const savedSettings =
      localStorage.getItem(
        'adScopeDashboardSettings'
      )

    if (savedSettings) {
      try {
        const parsedSettings =
          JSON.parse(savedSettings)

        setGlobalBrand(
          parsedSettings.globalBrand || '전체'
        )

        setGlobalChannel(
          parsedSettings.globalChannel || '전체'
        )

        setGlobalCampaign(
          parsedSettings.globalCampaign || '전체'
        )

        setGlobalProduct(
          parsedSettings.globalProduct || '전체'
        )

        setDashboardCardSize(
          parsedSettings.dashboardCardSize ||
          'medium'
        )

        setDashboardColumns(
          parsedSettings.dashboardColumns || '2'
        )
      } catch (error) {
        console.error(
          '저장된 대시보드 설정을 불러오지 못했습니다.',
          error
        )
      }
    }



    setDashboardLoaded(true)
  }, [])

  useEffect(() => {
    if (!dragInfo) {
      return
    }

    function handleMouseMove(e) {
      const deltaX =
        e.clientX - dragInfo.startMouseX

      const deltaY =
        e.clientY - dragInfo.startMouseY

      const gridSize = 24

      const newX = Math.max(
        0,
        Math.round(
          (dragInfo.startChartX + deltaX) /
          gridSize
        ) * gridSize
      )

      const newY = Math.max(
        0,
        Math.round(
          (dragInfo.startChartY + deltaY) /
          gridSize
        ) * gridSize
      )

      setSavedCharts((current) => {
        const movingChart = current.find(
          (chart) =>
            chart.id === dragInfo.chartId
        )

        if (!movingChart) {
          return current
        }

        const movingWidth =
          movingChart.width || 480

        const movingHeight =
          movingChart.height || 420

        function overlapsAt(x, y) {
          return current.some((chart) => {
            if (
              chart.id ===
              dragInfo.chartId
            ) {
              return false
            }

            const otherX =
              chart.x ?? 0

            const otherY =
              chart.y ?? 0

            const otherWidth =
              chart.width || 480

            const otherHeight =
              chart.height || 420

            return (
              x < otherX + otherWidth &&
              x + movingWidth > otherX &&
              y < otherY + otherHeight &&
              y + movingHeight > otherY
            )
          })
        }

        let finalX = newX
        let finalY = newY

        if (overlapsAt(finalX, finalY)) {
          const gridSize = 24
          const searchRadius = 20

          let foundPosition = false

          for (
            let radius = 1;
            radius <= searchRadius;
            radius++
          ) {
            const candidates = [
              [newX + radius * gridSize, newY],
              [newX - radius * gridSize, newY],
              [newX, newY + radius * gridSize],
              [newX, newY - radius * gridSize],
            ]

            for (const [candidateX, candidateY] of candidates) {
              const safeX =
                Math.max(0, candidateX)

              const safeY =
                Math.max(0, candidateY)

              if (
                !overlapsAt(
                  safeX,
                  safeY
                )
              ) {
                finalX = safeX
                finalY = safeY
                foundPosition = true
                break
              }
            }

            if (foundPosition) {
              break
            }
          }

          if (!foundPosition) {
            return current
          }
        }

        return current.map((chart) =>
          chart.id === dragInfo.chartId
            ? {
              ...chart,
              x: finalX,
              y: finalY,
            }
            : chart
        )
      })
    }

    function handleMouseUp() {
      setSavedCharts((current) =>
        normalizeDashboardLayout(current)
      )

      setDragInfo(null)
    }

    window.addEventListener(
      'mousemove',
      handleMouseMove
    )

    window.addEventListener(
      'mouseup',
      handleMouseUp
    )

    return () => {
      window.removeEventListener(
        'mousemove',
        handleMouseMove
      )

      window.removeEventListener(
        'mouseup',
        handleMouseUp
      )
    }
  }, [dragInfo])

  useEffect(() => {
    if (!dashboardLoaded) {
      return
    }

    const dashboardSettings = {
      globalBrand,
      globalChannel,
      globalCampaign,
      globalProduct,

      startDate,
      endDate,


      dashboardCardSize,
      dashboardColumns,
    }

    localStorage.setItem(
      'adScopeDashboardSettings',
      JSON.stringify(dashboardSettings)
    )
  }, [
    globalChannel,
    globalCampaign,
    globalProduct,

    startDate,
    endDate,

    dashboardCardSize,
    dashboardColumns,
    dashboardLoaded,
  ])

  useEffect(() => {
    setOptimizationApiResult(null)
    setOptimizationApiError('')
    setRiskScenarioComparison(null)
  }, [
    optimizationBudget,
    optimizationObjective,
    budgetChangeLimit,
    targetRoas,
    targetCpa,
    riskLevel,
  ])

  useEffect(() => {
    if (
      optimizationObjective !==
      'riskAdjustedRevenue'
    ) {
      setRiskScenarioComparison(null)
    }
  }, [optimizationObjective])

  useEffect(() => {
    if (!dashboardLoaded) {
      return
    }

    localStorage.setItem(
      'adScopeDashboard',
      JSON.stringify(savedCharts)
    )
  }, [
    savedCharts,
    dashboardLoaded,
  ])



  const filteredData = useMemo(() => {
    let data = performanceSourceRows

    if (globalBrand !== '전체') {
      data = data.filter(
        (row) =>
          row.brand === globalBrand
      )
    }

    if (startDate) {
      data = data.filter(
        (row) =>
          row.date >= startDate
      )
    }

    if (endDate) {
      data = data.filter(
        (row) =>
          row.date <= endDate
      )
    }

    if (globalChannel !== '전체') {
      data = data.filter(
        (row) =>
          row.channel === globalChannel
      )
    }

    if (globalCampaign !== '전체') {
      data = data.filter(
        (row) =>
          row.campaign === globalCampaign
      )
    }

    if (globalProduct !== '전체') {
      data = data.filter(
        (row) =>
          row.product === globalProduct
      )
    }

    if (selectedChannel !== '전체') {
      data = data.filter(
        (row) =>
          row.channel === selectedChannel
      )
    }

    if (
      filterField &&
      filterValue !== '전체'
    ) {
      data = data.filter(
        (row) =>
          String(row[filterField]) ===
          String(filterValue)
      )
    }

    return data
  }, [
    performanceSourceRows,
    performanceDataSource,
    selectedChannel,
    filterField,
    filterValue,
    globalChannel,
    globalCampaign,
    globalProduct,
    globalBrand,
    startDate,
    endDate,
  ])

  const optimizationSourceRows =
    useMemo(() => {
      let data =
        Array.isArray(
          performanceSourceRows
        )
          ? performanceSourceRows
          : []

      if (
        globalBrand !==
        '전체'
      ) {
        data = data.filter(
          (row) =>
            row.brand ===
            globalBrand
        )
      }

      if (startDate) {
        data = data.filter(
          (row) =>
            row.date >=
            startDate
        )
      }

      if (endDate) {
        data = data.filter(
          (row) =>
            row.date <=
            endDate
        )
      }

      if (
        globalChannel !==
        '전체'
      ) {
        data = data.filter(
          (row) =>
            row.channel ===
            globalChannel
        )
      }

      if (
        globalCampaign !==
        '전체'
      ) {
        data = data.filter(
          (row) =>
            row.campaign ===
            globalCampaign
        )
      }

      if (
        globalProduct !==
        '전체'
      ) {
        data = data.filter(
          (row) =>
            row.product ===
            globalProduct
        )
      }

      return data
    }, [
      performanceSourceRows,
      globalBrand,
      globalChannel,
      globalCampaign,
      globalProduct,
      startDate,
      endDate,
    ])

  const previousPeriodRange = useMemo(() => {
    if (!startDate || !endDate) {
      return {
        start: '',
        end: '',
      }
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    const periodDays =
      Math.round(
        (end - start) /
        (1000 * 60 * 60 * 24)
      ) + 1

    const previousEnd = new Date(start)
    previousEnd.setDate(
      previousEnd.getDate() - 1
    )

    const previousStart =
      new Date(previousEnd)

    previousStart.setDate(
      previousStart.getDate() -
      periodDays +
      1
    )

    const formatDate = (date) =>
      date.toISOString().slice(0, 10)

    return {
      start: formatDate(previousStart),
      end: formatDate(previousEnd),
    }
  }, [
    startDate,
    endDate,
  ])

  const previousPeriodData = useMemo(() => {
    if (
      !previousPeriodRange.start ||
      !previousPeriodRange.end
    ) {
      return []
    }

    let data = performanceSourceRows.filter(
      (row) =>
        row.date >= previousPeriodRange.start &&
        row.date <= previousPeriodRange.end
    )

    if (globalBrand !== '전체') {
      data = data.filter(
        (row) =>
          row.brand === globalBrand
      )
    }

    if (globalChannel !== '전체') {
      data = data.filter(
        (row) =>
          row.channel === globalChannel
      )
    }

    if (globalCampaign !== '전체') {
      data = data.filter(
        (row) =>
          row.campaign === globalCampaign
      )
    }

    if (globalProduct !== '전체') {
      data = data.filter(
        (row) =>
          row.product === globalProduct
      )
    }

    return data
  }, [
    performanceSourceRows,
    previousPeriodRange,
    globalBrand,
    globalChannel,
    globalCampaign,
    globalProduct,
  ])

  const performanceComparison = useMemo(() => {
    const currentSpend =
      calculateMetric(
        filteredData,
        'spend',
        'sum'
      )

    const previousSpend =
      calculateMetric(
        previousPeriodData,
        'spend',
        'sum'
      )

    const currentRevenue =
      calculateMetric(
        filteredData,
        'revenue',
        'sum'
      )

    const previousRevenue =
      calculateMetric(
        previousPeriodData,
        'revenue',
        'sum'
      )

    const currentConversions =
      calculateMetric(
        filteredData,
        'conversions',
        'sum'
      )

    const previousConversions =
      calculateMetric(
        previousPeriodData,
        'conversions',
        'sum'
      )

    const currentClicks =
      calculateMetric(
        filteredData,
        'clicks',
        'sum'
      )

    const previousClicks =
      calculateMetric(
        previousPeriodData,
        'clicks',
        'sum'
      )

    const currentImpressions =
      calculateMetric(
        filteredData,
        'impressions',
        'sum'
      )

    const previousImpressions =
      calculateMetric(
        previousPeriodData,
        'impressions',
        'sum'
      )

    const currentRoas =
      calculateRoas(
        currentRevenue,
        currentSpend
      )

    const previousRoas =
      calculateRoas(
        previousRevenue,
        previousSpend
      )

    const currentCpa =
      calculateCpa(
        currentSpend,
        currentConversions
      )

    const previousCpa =
      calculateCpa(
        previousSpend,
        previousConversions
      )

    const currentCtr =
      calculateCtr(
        currentClicks,
        currentImpressions
      )

    const previousCtr =
      calculateCtr(
        previousClicks,
        previousImpressions
      )

    function getChangeRate(
      currentValue,
      previousValue
    ) {
      if (previousValue === 0) {
        return null
      }

      return (
        (
          currentValue -
          previousValue
        ) /
        previousValue
      ) * 100
    }

    return {
      spend: {
        current: currentSpend,
        previous: previousSpend,
        change: getChangeRate(
          currentSpend,
          previousSpend
        ),
      },

      revenue: {
        current: currentRevenue,
        previous: previousRevenue,
        change: getChangeRate(
          currentRevenue,
          previousRevenue
        ),
      },

      roas: {
        current: currentRoas,
        previous: previousRoas,
        change: getChangeRate(
          currentRoas,
          previousRoas
        ),
      },

      cpa: {
        current: currentCpa,
        previous: previousCpa,
        change: getChangeRate(
          currentCpa,
          previousCpa
        ),
      },

      ctr: {
        current: currentCtr,
        previous: previousCtr,
        change: getChangeRate(
          currentCtr,
          previousCtr
        ),
      },

      conversions: {
        current: currentConversions,
        previous: previousConversions,
        change: getChangeRate(
          currentConversions,
          previousConversions
        ),
      },
    }
  }, [
    filteredData,
    previousPeriodData,
  ])

  const performanceCampaignSummary =
    Object.values(
      filteredData.reduce(
        (acc, row) => {
          const campaign =
            row.campaign ||
            'Unknown Campaign'

          const key =
            `${row.channel}-${campaign}`

          if (!acc[key]) {
            acc[key] = {
              key,
              channel:
                row.channel || 'Unknown',
              campaign,
              spend: 0,
              revenue: 0,
              conversions: 0,
            }
          }

          acc[key].spend +=
            Number(row.spend || 0)

          acc[key].revenue +=
            Number(row.revenue || 0)

          acc[key].conversions +=
            Number(
              row.conversions || 0
            )

          return acc
        },
        {}
      )
    )
      .map((row) => ({
        ...row,

        roas:
          calculateRoas(
            row.revenue,
            row.spend
          ),

        cpa:
          calculateCpa(
            row.spend,
            row.conversions
          ),
      }))

  const bestRoasCampaign =
    [...performanceCampaignSummary]
      .sort(
        (a, b) =>
          b.roas - a.roas
      )[0] || null

  const bestRevenueCampaign =
    [...performanceCampaignSummary]
      .sort(
        (a, b) =>
          b.revenue - a.revenue
      )[0] || null

  const bestCpaCampaign =
    [...performanceCampaignSummary]
      .filter(
        (row) =>
          row.conversions > 0
      )
      .sort(
        (a, b) =>
          a.cpa - b.cpa
      )[0] || null

  const improvementCampaign =
    [...performanceCampaignSummary]
      .filter(
        (row) =>
          row.spend > 0
      )
      .sort(
        (a, b) =>
          a.roas - b.roas
      )[0] || null

  const performanceDailySummary =
    Object.values(
      filteredData.reduce(
        (acc, row) => {
          const date = row.date

          if (!acc[date]) {
            acc[date] = {
              date,
              spend: 0,
              revenue: 0,
            }
          }

          acc[date].spend +=
            Number(row.spend || 0)

          acc[date].revenue +=
            Number(row.revenue || 0)

          return acc
        },
        {}
      )
    )
      .map((row) => ({
        ...row,

        roas:
          calculateRoas(
            row.revenue,
            row.spend
          ),
      }))
      .sort(
        (a, b) =>
          new Date(
            `${a.date}T00:00:00`
          ) -
          new Date(
            `${b.date}T00:00:00`
          )
      )

  const optimizationPeriodDays = useMemo(() => {
    if (!startDate || !endDate) {
      return 1
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    const days =
      Math.floor(
        (end - start) /
        (1000 * 60 * 60 * 24)
      ) + 1

    return Math.max(days, 1)
  }, [
    startDate,
    endDate,
  ])

  const optimizationFilteredData = useMemo(() => {
    if (
      !Array.isArray(
        optimizationSourceRows
      )
    ) {
      return []
    }

    const channels = [
      ...new Set(
        optimizationSourceRows.map(
          (row) => row.channel
        )
      ),
    ]

    const result = []

    channels.forEach((channel) => {
      const rows =
        optimizationSourceRows.filter(
          (row) =>
            row.channel === channel
        )

      if (rows.length === 0) {
        return
      }

      const revenueValues =
        rows
          .map(
            (row) =>
              Number(row.revenue) || 0
          )
          .sort(
            (a, b) => a - b
          )

      const conversionValues =
        rows
          .map(
            (row) =>
              Number(row.conversions) || 0
          )
          .sort(
            (a, b) => a - b
          )

      const percentile = (
        values,
        ratio
      ) => {
        if (values.length === 0) {
          return 0
        }

        const index =
          Math.min(
            values.length - 1,
            Math.max(
              0,
              Math.floor(
                (values.length - 1) *
                ratio
              )
            )
          )

        return values[index]
      }

      const revenueLower =
        percentile(
          revenueValues,
          0.05
        )

      const revenueUpper =
        percentile(
          revenueValues,
          0.95
        )

      const conversionsLower =
        percentile(
          conversionValues,
          0.05
        )

      const conversionsUpper =
        percentile(
          conversionValues,
          0.95
        )

      rows.forEach((row) => {
        result.push({
          ...row,

          revenue:
            Math.min(
              revenueUpper,
              Math.max(
                revenueLower,
                Number(row.revenue) || 0
              )
            ),

          conversions:
            Math.min(
              conversionsUpper,
              Math.max(
                conversionsLower,
                Number(row.conversions) || 0
              )
            ),
        })
      })
    })

    return result
  }, [
    optimizationSourceRows,
  ])

  const mockCampaignOptimizationInput =
    useMemo(() => {
      if (
        performanceDataSource !==
        'mock' ||
        !Array.isArray(
          optimizationSourceRows
        ) ||
        optimizationSourceRows.length ===
        0
      ) {
        return null
      }

      // -----------------------------------------
      // 1. campaign × date 단위로 집계
      // -----------------------------------------

      const dailyMap = {}

      optimizationSourceRows.forEach(
        (row) => {
          const date =
            String(
              row.date || ''
            )

          const channel =
            String(
              row.channel ||
              'Unknown'
            )

          const campaign =
            String(
              row.campaign ||
              'Unknown Campaign'
            )

          if (!date) {
            return
          }

          // 서로 다른 매체에 같은 캠페인명이 있어도
          // 충돌하지 않도록 channel을 ID에 포함
          const campaignId =
            `${channel}::${campaign}`

          const key =
            `${campaignId}::${date}`

          if (!dailyMap[key]) {
            dailyMap[key] = {
              date,
              campaign_id:
                campaignId,
              campaign_name:
                campaign,
              channel,

              spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              revenue: 0,
            }
          }

          dailyMap[key].spend +=
            Number(
              row.spend
            ) || 0

          dailyMap[key].impressions +=
            Number(
              row.impressions
            ) || 0

          dailyMap[key].clicks +=
            Number(
              row.clicks
            ) || 0

          dailyMap[key].conversions +=
            Number(
              row.conversions
            ) || 0

          dailyMap[key].revenue +=
            Number(
              row.revenue
            ) || 0
        }
      )

      const performanceRecords =
        Object.values(
          dailyMap
        ).sort(
          (a, b) =>
            a.date.localeCompare(
              b.date
            )
        )

      if (
        performanceRecords.length ===
        0
      ) {
        return null
      }

      // -----------------------------------------
      // 2. 캠페인별 현재예산 x0 계산
      // Mock 전용:
      // 일별 spend 평균을 현재 일예산으로 사용
      // -----------------------------------------

      const campaignRows = {}

      performanceRecords.forEach(
        (row) => {
          if (
            !campaignRows[
            row.campaign_id
            ]
          ) {
            campaignRows[
              row.campaign_id
            ] = []
          }

          campaignRows[
            row.campaign_id
          ].push(
            Number(
              row.spend
            ) || 0
          )
        }
      )

      const currentBudgets = {}

      Object.entries(
        campaignRows
      ).forEach(
        ([
          campaignId,
          spends,
        ]) => {
          const total =
            spends.reduce(
              (
                sum,
                value
              ) =>
                sum +
                value,
              0
            )

          currentBudgets[
            campaignId
          ] =
            spends.length > 0
              ? total /
              spends.length
              : 0
        }
      )

      // -----------------------------------------
      // 3. Mock용 L/U
      //
      // 실제 매체 Policy가 아니므로
      // 테스트 전용으로 x0의 50% ~ 150%
      // -----------------------------------------

      const budgetBounds = {}

      Object.entries(
        currentBudgets
      ).forEach(
        ([
          campaignId,
          currentBudget,
        ]) => {
          budgetBounds[
            campaignId
          ] = {
            min:
              currentBudget *
              0.50,

            max:
              currentBudget *
              1.50,
          }
        }
      )

      const dates =
        performanceRecords
          .map(
            (row) =>
              row.date
          )
          .filter(Boolean)
          .sort()

      const totalDailyBudget =
        Object.values(
          currentBudgets
        ).reduce(
          (
            sum,
            value
          ) =>
            sum +
            value,
          0
        )

      return {
        performanceRecords,
        currentBudgets,
        budgetBounds,
        totalDailyBudget,

        revenueValidStartDate:
          dates[0] || null,

        validTotalDays:
          new Set(
            dates
          ).size,

        campaignCount:
          Object.keys(
            currentBudgets
          ).length,
      }
    }, [
      performanceDataSource,
      optimizationSourceRows,
    ])

  const filteredNaverCampaignBudgetPolicies =
    useMemo(() => {
      if (
        performanceDataSource !==
        'naver'
      ) {
        return []
      }

      const allowedCampaignIds =
        new Set(
          optimizationSourceRows
            .map(
              (row) =>
                String(
                  row.campaignId ||
                  ''
                )
            )
            .filter(Boolean)
        )

      return (
        campaignBudgetPolicies ||
        []
      ).filter(
        (policy) =>
          allowedCampaignIds.has(
            String(
              policy.campaignId
            )
          )
      )
    }, [
      performanceDataSource,
      optimizationSourceRows,
      campaignBudgetPolicies,
    ])


  const filteredNaverCampaignBudgetMeta =
    useMemo(() => {
      if (
        performanceDataSource !==
        'naver'
      ) {
        return null
      }

      const policies =
        filteredNaverCampaignBudgetPolicies

      const eligiblePolicies =
        policies.filter(
          (policy) =>
            policy.optimizationEligible
        )

      const policyReadyCount =
        eligiblePolicies.filter(
          (policy) =>
            policy.policyReady
        ).length

      const currentTotalDailyBudget =
        policies.reduce(
          (
            sum,
            policy
          ) =>
            sum +
            (
              Number(
                policy.currentDailyBudget
              ) || 0
            ),
          0
        )

      const optimizationCurrentTotalDailyBudget =
        eligiblePolicies.reduce(
          (
            sum,
            policy
          ) =>
            sum +
            (
              Number(
                policy.currentDailyBudget
              ) || 0
            ),
          0
        )

      return {
        campaignCount:
          policies.length,

        optimizationEligibleCount:
          eligiblePolicies.length,

        excludedCampaignCount:
          policies.length -
          eligiblePolicies.length,

        policyReadyCount,

        missingPolicyCount:
          eligiblePolicies.length -
          policyReadyCount,

        currentTotalDailyBudget,

        optimizationCurrentTotalDailyBudget,

        dataSource:
          'naver',
      }
    }, [
      performanceDataSource,
      filteredNaverCampaignBudgetPolicies,
    ])


  const displayedCampaignBudgetPolicies =
    useMemo(() => {
      if (
        performanceDataSource ===
        'naver'
      ) {
        return (
          filteredNaverCampaignBudgetPolicies ||
          []
        )
      }

      const mockInput =
        mockCampaignOptimizationInput

      if (!mockInput) {
        return []
      }

      return Object.entries(
        mockInput.currentBudgets ||
        {}
      ).map(
        ([
          campaignId,
          currentBudget,
        ]) => {
          const bounds =
            mockInput.budgetBounds?.[
            campaignId
            ] || {}

          const [
            channel,
            ...campaignNameParts
          ] =
            String(
              campaignId
            ).split('::')

          const campaignName =
            campaignNameParts.join(
              '::'
            ) ||
            campaignId

          return {
            campaignId,
            campaignName,

            platform:
              channel ||
              'Mock',

            currentDailyBudget:
              Number(
                currentBudget
              ) || 0,

            minDailyBudget:
              Number(
                bounds.min
              ) || 0,

            maxDailyBudget:
              Number(
                bounds.max
              ) || 0,

            optimizationEligible:
              true,

            eligibilityReason:
              'MOCK_ELIGIBLE',

            policyReady:
              true,

            currentBudgetSource:
              'mock_average_daily_spend',

            policySource:
              'mock_generated',
          }
        }
      )
    }, [
      performanceDataSource,
      mockCampaignOptimizationInput,
      filteredNaverCampaignBudgetPolicies,
    ])


  const displayedCampaignBudgetPolicyMeta =
    useMemo(() => {
      if (
        performanceDataSource ===
        'naver'
      ) {
        return (
          filteredNaverCampaignBudgetMeta ||
          {
            campaignCount: 0,
            optimizationEligibleCount: 0,
            excludedCampaignCount: 0,
            policyReadyCount: 0,
            missingPolicyCount: 0,
            currentTotalDailyBudget: 0,
            optimizationCurrentTotalDailyBudget: 0,
            dataSource: 'naver',
          }
        )
      }

      const policies =
        displayedCampaignBudgetPolicies

      const totalDailyBudget =
        policies.reduce(
          (
            sum,
            policy
          ) =>
            sum +
            (
              Number(
                policy.currentDailyBudget
              ) || 0
            ),
          0
        )

      return {
        campaignCount:
          policies.length,

        optimizationEligibleCount:
          policies.length,

        excludedCampaignCount:
          0,

        policyReadyCount:
          policies.length,

        missingPolicyCount:
          0,

        currentTotalDailyBudget:
          totalDailyBudget,

        optimizationCurrentTotalDailyBudget:
          totalDailyBudget,

        dataSource:
          'mock',
      }
    }, [
      performanceDataSource,
      displayedCampaignBudgetPolicies,
      filteredNaverCampaignBudgetMeta,
    ])




  const channelPerformance = useMemo(() => {
    const channels = [
      ...new Set(
        filteredData.map((row) => row.channel)
      ),
    ]

    return channels
      .map((channel) => {
        const rows =
          optimizationFilteredData.filter(
            (row) =>
              row.channel === channel
          )

        const metrics =
          calculatePerformanceMetrics(rows)

        return {
          channel,
          ...metrics,
        }
      })
      .sort(
        (a, b) => b.roas - a.roas
      )
  }, [
    optimizationFilteredData,
  ])

  const gurobiChannelAllocation = useMemo(() => {
    if (
      !optimizationApiResult ||
      optimizationApiResult.status !== 'optimal' ||
      !Array.isArray(
        optimizationApiResult.solution
      )
    ) {
      return []
    }

    const grouped = {}

    optimizationApiResult.solution.forEach(
      (item) => {
        if (!grouped[item.channel]) {
          grouped[item.channel] = {
            channel: item.channel,
            optimizedDailyBudget: 0,
          }
        }

        grouped[item.channel]
          .optimizedDailyBudget +=
          Number(item.value) || 0
      }
    )


    return Object.values(grouped).map(
      (item) => {
        const current =
          channelPerformance.find(
            (channelItem) =>
              channelItem.channel ===
              item.channel
          )

        const currentPeriodBudget =
          current?.spend || 0

        const optimizedPeriodBudget =
          item.optimizedDailyBudget *
          optimizationPeriodDays

        const budgetChange =
          optimizedPeriodBudget -
          currentPeriodBudget

        const budgetChangeRate =
          currentPeriodBudget > 0
            ? (
              budgetChange /
              currentPeriodBudget
            ) * 100
            : null

        return {
          ...item,

          currentPeriodBudget,

          optimizedPeriodBudget,

          budgetChange,

          budgetChangeRate,
        }
      }
    )
  }, [
    optimizationApiResult,
    channelPerformance,
    optimizationPeriodDays,
  ])




  const budgetAllocationAnalysis = useMemo(() => {
    const totalSpend =
      channelPerformance.reduce(
        (sum, item) => sum + item.spend,
        0
      )

    const totalRevenue =
      channelPerformance.reduce(
        (sum, item) => sum + item.revenue,
        0
      )

    return channelPerformance.map((item) => {
      const budgetShare =
        totalSpend > 0
          ? (item.spend / totalSpend) * 100
          : 0

      const revenueShare =
        totalRevenue > 0
          ? (item.revenue / totalRevenue) * 100
          : 0

      const efficiencyGap =
        revenueShare - budgetShare

      return {
        ...item,
        budgetShare,
        revenueShare,
        efficiencyGap,
      }
    })
  }, [channelPerformance])

  const budgetRecommendations = useMemo(() => {
    if (budgetAllocationAnalysis.length === 0) {
      return []
    }

    const averageRoas =
      budgetAllocationAnalysis.reduce(
        (sum, item) => sum + item.roas,
        0
      ) / budgetAllocationAnalysis.length

    const averageCpa =
      budgetAllocationAnalysis.reduce(
        (sum, item) => sum + item.cpa,
        0
      ) / budgetAllocationAnalysis.length

    return budgetAllocationAnalysis.map((item) => {
      const highRoas =
        item.roas >= averageRoas

      const lowCpa =
        item.cpa <= averageCpa

      const positiveGap =
        item.efficiencyGap > 0

      let recommendation = '유지'
      let reason =
        '현재 예산 배분을 유지하면서 추이를 확인합니다.'

      if (
        highRoas &&
        lowCpa &&
        positiveGap
      ) {
        recommendation = '증액 후보'
        reason =
          'ROAS가 평균 이상이고 CPA가 낮으며, 매출 기여도가 예산 비중보다 높습니다.'
      } else if (
        !highRoas &&
        !lowCpa &&
        item.efficiencyGap < 0
      ) {
        recommendation = '감액 검토'
        reason =
          'ROAS가 평균보다 낮고 CPA가 높으며, 매출 기여도가 예산 비중보다 낮습니다.'
      }

      return {
        ...item,
        recommendation,
        reason,
      }
    })
  }, [budgetAllocationAnalysis])




  const optimizationDailyBudget = useMemo(() => {
    const totalBudget =
      Number(optimizationBudget) || 0

    if (totalBudget <= 0) {
      return 0
    }

    return (
      totalBudget /
      optimizationPeriodDays
    )
  }, [
    optimizationBudget,
    optimizationPeriodDays,
  ])



  const optimizationModelInput = useMemo(() => {
    const totalBudget =
      Number(optimizationBudget) || 0

    const changeLimit =
      Math.max(
        0,
        Math.min(
          100,
          Number(budgetChangeLimit) || 0
        )
      ) / 100

    const channels =
      channelPerformance.map((item) => ({
        channel: item.channel,

        currentBudget:
          item.spend /
          optimizationPeriodDays,

        minBudget:
          (
            item.spend /
            optimizationPeriodDays
          ) *
          (1 - changeLimit),

        maxBudget:
          (
            item.spend /
            optimizationPeriodDays
          ) *
          (1 + changeLimit),

        currentRevenue:
          item.revenue,

        currentConversions:
          item.conversions,

        currentRoas:
          item.roas,

        currentCpa:
          item.cpa,
      }))

    return {
      objective:
        optimizationObjective,

      totalBudget:
        optimizationDailyBudget,

      channels,
    }
  }, [
    optimizationBudget,
    optimizationObjective,
    channelPerformance,
    budgetChangeLimit,
  ])



  const channelDailyPerformance = useMemo(() => {
    const grouped = {}

    optimizationFilteredData.forEach((row) => {
      const key =
        `${row.channel}__${row.date}`

      if (!grouped[key]) {
        grouped[key] = {
          channel: row.channel,
          date: row.date,
          spend: 0,
          revenue: 0,
          conversions: 0,
        }
      }

      grouped[key].spend +=
        Math.max(
          0,
          Number(row.spend) || 0
        )

      grouped[key].revenue +=
        Math.max(
          0,
          Number(row.revenue) || 0
        )

      grouped[key].conversions +=
        Math.max(
          0,
          Number(row.conversions) || 0
        )
    })

    return Object.values(grouped)
  }, [optimizationFilteredData])


  const channelResponseObservations = useMemo(() => {
    const channels = [
      ...new Set(
        channelDailyPerformance.map(
          (item) => item.channel
        )
      ),
    ]

    return channels.map((channel) => {
      const dailyObservations =
        channelDailyPerformance
          .filter(
            (item) =>
              item.channel === channel
          )
          .sort(
            (a, b) =>
              a.spend - b.spend
          )

      const observations = [
        {
          channel,
          date: 'baseline',
          spend: 0,
          revenue: 0,
          conversions: 0,
        },

        ...dailyObservations,
      ]

      return {
        channel,
        observations,
      }
    })
  }, [channelDailyPerformance])



  const channelResponseSegments = useMemo(() => {
    return channelResponseObservations.map(
      ({ channel, observations }) => {
        if (observations.length < 4) {
          return {
            channel,
            segments: [],
          }
        }

        // --------------------------------------------------
        // 1. spend 기준 정렬
        // --------------------------------------------------
        const sortedObservations = [
          ...observations,
        ].sort(
          (a, b) =>
            Number(a.spend) - Number(b.spend)
        )

        // --------------------------------------------------
        // 2. 관측치를 몇 개의 spend bin으로 압축
        // 너무 많은 segment를 만들지 않기 위해
        // 기본적으로 6개 bin 사용
        // --------------------------------------------------
        const binCount =
          Math.min(
            6,
            sortedObservations.length
          )

        const binSize =
          Math.ceil(
            sortedObservations.length /
            binCount
          )

        const responsePoints = []

        for (
          let start = 0;
          start < sortedObservations.length;
          start += binSize
        ) {
          const bin =
            sortedObservations.slice(
              start,
              start + binSize
            )

          if (bin.length === 0) {
            continue
          }

          const averageSpend =
            bin.reduce(
              (sum, row) =>
                sum + Number(row.spend || 0),
              0
            ) / bin.length

          const averageRevenue =
            bin.reduce(
              (sum, row) =>
                sum + Number(row.revenue || 0),
              0
            ) / bin.length

          const averageConversions =
            bin.reduce(
              (sum, row) =>
                sum +
                Number(row.conversions || 0),
              0
            ) / bin.length

          responsePoints.push({
            spend:
              averageSpend,

            revenue:
              averageRevenue,

            conversions:
              averageConversions,
          })
        }

        if (responsePoints.length < 2) {
          return {
            channel,
            segments: [],
          }
        }

        // --------------------------------------------------
        // 3. response level 단조 증가 보정
        //
        // spend가 늘었는데 revenue/conversions가 감소하는
        // 이상한 관측 노이즈를 직접 LP slope로 넘기지 않음
        // --------------------------------------------------
        const monotonePoints = []

        let previousRevenue = 0
        let previousConversions = 0

        responsePoints.forEach(
          (point) => {
            const adjustedRevenue =
              Math.max(
                previousRevenue,
                Number(point.revenue) || 0
              )

            const adjustedConversions =
              Math.max(
                previousConversions,
                Number(point.conversions) || 0
              )

            monotonePoints.push({
              spend:
                Number(point.spend) || 0,

              revenue:
                adjustedRevenue,

              conversions:
                adjustedConversions,
            })

            previousRevenue =
              adjustedRevenue

            previousConversions =
              adjustedConversions
          }
        )

        // --------------------------------------------------
        // 4. 첫 segment는 0 budget → 첫 response point
        // --------------------------------------------------
        const pointsWithOrigin = [
          {
            spend: 0,
            revenue: 0,
            conversions: 0,
          },
          ...monotonePoints,
        ]

        const segments = []

        // --------------------------------------------------
        // 5. 안정화된 response point 사이의 slope 계산
        // --------------------------------------------------
        for (
          let index = 0;
          index < pointsWithOrigin.length - 1;
          index++
        ) {
          const current =
            pointsWithOrigin[index]

          const next =
            pointsWithOrigin[index + 1]

          const budgetDelta =
            next.spend - current.spend

          if (
            !Number.isFinite(budgetDelta) ||
            budgetDelta <= 0
          ) {
            continue
          }

          const revenueDelta =
            Math.max(
              0,
              next.revenue -
              current.revenue
            )

          const conversionsDelta =
            Math.max(
              0,
              next.conversions -
              current.conversions
            )

          const marginalRevenue =
            revenueDelta /
            budgetDelta

          const marginalConversions =
            conversionsDelta /
            budgetDelta

          segments.push({
            segmentIndex:
              segments.length,

            minBudget:
              current.spend,

            maxBudget:
              next.spend,

            budgetCapacity:
              budgetDelta,

            startRevenue:
              current.revenue,

            endRevenue:
              next.revenue,

            startConversions:
              current.conversions,

            endConversions:
              next.conversions,

            marginalRevenue,

            marginalConversions,
          })
        }

        return {
          channel,
          segments,
        }
      }
    )
  }, [channelResponseObservations])

  const monotoneResponseSegments = useMemo(() => {
    return channelResponseSegments.map(
      ({ channel, segments }) => {
        if (segments.length === 0) {
          return {
            channel,
            segments: [],
          }
        }

        const adjusted = []

        let previousMarginalRevenue =
          Infinity

        let previousMarginalConversions =
          Infinity

        segments.forEach((segment) => {
          const safeRawMarginalRevenue =
            Number.isFinite(
              segment.marginalRevenue
            )
              ? Math.max(
                0,
                segment.marginalRevenue
              )
              : 0

          const safeRawMarginalConversions =
            Number.isFinite(
              segment.marginalConversions
            )
              ? Math.max(
                0,
                segment.marginalConversions
              )
              : 0

          const adjustedMarginalRevenue =
            Math.min(
              safeRawMarginalRevenue,
              previousMarginalRevenue
            )

          const adjustedMarginalConversions =
            Math.min(
              safeRawMarginalConversions,
              previousMarginalConversions
            )

          adjusted.push({
            ...segment,

            rawMarginalRevenue:
              segment.marginalRevenue,

            marginalRevenue:
              adjustedMarginalRevenue,

            rawMarginalConversions:
              segment.marginalConversions,

            marginalConversions:
              adjustedMarginalConversions,
          })

          previousMarginalRevenue =
            adjustedMarginalRevenue

          previousMarginalConversions =
            adjustedMarginalConversions
        })

        return {
          channel,
          segments: adjusted,
        }
      }
    )
  }, [channelResponseSegments])

  const channelRiskMetrics = useMemo(() => {
    return channelPerformance.map((item) => {
      const channelRows =
        filteredData.filter(
          (row) =>
            row.channel === item.channel
        )

      const roasValues =
        channelRows
          .map((row) => {
            const spend =
              Number(row.spend) || 0

            const revenue =
              Number(row.revenue) || 0

            if (spend <= 0) {
              return null
            }

            return revenue / spend
          })
          .filter(
            (value) =>
              Number.isFinite(value) &&
              value !== null &&
              value >= 0
          )

      if (roasValues.length < 2) {
        return {
          channel:
            item.channel,

          volatility: 0,

          riskWeight: 1,
        }
      }

      const mean =
        roasValues.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / roasValues.length

      const variance =
        roasValues.reduce(
          (sum, value) =>
            sum +
            Math.pow(
              value - mean,
              2
            ),
          0
        ) / roasValues.length

      const standardDeviation =
        Math.sqrt(variance)

      const volatility =
        mean > 0
          ? standardDeviation / mean
          : 0

      return {
        channel:
          item.channel,

        volatility,

        riskWeight:
          1 + volatility,
      }
    })
  }, [
    channelPerformance,
    filteredData,
  ])

  const optimizationDataDiagnostic = useMemo(() => {
    return channelPerformance.map((item) => {
      const channelRows = filteredData.filter(
        (row) => row.channel === item.channel
      )

      const validRows = channelRows.filter((row) => {
        const spend = Number(row.spend)
        const revenue = Number(row.revenue)
        const conversions = Number(row.conversions)

        return (
          Number.isFinite(spend) &&
          spend > 0 &&
          Number.isFinite(revenue) &&
          Number.isFinite(conversions)
        )
      })

      const spends = validRows.map(
        (row) => Number(row.spend)
      )

      const roasValues = validRows.map((row) => {
        const spend = Number(row.spend)
        const revenue = Number(row.revenue)

        return revenue / spend
      })

      const conversionEfficiencyValues =
        validRows.map((row) => {
          const spend = Number(row.spend)
          const conversions =
            Number(row.conversions)

          return conversions / spend
        })

      const average = (values) => {
        if (values.length === 0) {
          return 0
        }

        return (
          values.reduce(
            (sum, value) => sum + value,
            0
          ) / values.length
        )
      }

      const standardDeviation = (values) => {
        if (values.length < 2) {
          return 0
        }

        const mean = average(values)

        const variance =
          values.reduce(
            (sum, value) =>
              sum +
              Math.pow(value - mean, 2),
            0
          ) / values.length

        return Math.sqrt(variance)
      }

      const averageRoas =
        average(roasValues)

      const roasStd =
        standardDeviation(roasValues)

      const averageConversionEfficiency =
        average(
          conversionEfficiencyValues
        )

      const conversionEfficiencyStd =
        standardDeviation(
          conversionEfficiencyValues
        )

      const riskMetric =
        channelRiskMetrics.find(
          (risk) =>
            risk.channel === item.channel
        )

      return {
        channel: item.channel,

        observationCount:
          validRows.length,

        spendMin:
          spends.length > 0
            ? Math.min(...spends)
            : 0,

        spendMax:
          spends.length > 0
            ? Math.max(...spends)
            : 0,

        spendRange:
          spends.length > 0
            ? Math.max(...spends) -
            Math.min(...spends)
            : 0,

        averageRoas,

        roasStd,

        roasCV:
          averageRoas > 0
            ? roasStd / averageRoas
            : 0,

        averageConversionEfficiency,

        conversionEfficiencyStd,

        riskWeight:
          riskMetric?.riskWeight ?? 1,
      }
    })
  }, [
    channelPerformance,
    filteredData,
    channelRiskMetrics,
  ])


  const segmentDiagnostic =
    monotoneResponseSegments.flatMap(
      ({ channel, segments }) =>
        segments.map((segment) => ({
          channel,

          segmentIndex:
            segment.segmentIndex,

          minBudget:
            segment.minBudget,

          maxBudget:
            segment.maxBudget,

          capacity:
            segment.budgetCapacity,

          marginalRevenue:
            segment.marginalRevenue,

          marginalConversions:
            segment.marginalConversions,
        }))
    )


  const gurobiPerformanceProjection = useMemo(() => {
    if (gurobiChannelAllocation.length === 0) {
      return []
    }

    return gurobiChannelAllocation.map(
      (allocation) => {
        const channelSegments =
          monotoneResponseSegments.find(
            (item) =>
              item.channel === allocation.channel
          )

        const solutionItems =
          optimizationApiResult?.solution?.filter(
            (item) =>
              item.channel === allocation.channel
          ) || []

        const projectedDailyRevenue =
          solutionItems.reduce(
            (sum, solutionItem) => {
              const segment =
                channelSegments?.segments.find(
                  (item) =>
                    item.segmentIndex ===
                    solutionItem.segmentIndex
                )

              if (!segment) {
                return sum
              }

              return (
                sum +
                (
                  Number(solutionItem.value) || 0
                ) *
                segment.marginalRevenue
              )
            },
            0
          )

        const projectedDailyConversions =
          solutionItems.reduce(
            (sum, solutionItem) => {
              const segment =
                channelSegments?.segments.find(
                  (item) =>
                    item.segmentIndex ===
                    solutionItem.segmentIndex
                )

              if (!segment) {
                return sum
              }

              return (
                sum +
                (
                  Number(solutionItem.value) || 0
                ) *
                segment.marginalConversions
              )
            },
            0
          )

        // -----------------------------------------
        // 실제 Gurobi가 사용한 구간의 한계효율
        // -----------------------------------------

        const usedSegmentMetrics =
          solutionItems
            .filter(
              (solutionItem) =>
                (Number(solutionItem.value) || 0) >
                0
            )
            .map(
              (solutionItem) => {
                const segment =
                  channelSegments?.segments.find(
                    (item) =>
                      item.segmentIndex ===
                      solutionItem.segmentIndex
                  )

                if (!segment) {
                  return null
                }

                return {
                  value:
                    Number(
                      solutionItem.value
                    ) || 0,

                  marginalRevenue:
                    Number(
                      segment.marginalRevenue
                    ) || 0,

                  marginalConversions:
                    Number(
                      segment.marginalConversions
                    ) || 0,
                }
              }
            )
            .filter(Boolean)

        const usedBudget =
          usedSegmentMetrics.reduce(
            (sum, item) =>
              sum + item.value,
            0
          )

        const weightedMarginalRevenue =
          usedBudget > 0
            ? usedSegmentMetrics.reduce(
              (sum, item) =>
                sum +
                item.value *
                item.marginalRevenue,
              0
            ) / usedBudget
            : 0

        const weightedMarginalConversions =
          usedBudget > 0
            ? usedSegmentMetrics.reduce(
              (sum, item) =>
                sum +
                item.value *
                item.marginalConversions,
              0
            ) / usedBudget
            : 0


        const projectedPeriodRevenue =
          projectedDailyRevenue *
          optimizationPeriodDays

        const projectedPeriodConversions =
          projectedDailyConversions *
          optimizationPeriodDays

        const projectedCpa =
          projectedPeriodConversions > 0
            ? allocation.optimizedPeriodBudget /
            projectedPeriodConversions
            : null

        const projectedRoas =
          allocation.optimizedPeriodBudget > 0
            ? (
              projectedPeriodRevenue /
              allocation.optimizedPeriodBudget
            ) * 100
            : 0

        const channelRisk =
          channelRiskMetrics.find(
            (item) =>
              item.channel ===
              allocation.channel
          )

        const riskWeight =
          Number(
            channelRisk?.riskWeight
          ) || 1

        const current =
          channelPerformance.find(
            (item) =>
              item.channel === allocation.channel
          )

        const currentRevenue =
          current?.revenue || 0

        const currentRoas =
          current?.roas || 0

        const revenueChange =
          projectedPeriodRevenue -
          currentRevenue

        const revenueChangeRate =
          currentRevenue > 0
            ? (
              revenueChange /
              currentRevenue
            ) * 100
            : null

        const roasChange =
          projectedRoas -
          currentRoas

        return {
          ...allocation,

          projectedDailyRevenue,
          projectedDailyConversions,

          projectedPeriodRevenue,
          projectedPeriodConversions,

          projectedRoas,
          projectedCpa,

          currentRevenue,
          currentRoas,

          revenueChange,
          revenueChangeRate,
          roasChange,

          weightedMarginalRevenue,
          weightedMarginalConversions,
          riskWeight,
        }
      }
    )
  }, [
    gurobiChannelAllocation,
    monotoneResponseSegments,
    optimizationApiResult,
    optimizationPeriodDays,
    channelPerformance,
    channelRiskMetrics,
  ])









  const optimizationReasonByChannel = useMemo(() => {
    if (
      !Array.isArray(gurobiPerformanceProjection) ||
      gurobiPerformanceProjection.length === 0
    ) {
      return {}
    }

    const averageMarginalRevenue =
      gurobiPerformanceProjection.reduce(
        (sum, item) =>
          sum +
          (
            Number(
              item.weightedMarginalRevenue
            ) || 0
          ),
        0
      ) /
      gurobiPerformanceProjection.length

    const averageMarginalConversions =
      gurobiPerformanceProjection.reduce(
        (sum, item) =>
          sum +
          (
            Number(
              item.weightedMarginalConversions
            ) || 0
          ),
        0
      ) /
      gurobiPerformanceProjection.length

    const averageRiskWeight =
      gurobiPerformanceProjection.reduce(
        (sum, item) =>
          sum +
          (
            Number(item.riskWeight) || 1
          ),
        0
      ) /
      gurobiPerformanceProjection.length

    const result = {}

    gurobiPerformanceProjection.forEach(
      (item) => {
        const marginalRevenue =
          Number(
            item.weightedMarginalRevenue
          ) || 0

        const marginalConversions =
          Number(
            item.weightedMarginalConversions
          ) || 0

        const riskWeight =
          Number(item.riskWeight) || 1

        const budgetChangeRate =
          Number(item.budgetChangeRate) || 0

        const marginalRevenueDifference =
          averageMarginalRevenue > 0
            ? (
              (
                marginalRevenue -
                averageMarginalRevenue
              ) /
              averageMarginalRevenue
            ) * 100
            : 0

        const marginalConversionsDifference =
          averageMarginalConversions > 0
            ? (
              (
                marginalConversions -
                averageMarginalConversions
              ) /
              averageMarginalConversions
            ) * 100
            : 0

        const riskWeightDifference =
          averageRiskWeight > 0
            ? (
              (
                riskWeight -
                averageRiskWeight
              ) /
              averageRiskWeight
            ) * 100
            : 0

        const recommendation =
          budgetChangeRate > 1
            ? '증액'
            : budgetChangeRate < -1
              ? '감액'
              : '유지'

        let reason = ''

        // -----------------------------------------
        // 1. 예상 매출 최대화
        // -----------------------------------------

        if (
          optimizationObjective === 'revenue'
        ) {
          if (recommendation === '증액') {
            reason =
              marginalRevenue >=
                averageMarginalRevenue
                ? `한계 매출효율이 전체 매체 평균보다 ${Math.abs(
                  marginalRevenueDifference
                ).toFixed(
                  1
                )}% 높아 추가 예산의 매출 기여도가 큰 채널로 평가되었습니다.`
                : `전체 예산 제약과 매체 간 한계효율을 함께 고려한 결과 추가 배분이 총매출 최대화에 유리했습니다.`
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              marginalRevenue <
                averageMarginalRevenue
                ? `한계 매출효율이 전체 매체 평균보다 ${Math.abs(
                  marginalRevenueDifference
                ).toFixed(
                  1
                )}% 낮아 일부 예산을 더 높은 효율의 채널로 이동하는 것이 유리했습니다.`
                : `전체 예산 제약에서 다른 채널의 추가 매출 기여도가 더 높아 상대적으로 감액되었습니다.`
          }

          else {
            reason =
              `현재 예산 수준에서의 한계 매출효율과 다른 채널의 기회비용을 고려할 때 현 수준 유지가 최적이었습니다.`
          }
        }

        else if (
          optimizationObjective ===
          'revenueWithRoas'
        ) {
          if (recommendation === '증액') {
            reason =
              `목표 ROAS 제약을 만족하는 범위에서 한계 매출효율이 전체 매체 평균 대비 ${marginalRevenueDifference >= 0
                ? '+'
                : ''
              }${marginalRevenueDifference.toFixed(
                1
              )}%로 평가되어 추가 배분이 선택되었습니다.`
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              `목표 ROAS를 유지하면서 한계 매출효율이 전체 매체 평균 대비 ${marginalRevenueDifference >= 0
                ? '+'
                : ''
              }${marginalRevenueDifference.toFixed(
                1
              )}%인 예산 구간이 상대적으로 축소되었습니다.`
          }

          else {
            reason =
              `목표 ROAS 제약과 한계 매출효율을 함께 고려했을 때 현재 예산 수준이 최적 균형점으로 계산되었습니다.`
          }
        }

        // -----------------------------------------
        // 2. 목표 ROAS 이상에서 매출 최대화
        // -----------------------------------------

        else if (
          optimizationObjective ===
          'conversions'
        ) {
          if (recommendation === '증액') {
            reason =
              marginalConversions >=
                averageMarginalConversions
                ? `한계 전환효율이 전체 매체 평균보다 ${Math.abs(
                  marginalConversionsDifference
                ).toFixed(
                  1
                )}% 높아 추가 예산이 더 많은 전환을 만드는 채널로 평가되었습니다.`
                : `전체 예산 제약과 매체 간 전환효율을 함께 고려한 결과 추가 배분이 총전환 최대화에 유리했습니다.`
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              marginalConversions <
                averageMarginalConversions
                ? `한계 전환효율이 전체 매체 평균보다 ${Math.abs(
                  marginalConversionsDifference
                ).toFixed(
                  1
                )}% 낮아 더 높은 전환효율의 채널로 예산을 이동하는 것이 유리했습니다.`
                : `전체 전환 최대화를 위해 다른 채널의 추가 전환 기여도가 더 높아 상대적으로 감액되었습니다.`
          }

          else {
            reason =
              `한계 전환효율이 전체 포트폴리오 기준과 유사해 현재 예산 수준을 유지하는 것이 최적이었습니다.`
          }
        }

        // -----------------------------------------
        // 3. 전환 최대화
        // -----------------------------------------

        else if (
          optimizationObjective ===
          'conversions'
        ) {
          if (recommendation === '증액') {
            reason =
              marginalConversions >=
                averageMarginalConversions
                ? `한계 전환효율이 평균보다 높아 추가 예산이 더 많은 전환을 만드는 채널로 평가되었습니다.`
                : `전체 예산 제약을 고려했을 때 추가 배분이 총 전환 증가에 유리했습니다.`
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              marginalConversions <
                averageMarginalConversions
                ? `한계 전환효율이 다른 매체보다 낮아 더 효율적인 전환 채널로 예산이 이동했습니다.`
                : `전체 전환 최대화를 위해 상대적으로 우선순위가 낮은 예산 구간이 축소되었습니다.`
          }

          else {
            reason =
              `현재 예산 수준에서의 한계 전환효율이 포트폴리오 전체 기준과 유사해 유지가 선택되었습니다.`
          }
        }

        // -----------------------------------------
        // 4. 목표 CPA 이하에서 전환 최대화
        // -----------------------------------------

        else if (
          optimizationObjective ===
          'conversionsWithCpa'
        ) {
          if (recommendation === '증액') {
            reason =
              `목표 CPA 제약을 만족하는 범위에서 한계 전환효율이 전체 매체 평균보다 ${Math.abs(
                marginalConversionsDifference
              ).toFixed(
                1
              )}% ${marginalConversionsDifference >= 0
                ? '높아'
                : '낮지만'
              } 추가 배분이 총전환 증가에 유리한 것으로 계산되었습니다.`
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              `목표 CPA를 유지하면서 한계 전환효율이 전체 매체 평균보다 ${Math.abs(
                marginalConversionsDifference
              ).toFixed(
                1
              )}% ${marginalConversionsDifference < 0
                ? '낮아'
                : '높지만'
              } 포트폴리오 전체 기준에서 상대적으로 감액되었습니다.`
          }

          else {
            reason =
              `목표 CPA 제약과 현재 한계 전환효율을 함께 고려했을 때 현재 예산 수준이 적정한 것으로 계산되었습니다.`
          }
        }

        // -----------------------------------------
        // 5. 리스크를 고려한 매출 최대화
        // -----------------------------------------

        else if (
          optimizationObjective ===
          'riskAdjustedRevenue'
        ) {
          const riskPosition =
            riskWeightDifference > 3
              ? 'high'
              : riskWeightDifference < -3
                ? 'low'
                : 'medium'

          if (recommendation === '증액') {
            if (riskPosition === 'high') {
              reason =
                `한계 매출효율이 전체 매체 평균보다 ${Math.abs(
                  marginalRevenueDifference
                ).toFixed(
                  1
                )}% ${marginalRevenueDifference >= 0
                  ? '높지만'
                  : '낮고'
                }, Risk Weight도 평균보다 ${Math.abs(
                  riskWeightDifference
                ).toFixed(
                  1
                )}% 높습니다. 현재 선택한 리스크 한도 안에서 위험 대비 매출 기여도가 인정되어 제한적으로 증액되었습니다.`
            }

            else if (
              riskPosition === 'low'
            ) {
              reason =
                `한계 매출효율이 전체 매체 평균보다 ${Math.abs(
                  marginalRevenueDifference
                ).toFixed(
                  1
                )}% ${marginalRevenueDifference >= 0
                  ? '높고'
                  : '낮지만'
                }, Risk Weight는 평균보다 ${Math.abs(
                  riskWeightDifference
                ).toFixed(
                  1
                )}% 낮아 위험 대비 매출 기여도가 우수한 채널로 평가되었습니다.`
            }

            else {
              reason =
                `한계 매출효율은 전체 매체 평균 대비 ${marginalRevenueDifference >= 0 ? '+' : ''}${marginalRevenueDifference.toFixed(
                  1
                )}%이고 Risk Weight도 평균 수준입니다. 위험 대비 기대 매출 기여도가 양호해 증액되었습니다.`
            }
          }

          else if (
            recommendation === '감액'
          ) {
            if (riskPosition === 'high') {
              reason =
                `Risk Weight가 전체 매체 평균보다 ${Math.abs(
                  riskWeightDifference
                ).toFixed(
                  1
                )}% 높고, 한계 매출효율은 평균 대비 ${marginalRevenueDifference >= 0 ? '+' : ''}${marginalRevenueDifference.toFixed(
                  1
                )}%입니다. 위험 대비 효율을 고려해 예산이 축소되었습니다.`
            }

            else {
              reason =
                `Risk Weight는 평균 대비 ${riskWeightDifference >= 0 ? '+' : ''}${riskWeightDifference.toFixed(
                  1
                )}% 수준이지만, 다른 채널의 위험 대비 한계 매출효율이 더 높아 상대적으로 감액되었습니다.`
            }
          }

          else {
            reason =
              `한계 매출효율은 평균 대비 ${marginalRevenueDifference >= 0 ? '+' : ''}${marginalRevenueDifference.toFixed(
                1
              )}%이고 Risk Weight는 평균 대비 ${riskWeightDifference >= 0 ? '+' : ''}${riskWeightDifference.toFixed(
                1
              )}%로, 현재 예산 수준이 위험과 기대수익의 균형점에 가까웠습니다.`
          }
        }

        // -----------------------------------------
        // fallback
        // -----------------------------------------

        else {
          reason =
            `현재 목적함수와 예산 제약을 종합한 Gurobi 최적해 기준으로 ${recommendation}이 선택되었습니다.`
        }

        result[item.channel] = {
          recommendation,
          reason,

          marginalRevenue,
          marginalConversions,
          riskWeight,
        }
      }
    )

    return result
  }, [
    gurobiPerformanceProjection,
    optimizationObjective,
  ])

  const gurobiScenarioSummary = useMemo(() => {
    if (gurobiPerformanceProjection.length === 0) {
      return null
    }

    const currentBudget =
      gurobiPerformanceProjection.reduce(
        (sum, item) =>
          sum + item.currentPeriodBudget,
        0
      )

    const optimizedBudget =
      gurobiPerformanceProjection.reduce(
        (sum, item) =>
          sum + item.optimizedPeriodBudget,
        0
      )

    const currentRevenue =
      gurobiPerformanceProjection.reduce(
        (sum, item) =>
          sum + item.currentRevenue,
        0
      )

    const projectedRevenue =
      gurobiPerformanceProjection.reduce(
        (sum, item) =>
          sum + item.projectedPeriodRevenue,
        0
      )

    const projectedConversions =
      gurobiPerformanceProjection.reduce(
        (sum, item) =>
          sum + item.projectedPeriodConversions,
        0
      )

    const projectedCpa =
      projectedConversions > 0
        ? optimizedBudget / projectedConversions
        : 0

    const currentRoas =
      currentBudget > 0
        ? (currentRevenue / currentBudget) * 100
        : 0

    const projectedRoas =
      optimizedBudget > 0
        ? (projectedRevenue / optimizedBudget) * 100
        : 0

    const revenueChange =
      projectedRevenue - currentRevenue

    const revenueChangeRate =
      currentRevenue > 0
        ? (revenueChange / currentRevenue) * 100
        : null

    const roasChange =
      projectedRoas - currentRoas

    return {
      currentBudget,
      optimizedBudget,
      currentRevenue,
      projectedRevenue,
      projectedConversions,
      currentRoas,
      projectedRoas,
      projectedCpa,
      revenueChange,
      revenueChangeRate,
      roasChange,
    }
  }, [gurobiPerformanceProjection])

  const riskDiagnosticsSummary = useMemo(() => {
    if (
      optimizationObjective !== 'riskAdjustedRevenue' ||
      !optimizationApiResult?.riskDiagnostics
    ) {
      return null
    }

    const diagnostics =
      optimizationApiResult.riskDiagnostics

    const minimumRisk =
      Number(diagnostics.minimumRisk) || 0

    const revenueOptimalRisk =
      Number(diagnostics.revenueOptimalRisk) || 0

    const dynamicRiskLimit =
      Number(diagnostics.dynamicRiskLimit) || 0

    const realizedRisk =
      Number(diagnostics.realizedRisk) || 0

    const bestRevenueObjective =
      Number(
        diagnostics.bestRevenueObjective
      ) || 0

    return {
      riskLevel:
        diagnostics.riskLevel || riskLevel,

      minimumRisk,

      revenueOptimalRisk,

      dynamicRiskLimit,

      realizedRisk,

      bestRevenueObjective,

      minimumRiskPercent:
        minimumRisk * 100,

      revenueOptimalRiskPercent:
        revenueOptimalRisk * 100,

      dynamicRiskLimitPercent:
        dynamicRiskLimit * 100,

      realizedRiskPercent:
        realizedRisk * 100,

      riskUtilization:
        dynamicRiskLimit > 0
          ? (
            realizedRisk /
            dynamicRiskLimit
          ) * 100
          : 0,
    }
  }, [
    optimizationApiResult,
    optimizationObjective,
    riskLevel,
  ])

  const channelRiskContribution = useMemo(() => {
    if (
      optimizationObjective !== 'riskAdjustedRevenue' ||
      gurobiPerformanceProjection.length === 0
    ) {
      return []
    }

    const channelCount =
      Math.max(
        gurobiPerformanceProjection.length,
        1
      )

    return gurobiPerformanceProjection.map(
      (item) => {
        const currentBudget =
          Number(item.currentPeriodBudget) || 0

        const optimizedBudget =
          Number(item.optimizedPeriodBudget) || 0

        const absoluteChange =
          Math.abs(
            optimizedBudget - currentBudget
          )

        const relativeChange =
          currentBudget > 0
            ? absoluteChange / currentBudget
            : 0

        const riskMetric =
          channelRiskMetrics.find(
            (metric) =>
              metric.channel === item.channel
          )

        const riskWeight =
          Number(
            riskMetric?.riskWeight
          ) || 1

        const volatility =
          Number(
            riskMetric?.volatility
          ) || 0

        const weightedRiskContribution =
          (
            riskWeight *
            relativeChange
          ) / channelCount

        return {
          channel:
            item.channel,

          currentBudget,

          optimizedBudget,

          absoluteChange,

          relativeChange,

          volatility,

          riskWeight,

          weightedRiskContribution,
        }
      }
    )
  }, [
    optimizationObjective,
    gurobiPerformanceProjection,
    channelRiskMetrics,
  ])

  const riskInterpretation = useMemo(() => {
    if (
      !riskDiagnosticsSummary ||
      channelRiskContribution.length === 0
    ) {
      return null
    }

    const sortedByContribution = [
      ...channelRiskContribution,
    ].sort(
      (a, b) =>
        b.weightedRiskContribution -
        a.weightedRiskContribution
    )

    const highestRiskChannel =
      sortedByContribution[0]

    const lowestRiskChannel =
      sortedByContribution[
      sortedByContribution.length - 1
      ]

    const mostChangedChannel = [
      ...channelRiskContribution,
    ].sort(
      (a, b) =>
        b.relativeChange -
        a.relativeChange
    )[0]

    const riskGap =
      riskDiagnosticsSummary
        .revenueOptimalRiskPercent -
      riskDiagnosticsSummary
        .realizedRiskPercent

    const riskLevelText =
      riskDiagnosticsSummary.riskLevel === 'low'
        ? '낮은'
        : riskDiagnosticsSummary.riskLevel === 'high'
          ? '높은'
          : '중간'

    let opportunityText = ''

    if (riskGap > 0.2) {
      opportunityText =
        `현재는 최대매출 기준 리스크보다 ` +
        `${riskGap.toFixed(2)}%p 낮게 운용되고 있어, ` +
        `리스크를 더 허용하면 추가 매출 여지가 있을 수 있습니다.`
    } else {
      opportunityText =
        '현재 리스크 수준은 최대매출을 달성하는 데 필요한 수준에 가깝습니다.'
    }

    return {
      title:
        `${riskLevelText} 리스크 수준에서 예산을 최적화했습니다.`,

      summary:
        `전체 실제 리스크는 ` +
        `${riskDiagnosticsSummary.realizedRiskPercent.toFixed(2)}%이며, ` +
        `선택된 허용 리스크 ` +
        `${riskDiagnosticsSummary.dynamicRiskLimitPercent.toFixed(2)}% 이내입니다.`,

      highestRisk:
        `${highestRiskChannel.channel}이 전체 리스크에 가장 크게 기여하고 있습니다. ` +
        `예산 변화율은 ` +
        `${(highestRiskChannel.relativeChange * 100).toFixed(1)}%, ` +
        `성과 변동성은 ` +
        `${(highestRiskChannel.volatility * 100).toFixed(2)}%입니다.`,

      mostChanged:
        `${mostChangedChannel.channel}의 예산 변화폭이 가장 큽니다. ` +
        `현재 예산 대비 ` +
        `${(mostChangedChannel.relativeChange * 100).toFixed(1)}% 조정되었습니다.`,

      stableChannel:
        `${lowestRiskChannel.channel}은 현재 배분에서 상대적으로 낮은 리스크 기여도를 보이고 있습니다.`,

      opportunity:
        opportunityText,
    }
  }, [
    riskDiagnosticsSummary,
    channelRiskContribution,
  ])

  const riskRecommendations = useMemo(() => {
    if (
      !riskDiagnosticsSummary ||
      channelRiskContribution.length === 0
    ) {
      return []
    }

    const recommendations = []

    const sortedByRiskContribution = [
      ...channelRiskContribution,
    ].sort(
      (a, b) =>
        b.weightedRiskContribution -
        a.weightedRiskContribution
    )

    const sortedByVolatility = [
      ...channelRiskContribution,
    ].sort(
      (a, b) =>
        b.volatility -
        a.volatility
    )

    const sortedByChange = [
      ...channelRiskContribution,
    ].sort(
      (a, b) =>
        b.relativeChange -
        a.relativeChange
    )

    const highestRiskChannel =
      sortedByRiskContribution[0]

    const highestVolatilityChannel =
      sortedByVolatility[0]

    const mostChangedChannel =
      sortedByChange[0]

    const riskGap =
      riskDiagnosticsSummary
        .revenueOptimalRiskPercent -
      riskDiagnosticsSummary
        .realizedRiskPercent

    if (
      highestVolatilityChannel &&
      highestVolatilityChannel.volatility > 0.05
    ) {
      recommendations.push({
        type: 'warning',

        title:
          `${highestVolatilityChannel.channel} 성과 변동성 주의`,

        description:
          `${highestVolatilityChannel.channel}의 성과 변동성이 ` +
          `${(
            highestVolatilityChannel.volatility *
            100
          ).toFixed(2)}%로 상대적으로 높습니다. ` +
          `추가 증액 시 단계적인 예산 조정을 권장합니다.`,
      })
    }

    if (
      mostChangedChannel &&
      mostChangedChannel.relativeChange > 0.10
    ) {
      recommendations.push({
        type: 'change',

        title:
          `${mostChangedChannel.channel} 예산 변화폭 확인`,

        description:
          `${mostChangedChannel.channel}의 최적 예산은 현재 대비 ` +
          `${(
            mostChangedChannel.relativeChange *
            100
          ).toFixed(1)}% 변동합니다. ` +
          `실제 집행 시 한 번에 변경하기보다 단계적 적용을 고려하세요.`,
      })
    }

    if (
      highestRiskChannel &&
      highestRiskChannel.weightedRiskContribution > 0
    ) {
      recommendations.push({
        type: 'risk',

        title:
          `${highestRiskChannel.channel} 리스크 기여도 관리`,

        description:
          `${highestRiskChannel.channel}이 현재 최적화 결과에서 ` +
          `가장 큰 리스크 기여도를 보이고 있습니다. ` +
          `성과 추이를 우선 모니터링하는 것이 좋습니다.`,
      })
    }

    if (riskGap > 0.15) {
      recommendations.push({
        type: 'opportunity',

        title:
          '추가 매출 탐색 가능',

        description:
          `현재 실제 리스크는 최대매출 기준보다 ` +
          `${riskGap.toFixed(2)}%p 낮습니다. ` +
          `리스크 수준을 한 단계 높여 추가 매출 효과를 비교할 수 있습니다.`,
      })
    }

    if (
      riskDiagnosticsSummary.realizedRiskPercent <=
      riskDiagnosticsSummary.minimumRiskPercent + 0.15
    ) {
      recommendations.push({
        type: 'stable',

        title:
          '보수적 배분 상태',

        description:
          '현재 배분은 목표 예산을 달성하기 위한 최소 리스크 수준에 매우 가깝습니다. ' +
          '안정성을 우선하는 경우 적합한 시나리오입니다.',
      })
    }

    return recommendations
  }, [
    riskDiagnosticsSummary,
    channelRiskContribution,
  ])

  const calculateScenarioPerformance = (
    solution
  ) => {
    let totalDailyBudget = 0
    let totalDailyRevenue = 0
    let totalDailyConversions = 0

    solution.forEach((solutionItem) => {
      const channelData =
        monotoneResponseSegments.find(
          (item) =>
            item.channel ===
            solutionItem.channel
        )

      if (!channelData) {
        return
      }

      const segment =
        channelData.segments.find(
          (item) =>
            item.segmentIndex ===
            solutionItem.segmentIndex
        )

      if (!segment) {
        return
      }

      const allocatedBudget =
        Number(solutionItem.value) || 0

      totalDailyBudget +=
        allocatedBudget

      totalDailyRevenue +=
        allocatedBudget *
        (
          Number(
            segment.marginalRevenue
          ) || 0
        )

      totalDailyConversions +=
        allocatedBudget *
        (
          Number(
            segment.marginalConversions
          ) || 0
        )
    })

    const totalPeriodBudget =
      totalDailyBudget *
      optimizationPeriodDays

    const totalPeriodRevenue =
      totalDailyRevenue *
      optimizationPeriodDays

    const totalPeriodConversions =
      totalDailyConversions *
      optimizationPeriodDays

    return {
      totalBudget:
        totalPeriodBudget,

      totalRevenue:
        totalPeriodRevenue,

      totalConversions:
        totalPeriodConversions,

      roas:
        totalPeriodBudget > 0
          ? totalPeriodRevenue /
          totalPeriodBudget
          : 0,

      cpa:
        totalPeriodConversions > 0
          ? totalPeriodBudget /
          totalPeriodConversions
          : 0,
    }
  }
  const riskScenarioComparisonRows =
    useMemo(() => {
      if (!riskScenarioComparison) {
        return []
      }

      const levels = [
        {
          key: 'low',
          label: '낮음',
        },
        {
          key: 'medium',
          label: '보통',
        },
        {
          key: 'high',
          label: '높음',
        },
      ]

      return levels.map(
        ({ key, label }) => {
          const result =
            riskScenarioComparison[key]

          if (
            !result ||
            result.status !== 'optimal'
          ) {
            return {
              key,
              label,
              status:
                result?.status || 'error',
            }
          }

          const grouped = {}

          result.solution.forEach(
            (item) => {
              if (!grouped[item.channel]) {
                grouped[item.channel] = 0
              }

              grouped[item.channel] +=
                Number(item.value) || 0
            }
          )

          const periodAllocations = {}

          Object.entries(grouped).forEach(
            ([channel, dailyBudget]) => {
              periodAllocations[channel] =
                dailyBudget *
                optimizationPeriodDays
            }
          )

          const diagnostics =
            result.riskDiagnostics

          const performance =
            calculateScenarioPerformance(
              result.solution
            )

          return {
            key,
            label,

            status:
              result.status,

            objectiveValue:
              Number(
                diagnostics?.bestRevenueObjective
              ) || 0,

            realizedRisk:
              Number(
                diagnostics?.realizedRisk
              ) || 0,

            dynamicRiskLimit:
              Number(
                diagnostics?.dynamicRiskLimit
              ) || 0,

            allocations:
              periodAllocations,

            totalBudget:
              performance.totalBudget,

            expectedRevenue:
              performance.totalRevenue,

            expectedConversions:
              performance.totalConversions,

            expectedRoas:
              performance.roas,

            expectedCpa:
              performance.cpa,
          }
        }
      )
    }, [
      riskScenarioComparison,
      optimizationPeriodDays,
      monotoneResponseSegments,
    ])

  const recommendedRiskScenario =
    useMemo(() => {
      const validScenarios =
        riskScenarioComparisonRows.filter(
          (scenario) =>
            scenario.status === 'optimal'
        )

      if (validScenarios.length === 0) {
        return null
      }

      // ---------------------------------------------
      // 1. 시나리오별 비교 기준의 최소/최대값 계산
      // ---------------------------------------------

      const revenues =
        validScenarios.map(
          (scenario) =>
            scenario.expectedRevenue
        )

      const roasValues =
        validScenarios.map(
          (scenario) =>
            scenario.expectedRoas
        )

      const cpaValues =
        validScenarios.map(
          (scenario) =>
            scenario.expectedCpa
        )

      const riskValues =
        validScenarios.map(
          (scenario) =>
            scenario.realizedRisk
        )

      const minRevenue =
        Math.min(...revenues)

      const maxRevenue =
        Math.max(...revenues)

      const minRoas =
        Math.min(...roasValues)

      const maxRoas =
        Math.max(...roasValues)

      const minCpa =
        Math.min(...cpaValues)

      const maxCpa =
        Math.max(...cpaValues)

      const minRisk =
        Math.min(...riskValues)

      const maxRisk =
        Math.max(...riskValues)

      // ---------------------------------------------
      // 2. 0 ~ 1 정규화 함수
      // ---------------------------------------------

      const normalizeHigherBetter = (
        value,
        min,
        max
      ) => {
        if (max === min) {
          return 1
        }

        return (
          (value - min) /
          (max - min)
        )
      }

      const normalizeLowerBetter = (
        value,
        min,
        max
      ) => {
        if (max === min) {
          return 1
        }

        return (
          (max - value) /
          (max - min)
        )
      }

      // ---------------------------------------------
      // 3. 시나리오별 추천 점수
      //
      // 매출      40%
      // ROAS      25%
      // CPA       15%
      // Risk      20%
      //
      // 현재는 제품 정책의 초기값.
      // 향후 실제 데이터로 calibration 가능.
      // ---------------------------------------------

      const scoredScenarios =
        validScenarios.map(
          (scenario) => {
            const revenueScore =
              normalizeHigherBetter(
                scenario.expectedRevenue,
                minRevenue,
                maxRevenue
              )

            const roasScore =
              normalizeHigherBetter(
                scenario.expectedRoas,
                minRoas,
                maxRoas
              )

            const cpaScore =
              normalizeLowerBetter(
                scenario.expectedCpa,
                minCpa,
                maxCpa
              )

            const riskScore =
              normalizeLowerBetter(
                scenario.realizedRisk,
                minRisk,
                maxRisk
              )

            const recommendationScore =
              revenueScore * 0.40 +
              roasScore * 0.25 +
              cpaScore * 0.15 +
              riskScore * 0.20

            return {
              ...scenario,

              revenueScore,
              roasScore,
              cpaScore,
              riskScore,

              recommendationScore,
            }
          }
        )

      // ---------------------------------------------
      // 4. 추천 점수가 가장 높은 시나리오 선택
      // ---------------------------------------------

      const sortedScenarios = [
        ...scoredScenarios,
      ].sort(
        (a, b) =>
          b.recommendationScore -
          a.recommendationScore
      )

      return sortedScenarios[0]
    }, [
      riskScenarioComparisonRows,
    ])

  const riskScenarioScoreRows =
    useMemo(() => {
      const validScenarios =
        riskScenarioComparisonRows.filter(
          (scenario) =>
            scenario.status === 'optimal'
        )

      if (validScenarios.length === 0) {
        return []
      }

      const revenues =
        validScenarios.map(
          (scenario) =>
            scenario.expectedRevenue
        )

      const roasValues =
        validScenarios.map(
          (scenario) =>
            scenario.expectedRoas
        )

      const cpaValues =
        validScenarios.map(
          (scenario) =>
            scenario.expectedCpa
        )

      const riskValues =
        validScenarios.map(
          (scenario) =>
            scenario.realizedRisk
        )

      const minRevenue =
        Math.min(...revenues)

      const maxRevenue =
        Math.max(...revenues)

      const minRoas =
        Math.min(...roasValues)

      const maxRoas =
        Math.max(...roasValues)

      const minCpa =
        Math.min(...cpaValues)

      const maxCpa =
        Math.max(...cpaValues)

      const minRisk =
        Math.min(...riskValues)

      const maxRisk =
        Math.max(...riskValues)

      const higherIsBetter = (
        value,
        min,
        max
      ) => {
        if (max === min) {
          return 1
        }

        return (
          (value - min) /
          (max - min)
        )
      }

      const lowerIsBetter = (
        value,
        min,
        max
      ) => {
        if (max === min) {
          return 1
        }

        return (
          (max - value) /
          (max - min)
        )
      }

      return validScenarios.map(
        (scenario) => {
          const revenueScore =
            higherIsBetter(
              scenario.expectedRevenue,
              minRevenue,
              maxRevenue
            )

          const roasScore =
            higherIsBetter(
              scenario.expectedRoas,
              minRoas,
              maxRoas
            )

          const cpaScore =
            lowerIsBetter(
              scenario.expectedCpa,
              minCpa,
              maxCpa
            )

          const riskScore =
            lowerIsBetter(
              scenario.realizedRisk,
              minRisk,
              maxRisk
            )

          const recommendationScore =
            revenueScore * 0.40 +
            roasScore * 0.25 +
            cpaScore * 0.15 +
            riskScore * 0.20

          return {
            ...scenario,

            revenueScore,
            roasScore,
            cpaScore,
            riskScore,

            recommendationScore,
          }
        }
      )
    }, [
      riskScenarioComparisonRows,
    ])

  const riskScenarioRecommendationExplanation =
    useMemo(() => {
      if (
        !recommendedRiskScenario ||
        riskScenarioScoreRows.length === 0
      ) {
        return null
      }

      const recommended =
        riskScenarioScoreRows.find(
          (scenario) =>
            scenario.key ===
            recommendedRiskScenario.key
        )

      if (!recommended) {
        return null
      }

      const bestRevenue =
        Math.max(
          ...riskScenarioScoreRows.map(
            (scenario) =>
              scenario.expectedRevenue
          )
        )

      const bestRoas =
        Math.max(
          ...riskScenarioScoreRows.map(
            (scenario) =>
              scenario.expectedRoas
          )
        )

      const bestCpa =
        Math.min(
          ...riskScenarioScoreRows.map(
            (scenario) =>
              scenario.expectedCpa
          )
        )

      const lowestRisk =
        Math.min(
          ...riskScenarioScoreRows.map(
            (scenario) =>
              scenario.realizedRisk
          )
        )

      const reasons = []
      const cautions = []

      // ---------------------------------------------
      // 성과 측면 추천 이유
      // ---------------------------------------------

      if (
        recommended.expectedRevenue ===
        bestRevenue
      ) {
        reasons.push(
          '세 시나리오 중 예상 매출이 가장 높습니다.'
        )
      }

      if (
        recommended.expectedRoas ===
        bestRoas
      ) {
        reasons.push(
          '예상 ROAS가 가장 높습니다.'
        )
      }

      if (
        recommended.expectedCpa ===
        bestCpa
      ) {
        reasons.push(
          '예상 CPA가 가장 낮습니다.'
        )
      }

      if (
        recommended.realizedRisk ===
        lowestRisk
      ) {
        reasons.push(
          '세 시나리오 중 실제 리스크가 가장 낮습니다.'
        )
      }

      // ---------------------------------------------
      // 리스크 관련 주의사항
      // ---------------------------------------------

      const lowestRiskScenario =
        [...riskScenarioScoreRows].sort(
          (a, b) =>
            a.realizedRisk -
            b.realizedRisk
        )[0]

      if (
        lowestRiskScenario &&
        recommended.key !==
        lowestRiskScenario.key
      ) {
        const additionalRisk =
          recommended.realizedRisk -
          lowestRiskScenario.realizedRisk

        cautions.push(
          `가장 보수적인 시나리오보다 실제 리스크가 ` +
          `${(
            additionalRisk * 100
          ).toFixed(2)}%p 높습니다.`
        )
      }

      // ---------------------------------------------
      // 가장 보수적인 시나리오 대비 성과 개선
      // ---------------------------------------------

      let revenueGainRate = 0

      if (
        lowestRiskScenario &&
        lowestRiskScenario.expectedRevenue > 0
      ) {
        revenueGainRate =
          (
            recommended.expectedRevenue -
            lowestRiskScenario.expectedRevenue
          ) /
          lowestRiskScenario.expectedRevenue
      }

      if (
        lowestRiskScenario &&
        recommended.key !==
        lowestRiskScenario.key &&
        revenueGainRate > 0
      ) {
        reasons.push(
          `가장 보수적인 시나리오 대비 예상 매출이 ` +
          `${(
            revenueGainRate * 100
          ).toFixed(2)}% 증가합니다.`
        )
      }

      // ---------------------------------------------
      // 종합 추천 판단
      // ---------------------------------------------

      const score =
        recommended.recommendationScore *
        100

      let conclusion = ''

      if (recommended.key === 'high') {
        conclusion =
          '성과 개선 효과가 추가 리스크에 대한 패널티보다 크게 평가되어 높은 리스크 시나리오가 추천되었습니다.'
      } else if (
        recommended.key === 'medium'
      ) {
        conclusion =
          '성과 개선과 리스크 관리의 균형이 가장 높게 평가되어 보통 리스크 시나리오가 추천되었습니다.'
      } else {
        conclusion =
          '추가 리스크 대비 성과 개선 효과가 제한적이어서 낮은 리스크 시나리오가 추천되었습니다.'
      }

      return {
        label:
          recommended.label,

        score,

        reasons,
        cautions,
        conclusion,
      }
    }, [
      recommendedRiskScenario,
      riskScenarioScoreRows,
    ])

  const observedBudgetBounds = useMemo(() => {
    return channelResponseObservations.map(
      ({ channel, observations }) => {
        const validObservations =
          observations.filter(
            (item) => item.spend > 0
          )

        if (validObservations.length === 0) {
          return {
            channel,
            minObservedBudget: 0,
            maxObservedBudget: 0,
          }
        }

        const budgets =
          validObservations.map(
            (item) => item.spend
          )

        return {
          channel,

          minObservedBudget:
            Math.min(...budgets),

          maxObservedBudget:
            Math.max(...budgets),
        }
      }
    )
  }, [channelResponseObservations])

  const effectiveBudgetBounds = useMemo(() => {
    return optimizationModelInput.channels.map(
      (channelInput) => {
        const observed =
          observedBudgetBounds.find(
            (item) =>
              item.channel ===
              channelInput.channel
          )

        if (!observed) {
          return {
            channel:
              channelInput.channel,

            minBudget:
              channelInput.minBudget,

            maxBudget:
              channelInput.maxBudget,

            hasObservedRange: false,
          }
        }

        const minBudget =
          Math.max(
            channelInput.minBudget,
            observed.minObservedBudget
          )

        const maxBudget =
          Math.min(
            channelInput.maxBudget,
            observed.maxObservedBudget
          )

        return {
          channel:
            channelInput.channel,

          minBudget,
          maxBudget,

          hasObservedRange:
            maxBudget >= minBudget,

          originalMinBudget:
            channelInput.minBudget,

          originalMaxBudget:
            channelInput.maxBudget,

          minObservedBudget:
            observed.minObservedBudget,

          maxObservedBudget:
            observed.maxObservedBudget,
        }
      }
    )
  }, [
    optimizationModelInput,
    observedBudgetBounds,
  ])

  const optimizationFeasibility = useMemo(() => {
    const channels =
      effectiveBudgetBounds || []

    const totalBudget =
      optimizationModelInput.totalBudget || 0

    const minimumFeasibleBudget =
      channels.reduce(
        (sum, item) =>
          sum + item.minBudget,
        0
      )

    const maximumFeasibleBudget =
      channels.reduce(
        (sum, item) =>
          sum + item.maxBudget,
        0
      )

    // JavaScript 부동소수점 계산 오차 허용
    const budgetTolerance = 0.01

    const hasValidBudgetRange =
      minimumFeasibleBudget <=
      maximumFeasibleBudget +
      budgetTolerance

    const isFeasible =
      hasValidBudgetRange &&
      totalBudget >=
      minimumFeasibleBudget -
      budgetTolerance &&
      totalBudget <=
      maximumFeasibleBudget +
      budgetTolerance

    return {
      isFeasible,
      hasValidBudgetRange,
      totalBudget,
      minimumFeasibleBudget,
      maximumFeasibleBudget,
    }
  }, [
    optimizationModelInput,
    effectiveBudgetBounds,
  ])



  const lpModelDefinition = useMemo(() => {
    const variables = []

    monotoneResponseSegments.forEach(
      ({ channel, segments }) => {
        segments.forEach((segment) => {


          variables.push({
            name:
              `${channel}__segment_${segment.segmentIndex}`,

            channel,

            segmentIndex:
              segment.segmentIndex,

            lowerBound: 0,

            upperBound:
              segment.budgetCapacity,

            objectiveCoefficient:
              optimizationObjective === 'conversions' ||
                optimizationObjective === 'conversionsWithCpa'
                ? segment.marginalConversions
                : segment.marginalRevenue,
          })
        })
      }
    )


    const riskVariables = []

    if (
      optimizationObjective ===
      'riskAdjustedRevenue'
    ) {
      effectiveBudgetBounds.forEach(
        (bound) => {
          const channelInput =
            optimizationModelInput.channels.find(
              (item) =>
                item.channel === bound.channel
            )

          const currentBudget =
            channelInput?.currentBudget || 0

          const maxDownwardDeviation =
            Math.abs(
              currentBudget -
              bound.minBudget
            )

          const maxUpwardDeviation =
            Math.abs(
              bound.maxBudget -
              currentBudget
            )

          const deviationUpperBound =
            Math.max(
              maxDownwardDeviation,
              maxUpwardDeviation
            )

          riskVariables.push({
            name:
              `${bound.channel}__risk_deviation`,

            channel:
              bound.channel,

            segmentIndex: -1,

            lowerBound: 0,

            upperBound:
              deviationUpperBound,

            objectiveCoefficient: 0,
          })
        }
      )
    }
    const allVariables = [
      ...variables,
      ...riskVariables,
    ]

    const channelConstraints =
      effectiveBudgetBounds.map((bound) => {
        const channelVariables =
          variables.filter(
            (variable) =>
              variable.channel === bound.channel
          )



        return {
          channel: bound.channel,

          minBudget:
            bound.minBudget,

          maxBudget:
            bound.maxBudget,

          variableNames:
            channelVariables.map(
              (variable) =>
                variable.name
            ),
        }
      })

    const riskLimit =
      riskLevel === 'low'
        ? 0.05
        : riskLevel === 'high'
          ? 0.30
          : 0.15

    const riskChannelCount =
      Math.max(
        effectiveBudgetBounds.length,
        1
      )

    return {
      objective: 'maximize',

      objectiveMetric:
        optimizationObjective,

      totalBudget:
        optimizationDailyBudget,

      variables: allVariables,

      channelBounds:
        effectiveBudgetBounds.map(
          (item) => ({
            channel: item.channel,
            minBudget: item.minBudget,
            maxBudget: item.maxBudget,
          })
        ),

      constraints: [
        {
          name: 'total_budget',

          type: 'equal',

          rhs:
            optimizationDailyBudget,

          coefficients:
            variables.map(
              (variable) => ({
                variable:
                  variable.name,

                coefficient: 1,
              })
            ),
        },

        ...channelConstraints.map(
          (constraint) => ({
            name:
              `${constraint.channel}__min_budget`,

            type:
              'greaterOrEqual',

            rhs:
              constraint.minBudget,

            coefficients:
              constraint.variableNames.map(
                (variableName) => ({
                  variable:
                    variableName,

                  coefficient: 1,
                })
              ),
          })
        ),

        ...channelConstraints.map(
          (constraint) => ({
            name:
              `${constraint.channel}__max_budget`,

            type:
              'lessOrEqual',

            rhs:
              constraint.maxBudget,

            coefficients:
              constraint.variableNames.map(
                (variableName) => ({
                  variable:
                    variableName,

                  coefficient: 1,
                })
              ),
          })
        ),

        ...(optimizationObjective === 'revenueWithRoas'
          ? [
            {
              name: 'target_roas',

              type: 'greaterOrEqual',

              rhs:
                optimizationDailyBudget *
                (targetRoas / 100),

              coefficients:
                variables.map(
                  (variable) => ({
                    variable:
                      variable.name,

                    coefficient:
                      variable.objectiveCoefficient,
                  })
                ),
            },
          ]
          : []),

        ...(optimizationObjective === 'conversionsWithCpa'
          ? [
            {
              name: 'target_cpa',

              type: 'greaterOrEqual',

              rhs:
                optimizationDailyBudget,

              coefficients:
                variables.map(
                  (variable) => ({
                    variable:
                      variable.name,

                    coefficient:
                      variable.objectiveCoefficient *
                      Number(targetCpa),
                  })
                ),
            },
          ]
          : []),

        ...(optimizationObjective ===
          'riskAdjustedRevenue'
          ? effectiveBudgetBounds.flatMap(
            (bound) => {
              const channelVariableNames =
                variables
                  .filter(
                    (variable) =>
                      variable.channel ===
                      bound.channel
                  )
                  .map(
                    (variable) =>
                      variable.name
                  )

              const currentBudget =
                optimizationModelInput.channels.find(
                  (item) =>
                    item.channel ===
                    bound.channel
                )?.currentBudget || 0

              const riskVariableName =
                `${bound.channel}__risk_deviation`

              return [
                {
                  name:
                    `${bound.channel}__risk_positive`,

                  type:
                    'greaterOrEqual',

                  rhs:
                    -currentBudget,

                  coefficients: [
                    {
                      variable:
                        riskVariableName,
                      coefficient: 1,
                    },

                    ...channelVariableNames.map(
                      (name) => ({
                        variable: name,
                        coefficient: -1,
                      })
                    ),
                  ],
                },

                {
                  name:
                    `${bound.channel}__risk_negative`,

                  type:
                    'greaterOrEqual',

                  rhs:
                    currentBudget,

                  coefficients: [
                    {
                      variable:
                        riskVariableName,
                      coefficient: 1,
                    },

                    ...channelVariableNames.map(
                      (name) => ({
                        variable: name,
                        coefficient: 1,
                      })
                    ),
                  ],
                },
              ]
            }
          )
          : []),


      ],
    }
  }, [
    monotoneResponseSegments,
    optimizationObjective,
    optimizationDailyBudget,
    optimizationModelInput,
    effectiveBudgetBounds,
    targetRoas,
    targetCpa,
    riskLevel,
    channelRiskMetrics,
  ])

  const manualRevisionProjection = useMemo(() => {
    if (
      !selectedTaskProposal ||
      !manualRevisionBudgets ||
      optimizationPeriodDays <= 0
    ) {
      return null
    }

    const allocations =
      (selectedTaskProposal.allocations || []).map(
        (currentAllocation) => {
          const channel =
            currentAllocation.channel

          const editedPeriodBudget =
            Number(
              manualRevisionBudgets[channel]
            ) || 0

          const editedDailyBudget =
            editedPeriodBudget /
            optimizationPeriodDays

          const channelSegments =
            monotoneResponseSegments.find(
              (item) =>
                item.channel === channel
            )

          const orderedSegments =
            [
              ...(channelSegments?.segments || []),
            ].sort(
              (first, second) =>
                Number(first.segmentIndex) -
                Number(second.segmentIndex)
            )

          let remainingBudget =
            editedDailyBudget

          let projectedDailyRevenue = 0
          let projectedDailyConversions = 0

          orderedSegments.forEach(
            (segment) => {
              if (remainingBudget <= 0) {
                return
              }

              const segmentCapacity =
                Number(
                  segment.budgetCapacity
                ) || 0

              const allocatedBudget =
                Math.min(
                  remainingBudget,
                  segmentCapacity
                )

              remainingBudget -=
                allocatedBudget

              projectedDailyRevenue +=
                allocatedBudget *
                (
                  Number(
                    segment.marginalRevenue
                  ) || 0
                )

              projectedDailyConversions +=
                allocatedBudget *
                (
                  Number(
                    segment.marginalConversions
                  ) || 0
                )
            }
          )

          const projectedRevenue =
            projectedDailyRevenue *
            optimizationPeriodDays

          const projectedConversions =
            projectedDailyConversions *
            optimizationPeriodDays

          const projectedRoas =
            editedPeriodBudget > 0
              ? (
                projectedRevenue /
                editedPeriodBudget
              ) * 100
              : 0

          const projectedCpa =
            projectedConversions > 0
              ? editedPeriodBudget /
              projectedConversions
              : null

          const currentBudget =
            Number(
              currentAllocation.currentBudget ??
              currentAllocation.currentPeriodBudget ??
              0
            )

          const budgetChange =
            editedPeriodBudget -
            currentBudget

          const budgetChangeRate =
            currentBudget > 0
              ? (
                budgetChange /
                currentBudget
              ) * 100
              : null

          return {
            ...currentAllocation,

            optimizedBudget:
              editedPeriodBudget,

            budgetChange,
            budgetChangeRate,

            projectedRevenue,
            projectedConversions,
            projectedRoas,
            projectedCpa,
          }
        }
      )

    const totalBudget =
      allocations.reduce(
        (sum, allocation) =>
          sum +
          Number(
            allocation.optimizedBudget || 0
          ),
        0
      )

    const projectedRevenue =
      allocations.reduce(
        (sum, allocation) =>
          sum +
          Number(
            allocation.projectedRevenue || 0
          ),
        0
      )

    const projectedConversions =
      allocations.reduce(
        (sum, allocation) =>
          sum +
          Number(
            allocation.projectedConversions || 0
          ),
        0
      )

    const projectedRoas =
      totalBudget > 0
        ? (
          projectedRevenue /
          totalBudget
        ) * 100
        : 0

    const projectedCpa =
      projectedConversions > 0
        ? totalBudget /
        projectedConversions
        : null

    return {
      totalBudget,

      allocations,

      summary: {
        projectedRevenue,
        projectedRoas,
        projectedCpa,
      },
    }
  }, [
    selectedTaskProposal,
    manualRevisionBudgets,
    optimizationPeriodDays,
    monotoneResponseSegments,
  ])

  const lpModelValidation = useMemo(() => {
    const errors = []
    const warnings = []

    const variables =
      lpModelDefinition.variables || []

    const constraints =
      lpModelDefinition.constraints || []

    if (variables.length === 0) {
      errors.push(
        '최적화 변수가 없습니다.'
      )
    }

    if (constraints.length === 0) {
      errors.push(
        '최적화 제약조건이 없습니다.'
      )
    }

    const invalidVariables =
      variables.filter(
        (variable) =>
          !Number.isFinite(
            variable.lowerBound
          ) ||
          !Number.isFinite(
            variable.upperBound
          ) ||
          !Number.isFinite(
            variable.objectiveCoefficient
          )
      )

    if (invalidVariables.length > 0) {
      errors.push(
        '유효하지 않은 LP 변수가 있습니다.'
      )
    }

    const invalidBounds =
      variables.filter(
        (variable) =>
          variable.lowerBound >
          variable.upperBound
      )

    if (invalidBounds.length > 0) {
      errors.push(
        '하한이 상한보다 큰 변수가 있습니다.'
      )
    }

    const totalSegmentCapacity =
      variables.reduce(
        (sum, variable) =>
          sum + variable.upperBound,
        0
      )

    const requiredBudget =
      Number(
        lpModelDefinition.totalBudget
      ) || 0



    const segmentCapacityTolerance = 0.01

    if (
      requiredBudget >
      totalSegmentCapacity +
      segmentCapacityTolerance
    ) {
      errors.push(
        '반응곡선의 전체 예산 구간 용량이 입력 예산보다 작습니다.'
      )
    }

    if (
      requiredBudget <= 0
    ) {
      warnings.push(
        '최적화 총예산이 입력되지 않았습니다.'
      )
    }

    const channelChecks =
      effectiveBudgetBounds.map(
        (bound) => {
          const channelVariables =
            variables.filter(
              (variable) =>
                variable.channel ===
                bound.channel
            )

          const capacity =
            channelVariables.reduce(
              (sum, variable) =>
                sum +
                variable.upperBound,
              0
            )

          return {
            channel: bound.channel,
            minBudget: bound.minBudget,
            maxBudget: bound.maxBudget,
            segmentCapacity: capacity,
            valid:
              capacity >= bound.minBudget,
          }
        }
      )

    channelChecks.forEach((check) => {
      if (!check.valid) {
        errors.push(
          `${check.channel}의 반응곡선 범위가 최소 예산 제약을 충족하지 못합니다.`
        )
      }

      if (
        check.segmentCapacity <
        check.maxBudget
      ) {
        warnings.push(
          `${check.channel}은 관측된 예산 범위 때문에 최대 허용 예산까지 사용할 수 없습니다.`
        )
      }
    })

    return {
      isValid:
        errors.length === 0,

      errors,
      warnings,

      variableCount:
        variables.length,

      constraintCount:
        constraints.length,

      totalSegmentCapacity,

      channelChecks,
    }
  }, [
    lpModelDefinition,
    effectiveBudgetBounds,
  ])

  const solverModelPayload = useMemo(() => {
    if (!lpModelValidation.isValid) {
      return null
    }

    const variables =
      lpModelDefinition.variables.map(
        (variable) => ({
          name: variable.name,

          channel: variable.channel,

          segmentIndex:
            variable.segmentIndex,

          lb:
            variable.lowerBound,

          ub:
            variable.upperBound,

          objectiveCoefficient:
            variable.objectiveCoefficient,
        })
      )

    const constraints =
      lpModelDefinition.constraints.map(
        (constraint) => ({
          name:
            constraint.name,

          sense:
            constraint.type,

          rhs:
            constraint.rhs,

          coefficients:
            constraint.coefficients,
        })
      )

    return {
      advertiserId:
        selectedAdvertiserId,

      modelName:
        'ad_budget_optimization',

      modelType:
        'LP',

      objective: {
        sense: 'maximize',

        metric:
          lpModelDefinition.objectiveMetric,
      },

      riskLevel:
        optimizationObjective ===
          'riskAdjustedRevenue'
          ? riskLevel
          : null,

      budget: {
        daily:
          lpModelDefinition.totalBudget,

        periodDays:
          optimizationPeriodDays,

        total:
          lpModelDefinition.totalBudget *
          optimizationPeriodDays,
      },

      channelBudgets:
        optimizationModelInput.channels.map(
          (item) => ({
            channel: item.channel,
            currentBudget: item.currentBudget,
          })
        ),


      channelRiskMetrics:
        channelRiskMetrics.map(
          (item) => ({
            channel: item.channel,
            riskWeight: item.riskWeight,
            volatility: item.volatility,
          })
        ),

      variables,

      constraints,

      metadata: {
        variableCount:
          variables.length,

        constraintCount:
          constraints.length,

        generatedAt:
          new Date().toISOString(),
      },
    }
  }, [
    lpModelDefinition,
    lpModelValidation,
    optimizationPeriodDays,
    riskLevel,
    optimizationObjective,
    optimizationModelInput,
    channelRiskMetrics,
  ])

  async function runNaverOptimizationPreview() {
    if (!selectedAdvertiserId) {
      setNaverPreviewError(
        '광고주를 먼저 선택해 주세요.'
      )

      return
    }

    try {
      setNaverPreviewLoading(
        true
      )

      setNaverPreviewError(
        ''
      )

      setNaverPreviewResult(
        null
      )

      // =========================================
      // MOCK DATA
      //
      // Budget Scaling API에 multiplier=1.0만
      // 전달하여 현재 예산 기준 Campaign Preview 실행
      // =========================================

      if (
        performanceDataSource ===
        'mock'
      ) {
        const mockInput =
          mockCampaignOptimizationInput

        if (!mockInput) {
          setNaverPreviewError(
            '현재 필터 조건에 해당하는 Mock 데이터가 없습니다.'
          )

          return
        }

        const response =
          await operatorFetch(
            `${API_BASE_URL}/optimization/campaign-budget-scaling-preview`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                advertiserId:
                  selectedAdvertiserId,

                dataSource:
                  'mock',

                maxBudgetChangePct:
                  Math.max(
                    0,
                    Math.min(
                      30,
                      Number(
                        budgetChangeLimit
                      ) || 0
                    )
                  ) / 100,

                // 현재 예산만 분석
                budgetMultipliers: [
                  1.0,
                ],

                performanceRecords:
                  mockInput
                    .performanceRecords ||
                  [],

                currentBudgets:
                  mockInput
                    .currentBudgets ||
                  {},

                budgetBounds:
                  mockInput
                    .budgetBounds ||
                  {},

                mockTotalDailyBudget:
                  mockInput
                    .totalDailyBudget ||
                  null,

                revenueValidStartDate:
                  mockInput
                    .revenueValidStartDate ||
                  null,

                filters: {
                  brand:
                    globalBrand,

                  channel:
                    globalChannel,

                  campaign:
                    globalCampaign,

                  product:
                    globalProduct,

                  startDate,
                  endDate,
                },
              }),
            }
          )

        if (!response) {
          return
        }

        const scalingResult =
          await response.json()

        if (!response.ok) {
          throw new Error(
            scalingResult?.detail ||
            scalingResult?.message ||
            `HTTP ${response.status}`
          )
        }

        if (
          scalingResult.status ===
          'blocked'
        ) {
          setNaverPreviewResult(
            scalingResult
          )

          return
        }

        const scenario =
          Array.isArray(
            scalingResult.scenarios
          )
            ? (
              scalingResult.scenarios.find(
                (item) =>
                  Math.abs(
                    Number(
                      item.multiplier
                    ) -
                    1
                  ) <
                  0.000001
              ) ||
              scalingResult
                .scenarios[0]
            )
            : null

        if (!scenario) {
          throw new Error(
            'Mock 현재 예산 시나리오 결과가 없습니다.'
          )
        }

        if (
          scenario.status ===
          'error'
        ) {
          throw new Error(
            scenario.message ||
            'Mock 최적화 Preview 실행에 실패했습니다.'
          )
        }

        const previewResult =
          scenario.result ||
          {}

        // -----------------------------------------
        // Mock Safety Gate 표시용 값 정규화
        // -----------------------------------------

        if (
          previewResult.status ===
          'blocked'
        ) {
          const validDays =
            Number(
              previewResult
                .validRevenueDays ??
              mockInput
                .validTotalDays ??
              0
            )

          const minimumDays =
            Number(
              previewResult
                .minimumValidTotalDays ??
              previewResult
                .historyClassification
                ?.minimumRequiredDays ??
              70
            )

          const remainingDays =
            Math.max(
              0,
              minimumDays -
              validDays
            )

          const readinessPct =
            minimumDays > 0
              ? Math.min(
                100,
                (
                  validDays /
                  minimumDays
                ) * 100
              )
              : 0

          setNaverPreviewResult({
            ...previewResult,

            dataSource:
              'mock',

            revenueValidStartDate:
              previewResult
                .revenueValidStartDate ||
              mockInput
                .revenueValidStartDate ||
              null,

            validRevenueDays:
              validDays,

            minimumValidTotalDays:
              minimumDays,

            remainingValidDays:
              remainingDays,

            readinessPct,
          })

          console.warn(
            'MOCK OPTIMIZATION PREVIEW BLOCKED',
            previewResult
          )

          return
        }

        if (
          previewResult.status !==
          'ok'
        ) {
          throw new Error(
            previewResult.message ||
            previewResult.blockCode ||
            'Mock 최적화 Preview 요청에 실패했습니다.'
          )
        }

        setNaverPreviewResult({
          ...previewResult,

          dataSource:
            'mock',

          revenueValidStartDate:
            previewResult
              .revenueValidStartDate ||
            mockInput
              .revenueValidStartDate ||
            null,

          validRevenueDays:
            Number(
              mockInput
                .validTotalDays
            ) || 0,

          minimumValidTotalDays:
            70,

          remainingValidDays:
            Math.max(
              0,
              70 -
              (
                Number(
                  mockInput
                    .validTotalDays
                ) || 0
              )
            ),

          readinessPct:
            Math.min(
              100,
              (
                (
                  Number(
                    mockInput
                      .validTotalDays
                  ) || 0
                ) /
                70
              ) *
              100
            ),
        })

        console.log(
          'MOCK OPTIMIZATION PREVIEW',
          previewResult
        )

        return
      }

      // =========================================
      // NAVER REAL DATA
      //
      // 기존 실제 Naver 경로는 그대로 유지
      // =========================================

      const response =
        await operatorFetch(
          `${API_BASE_URL}/optimization/naver/preview`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              advertiserId:
                selectedAdvertiserId,

              accountId:
                null,

              maxBudgetChangePct:
                Number(
                  budgetChangeLimit
                ) / 100,
            }),
          }
        )

      if (!response) {
        return
      }

      const result =
        await response.json()

      if (!response.ok) {
        throw new Error(
          result?.detail ||
          result?.message ||
          `HTTP ${response.status}`
        )
      }

      if (
        result.status ===
        'blocked'
      ) {
        setNaverPreviewResult(
          result
        )

        setNaverPreviewError(
          ''
        )

        console.warn(
          'NAVER OPTIMIZATION PREVIEW BLOCKED',
          result
        )

        return
      }

      if (
        result.status !==
        'ok'
      ) {
        throw new Error(
          result.message ||
          result.blockCode ||
          '최적화 Preview 요청에 실패했습니다.'
        )
      }

      setNaverPreviewResult(
        result
      )

      console.log(
        'NAVER OPTIMIZATION PREVIEW',
        result
      )

      console.table(
        result
          ?.slopeDiagnostics
          ?.summary ||
        []
      )

      console.table(
        result
          ?.slopeDiagnostics
          ?.refits ||
        []
      )

    } catch (error) {
      console.error(
        'OPTIMIZATION PREVIEW ERROR',
        error
      )

      setNaverPreviewError(
        error.message ||
        '최적화 Preview 요청 중 오류가 발생했습니다.'
      )

    } finally {
      setNaverPreviewLoading(
        false
      )
    }
  }

  async function loadCampaignBudgetPolicies() {
    if (!selectedAdvertiserId) {
      setCampaignBudgetPolicies([])
      setCampaignBudgetPolicyDrafts({})

      setCampaignBudgetPolicyMeta({
        campaignCount: 0,
        optimizationEligibleCount: 0,
        excludedCampaignCount: 0,
        policyReadyCount: 0,
        missingPolicyCount: 0,
        currentTotalDailyBudget: 0,
        optimizationCurrentTotalDailyBudget: 0,
      })

      return
    }

    try {
      setCampaignBudgetPolicyLoading(true)
      setCampaignBudgetPolicyError('')

      const response =
        await operatorFetch(
          `${API_BASE_URL}/optimization/campaign-budget-policies?advertiserId=${encodeURIComponent(
            selectedAdvertiserId
          )}`,
          {
            method: 'GET',
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        const errorText =
          await response.text()

        console.error(
          'CAMPAIGN BUDGET POLICY ERROR',
          errorText
        )

        throw new Error(
          `Campaign Budget Policy API 오류: ${response.status}`
        )
      }

      const result =
        await response.json()

      if (result.status !== 'ok') {
        throw new Error(
          result.message ||
          '캠페인 예산 정책을 불러오지 못했습니다.'
        )
      }

      const policies =
        Array.isArray(result.policies)
          ? result.policies
          : []

      setCampaignBudgetPolicies(
        policies
      )

      const drafts = {}

      policies.forEach(
        (policy) => {
          drafts[
            policy.campaignId
          ] = {
            minDailyBudget:
              policy.minDailyBudget ??
              '',

            maxDailyBudget:
              policy.maxDailyBudget ??
              '',
          }
        }
      )

      setCampaignBudgetPolicyDrafts(
        drafts
      )

      setCampaignBudgetPolicyMeta({
        campaignCount:
          Number(
            result.campaignCount
          ) || 0,

        optimizationEligibleCount:
          Number(
            result.optimizationEligibleCount
          ) || 0,

        excludedCampaignCount:
          Number(
            result.excludedCampaignCount
          ) || 0,

        policyReadyCount:
          Number(
            result.policyReadyCount
          ) || 0,

        missingPolicyCount:
          Number(
            result.missingPolicyCount
          ) || 0,

        currentTotalDailyBudget:
          Number(
            result.currentTotalDailyBudget
          ) || 0,

        optimizationCurrentTotalDailyBudget:
          Number(
            result.optimizationCurrentTotalDailyBudget
          ) || 0,
      })

    } catch (error) {
      console.error(
        'FAILED TO LOAD CAMPAIGN BUDGET POLICIES',
        error
      )

      setCampaignBudgetPolicyError(
        error.message ||
        '캠페인 예산 정책 조회 중 오류가 발생했습니다.'
      )

    } finally {
      setCampaignBudgetPolicyLoading(false)
    }
  }



  useEffect(() => {
    if (
      !selectedAdvertiserId ||
      performanceDataSource !== 'naver'
    ) {
      return
    }

    loadCampaignBudgetPolicies()
  }, [
    selectedAdvertiserId,
    performanceDataSource,
  ])

  useEffect(() => {
    setBudgetScalingResult(null)
    setBudgetScalingError('')
  }, [
    selectedAdvertiserId,
  ])

  useEffect(() => {
    setBudgetScalingResult(
      null
    )

    setBudgetScalingError(
      ''
    )

    setNaverPreviewResult(
      null
    )

    setNaverPreviewError(
      ''
    )

    setOptimizationApiResult(
      null
    )

    setOptimizationApiError(
      ''
    )

    setRiskScenarioComparison(
      null
    )
  }, [
    performanceDataSource,
    startDate,
    endDate,
    globalBrand,
    globalChannel,
    globalCampaign,
    globalProduct,
  ])

  function applyBulkCampaignBudgetPolicy() {
    const minPct =
      Number(
        campaignBudgetBulkMinPct
      )

    const maxPct =
      Number(
        campaignBudgetBulkMaxPct
      )

    if (
      !Number.isFinite(minPct) ||
      !Number.isFinite(maxPct)
    ) {
      setCampaignBudgetPolicyError(
        '최소·최대 예산 비율을 모두 입력해주세요.'
      )

      return
    }

    if (
      minPct < 0 ||
      minPct > 100
    ) {
      setCampaignBudgetPolicyError(
        '최소 예산 비율은 0% 이상 100% 이하여야 합니다.'
      )

      return
    }

    if (
      maxPct < 100
    ) {
      setCampaignBudgetPolicyError(
        '최대 예산 비율은 100% 이상이어야 합니다.'
      )

      return
    }

    const nextDrafts = {}

    campaignBudgetPolicies.forEach(
      (policy) => {
        if (
          !policy.optimizationEligible
        ) {
          return
        }
        const currentBudget =
          Number(
            policy.currentDailyBudget
          )

        if (
          !Number.isFinite(
            currentBudget
          )
        ) {
          return
        }

        nextDrafts[
          policy.campaignId
        ] = {
          minDailyBudget:
            Math.round(
              currentBudget *
              minPct /
              100
            ),

          maxDailyBudget:
            Math.round(
              currentBudget *
              maxPct /
              100
            ),
        }
      }
    )

    setCampaignBudgetPolicyDrafts(
      (current) => ({
        ...current,
        ...nextDrafts,
      })
    )

    setCampaignBudgetPolicyError(
      ''
    )
  }

  async function saveCampaignBudgetPolicies() {
    if (!selectedAdvertiserId) {
      setCampaignBudgetPolicyError(
        '광고주를 먼저 선택해주세요.'
      )

      return
    }

    const policiesToSave = []

    for (
      const policy
      of campaignBudgetPolicies
    ) {
      if (
        !policy.optimizationEligible
      ) {
        continue
      }
      const draft =
        campaignBudgetPolicyDrafts[
        policy.campaignId
        ] || {}

      const minRaw =
        draft.minDailyBudget

      const maxRaw =
        draft.maxDailyBudget

      const minEmpty =
        minRaw === '' ||
        minRaw === null ||
        minRaw === undefined

      const maxEmpty =
        maxRaw === '' ||
        maxRaw === null ||
        maxRaw === undefined

      // 둘 다 비어 있으면
      // 아직 정책을 설정하지 않은 캠페인.
      // 저장 대상에서 제외한다.
      if (
        minEmpty &&
        maxEmpty
      ) {
        continue
      }

      // 한쪽만 입력된 상태는 허용하지 않는다.
      if (
        minEmpty ||
        maxEmpty
      ) {
        setCampaignBudgetPolicyError(
          `${policy.campaignName ||
          policy.campaignId
          }: 최소 예산과 최대 예산을 모두 입력해주세요.`
        )

        return
      }

      const minDailyBudget =
        Number(minRaw)

      const maxDailyBudget =
        Number(maxRaw)

      const currentDailyBudget =
        Number(
          policy.currentDailyBudget
        )

      if (
        !Number.isFinite(
          minDailyBudget
        ) ||
        !Number.isFinite(
          maxDailyBudget
        )
      ) {
        setCampaignBudgetPolicyError(
          `${policy.campaignName ||
          policy.campaignId
          }: 예산은 숫자로 입력해주세요.`
        )

        return
      }

      if (
        minDailyBudget < 0
      ) {
        setCampaignBudgetPolicyError(
          `${policy.campaignName ||
          policy.campaignId
          }: 최소 예산은 0원 이상이어야 합니다.`
        )

        return
      }

      if (
        maxDailyBudget <
        minDailyBudget
      ) {
        setCampaignBudgetPolicyError(
          `${policy.campaignName ||
          policy.campaignId
          }: 최대 예산은 최소 예산보다 작을 수 없습니다.`
        )

        return
      }

      if (
        Number.isFinite(
          currentDailyBudget
        ) &&
        !(
          minDailyBudget <=
          currentDailyBudget &&
          currentDailyBudget <=
          maxDailyBudget
        )
      ) {
        setCampaignBudgetPolicyError(
          `${policy.campaignName ||
          policy.campaignId
          }: 현재 예산이 최소·최대 예산 범위 안에 있어야 합니다.`
        )

        return
      }

      policiesToSave.push({
        campaignId:
          policy.campaignId,

        minDailyBudget,
        maxDailyBudget,
      })
    }

    if (
      policiesToSave.length === 0
    ) {
      setCampaignBudgetPolicyError(
        '저장할 Budget Policy를 입력해주세요.'
      )

      return
    }

    try {
      setCampaignBudgetPolicySaving(
        true
      )

      setCampaignBudgetPolicyError(
        ''
      )

      const response =
        await operatorFetch(
          `${API_BASE_URL}/optimization/campaign-budget-policies`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              advertiserId:
                selectedAdvertiserId,

              policies:
                policiesToSave,
            }),
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        const errorText =
          await response.text()

        console.error(
          'CAMPAIGN BUDGET POLICY SAVE ERROR',
          errorText
        )

        throw new Error(
          `Campaign Budget Policy 저장 오류: ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        result.status !== 'ok'
      ) {
        throw new Error(
          result.message ||
          'Budget Policy 저장에 실패했습니다.'
        )
      }

      console.log(
        'CAMPAIGN BUDGET POLICY SAVED',
        result
      )

      // 저장 성공 후 DB 값을 다시 불러와
      // 화면과 서버 상태를 일치시킨다.
      await loadCampaignBudgetPolicies()

    } catch (error) {
      console.error(
        'FAILED TO SAVE CAMPAIGN BUDGET POLICIES',
        error
      )

      setCampaignBudgetPolicyError(
        error.message ||
        'Campaign Budget Policy 저장 중 오류가 발생했습니다.'
      )

    } finally {
      setCampaignBudgetPolicySaving(
        false
      )
    }
  }

  async function runBudgetScalingAnalysis() {
    if (!selectedAdvertiserId) {
      setBudgetScalingError(
        '광고주를 먼저 선택해주세요.'
      )

      return
    }

    if (
      Number(
        campaignBudgetPolicyMeta
          ?.missingPolicyCount
      ) > 0
    ) {
      setBudgetScalingError(
        '예산 확장 분석 전에 최적화 대상 캠페인의 Budget Policy를 모두 설정해주세요.'
      )

      return
    }

    try {
      setBudgetScalingLoading(
        true
      )

      setBudgetScalingError(
        ''
      )



      const response =
        await operatorFetch(
          `${API_BASE_URL}/optimization/campaign-budget-scaling-preview`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              advertiserId:
                selectedAdvertiserId,

              dataSource:
                performanceDataSource,

              maxBudgetChangePct:
                Math.max(
                  0,
                  Math.min(
                    30,
                    Number(
                      budgetChangeLimit
                    ) || 0
                  )
                ) / 100,

              budgetMultipliers:
                budgetScalingMultipliers,

              // -----------------------------------------
              // 상단 필터가 적용된 성과 데이터
              //
              // Mock:
              // mockCampaignOptimizationInput 사용
              //
              // Naver:
              // optimizationSourceRows에 남아 있는
              // 실제 Naver 데이터만 campaign_id 형식으로 전달
              // -----------------------------------------

              performanceRecords:
                performanceDataSource ===
                  'mock'
                  ? (
                    mockCampaignOptimizationInput
                      ?.performanceRecords ||
                    []
                  )
                  : optimizationSourceRows.map(
                    (row) => ({
                      date:
                        row.date,

                      campaign_id:
                        String(
                          row.campaignId ||
                          ''
                        ),

                      campaign_name:
                        String(
                          row.campaign ||
                          ''
                        ),

                      channel:
                        row.channel ||
                        'Naver',

                      spend:
                        Number(
                          row.spend
                        ) || 0,

                      impressions:
                        Number(
                          row.impressions
                        ) || 0,

                      clicks:
                        Number(
                          row.clicks
                        ) || 0,

                      conversions:
                        Number(
                          row.conversions
                        ) || 0,

                      revenue:
                        Number(
                          row.revenue
                        ) || 0,
                    })
                  ),

              // -----------------------------------------
              // 현재예산 x0
              //
              // Mock:
              // 평균 일 spend 기반
              //
              // Naver:
              // 실제 Naver current_daily_budget 기반
              // -----------------------------------------

              currentBudgets:
                performanceDataSource ===
                  'mock'
                  ? (
                    mockCampaignOptimizationInput
                      ?.currentBudgets ||
                    {}
                  )
                  : Object.fromEntries(
                    filteredNaverCampaignBudgetPolicies
                      .filter(
                        (policy) =>
                          policy.optimizationEligible
                      )
                      .map(
                        (policy) => [
                          String(
                            policy.campaignId
                          ),
                          Number(
                            policy.currentDailyBudget
                          ) || 0,
                        ]
                      )
                  ),

              // -----------------------------------------
              // 캠페인별 Business Constraint L / U
              // -----------------------------------------

              budgetBounds:
                performanceDataSource ===
                  'mock'
                  ? (
                    mockCampaignOptimizationInput
                      ?.budgetBounds ||
                    {}
                  )
                  : Object.fromEntries(
                    filteredNaverCampaignBudgetPolicies
                      .filter(
                        (policy) =>
                          policy.optimizationEligible &&
                          Number.isFinite(
                            Number(
                              policy.minDailyBudget
                            )
                          ) &&
                          Number.isFinite(
                            Number(
                              policy.maxDailyBudget
                            )
                          )
                      )
                      .map(
                        (policy) => [
                          String(
                            policy.campaignId
                          ),
                          {
                            min:
                              Number(
                                policy.minDailyBudget
                              ),

                            max:
                              Number(
                                policy.maxDailyBudget
                              ),
                          },
                        ]
                      )
                  ),

              // -----------------------------------------
              // 현재 필터 기준 총 일예산 B
              // -----------------------------------------

              mockTotalDailyBudget:
                performanceDataSource ===
                  'mock'
                  ? (
                    mockCampaignOptimizationInput
                      ?.totalDailyBudget ||
                    null
                  )
                  : (
                    Number(
                      filteredNaverCampaignBudgetMeta
                        ?.optimizationCurrentTotalDailyBudget
                    ) || null
                  ),

              // -----------------------------------------
              // Revenue validity 시작일
              //
              // Mock은 첫 날짜부터 유효하다고 간주.
              // Naver는 실제 conversion tracking 시작일을
              // Backend가 DB에서 판단하도록 null 유지.
              // -----------------------------------------

              revenueValidStartDate:
                performanceDataSource ===
                  'mock'
                  ? (
                    mockCampaignOptimizationInput
                      ?.revenueValidStartDate ||
                    null
                  )
                  : null,

              // -----------------------------------------
              // 어떤 상단 필터로 계산했는지 Backend에 전달
              // -----------------------------------------

              filters: {
                brand:
                  globalBrand,

                channel:
                  globalChannel,

                campaign:
                  globalCampaign,

                product:
                  globalProduct,

                startDate,
                endDate,
              },
            }),
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        const errorText =
          await response.text()

        console.error(
          'BUDGET SCALING API ERROR',
          errorText
        )

        throw new Error(
          `예산 확장 분석 API 오류: ${response.status}`
        )
      }

      const result =
        await response.json()

      console.log(
        'BUDGET SCALING RESULT',
        result
      )

      setBudgetScalingResult(
        result
      )

      if (
        result.status ===
        'blocked'
      ) {
        setBudgetScalingError(
          result.message ||
          '현재 조건에서는 예산 확장 분석을 실행할 수 없습니다.'
        )
      }

    } catch (error) {
      console.error(
        'FAILED TO RUN BUDGET SCALING ANALYSIS',
        error
      )

      setBudgetScalingError(
        error.message ||
        '예산 확장 분석 중 오류가 발생했습니다.'
      )

    } finally {
      setBudgetScalingLoading(
        false
      )
    }
  }

  const budgetScalingAnalysisRows =
    useMemo(() => {
      const scenarios =
        budgetScalingResult
          ?.scenarios || []

      if (
        !Array.isArray(
          scenarios
        ) ||
        scenarios.length === 0
      ) {
        return []
      }

      const rows =
        scenarios
          .map(
            (
              scenario,
              index
            ) => {
              const result =
                scenario.result || {}

              const multiplier =
                Number(
                  scenario.multiplier
                ) || 0

              const budget =
                Number(
                  scenario.totalDailyBudget
                ) || 0

              const isReady =
                result.status ===
                'ok'

              const revenue =
                isReady
                  ? Number(
                    result
                      .estimatedRecommendedRevenue
                  )
                  : null

              const roas =
                (
                  isReady &&
                  budget > 0 &&
                  Number.isFinite(
                    revenue
                  )
                )
                  ? (
                    revenue /
                    budget
                  ) * 100
                  : null

              return {
                index,
                multiplier,
                budget,
                revenue,
                roas,

                status:
                  result.status ||
                  scenario.status ||
                  'unknown',

                blockCode:
                  result.blockCode ||
                  scenario.message ||
                  null,

                result,
              }
            }
          )
          .sort(
            (a, b) =>
              a.budget -
              b.budget
          )

      const currentRow =
        rows.find(
          (row) =>
            Math.abs(
              row.multiplier -
              1
            ) < 0.000001
        ) || null

      const currentBudget =
        Number(
          currentRow?.budget
        )

      const currentRevenue =
        Number(
          currentRow?.revenue
        )

      return rows.map(
        (
          row,
          index
        ) => {
          const previousRow =
            index > 0
              ? rows[
              index - 1
              ]
              : null

          const incrementalBudget =
            (
              currentRow &&
              Number.isFinite(
                currentBudget
              )
            )
              ? (
                row.budget -
                currentBudget
              )
              : null

          const incrementalRevenue =
            (
              currentRow &&
              Number.isFinite(
                currentRevenue
              ) &&
              Number.isFinite(
                row.revenue
              )
            )
              ? (
                row.revenue -
                currentRevenue
              )
              : null

          const revenueLiftPct =
            (
              Number.isFinite(
                incrementalRevenue
              ) &&
              Number.isFinite(
                currentRevenue
              ) &&
              currentRevenue > 0
            )
              ? (
                incrementalRevenue /
                currentRevenue
              ) * 100
              : null

          let marginalRoas =
            null

          if (
            previousRow &&
            Number.isFinite(
              previousRow.revenue
            ) &&
            Number.isFinite(
              row.revenue
            )
          ) {
            const deltaBudget =
              row.budget -
              previousRow.budget

            const deltaRevenue =
              row.revenue -
              previousRow.revenue

            if (
              deltaBudget > 0
            ) {
              marginalRoas =
                (
                  deltaRevenue /
                  deltaBudget
                ) * 100
            }
          }

          return {
            ...row,

            incrementalBudget,
            incrementalRevenue,
            revenueLiftPct,
            marginalRoas,
          }
        }
      )
    }, [
      budgetScalingResult,
    ])

  const budgetScalingInsight =
    useMemo(() => {
      const readyRows =
        budgetScalingAnalysisRows.filter(
          (row) =>
            row.status === 'ok' &&
            Number.isFinite(
              row.revenue
            ) &&
            Number.isFinite(
              row.roas
            )
        )

      if (
        readyRows.length < 2
      ) {
        return {
          status: 'waiting',
          title:
            '분석 대기 중',
          message:
            '유효한 학습 데이터가 충분해지면 예산 증액 구간별 효율 변화를 분석합니다.',
          slowdownRow: null,
        }
      }

      const currentRow =
        readyRows.find(
          (row) =>
            Math.abs(
              row.multiplier -
              1
            ) < 0.000001
        )

      if (!currentRow) {
        return {
          status: 'waiting',
          title:
            '현재 예산 기준점 없음',
          message:
            '현재 예산 시나리오를 기준으로 효율 변화를 계산할 수 없습니다.',
          slowdownRow: null,
        }
      }

      const expansionRows =
        readyRows.filter(
          (row) =>
            row.multiplier > 1 &&
            Number.isFinite(
              row.marginalRoas
            )
        )

      if (
        expansionRows.length === 0
      ) {
        return {
          status: 'waiting',
          title:
            '증액 시나리오 부족',
          message:
            '현재 예산보다 높은 시나리오의 분석 결과가 필요합니다.',
          slowdownRow: null,
        }
      }

      const currentRoas =
        Number(
          currentRow.roas
        )

      const slowdownThreshold =
        currentRoas * 0.70

      const slowdownRow =
        expansionRows.find(
          (row) =>
            row.marginalRoas <
            slowdownThreshold
        ) || null

      const bestExpansionRow =
        [...expansionRows]
          .filter(
            (row) =>
              row.marginalRoas >=
              slowdownThreshold
          )
          .sort(
            (a, b) =>
              b.multiplier -
              a.multiplier
          )[0] || null

      if (slowdownRow) {
        const slowdownPct =
          (
            slowdownRow.multiplier -
            1
          ) * 100

        const safeRow =
          bestExpansionRow ||
          currentRow

        const safePct =
          (
            safeRow.multiplier -
            1
          ) * 100

        return {
          status: 'slowdown',
          title:
            '효율 둔화 구간 감지',

          message:
            safeRow.multiplier > 1
              ? `현재 대비 약 +${safePct.toFixed(
                0
              )}% 구간까지는 추가 예산 효율이 비교적 유지되며, +${slowdownPct.toFixed(
                0
              )}% 구간부터 한계 ROAS가 빠르게 낮아집니다.`
              : `현재 예산보다 증액할 경우 초기 구간부터 한계 효율 저하가 관찰됩니다.`,

          slowdownRow,
          bestExpansionRow:
            safeRow,
        }
      }

      const highestRow =
        expansionRows[
        expansionRows.length -
        1
        ]

      return {
        status:
          'expansion_available',

        title:
          '추가 예산 확장 여지',

        message:
          `분석 범위 내에서는 +${(
            (
              highestRow
                .multiplier -
              1
            ) * 100
          ).toFixed(
            0
          )}%까지 뚜렷한 한계효율 급락이 감지되지 않았습니다.`,

        slowdownRow: null,

        bestExpansionRow:
          highestRow,
      }
    }, [
      budgetScalingAnalysisRows,
    ])

  const budgetScalingEfficiencyThreshold =
    useMemo(() => {
      const currentRow =
        budgetScalingAnalysisRows.find(
          (row) =>
            Math.abs(
              row.multiplier -
              1
            ) < 0.000001 &&
            row.status === 'ok' &&
            Number.isFinite(
              row.roas
            )
        )

      if (!currentRow) {
        return null
      }

      return (
        Number(
          currentRow.roas
        ) * 0.70
      )
    }, [
      budgetScalingAnalysisRows,
    ])

  const budgetScalingKpis =
    useMemo(() => {
      const currentBudget =
        Number(
          displayedCampaignBudgetPolicyMeta
            ?.optimizationCurrentTotalDailyBudget
        ) || 0

      if (
        budgetScalingInsight.status ===
        'waiting'
      ) {
        return {
          currentBudget,
          expansionLabel:
            '분석 대기',
          expansionBudget:
            null,
          slowdownLabel:
            '분석 대기',
          slowdownBudget:
            null,
        }
      }

      const expansionRow =
        budgetScalingInsight
          .bestExpansionRow || null

      const slowdownRow =
        budgetScalingInsight
          .slowdownRow || null

      const expansionPct =
        expansionRow
          ? (
            (
              expansionRow.multiplier -
              1
            ) * 100
          )
          : null

      const slowdownPct =
        slowdownRow
          ? (
            (
              slowdownRow.multiplier -
              1
            ) * 100
          )
          : null

      return {
        currentBudget,

        expansionLabel:
          expansionRow &&
            expansionRow.multiplier > 1
            ? `+${expansionPct.toFixed(
              0
            )}%`
            : '현재 수준',

        expansionBudget:
          expansionRow
            ? expansionRow.budget
            : currentBudget,

        slowdownLabel:
          slowdownRow
            ? `+${slowdownPct.toFixed(
              0
            )}%`
            : '범위 내 미감지',

        slowdownBudget:
          slowdownRow
            ? slowdownRow.budget
            : null,
      }
    }, [
      campaignBudgetPolicyMeta,
      budgetScalingInsight,
    ])

  async function runOptimization() {
    if (!selectedAdvertiserId) {
      setOptimizationApiError(
        '광고주를 먼저 선택해주세요.'
      )
      return
    }

    try {
      setOptimizationApiLoading(true)
      setOptimizationApiError('')
      setOptimizationApiResult(null)



      const response =
        await operatorFetch(
          `${API_BASE_URL}/optimization/channel/preview`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              advertiserId:
                selectedAdvertiserId,

              dataSource:
                performanceDataSource,

              maxBudgetChangePct:
                Math.min(
                  30,
                  Math.max(
                    0,
                    Number(
                      budgetChangeLimit
                    ) || 0
                  )
                ) / 100,

              performanceRecords:
                (
                  optimizationSourceRows ||
                  []
                ).map(
                  (row) => ({
                    date:
                      row.date,

                    platform:
                      row.platform ||
                      row.channel ||
                      '',

                    channel:
                      row.channel ||
                      row.platform ||
                      '',

                    spend:
                      Number(
                        row.spend
                      ) || 0,

                    impressions:
                      Number(
                        row.impressions
                      ) || 0,

                    clicks:
                      Number(
                        row.clicks
                      ) || 0,

                    conversions:
                      Number(
                        row.conversions
                      ) || 0,

                    revenue:
                      Number(
                        row.revenue
                      ) || 0,
                  })
                ),

              revenueValidStartDates:
                performanceDataSource ===
                  'mock'
                  ? {}
                  : null,
            }),
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        const errorText =
          await response.text()

        console.error(
          'CHANNEL OPTIMIZATION ERROR BODY',
          errorText
        )

        throw new Error(
          `매체 최적화 API 오류: ${response.status}`
        )
      }

      const result =
        await response.json()



      setOptimizationApiResult(
        result
      )

    } catch (error) {
      console.error(
        'CHANNEL OPTIMIZATION ERROR',
        error
      )

      setOptimizationApiError(
        error.message ||
        '매체별 추천 예산 계산 중 오류가 발생했습니다.'
      )

    } finally {
      setOptimizationApiLoading(false)
    }
  }

  function saveCurrentOptimizationScenario() {
    if (
      !optimizationApiResult ||
      optimizationApiResult.status !== 'optimal' ||
      !gurobiScenarioSummary ||
      gurobiPerformanceProjection.length === 0
    ) {
      return
    }

    const scenario = {
      id:
        `scenario_${Date.now()}`,

      advertiserId:
        selectedAdvertiserId,

      optimizationLevel:
        'channel',

      createdAt:
        new Date().toISOString(),

      name:
        scenarioName.trim() ||
        `${getOptimizationObjectiveLabel(
          optimizationObjective
        )} 시나리오`,

      objective:
        optimizationObjective,

      totalBudget:
        optimizationModelInput.totalBudget *
        optimizationPeriodDays,

      budgetChangeLimit,

      riskLevel:
        optimizationObjective ===
          'riskAdjustedRevenue'
          ? riskLevel
          : null,

      targetRoas:
        optimizationObjective ===
          'revenueWithRoas'
          ? targetRoas
          : null,

      targetCpa:
        optimizationObjective ===
          'conversionsWithCpa'
          ? targetCpa
          : null,

      summary: {
        currentBudget:
          gurobiScenarioSummary.currentBudget,

        optimizedBudget:
          gurobiScenarioSummary.optimizedBudget,

        currentRevenue:
          gurobiScenarioSummary.currentRevenue,

        projectedRevenue:
          gurobiScenarioSummary.projectedRevenue,

        currentRoas:
          gurobiScenarioSummary.currentRoas,

        projectedRoas:
          gurobiScenarioSummary.projectedRoas,

        projectedCpa:
          gurobiScenarioSummary.projectedCpa,
      },

      allocations:
        gurobiPerformanceProjection.map(
          (item) => ({
            channel:
              item.channel,

            currentBudget:
              item.currentPeriodBudget,

            optimizedBudget:
              item.optimizedPeriodBudget,

            budgetChange:
              item.budgetChange,

            budgetChangeRate:
              item.budgetChangeRate,

            projectedRevenue:
              item.projectedPeriodRevenue,

            projectedRoas:
              item.projectedRoas,

            projectedCpa:
              item.projectedCpa,
          })
        ),
    }

    setSavedOptimizationScenarios(
      (previous) => [
        scenario,
        ...previous,
      ]
    )
    setScenarioName('')
  }

  async function runRiskScenarioComparison() {
    if (
      optimizationObjective !== 'riskAdjustedRevenue'
    ) {
      return
    }

    if (!solverModelPayload) {
      return
    }

    setRiskScenarioLoading(true)

    try {
      const token =
        localStorage.getItem(
          'adscope_operator_access_token'
        )

      const levels = [
        'low',
        'medium',
        'high',
      ]

      const results = {}

      for (const level of levels) {
        const payload = {
          ...solverModelPayload,
          riskLevel:
            level,
        }

        const response = await fetch(
          'http://127.0.0.1:8001/optimize',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify(
              payload
            ),
          }
        )

        if (!response.ok) {
          throw new Error(
            `리스크 ${level} 시나리오 계산 실패`
          )
        }

        const result =
          await response.json()

        results[level] =
          result
      }

      setRiskScenarioComparison(
        results
      )
    } catch (error) {
      console.error(
        'RISK SCENARIO COMPARISON ERROR',
        error
      )

      setOptimizationApiError(
        error.message ||
        '리스크 시나리오 비교 중 오류가 발생했습니다.'
      )
    } finally {
      setRiskScenarioLoading(false)
    }
  }




  const optimizedBudgetAllocation = useMemo(() => {
    const totalBudget =
      Number(optimizationBudget) || 0

    if (
      totalBudget <= 0 ||
      budgetRecommendations.length === 0
    ) {
      return []
    }

    const rawScores =
      budgetRecommendations.map((item) => {
        const roasScore =
          item.roas > 0
            ? item.roas
            : 0

        const cpaScore =
          item.cpa > 0
            ? 100000 / item.cpa
            : 0

        const gapScore =
          Math.max(
            0,
            item.efficiencyGap + 10
          )

        const recommendationMultiplier =
          item.recommendation === '증액 후보'
            ? 1.15
            : item.recommendation === '감액 검토'
              ? 0.85
              : 1

        const score =
          (
            roasScore * 0.6 +
            cpaScore * 0.2 +
            gapScore * 0.2
          ) *
          recommendationMultiplier

        return {
          ...item,
          score,
        }
      })

    const totalScore =
      rawScores.reduce(
        (sum, item) =>
          sum + item.score,
        0
      )

    if (totalScore <= 0) {
      return rawScores.map((item) => ({
        ...item,
        recommendedBudget:
          totalBudget /
          rawScores.length,
      }))
    }

    return rawScores.map((item) => {
      const rawRecommendedBudget =
        totalBudget *
        (item.score / totalScore)

      const minBudget =
        item.spend * 0.7

      const maxBudget =
        item.spend * 1.3

      const recommendedBudget =
        Math.min(
          Math.max(
            rawRecommendedBudget,
            minBudget
          ),
          maxBudget
        )

      const recommendedShare =
        totalBudget > 0
          ? (recommendedBudget / totalBudget) * 100
          : 0

      const budgetChange =
        recommendedBudget - item.spend

      const budgetChangeRate =
        item.spend > 0
          ? (budgetChange / item.spend) * 100
          : null

      return {
        ...item,
        recommendedBudget,
        recommendedShare,
        budgetChange,
        budgetChangeRate,
      }
    })
  }, [
    optimizationBudget,
    budgetRecommendations,
  ])

  const budgetAllocationSummary = useMemo(() => {
    const inputBudget =
      Number(optimizationBudget) || 0

    const allocatedBudget =
      optimizedBudgetAllocation.reduce(
        (sum, item) =>
          sum + (item.recommendedBudget || 0),
        0
      )

    const difference =
      inputBudget - allocatedBudget

    return {
      inputBudget,
      allocatedBudget,
      difference,
    }
  }, [
    optimizationBudget,
    optimizedBudgetAllocation,
  ])

  const previousChannelPerformance = useMemo(() => {
    const channels = [
      ...new Set(
        previousPeriodData.map(
          (row) => row.channel
        )
      ),
    ]

    return channels.map((channel) => {
      const rows =
        previousPeriodData.filter(
          (row) =>
            row.channel === channel
        )

      const metrics =
        calculatePerformanceMetrics(rows)

      return {
        channel,
        ...metrics,
      }
    })
  }, [previousPeriodData])

  const channelChangeAnalysis = useMemo(() => {
    return channelPerformance.map((currentItem) => {
      const previousItem =
        previousChannelPerformance.find(
          (item) =>
            item.channel === currentItem.channel
        )

      if (!previousItem) {
        return {
          ...currentItem,
          roasChange: null,
          cpaChange: null,
          conversionsChange: null,
        }
      }

      return {
        ...currentItem,

        roasChange:
          calculateChangeRate(
            currentItem.roas,
            previousItem.roas
          ),

        cpaChange:
          calculateChangeRate(
            currentItem.cpa,
            previousItem.cpa
          ),

        conversionsChange:
          calculateChangeRate(
            currentItem.conversions,
            previousItem.conversions
          ),
      }
    })
  }, [
    channelPerformance,
    previousChannelPerformance,
  ])

  const channelChangeAlerts = useMemo(() => {
    const alerts = []

    channelChangeAnalysis.forEach((item) => {
      if (
        item.roasChange !== null &&
        item.roasChange <= -10
      ) {
        alerts.push({
          type: 'warning',
          channel: item.channel,
          metric: 'ROAS',
          change: item.roasChange,
          message:
            `${item.channel} ROAS가 이전 기간 대비 ${Math.abs(
              item.roasChange
            ).toFixed(1)}% 하락했습니다.`,
        })
      }

      if (
        item.cpaChange !== null &&
        item.cpaChange >= 10
      ) {
        alerts.push({
          type: 'warning',
          channel: item.channel,
          metric: 'CPA',
          change: item.cpaChange,
          message:
            `${item.channel} CPA가 이전 기간 대비 ${item.cpaChange.toFixed(
              1
            )}% 상승했습니다.`,
        })
      }

      if (
        item.conversionsChange !== null &&
        item.conversionsChange >= 10
      ) {
        alerts.push({
          type: 'positive',
          channel: item.channel,
          metric: '전환',
          change: item.conversionsChange,
          message:
            `${item.channel} 전환이 이전 기간 대비 ${item.conversionsChange.toFixed(
              1
            )}% 증가했습니다.`,
        })
      }

      if (
        item.roasChange !== null &&
        item.roasChange >= 10
      ) {
        alerts.push({
          type: 'positive',
          channel: item.channel,
          metric: 'ROAS',
          change: item.roasChange,
          message:
            `${item.channel} ROAS가 이전 기간 대비 ${item.roasChange.toFixed(
              1
            )}% 상승했습니다.`,
        })
      }
    })

    return alerts
  }, [channelChangeAnalysis])

  const campaignPerformance = useMemo(() => {
    const campaigns = [
      ...new Set(
        filteredData.map((row) => row.campaign)
      ),
    ]

    return campaigns
      .map((campaign) => {
        const rows = filteredData.filter(
          (row) => row.campaign === campaign
        )

        const metrics =
          calculatePerformanceMetrics(rows)

        return {
          campaign,
          ...metrics,
        }
      })
      .sort(
        (a, b) => b.roas - a.roas
      )
  }, [filteredData])

  const previousCampaignPerformance = useMemo(() => {
    const campaigns = [
      ...new Set(
        previousPeriodData.map(
          (row) => row.campaign
        )
      ),
    ]

    return campaigns.map((campaign) => {
      const rows =
        previousPeriodData.filter(
          (row) =>
            row.campaign === campaign
        )

      const metrics =
        calculatePerformanceMetrics(rows)

      return {
        campaign,
        ...metrics,
      }
    })
  }, [previousPeriodData])

  const campaignChangeAnalysis = useMemo(() => {
    return campaignPerformance.map((currentItem) => {
      const previousItem =
        previousCampaignPerformance.find(
          (item) =>
            item.campaign === currentItem.campaign
        )

      if (!previousItem) {
        return {
          ...currentItem,
          roasChange: null,
          cpaChange: null,
          conversionsChange: null,
        }
      }

      return {
        ...currentItem,

        roasChange:
          calculateChangeRate(
            currentItem.roas,
            previousItem.roas
          ),

        cpaChange:
          calculateChangeRate(
            currentItem.cpa,
            previousItem.cpa
          ),

        conversionsChange:
          calculateChangeRate(
            currentItem.conversions,
            previousItem.conversions
          ),
      }
    })
  }, [
    campaignPerformance,
    previousCampaignPerformance,
  ])

  const campaignChangeAlerts = useMemo(() => {
    const alerts = []

    campaignChangeAnalysis.forEach((item) => {
      // ROAS 10% 이상 하락
      if (
        item.roasChange !== null &&
        item.roasChange <= -10
      ) {
        alerts.push({
          type: 'warning',
          category: 'campaign',
          name: item.campaign,
          metric: 'ROAS',
          change: item.roasChange,
          severity: Math.abs(item.roasChange),
          message:
            `${item.campaign} ROAS가 이전 기간 대비 ${Math.abs(
              item.roasChange
            ).toFixed(1)}% 하락했습니다.`,
        })
      }

      // CPA 10% 이상 상승
      if (
        item.cpaChange !== null &&
        item.cpaChange >= 10
      ) {
        alerts.push({
          type: 'warning',
          category: 'campaign',
          name: item.campaign,
          metric: 'CPA',
          change: item.cpaChange,
          severity: Math.abs(item.cpaChange),
          message:
            `${item.campaign} CPA가 이전 기간 대비 ${item.cpaChange.toFixed(
              1
            )}% 상승했습니다.`,
        })
      }

      // ROAS 10% 이상 상승
      if (
        item.roasChange !== null &&
        item.roasChange >= 10
      ) {
        alerts.push({
          type: 'positive',
          category: 'campaign',
          name: item.campaign,
          metric: 'ROAS',
          change: item.roasChange,
          severity: Math.abs(item.roasChange),
          message:
            `${item.campaign} ROAS가 이전 기간 대비 ${item.roasChange.toFixed(
              1
            )}% 상승했습니다.`,
        })
      }

      // 전환 10% 이상 증가
      if (
        item.conversionsChange !== null &&
        item.conversionsChange >= 10
      ) {
        alerts.push({
          type: 'positive',
          category: 'campaign',
          name: item.campaign,
          metric: '전환',
          change: item.conversionsChange,
          severity: Math.abs(
            item.conversionsChange
          ),
          message:
            `${item.campaign} 전환이 이전 기간 대비 ${item.conversionsChange.toFixed(
              1
            )}% 증가했습니다.`,
        })
      }
    })

    return alerts.sort(
      (a, b) => b.severity - a.severity
    )
  }, [campaignChangeAnalysis])

  const campaignShareAnalysis = useMemo(() => {
    const totalSpend =
      campaignPerformance.reduce(
        (sum, item) => sum + item.spend,
        0
      )

    const totalRevenue =
      campaignPerformance.reduce(
        (sum, item) => sum + item.revenue,
        0
      )

    return campaignPerformance.map((item) => {
      const spendShare =
        totalSpend > 0
          ? (item.spend / totalSpend) * 100
          : 0

      const revenueShare =
        totalRevenue > 0
          ? (item.revenue / totalRevenue) * 100
          : 0

      const shareGap =
        revenueShare - spendShare

      return {
        ...item,
        spendShare,
        revenueShare,
        shareGap,
      }
    })
  }, [campaignPerformance])

  const campaignDiagnostics = useMemo(() => {
    if (campaignShareAnalysis.length === 0) {
      return []
    }

    const averageRoas =
      campaignShareAnalysis.reduce(
        (sum, item) => sum + item.roas,
        0
      ) / campaignShareAnalysis.length

    const averageCpa =
      campaignShareAnalysis.reduce(
        (sum, item) => sum + item.cpa,
        0
      ) / campaignShareAnalysis.length

    return campaignShareAnalysis.map((item) => {
      const highRoas =
        item.roas >= averageRoas

      const lowCpa =
        item.cpa <= averageCpa

      const positiveShare =
        item.shareGap >= 0

      let status = '양호'
      let reason =
        '전반적으로 평균 수준의 성과입니다.'

      if (
        highRoas &&
        lowCpa &&
        positiveShare
      ) {
        status = '효율 우수'
        reason =
          'ROAS가 높고 CPA가 낮으며, 매출 기여도가 광고비 비중 이상입니다.'
      } else if (
        !highRoas &&
        !lowCpa &&
        item.shareGap < 0
      ) {
        status = '점검 필요'
        reason =
          'ROAS가 낮고 CPA가 높으며, 매출 기여도가 광고비 비중보다 낮습니다.'
      } else if (!highRoas) {
        reason =
          'ROAS가 캠페인 평균보다 낮습니다.'
      } else if (!lowCpa) {
        reason =
          'CPA가 캠페인 평균보다 높습니다.'
      } else if (!positiveShare) {
        reason =
          '매출 기여도가 광고비 비중보다 낮습니다.'
      }

      return {
        ...item,
        status,
        reason,
      }
    })
  }, [campaignShareAnalysis])

  const selectedInternalCampaignData =
    campaignDiagnostics.find(
      (item) =>
        item.campaign ===
        selectedInternalCampaign
    ) || null

  const selectedInternalCampaignDailyData =
    selectedInternalCampaignData
      ? Object.values(
        filteredData
          .filter(
            (row) =>
              row.campaign ===
              selectedInternalCampaignData.campaign
          )
          .reduce(
            (acc, row) => {
              if (!acc[row.date]) {
                acc[row.date] = {
                  date: row.date,
                  spend: 0,
                  revenue: 0,
                  conversions: 0,
                }
              }

              acc[row.date].spend +=
                Number(row.spend || 0)

              acc[row.date].revenue +=
                Number(row.revenue || 0)

              acc[row.date].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      ).sort(
        (a, b) =>
          new Date(
            `${a.date}T00:00:00`
          ) -
          new Date(
            `${b.date}T00:00:00`
          )
      )
      : []

  const selectedInternalCampaignContentData =
    selectedInternalCampaignData
      ? Object.values(
        filteredData
          .filter(
            (row) =>
              row.campaign ===
              selectedInternalCampaignData.campaign
          )
          .reduce(
            (acc, row) => {
              const content =
                row.content ||
                'Unknown Content'

              if (!acc[content]) {
                acc[content] = {
                  content,
                  spend: 0,
                  revenue: 0,
                  impressions: 0,
                  clicks: 0,
                  conversions: 0,
                }
              }

              acc[content].spend +=
                Number(row.spend || 0)

              acc[content].revenue +=
                Number(row.revenue || 0)

              acc[content].impressions +=
                Number(
                  row.impressions || 0
                )

              acc[content].clicks +=
                Number(row.clicks || 0)

              acc[content].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      )
        .map((row) => ({
          ...row,

          roas:
            calculateRoas(
              row.revenue,
              row.spend
            ),

          cpa:
            calculateCpa(
              row.spend,
              row.conversions
            ),

          ctr:
            calculateCtr(
              row.clicks,
              row.impressions
            ),
        }))
        .sort(
          (a, b) =>
            b.roas - a.roas
        )
      : []

  const sortedCampaignDiagnostics =
    [...campaignDiagnostics]
      .sort((a, b) => {
        if (
          internalCampaignSort === 'roas_desc'
        ) {
          return b.roas - a.roas
        }

        if (
          internalCampaignSort === 'spend_desc'
        ) {
          return b.spend - a.spend
        }

        if (
          internalCampaignSort === 'revenue_desc'
        ) {
          return b.revenue - a.revenue
        }

        if (
          internalCampaignSort === 'cpa_asc'
        ) {
          return a.cpa - b.cpa
        }

        if (
          internalCampaignSort ===
          'conversions_desc'
        ) {
          return (
            b.conversions -
            a.conversions
          )
        }

        return 0
      })

  const productPerformance = useMemo(() => {
    const products = [
      ...new Set(
        filteredData.map((row) => row.product)
      ),
    ]

    return products
      .map((product) => {
        const rows = filteredData.filter(
          (row) => row.product === product
        )

        const metrics =
          calculatePerformanceMetrics(rows)

        return {
          product,
          ...metrics,
        }
      })
      .sort(
        (a, b) => b.roas - a.roas
      )
  }, [filteredData])

  const previousProductPerformance = useMemo(() => {
    const products = [
      ...new Set(
        previousPeriodData.map(
          (row) => row.product
        )
      ),
    ]

    return products.map((product) => {
      const rows =
        previousPeriodData.filter(
          (row) =>
            row.product === product
        )

      const metrics =
        calculatePerformanceMetrics(rows)

      return {
        product,
        ...metrics,
      }
    })
  }, [previousPeriodData])

  const productChangeAnalysis = useMemo(() => {
    return productPerformance.map((currentItem) => {
      const previousItem =
        previousProductPerformance.find(
          (item) =>
            item.product === currentItem.product
        )

      if (!previousItem) {
        return {
          ...currentItem,
          roasChange: null,
          cpaChange: null,
          conversionsChange: null,
        }
      }

      return {
        ...currentItem,

        roasChange:
          calculateChangeRate(
            currentItem.roas,
            previousItem.roas
          ),

        cpaChange:
          calculateChangeRate(
            currentItem.cpa,
            previousItem.cpa
          ),

        conversionsChange:
          calculateChangeRate(
            currentItem.conversions,
            previousItem.conversions
          ),
      }
    })
  }, [
    productPerformance,
    previousProductPerformance,
  ])

  const productChangeAlerts = useMemo(() => {
    const alerts = []

    productChangeAnalysis.forEach((item) => {
      // ROAS 10% 이상 하락
      if (
        item.roasChange !== null &&
        item.roasChange <= -10
      ) {
        alerts.push({
          type: 'warning',
          category: 'product',
          name: item.product,
          metric: 'ROAS',
          change: item.roasChange,
          severity: Math.abs(item.roasChange),
          message:
            `${item.product} ROAS가 이전 기간 대비 ${Math.abs(
              item.roasChange
            ).toFixed(1)}% 하락했습니다.`,
        })
      }

      // CPA 10% 이상 상승
      if (
        item.cpaChange !== null &&
        item.cpaChange >= 10
      ) {
        alerts.push({
          type: 'warning',
          category: 'product',
          name: item.product,
          metric: 'CPA',
          change: item.cpaChange,
          severity: Math.abs(item.cpaChange),
          message:
            `${item.product} CPA가 이전 기간 대비 ${item.cpaChange.toFixed(
              1
            )}% 상승했습니다.`,
        })
      }

      // ROAS 10% 이상 상승
      if (
        item.roasChange !== null &&
        item.roasChange >= 10
      ) {
        alerts.push({
          type: 'positive',
          category: 'product',
          name: item.product,
          metric: 'ROAS',
          change: item.roasChange,
          severity: Math.abs(item.roasChange),
          message:
            `${item.product} ROAS가 이전 기간 대비 ${item.roasChange.toFixed(
              1
            )}% 상승했습니다.`,
        })
      }

      // 전환 10% 이상 증가
      if (
        item.conversionsChange !== null &&
        item.conversionsChange >= 10
      ) {
        alerts.push({
          type: 'positive',
          category: 'product',
          name: item.product,
          metric: '전환',
          change: item.conversionsChange,
          severity: Math.abs(
            item.conversionsChange
          ),
          message:
            `${item.product} 전환이 이전 기간 대비 ${item.conversionsChange.toFixed(
              1
            )}% 증가했습니다.`,
        })
      }
    })

    return alerts.sort(
      (a, b) => b.severity - a.severity
    )
  }, [productChangeAnalysis])

  const performanceAlerts = useMemo(() => {
    return [
      ...channelChangeAlerts.map((alert) => ({
        ...alert,
        categoryLabel: '매체',
      })),

      ...campaignChangeAlerts.map((alert) => ({
        ...alert,
        categoryLabel: '캠페인',
      })),

      ...productChangeAlerts.map((alert) => ({
        ...alert,
        categoryLabel: '제품',
      })),
    ]
      .sort(
        (a, b) =>
          b.severity - a.severity
      )
      .slice(0, 8)
  }, [
    channelChangeAlerts,
    campaignChangeAlerts,
    productChangeAlerts,
  ])

  const productShareAnalysis = useMemo(() => {
    const totalSpend =
      productPerformance.reduce(
        (sum, item) => sum + item.spend,
        0
      )

    const totalRevenue =
      productPerformance.reduce(
        (sum, item) => sum + item.revenue,
        0
      )

    return productPerformance.map((item) => {
      const spendShare =
        totalSpend > 0
          ? (item.spend / totalSpend) * 100
          : 0

      const revenueShare =
        totalRevenue > 0
          ? (item.revenue / totalRevenue) * 100
          : 0

      const shareGap =
        revenueShare - spendShare

      return {
        ...item,
        spendShare,
        revenueShare,
        shareGap,
      }
    })
  }, [productPerformance])

  const productDiagnostics = useMemo(() => {
    if (productShareAnalysis.length === 0) {
      return []
    }

    const averageRoas =
      productShareAnalysis.reduce(
        (sum, item) => sum + item.roas,
        0
      ) / productShareAnalysis.length

    const averageCpa =
      productShareAnalysis.reduce(
        (sum, item) => sum + item.cpa,
        0
      ) / productShareAnalysis.length

    return productShareAnalysis.map((item) => {
      const highRoas =
        item.roas >= averageRoas

      const lowCpa =
        item.cpa <= averageCpa

      const positiveShare =
        item.shareGap >= 0

      let status = '양호'
      let reason =
        '전반적으로 평균 수준의 성과입니다.'

      if (
        highRoas &&
        lowCpa &&
        positiveShare
      ) {
        status = '효율 우수'
        reason =
          'ROAS가 높고 CPA가 낮으며, 매출 기여도가 광고비 비중 이상입니다.'
      } else if (
        !highRoas &&
        !lowCpa &&
        item.shareGap < 0
      ) {
        status = '점검 필요'
        reason =
          'ROAS가 낮고 CPA가 높으며, 매출 기여도가 광고비 비중보다 낮습니다.'
      } else if (!highRoas) {
        reason =
          'ROAS가 제품 평균보다 낮습니다.'
      } else if (!lowCpa) {
        reason =
          'CPA가 제품 평균보다 높습니다.'
      } else if (!positiveShare) {
        reason =
          '매출 기여도가 광고비 비중보다 낮습니다.'
      }

      return {
        ...item,
        status,
        reason,
      }
    })
  }, [productShareAnalysis])

  const sortedProductDiagnostics =
    [...productDiagnostics]
      .sort((a, b) => {
        if (
          internalProductSort === 'roas_desc'
        ) {
          return b.roas - a.roas
        }

        if (
          internalProductSort === 'spend_desc'
        ) {
          return b.spend - a.spend
        }

        if (
          internalProductSort === 'revenue_desc'
        ) {
          return b.revenue - a.revenue
        }

        if (
          internalProductSort === 'cpa_asc'
        ) {
          return a.cpa - b.cpa
        }

        if (
          internalProductSort ===
          'conversions_desc'
        ) {
          return (
            b.conversions -
            a.conversions
          )
        }

        return 0
      })

  const selectedInternalProductData =
    productDiagnostics.find(
      (item) =>
        item.product ===
        selectedInternalProduct
    ) || null

  const selectedInternalProductDailyData =
    selectedInternalProductData
      ? Object.values(
        filteredData
          .filter(
            (row) =>
              row.product ===
              selectedInternalProductData.product
          )
          .reduce(
            (acc, row) => {
              const date = row.date

              if (!acc[date]) {
                acc[date] = {
                  date,
                  spend: 0,
                  revenue: 0,
                  conversions: 0,
                }
              }

              acc[date].spend +=
                Number(row.spend || 0)

              acc[date].revenue +=
                Number(row.revenue || 0)

              acc[date].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      )
        .map((row) => ({
          ...row,

          roas:
            calculateRoas(
              row.revenue,
              row.spend
            ),
        }))
        .sort(
          (a, b) =>
            new Date(
              `${a.date}T00:00:00`
            ) -
            new Date(
              `${b.date}T00:00:00`
            )
        )
      : []

  const selectedInternalProductCampaignData =
    selectedInternalProductData
      ? Object.values(
        filteredData
          .filter(
            (row) =>
              row.product ===
              selectedInternalProductData.product
          )
          .reduce(
            (acc, row) => {
              const channel =
                row.channel || 'Unknown'

              const campaign =
                row.campaign ||
                'Unknown Campaign'

              const key =
                `${channel}-${campaign}`

              if (!acc[key]) {
                acc[key] = {
                  key,
                  channel,
                  campaign,
                  spend: 0,
                  revenue: 0,
                  impressions: 0,
                  clicks: 0,
                  conversions: 0,
                }
              }

              acc[key].spend +=
                Number(row.spend || 0)

              acc[key].revenue +=
                Number(row.revenue || 0)

              acc[key].impressions +=
                Number(
                  row.impressions || 0
                )

              acc[key].clicks +=
                Number(row.clicks || 0)

              acc[key].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      )
        .map((row) => ({
          ...row,

          roas:
            calculateRoas(
              row.revenue,
              row.spend
            ),

          cpa:
            calculateCpa(
              row.spend,
              row.conversions
            ),

          ctr:
            calculateCtr(
              row.clicks,
              row.impressions
            ),
        }))
        .sort(
          (a, b) =>
            b.roas - a.roas
        )
      : []

  const contentPerformance = useMemo(() => {
    const contents = [
      ...new Set(
        filteredData.map((row) => row.content)
      ),
    ]

    return contents
      .map((content) => {
        const rows = filteredData.filter(
          (row) => row.content === content
        )

        const metrics =
          calculatePerformanceMetrics(rows)

        return {
          content,
          ...metrics,
        }
      })
      .sort(
        (a, b) => b.roas - a.roas
      )
  }, [filteredData])

  const contentShareAnalysis = useMemo(() => {
    const totalSpend =
      contentPerformance.reduce(
        (sum, item) => sum + item.spend,
        0
      )

    const totalRevenue =
      contentPerformance.reduce(
        (sum, item) => sum + item.revenue,
        0
      )

    return contentPerformance.map((item) => {
      const spendShare =
        totalSpend > 0
          ? (item.spend / totalSpend) * 100
          : 0

      const revenueShare =
        totalRevenue > 0
          ? (item.revenue / totalRevenue) * 100
          : 0

      const shareGap =
        revenueShare - spendShare

      return {
        ...item,
        spendShare,
        revenueShare,
        shareGap,
      }
    })
  }, [contentPerformance])

  const contentDiagnostics = useMemo(() => {
    if (contentShareAnalysis.length === 0) {
      return []
    }

    const averageRoas =
      contentShareAnalysis.reduce(
        (sum, item) => sum + item.roas,
        0
      ) / contentShareAnalysis.length

    const averageCpa =
      contentShareAnalysis.reduce(
        (sum, item) => sum + item.cpa,
        0
      ) / contentShareAnalysis.length

    return contentShareAnalysis.map((item) => {
      const highRoas =
        item.roas >= averageRoas

      const lowCpa =
        item.cpa <= averageCpa

      const positiveShare =
        item.shareGap >= 0

      let status = '양호'
      let reason =
        '전반적으로 평균 수준의 성과입니다.'

      if (
        highRoas &&
        lowCpa &&
        positiveShare
      ) {
        status = '효율 우수'
        reason =
          'ROAS가 높고 CPA가 낮으며, 매출 기여도가 광고비 비중 이상입니다.'
      } else if (
        !highRoas &&
        !lowCpa &&
        item.shareGap < 0
      ) {
        status = '점검 필요'
        reason =
          'ROAS가 낮고 CPA가 높으며, 매출 기여도가 광고비 비중보다 낮습니다.'
      } else if (!highRoas) {
        reason =
          'ROAS가 콘텐츠 평균보다 낮습니다.'
      } else if (!lowCpa) {
        reason =
          'CPA가 콘텐츠 평균보다 높습니다.'
      } else if (!positiveShare) {
        reason =
          '매출 기여도가 광고비 비중보다 낮습니다.'
      }

      return {
        ...item,
        status,
        reason,
      }
    })
  }, [contentShareAnalysis])

  const sortedContentDiagnostics =
    [...contentDiagnostics]
      .sort((a, b) => {
        if (
          internalContentSort === 'roas_desc'
        ) {
          return b.roas - a.roas
        }

        if (
          internalContentSort === 'spend_desc'
        ) {
          return b.spend - a.spend
        }

        if (
          internalContentSort === 'revenue_desc'
        ) {
          return b.revenue - a.revenue
        }

        if (
          internalContentSort === 'cpa_asc'
        ) {
          return a.cpa - b.cpa
        }

        if (
          internalContentSort ===
          'conversions_desc'
        ) {
          return (
            b.conversions -
            a.conversions
          )
        }

        return 0
      })

  const selectedInternalContentData =
    contentDiagnostics.find(
      (item) =>
        item.content ===
        selectedInternalContent
    ) || null

  const selectedInternalContentDailyData =
    selectedInternalContentData
      ? Object.values(
        filteredData
          .filter(
            (row) =>
              row.content ===
              selectedInternalContentData.content
          )
          .reduce(
            (acc, row) => {
              const date = row.date

              if (!acc[date]) {
                acc[date] = {
                  date,
                  spend: 0,
                  revenue: 0,
                  conversions: 0,
                }
              }

              acc[date].spend +=
                Number(row.spend || 0)

              acc[date].revenue +=
                Number(row.revenue || 0)

              acc[date].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      )
        .map((row) => ({
          ...row,

          roas:
            calculateRoas(
              row.revenue,
              row.spend
            ),
        }))
        .sort(
          (a, b) =>
            new Date(
              `${a.date}T00:00:00`
            ) -
            new Date(
              `${b.date}T00:00:00`
            )
        )
      : []

  const selectedInternalContentBreakdownData =
    selectedInternalContentData
      ? Object.values(
        filteredData
          .filter(
            (row) =>
              row.content ===
              selectedInternalContentData.content
          )
          .reduce(
            (acc, row) => {
              const channel =
                row.channel || 'Unknown'

              const campaign =
                row.campaign ||
                'Unknown Campaign'

              const product =
                row.product ||
                'Unknown Product'

              const key =
                `${channel}-${campaign}-${product}`

              if (!acc[key]) {
                acc[key] = {
                  key,
                  channel,
                  campaign,
                  product,
                  spend: 0,
                  revenue: 0,
                  impressions: 0,
                  clicks: 0,
                  conversions: 0,
                }
              }

              acc[key].spend +=
                Number(row.spend || 0)

              acc[key].revenue +=
                Number(row.revenue || 0)

              acc[key].impressions +=
                Number(
                  row.impressions || 0
                )

              acc[key].clicks +=
                Number(row.clicks || 0)

              acc[key].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      )
        .map((row) => ({
          ...row,

          roas:
            calculateRoas(
              row.revenue,
              row.spend
            ),

          cpa:
            calculateCpa(
              row.spend,
              row.conversions
            ),

          ctr:
            calculateCtr(
              row.clicks,
              row.impressions
            ),
        }))
        .sort(
          (a, b) =>
            b.roas - a.roas
        )
      : []

  const channelShareAnalysis = useMemo(() => {
    const totalSpend = channelPerformance.reduce(
      (sum, item) => sum + item.spend,
      0
    )

    const totalRevenue = channelPerformance.reduce(
      (sum, item) => sum + item.revenue,
      0
    )

    return channelPerformance.map((item) => {
      const spendShare =
        totalSpend > 0
          ? (item.spend / totalSpend) * 100
          : 0

      const revenueShare =
        totalRevenue > 0
          ? (item.revenue / totalRevenue) * 100
          : 0

      const shareGap =
        revenueShare - spendShare

      return {
        ...item,
        spendShare,
        revenueShare,
        shareGap,
      }
    })
  }, [channelPerformance])

  const channelDiagnostics = useMemo(() => {
    if (channelShareAnalysis.length === 0) {
      return []
    }

    const averageRoas =
      channelShareAnalysis.reduce(
        (sum, item) => sum + item.roas,
        0
      ) / channelShareAnalysis.length

    const averageCpa =
      channelShareAnalysis.reduce(
        (sum, item) => sum + item.cpa,
        0
      ) / channelShareAnalysis.length

    return channelShareAnalysis.map((item) => {
      const highRoas =
        item.roas >= averageRoas

      const lowCpa =
        item.cpa <= averageCpa

      const positiveShare =
        item.shareGap >= 0

      let status = '양호'
      let reason = '전반적으로 평균 수준의 성과입니다.'

      if (
        highRoas &&
        lowCpa &&
        positiveShare
      ) {
        status = '효율 우수'
        reason =
          'ROAS가 높고 CPA가 낮으며, 매출 기여도가 광고비 비중 이상입니다.'
      } else if (
        !highRoas &&
        !lowCpa &&
        item.shareGap < 0
      ) {
        status = '점검 필요'
        reason =
          'ROAS가 낮고 CPA가 높으며, 매출 기여도가 광고비 비중보다 낮습니다.'
      } else if (!highRoas) {
        reason =
          'ROAS가 전체 매체 평균보다 낮습니다.'
      } else if (!lowCpa) {
        reason =
          'CPA가 전체 매체 평균보다 높습니다.'
      } else if (!positiveShare) {
        reason =
          '매출 기여도가 광고비 비중보다 낮습니다.'
      }

      return {
        ...item,
        status,
        reason,
      }
    })
  }, [channelShareAnalysis])


  const sortedChannelDiagnostics =
    [...channelDiagnostics]
      .sort((a, b) => {
        if (
          internalChannelSort === 'roas_desc'
        ) {
          return b.roas - a.roas
        }

        if (
          internalChannelSort === 'spend_desc'
        ) {
          return b.spend - a.spend
        }

        if (
          internalChannelSort === 'revenue_desc'
        ) {
          return b.revenue - a.revenue
        }

        if (
          internalChannelSort === 'cpa_asc'
        ) {
          return a.cpa - b.cpa
        }

        if (
          internalChannelSort === 'conversions_desc'
        ) {
          return (
            b.conversions -
            a.conversions
          )
        }

        return 0
      })

  const selectedInternalChannelData =
    channelDiagnostics.find(
      (item) =>
        item.channel ===
        selectedInternalChannel
    ) || null

  const selectedInternalChannelDailyData =
    selectedInternalChannelData
      ? Object.values(
        filteredData
          .filter(
            (row) =>
              row.channel ===
              selectedInternalChannelData.channel
          )
          .reduce(
            (acc, row) => {
              const date = row.date

              if (!acc[date]) {
                acc[date] = {
                  date,
                  spend: 0,
                  revenue: 0,
                  conversions: 0,
                }
              }

              acc[date].spend +=
                Number(row.spend || 0)

              acc[date].revenue +=
                Number(row.revenue || 0)

              acc[date].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      )
        .map((row) => ({
          ...row,

          roas:
            calculateRoas(
              row.revenue,
              row.spend
            ),
        }))
        .sort(
          (a, b) =>
            new Date(
              `${a.date}T00:00:00`
            ) -
            new Date(
              `${b.date}T00:00:00`
            )
        )
      : []

  const selectedInternalChannelCampaignData =
    selectedInternalChannelData
      ? Object.values(
        filteredData
          .filter(
            (row) =>
              row.channel ===
              selectedInternalChannelData.channel
          )
          .reduce(
            (acc, row) => {
              const campaign =
                row.campaign ||
                'Unknown Campaign'

              if (!acc[campaign]) {
                acc[campaign] = {
                  campaign,
                  spend: 0,
                  revenue: 0,
                  impressions: 0,
                  clicks: 0,
                  conversions: 0,
                }
              }

              acc[campaign].spend +=
                Number(row.spend || 0)

              acc[campaign].revenue +=
                Number(row.revenue || 0)

              acc[campaign].impressions +=
                Number(
                  row.impressions || 0
                )

              acc[campaign].clicks +=
                Number(row.clicks || 0)

              acc[campaign].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      )
        .map((row) => ({
          ...row,

          roas:
            calculateRoas(
              row.revenue,
              row.spend
            ),

          cpa:
            calculateCpa(
              row.spend,
              row.conversions
            ),

          ctr:
            calculateCtr(
              row.clicks,
              row.impressions
            ),
        }))
        .sort(
          (a, b) =>
            b.roas - a.roas
        )
      : []



  const filterOptions = useMemo(() => {
    if (!filterField) {
      return []
    }

    let sourceData = mockAds

    if (selectedChannel !== '전체') {
      sourceData = sourceData.filter(
        (row) => row.channel === selectedChannel
      )
    }

    return [
      ...new Set(
        sourceData.map(
          (row) => row[filterField]
        )
      ),
    ]
  }, [
    filterField,
    selectedChannel,
  ])


  const groupValues = useMemo(() => {
    if (!groupField) {
      return []
    }

    return [
      ...new Set(
        filteredData.map(
          (row) => row[groupField]
        )
      ),
    ]
  }, [filteredData, groupField])

  const canvasSize = useMemo(() => {
    if (savedCharts.length === 0) {
      return {
        width: 1200,
        height: 800,
      }
    }

    const padding = 96

    const maxRight = Math.max(
      ...savedCharts.map((chart) =>
        (chart.x ?? 0) +
        (chart.width || 480)
      )
    )

    const maxBottom = Math.max(
      ...savedCharts.map((chart) =>
        (chart.y ?? 0) +
        (chart.height || 420)
      )
    )

    return {
      width: Math.max(
        1200,
        maxRight + padding
      ),

      height: Math.max(
        800,
        maxBottom + padding
      ),
    }
  }, [savedCharts])


  const chartData = useMemo(() => {
    if (!xField || yFields.length === 0) {
      return []
    }

    const xValues = [
      ...new Set(
        filteredData.map(
          (row) => row[xField]
        )
      ),
    ]

    return xValues.map((xValue) => {
      const result = {
        [xField]: xValue,
      }

      const rowsForX =
        filteredData.filter(
          (row) =>
            row[xField] === xValue
        )

      if (!groupField) {
        yFields.forEach((metric) => {
          result[metric] =
            calculateMetric(
              rowsForX,
              metric,
              aggregation
            )
        })

        return result
      }

      groupValues.forEach((groupValue) => {
        const groupRows =
          rowsForX.filter(
            (row) =>
              row[groupField] ===
              groupValue
          )

        yFields.forEach((metric) => {
          const seriesKey =
            `${groupValue}__${metric}`

          result[seriesKey] =
            calculateMetric(
              groupRows,
              metric,
              aggregation
            )
        })
      })

      return result
    })
  }, [
    filteredData,
    xField,
    yFields,
    groupField,
    groupValues,
    aggregation,
  ])

  const sortedChartData = (() => {
    if (
      sortOrder === 'none' ||
      yFields.length === 0
    ) {
      return chartData
    }

    const metric = yFields[0]

    return [...chartData].sort((a, b) => {
      const aValue =
        Number(a[metric]) || 0

      const bValue =
        Number(b[metric]) || 0

      if (sortOrder === 'asc') {
        return aValue - bValue
      }

      return bValue - aValue
    })
  })()

  const displayChartData =
    topN === 'all'
      ? sortedChartData
      : sortedChartData.slice(
        0,
        Number(topN)
      )


  function handleDragStart(field) {
    setDraggedField(field)
  }

  function autoArrangeCharts() {
    const gap = 28
    const columns =
      Number(dashboardColumns)

    const sizeMap = {
      small: {
        width: 460,
        height: 360,
      },

      medium: {
        width: 560,
        height: 440,
      },

      large: {
        width: 680,
        height: 520,
      },
    }

    const {
      width: cardWidth,
      height: cardHeight,
    } = sizeMap[dashboardCardSize]

    setSavedCharts((current) =>
      current.map((chart, index) => {
        const column =
          index % columns

        const row =
          Math.floor(index / columns)

        return {
          ...chart,

          x:
            column *
            (cardWidth + gap),

          y:
            row *
            (cardHeight + gap),

          width: cardWidth,
          height: cardHeight,
        }
      })
    )
  }

  function normalizeDashboardLayout(charts) {
    const gridSize = 24
    const gap = 24

    const sorted = [...charts].sort((a, b) => {
      const ay = a.y ?? 0
      const by = b.y ?? 0

      if (ay !== by) {
        return ay - by
      }

      return (a.x ?? 0) - (b.x ?? 0)
    })

    const placed = []

    for (const chart of sorted) {
      const width = chart.width || 480
      const height = chart.height || 420

      let x = chart.x ?? 0
      let y = chart.y ?? 0

      let hasCollision = true

      while (hasCollision) {
        hasCollision = placed.some((other) => {
          const otherX = other.x ?? 0
          const otherY = other.y ?? 0
          const otherWidth = other.width || 480
          const otherHeight = other.height || 420

          return (
            x < otherX + otherWidth + gap &&
            x + width + gap > otherX &&
            y < otherY + otherHeight + gap &&
            y + height + gap > otherY
          )
        })

        if (hasCollision) {
          y += gridSize
        }
      }

      placed.push({
        ...chart,
        x:
          Math.round(x / gridSize) *
          gridSize,
        y:
          Math.round(y / gridSize) *
          gridSize,
      })
    }

    return placed
  }


  function handleDrop(target) {
    if (!draggedField) {
      return
    }


    if (target === 'x') {
      const isDimension =
        dimensions.some(
          (field) =>
            field.key ===
            draggedField.key
        )

      if (!isDimension) {
        alert(
          'X축에는 차원 필드를 추가해 주세요.'
        )
        return
      }

      setXField(draggedField.key)
    }


    if (target === 'y') {
      const isMeasure =
        measures.some(
          (field) =>
            field.key ===
            draggedField.key
        )

      if (!isMeasure) {
        alert(
          'Y축에는 숫자 지표를 추가해 주세요.'
        )
        return
      }


      setYFields((current) => {
        if (
          current.includes(
            draggedField.key
          )
        ) {
          return current
        }

        return [
          ...current,
          draggedField.key,
        ]
      })
    }


    if (target === 'group') {
      const isDimension =
        dimensions.some(
          (field) =>
            field.key ===
            draggedField.key
        )

      if (!isDimension) {
        alert(
          '그룹에는 차원 필드를 추가해 주세요.'
        )
        return
      }

      setGroupField(
        draggedField.key
      )
    }

    if (target === 'filter') {
      const isDimension =
        dimensions.some(
          (field) =>
            field.key ===
            draggedField.key
        )

      if (!isDimension) {
        alert(
          '필터에는 차원 필드를 추가해 주세요.'
        )
        return
      }

      setFilterField(
        draggedField.key
      )

      setFilterValue('전체')
    }


    setDraggedField(null)
  }


  function removeYField(field) {
    setYFields((current) =>
      current.filter(
        (item) => item !== field
      )
    )
  }


  function resetBuilder() {
    setXField(null)
    setYFields([])
    setGroupField(null)
    setFilterField(null)
    setFilterValue('전체')
    setSortOrder('none')
    setEditingChartId(null)
    setTopN('all')
    setAggregation('sum')
    setNumberFormat('auto')
    setChartTitle('')
    setChartDescription('')
    setLegendVisible(true)
    setXAxisVisible(true)
    setYAxisVisible(true)
  }

  function getNewChartPosition() {
    const gap = 24
    const defaultWidth = 480
    const columns = 2

    const index = savedCharts.length

    const column = index % columns
    const row = Math.floor(index / columns)

    return {
      x: column * (defaultWidth + gap),
      y: row * (420 + gap),
    }
  }

  function addChartToDashboard() {
    if (chartType !== 'kpi' && !xField) {
      alert('X축을 먼저 설정해 주세요.')
      return
    }

    if (yFields.length === 0) {
      alert('Y축에 지표를 추가해 주세요.')
      return
    }

    if (editingChartId) {
      setSavedCharts((current) =>
        current.map((chart) =>
          chart.id === editingChartId
            ? {
              ...chart,
              chartType,
              xField,
              yFields: [...yFields],
              groupField,
              filterField,
              filterValue,
              selectedChannel,
              sortOrder,
              topN,
              aggregation,
              numberFormat,
              legendVisible,
              xAxisVisible,
              yAxisVisible,

              title:
                chartTitle.trim() ||
                (
                  chartType === 'kpi'
                    ? getLabel(yFields[0])
                    : `${getLabel(xField)}별 ${yFields
                      .map(getLabel)
                      .join(', ')}`
                ),

              description:
                chartDescription.trim(),
            }
            : chart
        )
      )

      setEditingChartId(null)

      alert('차트가 수정되었습니다.')

      return
    }

    const position = getNewChartPosition()

    const newChart = {
      id: Date.now(),
      chartType,
      xField,
      yFields: [...yFields],
      groupField,
      filterField,
      filterValue,
      selectedChannel,
      sortOrder,
      topN,
      aggregation,
      numberFormat,
      xAxisVisible,
      yAxisVisible,

      x: position.x,
      y: position.y,

      width: 480,
      height: 420,
      title:
        chartTitle.trim() ||
        (
          chartType === 'kpi'
            ? getLabel(yFields[0])
            : `${getLabel(xField)}별 ${yFields
              .map(getLabel)
              .join(', ')}`
        ),

      description:
        chartDescription.trim(),
    }

    setSavedCharts((current) => [
      ...current,
      newChart,
    ])
  }

  function duplicateChart(chart) {
    const duplicatedChart = {
      ...chart,
      id: Date.now(),
      title: `${chart.title} 복사본`,
      yFields: [...chart.yFields],

      width: chart.width || 560,
      height: chart.height || 480,
    }

    setSavedCharts((current) => [
      ...current,
      duplicatedChart,
    ])
  }

  function updateChartTitle(chartId, newTitle) {
    setSavedCharts((current) =>
      current.map((chart) =>
        chart.id === chartId
          ? {
            ...chart,
            title: newTitle,
          }
          : chart
      )
    )
  }

  function updateChartDimensions(
    chartId,
    width,
    height
  ) {
    const gridSize = 24

    const minWidth = 288
    const minHeight = 240

    const snappedWidth = Math.max(
      minWidth,
      Math.round(width / gridSize) *
      gridSize
    )

    const snappedHeight = Math.max(
      minHeight,
      Math.round(height / gridSize) *
      gridSize
    )

    setSavedCharts((current) =>
      current.map((chart) =>
        chart.id === chartId
          ? {
            ...chart,
            width: snappedWidth,
            height: snappedHeight,
          }
          : chart
      )
    )
  }


  function editSavedChart(chart) {
    setChartType(chart.chartType)
    setXField(chart.xField)
    setYFields([...chart.yFields])
    setGroupField(chart.groupField || null)
    setFilterField(chart.filterField || null)
    setFilterValue(chart.filterValue || '전체')
    setSelectedChannel(chart.selectedChannel || '전체')
    setSortOrder(chart.sortOrder || 'none')
    setTopN(chart.topN || 'all')
    setAggregation(
      chart.aggregation || 'sum'
    )
    setNumberFormat(
      chart.numberFormat || 'auto'
    )
    setChartTitle(
      chart.title || ''
    )

    setChartDescription(
      chart.description || ''
    )
    setLegendVisible(
      chart.legendVisible ?? true
    )

    setXAxisVisible(
      chart.xAxisVisible ?? true
    )

    setYAxisVisible(
      chart.yAxisVisible ?? true
    )

    setEditingChartId(chart.id)
  }

  function saveDashboard() {
    localStorage.setItem(
      'adScopeDashboard',
      JSON.stringify(savedCharts)
    )

    alert('대시보드가 저장되었습니다.')
  }

  function resetDashboard() {
    const confirmed = window.confirm(
      '대시보드를 초기화하시겠습니까?\n저장된 차트가 모두 삭제됩니다.'
    )

    if (!confirmed) {
      return
    }

    setSavedCharts([])

    setGlobalChannel('전체')
    setGlobalCampaign('전체')
    setGlobalProduct('전체')

    setDashboardCardSize('medium')
    setDashboardColumns('2')

    setEditingChartId(null)

    localStorage.removeItem(
      'adScopeDashboard'
    )

    localStorage.removeItem(
      'adScopeDashboardSettings'
    )
  }

  function getSavedChartData(chart) {

    const safeYFields =
      Array.isArray(chart.yFields)
        ? chart.yFields
        : []


    let data = mockAds

    if (globalBrand !== '전체') {
      data = data.filter(
        (row) =>
          row.brand === globalBrand
      )
    }

    if (startDate) {
      data = data.filter(
        (row) =>
          row.date >= startDate
      )
    }

    if (endDate) {
      data = data.filter(
        (row) =>
          row.date <= endDate
      )
    }

    if (globalChannel !== '전체') {
      data = data.filter(
        (row) =>
          row.channel === globalChannel
      )
    }

    if (globalCampaign !== '전체') {
      data = data.filter(
        (row) =>
          row.campaign === globalCampaign
      )
    }

    if (globalProduct !== '전체') {
      data = data.filter(
        (row) =>
          row.product === globalProduct
      )
    }




    if (
      chart.selectedChannel &&
      chart.selectedChannel !== '전체'
    ) {
      data = data.filter(
        (row) =>
          row.channel === chart.selectedChannel
      )
    }

    if (
      chart.filterField &&
      chart.filterValue !== '전체'
    ) {
      data = data.filter(
        (row) =>
          String(row[chart.filterField]) ===
          String(chart.filterValue)
      )
    }

    const xValues = [
      ...new Set(
        data.map(
          (row) => row[chart.xField]
        )
      ),
    ]

    const groupValues = chart.groupField
      ? [
        ...new Set(
          data.map(
            (row) => row[chart.groupField]
          )
        ),
      ]
      : []

    const chartData =
      xValues.map((xValue) => {
        const result = {
          [chart.xField]: xValue,
        }

        const rowsForX =
          data.filter(
            (row) =>
              row[chart.xField] === xValue
          )

        if (!chart.groupField) {
          safeYFields.forEach((metric) => {
            result[metric] =
              calculateMetric(
                rowsForX,
                metric,
                chart.aggregation || 'sum'
              )
          })

          return result
        }

        groupValues.forEach((groupValue) => {
          const groupRows =
            rowsForX.filter(
              (row) =>
                row[chart.groupField] ===
                groupValue
            )

          safeYFields.forEach((metric) => {
            const seriesKey =
              `${groupValue}__${metric}`

            result[seriesKey] =
              calculateMetric(
                groupRows,
                metric,
                chart.aggregation || 'sum'
              )
          })
        })

        return result
      })

    return {
      chartData,
      groupValues,
    }
  }



  function renderSavedSeries(
    chart,
    groupValues,
    type
  ) {
    if (!chart.groupField) {
      return chart.yFields.map(
        (field, index) => {
          const color =
            chartColors[
            index % chartColors.length
            ]

          if (type === 'bar') {
            return (
              <Bar
                key={field}
                dataKey={field}
                name={getLabel(field)}
                fill={color}
              />
            )
          }

          return (
            <Line
              key={field}
              type="monotone"
              dataKey={field}
              name={getLabel(field)}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color }}
            />
          )
        }
      )
    }

    return groupValues.flatMap(
      (groupValue, groupIndex) =>
        chart.yFields.map((field) => {
          const seriesKey =
            `${groupValue}__${field}`

          const seriesName =
            chart.yFields.length === 1
              ? String(groupValue)
              : `${groupValue} · ${getLabel(field)}`

          const color =
            chartColors[
            groupIndex %
            chartColors.length
            ]

          if (type === 'bar') {
            return (
              <Bar
                key={seriesKey}
                dataKey={seriesKey}
                name={seriesName}
                fill={color}
              />
            )
          }

          return (
            <Line
              key={seriesKey}
              type="monotone"
              dataKey={seriesKey}
              name={seriesName}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color }}
            />
          )
        })
    )
  }


  function renderSavedChart(chart) {

    const safeYFields =
      Array.isArray(chart.yFields)
        ? chart.yFields
        : []


    const {
      chartData,
      groupValues,
    } = getSavedChartData(chart)

    const savedSortedChartData = (() => {
      if (
        chart.sortOrder === 'none' ||
        !chart.sortOrder ||
        safeYFields.length === 0
      ) {
        return chartData
      }

      const metric = safeYFields[0]

      return [...chartData].sort((a, b) => {
        const aValue =
          Number(a[metric]) || 0

        const bValue =
          Number(b[metric]) || 0

        if (chart.sortOrder === 'asc') {
          return aValue - bValue
        }

        return bValue - aValue
      })
    })()

    const savedDisplayChartData =
      chart.topN === 'all' || !chart.topN
        ? savedSortedChartData
        : savedSortedChartData.slice(
          0,
          Number(chart.topN)
        )

    if (chart.chartType === 'kpi') {
      if (safeYFields.length !== 1) {
        return (
          <div className="saved-chart-error">
            KPI 카드는 Y축 지표가 1개 필요합니다.
          </div>
        )
      }

      let data = mockAds

      if (globalChannel !== '전체') {
        data = data.filter(
          (row) =>
            row.channel === globalChannel
        )
      }

      if (globalCampaign !== '전체') {
        data = data.filter(
          (row) =>
            row.campaign === globalCampaign
        )
      }

      if (globalProduct !== '전체') {
        data = data.filter(
          (row) =>
            row.product === globalProduct
        )
      }

      if (
        chart.selectedChannel &&
        chart.selectedChannel !== '전체'
      ) {
        data = data.filter(
          (row) =>
            row.channel === chart.selectedChannel
        )
      }

      if (
        chart.filterField &&
        chart.filterValue !== '전체'
      ) {
        data = data.filter(
          (row) =>
            String(row[chart.filterField]) ===
            String(chart.filterValue)
        )
      }

      const metric = safeYFields[0]

      const value = calculateMetric(
        data,
        metric,
        chart.aggregation || 'sum'
      )

      const displayValue =
        formatDisplayValue(
          value,
          chart.numberFormat || 'auto',
          metric
        )

      return (
        <div className="kpi-preview-card">
          <span className="kpi-preview-label">
            {getLabel(metric)}
          </span>

          <strong className="kpi-preview-value">
            {displayValue}
          </strong>
        </div>
      )
    }

    if (chart.chartType === 'donut') {
      if (!chart.xField) {
        return (
          <div className="saved-chart-error">
            도넛 차트는 X축 차원이 필요합니다.
          </div>
        )
      }

      if (safeYFields.length !== 1) {
        return (
          <div className="saved-chart-error">
            도넛 차트는 Y축 지표가 1개 필요합니다.
          </div>
        )
      }

      const metric = safeYFields[0]

      const pieData = (savedDisplayChartData || []).map((row) => ({
        name: row[chart.xField],
        value: row[metric],
      }))

      return (
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="45%"
              outerRadius="70%"
              paddingAngle={2}
            >
              {pieData.map((entry, index) => (
                <Cell
                  key={`${entry.name}-${index}`}
                  fill={
                    chartColors[
                    index % chartColors.length
                    ]
                  }
                />
              ))}
            </Pie>

            <Tooltip
              formatter={(value) =>
                formatDisplayValue(
                  value,
                  chart.numberFormat || 'auto',
                  safeYFields[0]
                )
              }
            />

            {(chart.legendVisible ?? true) && (
              <Legend />
            )}
          </PieChart>
        </ResponsiveContainer>
      )
    }

    if (chart.chartType === 'table') {
      if (!chart.xField) {
        return (
          <div className="saved-chart-error">
            데이터 테이블은 X축 차원이 필요합니다.
          </div>
        )
      }

      if (safeYFields.length === 0) {
        return (
          <div className="saved-chart-error">
            데이터 테이블은 Y축 지표가 1개 이상 필요합니다.
          </div>
        )
      }

      return (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  {getLabel(chart.xField)}
                </th>

                {(chart.yFields || []).map((field) => (
                  <th key={field}>
                    {getLabel(field)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {(savedDisplayChartData || []).map((row, index) => (
                <tr
                  key={`${row[chart.xField]}-${index}`}
                >
                  <td>
                    {row[chart.xField]}
                  </td>

                  {(chart.yFields || []).map((field) => (
                    <td key={field}>
                      {formatDisplayValue(
                        row[field],
                        chart.numberFormat || 'auto',
                        field
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>

          </table >
        </div >
      )
    }

    if (chart.chartType === 'bar') {
      return (
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <BarChart data={savedDisplayChartData}>
            <CartesianGrid
              strokeDasharray="3 3"
            />

            <XAxis
              dataKey={chart.xField}
              hide={!(chart.xAxisVisible ?? true)}
            />

            <YAxis
              width={90}
              hide={!(chart.yAxisVisible ?? true)}
              tickFormatter={(value) =>
                formatDisplayValue(
                  value,
                  chart.numberFormat || 'auto',
                  safeYFields[0]
                )
              }
            />

            <Tooltip
              formatter={(value, name) => {
                const metric =
                  chart.yFields.find(
                    (field) =>
                      getLabel(field) === name
                  ) || safeYFields[0]

                return formatDisplayValue(
                  value,
                  chart.numberFormat || 'auto',
                  metric
                )
              }}
            />

            {(chart.legendVisible ?? true) && (
              <Legend />
            )}

            {renderSavedSeries(
              chart,
              groupValues,
              'bar'
            )}
          </BarChart>
        </ResponsiveContainer>
      )
    }

    if (chart.chartType === 'scatter') {
      if (safeYFields.length < 2) {
        return (
          <div className="saved-chart-error">
            산점도는 Y축 지표가 2개 필요합니다.
          </div>
        )
      }

      const xMetric = safeYFields[0]
      const yMetric = chart.yFields[1]

      const scatterData =
        savedDisplayChartData
          .map((row) => ({
            x: Number(row[xMetric]) || 0,
            y: Number(row[yMetric]) || 0,
            name: row[chart.xField],
          }))
          .filter(
            (row) =>
              Number.isFinite(row.x) &&
              Number.isFinite(row.y)
          )

      return (
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <ScatterChart
            margin={{
              top: 20,
              right: 20,
              bottom: 20,
              left: 20,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
            />

            <XAxis
              type="number"
              dataKey="x"
              name={getLabel(xMetric)}
              hide={!(chart.xAxisVisible ?? true)}
            />

            <YAxis
              type="number"
              dataKey="y"
              name={getLabel(yMetric)}
              hide={!(chart.yAxisVisible ?? true)}
            />

            <Tooltip />

            {(chart.legendVisible ?? true) && (
              <Legend />
            )}

            <Scatter
              data={scatterData}
              name={`${getLabel(xMetric)} vs ${getLabel(yMetric)}`}
              fill={chartColors[0]}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )
    }

    return (
      <ResponsiveContainer
        width="100%"
        height="100%"
      >
        <LineChart
          data={savedDisplayChartData}
          margin={{
            top: 10,
            right: 20,
            bottom: 20,
            left: 10,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey={chart.xField}
            hide={!(chart.xAxisVisible ?? true)}
          />

          <YAxis
            width={90}
            hide={!(chart.yAxisVisible ?? true)}
            tickFormatter={(value) =>
              formatDisplayValue(
                value,
                chart.numberFormat || 'auto',
                safeYFields[0]
              )
            }
          />

          <Tooltip
            formatter={(value, name) =>
              formatDisplayValue(
                value,
                chart.numberFormat || 'auto',
                safeYFields[0]
              )
            }
          />

          {(chart.legendVisible ?? true) && (
            <Legend />
          )}

          {chart.groupField
            ? (groupValues || []).flatMap(
              (groupValue, groupIndex) =>
                safeYFields.map(
                  (metric, metricIndex) => {
                    const seriesKey =
                      `${groupValue}__${metric}`

                    const colorIndex =
                      (
                        groupIndex *
                        safeYFields.length +
                        metricIndex
                      ) %
                      chartColors.length

                    return (
                      <Line
                        key={seriesKey}
                        type="monotone"
                        dataKey={seriesKey}
                        name={`${groupValue} - ${getLabel(metric)}`}
                        stroke={
                          chartColors[colorIndex]
                        }
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                        isAnimationActive={false}
                      />
                    )
                  }
                )
            )
            : safeYFields.map(
              (metric, index) => (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  name={getLabel(metric)}
                  stroke={
                    chartColors[
                    index % chartColors.length
                    ]
                  }
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )
            )}
        </LineChart>
      </ResponsiveContainer>
    )
  }


  function renderSeries(type) {
    if (!groupField) {
      return yFields.map((field, index) => {
        const color =
          chartColors[index % chartColors.length]

        if (type === 'bar') {
          return (
            <Bar
              key={field}
              dataKey={field}
              name={getLabel(field)}
              fill={color}
            />
          )
        }

        return (
          <Line
            key={field}
            type="monotone"
            dataKey={field}
            name={getLabel(field)}
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color }}
          />
        )
      })
    }

    return groupValues.flatMap(
      (groupValue, groupIndex) =>
        yFields.map((field) => {
          const seriesKey =
            `${groupValue}__${field}`

          const seriesName =
            yFields.length === 1
              ? String(groupValue)
              : `${groupValue} · ${getLabel(field)}`

          const color =
            chartColors[
            groupIndex % chartColors.length
            ]

          if (type === 'bar') {
            return (
              <Bar
                key={seriesKey}
                dataKey={seriesKey}
                name={seriesName}
                fill={color}
              />
            )
          }

          return (
            <Line
              key={seriesKey}
              type="monotone"
              dataKey={seriesKey}
              name={seriesName}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color }}
            />
          )
        })
    )
  }


  function renderChart() {
    // =========================
    // KPI 카드
    // =========================
    if (chartType === 'kpi') {
      if (yFields.length !== 1) {
        return (
          <div className="empty-chart">
            KPI 카드는 Y축에 지표를 1개만 추가해 주세요.
          </div>
        )
      }

      const metric = yFields[0]

      const value = calculateMetric(
        filteredData,
        metric,
        aggregation
      )

      const displayValue =
        formatDisplayValue(
          value,
          numberFormat,
          metric
        )

      return (
        <div className="kpi-preview-card">
          <span className="kpi-preview-label">
            {getLabel(metric)}
          </span>

          <strong className="kpi-preview-value">
            {displayValue}
          </strong>
        </div>
      )
    }


    // =========================
    // 도넛 차트
    // =========================
    if (chartType === 'donut') {
      if (!xField) {
        return (
          <div className="empty-chart">
            도넛 차트는 X축에 차원 필드가 필요합니다.
          </div>
        )
      }

      if (yFields.length !== 1) {
        return (
          <div className="empty-chart">
            도넛 차트는 Y축에 지표를 1개만 추가해 주세요.
          </div>
        )
      }

      const metric = yFields[0]

      const pieData =
        displayChartData.map((row) => ({
          name: row[xField],
          value: row[metric],
        }))

      return (
        <ResponsiveContainer
          width="100%"
          height={340}
        >
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
              paddingAngle={2}
              label
            >
              {pieData.map((entry, index) => (
                <Cell
                  key={`${entry.name}-${index}`}
                  fill={
                    chartColors[
                    index % chartColors.length
                    ]
                  }
                />
              ))}
            </Pie>

            <Tooltip
              formatter={(value) =>
                formatDisplayValue(
                  value,
                  numberFormat,
                  metric
                )
              }
            />

            {legendVisible && <Legend />}
          </PieChart>
        </ResponsiveContainer>
      )
    }


    // =========================
    // 일반 차트 공통 검증
    // =========================
    if (!xField) {
      return (
        <div className="empty-chart">
          X축에 필드를 추가해 주세요.
        </div>
      )
    }

    if (yFields.length === 0) {
      return (
        <div className="empty-chart">
          Y축에 숫자 지표를 추가해 주세요.
        </div>
      )
    }


    // =========================
    // 데이터 테이블
    // =========================
    if (chartType === 'table') {
      return (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  {getLabel(xField)}
                </th>

                {yFields.map((field) => (
                  <th key={field}>
                    {getLabel(field)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {displayChartData.map(
                (row, index) => (
                  <tr
                    key={`${row[xField]}-${index}`}
                  >
                    <td>
                      {row[xField]}
                    </td>

                    {yFields.map((field) => (
                      <td key={field}>
                        {formatDisplayValue(
                          row[field],
                          numberFormat,
                          field
                        )}
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )
    }


    // =========================
    // 막대 그래프
    // =========================
    if (chartType === 'bar') {
      return (
        <ResponsiveContainer
          width="100%"
          height={340}
        >
          <BarChart
            data={displayChartData}
          >
            <CartesianGrid
              strokeDasharray="3 3"
            />

            <XAxis
              dataKey={xField}
              hide={!xAxisVisible}
            />

            {yAxisVisible && (
              <YAxis
                width={90}
                hide={!yAxisVisible}
                tickFormatter={(value) =>
                  formatDisplayValue(
                    value,
                    numberFormat,
                    yFields[0]
                  )
                }
              />
            )}

            <Tooltip
              formatter={(value, name) => {
                const metric =
                  yFields.find(
                    (field) =>
                      getLabel(field) === name
                  ) || yFields[0]

                return formatDisplayValue(
                  value,
                  numberFormat,
                  metric
                )
              }}
            />

            {legendVisible && <Legend />}

            {renderSeries('bar')}
          </BarChart>
        </ResponsiveContainer>
      )
    }


    // =========================
    // 산점도
    // =========================
    if (chartType === 'scatter') {
      if (yFields.length < 2) {
        return (
          <div className="empty-chart">
            산점도는 Y축에 숫자 지표를
            2개 추가해 주세요.
          </div>
        )
      }

      const xMetric = yFields[0]
      const yMetric = yFields[1]

      const scatterData =
        displayChartData
          .map((row) => ({
            x: Number(row[xMetric]) || 0,
            y: Number(row[yMetric]) || 0,
            name: row[xField],
          }))
          .filter(
            (row) =>
              Number.isFinite(row.x) &&
              Number.isFinite(row.y)
          )

      return (
        <ResponsiveContainer
          width="100%"
          height={340}
        >
          <ScatterChart
            margin={{
              top: 20,
              right: 20,
              bottom: 20,
              left: 20,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
            />

            <XAxis
              type="number"
              dataKey="x"
              name={getLabel(xMetric)}
              hide={!xAxisVisible}
              tickFormatter={(value) =>
                formatDisplayValue(
                  value,
                  numberFormat,
                  xMetric
                )
              }
            />

            <YAxis
              type="number"
              dataKey="y"
              name={getLabel(yMetric)}
              hide={!yAxisVisible}
              tickFormatter={(value) =>
                formatDisplayValue(
                  value,
                  numberFormat,
                  yMetric
                )
              }
            />

            <Tooltip
              cursor={{
                strokeDasharray: '3 3',
              }}
              formatter={(value, name) =>
                formatDisplayValue(
                  value,
                  numberFormat,
                  name === getLabel(xMetric)
                    ? xMetric
                    : yMetric
                )
              }
            />

            {(legendVisible ?? true) && (
              <Legend />
            )}

            <Scatter
              data={scatterData}
              name={`${getLabel(xMetric)} vs ${getLabel(yMetric)}`}
              fill={chartColors[0]}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )
    }


    // =========================
    // 기본: 선 그래프
    // =========================
    return (
      <ResponsiveContainer
        width="100%"
        height={340}
      >
        <LineChart
          data={displayChartData}
        >
          <CartesianGrid
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey={xField}
            hide={!xAxisVisible}
          />

          {yAxisVisible && (
            <YAxis
              width={90}
              hide={!yAxisVisible}
              tickFormatter={(value) =>
                formatDisplayValue(
                  value,
                  numberFormat,
                  yFields[0]
                )
              }
            />
          )}

          <Tooltip
            formatter={(value, name) => {
              const metric =
                yFields.find(
                  (field) =>
                    getLabel(field) === name
                ) || yFields[0]

              return formatDisplayValue(
                value,
                numberFormat,
                metric
              )
            }}
          />

          {legendVisible && <Legend />}

          {renderSeries('line')}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (sharedProposalToken) {
    if (sharedProposalLoading) {
      return (
        <div className="shared-proposal-page">
          <div className="shared-proposal-card">
            제안을 불러오는 중입니다.
          </div>
        </div>
      )
    }

    if (sharedProposalError) {
      return (
        <div className="shared-proposal-page">
          <div className="shared-proposal-card">
            <h2>
              제안을 확인할 수 없습니다.
            </h2>

            <p>
              {sharedProposalError}
            </p>
          </div>
        </div>
      )
    }

    if (!sharedProposal) {
      return (
        <div className="shared-proposal-page">
          <div className="shared-proposal-card">
            제안 정보를 준비하고 있습니다.
          </div>
        </div>
      )
    }

    return (
      <div className="shared-proposal-page">
        <div className="shared-proposal-container">
          <header className="shared-proposal-header">
            <div>
              <span className="shared-proposal-eyebrow">
                광고 예산 최적화 제안
              </span>

              <h1>
                {sharedProposal.scenarioName ||
                  '최적화 제안'}
              </h1>

              <p>
                광고 성과 데이터를 기반으로
                산출된 예산 최적화 제안입니다.
              </p>
            </div>

            <span className="shared-proposal-status">
              {getClientProposalStatusLabel(
                sharedProposal.status
              )}
            </span>
          </header>

          <section className="shared-proposal-summary">
            <div>
              <span>
                총 예산
              </span>

              <strong>
                {Math.round(
                  sharedProposal.totalBudget ??
                  (sharedProposal.allocations || [])
                    .reduce(
                      (sum, allocation) =>
                        sum +
                        Number(
                          allocation.optimizedBudget || 0
                        ),
                      0
                    )
                ).toLocaleString()}
                원
              </strong>
            </div>

            <div>
              <span>
                예상 매출
              </span>

              <strong>
                {Math.round(
                  sharedProposal.summary
                    ?.projectedRevenue || 0
                ).toLocaleString()}
                원
              </strong>
            </div>

            <div>
              <span>
                예상 ROAS
              </span>

              <strong>
                {Number(
                  sharedProposal.summary
                    ?.projectedRoas || 0
                ).toFixed(1)}
                %
              </strong>
            </div>

            <div>
              <span>
                예상 CPA
              </span>

              <strong>
                {sharedProposal.summary
                  ?.projectedCpa != null
                  ? `${Math.round(
                    sharedProposal.summary
                      .projectedCpa
                  ).toLocaleString()}원`
                  : '-'}
              </strong>
            </div>
          </section>

          <section className="shared-proposal-section">
            <div className="shared-proposal-section-header">
              <h2>
                매체별 최적 예산
              </h2>

              <span>
                현재 예산 대비 최적화 권장안
              </span>
            </div>

            <div className="shared-proposal-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>
                      매체
                    </th>

                    <th>
                      현재 예산
                    </th>

                    <th>
                      제안 예산
                    </th>

                    <th>
                      변화율
                    </th>

                    <th>
                      예상 ROAS
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {(sharedProposal.allocations ||
                    []).map(
                      (allocation) => (
                        <tr
                          key={
                            allocation.channel
                          }
                        >
                          <td>
                            {allocation.channel}
                          </td>

                          <td>
                            {Math.round(
                              allocation.currentBudget ||
                              0
                            ).toLocaleString()}
                            원
                          </td>

                          <td>
                            {Math.round(
                              allocation.optimizedBudget ||
                              0
                            ).toLocaleString()}
                            원
                          </td>

                          <td>
                            {Number(
                              allocation.budgetChangeRate ||
                              0
                            ).toFixed(1)}
                            %
                          </td>

                          <td>
                            {Number(
                              allocation.projectedRoas ||
                              0
                            ).toFixed(1)}
                            %
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="shared-proposal-section">
            <div className="shared-proposal-response-header">
              <div>
                <h2>
                  검토 및 응답
                </h2>

                <p>
                  제안 내용을 검토하신 후 의견을 남기거나
                  승인해주세요.
                </p>
              </div>
            </div>

            {sharedProposal.status ===
              'reviewing' ? (
              <>
                <label className="shared-proposal-revision-label">
                  의견 및 수정 요청
                </label>

                <textarea
                  rows="5"
                  value={
                    sharedRevisionReason
                  }
                  placeholder="예: Meta 예산 비중을 조금 줄이고 Google 예산을 늘려주세요."
                  onChange={(event) =>
                    setSharedRevisionReason(
                      event.target.value
                    )
                  }
                />

                <div className="shared-proposal-actions">
                  <button
                    type="button"
                    className="shared-proposal-revision-button"
                    disabled={
                      sharedProposalSubmitting ||
                      !sharedRevisionReason.trim()
                    }
                    onClick={() =>
                      submitSharedProposalAction(
                        'revision_requested'
                      )
                    }
                  >
                    수정 요청
                  </button>

                  <button
                    type="button"
                    className="shared-proposal-approve-button"
                    disabled={
                      sharedProposalSubmitting
                    }
                    onClick={() => {
                      const confirmed =
                        window.confirm(
                          '현재 제안을 승인하시겠습니까?'
                        )

                      if (!confirmed) {
                        return
                      }

                      submitSharedProposalAction(
                        'approved'
                      )
                    }}
                  >
                    제안 승인
                  </button>
                </div>
              </>
            ) : (
              <div className="shared-proposal-response-status">
                {sharedProposal.status ===
                  'revision_requested'
                  ? (
                    <>
                      <strong>
                        수정 요청이 전달되었습니다.
                      </strong>

                      <p>
                        담당자가 요청사항을 검토하고
                        수정안을 준비합니다.
                      </p>
                    </>
                  )
                  : sharedProposal.status ===
                    'approved'
                    ? (
                      <>
                        <strong>
                          제안 승인이 완료되었습니다.
                        </strong>

                        <p>
                          승인해주셔서 감사합니다.
                        </p>
                      </>
                    )
                    : (
                      <p>
                        현재 제안 상태를 확인하고 있습니다.
                      </p>
                    )}
              </div>
            )}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <h1>AdScope</h1>

          <p>
            멀티채널 광고 분석
          </p>
        </div>

        <div className="topbar-content">

          <div className="topbar-nav-row">
            <button
              type="button"
              className={
                activePage === 'dashboard'
                  ? 'page-nav-button active'
                  : 'page-nav-button'
              }
              onClick={() =>
                setActivePage('dashboard')
              }
            >
              대시보드
            </button>

            <button
              type="button"
              className={
                activePage === 'performance'
                  ? 'page-nav-button active'
                  : 'page-nav-button'
              }
              onClick={() =>
                setActivePage('performance')
              }
            >
              성과 분석
            </button>

            <button
              type="button"
              className={
                activePage === 'budget'
                  ? 'page-nav-button active'
                  : 'page-nav-button'
              }
              onClick={() =>
                setActivePage('budget')
              }
            >
              예산 최적화
            </button>

            <button
              type="button"
              className={
                activePage === 'scenario'
                  ? 'page-nav-button active'
                  : 'page-nav-button'
              }
              onClick={() =>
                setActivePage('scenario')
              }
            >
              시나리오 관리
            </button>

            <button
              type="button"
              className="page-nav-button"
              onClick={() => {
                setIsClientHubOpen(true)
                loadInternalUnreadCount()
              }}
            >
              광고주 소통

              {internalUnreadCount > 0 && (
                <span className="nav-unread-badge">
                  {internalUnreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              className={
                activePage === 'alerts'
                  ? 'page-nav-button active'
                  : 'page-nav-button'
              }
              onClick={() => {
                setActivePage(
                  'alerts'
                )

                loadAnomalyAlerts()
              }}
            >
              🔔 이상 알림

              {anomalyAlertSummary
                .open > 0 && (
                  <span className="nav-unread-badge">
                    {
                      anomalyAlertSummary
                        .open
                    }
                  </span>
                )}
            </button>

            <button
              type="button"
              className={
                activePage === 'tasks'
                  ? 'page-nav-button active'
                  : 'page-nav-button'
              }
              onClick={() =>
                setActivePage('tasks')
              }
            >
              업무 관리
            </button>
          </div>

          <div className="topbar-control-row">

            {advertiserManagerOpen && (
              <div
                className="advertiser-manager-overlay"
                onClick={() => {
                  setAdvertiserManagerOpen(false)
                  setAdvertiserManagerMode('list')
                  setEditingAdvertiserId(null)
                }}
              >
                <div
                  className="advertiser-manager-modal"
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                >
                  <div className="advertiser-manager-header">
                    <div>
                      <h2>
                        광고주 관리
                      </h2>

                      <p>
                        광고주를 추가하거나 기존 광고주 정보를
                        수정할 수 있습니다.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="advertiser-manager-close"
                      onClick={() => {
                        setAdvertiserManagerOpen(false)
                        setAdvertiserManagerMode('list')
                        setEditingAdvertiserId(null)
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {advertiserManagerMode === 'list' && (
                    <>
                      <div className="advertiser-manager-toolbar">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAdvertiserId(null)

                            setAdvertiserForm({
                              name: '',
                              companyName: '',
                              contactName: '',
                              contactEmail: '',
                              contactPhone: '',
                            })

                            setAdvertiserManagerMode(
                              'create'
                            )
                          }}
                        >
                          + 광고주 추가
                        </button>
                      </div>

                      <div className="advertiser-manager-list">
                        {advertisersLoading ? (
                          <div className="advertiser-manager-empty">
                            광고주 목록을 불러오는 중입니다.
                          </div>
                        ) : advertisers.length === 0 ? (
                          <div className="advertiser-manager-empty">
                            등록된 광고주가 없습니다.
                          </div>
                        ) : (
                          advertisers.map(
                            (advertiser) => {
                              const isArchived =
                                advertiser.status ===
                                'archived'

                              return (
                                <div
                                  key={advertiser.id}
                                  className={
                                    `advertiser-manager-item ${isArchived
                                      ? 'archived'
                                      : ''
                                    }`
                                  }
                                >
                                  <div className="advertiser-manager-item-main">
                                    <div className="advertiser-manager-item-title">
                                      <strong>
                                        {advertiser.name}
                                      </strong>

                                      <span
                                        className={
                                          `advertiser-status-badge ${isArchived
                                            ? 'archived'
                                            : 'active'
                                          }`
                                        }
                                      >
                                        {isArchived
                                          ? '비활성'
                                          : '활성'}
                                      </span>
                                    </div>

                                    <div className="advertiser-manager-item-meta">
                                      {advertiser.companyName && (
                                        <span>
                                          회사명: {
                                            advertiser.companyName
                                          }
                                        </span>
                                      )}

                                      {advertiser.contactName && (
                                        <span>
                                          담당자: {
                                            advertiser.contactName
                                          }
                                        </span>
                                      )}

                                      {advertiser.contactEmail && (
                                        <span>
                                          이메일: {
                                            advertiser.contactEmail
                                          }
                                        </span>
                                      )}

                                      {advertiser.contactPhone && (
                                        <span>
                                          연락처: {
                                            advertiser.contactPhone
                                          }
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="advertiser-manager-item-actions">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingAdvertiserId(
                                          advertiser.id
                                        )

                                        setAdvertiserForm({
                                          name:
                                            advertiser.name ||
                                            '',
                                          companyName:
                                            advertiser.companyName ||
                                            '',
                                          contactName:
                                            advertiser.contactName ||
                                            '',
                                          contactEmail:
                                            advertiser.contactEmail ||
                                            '',
                                          contactPhone:
                                            advertiser.contactPhone ||
                                            '',
                                        })

                                        setAdvertiserManagerMode(
                                          'edit'
                                        )
                                      }}
                                    >
                                      수정
                                    </button>

                                    {isArchived ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          changeAdvertiserStatus(
                                            advertiser.id,
                                            'active'
                                          )
                                        }
                                      >
                                        복원
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          changeAdvertiserStatus(
                                            advertiser.id,
                                            'archived'
                                          )
                                        }
                                      >
                                        비활성화
                                      </button>

                                    )}
                                    <button
                                      type="button"
                                      className="advertiser-delete-button"
                                      onClick={() =>
                                        deleteAdvertiser(
                                          advertiser.id
                                        )
                                      }
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </div>
                              )
                            }
                          )
                        )}
                      </div>
                    </>
                  )}

                  {(advertiserManagerMode === 'create' ||
                    advertiserManagerMode === 'edit') && (
                      <div className="advertiser-manager-form">
                        <div className="advertiser-manager-form-header">
                          <h3>
                            {advertiserManagerMode ===
                              'create'
                              ? '광고주 추가'
                              : '광고주 수정'}
                          </h3>
                        </div>

                        <label>
                          <span>
                            광고주명 *
                          </span>

                          <input
                            type="text"
                            value={
                              advertiserForm.name
                            }
                            onChange={(event) =>
                              setAdvertiserForm(
                                (previous) => ({
                                  ...previous,
                                  name:
                                    event.target.value,
                                })
                              )
                            }
                            placeholder="광고주명을 입력하세요."
                          />
                        </label>

                        <label>
                          <span>
                            회사명
                          </span>

                          <input
                            type="text"
                            value={
                              advertiserForm.companyName
                            }
                            onChange={(event) =>
                              setAdvertiserForm(
                                (previous) => ({
                                  ...previous,
                                  companyName:
                                    event.target.value,
                                })
                              )
                            }
                            placeholder="회사명을 입력하세요."
                          />
                        </label>

                        <label>
                          <span>
                            담당자명
                          </span>

                          <input
                            type="text"
                            value={
                              advertiserForm.contactName
                            }
                            onChange={(event) =>
                              setAdvertiserForm(
                                (previous) => ({
                                  ...previous,
                                  contactName:
                                    event.target.value,
                                })
                              )
                            }
                            placeholder="담당자명을 입력하세요."
                          />
                        </label>

                        <label>
                          <span>
                            담당자 이메일
                          </span>

                          <input
                            type="email"
                            value={
                              advertiserForm.contactEmail
                            }
                            onChange={(event) =>
                              setAdvertiserForm(
                                (previous) => ({
                                  ...previous,
                                  contactEmail:
                                    event.target.value,
                                })
                              )
                            }
                            placeholder="example@company.com"
                          />
                        </label>

                        <label>
                          <span>
                            담당자 연락처
                          </span>

                          <input
                            type="text"
                            value={
                              advertiserForm.contactPhone
                            }
                            onChange={(event) =>
                              setAdvertiserForm(
                                (previous) => ({
                                  ...previous,
                                  contactPhone:
                                    event.target.value,
                                })
                              )
                            }
                            placeholder="010-0000-0000"
                          />
                        </label>

                        <div className="advertiser-manager-form-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setAdvertiserManagerMode(
                                'list'
                              )

                              setEditingAdvertiserId(
                                null
                              )

                              setAdvertiserForm({
                                name: '',
                                companyName: '',
                                contactName: '',
                                contactEmail: '',
                                contactPhone: '',
                              })
                            }}
                          >
                            취소
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (
                                advertiserManagerMode ===
                                'create'
                              ) {
                                createAdvertiser()
                              } else {
                                updateAdvertiser()
                              }
                            }}
                          >
                            {advertiserManagerMode ===
                              'create'
                              ? '광고주 추가'
                              : '수정사항 저장'}
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            <div className="advertiser-selector">
              <span className="advertiser-selector-label">
                현재 광고주
              </span>

              <select
                className="advertiser-selector-select"
                value={selectedAdvertiserId}
                onChange={(event) => {
                  setSelectedAdvertiserId(
                    event.target.value
                  )
                }}
                disabled={
                  advertisersLoading ||
                  advertisers.length === 0
                }
              >
                {advertisersLoading ? (
                  <option value="">
                    광고주 불러오는 중
                  </option>
                ) : advertisers.length === 0 ? (
                  <option value="">
                    등록된 광고주 없음
                  </option>
                ) : (
                  advertisers
                    .filter(
                      (advertiser) =>
                        advertiser.status !==
                        'archived'
                    )
                    .map(
                      (advertiser) => (
                        <option
                          key={advertiser.id}
                          value={advertiser.id}
                        >
                          {advertiser.name}
                        </option>
                      )
                    )
                )}
              </select>

              <button
                type="button"
                className="advertiser-manager-button"
                onClick={() => {
                  setAdvertiserManagerOpen(true)
                }}
              >
                광고주 관리
              </button>
            </div>

            <div className="topbar-action-group">
              <button
                type="button"
                className={
                  mediaDataPanelOpen
                    ? 'topbar-action-button active'
                    : 'topbar-action-button'
                }
                onClick={() =>
                  setMediaDataPanelOpen(true)
                }
              >
                매체 데이터 가져오기
              </button>

              <button
                type="button"
                className="topbar-action-button"
                onClick={saveDashboard}
              >
                대시보드 저장
              </button>

              <button
                type="button"
                className="topbar-action-button"
                onClick={() => {
                  localStorage.removeItem(
                    'adscope_operator_access_token'
                  )

                  localStorage.removeItem(
                    'adscope_operator_user'
                  )

                  window.location.href =
                    '/operator/login'
                }}
              >
                로그아웃
              </button>
            </div>

          </div>

        </div>
      </header>


      <section className="filters">


        <div className="performance-toolbar compact">
          <div className="performance-filter-row">
            <div className="compact-filter brand-filter">
              <span>브랜드</span>

              <select
                value={globalBrand}
                onChange={(e) => {
                  setGlobalBrand(
                    e.target.value
                  )

                  setGlobalChannel('전체')
                  setGlobalCampaign('전체')
                  setGlobalProduct('전체')
                }}
              >
                <option value="전체">
                  전체 브랜드
                </option>

                {[
                  ...new Set(
                    performanceSourceRows
                      .map((row) => row.brand)
                      .filter(Boolean)
                  ),
                ].map((brand) => (
                  <option
                    key={brand}
                    value={brand}
                  >
                    {brand}
                  </option>
                ))}
              </select>
            </div>

            <div className="compact-filter">
              <span>기간</span>

              <select
                value={performancePeriod}
                onChange={(e) => {
                  const nextPeriod =
                    e.target.value

                  setPerformancePeriod(
                    nextPeriod
                  )

                  applyPerformancePeriod(
                    nextPeriod
                  )
                }}
              >
                <option value="7d">
                  최근 7일
                </option>

                <option value="30d">
                  최근 30일
                </option>

                <option value="90d">
                  최근 90일
                </option>

                <option value="all">
                  전체 기간
                </option>
              </select>
            </div>

            <div className="compact-filter">
              <span>데이터 소스</span>

              <select
                value={performanceDataSource}
                onChange={(e) =>
                  setPerformanceDataSource(
                    e.target.value
                  )
                }
              >
                <option value="mock">
                  Mock 데이터
                </option>

                <option value="naver">
                  Naver 실데이터
                </option>
              </select>
            </div>

            <div className="compact-filter">
              <span>매체</span>

              <select
                value={globalChannel}
                onChange={(e) => {
                  setGlobalChannel(
                    e.target.value
                  )

                  setGlobalCampaign('전체')
                  setGlobalProduct('전체')
                }}
              >
                <option value="전체">
                  전체 매체
                </option>

                {globalChannelOptions.map(
                  (channel) => (
                    <option
                      key={channel}
                      value={channel}
                    >
                      {channel}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="compact-filter campaign-filter">
              <span>캠페인</span>

              <select
                value={globalCampaign}
                onChange={(e) => {
                  setGlobalCampaign(
                    e.target.value
                  )

                  setGlobalProduct('전체')
                }}
              >
                <option value="전체">
                  전체 캠페인
                </option>

                {globalCampaignOptions.map(
                  (campaign) => (
                    <option
                      key={campaign}
                      value={campaign}
                    >
                      {campaign}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="compact-filter">
              <span>제품</span>

              <select
                value={globalProduct}
                onChange={(e) =>
                  setGlobalProduct(
                    e.target.value
                  )
                }
              >
                <option value="전체">
                  전체 제품
                </option>

                {globalProductOptions.map(
                  (product) => (
                    <option
                      key={product}
                      value={product}
                    >
                      {product}
                    </option>
                  )
                )}
              </select>
            </div>

            <button
              type="button"
              className="compact-reset-button"
              onClick={() => {
                setGlobalBrand('전체')
                setGlobalChannel('전체')
                setGlobalCampaign('전체')
                setGlobalProduct('전체')
              }}
            >
              필터 초기화
            </button>
          </div>

          <div className="performance-meta-row">
            <div className="date-range-inline">
              <input
                type="date"
                value={startDate}
                onChange={(e) =>
                  setStartDate(
                    e.target.value
                  )
                }
              />

              <span>~</span>

              <input
                type="date"
                value={endDate}
                onChange={(e) =>
                  setEndDate(
                    e.target.value
                  )
                }
              />
            </div>

            {performanceDataSource === 'naver' && (
              <>
                <div className="sync-inline-status">
                  <span className="sync-dot" />

                  <strong>
                    {naverSyncStatus ===
                      'syncing'
                      ? '동기화 중'
                      : '최신 데이터'}
                  </strong>

                  {naverLatestDate && (
                    <span>
                      · {naverLatestDate}
                    </span>
                  )}
                </div>

                {naverBackfillJob && (
                  <>
                    {naverBackfillJob.status ===
                      'completed' ? (
                      <div className="backfill-complete-badge">
                        <span className="backfill-check">
                          ✓
                        </span>

                        <span>
                          과거 데이터 수집 완료
                        </span>
                      </div>
                    ) : (
                      <div className="backfill-inline-status">
                        <span>
                          과거 데이터
                        </span>

                        <strong>
                          {Number(
                            naverBackfillJob.progress ||
                            0
                          ).toFixed(0)}
                          %
                        </strong>

                        <span>
                          ·{' '}
                          {naverBackfillJob.completedDays ||
                            0}
                          /
                          {naverBackfillJob.totalDays ||
                            0}
                          일
                        </span>
                      </div>
                    )}
                  </>
                )}

                <div className="performance-data-menu">
                  <button
                    type="button"
                    className="data-management-button"
                    onClick={() =>
                      setPerformanceDataMenuOpen(
                        (current) => !current
                      )
                    }
                  >
                    데이터 관리
                    <span className="data-menu-arrow">
                      {performanceDataMenuOpen
                        ? '▲'
                        : '▼'}
                    </span>
                  </button>

                  {performanceDataMenuOpen && (
                    <div className="performance-data-dropdown">
                      <div className="data-dropdown-header">
                        Naver 데이터 관리
                      </div>

                      <div className="data-dropdown-status">
                        <span>최신 데이터</span>

                        <strong>
                          {naverLatestDate || '-'}
                        </strong>
                      </div>

                      <div className="data-dropdown-status">
                        <span>과거 데이터</span>

                        <strong>
                          {naverBackfillJob?.status ===
                            'completed'
                            ? '수집 완료'
                            : `${Number(
                              naverBackfillJob?.progress ||
                              0
                            ).toFixed(0)}%`}
                        </strong>
                      </div>

                      <div className="data-dropdown-divider" />

                      <button
                        type="button"
                        className="data-dropdown-action"
                        onClick={async () => {
                          setPerformanceDataMenuOpen(false)
                          await handleNaverRangeSync()
                        }}
                        disabled={isNaverSyncing}
                      >
                        <strong>
                          선택 기간 다시 동기화
                        </strong>

                        <span>
                          현재 설정된 날짜 범위를
                          Naver에서 다시 가져옵니다.
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      </section>

      {activePage === 'performance' && (
        <>
          <div className="performance-tabs">
            {[
              ['summary', '요약'],
              ['channel', '매체'],
              ['campaign', '캠페인'],
              ['product', '제품'],
              ['content', '콘텐츠'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={
                  performanceTab === key
                    ? 'performance-tab active'
                    : 'performance-tab'
                }
                onClick={() =>
                  setPerformanceTab(key)
                }
              >
                {label}
              </button>
            ))}
          </div>
          {performanceTab === 'summary' && (
            <>
              <section className="performance-comparison">
                <div className="performance-comparison-header">
                  <h2>기간 성과 비교</h2>

                  <div className="performance-period-info">
                    <span>
                      현재 {startDate || '-'} ~ {endDate || '-'}
                    </span>

                    <span className="performance-period-vs">
                      vs
                    </span>

                    <span>
                      이전 {previousPeriodRange.start || '-'} ~{' '}
                      {previousPeriodRange.end || '-'}
                    </span>
                  </div>
                </div>

                <div className="performance-kpi-grid">
                  {[
                    {
                      key: 'spend',
                      label: '광고비',
                      suffix: '원',
                    },
                    {
                      key: 'revenue',
                      label: '매출',
                      suffix: '원',
                    },
                    {
                      key: 'roas',
                      label: 'ROAS',
                      suffix: '%',
                    },
                    {
                      key: 'cpa',
                      label: 'CPA',
                      suffix: '원',
                    },
                    {
                      key: 'ctr',
                      label: 'CTR',
                      suffix: '%',
                    },
                    {
                      key: 'conversions',
                      label: '전환',
                      suffix: '건',
                    },
                  ].map((item) => {
                    const metric =
                      performanceComparison[item.key]

                    const change = metric.change

                    const positiveWhenUp = [
                      'revenue',
                      'conversions',
                      'roas',
                      'ctr',
                    ].includes(item.key)

                    const positiveWhenDown =
                      item.key === 'cpa'

                    const isPositive =
                      change !== null &&
                      (
                        (
                          positiveWhenUp &&
                          change > 0
                        ) ||
                        (
                          positiveWhenDown &&
                          change < 0
                        )
                      )

                    const isNegative =
                      change !== null &&
                      (
                        (
                          positiveWhenUp &&
                          change < 0
                        ) ||
                        (
                          positiveWhenDown &&
                          change > 0
                        )
                      )

                    return (
                      <div
                        key={item.key}
                        className="performance-kpi-card"
                      >
                        <span className="performance-kpi-label">
                          {item.label}
                        </span>

                        <strong className="performance-kpi-value">
                          {item.key === 'roas' ||
                            item.key === 'ctr'
                            ? `${metric.current.toFixed(
                              item.key === 'ctr'
                                ? 2
                                : 1
                            )}%`
                            : `${Math.round(
                              metric.current
                            ).toLocaleString()}${item.suffix}`}
                        </strong>

                        <div className="performance-kpi-change">
                          {change === null ? (
                            <span className="change-neutral">
                              비교 데이터 없음
                            </span>
                          ) : (
                            <span
                              className={
                                item.key === 'spend'
                                  ? 'change-neutral'
                                  : isPositive
                                    ? 'change-up'
                                    : isNegative
                                      ? 'change-down'
                                      : 'change-neutral'
                              }
                            >
                              {change > 0
                                ? '▲'
                                : change < 0
                                  ? '▼'
                                  : '–'}

                              {' '}

                              {Math.abs(change).toFixed(1)}%
                            </span>
                          )}

                          <small>
                            이전 기간 대비
                          </small>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>


              <section className="performance-insights-section">
                <div className="performance-insights-header">
                  <div>
                    <h2>
                      성과 인사이트
                    </h2>

                    <span>
                      현재 필터 기준 자동 분석
                    </span>
                  </div>
                </div>

                <div className="performance-insights-grid">

                  <div className="performance-insight-card">
                    <span>
                      최고 ROAS
                    </span>

                    <strong>
                      {bestRoasCampaign
                        ? `${bestRoasCampaign.channel} · ${bestRoasCampaign.campaign}`
                        : '-'}
                    </strong>

                    <p>
                      {bestRoasCampaign
                        ? `ROAS ${bestRoasCampaign.roas.toFixed(1)}%`
                        : '데이터 없음'}
                    </p>

                    <small>
                      가장 높은 광고 효율을 기록한 캠페인입니다.
                    </small>
                  </div>


                  <div className="performance-insight-card">
                    <span>
                      최고 매출
                    </span>

                    <strong>
                      {bestRevenueCampaign
                        ? `${bestRevenueCampaign.channel} · ${bestRevenueCampaign.campaign}`
                        : '-'}
                    </strong>

                    <p>
                      {bestRevenueCampaign
                        ? `매출 ${Math.round(
                          bestRevenueCampaign.revenue
                        ).toLocaleString()}원`
                        : '데이터 없음'}
                    </p>

                    <small>
                      현재 기간에서 가장 많은 매출을 만든 캠페인입니다.
                    </small>
                  </div>


                  <div className="performance-insight-card">
                    <span>
                      최저 CPA
                    </span>

                    <strong>
                      {bestCpaCampaign
                        ? `${bestCpaCampaign.channel} · ${bestCpaCampaign.campaign}`
                        : '-'}
                    </strong>

                    <p>
                      {bestCpaCampaign
                        ? `CPA ${Math.round(
                          bestCpaCampaign.cpa
                        ).toLocaleString()}원`
                        : '데이터 없음'}
                    </p>

                    <small>
                      전환당 비용이 가장 낮은 캠페인입니다.
                    </small>
                  </div>


                  <div className="performance-insight-card">
                    <span>
                      개선 필요
                    </span>

                    <strong>
                      {improvementCampaign
                        ? `${improvementCampaign.channel} · ${improvementCampaign.campaign}`
                        : '-'}
                    </strong>

                    <p>
                      {improvementCampaign
                        ? `ROAS ${improvementCampaign.roas.toFixed(1)}%`
                        : '데이터 없음'}
                    </p>

                    <small>
                      현재 ROAS가 가장 낮아 예산·소재 점검이 필요합니다.
                    </small>
                  </div>

                </div>
              </section>

              <section className="performance-trend-section">
                <div className="performance-trend-header">
                  <div>
                    <h2>
                      광고비 · 매출 추이
                    </h2>

                    <span>
                      현재 필터 및 기간 기준
                    </span>
                  </div>
                </div>

                <div className="performance-trend-chart">
                  {performanceDailySummary.length === 0 ? (
                    <div className="performance-empty">
                      표시할 성과 데이터가 없습니다.
                    </div>
                  ) : (
                    <ResponsiveContainer
                      width="100%"
                      height={300}
                    >
                      <LineChart
                        data={performanceDailySummary}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                        />

                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) =>
                            value.slice(5)
                          }
                        />

                        <YAxis
                          tickFormatter={(value) =>
                            `${Math.round(
                              value / 1000000
                            )}M`
                          }
                        />

                        <Tooltip
                          formatter={(value) =>
                            `${Math.round(
                              value
                            ).toLocaleString()}원`
                          }
                        />

                        <Legend />

                        <Line
                          type="monotone"
                          dataKey="spend"
                          name="광고비"
                          dot={false}
                        />

                        <Line
                          type="monotone"
                          dataKey="revenue"
                          name="매출"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>

              <section className="performance-trend-section">
                <div className="performance-trend-header">
                  <div>
                    <h2>
                      ROAS 추이
                    </h2>

                    <span>
                      일별 광고비 대비 매출 효율
                    </span>
                  </div>
                </div>

                <div className="performance-trend-chart">
                  {performanceDailySummary.length === 0 ? (
                    <div className="performance-empty">
                      표시할 성과 데이터가 없습니다.
                    </div>
                  ) : (
                    <ResponsiveContainer
                      width="100%"
                      height={240}
                    >
                      <LineChart
                        data={performanceDailySummary}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                        />

                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) =>
                            value.slice(5)
                          }
                        />

                        <YAxis
                          tickFormatter={(value) =>
                            `${Math.round(value)}%`
                          }
                        />

                        <Tooltip
                          formatter={(value) => [
                            `${Number(value).toFixed(1)}%`,
                            'ROAS',
                          ]}
                        />

                        <Line
                          type="monotone"
                          dataKey="roas"
                          name="ROAS"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>

            </>
          )}
          {performanceAlerts.length > 0 && (
            <section className="performance-change-section">
              <div className="performance-change-header">
                <h2>성과 변화</h2>

                <span>
                  이전 동일 기간 대비
                </span>
              </div>

              <div className="performance-change-list">
                {performanceAlerts.map(
                  (alert, index) => (
                    <div
                      key={`${alert.categoryLabel}-${alert.name || alert.channel}-${alert.metric}-${index}`}
                      className={
                        alert.type === 'warning'
                          ? 'performance-change-item warning'
                          : 'performance-change-item positive'
                      }
                    >
                      <span className="performance-change-icon">
                        {alert.type === 'warning'
                          ? '⚠'
                          : '↑'}
                      </span>

                      <span className="performance-change-category">
                        {alert.categoryLabel}
                      </span>

                      <span>
                        {alert.message}
                      </span>
                    </div>
                  )
                )}
              </div>
            </section>
          )}



          {performanceTab === 'channel' && (
            <>
              <section className="channel-performance-section">
                <div className="channel-performance-header">
                  <div>
                    <h2>매체별 성과 순위</h2>

                    <span>
                      현재 필터 기준
                    </span>
                  </div>

                  <select
                    className="client-performance-sort"
                    value={internalChannelSort}
                    onChange={(event) =>
                      setInternalChannelSort(
                        event.target.value
                      )
                    }
                  >
                    <option value="roas_desc">
                      ROAS 높은 순
                    </option>

                    <option value="spend_desc">
                      광고비 높은 순
                    </option>

                    <option value="revenue_desc">
                      매출 높은 순
                    </option>

                    <option value="cpa_asc">
                      CPA 낮은 순
                    </option>

                    <option value="conversions_desc">
                      전환 높은 순
                    </option>
                  </select>
                </div>

                {sortedChannelDiagnostics.length > 0 && (
                  <div className="channel-performance-summary">
                    <div className="channel-summary-item">
                      <span>최고 ROAS</span>

                      <strong>
                        🏆{' '}
                        {
                          [...channelDiagnostics]
                            .sort(
                              (a, b) =>
                                b.roas - a.roas
                            )[0].channel
                        }
                      </strong>

                      <small>
                        {
                          [...channelDiagnostics]
                            .sort(
                              (a, b) =>
                                b.roas - a.roas
                            )[0]
                            .roas.toFixed(1)
                        }
                        %
                      </small>
                    </div>

                    {channelDiagnostics.length > 1 && (
                      <div className="channel-summary-item">
                        <span>최저 ROAS</span>

                        <strong>
                          {
                            [...channelDiagnostics]
                              .sort(
                                (a, b) =>
                                  a.roas - b.roas
                              )[0].channel
                          }
                        </strong>

                        <small>
                          {
                            [...channelDiagnostics]
                              .sort(
                                (a, b) =>
                                  a.roas - b.roas
                              )[0]
                              .roas.toFixed(1)
                          }
                          %
                        </small>
                      </div>
                    )}
                  </div>
                )}

                <div className="channel-performance-table-wrapper">
                  <table className="channel-performance-table">
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>매체</th>
                        <th>광고비</th>
                        <th>매출</th>
                        <th>전환</th>
                        <th>클릭</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CPC</th>
                        <th>CTR</th>
                        <th>CVR</th>
                        <th>CPM</th>
                        <th>광고비 비중</th>
                        <th>매출 비중</th>
                        <th>기여도 차이</th>
                        <th>진단</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sortedChannelDiagnostics.map(
                        (item, index) => (
                          <tr
                            key={item.channel}
                            className={
                              selectedInternalChannel ===
                                item.channel
                                ? 'client-performance-row selected'
                                : 'client-performance-row'
                            }
                            onClick={() =>
                              setSelectedInternalChannel(
                                item.channel
                              )
                            }
                          >
                            <td>{index + 1}</td>

                            <td>
                              <strong>
                                {item.channel}
                              </strong>
                            </td>

                            <td>
                              {Math.round(
                                item.spend
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.revenue
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.conversions
                              ).toLocaleString()}
                              건
                            </td>

                            <td>
                              {Math.round(
                                item.clicks
                              ).toLocaleString()}
                            </td>

                            <td>
                              {item.roas.toFixed(1)}%
                            </td>

                            <td>
                              {Math.round(
                                item.cpa
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.cpc
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.ctr.toFixed(2)}%
                            </td>

                            <td>
                              {item.cvr.toFixed(2)}%
                            </td>

                            <td>
                              {Math.round(
                                item.cpm
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.spendShare.toFixed(1)}%
                            </td>

                            <td>
                              {item.revenueShare.toFixed(1)}%
                            </td>

                            <td>
                              <span
                                className={
                                  item.shareGap > 0
                                    ? 'share-gap-positive'
                                    : item.shareGap < 0
                                      ? 'share-gap-negative'
                                      : 'share-gap-neutral'
                                }
                              >
                                {item.shareGap > 0
                                  ? '+'
                                  : ''}
                                {item.shareGap.toFixed(1)}
                                %p
                              </span>
                            </td>

                            <td>
                              <div className="diagnosis-cell">
                                <span
                                  className={
                                    item.status === '효율 우수'
                                      ? 'diagnosis-good'
                                      : item.status === '점검 필요'
                                        ? 'diagnosis-warning'
                                        : 'diagnosis-normal'
                                  }
                                >
                                  {item.status}
                                </span>

                                <small>
                                  {item.reason}
                                </small>
                              </div>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {selectedInternalChannelData && (
                <section className="channel-performance-section">
                  <div className="channel-performance-header">
                    <div>
                      <h2>매체 상세</h2>

                      <span>
                        {selectedInternalChannelData.channel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedInternalChannel(null)
                      }
                    >
                      닫기
                    </button>
                  </div>

                  <div className="client-campaign-detail-metrics">
                    <div>
                      <span>광고비</span>
                      <strong>
                        {Math.round(
                          selectedInternalChannelData.spend
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>매출</span>
                      <strong>
                        {Math.round(
                          selectedInternalChannelData.revenue
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>ROAS</span>
                      <strong>
                        {selectedInternalChannelData.roas.toFixed(1)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>CPA</span>
                      <strong>
                        {Math.round(
                          selectedInternalChannelData.cpa
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>CTR</span>
                      <strong>
                        {selectedInternalChannelData.ctr.toFixed(2)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>전환</span>
                      <strong>
                        {Math.round(
                          selectedInternalChannelData.conversions
                        ).toLocaleString()}
                        건
                      </strong>
                    </div>
                  </div>

                  <div className="performance-trend-chart">
                    <ResponsiveContainer
                      width="100%"
                      height={280}
                    >
                      <LineChart
                        data={
                          selectedInternalChannelDailyData
                        }
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                        />

                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) =>
                            value.slice(5)
                          }
                        />

                        <YAxis />

                        <Tooltip />

                        <Legend />

                        <Line
                          type="monotone"
                          dataKey="spend"
                          name="광고비"
                          dot={false}
                        />

                        <Line
                          type="monotone"
                          dataKey="revenue"
                          name="매출"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="client-campaign-content-section">
                    <div className="channel-performance-header">
                      <div>
                        <h2>
                          캠페인별 성과
                        </h2>

                        <span>
                          ROAS 높은 순
                        </span>
                      </div>
                    </div>

                    <div className="channel-performance-table-wrapper">
                      <table className="channel-performance-table">
                        <thead>
                          <tr>
                            <th>캠페인</th>
                            <th>광고비</th>
                            <th>매출</th>
                            <th>ROAS</th>
                            <th>CPA</th>
                            <th>CTR</th>
                            <th>전환</th>
                          </tr>
                        </thead>

                        <tbody>
                          {selectedInternalChannelCampaignData.map(
                            (row) => (
                              <tr key={row.campaign}>
                                <td>
                                  {row.campaign}
                                </td>

                                <td>
                                  {Math.round(
                                    row.spend
                                  ).toLocaleString()}
                                  원
                                </td>

                                <td>
                                  {Math.round(
                                    row.revenue
                                  ).toLocaleString()}
                                  원
                                </td>

                                <td>
                                  {row.roas.toFixed(1)}%
                                </td>

                                <td>
                                  {Math.round(
                                    row.cpa
                                  ).toLocaleString()}
                                  원
                                </td>

                                <td>
                                  {row.ctr.toFixed(2)}%
                                </td>

                                <td>
                                  {Math.round(
                                    row.conversions
                                  ).toLocaleString()}
                                  건
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
          {performanceTab === 'campaign' && (
            <>
              <section className="campaign-performance-section">
                <div className="channel-performance-header">
                  <div>
                    <h2>캠페인별 성과 순위</h2>

                    <span>
                      현재 필터 기준
                    </span>
                  </div>

                  <select
                    className="client-performance-sort"
                    value={internalCampaignSort}
                    onChange={(event) =>
                      setInternalCampaignSort(
                        event.target.value
                      )
                    }
                  >
                    <option value="roas_desc">
                      ROAS 높은 순
                    </option>

                    <option value="spend_desc">
                      광고비 높은 순
                    </option>

                    <option value="revenue_desc">
                      매출 높은 순
                    </option>

                    <option value="cpa_asc">
                      CPA 낮은 순
                    </option>

                    <option value="conversions_desc">
                      전환 높은 순
                    </option>
                  </select>
                </div>

                <div className="channel-performance-table-wrapper">
                  <table className="channel-performance-table">
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>캠페인</th>
                        <th>광고비</th>
                        <th>매출</th>
                        <th>전환</th>
                        <th>클릭</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CPC</th>
                        <th>CTR</th>
                        <th>CVR</th>
                        <th>CPM</th>
                        <th>광고비 비중</th>
                        <th>매출 비중</th>
                        <th>기여도 차이</th>
                        <th>진단</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sortedCampaignDiagnostics.map(
                        (item, index) => (
                          <tr
                            key={item.campaign}
                            className={
                              selectedInternalCampaign ===
                                item.campaign
                                ? 'client-performance-row selected'
                                : 'client-performance-row'
                            }
                            onClick={() =>
                              setSelectedInternalCampaign(
                                item.campaign
                              )
                            }
                          >
                            <td>
                              {index + 1}
                            </td>

                            <td>
                              <strong>
                                {item.campaign}
                              </strong>
                            </td>

                            <td>
                              {Math.round(
                                item.spend
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.revenue
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.conversions
                              ).toLocaleString()}
                              건
                            </td>

                            <td>
                              {Math.round(
                                item.clicks
                              ).toLocaleString()}
                            </td>

                            <td>
                              {item.roas.toFixed(1)}%
                            </td>

                            <td>
                              {Math.round(
                                item.cpa
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.cpc
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.ctr.toFixed(2)}%
                            </td>

                            <td>
                              {item.cvr.toFixed(2)}%
                            </td>

                            <td>
                              {Math.round(
                                item.cpm
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.spendShare.toFixed(1)}%
                            </td>

                            <td>
                              {item.revenueShare.toFixed(1)}%
                            </td>

                            <td>
                              <span
                                className={
                                  item.shareGap > 0
                                    ? 'share-gap-positive'
                                    : item.shareGap < 0
                                      ? 'share-gap-negative'
                                      : 'share-gap-neutral'
                                }
                              >
                                {item.shareGap > 0
                                  ? '+'
                                  : ''}

                                {item.shareGap.toFixed(1)}
                                %p
                              </span>
                            </td>

                            <td>
                              <div className="diagnosis-cell">
                                <span
                                  className={
                                    item.status === '효율 우수'
                                      ? 'diagnosis-good'
                                      : item.status === '점검 필요'
                                        ? 'diagnosis-warning'
                                        : 'diagnosis-normal'
                                  }
                                >
                                  {item.status}
                                </span>

                                <small>
                                  {item.reason}
                                </small>
                              </div>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {selectedInternalCampaignData && (
                <section className="campaign-performance-section">
                  <div className="channel-performance-header">
                    <div>
                      <h2>캠페인 상세</h2>

                      <span>
                        {selectedInternalCampaignData.campaign}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedInternalCampaign(null)
                      }
                    >
                      닫기
                    </button>
                  </div>

                  <div className="client-campaign-detail-metrics">
                    <div>
                      <span>광고비</span>

                      <strong>
                        {Math.round(
                          selectedInternalCampaignData.spend
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>매출</span>

                      <strong>
                        {Math.round(
                          selectedInternalCampaignData.revenue
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>ROAS</span>

                      <strong>
                        {selectedInternalCampaignData.roas.toFixed(1)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>CPA</span>

                      <strong>
                        {Math.round(
                          selectedInternalCampaignData.cpa
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>CTR</span>

                      <strong>
                        {selectedInternalCampaignData.ctr.toFixed(2)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>전환</span>

                      <strong>
                        {Math.round(
                          selectedInternalCampaignData.conversions
                        ).toLocaleString()}
                        건
                      </strong>
                    </div>
                  </div>

                  <div className="performance-trend-chart">
                    {selectedInternalCampaignDailyData.length ===
                      0 ? (
                      <div className="performance-empty">
                        표시할 일별 데이터가 없습니다.
                      </div>
                    ) : (
                      <ResponsiveContainer
                        width="100%"
                        height={280}
                      >
                        <LineChart
                          data={
                            selectedInternalCampaignDailyData
                          }
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                          />

                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) =>
                              value.slice(5)
                            }
                          />

                          <YAxis
                            tickFormatter={(value) =>
                              `${Math.round(
                                value / 1000000
                              )}M`
                            }
                          />

                          <Tooltip
                            formatter={(value) =>
                              `${Math.round(
                                Number(value)
                              ).toLocaleString()}원`
                            }
                          />

                          <Legend />

                          <Line
                            type="monotone"
                            dataKey="spend"
                            name="광고비"
                            dot={false}
                          />

                          <Line
                            type="monotone"
                            dataKey="revenue"
                            name="매출"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="client-campaign-content-section">
                    <div className="channel-performance-header">
                      <div>
                        <h2>소재별 성과</h2>

                        <span>
                          ROAS 높은 순
                        </span>
                      </div>
                    </div>

                    {selectedInternalCampaignContentData.length ===
                      0 ? (
                      <div className="performance-empty">
                        소재 성과 데이터가 없습니다.
                      </div>
                    ) : (
                      <div className="channel-performance-table-wrapper">
                        <table className="channel-performance-table">
                          <thead>
                            <tr>
                              <th>소재</th>
                              <th>광고비</th>
                              <th>매출</th>
                              <th>ROAS</th>
                              <th>CPA</th>
                              <th>CTR</th>
                              <th>전환</th>
                            </tr>
                          </thead>

                          <tbody>
                            {selectedInternalCampaignContentData.map(
                              (row) => (
                                <tr key={row.content}>
                                  <td>
                                    {row.content}
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.spend
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.revenue
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {row.roas.toFixed(1)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.cpa
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {row.ctr.toFixed(2)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.conversions
                                    ).toLocaleString()}
                                    건
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {performanceTab === 'product' && (
            <>
              <section className="product-performance-section">
                <div className="channel-performance-header">
                  <div>
                    <h2>제품별 성과 순위</h2>
                    <span>현재 필터 기준</span>
                  </div>

                  <select
                    className="client-performance-sort"
                    value={internalProductSort}
                    onChange={(event) =>
                      setInternalProductSort(
                        event.target.value
                      )
                    }
                  >
                    <option value="roas_desc">
                      ROAS 높은 순
                    </option>

                    <option value="spend_desc">
                      광고비 높은 순
                    </option>

                    <option value="revenue_desc">
                      매출 높은 순
                    </option>

                    <option value="cpa_asc">
                      CPA 낮은 순
                    </option>

                    <option value="conversions_desc">
                      전환 높은 순
                    </option>
                  </select>
                </div>

                <div className="channel-performance-table-wrapper">
                  <table className="channel-performance-table">
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>제품</th>
                        <th>광고비</th>
                        <th>매출</th>
                        <th>전환</th>
                        <th>클릭</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CPC</th>
                        <th>CTR</th>
                        <th>CVR</th>
                        <th>CPM</th>
                        <th>광고비 비중</th>
                        <th>매출 비중</th>
                        <th>기여도 차이</th>
                        <th>진단</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sortedProductDiagnostics.map(
                        (item, index) => (
                          <tr
                            key={item.product}
                            className={
                              selectedInternalProduct ===
                                item.product
                                ? 'client-performance-row selected'
                                : 'client-performance-row'
                            }
                            onClick={() =>
                              setSelectedInternalProduct(
                                item.product
                              )
                            }
                          >
                            <td>{index + 1}</td>

                            <td>
                              <strong>
                                {item.product}
                              </strong>
                            </td>

                            <td>
                              {Math.round(
                                item.spend
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.revenue
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.conversions
                              ).toLocaleString()}
                              건
                            </td>

                            <td>
                              {Math.round(
                                item.clicks
                              ).toLocaleString()}
                            </td>

                            <td>
                              {item.roas.toFixed(1)}%
                            </td>

                            <td>
                              {Math.round(
                                item.cpa
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.cpc
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.ctr.toFixed(2)}%
                            </td>

                            <td>
                              {item.cvr.toFixed(2)}%
                            </td>

                            <td>
                              {Math.round(
                                item.cpm
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.spendShare.toFixed(1)}%
                            </td>

                            <td>
                              {item.revenueShare.toFixed(1)}%
                            </td>

                            <td>
                              <span
                                className={
                                  item.shareGap > 0
                                    ? 'share-gap-positive'
                                    : item.shareGap < 0
                                      ? 'share-gap-negative'
                                      : 'share-gap-neutral'
                                }
                              >
                                {item.shareGap > 0
                                  ? '+'
                                  : ''}
                                {item.shareGap.toFixed(1)}
                                %p
                              </span>
                            </td>

                            <td>
                              <div className="diagnosis-cell">
                                <span
                                  className={
                                    item.status === '효율 우수'
                                      ? 'diagnosis-good'
                                      : item.status === '점검 필요'
                                        ? 'diagnosis-warning'
                                        : 'diagnosis-normal'
                                  }
                                >
                                  {item.status}
                                </span>

                                <small>
                                  {item.reason}
                                </small>
                              </div>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {selectedInternalProductData && (
                <section className="product-performance-section">
                  <div className="channel-performance-header">
                    <div>
                      <h2>제품 상세</h2>

                      <span>
                        {selectedInternalProductData.product}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedInternalProduct(null)
                      }
                    >
                      닫기
                    </button>
                  </div>

                  <div className="client-campaign-detail-metrics">
                    <div>
                      <span>광고비</span>
                      <strong>
                        {Math.round(
                          selectedInternalProductData.spend
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>매출</span>
                      <strong>
                        {Math.round(
                          selectedInternalProductData.revenue
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>ROAS</span>
                      <strong>
                        {selectedInternalProductData.roas.toFixed(1)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>CPA</span>
                      <strong>
                        {Math.round(
                          selectedInternalProductData.cpa
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>CTR</span>
                      <strong>
                        {selectedInternalProductData.ctr.toFixed(2)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>전환</span>
                      <strong>
                        {Math.round(
                          selectedInternalProductData.conversions
                        ).toLocaleString()}
                        건
                      </strong>
                    </div>
                  </div>

                  <div className="performance-trend-chart">
                    {selectedInternalProductDailyData.length ===
                      0 ? (
                      <div className="performance-empty">
                        표시할 일별 데이터가 없습니다.
                      </div>
                    ) : (
                      <ResponsiveContainer
                        width="100%"
                        height={280}
                      >
                        <LineChart
                          data={
                            selectedInternalProductDailyData
                          }
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                          />

                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) =>
                              value.slice(5)
                            }
                          />

                          <YAxis />

                          <Tooltip />

                          <Legend />

                          <Line
                            type="monotone"
                            dataKey="spend"
                            name="광고비"
                            dot={false}
                          />

                          <Line
                            type="monotone"
                            dataKey="revenue"
                            name="매출"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="client-campaign-content-section">
                    <div className="channel-performance-header">
                      <div>
                        <h2>
                          매체 · 캠페인별 성과
                        </h2>

                        <span>
                          ROAS 높은 순
                        </span>
                      </div>
                    </div>

                    {selectedInternalProductCampaignData.length ===
                      0 ? (
                      <div className="performance-empty">
                        캠페인 성과 데이터가 없습니다.
                      </div>
                    ) : (
                      <div className="channel-performance-table-wrapper">
                        <table className="channel-performance-table">
                          <thead>
                            <tr>
                              <th>매체</th>
                              <th>캠페인</th>
                              <th>광고비</th>
                              <th>매출</th>
                              <th>ROAS</th>
                              <th>CPA</th>
                              <th>CTR</th>
                              <th>전환</th>
                            </tr>
                          </thead>

                          <tbody>
                            {selectedInternalProductCampaignData.map(
                              (row) => (
                                <tr key={row.key}>
                                  <td>
                                    {row.channel}
                                  </td>

                                  <td>
                                    {row.campaign}
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.spend
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.revenue
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {row.roas.toFixed(1)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.cpa
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {row.ctr.toFixed(2)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.conversions
                                    ).toLocaleString()}
                                    건
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {performanceTab === 'content' && (
            <>
              <section className="content-performance-section">
                <div className="channel-performance-header">
                  <div>
                    <h2>콘텐츠별 성과 순위</h2>

                    <span>
                      현재 필터 기준
                    </span>
                  </div>

                  <select
                    className="client-performance-sort"
                    value={internalContentSort}
                    onChange={(event) =>
                      setInternalContentSort(
                        event.target.value
                      )
                    }
                  >
                    <option value="roas_desc">
                      ROAS 높은 순
                    </option>

                    <option value="spend_desc">
                      광고비 높은 순
                    </option>

                    <option value="revenue_desc">
                      매출 높은 순
                    </option>

                    <option value="cpa_asc">
                      CPA 낮은 순
                    </option>

                    <option value="conversions_desc">
                      전환 높은 순
                    </option>
                  </select>
                </div>

                <div className="channel-performance-table-wrapper">
                  <table className="channel-performance-table">
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>콘텐츠</th>
                        <th>광고비</th>
                        <th>매출</th>
                        <th>전환</th>
                        <th>클릭</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CPC</th>
                        <th>CTR</th>
                        <th>CVR</th>
                        <th>CPM</th>
                        <th>광고비 비중</th>
                        <th>매출 비중</th>
                        <th>기여도 차이</th>
                        <th>진단</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sortedContentDiagnostics.map(
                        (item, index) => (
                          <tr
                            key={item.content}
                            className={
                              selectedInternalContent ===
                                item.content
                                ? 'client-performance-row selected'
                                : 'client-performance-row'
                            }
                            onClick={() =>
                              setSelectedInternalContent(
                                item.content
                              )
                            }
                          >
                            <td>{index + 1}</td>

                            <td>
                              <strong>
                                {item.content}
                              </strong>
                            </td>

                            <td>
                              {Math.round(
                                item.spend
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.revenue
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.conversions
                              ).toLocaleString()}
                              건
                            </td>

                            <td>
                              {Math.round(
                                item.clicks
                              ).toLocaleString()}
                            </td>

                            <td>
                              {item.roas.toFixed(1)}%
                            </td>

                            <td>
                              {Math.round(
                                item.cpa
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.cpc
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.ctr.toFixed(2)}%
                            </td>

                            <td>
                              {item.cvr.toFixed(2)}%
                            </td>

                            <td>
                              {Math.round(
                                item.cpm
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.spendShare.toFixed(1)}%
                            </td>

                            <td>
                              {item.revenueShare.toFixed(1)}%
                            </td>

                            <td>
                              <span
                                className={
                                  item.shareGap > 0
                                    ? 'share-gap-positive'
                                    : item.shareGap < 0
                                      ? 'share-gap-negative'
                                      : 'share-gap-neutral'
                                }
                              >
                                {item.shareGap > 0
                                  ? '+'
                                  : ''}

                                {item.shareGap.toFixed(1)}
                                %p
                              </span>
                            </td>

                            <td>
                              <div className="diagnosis-cell">
                                <span
                                  className={
                                    item.status === '효율 우수'
                                      ? 'diagnosis-good'
                                      : item.status === '점검 필요'
                                        ? 'diagnosis-warning'
                                        : 'diagnosis-normal'
                                  }
                                >
                                  {item.status}
                                </span>

                                <small>
                                  {item.reason}
                                </small>
                              </div>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {selectedInternalContentData && (
                <section className="content-performance-section">
                  <div className="channel-performance-header">
                    <div>
                      <h2>콘텐츠 상세</h2>

                      <span>
                        {selectedInternalContentData.content}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedInternalContent(null)
                      }
                    >
                      닫기
                    </button>
                  </div>

                  <div className="client-campaign-detail-metrics">
                    <div>
                      <span>광고비</span>

                      <strong>
                        {Math.round(
                          selectedInternalContentData.spend
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>매출</span>

                      <strong>
                        {Math.round(
                          selectedInternalContentData.revenue
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>ROAS</span>

                      <strong>
                        {selectedInternalContentData.roas.toFixed(1)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>CPA</span>

                      <strong>
                        {Math.round(
                          selectedInternalContentData.cpa
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>CTR</span>

                      <strong>
                        {selectedInternalContentData.ctr.toFixed(2)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>전환</span>

                      <strong>
                        {Math.round(
                          selectedInternalContentData.conversions
                        ).toLocaleString()}
                        건
                      </strong>
                    </div>
                  </div>

                  <div className="performance-trend-chart">
                    {selectedInternalContentDailyData.length === 0 ? (
                      <div className="performance-empty">
                        표시할 일별 데이터가 없습니다.
                      </div>
                    ) : (
                      <ResponsiveContainer
                        width="100%"
                        height={280}
                      >
                        <LineChart
                          data={
                            selectedInternalContentDailyData
                          }
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                          />

                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) =>
                              value.slice(5)
                            }
                          />

                          <YAxis />

                          <Tooltip />

                          <Legend />

                          <Line
                            type="monotone"
                            dataKey="spend"
                            name="광고비"
                            dot={false}
                          />

                          <Line
                            type="monotone"
                            dataKey="revenue"
                            name="매출"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="client-campaign-content-section">
                    <div className="channel-performance-header">
                      <div>
                        <h2>
                          매체 · 캠페인 · 제품별 성과
                        </h2>

                        <span>
                          ROAS 높은 순
                        </span>
                      </div>
                    </div>

                    {selectedInternalContentBreakdownData.length === 0 ? (
                      <div className="performance-empty">
                        세부 성과 데이터가 없습니다.
                      </div>
                    ) : (
                      <div className="channel-performance-table-wrapper">
                        <table className="channel-performance-table">
                          <thead>
                            <tr>
                              <th>매체</th>
                              <th>캠페인</th>
                              <th>제품</th>
                              <th>광고비</th>
                              <th>매출</th>
                              <th>ROAS</th>
                              <th>CPA</th>
                              <th>CTR</th>
                              <th>전환</th>
                            </tr>
                          </thead>

                          <tbody>
                            {selectedInternalContentBreakdownData.map(
                              (row) => (
                                <tr key={row.key}>
                                  <td>
                                    {row.channel}
                                  </td>

                                  <td>
                                    {row.campaign}
                                  </td>

                                  <td>
                                    {row.product}
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.spend
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.revenue
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {row.roas.toFixed(1)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.cpa
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {row.ctr.toFixed(2)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.conversions
                                    ).toLocaleString()}
                                    건
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

        </>
      )}

      {activePage === 'dashboard' && (
        <>
          <main className="workspace">
            <aside className="field-panel">

              <h2>
                데이터 필드
              </h2>

              <p>
                필드를 드래그해서 추가하세요.
              </p>


              <h3>
                차원
              </h3>


              {dimensions.map(
                (field) => (
                  <button
                    key={field.key}
                    draggable
                    onDragStart={() =>
                      handleDragStart(
                        field
                      )
                    }
                    className="field-item"
                  >
                    <span
                      className="
                    field-dot
                    dimension-dot
                  "
                    />

                    {field.label}
                  </button>
                )
              )}


              <h3>
                지표
              </h3>


              {measures.map(
                (field) => (
                  <button
                    key={field.key}
                    draggable
                    onDragStart={() =>
                      handleDragStart(
                        field
                      )
                    }
                    className="field-item"
                  >
                    <span
                      className="
                    field-dot
                    measure-dot
                  "
                    />

                    {field.label}
                  </button>
                )
              )}

            </aside>


            <section className="chart-builder">

              <div className="builder-header">

                <h2>
                  셀프서비스 차트 빌더
                </h2>


                <div className="builder-actions">

                  <select
                    value={chartType}
                    onChange={(e) =>
                      setChartType(
                        e.target.value
                      )
                    }
                  >
                    <option value="line">
                      선 그래프
                    </option>

                    <option value="bar">
                      막대 그래프
                    </option>

                    <option value="scatter">
                      산점도
                    </option>

                    <option value="donut">
                      도넛 차트
                    </option>

                    <option value="kpi">KPI 카드</option>

                    <option value="table">
                      데이터 테이블
                    </option>
                  </select>




                  <button
                    type="button"
                    onClick={
                      resetBuilder
                    }
                  >
                    빌더 초기화
                  </button>

                </div>
              </div>


              <div className="drop-grid">

                <div
                  className="drop-zone"
                  onDragOver={(e) =>
                    e.preventDefault()
                  }
                  onDrop={() =>
                    handleDrop('x')
                  }
                >
                  <strong>
                    X축
                  </strong>


                  {xField ? (
                    <div className="field-chip">
                      {getLabel(xField)}

                      <button
                        type="button"
                        onClick={() =>
                          setXField(null)
                        }
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <span>
                      차원을 여기에 놓으세요
                    </span>
                  )}
                </div>


                <div
                  className="drop-zone"
                  onDragOver={(e) =>
                    e.preventDefault()
                  }
                  onDrop={() =>
                    handleDrop('y')
                  }
                >
                  <strong>
                    Y축
                  </strong>


                  <div className="chip-list">

                    {
                      yFields.length === 0
                      && (
                        <span>
                          지표를 여기에 놓으세요
                        </span>
                      )
                    }


                    {yFields.map(
                      (field) => (
                        <div
                          key={field}
                          className="field-chip"
                        >
                          {getLabel(field)}

                          <button
                            type="button"
                            onClick={() =>
                              removeYField(
                                field
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      )
                    )}

                  </div>
                </div>


                <div
                  className="drop-zone"
                  onDragOver={(e) =>
                    e.preventDefault()
                  }
                  onDrop={() =>
                    handleDrop(
                      'group'
                    )
                  }
                >
                  <strong>
                    그룹 / 색상
                  </strong>


                  {groupField ? (
                    <div className="field-chip">
                      {getLabel(
                        groupField
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setGroupField(
                            null
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <span>
                      차원을 여기에 놓으세요
                    </span>
                  )}
                </div>


                <div
                  className="drop-zone"
                  onDragOver={(e) =>
                    e.preventDefault()
                  }
                  onDrop={() =>
                    handleDrop('filter')
                  }
                >
                  <strong>
                    필터
                  </strong>

                  {filterField ? (
                    <>
                      <div className="field-chip">
                        {getLabel(filterField)}

                        <button
                          type="button"
                          onClick={() => {
                            setFilterField(null)
                            setFilterValue('전체')
                          }}
                        >
                          ×
                        </button>
                      </div>

                      <select
                        className="filter-select"
                        value={filterValue}
                        onChange={(e) =>
                          setFilterValue(e.target.value)
                        }
                      >
                        <option value="전체">
                          전체
                        </option>

                        {filterOptions.map((value) => (
                          <option
                            key={value}
                            value={value}
                          >
                            {value}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span>
                      차원을 여기에 놓으세요
                    </span>
                  )}
                </div>


                <div className="drop-zone">
                  <strong>
                    툴팁
                  </strong>

                  <span>
                    차트에서 자동 표시
                  </span>
                </div>


                <div className="drop-zone">
                  <strong>
                    크기
                  </strong>

                  <span>
                    다음 단계에서 구현
                  </span>
                </div>

              </div>


              <div className="chart-preview">

                <div className="preview-heading">

                  <div>
                    <h3>
                      {
                        xField &&
                          yFields.length > 0

                          ? `${getLabel(
                            xField
                          )}별 ${yFields
                            .map(getLabel)
                            .join(', ')}`

                          : '차트 미리보기'
                      }
                    </h3>


                    <p>
                      {
                        groupField
                          ? `${getLabel(
                            groupField
                          )} 기준으로 그룹화`
                          : '그룹 없음'
                      }
                    </p>
                  </div>

                </div>


                {renderChart()}

              </div>

            </section>


            <aside className="settings-panel">



              <h2>
                차트 설정
              </h2>

              <div className="chart-setting-group">
                <button
                  type="button"
                  className="chart-setting-group-title"
                  onClick={() =>
                    setInfoOpen((current) => !current)
                  }
                >
                  <span>차트 정보</span>
                  <span>
                    {infoOpen ? '−' : '+'}
                  </span>
                </button>

                {infoOpen && (
                  <div className="chart-setting-group-content">

                    <div className="field-section">
                      <label>차트 제목</label>

                      <input
                        type="text"
                        value={chartTitle}
                        onChange={(e) =>
                          setChartTitle(e.target.value)
                        }
                        placeholder="예: 매체별 광고비 추이"
                      />
                    </div>

                    <div className="field-section">
                      <label>차트 설명</label>

                      <textarea
                        value={chartDescription}
                        onChange={(e) =>
                          setChartDescription(e.target.value)
                        }
                        placeholder="차트 설명을 입력하세요."
                        rows={3}
                      />
                    </div>

                  </div>
                )}
              </div>

              <div className="chart-setting-group">
                <button
                  type="button"
                  className="chart-setting-group-title"
                  onClick={() =>
                    setDataOpen((current) => !current)
                  }
                >
                  <span>데이터 설정</span>
                  <span>
                    {dataOpen ? '−' : '+'}
                  </span>
                </button>

                {dataOpen && (
                  <div className="chart-setting-group-content">

                    <div className="field-section">
                      <label>정렬</label>

                      <select
                        value={sortOrder}
                        onChange={(e) =>
                          setSortOrder(e.target.value)
                        }
                      >
                        <option value="none">
                          기본 순서
                        </option>

                        <option value="desc">
                          높은 값부터
                        </option>

                        <option value="asc">
                          낮은 값부터
                        </option>
                      </select>
                    </div>

                    <div className="field-section">
                      <label>Top N</label>

                      <select
                        value={topN}
                        onChange={(e) =>
                          setTopN(e.target.value)
                        }
                      >
                        <option value="all">
                          전체
                        </option>

                        <option value="5">
                          상위 5개
                        </option>

                        <option value="10">
                          상위 10개
                        </option>

                        <option value="20">
                          상위 20개
                        </option>
                      </select>
                    </div>

                    <div className="field-section">
                      <label>집계 방식</label>

                      <select
                        value={aggregation}
                        onChange={(e) =>
                          setAggregation(e.target.value)
                        }
                      >
                        <option value="sum">
                          합계
                        </option>

                        <option value="avg">
                          평균
                        </option>

                        <option value="max">
                          최대
                        </option>

                        <option value="min">
                          최소
                        </option>
                      </select>
                    </div>

                  </div>
                )}
              </div>

              <div className="chart-setting-group">
                <button
                  type="button"
                  className="chart-setting-group-title"
                  onClick={() =>
                    setDisplayOpen((current) => !current)
                  }
                >
                  <span>표시 형식</span>
                  <span>
                    {displayOpen ? '−' : '+'}
                  </span>
                </button>

                {displayOpen && (
                  <div className="chart-setting-group-content">

                    <div className="field-section">
                      <label>숫자 표시</label>

                      <select
                        value={numberFormat}
                        onChange={(e) =>
                          setNumberFormat(e.target.value)
                        }
                      >
                        <option value="auto">
                          자동
                        </option>

                        <option value="full">
                          전체 숫자
                        </option>

                        <option value="compact">
                          축약 표시
                        </option>

                        {[
                          'spend',
                          'revenue',
                          'cpc',
                          'cpa',
                        ].includes(primaryMetric) && (
                            <option value="currency">
                              원화
                            </option>
                          )}

                        {[
                          'ctr',
                          'cvr',
                        ].includes(primaryMetric) && (
                            <option value="percent">
                              퍼센트
                            </option>
                          )}
                      </select>
                    </div>

                    {['bar', 'line', 'scatter', 'donut'].includes(chartType) && (
                      <div className="field-section">
                        <label>
                          <input
                            type="checkbox"
                            checked={legendVisible}
                            onChange={(e) =>
                              setLegendVisible(e.target.checked)
                            }
                          />
                          범례 표시
                        </label>
                      </div>
                    )}

                    {['bar', 'line', 'scatter'].includes(chartType) && (
                      <>
                        <div className="field-section">
                          <label>
                            <input
                              type="checkbox"
                              checked={xAxisVisible}
                              onChange={(e) =>
                                setXAxisVisible(e.target.checked)
                              }
                            />
                            X축 표시
                          </label>
                        </div>

                        <div className="field-section">
                          <label>
                            <input
                              type="checkbox"
                              checked={yAxisVisible}
                              onChange={(e) =>
                                setYAxisVisible(e.target.checked)
                              }
                            />
                            Y축 표시
                          </label>
                        </div>
                      </>
                    )}

                  </div>
                )}
              </div>

              {editingChartId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingChartId(null)
                    resetBuilder()
                  }}
                >
                  편집 취소
                </button>
              )}

              <button
                type="button"
                onClick={addChartToDashboard}
                className="add-dashboard-button"
              >
                {editingChartId
                  ? '차트 수정 완료'
                  : '대시보드에 추가'}
              </button>

            </aside>



          </main>

          <section className="saved-dashboard">

            <div className="saved-dashboard-toolbar">

              <div className="saved-dashboard-title-area">
                <h2>
                  내 대시보드
                </h2>

                <span>
                  {savedCharts.length}개 차트
                </span>
              </div>

              <div className="saved-dashboard-toolbar-actions">

                <div className="dashboard-layout-controls">

                  <div className="dashboard-control-group">
                    <span className="dashboard-control-label">
                      카드 크기
                    </span>

                    <select
                      value={dashboardCardSize}
                      onChange={(e) =>
                        setDashboardCardSize(e.target.value)
                      }
                    >
                      <option value="small">
                        작은 카드
                      </option>

                      <option value="medium">
                        기본 카드
                      </option>

                      <option value="large">
                        큰 카드
                      </option>
                    </select>
                  </div>

                  <div className="dashboard-control-group">
                    <span className="dashboard-control-label">
                      열 개수
                    </span>

                    <select
                      value={dashboardColumns}
                      onChange={(e) =>
                        setDashboardColumns(e.target.value)
                      }
                    >
                      <option value="1">
                        1열
                      </option>

                      <option value="2">
                        2열
                      </option>

                      <option value="3">
                        3열
                      </option>
                    </select>
                  </div>

                  <button
                    type="button"
                    className="dashboard-auto-arrange-button"
                    onClick={autoArrangeCharts}
                  >
                    자동 정렬
                  </button>

                </div>

                <button
                  type="button"
                  className="dashboard-reset-button"
                  onClick={resetDashboard}
                  title="대시보드 초기화"
                  aria-label="대시보드 초기화"
                >
                  🗑️
                </button>

              </div>

            </div>





            {
              savedCharts.length === 0 ? (
                <div className="saved-empty">
                  아직 추가된 차트가 없습니다.
                </div>
              ) : (
                <div
                  className="saved-chart-grid"
                  style={{
                    width: `${dashboardCanvasSize.width}px`,
                    height: `${dashboardCanvasSize.height}px`,
                  }}
                >
                  {savedCharts.map((chart) => (
                    <div
                      key={chart.id}
                      className="saved-chart-card"
                      style={{
                        position: 'absolute',
                        left: `${chart.x ?? 0}px`,
                        top: `${chart.y ?? 0}px`,
                        width: `${chart.width || 480}px`,
                        height: `${chart.height || 420}px`,
                      }}
                      onMouseUp={(e) => {
                        const rect =
                          e.currentTarget.getBoundingClientRect()

                        updateChartDimensions(
                          chart.id,
                          Math.round(rect.width),
                          Math.round(rect.height)
                        )
                      }}
                    >
                      <div className="saved-chart-title">
                        <div className="saved-chart-title-text">
                          <input
                            className="saved-chart-title-input"
                            type="text"
                            value={chart.title}
                            onChange={(e) =>
                              updateChartTitle(
                                chart.id,
                                e.target.value
                              )
                            }
                          />

                          {chart.description && (
                            <p className="saved-chart-description">
                              {chart.description}
                            </p>
                          )}

                          <p>
                            {chart.groupField
                              ? `${getLabel(chart.groupField)} 그룹`
                              : '그룹 없음'}
                          </p>
                        </div>

                        <div className="saved-chart-actions">
                          <button
                            type="button"
                            onClick={() =>
                              editSavedChart(chart)
                            }
                          >
                            설정 편집
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              duplicateChart(chart)
                            }
                          >
                            복제
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setSavedCharts((current) =>
                                current.filter(
                                  (item) =>
                                    item.id !== chart.id
                                )
                              )
                            }
                          >
                            삭제
                          </button>

                          <button
                            type="button"
                            className="chart-drag-handle"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()

                              setDragInfo({
                                chartId: chart.id,
                                startMouseX: e.clientX,
                                startMouseY: e.clientY,
                                startChartX: chart.x ?? 0,
                                startChartY: chart.y ?? 0,
                              })
                            }}
                            title="차트 이동"
                          >
                            ⠿
                          </button>
                        </div>
                      </div>

                      <div className="saved-chart-summary">
                        <span>
                          차트 유형: {chart.chartType}
                        </span>

                        {chart.xField && (
                          <span>
                            X축: {getLabel(chart.xField)}
                          </span>
                        )}

                        <span>
                          Y축:{' '}
                          {chart.yFields
                            .map(getLabel)
                            .join(', ')}
                        </span>

                        {chart.filterField && (
                          <span>
                            필터:{' '}
                            {getLabel(chart.filterField)}
                            {' = '}
                            {chart.filterValue}
                          </span>
                        )}
                      </div>

                      <div className="saved-chart-visual">
                        {renderSavedChart(chart)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </section >
        </>
      )


      }

      {activePage === 'alerts' && (
        <section className="anomaly-alert-section">

          <div className="anomaly-alert-header">
            <div>
              <h2>
                이상 지표 알림
              </h2>

              <p>
                주요 광고 성과 지표의
                급격한 변동을 탐지합니다.
              </p>
            </div>

            <button
              type="button"
              onClick={
                loadAnomalyAlerts
              }
              disabled={
                anomalyAlertsLoading
              }
            >
              {anomalyAlertsLoading
                ? '불러오는 중...'
                : '새로고침'}
            </button>
          </div>


          <div className="anomaly-alert-summary">

            <div className="anomaly-summary-card">
              <span>
                미확인 Alert
              </span>

              <strong>
                {
                  anomalyAlertSummary
                    .open
                }
              </strong>
            </div>

            <div className="anomaly-summary-card critical">
              <span>
                Critical
              </span>

              <strong>
                {
                  anomalyAlertSummary
                    .critical
                }
              </strong>
            </div>

            <div className="anomaly-summary-card warning">
              <span>
                Warning
              </span>

              <strong>
                {
                  anomalyAlertSummary
                    .warning
                }
              </strong>
            </div>

            <div className="anomaly-summary-card">
              <span>
                확인 완료
              </span>

              <strong>
                {
                  anomalyAlertSummary
                    .acknowledged
                }
              </strong>
            </div>

          </div>


          {anomalyAlertsError && (
            <div className="optimization-api-error">
              {anomalyAlertsError}
            </div>
          )}


          {anomalyAlertsLoading ? (

            <div className="anomaly-alert-empty">
              이상 알림을 불러오는 중입니다.
            </div>

          ) : anomalyAlerts.length === 0 ? (

            <div className="anomaly-alert-empty">
              현재 이상 지표가 없습니다.
            </div>

          ) : (

            <div className="anomaly-alert-list">

              {anomalyAlerts.map(
                (alert) => {

                  const isCritical =
                    alert.severity ===
                    'critical'

                  const metricLabelMap = {
                    roas: 'ROAS',
                    cpa: 'CPA',
                    cvr: 'CVR',
                    ctr: 'CTR',
                    cpc: 'CPC',
                    revenue: '매출',
                    conversions: '전환',
                  }

                  const metricLabel =
                    metricLabelMap[
                    alert.metric
                    ] ||
                    alert.metric

                  const guidance =
                    getAnomalyGuidance(
                      alert
                    )

                  return (
                    <div
                      key={alert.id}
                      className={
                        `anomaly-alert-card ${alert.severity}`
                      }
                    >
                      <div className="anomaly-alert-card-top">

                        <div className="anomaly-alert-severity-area">
                          <span
                            className={
                              `anomaly-severity-badge ${alert.severity}`
                            }
                          >
                            {isCritical
                              ? 'CRITICAL'
                              : 'WARNING'}
                          </span>

                          <span className="anomaly-alert-date">
                            {
                              alert.alertDate
                            }
                          </span>
                        </div>

                        <div className="anomaly-alert-actions">

                          {alert.status ===
                            'open' && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateAnomalyAlertStatus(
                                    alert.id,
                                    'acknowledged'
                                  )
                                }
                              >
                                확인
                              </button>
                            )}

                          {alert.status !==
                            'resolved' && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateAnomalyAlertStatus(
                                    alert.id,
                                    'resolved'
                                  )
                                }
                              >
                                해결 완료
                              </button>
                            )}

                        </div>
                      </div>


                      <div className="anomaly-alert-card-body">

                        <div className="anomaly-alert-title">
                          <strong>
                            {
                              alert.title ||
                              `${metricLabel} 이상 변동`
                            }
                          </strong>

                          <span>
                            {
                              alert.channel ||
                              alert.platform ||
                              '-'
                            }
                          </span>
                        </div>


                        <div className="anomaly-alert-entity">

                          {alert.scope ===
                            'campaign'
                            ? (
                              <>
                                캠페인 ·{' '}
                                {
                                  alert.campaignName ||
                                  alert.campaignId ||
                                  '-'
                                }
                              </>
                            )
                            : (
                              <>
                                매체 ·{' '}
                                {
                                  alert.channel ||
                                  alert.platform ||
                                  '-'
                                }
                              </>
                            )}

                        </div>

                        <div className="anomaly-alert-time-info">

                          <div>
                            <span>
                              성과 기준일
                            </span>

                            <strong>
                              {
                                alert.alertDate ||
                                '-'
                              }
                            </strong>
                          </div>

                          <div>
                            <span>
                              최초 감지
                            </span>

                            <strong>
                              {
                                formatAlertDateTime(
                                  alert.createdAt
                                )
                              }
                            </strong>
                          </div>

                          <div>
                            <span>
                              마지막 재검사
                            </span>

                            <strong>
                              {
                                formatAlertDateTime(
                                  alert.updatedAt
                                )
                              }
                            </strong>
                          </div>

                        </div>


                        <div className="anomaly-alert-metrics">

                          <div>
                            <span>
                              지표
                            </span>

                            <strong>
                              {metricLabel}
                            </strong>
                          </div>

                          <div>
                            <span>
                              기준값
                            </span>

                            <strong>
                              {Number(
                                alert.baselineValue ??
                                0
                              ).toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits:
                                    2,
                                }
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              현재값
                            </span>

                            <strong>
                              {Number(
                                alert.currentValue ??
                                0
                              ).toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits:
                                    2,
                                }
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              변화율
                            </span>

                            <strong>
                              <span
                                className={
                                  alert.direction === 'decrease'
                                    ? 'anomaly-change decrease'
                                    : alert.direction === 'increase'
                                      ? 'anomaly-change increase'
                                      : 'anomaly-change stable'
                                }
                              >
                                {alert.direction === 'decrease'
                                  ? '↓ '
                                  : alert.direction === 'increase'
                                    ? '↑ '
                                    : '→ '}

                                {Number(
                                  alert.changePct ?? 0
                                ) > 0
                                  ? '+'
                                  : ''}

                                {Number(
                                  alert.changePct ?? 0
                                ).toFixed(1)}
                                %
                              </span>
                            </strong>
                          </div>

                          <div>
                            <span>
                              Robust Z
                            </span>

                            <strong>
                              {Number(
                                alert.robustZ ??
                                0
                              ).toFixed(2)}
                            </strong>
                          </div>

                        </div>


                        <p className="anomaly-alert-message">
                          {alert.message}
                        </p>

                        <div className="anomaly-guidance">

                          <div className="anomaly-guidance-block">

                            <strong className="anomaly-guidance-title">
                              가능한 원인
                            </strong>

                            <ul>
                              {
                                guidance
                                  .possibleCauses
                                  .map(
                                    (
                                      item,
                                      index
                                    ) => (
                                      <li
                                        key={
                                          `cause-${alert.id}-${index}`
                                        }
                                      >
                                        {item}
                                      </li>
                                    )
                                  )
                              }
                            </ul>

                          </div>


                          <div className="anomaly-guidance-block">

                            <strong className="anomaly-guidance-title">
                              권장 조치
                            </strong>

                            <ol>
                              {
                                guidance
                                  .actions
                                  .map(
                                    (
                                      item,
                                      index
                                    ) => (
                                      <li
                                        key={
                                          `action-${alert.id}-${index}`
                                        }
                                      >
                                        {item}
                                      </li>
                                    )
                                  )
                              }
                            </ol>

                          </div>

                        </div>


                        <div className="anomaly-alert-footer">

                          <span>
                            상태:{' '}
                            {
                              alert.status
                            }
                          </span>

                          <span>
                            {
                              alert.reasonCode
                            }
                          </span>

                        </div>

                      </div>
                    </div>
                  )
                }
              )}

            </div>
          )}

        </section>
      )}

      {activePage === 'budget' && (
        <section className="budget-optimization-section">
          <div className="budget-optimization-header">
            <div>
              <h2>
                예산 최적화
              </h2>

              <span>
                실제 광고 성과를 기반으로 캠페인별 예산을 재배분합니다.
              </span>
            </div>

            <span className="optimization-shadow-badge">
              추천 전용
            </span>
          </div>

          <div className="optimization-mode-tabs">
            <button
              type="button"
              className={
                optimizationMode ===
                  'naverCampaign'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setOptimizationMode(
                  'naverCampaign'
                )
              }
            >
              {performanceDataSource ===
                'naver'
                ? 'Naver 캠페인별 예산'
                : '캠페인별 예산'}
            </button>

            <button
              type="button"
              className={
                optimizationMode ===
                  'channel'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setOptimizationMode(
                  'channel'
                )
              }
            >
              매체별 예산 배분
            </button>

            <button
              type="button"
              className={
                optimizationMode ===
                  'budgetScaling'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setOptimizationMode(
                  'budgetScaling'
                )
              }
            >
              예산 확장 분석
            </button>
          </div>

          {optimizationMode === 'naverCampaign' && (
            <div className="naver-campaign-optimization">
              <div className="naver-optimization-settings">
                <div className="naver-setting-item">
                  <label>
                    최적화 목표
                  </label>

                  <strong>
                    예상 매출 최대화
                  </strong>

                  <small>
                    캠페인별 Response Curve 기반
                  </small>
                </div>

                <div className="naver-setting-item">
                  <label>
                    예산 변경 한도
                  </label>

                  <div className="optimization-limit-input">
                    <span>±</span>

                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="5"
                      value={budgetChangeLimit}
                      onChange={(event) => {
                        const nextValue =
                          Math.min(
                            30,
                            Math.max(
                              0,
                              Number(
                                event.target.value
                              ) || 0
                            )
                          )

                        setBudgetChangeLimit(
                          nextValue
                        )
                      }}
                    />

                    <span>%</span>
                  </div>
                </div>

                <div className="naver-setting-item">
                  <label>
                    실행 방식
                  </label>

                  <strong>
                    추천 결과만 확인
                  </strong>

                  <small>
                    {performanceDataSource ===
                      'mock'
                      ? 'Mock 테스트 전용 · 실제 매체 예산에는 영향 없음'
                      : '실제 Naver 예산은 변경하지 않음'}
                  </small>
                </div>
              </div>

              <button
                type="button"
                className="naver-preview-button"
                disabled={
                  naverPreviewLoading
                }
                onClick={
                  runNaverOptimizationPreview
                }
              >
                {naverPreviewLoading
                  ? '캠페인 최적화 계산 중...'
                  : '캠페인 예산 최적화 실행'}
              </button>

              {naverPreviewError && (
                <div className="naver-preview-error">
                  {naverPreviewError}
                </div>
              )}

              {naverPreviewResult?.status ===
                'blocked' && (
                  <div className="naver-readiness-card">
                    <div className="naver-readiness-header">
                      <div>
                        <span className="naver-status-label">
                          데이터 준비 중
                        </span>

                        <h3>
                          캠페인 최적화 대기
                        </h3>
                      </div>

                      <strong>
                        {Number(
                          naverPreviewResult
                            .readinessPct || 0
                        ).toFixed(1)}
                        %
                      </strong>
                    </div>

                    <div className="naver-readiness-progress">
                      <div
                        style={{
                          width:
                            `${Math.min(
                              100,
                              Number(
                                naverPreviewResult
                                  .readinessPct || 0
                              )
                            )}%`,
                        }}
                      />
                    </div>

                    <p>
                      {naverPreviewResult.message}
                    </p>

                    <div className="naver-readiness-grid">
                      <div>
                        <span>
                          Conversion 유효 시작일
                        </span>

                        <strong>
                          {naverPreviewResult
                            .revenueValidStartDate ||
                            '-'}
                        </strong>
                      </div>

                      <div>
                        <span>
                          현재 유효 데이터
                        </span>

                        <strong>
                          {naverPreviewResult
                            .validRevenueDays ?? 0}
                          일
                        </strong>
                      </div>

                      <div>
                        <span>
                          최소 필요 데이터
                        </span>

                        <strong>
                          {naverPreviewResult
                            .minimumValidTotalDays ??
                            0}
                          일
                        </strong>
                      </div>

                      <div>
                        <span>
                          추가 필요
                        </span>

                        <strong>
                          {naverPreviewResult
                            .remainingValidDays ?? 0}
                          일
                        </strong>
                      </div>
                    </div>

                    <div className="naver-block-reason">
                      Safety Gate:{' '}
                      {naverPreviewResult.blockCode}
                    </div>
                  </div>
                )}
              {naverPreviewResult?.status === 'ok' && (
                <>
                  <div className="naver-portfolio-summary">
                    <div>
                      <span>
                        현재 총 일예산
                      </span>

                      <strong>
                        {Math.round(
                          Number(
                            naverPreviewResult
                              .currentDailyBudget ??
                            naverPreviewResult
                              .totalDailyBudget ??
                            0
                          )
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>
                        추천 총 일예산
                      </span>

                      <strong>
                        {Math.round(
                          Number(
                            naverPreviewResult
                              .recommendedDailyBudget ??
                            naverPreviewResult
                              .totalDailyBudget ??
                            0
                          )
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>
                        예상 Lift
                      </span>

                      <strong>
                        {Number(
                          naverPreviewResult
                            .expectedLiftPct ?? 0
                        ).toFixed(2)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>
                        최적화 대상
                      </span>

                      <strong>
                        {naverPreviewResult
                          .campaignCounts
                          ?.eligible ?? 0}
                        {' / '}
                        {naverPreviewResult
                          .campaignCounts
                          ?.total ?? 0}
                      </strong>
                    </div>
                  </div>

                  <div className="campaign-recommendation-card">
                    <div className="campaign-recommendation-header">
                      <div>
                        <h3>
                          캠페인 예산 추천
                        </h3>

                        <p>
                          현재 예산에서 얼마로 조정할지와
                          추천 이유를 캠페인별로 확인합니다.
                        </p>
                      </div>

                      <span className="campaign-recommendation-source">
                        {performanceDataSource ===
                          'mock'
                          ? 'Mock 데이터 기준'
                          : '실제 Naver 데이터 기준'}
                      </span>
                    </div>

                    <div className="campaign-recommendation-table-wrap">
                      <table className="campaign-recommendation-table">
                        <thead>
                          <tr>
                            <th>
                              캠페인
                            </th>

                            <th>
                              현재 예산
                            </th>

                            <th>
                              추천 예산
                            </th>

                            <th>
                              조정
                            </th>

                            <th>
                              추천 액션
                            </th>

                            <th>
                              추천 근거
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {(naverPreviewResult
                            .campaigns || []
                          ).map(
                            (
                              campaign,
                              index
                            ) => {
                              const currentBudget =
                                Number(
                                  campaign
                                    .currentBudget ??
                                  0
                                )

                              const candidateBudget =
                                Number(
                                  campaign
                                    .candidateBudget ??
                                  currentBudget
                                )

                              const recommendedBudget =
                                Number(
                                  campaign
                                    .recommendedBudget ??
                                  currentBudget
                                )

                              const changePct =
                                Number(
                                  campaign
                                    .changePct ??
                                  (
                                    currentBudget >
                                      0
                                      ? (
                                        (
                                          recommendedBudget -
                                          currentBudget
                                        ) /
                                        currentBudget
                                      ) *
                                      100
                                      : 0
                                  )
                                )

                              const expectedRevenue =
                                Number(
                                  campaign
                                    .expectedRevenue
                                )

                              const marginalRoas =
                                Number(
                                  campaign
                                    .marginalRoasRight ??
                                  campaign
                                    .marginalRoasLeft
                                )

                              const safetyAction =
                                campaign
                                  .safetyAction ||
                                'UNKNOWN'

                              const safetyReasons =
                                Array.isArray(
                                  campaign
                                    .safetyReasons
                                )
                                  ? campaign
                                    .safetyReasons
                                  : []

                              let recommendationAction =
                                '유지'

                              let actionClass =
                                'hold'

                              if (
                                safetyAction ===
                                'REVIEW'
                              ) {
                                recommendationAction =
                                  '유지 검토'

                                actionClass =
                                  'review'

                              } else if (
                                safetyAction ===
                                'HOLD_CURRENT'
                              ) {
                                recommendationAction =
                                  '현재 유지'

                                actionClass =
                                  'hold'

                              } else if (
                                changePct > 0.05
                              ) {
                                recommendationAction =
                                  '증액'

                                actionClass =
                                  'increase'

                              } else if (
                                changePct < -0.05
                              ) {
                                recommendationAction =
                                  '감액'

                                actionClass =
                                  'decrease'
                              }

                              let recommendationReason =
                                '현재 수준 유지가 권장됩니다.'

                              if (
                                safetyAction ===
                                'REVIEW'
                              ) {
                                recommendationReason =
                                  safetyReasons.includes(
                                    'SLOPE_SENSITIVE'
                                  )
                                    ? '반응곡선의 기울기 민감도가 높아 현재 예산을 유지하고 추가 확인이 필요합니다.'
                                    : 'Safety 검토 대상으로 분류되어 현재 예산을 유지합니다.'

                              } else if (
                                safetyAction ===
                                'HOLD_CURRENT'
                              ) {
                                recommendationReason =
                                  safetyReasons.includes(
                                    'NO_VALIDATION_GAIN_VS_TRAIN_MEAN'
                                  )
                                    ? '검증 데이터에서 충분한 개선 효과가 확인되지 않아 현재 예산을 유지합니다.'
                                    : safetyReasons.includes(
                                      'INSUFFICIENT_HISTORY'
                                    )
                                      ? '학습 이력이 충분하지 않아 현재 예산을 유지합니다.'
                                      : 'Safety Gate에 따라 현재 예산을 유지합니다.'

                              } else if (
                                changePct > 0.05
                              ) {
                                recommendationReason =
                                  `모델 최적화 결과 현재 대비 ${Math.abs(
                                    changePct
                                  ).toFixed(
                                    1
                                  )}% 증액이 계산되었습니다.`

                              } else if (
                                changePct < -0.05
                              ) {
                                recommendationReason =
                                  `모델 최적화 결과 현재 대비 ${Math.abs(
                                    changePct
                                  ).toFixed(
                                    1
                                  )}% 감액이 계산되었습니다.`
                              }

                              return (
                                <tr
                                  key={
                                    campaign
                                      .campaignId ||
                                    index
                                  }
                                >
                                  <td className="campaign-recommendation-name">
                                    <strong>
                                      {campaign
                                        .campaignName ||
                                        campaign
                                          .campaignId ||
                                        '-'}
                                    </strong>
                                  </td>

                                  <td>
                                    {Math.round(
                                      currentBudget
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td className="campaign-recommendation-budget">
                                    <strong>
                                      {Math.round(
                                        recommendedBudget
                                      ).toLocaleString()}
                                      원
                                    </strong>
                                  </td>

                                  <td>
                                    <span
                                      className={
                                        changePct > 0
                                          ? 'campaign-change increase'
                                          : changePct < 0
                                            ? 'campaign-change decrease'
                                            : 'campaign-change hold'
                                      }
                                    >
                                      {changePct > 0
                                        ? '+'
                                        : ''}
                                      {changePct.toFixed(
                                        1
                                      )}
                                      %
                                    </span>
                                  </td>

                                  <td>
                                    <span
                                      className={
                                        `campaign-action-badge ${actionClass}`
                                      }
                                    >
                                      {
                                        recommendationAction
                                      }
                                    </span>
                                  </td>

                                  <td className="campaign-recommendation-reason">
                                    <div>
                                      {
                                        recommendationReason
                                      }
                                    </div>

                                    <details className="campaign-model-details">
                                      <summary>
                                        모델 상세 보기
                                      </summary>

                                      <div className="campaign-model-detail-grid">
                                        <div>
                                          <span>
                                            Safety 적용 전 후보
                                          </span>

                                          <strong>
                                            {Math.round(
                                              candidateBudget
                                            ).toLocaleString()}
                                            원
                                          </strong>
                                        </div>

                                        <div>
                                          <span>
                                            예상 매출
                                          </span>

                                          <strong>
                                            {Number.isFinite(
                                              expectedRevenue
                                            )
                                              ? `${Math.round(
                                                expectedRevenue
                                              ).toLocaleString()}원`
                                              : '-'}
                                          </strong>
                                        </div>

                                        <div>
                                          <span>
                                            Marginal ROAS
                                          </span>

                                          <strong>
                                            {Number.isFinite(
                                              marginalRoas
                                            )
                                              ? `${marginalRoas.toFixed(
                                                1
                                              )}%`
                                              : '-'}
                                          </strong>
                                        </div>

                                        <div>
                                          <span>
                                            Safety 판정
                                          </span>

                                          <strong>
                                            {
                                              safetyAction
                                            }
                                          </strong>
                                        </div>
                                      </div>

                                      {safetyReasons
                                        .length > 0 && (
                                          <div className="campaign-model-reasons">
                                            원본 진단:
                                            {' '}
                                            {safetyReasons.join(
                                              ', '
                                            )}
                                          </div>
                                        )}
                                    </details>
                                  </td>
                                </tr>
                              )
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </>
              )}
            </div>
          )}

          {optimizationMode ===
            'budgetScaling' && (
              <div className="budget-scaling-panel">
                <div className="budget-scaling-header">
                  <div>
                    <h3>
                      예산 확장 분석
                    </h3>

                    <p>
                      현재 예산을 기준으로 증액·감액 시나리오별
                      예상 성과와 효율 변화를 비교합니다.
                    </p>
                  </div>
                </div>

                <div className="budget-scaling-summary">
                  <div className="budget-scaling-summary-card">
                    <span>
                      현재 대상 일예산
                    </span>

                    <strong>
                      {Math.round(
                        Number(
                          displayedCampaignBudgetPolicyMeta
                            ?.optimizationCurrentTotalDailyBudget
                        ) || 0
                      ).toLocaleString()}
                      원
                    </strong>
                  </div>

                  <div className="budget-scaling-summary-card">
                    <span>
                      분석 시나리오
                    </span>

                    <strong>
                      {
                        budgetScalingMultipliers
                          .length
                      }
                      개
                    </strong>
                  </div>

                  <div className="budget-scaling-summary-card">
                    <span>
                      예산 조정 허용폭
                    </span>

                    <strong>
                      ±
                      {Number(
                        budgetChangeLimit
                      ) || 0}
                      %
                    </strong>
                  </div>
                </div>

                <div className="budget-scaling-scenarios">
                  {budgetScalingMultipliers.map(
                    (multiplier) => {
                      const changePct =
                        (
                          multiplier -
                          1
                        ) * 100

                      const currentBudget =
                        Number(
                          displayedCampaignBudgetPolicyMeta
                            ?.optimizationCurrentTotalDailyBudget
                        ) || 0

                      const scenarioBudget =
                        currentBudget *
                        multiplier

                      return (
                        <div
                          key={multiplier}
                          className={
                            multiplier === 1
                              ? 'budget-scaling-scenario current'
                              : 'budget-scaling-scenario'
                          }
                        >
                          <span>
                            {multiplier === 1
                              ? '현재'
                              : `${changePct > 0
                                ? '+'
                                : ''
                              }${changePct.toFixed(
                                0
                              )}%`}
                          </span>

                          <strong>
                            {Math.round(
                              scenarioBudget
                            ).toLocaleString()}
                            원
                          </strong>
                        </div>
                      )
                    }
                  )}
                </div>

                <button
                  type="button"
                  className="budget-scaling-run-button"
                  disabled={
                    budgetScalingLoading ||
                    Number(
                      displayedCampaignBudgetPolicyMeta
                        ?.missingPolicyCount
                    ) > 0 ||
                    Number(
                      displayedCampaignBudgetPolicyMeta
                        ?.optimizationEligibleCount
                    ) < 2
                  }
                  onClick={
                    runBudgetScalingAnalysis
                  }
                >
                  {budgetScalingLoading
                    ? '예산 시나리오 분석 중...'
                    : '예산 확장 분석 실행'}
                </button>

                <div className="budget-scaling-decision-summary">
                  <div className="budget-scaling-decision-card">
                    <span>
                      현재 운영 예산
                    </span>

                    <strong>
                      {Math.round(
                        budgetScalingKpis
                          .currentBudget
                      ).toLocaleString()}
                      원
                    </strong>

                    <small>
                      최적화 대상 캠페인 기준
                    </small>
                  </div>

                  <div className="budget-scaling-decision-card">
                    <span>
                      증액 검토 가능 구간
                    </span>

                    <strong>
                      {
                        budgetScalingKpis
                          .expansionLabel
                      }
                    </strong>

                    <small>
                      {Number.isFinite(
                        budgetScalingKpis
                          .expansionBudget
                      )
                        ? `${Math.round(
                          budgetScalingKpis
                            .expansionBudget
                        ).toLocaleString()}원`
                        : '학습 데이터 대기 중'}
                    </small>
                  </div>

                  <div className="budget-scaling-decision-card">
                    <span>
                      효율 둔화 시작
                    </span>

                    <strong>
                      {
                        budgetScalingKpis
                          .slowdownLabel
                      }
                    </strong>

                    <small>
                      {Number.isFinite(
                        budgetScalingKpis
                          .slowdownBudget
                      )
                        ? `${Math.round(
                          budgetScalingKpis
                            .slowdownBudget
                        ).toLocaleString()}원`
                        : budgetScalingKpis
                          .slowdownLabel ===
                          '범위 내 미감지'
                          ? '현재 분석 범위 기준'
                          : '학습 데이터 대기 중'}
                    </small>
                  </div>
                </div>

                {budgetScalingError && (
                  <div className="budget-scaling-error">
                    {budgetScalingError}
                  </div>
                )}

                {budgetScalingResult?.status ===
                  'ok' && (
                    <div className="budget-scaling-results">
                      <h4>
                        예산 시나리오 비교
                      </h4>

                      <div className="budget-scaling-table">
                        <div className="budget-scaling-table-header">
                          <span>
                            변화
                          </span>

                          <span>
                            일예산
                          </span>

                          <span>
                            예상 매출
                          </span>

                          <span>
                            예상 ROAS
                          </span>

                          <span>
                            증분 매출
                          </span>

                          <span>
                            한계 ROAS
                          </span>

                          <span>
                            효율 판단
                          </span>

                          <span>
                            분석 상태
                          </span>
                        </div>

                        {budgetScalingAnalysisRows.map(
                          (
                            scenario,
                            index
                          ) => {
                            const multiplier =
                              Number(
                                scenario.multiplier
                              ) || 0

                            const changePct =
                              (
                                multiplier -
                                1
                              ) * 100

                            const scenarioBudget =
                              Number(
                                scenario.budget
                              ) || 0

                            const expectedRevenue =
                              scenario.revenue

                            const expectedRoas =
                              scenario.roas

                            const incrementalRevenue =
                              scenario.incrementalRevenue

                            const marginalRoas =
                              scenario.marginalRoas

                            const isOk =
                              scenario.status ===
                              'ok'

                            const rawBlockCode =
                              scenario.blockCode ||
                              scenario.message ||
                              ''

                            const blockCode =
                              rawBlockCode.includes(
                                'infeasible under guardrails'
                              ) ||
                                rawBlockCode.includes(
                                  'Total budget'
                                )
                                ? '현재 제약조건에서 실행 불가'
                                : (
                                  rawBlockCode ||
                                  '-'
                                )

                            const validRevenueDays =
                              Number(
                                scenario.result
                                  ?.validRevenueDays
                              )

                            const minimumValidTotalDays =
                              Number(
                                scenario.result
                                  ?.minimumValidTotalDays
                              )

                            const efficiencyLabel =
                              multiplier <= 1
                                ? '-'
                                : (
                                  Number.isFinite(
                                    marginalRoas
                                  ) &&
                                  Number.isFinite(
                                    budgetScalingEfficiencyThreshold
                                  )
                                )
                                  ? (
                                    marginalRoas >=
                                      budgetScalingEfficiencyThreshold
                                      ? '효율 유지'
                                      : '효율 둔화'
                                  )
                                  : '-'

                            const statusLabel =
                              isOk
                                ? '분석 완료'
                                : blockCode ===
                                  'INSUFFICIENT_VALID_REVENUE_HISTORY'
                                  ? (
                                    Number.isFinite(
                                      validRevenueDays
                                    ) &&
                                      Number.isFinite(
                                        minimumValidTotalDays
                                      )
                                      ? `학습 데이터 부족 · ${validRevenueDays}/${minimumValidTotalDays}일`
                                      : '학습 데이터 부족'
                                  )
                                  : blockCode

                            return (
                              <div
                                key={
                                  `${scenario.multiplier}-${index}`
                                }
                                className={
                                  multiplier === 1
                                    ? 'budget-scaling-table-row current'
                                    : 'budget-scaling-table-row'
                                }
                              >
                                <span>
                                  {multiplier === 1
                                    ? '현재'
                                    : `${changePct >
                                      0
                                      ? '+'
                                      : ''
                                    }${changePct.toFixed(
                                      0
                                    )}%`}
                                </span>

                                <strong>
                                  {Math.round(
                                    scenarioBudget
                                  ).toLocaleString()}
                                  원
                                </strong>

                                <span>
                                  {isOk &&
                                    Number.isFinite(
                                      expectedRevenue
                                    )
                                    ? `${Math.round(
                                      expectedRevenue
                                    ).toLocaleString()}원`
                                    : '-'}
                                </span>

                                <span>
                                  {expectedRoas !==
                                    null
                                    ? `${expectedRoas.toFixed(
                                      1
                                    )}%`
                                    : '-'}
                                </span>

                                <span>
                                  {Number.isFinite(
                                    incrementalRevenue
                                  )
                                    ? `${incrementalRevenue >
                                      0
                                      ? '+'
                                      : ''
                                    }${Math.round(
                                      incrementalRevenue
                                    ).toLocaleString()}원`
                                    : '-'}
                                </span>

                                <span>
                                  {Number.isFinite(
                                    marginalRoas
                                  )
                                    ? `${marginalRoas.toFixed(
                                      1
                                    )}%`
                                    : '-'}
                                </span>

                                <span
                                  className={
                                    efficiencyLabel ===
                                      '효율 유지'
                                      ? 'budget-scaling-efficiency maintained'
                                      : efficiencyLabel ===
                                        '효율 둔화'
                                        ? 'budget-scaling-efficiency slowdown'
                                        : 'budget-scaling-efficiency'
                                  }
                                >
                                  {efficiencyLabel}
                                </span>

                                <span
                                  className={
                                    isOk
                                      ? 'budget-scaling-status ready'
                                      : 'budget-scaling-status blocked'
                                  }
                                >
                                  {statusLabel}
                                </span>
                              </div>
                            )
                          }
                        )}
                      </div>
                      <div
                        className={
                          `budget-scaling-insight ${budgetScalingInsight
                            .status
                          }`
                        }
                      >
                        <strong>
                          {
                            budgetScalingInsight
                              .title
                          }
                        </strong>

                        <p>
                          {
                            budgetScalingInsight
                              .message
                          }
                        </p>
                      </div>

                      <div className="budget-scaling-chart-panel">
                        <div className="budget-scaling-chart-header">
                          <div>
                            <h4>
                              예산 · 예상 매출 반응곡선
                            </h4>

                            <p>
                              현재 예산 대비 증감 시 예상 매출 변화를 보여줍니다.
                            </p>
                          </div>
                        </div>

                        {budgetScalingAnalysisRows.filter(
                          (row) =>
                            row.status === 'ok' &&
                            Number.isFinite(
                              row.revenue
                            )
                        ).length < 2 ? (
                          <div className="budget-scaling-chart-empty">
                            유효한 학습 데이터가 충분해지면
                            예산-매출 반응곡선이 표시됩니다.
                          </div>
                        ) : (
                          <ResponsiveContainer
                            width="100%"
                            height={300}
                          >
                            <LineChart
                              data={
                                budgetScalingAnalysisRows
                                  .filter(
                                    (row) =>
                                      row.status ===
                                      'ok' &&
                                      Number.isFinite(
                                        row.revenue
                                      )
                                  )
                                  .map(
                                    (row) => ({
                                      ...row,

                                      changePct:
                                        Math.round(
                                          (
                                            Number(
                                              row.multiplier
                                            ) -
                                            1
                                          ) * 100
                                        ),
                                    })
                                  )
                              }
                              margin={{
                                top: 15,
                                right: 20,
                                left: 20,
                                bottom: 10,
                              }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                              />

                              <XAxis
                                dataKey="changePct"
                                tickFormatter={(
                                  value
                                ) =>
                                  value === 0
                                    ? '현재'
                                    : `${value > 0
                                      ? '+'
                                      : ''
                                    }${value}%`
                                }
                              />

                              <XAxis
                                dataKey="changePct"
                                tickFormatter={(
                                  value
                                ) => {
                                  const roundedValue =
                                    Math.round(
                                      Number(
                                        value
                                      ) || 0
                                    )

                                  return roundedValue === 0
                                    ? '현재'
                                    : `${roundedValue > 0
                                      ? '+'
                                      : ''
                                    }${roundedValue}%`
                                }}
                              />

                              <Tooltip
                                formatter={(
                                  value
                                ) =>
                                  `${Math.round(
                                    value
                                  ).toLocaleString()}원`
                                }
                                labelFormatter={(
                                  value
                                ) =>
                                  value === 0
                                    ? '현재 예산'
                                    : `현재 대비 ${value >
                                      0
                                      ? '+'
                                      : ''
                                    }${value}%`
                                }
                              />

                              <Line
                                type="monotone"
                                dataKey="revenue"
                                name="예상 매출"
                                strokeWidth={2}
                                dot
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                      <div className="budget-scaling-chart-panel">
                        <div className="budget-scaling-chart-header">
                          <div>
                            <h4>
                              증액 구간별 한계 ROAS
                            </h4>

                            <p>
                              추가 예산 1원당 예상되는 추가 매출 효율입니다.
                            </p>
                          </div>
                        </div>

                        {budgetScalingAnalysisRows.filter(
                          (row) =>
                            row.multiplier > 1 &&
                            Number.isFinite(
                              row.marginalRoas
                            )
                        ).length < 1 ? (
                          <div className="budget-scaling-chart-empty">
                            유효한 학습 데이터가 충분해지면
                            증액 구간별 한계 ROAS가 표시됩니다.
                          </div>
                        ) : (
                          <ResponsiveContainer
                            width="100%"
                            height={300}
                          >
                            <LineChart
                              data={
                                budgetScalingAnalysisRows
                                  .filter(
                                    (row) =>
                                      row.multiplier >
                                      1 &&
                                      Number.isFinite(
                                        row.marginalRoas
                                      )
                                  )
                                  .map(
                                    (row) => ({
                                      ...row,

                                      changePct:
                                        Math.round(
                                          (
                                            Number(
                                              row.multiplier
                                            ) -
                                            1
                                          ) * 100
                                        ),
                                    })
                                  )
                              }
                              margin={{
                                top: 15,
                                right: 20,
                                left: 20,
                                bottom: 10,
                              }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                              />

                              <XAxis
                                dataKey="changePct"
                                tickFormatter={(
                                  value
                                ) =>
                                  `+${Math.round(
                                    Number(
                                      value
                                    ) || 0
                                  )}%`
                                }
                              />

                              <YAxis
                                tickFormatter={(
                                  value
                                ) =>
                                  `${Math.round(
                                    value
                                  )}%`
                                }
                              />

                              <Tooltip
                                formatter={(
                                  value
                                ) => [
                                    `${Number(
                                      value
                                    ).toFixed(
                                      1
                                    )}%`,
                                    '한계 ROAS',
                                  ]}
                                labelFormatter={(
                                  value
                                ) =>
                                  `현재 대비 +${Math.round(
                                    Number(
                                      value
                                    ) || 0
                                  )}% 예산 구간`
                                }
                              />

                              {Number.isFinite(
                                budgetScalingEfficiencyThreshold
                              ) && (
                                  <ReferenceLine
                                    y={
                                      budgetScalingEfficiencyThreshold
                                    }
                                    strokeDasharray="5 5"
                                    label={{
                                      value:
                                        `효율 유지 기준 ${budgetScalingEfficiencyThreshold.toFixed(
                                          0
                                        )}%`,
                                      position:
                                        'insideTopRight',
                                    }}
                                  />
                                )}

                              <Line
                                type="monotone"
                                dataKey="marginalRoas"
                                name="한계 ROAS"
                                strokeWidth={2}
                                dot
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                    </div>
                  )}
              </div>
            )}

          {optimizationMode === 'channel' && (
            <>

              <div className="budget-input-section">
                <label>
                  최적화할 총 예산
                </label>

                <div className="budget-input-row">
                  <input
                    type="number"
                    min="0"
                    placeholder="예: 10000000"
                    value={optimizationBudget}
                    onChange={(event) =>
                      setOptimizationBudget(
                        event.target.value
                      )
                    }
                  />

                  <span>원</span>
                </div>
              </div>

              <div className="optimization-objective-group">
                <label>
                  최적화 목표
                </label>

                <select
                  value={optimizationObjective}
                  onChange={(e) =>
                    setOptimizationObjective(
                      e.target.value
                    )
                  }
                >
                  <option value="revenue">
                    예상 매출 최대화
                  </option>

                  <option value="conversions">
                    예상 전환 최대화
                  </option>

                  <option value="revenueWithRoas">
                    목표 ROAS 이상에서 매출 최대화
                  </option>

                  <option value="conversionsWithCpa">
                    목표 CPA 이하에서 전환 최대화
                  </option>

                  <option value="riskAdjustedRevenue">
                    리스크를 고려한 매출 최대화
                  </option>


                </select>
              </div>

              {optimizationObjective === 'revenueWithRoas' && (
                <div className="optimization-target-group">
                  <label>
                    목표 ROAS
                  </label>

                  <div className="optimization-target-input">
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={targetRoas}
                      onChange={(event) =>
                        setTargetRoas(
                          Number(event.target.value)
                        )
                      }
                    />

                    <span>%</span>
                  </div>
                </div>
              )}

              {optimizationObjective === 'conversionsWithCpa' && (
                <div className="optimization-target-group">
                  <label>
                    목표 CPA
                  </label>

                  <div className="optimization-target-input">
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="예: 30000"
                      value={targetCpa}
                      onChange={(event) =>
                        setTargetCpa(
                          event.target.value
                        )
                      }
                    />

                    <span>원</span>
                  </div>
                </div>
              )}

              {optimizationObjective === 'riskAdjustedRevenue' && (
                <div className="optimization-target-group">
                  <label>
                    리스크 허용 수준
                  </label>

                  <select
                    value={riskLevel}
                    onChange={(event) =>
                      setRiskLevel(
                        event.target.value
                      )
                    }
                  >
                    <option value="low">
                      낮음
                    </option>

                    <option value="medium">
                      보통
                    </option>

                    <option value="high">
                      높음
                    </option>
                  </select>
                </div>
              )}

              <div className="optimization-limit-group">
                <label>
                  예산 조정 허용폭
                </label>

                <div className="optimization-limit-input">
                  <span>±</span>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={budgetChangeLimit}
                    onChange={(event) => {
                      const rawValue =
                        event.target.value

                      if (rawValue === '') {
                        setBudgetChangeLimit(0)
                        return
                      }

                      const nextValue =
                        Number(rawValue)

                      const clampedValue =
                        Math.min(
                          100,
                          Math.max(
                            0,
                            nextValue
                          )
                        )



                      setBudgetChangeLimit(
                        clampedValue
                      )
                    }}
                  />

                  <span>%</span>
                </div>
              </div>

              {optimizationBudget && (
                <div
                  className={
                    optimizationFeasibility.isFeasible
                      ? 'optimization-feasibility feasible'
                      : 'optimization-feasibility infeasible'
                  }
                >
                  {optimizationFeasibility.isFeasible && (
                    <>
                      <strong>
                        최적화 가능한 예산입니다.
                      </strong>

                      <div>
                        가능한 기간 총예산 범위:
                        {' '}
                        {Math.round(
                          optimizationFeasibility.minimumFeasibleBudget *
                          optimizationPeriodDays
                        ).toLocaleString()}
                        원
                        {' ~ '}
                        {Math.round(
                          optimizationFeasibility.maximumFeasibleBudget *
                          optimizationPeriodDays
                        ).toLocaleString()}
                        원
                      </div>
                    </>
                  )}

                  {!optimizationFeasibility.isFeasible &&
                    !optimizationFeasibility.hasValidBudgetRange && (
                      <>
                        <strong>
                          성과 데이터가 부족하여 유효한 최적화 예산 범위를 계산할 수 없습니다.
                        </strong>

                        <div>
                          일부 매체의 데이터량 또는 예산 제약 조건을 확인해 주세요.
                        </div>
                      </>
                    )}

                  {!optimizationFeasibility.isFeasible &&
                    optimizationFeasibility.hasValidBudgetRange && (
                      <>
                        <strong>
                          현재 총예산은 최적화 가능 범위를 벗어났습니다.
                        </strong>

                        <div>
                          가능한 기간 총예산 범위:
                          {' '}
                          {Math.round(
                            optimizationFeasibility.minimumFeasibleBudget *
                            optimizationPeriodDays
                          ).toLocaleString()}
                          원
                          {' ~ '}
                          {Math.round(
                            optimizationFeasibility.maximumFeasibleBudget *
                            optimizationPeriodDays
                          ).toLocaleString()}
                          원
                        </div>
                      </>
                    )}
                </div>
              )}

              {false && optimizationBudget && (
                <div
                  className={
                    lpModelValidation.isValid
                      ? 'lp-validation valid'
                      : 'lp-validation invalid'
                  }
                >
                  <strong>
                    OR 모델 검증
                  </strong>

                  <span>
                    변수 {lpModelValidation.variableCount}개
                    {' · '}
                    제약식 {lpModelValidation.constraintCount}개
                  </span>

                  {!lpModelValidation.isValid && (
                    <div className="lp-validation-messages">
                      {lpModelValidation.errors.map(
                        (message, index) => (
                          <p key={index}>
                            {message}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  {lpModelValidation.warnings.length > 0 && (
                    <div className="lp-validation-warnings">
                      {lpModelValidation.warnings.map(
                        (message, index) => (
                          <p key={index}>
                            {message}
                          </p>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}



              {naverPreviewError && (
                <div className="optimization-api-error">
                  {naverPreviewError}
                </div>
              )}



              {naverPreviewResult?.status === 'ok' && (
                <>
                  <div className="optimization-api-result">
                    <strong>
                      V2 최적화 Preview 완료
                    </strong>

                    <span>
                      {naverPreviewResult
                        .portfolioAction ===
                        'SHADOW_WITH_GUARDRAILS'
                        ? '안전장치 적용 Shadow 추천'
                        : 'Shadow 추천 가능'}
                    </span>
                  </div>

                  <div className="gurobi-scenario-summary">
                    <div className="gurobi-summary-card">
                      <span>
                        현재 일예산
                      </span>

                      <strong>
                        {Math.round(
                          naverPreviewResult
                            .totalDailyBudget || 0
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        추천 일예산
                      </span>

                      <strong>
                        {Math.round(
                          naverPreviewResult
                            .recommendedTotalBudget ||
                          0
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        현재 예상 일매출
                      </span>

                      <strong>
                        {Math.round(
                          naverPreviewResult
                            .estimatedCurrentRevenue ||
                          0
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        추천 예상 일매출
                      </span>

                      <strong>
                        {Math.round(
                          naverPreviewResult
                            .estimatedRecommendedRevenue ||
                          0
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        예상 Lift
                      </span>

                      <strong>
                        {naverPreviewResult
                          .estimatedLiftPct !== null &&
                          naverPreviewResult
                            .estimatedLiftPct !== undefined
                          ? `${naverPreviewResult
                            .estimatedLiftPct > 0
                            ? '+'
                            : ''
                          }${naverPreviewResult
                            .estimatedLiftPct
                            .toFixed(2)}%`
                          : '-'}
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        모델링 캠페인
                      </span>

                      <strong>
                        {naverPreviewResult
                          .campaignCounts
                          ?.modeled || 0}
                        개
                      </strong>

                      <small>
                        전체{' '}
                        {naverPreviewResult
                          .campaignCounts
                          ?.total || 0}
                        개
                      </small>
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                className="run-optimization-button"
                disabled={
                  optimizationApiLoading ||
                  !selectedAdvertiserId
                }
                onClick={runOptimization}
              >
                {optimizationApiLoading
                  ? '추천 예산 계산 중...'
                  : '매체별 추천 예산 계산'}
              </button>

              {optimizationApiResult?.status === 'optimal' && (
                <div className="scenario-save-controls">
                  <input
                    type="text"
                    value={scenarioName}
                    placeholder="시나리오 이름"
                    onChange={(event) =>
                      setScenarioName(
                        event.target.value
                      )
                    }
                  />

                  <button
                    type="button"
                    onClick={
                      saveCurrentOptimizationScenario
                    }
                  >
                    현재 결과 저장
                  </button>
                </div>
              )}

            </>
          )}

          {optimizationObjective ===
            'riskAdjustedRevenue' && (
              <button
                type="button"
                className="risk-compare-button"
                onClick={
                  runRiskScenarioComparison
                }
                disabled={
                  riskScenarioLoading ||
                  !solverModelPayload
                }
              >
                {riskScenarioLoading
                  ? '리스크 시나리오 계산 중...'
                  : '낮음 · 보통 · 높음 비교'}
              </button>
            )}

          {optimizationApiError && (
            <div className="optimization-api-error">
              {optimizationApiError}
            </div>
          )}

          {optimizationMode ===
            'naverCampaign' && (
              <div className="campaign-budget-policy-panel">
                <div className="campaign-budget-policy-header">
                  <div>
                    <h3>
                      캠페인 예산 범위 설정
                    </h3>

                    <p>
                      {performanceDataSource ===
                        'mock'
                        ? '현재 선택한 Mock 데이터와 상단 필터를 기준으로 캠페인별 예산 범위를 계산합니다.'
                        : '실제 Naver 일예산을 기준으로 최적화 가능한 최소·최대 예산을 설정합니다.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        performanceDataSource ===
                        'mock'
                      ) {
                        setBudgetScalingResult(
                          null
                        )

                        return
                      }

                      loadCampaignBudgetPolicies()
                    }}
                  >
                    {performanceDataSource ===
                      'mock'
                      ? 'Mock 다시 계산'
                      : '새로고침'}
                  </button>
                </div>

                <div className="campaign-budget-policy-summary">
                  <div>
                    <span>
                      전체 캠페인
                    </span>

                    <strong>
                      {
                        displayedCampaignBudgetPolicyMeta
                          .campaignCount
                      }
                      개
                    </strong>
                  </div>

                  <div>
                    <span>
                      최적화 대상
                    </span>

                    <strong>
                      {
                        displayedCampaignBudgetPolicyMeta
                          .optimizationEligibleCount
                      }
                      개
                    </strong>
                  </div>

                  <div>
                    <span>
                      최적화 제외
                    </span>

                    <strong>
                      {
                        displayedCampaignBudgetPolicyMeta
                          .excludedCampaignCount
                      }
                      개
                    </strong>
                  </div>

                  <div>
                    <span>
                      대상 현재 총 일예산
                    </span>

                    <strong>
                      {Math.round(
                        displayedCampaignBudgetPolicyMeta
                          .optimizationCurrentTotalDailyBudget ||
                        0
                      ).toLocaleString()}
                      원
                    </strong>
                  </div>

                  <div>
                    <span>
                      정책 설정 완료
                    </span>

                    <strong>
                      {
                        displayedCampaignBudgetPolicyMeta
                          .policyReadyCount
                      }
                      /
                      {
                        displayedCampaignBudgetPolicyMeta
                          .optimizationEligibleCount
                      }
                    </strong>
                  </div>
                </div>

                <div className="campaign-budget-bulk-policy">
                  <div>
                    <strong>
                      일괄 초안
                    </strong>

                    <span>
                      {performanceDataSource ===
                        'mock'
                        ? '현재 선택된 Mock 데이터의 평균 일예산 대비 비율입니다.'
                        : '현재 Naver 일예산 대비 비율을 직접 지정합니다.'}
                    </span>
                  </div>

                  <label>
                    최소 예산

                    <div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        placeholder="예: 50"
                        value={
                          campaignBudgetBulkMinPct
                        }
                        onChange={(event) =>
                          setCampaignBudgetBulkMinPct(
                            event.target.value
                          )
                        }
                      />

                      <span>
                        %
                      </span>
                    </div>
                  </label>

                  <label>
                    최대 예산

                    <div>
                      <input
                        type="number"
                        min="100"
                        step="1"
                        placeholder="예: 150"
                        value={
                          campaignBudgetBulkMaxPct
                        }
                        onChange={(event) =>
                          setCampaignBudgetBulkMaxPct(
                            event.target.value
                          )
                        }
                      />

                      <span>
                        %
                      </span>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={
                      applyBulkCampaignBudgetPolicy
                    }
                  >
                    전체 캠페인에 적용
                  </button>
                </div>

                <p className="campaign-budget-policy-note">
                  {performanceDataSource ===
                    'mock'
                    ? '최소·최대 예산은 Mock 테스트용 Business Constraint이며 실제 매체 예산에는 영향을 주지 않습니다.'
                    : '최소·최대 예산은 Business Constraint입니다. 예산 조정 허용폭과는 별도로 적용되며, 이 화면에서 저장해도 Naver의 실제 예산은 변경되지 않습니다.'}
                </p>

                {campaignBudgetPolicyError && (
                  <div className="optimization-api-error">
                    {
                      campaignBudgetPolicyError
                    }
                  </div>
                )}

                {performanceDataSource !==
                  'mock' &&
                  campaignBudgetPolicyLoading ? (
                  <div className="campaign-budget-policy-empty">
                    캠페인 예산 정보를
                    불러오는 중입니다.
                  </div>
                ) : displayedCampaignBudgetPolicies.length ===
                  0 ? (
                  <div className="campaign-budget-policy-empty">
                    {performanceDataSource ===
                      'mock'
                      ? '현재 상단 필터 조건에 해당하는 Mock 캠페인이 없습니다.'
                      : '동기화된 Naver 캠페인 예산이 없습니다.'}
                  </div>
                ) : (
                  <div className="campaign-budget-policy-table-wrap">
                    <table className="campaign-budget-policy-table">
                      <thead>
                        <tr>
                          <th>
                            캠페인
                          </th>

                          <th>
                            현재 예산 x₀
                          </th>

                          <th>
                            최소 예산 L
                          </th>

                          <th>
                            최대 예산 U
                          </th>

                          <th>
                            정책 상태
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {displayedCampaignBudgetPolicies.map(
                          (policy) => {
                            const draft =
                              performanceDataSource ===
                                'mock'
                                ? {
                                  minDailyBudget:
                                    policy.minDailyBudget,
                                  maxDailyBudget:
                                    policy.maxDailyBudget,
                                }
                                : (
                                  campaignBudgetPolicyDrafts[
                                  policy.campaignId
                                  ] || {}
                                )

                            return (
                              <tr
                                key={
                                  policy.campaignId
                                }
                              >
                                <td>
                                  <strong>
                                    {policy.campaignName ||
                                      policy.campaignId}
                                  </strong>

                                  <small>
                                    {
                                      policy.campaignId
                                    }
                                  </small>
                                </td>

                                <td>
                                  {policy.currentDailyBudget !=
                                    null
                                    ? `${Math.round(
                                      Number(
                                        policy.currentDailyBudget
                                      )
                                    ).toLocaleString()}원`
                                    : '-'}
                                </td>

                                <td>
                                  <input
                                    type="number"
                                    disabled={
                                      performanceDataSource ===
                                      'mock' ||
                                      !policy.optimizationEligible
                                    }
                                    min="0"
                                    step="1000"
                                    value={
                                      draft.minDailyBudget ??
                                      ''
                                    }
                                    onChange={(event) => {
                                      const value =
                                        event.target.value

                                      setCampaignBudgetPolicyDrafts(
                                        (
                                          current
                                        ) => ({
                                          ...current,

                                          [policy.campaignId]:
                                          {
                                            ...(
                                              current[
                                              policy.campaignId
                                              ] ||
                                              {}
                                            ),

                                            minDailyBudget:
                                              value,
                                          },
                                        })
                                      )
                                    }}
                                  />
                                </td>

                                <td>
                                  <input
                                    type="number"
                                    disabled={
                                      performanceDataSource ===
                                      'mock' ||
                                      !policy.optimizationEligible
                                    }
                                    min="0"
                                    step="1000"
                                    value={
                                      draft.maxDailyBudget ??
                                      ''
                                    }
                                    onChange={(event) => {
                                      const value =
                                        event.target.value

                                      setCampaignBudgetPolicyDrafts(
                                        (
                                          current
                                        ) => ({
                                          ...current,

                                          [policy.campaignId]:
                                          {
                                            ...(
                                              current[
                                              policy.campaignId
                                              ] ||
                                              {}
                                            ),

                                            maxDailyBudget:
                                              value,
                                          },
                                        })
                                      )
                                    }}
                                  />
                                </td>

                                <td>
                                  <span
                                    className={
                                      !policy.optimizationEligible
                                        ? 'campaign-budget-policy-status excluded'
                                        : policy.policyReady
                                          ? 'campaign-budget-policy-status ready'
                                          : 'campaign-budget-policy-status pending'
                                    }
                                  >
                                    {!policy.optimizationEligible
                                      ? '최적화 제외'
                                      : performanceDataSource ===
                                        'mock'
                                        ? 'Mock 준비됨'
                                        : policy.policyReady
                                          ? '저장됨'
                                          : '미설정'}
                                  </span>
                                </td>
                              </tr>
                            )
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {performanceDataSource !==
                  'mock' && (
                    <div className="campaign-budget-policy-actions">
                      <button
                        type="button"
                        className="run-optimization-button"
                        onClick={
                          saveCampaignBudgetPolicies
                        }
                        disabled={
                          campaignBudgetPolicySaving ||
                          campaignBudgetPolicies.length ===
                          0
                        }
                      >
                        {campaignBudgetPolicySaving
                          ? 'Budget Policy 저장 중...'
                          : 'Budget Policy 저장'}
                      </button>
                    </div>
                  )}
              </div>
            )}

          {optimizationMode === 'channel' &&
            optimizationApiResult?.status ===
            'blocked' && (
              <div className="naver-readiness-card">
                <div className="naver-readiness-header">
                  <div>
                    <span className="naver-status-label">
                      매체 최적화 대기
                    </span>

                    <h3>
                      추천 예산을 아직 계산할 수 없습니다.
                    </h3>
                  </div>
                </div>

                <p>
                  {optimizationApiResult.message}
                </p>

                <div className="naver-block-reason">
                  사유:{' '}
                  {optimizationApiResult.blockCode}
                </div>

                {Array.isArray(
                  optimizationApiResult.channels
                ) &&
                  optimizationApiResult.channels.length >
                  0 && (
                    <div className="naver-campaign-table-card">
                      <div className="naver-campaign-table-header">
                        <h3>
                          연결된 매체 데이터
                        </h3>
                      </div>

                      <div className="naver-campaign-table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>매체</th>
                              <th>데이터 일수</th>
                              <th>시작일</th>
                              <th>최근일</th>
                              <th>매출 발생일</th>
                              <th>누적 광고비</th>
                              <th>누적 매출</th>
                            </tr>
                          </thead>

                          <tbody>
                            {optimizationApiResult.channels.map(
                              (
                                channel,
                                index
                              ) => (
                                <tr
                                  key={
                                    channel.channel ||
                                    index
                                  }
                                >
                                  <td>
                                    <strong>
                                      {channel.channel}
                                    </strong>
                                  </td>

                                  <td>
                                    {channel.totalDays}
                                    일
                                  </td>

                                  <td>
                                    {channel.firstDate ||
                                      '-'}
                                  </td>

                                  <td>
                                    {channel.lastDate ||
                                      '-'}
                                  </td>

                                  <td>
                                    {channel
                                      .positiveRevenueDays ??
                                      0}
                                    일
                                  </td>

                                  <td>
                                    {Math.round(
                                      Number(
                                        channel.totalSpend ||
                                        0
                                      )
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {Math.round(
                                      Number(
                                        channel.totalRevenue ||
                                        0
                                      )
                                    ).toLocaleString()}
                                    원
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
              </div>
            )}

          {optimizationMode === 'channel' &&
            optimizationApiResult?.status === 'ok' && (
              <div className="naver-readiness-card">
                <div className="naver-readiness-header">
                  <div>
                    <span className="naver-status-label">
                      매체 최적화 완료
                    </span>

                    <h3>
                      매체별 추천 예산
                    </h3>
                  </div>
                </div>

                <p>
                  V2 Response Curve와 Safety Gate를
                  통과한 Shadow Preview 결과입니다.
                </p>

                <div className="naver-block-reason">
                  Portfolio Action:{' '}
                  {optimizationApiResult.portfolioAction}
                </div>

                {Array.isArray(
                  optimizationApiResult.campaigns
                ) &&
                  optimizationApiResult.campaigns.length >
                  0 && (
                    <div className="naver-campaign-table-card">
                      <div className="naver-campaign-table-header">
                        <h3>
                          매체별 예산 배분 결과
                        </h3>
                      </div>

                      <div className="naver-campaign-table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>매체</th>
                              <th>현재 예산</th>
                              <th>추천 예산</th>
                              <th>변경률</th>
                              <th>예상 매출</th>
                              <th>예상 ROAS</th>
                              <th>Safety Gate</th>
                              <th>데이터 일수</th>
                            </tr>
                          </thead>

                          <tbody>
                            {optimizationApiResult.campaigns.map(
                              (channel) => (
                                <tr
                                  key={
                                    channel.campaignId
                                  }
                                >
                                  <td>
                                    <strong>
                                      {channel.campaignName ||
                                        channel.campaignId}
                                    </strong>
                                  </td>

                                  <td>
                                    {Number(
                                      channel.currentBudget ||
                                      0
                                    ).toLocaleString(
                                      'ko-KR',
                                      {
                                        maximumFractionDigits: 0,
                                      }
                                    )}
                                    원
                                  </td>

                                  <td>
                                    <strong>
                                      {Number(
                                        channel.recommendedBudget ||
                                        0
                                      ).toLocaleString(
                                        'ko-KR',
                                        {
                                          maximumFractionDigits: 0,
                                        }
                                      )}
                                      원
                                    </strong>
                                  </td>

                                  <td>
                                    {Number(
                                      channel.changePct ||
                                      0
                                    ).toFixed(2)}
                                    %
                                  </td>

                                  <td>
                                    {Number(
                                      channel.expectedRevenue ||
                                      0
                                    ).toLocaleString(
                                      'ko-KR',
                                      {
                                        maximumFractionDigits: 0,
                                      }
                                    )}
                                    원
                                  </td>

                                  <td>
                                    {Number(
                                      channel.expectedRoas ||
                                      0
                                    ).toFixed(1)}
                                    %
                                  </td>

                                  <td>
                                    {channel.safetyAction ||
                                      '-'}
                                  </td>

                                  <td>
                                    {channel.history
                                      ?.observedDays ??
                                      '-'}
                                    일
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
              </div>
            )}


          {optimizationApiResult?.status === 'infeasible' && (
            <div className="optimization-infeasible-panel">
              <strong>
                현재 설정으로는 최적화할 수 없습니다.
              </strong>

              <p>
                {optimizationApiResult
                  .conflictingConstraints
                  ?.includes('target_cpa')
                  ? `설정한 목표 CPA ${targetCpa
                    ? Number(targetCpa).toLocaleString()
                    : ''
                  }원을 만족하면서 현재 예산 및 매체별 예산 제약을 동시에 충족하는 배분이 없습니다.`
                  : optimizationApiResult
                    .conflictingConstraints
                    ?.includes('target_roas')
                    ? `설정한 목표 ROAS를 만족하면서 현재 예산 및 매체별 예산 제약을 동시에 충족하는 배분이 없습니다.`
                    : '현재 입력한 목표와 예산 제약을 동시에 만족하는 최적해가 없습니다.'}
              </p>

              <p>
                {optimizationApiResult
                  .conflictingConstraints
                  ?.includes('target_cpa')
                  ? '목표 CPA를 완화하거나 예산 조정 허용폭을 늘려 다시 시도해 주세요.'
                  : optimizationApiResult
                    .conflictingConstraints
                    ?.includes('target_roas')
                    ? '목표 ROAS를 완화하거나 예산 조정 허용폭을 늘려 다시 시도해 주세요.'
                    : '목표값 또는 예산 제약 조건을 조정한 뒤 다시 실행해 주세요.'}
              </p>
            </div>
          )}

          {gurobiScenarioSummary && (
            <div className="gurobi-scenario-summary">
              <div className="gurobi-summary-card">
                <span>현재 총예산</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.currentBudget
                  ).toLocaleString()}
                  원
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>최적 총예산</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.optimizedBudget
                  ).toLocaleString()}
                  원
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>현재 총매출</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.currentRevenue
                  ).toLocaleString()}
                  원
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>예상 총매출</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.projectedRevenue
                  ).toLocaleString()}
                  원
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>현재 ROAS</span>

                <strong>
                  {gurobiScenarioSummary.currentRoas.toFixed(
                    1
                  )}
                  %
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>예상 ROAS</span>

                <strong>
                  {gurobiScenarioSummary.projectedRoas.toFixed(
                    1
                  )}
                  %
                </strong>
              </div>



              <div className="gurobi-summary-card">
                <span>예상 CPA</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.projectedCpa
                  ).toLocaleString()}
                  원
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>예상 매출 변화</span>

                <strong>
                  {gurobiScenarioSummary.revenueChange > 0
                    ? '+'
                    : ''}

                  {Math.round(
                    gurobiScenarioSummary.revenueChange
                  ).toLocaleString()}
                  원
                </strong>

                <small>
                  {gurobiScenarioSummary.revenueChangeRate !== null
                    ? `${gurobiScenarioSummary.revenueChangeRate > 0
                      ? '+'
                      : ''
                    }${gurobiScenarioSummary.revenueChangeRate.toFixed(
                      1
                    )}%`
                    : '-'}
                </small>
              </div>

              <div className="gurobi-summary-card">
                <span>ROAS 변화</span>

                <strong>
                  {gurobiScenarioSummary.roasChange > 0
                    ? '+'
                    : ''}

                  {gurobiScenarioSummary.roasChange.toFixed(
                    1
                  )}
                  %p
                </strong>
              </div>
            </div>
          )}



          {riskDiagnosticsSummary && (
            <div className="risk-diagnostics-panel">
              <div className="risk-diagnostics-header">
                <div>
                  <h3>
                    리스크 최적화 진단
                  </h3>

                  <p>
                    현재 데이터에서 계산된
                    동적 리스크 허용 범위입니다.
                  </p>
                </div>

                <span className="risk-level-badge">
                  {riskDiagnosticsSummary.riskLevel === 'low'
                    ? '낮음'
                    : riskDiagnosticsSummary.riskLevel === 'high'
                      ? '높음'
                      : '보통'}
                </span>
              </div>

              <div className="risk-diagnostics-grid">
                <div className="risk-diagnostic-card">
                  <span>
                    최소 필요 리스크
                  </span>

                  <strong>
                    {riskDiagnosticsSummary.minimumRiskPercent.toFixed(
                      2
                    )}
                    %
                  </strong>

                  <small>
                    현재 목표 예산을 만족하기 위해
                    최소한 필요한 리스크
                  </small>
                </div>

                <div className="risk-diagnostic-card">
                  <span>
                    선택된 허용 리스크
                  </span>

                  <strong>
                    {riskDiagnosticsSummary.dynamicRiskLimitPercent.toFixed(
                      2
                    )}
                    %
                  </strong>

                  <small>
                    선택한 리스크 수준에 따라
                    자동 계산된 Risk Budget
                  </small>
                </div>

                <div className="risk-diagnostic-card">
                  <span>
                    실제 사용 리스크
                  </span>

                  <strong>
                    {riskDiagnosticsSummary.realizedRiskPercent.toFixed(
                      2
                    )}
                    %
                  </strong>

                  <small>
                    최종 Gurobi 해가 실제로
                    사용한 리스크
                  </small>
                </div>

                <div className="risk-diagnostic-card">
                  <span>
                    최대매출 기준 리스크
                  </span>

                  <strong>
                    {riskDiagnosticsSummary.revenueOptimalRiskPercent.toFixed(
                      2
                    )}
                    %
                  </strong>

                  <small>
                    리스크 제약 없이 최대매출을
                    달성하는 데 필요한 최소 리스크
                  </small>
                </div>
              </div>

              <div className="risk-diagnostics-summary">
                <strong>
                  해석
                </strong>

                <span>
                  {riskDiagnosticsSummary.realizedRiskPercent <
                    riskDiagnosticsSummary.revenueOptimalRiskPercent
                    ? `현재 설정은 최대매출 기준보다 리스크를 낮게 제한하고 있습니다. 더 높은 리스크를 허용하면 추가 매출 여지가 있을 수 있습니다.`
                    : `현재 설정은 최대매출을 달성하는 데 필요한 리스크 수준에 거의 도달했습니다.`}
                </span>
              </div>
            </div>
          )}

          {channelRiskContribution.length > 0 && (
            <div className="channel-risk-panel">
              <div className="channel-risk-header">
                <h3>
                  매체별 리스크 기여도
                </h3>

                <span>
                  현재 예산 대비 변화 기준
                </span>
              </div>

              <div className="channel-risk-table-wrapper">
                <table className="channel-risk-table">
                  <thead>
                    <tr>
                      <th>매체</th>
                      <th>현재 예산</th>
                      <th>최적 예산</th>
                      <th>예산 변화율</th>
                      <th>성과 변동성</th>
                      <th>Risk Weight</th>
                      <th>리스크 기여도</th>
                    </tr>
                  </thead>

                  <tbody>
                    {channelRiskContribution.map(
                      (item) => (
                        <tr key={item.channel}>
                          <td>
                            {item.channel}
                          </td>

                          <td>
                            {Math.round(
                              item.currentBudget
                            ).toLocaleString()}
                            원
                          </td>

                          <td>
                            {Math.round(
                              item.optimizedBudget
                            ).toLocaleString()}
                            원
                          </td>

                          <td>
                            {(
                              item.relativeChange *
                              100
                            ).toFixed(1)}
                            %
                          </td>

                          <td>
                            {(
                              item.volatility *
                              100
                            ).toFixed(2)}
                            %
                          </td>

                          <td>
                            {item.riskWeight.toFixed(
                              3
                            )}
                          </td>

                          <td>
                            {(
                              item.weightedRiskContribution *
                              100
                            ).toFixed(2)}
                            %
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {riskInterpretation && (
            <div className="risk-interpretation-panel">
              <div className="risk-interpretation-header">
                <h3>
                  최적화 결과 해석
                </h3>

                <span>
                  OR 모델 자동 설명
                </span>
              </div>

              <div className="risk-interpretation-content">
                <strong>
                  {riskInterpretation.title}
                </strong>

                <p>
                  {riskInterpretation.summary}
                </p>

                <p>
                  {riskInterpretation.highestRisk}
                </p>

                <p>
                  {riskInterpretation.mostChanged}
                </p>

                <p>
                  {riskInterpretation.stableChannel}
                </p>

                <p>
                  {riskInterpretation.opportunity}
                </p>
              </div>
            </div>
          )}

          {riskRecommendations.length > 0 && (
            <div className="risk-recommendations-panel">
              <div className="risk-recommendations-header">
                <h3>
                  추천 액션
                </h3>

                <span>
                  최적화 결과 기반
                </span>
              </div>

              <div className="risk-recommendations-list">
                {riskRecommendations.map(
                  (recommendation, index) => (
                    <div
                      key={
                        `${recommendation.type}_${index}`
                      }
                      className="risk-recommendation-item"
                    >
                      <div className="risk-recommendation-number">
                        {index + 1}
                      </div>

                      <div>
                        <strong>
                          {recommendation.title}
                        </strong>

                        <p>
                          {recommendation.description}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {optimizationObjective === 'riskAdjustedRevenue' &&
            riskScenarioComparisonRows.length > 0 && (
              <div className="risk-scenario-comparison-panel">
                <div className="risk-scenario-comparison-header">
                  <h3>
                    리스크 시나리오 비교
                  </h3>

                  <span>
                    낮음 · 보통 · 높음
                  </span>
                </div>

                <div className="risk-scenario-comparison-table-wrapper">
                  <table className="risk-scenario-comparison-table">
                    <thead>
                      <tr>
                        <th>항목</th>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <th key={scenario.key}>
                              {scenario.label}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      <tr>
                        <td>
                          실제 리스크
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? `${(
                                  scenario.realizedRisk *
                                  100
                                ).toFixed(2)}%`
                                : scenario.status}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          허용 리스크
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? `${(
                                  scenario.dynamicRiskLimit *
                                  100
                                ).toFixed(2)}%`
                                : '-'}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          예상 매출
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? `${Math.round(
                                  scenario.expectedRevenue
                                ).toLocaleString()}원`
                                : '-'}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          예상 ROAS
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? `${(
                                  scenario.expectedRoas *
                                  100
                                ).toFixed(1)}%`
                                : '-'}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          예상 CPA
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? `${Math.round(
                                  scenario.expectedCpa
                                ).toLocaleString()}원`
                                : '-'}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          매출 점수
                        </td>

                        {riskScenarioScoreRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {(
                                scenario.revenueScore *
                                100
                              ).toFixed(1)}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          ROAS 점수
                        </td>

                        {riskScenarioScoreRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {(
                                scenario.roasScore *
                                100
                              ).toFixed(1)}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          CPA 점수
                        </td>

                        {riskScenarioScoreRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {(
                                scenario.cpaScore *
                                100
                              ).toFixed(1)}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          리스크 점수
                        </td>

                        {riskScenarioScoreRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {(
                                scenario.riskScore *
                                100
                              ).toFixed(1)}
                            </td>
                          )
                        )}
                      </tr>

                      <tr className="recommendation-score-row">
                        <td>
                          <strong>
                            종합 추천 점수
                          </strong>
                        </td>

                        {riskScenarioScoreRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              <strong>
                                {(
                                  scenario.recommendationScore *
                                  100
                                ).toFixed(1)}
                              </strong>
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          매출 목적값
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? Math.round(
                                  scenario.objectiveValue *
                                  optimizationPeriodDays
                                ).toLocaleString() +
                                '원'
                                : '-'}
                            </td>
                          )
                        )}
                      </tr>

                      {channelPerformance.map(
                        (channelItem) => (
                          <tr
                            key={
                              `allocation_${channelItem.channel}`
                            }
                          >
                            <td>
                              {channelItem.channel}
                              {' '}
                              최적 예산
                            </td>

                            {riskScenarioComparisonRows.map(
                              (scenario) => (
                                <td key={scenario.key}>
                                  {scenario.status === 'optimal'
                                    ? Math.round(
                                      scenario.allocations[
                                      channelItem.channel
                                      ] || 0
                                    ).toLocaleString() +
                                    '원'
                                    : '-'}
                                </td>
                              )
                            )}
                          </tr>
                        )
                      )}
                    </tbody>


                  </table>

                  {recommendedRiskScenario && (
                    <div className="recommended-risk-scenario">
                      <div className="recommended-risk-scenario-summary">
                        <strong>
                          추천 시나리오:
                          {' '}
                          {recommendedRiskScenario.label}
                        </strong>

                        <span>
                          예상 매출
                          {' '}
                          {Math.round(
                            recommendedRiskScenario
                              .expectedRevenue
                          ).toLocaleString()}
                          원
                          {' · '}
                          예상 ROAS
                          {' '}
                          {(
                            recommendedRiskScenario
                              .expectedRoas * 100
                          ).toFixed(1)}
                          %
                          {' · '}
                          실제 리스크
                          {' '}
                          {(
                            recommendedRiskScenario
                              .realizedRisk * 100
                          ).toFixed(2)}
                          %
                        </span>
                      </div>

                      {riskScenarioRecommendationExplanation && (
                        <div className="risk-recommendation-explanation">
                          <div className="risk-recommendation-score">
                            종합 추천 점수
                            {' '}
                            <strong>
                              {riskScenarioRecommendationExplanation
                                .score.toFixed(1)}
                            </strong>
                            /100
                          </div>

                          <div className="risk-recommendation-reasons">
                            <strong>
                              추천 근거
                            </strong>

                            <ul>
                              {riskScenarioRecommendationExplanation
                                .reasons.map(
                                  (reason, index) => (
                                    <li
                                      key={
                                        `recommendation_reason_${index}`
                                      }
                                    >
                                      {reason}
                                    </li>
                                  )
                                )}
                            </ul>
                          </div>

                          {riskScenarioRecommendationExplanation
                            .cautions.length > 0 && (
                              <div className="risk-recommendation-cautions">
                                <strong>
                                  고려사항
                                </strong>

                                <ul>
                                  {riskScenarioRecommendationExplanation
                                    .cautions.map(
                                      (caution, index) => (
                                        <li
                                          key={
                                            `recommendation_caution_${index}`
                                          }
                                        >
                                          {caution}
                                        </li>
                                      )
                                    )}
                                </ul>
                              </div>
                            )}

                          <p className="risk-recommendation-conclusion">
                            {riskScenarioRecommendationExplanation
                              .conclusion}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

          {gurobiChannelAllocation.length > 0 && (
            <div className="gurobi-result-section">
              <div className="gurobi-result-header">
                <h3>
                  Gurobi 최적 예산 배분
                </h3>

                <span>
                  선택 기간 기준
                </span>
              </div>

              <div className="channel-performance-table-wrapper">
                <table className="channel-performance-table">
                  <thead>
                    <tr>
                      <th>매체</th>
                      <th>현재 예산</th>
                      <th>최적 예산</th>
                      <th>조정 금액</th>
                      <th>조정률</th>
                      <th>예상 매출</th>
                      <th>예상 ROAS</th>
                      <th>예상 CPA</th>
                      <th>매출 변화</th>
                      <th>ROAS 변화</th>
                      <th>추천</th>
                      <th>최적화 사유</th>
                    </tr>
                  </thead>

                  <tbody>
                    {gurobiPerformanceProjection.map(
                      (item) => {
                        const explanation =
                          optimizationReasonByChannel[
                          item.channel
                          ]

                        const recommendation =
                          explanation?.recommendation ||
                          '유지'

                        const reason =
                          explanation?.reason ||
                          '최적화 결과를 기반으로 예산이 계산되었습니다.'

                        return (
                          <tr key={item.channel}>
                            <td>
                              <strong>
                                {item.channel}
                              </strong>
                            </td>

                            <td>
                              {Math.round(
                                item.currentPeriodBudget
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                item.optimizedPeriodBudget
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              <span
                                className={
                                  item.budgetChange > 0
                                    ? 'budget-change-up'
                                    : item.budgetChange < 0
                                      ? 'budget-change-down'
                                      : 'budget-change-neutral'
                                }
                              >
                                {item.budgetChange > 0
                                  ? '+'
                                  : ''}

                                {Math.round(
                                  item.budgetChange
                                ).toLocaleString()}
                                원
                              </span>
                            </td>

                            <td>
                              {item.budgetChangeRate !== null
                                ? `${item.budgetChangeRate > 0
                                  ? '+'
                                  : ''
                                }${item.budgetChangeRate.toFixed(
                                  1
                                )}%`
                                : '-'}
                            </td>

                            <td>
                              {Math.round(
                                item.projectedPeriodRevenue
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {item.projectedRoas.toFixed(1)}
                              %
                            </td>

                            <td>
                              {item.projectedCpa !== null &&
                                item.projectedCpa !== undefined
                                ? `${Math.round(
                                  item.projectedCpa
                                ).toLocaleString()}원`
                                : '-'}
                            </td>

                            <td>
                              <span
                                className={
                                  item.revenueChange > 0
                                    ? 'budget-change-up'
                                    : item.revenueChange < 0
                                      ? 'budget-change-down'
                                      : 'budget-change-neutral'
                                }
                              >
                                {item.revenueChange > 0
                                  ? '+'
                                  : ''}

                                {Math.round(
                                  item.revenueChange
                                ).toLocaleString()}
                                원

                                {item.revenueChangeRate !== null && (
                                  <>
                                    {' '}
                                    (
                                    {item.revenueChangeRate > 0
                                      ? '+'
                                      : ''}
                                    {item.revenueChangeRate.toFixed(
                                      1
                                    )}
                                    %
                                    )
                                  </>
                                )}
                              </span>
                            </td>

                            <td>
                              <span
                                className={
                                  item.roasChange > 0
                                    ? 'budget-change-up'
                                    : item.roasChange < 0
                                      ? 'budget-change-down'
                                      : 'budget-change-neutral'
                                }
                              >
                                {item.roasChange > 0
                                  ? '+'
                                  : ''}

                                {item.roasChange.toFixed(
                                  1
                                )}
                                %p
                              </span>
                            </td>

                            <td>
                              <span
                                className={
                                  recommendation === '증액'
                                    ? 'diagnosis-good'
                                    : recommendation === '감액'
                                      ? 'diagnosis-warning'
                                      : 'diagnosis-normal'
                                }
                              >
                                {recommendation}
                              </span>
                            </td>

                            <td>
                              <div className="budget-recommendation-reason">
                                {reason}
                              </div>
                            </td>
                          </tr>
                        )
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {
            budgetAllocationSummary.inputBudget > 0 &&
            optimizationFeasibility.isFeasible && (
              <div className="budget-allocation-summary">
                <div>
                  <span>입력 총예산</span>

                  <strong>
                    {Math.round(
                      budgetAllocationSummary.inputBudget
                    ).toLocaleString()}
                    원
                  </strong>
                </div>

                <div>
                  <span>추천 배분 합계</span>

                  <strong>
                    {Math.round(
                      gurobiScenarioSummary?.optimizedBudget || 0
                    ).toLocaleString()}
                    원
                  </strong>
                </div>

                <div className="gurobi-summary-card">
                  <span>미배분 차액</span>

                  <strong>
                    {Math.round(
                      (Number(optimizationBudget) || 0) -
                      (gurobiScenarioSummary?.optimizedBudget || 0)
                    ).toLocaleString()}
                    원
                  </strong>
                </div>
              </div>
            )}


        </section>
      )}

      {activePage === 'scenario' && (
        <section className="scenario-management-section">
          <div className="scenario-management-header">
            <div>
              <h2>
                시나리오 관리
              </h2>

              <p>
                저장한 최적화 결과를 관리하고 비교할 수 있습니다.
              </p>
            </div>

            <span>
              {advertiserOptimizationScenarios.length}개 저장됨
            </span>
          </div>

          {selectedScenarios.length === 2 && (
            <div className="scenario-comparison-panel">
              <div className="scenario-comparison-header">
                <div>
                  <h3>
                    시나리오 비교
                  </h3>

                  <p>
                    선택한 두 최적화 결과의 핵심 지표를 비교합니다.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedScenarioIds([])
                  }
                >
                  비교 선택 해제
                </button>
              </div>

              <div className="scenario-comparison-table-wrapper">
                <table className="scenario-comparison-table">
                  <thead>
                    <tr>
                      <th>항목</th>

                      {selectedScenarios.map(
                        (scenario) => (
                          <th key={scenario.id}>
                            {scenario.name ||
                              getOptimizationObjectiveLabel(
                                scenario.objective
                              )}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>최적화 목표</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {getOptimizationObjectiveLabel(
                              scenario.objective
                            )}
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>총예산</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {Math.round(
                              scenario.totalBudget
                            ).toLocaleString()}
                            원
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>예상 매출</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {Math.round(
                              scenario.summary
                                .projectedRevenue
                            ).toLocaleString()}
                            원
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>예상 ROAS</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {scenario.summary
                              .projectedRoas
                              .toFixed(1)}
                            %
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>예상 CPA</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {scenario.summary
                              .projectedCpa !== null &&
                              scenario.summary
                                .projectedCpa !== undefined
                              ? `${Math.round(
                                scenario.summary
                                  .projectedCpa
                              ).toLocaleString()}원`
                              : '-'}
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>예산 조정 허용폭</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            ±
                            {scenario.budgetChangeLimit}
                            %
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>리스크 수준</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {scenario.riskLevel === 'low'
                              ? '낮음'
                              : scenario.riskLevel === 'high'
                                ? '높음'
                                : scenario.riskLevel === 'medium'
                                  ? '보통'
                                  : '-'}
                          </td>
                        )
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="scenario-allocation-comparison">
                <h4>
                  매체별 최적 예산 비교
                </h4>

                <table className="scenario-comparison-table">
                  <thead>
                    <tr>
                      <th>매체</th>

                      {selectedScenarios.map(
                        (scenario) => (
                          <th key={scenario.id}>
                            {scenario.name ||
                              getOptimizationObjectiveLabel(
                                scenario.objective
                              )}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {[
                      ...new Set(
                        selectedScenarios.flatMap(
                          (scenario) =>
                            scenario.allocations.map(
                              (item) => item.channel
                            )
                        )
                      ),
                    ].map((channel) => (
                      <tr key={channel}>
                        <td>
                          {channel}
                        </td>

                        {selectedScenarios.map(
                          (scenario) => {
                            const allocation =
                              scenario.allocations.find(
                                (item) =>
                                  item.channel === channel
                              )

                            return (
                              <td key={scenario.id}>
                                {allocation
                                  ? `${Math.round(
                                    allocation.optimizedBudget
                                  ).toLocaleString()}원`
                                  : '-'}
                              </td>
                            )
                          }
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {scenarioComparisonInsight && (
                <div className="scenario-comparison-insight">
                  <h4>
                    비교 해석
                  </h4>

                  <p>
                    {scenarioComparisonInsight.summary}
                  </p>

                  <div className="scenario-difference-grid">
                    <div>
                      <span>예상 매출 차이</span>

                      <strong>
                        {scenarioComparisonInsight
                          .revenueDifference > 0
                          ? '+'
                          : ''}
                        {Math.round(
                          scenarioComparisonInsight
                            .revenueDifference
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>

                    <div>
                      <span>ROAS 차이</span>

                      <strong>
                        {scenarioComparisonInsight
                          .roasDifference > 0
                          ? '+'
                          : ''}
                        {scenarioComparisonInsight
                          .roasDifference
                          .toFixed(1)}
                        %p
                      </strong>
                    </div>

                    <div>
                      <span>CPA 차이</span>

                      <strong>
                        {scenarioComparisonInsight
                          .cpaDifference !== null
                          ? `${scenarioComparisonInsight
                            .cpaDifference > 0
                            ? '+'
                            : ''
                          }${Math.round(
                            scenarioComparisonInsight
                              .cpaDifference
                          ).toLocaleString()}원`
                          : '-'}
                      </strong>
                    </div>
                  </div>

                  <div className="scenario-allocation-differences">
                    <h4>
                      매체별 예산 차이
                    </h4>

                    {scenarioComparisonInsight
                      .allocationDifferences
                      .map((item) => (
                        <div
                          key={item.channel}
                          className="scenario-allocation-difference-row"
                        >
                          <span>
                            {item.channel}
                          </span>

                          <strong>
                            {Math.round(item.difference) > 0
                              ? '+'
                              : ''}
                            {Math.abs(
                              Math.round(item.difference)
                            ) === 0
                              ? '0'
                              : Math.round(
                                item.difference
                              ).toLocaleString()}
                            원
                          </strong>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {advertiserOptimizationScenarios.length === 0 ? (
            <div className="scenario-empty-state">
              <strong>
                저장된 시나리오가 없습니다.
              </strong>

              <p>
                예산 최적화에서 최적화 결과를 저장하면
                이곳에서 확인할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="saved-scenarios-list">
              {advertiserOptimizationScenarios.map(
                (scenario) => {
                  const activeProposal =
                    clientProposals.find(
                      (proposal) =>
                        proposal.scenarioId === scenario.id &&
                        proposal.status !== 'cancelled'
                    )

                  const cancelledProposal =
                    clientProposals.find(
                      (proposal) =>
                        proposal.scenarioId === scenario.id &&
                        proposal.status === 'cancelled'
                    )

                  return (
                    <div
                      key={scenario.id}
                      className="saved-scenario-card"
                    >
                      <div className="saved-scenario-main">
                        <div>
                          {editingScenarioId === scenario.id ? (
                            <div className="scenario-name-edit">
                              <input
                                type="text"
                                value={editingScenarioName}
                                onChange={(event) =>
                                  setEditingScenarioName(
                                    event.target.value
                                  )
                                }
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  saveEditedScenarioName(
                                    scenario.id
                                  )
                                }
                              >
                                저장
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingScenarioId(null)
                                  setEditingScenarioName('')
                                }}
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <div className="scenario-name-display">
                              <strong>
                                {scenario.name ||
                                  getOptimizationObjectiveLabel(
                                    scenario.objective
                                  )}
                              </strong>

                              <button
                                type="button"
                                onClick={() =>
                                  startEditingScenarioName(
                                    scenario
                                  )
                                }
                              >
                                이름 수정
                              </button>
                            </div>
                          )}

                          <span className="saved-scenario-objective">
                            {getOptimizationObjectiveLabel(
                              scenario.objective
                            )}
                          </span>

                          <span>
                            {new Date(
                              scenario.createdAt
                            ).toLocaleString()}
                          </span>
                        </div>

                        <div className="saved-scenario-actions">
                          <label className="scenario-compare-selector">
                            <input
                              type="checkbox"
                              checked={
                                selectedScenarioIds.includes(
                                  scenario.id
                                )
                              }
                              disabled={
                                !selectedScenarioIds.includes(
                                  scenario.id
                                ) &&
                                selectedScenarioIds.length >= 2
                              }
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setSelectedScenarioIds(
                                    (previous) => [
                                      ...previous,
                                      scenario.id,
                                    ]
                                  )
                                } else {
                                  setSelectedScenarioIds(
                                    (previous) =>
                                      previous.filter(
                                        (id) =>
                                          id !== scenario.id
                                      )
                                  )
                                }
                              }}
                            />

                            <span>비교 선택</span>
                          </label>

                          <select
                            value={
                              scenario.status || 'draft'
                            }
                            onChange={(event) =>
                              updateScenarioStatus(
                                scenario.id,
                                event.target.value
                              )
                            }
                          >
                            <option value="draft">
                              초안
                            </option>

                            <option value="recommended">
                              추천
                            </option>

                            <option value="confirmed">
                              확정
                            </option>
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              selectFinalScenario(
                                scenario.id
                              )
                            }
                          >
                            {scenario.isFinal
                              ? '최종 선택 해제'
                              : '최종 시나리오로 선택'}
                          </button>


                          {scenario.isFinal && (
                            <>
                              {!activeProposal && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const isReproposal =
                                      Boolean(cancelledProposal)

                                    const confirmed =
                                      window.confirm(
                                        isReproposal
                                          ? `"${scenario.name || getOptimizationObjectiveLabel(
                                            scenario.objective
                                          )}" 시나리오를 다시 광고주에게 제안하시겠습니까?`
                                          : `"${scenario.name || getOptimizationObjectiveLabel(
                                            scenario.objective
                                          )}" 시나리오를 광고주 제안으로 생성하시겠습니까?\n\n생성 후 광고주 소통 페이지에서 제안 상태와 후속 업무를 관리할 수 있습니다.`
                                      )

                                    if (!confirmed) {
                                      return
                                    }

                                    createClientProposal(
                                      scenario
                                    )
                                  }}
                                >
                                  {cancelledProposal
                                    ? '재제안'
                                    : '광고주 제안 만들기'}
                                </button>
                              )}

                              {activeProposal && (
                                <>
                                  <button
                                    type="button"
                                    disabled
                                  >
                                    광고주 제안 생성됨
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const confirmed =
                                        window.confirm(
                                          `"${scenario.name || getOptimizationObjectiveLabel(
                                            scenario.objective
                                          )}" 광고주 제안을 취소하시겠습니까?`
                                        )

                                      if (!confirmed) {
                                        return
                                      }

                                      cancelClientProposal(
                                        activeProposal.id
                                      )
                                    }}
                                  >
                                    제안 취소
                                  </button>
                                </>
                              )}
                            </>
                          )}





                          <button
                            type="button"
                            className="saved-scenario-delete-button"
                            onClick={() =>
                              deleteSavedOptimizationScenario(
                                scenario.id
                              )
                            }
                          >
                            삭제
                          </button>
                        </div>
                      </div>

                      <div className="saved-scenario-metrics">
                        <div>
                          <span>
                            총예산
                          </span>

                          <strong>
                            {Math.round(
                              scenario.totalBudget
                            ).toLocaleString()}
                            원
                          </strong>
                        </div>

                        <div>
                          <span>
                            예상 매출
                          </span>

                          <strong>
                            {Math.round(
                              scenario.summary
                                .projectedRevenue
                            ).toLocaleString()}
                            원
                          </strong>
                        </div>

                        <div>
                          <span>
                            예상 ROAS
                          </span>

                          <strong>
                            {scenario.summary
                              .projectedRoas
                              .toFixed(1)}
                            %
                          </strong>
                        </div>

                        <div>
                          <span>
                            예상 CPA
                          </span>

                          <strong>
                            {scenario.summary
                              .projectedCpa !== null &&
                              scenario.summary
                                .projectedCpa !== undefined
                              ? `${Math.round(
                                scenario.summary
                                  .projectedCpa
                              ).toLocaleString()}원`
                              : '-'}
                          </strong>
                        </div>
                      </div>

                      <div className="scenario-note-section">
                        <label>
                          메모
                        </label>

                        <textarea
                          rows="2"
                          placeholder="이 시나리오의 목적이나 참고사항을 입력하세요."
                          value={
                            scenarioNotes[
                            scenario.id
                            ] || ''
                          }
                          onChange={(event) =>
                            setScenarioNotes(
                              (previous) => ({
                                ...previous,

                                [scenario.id]:
                                  event.target.value,
                              })
                            )
                          }
                        />
                      </div>
                    </div>
                  )
                }
              )}
            </div>
          )}
        </section>
      )}

      {activePage === 'client' && (
        <section className="client-communication-section">
          <div className="client-communication-header">
            <div>
              <h2>
                광고주 소통
              </h2>

              <p>
                최종 최적화안을 광고주에게 제안하고
                검토 진행 상황을 관리합니다.
              </p>
            </div>

            <span>
              {clientProposals.length}개 제안
            </span>
          </div>

          {clientProposals.length === 0 ? (
            <div className="client-proposal-empty">
              <strong>
                아직 생성된 광고주 제안이 없습니다.
              </strong>

              <p>
                시나리오 관리에서 최종 시나리오를
                선택한 후 광고주 제안을 만들어주세요.
              </p>
            </div>
          ) : (
            <div className="client-proposal-list">
              {clientProposals
                .filter(
                  (proposal) =>
                    proposal.status !== 'cancelled'
                )
                .map(
                  (proposal) => (
                    <div
                      key={proposal.id}
                      className="client-proposal-card"
                    >
                      <div className="client-proposal-card-header">
                        <div>
                          <strong>
                            {proposal.scenarioName ||
                              '최적화 제안'}
                          </strong>

                          <span>
                            {new Date(
                              proposal.createdAt
                            ).toLocaleString()}
                          </span>
                        </div>

                        <span className="client-proposal-status">
                          {getClientProposalStatusLabel(
                            proposal.status
                          )}
                        </span>

                        <div className="client-proposal-workflow">
                          <label>
                            진행 상태
                          </label>

                          <select
                            value={proposal.status}
                            onChange={(event) =>
                              updateClientProposalStatus(
                                proposal.id,
                                event.target.value
                              )
                            }
                          >
                            {getAllowedClientProposalStatuses(
                              proposal.status
                            ).map((status) => (
                              <option
                                key={status}
                                value={status}
                              >
                                {getClientProposalStatusLabel(
                                  status
                                )}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="client-proposal-timeline">
                          {[
                            ['preparing', '제안 준비'],
                            ['sent', '제안 완료'],
                            ['reviewing', '검토 중'],
                            ['revision_requested', '수정 요청'],
                            ['approved', '승인'],
                            ['review_completed', '검토 완료'],
                          ].map(([status, label]) => (
                            <div
                              key={status}
                              className={
                                proposal.status === status
                                  ? 'client-timeline-step active'
                                  : 'client-timeline-step'
                              }
                            >
                              <span />
                              <strong>
                                {label}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="client-proposal-metrics">
                        <div>
                          <span>
                            총예산
                          </span>

                          <strong>
                            {Math.round(
                              proposal.totalBudget
                            ).toLocaleString()}
                            원
                          </strong>
                        </div>

                        <div>
                          <span>
                            예상 매출
                          </span>

                          <strong>
                            {Math.round(
                              proposal.summary
                                .projectedRevenue
                            ).toLocaleString()}
                            원
                          </strong>
                        </div>

                        <div>
                          <span>
                            예상 ROAS
                          </span>

                          <strong>
                            {proposal.summary
                              .projectedRoas
                              .toFixed(1)}
                            %
                          </strong>
                        </div>

                        <div>
                          <span>
                            예상 CPA
                          </span>

                          <strong>
                            {proposal.summary
                              .projectedCpa !== null &&
                              proposal.summary
                                .projectedCpa !== undefined
                              ? `${Math.round(
                                proposal.summary
                                  .projectedCpa
                              ).toLocaleString()}원`
                              : '-'}
                          </strong>
                        </div>
                      </div>

                      <div className="client-proposal-task">
                        <div>
                          <label>
                            담당자
                          </label>

                          <input
                            type="text"
                            value={
                              proposal.assignee || ''
                            }
                            placeholder="담당자 이름"
                            onChange={(event) =>
                              updateClientProposalTaskLocal(
                                proposal.id,
                                'assignee',
                                event.target.value
                              )
                            }
                            onBlur={(event) => {
                              saveClientProposalToServer(
                                proposal.id,
                                {
                                  assignee:
                                    event.target.value,

                                  updatedAt:
                                    new Date().toISOString(),
                                }
                              )
                            }}
                          />
                        </div>

                        <div>
                          <label>
                            마감일
                          </label>

                          <input
                            type="date"
                            value={
                              proposal.dueDate || ''
                            }
                            onChange={(event) => {
                              const value =
                                event.target.value

                              const updatedProposal = {
                                ...proposal,

                                dueDate:
                                  value,

                                updatedAt:
                                  new Date().toISOString(),
                              }

                              setClientProposals(
                                (previous) =>
                                  previous.map(
                                    (item) =>
                                      item.id === proposal.id
                                        ? updatedProposal
                                        : item
                                  )
                              )

                              saveClientProposalToServer(
                                proposal.id,
                                {
                                  dueDate:
                                    value,

                                  updatedAt:
                                    updatedProposal.updatedAt,
                                }
                              )
                            }}
                          />
                        </div>

                        <div>
                          <label>
                            업무 상태
                          </label>

                          <select
                            value={
                              proposal.taskStatus || 'waiting'
                            }
                            onChange={(event) => {
                              const updatedProposal = {
                                ...proposal,

                                taskStatus:
                                  event.target.value,

                                updatedAt:
                                  new Date().toISOString(),
                              }

                              setClientProposals(
                                (previous) =>
                                  previous.map(
                                    (item) =>
                                      item.id === proposal.id
                                        ? updatedProposal
                                        : item
                                  )
                              )

                              saveClientProposalToServer(
                                proposal.id,
                                {
                                  taskStatus:
                                    value,

                                  updatedAt:
                                    updatedProposal.updatedAt,
                                }
                              )
                            }}
                          >
                            <option value="waiting">
                              대기
                            </option>

                            <option value="in_progress">
                              진행 중
                            </option>

                            <option value="reviewing">
                              내부 검토 중
                            </option>

                            <option value="done">
                              완료
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="client-proposal-feedback">
                        <div>
                          <label>
                            광고주 코멘트
                          </label>

                          <textarea
                            rows="3"
                            value={
                              proposal.clientComment || ''
                            }
                            placeholder="광고주 문의, 의견, 피드백을 입력하세요."
                            onChange={(event) =>
                              setClientProposals(
                                (previous) =>
                                  previous.map(
                                    (item) =>
                                      item.id === proposal.id
                                        ? {
                                          ...item,
                                          clientComment:
                                            event.target.value,
                                          updatedAt:
                                            new Date().toISOString(),
                                        }
                                        : item
                                  )
                              )
                            }
                            onBlur={(event) => {
                              saveClientProposalToServer(
                                proposal.id,
                                {
                                  clientComment:
                                    event.target.value,

                                  updatedAt:
                                    new Date().toISOString(),
                                }
                              )
                            }}
                          />
                        </div>

                        <div>
                          <label>
                            내부 메모
                          </label>

                          <textarea
                            rows="3"
                            value={
                              proposal.internalNote || ''
                            }
                            placeholder="담당자 확인사항이나 후속 업무를 기록하세요."
                            onChange={(event) =>
                              setClientProposals(
                                (previous) =>
                                  previous.map(
                                    (item) =>
                                      item.id === proposal.id
                                        ? {
                                          ...item,
                                          internalNote:
                                            event.target.value,
                                          updatedAt:
                                            new Date().toISOString(),
                                        }
                                        : item
                                  )
                              )
                            }
                            onBlur={(event) => {
                              const updatedProposal = {
                                ...proposal,

                                internalNote:
                                  event.target.value,

                                updatedAt:
                                  new Date().toISOString(),
                              }

                              saveClientProposalToServer(
                                proposal.id,
                                {
                                  internalNote:
                                    event.target.value,

                                  updatedAt:
                                    new Date().toISOString(),
                                }
                              )
                            }}

                          />

                        </div>
                      </div>
                      {proposal.status ===
                        'revision_requested' && (
                          <div className="client-revision-reason">
                            <label>
                              수정 요청 사유
                            </label>

                            <textarea
                              rows="2"
                              value={
                                proposal.revisionReason || ''
                              }
                              placeholder="광고주가 요청한 수정 내용을 입력하세요."
                              onChange={(event) =>
                                setClientProposals(
                                  (previous) =>
                                    previous.map(
                                      (item) =>
                                        item.id === proposal.id
                                          ? {
                                            ...item,
                                            revisionReason:
                                              event.target.value,
                                            updatedAt:
                                              new Date().toISOString(),
                                          }
                                          : item
                                    )
                                )
                              }
                              onBlur={(event) => {
                                const updatedProposal = {
                                  ...proposal,

                                  revisionReason:
                                    event.target.value,

                                  updatedAt:
                                    new Date().toISOString(),
                                }

                                saveClientProposalToServer(
                                  proposal.id,
                                  {
                                    revisionReason:
                                      event.target.value,

                                    updatedAt:
                                      new Date().toISOString(),
                                  }
                                )
                              }}
                            />
                          </div>
                        )}

                      {Array.isArray(proposal.history) &&
                        proposal.history.length > 0 && (
                          <div className="client-proposal-history">
                            <h4>
                              상태 변경 이력
                            </h4>

                            {proposal.history.map(
                              (historyItem, index) => (
                                <div
                                  key={
                                    `${historyItem.createdAt}_${index}`
                                  }
                                  className="client-history-row"
                                >
                                  <span>
                                    {getClientProposalStatusLabel(
                                      historyItem.status
                                    )}
                                  </span>

                                  <span>
                                    {new Date(
                                      historyItem.createdAt
                                    ).toLocaleString()}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}


                    </div>
                  )
                )}
            </div>
          )}
        </section>
      )}

      {activePage === 'tasks' && (
        <section className="task-management-section">
          <div className="task-management-header">
            <div>
              <h2>
                업무 관리
              </h2>

              <p>
                광고주 제안과 후속 업무의 담당자,
                마감일, 진행 상태를 관리합니다.
              </p>
            </div>

            <div className="task-management-header-actions">
              <button
                type="button"
                className="task-trash-button"
                onClick={() =>
                  setTaskTrashOpen(true)
                }
              >
                휴지통
                {trashedClientTasks.length > 0 && (
                  <span className="task-trash-count">
                    {trashedClientTasks.length}
                  </span>
                )}
              </button>

              <span className="task-count-badge">
                {activeClientTaskCount}개 업무
              </span>
            </div>
          </div>

          <div className="task-dashboard-summary">
            <div>
              <span>대기</span>
              <strong>
                {taskDashboardSummary.waiting}
              </strong>
            </div>

            <div>
              <span>진행 중</span>
              <strong>
                {taskDashboardSummary.inProgress}
              </strong>
            </div>

            <div>
              <span>내부 검토 중</span>
              <strong>
                {taskDashboardSummary.reviewing}
              </strong>
            </div>

            <div>
              <span>완료</span>
              <strong>
                {taskDashboardSummary.done}
              </strong>
            </div>

            <div>
              <span>지연</span>
              <strong>
                {taskDashboardSummary.overdue}
              </strong>
            </div>
          </div>

          <div className="task-management-filters">
            <div>
              <label>
                업무 상태
              </label>

              <select
                value={taskStatusFilter}
                onChange={(event) =>
                  setTaskStatusFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  전체
                </option>

                <option value="waiting">
                  대기
                </option>

                <option value="in_progress">
                  진행 중
                </option>

                <option value="reviewing">
                  내부 검토 중
                </option>

                <option value="done">
                  완료
                </option>
              </select>
            </div>

            <div>
              <label>
                담당자
              </label>

              <select
                value={taskAssigneeFilter}
                onChange={(event) =>
                  setTaskAssigneeFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  전체
                </option>

                {taskAssignees.map(
                  (assignee) => (
                    <option
                      key={assignee}
                      value={assignee}
                    >
                      {assignee}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label>
                정렬
              </label>

              <select
                value={taskSortOption}
                onChange={(event) =>
                  setTaskSortOption(
                    event.target.value
                  )
                }
              >
                <option value="priority">
                  긴급 우선
                </option>

                <option value="dueDate">
                  마감 임박 우선
                </option>

                <option value="updatedAt">
                  최근 수정 우선
                </option>
              </select>
            </div>
          </div>

          {clientProposals.length === 0 ? (
            <div className="task-empty-state">
              <strong>
                등록된 업무가 없습니다.
              </strong>

              <p>
                광고주 제안을 생성하면
                후속 업무가 이곳에 표시됩니다.
              </p>
            </div>
          ) : (
            <div className="task-management-table-wrapper">
              <table className="task-management-table">
                <thead>
                  <tr>
                    <th>시나리오</th>
                    <th>광고주 상태</th>
                    <th>우선순위</th>
                    <th>담당자</th>
                    <th>마감일</th>
                    <th>업무 상태</th>
                    <th>주의</th>
                    <th>다음 조치</th>
                    <th>관리</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredClientTasks.map(
                    (proposal) => {
                      const today =
                        new Date()

                      today.setHours(
                        0,
                        0,
                        0,
                        0
                      )

                      const dueDate =
                        proposal.dueDate
                          ? new Date(
                            `${proposal.dueDate}T00:00:00`
                          )
                          : null

                      const differenceInDays =
                        dueDate
                          ? Math.ceil(
                            (
                              dueDate.getTime() -
                              today.getTime()
                            ) /
                            (
                              1000 *
                              60 *
                              60 *
                              24
                            )
                          )
                          : null

                      const isOverdue =
                        differenceInDays !== null &&
                        differenceInDays < 0 &&
                        proposal.taskStatus !== 'done'

                      const isDueSoon =
                        differenceInDays !== null &&
                        differenceInDays >= 0 &&
                        differenceInDays <= 3 &&
                        proposal.taskStatus !== 'done'

                      return (
                        <tr key={proposal.id}>
                          <td>
                            <strong>
                              {proposal.scenarioName ||
                                '최적화 제안'}
                            </strong>
                          </td>

                          <td>
                            {getClientProposalStatusLabel(
                              proposal.status
                            )}
                          </td>

                          <td>
                            <select
                              value={
                                proposal.priority || 'normal'
                              }
                              onChange={(event) => {
                                const updatedProposal = {
                                  ...proposal,

                                  priority:
                                    event.target.value,

                                  updatedAt:
                                    new Date().toISOString(),
                                }

                                setClientProposals(
                                  (previous) =>
                                    previous.map(
                                      (item) =>
                                        item.id === proposal.id
                                          ? updatedProposal
                                          : item
                                    )
                                )

                                saveClientProposalToServer(
                                  proposal.id,
                                  {
                                    priority:
                                      event.target.value,

                                    updatedAt:
                                      updatedProposal.updatedAt,
                                  }
                                )
                              }}
                            >
                              <option value="low">
                                낮음
                              </option>

                              <option value="normal">
                                보통
                              </option>

                              <option value="high">
                                높음
                              </option>

                              <option value="urgent">
                                긴급
                              </option>
                            </select>
                          </td>

                          <td>
                            <input
                              type="text"
                              value={
                                proposal.assignee || ''
                              }
                              placeholder="담당자"
                              onChange={(event) =>
                                updateClientProposalTaskLocal(
                                  proposal.id,
                                  'assignee',
                                  event.target.value
                                )
                              }
                              onBlur={(event) => {
                                saveClientProposalToServer(
                                  proposal.id,
                                  {
                                    assignee:
                                      event.target.value,

                                    updatedAt:
                                      new Date().toISOString(),
                                  }
                                )
                              }}
                            />
                          </td>

                          <td>
                            <div className="task-due-date-cell">
                              <input
                                type="date"
                                value={
                                  proposal.dueDate || ''
                                }
                                onChange={(event) => {
                                  const value =
                                    event.target.value

                                  const updatedProposal = {
                                    ...proposal,
                                    dueDate:
                                      value,
                                    updatedAt:
                                      new Date().toISOString(),
                                  }

                                  setClientProposals(
                                    (previous) =>
                                      previous.map(
                                        (item) =>
                                          item.id === proposal.id
                                            ? updatedProposal
                                            : item
                                      )
                                  )

                                  saveClientProposalToServer(
                                    proposal.id,
                                    {
                                      dueDate:
                                        value,

                                      updatedAt:
                                        updatedProposal.updatedAt,
                                    }
                                  )
                                }}
                              />

                              {isOverdue && (
                                <strong className="task-overdue">
                                  지연
                                </strong>
                              )}

                              {!isOverdue &&
                                isDueSoon && (
                                  <strong className="task-due-soon">
                                    마감 임박
                                  </strong>
                                )}
                            </div>
                          </td>

                          <td>
                            <select
                              value={
                                proposal.taskStatus || 'waiting'
                              }
                              onChange={(event) => {
                                const value =
                                  event.target.value

                                const updatedProposal = {
                                  ...proposal,
                                  taskStatus:
                                    value,
                                  updatedAt:
                                    new Date().toISOString(),
                                }

                                setClientProposals(
                                  (previous) =>
                                    previous.map(
                                      (item) =>
                                        item.id === proposal.id
                                          ? updatedProposal
                                          : item
                                    )
                                )

                                saveClientProposalToServer(
                                  proposal.id,
                                  {
                                    taskStatus:
                                      event.target.value,

                                    updatedAt:
                                      updatedProposal.updatedAt,
                                  }
                                )
                              }}
                            >
                              <option value="waiting">
                                대기
                              </option>

                              <option value="in_progress">
                                진행 중
                              </option>

                              <option value="reviewing">
                                내부 검토 중
                              </option>

                              <option value="done">
                                완료
                              </option>
                            </select>
                          </td>

                          <td>
                            {(() => {
                              const attention =
                                getClientProposalAttention(
                                  proposal
                                )

                              return attention
                                ? attention.label
                                : '-'
                            })()}
                          </td>

                          <td>
                            <span className="task-next-action">
                              {getRecommendedNextAction(
                                proposal
                              )}
                            </span>
                          </td>

                          <td>
                            <div className="task-row-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedTaskProposalId(
                                    proposal.id
                                  )
                                }
                              >
                                상세 보기
                              </button>

                              {proposal.taskStatus === 'done' && (
                                <button
                                  type="button"
                                  className="task-delete-button"
                                  onClick={() =>
                                    moveClientTaskToTrash(
                                      proposal.id
                                    )
                                  }
                                >
                                  삭제
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    }
                  )}
                </tbody>

              </table>
            </div>
          )}

          {selectedTaskProposal && (
            <div className="task-detail-panel">
              <div className="task-detail-header">
                <div>
                  <h3>
                    {selectedTaskProposal.scenarioName ||
                      '최적화 제안'}
                  </h3>

                  <span>
                    {getClientProposalStatusLabel(
                      selectedTaskProposal.status
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedTaskProposalId(
                      null
                    )
                  }
                >
                  닫기
                </button>
              </div>

              <div className="task-detail-metrics">
                <div>
                  <span>총예산</span>
                  <strong>
                    {Math.round(
                      selectedTaskProposal.totalBudget
                    ).toLocaleString()}
                    원
                  </strong>
                </div>

                <div>
                  <span>예상 매출</span>
                  <strong>
                    {Math.round(
                      selectedTaskProposal.summary
                        .projectedRevenue
                    ).toLocaleString()}
                    원
                  </strong>
                </div>

                <div>
                  <span>예상 ROAS</span>
                  <strong>
                    {selectedTaskProposal.summary
                      .projectedRoas
                      .toFixed(1)}
                    %
                  </strong>
                </div>

                <div>
                  <span>예상 CPA</span>
                  <strong>
                    {selectedTaskProposal.summary
                      .projectedCpa !== null &&
                      selectedTaskProposal.summary
                        .projectedCpa !== undefined
                      ? `${Math.round(
                        selectedTaskProposal.summary
                          .projectedCpa
                      ).toLocaleString()}원`
                      : '-'}
                  </strong>
                </div>
              </div>

              <div className="task-detail-grid">
                <div>
                  <span>담당자</span>
                  <strong>
                    {selectedTaskProposal.assignee || '-'}
                  </strong>
                </div>

                <div>
                  <span>마감일</span>
                  <strong>
                    {selectedTaskProposal.dueDate || '-'}
                  </strong>
                </div>

                <div>
                  <span>업무 상태</span>
                  <strong>
                    {selectedTaskProposal.taskStatus ===
                      'in_progress'
                      ? '진행 중'
                      : selectedTaskProposal.taskStatus ===
                        'reviewing'
                        ? '내부 검토 중'
                        : selectedTaskProposal.taskStatus ===
                          'done'
                          ? '완료'
                          : '대기'}
                  </strong>
                </div>

                <div>
                  <span>우선순위</span>
                  <strong>
                    {selectedTaskProposal.priority ===
                      'urgent'
                      ? '긴급'
                      : selectedTaskProposal.priority ===
                        'high'
                        ? '높음'
                        : selectedTaskProposal.priority ===
                          'low'
                          ? '낮음'
                          : '보통'}
                  </strong>
                </div>
              </div>

              <div className="task-detail-text">
                <div>
                  <h4>광고주 코멘트</h4>
                  <p>
                    {selectedTaskProposal.clientComment ||
                      '등록된 광고주 코멘트가 없습니다.'}
                  </p>
                </div>

                <div>
                  <h4>내부 메모</h4>
                  <p>
                    {selectedTaskProposal.internalNote ||
                      '등록된 내부 메모가 없습니다.'}
                  </p>
                </div>

                {selectedTaskProposal.revisionReason && (
                  <div className="task-detail-revision-reason">
                    <h4>수정 요청 사유</h4>
                    <p>
                      {selectedTaskProposal.revisionReason}
                    </p>
                  </div>
                )}

                {selectedTaskProposal.previousRevision && (
                  <div className="revision-change-summary">
                    <div className="revision-change-header">
                      <div>
                        <h4>수정 전 · 후 비교</h4>
                        <p>
                          수정 요청 반영에 따른 예산 및 예상 성과 변화입니다.
                        </p>
                      </div>
                    </div>

                    <div className="revision-summary-grid">
                      <div className="revision-summary-item">
                        <span>총예산</span>

                        <div className="revision-summary-values">
                          <span>
                            {Math.round(
                              Number(
                                selectedTaskProposal
                                  .previousRevision
                                  .totalBudget
                              ) || 0
                            ).toLocaleString()}
                            원
                          </span>

                          <span>→</span>

                          <strong>
                            {Math.round(
                              Number(
                                selectedTaskProposal.totalBudget
                              ) || 0
                            ).toLocaleString()}
                            원
                          </strong>
                        </div>
                      </div>

                      <div className="revision-summary-item">
                        <span>예상 매출</span>

                        <div className="revision-summary-values">
                          <span>
                            {Math.round(
                              Number(
                                selectedTaskProposal
                                  .previousRevision
                                  .summary
                                  ?.projectedRevenue
                              ) || 0
                            ).toLocaleString()}
                            원
                          </span>

                          <span>→</span>

                          <strong>
                            {Math.round(
                              Number(
                                selectedTaskProposal
                                  .summary
                                  ?.projectedRevenue
                              ) || 0
                            ).toLocaleString()}
                            원
                          </strong>
                        </div>
                      </div>

                      <div className="revision-summary-item">
                        <span>예상 ROAS</span>

                        <div className="revision-summary-values">
                          <span>
                            {Number(
                              selectedTaskProposal
                                .previousRevision
                                .summary
                                ?.projectedRoas || 0
                            ).toFixed(1)}
                            %
                          </span>

                          <span>→</span>

                          <strong>
                            {Number(
                              selectedTaskProposal
                                .summary
                                ?.projectedRoas || 0
                            ).toFixed(1)}
                            %
                          </strong>
                        </div>
                      </div>

                      <div className="revision-summary-item">
                        <span>예상 CPA</span>

                        <div className="revision-summary-values">
                          <span>
                            {selectedTaskProposal
                              .previousRevision
                              .summary
                              ?.projectedCpa != null
                              ? `${Math.round(
                                selectedTaskProposal
                                  .previousRevision
                                  .summary
                                  .projectedCpa
                              ).toLocaleString()}원`
                              : '-'}
                          </span>

                          <span>→</span>

                          <strong>
                            {selectedTaskProposal
                              .summary
                              ?.projectedCpa != null
                              ? `${Math.round(
                                selectedTaskProposal
                                  .summary
                                  .projectedCpa
                              ).toLocaleString()}원`
                              : '-'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="revision-budget-comparison">
                      <h4>매체별 예산 변경</h4>

                      <div className="revision-budget-table">
                        <div className="revision-budget-table-header">
                          <span>매체</span>
                          <span>수정 전</span>
                          <span></span>
                          <span>수정 후</span>
                          <span>증감</span>
                        </div>

                        {(selectedTaskProposal.allocations || []).map(
                          (allocation) => {
                            const previousAllocation =
                              (
                                selectedTaskProposal
                                  .previousRevision
                                  .allocations || []
                              ).find(
                                (item) =>
                                  item.channel === allocation.channel
                              )

                            const previousBudget =
                              Number(
                                previousAllocation?.optimizedBudget
                              ) || 0

                            const currentBudget =
                              Number(
                                allocation.optimizedBudget
                              ) || 0

                            const difference =
                              currentBudget - previousBudget

                            const changeRate =
                              previousBudget > 0
                                ? (
                                  difference /
                                  previousBudget
                                ) * 100
                                : null

                            return (
                              <div
                                key={allocation.channel}
                                className="revision-budget-table-row"
                              >
                                <strong>
                                  {allocation.channel}
                                </strong>

                                <span>
                                  {Math.round(
                                    previousBudget
                                  ).toLocaleString()}
                                  원
                                </span>

                                <span className="revision-budget-arrow">
                                  →
                                </span>

                                <strong>
                                  {Math.round(
                                    currentBudget
                                  ).toLocaleString()}
                                  원
                                </strong>

                                <span
                                  className={
                                    difference > 0
                                      ? 'revision-change-positive'
                                      : difference < 0
                                        ? 'revision-change-negative'
                                        : 'revision-change-neutral'
                                  }
                                >
                                  {difference > 0
                                    ? '▲ +'
                                    : difference < 0
                                      ? '▼ '
                                      : ''}

                                  {Math.round(
                                    difference
                                  ).toLocaleString()}
                                  원

                                  {changeRate !== null && (
                                    <>
                                      {' '}
                                      (
                                      {changeRate > 0 ? '+' : ''}
                                      {changeRate.toFixed(1)}
                                      %)
                                    </>
                                  )}
                                </span>
                              </div>
                            )
                          }
                        )}
                      </div>
                    </div>
                  </div>
                )}




              </div>

              {selectedTaskProposal.status ===
                'revision_requested' &&
                (selectedTaskProposal.taskStatus ||
                  'waiting') === 'waiting' && (
                  <div className="client-hub-share-actions">
                    <button
                      type="button"
                      onClick={() =>
                        startClientProposalRevision(
                          selectedTaskProposal.id
                        )
                      }
                    >
                      수정 작업 시작
                    </button>
                  </div>
                )}

              {selectedTaskProposal.status ===
                'revision_requested' &&
                selectedTaskProposal.taskStatus ===
                'in_progress' && (
                  <div className="task-detail-revision">
                    <h4>
                      수정안 작성
                    </h4>

                    <div className="revision-edit-mode">
                      <button
                        type="button"
                        onClick={() =>
                          setRevisionEditMode('scenario')
                        }
                        disabled={
                          revisionEditMode === 'scenario'
                        }
                      >
                        저장 시나리오 적용
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRevisionEditMode('manual')

                          setManualRevisionBudgets(
                            Object.fromEntries(
                              (
                                selectedTaskProposal.allocations ||
                                []
                              ).map(
                                (allocation) => [
                                  allocation.channel,
                                  Number(
                                    allocation.optimizedBudget
                                  ) || 0,
                                ]
                              )
                            )
                          )
                        }}
                        disabled={
                          revisionEditMode === 'manual'
                        }
                      >
                        직접 예산 편집
                      </button>
                    </div>

                    {revisionEditMode === 'scenario' && (
                      <>
                        <p>
                          저장된 다른 최적화 시나리오를
                          수정안으로 선택할 수 있습니다.
                        </p>

                        <select
                          value={revisionScenarioId}
                          onChange={(event) =>
                            setRevisionScenarioId(
                              event.target.value
                            )
                          }
                        >
                          <option value="">
                            시나리오 선택
                          </option>

                          {savedOptimizationScenarios
                            .filter(
                              (scenario) =>
                                scenario.id !==
                                selectedTaskProposal.scenarioId
                            )
                            .map(
                              (scenario) => (
                                <option
                                  key={scenario.id}
                                  value={scenario.id}
                                >
                                  {scenario.name ||
                                    getOptimizationObjectiveLabel(
                                      scenario.objective
                                    )}
                                </option>
                              )
                            )}
                        </select>

                        {revisionScenario && (
                          <div className="revision-scenario-comparison">
                            <h4>
                              현재 제안 vs 수정안
                            </h4>

                            <div className="task-detail-grid">
                              <div>
                                <span>총예산</span>
                                <strong>
                                  {Math.round(
                                    selectedTaskProposal.totalBudget ??
                                    (selectedTaskProposal.allocations || [])
                                      .reduce(
                                        (sum, allocation) =>
                                          sum +
                                          Number(
                                            allocation.optimizedBudget || 0
                                          ),
                                        0
                                      )
                                  ).toLocaleString()}
                                  원
                                  {' → '}
                                  {Math.round(
                                    revisionScenario.totalBudget || 0
                                  ).toLocaleString()}
                                  원
                                </strong>
                              </div>

                              <div>
                                <span>예상 매출</span>
                                <strong>
                                  {Math.round(
                                    selectedTaskProposal.summary
                                      ?.projectedRevenue || 0
                                  ).toLocaleString()}
                                  원
                                  {' → '}
                                  {Math.round(
                                    revisionScenario.summary
                                      ?.projectedRevenue || 0
                                  ).toLocaleString()}
                                  원
                                </strong>
                              </div>

                              <div>
                                <span>예상 ROAS</span>
                                <strong>
                                  {Number(
                                    selectedTaskProposal.summary
                                      ?.projectedRoas || 0
                                  ).toFixed(1)}
                                  %
                                  {' → '}
                                  {Number(
                                    revisionScenario.summary
                                      ?.projectedRoas || 0
                                  ).toFixed(1)}
                                  %
                                </strong>
                              </div>

                              <div>
                                <span>예상 CPA</span>
                                <strong>
                                  {selectedTaskProposal.summary
                                    ?.projectedCpa != null
                                    ? `${Math.round(
                                      selectedTaskProposal.summary
                                        .projectedCpa
                                    ).toLocaleString()}원`
                                    : '-'}
                                  {' → '}
                                  {revisionScenario.summary
                                    ?.projectedCpa != null
                                    ? `${Math.round(
                                      revisionScenario.summary
                                        .projectedCpa
                                    ).toLocaleString()}원`
                                    : '-'}
                                </strong>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {revisionEditMode === 'manual' && (
                      <div className="manual-revision-editor">
                        <h4>
                          매체별 예산 직접 편집
                        </h4>

                        <div className="manual-budget-list">
                          {(selectedTaskProposal?.allocations || [])
                            .map(
                              (allocation) => {
                                const editedBudget =
                                  Number(
                                    manualRevisionBudgets[
                                    allocation.channel
                                    ]
                                  ) || 0

                                const currentBudget =
                                  Number(
                                    allocation.optimizedBudget
                                  ) || 0

                                const changeRate =
                                  currentBudget > 0
                                    ? (
                                      (
                                        editedBudget -
                                        currentBudget
                                      ) /
                                      currentBudget
                                    ) * 100
                                    : 0

                                return (
                                  <div
                                    key={allocation.channel}
                                    className="manual-budget-row"
                                  >
                                    <strong>
                                      {allocation.channel}
                                    </strong>

                                    <div className="manual-budget-current">
                                      <span>현재 제안</span>

                                      <strong>
                                        {Math.round(
                                          currentBudget
                                        ).toLocaleString()}
                                        원
                                      </strong>
                                    </div>

                                    <span className="manual-budget-arrow">
                                      →
                                    </span>

                                    <div className="manual-budget-input">
                                      <span>수정 예산</span>

                                      <input
                                        type="number"
                                        min="0"
                                        value={
                                          manualRevisionBudgets[
                                          allocation.channel
                                          ] ?? ''
                                        }
                                        onChange={(event) =>
                                          setManualRevisionBudgets(
                                            (previous) => ({
                                              ...previous,

                                              [allocation.channel]:
                                                Number(
                                                  event.target.value
                                                ),
                                            }))
                                        }
                                      />
                                    </div>

                                    <div className="manual-budget-change">
                                      <span>변화율</span>

                                      <strong>
                                        {changeRate >= 0
                                          ? '+'
                                          : ''}
                                        {changeRate.toFixed(1)}%
                                      </strong>
                                    </div>
                                  </div>
                                )
                              }
                            )}
                        </div>

                        {manualRevisionProjection && (
                          <div className="manual-performance-preview">
                            <h4>
                              수정 후 예상 성과
                            </h4>

                            <div className="task-detail-grid">
                              <div>
                                <span>총예산</span>

                                <strong>
                                  {Math.round(
                                    manualRevisionProjection
                                      .totalBudget
                                  ).toLocaleString()}
                                  원
                                </strong>
                              </div>

                              <div>
                                <span>예상 매출</span>

                                <strong>
                                  {Math.round(
                                    manualRevisionProjection
                                      .summary
                                      .projectedRevenue
                                  ).toLocaleString()}
                                  원
                                </strong>
                              </div>

                              <div>
                                <span>예상 ROAS</span>

                                <strong>
                                  {Number(
                                    manualRevisionProjection
                                      .summary
                                      .projectedRoas
                                  ).toFixed(1)}
                                  %
                                </strong>
                              </div>

                              <div>
                                <span>예상 CPA</span>

                                <strong>
                                  {manualRevisionProjection
                                    .summary
                                    .projectedCpa != null
                                    ? `${Math.round(
                                      manualRevisionProjection
                                        .summary
                                        .projectedCpa
                                    ).toLocaleString()}원`
                                    : '-'}
                                </strong>
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="manual-revision-apply-button"
                          disabled={!manualRevisionProjection}
                          onClick={() =>
                            applyManualRevision(
                              selectedTaskProposal.id
                            )
                          }
                        >
                          직접 수정안 적용
                        </button>
                      </div>
                    )}

                    <div className="revision-allocation-comparison">
                      <h4>
                        매체별 예산 비교
                      </h4>

                      <table>
                        <thead>
                          <tr>
                            <th>매체</th>
                            <th>현재 제안</th>
                            <th>수정안</th>
                          </tr>
                        </thead>

                        <tbody>
                          {(selectedTaskProposal?.allocations || []).map(
                            (newAllocation) => {
                              const currentAllocation =
                                (
                                  selectedTaskProposal.allocations ||
                                  []
                                ).find(
                                  (allocation) =>
                                    allocation.channel ===
                                    newAllocation.channel
                                )

                              return (
                                <tr
                                  key={newAllocation.channel}
                                >
                                  <td>
                                    {newAllocation.channel}
                                  </td>

                                  <td>
                                    {Math.round(
                                      currentAllocation
                                        ?.optimizedBudget || 0
                                    ).toLocaleString()}
                                    원
                                  </td>

                                  <td>
                                    {Math.round(
                                      newAllocation
                                        .optimizedBudget || 0
                                    ).toLocaleString()}
                                    원
                                  </td>
                                </tr>
                              )
                            }
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="client-hub-share-actions">
                      <button
                        type="button"
                        onClick={() =>
                          applyRevisionScenario(
                            selectedTaskProposal.id,
                            revisionScenario
                          )
                        }
                      >
                        이 시나리오를 수정안으로 적용
                      </button>
                    </div>


                  </div>
                )}

              {selectedTaskProposal.status ===
                'revision_requested' &&
                selectedTaskProposal.taskStatus ===
                'reviewing' && (
                  <div className="client-hub-share-actions">
                    <button
                      type="button"
                      onClick={() =>
                        reshareClientProposal(
                          selectedTaskProposal.id
                        )
                      }
                    >
                      광고주에게 재공유
                    </button>
                  </div>
                )}



              {Array.isArray(
                selectedTaskProposal.history
              ) &&
                selectedTaskProposal.history.length >
                0 && (
                  <div className="task-detail-history">
                    <h4>
                      상태 변경 이력
                    </h4>

                    {selectedTaskProposal.history.map(
                      (historyItem, index) => (
                        <div
                          key={
                            `${historyItem.createdAt}_${index}`
                          }
                        >
                          <span>
                            {getClientProposalStatusLabel(
                              historyItem.status
                            )}
                          </span>

                          <span>
                            {new Date(
                              historyItem.createdAt
                            ).toLocaleString()}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
            </div>
          )}

          {taskTrashOpen && (
            <div className="task-trash-overlay">
              <div className="task-trash-modal">
                <div className="task-trash-modal-header">
                  <div>
                    <h3>휴지통</h3>

                    <p>
                      삭제된 업무를 확인하고 복원하거나
                      영구 삭제할 수 있습니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="task-trash-close-button"
                    onClick={() =>
                      setTaskTrashOpen(false)
                    }
                  >
                    닫기
                  </button>
                </div>

                <div className="task-trash-modal-summary">
                  삭제된 업무 {trashedClientTasks.length}개
                </div>

                {trashedClientTasks.length === 0 ? (
                  <div className="task-trash-empty">
                    휴지통이 비어 있습니다.
                  </div>
                ) : (
                  <div className="task-trash-list">
                    {trashedClientTasks.map(
                      (proposal) => (
                        <div
                          key={proposal.id}
                          className="task-trash-item"
                        >
                          <div className="task-trash-item-info">
                            <strong>
                              {proposal.scenarioName ||
                                '최적화 제안'}
                            </strong>

                            <span>
                              광고주 상태:{' '}
                              {getClientProposalStatusLabel(
                                proposal.status
                              )}
                            </span>

                            <span>
                              삭제일:{' '}
                              {proposal.trashedAt
                                ? new Date(
                                  proposal.trashedAt
                                ).toLocaleString()
                                : '-'}
                            </span>
                          </div>

                          <div className="task-trash-item-actions">
                            <button
                              type="button"
                              onClick={() =>
                                restoreClientTaskFromTrash(
                                  proposal.id
                                )
                              }
                            >
                              복원
                            </button>

                            <button
                              type="button"
                              className="task-trash-permanent-delete-button"
                              onClick={() =>
                                permanentlyDeleteClientTask(
                                  proposal.id
                                )
                              }
                            >
                              영구 삭제
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                <div className="task-trash-modal-footer">
                  <button
                    type="button"
                    className="task-trash-empty-button"
                    disabled={
                      trashedClientTasks.length === 0
                    }
                    onClick={
                      emptyClientTaskTrash
                    }
                  >
                    휴지통 비우기
                  </button>
                </div>
              </div>
            </div>
          )}



        </section>
      )}

      {mediaDataPanelOpen && (
        <div className="media-data-overlay">
          <div className="media-data-modal">
            <div className="media-data-modal-header">
              <div>
                <h2>
                  매체 데이터 연동
                </h2>

                <p>
                  광고 계정을 연결하여 성과 데이터를
                  자동으로 가져옵니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMediaDataPanelOpen(false)
                }
              >
                닫기
              </button>
            </div>

            <div className="media-connection-list">

              {/* Meta Ads */}
              <div className="media-connection-card">
                <div>
                  <strong>Meta Ads</strong>
                  <span>Facebook / Instagram</span>

                  {metaConnection?.status === 'connected' && (
                    <span>
                      {metaConnection.accountName ||
                        'Meta 광고 계정'}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setMetaConnectOpen(true)
                  }
                >
                  {metaConnection?.status === 'connected'
                    ? '연결됨'
                    : '계정 연결'}
                </button>
              </div>


              {/* Google Ads */}
              <div className="media-connection-card">
                <div>
                  <strong>Google Ads</strong>
                  <span>Search / Display / YouTube</span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setGoogleConnectOpen(true)
                  }
                >
                  계정 연결
                </button>
              </div>


              {/* TikTok Ads */}
              <div className="media-connection-card">
                <div>
                  <strong>TikTok Ads</strong>
                  <span>TikTok Campaign Data</span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setTiktokConnectOpen(true)
                  }
                >
                  계정 연결
                </button>
              </div>

              {/* Naver Ads */}
              <div className="media-connection-card">
                <div>
                  <strong>Naver Ads</strong>

                  <span>
                    Search Ads / Shopping Ads
                  </span>
                </div>

                {(() => {
                  const naverConnection =
                    adConnections.find(
                      (connection) =>
                        connection.platform === 'naver'
                    )

                  const isConnected =
                    naverConnection?.status ===
                    'connected'

                  if (isConnected) {
                    return (
                      <div className="media-connection-actions">
                        <span className="media-connected-badge">
                          연결됨
                        </span>

                        <button
                          type="button"
                          className="media-disconnect-button"
                          onClick={async () => {
                            const confirmed =
                              window.confirm(
                                'Naver Ads 연결을 끊으시겠습니까?\n저장된 API 인증정보는 제거됩니다.'
                              )

                            if (!confirmed) {
                              return
                            }

                            try {
                              const token =
                                localStorage.getItem(
                                  'adscope_operator_access_token'
                                )
                              const response =
                                await fetch(
                                  `${API_BASE_URL}/ad-connections/${naverConnection.id}/disconnect`,
                                  {
                                    method: 'PATCH',
                                    headers: {
                                      Authorization:
                                        `Bearer ${token}`,
                                    },
                                  }
                                )

                              if (!response.ok) {
                                throw new Error(
                                  `HTTP ${response.status}`
                                )
                              }

                              const result =
                                await response.json()

                              if (
                                result.status !==
                                'disconnected'
                              ) {
                                throw new Error(
                                  result.message ||
                                  '연결 해제 실패'
                                )
                              }

                              await loadAdConnectionsFromServer()

                              alert(
                                'Naver Ads 연결이 해제되었습니다.'
                              )

                            } catch (error) {
                              console.error(
                                'FAILED TO DISCONNECT NAVER ADS',
                                error
                              )

                              alert(
                                'Naver Ads 연결 해제 중 오류가 발생했습니다.'
                              )
                            }
                          }}
                        >
                          연결 끊기
                        </button>
                      </div>
                    )
                  }

                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setNaverConnectOpen(true)
                      }
                    >
                      계정 연결
                    </button>
                  )
                })()}
              </div>

            </div>

            {adConnections.length === 0 ? (
              <div className="media-data-empty">
                아직 연결된 광고 계정이 없습니다.
              </div>
            ) : (
              <div className="media-connected-list">
                {adConnections.map(
                  (connection) => (
                    <div
                      key={connection.id}
                      className="media-connected-item"
                    >
                      <strong>
                        {connection.accountName ||
                          connection.platform}
                      </strong>

                      <span>
                        {connection.platform}
                        {' · '}
                        {connection.accountId}
                      </span>

                      <small>
                        {connection.status === 'connected'
                          ? '연결됨'
                          : connection.status}
                      </small>
                    </div>
                  )
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {metaConnectOpen && (
        <div className="media-data-overlay">
          <div className="media-data-modal">
            <div className="media-data-modal-header">
              <div>
                <h2>Meta Ads 연결</h2>

                <p>
                  Meta 광고 데이터를 가져오기 위한
                  API 정보를 입력해주세요.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMetaConnectOpen(false)
                }
              >
                닫기
              </button>
            </div>

            <div className="meta-connect-form">
              <label>
                API 주소
              </label>

              <input
                type="text"
                value={metaApiUrl}
                placeholder="예: https://graph.facebook.com/..."
                onChange={(event) =>
                  setMetaApiUrl(
                    event.target.value
                  )
                }
              />

              <label>
                Access Token
              </label>

              <input
                type="password"
                value={metaAccessToken}
                placeholder="Meta Access Token을 입력하세요."
                onChange={(event) =>
                  setMetaAccessToken(
                    event.target.value
                  )
                }
              />

              <label>
                광고 계정 ID
              </label>

              <input
                type="text"
                value={metaAccountId}
                placeholder="예: act_123456789"
                onChange={(event) =>
                  setMetaAccountId(
                    event.target.value
                  )
                }
              />
            </div>

            <div className="meta-connect-actions">
              <button
                type="button"
                onClick={() =>
                  setMetaConnectOpen(false)
                }
              >
                취소
              </button>

              <button
                type="button"
                disabled={
                  !metaApiUrl.trim() ||
                  !metaAccessToken.trim() ||
                  !metaAccountId.trim()
                }
                onClick={() => {
                  console.log(
                    'META CONNECTION TEST',
                    {
                      apiUrl:
                        metaApiUrl,
                      accountId:
                        metaAccountId,
                    }
                  )
                }}
              >
                연결 테스트
              </button>
            </div>
          </div>
        </div>
      )}

      {naverConnectOpen && (
        <div className="media-data-overlay">
          <div className="media-data-modal">
            <div className="media-data-modal-header">
              <div>
                <h2>Naver Ads 연결</h2>

                <p>
                  네이버 검색광고 API 인증 정보를
                  입력해주세요.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setNaverConnectOpen(false)
                }
              >
                닫기
              </button>
            </div>

            <div className="meta-connect-form">
              <label>
                API 주소
              </label>

              <input
                type="text"
                value={naverApiUrl}
                placeholder="https://api.searchad.naver.com"
                onChange={(event) =>
                  setNaverApiUrl(
                    event.target.value
                  )
                }
              />

              <label>
                Access License
              </label>

              <input
                type="password"
                value={naverAccessToken}
                placeholder="Access License"
                onChange={(event) =>
                  setNaverAccessToken(
                    event.target.value
                  )
                }
              />

              <label>
                Secret Key
              </label>

              <input
                type="password"
                value={naverSecretKey}
                placeholder="Secret Key"
                onChange={(event) =>
                  setNaverSecretKey(
                    event.target.value
                  )
                }
              />

              <label>
                Customer ID
              </label>

              <input
                type="text"
                value={naverAccountId}
                placeholder="Customer ID"
                onChange={(event) =>
                  setNaverAccountId(
                    event.target.value
                  )
                }
              />
            </div>

            <div className="meta-connect-actions">
              <button
                type="button"
                onClick={() =>
                  setNaverConnectOpen(false)
                }
              >
                취소
              </button>

              <button
                type="button"
                disabled={
                  !naverApiUrl.trim() ||
                  !naverAccessToken.trim() ||
                  !naverSecretKey.trim() ||
                  !naverAccountId.trim()
                }
                onClick={async () => {
                  try {
                    const token =
                      localStorage.getItem(
                        'adscope_operator_access_token'
                      )
                    const response =
                      await fetch(
                        `${API_BASE_URL}/ad-connections/naver/test`,
                        {
                          method: 'POST',

                          headers: {
                            'Content-Type':
                              'application/json',
                            Authorization:
                              `Bearer ${token}`,
                          },

                          body:
                            JSON.stringify({
                              accessLicense:
                                naverAccessToken,

                              secretKey:
                                naverSecretKey,

                              customerId:
                                naverAccountId,
                            }),
                        }
                      )

                    if (!response.ok) {
                      throw new Error(
                        `HTTP ${response.status}`
                      )
                    }

                    const result =
                      await response.json()

                    console.log(
                      'NAVER CONNECTION RESULT',
                      result
                    )

                    if (
                      result.status === 'connected'
                    ) {
                      const now =
                        new Date().toISOString()

                      const connectionId =
                        `naver-${selectedAdvertiserId}-${naverAccountId}`

                      const token =
                        localStorage.getItem(
                          'adscope_operator_access_token'
                        )

                      const saveResponse =
                        await fetch(
                          `${API_BASE_URL}/ad-connections`,
                          {
                            method: 'POST',

                            headers: {
                              'Content-Type':
                                'application/json',
                              Authorization:
                                `Bearer ${token}`,
                            },

                            body:
                              JSON.stringify({
                                id: connectionId,

                                advertiserId:
                                  selectedAdvertiserId,

                                platform: 'naver',

                                apiUrl:
                                  'https://api.searchad.naver.com',

                                accountId:
                                  naverAccountId,

                                accountName:
                                  'Naver Ads',

                                status:
                                  'connected',

                                accessToken:
                                  naverAccessToken,

                                refreshToken:
                                  null,

                                secretKey:
                                  naverSecretKey,

                                customerId:
                                  naverAccountId,

                                tokenExpiresAt:
                                  null,

                                lastSyncedAt:
                                  null,

                                createdAt:
                                  now,

                                updatedAt:
                                  now,
                              }),
                          }
                        )

                      if (!saveResponse.ok) {
                        throw new Error(
                          `SAVE HTTP ${saveResponse.status}`
                        )
                      }

                      const saveResult =
                        await saveResponse.json()

                      console.log(
                        'NAVER CONNECTION SAVED',
                        saveResult
                      )

                      alert(
                        `네이버 광고 API 연결 및 저장 성공${result.campaignCount !== null &&
                          result.campaignCount !== undefined
                          ? `\n캠페인 ${result.campaignCount}개 확인`
                          : ''
                        }`
                      )
                      await loadAdConnectionsFromServer()
                      setNaverConnectOpen(false)

                      return
                    }

                    alert(
                      result.message ||
                      '네이버 광고 API 연결에 실패했습니다.'
                    )

                  } catch (error) {
                    console.error(
                      'NAVER CONNECTION TEST FAILED',
                      error
                    )

                    alert(
                      '네이버 광고 API 연결 테스트 중 오류가 발생했습니다.'
                    )
                  }
                }}
              >
                연결 테스트
              </button>
            </div>
          </div>
        </div>
      )}

      {googleConnectOpen && (
        <div className="media-data-overlay">
          <div className="media-data-modal">
            <div className="media-data-modal-header">
              <div>
                <h2>Google Ads 연결</h2>

                <p>
                  Google Ads 데이터를 가져오기 위한
                  API 정보를 입력해주세요.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setGoogleConnectOpen(false)
                }
              >
                닫기
              </button>
            </div>

            <div className="meta-connect-form">
              <label>
                API 주소
              </label>

              <input
                type="text"
                value={googleApiUrl}
                placeholder="예: https://googleads.googleapis.com/..."
                onChange={(event) =>
                  setGoogleApiUrl(
                    event.target.value
                  )
                }
              />

              <label>
                Access Token / API Key
              </label>

              <input
                type="password"
                value={googleAccessToken}
                placeholder="Google Ads 인증 정보를 입력하세요."
                onChange={(event) =>
                  setGoogleAccessToken(
                    event.target.value
                  )
                }
              />

              <label>
                Customer ID
              </label>

              <input
                type="text"
                value={googleAccountId}
                placeholder="예: 123-456-7890"
                onChange={(event) =>
                  setGoogleAccountId(
                    event.target.value
                  )
                }
              />
            </div>

            <div className="meta-connect-actions">
              <button
                type="button"
                onClick={() =>
                  setGoogleConnectOpen(false)
                }
              >
                취소
              </button>

              <button
                type="button"
                disabled={
                  !googleApiUrl.trim() ||
                  !googleAccessToken.trim() ||
                  !googleAccountId.trim()
                }
                onClick={() => {
                  console.log(
                    'GOOGLE CONNECTION TEST',
                    {
                      apiUrl:
                        googleApiUrl,
                      accountId:
                        googleAccountId,
                    }
                  )
                }}
              >
                연결 테스트
              </button>
            </div>
          </div>
        </div>
      )}

      {tiktokConnectOpen && (
        <div className="media-data-overlay">
          <div className="media-data-modal">
            <div className="media-data-modal-header">
              <div>
                <h2>TikTok Ads 연결</h2>

                <p>
                  TikTok 광고 데이터를 가져오기 위한
                  API 정보를 입력해주세요.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setTiktokConnectOpen(false)
                }
              >
                닫기
              </button>
            </div>

            <div className="meta-connect-form">
              <label>
                API 주소
              </label>

              <input
                type="text"
                value={tiktokApiUrl}
                placeholder="예: https://business-api.tiktok.com/..."
                onChange={(event) =>
                  setTiktokApiUrl(
                    event.target.value
                  )
                }
              />

              <label>
                Access Token
              </label>

              <input
                type="password"
                value={tiktokAccessToken}
                placeholder="TikTok Access Token"
                onChange={(event) =>
                  setTiktokAccessToken(
                    event.target.value
                  )
                }
              />

              <label>
                Advertiser ID
              </label>

              <input
                type="text"
                value={tiktokAccountId}
                placeholder="TikTok Advertiser ID"
                onChange={(event) =>
                  setTiktokAccountId(
                    event.target.value
                  )
                }
              />
            </div>

            <div className="meta-connect-actions">
              <button
                type="button"
                onClick={() =>
                  setTiktokConnectOpen(false)
                }
              >
                취소
              </button>

              <button
                type="button"
                disabled={
                  !tiktokApiUrl.trim() ||
                  !tiktokAccessToken.trim() ||
                  !tiktokAccountId.trim()
                }
                onClick={() => {
                  console.log(
                    'TIKTOK CONNECTION TEST',
                    {
                      apiUrl:
                        tiktokApiUrl,
                      accountId:
                        tiktokAccountId,
                    }
                  )
                }}
              >
                연결 테스트
              </button>
            </div>
          </div>
        </div>
      )}

      {isClientHubOpen && (
        <div className="client-hub-overlay">
          <div className="client-hub-modal">

            <div className="client-hub-header">
              <div>
                <h2>
                  광고주 커뮤니케이션 허브
                </h2>

                <span>
                  제안 · 승인 · 업무 · 대화를
                  한 곳에서 관리합니다.
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setIsClientHubOpen(false)
                }
              >
                ✕
              </button>
            </div>


            <div className="client-hub-layout">

              {/* =========================
            왼쪽: 제안 목록
        ========================= */}
              <aside className="client-hub-sidebar">
                <div className="client-hub-sidebar-header">
                  <strong>
                    광고주 제안
                  </strong>

                  <span>
                    {
                      clientProposals.filter(
                        (proposal) =>
                          proposal.status !== 'cancelled'
                      ).length
                    }
                    개
                  </span>
                </div>

                {clientProposals.filter(
                  (proposal) =>
                    proposal.status !== 'cancelled'
                ).length === 0 ? (
                  <div className="client-hub-empty">
                    아직 생성된 광고주 제안이
                    없습니다.
                  </div>
                ) : (
                  <div className="client-hub-proposal-list">
                    {clientProposals
                      .filter(
                        (proposal) =>
                          proposal.status !== 'cancelled'
                      )
                      .map(
                        (proposal) => (
                          <button
                            key={proposal.id}
                            type="button"
                            className={
                              selectedHubProposal?.id ===
                                proposal.id
                                ? 'client-hub-proposal-item active'
                                : 'client-hub-proposal-item'
                            }
                            onClick={() =>
                              setSelectedHubProposalId(
                                proposal.id
                              )
                            }
                          >
                            <strong>
                              {proposal.scenarioName ||
                                proposal.name ||
                                '최적화 제안'}
                            </strong>

                            <span>
                              {getClientProposalStatusLabel(
                                proposal.status
                              )}
                            </span>
                          </button>
                        )
                      )}
                  </div>
                )}
              </aside>


              {/* =========================
            중앙: 제안 + 대화 영역
        ========================= */}
              <main className="client-hub-main">
                {selectedHubProposal ? (
                  <>
                    <div className="client-hub-conversation-header">
                      <div>
                        <h3>
                          {selectedHubProposal.scenarioName ||
                            selectedHubProposal.name ||
                            '최적화 제안'}
                        </h3>

                        <span>
                          {getClientProposalStatusLabel(
                            selectedHubProposal.status
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="client-hub-conversation">
                      {clientHubTimeline.length === 0 ? (
                        <div className="client-hub-placeholder">
                          <strong>
                            아직 대화나 활동이 없습니다.
                          </strong>

                          <p>
                            메시지를 보내거나 제안 상태가
                            변경되면 여기에 기록됩니다.
                          </p>
                        </div>
                      ) : (
                        <div className="client-hub-timeline">
                          {clientHubTimeline.map(
                            (timelineItem) => {
                              if (
                                timelineItem.type ===
                                'message'
                              ) {
                                const messageItem =
                                  timelineItem.data

                                return (
                                  <div
                                    key={timelineItem.id}
                                    className={
                                      messageItem.senderType ===
                                        'client'
                                        ? 'client-hub-message client'
                                        : 'client-hub-message internal'
                                    }
                                  >
                                    <div className="client-hub-message-meta">
                                      <strong>
                                        {messageItem.senderName ||
                                          (messageItem.senderType ===
                                            'client'
                                            ? '광고주'
                                            : '운영 담당자')}
                                      </strong>

                                      <span>
                                        {new Date(
                                          messageItem.createdAt
                                        ).toLocaleString()}
                                      </span>
                                    </div>

                                    <div className="client-hub-message-content">
                                      <p>
                                        {messageItem.message}
                                      </p>

                                      {messageItem.senderType === 'internal' && (
                                        <div className="client-hub-message-read-status">
                                          {messageItem.isRead
                                            ? '읽음'
                                            : '안읽음'}
                                        </div>
                                      )}

                                      {messageItem.actionUrl && (
                                        <a
                                          href={messageItem.actionUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="client-hub-proposal-link"
                                        >
                                          {messageItem.actionLabel ||
                                            '제안 확인하기'}
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )
                              }

                              if (
                                timelineItem.type ===
                                'viewed'
                              ) {
                                const viewedEvent =
                                  timelineItem.data

                                return (
                                  <div
                                    key={timelineItem.id}
                                    className="client-hub-status-event"
                                  >
                                    <span>
                                      {viewedEvent.message ||
                                        '광고주가 제안을 열람했습니다.'}
                                    </span>

                                    <small>
                                      {new Date(
                                        viewedEvent.createdAt
                                      ).toLocaleString()}
                                    </small>
                                  </div>
                                )
                              }

                              if (
                                timelineItem.type ===
                                'status'
                              ) {
                                const historyItem =
                                  timelineItem.data

                                return (
                                  <div
                                    key={timelineItem.id}
                                    className="client-hub-status-event"
                                  >
                                    <span>
                                      {getClientProposalStatusLabel(
                                        historyItem.status
                                      )}
                                    </span>

                                    <small>
                                      {new Date(
                                        historyItem.createdAt
                                      ).toLocaleString()}
                                    </small>
                                  </div>
                                )
                              }

                              return null
                            }
                          )}
                        </div>
                      )}
                    </div>

                    <div className="client-hub-message-composer">
                      <textarea
                        rows="3"
                        value={clientHubMessage}
                        placeholder="광고주에게 전달할 메시지를 입력하세요."
                        onChange={(event) =>
                          setClientHubMessage(
                            event.target.value
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.nativeEvent.isComposing) {
                            return
                          }

                          if (
                            event.key === 'Enter' &&
                            !event.shiftKey
                          ) {
                            event.preventDefault()

                            sendClientHubMessage()
                          }
                        }}
                      />

                      <div className="client-hub-composer-footer">
                        <span>
                          Enter 전송 · Shift + Enter 줄바꿈
                        </span>

                        <button
                          type="button"
                          disabled={
                            !clientHubMessage.trim()
                          }
                          onClick={
                            sendClientHubMessage
                          }
                        >
                          메시지 보내기
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="client-hub-empty-main">
                    광고주 제안을 생성하면
                    여기에서 소통할 수 있습니다.
                  </div>
                )}
              </main>


              {/* =========================
            오른쪽: Workflow / Action
        ========================= */}
              <aside className="client-hub-actions">
                <h3>
                  Workflow
                </h3>

                {selectedHubProposal ? (
                  <>
                    <div className="client-hub-action-item">
                      <span>
                        광고주 상태
                      </span>

                      <strong>
                        {getClientProposalStatusLabel(
                          selectedHubProposal.status
                        )}
                      </strong>
                    </div>

                    <div className="client-hub-action-item">
                      <span>
                        담당자
                      </span>

                      <strong>
                        {selectedHubProposal.assignee ||
                          '미지정'}
                      </strong>
                    </div>

                    <div className="client-hub-action-item">
                      <span>
                        마감일
                      </span>

                      <strong>
                        {selectedHubProposal.dueDate ||
                          '미지정'}
                      </strong>
                    </div>

                    <div className="client-hub-action-item">
                      <span>
                        업무 상태
                      </span>

                      <strong>
                        {selectedHubProposal.taskStatus ===
                          'in_progress'
                          ? '진행 중'
                          : selectedHubProposal.taskStatus ===
                            'reviewing'
                            ? '내부 검토 중'
                            : selectedHubProposal.taskStatus ===
                              'done'
                              ? '완료'
                              : '대기'}
                      </strong>
                    </div>



                    <div className="client-hub-action-item">
                      <span>
                        공유 상태
                      </span>

                      <strong>
                        {selectedHubProposal.shareStatus ===
                          'shared'
                          ? '공유 완료'
                          : '미공유'}
                      </strong>

                      {selectedHubProposal.sharedAt && (
                        <small>
                          {new Date(
                            selectedHubProposal.sharedAt
                          ).toLocaleString()}
                        </small>
                      )}
                    </div>

                    <div className="client-hub-action-item">
                      <span>
                        광고주 열람
                      </span>

                      <strong>
                        {selectedHubProposal.firstViewedAt
                          ? '열람 완료'
                          : '미열람'}
                      </strong>

                      {selectedHubProposal.firstViewedAt && (
                        <>
                          <small>
                            최초 열람:{' '}
                            {new Date(
                              selectedHubProposal.firstViewedAt
                            ).toLocaleString()}
                          </small>

                          <small>
                            최근 열람:{' '}
                            {new Date(
                              selectedHubProposal.lastViewedAt ||
                              selectedHubProposal.firstViewedAt
                            ).toLocaleString()}
                          </small>

                          <small>
                            열람 횟수:{' '}
                            {selectedHubProposal.viewCount ||
                              1}
                            회
                          </small>
                        </>
                      )}
                    </div>


                    <div className="client-hub-progress">
                      <h4>
                        광고주 진행상황
                      </h4>

                      {(() => {
                        const progress =
                          getClientProposalProgress(
                            selectedHubProposal
                          )

                        const steps = [
                          {
                            key: 'sent',
                            label: '제안 완료',
                            completed:
                              progress.sent,
                          },
                          {
                            key: 'shared',
                            label: '공유',
                            completed:
                              progress.shared,
                          },
                          {
                            key: 'viewed',
                            label: '열람',
                            completed:
                              progress.viewed,
                          },
                          {
                            key: 'reviewing',
                            label: '검토',
                            completed:
                              progress.reviewing,
                          },
                          {
                            key: 'approved',
                            label: '승인',
                            completed:
                              progress.approved,
                          },
                        ]

                        return steps.map(
                          (step, index) => (
                            <div
                              key={step.key}
                              className={
                                step.completed
                                  ? 'client-hub-progress-step completed'
                                  : 'client-hub-progress-step'
                              }
                            >
                              <div className="client-hub-progress-marker">
                                <span>
                                  {step.completed
                                    ? '✓'
                                    : index + 1}
                                </span>
                              </div>

                              <strong>
                                {step.label}
                              </strong>
                            </div>
                          )
                        )
                      })()}
                    </div>

                    {(() => {
                      const attention =
                        getClientProposalAttention(
                          selectedHubProposal
                        )

                      if (!attention) {
                        return null
                      }

                      return (
                        <div
                          className={
                            `client-hub-attention ${attention.level}`
                          }
                        >
                          <strong>
                            {attention.label}
                          </strong>

                          <p>
                            {attention.message}
                          </p>
                        </div>
                      )
                    })()}

                    <div className="client-hub-next-action">
                      <span>
                        다음 조치
                      </span>

                      <strong>
                        {getRecommendedNextAction(
                          selectedHubProposal
                        )}
                      </strong>
                    </div>

                    {selectedHubProposal.status ===
                      'preparing' && (
                        <div className="client-hub-share-actions">
                          <button
                            type="button"
                            onClick={() => {
                              const changedAt =
                                new Date().toISOString()

                              const updatedProposal = {
                                ...selectedHubProposal,

                                status:
                                  'sent',

                                updatedAt:
                                  changedAt,

                                history: [
                                  ...(selectedHubProposal.history ||
                                    []),

                                  {
                                    type:
                                      'status',

                                    status:
                                      'sent',

                                    createdAt:
                                      changedAt,
                                  },
                                ],
                              }

                              setClientProposals(
                                (previous) =>
                                  previous.map(
                                    (proposal) =>
                                      proposal.id ===
                                        selectedHubProposal.id
                                        ? updatedProposal
                                        : proposal
                                  )
                              )

                              saveClientProposalToServer(
                                selectedHubProposal.id,
                                {
                                  status:
                                    'sent',

                                  updatedAt:
                                    changedAt,
                                }
                              )

                              saveClientProposalEventToServer(
                                selectedHubProposal.id,
                                'sent',
                                {
                                  status:
                                    'sent',

                                  message:
                                    '광고주 제안 준비가 완료되었습니다.',

                                  actorType:
                                    'operator',

                                  advertiserId:
                                    selectedAdvertiserId,
                                }
                              )
                            }}
                          >
                            제안 완료 처리
                          </button>
                        </div>
                      )}

                    {selectedHubProposal.status ===
                      'sent' &&
                      selectedHubProposal.shareStatus !==
                      'shared' && (
                        <div className="client-hub-share-actions">
                          <button
                            type="button"
                            onClick={() =>
                              shareClientProposal(
                                selectedHubProposal.id
                              )
                            }
                          >
                            광고주에게 공유
                          </button>
                        </div>
                      )}

                    <div className="client-hub-decision-actions">
                      {selectedHubProposal.status ===
                        'reviewing' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const confirmed =
                                  window.confirm(
                                    '이 제안에 수정 요청을 등록하시겠습니까?'
                                  )

                                if (!confirmed) {
                                  return
                                }

                                requestClientRevision(
                                  selectedHubProposal.id
                                )
                              }}
                            >
                              수정 요청
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const confirmed =
                                  window.confirm(
                                    '이 제안을 승인하시겠습니까?'
                                  )

                                if (!confirmed) {
                                  return
                                }

                                approveClientProposal(
                                  selectedHubProposal.id
                                )
                              }}
                            >
                              승인
                            </button>
                          </>
                        )}
                    </div>
                  </>
                ) : (
                  <p>
                    선택된 제안이 없습니다.
                  </p>
                )}
              </aside>

            </div>
          </div>
        </div>
      )}

    </div >
  )
}

function ClientMessagesPage() {
  const clientId =
    localStorage.getItem(
      'adscope_client_id'
    )

  const clientName =
    localStorage.getItem(
      'adscope_client_name'
    )

  const [proposals, setProposals] =
    useState([])

  const [messages, setMessages] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  const [newMessage, setNewMessage] =
    useState('')

  const [sendingMessage, setSendingMessage] =
    useState(false)

  useEffect(() => {
    if (!clientId) {
      window.location.href =
        '/client/login'

      return
    }



    async function loadClientMessages() {
      try {
        /*
         * 1. 이 광고주의 제안만 가져온다.
         */
        const proposalResponse =
          await clientFetch(
            `${API_BASE_URL}/client-portal/proposals`
          )

        if (!proposalResponse) {
          return
        }

        if (!proposalResponse.ok) {
          throw new Error(
            `Proposal HTTP ${proposalResponse.status}`
          )
        }

        const proposalResult =
          await proposalResponse.json()

        const clientProposalList =
          Array.isArray(proposalResult)
            ? proposalResult
            : Array.isArray(
              proposalResult.proposals
            )
              ? proposalResult.proposals
              : []

        setProposals(
          clientProposalList
        )

        /*
         * 2. 각 제안에 연결된 메시지를 가져온다.
         */
        const messageResults =
          await Promise.all(
            clientProposalList.map(
              async (proposal) => {
                const response =
                  await clientFetch(
                    `${API_BASE_URL}/client-proposals/${proposal.id}/messages`
                  )

                if (!response) {
                  return []
                }

                if (!response.ok) {
                  return []
                }

                const result =
                  await response.json()

                const proposalMessages =
                  Array.isArray(result)
                    ? result
                    : Array.isArray(
                      result.messages
                    )
                      ? result.messages
                      : []

                const hasUnreadInternalMessage =
                  proposalMessages.some(
                    (message) =>
                      message.senderType === 'internal' &&
                      !message.isRead
                  )

                if (hasUnreadInternalMessage) {
                  const readResponse =
                    await clientFetch(
                      `${API_BASE_URL}/client-proposals/${proposal.id}/messages/read`,
                      {
                        method: 'PATCH',
                        headers: {
                          'Content-Type':
                            'application/json',
                        },
                        body:
                          JSON.stringify({
                            readerType: 'client',
                          }),
                      }
                    )

                  if (!readResponse) {
                    return []
                  }

                  if (!readResponse.ok) {
                    console.error(
                      'FAILED TO MARK CLIENT MESSAGES AS READ',
                      readResponse.status
                    )
                  }

                  if (readResponse.ok) {
                    window.dispatchEvent(
                      new Event(
                        'client-messages-read'
                      )
                    )
                  }
                }

                return proposalMessages.map(
                  (message) => ({
                    ...message,

                    isRead:
                      message.senderType === 'internal'
                        ? true
                        : message.isRead,

                    proposalName:
                      proposal.scenarioName ||
                      proposal.name ||
                      '광고 제안',
                  })
                )
              }
            )
          )

        const mergedMessages =
          messageResults
            .flat()
            .sort(
              (a, b) =>
                new Date(
                  a.createdAt || 0
                ) -
                new Date(
                  b.createdAt || 0
                )
            )

        setMessages(
          mergedMessages
        )
      } catch (error) {
        console.error(
          'FAILED TO LOAD CLIENT MESSAGES',
          error
        )
      } finally {
        setLoading(false)
      }
    }

    // 메시지 페이지 진입 시 즉시 1회 조회
    loadClientMessages()

    // 메시지 페이지를 열어둔 동안
    // 3초마다 새 메시지 확인 + 자동 읽음 처리
    const intervalId =
      window.setInterval(
        loadClientMessages,
        3000
      )

    return () => {
      window.clearInterval(
        intervalId
      )
    }

  }, [clientId])



  async function sendClientMessage() {
    console.log(
      'SEND CLIENT MESSAGE CALLED',
      {
        newMessage,
        proposals,
      }
    )
    const trimmedMessage =
      newMessage.trim()

    if (!trimmedMessage) {
      return
    }

    if (proposals.length === 0) {
      alert(
        '메시지를 연결할 광고 제안이 없습니다.'
      )
      return
    }

    const latestProposal =
      [...proposals].sort(
        (a, b) =>
          new Date(
            b.updatedAt ||
            b.createdAt ||
            0
          ) -
          new Date(
            a.updatedAt ||
            a.createdAt ||
            0
          )
      )[0]

    const messagePayload = {
      id:
        `message_${Date.now()}`,

      proposalId:
        latestProposal.id,

      senderType:
        'client',

      senderName:
        clientName ||
        '광고주',

      message:
        trimmedMessage,

      actionUrl:
        null,

      actionLabel:
        null,

      createdAt:
        new Date().toISOString(),
    }

    try {
      setSendingMessage(true)

      const response =
        await clientFetch(
          `${API_BASE_URL}/client-proposals/${latestProposal.id}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                messagePayload
              ),
          }
        )

      if (!response) {
        return
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      console.log(
        'CLIENT MESSAGE POST RESULT:',
        result
      )

      if (result.status !== 'saved') {
        throw new Error(
          result.message ||
          '메시지 저장 실패'
        )
      }

      setMessages(
        (currentMessages) => [
          ...currentMessages,

          {
            ...messagePayload,
            proposalName:
              latestProposal.scenarioName ||
              latestProposal.name ||
              '광고 제안',
          },
        ]
      )

      setNewMessage('')

    } catch (error) {
      console.error(
        'FAILED TO SEND CLIENT MESSAGE',
        error
      )

      alert(
        '메시지 전송 중 오류가 발생했습니다.'
      )

    } finally {
      setSendingMessage(false)
    }
  }

  return (
    <div className="client-portal-page">

      <ClientPortalHeader
        activePage="messages"
      />

      <main className="client-portal-content">

        <div className="client-dashboard-heading">
          <div>
            <h2>메시지</h2>

            <p>
              담당자가 전달한 제안 및
              커뮤니케이션 내용을 확인할 수 있습니다.
            </p>
          </div>
        </div>

        <section className="client-message-list">

          {loading ? (
            <div className="client-proposal-empty">
              메시지를 불러오는 중입니다.
            </div>

          ) : messages.length === 0 ? (
            <div className="client-proposal-empty">
              아직 등록된 메시지가 없습니다.
            </div>

          ) : (
            messages.map((message) => {
              const isClient =
                message.senderType === 'client'

              return (
                <div
                  key={message.id}
                  className={
                    isClient
                      ? 'client-chat-row client-chat-row-self'
                      : 'client-chat-row client-chat-row-internal'
                  }
                >
                  {!isClient && (
                    <div className="client-chat-avatar">
                      A
                    </div>
                  )}

                  <div className="client-chat-content">

                    <div className="client-chat-sender">
                      {isClient
                        ? message.senderName ||
                        '나'
                        : message.senderName ||
                        '운영 담당자'}
                    </div>

                    <div className="client-chat-bubble">
                      <p>
                        {message.message}
                      </p>

                      {message.actionUrl && (
                        <button
                          type="button"
                          className="client-chat-action"
                          onClick={() => {
                            window.location.href =
                              message.actionUrl
                          }}
                        >
                          {message.actionLabel ||
                            '제안 확인하기'}
                        </button>
                      )}
                    </div>

                    <div className="client-chat-time">
                      <span>
                        {message.createdAt
                          ? new Date(
                            message.createdAt
                          ).toLocaleString(
                            'ko-KR',
                            {
                              month: 'numeric',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            }
                          )
                          : ''}
                      </span>

                      {message.senderType === 'client' && (
                        <span>
                          · {message.isRead
                            ? '읽음'
                            : '안읽음'}
                        </span>
                      )}
                    </div>

                  </div>
                </div>
              )
            })
          )}

        </section>

        <section className="client-message-compose">

          <h3>
            담당자에게 메시지 보내기
          </h3>

          <textarea
            value={newMessage}
            placeholder="문의사항이나 제안에 대한 의견을 입력해주세요."
            onChange={(event) =>
              setNewMessage(
                event.target.value
              )
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault()

                if (
                  !sendingMessage &&
                  newMessage.trim()
                ) {
                  sendClientMessage()
                }
              }
            }}
            rows={4}
          />

          <div className="client-message-compose-actions">
            <button
              type="button"
              disabled={
                sendingMessage ||
                !newMessage.trim()
              }
              onClick={() => {
                console.log(
                  'CLIENT MESSAGE BUTTON CLICKED'
                )

                sendClientMessage()
              }}
            >
              {sendingMessage
                ? '전송 중...'
                : '메시지 보내기'}
            </button>
          </div>

        </section>

      </main>
    </div>
  )
}

function ClientPerformancePage() {
  const clientId =
    localStorage.getItem(
      'adscope_client_id'
    )

  const clientName =
    localStorage.getItem(
      'adscope_client_name'
    )

  const clientBrand =
    localStorage.getItem(
      'adscope_client_brand'
    )

  const [
    performancePeriod,
    setPerformancePeriod,
  ] = useState('30d')

  const [
    performanceChannel,
    setPerformanceChannel,
  ] = useState('전체')

  const [
    campaignSort,
    setCampaignSort,
  ] = useState('roas_desc')

  const [
    selectedCampaignKey,
    setSelectedCampaignKey,
  ] = useState(null)

  const [
    clientPerformanceData,
    setClientPerformanceData,
  ] = useState([])

  const [
    clientPerformanceLoading,
    setClientPerformanceLoading,
  ] = useState(true)

  useEffect(() => {
    if (!clientId) {
      window.location.href =
        '/client/login'
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) {
      setClientPerformanceData([])
      setClientPerformanceLoading(false)
      return
    }

    let cancelled = false

    async function loadClientPerformance() {
      try {
        setClientPerformanceLoading(true)

        const response =
          await clientFetch(
            `${API_BASE_URL}/client-portal/performance?platform=naver`
          )

        if (!response) {
          return
        }

        if (!response.ok) {
          throw new Error(
            `Client Performance HTTP ${response.status}`
          )
        }

        const result =
          await response.json()

        if (cancelled) {
          return
        }

        const performance =
          Array.isArray(result)
            ? result
            : Array.isArray(
              result.performance
            )
              ? result.performance
              : []

        setClientPerformanceData(
          performance
        )

      } catch (error) {
        console.error(
          'FAILED TO LOAD CLIENT PERFORMANCE',
          error
        )

        if (!cancelled) {
          setClientPerformanceData([])
        }

      } finally {
        if (!cancelled) {
          setClientPerformanceLoading(false)
        }
      }
    }

    loadClientPerformance()

    return () => {
      cancelled = true
    }
  }, [clientId])

  //const performanceRows =
  //mockAds.filter((row) =>
  //clientBrand
  //? row.brand === clientBrand
  //: true
  //)

  // TODO:
  // 실제 광고 API 연결 후
  // 로그인한 clientId 기준 데이터로 교체
  const availableDates =
    clientPerformanceData
      .map((row) => row.date)
      .filter(Boolean)
      .sort()

  const latestDataDate =
    availableDates.length > 0
      ? new Date(
        `${availableDates[
        availableDates.length - 1
        ]}T00:00:00`
      )
      : null

  const performanceRows =
    clientPerformanceData.filter(
      (row) => {

        // =========================
        // 매체 필터
        // =========================
        if (
          performanceChannel !== '전체' &&
          row.channel !== performanceChannel
        ) {
          return false
        }

        // =========================
        // 전체 기간
        // =========================
        if (
          performancePeriod === 'all'
        ) {
          return true
        }

        if (
          !row.date ||
          !latestDataDate
        ) {
          return false
        }

        const rowDate =
          new Date(
            `${row.date}T00:00:00`
          )

        let periodDays = 30

        if (
          performancePeriod === '7d'
        ) {
          periodDays = 7
        }

        if (
          performancePeriod === '90d'
        ) {
          periodDays = 90
        }

        const startDate =
          new Date(latestDataDate)

        startDate.setDate(
          startDate.getDate() -
          (periodDays - 1)
        )

        return (
          rowDate >= startDate &&
          rowDate <= latestDataDate
        )
      })

  let previousPerformanceRows = []

  if (
    performancePeriod !== 'all' &&
    latestDataDate
  ) {
    let periodDays = 30

    if (performancePeriod === '7d') {
      periodDays = 7
    }

    if (performancePeriod === '90d') {
      periodDays = 90
    }

    const currentStartDate =
      new Date(latestDataDate)

    currentStartDate.setDate(
      currentStartDate.getDate() -
      (periodDays - 1)
    )

    const previousEndDate =
      new Date(currentStartDate)

    previousEndDate.setDate(
      previousEndDate.getDate() - 1
    )

    const previousStartDate =
      new Date(previousEndDate)

    previousStartDate.setDate(
      previousStartDate.getDate() -
      (periodDays - 1)
    )

    previousPerformanceRows =
      clientPerformanceData.filter((row) => {
        if (
          performanceChannel !== '전체' &&
          row.channel !== performanceChannel
        ) {
          return false
        }

        if (!row.date) {
          return false
        }

        const rowDate =
          new Date(
            `${row.date}T00:00:00`
          )

        return (
          rowDate >= previousStartDate &&
          rowDate <= previousEndDate
        )
      })
  }

  const totalSpend =
    performanceRows.reduce(
      (sum, row) =>
        sum + Number(row.spend || 0),
      0
    )

  const totalRevenue =
    performanceRows.reduce(
      (sum, row) =>
        sum + Number(row.revenue || 0),
      0
    )

  const totalConversions =
    performanceRows.reduce(
      (sum, row) =>
        sum + Number(row.conversions || 0),
      0
    )

  const totalClicks =
    performanceRows.reduce(
      (sum, row) =>
        sum + Number(row.clicks || 0),
      0
    )

  const totalImpressions =
    performanceRows.reduce(
      (sum, row) =>
        sum + Number(row.impressions || 0),
      0
    )

  const roas =
    totalSpend > 0
      ? (
        totalRevenue /
        totalSpend *
        100
      )
      : 0

  const cpa =
    totalConversions > 0
      ? totalSpend /
      totalConversions
      : 0

  const ctr =
    totalImpressions > 0
      ? (
        totalClicks /
        totalImpressions *
        100
      )
      : 0

  const previousSpend =
    previousPerformanceRows.reduce(
      (sum, row) =>
        sum + Number(row.spend || 0),
      0
    )

  const previousRevenue =
    previousPerformanceRows.reduce(
      (sum, row) =>
        sum + Number(row.revenue || 0),
      0
    )

  const previousImpressions =
    previousPerformanceRows.reduce(
      (sum, row) =>
        sum +
        Number(row.impressions || 0),
      0
    )

  const previousClicks =
    previousPerformanceRows.reduce(
      (sum, row) =>
        sum + Number(row.clicks || 0),
      0
    )

  const previousConversions =
    previousPerformanceRows.reduce(
      (sum, row) =>
        sum +
        Number(row.conversions || 0),
      0
    )

  const previousRoas =
    previousSpend > 0
      ? (
        previousRevenue /
        previousSpend
      ) * 100
      : null

  const previousCpa =
    previousConversions > 0
      ? previousSpend /
      previousConversions
      : null

  const previousCtr =
    previousImpressions > 0
      ? (
        previousClicks /
        previousImpressions
      ) * 100
      : null

  function calculateChange(
    currentValue,
    previousValue
  ) {
    if (
      previousValue === null ||
      previousValue === undefined ||
      previousValue === 0
    ) {
      return null
    }

    return (
      (
        currentValue -
        previousValue
      ) /
      previousValue
    ) * 100
  }

  const spendChange =
    calculateChange(
      totalSpend,
      previousSpend
    )

  const revenueChange =
    calculateChange(
      totalRevenue,
      previousRevenue
    )

  const roasChange =
    calculateChange(
      roas,
      previousRoas
    )

  const cpaChange =
    calculateChange(
      cpa,
      previousCpa
    )

  const ctrChange =
    calculateChange(
      ctr,
      previousCtr
    )

  const channelSummary =
    Object.values(
      performanceRows.reduce(
        (acc, row) => {
          const channel =
            row.channel || 'Unknown'

          if (!acc[channel]) {
            acc[channel] = {
              channel,
              spend: 0,
              revenue: 0,
              conversions: 0,
            }
          }

          acc[channel].spend +=
            Number(row.spend || 0)

          acc[channel].revenue +=
            Number(row.revenue || 0)

          acc[channel].conversions +=
            Number(
              row.conversions || 0
            )

          return acc
        },
        {}
      )
    )

  const dailyPerformanceData =
    Object.values(
      performanceRows.reduce(
        (acc, row) => {
          const date = row.date

          if (!acc[date]) {
            acc[date] = {
              date,
              spend: 0,
              revenue: 0,
              conversions: 0,
            }
          }

          acc[date].spend +=
            Number(row.spend || 0)

          acc[date].revenue +=
            Number(row.revenue || 0)

          acc[date].conversions +=
            Number(
              row.conversions || 0
            )

          return acc
        },
        {}
      )
    ).sort(
      (a, b) =>
        new Date(
          `${a.date}T00:00:00`
        ) -
        new Date(
          `${b.date}T00:00:00`
        )
    )

  const dailyRoasData =
    dailyPerformanceData.map(
      (row) => ({
        ...row,

        roas:
          calculateRoas(
            row.revenue,
            row.spend
          ),
      })
    )

  const campaignSummary =
    Object.values(
      performanceRows.reduce(
        (acc, row) => {
          const campaign =
            row.campaign ||
            'Unknown Campaign'

          const key =
            `${row.channel}-${campaign}`

          if (!acc[key]) {
            acc[key] = {
              key,
              channel:
                row.channel || 'Unknown',
              campaign,
              spend: 0,
              revenue: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
            }
          }

          acc[key].spend +=
            Number(row.spend || 0)

          acc[key].revenue +=
            Number(row.revenue || 0)

          acc[key].impressions +=
            Number(
              row.impressions || 0
            )

          acc[key].clicks +=
            Number(row.clicks || 0)

          acc[key].conversions +=
            Number(
              row.conversions || 0
            )

          return acc
        },
        {}
      )
    )

  const sortedCampaignSummary =
    [...campaignSummary]
      .map((row) => {
        const roas =
          calculateRoas(
            row.revenue,
            row.spend
          )

        const cpa =
          row.conversions > 0
            ? row.spend /
            row.conversions
            : 0

        const ctr =
          row.impressions > 0
            ? (
              row.clicks /
              row.impressions
            ) * 100
            : 0

        return {
          ...row,
          roas,
          cpa,
          ctr,
        }
      })
      .sort((a, b) => {
        if (
          campaignSort === 'roas_desc'
        ) {
          return b.roas - a.roas
        }

        if (
          campaignSort === 'spend_desc'
        ) {
          return b.spend - a.spend
        }

        if (
          campaignSort === 'revenue_desc'
        ) {
          return b.revenue - a.revenue
        }

        if (
          campaignSort === 'cpa_asc'
        ) {
          return a.cpa - b.cpa
        }

        if (
          campaignSort === 'conversions_desc'
        ) {
          return (
            b.conversions -
            a.conversions
          )
        }

        return 0
      })

  const selectedCampaign =
    sortedCampaignSummary.find(
      (row) =>
        row.key === selectedCampaignKey
    ) || null

  const selectedCampaignDailyData =
    selectedCampaign
      ? Object.values(
        performanceRows
          .filter(
            (row) =>
              row.channel ===
              selectedCampaign.channel &&
              row.campaign ===
              selectedCampaign.campaign
          )
          .reduce(
            (acc, row) => {
              if (!acc[row.date]) {
                acc[row.date] = {
                  date: row.date,
                  spend: 0,
                  revenue: 0,
                  conversions: 0,
                }
              }

              acc[row.date].spend +=
                Number(row.spend || 0)

              acc[row.date].revenue +=
                Number(row.revenue || 0)

              acc[row.date].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      ).sort(
        (a, b) =>
          new Date(
            `${a.date}T00:00:00`
          ) -
          new Date(
            `${b.date}T00:00:00`
          )
      )
      : []

  const selectedCampaignContentData =
    selectedCampaign
      ? Object.values(
        performanceRows
          .filter(
            (row) =>
              row.channel ===
              selectedCampaign.channel &&
              row.campaign ===
              selectedCampaign.campaign
          )
          .reduce(
            (acc, row) => {
              const content =
                row.content ||
                'Unknown Content'

              if (!acc[content]) {
                acc[content] = {
                  content,
                  spend: 0,
                  revenue: 0,
                  impressions: 0,
                  clicks: 0,
                  conversions: 0,
                }
              }

              acc[content].spend +=
                Number(row.spend || 0)

              acc[content].revenue +=
                Number(row.revenue || 0)

              acc[content].impressions +=
                Number(
                  row.impressions || 0
                )

              acc[content].clicks +=
                Number(row.clicks || 0)

              acc[content].conversions +=
                Number(
                  row.conversions || 0
                )

              return acc
            },
            {}
          )
      )
        .map((row) => ({
          ...row,

          roas:
            calculateRoas(
              row.revenue,
              row.spend
            ),

          cpa:
            calculateCpa(
              row.spend,
              row.conversions
            ),

          ctr:
            calculateCtr(
              row.clicks,
              row.impressions
            ),
        }))
        .sort(
          (a, b) =>
            b.roas - a.roas
        )
      : []

  function PerformanceChange({
    value,
    inverse = false,
  }) {
    if (value === null) {
      return (
        <span className="performance-change neutral">
          비교 데이터 없음
        </span>
      )
    }

    const isPositive =
      inverse
        ? value < 0
        : value > 0

    const isNegative =
      inverse
        ? value > 0
        : value < 0

    return (
      <span
        className={
          `performance-change ${isPositive
            ? 'positive'
            : isNegative
              ? 'negative'
              : 'neutral'
          }`
        }
      >
        {value > 0
          ? '▲'
          : value < 0
            ? '▼'
            : '—'}

        {' '}

        {Math.abs(value).toFixed(1)}%
      </span>
    )
  }

  const bestRoasCampaign =
    [...sortedCampaignSummary]
      .sort(
        (a, b) =>
          b.roas - a.roas
      )[0] || null

  const bestRevenueCampaign =
    [...sortedCampaignSummary]
      .sort(
        (a, b) =>
          b.revenue - a.revenue
      )[0] || null

  const bestCpaCampaign =
    [...sortedCampaignSummary]
      .filter(
        (row) =>
          row.conversions > 0
      )
      .sort(
        (a, b) =>
          a.cpa - b.cpa
      )[0] || null

  const improvementCampaign =
    [...sortedCampaignSummary]
      .filter(
        (row) =>
          row.spend > 0
      )
      .sort(
        (a, b) =>
          a.roas - b.roas
      )[0] || null

  function getRoasInsight(row) {
    if (!row) {
      return '분석할 데이터가 없습니다.'
    }

    return `${row.channel}의 ${row.campaign} 캠페인이 가장 높은 광고 효율을 기록했습니다.`
  }

  function getRevenueInsight(row) {
    if (!row) {
      return '분석할 데이터가 없습니다.'
    }

    return `${row.channel}의 ${row.campaign} 캠페인이 선택 기간 내 가장 많은 매출을 만들었습니다.`
  }

  function getCpaInsight(row) {
    if (!row) {
      return '분석할 데이터가 없습니다.'
    }

    return `${row.channel}의 ${row.campaign} 캠페인이 가장 낮은 전환당 비용을 기록했습니다.`
  }

  function getImprovementInsight(row) {
    if (!row) {
      return '분석할 데이터가 없습니다.'
    }

    return `${row.channel}의 ${row.campaign} 캠페인은 현재 ROAS가 가장 낮아 예산 또는 소재 점검이 필요합니다.`
  }

  return (
    <div className="client-portal-page">
      <ClientPortalHeader
        activePage="performance"
      />

      <main className="client-portal-content">
        <section className="client-portal-welcome">
          <div>
            <h2>
              {clientBrand
                ? `${clientBrand} 성과 분석`
                : '성과 분석'}
            </h2>

            <p>
              광고 성과를 매체와 캠페인 기준으로
              확인할 수 있습니다.
            </p>
          </div>
        </section>

        <section className="client-performance-filters">
          <div>
            <label>
              기간
            </label>

            <select
              value={performancePeriod}
              onChange={(event) =>
                setPerformancePeriod(
                  event.target.value
                )
              }
            >
              <option value="7d">
                최근 7일
              </option>

              <option value="30d">
                최근 30일
              </option>

              <option value="90d">
                최근 90일
              </option>

              <option value="all">
                전체 기간
              </option>
            </select>
          </div>

          <div>
            <label>
              매체
            </label>

            <select
              value={performanceChannel}
              onChange={(event) =>
                setPerformanceChannel(
                  event.target.value
                )
              }
            >
              <option value="전체">
                전체 매체
              </option>

              {[
                ...new Set(
                  mockAds.map(
                    (row) =>
                      row.channel
                  )
                ),
              ].map((channel) => (
                <option
                  key={channel}
                  value={channel}
                >
                  {channel}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="client-dashboard-metrics">
          <div>
            <span>광고비</span>
            <strong>
              {Math.round(
                totalSpend
              ).toLocaleString()}
              원
            </strong>
            <PerformanceChange
              value={spendChange}
            />
          </div>

          <div>
            <span>매출</span>
            <strong>
              {Math.round(
                totalRevenue
              ).toLocaleString()}
              원
            </strong>
            <PerformanceChange
              value={revenueChange}
            />
          </div>

          <div>
            <span>ROAS</span>
            <strong>
              {roas.toFixed(1)}%
            </strong>
            <PerformanceChange
              value={roasChange}
            />
          </div>

          <div>
            <span>CPA</span>
            <strong>
              {Math.round(
                cpa
              ).toLocaleString()}
              원
            </strong>
            <PerformanceChange
              value={cpaChange}
              inverse
            />
          </div>

          <div>
            <span>CTR</span>
            <strong>
              {ctr.toFixed(2)}%
            </strong>
            <PerformanceChange
              value={ctrChange}
            />
          </div>
        </section>

        <section className="client-performance-insights">
          <div className="client-performance-insights-header">
            <div>
              <h3>성과 인사이트</h3>

              <span>
                선택한 기간과 매체 기준
              </span>
            </div>
          </div>

          <div className="client-performance-insight-grid">

            <div className="client-performance-insight-card">
              <span>
                최고 ROAS
              </span>

              <strong>
                {bestRoasCampaign
                  ? `${bestRoasCampaign.channel} · ${bestRoasCampaign.campaign}`
                  : '-'}
              </strong>

              <p>
                {bestRoasCampaign
                  ? `ROAS ${bestRoasCampaign.roas.toFixed(1)}%`
                  : '데이터 없음'}
              </p>
              <small>
                {getRoasInsight(
                  bestRoasCampaign
                )}
              </small>
            </div>


            <div className="client-performance-insight-card">
              <span>
                최고 매출
              </span>

              <strong>
                {bestRevenueCampaign
                  ? `${bestRevenueCampaign.channel} · ${bestRevenueCampaign.campaign}`
                  : '-'}
              </strong>

              <p>
                {bestRevenueCampaign
                  ? `매출 ${Math.round(
                    bestRevenueCampaign.revenue
                  ).toLocaleString()}원`
                  : '데이터 없음'}
              </p>
              <small>
                {getRevenueInsight(
                  bestRevenueCampaign
                )}
              </small>
            </div>


            <div className="client-performance-insight-card">
              <span>
                최저 CPA
              </span>

              <strong>
                {bestCpaCampaign
                  ? `${bestCpaCampaign.channel} · ${bestCpaCampaign.campaign}`
                  : '-'}
              </strong>

              <p>
                {bestCpaCampaign
                  ? `CPA ${Math.round(
                    bestCpaCampaign.cpa
                  ).toLocaleString()}원`
                  : '데이터 없음'}
              </p>
              <small>
                {getCpaInsight(
                  bestCpaCampaign
                )}
              </small>
            </div>


            <div className="client-performance-insight-card">
              <span>
                개선 필요
              </span>

              <strong>
                {improvementCampaign
                  ? `${improvementCampaign.channel} · ${improvementCampaign.campaign}`
                  : '-'}
              </strong>

              <p>
                {improvementCampaign
                  ? `ROAS ${improvementCampaign.roas.toFixed(1)}%`
                  : '데이터 없음'}
              </p>
              <small>
                {getImprovementInsight(
                  improvementCampaign
                )}
              </small>
            </div>

          </div>
        </section>

        <section className="client-performance-section">
          <div className="client-dashboard-card-header">
            <div>
              <h3>
                광고비 · 매출 추이
              </h3>

              <span>
                선택한 기간과 매체 기준
              </span>
            </div>
          </div>

          <div className="client-performance-chart">
            {dailyPerformanceData.length === 0 ? (
              <div className="client-proposal-empty">
                표시할 성과 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={320}
              >
                <LineChart
                  data={dailyPerformanceData}
                  margin={{
                    top: 10,
                    right: 20,
                    left: 10,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) =>
                      value.slice(5)
                    }
                  />

                  <YAxis
                    tickFormatter={(value) =>
                      `${Math.round(
                        value / 1000000
                      )}M`
                    }
                  />

                  <Tooltip
                    formatter={(value) =>
                      `${Math.round(
                        value
                      ).toLocaleString()}원`
                    }
                  />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="spend"
                    name="광고비"
                    stroke="#64748b"
                    strokeWidth={2}
                    dot={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="매출"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="client-performance-section">
          <div className="client-dashboard-card-header">
            <div>
              <h3>
                ROAS 추이
              </h3>

              <span>
                일별 광고비 대비 매출 효율
              </span>
            </div>
          </div>

          <div className="client-performance-chart">
            {dailyRoasData.length === 0 ? (
              <div className="client-proposal-empty">
                표시할 성과 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={260}
              >
                <LineChart
                  data={dailyRoasData}
                  margin={{
                    top: 10,
                    right: 20,
                    left: 10,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) =>
                      value.slice(5)
                    }
                  />

                  <YAxis
                    tickFormatter={(value) =>
                      `${Math.round(value)}%`
                    }
                  />

                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(1)}%`,
                      'ROAS',
                    ]}
                  />

                  <Line
                    type="monotone"
                    dataKey="roas"
                    name="ROAS"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="client-performance-section">
          <div className="client-dashboard-card-header">
            <h3>매체별 성과</h3>
          </div>

          <div className="client-performance-table-wrap">
            <table className="client-performance-table">
              <thead>
                <tr>
                  <th>매체</th>
                  <th>광고비</th>
                  <th>매출</th>
                  <th>ROAS</th>
                  <th>전환</th>
                </tr>
              </thead>

              <tbody>
                {channelSummary.map(
                  (row) => {
                    const channelRoas =
                      row.spend > 0
                        ? row.revenue /
                        row.spend *
                        100
                        : 0

                    return (
                      <tr key={row.channel}>
                        <td>
                          {row.channel}
                        </td>

                        <td>
                          {Math.round(
                            row.spend
                          ).toLocaleString()}
                          원
                        </td>

                        <td>
                          {Math.round(
                            row.revenue
                          ).toLocaleString()}
                          원
                        </td>

                        <td>
                          {channelRoas.toFixed(
                            1
                          )}
                          %
                        </td>

                        <td>
                          {row.conversions.toLocaleString()}
                        </td>
                      </tr>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="client-performance-section">
          <div className="client-dashboard-card-header">
            <div>
              <h3>캠페인별 성과</h3>

              <span>
                선택한 기간과 매체 기준
              </span>
            </div>

            <select
              className="client-performance-sort"
              value={campaignSort}
              onChange={(event) =>
                setCampaignSort(
                  event.target.value
                )
              }
            >
              <option value="roas_desc">
                ROAS 높은 순
              </option>

              <option value="spend_desc">
                광고비 높은 순
              </option>

              <option value="revenue_desc">
                매출 높은 순
              </option>

              <option value="cpa_asc">
                CPA 낮은 순
              </option>

              <option value="conversions_desc">
                전환 높은 순
              </option>
            </select>
          </div>

          <div className="client-performance-table-wrap">
            <table className="client-performance-table">
              <thead>
                <tr>
                  <th>매체</th>
                  <th>캠페인</th>
                  <th>광고비</th>
                  <th>매출</th>
                  <th>ROAS</th>
                  <th>CPA</th>
                  <th>CTR</th>
                  <th>전환</th>
                </tr>
              </thead>

              <tbody>
                {sortedCampaignSummary.map(
                  (row) => {
                    const campaignRoas =
                      row.spend > 0
                        ? (
                          row.revenue /
                          row.spend
                        ) * 100
                        : 0

                    const campaignCpa =
                      row.conversions > 0
                        ? row.spend /
                        row.conversions
                        : 0

                    const campaignCtr =
                      row.impressions > 0
                        ? (
                          row.clicks /
                          row.impressions
                        ) * 100
                        : 0

                    return (
                      <tr
                        key={row.key}
                        className={
                          selectedCampaignKey === row.key
                            ? 'client-performance-row selected'
                            : 'client-performance-row'
                        }
                        onClick={() =>
                          setSelectedCampaignKey(
                            row.key
                          )
                        }
                      >
                        <td>
                          {row.channel}
                        </td>

                        <td>
                          {row.campaign}
                        </td>

                        <td>
                          {Math.round(
                            row.spend
                          ).toLocaleString()}
                          원
                        </td>

                        <td>
                          {Math.round(
                            row.revenue
                          ).toLocaleString()}
                          원
                        </td>

                        <td>
                          {campaignRoas.toFixed(
                            1
                          )}
                          %
                        </td>

                        <td>
                          {Math.round(
                            campaignCpa
                          ).toLocaleString()}
                          원
                        </td>

                        <td>
                          {campaignCtr.toFixed(
                            2
                          )}
                          %
                        </td>

                        <td>
                          {row.conversions.toLocaleString()}
                        </td>
                      </tr>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedCampaign && (
          <section className="client-performance-section">
            <div className="client-dashboard-card-header">
              <div>
                <h3>
                  캠페인 상세
                </h3>

                <span>
                  {selectedCampaign.channel}
                  {' · '}
                  {selectedCampaign.campaign}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedCampaignKey(null)
                }
              >
                닫기
              </button>
            </div>

            <div className="client-campaign-detail-metrics">
              <div>
                <span>광고비</span>
                <strong>
                  {Math.round(
                    selectedCampaign.spend
                  ).toLocaleString()}
                  원
                </strong>
              </div>

              <div>
                <span>매출</span>
                <strong>
                  {Math.round(
                    selectedCampaign.revenue
                  ).toLocaleString()}
                  원
                </strong>
              </div>

              <div>
                <span>ROAS</span>
                <strong>
                  {selectedCampaign.roas.toFixed(1)}
                  %
                </strong>
              </div>

              <div>
                <span>CPA</span>
                <strong>
                  {Math.round(
                    selectedCampaign.cpa
                  ).toLocaleString()}
                  원
                </strong>
              </div>

              <div>
                <span>CTR</span>
                <strong>
                  {selectedCampaign.ctr.toFixed(2)}
                  %
                </strong>
              </div>

              <div>
                <span>전환</span>
                <strong>
                  {selectedCampaign.conversions.toLocaleString()}
                </strong>
              </div>
            </div>

            <div className="client-performance-chart">
              <ResponsiveContainer
                width="100%"
                height={280}
              >
                <LineChart
                  data={selectedCampaignDailyData}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) =>
                      value.slice(5)
                    }
                  />

                  <YAxis />

                  <Tooltip />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="spend"
                    name="광고비"
                    dot={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="매출"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="client-campaign-content-section">
              <div className="client-dashboard-card-header">
                <div>
                  <h3>소재별 성과</h3>

                  <span>
                    ROAS 높은 순
                  </span>
                </div>
              </div>

              {selectedCampaignContentData.length === 0 ? (
                <div className="client-proposal-empty">
                  소재 성과 데이터가 없습니다.
                </div>
              ) : (
                <div className="client-performance-table-wrap">
                  <table className="client-performance-table">
                    <thead>
                      <tr>
                        <th>소재</th>
                        <th>광고비</th>
                        <th>매출</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CTR</th>
                        <th>전환</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedCampaignContentData.map(
                        (row) => (
                          <tr key={row.content}>
                            <td>
                              {row.content}
                            </td>

                            <td>
                              {Math.round(
                                row.spend
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {Math.round(
                                row.revenue
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {row.roas.toFixed(1)}%
                            </td>

                            <td>
                              {Math.round(
                                row.cpa
                              ).toLocaleString()}
                              원
                            </td>

                            <td>
                              {row.ctr.toFixed(2)}%
                            </td>

                            <td>
                              {row.conversions.toLocaleString()}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>




    </div>
  )
}

function OperatorSignupPage() {
  const [name, setName] =
    useState('')

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [
    passwordConfirm,
    setPasswordConfirm,
  ] = useState('')

  const [
    signupError,
    setSignupError,
  ] = useState('')

  const [
    isSigningUp,
    setIsSigningUp,
  ] = useState(false)

  async function handleOperatorSignup() {
    if (!email.trim() || !password) {
      setSignupError(
        '이메일과 비밀번호를 입력해주세요.'
      )
      return
    }

    if (password.length < 8) {
      setSignupError(
        '비밀번호는 8자 이상이어야 합니다.'
      )
      return
    }

    if (
      password !== passwordConfirm
    ) {
      setSignupError(
        '비밀번호가 일치하지 않습니다.'
      )
      return
    }

    setIsSigningUp(true)
    setSignupError('')

    try {
      const response = await fetch(
        `${API_BASE_URL}/operator-auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            name:
              name.trim() || null,
            email:
              email.trim(),
            password,
          }),
        }
      )

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (result.status !== 'ok') {
        setSignupError(
          result.message ||
          '회원가입에 실패했습니다.'
        )
        return
      }

      window.location.href =
        '/operator/login'
    } catch (error) {
      console.error(
        'OPERATOR SIGNUP FAILED',
        error
      )

      setSignupError(
        '회원가입 중 오류가 발생했습니다.'
      )
    } finally {
      setIsSigningUp(false)
    }
  }

  return (
    <div className="client-login-page">
      <div className="client-login-card">

        <div className="client-login-brand">
          <h1>AdScope</h1>
          <span>Operator Portal</span>
        </div>

        <div className="client-login-heading">
          <h2>
            광고 운영자 로그인
          </h2>

          <p>
            광고 성과와 최적화 대시보드를 확인하려면
            로그인해주세요.
          </p>
        </div>

        <form
          className="client-login-form"
          onSubmit={(event) => {
            event.preventDefault()
            handleOperatorLogin()
          }}
        >
          <label>
            이메일
          </label>

          <input
            type="email"
            value={email}
            placeholder="operator@example.com"
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
            required
          />

          <label>
            비밀번호
          </label>

          <input
            type="password"
            value={password}
            placeholder="비밀번호를 입력하세요"
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            required
          />

          {loginError && (
            <div className="operator-login-error">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
          >
            {isLoggingIn
              ? '로그인 중...'
              : '로그인'}
          </button>
        </form>

        <p className="client-login-help">
          운영자 계정이 없나요?

          <button
            type="button"
            className="operator-signup-text-button"
            onClick={() => {
              window.location.href =
                '/operator/signup'
            }}
          >
            회원가입
          </button>
        </p>

      </div>
    </div>
  )
}

function OperatorLoginPage() {
  const [
    email,
    setEmail,
  ] = useState('')

  const [
    password,
    setPassword,
  ] = useState('')

  const [
    loginError,
    setLoginError,
  ] = useState('')

  const [
    isLoggingIn,
    setIsLoggingIn,
  ] = useState(false)

  async function handleOperatorLogin() {
    if (!email.trim() || !password) {
      setLoginError(
        '이메일과 비밀번호를 입력해주세요.'
      )
      return
    }

    setIsLoggingIn(true)
    setLoginError('')

    try {
      const response = await fetch(
        `${API_BASE_URL}/operator-auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        }
      )

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      const result =
        await response.json()

      if (
        result.status !==
        'authenticated' ||
        !result.accessToken
      ) {
        setLoginError(
          result.message ||
          '로그인에 실패했습니다.'
        )
        return
      }

      localStorage.setItem(
        'adscope_operator_access_token',
        result.accessToken
      )

      localStorage.setItem(
        'adscope_operator_user',
        JSON.stringify(
          result.user || {}
        )
      )

      window.location.href = '/'
    } catch (error) {
      console.error(
        'OPERATOR LOGIN FAILED',
        error
      )

      setLoginError(
        '로그인 중 오류가 발생했습니다.'
      )
    } finally {
      setIsLoggingIn(false)
    }
  }

  return (
    <div className="client-login-page">
      <div className="client-login-card">

        <div className="client-login-brand">
          <h1>AdScope</h1>
          <span>Operator Portal</span>
        </div>

        <div className="client-login-heading">
          <h2>
            광고 운영자 로그인
          </h2>

          <p>
            광고 성과와 최적화 대시보드를 확인하려면
            로그인해주세요.
          </p>
        </div>

        <form
          className="client-login-form"
          onSubmit={(event) => {
            event.preventDefault()
            handleOperatorLogin()
          }}
        >
          <label>
            이메일
          </label>

          <input
            type="email"
            value={email}
            placeholder="operator@example.com"
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
            required
          />

          <label>
            비밀번호
          </label>

          <input
            type="password"
            value={password}
            placeholder="비밀번호를 입력하세요"
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            required
          />

          {loginError && (
            <div className="operator-login-error">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
          >
            {isLoggingIn
              ? '로그인 중...'
              : '로그인'}
          </button>
        </form>

        <p className="client-login-help">
          계정이 없나요?

          <button
            type="button"
            className="operator-signup-link"
            onClick={() => {
              window.location.href =
                '/operator/signup'
            }}
          >
            회원가입
          </button>
        </p>

      </div>
    </div>
  )
}

function OperatorProtectedApp() {
  const [
    authStatus,
    setAuthStatus,
  ] = useState('checking')

  useEffect(() => {
    async function verifyOperator() {
      const token =
        localStorage.getItem(
          'adscope_operator_access_token'
        )

      if (!token) {
        window.location.href =
          '/operator/login'
        return
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/operator-auth/me`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        )

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          )
        }

        const result =
          await response.json()

        if (
          result.status !==
          'authenticated'
        ) {
          localStorage.removeItem(
            'adscope_operator_access_token'
          )

          localStorage.removeItem(
            'adscope_operator_user'
          )


          window.location.href =
            '/operator/login'

          return
        }

        localStorage.setItem(
          'adscope_operator_user',
          JSON.stringify(
            result.user || {}
          )
        )

        setAuthStatus(
          'authenticated'
        )
      } catch (error) {
        console.error(
          'OPERATOR AUTH CHECK FAILED',
          error
        )

        localStorage.removeItem(
          'adscope_operator_access_token'
        )

        localStorage.removeItem(
          'adscope_operator_user'
        )

        window.location.href =
          '/operator/login'
      }
    }

    verifyOperator()
  }, [])

  if (
    authStatus === 'checking'
  ) {
    return (
      <div className="operator-auth-loading">
        로그인 확인 중...
      </div>
    )
  }

  return <InternalApp />
}



function App() {
  const currentPath =
    window.location.pathname

  if (
    currentPath ===
    '/operator/signup'
  ) {
    return <OperatorSignupPage />
  }

  if (
    currentPath === '/operator/login'
  ) {
    return <OperatorLoginPage />
  }


  if (currentPath === '/client/login') {
    return <ClientLoginPage />
  }

  if (currentPath === '/client/dashboard') {
    return <ClientDashboardPage />
  }

  if (currentPath === '/client/proposals') {
    return <ClientProposalsPage />
  }

  if (currentPath === '/client/messages') {
    return <ClientMessagesPage />
  }

  if (currentPath === '/client/performance') {
    return <ClientPerformancePage />
  }

  return <OperatorProtectedApp />
}

export default App