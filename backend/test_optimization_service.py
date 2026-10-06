import sqlite3

import pytest

from backend.optimization_service import (
    OptimizationPreviewServiceError,
    _fetch_performance_records,
    _resolve_account_id,
    _verify_advertiser_owner,
)


def make_db():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute(
        "CREATE TABLE advertisers (id TEXT PRIMARY KEY, owner_operator_id TEXT)"
    )
    connection.execute(
        """
        CREATE TABLE ad_performance_daily (
            advertiser_id TEXT,
            platform TEXT,
            account_id TEXT,
            date TEXT,
            campaign_id TEXT,
            campaign_name TEXT,
            spend REAL,
            impressions INTEGER,
            clicks REAL,
            conversions REAL,
            revenue REAL
        )
        """
    )
    return connection


def test_owner_check_rejects_other_operator():
    db = make_db()
    db.execute("INSERT INTO advertisers VALUES (?, ?)", ("adv1", "op1"))
    with pytest.raises(OptimizationPreviewServiceError) as exc:
        _verify_advertiser_owner(db, "adv1", "op2")
    assert exc.value.status_code == 403


def test_multiple_accounts_require_explicit_account():
    db = make_db()
    db.executemany(
        "INSERT INTO ad_performance_daily VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            ("adv1", "naver", "A", "2026-01-01", "C1", "C1", 1, 1, 1, 1, 1),
            ("adv1", "naver", "B", "2026-01-01", "C1", "C1", 1, 1, 1, 1, 1),
        ],
    )
    with pytest.raises(OptimizationPreviewServiceError) as exc:
        _resolve_account_id(db, "adv1", None)
    assert exc.value.status_code == 400


def test_explicit_account_and_fetch_are_tenant_scoped():
    db = make_db()
    db.executemany(
        "INSERT INTO ad_performance_daily VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            ("adv1", "naver", "A", "2026-01-01", "C1", "One", 10, 100, 4, 1, 20),
            ("adv2", "naver", "A", "2026-01-01", "C9", "Other", 99, 999, 9, 9, 999),
        ],
    )
    assert _resolve_account_id(db, "adv1", "A") == "A"
    rows = _fetch_performance_records(db, "adv1", "A")
    assert len(rows) == 1
    assert rows[0]["advertiser_id"] == "adv1"
    assert rows[0]["campaign_id"] == "C1"
