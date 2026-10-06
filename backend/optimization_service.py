from __future__ import annotations

import json
import math
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from backend.database import get_db_connection


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
MODEL_ENV_PYTHON = (
    PROJECT_ROOT
    / "gurobi_model_recovery"
    / ".venv"
    / "Scripts"
    / "python.exe"
)
MODEL_ROOT = (
    PROJECT_ROOT
    / "gurobi_model_recovery"
    / "gurobi_model_recovery"
)
WORKER_PATH = MODEL_ROOT / "live_preview_worker.py"


class OptimizationPreviewServiceError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = int(status_code)
        self.detail = str(detail)


def _verify_advertiser_owner(
    connection: sqlite3.Connection,
    advertiser_id: str,
    operator_id: str,
) -> None:
    row = connection.execute(
        """
        SELECT id
        FROM advertisers
        WHERE id = ?
          AND owner_operator_id = ?
        LIMIT 1
        """,
        (advertiser_id, operator_id),
    ).fetchone()

    if row is None:
        raise OptimizationPreviewServiceError(
            403,
            "해당 광고주에 접근할 권한이 없습니다.",
        )


def _resolve_account_id(
    connection: sqlite3.Connection,
    advertiser_id: str,
    requested_account_id: str | None,
) -> str:
    if requested_account_id:
        row = connection.execute(
            """
            SELECT 1
            FROM ad_performance_daily
            WHERE platform = 'naver'
              AND advertiser_id = ?
              AND account_id = ?
            LIMIT 1
            """,
            (advertiser_id, requested_account_id),
        ).fetchone()
        if row is None:
            raise OptimizationPreviewServiceError(
                404,
                "선택한 광고주의 해당 Naver 계정 성과 데이터를 찾을 수 없습니다.",
            )
        return str(requested_account_id)

    rows = connection.execute(
        """
        SELECT DISTINCT account_id
        FROM ad_performance_daily
        WHERE platform = 'naver'
          AND advertiser_id = ?
          AND account_id IS NOT NULL
          AND TRIM(CAST(account_id AS TEXT)) != ''
        ORDER BY account_id
        """,
        (advertiser_id,),
    ).fetchall()

    account_ids = [str(row["account_id"]) for row in rows]

    if not account_ids:
        raise OptimizationPreviewServiceError(
            404,
            "선택한 광고주에 저장된 Naver 일별 성과 데이터가 없습니다.",
        )

    if len(account_ids) > 1:
        raise OptimizationPreviewServiceError(
            400,
            "Naver 계정이 여러 개입니다. accountId를 지정해주세요.",
        )

    return account_ids[0]


def _fetch_performance_records(
    connection: sqlite3.Connection,
    advertiser_id: str,
    account_id: str,
) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT
            advertiser_id,
            platform,
            account_id,
            date,
            campaign_id,
            campaign_name,
            spend,
            impressions,
            clicks,
            conversions,
            revenue
        FROM ad_performance_daily
        WHERE platform = 'naver'
          AND advertiser_id = ?
          AND account_id = ?
        ORDER BY date ASC, campaign_id ASC
        """,
        (advertiser_id, account_id),
    ).fetchall()

    return [
        {
            "advertiser_id": row["advertiser_id"],
            "platform": row["platform"],
            "account_id": row["account_id"],
            "date": row["date"],
            "campaign_id": row["campaign_id"],
            "campaign_name": row["campaign_name"] or row["campaign_id"],
            "spend": row["spend"],
            "impressions": row["impressions"],
            "clicks": row["clicks"],
            "conversions": row["conversions"],
            "revenue": row["revenue"],
        }
        for row in rows
    ]


def _validate_runtime_files() -> None:
    missing = [
        path
        for path in (MODEL_ENV_PYTHON, MODEL_ROOT, WORKER_PATH)
        if not path.exists()
    ]
    if missing:
        joined = ", ".join(str(path) for path in missing)
        raise OptimizationPreviewServiceError(
            500,
            f"최적화 런타임 파일을 찾을 수 없습니다: {joined}",
        )


def run_naver_optimization_preview(
    *,
    advertiser_id: str,
    operator_id: str,
    account_id: str | None = None,
    max_budget_change_pct: float = 0.30,
    revenue_valid_start_date: str | None = None,
    optimization_scope: str = "campaign",
    performance_records: list[dict[str, Any]] | None = None,
    revenue_valid_start_dates: dict[str, str] | None = None,

    current_budgets: dict[str, float] | None = None,
    budget_bounds: dict[str, dict[str, float]] | None = None,
    total_daily_budget: float | None = None,
) -> dict[str, Any]:
    advertiser_id = str(
        advertiser_id or ""
    ).strip()

    operator_id = str(
        operator_id or ""
    ).strip()

    account_id = (
        str(account_id).strip()
        if account_id
        else None
    )

    revenue_valid_start_date = (
        str(
            revenue_valid_start_date
        ).strip()
        if revenue_valid_start_date
        else None
    )

    optimization_scope = str(
        optimization_scope
        or "campaign"
    ).strip().lower()

    if optimization_scope not in {
        "campaign",
        "channel",
    }:
        raise OptimizationPreviewServiceError(
            400,
            (
                "optimizationScope는 "
                "campaign 또는 channel이어야 합니다."
            ),
        )

    normalized_revenue_valid_start_dates = {}

    for (
        channel_name,
        start_date,
    ) in (
        revenue_valid_start_dates
        or {}
    ).items():
        normalized_channel_name = str(
            channel_name
            or ""
        ).strip()

        normalized_start_date = str(
            start_date
            or ""
        ).strip()

        if (
            normalized_channel_name
            and normalized_start_date
        ):
            normalized_revenue_valid_start_dates[
                normalized_channel_name
            ] = normalized_start_date

    if not advertiser_id:
        raise OptimizationPreviewServiceError(
            400,
            "advertiserId가 필요합니다.",
        )

    if not operator_id:
        raise OptimizationPreviewServiceError(
            401,
            "운영자 정보를 확인할 수 없습니다.",
        )

    try:
        max_change = float(
            max_budget_change_pct
        )

    except (
        TypeError,
        ValueError,
    ) as exc:
        raise OptimizationPreviewServiceError(
            400,
            "maxBudgetChangePct는 숫자여야 합니다.",
        ) from exc

    if (
        not math.isfinite(max_change)
        or not 0 <= max_change <= 0.30
    ):
        raise OptimizationPreviewServiceError(
            400,
            (
                "현재 검증된 shadow preview에서는 "
                "maxBudgetChangePct를 0~0.30 "
                "범위로만 사용할 수 있습니다."
            ),
        )

    _validate_runtime_files()

    connection = get_db_connection()

    try:
        _verify_advertiser_owner(
            connection,
            advertiser_id,
            operator_id,
        )

        if (
            optimization_scope
            == "channel"
        ):
            resolved_account_id = None

            records = list(
                performance_records
                or []
            )

        else:
            # ---------------------------------
            # Campaign scope
            #
            # performance_records가 외부에서
            # 전달되면 그것을 최우선 사용.
            #
            # Mock:
            #   frontend Mock filtered data
            #
            # Naver filtered preview:
            #   frontend 상단 필터 적용 데이터
            #
            # 전달값이 없을 때만 기존 DB 조회.
            # ---------------------------------

            if (
                performance_records
                is not None
            ):
                resolved_account_id = (
                    str(
                        account_id
                    ).strip()
                    if account_id
                    else None
                )

                records = list(
                    performance_records
                )

            else:
                resolved_account_id = (
                    _resolve_account_id(
                        connection,
                        advertiser_id,
                        account_id,
                    )
                )

                records = (
                    _fetch_performance_records(
                        connection,
                        advertiser_id,
                        resolved_account_id,
                    )
                )

    finally:
        connection.close()

    if not records:
        raise OptimizationPreviewServiceError(
            404,
            (
                "매체별 최적화에 사용할 "
                "일별 성과 데이터가 없습니다."
                if optimization_scope
                == "channel"
                else
                (
                    "최적화에 사용할 Naver "
                    "일별 성과 데이터가 없습니다."
                )
            ),
        )

    request_payload = {
        "advertiserId":
            advertiser_id,

        "accountId":
            resolved_account_id,

        "optimizationScope":
            optimization_scope,

        "maxBudgetChangePct":
            max_change,

        "reviewPolicy":
            "freeze",

        "performance":
            records,

        "currentBudgets":
            current_budgets
            or {},

        "budgetBounds":
            budget_bounds
            or {},

        "totalDailyBudget":
            total_daily_budget,
    }

    if (
        optimization_scope
        == "channel"
    ):
        request_payload[
            "revenueValidStartDates"
        ] = (
            normalized_revenue_valid_start_dates
        )

    else:
        request_payload[
            "revenueValidStartDate"
        ] = (
            revenue_valid_start_date
        )

    with tempfile.TemporaryDirectory(
        prefix=
            "adscope_optimization_preview_"
    ) as temp_dir:
        temp_path = Path(
            temp_dir
        )

        input_path = (
            temp_path
            / "request.json"
        )

        output_path = (
            temp_path
            / "response.json"
        )

        input_path.write_text(
            json.dumps(
                request_payload,
                ensure_ascii=False,
                allow_nan=False,
            ),
            encoding="utf-8",
        )

        try:
            completed = subprocess.run(
                [
                    str(
                        MODEL_ENV_PYTHON
                    ),
                    str(
                        WORKER_PATH
                    ),
                    "--input",
                    str(
                        input_path
                    ),
                    "--output",
                    str(
                        output_path
                    ),
                ],
                cwd=str(
                    MODEL_ROOT
                ),
                capture_output=True,
                text=True,
                timeout=300,
                check=False,
            )

        except subprocess.TimeoutExpired as exc:
            raise OptimizationPreviewServiceError(
                504,
                (
                    "최적화 preview 실행 시간이 "
                    "5분을 초과했습니다."
                ),
            ) from exc

        except OSError as exc:
            raise OptimizationPreviewServiceError(
                500,
                (
                    "최적화 프로세스를 "
                    f"시작하지 못했습니다: {exc}"
                ),
            ) from exc

        if not output_path.is_file():
            stderr = (
                completed.stderr
                or ""
            ).strip()[-1500:]

            raise OptimizationPreviewServiceError(
                500,
                (
                    "최적화 worker 결과 파일이 "
                    "생성되지 않았습니다."
                )
                + (
                    f" 상세: {stderr}"
                    if stderr
                    else ""
                ),
            )

        try:
            result = json.loads(
                output_path.read_text(
                    encoding="utf-8"
                )
            )

        except (
            OSError,
            json.JSONDecodeError,
        ) as exc:
            raise OptimizationPreviewServiceError(
                500,
                (
                    "최적화 worker 결과를 "
                    "읽을 수 없습니다."
                ),
            ) from exc

        if (
            completed.returncode != 0
            or result.get(
                "status"
            ) == "error"
        ):
            detail = str(
                result.get(
                    "message"
                )
                or
                (
                    "최적화 worker 실행에 "
                    "실패했습니다."
                )
            )

            raise OptimizationPreviewServiceError(
                500,
                detail,
            )

    # Shadow preview only.
    # This service never calls
    # the Naver write API.
    result[
        "productionWriteEnabled"
    ] = False

    result[
        "shadowOnly"
    ] = True

    return result
