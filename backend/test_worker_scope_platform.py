import csv
import json
import subprocess
from pathlib import Path


ROOT = (
    Path(__file__)
    .resolve()
    .parents[1]
)

WORKER_PATH = (
    ROOT
    / "gurobi_model_recovery"
    / "gurobi_model_recovery"
    / "live_preview_worker.py"
)

MODEL_PYTHON = (
    ROOT
    / "gurobi_model_recovery"
    / ".venv"
    / "Scripts"
    / "python.exe"
)

NAVER_CSV = (
    ROOT
    / "gurobi_model_recovery"
    / "gurobi_model_recovery"
    / "naver_synthetic_performance.csv"
)


def test_worker_campaign_scope_keeps_naver_platform(
    tmp_path,
):
    records = []

    with NAVER_CSV.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(
            file
        )

        for row in reader:
            records.append(
                {
                    "date":
                        row["date"],

                    "campaign_id":
                        row["campaign_id"],

                    "campaign_name":
                        row["campaign_name"],

                    "account_id":
                        row["account_id"],

                    "spend":
                        float(
                            row["spend"]
                        ),

                    "impressions":
                        float(
                            row["impressions"]
                        ),

                    "clicks":
                        float(
                            row["clicks"]
                        ),

                    "conversions":
                        float(
                            row["conversions"]
                        ),

                    "revenue":
                        float(
                            row["revenue"]
                        ),
                }
            )

    assert records

    start_date = min(
        row["date"]
        for row in records
    )

    # -----------------------------------------
    # Synthetic configured current budgets
    #
    # Production에서는 Naver configured
    # dailyBudget가 x0_i가 된다.
    #
    # 이 테스트 fixture에서는 각 캠페인의
    # 평균 spend를 synthetic configured
    # budget 역할로 사용한다.
    # -----------------------------------------

    spend_by_campaign = {}

    for row in records:
        campaign_id = str(
            row[
                "campaign_id"
            ]
        )

        spend_by_campaign.setdefault(
            campaign_id,
            [],
        ).append(
            float(
                row[
                    "spend"
                ]
            )
        )

    current_budgets = {
        campaign_id:
            float(
                sum(values)
                / len(values)
            )

        for (
            campaign_id,
            values,
        )
        in spend_by_campaign.items()
    }

    assert len(
        current_budgets
    ) >= 2

    # -----------------------------------------
    # Synthetic planner L / U
    #
    # x0가 반드시 L/U 내부에 있도록
    # 넓은 policy 범위를 만든다.
    # -----------------------------------------

    budget_bounds = {
        campaign_id: {
            "min":
                current_budget
                * 0.50,

            "max":
                current_budget
                * 1.50,
        }

        for (
            campaign_id,
            current_budget,
        )
        in current_budgets.items()
    }

    total_daily_budget = float(
        sum(
            current_budgets.values()
        )
    )

    request_payload = {
        "advertiserId":
            "synthetic-naver-platform-test",

        "accountId":
            "SYNTH-001",

        "optimizationScope":
            "campaign",

        "maxBudgetChangePct":
            0.30,

        "reviewPolicy":
            "freeze",

        "revenueValidStartDate":
            start_date,

        "performance":
            records,

        "currentBudgets":
            current_budgets,

        "budgetBounds":
            budget_bounds,

        "totalDailyBudget":
            total_daily_budget,
    }

    input_path = (
        tmp_path
        / "campaign_request.json"
    )

    output_path = (
        tmp_path
        / "campaign_response.json"
    )

    input_path.write_text(
        json.dumps(
            request_payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    completed = subprocess.run(
        [
            str(
                MODEL_PYTHON
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
        capture_output=True,
        text=True,
        check=False,
    )

    assert (
        completed.returncode
        == 0
    ), (
        completed.stdout
        + "\n"
        + completed.stderr
    )

    result = json.loads(
        output_path.read_text(
            encoding="utf-8"
        )
    )

    assert (
        result.get(
            "status"
        )
        == "ok"
    ), result

    assert (
        result.get(
            "optimizationScope"
        )
        == "campaign"
    )

    assert (
        result.get(
            "platform"
        )
        == "naver"
    )

    assert (
        result.get(
            "baselineSource"
        )
        == "platform_configured_daily_budget"
    )

    assert (
        result.get(
            "totalBudgetSource"
        )
        == "planner_input"
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