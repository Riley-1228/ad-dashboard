from __future__ import annotations

import os
import smtplib
import uuid

from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from dotenv import load_dotenv

from backend.database import (
    get_db_connection,
)


ENV_PATH = (
    Path(__file__).resolve().parent
    / ".env"
)

load_dotenv(
    dotenv_path=ENV_PATH
)


# ---------------------------------------------
# SMTP Config
# ---------------------------------------------

SMTP_HOST = os.getenv(
    "ALERT_SMTP_HOST",
    "",
).strip()

SMTP_PORT = int(
    os.getenv(
        "ALERT_SMTP_PORT",
        "465",
    )
)

SMTP_USERNAME = os.getenv(
    "ALERT_SMTP_USERNAME",
    "",
).strip()

SMTP_PASSWORD = os.getenv(
    "ALERT_SMTP_PASSWORD",
    "",
).strip()

SMTP_FROM_EMAIL = os.getenv(
    "ALERT_SMTP_FROM_EMAIL",
    SMTP_USERNAME,
).strip()

SMTP_FROM_NAME = os.getenv(
    "ALERT_SMTP_FROM_NAME",
    "AdScope",
).strip()

SMTP_USE_SSL = (
    os.getenv(
        "ALERT_SMTP_USE_SSL",
        "true",
    )
    .strip()
    .lower()
    == "true"
)


# ---------------------------------------------
# Helpers
# ---------------------------------------------

def _smtp_configured() -> bool:
    return bool(
        SMTP_HOST
        and SMTP_PORT
        and SMTP_USERNAME
        and SMTP_PASSWORD
        and SMTP_FROM_EMAIL
    )


def _get_operator_email(
    connection,
    advertiser_id: str,
) -> str | None:
    row = connection.execute(
        """
        SELECT
            ou.email

        FROM advertisers AS a

        INNER JOIN operator_users AS ou
            ON ou.id =
                a.owner_operator_id

        WHERE a.id = ?
          AND ou.status = 'active'

        LIMIT 1
        """,
        (
            advertiser_id,
        ),
    ).fetchone()

    if (
        row is None
        or not row["email"]
    ):
        return None

    return str(
        row["email"]
    ).strip()


def _format_metric_value(
    metric: str,
    value,
) -> str:
    if value is None:
        return "-"

    value = float(
        value
    )

    if metric in {
        "roas",
        "ctr",
        "cvr",
    }:
        return (
            f"{value:,.2f}%"
        )

    if metric in {
        "cpa",
        "cpc",
        "revenue",
    }:
        return (
            f"{value:,.0f}원"
        )

    if metric == "conversions":
        return (
            f"{value:,.2f}건"
        )

    return f"{value:,.2f}"


def _metric_label(
    metric: str,
) -> str:
    labels = {
        "roas": "ROAS",
        "cpa": "CPA",
        "cvr": "CVR",
        "ctr": "CTR",
        "cpc": "CPC",
        "revenue": "매출",
        "conversions": "전환",
    }

    return labels.get(
        metric,
        metric.upper(),
    )


def _severity_label(
    severity: str,
) -> str:
    if severity == "critical":
        return "CRITICAL"

    return "WARNING"


def _build_email(
    alert,
    recipient: str,
) -> EmailMessage:
    metric = str(
        alert["metric"]
        or ""
    ).lower()

    severity = str(
        alert["severity"]
        or "warning"
    ).lower()

    metric_label = (
        _metric_label(
            metric
        )
    )

    severity_label = (
        _severity_label(
            severity
        )
    )

    entity_name = (
        alert["campaign_name"]
        or alert["channel"]
        or alert["platform"]
        or alert["entity_key"]
        or "-"
    )

    current_value = (
        _format_metric_value(
            metric,
            alert["current_value"],
        )
    )

    baseline_value = (
        _format_metric_value(
            metric,
            alert["baseline_value"],
        )
    )

    change_pct = float(
        alert["change_pct"]
        or 0
    )

    robust_z = float(
        alert["robust_z"]
        or 0
    )

    subject = (
        f"[AdScope][{severity_label}] "
        f"{metric_label} 이상 변동 감지"
    )

    body = f"""AdScope 이상 지표 알림

심각도: {severity_label}
일자: {alert["alert_date"]}
매체: {alert["channel"] or alert["platform"] or "-"}
대상: {entity_name}

지표: {metric_label}
기준값: {baseline_value}
현재값: {current_value}
변화율: {change_pct:+.1f}%
Robust Z: {robust_z:.2f}

탐지 사유:
{alert["message"] or "-"}

Reason Code:
{alert["reason_code"] or "-"}

AdScope 대시보드의 '이상 알림' 메뉴에서 상세 내용을 확인해주세요.
"""

    message = EmailMessage()

    message[
        "Subject"
    ] = subject

    message[
        "From"
    ] = (
        f"{SMTP_FROM_NAME} "
        f"<{SMTP_FROM_EMAIL}>"
    )

    message[
        "To"
    ] = recipient

    message.set_content(
        body
    )

    return message


def _send_email_message(
    message: EmailMessage,
):
    if SMTP_USE_SSL:
        with smtplib.SMTP_SSL(
            SMTP_HOST,
            SMTP_PORT,
            timeout=20,
        ) as server:
            server.login(
                SMTP_USERNAME,
                SMTP_PASSWORD,
            )

            server.send_message(
                message
            )

        return

    with smtplib.SMTP(
        SMTP_HOST,
        SMTP_PORT,
        timeout=20,
    ) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()

        server.login(
            SMTP_USERNAME,
            SMTP_PASSWORD,
        )

        server.send_message(
            message
        )


# ---------------------------------------------
# Delivery DB
# ---------------------------------------------

def _get_or_create_delivery(
    connection,
    *,
    alert_id: str,
    recipient: str,
):
    existing = connection.execute(
        """
        SELECT *
        FROM metric_alert_deliveries

        WHERE alert_id = ?
          AND channel = 'email'
          AND recipient = ?

        LIMIT 1
        """,
        (
            alert_id,
            recipient,
        ),
    ).fetchone()

    if existing is not None:
        return existing

    delivery_id = str(
        uuid.uuid4()
    )

    now = (
        datetime.now()
        .isoformat()
    )

    connection.execute(
        """
        INSERT INTO
            metric_alert_deliveries (
                id,
                alert_id,

                channel,
                recipient,
                provider,

                status,
                attempt_count,

                provider_message_id,
                error_message,

                is_fallback,
                fallback_for_delivery_id,

                created_at,
                updated_at,
                sent_at
            )

        VALUES (
            ?,
            ?,

            'email',
            ?,
            'smtp',

            'pending',
            0,

            NULL,
            NULL,

            0,
            NULL,

            ?,
            ?,
            NULL
        )
        """,
        (
            delivery_id,
            alert_id,
            recipient,
            now,
            now,
        ),
    )

    connection.commit()

    return connection.execute(
        """
        SELECT *
        FROM metric_alert_deliveries
        WHERE id = ?
        LIMIT 1
        """,
        (
            delivery_id,
        ),
    ).fetchone()


# ---------------------------------------------
# Public
# ---------------------------------------------

def send_pending_alert_emails(
    advertiser_id: str,
) -> dict:
    if not advertiser_id:
        raise ValueError(
            "advertiser_id가 필요합니다."
        )

    if not _smtp_configured():
        return {
            "status":
                "not_configured",

            "advertiserId":
                advertiser_id,

            "message":
                "이메일 SMTP 설정이 없습니다.",

            "sentCount":
                0,

            "failedCount":
                0,
        }

    connection = (
        get_db_connection()
    )

    try:
        recipient = (
            _get_operator_email(
                connection,
                advertiser_id,
            )
        )

        if not recipient:
            return {
                "status":
                    "blocked",

                "advertiserId":
                    advertiser_id,

                "message":
                    (
                        "Alert 이메일을 받을 "
                        "운영자 이메일이 없습니다."
                    ),

                "sentCount":
                    0,

                "failedCount":
                    0,
            }

        alerts = connection.execute(
            """
            SELECT
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
                message

            FROM metric_anomaly_alerts

            WHERE advertiser_id = ?

              AND severity IN (
                    'warning',
                    'critical'
              )

              AND status != 'resolved'

            ORDER BY
                alert_date ASC,
                created_at ASC
            """,
            (
                advertiser_id,
            ),
        ).fetchall()

        sent_count = 0
        failed_count = 0
        skipped_count = 0

        results = []

        for alert in alerts:
            delivery = (
                _get_or_create_delivery(
                    connection,

                    alert_id=
                        alert["id"],

                    recipient=
                        recipient,
                )
            )

            if (
                delivery[
                    "status"
                ]
                == "sent"
            ):
                skipped_count += 1

                results.append(
                    {
                        "alertId":
                            alert[
                                "id"
                            ],

                        "deliveryId":
                            delivery[
                                "id"
                            ],

                        "status":
                            "already_sent",
                    }
                )

                continue

            now = (
                datetime.now()
                .isoformat()
            )

            try:
                email_message = (
                    _build_email(
                        alert,
                        recipient,
                    )
                )

                _send_email_message(
                    email_message
                )

                connection.execute(
                    """
                    UPDATE
                        metric_alert_deliveries

                    SET
                        status = 'sent',

                        attempt_count =
                            attempt_count + 1,

                        error_message = NULL,

                        updated_at = ?,

                        sent_at = ?

                    WHERE id = ?
                    """,
                    (
                        now,
                        now,
                        delivery[
                            "id"
                        ],
                    ),
                )

                connection.commit()

                sent_count += 1

                results.append(
                    {
                        "alertId":
                            alert[
                                "id"
                            ],

                        "deliveryId":
                            delivery[
                                "id"
                            ],

                        "status":
                            "sent",

                        "recipient":
                            recipient,
                    }
                )

            except Exception as error:
                connection.execute(
                    """
                    UPDATE
                        metric_alert_deliveries

                    SET
                        status = 'failed',

                        attempt_count =
                            attempt_count + 1,

                        error_message = ?,

                        updated_at = ?

                    WHERE id = ?
                    """,
                    (
                        str(
                            error
                        ),
                        now,
                        delivery[
                            "id"
                        ],
                    ),
                )

                connection.commit()

                failed_count += 1

                results.append(
                    {
                        "alertId":
                            alert[
                                "id"
                            ],

                        "deliveryId":
                            delivery[
                                "id"
                            ],

                        "status":
                            "failed",

                        "recipient":
                            recipient,

                        "error":
                            str(
                                error
                            ),
                    }
                )

        return {
            "status":
                "ok",

            "advertiserId":
                advertiser_id,

            "recipient":
                recipient,

            "alertCount":
                len(
                    alerts
                ),

            "sentCount":
                sent_count,

            "failedCount":
                failed_count,

            "skippedCount":
                skipped_count,

            "results":
                results,
        }

    finally:
        connection.close()