import sqlite3

import backend.main as main


def test_conversion_unavailable_preserves_existing_revenue(
    tmp_path,
    monkeypatch,
):
    db_path = (
        tmp_path
        / "conversion_guard_test.db"
    )

    # -----------------------------------------
    # 1. 테스트용 DB 준비
    # -----------------------------------------

    connection = sqlite3.connect(
        db_path
    )

    connection.row_factory = sqlite3.Row

    connection.executescript(
        """
        CREATE TABLE advertisers (
            id TEXT PRIMARY KEY,
            owner_operator_id TEXT
        );

        CREATE TABLE ad_connections (
            id TEXT PRIMARY KEY,
            advertiser_id TEXT,
            platform TEXT,
            account_id TEXT,
            customer_id TEXT,
            status TEXT,
            updated_at TEXT
        );

        CREATE TABLE ad_performance_daily (
            id TEXT PRIMARY KEY,
            advertiser_id TEXT,
            platform TEXT NOT NULL,
            account_id TEXT,
            date TEXT NOT NULL,
            campaign_id TEXT,
            campaign_name TEXT,
            channel TEXT,
            spend REAL NOT NULL DEFAULT 0,
            impressions INTEGER NOT NULL DEFAULT 0,
            clicks REAL NOT NULL DEFAULT 0,
            conversions REAL NOT NULL DEFAULT 0,
            revenue REAL NOT NULL DEFAULT 0,
            ctr REAL NOT NULL DEFAULT 0,
            cpc REAL NOT NULL DEFAULT 0,
            cvr REAL NOT NULL DEFAULT 0,
            cpa REAL NOT NULL DEFAULT 0,
            roas REAL NOT NULL DEFAULT 0,
            synced_at TEXT NOT NULL,

            UNIQUE(
                platform,
                account_id,
                date,
                campaign_id
            )
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

    connection.execute(
        """
        INSERT INTO ad_connections (
            id,
            advertiser_id,
            platform,
            account_id,
            customer_id,
            status,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "connection-test",
            "advertiser-test",
            "naver",
            "account-test",
            "customer-test",
            "connected",
            "2026-09-29T00:00:00",
        ),
    )

    # 기존에 정상 저장돼 있던 conversion/revenue
    connection.execute(
        """
        INSERT INTO ad_performance_daily (
            id,
            advertiser_id,
            platform,
            account_id,
            date,
            campaign_id,
            campaign_name,
            channel,
            spend,
            impressions,
            clicks,
            conversions,
            revenue,
            ctr,
            cpc,
            cvr,
            cpa,
            roas,
            synced_at
        )
        VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        """,
        (
            "existing-row",
            "advertiser-test",
            "naver",
            "customer-test",
            "2026-08-06",
            "campaign-1",
            "Campaign 1",
            "Naver",
            10000.0,
            1000,
            100,
            10.0,
            50000.0,
            10.0,
            100.0,
            10.0,
            1000.0,
            500.0,
            "2026-08-06T00:00:00Z",
        ),
    )

    connection.commit()
    connection.close()

    # -----------------------------------------
    # 2. main.py가 테스트 DB를 쓰게 변경
    # -----------------------------------------

    def test_get_db_connection():
        conn = sqlite3.connect(
            db_path
        )

        conn.row_factory = (
            sqlite3.Row
        )

        return conn

    monkeypatch.setattr(
        main,
        "get_db_connection",
        test_get_db_connection,
    )

    # -----------------------------------------
    # 3. AD_DETAIL은 새 값이 정상 조회됨
    # -----------------------------------------

    monkeypatch.setattr(
        main,
        "create_naver_daily_report",
        lambda payload, token_payload=None: {
            "status": "ok",
            "performanceRows": [
                {
                    "date": "20260806",
                    "campaignId":
                        "campaign-1",
                    "spend": 12000.0,
                    "impressions": 1200,
                    "clicks": 120,
                }
            ],
        },
    )

    # -----------------------------------------
    # 4. Conversion report는 retention 때문에
    #    조회 불가능한 상황 재현
    # -----------------------------------------

    monkeypatch.setattr(
        main,
        "create_naver_daily_conversion_report",
        lambda payload, token_payload=None: {
            "status": "failed",
            "stage": "create",
            "httpStatus": 400,
            "detail": (
                "11004 "
                "conversion report unavailable"
            ),
        },
    )

    monkeypatch.setattr(
        main,
        "sync_naver_campaigns",
        lambda advertiserId,
        token_payload=None: {
            "status": "ok",
            "campaigns": [
                {
                    "id": "campaign-1",
                    "name": "Campaign 1",
                }
            ],
        },
    )

    # -----------------------------------------
    # 5. Daily Sync 실행
    # -----------------------------------------

    payload = (
        main.NaverDailyReportPayload(
            date="2026-08-06",
            advertiserId=
                "advertiser-test",
        )
    )

    result = (
        main.sync_naver_daily_performance(
            payload,
            token_payload={
                "sub": "operator-test"
            },
        )
    )

    # -----------------------------------------
    # 6. API 응답 검증
    # -----------------------------------------

    assert result["status"] == "ok"

    assert (
        result[
            "conversionDataAvailable"
        ]
        is False
    )

    assert (
        result[
            "conversionDataPreserved"
        ]
        is True
    )

    # -----------------------------------------
    # 7. DB 실제 결과 검증
    # -----------------------------------------

    connection = (
        test_get_db_connection()
    )

    row = connection.execute(
        """
        SELECT
            spend,
            clicks,
            conversions,
            revenue,
            cvr,
            cpa,
            roas
        FROM ad_performance_daily
        WHERE platform = ?
          AND account_id = ?
          AND date = ?
          AND campaign_id = ?
        """,
        (
            "naver",
            "customer-test",
            "2026-08-06",
            "campaign-1",
        ),
    ).fetchone()

    connection.close()

    assert row is not None

    # AD_DETAIL은 최신값으로 변경되어야 함
    assert row["spend"] == 12000.0
    assert row["clicks"] == 120

    # Conversion 계열은 기존값 유지
    assert row["conversions"] == 10.0
    assert row["revenue"] == 50000.0
    assert row["cvr"] == 10.0
    assert row["cpa"] == 1000.0
    assert row["roas"] == 500.0