from multiprocessing.dummy import connection
import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parent / "adscope.db"


def get_db_connection():
    connection = sqlite3.connect(DATABASE_PATH)

    connection.row_factory = sqlite3.Row

    return connection


def initialize_database():
    connection = get_db_connection()

    try:
        # ---------------------------------
        # 광고주 제안
        # ---------------------------------

        connection.execute("""
            CREATE TABLE IF NOT EXISTS client_proposals (
                id TEXT PRIMARY KEY,
                advertiser_id TEXT,
                client_id TEXT,

                scenario_id TEXT,
                scenario_name TEXT,
                status TEXT NOT NULL DEFAULT 'preparing',

                assignee TEXT,
                due_date TEXT,
                task_status TEXT NOT NULL DEFAULT 'waiting',

                share_token TEXT,
                share_url TEXT,
                share_status TEXT NOT NULL DEFAULT 'not_shared',

                shared_at TEXT,
                first_viewed_at TEXT,
                last_viewed_at TEXT,
                view_count INTEGER NOT NULL DEFAULT 0,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,

                proposal_json TEXT NOT NULL
            )
            """)

        # 기존 DB 호환:
        # proposal_json 컬럼이 없는 경우만 추가

        columns = connection.execute("""
            PRAGMA table_info(client_proposals)
            """).fetchall()

        column_names = {column[1] for column in columns}

        if "advertiser_id" not in column_names:
            connection.execute("""
                ALTER TABLE client_proposals
                ADD COLUMN advertiser_id TEXT
                """)

        if "client_id" not in column_names:
            connection.execute("""
                ALTER TABLE client_proposals
                ADD COLUMN client_id TEXT
                """)

        if "proposal_json" not in column_names:
            connection.execute("""
                ALTER TABLE client_proposals
                ADD COLUMN proposal_json TEXT
                """)

        # ---------------------------------
        # 광고주 소통 메시지
        # ---------------------------------

        connection.execute("""
            CREATE TABLE IF NOT EXISTS proposal_messages (
                id TEXT PRIMARY KEY,
                proposal_id TEXT NOT NULL,

                sender_type TEXT NOT NULL,
                sender_name TEXT,

                message TEXT NOT NULL,

                action_url TEXT,
                action_label TEXT,

                created_at TEXT NOT NULL,

                is_read INTEGER NOT NULL DEFAULT 0,
                read_at TEXT,

                FOREIGN KEY (proposal_id)
                    REFERENCES client_proposals(id)
            )
            """)

        # 기존 proposal_messages 테이블에는
        # action_url / action_label이 없을 수 있으므로
        # 없는 컬럼만 추가

        columns = connection.execute("PRAGMA table_info(proposal_messages)").fetchall()

        column_names = {column[1] for column in columns}

        if "is_read" not in column_names:
            connection.execute("""
                ALTER TABLE proposal_messages
                ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0
                """)

        if "read_at" not in column_names:
            connection.execute("""
                ALTER TABLE proposal_messages
                ADD COLUMN read_at TEXT
                """)

        column_names = {column[1] for column in columns}

        if "action_url" not in column_names:
            connection.execute("""
                ALTER TABLE proposal_messages
                ADD COLUMN action_url TEXT
                """)

        if "action_label" not in column_names:
            connection.execute("""
                ALTER TABLE proposal_messages
                ADD COLUMN action_label TEXT
                """)

        # ---------------------------------
        # 광고주 제안 이벤트
        # ---------------------------------

        connection.execute("""
            CREATE TABLE IF NOT EXISTS proposal_events (
                id TEXT PRIMARY KEY,
                proposal_id TEXT NOT NULL,

                event_type TEXT NOT NULL,
                status TEXT,
                message TEXT,

                created_at TEXT NOT NULL,

                FOREIGN KEY (proposal_id)
                    REFERENCES client_proposals(id)
            )
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS advertisers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                company_name TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                contact_name TEXT,
                contact_email TEXT,
                contact_phone TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS advertisers (
                id TEXT PRIMARY KEY,
                owner_operator_id TEXT,

                name TEXT NOT NULL,
                company_name TEXT,
                status TEXT NOT NULL DEFAULT 'active',

                contact_name TEXT,
                contact_email TEXT,
                contact_phone TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,

                FOREIGN KEY (owner_operator_id)
                    REFERENCES operator_users(id)
            )
        """)

        advertiser_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(advertisers)"
            ).fetchall()
        }

        if "owner_operator_id" not in advertiser_columns:
            connection.execute(
                """
                ALTER TABLE advertisers
                ADD COLUMN owner_operator_id TEXT
                """
            )

        connection.execute("""
            CREATE TABLE IF NOT EXISTS ad_connections (
                id TEXT PRIMARY KEY,
                advertiser_id TEXT,

                platform TEXT NOT NULL,
                api_url TEXT,

                account_id TEXT,
                account_name TEXT,

                status TEXT NOT NULL DEFAULT 'disconnected',

                access_token TEXT,
                refresh_token TEXT,

                secret_key TEXT,
                customer_id TEXT,

                token_expires_at TEXT,

                last_synced_at TEXT,

                conversion_tracking_start_date TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """)

        columns = connection.execute("PRAGMA table_info(ad_connections)").fetchall()

        column_names = {column[1] for column in columns}

        if "advertiser_id" not in column_names:
            connection.execute("""
                ALTER TABLE ad_connections
                ADD COLUMN advertiser_id TEXT
                """)

        if "secret_key" not in column_names:
            connection.execute("""
                ALTER TABLE ad_connections
                ADD COLUMN secret_key TEXT
                """)

        if "customer_id" not in column_names:
            connection.execute("""
                ALTER TABLE ad_connections
                ADD COLUMN customer_id TEXT
                """)

        if "api_url" not in column_names:
            connection.execute("""
                ALTER TABLE ad_connections
                ADD COLUMN api_url TEXT
                """)

        if (
            "conversion_tracking_start_date"
            not in column_names
        ):
            connection.execute(
                """
                ALTER TABLE ad_connections
                ADD COLUMN conversion_tracking_start_date TEXT
                """
            )        

        connection.execute("""
            CREATE TABLE IF NOT EXISTS ad_performance (
                id TEXT PRIMARY KEY,

                platform TEXT NOT NULL,
                account_id TEXT,

                date_preset TEXT,

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
                    date_preset,
                    campaign_id
                )
            )
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS ad_performance_daily (
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
            )
            """)

        daily_performance_columns = connection.execute(
            "PRAGMA table_info(ad_performance_daily)"
        ).fetchall()

        daily_performance_column_names = {
            column[1] for column in daily_performance_columns
        }

        if "advertiser_id" not in daily_performance_column_names:
            connection.execute("""
                ALTER TABLE ad_performance_daily
                ADD COLUMN advertiser_id TEXT
                """)

                # ---------------------------------
        # Campaign Budget Policy
        #
        # PDF Mathematical Formulation:
        #
        # x0_i = 실제 현재 일예산
        # L_i  = planner-defined 최소 일예산
        # U_i  = planner-defined 최대 일예산
        #
        # current_daily_budget는
        # Naver API dailyBudget의 최근 snapshot이며,
        # min/max는 사용자가 정의한 business constraint다.
        # ---------------------------------


        # ---------------------------------
        # 이상 지표 Alert
        # ---------------------------------

        connection.execute("""
            CREATE TABLE IF NOT EXISTS metric_anomaly_alerts (
                id TEXT PRIMARY KEY,

                advertiser_id TEXT NOT NULL,

                scope TEXT NOT NULL,
                entity_key TEXT NOT NULL,

                platform TEXT,
                channel TEXT,

                campaign_id TEXT,
                campaign_name TEXT,

                metric TEXT NOT NULL,
                alert_date TEXT NOT NULL,

                current_value REAL,
                baseline_value REAL,

                change_pct REAL,
                robust_z REAL,

                severity TEXT NOT NULL,
                direction TEXT NOT NULL,

                reason_code TEXT NOT NULL,

                status TEXT NOT NULL DEFAULT 'open',

                title TEXT,
                message TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,

                acknowledged_at TEXT,
                resolved_at TEXT,

                UNIQUE(
                    advertiser_id,
                    scope,
                    entity_key,
                    metric,
                    alert_date,
                    reason_code
                ),

                FOREIGN KEY (advertiser_id)
                    REFERENCES advertisers(id)
            )
        """)

        # ---------------------------------
        # Alert 발송 이력
        #
        # 이메일 / 카카오 알림톡 / SMS를
        # 각각 별도 Delivery row로 기록한다.
        # ---------------------------------

        connection.execute("""
            CREATE TABLE IF NOT EXISTS metric_alert_deliveries (
                id TEXT PRIMARY KEY,

                alert_id TEXT NOT NULL,

                channel TEXT NOT NULL,
                recipient TEXT NOT NULL,

                provider TEXT,

                status TEXT NOT NULL
                    DEFAULT 'pending',

                attempt_count INTEGER NOT NULL
                    DEFAULT 0,

                provider_message_id TEXT,
                error_message TEXT,

                is_fallback INTEGER NOT NULL
                    DEFAULT 0,

                fallback_for_delivery_id TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sent_at TEXT,

                UNIQUE(
                    alert_id,
                    channel,
                    recipient
                ),

                FOREIGN KEY (alert_id)
                    REFERENCES metric_anomaly_alerts(id),

                FOREIGN KEY (fallback_for_delivery_id)
                    REFERENCES metric_alert_deliveries(id)
            )
        """)

        # ---------------------------------
        # Alert 조회 성능용 Index
        # ---------------------------------

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
                idx_metric_anomaly_alerts_advertiser_status
            ON metric_anomaly_alerts(
                advertiser_id,
                status,
                alert_date
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
                idx_metric_anomaly_alerts_severity
            ON metric_anomaly_alerts(
                severity,
                status
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
                idx_metric_alert_deliveries_alert_status
            ON metric_alert_deliveries(
                alert_id,
                status
            )
        """)

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS
                ad_campaign_budget_policies (
                    id TEXT PRIMARY KEY,

                    advertiser_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    account_id TEXT NOT NULL,

                    campaign_id TEXT NOT NULL,
                    campaign_name TEXT,

                    current_daily_budget REAL,

                    use_daily_budget INTEGER,

                    shared_budget_id TEXT,

                    campaign_status TEXT,

                    user_lock INTEGER,

                    min_daily_budget REAL,
                    max_daily_budget REAL,

                    current_budget_source TEXT
                        NOT NULL
                        DEFAULT 'platform_api',

                    policy_source TEXT
                        NOT NULL
                        DEFAULT 'planner',

                    current_budget_synced_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,

                    UNIQUE(
                        advertiser_id,
                        platform,
                        account_id,
                        campaign_id
                    )
                )
            """
        )

        connection.execute("""
            CREATE TABLE IF NOT EXISTS ad_backfill_jobs (
                id TEXT PRIMARY KEY,

                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                advertiser_id TEXT,

                status TEXT NOT NULL DEFAULT 'pending',

                target_start_date TEXT NOT NULL,
                target_end_date TEXT NOT NULL,

                current_date TEXT,

                total_days INTEGER NOT NULL DEFAULT 0,
                completed_days INTEGER NOT NULL DEFAULT 0,
                failed_days INTEGER NOT NULL DEFAULT 0,

                progress REAL NOT NULL DEFAULT 0,

                last_error TEXT,

                created_at TEXT NOT NULL,
                started_at TEXT,
                updated_at TEXT NOT NULL,
                completed_at TEXT,

                UNIQUE(
                    platform,
                    account_id
                )
            )
        """)

        campaign_budget_policy_columns = (
            connection.execute(
                """
                PRAGMA table_info(
                    ad_campaign_budget_policies
                )
                """
            ).fetchall()
        )

        campaign_budget_policy_column_names = {
            column[1]
            for column
            in campaign_budget_policy_columns
        }

        if (
            "use_daily_budget"
            not in
            campaign_budget_policy_column_names
        ):
            connection.execute(
                """
                ALTER TABLE
                    ad_campaign_budget_policies
                ADD COLUMN
                    use_daily_budget INTEGER
                """
            )

        if (
            "shared_budget_id"
            not in
            campaign_budget_policy_column_names
        ):
            connection.execute(
                """
                ALTER TABLE
                    ad_campaign_budget_policies
                ADD COLUMN
                    shared_budget_id TEXT
                """
            )

        if (
            "campaign_status"
            not in
            campaign_budget_policy_column_names
        ):
            connection.execute(
                """
                ALTER TABLE
                    ad_campaign_budget_policies
                ADD COLUMN
                    campaign_status TEXT
                """
            )

        if (
            "user_lock"
            not in
            campaign_budget_policy_column_names
        ):
            connection.execute(
                """
                ALTER TABLE
                    ad_campaign_budget_policies
                ADD COLUMN
                    user_lock INTEGER
                """
            )

        backfill_job_columns = connection.execute(
            "PRAGMA table_info(ad_backfill_jobs)"
        ).fetchall()

        backfill_job_column_names = {column[1] for column in backfill_job_columns}

        if "advertiser_id" not in backfill_job_column_names:
            connection.execute("""
                ALTER TABLE ad_backfill_jobs
                ADD COLUMN advertiser_id TEXT
                """)

        connection.execute("""
            UPDATE ad_backfill_jobs
            SET advertiser_id = (
                SELECT advertiser_id
                FROM ad_connections
                WHERE ad_connections.platform
                    = ad_backfill_jobs.platform
                  AND (
                    ad_connections.customer_id
                        = ad_backfill_jobs.account_id
                    OR ad_connections.account_id
                        = ad_backfill_jobs.account_id
                  )
                LIMIT 1
            )
            WHERE advertiser_id IS NULL
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS ad_backfill_failures (
                id TEXT PRIMARY KEY,

                job_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                advertiser_id TEXT,

                failed_date TEXT NOT NULL,

                retry_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',

                error_message TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                resolved_at TEXT,

                UNIQUE(
                    job_id,
                    failed_date
                ),

                FOREIGN KEY (job_id)
                    REFERENCES ad_backfill_jobs(id)
            )
        """)

        backfill_failure_columns = connection.execute(
            "PRAGMA table_info(ad_backfill_failures)"
        ).fetchall()

        backfill_failure_column_names = {
            column[1] for column in backfill_failure_columns
        }

        if "advertiser_id" not in backfill_failure_column_names:
            connection.execute("""
                ALTER TABLE ad_backfill_failures
                ADD COLUMN advertiser_id TEXT
                """)

        connection.execute("""
            UPDATE ad_backfill_failures
            SET advertiser_id = (
                SELECT advertiser_id
                FROM ad_backfill_jobs
                WHERE ad_backfill_jobs.id
                    = ad_backfill_failures.job_id
                LIMIT 1
            )
            WHERE advertiser_id IS NULL
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,

                name TEXT NOT NULL,
                brand_name TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS client_users (
                id TEXT PRIMARY KEY,

                client_id TEXT NOT NULL,
                advertiser_id TEXT,

                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,

                name TEXT,
                role TEXT NOT NULL DEFAULT 'client',

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,

                FOREIGN KEY (client_id)
                    REFERENCES clients(id)
            )
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS operator_users (
                id TEXT PRIMARY KEY,

                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,

                name TEXT,
                role TEXT NOT NULL DEFAULT 'operator',
                status TEXT NOT NULL DEFAULT 'active',

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        columns = connection.execute("PRAGMA table_info(client_users)").fetchall()

        column_names = {column[1] for column in columns}

        if "advertiser_id" not in column_names:
            connection.execute("""
                ALTER TABLE client_users
                ADD COLUMN advertiser_id TEXT
                """)

        connection.commit()

    finally:
        connection.close()
