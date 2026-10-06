import json
import sqlite3
from pathlib import Path

from backend import main as main_module
from backend import optimization_service as optimization_service_module
from fastapi.testclient import TestClient

FIXTURE_PATH = (
    Path(__file__).resolve().parents[1]
    / "gurobi_model_recovery"
    / "channel_synthetic_request.json"
)


def test_channel_preview_synthetic_three_channels(
    monkeypatch,
):
    fixture = json.loads(
        FIXTURE_PATH.read_text(
            encoding="utf-8"
        )
    )

    performance = fixture[
        "performance"
    ]

    revenue_valid_start_dates = fixture[
        "revenueValidStartDates"
    ]

    channels = []

    for (
        channel_name,
        start_date,
    ) in revenue_valid_start_dates.items():

        channel_rows = [
            row
            for row in performance
            if row.get("channel")
            == channel_name
        ]

        dates = sorted(
            {
                str(
                    row.get("date")
                )
                for row in channel_rows
                if row.get("date")
            }
        )

        platform = next(
            (
                str(
                    row.get("platform")
                    or ""
                )
                for row in channel_rows
                if row.get("platform")
            ),
            "",
        )

        positive_revenue_days = sum(
            1
            for row in channel_rows
            if float(
                row.get("revenue")
                or 0
            ) > 0
        )

        channels.append(
            {
                "channel":
                    channel_name,

                "platform":
                    platform,

                "totalDays":
                    len(dates),

                "firstDate":
                    dates[0]
                    if dates
                    else None,

                "lastDate":
                    dates[-1]
                    if dates
                    else None,

                "positiveRevenueDays":
                    positive_revenue_days,

                "revenueValidStartDate":
                    start_date,

                "revenueValidityAvailable":
                    True,
            }
        )

    synthetic_panel = {
        "status":
            "ok",

        "advertiserId":
            "synthetic-channel-test",

        "channelCount":
            len(channels),

        "dailyRows":
            performance,

        "channels":
            channels,

        "missingRevenueValidity":
            [],
    }

    # -----------------------------------------
    # 실제 DB panel 대신 synthetic panel 사용
    # -----------------------------------------

    monkeypatch.setattr(
        main_module,
        "build_channel_optimization_panel",
        lambda *,
        advertiser_id,
        operator_id:
            synthetic_panel,
    )

    # -----------------------------------------
    # synthetic advertiser이므로
    # ownership 검증만 테스트 중 우회
    #
    # 실제 production 코드는 변경하지 않는다.
    # -----------------------------------------

    monkeypatch.setattr(
        optimization_service_module,
        "_verify_advertiser_owner",
        lambda *args, **kwargs:
            None,
    )

    payload = (
        main_module
        .ChannelOptimizationPreviewPayload(
            advertiserId=
                "synthetic-channel-test",

            maxBudgetChangePct=
                0.30,
        )
    )

    result = (
        main_module
        .channel_optimization_preview(
            payload=
                payload,

            token_payload={
                "sub":
                    "synthetic-operator",
            },
        )
    )

    # -----------------------------------------
    # Channel V2 결과 검증
    # -----------------------------------------

    assert (
        result.get("status")
        == "ok"
    )

    assert (
        result.get(
            "optimizationScope"
        )
        == "channel"
    )

    assert (
        result.get(
            "portfolioAction"
        )
        == "SHADOW_ELIGIBLE"
    )

    assert (
        result.get(
            "productionWriteEnabled"
        )
        is False
    )

    assert (
        result.get(
            "shadowOnly"
        )
        is True
    )

    assert (
        result.get(
            "channelCount"
        )
        == 3
    )

    assert (
        result.get(
            "platform"
        )
        == "channel_portfolio"
    )

    campaigns = (
        result.get(
            "campaigns"
        )
        or []
    )

    campaign_ids = {
        str(
            item.get(
                "campaignId"
            )
        )
        for item in campaigns
    }

    assert campaign_ids == {
        "Naver",
        "Meta",
        "Google",
    }

    solver = (
        result.get(
            "solver"
        )
        or {}
    )

    guarded_solver = (
        solver.get(
            "guarded"
        )
        or {}
    )

    assert (
        guarded_solver.get(
            "is_optimal"
        )
        is True
    )


def test_channel_preview_synthetic_http(
    monkeypatch,
):
    fixture = json.loads(
        FIXTURE_PATH.read_text(
            encoding="utf-8"
        )
    )

    performance = fixture[
        "performance"
    ]

    revenue_valid_start_dates = fixture[
        "revenueValidStartDates"
    ]

    channels = []

    for (
        channel_name,
        start_date,
    ) in revenue_valid_start_dates.items():

        channel_rows = [
            row
            for row in performance
            if row.get("channel")
            == channel_name
        ]

        dates = sorted(
            {
                str(row.get("date"))
                for row in channel_rows
                if row.get("date")
            }
        )

        channels.append(
            {
                "channel":
                    channel_name,

                "platform":
                    next(
                        (
                            str(
                                row.get(
                                    "platform"
                                )
                                or ""
                            )
                            for row
                            in channel_rows
                            if row.get(
                                "platform"
                            )
                        ),
                        "",
                    ),

                "totalDays":
                    len(dates),

                "firstDate":
                    dates[0]
                    if dates
                    else None,

                "lastDate":
                    dates[-1]
                    if dates
                    else None,

                "positiveRevenueDays":
                    sum(
                        1
                        for row
                        in channel_rows
                        if float(
                            row.get(
                                "revenue"
                            )
                            or 0
                        ) > 0
                    ),

                "revenueValidStartDate":
                    start_date,

                "revenueValidityAvailable":
                    True,
            }
        )

    synthetic_panel = {
        "status":
            "ok",

        "advertiserId":
            "synthetic-channel-test",

        "channelCount":
            3,

        "dailyRows":
            performance,

        "channels":
            channels,

        "missingRevenueValidity":
            [],
    }

    monkeypatch.setattr(
        main_module,
        "build_channel_optimization_panel",
        lambda *,
        advertiser_id,
        operator_id:
            synthetic_panel,
    )

    monkeypatch.setattr(
        optimization_service_module,
        "_verify_advertiser_owner",
        lambda *args, **kwargs:
            None,
    )

    main_module.app.dependency_overrides[
        main_module.require_operator
    ] = lambda: {
        "sub":
            "synthetic-operator"
    }

    try:
        client = TestClient(
            main_module.app
        )

        response = client.post(
            "/optimization/channel/preview",
            json={
                "advertiserId":
                    "synthetic-channel-test",

                "maxBudgetChangePct":
                    0.30,
            },
        )

        assert (
            response.status_code
            == 200
        )

        result = response.json()

        assert (
            result.get("status")
            == "ok"
        )

        assert (
            result.get(
                "optimizationScope"
            )
            == "channel"
        )

        assert (
            result.get(
                "portfolioAction"
            )
            == "SHADOW_ELIGIBLE"
        )

        assert (
            result.get(
                "productionWriteEnabled"
            )
            is False
        )

        assert (
            result.get(
                "shadowOnly"
            )
            is True
        )

        assert (
            result.get(
                "channelCount"
            )
            == 3
        )

        assert (
            result.get(
                "platform"
            )
            == "channel_portfolio"
        )

        campaign_ids = {
            str(
                item.get(
                    "campaignId"
                )
            )
            for item
            in (
                result.get(
                    "campaigns"
                )
                or []
            )
        }

        assert campaign_ids == {
            "Naver",
            "Meta",
            "Google",
        }

    finally:
        (
            main_module
            .app
            .dependency_overrides
            .clear()
        )

def test_channel_panel_uses_latest_revenue_valid_start_date(
    monkeypatch,
):
    connection = sqlite3.connect(
        ":memory:"
    )

    connection.row_factory = (
        sqlite3.Row
    )

    connection.executescript(
        """
        CREATE TABLE advertisers (
            id TEXT PRIMARY KEY,
            owner_operator_id TEXT
        );

        CREATE TABLE ad_connections (
            advertiser_id TEXT,
            platform TEXT,
            account_id TEXT,
            customer_id TEXT,
            status TEXT,
            conversion_tracking_start_date TEXT
        );

        CREATE TABLE ad_performance_daily (
            advertiser_id TEXT,
            platform TEXT,
            account_id TEXT,
            date TEXT,
            channel TEXT,
            spend REAL,
            impressions REAL,
            clicks REAL,
            conversions REAL,
            revenue REAL
        );
        """
    )

    connection.execute(
        """
        INSERT INTO advertisers (
            id,
            owner_operator_id
        )
        VALUES (?, ?)
        """,
        (
            "advertiser-test",
            "operator-test",
        ),
    )

    connection.executemany(
        """
        INSERT INTO ad_connections (
            advertiser_id,
            platform,
            account_id,
            customer_id,
            status,
            conversion_tracking_start_date
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                "advertiser-test",
                "meta",
                "META-001",
                None,
                "connected",
                "2026-05-01",
            ),
            (
                "advertiser-test",
                "meta",
                "META-002",
                None,
                "connected",
                "2026-07-15",
            ),
        ],
    )

    connection.executemany(
        """
        INSERT INTO ad_performance_daily (
            advertiser_id,
            platform,
            account_id,
            date,
            channel,
            spend,
            impressions,
            clicks,
            conversions,
            revenue
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                "advertiser-test",
                "meta",
                "META-001",
                "2026-08-01",
                "Meta",
                100000,
                10000,
                500,
                20,
                500000,
            ),
            (
                "advertiser-test",
                "meta",
                "META-002",
                "2026-08-01",
                "Meta",
                200000,
                20000,
                1000,
                40,
                900000,
            ),
        ],
    )

    connection.commit()

    monkeypatch.setattr(
        main_module,
        "get_db_connection",
        lambda:
            connection,
    )

    result = (
        main_module
        .build_channel_optimization_panel(
            advertiser_id=
                "advertiser-test",

            operator_id=
                "operator-test",
        )
    )

    assert (
        result.get("status")
        == "ok"
    )

    assert (
        result.get(
            "channelCount"
        )
        == 1
    )

    channels = (
        result.get(
            "channels"
        )
        or []
    )

    assert (
        len(channels)
        == 1
    )

    meta = channels[0]

    assert (
        meta.get("channel")
        == "Meta"
    )

    assert (
        meta.get("platform")
        == "meta"
    )

    assert (
        meta.get(
            "revenueValidStartDate"
        )
        == "2026-07-15"
    )

    assert (
        meta.get(
            "revenueValidityAvailable"
        )
        is True
    )

    daily_rows = (
        result.get(
            "dailyRows"
        )
        or []
    )

    assert (
        len(daily_rows)
        == 1
    )

    assert (
        daily_rows[0].get(
            "spend"
        )
        == 300000.0
    )

    assert (
        daily_rows[0].get(
            "revenue"
        )
        == 1400000.0
    )


def test_channel_panel_blocks_platform_when_one_account_has_no_revenue_validity(
    monkeypatch,
):
    connection = sqlite3.connect(
        ":memory:"
    )

    connection.row_factory = (
        sqlite3.Row
    )

    connection.executescript(
        """
        CREATE TABLE advertisers (
            id TEXT PRIMARY KEY,
            owner_operator_id TEXT
        );

        CREATE TABLE ad_connections (
            advertiser_id TEXT,
            platform TEXT,
            account_id TEXT,
            customer_id TEXT,
            status TEXT,
            conversion_tracking_start_date TEXT
        );

        CREATE TABLE ad_performance_daily (
            advertiser_id TEXT,
            platform TEXT,
            account_id TEXT,
            date TEXT,
            channel TEXT,
            spend REAL,
            impressions REAL,
            clicks REAL,
            conversions REAL,
            revenue REAL
        );
        """
    )

    connection.execute(
        """
        INSERT INTO advertisers (
            id,
            owner_operator_id
        )
        VALUES (?, ?)
        """,
        (
            "advertiser-test",
            "operator-test",
        ),
    )

    connection.executemany(
        """
        INSERT INTO ad_connections (
            advertiser_id,
            platform,
            account_id,
            customer_id,
            status,
            conversion_tracking_start_date
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                "advertiser-test",
                "meta",
                "META-001",
                None,
                "connected",
                "2026-05-01",
            ),
            (
                "advertiser-test",
                "meta",
                "META-002",
                None,
                "connected",
                None,
            ),
        ],
    )

    connection.executemany(
        """
        INSERT INTO ad_performance_daily (
            advertiser_id,
            platform,
            account_id,
            date,
            channel,
            spend,
            impressions,
            clicks,
            conversions,
            revenue
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                "advertiser-test",
                "meta",
                "META-001",
                "2026-08-01",
                "Meta",
                100000,
                10000,
                500,
                20,
                500000,
            ),
            (
                "advertiser-test",
                "meta",
                "META-002",
                "2026-08-01",
                "Meta",
                200000,
                20000,
                1000,
                40,
                900000,
            ),
        ],
    )

    connection.commit()

    monkeypatch.setattr(
        main_module,
        "get_db_connection",
        lambda:
            connection,
    )

    result = (
        main_module
        .build_channel_optimization_panel(
            advertiser_id=
                "advertiser-test",

            operator_id=
                "operator-test",
        )
    )

    assert (
        result.get("status")
        == "ok"
    )

    channels = (
        result.get(
            "channels"
        )
        or []
    )

    assert (
        len(channels)
        == 1
    )

    meta = channels[0]

    assert (
        meta.get("channel")
        == "Meta"
    )

    assert (
        meta.get(
            "revenueValidStartDate"
        )
        is None
    )

    assert (
        meta.get(
            "revenueValidityAvailable"
        )
        is False
    )

    assert (
        result.get(
            "missingRevenueValidity"
        )
        == [
            "Meta"
        ]
    )

