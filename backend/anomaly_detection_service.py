from __future__ import annotations

import math
import uuid

from datetime import (
    date,
    datetime,
    timedelta,
)

from statistics import median

from backend.database import (
    get_db_connection,
)


# ---------------------------------------------
# Detection Config
# ---------------------------------------------

BASELINE_WINDOW_DAYS = 28
MIN_BASELINE_DAYS = 14

WARNING_CHANGE_PCT = 20.0
WARNING_ROBUST_Z = 2.5

CRITICAL_CHANGE_PCT = 35.0
CRITICAL_ROBUST_Z = 3.5


METRIC_RULES = {
    "roas": {
        "bad_direction": "decrease",
        "label": "ROAS",
        "requires_conversion_validity": True,
    },

    "cpa": {
        "bad_direction": "increase",
        "label": "CPA",
        "requires_conversion_validity": True,
    },

    "cvr": {
        "bad_direction": "decrease",
        "label": "CVR",
        "requires_conversion_validity": True,
    },

    "ctr": {
        "bad_direction": "decrease",
        "label": "CTR",
        "requires_conversion_validity": False,
    },

    "cpc": {
        "bad_direction": "increase",
        "label": "CPC",
        "requires_conversion_validity": False,
    },

    "revenue": {
        "bad_direction": "decrease",
        "label": "매출",
        "requires_conversion_validity": True,
    },

    "conversions": {
        "bad_direction": "decrease",
        "label": "전환",
        "requires_conversion_validity": True,
    },
}


# ---------------------------------------------
# Helpers
# ---------------------------------------------

def _safe_float(
    value,
) -> float:
    try:
        result = float(
            value or 0
        )

    except (
        TypeError,
        ValueError,
    ):
        return 0.0

    if not math.isfinite(
        result
    ):
        return 0.0

    return result


def _metric_values(
    row: dict,
) -> dict:
    spend = _safe_float(
        row.get(
            "spend"
        )
    )

    impressions = _safe_float(
        row.get(
            "impressions"
        )
    )

    clicks = _safe_float(
        row.get(
            "clicks"
        )
    )

    conversions = _safe_float(
        row.get(
            "conversions"
        )
    )

    revenue = _safe_float(
        row.get(
            "revenue"
        )
    )

    return {
        "roas":
            (
                revenue
                / spend
                * 100
                if spend > 0
                else None
            ),

        "cpa":
            (
                spend
                / conversions
                if conversions > 0
                else None
            ),

        "cvr":
            (
                conversions
                / clicks
                * 100
                if clicks > 0
                else None
            ),

        "ctr":
            (
                clicks
                / impressions
                * 100
                if impressions > 0
                else None
            ),

        "cpc":
            (
                spend
                / clicks
                if clicks > 0
                else None
            ),

        "revenue":
            revenue,

        "conversions":
            conversions,
    }


def _change_pct(
    current_value: float,
    baseline_value: float,
) -> float | None:
    if (
        baseline_value is None
        or abs(
            baseline_value
        ) < 1e-12
    ):
        return None

    return (
        (
            current_value
            - baseline_value
        )
        / abs(
            baseline_value
        )
        * 100
    )


def _robust_z(
    current_value: float,
    history_values: list[float],
) -> tuple[
    float,
    float,
]:
    baseline = float(
        median(
            history_values
        )
    )

    deviations = [
        abs(
            value
            - baseline
        )
        for value
        in history_values
    ]

    mad = float(
        median(
            deviations
        )
    )

    # MAD가 0인 매우 안정적인 데이터에서도
    # division-by-zero가 나지 않도록
    # 최소 scale을 둔다.
    scale = max(
        mad,
        abs(
            baseline
        ) * 0.05,
        1e-9,
    )

    robust_z = (
        0.6745
        * (
            current_value
            - baseline
        )
        / scale
    )

    return (
        baseline,
        robust_z,
    )


def _is_bad_direction(
    change_pct: float,
    bad_direction: str,
) -> bool:
    if (
        bad_direction
        == "decrease"
    ):
        return (
            change_pct < 0
        )

    return (
        change_pct > 0
    )


def _severity(
    change_pct: float,
    robust_z: float,
    bad_direction: str,
) -> str | None:
    if not _is_bad_direction(
        change_pct,
        bad_direction,
    ):
        return None

    abs_change = abs(
        change_pct
    )

    abs_z = abs(
        robust_z
    )

    if (
        abs_change
        >= CRITICAL_CHANGE_PCT
        and abs_z
        >= CRITICAL_ROBUST_Z
    ):
        return "critical"

    if (
        abs_change
        >= WARNING_CHANGE_PCT
        and abs_z
        >= WARNING_ROBUST_Z
    ):
        return "warning"

    return None


def _direction(
    current_value: float,
    baseline_value: float,
) -> str:
    if (
        current_value
        > baseline_value
    ):
        return "increase"

    if (
        current_value
        < baseline_value
    ):
        return "decrease"

    return "stable"


def _build_entity_key(
    *,
    scope: str,
    platform: str,
    account_id: str,
    campaign_id: str,
    channel: str,
) -> str:
    if scope == "channel":
        return (
            channel
            or platform
        )

    return "::".join(
        [
            platform or "",
            account_id or "",
            campaign_id or "",
        ]
    )


# ---------------------------------------------
# Revenue / Conversion Validity
# ---------------------------------------------

def _load_conversion_validity(
    connection,
    advertiser_id: str,
) -> dict[str, str | None]:
    rows = connection.execute(
        """
        SELECT
            platform,
            conversion_tracking_start_date
        FROM ad_connections
        WHERE advertiser_id = ?
          AND status = 'connected'
        """,
        (
            advertiser_id,
        ),
    ).fetchall()

    grouped = {}

    for row in rows:
        platform = str(
            row[
                "platform"
            ]
            or ""
        ).strip().lower()

        if not platform:
            continue

        grouped.setdefault(
            platform,
            [],
        ).append(
            row[
                "conversion_tracking_start_date"
            ]
        )

    result = {}

    for (
        platform,
        values,
    ) in grouped.items():
        if any(
            not value
            for value
            in values
        ):
            result[
                platform
            ] = None

            continue

        result[
            platform
        ] = max(
            str(
                value
            )
            for value
            in values
        )

    return result


# ---------------------------------------------
# Daily aggregation
# ---------------------------------------------

def _build_daily_entities(
    rows,
    scope: str,
) -> dict:
    grouped = {}

    for row in rows:
        row_date = str(
            row[
                "date"
            ]
            or ""
        )

        platform = str(
            row[
                "platform"
            ]
            or ""
        ).strip()

        account_id = str(
            row[
                "account_id"
            ]
            or ""
        ).strip()

        campaign_id = str(
            row[
                "campaign_id"
            ]
            or ""
        ).strip()

        campaign_name = str(
            row[
                "campaign_name"
            ]
            or campaign_id
            or ""
        ).strip()

        channel = str(
            row[
                "channel"
            ]
            or platform
            or ""
        ).strip()

        if (
            not row_date
            or not channel
        ):
            continue

        if (
            scope == "campaign"
            and not campaign_id
        ):
            continue

        entity_key = (
            _build_entity_key(
                scope=scope,
                platform=platform,
                account_id=account_id,
                campaign_id=campaign_id,
                channel=channel,
            )
        )

        key = (
            entity_key,
            row_date,
        )

        if key not in grouped:
            grouped[key] = {
                "entity_key":
                    entity_key,

                "date":
                    row_date,

                "platform":
                    platform,

                "account_id":
                    account_id,

                "channel":
                    channel,

                "campaign_id":
                    (
                        campaign_id
                        if
                        scope
                        == "campaign"
                        else None
                    ),

                "campaign_name":
                    (
                        campaign_name
                        if
                        scope
                        == "campaign"
                        else None
                    ),

                "spend":
                    0.0,

                "impressions":
                    0.0,

                "clicks":
                    0.0,

                "conversions":
                    0.0,

                "revenue":
                    0.0,
            }

        target = grouped[
            key
        ]

        target[
            "spend"
        ] += _safe_float(
            row[
                "spend"
            ]
        )

        target[
            "impressions"
        ] += _safe_float(
            row[
                "impressions"
            ]
        )

        target[
            "clicks"
        ] += _safe_float(
            row[
                "clicks"
            ]
        )

        target[
            "conversions"
        ] += _safe_float(
            row[
                "conversions"
            ]
        )

        target[
            "revenue"
        ] += _safe_float(
            row[
                "revenue"
            ]
        )

    return grouped


# ---------------------------------------------
# Alert DB save
# ---------------------------------------------

def _save_alert(
    connection,
    alert: dict,
):
    now = (
        datetime.now()
        .isoformat()
    )

    alert_id = str(
        uuid.uuid4()
    )

    connection.execute(
        """
        INSERT INTO
            metric_anomaly_alerts (
                id,
                advertiser_id,

                scope,
                entity_key,

                platform,
                channel,

                campaign_id,
                campaign_name,

                metric,
                alert_date,

                current_value,
                baseline_value,

                change_pct,
                robust_z,

                severity,
                direction,

                reason_code,

                status,

                title,
                message,

                created_at,
                updated_at,

                acknowledged_at,
                resolved_at
            )
        VALUES (
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?,
            'open',
            ?, ?,
            ?, ?,
            NULL,
            NULL
        )

        ON CONFLICT(
            advertiser_id,
            scope,
            entity_key,
            metric,
            alert_date,
            reason_code
        )

        DO UPDATE SET
            current_value =
                excluded.current_value,

            baseline_value =
                excluded.baseline_value,

            change_pct =
                excluded.change_pct,

            robust_z =
                excluded.robust_z,

            severity =
                excluded.severity,

            direction =
                excluded.direction,

            title =
                excluded.title,

            message =
                excluded.message,

            updated_at =
                excluded.updated_at
        """,
        (
            alert_id,
            alert[
                "advertiser_id"
            ],

            alert[
                "scope"
            ],
            alert[
                "entity_key"
            ],

            alert.get(
                "platform"
            ),
            alert.get(
                "channel"
            ),

            alert.get(
                "campaign_id"
            ),
            alert.get(
                "campaign_name"
            ),

            alert[
                "metric"
            ],
            alert[
                "alert_date"
            ],

            alert[
                "current_value"
            ],
            alert[
                "baseline_value"
            ],

            alert[
                "change_pct"
            ],
            alert[
                "robust_z"
            ],

            alert[
                "severity"
            ],
            alert[
                "direction"
            ],

            alert[
                "reason_code"
            ],

            alert[
                "title"
            ],
            alert[
                "message"
            ],

            now,
            now,
        ),
    )


# ---------------------------------------------
# Scope detection
# ---------------------------------------------

def _detect_scope(
    *,
    connection,
    advertiser_id: str,
    target_date: str,
    rows,
    scope: str,
    conversion_validity: dict,
) -> list[dict]:
    daily = _build_daily_entities(
        rows,
        scope,
    )

    entity_keys = sorted(
        {
            entity_key
            for (
                entity_key,
                _
            )
            in daily.keys()
        }
    )

    detected = []

    for entity_key in entity_keys:
        entity_rows = sorted(
            [
                row
                for (
                    key,
                    _
                ),
                row
                in daily.items()
                if key
                == entity_key
            ],
            key=lambda item:
                item[
                    "date"
                ],
        )

        current_row = next(
            (
                row
                for row
                in entity_rows
                if row[
                    "date"
                ]
                == target_date
            ),
            None,
        )

        if current_row is None:
            continue

        history_rows = [
            row
            for row
            in entity_rows
            if row[
                "date"
            ] < target_date
        ][
            -BASELINE_WINDOW_DAYS:
        ]

        if len(
            history_rows
        ) < MIN_BASELINE_DAYS:
            continue

        platform_key = str(
            current_row.get(
                "platform"
            )
            or ""
        ).strip().lower()

        validity_start = (
            conversion_validity.get(
                platform_key
            )
        )

        current_metrics = (
            _metric_values(
                current_row
            )
        )

        # -------------------------------------
        # 일반 Metric anomaly
        # -------------------------------------

        for (
            metric,
            rule,
        ) in METRIC_RULES.items():
            if (
                rule[
                    "requires_conversion_validity"
                ]
                and (
                    not validity_start
                    or target_date
                    < validity_start
                )
            ):
                continue

            current_value = (
                current_metrics.get(
                    metric
                )
            )

            if current_value is None:
                continue

            history_values = []

            for history_row in history_rows:
                if (
                    rule[
                        "requires_conversion_validity"
                    ]
                    and validity_start
                    and history_row[
                        "date"
                    ] < validity_start
                ):
                    continue

                metric_value = (
                    _metric_values(
                        history_row
                    ).get(
                        metric
                    )
                )

                if (
                    metric_value
                    is not None
                    and math.isfinite(
                        metric_value
                    )
                ):
                    history_values.append(
                        float(
                            metric_value
                        )
                    )

            if len(
                history_values
            ) < MIN_BASELINE_DAYS:
                continue

            (
                baseline_value,
                robust_z,
            ) = _robust_z(
                float(
                    current_value
                ),
                history_values,
            )

            change_pct = (
                _change_pct(
                    float(
                        current_value
                    ),
                    baseline_value,
                )
            )

            if change_pct is None:
                continue

            severity = (
                _severity(
                    change_pct,
                    robust_z,
                    rule[
                        "bad_direction"
                    ],
                )
            )

            if severity is None:
                continue

            direction = (
                _direction(
                    float(
                        current_value
                    ),
                    baseline_value,
                )
            )

            label = rule[
                "label"
            ]

            title = (
                f"{label} 이상 변동 감지"
            )

            message = (
                f"{label}이 평소 기준 대비 "
                f"{change_pct:+.1f}% 변동했습니다. "
                f"현재값={current_value:.2f}, "
                f"기준값={baseline_value:.2f}, "
                f"Robust Z={robust_z:.2f}"
            )

            alert = {
                "advertiser_id":
                    advertiser_id,

                "scope":
                    scope,

                "entity_key":
                    entity_key,

                "platform":
                    current_row.get(
                        "platform"
                    ),

                "channel":
                    current_row.get(
                        "channel"
                    ),

                "campaign_id":
                    current_row.get(
                        "campaign_id"
                    ),

                "campaign_name":
                    current_row.get(
                        "campaign_name"
                    ),

                "metric":
                    metric,

                "alert_date":
                    target_date,

                "current_value":
                    float(
                        current_value
                    ),

                "baseline_value":
                    baseline_value,

                "change_pct":
                    change_pct,

                "robust_z":
                    robust_z,

                "severity":
                    severity,

                "direction":
                    direction,

                "reason_code":
                    "ROBUST_METRIC_ANOMALY",

                "title":
                    title,

                "message":
                    message,
            }

            _save_alert(
                connection,
                alert,
            )

            detected.append(
                alert
            )

        # -------------------------------------
        # Tracking anomaly
        #
        # Spend는 평소 수준인데
        # Revenue 또는 Conversion이 0이면
        # 별도 Critical Alert
        # -------------------------------------

        if (
            validity_start
            and target_date
            >= validity_start
        ):
            current_spend = (
                _safe_float(
                    current_row.get(
                        "spend"
                    )
                )
            )

            spend_history = [
                _safe_float(
                    row.get(
                        "spend"
                    )
                )
                for row
                in history_rows
            ]

            baseline_spend = (
                float(
                    median(
                        spend_history
                    )
                )
                if spend_history
                else 0.0
            )

            spend_is_active = (
                current_spend > 0
                and (
                    baseline_spend <= 0
                    or current_spend
                    >= baseline_spend
                    * 0.5
                )
            )

            tracking_metrics = [
                (
                    "revenue",
                    "TRACKING_REVENUE_ZERO",
                    "매출 추적 이상 의심",
                ),
                (
                    "conversions",
                    "TRACKING_CONVERSION_ZERO",
                    "전환 추적 이상 의심",
                ),
            ]

            for (
                metric,
                reason_code,
                title,
            ) in tracking_metrics:
                current_value = (
                    current_metrics.get(
                        metric
                    )
                )

                history_values = [
                    _metric_values(
                        row
                    ).get(
                        metric
                    )
                    for row
                    in history_rows
                    if (
                        not validity_start
                        or row[
                            "date"
                        ]
                        >= validity_start
                    )
                ]

                history_values = [
                    float(
                        value
                    )
                    for value
                    in history_values
                    if (
                        value
                        is not None
                        and math.isfinite(
                            value
                        )
                    )
                ]

                if len(
                    history_values
                ) < MIN_BASELINE_DAYS:
                    continue

                baseline_value = float(
                    median(
                        history_values
                    )
                )

                if not (
                    spend_is_active
                    and current_value
                    is not None
                    and float(
                        current_value
                    ) == 0
                    and baseline_value > 0
                ):
                    continue

                alert = {
                    "advertiser_id":
                        advertiser_id,

                    "scope":
                        scope,

                    "entity_key":
                        entity_key,

                    "platform":
                        current_row.get(
                            "platform"
                        ),

                    "channel":
                        current_row.get(
                            "channel"
                        ),

                    "campaign_id":
                        current_row.get(
                            "campaign_id"
                        ),

                    "campaign_name":
                        current_row.get(
                            "campaign_name"
                        ),

                    "metric":
                        metric,

                    "alert_date":
                        target_date,

                    "current_value":
                        0.0,

                    "baseline_value":
                        baseline_value,

                    "change_pct":
                        -100.0,

                    "robust_z":
                        -999.0,

                    "severity":
                        "critical",

                    "direction":
                        "decrease",

                    "reason_code":
                        reason_code,

                    "title":
                        title,

                    "message":
                        (
                            "광고비는 계속 집행되고 있으나 "
                            f"{metric} 값이 0으로 확인되었습니다. "
                            "Conversion Tracking 상태를 확인해주세요."
                        ),
                }

                _save_alert(
                    connection,
                    alert,
                )

                detected.append(
                    alert
                )

    return detected


# ---------------------------------------------
# Public entrypoint
# ---------------------------------------------

def run_anomaly_detection(
    advertiser_id: str,
    target_date: str | None = None,
) -> dict:
    if not advertiser_id:
        raise ValueError(
            "advertiser_id가 필요합니다."
        )

    connection = (
        get_db_connection()
    )

    try:
        # -------------------------------------
        # 완료된 날짜만 사용
        # -------------------------------------

        if target_date is None:
            today = (
                date.today()
                .isoformat()
            )

            row = connection.execute(
                """
                SELECT
                    MAX(date) AS latest_date
                FROM ad_performance_daily
                WHERE advertiser_id = ?
                  AND date < ?
                """,
                (
                    advertiser_id,
                    today,
                ),
            ).fetchone()

            target_date = (
                row[
                    "latest_date"
                ]
                if row
                else None
            )

        if not target_date:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "NO_COMPLETED_DAILY_DATA",

                "message":
                    "완료된 일별 성과 데이터가 없습니다.",

                "detectedCount":
                    0,

                "alerts":
                    [],
            }

        target_date_obj = (
            datetime.strptime(
                target_date,
                "%Y-%m-%d",
            ).date()
        )

        history_start = (
            target_date_obj
            - timedelta(
                days=60
            )
        ).isoformat()

        rows = connection.execute(
            """
            SELECT
                date,
                platform,
                account_id,

                campaign_id,
                campaign_name,
                channel,

                spend,
                impressions,
                clicks,
                conversions,
                revenue

            FROM ad_performance_daily

            WHERE advertiser_id = ?
              AND date >= ?
              AND date <= ?

            ORDER BY
                date ASC,
                platform ASC,
                campaign_id ASC
            """,
            (
                advertiser_id,
                history_start,
                target_date,
            ),
        ).fetchall()

        if not rows:
            return {
                "status":
                    "blocked",

                "blockCode":
                    "NO_DAILY_PERFORMANCE",

                "message":
                    "이상 탐지에 사용할 데이터가 없습니다.",

                "detectedCount":
                    0,

                "alerts":
                    [],
            }

        conversion_validity = (
            _load_conversion_validity(
                connection,
                advertiser_id,
            )
        )

        detected = []

        for scope in (
            "campaign",
            "channel",
        ):
            detected.extend(
                _detect_scope(
                    connection=
                        connection,

                    advertiser_id=
                        advertiser_id,

                    target_date=
                        target_date,

                    rows=
                        rows,

                    scope=
                        scope,

                    conversion_validity=
                        conversion_validity,
                )
            )

        connection.commit()

        warning_count = sum(
            1
            for alert
            in detected
            if alert[
                "severity"
            ] == "warning"
        )

        critical_count = sum(
            1
            for alert
            in detected
            if alert[
                "severity"
            ] == "critical"
        )

        return {
            "status":
                "ok",

            "advertiserId":
                advertiser_id,

            "targetDate":
                target_date,

            "detectedCount":
                len(
                    detected
                ),

            "warningCount":
                warning_count,

            "criticalCount":
                critical_count,

            "alerts":
                detected,
        }

    finally:
        connection.close()