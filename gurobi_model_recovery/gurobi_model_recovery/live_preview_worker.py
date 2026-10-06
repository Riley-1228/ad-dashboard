from __future__ import annotations

import argparse
import importlib
import json
import math
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
FROZEN_DIR = HERE / "frozen_v2"
SAFETY_DIR = HERE / "optimization_safety_gate"
GUARDED_DIR = HERE / "guarded_reoptimization"
CERT_PATH = HERE / "independent_validation" / "results" / "aggregate_results.csv"

for path in (FROZEN_DIR, SAFETY_DIR, GUARDED_DIR):
    if not path.is_dir():
        raise RuntimeError(f"Required model directory missing: {path}")
    sys.path.insert(0, str(path))

m = importlib.import_module("naver_budget_optimizer")
rv2 = importlib.import_module("run_v2")
est2 = importlib.import_module("response_estimator_v2")
sg = importlib.import_module("optimization_safety_gate")
gr = importlib.import_module("guarded_reoptimization")


def _json_safe(value):
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, np.ndarray):
        return _json_safe(value.tolist())
    if isinstance(value, np.generic):
        return _json_safe(value.item())
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _blocked(message: str, code: str, **extra):
    result = {
        "status": "blocked",
        "portfolioAction": "BLOCK",
        "productionWriteEnabled": False,
        "shadowOnly": True,
        "blockCode": code,
        "message": message,
    }
    result.update(extra)
    return result


def _classify_campaign_history(
    df: pd.DataFrame,
    min_total_days: int = 180,
):
    summary = []

    all_dates = pd.DatetimeIndex(
        sorted(
            pd.to_datetime(
                df["date"],
                errors="raise",
            ).unique()
        )
    )

    total_unique_dates = int(len(all_dates))

    for campaign_id, group in df.groupby(
        "campaign_id",
        sort=True,
    ):
        campaign_dates = pd.DatetimeIndex(
            sorted(
                pd.to_datetime(
                    group["date"],
                    errors="raise",
                ).unique()
            )
        )

        observed_days = int(len(campaign_dates))

        first_date = campaign_dates.min() if observed_days > 0 else None

        last_date = campaign_dates.max() if observed_days > 0 else None

        calendar_days = (
            int((last_date - first_date).days) + 1
            if (first_date is not None and last_date is not None)
            else 0
        )

        missing_within_span = max(
            calendar_days - observed_days,
            0,
        )

        eligible_history = observed_days >= min_total_days

        summary.append(
            {
                "campaign_id": str(campaign_id),
                "observed_days": observed_days,
                "first_date": (
                    first_date.strftime("%Y-%m-%d") if first_date is not None else None
                ),
                "last_date": (
                    last_date.strftime("%Y-%m-%d") if last_date is not None else None
                ),
                "calendar_days": calendar_days,
                "missing_within_span": missing_within_span,
                "history_eligible": eligible_history,
                "history_action": (
                    "MODEL_CANDIDATE" if eligible_history else "HOLD_CURRENT"
                ),
                "history_reason": (
                    None if eligible_history else "INSUFFICIENT_HISTORY"
                ),
            }
        )

    summary_df = pd.DataFrame(summary)

    return {
        "totalUniqueDates": total_unique_dates,
        "minimumRequiredDays": min_total_days,
        "campaignSummary": summary,
        "eligibleCampaignIds": summary_df.loc[
            summary_df["history_eligible"] == True,
            "campaign_id",
        ].tolist(),
        "holdCampaignIds": summary_df.loc[
            summary_df["history_eligible"] == False,
            "campaign_id",
        ].tolist(),
    }


def _broad_business_bounds(
    df: pd.DataFrame, current: dict[str, float], max_change: float
):
    result = {}
    for cid, group in df.groupby("campaign_id"):
        cid = str(cid)
        current_budget = float(current[cid])
        observed_max = float(group.spend.max())
        upper = max(
            observed_max * 2.0,
            current_budget * (1.0 + max_change) * 1.5,
            current_budget + 1.0,
            1.0,
        )
        result[cid] = (0.0, float(upper))
    return result


def _slope_summary(stabilities: list[pd.DataFrame], fits, cfg):
    table = pd.concat(stabilities, ignore_index=True)
    rows = []
    for cid, fit in sorted(fits.items()):
        sub = table.loc[
            (table.campaign_id == cid)
            & np.isclose(table.probe_spend_krw, fit.spend_scale)
        ]
        good = sub.loc[sub.refit_success, "marginal_roas_pct"].to_numpy(float)
        spread = (
            float(np.ptp(good) / max(abs(np.median(good)), 1e-12))
            if len(good) >= 2
            else float("nan")
        )
        rows.append(
            {
                "campaign_id": cid,
                "successful_refits": int(len(good)),
                "requested_refits": int(cfg.stability_folds),
                "slope_spread_ratio_at_reference": spread,
                "min_marginal_roas_pct": float(min(good)) if len(good) else np.nan,
                "max_marginal_roas_pct": float(max(good)) if len(good) else np.nan,
                "is_confidence_interval": False,
            }
        )
    return table, pd.DataFrame(rows)


def _aor_and_roas(
    ref: pd.DataFrame,
    campaign_ids: list[str],
):
    campaign_ids = [str(cid) for cid in campaign_ids]

    # ---------------------------------------------
    # Gurobi에 실제로 들어가는 캠페인만 사용
    # ---------------------------------------------

    selected = ref[ref["campaign_id"].astype(str).isin(campaign_ids)].copy()

    # ---------------------------------------------
    # Historical volume-weighted ROAS
    # ---------------------------------------------

    totals = selected.groupby("campaign_id")[["revenue", "spend"]].sum()

    vw_roas = {}

    for cid in campaign_ids:
        if cid not in totals.index:
            vw_roas[cid] = 0.0
            continue

        spend = float(
            totals.loc[
                cid,
                "spend",
            ]
        )

        revenue = float(
            totals.loc[
                cid,
                "revenue",
            ]
        )

        if not math.isfinite(spend) or not math.isfinite(revenue):
            raise ValueError(f"{cid}: invalid historical spend/revenue")

        # spend가 0이면 Historical ROAS는
        # 수학적으로 정의되지 않는다.
        #
        # 하지만 이 캠페인은 ROAS-proportional
        # baseline에 weight를 주지 않고,
        # V2 fallback / guardrail에서 별도 처리한다.
        if spend <= 0:
            vw_roas[cid] = 0.0
        else:
            vw_roas[cid] = 100.0 * revenue / spend

    # ---------------------------------------------
    # Average Order Revenue
    # ---------------------------------------------

    if "conversions" in selected.columns:
        conv = pd.to_numeric(
            selected["conversions"],
            errors="raise",
        )

        if not np.isfinite(conv).all() or (conv < 0).any():
            raise ValueError("Invalid conversions")

        good = selected.loc[conv > 0].copy()

        if not good.empty:
            good["_aor"] = good["revenue"] / good["conversions"]

            aor_raw = good.groupby("campaign_id")["_aor"].mean().to_dict()
        else:
            aor_raw = {}

    else:
        aor_raw = {}

    aor = {
        cid: float(
            aor_raw.get(
                cid,
                float("nan"),
            )
        )
        for cid in campaign_ids
    }

    return vw_roas, aor


def _allocation_map(table: pd.DataFrame):
    sub = table.loc[table.strategy.astype(str) == "Gurobi_Optimized"]
    return {str(r.campaign_id): r for r in sub.itertuples(index=False)}

def _aggregate_channel_performance(
    records: list[dict],
) -> pd.DataFrame:
    """
    Campaign-level daily performance rows를
    channel-level daily panel로 변환한다.

    V2 엔진은 내부적으로 campaign_id를 entity key로
    사용하므로 channel 이름을 campaign_id/campaign_name에
    매핑하여 기존 V2 로직을 재사용한다.
    """

    if not records:
        return pd.DataFrame()

    raw = pd.DataFrame(records)

    required_columns = {
        "date",
        "channel",
        "spend",
        "revenue",
    }

    missing_columns = (
        required_columns
        - set(raw.columns)
    )

    if missing_columns:
        raise ValueError(
            "Channel optimization is missing "
            "required columns: "
            + ", ".join(
                sorted(
                    missing_columns
                )
            )
        )

    raw["date"] = pd.to_datetime(
        raw["date"],
        errors="coerce",
    )

    raw["channel"] = (
        raw["channel"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    raw = raw.loc[
        raw["date"].notna()
        & raw["channel"].ne("")
    ].copy()

    numeric_columns = [
        "spend",
        "revenue",
        "impressions",
        "clicks",
        "conversions",
    ]

    for column in numeric_columns:
        if column not in raw.columns:
            raw[column] = 0.0

        raw[column] = (
            pd.to_numeric(
                raw[column],
                errors="coerce",
            )
            .fillna(0.0)
        )

    grouped = (
        raw.groupby(
            [
                "date",
                "channel",
            ],
            as_index=False,
        )
        .agg(
            {
                "spend": "sum",
                "revenue": "sum",
                "impressions": "sum",
                "clicks": "sum",
                "conversions": "sum",
            }
        )
    )

    # -----------------------------------------
    # 파생 KPI는 campaign별 값을 평균내지 않고
    # 집계된 원시값으로 다시 계산한다.
    # -----------------------------------------

    grouped["ctr"] = np.where(
        grouped["impressions"] > 0,
        (
            grouped["clicks"]
            / grouped["impressions"]
            * 100.0
        ),
        0.0,
    )

    grouped["cpc"] = np.where(
        grouped["clicks"] > 0,
        (
            grouped["spend"]
            / grouped["clicks"]
        ),
        0.0,
    )

    grouped["cvr"] = np.where(
        grouped["clicks"] > 0,
        (
            grouped["conversions"]
            / grouped["clicks"]
            * 100.0
        ),
        0.0,
    )

    grouped["cpa"] = np.where(
        grouped["conversions"] > 0,
        (
            grouped["spend"]
            / grouped["conversions"]
        ),
        0.0,
    )

    grouped["roas"] = np.where(
        grouped["spend"] > 0,
        (
            grouped["revenue"]
            / grouped["spend"]
            * 100.0
        ),
        0.0,
    )

    # -----------------------------------------
    # 기존 V2 엔진에서 campaign_id를
    # entity identifier로 사용하므로
    # 매체명을 동일 스키마에 매핑한다.
    # -----------------------------------------

    grouped["campaign_id"] = (
        grouped["channel"]
        .astype(str)
    )

    grouped["campaign_name"] = (
        grouped["channel"]
        .astype(str)
    )

    # 여러 광고계정이 합쳐져도 V2 validation에서
    # multiple account 오류가 발생하지 않도록
    # 매체 포트폴리오용 단일 논리 계정을 사용한다.
    grouped["account_id"] = (
        "CHANNEL_PORTFOLIO"
    )

    grouped = grouped.sort_values(
        [
            "date",
            "campaign_id",
        ]
    ).reset_index(
        drop=True
    )

    return grouped

def run_preview(payload: dict):
    optimization_scope = str(
        payload.get(
            "optimizationScope",
            "campaign",
        )
    ).strip().lower()

    if optimization_scope not in {
        "campaign",
        "channel",
    }:
        raise ValueError(
            "optimizationScope must be "
            "'campaign' or 'channel'"
        )    
    if not CERT_PATH.is_file():
        return _blocked(
            "독립 synthetic validation 인증 결과를 찾을 수 없어 모델 사용을 보류합니다.",
            "MODEL_CERTIFICATION_MISSING",
        )

    records = (
        payload.get(
            "performance"
        )
        or []
    )

    if not records:
        return _blocked(
            "성과 데이터가 없습니다.",
            "NO_PERFORMANCE_DATA",
        )

    max_change = float(
        payload.get(
            "maxBudgetChangePct",
            0.30,
        )
    )

    if not (
        0
        <= max_change
        <= 0.30
    ):
        raise ValueError(
            (
                "maxBudgetChangePct must be "
                "in [0, 0.30]"
            )
        )

    if optimization_scope == "channel":
        df = (
            _aggregate_channel_performance(
                records
            )
        )

    else:
        df = pd.DataFrame(
            records
        )

    df = est2.validate_observations(
        df
    )

    if (
        optimization_scope
        == "channel"
    ):
        channel_summary = (
            df.groupby(
                "campaign_id"
            )
            .agg(
                rows=(
                    "date",
                    "size",
                ),
                first_date=(
                    "date",
                    "min",
                ),
                last_date=(
                    "date",
                    "max",
                ),
                mean_daily_spend=(
                    "spend",
                    "mean",
                ),
                total_revenue=(
                    "revenue",
                    "sum",
                ),
            )
            .reset_index()
        )

        channel_panel_diagnostics = [
            {
                "channel":
                    str(
                        row[
                            "campaign_id"
                        ]
                    ),

                "rows":
                    int(
                        row[
                            "rows"
                        ]
                    ),

                "firstDate":
                    pd.Timestamp(
                        row[
                            "first_date"
                        ]
                    )
                    .date()
                    .isoformat(),

                "lastDate":
                    pd.Timestamp(
                        row[
                            "last_date"
                        ]
                    )
                    .date()
                    .isoformat(),

                "meanDailySpend":
                    float(
                        row[
                            "mean_daily_spend"
                        ]
                    ),

                "totalRevenue":
                    float(
                        row[
                            "total_revenue"
                        ]
                    ),
            }
            for _, row
            in channel_summary.iterrows()
        ]

    if df.campaign_id.nunique() < 2:
        entity_label = (
            "매체"
            if optimization_scope
            == "channel"
            else "캠페인"
        )

        return _blocked(
            (
                "예산 재배분에는 최소 "
                f"2개 {entity_label}가 필요합니다."
            ),
            "TOO_FEW_ENTITIES",
            optimizationScope=
                optimization_scope,
            entityCount=int(
                df[
                    "campaign_id"
                ].nunique()
            ),
        )

    # --------------------------------------------------
    # Revenue / Conversion history availability
    # --------------------------------------------------

    # --------------------------------------------------
    # Revenue / Conversion history availability
    #
    # campaign:
    #   하나의 revenueValidStartDate 사용
    #
    # channel:
    #   매체별 revenueValidStartDates 사용
    # --------------------------------------------------

    revenue_valid_start_by_entity = {}

    revenue_valid_start = None

    # ==========================================
    # Campaign scope
    # ==========================================

    if optimization_scope == "campaign":

        revenue_valid_start_raw = (
            payload.get(
                "revenueValidStartDate"
            )
        )

        if not revenue_valid_start_raw:
            return _blocked(
                (
                    "Naver Conversion History의 "
                    "유효 시작일을 확인할 수 없어 "
                    "최적화를 보류합니다."
                ),
                "CONVERSION_HISTORY_COVERAGE_UNAVAILABLE",
                optimizationScope=
                    optimization_scope,
            )

        try:
            revenue_valid_start = (
                pd.Timestamp(
                    revenue_valid_start_raw
                )
            )

        except (
            TypeError,
            ValueError,
        ) as exc:
            raise ValueError(
                "revenueValidStartDate must be "
                "a valid YYYY-MM-DD date"
            ) from exc

        if (
            revenue_valid_start.tzinfo
            is not None
        ):
            revenue_valid_start = (
                revenue_valid_start.tz_localize(
                    None
                )
            )

        for entity_id in (
            df["campaign_id"]
            .astype(str)
            .unique()
        ):
            revenue_valid_start_by_entity[
                str(entity_id)
            ] = revenue_valid_start

    # ==========================================
    # Channel scope
    # ==========================================

    else:

        revenue_valid_start_dates_raw = (
            payload.get(
                "revenueValidStartDates"
            )
            or {}
        )

        if not isinstance(
            revenue_valid_start_dates_raw,
            dict,
        ):
            raise ValueError(
                "revenueValidStartDates must "
                "be an object mapping "
                "channel to YYYY-MM-DD"
            )

        channel_ids = {
            str(value)
            for value
            in df[
                "campaign_id"
            ]
            .astype(str)
            .unique()
        }

        missing_entities = sorted(
            entity_id
            for entity_id
            in channel_ids
            if not (
                revenue_valid_start_dates_raw
                .get(entity_id)
            )
        )

        if missing_entities:
            return _blocked(
                (
                    "일부 매체의 매출 데이터 "
                    "유효 시작일을 확인할 수 없어 "
                    "최적화를 보류합니다."
                ),
                "MISSING_CHANNEL_REVENUE_VALIDITY",
                optimizationScope=
                    optimization_scope,
                missingChannels=
                    missing_entities,
            )

        for entity_id in sorted(
            channel_ids
        ):
            raw_start = (
                revenue_valid_start_dates_raw[
                    entity_id
                ]
            )

            try:
                parsed_start = (
                    pd.Timestamp(
                        raw_start
                    )
                )

            except (
                TypeError,
                ValueError,
            ) as exc:
                raise ValueError(
                    (
                        "Invalid revenue valid "
                        f"start date for "
                        f"{entity_id}: "
                        f"{raw_start}"
                    )
                ) from exc

            if (
                parsed_start.tzinfo
                is not None
            ):
                parsed_start = (
                    parsed_start
                    .tz_localize(
                        None
                    )
                )

            revenue_valid_start_by_entity[
                entity_id
            ] = parsed_start

    # --------------------------------------------------
    # 전체 이력 classification
    # --------------------------------------------------

    full_history_classification = (
        _classify_campaign_history(
            df,
            min_total_days=180,
        )
    )

    # --------------------------------------------------
    # Entity별 Revenue-valid observation 생성
    # --------------------------------------------------

    revenue_parts = []

    for (
        entity_id,
        entity_df,
    ) in df.groupby(
        "campaign_id"
    ):
        entity_key = str(
            entity_id
        )

        valid_start = (
            revenue_valid_start_by_entity[
                entity_key
            ]
        )

        valid_entity_df = (
            entity_df.loc[
                entity_df["date"]
                >= valid_start
            ]
            .copy()
        )

        if not valid_entity_df.empty:
            revenue_parts.append(
                valid_entity_df
            )

    if revenue_parts:
        revenue_df = (
            pd.concat(
                revenue_parts,
                ignore_index=True,
            )
        )

    else:
        revenue_df = (
            df.iloc[0:0].copy()
        )

    # ------------------------------------------
    # 진단용: 매체/캠페인별 유효 일수
    # ------------------------------------------

    valid_revenue_days_by_entity = {
        str(entity_id):
            int(
                entity_df["date"]
                .nunique()
            )
        for (
            entity_id,
            entity_df,
        )
        in revenue_df.groupby(
            "campaign_id"
        )
    }

    revenue_validity = {
        str(entity_id): {
            "startDate":
                start_date
                .date()
                .isoformat(),

            "validDays":
                int(
                    valid_revenue_days_by_entity
                    .get(
                        str(entity_id),
                        0,
                    )
                ),
        }
        for (
            entity_id,
            start_date,
        )
        in revenue_valid_start_by_entity.items()
    }

    if revenue_df.empty:
        return _blocked(
            (
                "매출 데이터가 유효한 기간에 "
                "학습 가능한 성과 데이터가 없습니다."
            ),
            "NO_REVENUE_VALID_OBSERVATIONS",

            optimizationScope=
                optimization_scope,

            revenueValidStartDate=(
                revenue_valid_start
                .date()
                .isoformat()
                if revenue_valid_start
                is not None
                else None
            ),

            revenueValidity=
                revenue_validity,

            fullHistoryClassification=
                full_history_classification,
        )

    # V2는 train에서 최소 56행이 필요하고
    # chronological split은 80/20이다.
    #
    # 56 / 0.8 = 70
    # 따라서 캠페인별 최소 70일의
    # conversion-valid observation이 있어야 한다.
    train_fraction = 0.8
    minimum_training_days = 56

    minimum_valid_total_days = int(
        math.ceil(
            minimum_training_days
            / train_fraction
        )
    )

    revenue_history_classification = (
        _classify_campaign_history(
            revenue_df,
            min_total_days=
                minimum_valid_total_days,
        )
    )

    eligible_campaign_ids = set(
        revenue_history_classification[
            "eligibleCampaignIds"
        ]
    )

    all_campaign_ids = set(
        df["campaign_id"]
        .astype(str)
        .unique()
    )

    hold_campaign_ids = (
        all_campaign_ids
        - eligible_campaign_ids
    )

    if not eligible_campaign_ids:
        if optimization_scope == "channel":
            valid_revenue_days = (
                min(
                    valid_revenue_days_by_entity.values()
                )
                if valid_revenue_days_by_entity
                else 0
            )

            revenue_valid_start_date = None

        else:
            valid_revenue_days = int(
                revenue_df["date"].nunique()
            )

            campaign_valid_starts = [
                valid_start
                for valid_start
                in revenue_valid_start_by_entity.values()
                if valid_start is not None
            ]

            revenue_valid_start_date = (
                pd.Timestamp(
                    campaign_valid_starts[0]
                )
                .date()
                .isoformat()
                if campaign_valid_starts
                else None
            )

        remaining_valid_days = max(
            0,
            minimum_valid_total_days
            - valid_revenue_days,
        )

        readiness_pct = min(
            100.0,
            (
                valid_revenue_days
                / minimum_valid_total_days
                * 100.0
            )
            if minimum_valid_total_days > 0
            else 0.0,
        )

        blocked_details = {
            "optimizationScope":
                optimization_scope,

            "revenueValidity":
                revenue_validity,

            "minimumValidTotalDays":
                minimum_valid_total_days,

            "validRevenueDays":
                valid_revenue_days,

            "remainingValidDays":
                remaining_valid_days,

            "readinessPct":
                readiness_pct,

            "fullHistoryClassification":
                full_history_classification,

            "revenueHistoryClassification":
                revenue_history_classification,
        }

        if optimization_scope == "campaign":
            blocked_details[
                "revenueValidStartDate"
            ] = revenue_valid_start_date

        return _blocked(
            (
                "Conversion/Revenue가 유효한 "
                "학습 이력이 아직 부족하여 "
                "자동 최적화를 보류합니다."
            ),
            "INSUFFICIENT_VALID_REVENUE_HISTORY",
            **blocked_details,
        )

    model_df = revenue_df.loc[
        revenue_df[
            "campaign_id"
        ]
        .astype(str)
        .isin(
            eligible_campaign_ids
        )
    ].copy()

    history_classification = (
        revenue_history_classification
    )

    # --------------------------------------------------
    # 1. 전체 캠페인의 현재 평균 일예산
    # --------------------------------------------------

    # --------------------------------------------------
    # 1. Current Budget Baseline
    #
    # Campaign scope:
    # x0_i = 실제 Naver configured dailyBudget
    #
    # Channel scope:
    # 기존 synthetic / channel regression을 보존하기 위해
    # 기존 historical mean spend baseline 유지
    # --------------------------------------------------

    optimization_scope = str(
        payload.get(
            "optimizationScope"
        )
        or "campaign"
    ).strip().lower()

    if optimization_scope == "campaign":
        current_budget_payload = (
            payload.get(
                "currentBudgets"
            )
            or {}
        )

        if not isinstance(
            current_budget_payload,
            dict,
        ):
            return _blocked(
                (
                    "캠페인별 현재 예산 입력 형식이 "
                    "올바르지 않습니다."
                ),
                "INVALID_CURRENT_BUDGET_PAYLOAD",
            )

        all_current = {}

        for (
            campaign_id,
            budget_value,
        ) in current_budget_payload.items():
            cid = str(
                campaign_id
            ).strip()

            if not cid:
                continue

            try:
                budget = float(
                    budget_value
                )

            except (
                TypeError,
                ValueError,
            ):
                return _blocked(
                    (
                        "캠페인 현재 예산에 "
                        "숫자가 아닌 값이 있습니다."
                    ),
                    "INVALID_CURRENT_BUDGET",
                    campaignId=cid,
                )

            if (
                not math.isfinite(
                    budget
                )
                or budget <= 0
            ):
                return _blocked(
                    (
                        "최적화 대상 캠페인의 "
                        "현재 일예산은 0보다 커야 합니다."
                    ),
                    "INVALID_CURRENT_BUDGET",
                    campaignId=cid,
                    currentBudget=budget,
                )

            all_current[
                cid
            ] = budget

        if len(all_current) < 2:
            return _blocked(
                (
                    "캠페인 예산 재배분에는 "
                    "최소 2개의 유효한 현재 예산이 "
                    "필요합니다."
                ),
                "TOO_FEW_BUDGET_ELIGIBLE_CAMPAIGNS",
                campaigns=len(
                    all_current
                ),
            )

        total_budget_raw = (
            payload.get(
                "totalDailyBudget"
            )
        )

        if total_budget_raw in (
            None,
            "",
        ):
            total_portfolio_budget = float(
                sum(
                    all_current.values()
                )
            )

            total_budget_source = (
                "platform_current_budget_sum"
            )

        else:
            try:
                total_portfolio_budget = float(
                    total_budget_raw
                )

            except (
                TypeError,
                ValueError,
            ):
                return _blocked(
                    (
                        "총 일예산 B가 "
                        "올바른 숫자가 아닙니다."
                    ),
                    "INVALID_TOTAL_DAILY_BUDGET",
                )

            total_budget_source = (
                "planner_input"
            )

        if (
            not math.isfinite(
                total_portfolio_budget
            )
            or total_portfolio_budget <= 0
        ):
            return _blocked(
                (
                    "총 일예산 B는 "
                    "0보다 커야 합니다."
                ),
                "INVALID_TOTAL_DAILY_BUDGET",
                totalDailyBudget=
                    total_portfolio_budget,
            )

        # Performance 데이터도
        # budget-eligible campaign으로 제한한다.
        budget_campaign_ids = set(
            all_current
        )

        df = df.loc[
            df[
                "campaign_id"
            ]
            .astype(str)
            .isin(
                budget_campaign_ids
            )
        ].copy()
        ref = df

        if (
            df[
                "campaign_id"
            ].nunique()
            < 2
        ):
            return _blocked(
                (
                    "최적화 대상 캠페인의 "
                    "성과 데이터가 부족합니다."
                ),
                "TOO_FEW_BUDGET_ELIGIBLE_CAMPAIGNS",
                campaigns=int(
                    df[
                        "campaign_id"
                    ].nunique()
                ),
            )

    else:
        # Channel scope regression 보존
        ref = df

        all_current = {
            str(k): float(v)
            for k, v in (
                ref.groupby(
                    "campaign_id"
                )
                .spend.mean()
                .items()
            )
        }

        total_portfolio_budget = float(
            sum(
                all_current.values()
            )
        )

        total_budget_source = (
            "historical_mean_daily_spend"
        )

        if (
            not math.isfinite(
                total_portfolio_budget
            )
            or total_portfolio_budget <= 0
        ):
            return _blocked(
                (
                    "현재 평균 일예산을 "
                    "계산할 수 없습니다."
                ),
                "INVALID_CURRENT_BUDGET",
            )

    # --------------------------------------------------
    # 2. 충분한 이력이 있는 캠페인만
    #    캠페인별로 train / validation 분할
    # --------------------------------------------------

    train_parts = []
    val_parts = []

    training_days_by_campaign = {}
    validation_days_by_campaign = {}

    for campaign_id, campaign_df in model_df.groupby(
        "campaign_id",
        sort=True,
    ):
        campaign_train, campaign_val = est2.chronological_split(
            campaign_df,
            0.8,
        )

        cid = str(campaign_id)

        training_days_by_campaign[cid] = int(campaign_train["date"].nunique())

        validation_days_by_campaign[cid] = int(campaign_val["date"].nunique())

        train_parts.append(campaign_train)

        val_parts.append(campaign_val)

    if not train_parts or not val_parts:
        return _blocked(
            "학습 또는 검증 데이터가 생성되지 않았습니다.",
            "TRAIN_VALIDATION_SPLIT_FAILED",
            historyClassification=history_classification,
        )

    train = (
        pd.concat(
            train_parts,
            ignore_index=True,
        )
        .sort_values(
            [
                "date",
                "campaign_id",
            ]
        )
        .reset_index(drop=True)
    )

    val = (
        pd.concat(
            val_parts,
            ignore_index=True,
        )
        .sort_values(
            [
                "date",
                "campaign_id",
            ]
        )
        .reset_index(drop=True)
    )

    # --------------------------------------------------
    # 3. 모델링 대상 캠페인의 현재 예산
    # --------------------------------------------------

    current = {cid: all_current[cid] for cid in sorted(eligible_campaign_ids)}

    # 데이터 부족 캠페인은
    # 포트폴리오에서 제거하는 것이 아니라
    # 현재 예산으로 고정된다.
    held_current = {cid: all_current[cid] for cid in sorted(hold_campaign_ids)}

    held_budget = float(
        sum(
            held_current.values()
        )
    )

    # --------------------------------------------------
    # 현재 모델링 대상 캠페인의 실제 기준 예산
    #
    # x0 합계이며 검증용이다.
    # 시나리오 목표예산 B와는 구분한다.
    # --------------------------------------------------

    current_model_budget = float(
        sum(
            current.values()
        )
    )

    # --------------------------------------------------
    # 이번 시나리오에서 Gurobi가 실제로
    # 모델링 캠페인에 배분해야 하는 목표예산
    #
    # 전체 시나리오 예산 B에서
    # HOLD_CURRENT 캠페인의 고정예산을 뺀다.
    # --------------------------------------------------

    model_budget = float(
        total_portfolio_budget -
        held_budget
    )

    if (
        not math.isfinite(
            model_budget
        )
        or model_budget <= 0
    ):
        return _blocked(
            (
                "전체 시나리오 예산에서 "
                "HOLD_CURRENT 캠페인의 고정예산을 제외하면 "
                "모델링 캠페인에 배분할 수 있는 예산이 없습니다."
            ),
            "INVALID_MODEL_BUDGET",
            totalPortfolioBudget=
                total_portfolio_budget,
            heldBudget=
                held_budget,
            modelBudget=
                model_budget,
        )

    # --------------------------------------------------
    # 4. 모델링 대상에서 사용할 날짜
    # --------------------------------------------------

    ref_dates = np.sort(model_df["date"].unique())

    # --------------------------------------------------
    # 5. Business Budget Bounds
    #
    # Campaign scope:
    #   L_i / U_i = planner-defined Budget Policy
    #
    # Channel scope:
    #   기존 synthetic / regression 동작 보존
    # --------------------------------------------------

    if optimization_scope == "campaign":
        budget_bounds_payload = (
            payload.get(
                "budgetBounds"
            )
            or {}
        )

        if not isinstance(
            budget_bounds_payload,
            dict,
        ):
            return _blocked(
                (
                    "캠페인 예산 범위 입력 형식이 "
                    "올바르지 않습니다."
                ),
                "INVALID_BUDGET_BOUNDS_PAYLOAD",
            )

        # ------------------------------------------
        # 현재 budget-eligible portfolio의 모든
        # campaign에 L / U가 존재해야 한다.
        # ------------------------------------------

        missing_bound_ids = sorted(
            set(
                all_current.keys()
            )
            - set(
                str(key)
                for key
                in budget_bounds_payload.keys()
            )
        )

        if missing_bound_ids:
            return _blocked(
                (
                    "최적화 대상 캠페인 중 "
                    "최소/최대 예산 정책이 없는 "
                    "캠페인이 있습니다."
                ),
                "MISSING_CAMPAIGN_BUDGET_POLICY",
                missingCampaignIds=
                    missing_bound_ids,
            )

        parsed_business_bounds = {}

        for cid in sorted(
            all_current.keys()
        ):
            raw_bound = (
                budget_bounds_payload.get(
                    cid
                )
            )

            if not isinstance(
                raw_bound,
                dict,
            ):
                return _blocked(
                    (
                        "캠페인 예산 범위 형식이 "
                        "올바르지 않습니다."
                    ),
                    "INVALID_CAMPAIGN_BUDGET_POLICY",
                    campaignId=cid,
                )

            try:
                lower = float(
                    raw_bound.get(
                        "min"
                    )
                )

                upper = float(
                    raw_bound.get(
                        "max"
                    )
                )

            except (
                TypeError,
                ValueError,
            ):
                return _blocked(
                    (
                        "캠페인 최소/최대 예산은 "
                        "숫자여야 합니다."
                    ),
                    "INVALID_CAMPAIGN_BUDGET_POLICY",
                    campaignId=cid,
                )

            if (
                not math.isfinite(
                    lower
                )
                or not math.isfinite(
                    upper
                )
                or lower < 0
                or upper < lower
            ):
                return _blocked(
                    (
                        "캠페인 최소/최대 예산 "
                        "범위가 올바르지 않습니다."
                    ),
                    "INVALID_CAMPAIGN_BUDGET_POLICY",
                    campaignId=cid,
                    minDailyBudget=lower,
                    maxDailyBudget=upper,
                )

            current_budget = float(
                all_current[
                    cid
                ]
            )

            if not (
                lower
                <= current_budget
                <= upper
            ):
                return _blocked(
                    (
                        "현재 Naver 일예산이 "
                        "설정된 최소/최대 예산 "
                        "범위를 벗어났습니다."
                    ),
                    "CURRENT_BUDGET_OUTSIDE_POLICY_BOUNDS",
                    campaignId=cid,
                    currentDailyBudget=
                        current_budget,
                    minDailyBudget=
                        lower,
                    maxDailyBudget=
                        upper,
                )

            parsed_business_bounds[
                cid
            ] = (
                lower,
                upper,
            )

        # 실제 Response Curve를 학습하는
        # campaign subset만 Gurobi business bounds에 사용.
        #
        # history 부족 캠페인은 이후 HOLD_CURRENT로
        # 현재 예산에 고정된다.
        business_bounds = {
            cid:
                parsed_business_bounds[
                    cid
                ]

            for cid
            in sorted(
                current.keys()
            )
        }

    else:
        # Channel scope regression 보존
        business_bounds = (
            _broad_business_bounds(
                model_df,
                current,
                max_change,
            )
        )

    # --------------------------------------------------
    # 6. V2 추정
    # --------------------------------------------------

    v2cfg = est2.V2Config(
        lambda_level=0.01,
        lambda_shape=0.01,
        stability_folds=4,
    )

    estimator = est2.ResponseEstimatorV2(v2cfg)

    fits = {}
    stabilities = []

    for cid, campaign_train in train.groupby(
        "campaign_id",
        sort=True,
    ):
        cid = str(cid)

        fit = estimator.fit_campaign(campaign_train)

        fits[cid] = fit

        campaign_ref_dates = np.sort(
            model_df.loc[
                model_df["campaign_id"].astype(str) == cid,
                "date",
            ].unique()
        )

        stabilities.append(
            estimator.slope_stability(
                campaign_train,
                fit,
                campaign_ref_dates,
            )
        )

    # --------------------------------------------------
    # 7. eligible 캠페인에만 optimization bounds 적용
    # --------------------------------------------------

    effective, bound_flags = rv2.operational_bounds(
        business_bounds,
        fits,
        current,
        max_change,
        "review",
    )
    # --------------------------------------------------
    # 8. 모델링 대상 캠페인의 예산 합계 검증
    # --------------------------------------------------

    # --------------------------------------------------
    # 현재 x0 자체가 bounds 안에 있는지 검증
    #
    # 여기서는 시나리오 목표 B가 아니라
    # 현재 모델링 캠페인의 실제 x0 합계를 사용한다.
    # --------------------------------------------------

    rv2.check_allocation(
        current,
        {
            cid: (
                min(
                    lo,
                    current[cid],
                ),
                max(
                    hi,
                    current[cid],
                ),
            )
            for cid, (
                lo,
                hi,
            ) in effective.items()
        },
        current_model_budget,
    )

    if not (
        sum(v[0] for v in effective.values()) - 0.01
        <= model_budget
        <= sum(v[1] for v in effective.values()) + 0.01
    ):
        return _blocked(
            "모델링 대상 캠페인 예산이 현재 campaign guardrail 범위에서 실행 불가능합니다.",
            "INFEASIBLE_EFFECTIVE_BOUNDS",
            modelBudget=model_budget,
            heldBudget=held_budget,
            totalPortfolioBudget=total_portfolio_budget,
        )

    # --------------------------------------------------
    # 9. V1 비교모델
    #
    # V1도 동일한 eligible campaign 집합과
    # 동일한 model_budget을 사용한다.
    # --------------------------------------------------

    v1cfg = m.OptimizerConfig(
        lambda_alpha=0.01,
        lambda_beta=0.01,
        train_fraction=0.8,
        max_budget_change_pct=max_change,
        sensitivity_lambdas=[],
        total_daily_budget=model_budget,
    )

    v1fits = {}

    for cid in fits:
        try:
            v1fits[cid] = m.ResponseEstimator(v1cfg).fit_all(
                train[train.campaign_id.astype(str) == cid],
                val[val.campaign_id.astype(str) == cid],
            )[cid]

        except (
            ValueError,
            RuntimeError,
            FloatingPointError,
        ):
            v1fits[cid] = None

    validation, _ = rv2.compare_validation(
        train,
        val,
        fits,
        v1fits,
    )

    slope_detail, slope_summary = _slope_summary(
        stabilities,
        fits,
        v2cfg,
    )

    # --------------------------------------------------
    # 10. Eligible campaign의 V2 PWL curve 생성
    # --------------------------------------------------

    v2curves = {}

    for cid, fit in sorted(fits.items()):
        (
            b,
            y,
            slopes,
            intercepts,
        ) = est2.pwl_arrays(
            fit,
            *business_bounds[cid],
            ref_dates,
            20,
        )

        v2curves[cid] = m.PWLCurve(
            cid,
            b,
            y,
            slopes,
            intercepts,
            fit.observed_support,
            *business_bounds[cid],
            False,
            0.0,
        )

    # --------------------------------------------------
    # 11. Eligible campaign metadata만 사용
    # --------------------------------------------------

    all_names = ref.groupby("campaign_id").campaign_name.first().astype(str).to_dict()

    names = {
        cid: all_names.get(
            cid,
            cid,
        )
        for cid in fits
    }

    vw_roas, aor = _aor_and_roas(
        ref,
        list(fits),
    )

    # --------------------------------------------------
    # 12. Guardrail 적용 전 V2 후보 최적화
    #
    # 중요:
    # 여기의 budget은 전체 portfolio budget이 아니라
    # eligible campaign에 재배분 가능한 model_budget이다.
    # --------------------------------------------------

    (
        unguarded_table,
        _,
        unguarded_solver,
    ) = rv2.run_gurobi(
        m,
        rv2.attach_bounds(
            v2curves,
            effective,
        ),
        current,
        model_budget,
        names,
        aor,
        vw_roas,
        effective,
        v1cfg,
    )

    # --------------------------------------------------
    # 13. Eligible campaign Safety Gate
    # --------------------------------------------------

    safety_cfg = sg.GateConfig()

    independent = sg.evaluate_independent_validation(
        CERT_PATH,
        safety_cfg,
    )

    decisions = sg.campaign_gate(
        validation,
        slope_summary,
        unguarded_table,
        safety_cfg,
    )

    counts = decisions.action.value_counts().to_dict()

    hard_block = not independent["passed"] or not bool(
        unguarded_solver.get("is_optimal")
    )

    if hard_block:
        return _blocked(
            "포트폴리오 Safety Gate를 통과하지 못했습니다.",
            "PORTFOLIO_SAFETY_GATE_FAILED",
            independentValidation=independent,
            campaignCounts={
                "modeled": int(len(decisions)),
                "eligible": int(
                    counts.get(
                        "ELIGIBLE",
                        0,
                    )
                ),
                "review": int(
                    counts.get(
                        "REVIEW",
                        0,
                    )
                ),
                "gateHoldCurrent": int(
                    counts.get(
                        "HOLD_CURRENT",
                        0,
                    )
                ),
                "historyHoldCurrent": int(len(hold_campaign_ids)),
            },
        )

    # --------------------------------------------------
    # 14. Safety Gate 결과를 실제 Gurobi bounds에 반영
    # --------------------------------------------------

    guarded_bounds, guard_notes = gr.build_guarded_bounds(
        decisions,
        effective,
        gr.GuardrailConfig(review_policy="freeze"),
    )

    # 중요:
    # Guarded optimization 대상은 eligible/model campaign뿐이다.
    gr.check_budget_feasibility(
        guarded_bounds,
        model_budget,
    )

    (
        guarded_table,
        guarded_portfolio,
        guarded_solver,
    ) = rv2.run_gurobi(
        m,
        rv2.attach_bounds(
            v2curves,
            guarded_bounds,
        ),
        current,
        model_budget,
        names,
        aor,
        vw_roas,
        guarded_bounds,
        v1cfg,
    )

    # --------------------------------------------------
    # 15. Gurobi 결과 map
    # --------------------------------------------------

    unguarded_map = _allocation_map(unguarded_table)

    guarded_map = _allocation_map(guarded_table)

    decision_map = decisions.set_index("campaign_id")

    # --------------------------------------------------
    # 16. Eligible campaign의 모델상 revenue
    # --------------------------------------------------

    modeled_current_revenue = gr.evaluate_curve_portfolio(
        v2curves,
        current,
    )

    modeled_recommended_allocation = {
        cid: float(row.optimized_budget) for cid, row in guarded_map.items()
    }

    modeled_recommended_revenue = gr.evaluate_curve_portfolio(
        v2curves,
        modeled_recommended_allocation,
    )

    # --------------------------------------------------
    # 17. History 부족 HOLD campaign의
    #     historical daily revenue proxy
    #
    # 이 캠페인들은 모델을 fit하지 않으므로
    # expected curve revenue를 만들지 않는다.
    # 대신 Current와 Recommended 양쪽에
    # 동일한 historical mean revenue를 더한다.
    # --------------------------------------------------

    held_revenue_proxy_by_campaign = {}

    if hold_campaign_ids:
        held_source = ref[ref["campaign_id"].astype(str).isin(hold_campaign_ids)].copy()

        held_revenue_proxy_by_campaign = {
            str(cid): float(value)
            for cid, value in (
                held_source.groupby("campaign_id").revenue.mean().items()
            )
        }

    held_revenue_proxy = float(sum(held_revenue_proxy_by_campaign.values()))

    # --------------------------------------------------
    # 18. 전체 portfolio 수준 예상치
    #
    # Eligible:
    #   V2 curve estimate
    #
    # History HOLD:
    #   historical mean revenue proxy
    #
    # HOLD campaign은 예산이 변하지 않으므로
    # current/recommended 모두 같은 proxy를 더한다.
    # --------------------------------------------------

    current_estimated_revenue = modeled_current_revenue + held_revenue_proxy

    recommended_estimated_revenue = modeled_recommended_revenue + held_revenue_proxy

    lift_pct = (
        (
            100.0
            * (recommended_estimated_revenue - current_estimated_revenue)
            / current_estimated_revenue
        )
        if current_estimated_revenue > 0
        else None
    )

    # --------------------------------------------------
    # 19. 캠페인별 history 정보 map
    # --------------------------------------------------

    history_summary_map = {
        str(row["campaign_id"]): row
        for row in (history_classification["campaignSummary"])
    }

    # --------------------------------------------------
    # 20. 전체 캠페인 결과 합치기
    # --------------------------------------------------

    campaigns = []

    for cid in sorted(all_current):
        history_info = history_summary_map.get(cid, {})

        campaign_name = all_names.get(
            cid,
            cid,
        )

        # ----------------------------------------------
        # A. History 부족 campaign
        #    -> 무조건 HOLD_CURRENT
        # ----------------------------------------------

        if cid in hold_campaign_ids:
            current_budget = float(all_current[cid])

            historical_revenue = float(
                held_revenue_proxy_by_campaign.get(
                    cid,
                    0.0,
                )
            )

            historical_roas = (
                (100.0 * historical_revenue / current_budget)
                if current_budget > 0
                else None
            )

            campaigns.append(
                {
                    "campaignId": cid,
                    "campaignName": campaign_name,
                    "currentBudget": current_budget,
                    "candidateBudget": current_budget,
                    "recommendedBudget": current_budget,
                    "changePct": 0.0,
                    "expectedRevenue": historical_revenue,
                    "expectedRevenueSource": "historical_mean_proxy",
                    "expectedRoas": historical_roas,
                    "marginalRoasLeft": None,
                    "marginalRoasRight": None,
                    "isInObservedSupport": None,
                    "safetyAction": "HOLD_CURRENT",
                    "safetyReasons": ["INSUFFICIENT_HISTORY"],
                    "history": {
                        "observedDays": history_info.get("observed_days"),
                        "firstDate": history_info.get("first_date"),
                        "lastDate": history_info.get("last_date"),
                        "missingWithinSpan": history_info.get("missing_within_span"),
                    },
                }
            )

            continue

        # ----------------------------------------------
        # B. 모델링 campaign
        # ----------------------------------------------

        candidate = unguarded_map[cid]

        recommended = guarded_map[cid]

        decision = decision_map.loc[cid]

        campaigns.append(
            {
                "campaignId": cid,
                "campaignName": campaign_name,
                "currentBudget": float(current[cid]),
                "candidateBudget": float(candidate.optimized_budget),
                "recommendedBudget": float(recommended.optimized_budget),
                "changePct": float(recommended.budget_change_pct),
                "expectedRevenue": float(recommended.expected_revenue),
                "expectedRevenueSource": "v2_response_curve",
                "expectedRoas": float(recommended.expected_roas),
                "marginalRoasLeft": (
                    None
                    if not math.isfinite(float(recommended.marginal_roas_left))
                    else float(recommended.marginal_roas_left)
                ),
                "marginalRoasRight": (
                    None
                    if not math.isfinite(float(recommended.marginal_roas_right))
                    else float(recommended.marginal_roas_right)
                ),
                "isInObservedSupport": bool(recommended.is_in_observed_support),
                "safetyAction": str(decision.action),
                "safetyReasons": (
                    []
                    if not str(decision.reasons or "").strip()
                    else str(decision.reasons).split(";")
                ),
                "history": {
                    "observedDays": history_info.get("observed_days"),
                    "firstDate": history_info.get("first_date"),
                    "lastDate": history_info.get("last_date"),
                    "missingWithinSpan": history_info.get("missing_within_span"),
                },
            }
        )

    # --------------------------------------------------
    # 21. 전체 portfolio 예산 보존 검증
    # --------------------------------------------------

    recommended_total_budget = float(
        sum(item["recommendedBudget"] for item in campaigns)
    )

    if abs(recommended_total_budget - total_portfolio_budget) > 0.01:
        return _blocked(
            "Guarded 최적화 후 전체 포트폴리오 예산이 보존되지 않았습니다.",
            "FINAL_BUDGET_CONSERVATION_ERROR",
            totalPortfolioBudget=total_portfolio_budget,
            recommendedTotalBudget=recommended_total_budget,
        )

    # --------------------------------------------------
    # 22. Portfolio action
    # --------------------------------------------------

    gate_hold_count = int(
        counts.get(
            "HOLD_CURRENT",
            0,
        )
    )

    review_count = int(
        counts.get(
            "REVIEW",
            0,
        )
    )

    history_hold_count = int(len(hold_campaign_ids))

    total_hold_count = gate_hold_count + history_hold_count

    portfolio_action = (
        "SHADOW_WITH_GUARDRAILS"
        if (review_count > 0 or total_hold_count > 0)
        else "SHADOW_ELIGIBLE"
    )

    # --------------------------------------------------
    # 23. 날짜 범위 통계
    # --------------------------------------------------

    modeled_training_days = list(training_days_by_campaign.values())

    modeled_validation_days = list(validation_days_by_campaign.values())

    # --------------------------------------------------
    # 24. 최종 API response
    # --------------------------------------------------

    return {
        "status": "ok",
        "optimizationScope": optimization_scope,
        "revenueValidity": revenue_validity,
        "portfolioAction": portfolio_action,
        "productionWriteEnabled": False,
        "shadowOnly": True,
        "advertiserId": str(payload.get("advertiserId")),
        "accountId": payload.get("accountId"),
        "platform": (
            "channel_portfolio"
            if optimization_scope
            == "channel"
            else "naver"
        ),
        "baselineSource": (
            "platform_configured_daily_budget"
            if optimization_scope
            == "campaign"
            else
            "historical_mean_daily_spend"
        ),

        "totalBudgetSource":
            total_budget_source,
        "dataWindow": {
            "start": str(df.date.min().date()),
            "end": str(df.date.max().date()),
            "portfolioUniqueDates": int(df.date.nunique()),
            "minimumHistoryDays": int(history_classification["minimumRequiredDays"]),
            "modeledTrainingDays": {
                "min": (
                    int(min(modeled_training_days)) if modeled_training_days else 0
                ),
                "max": (
                    int(max(modeled_training_days)) if modeled_training_days else 0
                ),
            },
            "modeledValidationDays": {
                "min": (
                    int(min(modeled_validation_days)) if modeled_validation_days else 0
                ),
                "max": (
                    int(max(modeled_validation_days)) if modeled_validation_days else 0
                ),
            },
        },
        "totalDailyBudget": total_portfolio_budget,
        "modeledDailyBudget": model_budget,
        "heldDailyBudget": held_budget,
        "recommendedTotalBudget": recommended_total_budget,
        "maxBudgetChangePct": max_change,
        "estimatedCurrentRevenue": current_estimated_revenue,
        "estimatedRecommendedRevenue": recommended_estimated_revenue,
        "estimatedLiftPct": lift_pct,
        "revenueEstimateComposition": {
            "modeledCampaignRevenueSource": "v2_response_curve",
            "historyHoldRevenueSource": "historical_mean_daily_revenue_proxy",
        },
        "campaignCounts": {
            "total": int(len(all_current)),
            "modeled": int(len(current)),
            "eligible": int(
                counts.get(
                    "ELIGIBLE",
                    0,
                )
            ),
            "review": review_count,
            "gateHoldCurrent": gate_hold_count,
            "historyHoldCurrent": history_hold_count,
            "totalHoldCurrent": total_hold_count,
        },
        "historyClassification": history_classification,
        "independentValidation": independent,
        "slopeDiagnostics": {
            "summary":
                slope_summary.replace(
                    {np.nan: None}
                ).to_dict(
                    orient="records"
                ),

            "refits":
                slope_detail.replace(
                    {np.nan: None}
                ).to_dict(
                    orient="records"
                ),
        },
        "solver": {
            "unguarded": unguarded_solver,
            "guarded": guarded_solver,
        },
        "warnings": (bound_flags + guard_notes),
        "campaigns": campaigns,
        "limitations": [
            "Shadow preview only; no Naver budget write is performed.",
            (
                "Current campaign budget baseline "
                "uses the configured Naver dailyBudget."
                if optimization_scope
                == "campaign"
                else
                "Channel baseline uses historical mean daily spend."
            ),
            "Estimated lift is model-based and is not a causal or realized revenue guarantee.",
            "Campaigns with insufficient history are excluded from response-curve fitting and fixed at current budget.",
            "Missing campaign dates are never silently filled with zero spend.",
            "Revenue for history-HOLD campaigns is represented by historical mean daily revenue only for portfolio-level display; it is not a fitted response estimate.",
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        result = run_preview(payload)
        args.output.write_text(
            json.dumps(
                _json_safe(result), ensure_ascii=False, indent=2, allow_nan=False
            ),
            encoding="utf-8",
        )
        return 0
    except Exception as exc:
        error = {
            "status": "error",
            "productionWriteEnabled": False,
            "shadowOnly": True,
            "message": f"{type(exc).__name__}: {exc}",
        }
        args.output.write_text(
            json.dumps(error, ensure_ascii=False, indent=2, allow_nan=False),
            encoding="utf-8",
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
