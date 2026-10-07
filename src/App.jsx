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
  value,
  language = 'ko'
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
    language === 'en'
      ? 'en-US'
      : 'ko-KR',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: language === 'en',
    }
  ).format(date)
}


function getAnomalyGuidance(
  alert,
  t
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

  let guidanceKey = 'default'

  if (
    reasonCode ===
    'TRACKING_CONVERSION_ZERO'
  ) {
    guidanceKey =
      'trackingConversionZero'
  } else if (
    reasonCode ===
    'TRACKING_REVENUE_ZERO'
  ) {
    guidanceKey =
      'trackingRevenueZero'
  } else if (
    metric === 'cpa' &&
    direction === 'increase'
  ) {
    guidanceKey = 'cpaIncrease'
  } else if (
    metric === 'roas' &&
    direction === 'decrease'
  ) {
    guidanceKey = 'roasDecrease'
  } else if (
    metric === 'cvr' &&
    direction === 'decrease'
  ) {
    guidanceKey = 'cvrDecrease'
  } else if (
    metric === 'ctr' &&
    direction === 'decrease'
  ) {
    guidanceKey = 'ctrDecrease'
  } else if (
    metric === 'cpc' &&
    direction === 'increase'
  ) {
    guidanceKey = 'cpcIncrease'
  } else if (
    metric === 'revenue' &&
    direction === 'decrease'
  ) {
    guidanceKey = 'revenueDecrease'
  } else if (
    metric === 'conversions' &&
    direction === 'decrease'
  ) {
    guidanceKey =
      'conversionsDecrease'
  }

  return {
    possibleCauses: t(
      `operator.alerts.guidance.${guidanceKey}.possibleCauses`,
      { returnObjects: true }
    ),
    actions: t(
      `operator.alerts.guidance.${guidanceKey}.actions`,
      { returnObjects: true }
    ),
  }
}


function getAnomalyDisplayMessage(
  alert,
  t,
  language,
  metricLabel
) {
  if (
    language !== 'en' &&
    alert?.message
  ) {
    return alert.message
  }

  const reasonCode =
    String(
      alert?.reasonCode || ''
    )

  if (
    reasonCode ===
    'TRACKING_CONVERSION_ZERO'
  ) {
    return t(
      'operator.alerts.messages.trackingConversionZero'
    )
  }

  if (
    reasonCode ===
    'TRACKING_REVENUE_ZERO'
  ) {
    return t(
      'operator.alerts.messages.trackingRevenueZero'
    )
  }

  const changePct =
    Number(
      alert?.changePct ?? 0
    ).toFixed(1)

  if (alert?.direction === 'increase') {
    return t(
      'operator.alerts.messages.increase',
      { metric: metricLabel, changePct }
    )
  }

  if (alert?.direction === 'decrease') {
    return t(
      'operator.alerts.messages.decrease',
      { metric: metricLabel, changePct }
    )
  }

  return t(
    'operator.alerts.messages.changed',
    { metric: metricLabel, changePct }
  )
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
  const { t, i18n } =
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
          i18n.language === 'en'
            ? t('client.login.failed')
            : result.message ||
              t('client.login.failed')
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
        t('client.login.error')
      )
    }
  }

  return (
    <div className="client-login-page">
      <div className="client-login-card">

        <div className="client-auth-topbar">
          <div className="client-login-brand">
            <h1>AdScope</h1>
            <span>Client Portal</span>
          </div>

          <div
            className="client-auth-language-switcher"
            aria-label={t('client.login.language')}
          >
            <button
              type="button"
              className={
                i18n.language === 'ko'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                i18n.changeLanguage('ko')
              }
            >
              KO
            </button>

            <span>/</span>

            <button
              type="button"
              className={
                i18n.language === 'en'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                i18n.changeLanguage('en')
              }
            >
              EN
            </button>
          </div>
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
            KO
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
            EN
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
  const { t, i18n } =
    useTranslation()

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
                ? t('client.dashboard.brandTitle', {
                  brand: clientBrand,
                })
                : t('client.dashboard.title')}
            </h2>

            <p>
              {clientName
                ? t('client.dashboard.welcomeName', {
                  name: clientName,
                })
                : t('client.dashboard.welcome')}
            </p>
          </div>
        </section>

        <section className="client-dashboard-metrics">
          <div>
            <span>{t('client.dashboard.totalSpend')}</span>
            <strong>311,111,111{t('client.common.currency')}</strong>
          </div>

          <div>
            <span>{t('client.dashboard.revenue')}</span>
            <strong>1,634,238,991{t('client.common.currency')}</strong>
          </div>

          <div>
            <span>ROAS</span>
            <strong>525.3%</strong>
          </div>

          <div>
            <span>CPA</span>
            <strong>2,923{t('client.common.currency')}</strong>
          </div>
        </section>

        <section className="client-dashboard-grid">
          <div className="client-dashboard-card">
            <div className="client-dashboard-card-header">
              <h3>{t('client.dashboard.recentProposal')}</h3>
              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    '/client/proposals'
                }}
              >
                {t('common.viewAll')}
              </button>
            </div>

            {clientProposalsLoading ? (
              <div className="client-dashboard-item">
                <span>
                  {t('client.dashboard.proposalLoading')}
                </span>
              </div>
            ) : latestProposal ? (
              <div className="client-dashboard-item">
                <div>
                  <strong>
                    {latestProposal.scenarioName ||
                      t('client.common.defaultProposalTitle')}
                  </strong>

                  <span>
                    {latestProposal.status === 'reviewing'
                      ? t('client.dashboard.statusDescription.reviewing')
                      : latestProposal.status === 'revision_requested'
                        ? t('client.dashboard.statusDescription.revisionRequested')
                        : latestProposal.status === 'approved'
                          ? t('client.dashboard.statusDescription.approved')
                          : t('client.dashboard.statusDescription.other')}
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
                  {t('client.dashboard.viewProposal')}
                </button>
              </div>
            ) : (
              <div className="client-dashboard-item">
                <span>
                  {t('client.dashboard.noProposal')}
                </span>
              </div>
            )}
          </div>

          <div className="client-dashboard-card">
            <div className="client-dashboard-card-header">
              <h3>{t('client.dashboard.recentMessage')}</h3>
              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    '/client/messages'
                }}
              >
                {t('common.viewAll')}
              </button>
            </div>

            <div className="client-dashboard-item">
              <div>
                <strong>
                  {t('client.dashboard.accountManager')}
                </strong>

                <span>
                  {t('client.dashboard.newProposalMessage')}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    '/client/messages'
                }}
              >
                {t('client.dashboard.viewMessage')}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function ClientProposalsPage() {
  const { t, i18n } = useTranslation()

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

  const clientLocale =
    i18n.language === 'en'
      ? 'en-US'
      : 'ko-KR'

  const formatClientMoney = (value) =>
    `${Math.round(
      Number(value) || 0
    ).toLocaleString(clientLocale)}${t(
      'client.common.currency'
    )}`

  const formatClientDateTime = (value) =>
    value
      ? new Date(value).toLocaleString(
        clientLocale
      )
      : '-'

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
              {t('client.proposals.title')}
            </h2>

            <p>
              {t('client.proposals.description')}
            </p>
          </div>
        </section>

        {loading ? (
          <div className="client-proposal-empty">
            {t('client.proposals.loading')}
          </div>
        ) : clientProposals.length === 0 ? (
          <div className="client-proposal-empty">
            {t('client.proposals.empty')}
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
                          t('client.common.defaultProposalTitle')}
                      </strong>

                      <span>
                        {formatClientDateTime(
                          proposal.updatedAt
                        )}
                      </span>
                    </div>

                    <span className="client-proposal-status">
                      {t(
                        `proposalStatus.${proposal.status}`,
                        {
                          defaultValue:
                            t('proposalStatus.preparing'),
                        }
                      )}
                    </span>
                  </div>

                  <div className="client-proposal-list-metrics">
                    <div>
                      <span>
                        {t('client.proposals.totalBudget')}
                      </span>
                      <strong>
                        {formatClientMoney(
                          proposal.totalBudget || 0
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        {t('client.proposals.projectedRevenue')}
                      </span>
                      <strong>
                        {formatClientMoney(
                          proposal.summary
                            ?.projectedRevenue || 0
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        {t('client.proposals.projectedRoas')}
                      </span>
                      <strong>
                        {Number(
                          proposal.summary
                            ?.projectedRoas || 0
                        ).toFixed(1)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>
                        {t('client.proposals.projectedCpa')}
                      </span>
                      <strong>
                        {proposal.summary
                          ?.projectedCpa != null
                          ? formatClientMoney(
                            proposal.summary.projectedCpa
                          )
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
                      {t('client.proposals.viewProposal')}
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
  const { t, i18n } =
    useTranslation()

  const getTranslatedFieldLabel = (key) =>
    t(`fields.${key}`, {
      defaultValue: getLabel(key),
    })

  const formatLocalizedDisplayValue = (
    value,
    format = 'auto',
    metric = null
  ) => {
    if (i18n.language !== 'en') {
      return formatDisplayValue(
        value,
        format,
        metric
      )
    }

    const number = Number(value) || 0

    if (format === 'full') {
      return number.toLocaleString('en-US')
    }

    if (format === 'compact') {
      return new Intl.NumberFormat(
        'en-US',
        {
          notation: 'compact',
          maximumFractionDigits: 1,
        }
      ).format(number)
    }

    if (format === 'currency') {
      return `${Math.round(number).toLocaleString('en-US')} KRW`
    }

    if (format === 'percent') {
      return `${number.toFixed(2)}%`
    }

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
      return `${Math.round(number).toLocaleString('en-US')} KRW`
    }

    return number.toLocaleString('en-US')
  }

  const getChartTypeLabel = (type) =>
    t(`operator.dashboard.chartTypes.${type}`, {
      defaultValue: type,
    })

  const getBudgetRecommendationLabel = (value) => {
    if (value === '증액') return t('operator.budget.dynamic.recommendationIncrease')
    if (value === '감액') return t('operator.budget.dynamic.recommendationDecrease')
    if (value === '유지') return t('operator.budget.dynamic.recommendationHold')
    return value
  }

  const getBudgetRiskLevelLabel = (value) => {
    if (value === 'low') return t('operator.budget.risk.low')
    if (value === 'high') return t('operator.budget.risk.high')
    return t('operator.budget.risk.medium')
  }

  const getBudgetScalingLabel = (value) => {
    if (value === '분석 대기') return t('operator.budget.common.analysisWaiting')
    if (value === '현재 수준') return t('operator.budget.scaling.currentLevel')
    if (value === '범위 내 미감지') return t('operator.budget.scaling.notDetectedWithinRange')
    return value
  }

  const getTaskStatusLabel = (value) => {
    const statusKeyMap = {
      waiting: 'waiting',
      in_progress: 'inProgress',
      reviewing: 'reviewing',
      done: 'done',
    }

    return t(
      `operator.tasks.status.${statusKeyMap[value] || 'waiting'}`
    )
  }

  const getTaskPriorityLabel = (value) => {
    const priorityKeyMap = {
      low: 'low',
      normal: 'normal',
      high: 'high',
      urgent: 'urgent',
    }

    return t(
      `operator.tasks.priority.${priorityKeyMap[value] || 'normal'}`
    )
  }

  const buildAutoChartTitle = (dimensionKey, metricKeys = []) => {
    if (!dimensionKey) {
      return metricKeys.length > 0
        ? getTranslatedFieldLabel(metricKeys[0])
        : t('operator.dashboard.preview.emptyTitle')
    }

    return t('operator.dashboard.preview.autoTitle', {
      dimension: getTranslatedFieldLabel(dimensionKey),
      metrics: metricKeys
        .map(getTranslatedFieldLabel)
        .join(', '),
    })
  }


  const getPerformanceDiagnosisStatus = (status) => {
    const keyMap = {
      '효율 우수': 'excellent',
      '양호': 'normal',
      '점검 필요': 'needsReview',
    }

    const key = keyMap[status]

    return key
      ? t(`operator.performance.diagnosis.status.${key}`)
      : status
  }

  const getPerformanceDiagnosisReason = (reason) => {
    const keyMap = {
      '전반적으로 평균 수준의 성과입니다.': 'average',
      'ROAS가 높고 CPA가 낮으며, 매출 기여도가 광고비 비중 이상입니다.': 'efficient',
      'ROAS가 낮고 CPA가 높으며, 매출 기여도가 광고비 비중보다 낮습니다.': 'needsReview',
      'ROAS가 전체 매체 평균보다 낮습니다.': 'roasBelowChannelAverage',
      'CPA가 전체 매체 평균보다 높습니다.': 'cpaAboveChannelAverage',
      'ROAS가 캠페인 평균보다 낮습니다.': 'roasBelowCampaignAverage',
      'CPA가 캠페인 평균보다 높습니다.': 'cpaAboveCampaignAverage',
      'ROAS가 제품 평균보다 낮습니다.': 'roasBelowProductAverage',
      'CPA가 제품 평균보다 높습니다.': 'cpaAboveProductAverage',
      'ROAS가 콘텐츠 평균보다 낮습니다.': 'roasBelowContentAverage',
      'CPA가 콘텐츠 평균보다 높습니다.': 'cpaAboveContentAverage',
      '매출 기여도가 광고비 비중보다 낮습니다.': 'revenueShareBelowSpendShare',
    }

    const key = keyMap[reason]

    return key
      ? t(`operator.performance.diagnosis.reason.${key}`)
      : reason
  }

  const getPerformanceAlertMessage = (alert) => {
    const change = Math.abs(
      Number(alert?.change || 0)
    ).toFixed(1)

    const values = {
      name: alert?.name || alert?.channel || '-',
      change,
    }

    if (
      alert?.metric === 'ROAS' &&
      alert?.type === 'warning'
    ) {
      return t(
        'operator.performance.alerts.roasDown',
        values
      )
    }

    if (
      alert?.metric === 'CPA' &&
      alert?.type === 'warning'
    ) {
      return t(
        'operator.performance.alerts.cpaUp',
        values
      )
    }

    if (
      alert?.metric === 'ROAS' &&
      alert?.type === 'positive'
    ) {
      return t(
        'operator.performance.alerts.roasUp',
        values
      )
    }

    if (
      alert?.metric === '전환' &&
      alert?.type === 'positive'
    ) {
      return t(
        'operator.performance.alerts.conversionsUp',
        values
      )
    }

    return alert?.message || ''
  }

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
          t('operator.alerts.errors.loadFailed')
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
        t('operator.alerts.errors.loadError')
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
          t('operator.alerts.errors.statusUpdateFailed', { status: response.status })
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
        t('operator.alerts.errors.statusUpdateError')
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
        t('operator.scenario.insight.bothHigher')
    } else if (
      revenueDifference > 0 &&
      roasDifference <= 0
    ) {
      summary =
        t('operator.scenario.insight.revenueHigherRoasLower')
    } else if (
      revenueDifference <= 0 &&
      roasDifference > 0
    ) {
      summary =
        t('operator.scenario.insight.revenueLowerRoasHigher')
    } else {
      summary =
        t('operator.scenario.insight.firstBetter')
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
    i18n.language,
    t,
  ])

  function getOptimizationObjectiveLabel(
    objective
  ) {
    switch (objective) {
      case 'revenue':
        return t('operator.budget.channel.maximizeRevenue')

      case 'conversions':
        return t('operator.budget.channel.maximizeConversions')

      case 'revenueWithRoas':
        return t('operator.budget.channel.maximizeRevenueWithRoas')

      case 'conversionsWithCpa':
        return t('operator.budget.channel.maximizeConversionsWithCpa')

      case 'riskAdjustedRevenue':
        return t('operator.budget.channel.riskAdjustedRevenue')

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
          t('operator.mediaConnections.messages.loadFailed')
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
          i18n.language === 'en'
            ? t('operator.advertiserManager.messages.loadFailed')
            : result.message ||
              t('operator.advertiserManager.messages.loadFailed')
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
        t('operator.advertiserManager.messages.reloadFailed')
      )
    } finally {
      setAdvertisersLoading(false)
    }
  }

  async function createAdvertiser() {
    const advertiserName =
      advertiserForm.name.trim()

    if (!advertiserName) {
      alert(t('operator.advertiserManager.messages.nameRequired'))
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
          i18n.language === 'en'
            ? t('operator.advertiserManager.messages.createFailed')
            : result.message ||
              t('operator.advertiserManager.messages.createFailed')
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

      alert(t('operator.advertiserManager.messages.createFailed'))
    }
  }

  async function updateAdvertiser() {
    if (!editingAdvertiserId) {
      alert(t('operator.advertiserManager.messages.noSelection'))
      return
    }

    const advertiserName =
      advertiserForm.name.trim()

    if (!advertiserName) {
      alert(t('operator.advertiserManager.messages.nameRequired'))
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
          i18n.language === 'en'
            ? t('operator.advertiserManager.messages.updateFailed')
            : result.message ||
              t('operator.advertiserManager.messages.updateFailed')
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

      alert(t('operator.advertiserManager.messages.updateFailed'))
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
      alert(t('operator.advertiserManager.messages.notFound'))
      return
    }

    if (nextStatus === 'archived') {
      const confirmed = window.confirm(
        t('operator.advertiserManager.confirm.deactivate', {
          name: targetAdvertiser.name,
        })
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
          i18n.language === 'en'
            ? t('operator.advertiserManager.messages.statusChangeFailed')
            : result.message ||
              t('operator.advertiserManager.messages.statusChangeFailed')
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
        t('operator.advertiserManager.messages.statusChangeError')
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
        t('operator.advertiserManager.confirm.deletePermanently', {
          name: targetAdvertiser.name,
        })
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
          i18n.language === 'en'
            ? t('operator.advertiserManager.messages.deleteBlocked')
            : result.message ||
              t('operator.advertiserManager.messages.deleteBlocked')
        )
        return
      }

      if (result.status !== 'deleted') {
        alert(
          i18n.language === 'en'
            ? t('operator.advertiserManager.messages.deleteFailed')
            : result.message ||
              t('operator.advertiserManager.messages.deleteFailed')
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
        t('operator.advertiserManager.messages.deleteFailed')
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
          i18n.language === 'en'
            ? t('operator.sync.messages.latestSyncFailed')
            : result.message ||
              t('operator.sync.messages.latestSyncFailed')
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
        t('operator.sync.messages.backfillStatusFailed')
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
          i18n.language === 'en'
            ? t('operator.sync.messages.backfillStartFailed')
            : result.message ||
              t('operator.sync.messages.backfillStartFailed')
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
        t('operator.sync.messages.backfillUnavailable')
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
              t('operator.sync.messages.backfillRetryFailed')
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
            t('operator.sync.messages.backfillProcessFailed')
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
        t('operator.sync.messages.backfillError')
      )
    } finally {
      naverBackfillRunnerRef.current = false
      setIsNaverBackfilling(false)
    }
  }

  async function handleNaverRangeSync() {


    if (!startDate || !endDate) {
      alert(
        t('operator.sync.messages.selectDateRange')
      )
      return
    }

    if (startDate > endDate) {
      alert(
        t('operator.sync.messages.invalidDateRange')
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
          t('operator.sync.messages.syncFailed')
        )
      }

      await loadRealDailyAdPerformance()

      alert(
        t('operator.sync.messages.syncComplete', {
          startDate,
          endDate,
          successfulDays:
            data.successfulDays ?? 0,
          failedDays:
            data.failedDays ?? 0,
          totalSaved:
            data.totalSaved ?? 0,
        })
      )
    } catch (error) {
      console.error(
        'Naver range sync failed:',
        error
      )

      alert(
        t('operator.sync.messages.syncError', {
          message:
            error.message ||
            t('operator.sync.messages.unknownError'),
        })
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
        t('operator.tasks.messages.revisionStartError')
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
        t('operator.tasks.confirm.applyScenario', {
          name:
            scenario.name ||
            getOptimizationObjectiveLabel(
              scenario.objective
            ),
        })
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
        t('operator.tasks.messages.applyScenarioError')
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
        t('operator.tasks.messages.projectionUnavailable')
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
        t('operator.tasks.messages.proposalNotFound')
      )
      return
    }

    const confirmed =
      window.confirm(
        t('operator.tasks.confirm.applyManualRevision')
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
        t('operator.tasks.messages.manualRevisionError')
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
        t('operator.tasks.confirm.moveToTrash')
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
        t('operator.tasks.messages.moveToTrashError')
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
        t('operator.tasks.confirm.restoreTask')
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
        t('operator.tasks.messages.restoreError')
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
        t('operator.tasks.confirm.permanentDelete')
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
          i18n.language === 'en'
            ? t('operator.tasks.messages.permanentDeleteFailed')
            : result.message ||
              t('operator.tasks.messages.permanentDeleteFailed')
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
        t('operator.tasks.messages.permanentDeleteError')
      )
    }
  }

  async function emptyClientTaskTrash() {
    if (trashedClientTasks.length === 0) {
      return
    }

    const confirmed =
      window.confirm(
        t('operator.tasks.confirm.emptyTrash', {
          count: trashedClientTasks.length,
        })
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
                  i18n.language === 'en'
                    ? t('operator.tasks.messages.permanentDeleteFailed')
                    : result.message ||
                      t('operator.tasks.messages.permanentDeleteFailed')
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
        t('operator.tasks.messages.emptyTrashError')
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
          t('client.proposals.shared.loadUnavailable')
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
        t('client.proposals.shared.loadFailed')
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
        t('client.proposals.shared.enterRevisionReason')
      )

      return
    }

    const confirmed =
      window.confirm(
        action === 'approved'
          ? t('client.proposals.shared.confirmApprove')
          : t('client.proposals.shared.confirmRevision')
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
          t('client.proposals.shared.actionFailed')
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
        t('client.proposals.shared.actionError')
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
        t('operator.clientPage.messages.cancelError')
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
        t('operator.clientPage.messages.reshareLinkError')
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
        t('operator.clientPage.messages.reshareSaveError')
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
        t('operator.clientPage.confirm.share')
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
      return t('operator.clientHub.nextActions.startRevision')
    }

    if (
      proposalStatus ===
      'revision_requested' &&
      taskStatus === 'in_progress'
    ) {
      return t('operator.clientHub.nextActions.revisionInProgress')
    }

    if (
      proposalStatus ===
      'revision_requested' &&
      taskStatus === 'reviewing'
    ) {
      return t('operator.clientHub.nextActions.internalReview')
    }

    if (
      proposalStatus === 'sent'
    ) {
      return t('operator.clientHub.nextActions.requestClientReview')
    }

    if (
      proposalStatus === 'reviewing'
    ) {
      return t('operator.clientHub.nextActions.waitingClientFeedback')
    }

    if (
      proposalStatus === 'approved' &&
      taskStatus !== 'done'
    ) {
      return t('operator.clientHub.nextActions.prepareExecution')
    }

    if (
      proposalStatus === 'approved' &&
      taskStatus === 'done'
    ) {
      return t('operator.clientHub.nextActions.readyForExecution')
    }

    if (
      proposalStatus ===
      'review_completed' &&
      taskStatus === 'done'
    ) {
      return t('operator.clientHub.nextActions.complete')
    }

    if (
      proposalStatus ===
      'preparing'
    ) {
      return t('operator.clientHub.nextActions.prepareProposal')
    }

    return t('operator.clientHub.nextActions.checkStatus')
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
        label: t('operator.clientHub.attention.unviewed.label'),
        message: t('operator.clientHub.attention.unviewed.message'),
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
        label: t('operator.clientHub.attention.reviewDelay.label'),
        message: t('operator.clientHub.attention.reviewDelay.message'),
      }
    }

    if (
      proposal.status ===
      'revision_requested'
    ) {
      return {
        level: 'urgent',
        label: t('operator.clientHub.attention.revision.label'),
        message:
          proposal.taskStatus ===
            'waiting'
            ? t('operator.clientHub.attention.revision.waiting')
            : t('operator.clientHub.attention.revision.inProgress'),
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
        label: t('operator.clientHub.attention.approved.label'),
        message: t('operator.clientHub.attention.approved.message'),
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
        label: t('operator.clientHub.attention.complete.label'),
        message: t('operator.clientHub.attention.complete.message'),
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
        label: t('operator.clientHub.attention.stale.label'),
        message: t('operator.clientHub.attention.stale.message'),
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
    const statusKeyMap = {
      preparing: 'preparing',
      sent: 'sent',
      reviewing: 'reviewing',
      revision_requested: 'revisionRequested',
      approved: 'approved',
      review_completed: 'reviewCompleted',
    }

    return t(
      `operator.clientHub.status.${
        statusKeyMap[status] || 'preparing'
      }`
    )
  }

  function translateClientHubSenderName(
    name
  ) {
    if (name === '광고주') {
      return t('operator.clientHub.conversation.advertiser')
    }

    if (name === '운영 담당자') {
      return t('operator.clientHub.conversation.operator')
    }

    return name
  }

  function translateClientHubActionLabel(
    label
  ) {
    if (label === '제안 확인하기') {
      return t('operator.clientHub.conversation.viewProposal')
    }

    if (label === '수정된 제안 확인하기') {
      return t('operator.clientHub.conversation.viewUpdatedProposal')
    }

    return label
  }

  function translateClientHubSystemMessage(
    message
  ) {
    const messageKeyMap = {
      '광고주가 제안을 열람했습니다.':
        'viewedProposal',
      '광고주가 제안을 최초 열람했습니다.':
        'viewedProposalFirst',
      '광고주가 제안을 다시 열람했습니다.':
        'viewedProposalAgain',
      '광고주가 제안을 재열람했습니다.':
        'viewedProposalAgain',
      '광고주 제안 준비가 완료되었습니다.':
        'proposalReady',
      '광고주에게 제안이 공유되었습니다.':
        'proposalShared',
      '광고주가 제안을 승인했습니다.':
        'proposalApproved',
      '광고주가 수정 요청을 등록했습니다.':
        'revisionRequested',
      '수정안을 광고주에게 재공유했습니다.':
        'revisionReshared',
      '광고주 제안이 취소되었습니다.':
        'proposalCancelled',
      '새로운 광고 예산 최적화 제안이 공유되었습니다. 아래 버튼에서 제안을 확인해주세요.':
        'newProposalShared',
      '수정된 광고 예산 최적화 제안이 다시 공유되었습니다. 광고주 요청사항을 반영하여 예산 배분 및 예상 성과를 업데이트했습니다.':
        'updatedProposalShared',
    }

    const key =
      messageKeyMap[message]

    return key
      ? t(`operator.clientHub.systemMessages.${key}`)
      : message
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

      const gridSize = 4

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
          const gridSize = 4
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
                ? t('operator.budget.dynamic.revenueIncreaseHigh', { difference: Math.abs(marginalRevenueDifference).toFixed(1) })
                : t('operator.budget.dynamic.revenueIncreasePortfolio')
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              marginalRevenue <
                averageMarginalRevenue
                ? t('operator.budget.dynamic.revenueDecreaseLow', { difference: Math.abs(marginalRevenueDifference).toFixed(1) })
                : t('operator.budget.dynamic.revenueDecreasePortfolio')
          }

          else {
            reason =
              t('operator.budget.dynamic.revenueHold')
          }
        }

        else if (
          optimizationObjective ===
          'revenueWithRoas'
        ) {
          if (recommendation === '증액') {
            reason =
              t('operator.budget.dynamic.roasIncrease', { difference: `${marginalRevenueDifference >= 0 ? '+' : ''}${marginalRevenueDifference.toFixed(1)}` })
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              t('operator.budget.dynamic.roasDecrease', { difference: `${marginalRevenueDifference >= 0 ? '+' : ''}${marginalRevenueDifference.toFixed(1)}` })
          }

          else {
            reason =
              t('operator.budget.dynamic.roasHold')
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
                ? t('operator.budget.dynamic.conversionIncreaseHigh', { difference: Math.abs(marginalConversionsDifference).toFixed(1) })
                : t('operator.budget.dynamic.conversionIncreasePortfolio')
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              marginalConversions <
                averageMarginalConversions
                ? t('operator.budget.dynamic.conversionDecreaseLow', { difference: Math.abs(marginalConversionsDifference).toFixed(1) })
                : t('operator.budget.dynamic.conversionDecreasePortfolio')
          }

          else {
            reason =
              t('operator.budget.dynamic.conversionHold')
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
                ? t('operator.budget.dynamic.conversionSimpleIncreaseHigh')
                : t('operator.budget.dynamic.conversionSimpleIncreasePortfolio')
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              marginalConversions <
                averageMarginalConversions
                ? t('operator.budget.dynamic.conversionSimpleDecreaseLow')
                : t('operator.budget.dynamic.conversionSimpleDecreasePortfolio')
          }

          else {
            reason =
              t('operator.budget.dynamic.conversionSimpleHold')
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
              t('operator.budget.dynamic.cpaIncrease', { difference: Math.abs(marginalConversionsDifference).toFixed(1), position: marginalConversionsDifference >= 0 ? (i18n.language === 'en' ? 'above' : '높아') : (i18n.language === 'en' ? 'below' : '낮지만') })
          }

          else if (
            recommendation === '감액'
          ) {
            reason =
              t('operator.budget.dynamic.cpaDecrease', { difference: Math.abs(marginalConversionsDifference).toFixed(1), position: marginalConversionsDifference < 0 ? (i18n.language === 'en' ? 'below' : '낮아') : (i18n.language === 'en' ? 'above' : '높지만') })
          }

          else {
            reason =
              t('operator.budget.dynamic.cpaHold')
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
                t('operator.budget.dynamic.riskIncreaseHigh', {
                  revenueDifference: Math.abs(marginalRevenueDifference).toFixed(1),
                  revenuePosition: marginalRevenueDifference >= 0
                    ? (i18n.language === 'en' ? 'above' : '높지만')
                    : (i18n.language === 'en' ? 'below' : '낮고'),
                  riskDifference: Math.abs(riskWeightDifference).toFixed(1),
                })
            }

            else if (
              riskPosition === 'low'
            ) {
              reason =
                t('operator.budget.dynamic.riskIncreaseLow', {
                  revenueDifference: Math.abs(marginalRevenueDifference).toFixed(1),
                  revenuePosition: marginalRevenueDifference >= 0
                    ? (i18n.language === 'en' ? 'above' : '높고')
                    : (i18n.language === 'en' ? 'below' : '낮지만'),
                  riskDifference: Math.abs(riskWeightDifference).toFixed(1),
                })
            }

            else {
              reason =
                t('operator.budget.dynamic.riskIncreaseMedium', {
                  revenueDifference: `${marginalRevenueDifference >= 0 ? '+' : ''}${marginalRevenueDifference.toFixed(1)}`,
                })
            }
          }

          else if (
            recommendation === '감액'
          ) {
            if (riskPosition === 'high') {
              reason =
                t('operator.budget.dynamic.riskDecreaseHigh', {
                  riskDifference: Math.abs(riskWeightDifference).toFixed(1),
                  revenueDifference: `${marginalRevenueDifference >= 0 ? '+' : ''}${marginalRevenueDifference.toFixed(1)}`,
                })
            }

            else {
              reason =
                t('operator.budget.dynamic.riskDecreaseOther', {
                  riskDifference: `${riskWeightDifference >= 0 ? '+' : ''}${riskWeightDifference.toFixed(1)}`,
                })
            }
          }

          else {
            reason =
              t('operator.budget.dynamic.riskHold', {
                revenueDifference: `${marginalRevenueDifference >= 0 ? '+' : ''}${marginalRevenueDifference.toFixed(1)}`,
                riskDifference: `${riskWeightDifference >= 0 ? '+' : ''}${riskWeightDifference.toFixed(1)}`,
              })
          }
        }

        // -----------------------------------------
        // fallback
        // -----------------------------------------

        else {
          reason =
            t('operator.budget.dynamic.fallback', { recommendation: getBudgetRecommendationLabel(recommendation) })
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
    i18n.language,
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
        ? t('operator.budget.riskExplanation.levelLow')
        : riskDiagnosticsSummary.riskLevel === 'high'
          ? t('operator.budget.riskExplanation.levelHigh')
          : t('operator.budget.riskExplanation.levelMedium')

    let opportunityText = ''

    if (riskGap > 0.2) {
      opportunityText =
        t('operator.budget.riskExplanation.opportunity', { gap: riskGap.toFixed(2) })
    } else {
      opportunityText =
        t('operator.budget.riskExplanation.nearOptimal')
    }

    return {
      title: t('operator.budget.riskExplanation.title', {
        level: riskLevelText,
      }),
      summary: t('operator.budget.riskExplanation.summary', {
        realized: riskDiagnosticsSummary.realizedRiskPercent.toFixed(2),
        allowed: riskDiagnosticsSummary.dynamicRiskLimitPercent.toFixed(2),
      }),
      highestRisk: t('operator.budget.riskExplanation.highestRisk', {
        channel: highestRiskChannel.channel,
        change: (highestRiskChannel.relativeChange * 100).toFixed(1),
        volatility: (highestRiskChannel.volatility * 100).toFixed(2),
      }),
      mostChanged: t('operator.budget.riskExplanation.mostChanged', {
        channel: mostChangedChannel.channel,
        change: (mostChangedChannel.relativeChange * 100).toFixed(1),
      }),
      stableChannel: t('operator.budget.riskExplanation.stableChannel', {
        channel: lowestRiskChannel.channel,
      }),
      opportunity: opportunityText,
    }
  }, [
    riskDiagnosticsSummary,
    channelRiskContribution,
    i18n.language,
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
          t('operator.budget.riskRecommendations.volatilityTitle', { channel: highestVolatilityChannel.channel }),

        description:
          t('operator.budget.riskRecommendations.volatilityDescription', { channel: highestVolatilityChannel.channel, volatility: (highestVolatilityChannel.volatility * 100).toFixed(2) }),
      })
    }

    if (
      mostChangedChannel &&
      mostChangedChannel.relativeChange > 0.10
    ) {
      recommendations.push({
        type: 'change',

        title:
          t('operator.budget.riskRecommendations.changeTitle', { channel: mostChangedChannel.channel }),

        description:
          t('operator.budget.riskRecommendations.changeDescription', { channel: mostChangedChannel.channel, change: (mostChangedChannel.relativeChange * 100).toFixed(1) }),
      })
    }

    if (
      highestRiskChannel &&
      highestRiskChannel.weightedRiskContribution > 0
    ) {
      recommendations.push({
        type: 'risk',

        title:
          t('operator.budget.riskRecommendations.riskTitle', { channel: highestRiskChannel.channel }),

        description:
          t('operator.budget.riskRecommendations.riskDescription', { channel: highestRiskChannel.channel }),
      })
    }

    if (riskGap > 0.15) {
      recommendations.push({
        type: 'opportunity',

        title:
          t('operator.budget.riskRecommendations.opportunityTitle'),

        description:
          t('operator.budget.riskRecommendations.opportunityDescription', { gap: riskGap.toFixed(2) }),
      })
    }

    if (
      riskDiagnosticsSummary.realizedRiskPercent <=
      riskDiagnosticsSummary.minimumRiskPercent + 0.15
    ) {
      recommendations.push({
        type: 'stable',

        title:
          t('operator.budget.riskRecommendations.stableTitle'),

        description:
          t('operator.budget.riskRecommendations.stableDescription'),
      })
    }

    return recommendations
  }, [
    riskDiagnosticsSummary,
    channelRiskContribution,
    i18n.language,
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
          label: t('operator.budget.risk.low'),
        },
        {
          key: 'medium',
          label: t('operator.budget.risk.medium'),
        },
        {
          key: 'high',
          label: t('operator.budget.risk.high'),
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
          t('operator.budget.riskScenarioExplanation.bestRevenue')
        )
      }

      if (
        recommended.expectedRoas ===
        bestRoas
      ) {
        reasons.push(
          t('operator.budget.riskScenarioExplanation.bestRoas')
        )
      }

      if (
        recommended.expectedCpa ===
        bestCpa
      ) {
        reasons.push(
          t('operator.budget.riskScenarioExplanation.bestCpa')
        )
      }

      if (
        recommended.realizedRisk ===
        lowestRisk
      ) {
        reasons.push(
          t('operator.budget.riskScenarioExplanation.lowestRisk')
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
          t('operator.budget.riskScenarioExplanation.additionalRisk', { risk: (additionalRisk * 100).toFixed(2) })
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
          t('operator.budget.riskScenarioExplanation.revenueGain', { gain: (revenueGainRate * 100).toFixed(2) })
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
          t('operator.budget.riskScenarioExplanation.highConclusion')
      } else if (
        recommended.key === 'medium'
      ) {
        conclusion =
          t('operator.budget.riskScenarioExplanation.mediumConclusion')
      } else {
        conclusion =
          t('operator.budget.riskScenarioExplanation.lowConclusion')
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
      i18n.language,
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
        t('operator.budget.validation.noVariables')
      )
    }

    if (constraints.length === 0) {
      errors.push(
        t('operator.budget.validation.noConstraints')
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
        t('operator.budget.validation.invalidVariables')
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
        t('operator.budget.validation.invalidBounds')
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
        t('operator.budget.validation.capacityTooLow')
      )
    }

    if (
      requiredBudget <= 0
    ) {
      warnings.push(
        t('operator.budget.validation.noTotalBudget')
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
          t('operator.budget.validation.channelMinCapacity', { channel: check.channel })
        )
      }

      if (
        check.segmentCapacity <
        check.maxBudget
      ) {
        warnings.push(
          t('operator.budget.validation.channelMaxObserved', { channel: check.channel })
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
    i18n.language,
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
        t('operator.budget.errors.selectAdvertiser')
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
            t('operator.budget.errors.noMockData')
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
            t('operator.budget.errors.noMockScenario')
          )
        }

        if (
          scenario.status ===
          'error'
        ) {
          throw new Error(
            scenario.message ||
            t('operator.budget.errors.mockPreviewFailed')
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
            t('operator.budget.errors.mockPreviewRequestFailed')
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
          i18n.language === 'en'
            ? t('operator.budget.errors.previewRequestFailed')
            : result.message ||
              result.blockCode ||
              t('operator.budget.errors.previewRequestFailed')
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
        t('operator.budget.errors.previewError')
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
          t('operator.budget.errors.policyApiError', { status: response.status })
        )
      }

      const result =
        await response.json()

      if (result.status !== 'ok') {
        throw new Error(
          i18n.language === 'en'
            ? t('operator.budget.errors.policyLoadFailed')
            : result.message ||
              t('operator.budget.errors.policyLoadFailed')
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
        t('operator.budget.errors.policyLoadError')
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
        t('operator.budget.errors.bulkBothRequired')
      )

      return
    }

    if (
      minPct < 0 ||
      minPct > 100
    ) {
      setCampaignBudgetPolicyError(
        t('operator.budget.errors.bulkMinRange')
      )

      return
    }

    if (
      maxPct < 100
    ) {
      setCampaignBudgetPolicyError(
        t('operator.budget.errors.bulkMaxRange')
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
        t('operator.budget.errors.selectAdvertiser')
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
          t('operator.budget.errors.campaignBothRequired', { campaign: policy.campaignName || policy.campaignId })
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
          t('operator.budget.errors.campaignNumeric', { campaign: policy.campaignName || policy.campaignId })
        )

        return
      }

      if (
        minDailyBudget < 0
      ) {
        setCampaignBudgetPolicyError(
          t('operator.budget.errors.campaignMinNonnegative', { campaign: policy.campaignName || policy.campaignId })
        )

        return
      }

      if (
        maxDailyBudget <
        minDailyBudget
      ) {
        setCampaignBudgetPolicyError(
          t('operator.budget.errors.campaignMaxAtLeastMin', { campaign: policy.campaignName || policy.campaignId })
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
          t('operator.budget.errors.campaignCurrentWithinRange', { campaign: policy.campaignName || policy.campaignId })
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
        t('operator.budget.errors.noPoliciesToSave')
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
          t('operator.budget.errors.policySaveApiError', { status: response.status })
        )
      }

      const result =
        await response.json()

      if (
        result.status !== 'ok'
      ) {
        throw new Error(
          i18n.language === 'en'
            ? t('operator.budget.errors.policySaveFailed')
            : result.message ||
              t('operator.budget.errors.policySaveFailed')
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
        t('operator.budget.errors.policySaveError')
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
        t('operator.budget.errors.selectAdvertiser')
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
        t('operator.budget.errors.configurePoliciesBeforeScaling')
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
          t('operator.budget.errors.scalingApiError', { status: response.status })
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
          i18n.language === 'en'
            ? t('operator.budget.errors.scalingUnavailable')
            : result.message ||
              t('operator.budget.errors.scalingUnavailable')
        )
      }

    } catch (error) {
      console.error(
        'FAILED TO RUN BUDGET SCALING ANALYSIS',
        error
      )

      setBudgetScalingError(
        error.message ||
        t('operator.budget.errors.scalingError')
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
            t('operator.budget.scaling.insightWaitingTitle'),
          message:
            t('operator.budget.scaling.insightWaitingMessage'),
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
            t('operator.budget.scaling.noBaselineTitle'),
          message:
            t('operator.budget.scaling.noBaselineMessage'),
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
            t('operator.budget.scaling.noExpansionTitle'),
          message:
            t('operator.budget.scaling.noExpansionMessage'),
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
            t('operator.budget.scaling.slowdownDetectedTitle'),

          message:
            safeRow.multiplier > 1
              ? t('operator.budget.scaling.slowdownMessage', {
                safe: safePct.toFixed(0),
                slowdown: slowdownPct.toFixed(0),
              })
              : t('operator.budget.scaling.earlySlowdownMessage'),

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
          t('operator.budget.scaling.expansionAvailableTitle'),

        message:
          t('operator.budget.scaling.expansionAvailableMessage', {
            change: (((highestRow.multiplier - 1) * 100)).toFixed(0),
          }),

        slowdownRow: null,

        bestExpansionRow:
          highestRow,
      }
    }, [
      budgetScalingAnalysisRows,
      i18n.language,
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
        t('operator.budget.errors.selectAdvertiser')
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
          t('operator.budget.errors.channelApiError', { status: response.status })
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
        t('operator.budget.errors.channelCalculationError')
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
        t('operator.budget.channel.defaultScenarioName', {
          objective: getOptimizationObjectiveLabel(optimizationObjective),
        }),

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
            t('operator.budget.errors.riskScenarioFailed', { level: getBudgetRiskLevelLabel(level) })
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
        t('operator.budget.errors.riskCompareError')
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
    const gap = 0
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
    const gridSize = 4
    const gap = 0

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
          t('operator.dashboard.validation.xDimensionOnly')
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
          t('operator.dashboard.validation.yMetricOnly')
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
          t('operator.dashboard.validation.groupDimensionOnly')
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
          t('operator.dashboard.validation.filterDimensionOnly')
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
    const gap = 0
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
      alert(t('operator.dashboard.validation.setXAxisFirst'))
      return
    }

    if (yFields.length === 0) {
      alert(t('operator.dashboard.validation.addYMetric'))
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
                    ? getTranslatedFieldLabel(yFields[0])
                    : buildAutoChartTitle(xField, yFields)
                ),

              description:
                chartDescription.trim(),
            }
            : chart
        )
      )

      setEditingChartId(null)

      alert(t('operator.dashboard.validation.chartUpdated'))

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
            ? getTranslatedFieldLabel(yFields[0])
            : buildAutoChartTitle(
              xField,
              yFields
            )
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
      title: t('operator.dashboard.saved.duplicateTitle', { title: chart.title }),
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
    const gridSize = 4

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

    alert(t('operator.dashboard.messages.saved'))
  }

  function resetDashboard() {
    const confirmed = window.confirm(
      t('operator.dashboard.messages.resetConfirm')
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
                name={getTranslatedFieldLabel(field)}
                fill={color}
              />
            )
          }

          return (
            <Line
              key={field}
              type="monotone"
              dataKey={field}
              name={getTranslatedFieldLabel(field)}
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
              : `${groupValue} · ${getTranslatedFieldLabel(field)}`

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
            {t('operator.dashboard.validation.savedKpiOneMetric')}
          </div>
        )
      }

      let data = performanceSourceRows

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
        formatLocalizedDisplayValue(
          value,
          chart.numberFormat || 'auto',
          metric
        )

      return (
        <div className="kpi-preview-card">
          <span className="kpi-preview-label">
            {getTranslatedFieldLabel(metric)}
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
            {t('operator.dashboard.validation.savedDonutXAxis')}
          </div>
        )
      }

      if (safeYFields.length !== 1) {
        return (
          <div className="saved-chart-error">
            {t('operator.dashboard.validation.savedDonutOneMetric')}
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
                formatLocalizedDisplayValue(
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
            {t('operator.dashboard.validation.savedTableXAxis')}
          </div>
        )
      }

      if (safeYFields.length === 0) {
        return (
          <div className="saved-chart-error">
            {t('operator.dashboard.validation.savedTableYMetric')}
          </div>
        )
      }

      return (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  {getTranslatedFieldLabel(chart.xField)}
                </th>

                {(chart.yFields || []).map((field) => (
                  <th key={field}>
                    {getTranslatedFieldLabel(field)}
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
                      {formatLocalizedDisplayValue(
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
                formatLocalizedDisplayValue(
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
                      getTranslatedFieldLabel(field) === name
                  ) || safeYFields[0]

                return formatLocalizedDisplayValue(
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
            {t('operator.dashboard.validation.savedScatterTwoMetrics')}
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
              name={getTranslatedFieldLabel(xMetric)}
              hide={!(chart.xAxisVisible ?? true)}
            />

            <YAxis
              type="number"
              dataKey="y"
              name={getTranslatedFieldLabel(yMetric)}
              hide={!(chart.yAxisVisible ?? true)}
            />

            <Tooltip />

            {(chart.legendVisible ?? true) && (
              <Legend />
            )}

            <Scatter
              data={scatterData}
              name={`${getTranslatedFieldLabel(xMetric)} vs ${getTranslatedFieldLabel(yMetric)}`}
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
              formatLocalizedDisplayValue(
                value,
                chart.numberFormat || 'auto',
                safeYFields[0]
              )
            }
          />

          <Tooltip
            formatter={(value, name) =>
              formatLocalizedDisplayValue(
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
                        name={`${groupValue} - ${getTranslatedFieldLabel(metric)}`}
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
                  name={getTranslatedFieldLabel(metric)}
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
              name={getTranslatedFieldLabel(field)}
              fill={color}
            />
          )
        }

        return (
          <Line
            key={field}
            type="monotone"
            dataKey={field}
            name={getTranslatedFieldLabel(field)}
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
              : `${groupValue} · ${getTranslatedFieldLabel(field)}`

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
            {t('operator.dashboard.validation.kpiOneMetric')}
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
        formatLocalizedDisplayValue(
          value,
          numberFormat,
          metric
        )

      return (
        <div className="kpi-preview-card">
          <span className="kpi-preview-label">
            {getTranslatedFieldLabel(metric)}
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
            {t('operator.dashboard.validation.donutXAxis')}
          </div>
        )
      }

      if (yFields.length !== 1) {
        return (
          <div className="empty-chart">
            {t('operator.dashboard.validation.donutOneMetric')}
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
                formatLocalizedDisplayValue(
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
          {t('operator.dashboard.preview.addXAxisPrompt')}
        </div>
      )
    }

    if (yFields.length === 0) {
      return (
        <div className="empty-chart">
          {t('operator.dashboard.validation.yNumericMetric')}
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
                  {getTranslatedFieldLabel(xField)}
                </th>

                {yFields.map((field) => (
                  <th key={field}>
                    {getTranslatedFieldLabel(field)}
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
                        {formatLocalizedDisplayValue(
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
                  formatLocalizedDisplayValue(
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
                      getTranslatedFieldLabel(field) === name
                  ) || yFields[0]

                return formatLocalizedDisplayValue(
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
            {t('operator.dashboard.validation.scatterTwoMetrics')}
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
              name={getTranslatedFieldLabel(xMetric)}
              hide={!xAxisVisible}
              tickFormatter={(value) =>
                formatLocalizedDisplayValue(
                  value,
                  numberFormat,
                  xMetric
                )
              }
            />

            <YAxis
              type="number"
              dataKey="y"
              name={getTranslatedFieldLabel(yMetric)}
              hide={!yAxisVisible}
              tickFormatter={(value) =>
                formatLocalizedDisplayValue(
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
                formatLocalizedDisplayValue(
                  value,
                  numberFormat,
                  name === getTranslatedFieldLabel(xMetric)
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
              name={`${getTranslatedFieldLabel(xMetric)} vs ${getTranslatedFieldLabel(yMetric)}`}
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
                formatLocalizedDisplayValue(
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
                    getTranslatedFieldLabel(field) === name
                ) || yFields[0]

              return formatLocalizedDisplayValue(
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
            {t('client.proposals.shared.loading')}
          </div>
        </div>
      )
    }

    if (sharedProposalError) {
      return (
        <div className="shared-proposal-page">
          <div className="shared-proposal-card">
            <h2>
              {t('client.proposals.shared.unavailableTitle')}
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
            {t('client.proposals.shared.preparing')}
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
                {t('client.proposals.shared.eyebrow')}
              </span>

              <h1>
                {sharedProposal.scenarioName ||
                  t('client.proposals.shared.defaultTitle')}
              </h1>

              <p>
                {t('client.proposals.shared.description')}
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
                {t('client.proposals.totalBudget')}
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
                ).toLocaleString(
                  i18n.language === 'en'
                    ? 'en-US'
                    : 'ko-KR'
                )}
                {t('client.common.currency')}
              </strong>
            </div>

            <div>
              <span>
                {t('client.proposals.projectedRevenue')}
              </span>

              <strong>
                {Math.round(
                  sharedProposal.summary
                    ?.projectedRevenue || 0
                ).toLocaleString(
                  i18n.language === 'en'
                    ? 'en-US'
                    : 'ko-KR'
                )}
                {t('client.common.currency')}
              </strong>
            </div>

            <div>
              <span>
                {t('client.proposals.projectedRoas')}
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
                {t('client.proposals.projectedCpa')}
              </span>

              <strong>
                {sharedProposal.summary
                  ?.projectedCpa != null
                  ? `${Math.round(
                    sharedProposal.summary
                      .projectedCpa
                  ).toLocaleString(
                    i18n.language === 'en'
                      ? 'en-US'
                      : 'ko-KR'
                  )}${t('client.common.currency')}`
                  : '-'}
              </strong>
            </div>
          </section>

          <section className="shared-proposal-section">
            <div className="shared-proposal-section-header">
              <h2>
                {t('client.proposals.shared.channelBudgetTitle')}
              </h2>

              <span>
                {t('client.proposals.shared.channelBudgetDescription')}
              </span>
            </div>

            <div className="shared-proposal-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>
                      {t('client.proposals.shared.channel')}
                    </th>

                    <th>
                      {t('client.proposals.shared.currentBudget')}
                    </th>

                    <th>
                      {t('client.proposals.shared.proposedBudget')}
                    </th>

                    <th>
                      {t('client.proposals.shared.changeRate')}
                    </th>

                    <th>
                      {t('client.proposals.projectedRoas')}
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
                            {t('client.common.currency')}
                          </td>

                          <td>
                            {Math.round(
                              allocation.optimizedBudget ||
                              0
                            ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                            {t('client.common.currency')}
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
                  {t('client.proposals.shared.reviewAndRespond')}
                </h2>

                <p>
                  {t('client.proposals.shared.reviewDescription')}
                </p>
              </div>
            </div>

            {sharedProposal.status ===
              'reviewing' ? (
              <>
                <label className="shared-proposal-revision-label">
                  {t('client.proposals.shared.feedbackAndRevision')}
                </label>

                <textarea
                  rows="5"
                  value={
                    sharedRevisionReason
                  }
                  placeholder={t(
                    'client.proposals.shared.revisionPlaceholder'
                  )}
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
                    {t('client.proposals.shared.requestRevision')}
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
                          t('client.proposals.shared.confirmApprove')
                        )

                      if (!confirmed) {
                        return
                      }

                      submitSharedProposalAction(
                        'approved'
                      )
                    }}
                  >
                    {t('client.proposals.shared.approveProposal')}
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
                        {t('client.proposals.shared.revisionSubmitted')}
                      </strong>

                      <p>
                        {t('client.proposals.shared.revisionSubmittedDescription')}
                      </p>
                    </>
                  )
                  : sharedProposal.status ===
                    'approved'
                    ? (
                      <>
                        <strong>
                          {t('client.proposals.shared.approvedTitle')}
                        </strong>

                        <p>
                          {t('client.proposals.shared.approvedDescription')}
                        </p>
                      </>
                    )
                    : (
                      <p>
                        {t('client.proposals.shared.checkingStatus')}
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
            {t('operator.brand.subtitle')}
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
              {t('operator.nav.dashboard')}
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
              {t('operator.nav.performance')}
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
              {t('operator.nav.budget')}
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
              {t('operator.nav.scenario')}
            </button>

            <button
              type="button"
              className="page-nav-button"
              onClick={() => {
                setIsClientHubOpen(true)
                loadInternalUnreadCount()
              }}
            >
              {t('operator.nav.communication')}

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
              🔔 {t('operator.nav.alerts')}

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
              {t('operator.nav.tasks')}
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
                        {t('operator.advertiserManager.title')}
                      </h2>

                      <p>
                        {t('operator.advertiserManager.description')}
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
                          + {t('operator.advertiserManager.addAdvertiser')}
                        </button>
                      </div>

                      <div className="advertiser-manager-list">
                        {advertisersLoading ? (
                          <div className="advertiser-manager-empty">
                            {t('operator.advertiserManager.loading')}
                          </div>
                        ) : advertisers.length === 0 ? (
                          <div className="advertiser-manager-empty">
                            {t('operator.advertiserManager.empty')}
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
                                          ? t('operator.advertiserManager.inactive')
                                          : t('operator.advertiserManager.active')}
                                      </span>
                                    </div>

                                    <div className="advertiser-manager-item-meta">
                                      {advertiser.companyName && (
                                        <span>
                                          {t('operator.advertiserManager.companyName')}: {
                                            advertiser.companyName
                                          }
                                        </span>
                                      )}

                                      {advertiser.contactName && (
                                        <span>
                                          {t('operator.advertiserManager.contact')}: {
                                            advertiser.contactName
                                          }
                                        </span>
                                      )}

                                      {advertiser.contactEmail && (
                                        <span>
                                          {t('operator.advertiserManager.email')}: {
                                            advertiser.contactEmail
                                          }
                                        </span>
                                      )}

                                      {advertiser.contactPhone && (
                                        <span>
                                          {t('operator.advertiserManager.phone')}: {
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
                                      {t('operator.advertiserManager.edit')}
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
                                        {t('operator.advertiserManager.restore')}
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
                                        {t('operator.advertiserManager.deactivate')}
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
                                      {t('operator.advertiserManager.delete')}
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
                              ? t('operator.advertiserManager.addAdvertiser')
                              : t('operator.advertiserManager.editAdvertiser')}
                          </h3>
                        </div>

                        <label>
                          <span>
                            {t('operator.advertiserManager.advertiserName')}
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
                            placeholder={t('operator.advertiserManager.advertiserNamePlaceholder')}
                          />
                        </label>

                        <label>
                          <span>
                            {t('operator.advertiserManager.companyNameLabel')}
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
                            placeholder={t('operator.advertiserManager.companyNamePlaceholder')}
                          />
                        </label>

                        <label>
                          <span>
                            {t('operator.advertiserManager.contactName')}
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
                            placeholder={t('operator.advertiserManager.contactNamePlaceholder')}
                          />
                        </label>

                        <label>
                          <span>
                            {t('operator.advertiserManager.contactEmail')}
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
                            {t('operator.advertiserManager.contactPhone')}
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
                            {t('operator.advertiserManager.cancel')}
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
                              ? t('operator.advertiserManager.addAdvertiser')
                              : t('operator.advertiserManager.saveChanges')}
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            <div className="advertiser-selector">
              <span className="advertiser-selector-label">
                {t('operator.topbar.currentAdvertiser')}
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
                    {t('operator.topbar.loadingAdvertisers')}
                  </option>
                ) : advertisers.length === 0 ? (
                  <option value="">
                    {t('operator.topbar.noAdvertisers')}
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
                {t('operator.topbar.manageAdvertisers')}
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
                {t('operator.topbar.importPlatformData')}
              </button>

              <button
                type="button"
                className="topbar-action-button"
                onClick={saveDashboard}
              >
                {t('operator.topbar.saveDashboard')}
              </button>

              <div className="language-switcher">
                <button
                  type="button"
                  className={
                    i18n.language === 'ko'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    i18n.changeLanguage('ko')
                  }
                >
                  KO
                </button>

                <button
                  type="button"
                  className={
                    i18n.language === 'en'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    i18n.changeLanguage('en')
                  }
                >
                  EN
                </button>
              </div>

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
                {t('operator.topbar.logout')}
              </button>
            </div>

          </div>

        </div>
      </header>


      <section className="filters">


        <div className="performance-toolbar compact">
          <div className="performance-filter-row">
            <div className="compact-filter brand-filter">
              <span>{t('operator.filters.brand')}</span>

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
                  {t('operator.filters.allBrands')}
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
              <span>{t('operator.filters.period')}</span>

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
                  {t('operator.filters.last7Days')}
                </option>

                <option value="30d">
                  {t('operator.filters.last30Days')}
                </option>

                <option value="90d">
                  {t('operator.filters.last90Days')}
                </option>

                <option value="all">
                  {t('operator.filters.allPeriod')}
                </option>
              </select>
            </div>

            <div className="compact-filter">
              <span>{t('operator.filters.dataSource')}</span>

              <select
                value={performanceDataSource}
                onChange={(e) =>
                  setPerformanceDataSource(
                    e.target.value
                  )
                }
              >
                <option value="mock">
                  {t('operator.filters.mockData')}
                </option>

                <option value="naver">
                  {t('operator.filters.naverData')}
                </option>
              </select>
            </div>

            <div className="compact-filter">
              <span>{t('operator.filters.channel')}</span>

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
                  {t('operator.filters.allChannels')}
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
              <span>{t('operator.filters.campaign')}</span>

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
                  {t('operator.filters.allCampaigns')}
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
              <span>{t('operator.filters.product')}</span>

              <select
                value={globalProduct}
                onChange={(e) =>
                  setGlobalProduct(
                    e.target.value
                  )
                }
              >
                <option value="전체">
                  {t('operator.filters.allProducts')}
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
              {t('operator.filters.reset')}
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
                      ? t('operator.sync.syncing')
                      : t('operator.sync.latest')}
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
                          {t('operator.sync.historicalComplete')}
                        </span>
                      </div>
                    ) : (
                      <div className="backfill-inline-status">
                        <span>
                          {t('operator.sync.historicalData')}
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
                          {t('operator.sync.daysUnit')}
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
                    {t('operator.sync.dataManagement')}
                    <span className="data-menu-arrow">
                      {performanceDataMenuOpen
                        ? '▲'
                        : '▼'}
                    </span>
                  </button>

                  {performanceDataMenuOpen && (
                    <div className="performance-data-dropdown">
                      <div className="data-dropdown-header">
                        {t('operator.sync.naverDataManagement')}
                      </div>

                      <div className="data-dropdown-status">
                        <span>{t('operator.sync.latest')}</span>

                        <strong>
                          {naverLatestDate || '-'}
                        </strong>
                      </div>

                      <div className="data-dropdown-status">
                        <span>{t('operator.sync.historicalData')}</span>

                        <strong>
                          {naverBackfillJob?.status ===
                            'completed'
                            ? t('operator.sync.collectionComplete')
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
                          {t('operator.sync.resyncSelectedPeriod')}
                        </strong>

                        <span>
                          {t('operator.sync.resyncSelectedPeriodDescription')}
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
              ['summary', t('operator.performance.tabs.summary')],
              ['channel', t('operator.performance.tabs.channel')],
              ['campaign', t('operator.performance.tabs.campaign')],
              ['product', t('operator.performance.tabs.product')],
              ['content', t('operator.performance.tabs.content')],
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
                  <h2>{t('operator.performance.comparison.title')}</h2>

                  <div className="performance-period-info">
                    <span>
                      {t('operator.performance.comparison.current')} {startDate || '-'} ~ {endDate || '-'}
                    </span>

                    <span className="performance-period-vs">
                      vs
                    </span>

                    <span>
                      {t('operator.performance.comparison.previous')} {previousPeriodRange.start || '-'} ~{' '}
                      {previousPeriodRange.end || '-'}
                    </span>
                  </div>
                </div>

                <div className="performance-kpi-grid">
                  {[
                    {
                      key: 'spend',
                      label: t('fields.spend'),
                      suffix: 'currency',
                    },
                    {
                      key: 'revenue',
                      label: t('fields.revenue'),
                      suffix: 'currency',
                    },
                    {
                      key: 'roas',
                      label: 'ROAS',
                      suffix: '%',
                    },
                    {
                      key: 'cpa',
                      label: 'CPA',
                      suffix: 'currency',
                    },
                    {
                      key: 'ctr',
                      label: 'CTR',
                      suffix: '%',
                    },
                    {
                      key: 'conversions',
                      label: t('fields.conversions'),
                      suffix: 'count',
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
                            : item.key === 'conversions'
                              ? `${Math.round(
                                metric.current
                              ).toLocaleString()}${t(
                                'operator.performance.units.countSuffix'
                              )}`
                              : `${Math.round(
                                metric.current
                              ).toLocaleString()}${t(
                                'operator.performance.units.currencySuffix'
                              )}`}
                        </strong>

                        <div className="performance-kpi-change">
                          {change === null ? (
                            <span className="change-neutral">
                              {t('operator.performance.comparison.noComparisonData')}
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
                            {t('operator.performance.comparison.vsPrevious')}
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
                      {t('operator.performance.insights.title')}
                    </h2>

                    <span>
                      {t('operator.performance.insights.subtitle')}
                    </span>
                  </div>
                </div>

                <div className="performance-insights-grid">

                  <div className="performance-insight-card">
                    <span>
                      {t('operator.performance.insights.bestRoas')}
                    </span>

                    <strong>
                      {bestRoasCampaign
                        ? `${bestRoasCampaign.channel} · ${bestRoasCampaign.campaign}`
                        : '-'}
                    </strong>

                    <p>
                      {bestRoasCampaign
                        ? `ROAS ${bestRoasCampaign.roas.toFixed(1)}%`
                        : t('operator.performance.common.noData')}
                    </p>

                    <small>
                      {t('operator.performance.insights.bestRoasDescription')}
                    </small>
                  </div>


                  <div className="performance-insight-card">
                    <span>
                      {t('operator.performance.insights.bestRevenue')}
                    </span>

                    <strong>
                      {bestRevenueCampaign
                        ? `${bestRevenueCampaign.channel} · ${bestRevenueCampaign.campaign}`
                        : '-'}
                    </strong>

                    <p>
                      {bestRevenueCampaign
                        ? t('operator.performance.insights.revenueValue', {
                          value: Math.round(
                            bestRevenueCampaign.revenue
                          ).toLocaleString(),
                        })
                        : t('operator.performance.common.noData')}
                    </p>

                    <small>
                      {t('operator.performance.insights.bestRevenueDescription')}
                    </small>
                  </div>


                  <div className="performance-insight-card">
                    <span>
                      {t('operator.performance.insights.lowestCpa')}
                    </span>

                    <strong>
                      {bestCpaCampaign
                        ? `${bestCpaCampaign.channel} · ${bestCpaCampaign.campaign}`
                        : '-'}
                    </strong>

                    <p>
                      {bestCpaCampaign
                        ? t('operator.performance.insights.cpaValue', {
                          value: Math.round(
                            bestCpaCampaign.cpa
                          ).toLocaleString(),
                        })
                        : t('operator.performance.common.noData')}
                    </p>

                    <small>
                      {t('operator.performance.insights.lowestCpaDescription')}
                    </small>
                  </div>


                  <div className="performance-insight-card">
                    <span>
                      {t('operator.performance.insights.needsImprovement')}
                    </span>

                    <strong>
                      {improvementCampaign
                        ? `${improvementCampaign.channel} · ${improvementCampaign.campaign}`
                        : '-'}
                    </strong>

                    <p>
                      {improvementCampaign
                        ? `ROAS ${improvementCampaign.roas.toFixed(1)}%`
                        : t('operator.performance.common.noData')}
                    </p>

                    <small>
                      {t('operator.performance.insights.needsImprovementDescription')}
                    </small>
                  </div>

                </div>
              </section>

              <section className="performance-trend-section">
                <div className="performance-trend-header">
                  <div>
                    <h2>
                      {t('operator.performance.trend.spendRevenueTitle')}
                    </h2>

                    <span>
                      {t('operator.performance.trend.filteredPeriod')}
                    </span>
                  </div>
                </div>

                <div className="performance-trend-chart">
                  {performanceDailySummary.length === 0 ? (
                    <div className="performance-empty">
                      {t('operator.performance.empty.performanceData')}
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
                            `${Math.round(Number(value)).toLocaleString()}${t('operator.performance.units.currencySuffix')}`
                          }
                        />

                        <Legend />

                        <Line
                          type="monotone"
                          dataKey="spend"
                          name={t('fields.spend')}
                          dot={false}
                        />

                        <Line
                          type="monotone"
                          dataKey="revenue"
                          name={t('fields.revenue')}
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
                      {t('operator.performance.trend.roasTitle')}
                    </h2>

                    <span>
                      {t('operator.performance.trend.roasSubtitle')}
                    </span>
                  </div>
                </div>

                <div className="performance-trend-chart">
                  {performanceDailySummary.length === 0 ? (
                    <div className="performance-empty">
                      {t('operator.performance.empty.performanceData')}
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
                <h2>{t('operator.performance.changes.title')}</h2>

                <span>
                  {t('operator.performance.changes.subtitle')}
                </span>
              </div>

              <div className="performance-change-list">
                {performanceAlerts.map(
                  (alert, index) => (
                    <div
                      key={`${t(`operator.performance.alerts.categories.${alert.category}`, { defaultValue: alert.categoryLabel })}-${alert.name || alert.channel}-${alert.metric}-${index}`}
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
                        {t(`operator.performance.alerts.categories.${alert.category}`, { defaultValue: alert.categoryLabel })}
                      </span>

                      <span>
                        {getPerformanceAlertMessage(alert)}
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
                    <h2>{t('operator.performance.rankings.channel')}</h2>

                    <span>
                      {t('operator.performance.common.currentFilter')}
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
                      {t('operator.performance.sort.roasDesc')}
                    </option>

                    <option value="spend_desc">
                      {t('operator.performance.sort.spendDesc')}
                    </option>

                    <option value="revenue_desc">
                      {t('operator.performance.sort.revenueDesc')}
                    </option>

                    <option value="cpa_asc">
                      {t('operator.performance.sort.cpaAsc')}
                    </option>

                    <option value="conversions_desc">
                      {t('operator.performance.sort.conversionsDesc')}
                    </option>
                  </select>
                </div>

                {sortedChannelDiagnostics.length > 0 && (
                  <div className="channel-performance-summary">
                    <div className="channel-summary-item">
                      <span>{t('operator.performance.insights.bestRoas')}</span>

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
                        <span>{t('operator.performance.summary.lowestRoas')}</span>

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
                        <th>{t('operator.performance.table.rank')}</th>
                        <th>{t('operator.performance.table.channel')}</th>
                        <th>{t('fields.spend')}</th>
                        <th>{t('fields.revenue')}</th>
                        <th>{t('fields.conversions')}</th>
                        <th>{t('fields.clicks')}</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CPC</th>
                        <th>CTR</th>
                        <th>CVR</th>
                        <th>CPM</th>
                        <th>{t('operator.performance.table.spendShare')}</th>
                        <th>{t('operator.performance.table.revenueShare')}</th>
                        <th>{t('operator.performance.table.contributionGap')}</th>
                        <th>{t('operator.performance.table.diagnosis')}</th>
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
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.revenue
                              ).toLocaleString()}
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.conversions
                              ).toLocaleString()}
                              {t('operator.performance.units.countSuffix')}
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
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.cpc
                              ).toLocaleString()}
                              {t('operator.performance.units.currencySuffix')}
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
                              {t('operator.performance.units.currencySuffix')}
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
                                  {getPerformanceDiagnosisStatus(item.status)}
                                </span>

                                <small>
                                  {getPerformanceDiagnosisReason(item.reason)}
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
                      <h2>{t('operator.performance.detail.channel')}</h2>

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
                      {t('operator.performance.common.close')}
                    </button>
                  </div>

                  <div className="client-campaign-detail-metrics">
                    <div>
                      <span>{t('fields.spend')}</span>
                      <strong>
                        {Math.round(
                          selectedInternalChannelData.spend
                        ).toLocaleString()}
                        {t('operator.performance.units.currencySuffix')}
                      </strong>
                    </div>

                    <div>
                      <span>{t('fields.revenue')}</span>
                      <strong>
                        {Math.round(
                          selectedInternalChannelData.revenue
                        ).toLocaleString()}
                        {t('operator.performance.units.currencySuffix')}
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
                        {t('operator.performance.units.currencySuffix')}
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
                      <span>{t('fields.conversions')}</span>
                      <strong>
                        {Math.round(
                          selectedInternalChannelData.conversions
                        ).toLocaleString()}
                        {t('operator.performance.units.countSuffix')}
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
                          name={t('fields.spend')}
                          dot={false}
                        />

                        <Line
                          type="monotone"
                          dataKey="revenue"
                          name={t('fields.revenue')}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="client-campaign-content-section">
                    <div className="channel-performance-header">
                      <div>
                        <h2>
                          {t('operator.performance.detail.campaignPerformance')}
                        </h2>

                        <span>
                          {t('operator.performance.sort.roasDesc')}
                        </span>
                      </div>
                    </div>

                    <div className="channel-performance-table-wrapper">
                      <table className="channel-performance-table">
                        <thead>
                          <tr>
                            <th>{t('operator.performance.table.campaign')}</th>
                            <th>{t('fields.spend')}</th>
                            <th>{t('fields.revenue')}</th>
                            <th>ROAS</th>
                            <th>CPA</th>
                            <th>CTR</th>
                            <th>{t('fields.conversions')}</th>
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
                                  {t('operator.performance.units.currencySuffix')}
                                </td>

                                <td>
                                  {Math.round(
                                    row.revenue
                                  ).toLocaleString()}
                                  {t('operator.performance.units.currencySuffix')}
                                </td>

                                <td>
                                  {row.roas.toFixed(1)}%
                                </td>

                                <td>
                                  {Math.round(
                                    row.cpa
                                  ).toLocaleString()}
                                  {t('operator.performance.units.currencySuffix')}
                                </td>

                                <td>
                                  {row.ctr.toFixed(2)}%
                                </td>

                                <td>
                                  {Math.round(
                                    row.conversions
                                  ).toLocaleString()}
                                  {t('operator.performance.units.countSuffix')}
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
                    <h2>{t('operator.performance.rankings.campaign')}</h2>

                    <span>
                      {t('operator.performance.common.currentFilter')}
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
                      {t('operator.performance.sort.roasDesc')}
                    </option>

                    <option value="spend_desc">
                      {t('operator.performance.sort.spendDesc')}
                    </option>

                    <option value="revenue_desc">
                      {t('operator.performance.sort.revenueDesc')}
                    </option>

                    <option value="cpa_asc">
                      {t('operator.performance.sort.cpaAsc')}
                    </option>

                    <option value="conversions_desc">
                      {t('operator.performance.sort.conversionsDesc')}
                    </option>
                  </select>
                </div>

                <div className="channel-performance-table-wrapper">
                  <table className="channel-performance-table">
                    <thead>
                      <tr>
                        <th>{t('operator.performance.table.rank')}</th>
                        <th>{t('operator.performance.table.campaign')}</th>
                        <th>{t('fields.spend')}</th>
                        <th>{t('fields.revenue')}</th>
                        <th>{t('fields.conversions')}</th>
                        <th>{t('fields.clicks')}</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CPC</th>
                        <th>CTR</th>
                        <th>CVR</th>
                        <th>CPM</th>
                        <th>{t('operator.performance.table.spendShare')}</th>
                        <th>{t('operator.performance.table.revenueShare')}</th>
                        <th>{t('operator.performance.table.contributionGap')}</th>
                        <th>{t('operator.performance.table.diagnosis')}</th>
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
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.revenue
                              ).toLocaleString()}
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.conversions
                              ).toLocaleString()}
                              {t('operator.performance.units.countSuffix')}
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
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.cpc
                              ).toLocaleString()}
                              {t('operator.performance.units.currencySuffix')}
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
                              {t('operator.performance.units.currencySuffix')}
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
                                  {getPerformanceDiagnosisStatus(item.status)}
                                </span>

                                <small>
                                  {getPerformanceDiagnosisReason(item.reason)}
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
                      <h2>{t('operator.performance.detail.campaign')}</h2>

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
                      {t('operator.performance.common.close')}
                    </button>
                  </div>

                  <div className="client-campaign-detail-metrics">
                    <div>
                      <span>{t('fields.spend')}</span>

                      <strong>
                        {Math.round(
                          selectedInternalCampaignData.spend
                        ).toLocaleString()}
                        {t('operator.performance.units.currencySuffix')}
                      </strong>
                    </div>

                    <div>
                      <span>{t('fields.revenue')}</span>

                      <strong>
                        {Math.round(
                          selectedInternalCampaignData.revenue
                        ).toLocaleString()}
                        {t('operator.performance.units.currencySuffix')}
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
                        {t('operator.performance.units.currencySuffix')}
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
                      <span>{t('fields.conversions')}</span>

                      <strong>
                        {Math.round(
                          selectedInternalCampaignData.conversions
                        ).toLocaleString()}
                        {t('operator.performance.units.countSuffix')}
                      </strong>
                    </div>
                  </div>

                  <div className="performance-trend-chart">
                    {selectedInternalCampaignDailyData.length ===
                      0 ? (
                      <div className="performance-empty">
                        {t('operator.performance.empty.dailyData')}
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
                              `${Math.round(Number(value)).toLocaleString()}${t('operator.performance.units.currencySuffix')}`
                            }
                          />

                          <Legend />

                          <Line
                            type="monotone"
                            dataKey="spend"
                            name={t('fields.spend')}
                            dot={false}
                          />

                          <Line
                            type="monotone"
                            dataKey="revenue"
                            name={t('fields.revenue')}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="client-campaign-content-section">
                    <div className="channel-performance-header">
                      <div>
                        <h2>{t('operator.performance.detail.creativePerformance')}</h2>

                        <span>
                          {t('operator.performance.sort.roasDesc')}
                        </span>
                      </div>
                    </div>

                    {selectedInternalCampaignContentData.length ===
                      0 ? (
                      <div className="performance-empty">
                        {t('operator.performance.empty.creativePerformance')}
                      </div>
                    ) : (
                      <div className="channel-performance-table-wrapper">
                        <table className="channel-performance-table">
                          <thead>
                            <tr>
                              <th>{t('operator.performance.table.creative')}</th>
                              <th>{t('fields.spend')}</th>
                              <th>{t('fields.revenue')}</th>
                              <th>ROAS</th>
                              <th>CPA</th>
                              <th>CTR</th>
                              <th>{t('fields.conversions')}</th>
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
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.revenue
                                    ).toLocaleString()}
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {row.roas.toFixed(1)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.cpa
                                    ).toLocaleString()}
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {row.ctr.toFixed(2)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.conversions
                                    ).toLocaleString()}
                                    {t('operator.performance.units.countSuffix')}
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
                    <h2>{t('operator.performance.rankings.product')}</h2>
                    <span>{t('operator.performance.common.currentFilter')}</span>
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
                      {t('operator.performance.sort.roasDesc')}
                    </option>

                    <option value="spend_desc">
                      {t('operator.performance.sort.spendDesc')}
                    </option>

                    <option value="revenue_desc">
                      {t('operator.performance.sort.revenueDesc')}
                    </option>

                    <option value="cpa_asc">
                      {t('operator.performance.sort.cpaAsc')}
                    </option>

                    <option value="conversions_desc">
                      {t('operator.performance.sort.conversionsDesc')}
                    </option>
                  </select>
                </div>

                <div className="channel-performance-table-wrapper">
                  <table className="channel-performance-table">
                    <thead>
                      <tr>
                        <th>{t('operator.performance.table.rank')}</th>
                        <th>{t('operator.performance.table.product')}</th>
                        <th>{t('fields.spend')}</th>
                        <th>{t('fields.revenue')}</th>
                        <th>{t('fields.conversions')}</th>
                        <th>{t('fields.clicks')}</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CPC</th>
                        <th>CTR</th>
                        <th>CVR</th>
                        <th>CPM</th>
                        <th>{t('operator.performance.table.spendShare')}</th>
                        <th>{t('operator.performance.table.revenueShare')}</th>
                        <th>{t('operator.performance.table.contributionGap')}</th>
                        <th>{t('operator.performance.table.diagnosis')}</th>
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
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.revenue
                              ).toLocaleString()}
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.conversions
                              ).toLocaleString()}
                              {t('operator.performance.units.countSuffix')}
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
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.cpc
                              ).toLocaleString()}
                              {t('operator.performance.units.currencySuffix')}
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
                              {t('operator.performance.units.currencySuffix')}
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
                                  {getPerformanceDiagnosisStatus(item.status)}
                                </span>

                                <small>
                                  {getPerformanceDiagnosisReason(item.reason)}
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
                      <h2>{t('operator.performance.detail.product')}</h2>

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
                      {t('operator.performance.common.close')}
                    </button>
                  </div>

                  <div className="client-campaign-detail-metrics">
                    <div>
                      <span>{t('fields.spend')}</span>
                      <strong>
                        {Math.round(
                          selectedInternalProductData.spend
                        ).toLocaleString()}
                        {t('operator.performance.units.currencySuffix')}
                      </strong>
                    </div>

                    <div>
                      <span>{t('fields.revenue')}</span>
                      <strong>
                        {Math.round(
                          selectedInternalProductData.revenue
                        ).toLocaleString()}
                        {t('operator.performance.units.currencySuffix')}
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
                        {t('operator.performance.units.currencySuffix')}
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
                      <span>{t('fields.conversions')}</span>
                      <strong>
                        {Math.round(
                          selectedInternalProductData.conversions
                        ).toLocaleString()}
                        {t('operator.performance.units.countSuffix')}
                      </strong>
                    </div>
                  </div>

                  <div className="performance-trend-chart">
                    {selectedInternalProductDailyData.length ===
                      0 ? (
                      <div className="performance-empty">
                        {t('operator.performance.empty.dailyData')}
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
                            name={t('fields.spend')}
                            dot={false}
                          />

                          <Line
                            type="monotone"
                            dataKey="revenue"
                            name={t('fields.revenue')}
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
                          {t('operator.performance.detail.channelCampaignPerformance')}
                        </h2>

                        <span>
                          {t('operator.performance.sort.roasDesc')}
                        </span>
                      </div>
                    </div>

                    {selectedInternalProductCampaignData.length ===
                      0 ? (
                      <div className="performance-empty">
                        {t('operator.performance.empty.campaignPerformance')}
                      </div>
                    ) : (
                      <div className="channel-performance-table-wrapper">
                        <table className="channel-performance-table">
                          <thead>
                            <tr>
                              <th>{t('operator.performance.table.channel')}</th>
                              <th>{t('operator.performance.table.campaign')}</th>
                              <th>{t('fields.spend')}</th>
                              <th>{t('fields.revenue')}</th>
                              <th>ROAS</th>
                              <th>CPA</th>
                              <th>CTR</th>
                              <th>{t('fields.conversions')}</th>
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
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.revenue
                                    ).toLocaleString()}
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {row.roas.toFixed(1)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.cpa
                                    ).toLocaleString()}
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {row.ctr.toFixed(2)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.conversions
                                    ).toLocaleString()}
                                    {t('operator.performance.units.countSuffix')}
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
                    <h2>{t('operator.performance.rankings.content')}</h2>

                    <span>
                      {t('operator.performance.common.currentFilter')}
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
                      {t('operator.performance.sort.roasDesc')}
                    </option>

                    <option value="spend_desc">
                      {t('operator.performance.sort.spendDesc')}
                    </option>

                    <option value="revenue_desc">
                      {t('operator.performance.sort.revenueDesc')}
                    </option>

                    <option value="cpa_asc">
                      {t('operator.performance.sort.cpaAsc')}
                    </option>

                    <option value="conversions_desc">
                      {t('operator.performance.sort.conversionsDesc')}
                    </option>
                  </select>
                </div>

                <div className="channel-performance-table-wrapper">
                  <table className="channel-performance-table">
                    <thead>
                      <tr>
                        <th>{t('operator.performance.table.rank')}</th>
                        <th>{t('operator.performance.table.content')}</th>
                        <th>{t('fields.spend')}</th>
                        <th>{t('fields.revenue')}</th>
                        <th>{t('fields.conversions')}</th>
                        <th>{t('fields.clicks')}</th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CPC</th>
                        <th>CTR</th>
                        <th>CVR</th>
                        <th>CPM</th>
                        <th>{t('operator.performance.table.spendShare')}</th>
                        <th>{t('operator.performance.table.revenueShare')}</th>
                        <th>{t('operator.performance.table.contributionGap')}</th>
                        <th>{t('operator.performance.table.diagnosis')}</th>
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
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.revenue
                              ).toLocaleString()}
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.conversions
                              ).toLocaleString()}
                              {t('operator.performance.units.countSuffix')}
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
                              {t('operator.performance.units.currencySuffix')}
                            </td>

                            <td>
                              {Math.round(
                                item.cpc
                              ).toLocaleString()}
                              {t('operator.performance.units.currencySuffix')}
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
                              {t('operator.performance.units.currencySuffix')}
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
                                  {getPerformanceDiagnosisStatus(item.status)}
                                </span>

                                <small>
                                  {getPerformanceDiagnosisReason(item.reason)}
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
                      <h2>{t('operator.performance.detail.content')}</h2>

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
                      {t('operator.performance.common.close')}
                    </button>
                  </div>

                  <div className="client-campaign-detail-metrics">
                    <div>
                      <span>{t('fields.spend')}</span>

                      <strong>
                        {Math.round(
                          selectedInternalContentData.spend
                        ).toLocaleString()}
                        {t('operator.performance.units.currencySuffix')}
                      </strong>
                    </div>

                    <div>
                      <span>{t('fields.revenue')}</span>

                      <strong>
                        {Math.round(
                          selectedInternalContentData.revenue
                        ).toLocaleString()}
                        {t('operator.performance.units.currencySuffix')}
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
                        {t('operator.performance.units.currencySuffix')}
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
                      <span>{t('fields.conversions')}</span>

                      <strong>
                        {Math.round(
                          selectedInternalContentData.conversions
                        ).toLocaleString()}
                        {t('operator.performance.units.countSuffix')}
                      </strong>
                    </div>
                  </div>

                  <div className="performance-trend-chart">
                    {selectedInternalContentDailyData.length === 0 ? (
                      <div className="performance-empty">
                        {t('operator.performance.empty.dailyData')}
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
                            name={t('fields.spend')}
                            dot={false}
                          />

                          <Line
                            type="monotone"
                            dataKey="revenue"
                            name={t('fields.revenue')}
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
                          {t('operator.performance.detail.channelCampaignProductPerformance')}
                        </h2>

                        <span>
                          {t('operator.performance.sort.roasDesc')}
                        </span>
                      </div>
                    </div>

                    {selectedInternalContentBreakdownData.length === 0 ? (
                      <div className="performance-empty">
                        {t('operator.performance.empty.detailPerformance')}
                      </div>
                    ) : (
                      <div className="channel-performance-table-wrapper">
                        <table className="channel-performance-table">
                          <thead>
                            <tr>
                              <th>{t('operator.performance.table.channel')}</th>
                              <th>{t('operator.performance.table.campaign')}</th>
                              <th>{t('operator.performance.table.product')}</th>
                              <th>{t('fields.spend')}</th>
                              <th>{t('fields.revenue')}</th>
                              <th>ROAS</th>
                              <th>CPA</th>
                              <th>CTR</th>
                              <th>{t('fields.conversions')}</th>
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
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.revenue
                                    ).toLocaleString()}
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {row.roas.toFixed(1)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.cpa
                                    ).toLocaleString()}
                                    {t('operator.performance.units.currencySuffix')}
                                  </td>

                                  <td>
                                    {row.ctr.toFixed(2)}%
                                  </td>

                                  <td>
                                    {Math.round(
                                      row.conversions
                                    ).toLocaleString()}
                                    {t('operator.performance.units.countSuffix')}
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
                {t('operator.dashboard.fields.title')}
              </h2>

              <p>
                {t('operator.dashboard.fields.dragHint')}
              </p>


              <h3>
                {t('operator.dashboard.fields.dimensions')}
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

                    {getTranslatedFieldLabel(field.key)}
                  </button>
                )
              )}


              <h3>
                {t('operator.dashboard.fields.metrics')}
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

                    {getTranslatedFieldLabel(field.key)}
                  </button>
                )
              )}

            </aside>


            <section className="chart-builder">

              <div className="builder-header">

                <h2>
                  {t('operator.dashboard.builder.title')}
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
                      {t('operator.dashboard.chartTypes.line')}
                    </option>

                    <option value="bar">
                      {t('operator.dashboard.chartTypes.bar')}
                    </option>

                    <option value="scatter">
                      {t('operator.dashboard.chartTypes.scatter')}
                    </option>

                    <option value="donut">
                      {t('operator.dashboard.chartTypes.donut')}
                    </option>

                    <option value="kpi">{t('operator.dashboard.chartTypes.kpi')}</option>

                    <option value="table">
                      {t('operator.dashboard.chartTypes.table')}
                    </option>
                  </select>




                  <button
                    type="button"
                    onClick={
                      resetBuilder
                    }
                  >
                    {t('operator.dashboard.builder.reset')}
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
                    {t('operator.dashboard.builder.xAxis')}
                  </strong>


                  {xField ? (
                    <div className="field-chip">
                      {getTranslatedFieldLabel(xField)}

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
                      {t('operator.dashboard.builder.dropDimension')}
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
                    {t('operator.dashboard.builder.yAxis')}
                  </strong>


                  <div className="chip-list">

                    {
                      yFields.length === 0
                      && (
                        <span>
                          {t('operator.dashboard.builder.dropMetric')}
                        </span>
                      )
                    }


                    {yFields.map(
                      (field) => (
                        <div
                          key={field}
                          className="field-chip"
                        >
                          {getTranslatedFieldLabel(field)}

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
                    {t('operator.dashboard.builder.groupColor')}
                  </strong>


                  {groupField ? (
                    <div className="field-chip">
                      {getTranslatedFieldLabel(
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
                      {t('operator.dashboard.builder.dropDimension')}
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
                    {t('operator.dashboard.builder.filter')}
                  </strong>

                  {filterField ? (
                    <>
                      <div className="field-chip">
                        {getTranslatedFieldLabel(filterField)}

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
                          {t('common.all')}
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
                      {t('operator.dashboard.builder.dropDimension')}
                    </span>
                  )}
                </div>


                <div className="drop-zone">
                  <strong>
                    {t('operator.dashboard.builder.tooltip')}
                  </strong>

                  <span>
                    {t('operator.dashboard.builder.tooltipAuto')}
                  </span>
                </div>


                <div className="drop-zone">
                  <strong>
                    {t('operator.dashboard.builder.size')}
                  </strong>

                  <span>
                    {t('operator.dashboard.builder.comingSoon')}
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

                          ? buildAutoChartTitle(
                            xField,
                            yFields
                          )

                          : t('operator.dashboard.preview.emptyTitle')
                      }
                    </h3>


                    <p>
                      {
                        groupField
                          ? t('operator.dashboard.preview.groupedBy', {
                            field: getTranslatedFieldLabel(groupField),
                          })
                          : t('operator.dashboard.preview.noGroup')
                      }
                    </p>
                  </div>

                </div>


                {renderChart()}

              </div>

            </section>


            <aside className="settings-panel">



              <h2>
                {t('operator.dashboard.settings.title')}
              </h2>

              <div className="chart-setting-group">
                <button
                  type="button"
                  className="chart-setting-group-title"
                  onClick={() =>
                    setInfoOpen((current) => !current)
                  }
                >
                  <span>{t('operator.dashboard.settings.chartInfo')}</span>
                  <span>
                    {infoOpen ? '−' : '+'}
                  </span>
                </button>

                {infoOpen && (
                  <div className="chart-setting-group-content">

                    <div className="field-section">
                      <label>{t('operator.dashboard.settings.chartTitle')}</label>

                      <input
                        type="text"
                        value={chartTitle}
                        onChange={(e) =>
                          setChartTitle(e.target.value)
                        }
                        placeholder={t('operator.dashboard.settings.chartTitlePlaceholder')}
                      />
                    </div>

                    <div className="field-section">
                      <label>{t('operator.dashboard.settings.chartDescription')}</label>

                      <textarea
                        value={chartDescription}
                        onChange={(e) =>
                          setChartDescription(e.target.value)
                        }
                        placeholder={t('operator.dashboard.settings.chartDescriptionPlaceholder')}
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
                  <span>{t('operator.dashboard.settings.dataSettings')}</span>
                  <span>
                    {dataOpen ? '−' : '+'}
                  </span>
                </button>

                {dataOpen && (
                  <div className="chart-setting-group-content">

                    <div className="field-section">
                      <label>{t('operator.dashboard.settings.sort')}</label>

                      <select
                        value={sortOrder}
                        onChange={(e) =>
                          setSortOrder(e.target.value)
                        }
                      >
                        <option value="none">
                          {t('operator.dashboard.settings.sortDefault')}
                        </option>

                        <option value="desc">
                          {t('operator.dashboard.settings.sortDesc')}
                        </option>

                        <option value="asc">
                          {t('operator.dashboard.settings.sortAsc')}
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
                          {t('common.all')}
                        </option>

                        <option value="5">
                          {t('operator.dashboard.settings.top5')}
                        </option>

                        <option value="10">
                          {t('operator.dashboard.settings.top10')}
                        </option>

                        <option value="20">
                          {t('operator.dashboard.settings.top20')}
                        </option>
                      </select>
                    </div>

                    <div className="field-section">
                      <label>{t('operator.dashboard.settings.aggregation')}</label>

                      <select
                        value={aggregation}
                        onChange={(e) =>
                          setAggregation(e.target.value)
                        }
                      >
                        <option value="sum">
                          {t('operator.dashboard.settings.sum')}
                        </option>

                        <option value="avg">
                          {t('operator.dashboard.settings.average')}
                        </option>

                        <option value="max">
                          {t('operator.dashboard.settings.maximum')}
                        </option>

                        <option value="min">
                          {t('operator.dashboard.settings.minimum')}
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
                  <span>{t('operator.dashboard.settings.displayFormat')}</span>
                  <span>
                    {displayOpen ? '−' : '+'}
                  </span>
                </button>

                {displayOpen && (
                  <div className="chart-setting-group-content">

                    <div className="field-section">
                      <label>{t('operator.dashboard.settings.numberDisplay')}</label>

                      <select
                        value={numberFormat}
                        onChange={(e) =>
                          setNumberFormat(e.target.value)
                        }
                      >
                        <option value="auto">
                          {t('operator.dashboard.settings.auto')}
                        </option>

                        <option value="full">
                          {t('operator.dashboard.settings.fullNumber')}
                        </option>

                        <option value="compact">
                          {t('operator.dashboard.settings.compact')}
                        </option>

                        {[
                          'spend',
                          'revenue',
                          'cpc',
                          'cpa',
                        ].includes(primaryMetric) && (
                            <option value="currency">
                              {t('operator.dashboard.settings.currency')}
                            </option>
                          )}

                        {[
                          'ctr',
                          'cvr',
                        ].includes(primaryMetric) && (
                            <option value="percent">
                              {t('operator.dashboard.settings.percent')}
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
                          {t('operator.dashboard.settings.showLegend')}
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
                            {t('operator.dashboard.settings.showXAxis')}
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
                            {t('operator.dashboard.settings.showYAxis')}
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
                  {t('operator.dashboard.actions.cancelEdit')}
                </button>
              )}

              <button
                type="button"
                onClick={addChartToDashboard}
                className="add-dashboard-button"
              >
                {editingChartId
                  ? t('operator.dashboard.actions.finishEdit')
                  : t('operator.dashboard.actions.addToDashboard')}
              </button>

            </aside>



          </main>

          <section className="saved-dashboard">

            <div className="saved-dashboard-toolbar">

              <div className="saved-dashboard-title-area">
                <h2>
                  {t('operator.dashboard.saved.title')}
                </h2>

                <span>
                  {t('operator.dashboard.saved.chartCount', {
                    count: savedCharts.length,
                  })}
                </span>
              </div>

              <div className="saved-dashboard-toolbar-actions">

                <div className="dashboard-layout-controls">

                  <div className="dashboard-control-group">
                    <span className="dashboard-control-label">
                      {t('operator.dashboard.saved.cardSize')}
                    </span>

                    <select
                      value={dashboardCardSize}
                      onChange={(e) =>
                        setDashboardCardSize(e.target.value)
                      }
                    >
                      <option value="small">
                        {t('operator.dashboard.saved.smallCard')}
                      </option>

                      <option value="medium">
                        {t('operator.dashboard.saved.defaultCard')}
                      </option>

                      <option value="large">
                        {t('operator.dashboard.saved.largeCard')}
                      </option>
                    </select>
                  </div>

                  <div className="dashboard-control-group">
                    <span className="dashboard-control-label">
                      {t('operator.dashboard.saved.columns')}
                    </span>

                    <select
                      value={dashboardColumns}
                      onChange={(e) =>
                        setDashboardColumns(e.target.value)
                      }
                    >
                      <option value="1">
                        {t('operator.dashboard.saved.oneColumn')}
                      </option>

                      <option value="2">
                        {t('operator.dashboard.saved.twoColumns')}
                      </option>

                      <option value="3">
                        {t('operator.dashboard.saved.threeColumns')}
                      </option>
                    </select>
                  </div>

                  <button
                    type="button"
                    className="dashboard-auto-arrange-button"
                    onClick={autoArrangeCharts}
                  >
                    {t('operator.dashboard.saved.autoArrange')}
                  </button>

                </div>

                <button
                  type="button"
                  className="dashboard-reset-button"
                  onClick={resetDashboard}
                  title={t('operator.dashboard.saved.resetDashboard')}
                  aria-label={t('operator.dashboard.saved.resetDashboard')}
                >
                  🗑️
                </button>

              </div>

            </div>





            {
              savedCharts.length === 0 ? (
                <div className="saved-empty">
                  {t('operator.dashboard.saved.empty')}
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
                              ? t('operator.dashboard.saved.groupLabel', {
                                field: getTranslatedFieldLabel(chart.groupField),
                              })
                              : t('operator.dashboard.preview.noGroup')}
                          </p>
                        </div>

                        <div className="saved-chart-actions">
                          <button
                            type="button"
                            onClick={() =>
                              editSavedChart(chart)
                            }
                          >
                            {t('operator.dashboard.saved.editSettings')}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              duplicateChart(chart)
                            }
                          >
                            {t('common.duplicate')}
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
                            {t('common.delete')}
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
                            title={t('operator.dashboard.saved.moveChart')}
                          >
                            ⠿
                          </button>
                        </div>
                      </div>

                      <div className="saved-chart-summary">
                        <span>
                          {t('operator.dashboard.saved.chartType')}: {getChartTypeLabel(chart.chartType)}
                        </span>

                        {chart.xField && (
                          <span>
                            {t('operator.dashboard.builder.xAxis')}: {getTranslatedFieldLabel(chart.xField)}
                          </span>
                        )}

                        <span>
                          {t('operator.dashboard.builder.yAxis')}:{' '}
                          {chart.yFields
                            .map(getTranslatedFieldLabel)
                            .join(', ')}
                        </span>

                        {chart.filterField && (
                          <span>
                            {t('operator.dashboard.builder.filter')}:{' '}
                            {getTranslatedFieldLabel(chart.filterField)}
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
                {t('operator.alerts.header.title')}
              </h2>

              <p>
                {t('operator.alerts.header.description')}
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
                ? t('operator.alerts.header.loading')
                : t('operator.alerts.header.refresh')}
            </button>
          </div>


          <div className="anomaly-alert-summary">

            <div className="anomaly-summary-card">
              <span>
                {t('operator.alerts.summary.open')}
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
                {t('operator.alerts.summary.critical')}
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
                {t('operator.alerts.summary.warning')}
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
                {t('operator.alerts.summary.acknowledged')}
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
              {t('operator.alerts.empty.loading')}
            </div>

          ) : anomalyAlerts.length === 0 ? (

            <div className="anomaly-alert-empty">
              {t('operator.alerts.empty.none')}
            </div>

          ) : (

            <div className="anomaly-alert-list">

              {anomalyAlerts.map(
                (alert) => {

                  const isCritical =
                    alert.severity ===
                    'critical'

                  const metricLabel =
                    t(
                      `fields.${alert.metric}`,
                      {
                        defaultValue:
                          String(
                            alert.metric || '-'
                          ).toUpperCase(),
                      }
                    )

                  const guidance =
                    getAnomalyGuidance(
                      alert,
                      t
                    )

                  const alertStatusKey =
                    alert.status === 'acknowledged'
                      ? 'acknowledged'
                      : alert.status === 'resolved'
                        ? 'resolved'
                        : 'open'

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
                              ? t('operator.alerts.severity.critical')
                              : t('operator.alerts.severity.warning')}
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
                                {t('operator.alerts.actions.acknowledge')}
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
                                {t('operator.alerts.actions.resolve')}
                              </button>
                            )}

                        </div>
                      </div>


                      <div className="anomaly-alert-card-body">

                        <div className="anomaly-alert-title">
                          <strong>
                            {i18n.language === 'en'
                              ? t(
                                'operator.alerts.card.anomalyTitle',
                                { metric: metricLabel }
                              )
                              : alert.title ||
                              t(
                                'operator.alerts.card.anomalyTitle',
                                { metric: metricLabel }
                              )}
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
                                {t('operator.alerts.scope.campaign')} ·{' '}
                                {
                                  alert.campaignName ||
                                  alert.campaignId ||
                                  '-'
                                }
                              </>
                            )
                            : (
                              <>
                                {t('operator.alerts.scope.channel')} ·{' '}
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
                              {t('operator.alerts.time.performanceDate')}
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
                              {t('operator.alerts.time.firstDetected')}
                            </span>

                            <strong>
                              {
                                formatAlertDateTime(
                                  alert.createdAt,
                                  i18n.language
                                )
                              }
                            </strong>
                          </div>

                          <div>
                            <span>
                              {t('operator.alerts.time.lastChecked')}
                            </span>

                            <strong>
                              {
                                formatAlertDateTime(
                                  alert.updatedAt,
                                  i18n.language
                                )
                              }
                            </strong>
                          </div>

                        </div>


                        <div className="anomaly-alert-metrics">

                          <div>
                            <span>
                              {t('operator.alerts.metrics.metric')}
                            </span>

                            <strong>
                              {metricLabel}
                            </strong>
                          </div>

                          <div>
                            <span>
                              {t('operator.alerts.metrics.baseline')}
                            </span>

                            <strong>
                              {Number(
                                alert.baselineValue ??
                                0
                              ).toLocaleString(
                                i18n.language === 'en'
                                  ? 'en-US'
                                  : 'ko-KR',
                                {
                                  maximumFractionDigits:
                                    2,
                                }
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              {t('operator.alerts.metrics.current')}
                            </span>

                            <strong>
                              {Number(
                                alert.currentValue ??
                                0
                              ).toLocaleString(
                                i18n.language === 'en'
                                  ? 'en-US'
                                  : 'ko-KR',
                                {
                                  maximumFractionDigits:
                                    2,
                                }
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              {t('operator.alerts.metrics.changeRate')}
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
                              {t('operator.alerts.metrics.robustZ')}
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
                          {getAnomalyDisplayMessage(
                            alert,
                            t,
                            i18n.language,
                            metricLabel
                          )}
                        </p>

                        <div className="anomaly-guidance">

                          <div className="anomaly-guidance-block">

                            <strong className="anomaly-guidance-title">
                              {t('operator.alerts.guidance.possibleCausesTitle')}
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
                              {t('operator.alerts.guidance.recommendedActionsTitle')}
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
                            {t('operator.alerts.footer.status')}:{' '}
                            {t(
                              `operator.alerts.status.${alertStatusKey}`
                            )}
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
                {t('operator.budget.header.title')}
              </h2>

              <span>
                {t('operator.budget.header.description')}
              </span>
            </div>

            <span className="optimization-shadow-badge">
              {t('operator.budget.header.shadowOnly')}
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
                ? t('operator.budget.modes.naverCampaign')
                : t('operator.budget.modes.campaign')}
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
              {t('operator.budget.modes.channel')}
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
              {t('operator.budget.scaling.title')}
            </button>
          </div>

          {optimizationMode === 'naverCampaign' && (
            <div className="naver-campaign-optimization">
              <div className="naver-optimization-settings">
                <div className="naver-setting-item">
                  <label>
                    {t('operator.budget.campaign.objective')}
                  </label>

                  <strong>
                    {t('operator.budget.campaign.maximizeRevenue')}
                  </strong>

                  <small>
                    {t('operator.budget.campaign.responseCurveBased')}
                  </small>
                </div>

                <div className="naver-setting-item">
                  <label>
                    {t('operator.budget.campaign.changeLimit')}
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
                    {t('operator.budget.campaign.executionMode')}
                  </label>

                  <strong>
                    {t('operator.budget.campaign.recommendationOnly')}
                  </strong>

                  <small>
                    {performanceDataSource ===
                      'mock'
                      ? t('operator.budget.campaign.mockNoImpact')
                      : t('operator.budget.campaign.naverNoChange')}
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
                  ? t('operator.budget.campaign.calculating')
                  : t('operator.budget.campaign.run')}
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
                          {t('operator.budget.campaign.preparing')}
                        </span>

                        <h3>
                          {t('operator.budget.campaign.pending')}
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
                          {t('operator.budget.campaign.conversionValidStart')}
                        </span>

                        <strong>
                          {naverPreviewResult
                            .revenueValidStartDate ||
                            '-'}
                        </strong>
                      </div>

                      <div>
                        <span>
                          {t('operator.budget.campaign.validData')}
                        </span>

                        <strong>
                          {naverPreviewResult
                            .validRevenueDays ?? 0}
                          {t('operator.budget.common.days')}
                        </strong>
                      </div>

                      <div>
                        <span>
                          {t('operator.budget.campaign.minimumData')}
                        </span>

                        <strong>
                          {naverPreviewResult
                            .minimumValidTotalDays ??
                            0}
                          {t('operator.budget.common.days')}
                        </strong>
                      </div>

                      <div>
                        <span>
                          {t('operator.budget.campaign.additionalNeeded')}
                        </span>

                        <strong>
                          {naverPreviewResult
                            .remainingValidDays ?? 0}
                          {t('operator.budget.common.days')}
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
                        {t('operator.budget.campaign.currentTotalDailyBudget')}
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
                        {t('client.common.currency')}
                      </strong>
                    </div>

                    <div>
                      <span>
                        {t('operator.budget.campaign.recommendedTotalDailyBudget')}
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
                        {t('client.common.currency')}
                      </strong>
                    </div>

                    <div>
                      <span>
                        {t('operator.budget.campaign.expectedLift')}
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
                        {t('operator.budget.campaign.eligible')}
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
                          {t('operator.budget.campaign.recommendationTitle')}
                        </h3>

                        <p>
                          {t('operator.budget.campaign.recommendationDescription')}
                        </p>
                      </div>

                      <span className="campaign-recommendation-source">
                        {performanceDataSource ===
                          'mock'
                          ? t('operator.budget.campaign.sourceMock')
                          : t('operator.budget.campaign.sourceNaver')}
                      </span>
                    </div>

                    <div className="campaign-recommendation-table-wrap">
                      <table className="campaign-recommendation-table">
                        <thead>
                          <tr>
                            <th>
                              {t('operator.budget.common.campaign')}
                            </th>

                            <th>
                              {t('operator.budget.common.currentBudget')}
                            </th>

                            <th>
                              {t('operator.budget.common.recommendedBudget')}
                            </th>

                            <th>
                              {t('operator.budget.common.adjustment')}
                            </th>

                            <th>
                              {t('operator.budget.common.recommendedAction')}
                            </th>

                            <th>
                              {t('operator.budget.common.rationale')}
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
                                t('operator.budget.campaign.hold')

                              let actionClass =
                                'hold'

                              if (
                                safetyAction ===
                                'REVIEW'
                              ) {
                                recommendationAction =
                                  t('operator.budget.campaign.reviewHold')

                                actionClass =
                                  'review'

                              } else if (
                                safetyAction ===
                                'HOLD_CURRENT'
                              ) {
                                recommendationAction =
                                  t('operator.budget.campaign.keepCurrent')

                                actionClass =
                                  'hold'

                              } else if (
                                changePct > 0.05
                              ) {
                                recommendationAction =
                                  t('operator.budget.campaign.increase')

                                actionClass =
                                  'increase'

                              } else if (
                                changePct < -0.05
                              ) {
                                recommendationAction =
                                  t('operator.budget.campaign.decrease')

                                actionClass =
                                  'decrease'
                              }

                              let recommendationReason =
                                t('operator.budget.campaign.reasonHold')

                              if (
                                safetyAction ===
                                'REVIEW'
                              ) {
                                recommendationReason =
                                  safetyReasons.includes(
                                    'SLOPE_SENSITIVE'
                                  )
                                    ? t('operator.budget.campaign.reasonSlopeSensitive')
                                    : t('operator.budget.campaign.reasonSafetyReview')

                              } else if (
                                safetyAction ===
                                'HOLD_CURRENT'
                              ) {
                                recommendationReason =
                                  safetyReasons.includes(
                                    'NO_VALIDATION_GAIN_VS_TRAIN_MEAN'
                                  )
                                    ? t('operator.budget.campaign.reasonNoValidationGain')
                                    : safetyReasons.includes(
                                      'INSUFFICIENT_HISTORY'
                                    )
                                      ? t('operator.budget.campaign.reasonInsufficientHistory')
                                      : t('operator.budget.campaign.reasonSafetyGate')

                              } else if (
                                changePct > 0.05
                              ) {
                                recommendationReason =
                                  t('operator.budget.campaign.reasonIncrease', {
                                    change: Math.abs(changePct).toFixed(1),
                                  })

                              } else if (
                                changePct < -0.05
                              ) {
                                recommendationReason =
                                  t('operator.budget.campaign.reasonDecrease', {
                                    change: Math.abs(changePct).toFixed(1),
                                  })
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
                                    {t('client.common.currency')}
                                  </td>

                                  <td className="campaign-recommendation-budget">
                                    <strong>
                                      {Math.round(
                                        recommendedBudget
                                      ).toLocaleString()}
                                      {t('client.common.currency')}
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
                                        {t('operator.budget.campaign.modelDetails')}
                                      </summary>

                                      <div className="campaign-model-detail-grid">
                                        <div>
                                          <span>
                                            {t('operator.budget.campaign.preSafetyCandidate')}
                                          </span>

                                          <strong>
                                            {Math.round(
                                              candidateBudget
                                            ).toLocaleString()}
                                            {t('client.common.currency')}
                                          </strong>
                                        </div>

                                        <div>
                                          <span>
                                            {t('operator.budget.common.expectedRevenue')}
                                          </span>

                                          <strong>
                                            {Number.isFinite(
                                              expectedRevenue
                                            )
                                              ? `${Math.round(
                                                expectedRevenue
                                              ).toLocaleString()}${t('client.common.currency')}`
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
                                            {t('operator.budget.campaign.safetyDecision')}
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
                                            {t('operator.budget.campaign.rawDiagnostics')}
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
                      {t('operator.budget.scaling.title')}
                    </h3>

                    <p>
                      {t('operator.budget.scaling.description')}
                    </p>
                  </div>
                </div>

                <div className="budget-scaling-summary">
                  <div className="budget-scaling-summary-card">
                    <span>
                      {t('operator.budget.scaling.currentTargetDailyBudget')}
                    </span>

                    <strong>
                      {Math.round(
                        Number(
                          displayedCampaignBudgetPolicyMeta
                            ?.optimizationCurrentTotalDailyBudget
                        ) || 0
                      ).toLocaleString()}
                      {t('client.common.currency')}
                    </strong>
                  </div>

                  <div className="budget-scaling-summary-card">
                    <span>
                      {t('operator.budget.scaling.scenarioCount')}
                    </span>

                    <strong>
                      {
                        budgetScalingMultipliers
                          .length
                      }
                      {t('operator.budget.common.campaigns')}
                    </strong>
                  </div>

                  <div className="budget-scaling-summary-card">
                    <span>
                      {t('operator.budget.scaling.allowedRange')}
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
                              ? t('operator.budget.common.current')
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
                            {t('client.common.currency')}
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
                    ? t('operator.budget.scaling.analyzing')
                    : t('operator.budget.scaling.run')}
                </button>

                <div className="budget-scaling-decision-summary">
                  <div className="budget-scaling-decision-card">
                    <span>
                      {t('operator.budget.scaling.currentOperatingBudget')}
                    </span>

                    <strong>
                      {Math.round(
                        budgetScalingKpis
                          .currentBudget
                      ).toLocaleString()}
                      {t('client.common.currency')}
                    </strong>

                    <small>
                      {t('operator.budget.scaling.eligibleCampaignBasis')}
                    </small>
                  </div>

                  <div className="budget-scaling-decision-card">
                    <span>
                      {t('operator.budget.scaling.increaseRange')}
                    </span>

                    <strong>
                      {getBudgetScalingLabel(
                        budgetScalingKpis.expansionLabel
                      )}
                    </strong>

                    <small>
                      {Number.isFinite(
                        budgetScalingKpis
                          .expansionBudget
                      )
                        ? `${Math.round(
                          budgetScalingKpis
                            .expansionBudget
                        ).toLocaleString()}${t('client.common.currency')}`
                        : t('operator.budget.scaling.waitingTraining')}
                    </small>
                  </div>

                  <div className="budget-scaling-decision-card">
                    <span>
                      {t('operator.budget.scaling.slowdownStart')}
                    </span>

                    <strong>
                      {getBudgetScalingLabel(
                        budgetScalingKpis.slowdownLabel
                      )}
                    </strong>

                    <small>
                      {Number.isFinite(
                        budgetScalingKpis
                          .slowdownBudget
                      )
                        ? `${Math.round(
                          budgetScalingKpis
                            .slowdownBudget
                        ).toLocaleString()}${t('client.common.currency')}`
                        : budgetScalingKpis
                          .slowdownLabel ===
                          '범위 내 미감지'
                          ? t('operator.budget.scaling.basedOnCurrentRange')
                          : t('operator.budget.scaling.waitingTraining')}
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
                        {t('operator.budget.scaling.scenarioComparison')}
                      </h4>

                      <div className="budget-scaling-table">
                        <div className="budget-scaling-table-header">
                          <span>
                            {t('operator.budget.scaling.change')}
                          </span>

                          <span>
                            {t('operator.budget.scaling.dailyBudget')}
                          </span>

                          <span>
                            {t('operator.budget.common.expectedRevenue')}
                          </span>

                          <span>
                            {t('operator.budget.common.expectedRoas')}
                          </span>

                          <span>
                            {t('operator.budget.scaling.incrementalRevenue')}
                          </span>

                          <span>
                            {t('operator.budget.scaling.marginalRoas')}
                          </span>

                          <span>
                            {t('operator.budget.scaling.efficiencyAssessment')}
                          </span>

                          <span>
                            {t('operator.budget.scaling.analysisStatus')}
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
                                ? t('operator.budget.scaling.infeasible')
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
                                      ? t('operator.budget.scaling.efficiencyMaintained')
                                      : t('operator.budget.scaling.efficiencySlowdown')
                                  )
                                  : '-'

                            const statusLabel =
                              isOk
                                ? t('operator.budget.scaling.analysisComplete')
                                : blockCode ===
                                  'INSUFFICIENT_VALID_REVENUE_HISTORY'
                                  ? (
                                    Number.isFinite(
                                      validRevenueDays
                                    ) &&
                                      Number.isFinite(
                                        minimumValidTotalDays
                                      )
                                      ? t('operator.budget.scaling.insufficientTrainingDays', {
                                        valid: validRevenueDays,
                                        minimum: minimumValidTotalDays,
                                      })
                                      : t('operator.budget.scaling.insufficientTraining')
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
                                    ? t('operator.budget.common.current')
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
                                  {t('client.common.currency')}
                                </strong>

                                <span>
                                  {isOk &&
                                    Number.isFinite(
                                      expectedRevenue
                                    )
                                    ? `${Math.round(
                                      expectedRevenue
                                    ).toLocaleString()}${t('client.common.currency')}`
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
                                    ).toLocaleString()}${t('client.common.currency')}`
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
                                      t('operator.budget.scaling.efficiencyMaintained')
                                      ? 'budget-scaling-efficiency maintained'
                                      : efficiencyLabel ===
                                        t('operator.budget.scaling.efficiencySlowdown')
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
                              {t('operator.budget.scaling.responseCurveTitle')}
                            </h4>

                            <p>
                              {t('operator.budget.scaling.responseCurveDescription')}
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
                            {t('operator.budget.scaling.responseCurveWaiting')}
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
                                    ? t('operator.budget.common.current')
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
                                    ? t('operator.budget.common.current')
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
                                  ).toLocaleString()}${t('client.common.currency')}`
                                }
                                labelFormatter={(
                                  value
                                ) =>
                                  value === 0
                                    ? t('operator.budget.scaling.currentBudget')
                                    : t('operator.budget.scaling.relativeBudget', {
                                      change: `${value > 0 ? '+' : ''}${value}`,
                                    })
                                }
                              />

                              <Line
                                type="monotone"
                                dataKey="revenue"
                                name={t('operator.budget.common.expectedRevenue')}
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
                              {t('operator.budget.scaling.marginalTitle')}
                            </h4>

                            <p>
                              {t('operator.budget.scaling.marginalDescription')}
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
                            {t('operator.budget.scaling.marginalWaiting')}
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
                                    t('operator.budget.scaling.marginalRoas'),
                                  ]}
                                labelFormatter={(
                                  value
                                ) =>
                                  t('operator.budget.scaling.budgetRange', { change: Math.round(Number(value) || 0) })
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
                                        t('operator.budget.scaling.efficiencyThreshold', { value: budgetScalingEfficiencyThreshold.toFixed(0) }),
                                      position:
                                        'insideTopRight',
                                    }}
                                  />
                                )}

                              <Line
                                type="monotone"
                                dataKey="marginalRoas"
                                name={t('operator.budget.scaling.marginalRoas')}
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
                  {t('operator.budget.channel.totalBudget')}
                </label>

                <div className="budget-input-row">
                  <input
                    type="number"
                    min="0"
                    placeholder={t('operator.budget.channel.totalBudgetPlaceholder')}
                    value={optimizationBudget}
                    onChange={(event) =>
                      setOptimizationBudget(
                        event.target.value
                      )
                    }
                  />

                  <span>{t('client.common.currency')}</span>
                </div>
              </div>

              <div className="optimization-objective-group">
                <label>
                  {t('operator.budget.campaign.objective')}
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
                    {t('operator.budget.campaign.maximizeRevenue')}
                  </option>

                  <option value="conversions">
                    {t('operator.budget.channel.maximizeConversions')}
                  </option>

                  <option value="revenueWithRoas">
                    {t('operator.budget.channel.maximizeRevenueWithRoas')}
                  </option>

                  <option value="conversionsWithCpa">
                    {t('operator.budget.channel.maximizeConversionsWithCpa')}
                  </option>

                  <option value="riskAdjustedRevenue">
                    {t('operator.budget.channel.riskAdjustedRevenue')}
                  </option>


                </select>
              </div>

              {optimizationObjective === 'revenueWithRoas' && (
                <div className="optimization-target-group">
                  <label>
                    {t('operator.budget.channel.targetRoas')}
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
                    {t('operator.budget.channel.targetCpa')}
                  </label>

                  <div className="optimization-target-input">
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder={t('operator.budget.channel.targetCpaPlaceholder')}
                      value={targetCpa}
                      onChange={(event) =>
                        setTargetCpa(
                          event.target.value
                        )
                      }
                    />

                    <span>{t('client.common.currency')}</span>
                  </div>
                </div>
              )}

              {optimizationObjective === 'riskAdjustedRevenue' && (
                <div className="optimization-target-group">
                  <label>
                    {t('operator.budget.channel.riskTolerance')}
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
                      {t('operator.budget.channel.riskLow')}
                    </option>

                    <option value="medium">
                      {t('operator.budget.channel.riskMedium')}
                    </option>

                    <option value="high">
                      {t('operator.budget.channel.riskHigh')}
                    </option>
                  </select>
                </div>
              )}

              <div className="optimization-limit-group">
                <label>
                  {t('operator.budget.scaling.allowedRange')}
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
                        {t('operator.budget.channel.feasible')}
                      </strong>

                      <div>
                        {t('operator.budget.channel.feasibleRange')}
                        {' '}
                        {Math.round(
                          optimizationFeasibility.minimumFeasibleBudget *
                          optimizationPeriodDays
                        ).toLocaleString()}
                        {t('client.common.currency')}
                        {' ~ '}
                        {Math.round(
                          optimizationFeasibility.maximumFeasibleBudget *
                          optimizationPeriodDays
                        ).toLocaleString()}
                        {t('client.common.currency')}
                      </div>
                    </>
                  )}

                  {!optimizationFeasibility.isFeasible &&
                    !optimizationFeasibility.hasValidBudgetRange && (
                      <>
                        <strong>
                          {t('operator.budget.channel.noValidRange')}
                        </strong>

                        <div>
                          {t('operator.budget.channel.checkConstraints')}
                        </div>
                      </>
                    )}

                  {!optimizationFeasibility.isFeasible &&
                    optimizationFeasibility.hasValidBudgetRange && (
                      <>
                        <strong>
                          {t('operator.budget.channel.outOfRange')}
                        </strong>

                        <div>
                          {t('operator.budget.channel.feasibleRange')}
                          {' '}
                          {Math.round(
                            optimizationFeasibility.minimumFeasibleBudget *
                            optimizationPeriodDays
                          ).toLocaleString()}
                          {t('client.common.currency')}
                          {' ~ '}
                          {Math.round(
                            optimizationFeasibility.maximumFeasibleBudget *
                            optimizationPeriodDays
                          ).toLocaleString()}
                          {t('client.common.currency')}
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
                    {t('operator.budget.channel.orValidation')}
                  </strong>

                  <span>
                    {t('operator.budget.channel.variables', { count: lpModelValidation.variableCount })}
                    {' · '}
                    {t('operator.budget.channel.constraints', { count: lpModelValidation.constraintCount })}
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
                      {t('operator.budget.channel.previewComplete')}
                    </strong>

                    <span>
                      {naverPreviewResult
                        .portfolioAction ===
                        'SHADOW_WITH_GUARDRAILS'
                        ? t('operator.budget.channel.shadowSafety')
                        : t('operator.budget.channel.shadowAvailable')}
                    </span>
                  </div>

                  <div className="gurobi-scenario-summary">
                    <div className="gurobi-summary-card">
                      <span>
                        {t('operator.budget.channel.currentDailyBudget')}
                      </span>

                      <strong>
                        {Math.round(
                          naverPreviewResult
                            .totalDailyBudget || 0
                        ).toLocaleString()}
                        {t('client.common.currency')}
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        {t('operator.budget.channel.recommendedDailyBudget')}
                      </span>

                      <strong>
                        {Math.round(
                          naverPreviewResult
                            .recommendedTotalBudget ||
                          0
                        ).toLocaleString()}
                        {t('client.common.currency')}
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        {t('operator.budget.channel.currentExpectedDailyRevenue')}
                      </span>

                      <strong>
                        {Math.round(
                          naverPreviewResult
                            .estimatedCurrentRevenue ||
                          0
                        ).toLocaleString()}
                        {t('client.common.currency')}
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        {t('operator.budget.channel.recommendedExpectedDailyRevenue')}
                      </span>

                      <strong>
                        {Math.round(
                          naverPreviewResult
                            .estimatedRecommendedRevenue ||
                          0
                        ).toLocaleString()}
                        {t('client.common.currency')}
                      </strong>
                    </div>

                    <div className="gurobi-summary-card">
                      <span>
                        {t('operator.budget.campaign.expectedLift')}
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
                        {t('operator.budget.channel.modeledCampaigns')}
                      </span>

                      <strong>
                        {naverPreviewResult
                          .campaignCounts
                          ?.modeled || 0}
                        {t('operator.budget.common.campaigns')}
                      </strong>

                      <small>
                        {t('operator.budget.channel.totalLabel', {
                          count: naverPreviewResult.campaignCounts?.total || 0,
                        })}
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
                  ? t('operator.budget.channel.calculating')
                  : t('operator.budget.channel.calculate')}
              </button>

              {optimizationApiResult?.status === 'optimal' && (
                <div className="scenario-save-controls">
                  <input
                    type="text"
                    value={scenarioName}
                    placeholder={t('operator.budget.channel.scenarioNamePlaceholder')}
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
                    {t('operator.budget.channel.saveCurrentResult')}
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
                  ? t('operator.budget.channel.comparingRisk')
                  : t('operator.budget.channel.compareRisk')}
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
                      {t('operator.budget.policy.title')}
                    </h3>

                    <p>
                      {performanceDataSource ===
                        'mock'
                        ? t('operator.budget.policy.mockDescription')
                        : t('operator.budget.policy.naverDescription')}
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
                      ? t('operator.budget.policy.recalculateMock')
                      : t('operator.budget.policy.refresh')}
                  </button>
                </div>

                <div className="campaign-budget-policy-summary">
                  <div>
                    <span>
                      {t('operator.budget.policy.totalCampaigns')}
                    </span>

                    <strong>
                      {
                        displayedCampaignBudgetPolicyMeta
                          .campaignCount
                      }
                      {t('operator.budget.common.campaigns')}
                    </strong>
                  </div>

                  <div>
                    <span>
                      {t('operator.budget.campaign.eligible')}
                    </span>

                    <strong>
                      {
                        displayedCampaignBudgetPolicyMeta
                          .optimizationEligibleCount
                      }
                      {t('operator.budget.common.campaigns')}
                    </strong>
                  </div>

                  <div>
                    <span>
                      {t('operator.budget.policy.excluded')}
                    </span>

                    <strong>
                      {
                        displayedCampaignBudgetPolicyMeta
                          .excludedCampaignCount
                      }
                      {t('operator.budget.common.campaigns')}
                    </strong>
                  </div>

                  <div>
                    <span>
                      {t('operator.budget.policy.targetCurrentDailyBudget')}
                    </span>

                    <strong>
                      {Math.round(
                        displayedCampaignBudgetPolicyMeta
                          .optimizationCurrentTotalDailyBudget ||
                        0
                      ).toLocaleString()}
                      {t('client.common.currency')}
                    </strong>
                  </div>

                  <div>
                    <span>
                      {t('operator.budget.policy.configured')}
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
                      {t('operator.budget.policy.bulkDraft')}
                    </strong>

                    <span>
                      {performanceDataSource ===
                        'mock'
                        ? t('operator.budget.policy.mockRatioDescription')
                        : t('operator.budget.policy.naverRatioDescription')}
                    </span>
                  </div>

                  <label>
                    {t('operator.budget.policy.minimumBudget')}

                    <div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        placeholder={t('operator.budget.policy.minPercentPlaceholder')}
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
                    {t('operator.budget.policy.maximumBudget')}

                    <div>
                      <input
                        type="number"
                        min="100"
                        step="1"
                        placeholder={t('operator.budget.policy.maxPercentPlaceholder')}
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
                    {t('operator.budget.policy.applyAll')}
                  </button>
                </div>

                <p className="campaign-budget-policy-note">
                  {performanceDataSource ===
                    'mock'
                    ? t('operator.budget.policy.mockConstraintDescription')
                    : t('operator.budget.policy.naverConstraintDescription')}
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
                    {t('operator.budget.policy.loading')}
                  </div>
                ) : displayedCampaignBudgetPolicies.length ===
                  0 ? (
                  <div className="campaign-budget-policy-empty">
                    {performanceDataSource ===
                      'mock'
                      ? t('operator.budget.policy.noMockCampaigns')
                      : t('operator.budget.policy.noNaverCampaigns')}
                  </div>
                ) : (
                  <div className="campaign-budget-policy-table-wrap">
                    <table className="campaign-budget-policy-table">
                      <thead>
                        <tr>
                          <th>
                            {t('operator.budget.common.campaign')}
                          </th>

                          <th>
                            {t('operator.budget.policy.currentBudgetX0')}
                          </th>

                          <th>
                            {t('operator.budget.policy.minimumBudgetL')}
                          </th>

                          <th>
                            {t('operator.budget.policy.maximumBudgetU')}
                          </th>

                          <th>
                            {t('operator.budget.policy.policyStatus')}
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
                                    ).toLocaleString()}${t('client.common.currency')}`
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
                                      ? t('operator.budget.policy.statusExcluded')
                                      : performanceDataSource ===
                                        'mock'
                                        ? t('operator.budget.policy.statusMockReady')
                                        : policy.policyReady
                                          ? t('operator.budget.policy.statusSaved')
                                          : t('operator.budget.policy.statusUnset')}
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
                          ? t('operator.budget.policy.saving')
                          : t('operator.budget.policy.save')}
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
                      {t('operator.budget.source.pending')}
                    </span>

                    <h3>
                      {t('operator.budget.source.cannotCalculate')}
                    </h3>
                  </div>
                </div>

                <p>
                  {optimizationApiResult.message}
                </p>

                <div className="naver-block-reason">
                  {t('operator.budget.common.reason')}:{' '}
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
                          {t('operator.budget.source.connectedData')}
                        </h3>
                      </div>

                      <div className="naver-campaign-table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>{t('operator.budget.common.channel')}</th>
                              <th>{t('operator.budget.source.dataDays')}</th>
                              <th>{t('operator.budget.source.startDate')}</th>
                              <th>{t('operator.budget.source.latestDate')}</th>
                              <th>{t('operator.budget.source.revenueDays')}</th>
                              <th>{t('operator.budget.source.cumulativeSpend')}</th>
                              <th>{t('operator.budget.source.cumulativeRevenue')}</th>
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
                                    {t('operator.budget.common.days')}
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
                                    {t('operator.budget.common.days')}
                                  </td>

                                  <td>
                                    {Math.round(
                                      Number(
                                        channel.totalSpend ||
                                        0
                                      )
                                    ).toLocaleString()}
                                    {t('client.common.currency')}
                                  </td>

                                  <td>
                                    {Math.round(
                                      Number(
                                        channel.totalRevenue ||
                                        0
                                      )
                                    ).toLocaleString()}
                                    {t('client.common.currency')}
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
                      {t('operator.budget.source.complete')}
                    </span>

                    <h3>
                      {t('operator.budget.source.recommendation')}
                    </h3>
                  </div>
                </div>

                <p>
                  {t('operator.budget.source.shadowDescription')}
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
                          {t('operator.budget.source.allocationResult')}
                        </h3>
                      </div>

                      <div className="naver-campaign-table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>{t('operator.budget.common.channel')}</th>
                              <th>{t('operator.budget.common.currentBudget')}</th>
                              <th>{t('operator.budget.common.recommendedBudget')}</th>
                              <th>{t('operator.budget.common.changeRate')}</th>
                              <th>{t('operator.budget.common.expectedRevenue')}</th>
                              <th>{t('operator.budget.common.expectedRoas')}</th>
                              <th>Safety Gate</th>
                              <th>{t('operator.budget.source.dataDays')}</th>
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
                                    {t('client.common.currency')}
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
                                      {t('client.common.currency')}
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
                                    {t('client.common.currency')}
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
                                    {t('operator.budget.common.days')}
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
                {t('operator.budget.infeasible.title')}
              </strong>

              <p>
                {optimizationApiResult
                  .conflictingConstraints
                  ?.includes('target_cpa')
                  ? t('operator.budget.infeasible.cpaMessage', {
                    target: targetCpa
                      ? Number(targetCpa).toLocaleString()
                      : '',
                  })
                  : optimizationApiResult
                    .conflictingConstraints
                    ?.includes('target_roas')
                    ? t('operator.budget.infeasible.roasMessage')
                    : t('operator.budget.infeasible.genericMessage')}
              </p>

              <p>
                {optimizationApiResult
                  .conflictingConstraints
                  ?.includes('target_cpa')
                  ? t('operator.budget.infeasible.cpaAction')
                  : optimizationApiResult
                    .conflictingConstraints
                    ?.includes('target_roas')
                    ? t('operator.budget.infeasible.roasAction')
                    : t('operator.budget.infeasible.genericAction')}
              </p>
            </div>
          )}

          {gurobiScenarioSummary && (
            <div className="gurobi-scenario-summary">
              <div className="gurobi-summary-card">
                <span>{t('operator.budget.common.currentTotalBudget')}</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.currentBudget
                  ).toLocaleString()}
                  {t('client.common.currency')}
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>{t('operator.budget.common.optimizedTotalBudget')}</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.optimizedBudget
                  ).toLocaleString()}
                  {t('client.common.currency')}
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>{t('operator.budget.common.currentRevenue')}</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.currentRevenue
                  ).toLocaleString()}
                  {t('client.common.currency')}
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>{t('operator.budget.common.projectedRevenue')}</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.projectedRevenue
                  ).toLocaleString()}
                  {t('client.common.currency')}
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>{t('operator.budget.common.currentRoas')}</span>

                <strong>
                  {gurobiScenarioSummary.currentRoas.toFixed(
                    1
                  )}
                  %
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>{t('operator.budget.common.expectedRoas')}</span>

                <strong>
                  {gurobiScenarioSummary.projectedRoas.toFixed(
                    1
                  )}
                  %
                </strong>
              </div>



              <div className="gurobi-summary-card">
                <span>{t('operator.budget.common.expectedCpa')}</span>

                <strong>
                  {Math.round(
                    gurobiScenarioSummary.projectedCpa
                  ).toLocaleString()}
                  {t('client.common.currency')}
                </strong>
              </div>

              <div className="gurobi-summary-card">
                <span>{t('operator.budget.common.revenueChange')}</span>

                <strong>
                  {gurobiScenarioSummary.revenueChange > 0
                    ? '+'
                    : ''}

                  {Math.round(
                    gurobiScenarioSummary.revenueChange
                  ).toLocaleString()}
                  {t('client.common.currency')}
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
                <span>{t('operator.budget.common.roasChange')}</span>

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
                    {t('operator.budget.risk.diagnosticsTitle')}
                  </h3>

                  <p>
                    {t('operator.budget.risk.diagnosticsDescription')}
                  </p>
                </div>

                <span className="risk-level-badge">
                  {getBudgetRiskLevelLabel(
                    riskDiagnosticsSummary.riskLevel
                  )}
                </span>
              </div>

              <div className="risk-diagnostics-grid">
                <div className="risk-diagnostic-card">
                  <span>
                    {t('operator.budget.risk.minimumRisk')}
                  </span>

                  <strong>
                    {riskDiagnosticsSummary.minimumRiskPercent.toFixed(
                      2
                    )}
                    %
                  </strong>

                  <small>
                    {t('operator.budget.risk.minimumRiskDescription')}
                  </small>
                </div>

                <div className="risk-diagnostic-card">
                  <span>
                    {t('operator.budget.risk.allowedRisk')}
                  </span>

                  <strong>
                    {riskDiagnosticsSummary.dynamicRiskLimitPercent.toFixed(
                      2
                    )}
                    %
                  </strong>

                  <small>
                    {t('operator.budget.risk.allowedRiskDescription')}
                  </small>
                </div>

                <div className="risk-diagnostic-card">
                  <span>
                    {t('operator.budget.risk.realizedRisk')}
                  </span>

                  <strong>
                    {riskDiagnosticsSummary.realizedRiskPercent.toFixed(
                      2
                    )}
                    %
                  </strong>

                  <small>
                    {t('operator.budget.risk.realizedRiskDescription')}
                  </small>
                </div>

                <div className="risk-diagnostic-card">
                  <span>
                    {t('operator.budget.risk.revenueOptimalRisk')}
                  </span>

                  <strong>
                    {riskDiagnosticsSummary.revenueOptimalRiskPercent.toFixed(
                      2
                    )}
                    %
                  </strong>

                  <small>
                    {t('operator.budget.risk.revenueOptimalRiskDescription')}
                  </small>
                </div>
              </div>

              <div className="risk-diagnostics-summary">
                <strong>
                  {t('operator.budget.risk.interpretation')}
                </strong>

                <span>
                  {riskDiagnosticsSummary.realizedRiskPercent <
                    riskDiagnosticsSummary.revenueOptimalRiskPercent
                    ? t('operator.budget.risk.belowRevenueOptimal')
                    : t('operator.budget.risk.nearRevenueOptimal')}
                </span>
              </div>
            </div>
          )}

          {channelRiskContribution.length > 0 && (
            <div className="channel-risk-panel">
              <div className="channel-risk-header">
                <h3>
                  {t('operator.budget.risk.channelContribution')}
                </h3>

                <span>
                  {t('operator.budget.risk.relativeToCurrent')}
                </span>
              </div>

              <div className="channel-risk-table-wrapper">
                <table className="channel-risk-table">
                  <thead>
                    <tr>
                      <th>{t('operator.budget.common.channel')}</th>
                      <th>{t('operator.budget.common.currentBudget')}</th>
                      <th>{t('operator.budget.common.optimizedBudget')}</th>
                      <th>{t('operator.budget.risk.budgetChangeRate')}</th>
                      <th>{t('operator.budget.risk.volatility')}</th>
                      <th>Risk Weight</th>
                      <th>{t('operator.budget.risk.riskContribution')}</th>
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
                            {t('client.common.currency')}
                          </td>

                          <td>
                            {Math.round(
                              item.optimizedBudget
                            ).toLocaleString()}
                            {t('client.common.currency')}
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
                  {t('operator.budget.risk.resultInterpretation')}
                </h3>

                <span>
                  {t('operator.budget.risk.autoExplanation')}
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
                  {t('operator.budget.common.recommendedAction')}
                </h3>

                <span>
                  {t('operator.budget.risk.basedOnResult')}
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
                    {t('operator.budget.risk.scenarioComparison')}
                  </h3>

                  <span>
                    {t('operator.budget.risk.levels')}
                  </span>
                </div>

                <div className="risk-scenario-comparison-table-wrapper">
                  <table className="risk-scenario-comparison-table">
                    <thead>
                      <tr>
                        <th>{t('operator.budget.risk.item')}</th>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <th key={scenario.key}>
                              {getBudgetRiskLevelLabel(scenario.key)}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      <tr>
                        <td>
                          {t('operator.budget.risk.actualRisk')}
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
                          {t('operator.budget.risk.allowedRiskShort')}
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
                          {t('operator.budget.common.expectedRevenue')}
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? `${Math.round(
                                  scenario.expectedRevenue
                                ).toLocaleString()}${t('client.common.currency')}`
                                : '-'}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          {t('operator.budget.common.expectedRoas')}
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
                          {t('operator.budget.common.expectedCpa')}
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? `${Math.round(
                                  scenario.expectedCpa
                                ).toLocaleString()}${t('client.common.currency')}`
                                : '-'}
                            </td>
                          )
                        )}
                      </tr>

                      <tr>
                        <td>
                          {t('operator.budget.risk.revenueScore')}
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
                          {t('operator.budget.risk.roasScore')}
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
                          {t('operator.budget.risk.cpaScore')}
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
                          {t('operator.budget.risk.riskScore')}
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
                            {t('operator.budget.risk.recommendationScore')}
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
                          {t('operator.budget.risk.revenueObjective')}
                        </td>

                        {riskScenarioComparisonRows.map(
                          (scenario) => (
                            <td key={scenario.key}>
                              {scenario.status === 'optimal'
                                ? Math.round(
                                  scenario.objectiveValue *
                                  optimizationPeriodDays
                                ).toLocaleString() +
                                t('operator.budget.common.currency')
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
                              {t('operator.budget.common.optimizedBudget')}
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
                                    t('operator.budget.common.currency')
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
                          {t('operator.budget.risk.recommendedScenario')}
                          {' '}
                          {getBudgetRiskLevelLabel(recommendedRiskScenario.key)}
                        </strong>

                        <span>
                          {t('operator.budget.common.expectedRevenue')}
                          {' '}
                          {Math.round(
                            recommendedRiskScenario
                              .expectedRevenue
                          ).toLocaleString()}
                          {t('client.common.currency')}
                          {' · '}
                          {t('operator.budget.common.expectedRoas')}
                          {' '}
                          {(
                            recommendedRiskScenario
                              .expectedRoas * 100
                          ).toFixed(1)}
                          %
                          {' · '}
                          {t('operator.budget.risk.actualRisk')}
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
                            {t('operator.budget.risk.recommendationScore')}
                            {' '}
                            <strong>
                              {riskScenarioRecommendationExplanation
                                .score.toFixed(1)}
                            </strong>
                            /100
                          </div>

                          <div className="risk-recommendation-reasons">
                            <strong>
                              {t('operator.budget.common.rationale')}
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
                                  {t('operator.budget.risk.cautions')}
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
                  {t('operator.budget.allocation.title')}
                </h3>

                <span>
                  {t('operator.budget.allocation.selectedPeriod')}
                </span>
              </div>

              <div className="channel-performance-table-wrapper">
                <table className="channel-performance-table">
                  <thead>
                    <tr>
                      <th>{t('operator.budget.common.channel')}</th>
                      <th>{t('operator.budget.common.currentBudget')}</th>
                      <th>{t('operator.budget.common.optimizedBudget')}</th>
                      <th>{t('operator.budget.allocation.adjustmentAmount')}</th>
                      <th>{t('operator.budget.allocation.adjustmentRate')}</th>
                      <th>{t('operator.budget.common.expectedRevenue')}</th>
                      <th>{t('operator.budget.common.expectedRoas')}</th>
                      <th>{t('operator.budget.common.expectedCpa')}</th>
                      <th>{t('operator.budget.common.revenueChange')}</th>
                      <th>{t('operator.budget.common.roasChange')}</th>
                      <th>{t('operator.budget.allocation.recommendation')}</th>
                      <th>{t('operator.budget.common.optimizationReason')}</th>
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
                          t('operator.budget.allocation.defaultReason')

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
                              {t('client.common.currency')}
                            </td>

                            <td>
                              {Math.round(
                                item.optimizedPeriodBudget
                              ).toLocaleString()}
                              {t('client.common.currency')}
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
                                {t('client.common.currency')}
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
                              {t('client.common.currency')}
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
                                ).toLocaleString()}${t('client.common.currency')}`
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
                                {t('client.common.currency')}
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
                                {getBudgetRecommendationLabel(recommendation)}
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
                  <span>{t('operator.budget.common.inputTotalBudget')}</span>

                  <strong>
                    {Math.round(
                      budgetAllocationSummary.inputBudget
                    ).toLocaleString()}
                    {t('client.common.currency')}
                  </strong>
                </div>

                <div>
                  <span>{t('operator.budget.common.recommendedAllocationTotal')}</span>

                  <strong>
                    {Math.round(
                      gurobiScenarioSummary?.optimizedBudget || 0
                    ).toLocaleString()}
                    {t('client.common.currency')}
                  </strong>
                </div>

                <div className="gurobi-summary-card">
                  <span>{t('operator.budget.common.unallocatedDifference')}</span>

                  <strong>
                    {Math.round(
                      (Number(optimizationBudget) || 0) -
                      (gurobiScenarioSummary?.optimizedBudget || 0)
                    ).toLocaleString()}
                    {t('client.common.currency')}
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
                {t('operator.scenario.title')}
              </h2>

              <p>
                {t('operator.scenario.description')}
              </p>
            </div>

            <span>
              {t('operator.scenario.savedCount', {
                count: advertiserOptimizationScenarios.length,
              })}
            </span>
          </div>

          {selectedScenarios.length === 2 && (
            <div className="scenario-comparison-panel">
              <div className="scenario-comparison-header">
                <div>
                  <h3>
                    {t('operator.scenario.comparison.title')}
                  </h3>

                  <p>
                    {t('operator.scenario.comparison.description')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedScenarioIds([])
                  }
                >
                  {t('operator.scenario.comparison.clearSelection')}
                </button>
              </div>

              <div className="scenario-comparison-table-wrapper">
                <table className="scenario-comparison-table">
                  <thead>
                    <tr>
                      <th>{t('operator.scenario.comparison.item')}</th>

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
                      <td>{t('operator.scenario.comparison.optimizationObjective')}</td>

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
                      <td>{t('operator.scenario.metrics.totalBudget')}</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {Math.round(
                              scenario.totalBudget
                            ).toLocaleString()}
                            {t('client.common.currency')}
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>{t('operator.scenario.metrics.projectedRevenue')}</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {Math.round(
                              scenario.summary
                                .projectedRevenue
                            ).toLocaleString()}
                            {t('client.common.currency')}
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>{t('operator.scenario.metrics.projectedRoas')}</td>

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
                      <td>{t('operator.scenario.metrics.projectedCpa')}</td>

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
                              ).toLocaleString()}${t('client.common.currency')}`
                              : '-'}
                          </td>
                        )
                      )}
                    </tr>

                    <tr>
                      <td>{t('operator.scenario.comparison.budgetChangeLimit')}</td>

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
                      <td>{t('operator.scenario.comparison.riskLevel')}</td>

                      {selectedScenarios.map(
                        (scenario) => (
                          <td key={scenario.id}>
                            {scenario.riskLevel === 'low'
                              ? t('operator.scenario.risk.low')
                              : scenario.riskLevel === 'high'
                                ? t('operator.scenario.risk.high')
                                : scenario.riskLevel === 'medium'
                                  ? t('operator.scenario.risk.medium')
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
                  {t('operator.scenario.comparison.channelBudgetComparison')}
                </h4>

                <table className="scenario-comparison-table">
                  <thead>
                    <tr>
                      <th>{t('operator.scenario.comparison.channel')}</th>

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
                                  ).toLocaleString()}${t('client.common.currency')}`
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
                    {t('operator.scenario.comparison.interpretation')}
                  </h4>

                  <p>
                    {scenarioComparisonInsight.summary}
                  </p>

                  <div className="scenario-difference-grid">
                    <div>
                      <span>{t('operator.scenario.comparison.revenueDifference')}</span>

                      <strong>
                        {scenarioComparisonInsight
                          .revenueDifference > 0
                          ? '+'
                          : ''}
                        {Math.round(
                          scenarioComparisonInsight
                            .revenueDifference
                        ).toLocaleString()}
                        {t('client.common.currency')}
                      </strong>
                    </div>

                    <div>
                      <span>{t('operator.scenario.comparison.roasDifference')}</span>

                      <strong>
                        {scenarioComparisonInsight
                          .roasDifference > 0
                          ? '+'
                          : ''}
                        {scenarioComparisonInsight
                          .roasDifference
                          .toFixed(1)}
                        %
                      </strong>
                    </div>

                    <div>
                      <span>{t('operator.scenario.comparison.cpaDifference')}</span>

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
                          ).toLocaleString()}${t('client.common.currency')}`
                          : '-'}
                      </strong>
                    </div>
                  </div>

                  <div className="scenario-allocation-differences">
                    <h4>
                      {t('operator.scenario.comparison.channelBudgetDifference')}
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
                            {t('client.common.currency')}
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
                {t('operator.scenario.empty.title')}
              </strong>

              <p>
                {t('operator.scenario.empty.description')}
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
                                {t('operator.scenario.actions.save')}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingScenarioId(null)
                                  setEditingScenarioName('')
                                }}
                              >
                                {t('operator.scenario.actions.cancel')}
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
                                {t('operator.scenario.actions.editName')}
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
                            ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
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

                            <span>{t('operator.scenario.actions.compareSelect')}</span>
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
                              {t('operator.scenario.status.draft')}
                            </option>

                            <option value="recommended">
                              {t('operator.scenario.status.recommended')}
                            </option>

                            <option value="confirmed">
                              {t('operator.scenario.status.confirmed')}
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
                              ? t('operator.scenario.actions.removeFinal')
                              : t('operator.scenario.actions.selectFinal')}
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
                                          ? t(
                                            'operator.scenario.confirm.reproposal',
                                            {
                                              name: scenario.name || getOptimizationObjectiveLabel(
                                                scenario.objective
                                              ),
                                            }
                                          )
                                          : t(
                                            'operator.scenario.confirm.createProposal',
                                            {
                                              name: scenario.name || getOptimizationObjectiveLabel(
                                                scenario.objective
                                              ),
                                            }
                                          )
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
                                    ? t('operator.scenario.actions.reproposal')
                                    : t('operator.scenario.actions.createProposal')}
                                </button>
                              )}

                              {activeProposal && (
                                <>
                                  <button
                                    type="button"
                                    disabled
                                  >
                                    {t('operator.scenario.actions.proposalCreated')}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const confirmed =
                                        window.confirm(
                                          t(
                                            'operator.scenario.confirm.cancelProposal',
                                            {
                                              name: scenario.name || getOptimizationObjectiveLabel(
                                                scenario.objective
                                              ),
                                            }
                                          )
                                        )

                                      if (!confirmed) {
                                        return
                                      }

                                      cancelClientProposal(
                                        activeProposal.id
                                      )
                                    }}
                                  >
                                    {t('operator.scenario.actions.cancelProposal')}
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
                            {t('operator.scenario.actions.delete')}
                          </button>
                        </div>
                      </div>

                      <div className="saved-scenario-metrics">
                        <div>
                          <span>
                            {t('operator.scenario.metrics.totalBudget')}
                          </span>

                          <strong>
                            {Math.round(
                              scenario.totalBudget
                            ).toLocaleString()}
                            {t('client.common.currency')}
                          </strong>
                        </div>

                        <div>
                          <span>
                            {t('operator.scenario.metrics.projectedRevenue')}
                          </span>

                          <strong>
                            {Math.round(
                              scenario.summary
                                .projectedRevenue
                            ).toLocaleString()}
                            {t('client.common.currency')}
                          </strong>
                        </div>

                        <div>
                          <span>
                            {t('operator.scenario.metrics.projectedRoas')}
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
                            {t('operator.scenario.metrics.projectedCpa')}
                          </span>

                          <strong>
                            {scenario.summary
                              .projectedCpa !== null &&
                              scenario.summary
                                .projectedCpa !== undefined
                              ? `${Math.round(
                                scenario.summary
                                  .projectedCpa
                              ).toLocaleString()}${t('client.common.currency')}`
                              : '-'}
                          </strong>
                        </div>
                      </div>

                      <div className="scenario-note-section">
                        <label>
                          {t('operator.scenario.note.label')}
                        </label>

                        <textarea
                          rows="2"
                          placeholder={t('operator.scenario.note.placeholder')}
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
                {t('operator.clientPage.title')}
              </h2>

              <p>
                {t('operator.clientPage.subtitle')}
              </p>
            </div>

            <span>
              {t('operator.clientPage.proposalCount', {
                count: clientProposals.length,
              })}
            </span>
          </div>

          {clientProposals.length === 0 ? (
            <div className="client-proposal-empty">
              <strong>
                {t('operator.clientPage.emptyTitle')}
              </strong>

              <p>
                {t('operator.clientPage.emptyDescription')}
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
                              t('operator.clientPage.fallbackProposal')}
                          </strong>

                          <span>
                            {new Date(
                              proposal.createdAt
                            ).toLocaleString(
                              i18n.resolvedLanguage?.startsWith('en')
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                          </span>
                        </div>

                        <span className="client-proposal-status">
                          {getClientProposalStatusLabel(
                            proposal.status
                          )}
                        </span>

                        <div className="client-proposal-workflow">
                          <label>
                            {t('operator.clientPage.progressStatus')}
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
                            'preparing',
                            'sent',
                            'reviewing',
                            'revision_requested',
                            'approved',
                            'review_completed',
                          ].map((status) => (
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
                                {getClientProposalStatusLabel(
                                  status
                                )}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="client-proposal-metrics">
                        <div>
                          <span>
                            {t('operator.tasks.metrics.totalBudget')}
                          </span>

                          <strong>
                            {Math.round(
                              proposal.totalBudget
                            ).toLocaleString(
                              i18n.resolvedLanguage?.startsWith('en')
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                            {t('client.common.currency')}
                          </strong>
                        </div>

                        <div>
                          <span>
                            {t('operator.tasks.metrics.projectedRevenue')}
                          </span>

                          <strong>
                            {Math.round(
                              proposal.summary
                                .projectedRevenue
                            ).toLocaleString(
                              i18n.resolvedLanguage?.startsWith('en')
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                            {t('client.common.currency')}
                          </strong>
                        </div>

                        <div>
                          <span>
                            {t('operator.tasks.metrics.projectedRoas')}
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
                            {t('operator.tasks.metrics.projectedCpa')}
                          </span>

                          <strong>
                            {proposal.summary
                              .projectedCpa !== null &&
                              proposal.summary
                                .projectedCpa !== undefined
                              ? `${Math.round(
                                proposal.summary
                                  .projectedCpa
                              ).toLocaleString(
                                i18n.resolvedLanguage?.startsWith('en')
                                  ? 'en-US'
                                  : 'ko-KR'
                              )} ${t('client.common.currency')}`
                              : '-'}
                          </strong>
                        </div>
                      </div>

                      <div className="client-proposal-task">
                        <div>
                          <label>
                            {t('operator.tasks.detail.assignee')}
                          </label>

                          <input
                            type="text"
                            value={
                              proposal.assignee || ''
                            }
                            placeholder={t('operator.clientPage.placeholders.assignee')}
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
                            {t('operator.tasks.detail.dueDate')}
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
                            {t('operator.tasks.detail.taskStatus')}
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
                                    event.target.value,

                                  updatedAt:
                                    updatedProposal.updatedAt,
                                }
                              )
                            }}
                          >
                            <option value="waiting">
                              {t('operator.tasks.status.waiting')}
                            </option>

                            <option value="in_progress">
                              {t('operator.tasks.status.inProgress')}
                            </option>

                            <option value="reviewing">
                              {t('operator.tasks.status.reviewing')}
                            </option>

                            <option value="done">
                              {t('operator.tasks.status.done')}
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="client-proposal-feedback">
                        <div>
                          <label>
                            {t('operator.tasks.detail.clientComment')}
                          </label>

                          <textarea
                            rows="3"
                            value={
                              proposal.clientComment || ''
                            }
                            placeholder={t('operator.clientPage.placeholders.clientComment')}
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
                            {t('operator.tasks.detail.internalNote')}
                          </label>

                          <textarea
                            rows="3"
                            value={
                              proposal.internalNote || ''
                            }
                            placeholder={t('operator.clientPage.placeholders.internalNote')}
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
                              {t('operator.tasks.detail.revisionReason')}
                            </label>

                            <textarea
                              rows="2"
                              value={
                                proposal.revisionReason || ''
                              }
                              placeholder={t('operator.clientPage.placeholders.revisionReason')}
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
                              {t('operator.tasks.history.title')}
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
                                    ).toLocaleString(
                                      i18n.resolvedLanguage?.startsWith('en')
                                        ? 'en-US'
                                        : 'ko-KR'
                                    )}
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
                {t('operator.tasks.title')}
              </h2>

              <p>
                {t('operator.tasks.subtitle')}
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
                {t('operator.tasks.trash.title')}
                {trashedClientTasks.length > 0 && (
                  <span className="task-trash-count">
                    {trashedClientTasks.length}
                  </span>
                )}
              </button>

              <span className="task-count-badge">
                {t('operator.tasks.count', {
                  count: activeClientTaskCount,
                })}
              </span>
            </div>
          </div>

          <div className="task-dashboard-summary">
            <div>
              <span>{t('operator.tasks.summary.waiting')}</span>
              <strong>
                {taskDashboardSummary.waiting}
              </strong>
            </div>

            <div>
              <span>{t('operator.tasks.summary.inProgress')}</span>
              <strong>
                {taskDashboardSummary.inProgress}
              </strong>
            </div>

            <div>
              <span>{t('operator.tasks.summary.reviewing')}</span>
              <strong>
                {taskDashboardSummary.reviewing}
              </strong>
            </div>

            <div>
              <span>{t('operator.tasks.summary.done')}</span>
              <strong>
                {taskDashboardSummary.done}
              </strong>
            </div>

            <div>
              <span>{t('operator.tasks.summary.overdue')}</span>
              <strong>
                {taskDashboardSummary.overdue}
              </strong>
            </div>
          </div>

          <div className="task-management-filters">
            <div>
              <label>
                {t('operator.tasks.filters.status')}
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
                  {t('operator.tasks.filters.all')}
                </option>

                <option value="waiting">
                  {t('operator.tasks.status.waiting')}
                </option>

                <option value="in_progress">
                  {t('operator.tasks.status.inProgress')}
                </option>

                <option value="reviewing">
                  {t('operator.tasks.status.reviewing')}
                </option>

                <option value="done">
                  {t('operator.tasks.status.done')}
                </option>
              </select>
            </div>

            <div>
              <label>
                {t('operator.tasks.filters.assignee')}
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
                  {t('operator.tasks.filters.all')}
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
                {t('operator.tasks.filters.sort')}
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
                  {t('operator.tasks.sort.priority')}
                </option>

                <option value="dueDate">
                  {t('operator.tasks.sort.dueDate')}
                </option>

                <option value="updatedAt">
                  {t('operator.tasks.sort.updatedAt')}
                </option>
              </select>
            </div>
          </div>

          {clientProposals.length === 0 ? (
            <div className="task-empty-state">
              <strong>
                {t('operator.tasks.empty.title')}
              </strong>

              <p>
                {t('operator.tasks.empty.description')}
              </p>
            </div>
          ) : (
            <div className="task-management-table-wrapper">
              <table className="task-management-table">
                <thead>
                  <tr>
                    <th>{t('operator.tasks.table.scenario')}</th>
                    <th>{t('operator.tasks.table.clientStatus')}</th>
                    <th>{t('operator.tasks.table.priority')}</th>
                    <th>{t('operator.tasks.table.assignee')}</th>
                    <th>{t('operator.tasks.table.dueDate')}</th>
                    <th>{t('operator.tasks.table.taskStatus')}</th>
                    <th>{t('operator.tasks.table.attention')}</th>
                    <th>{t('operator.tasks.table.nextAction')}</th>
                    <th>{t('operator.tasks.table.actions')}</th>
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
                                t('operator.tasks.fallbackProposal')}
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
                                {t('operator.tasks.priority.low')}
                              </option>

                              <option value="normal">
                                {t('operator.tasks.priority.normal')}
                              </option>

                              <option value="high">
                                {t('operator.tasks.priority.high')}
                              </option>

                              <option value="urgent">
                                {t('operator.tasks.priority.urgent')}
                              </option>
                            </select>
                          </td>

                          <td>
                            <input
                              type="text"
                              value={
                                proposal.assignee || ''
                              }
                              placeholder={t('operator.tasks.filters.assignee')}
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
                                  {t('operator.tasks.due.overdue')}
                                </strong>
                              )}

                              {!isOverdue &&
                                isDueSoon && (
                                  <strong className="task-due-soon">
                                    {t('operator.tasks.due.dueSoon')}
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
                                {t('operator.tasks.status.waiting')}
                              </option>

                              <option value="in_progress">
                                {t('operator.tasks.status.inProgress')}
                              </option>

                              <option value="reviewing">
                                {t('operator.tasks.status.reviewing')}
                              </option>

                              <option value="done">
                                {t('operator.tasks.status.done')}
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
                                {t('operator.tasks.actions.viewDetails')}
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
                                  {t('common.delete')}
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
                      t('operator.tasks.fallbackProposal')}
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
                  {t('operator.budget.common.close')}
                </button>
              </div>

              <div className="task-detail-metrics">
                <div>
                  <span>{t('operator.tasks.metrics.totalBudget')}</span>
                  <strong>
                    {Math.round(
                      selectedTaskProposal.totalBudget
                    ).toLocaleString()}
                    {t('client.common.currency')}
                  </strong>
                </div>

                <div>
                  <span>{t('operator.tasks.metrics.projectedRevenue')}</span>
                  <strong>
                    {Math.round(
                      selectedTaskProposal.summary
                        .projectedRevenue
                    ).toLocaleString()}
                    {t('client.common.currency')}
                  </strong>
                </div>

                <div>
                  <span>{t('operator.tasks.metrics.projectedRoas')}</span>
                  <strong>
                    {selectedTaskProposal.summary
                      .projectedRoas
                      .toFixed(1)}
                    %
                  </strong>
                </div>

                <div>
                  <span>{t('operator.tasks.metrics.projectedCpa')}</span>
                  <strong>
                    {selectedTaskProposal.summary
                      .projectedCpa !== null &&
                      selectedTaskProposal.summary
                        .projectedCpa !== undefined
                      ? `${Math.round(
                        selectedTaskProposal.summary
                          .projectedCpa
                      ).toLocaleString()}${t('client.common.currency')}`
                      : '-'}
                  </strong>
                </div>
              </div>

              <div className="task-detail-grid">
                <div>
                  <span>{t('operator.tasks.detail.assignee')}</span>
                  <strong>
                    {selectedTaskProposal.assignee || '-'}
                  </strong>
                </div>

                <div>
                  <span>{t('operator.tasks.detail.dueDate')}</span>
                  <strong>
                    {selectedTaskProposal.dueDate || '-'}
                  </strong>
                </div>

                <div>
                  <span>{t('operator.tasks.detail.taskStatus')}</span>
                  <strong>
                    {getTaskStatusLabel(
                      selectedTaskProposal.taskStatus
                    )}
                  </strong>
                </div>

                <div>
                  <span>{t('operator.tasks.detail.priority')}</span>
                  <strong>
                    {getTaskPriorityLabel(
                      selectedTaskProposal.priority
                    )}
                  </strong>
                </div>
              </div>

              <div className="task-detail-text">
                <div>
                  <h4>{t('operator.tasks.detail.clientComment')}</h4>
                  <p>
                    {selectedTaskProposal.clientComment ||
                      t('operator.tasks.detail.noClientComment')}
                  </p>
                </div>

                <div>
                  <h4>{t('operator.tasks.detail.internalNote')}</h4>
                  <p>
                    {selectedTaskProposal.internalNote ||
                      t('operator.tasks.detail.noInternalNote')}
                  </p>
                </div>

                {selectedTaskProposal.revisionReason && (
                  <div className="task-detail-revision-reason">
                    <h4>{t('operator.tasks.detail.revisionReason')}</h4>
                    <p>
                      {selectedTaskProposal.revisionReason}
                    </p>
                  </div>
                )}

                {selectedTaskProposal.previousRevision && (
                  <div className="revision-change-summary">
                    <div className="revision-change-header">
                      <div>
                        <h4>{t('operator.tasks.revision.beforeAfter')}</h4>
                        <p>
                          {t('operator.tasks.revision.beforeAfterDescription')}
                        </p>
                      </div>
                    </div>

                    <div className="revision-summary-grid">
                      <div className="revision-summary-item">
                        <span>{t('operator.tasks.metrics.totalBudget')}</span>

                        <div className="revision-summary-values">
                          <span>
                            {Math.round(
                              Number(
                                selectedTaskProposal
                                  .previousRevision
                                  .totalBudget
                              ) || 0
                            ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                            {t('client.common.currency')}
                          </span>

                          <span>→</span>

                          <strong>
                            {Math.round(
                              Number(
                                selectedTaskProposal.totalBudget
                              ) || 0
                            ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                            {t('client.common.currency')}
                          </strong>
                        </div>
                      </div>

                      <div className="revision-summary-item">
                        <span>{t('operator.tasks.metrics.projectedRevenue')}</span>

                        <div className="revision-summary-values">
                          <span>
                            {Math.round(
                              Number(
                                selectedTaskProposal
                                  .previousRevision
                                  .summary
                                  ?.projectedRevenue
                              ) || 0
                            ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                            {t('client.common.currency')}
                          </span>

                          <span>→</span>

                          <strong>
                            {Math.round(
                              Number(
                                selectedTaskProposal
                                  .summary
                                  ?.projectedRevenue
                              ) || 0
                            ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                            {t('client.common.currency')}
                          </strong>
                        </div>
                      </div>

                      <div className="revision-summary-item">
                        <span>{t('operator.tasks.metrics.projectedRoas')}</span>

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
                        <span>{t('operator.tasks.metrics.projectedCpa')}</span>

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
                              ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}${t('client.common.currency')}`
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
                              ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}${t('client.common.currency')}`
                              : '-'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="revision-budget-comparison">
                      <h4>{t('operator.tasks.revision.channelBudgetChanges')}</h4>

                      <div className="revision-budget-table">
                        <div className="revision-budget-table-header">
                          <span>{t('operator.tasks.revision.channel')}</span>
                          <span>{t('operator.tasks.revision.before')}</span>
                          <span></span>
                          <span>{t('operator.tasks.revision.after')}</span>
                          <span>{t('operator.tasks.revision.change')}</span>
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
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
                                </span>

                                <span className="revision-budget-arrow">
                                  →
                                </span>

                                <strong>
                                  {Math.round(
                                    currentBudget
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
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
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
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
                      {t('operator.tasks.revision.start')}
                    </button>
                  </div>
                )}

              {selectedTaskProposal.status ===
                'revision_requested' &&
                selectedTaskProposal.taskStatus ===
                'in_progress' && (
                  <div className="task-detail-revision">
                    <h4>
                      {t('operator.tasks.revision.editorTitle')}
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
                        {t('operator.tasks.revision.useSavedScenario')}
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
                        {t('operator.tasks.revision.editBudgetManually')}
                      </button>
                    </div>

                    {revisionEditMode === 'scenario' && (
                      <>
                        <p>
                          {t('operator.tasks.revision.savedScenarioHelp')}
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
                            {t('operator.tasks.revision.selectScenario')}
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
                              {t('operator.tasks.revision.currentVsRevision')}
                            </h4>

                            <div className="task-detail-grid">
                              <div>
                                <span>{t('operator.tasks.metrics.totalBudget')}</span>
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
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
                                  {' → '}
                                  {Math.round(
                                    revisionScenario.totalBudget || 0
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
                                </strong>
                              </div>

                              <div>
                                <span>{t('operator.tasks.metrics.projectedRevenue')}</span>
                                <strong>
                                  {Math.round(
                                    selectedTaskProposal.summary
                                      ?.projectedRevenue || 0
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
                                  {' → '}
                                  {Math.round(
                                    revisionScenario.summary
                                      ?.projectedRevenue || 0
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
                                </strong>
                              </div>

                              <div>
                                <span>{t('operator.tasks.metrics.projectedRoas')}</span>
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
                                <span>{t('operator.tasks.metrics.projectedCpa')}</span>
                                <strong>
                                  {selectedTaskProposal.summary
                                    ?.projectedCpa != null
                                    ? `${Math.round(
                                      selectedTaskProposal.summary
                                        .projectedCpa
                                    ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}${t('client.common.currency')}`
                                    : '-'}
                                  {' → '}
                                  {revisionScenario.summary
                                    ?.projectedCpa != null
                                    ? `${Math.round(
                                      revisionScenario.summary
                                        .projectedCpa
                                    ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}${t('client.common.currency')}`
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
                          {t('operator.tasks.revision.manualBudgetTitle')}
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
                                      <span>{t('operator.tasks.revision.currentProposal')}</span>

                                      <strong>
                                        {Math.round(
                                          currentBudget
                                        ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                        {t('client.common.currency')}
                                      </strong>
                                    </div>

                                    <span className="manual-budget-arrow">
                                      →
                                    </span>

                                    <div className="manual-budget-input">
                                      <span>{t('operator.tasks.revision.revisedBudget')}</span>

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
                                      <span>{t('operator.tasks.revision.changeRate')}</span>

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
                              {t('operator.tasks.revision.projectedAfterRevision')}
                            </h4>

                            <div className="task-detail-grid">
                              <div>
                                <span>{t('operator.tasks.metrics.totalBudget')}</span>

                                <strong>
                                  {Math.round(
                                    manualRevisionProjection
                                      .totalBudget
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
                                </strong>
                              </div>

                              <div>
                                <span>{t('operator.tasks.metrics.projectedRevenue')}</span>

                                <strong>
                                  {Math.round(
                                    manualRevisionProjection
                                      .summary
                                      .projectedRevenue
                                  ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                  {t('client.common.currency')}
                                </strong>
                              </div>

                              <div>
                                <span>{t('operator.tasks.metrics.projectedRoas')}</span>

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
                                <span>{t('operator.tasks.metrics.projectedCpa')}</span>

                                <strong>
                                  {manualRevisionProjection
                                    .summary
                                    .projectedCpa != null
                                    ? `${Math.round(
                                      manualRevisionProjection
                                        .summary
                                        .projectedCpa
                                    ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}${t('client.common.currency')}`
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
                          {t('operator.tasks.revision.applyManual')}
                        </button>
                      </div>
                    )}

                    <div className="revision-allocation-comparison">
                      <h4>
                        {t('operator.tasks.revision.channelBudgetComparison')}
                      </h4>

                      <table>
                        <thead>
                          <tr>
                            <th>{t('operator.tasks.revision.channel')}</th>
                            <th>{t('operator.tasks.revision.currentProposal')}</th>
                            <th>{t('operator.tasks.revision.revision')}</th>
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
                                    ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                    {t('client.common.currency')}
                                  </td>

                                  <td>
                                    {Math.round(
                                      newAllocation
                                        .optimizedBudget || 0
                                    ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
                                    {t('client.common.currency')}
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
                        {t('operator.tasks.revision.applyScenario')}
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
                      {t('operator.tasks.revision.reshareWithClient')}
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
                      {t('operator.tasks.history.title')}
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
                            ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )}
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
                    <h3>{t('operator.tasks.trash.title')}</h3>

                    <p>
                      {t('operator.tasks.trash.description')}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="task-trash-close-button"
                    onClick={() =>
                      setTaskTrashOpen(false)
                    }
                  >
                    {t('operator.budget.common.close')}
                  </button>
                </div>

                <div className="task-trash-modal-summary">
                  {t('operator.tasks.trash.count', {
                    count: trashedClientTasks.length,
                  })}
                </div>

                {trashedClientTasks.length === 0 ? (
                  <div className="task-trash-empty">
                    {t('operator.tasks.trash.empty')}
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
                                t('operator.tasks.fallbackProposal')}
                            </strong>

                            <span>
                              {t('operator.tasks.trash.clientStatus')}:{' '}
                              {getClientProposalStatusLabel(
                                proposal.status
                              )}
                            </span>

                            <span>
                              {t('operator.tasks.trash.deletedAt')}:{' '}
                              {proposal.trashedAt
                                ? new Date(
                                  proposal.trashedAt
                                ).toLocaleString(
                              i18n.language === 'en'
                                ? 'en-US'
                                : 'ko-KR'
                            )
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
                              {t('operator.tasks.trash.restore')}
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
                              {t('operator.tasks.trash.permanentDelete')}
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
                    {t('operator.tasks.trash.emptyTrash')}
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
                  {t('operator.mediaConnections.title')}
                </h2>

                <p>
                  {t('operator.mediaConnections.description')}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMediaDataPanelOpen(false)
                }
              >
                {t('operator.mediaConnections.close')}
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
                        t('operator.mediaConnections.metaDefaultAccount')}
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
                    ? t('operator.mediaConnections.connected')
                    : t('operator.mediaConnections.connectAccount')}
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
                  {t('operator.mediaConnections.connectAccount')}
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
                  {t('operator.mediaConnections.connectAccount')}
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
                          {t('operator.mediaConnections.connected')}
                        </span>

                        <button
                          type="button"
                          className="media-disconnect-button"
                          onClick={async () => {
                            const confirmed =
                              window.confirm(
                                t('operator.mediaConnections.naver.confirmDisconnect')
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
                                  t('operator.mediaConnections.naver.disconnectFailed')
                                )
                              }

                              await loadAdConnectionsFromServer()

                              alert(
                                t('operator.mediaConnections.naver.disconnected')
                              )

                            } catch (error) {
                              console.error(
                                'FAILED TO DISCONNECT NAVER ADS',
                                error
                              )

                              alert(
                                t('operator.mediaConnections.naver.disconnectError')
                              )
                            }
                          }}
                        >
                          {t('operator.mediaConnections.disconnect')}
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
                      {t('operator.mediaConnections.connectAccount')}
                    </button>
                  )
                })()}
              </div>

            </div>

            {adConnections.length === 0 ? (
              <div className="media-data-empty">
                {t('operator.mediaConnections.empty')}
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
                          ? t('operator.mediaConnections.connected')
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
                <h2>{t('operator.mediaConnections.meta.title')}</h2>

                <p>
                  {t('operator.mediaConnections.meta.description')}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMetaConnectOpen(false)
                }
              >
                {t('operator.mediaConnections.close')}
              </button>
            </div>

            <div className="meta-connect-form">
              <label>
                {t('operator.mediaConnections.fields.apiUrl')}
              </label>

              <input
                type="text"
                value={metaApiUrl}
                placeholder={t('operator.mediaConnections.meta.apiPlaceholder')}
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
                placeholder={t('operator.mediaConnections.meta.tokenPlaceholder')}
                onChange={(event) =>
                  setMetaAccessToken(
                    event.target.value
                  )
                }
              />

              <label>
                {t('operator.mediaConnections.fields.adAccountId')}
              </label>

              <input
                type="text"
                value={metaAccountId}
                placeholder={t('operator.mediaConnections.meta.accountPlaceholder')}
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
                {t('operator.mediaConnections.cancel')}
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
                {t('operator.mediaConnections.testConnection')}
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
                <h2>{t('operator.mediaConnections.naver.title')}</h2>

                <p>
                  {t('operator.mediaConnections.naver.description')}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setNaverConnectOpen(false)
                }
              >
                {t('operator.mediaConnections.close')}
              </button>
            </div>

            <div className="meta-connect-form">
              <label>
                {t('operator.mediaConnections.fields.apiUrl')}
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
                {t('operator.mediaConnections.cancel')}
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
                        t('operator.mediaConnections.naver.connectedSuccess', {
                          count:
                            result.campaignCount !== null &&
                            result.campaignCount !== undefined
                              ? result.campaignCount
                              : 0,
                        })
                      )
                      await loadAdConnectionsFromServer()
                      setNaverConnectOpen(false)

                      return
                    }

                    alert(
                      result.message ||
                      t('operator.mediaConnections.naver.connectFailed')
                    )

                  } catch (error) {
                    console.error(
                      'NAVER CONNECTION TEST FAILED',
                      error
                    )

                    alert(
                      t('operator.mediaConnections.naver.testError')
                    )
                  }
                }}
              >
                {t('operator.mediaConnections.testConnection')}
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
                <h2>{t('operator.mediaConnections.google.title')}</h2>

                <p>
                  {t('operator.mediaConnections.google.description')}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setGoogleConnectOpen(false)
                }
              >
                {t('operator.mediaConnections.close')}
              </button>
            </div>

            <div className="meta-connect-form">
              <label>
                {t('operator.mediaConnections.fields.apiUrl')}
              </label>

              <input
                type="text"
                value={googleApiUrl}
                placeholder={t('operator.mediaConnections.google.apiPlaceholder')}
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
                placeholder={t('operator.mediaConnections.google.tokenPlaceholder')}
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
                placeholder={t('operator.mediaConnections.google.customerPlaceholder')}
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
                {t('operator.mediaConnections.cancel')}
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
                {t('operator.mediaConnections.testConnection')}
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
                <h2>{t('operator.mediaConnections.tiktok.title')}</h2>

                <p>
                  {t('operator.mediaConnections.tiktok.description')}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setTiktokConnectOpen(false)
                }
              >
                {t('operator.mediaConnections.close')}
              </button>
            </div>

            <div className="meta-connect-form">
              <label>
                {t('operator.mediaConnections.fields.apiUrl')}
              </label>

              <input
                type="text"
                value={tiktokApiUrl}
                placeholder={t('operator.mediaConnections.tiktok.apiPlaceholder')}
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
                {t('operator.mediaConnections.cancel')}
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
                {t('operator.mediaConnections.testConnection')}
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
                  {t('operator.clientHub.title')}
                </h2>

                <span>
                  {t('operator.clientHub.subtitle')}
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
                    {t('operator.clientHub.proposalsTitle')}
                  </strong>

                  <span>
                    {t(
                      'operator.clientHub.proposalCount',
                      {
                        count:
                          clientProposals.filter(
                            (proposal) =>
                              proposal.status !== 'cancelled'
                          ).length,
                      }
                    )}
                  </span>
                </div>

                {clientProposals.filter(
                  (proposal) =>
                    proposal.status !== 'cancelled'
                ).length === 0 ? (
                  <div className="client-hub-empty">
                    {t('operator.clientHub.emptyProposal')}
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
                                t('operator.clientHub.fallbackProposal')}
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
                            t('operator.clientHub.fallbackProposal')}
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
                            {t('operator.clientHub.conversation.emptyTitle')}
                          </strong>

                          <p>
                            {t('operator.clientHub.conversation.emptyDescription')}
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
                                        {messageItem.senderName
                                          ? translateClientHubSenderName(
                                            messageItem.senderName
                                          )
                                          : messageItem.senderType ===
                                            'client'
                                            ? t('operator.clientHub.conversation.advertiser')
                                            : t('operator.clientHub.conversation.operator')}
                                      </strong>

                                      <span>
                                        {new Date(
                                          messageItem.createdAt
                                        ).toLocaleString(
                                          i18n.language === 'en'
                                            ? 'en-US'
                                            : 'ko-KR'
                                        )}
                                      </span>
                                    </div>

                                    <div className="client-hub-message-content">
                                      <p>
                                        {translateClientHubSystemMessage(
                                          messageItem.message
                                        )}
                                      </p>

                                      {messageItem.senderType === 'internal' && (
                                        <div className="client-hub-message-read-status">
                                          {messageItem.isRead
                                            ? t('operator.clientHub.conversation.read')
                                            : t('operator.clientHub.conversation.unread')}
                                        </div>
                                      )}

                                      {messageItem.actionUrl && (
                                        <a
                                          href={messageItem.actionUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="client-hub-proposal-link"
                                        >
                                          {messageItem.actionLabel
                                            ? translateClientHubActionLabel(
                                              messageItem.actionLabel
                                            )
                                            : t('operator.clientHub.conversation.viewProposal')}
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
                                      {viewedEvent.message
                                        ? translateClientHubSystemMessage(
                                          viewedEvent.message
                                        )
                                        : t('operator.clientHub.systemMessages.viewedProposal')}
                                    </span>

                                    <small>
                                      {new Date(
                                        viewedEvent.createdAt
                                      ).toLocaleString(
                                          i18n.language === 'en'
                                            ? 'en-US'
                                            : 'ko-KR'
                                        )}
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
                                      ).toLocaleString(
                                          i18n.language === 'en'
                                            ? 'en-US'
                                            : 'ko-KR'
                                        )}
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
                        placeholder={t('operator.clientHub.conversation.messagePlaceholder')}
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
                          {t('operator.clientHub.conversation.composerHint')}
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
                          {t('operator.clientHub.conversation.sendMessage')}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="client-hub-empty-main">
                    {t('operator.clientHub.conversation.emptyMain')}
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
                        {t('operator.clientHub.workflow.advertiserStatus')}
                      </span>

                      <strong>
                        {getClientProposalStatusLabel(
                          selectedHubProposal.status
                        )}
                      </strong>
                    </div>

                    <div className="client-hub-action-item">
                      <span>
                        {t('operator.clientHub.workflow.assignee')}
                      </span>

                      <strong>
                        {selectedHubProposal.assignee ||
                          t('operator.clientHub.workflow.unassigned')}
                      </strong>
                    </div>

                    <div className="client-hub-action-item">
                      <span>
                        {t('operator.clientHub.workflow.dueDate')}
                      </span>

                      <strong>
                        {selectedHubProposal.dueDate ||
                          t('operator.clientHub.workflow.unassigned')}
                      </strong>
                    </div>

                    <div className="client-hub-action-item">
                      <span>
                        {t('operator.clientHub.workflow.taskStatus')}
                      </span>

                      <strong>
                        {selectedHubProposal.taskStatus ===
                          'in_progress'
                          ? t('operator.clientHub.workflow.inProgress')
                          : selectedHubProposal.taskStatus ===
                            'reviewing'
                            ? t('operator.clientHub.workflow.internalReview')
                            : selectedHubProposal.taskStatus ===
                              'done'
                              ? t('operator.clientHub.workflow.done')
                              : t('operator.clientHub.workflow.waiting')}
                      </strong>
                    </div>



                    <div className="client-hub-action-item">
                      <span>
                        {t('operator.clientHub.workflow.shareStatus')}
                      </span>

                      <strong>
                        {selectedHubProposal.shareStatus ===
                          'shared'
                          ? t('operator.clientHub.workflow.shared')
                          : t('operator.clientHub.workflow.notShared')}
                      </strong>

                      {selectedHubProposal.sharedAt && (
                        <small>
                          {new Date(
                            selectedHubProposal.sharedAt
                          ).toLocaleString(
                                          i18n.language === 'en'
                                            ? 'en-US'
                                            : 'ko-KR'
                                        )}
                        </small>
                      )}
                    </div>

                    <div className="client-hub-action-item">
                      <span>
                        {t('operator.clientHub.workflow.advertiserView')}
                      </span>

                      <strong>
                        {selectedHubProposal.firstViewedAt
                          ? t('operator.clientHub.workflow.viewed')
                          : t('operator.clientHub.workflow.notViewed')}
                      </strong>

                      {selectedHubProposal.firstViewedAt && (
                        <>
                          <small>
                            {t('operator.clientHub.workflow.firstViewed')} {' '}
                            {new Date(
                              selectedHubProposal.firstViewedAt
                            ).toLocaleString(
                                          i18n.language === 'en'
                                            ? 'en-US'
                                            : 'ko-KR'
                                        )}
                          </small>

                          <small>
                            {t('operator.clientHub.workflow.lastViewed')} {' '}
                            {new Date(
                              selectedHubProposal.lastViewedAt ||
                              selectedHubProposal.firstViewedAt
                            ).toLocaleString(
                                          i18n.language === 'en'
                                            ? 'en-US'
                                            : 'ko-KR'
                                        )}
                          </small>

                          <small>
                            {t('operator.clientHub.workflow.viewCount')} {' '}
                            {selectedHubProposal.viewCount ||
                              1}
                            {t('operator.clientHub.workflow.timesUnit')}
                          </small>
                        </>
                      )}
                    </div>


                    <div className="client-hub-progress">
                      <h4>
                        {t('operator.clientHub.progress.title')}
                      </h4>

                      {(() => {
                        const progress =
                          getClientProposalProgress(
                            selectedHubProposal
                          )

                        const steps = [
                          {
                            key: 'sent',
                            label: t('operator.clientHub.progress.proposalReady'),
                            completed:
                              progress.sent,
                          },
                          {
                            key: 'shared',
                            label: t('operator.clientHub.progress.shared'),
                            completed:
                              progress.shared,
                          },
                          {
                            key: 'viewed',
                            label: t('operator.clientHub.progress.viewed'),
                            completed:
                              progress.viewed,
                          },
                          {
                            key: 'reviewing',
                            label: t('operator.clientHub.progress.reviewing'),
                            completed:
                              progress.reviewing,
                          },
                          {
                            key: 'approved',
                            label: t('operator.clientHub.progress.approved'),
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
                        {t('operator.clientHub.workflow.nextAction')}
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
                                    t('operator.clientHub.systemMessages.proposalReady'),

                                  actorType:
                                    'operator',

                                  advertiserId:
                                    selectedAdvertiserId,
                                }
                              )
                            }}
                          >
                            {t('operator.clientHub.actions.markProposalReady')}
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
                            {t('operator.clientHub.actions.shareWithAdvertiser')}
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
                                    t('operator.clientHub.confirm.requestRevision')
                                  )

                                if (!confirmed) {
                                  return
                                }

                                requestClientRevision(
                                  selectedHubProposal.id
                                )
                              }}
                            >
                              {t('operator.clientHub.actions.requestRevision')}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const confirmed =
                                  window.confirm(
                                    t('operator.clientHub.confirm.approve')
                                  )

                                if (!confirmed) {
                                  return
                                }

                                approveClientProposal(
                                  selectedHubProposal.id
                                )
                              }}
                            >
                              {t('operator.clientHub.actions.approve')}
                            </button>
                          </>
                        )}
                    </div>
                  </>
                ) : (
                  <p>
                    {t('operator.clientHub.workflow.noSelection')}
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
  const { t, i18n } =
    useTranslation()

  const clientLocale =
    i18n.resolvedLanguage?.startsWith('en')
      ? 'en-US'
      : 'ko-KR'

  function translateClientMessageText(message) {
    const messageKeyMap = {
      '광고주가 제안을 열람했습니다.':
        'viewedProposal',
      '광고주가 제안을 최초 열람했습니다.':
        'viewedProposalFirst',
      '광고주가 제안을 다시 열람했습니다.':
        'viewedProposalAgain',
      '광고주가 제안을 재열람했습니다.':
        'viewedProposalAgain',
      '광고주 제안 준비가 완료되었습니다.':
        'proposalReady',
      '광고주에게 제안이 공유되었습니다.':
        'proposalShared',
      '광고주가 제안을 승인했습니다.':
        'proposalApproved',
      '광고주가 수정 요청을 등록했습니다.':
        'revisionRequested',
      '수정안을 광고주에게 재공유했습니다.':
        'revisionReshared',
      '광고주 제안이 취소되었습니다.':
        'proposalCancelled',
      '새로운 광고 예산 최적화 제안이 공유되었습니다. 아래 버튼에서 제안을 확인해주세요.':
        'newProposalShared',
      '수정된 광고 예산 최적화 제안이 다시 공유되었습니다. 광고주 요청사항을 반영하여 예산 배분 및 예상 성과를 업데이트했습니다.':
        'updatedProposalShared',
    }

    const key =
      messageKeyMap[message]

    return key
      ? t(`client.messages.systemMessages.${key}`)
      : message
  }

  function translateClientMessageActionLabel(label) {
    if (
      label === '제안 확인하기'
    ) {
      return t(
        'client.messages.actions.viewProposal'
      )
    }

    if (
      label === '수정된 제안 확인하기'
    ) {
      return t(
        'client.messages.actions.viewUpdatedProposal'
      )
    }

    return label
  }

  function translateClientMessageSenderName(
    name,
    isClient
  ) {
    if (name === '광고주') {
      return t(
        'client.messages.senders.client'
      )
    }

    if (name === '운영 담당자') {
      return t(
        'client.messages.senders.accountManager'
      )
    }

    if (!name) {
      return isClient
        ? t('client.messages.senders.me')
        : t(
          'client.messages.senders.accountManager'
        )
    }

    return name
  }

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

  const [
    selectedProposalId,
    setSelectedProposalId,
  ] = useState('')

  const sortedProposals =
    useMemo(
      () =>
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
        ),
      [proposals]
    )

  const selectedProposal =
    sortedProposals.find(
      (proposal) =>
        proposal.id ===
        selectedProposalId
    ) ||
    sortedProposals[0] ||
    null

  const selectedMessages =
    useMemo(
      () =>
        selectedProposal
          ? messages.filter(
            (message) =>
              message.proposalId ===
              selectedProposal.id
          )
          : [],
      [
        messages,
        selectedProposal,
      ]
    )

  const proposalViewUrl =
    selectedProposal?.shareUrl ||
    selectedMessages.find(
      (message) =>
        message.actionUrl
    )?.actionUrl ||
    null

  function getClientMessageProposalStatusLabel(
    status
  ) {
    const statusKeyMap = {
      preparing: 'preparing',
      sent: 'sent',
      reviewing: 'reviewing',
      revision_requested:
        'revisionRequested',
      approved: 'approved',
      review_completed:
        'reviewCompleted',
      cancelled: 'cancelled',
    }

    return t(
      `client.messages.proposalStatus.${
        statusKeyMap[status] ||
        'preparing'
      }`
    )
  }

  function formatClientMessageCurrency(
    value
  ) {
    return `${Math.round(
      Number(value) || 0
    ).toLocaleString(
      clientLocale
    )} ${t(
      'client.common.currency'
    )}`
  }

  function formatClientMessageDate(
    value
  ) {
    if (!value) {
      return t(
        'client.messages.modal.notAvailable'
      )
    }

    return new Date(
      value
    ).toLocaleString(
      clientLocale,
      {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }
    )
  }

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
                      t(
                        'client.messages.defaultProposalName'
                      ),
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

    const targetProposal =
      selectedProposal ||
      sortedProposals[0]

    if (!targetProposal) {
      alert(
        t(
          'client.messages.errors.noProposal'
        )
      )
      return
    }

    const messagePayload = {
      id:
        `message_${Date.now()}`,

      proposalId:
        targetProposal.id,

      senderType:
        'client',

      senderName:
        clientName ||
        t('client.messages.senders.client'),

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
          `${API_BASE_URL}/client-proposals/${targetProposal.id}/messages`,
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
          i18n.language === 'en'
            ? t(
              'client.messages.errors.saveFailed'
            )
            : result.message ||
              t(
                'client.messages.errors.saveFailed'
              )
        )
      }

      setMessages(
        (currentMessages) => [
          ...currentMessages,

          {
            ...messagePayload,
            proposalName:
              targetProposal.scenarioName ||
              targetProposal.name ||
              t(
                'client.messages.defaultProposalName'
              ),
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
        t(
          'client.messages.errors.sendFailed'
        )
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

      <div className="client-hub-overlay client-message-client-overlay">
        <div className="client-hub-modal client-message-client-modal">

          <div className="client-hub-header">
            <div>
              <h2>
                {t(
                  'client.messages.title'
                )}
              </h2>

              <span>
                {t(
                  'client.messages.modal.subtitle'
                )}
              </span>
            </div>

            <button
              type="button"
              className="client-message-modal-close"
              aria-label={t(
                'client.messages.modal.close'
              )}
              onClick={() => {
                window.location.href =
                  '/client/dashboard'
              }}
            >
              ✕
            </button>
          </div>

          <div className="client-hub-layout">

            <aside className="client-hub-sidebar">
              <div className="client-hub-sidebar-header">
                <strong>
                  {t(
                    'client.messages.modal.proposals'
                  )}
                </strong>

                <span>
                  {t(
                    'client.messages.modal.proposalCount',
                    {
                      count:
                        sortedProposals.length,
                    }
                  )}
                </span>
              </div>

              {sortedProposals.length ===
                0 ? (
                <div className="client-hub-empty">
                  {t(
                    'client.proposals.empty'
                  )}
                </div>
              ) : (
                <div className="client-hub-proposal-list">
                  {sortedProposals.map(
                    (proposal) => (
                      <button
                        key={proposal.id}
                        type="button"
                        className={
                          selectedProposal?.id ===
                            proposal.id
                            ? 'client-hub-proposal-item active'
                            : 'client-hub-proposal-item'
                        }
                        onClick={() =>
                          setSelectedProposalId(
                            proposal.id
                          )
                        }
                      >
                        <strong>
                          {proposal.scenarioName ||
                            proposal.name ||
                            t(
                              'client.messages.defaultProposalName'
                            )}
                        </strong>

                        <span>
                          {getClientMessageProposalStatusLabel(
                            proposal.status
                          )}
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}
            </aside>

            <main className="client-hub-main">
              {selectedProposal ? (
                <>
                  <div className="client-hub-conversation-header">
                    <div>
                      <h3>
                        {selectedProposal.scenarioName ||
                          selectedProposal.name ||
                          t(
                            'client.messages.defaultProposalName'
                          )}
                      </h3>

                      <span>
                        {getClientMessageProposalStatusLabel(
                          selectedProposal.status
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="client-hub-conversation">
                    {loading ? (
                      <div className="client-hub-placeholder">
                        <p>
                          {t(
                            'client.messages.loading'
                          )}
                        </p>
                      </div>
                    ) : selectedMessages.length ===
                      0 ? (
                      <div className="client-hub-placeholder">
                        <strong>
                          {t(
                            'client.messages.modal.emptyConversationTitle'
                          )}
                        </strong>

                        <p>
                          {t(
                            'client.messages.modal.emptyConversationDescription'
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="client-hub-message-list">
                        {selectedMessages.map(
                          (message) => {
                            const isClient =
                              message.senderType ===
                              'client'

                            return (
                              <div
                                key={message.id}
                                className={
                                  isClient
                                    ? 'client-hub-message client-message-self'
                                    : 'client-hub-message client-message-manager'
                                }
                              >
                                <div className="client-hub-message-meta">
                                  <strong>
                                    {translateClientMessageSenderName(
                                      message.senderName,
                                      isClient
                                    )}
                                  </strong>

                                  <span>
                                    {formatClientMessageDate(
                                      message.createdAt
                                    )}
                                  </span>
                                </div>

                                <div className="client-hub-message-content">
                                  <p>
                                    {translateClientMessageText(
                                      message.message
                                    )}
                                  </p>

                                  {isClient && (
                                    <div className="client-hub-message-read-status">
                                      {message.isRead
                                        ? t(
                                          'client.messages.readStatus.read'
                                        )
                                        : t(
                                          'client.messages.readStatus.unread'
                                        )}
                                    </div>
                                  )}

                                  {message.actionUrl && (
                                    <a
                                      href={message.actionUrl}
                                      className="client-hub-proposal-link"
                                    >
                                      {translateClientMessageActionLabel(
                                        message.actionLabel ||
                                        '제안 확인하기'
                                      )}
                                    </a>
                                  )}
                                </div>
                              </div>
                            )
                          }
                        )}
                      </div>
                    )}
                  </div>

                  <div className="client-hub-message-composer client-message-client-composer">
                    <textarea
                      value={newMessage}
                      placeholder={t(
                        'client.messages.compose.placeholder'
                      )}
                      onChange={(event) =>
                        setNewMessage(
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                          'Enter' &&
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
                      rows={2}
                    />

                    <div className="client-hub-composer-footer">
                      <span>
                        {t(
                          'client.messages.modal.sendHint'
                        )}
                      </span>

                      <button
                        type="button"
                        disabled={
                          sendingMessage ||
                          !newMessage.trim()
                        }
                        onClick={
                          sendClientMessage
                        }
                      >
                        {sendingMessage
                          ? t(
                            'client.messages.compose.sending'
                          )
                          : t(
                            'client.messages.compose.send'
                          )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="client-hub-placeholder client-message-no-proposal">
                  <strong>
                    {t(
                      'client.messages.modal.noProposalTitle'
                    )}
                  </strong>

                  <p>
                    {t(
                      'client.messages.modal.noProposalDescription'
                    )}
                  </p>
                </div>
              )}
            </main>

            <aside className="client-hub-actions">
              <h3>
                {t(
                  'client.messages.modal.proposalDetails'
                )}
              </h3>

              {selectedProposal ? (
                <>
                  <div className="client-hub-action-item">
                    <span>
                      {t(
                        'client.messages.modal.status'
                      )}
                    </span>

                    <strong>
                      {getClientMessageProposalStatusLabel(
                        selectedProposal.status
                      )}
                    </strong>
                  </div>

                  <div className="client-hub-action-item">
                    <span>
                      {t(
                        'client.proposals.totalBudget'
                      )}
                    </span>

                    <strong>
                      {formatClientMessageCurrency(
                        selectedProposal.totalBudget
                      )}
                    </strong>
                  </div>

                  <div className="client-hub-action-item">
                    <span>
                      {t(
                        'client.proposals.projectedRoas'
                      )}
                    </span>

                    <strong>
                      {Number(
                        selectedProposal
                          ?.summary
                          ?.projectedRoas ||
                        0
                      ).toFixed(1)}
                      %
                    </strong>
                  </div>

                  <div className="client-hub-action-item">
                    <span>
                      {t(
                        'client.messages.modal.lastUpdated'
                      )}
                    </span>

                    <strong>
                      {formatClientMessageDate(
                        selectedProposal.updatedAt ||
                        selectedProposal.createdAt
                      )}
                    </strong>
                  </div>

                  <button
                    type="button"
                    className="client-message-view-proposal-button"
                    disabled={
                      !proposalViewUrl
                    }
                    onClick={() => {
                      if (
                        proposalViewUrl
                      ) {
                        window.location.href =
                          proposalViewUrl
                      }
                    }}
                  >
                    {t(
                      'client.proposals.viewProposal'
                    )}
                  </button>
                </>
              ) : (
                <div className="client-hub-placeholder">
                  {t(
                    'client.messages.modal.noProposalSelected'
                  )}
                </div>
              )}
            </aside>

          </div>
        </div>
      </div>
    </div>
  )
}

function ClientPerformancePage() {
  const { t, i18n } =
    useTranslation()

  const clientLocale =
    i18n.resolvedLanguage?.startsWith('en')
      ? 'en-US'
      : 'ko-KR'

  function formatClientCurrency(value) {
    return `${Math.round(
      Number(value) || 0
    ).toLocaleString(clientLocale)} ${t(
      'client.common.currency'
    )}`
  }

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
          {t(
            'client.performance.comparison.noData'
          )}
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
      return t(
        'client.performance.insights.noAnalysisData'
      )
    }

    return t(
      'client.performance.insights.highestRoasDescription',
      {
        channel: row.channel,
        campaign: row.campaign,
      }
    )
  }

  function getRevenueInsight(row) {
    if (!row) {
      return t(
        'client.performance.insights.noAnalysisData'
      )
    }

    return t(
      'client.performance.insights.highestRevenueDescription',
      {
        channel: row.channel,
        campaign: row.campaign,
      }
    )
  }

  function getCpaInsight(row) {
    if (!row) {
      return t(
        'client.performance.insights.noAnalysisData'
      )
    }

    return t(
      'client.performance.insights.lowestCpaDescription',
      {
        channel: row.channel,
        campaign: row.campaign,
      }
    )
  }

  function getImprovementInsight(row) {
    if (!row) {
      return t(
        'client.performance.insights.noAnalysisData'
      )
    }

    return t(
      'client.performance.insights.improvementDescription',
      {
        channel: row.channel,
        campaign: row.campaign,
      }
    )
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
                ? t(
                  'client.performance.brandTitle',
                  {
                    brand: clientBrand,
                  }
                )
                : t(
                  'client.performance.title'
                )}
            </h2>

            <p>
              {t(
                'client.performance.description'
              )}
            </p>
          </div>
        </section>

        <section className="client-performance-filters">
          <div>
            <label>
              {t(
                'client.performance.filters.period'
              )}
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
                {t(
                  'client.performance.filters.last7Days'
                )}
              </option>

              <option value="30d">
                {t(
                  'client.performance.filters.last30Days'
                )}
              </option>

              <option value="90d">
                {t(
                  'client.performance.filters.last90Days'
                )}
              </option>

              <option value="all">
                {t(
                  'client.performance.filters.allTime'
                )}
              </option>
            </select>
          </div>

          <div>
            <label>
              {t(
                'client.performance.filters.channel'
              )}
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
                {t(
                  'client.performance.filters.allChannels'
                )}
              </option>

              {[
                ...new Set(
                  clientPerformanceData.map(
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
            <span>
              {t(
                'client.performance.metrics.adSpend'
              )}
            </span>
            <strong>
              {formatClientCurrency(
                totalSpend
              )}
            </strong>
            <PerformanceChange
              value={spendChange}
            />
          </div>

          <div>
            <span>
              {t(
                'client.performance.metrics.revenue'
              )}
            </span>
            <strong>
              {formatClientCurrency(
                totalRevenue
              )}
            </strong>
            <PerformanceChange
              value={revenueChange}
            />
          </div>

          <div>
            <span>
              {t(
                'client.performance.metrics.roas'
              )}
            </span>
            <strong>
              {roas.toFixed(1)}%
            </strong>
            <PerformanceChange
              value={roasChange}
            />
          </div>

          <div>
            <span>
              {t(
                'client.performance.metrics.cpa'
              )}
            </span>
            <strong>
              {formatClientCurrency(
                cpa
              )}
            </strong>
            <PerformanceChange
              value={cpaChange}
              inverse
            />
          </div>

          <div>
            <span>
              {t(
                'client.performance.metrics.ctr'
              )}
            </span>
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
              <h3>
                {t(
                  'client.performance.insights.title'
                )}
              </h3>

              <span>
                {t(
                  'client.performance.insights.basis'
                )}
              </span>
            </div>
          </div>

          <div className="client-performance-insight-grid">

            <div className="client-performance-insight-card">
              <span>
                {t(
                  'client.performance.insights.highestRoas'
                )}
              </span>

              <strong>
                {bestRoasCampaign
                  ? `${bestRoasCampaign.channel} · ${bestRoasCampaign.campaign}`
                  : '-'}
              </strong>

              <p>
                {bestRoasCampaign
                  ? `ROAS ${bestRoasCampaign.roas.toFixed(1)}%`
                  : t(
                    'client.performance.insights.noData'
                  )}
              </p>
              <small>
                {getRoasInsight(
                  bestRoasCampaign
                )}
              </small>
            </div>


            <div className="client-performance-insight-card">
              <span>
                {t(
                  'client.performance.insights.highestRevenue'
                )}
              </span>

              <strong>
                {bestRevenueCampaign
                  ? `${bestRevenueCampaign.channel} · ${bestRevenueCampaign.campaign}`
                  : '-'}
              </strong>

              <p>
                {bestRevenueCampaign
                  ? t(
                    'client.performance.insights.revenueValue',
                    {
                      value:
                        formatClientCurrency(
                          bestRevenueCampaign.revenue
                        ),
                    }
                  )
                  : t(
                    'client.performance.insights.noData'
                  )}
              </p>
              <small>
                {getRevenueInsight(
                  bestRevenueCampaign
                )}
              </small>
            </div>


            <div className="client-performance-insight-card">
              <span>
                {t(
                  'client.performance.insights.lowestCpa'
                )}
              </span>

              <strong>
                {bestCpaCampaign
                  ? `${bestCpaCampaign.channel} · ${bestCpaCampaign.campaign}`
                  : '-'}
              </strong>

              <p>
                {bestCpaCampaign
                  ? `CPA ${formatClientCurrency(
                    bestCpaCampaign.cpa
                  )}`
                  : t(
                    'client.performance.insights.noData'
                  )}
              </p>
              <small>
                {getCpaInsight(
                  bestCpaCampaign
                )}
              </small>
            </div>


            <div className="client-performance-insight-card">
              <span>
                {t(
                  'client.performance.insights.needsImprovement'
                )}
              </span>

              <strong>
                {improvementCampaign
                  ? `${improvementCampaign.channel} · ${improvementCampaign.campaign}`
                  : '-'}
              </strong>

              <p>
                {improvementCampaign
                  ? `ROAS ${improvementCampaign.roas.toFixed(1)}%`
                  : t(
                    'client.performance.insights.noData'
                  )}
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
                {t(
                  'client.performance.charts.spendRevenueTitle'
                )}
              </h3>

              <span>
                {t(
                  'client.performance.charts.basis'
                )}
              </span>
            </div>
          </div>

          <div className="client-performance-chart">
            {dailyPerformanceData.length === 0 ? (
              <div className="client-proposal-empty">
                {t(
                  'client.performance.charts.noPerformanceData'
                )}
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
                      formatClientCurrency(
                        value
                      )
                    }
                  />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="spend"
                    name={t(
                      'client.performance.metrics.adSpend'
                    )}
                    stroke="#64748b"
                    strokeWidth={2}
                    dot={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name={t(
                      'client.performance.metrics.revenue'
                    )}
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
                {t(
                  'client.performance.charts.roasTrendTitle'
                )}
              </h3>

              <span>
                {t(
                  'client.performance.charts.roasTrendDescription'
                )}
              </span>
            </div>
          </div>

          <div className="client-performance-chart">
            {dailyRoasData.length === 0 ? (
              <div className="client-proposal-empty">
                {t(
                  'client.performance.charts.noPerformanceData'
                )}
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
            <h3>
              {t(
                'client.performance.tables.channelPerformance'
              )}
            </h3>
          </div>

          <div className="client-performance-table-wrap">
            <table className="client-performance-table">
              <thead>
                <tr>
                  <th>
                    {t(
                      'client.performance.metrics.channel'
                    )}
                  </th>
                  <th>
                    {t(
                      'client.performance.metrics.adSpend'
                    )}
                  </th>
                  <th>
                    {t(
                      'client.performance.metrics.revenue'
                    )}
                  </th>
                  <th>ROAS</th>
                  <th>
                    {t(
                      'client.performance.metrics.conversions'
                    )}
                  </th>
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
                          {formatClientCurrency(
                            row.spend
                          )}
                        </td>

                        <td>
                          {formatClientCurrency(
                            row.revenue
                          )}
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
              <h3>
                {t(
                  'client.performance.tables.campaignPerformance'
                )}
              </h3>

              <span>
                {t(
                  'client.performance.tables.basis'
                )}
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
                {t(
                  'client.performance.sort.highestRoas'
                )}
              </option>

              <option value="spend_desc">
                {t(
                  'client.performance.sort.highestSpend'
                )}
              </option>

              <option value="revenue_desc">
                {t(
                  'client.performance.sort.highestRevenue'
                )}
              </option>

              <option value="cpa_asc">
                {t(
                  'client.performance.sort.lowestCpa'
                )}
              </option>

              <option value="conversions_desc">
                {t(
                  'client.performance.sort.highestConversions'
                )}
              </option>
            </select>
          </div>

          <div className="client-performance-table-wrap">
            <table className="client-performance-table">
              <thead>
                <tr>
                  <th>
                    {t(
                      'client.performance.metrics.channel'
                    )}
                  </th>
                  <th>
                    {t(
                      'client.performance.metrics.campaign'
                    )}
                  </th>
                  <th>
                    {t(
                      'client.performance.metrics.adSpend'
                    )}
                  </th>
                  <th>
                    {t(
                      'client.performance.metrics.revenue'
                    )}
                  </th>
                  <th>ROAS</th>
                  <th>CPA</th>
                  <th>CTR</th>
                  <th>
                    {t(
                      'client.performance.metrics.conversions'
                    )}
                  </th>
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
                          {formatClientCurrency(
                            row.spend
                          )}
                        </td>

                        <td>
                          {formatClientCurrency(
                            row.revenue
                          )}
                        </td>

                        <td>
                          {campaignRoas.toFixed(
                            1
                          )}
                          %
                        </td>

                        <td>
                          {formatClientCurrency(
                            campaignCpa
                          )}
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
                  {t(
                    'client.performance.detail.title'
                  )}
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
                {t(
                  'client.performance.detail.close'
                )}
              </button>
            </div>

            <div className="client-campaign-detail-metrics">
              <div>
                <span>
                  {t(
                    'client.performance.metrics.adSpend'
                  )}
                </span>
                <strong>
                  {formatClientCurrency(
                    selectedCampaign.spend
                  )}
                </strong>
              </div>

              <div>
                <span>
                  {t(
                    'client.performance.metrics.revenue'
                  )}
                </span>
                <strong>
                  {formatClientCurrency(
                    selectedCampaign.revenue
                  )}
                </strong>
              </div>

              <div>
                <span>
                  {t(
                    'client.performance.metrics.roas'
                  )}
                </span>
                <strong>
                  {selectedCampaign.roas.toFixed(1)}
                  %
                </strong>
              </div>

              <div>
                <span>
                  {t(
                    'client.performance.metrics.cpa'
                  )}
                </span>
                <strong>
                  {formatClientCurrency(
                    selectedCampaign.cpa
                  )}
                </strong>
              </div>

              <div>
                <span>
                  {t(
                    'client.performance.metrics.ctr'
                  )}
                </span>
                <strong>
                  {selectedCampaign.ctr.toFixed(2)}
                  %
                </strong>
              </div>

              <div>
                <span>
                  {t(
                    'client.performance.metrics.conversions'
                  )}
                </span>
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
                    name={t(
                      'client.performance.metrics.adSpend'
                    )}
                    dot={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name={t(
                      'client.performance.metrics.revenue'
                    )}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="client-campaign-content-section">
              <div className="client-dashboard-card-header">
                <div>
                  <h3>
                    {t(
                      'client.performance.detail.creativePerformance'
                    )}
                  </h3>

                  <span>
                    {t(
                      'client.performance.sort.highestRoas'
                    )}
                  </span>
                </div>
              </div>

              {selectedCampaignContentData.length === 0 ? (
                <div className="client-proposal-empty">
                  {t(
                    'client.performance.detail.noCreativeData'
                  )}
                </div>
              ) : (
                <div className="client-performance-table-wrap">
                  <table className="client-performance-table">
                    <thead>
                      <tr>
                        <th>
                          {t(
                            'client.performance.metrics.creative'
                          )}
                        </th>
                        <th>
                          {t(
                            'client.performance.metrics.adSpend'
                          )}
                        </th>
                        <th>
                          {t(
                            'client.performance.metrics.revenue'
                          )}
                        </th>
                        <th>ROAS</th>
                        <th>CPA</th>
                        <th>CTR</th>
                        <th>
                          {t(
                            'client.performance.metrics.conversions'
                          )}
                        </th>
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
                              {formatClientCurrency(
                                row.spend
                              )}
                            </td>

                            <td>
                              {formatClientCurrency(
                                row.revenue
                              )}
                            </td>

                            <td>
                              {row.roas.toFixed(1)}%
                            </td>

                            <td>
                              {formatClientCurrency(
                                row.cpa
                              )}
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
  const { t, i18n } =
    useTranslation()

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
        t('operator.auth.errors.emailPasswordRequired')
      )
      return
    }

    if (password.length < 8) {
      setSignupError(
        t('operator.auth.errors.passwordLength')
      )
      return
    }

    if (password !== passwordConfirm) {
      setSignupError(
        t('operator.auth.errors.passwordMismatch')
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
            name: name.trim() || null,
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

      const result = await response.json()

      if (result.status !== 'ok') {
        setSignupError(
          i18n.language === 'en'
            ? t('operator.auth.errors.signupFailed')
            : result.message ||
              t('operator.auth.errors.signupFailed')
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
        t('operator.auth.errors.signupError')
      )
    } finally {
      setIsSigningUp(false)
    }
  }

  return (
    <div className="client-login-page">
      <div className="client-login-card">
        <div className="operator-auth-topbar">
          <div className="client-login-brand">
            <h1>AdScope</h1>
            <span>Operator Portal</span>
          </div>

          <div
            className="operator-auth-language-switcher"
            aria-label="Language"
          >
            <button
              type="button"
              className={
                i18n.language === 'ko'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                i18n.changeLanguage('ko')
              }
              title={t('operator.auth.koreanLanguage')}
            >
              KO
            </button>
            <span>/</span>
            <button
              type="button"
              className={
                i18n.language === 'en'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                i18n.changeLanguage('en')
              }
              title={t('operator.auth.englishLanguage')}
            >
              EN
            </button>
          </div>
        </div>

        <div className="client-login-heading">
          <h2>
            {t('operator.auth.signup.title')}
          </h2>
          <p>
            {t('operator.auth.signup.description')}
          </p>
        </div>

        <form
          className="client-login-form"
          onSubmit={(event) => {
            event.preventDefault()
            handleOperatorSignup()
          }}
        >
          <label>
            {t('operator.auth.name')}
          </label>
          <input
            type="text"
            value={name}
            placeholder={t('operator.auth.namePlaceholder')}
            onChange={(event) =>
              setName(event.target.value)
            }
          />

          <label>
            {t('operator.auth.email')}
          </label>
          <input
            type="email"
            value={email}
            placeholder="operator@example.com"
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />

          <label>
            {t('operator.auth.password')}
          </label>
          <input
            type="password"
            value={password}
            placeholder={t('operator.auth.passwordPlaceholder')}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
          />

          <label>
            {t('operator.auth.passwordConfirm')}
          </label>
          <input
            type="password"
            value={passwordConfirm}
            placeholder={t('operator.auth.passwordConfirmPlaceholder')}
            onChange={(event) =>
              setPasswordConfirm(event.target.value)
            }
            required
          />

          {signupError && (
            <div className="operator-login-error">
              {signupError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSigningUp}
          >
            {isSigningUp
              ? t('operator.auth.signup.submitting')
              : t('operator.auth.signup.submit')}
          </button>
        </form>

        <p className="client-login-help">
          {t('operator.auth.signup.haveAccount')}
          {' '}
          <button
            type="button"
            className="operator-signup-text-button"
            onClick={() => {
              window.location.href =
                '/operator/login'
            }}
          >
            {t('operator.auth.login.submit')}
          </button>
        </p>
      </div>
    </div>
  )
}

function OperatorLoginPage() {
  const { t, i18n } =
    useTranslation()

  const [email, setEmail] =
    useState('')
  const [password, setPassword] =
    useState('')
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
        t('operator.auth.errors.emailPasswordRequired')
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

      const result = await response.json()

      if (
        result.status !== 'authenticated' ||
        !result.accessToken
      ) {
        setLoginError(
          i18n.language === 'en'
            ? t('operator.auth.errors.loginFailed')
            : result.message ||
              t('operator.auth.errors.loginFailed')
        )
        return
      }

      localStorage.setItem(
        'adscope_operator_access_token',
        result.accessToken
      )
      localStorage.setItem(
        'adscope_operator_user',
        JSON.stringify(result.user || {})
      )

      window.location.href = '/'
    } catch (error) {
      console.error(
        'OPERATOR LOGIN FAILED',
        error
      )

      setLoginError(
        t('operator.auth.errors.loginError')
      )
    } finally {
      setIsLoggingIn(false)
    }
  }

  return (
    <div className="client-login-page">
      <div className="client-login-card">
        <div className="operator-auth-topbar">
          <div className="client-login-brand">
            <h1>AdScope</h1>
            <span>Operator Portal</span>
          </div>

          <div
            className="operator-auth-language-switcher"
            aria-label="Language"
          >
            <button
              type="button"
              className={
                i18n.language === 'ko'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                i18n.changeLanguage('ko')
              }
              title={t('operator.auth.koreanLanguage')}
            >
              KO
            </button>
            <span>/</span>
            <button
              type="button"
              className={
                i18n.language === 'en'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                i18n.changeLanguage('en')
              }
              title={t('operator.auth.englishLanguage')}
            >
              EN
            </button>
          </div>
        </div>

        <div className="client-login-heading">
          <h2>
            {t('operator.auth.login.title')}
          </h2>
          <p>
            {t('operator.auth.login.description')}
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
            {t('operator.auth.email')}
          </label>
          <input
            type="email"
            value={email}
            placeholder="operator@example.com"
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />

          <label>
            {t('operator.auth.password')}
          </label>
          <input
            type="password"
            value={password}
            placeholder={t('operator.auth.passwordPlaceholder')}
            onChange={(event) =>
              setPassword(event.target.value)
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
              ? t('operator.auth.login.submitting')
              : t('operator.auth.login.submit')}
          </button>
        </form>

        <p className="client-login-help">
          {t('operator.auth.login.noAccount')}
          {' '}
          <button
            type="button"
            className="operator-signup-link"
            onClick={() => {
              window.location.href =
                '/operator/signup'
            }}
          >
            {t('operator.auth.signup.submit')}
          </button>
        </p>
      </div>
    </div>
  )
}

function OperatorProtectedApp() {
  const { t } =
    useTranslation()

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

        const result = await response.json()

        if (
          result.status !== 'authenticated'
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
          JSON.stringify(result.user || {})
        )

        setAuthStatus('authenticated')
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

  if (authStatus === 'checking') {
    return (
      <div className="operator-auth-loading">
        {t('operator.auth.checking')}
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