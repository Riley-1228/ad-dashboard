import json
import math
import random
from datetime import date, timedelta
from pathlib import Path


DAYS = 220

END_DATE = date(
    2026,
    9,
    28,
)

START_DATE = (
    END_DATE
    - timedelta(
        days=DAYS - 1
    )
)

random.seed(42)


CHANNELS = [
    {
        "channel": "Naver",
        "platform": "naver",
        "baseSpend": 420000.0,
        "maxRevenue": 3000000.0,
        "responseScale": 300000.0,
        "aov": 80000.0,
    },
    {
        "channel": "Meta",
        "platform": "meta",
        "baseSpend": 330000.0,
        "maxRevenue": 2300000.0,
        "responseScale": 260000.0,
        "aov": 75000.0,
    },
    {
        "channel": "Google",
        "platform": "google",
        "baseSpend": 270000.0,
        "maxRevenue": 2000000.0,
        "responseScale": 220000.0,
        "aov": 85000.0,
    },
]


performance = []


for day_index in range(DAYS):
    current_date = (
        START_DATE
        + timedelta(
            days=day_index
        )
    )

    for channel_index, config in enumerate(
        CHANNELS
    ):
        variation = (
            1.0
            + 0.24
            * math.sin(
                day_index * 0.31
                + channel_index
            )
            + 0.10
            * math.cos(
                day_index * 0.13
                + channel_index * 0.7
            )
            + random.uniform(
                -0.03,
                0.03,
            )
        )

        spend = max(
            50000.0,
            config["baseSpend"]
            * variation,
        )

        revenue = (
            config["maxRevenue"]
            * (
                1.0
                - math.exp(
                    -spend
                    / config[
                        "responseScale"
                    ]
                )
            )
        )

        revenue *= random.uniform(
            0.99,
            1.01,
        )

        conversions = max(
            1.0,
            revenue
            / config["aov"],
        )

        clicks = (
            conversions
            / 0.04
        )

        impressions = (
            clicks
            / 0.025
        )

        performance.append(
            {
                "date":
                    current_date.isoformat(),

                "platform":
                    config["platform"],

                "channel":
                    config["channel"],

                "spend":
                    round(
                        spend,
                        2,
                    ),

                "revenue":
                    round(
                        revenue,
                        2,
                    ),

                "impressions":
                    round(
                        impressions,
                        2,
                    ),

                "clicks":
                    round(
                        clicks,
                        2,
                    ),

                "conversions":
                    round(
                        conversions,
                        4,
                    ),
            }
        )


payload = {
    "advertiserId":
        "synthetic-channel-test",

    "accountId":
        None,

    "optimizationScope":
        "channel",

    "maxBudgetChangePct":
        0.30,

    "reviewPolicy":
        "freeze",

    "revenueValidStartDates": {
        "Naver":
            START_DATE.isoformat(),

        "Meta":
            START_DATE.isoformat(),

        "Google":
            START_DATE.isoformat(),
    },

    "performance":
        performance,
}


output_path = (
    Path(__file__).resolve().parent
    / "channel_synthetic_request.json"
)


output_path.write_text(
    json.dumps(
        payload,
        ensure_ascii=False,
        indent=2,
        allow_nan=False,
    ),
    encoding="utf-8",
)


print(
    "Synthetic channel fixture created"
)

print(
    f"startDate = {START_DATE}"
)

print(
    f"endDate = {END_DATE}"
)

print(
    f"daysPerChannel = {DAYS}"
)

print(
    f"channels = {len(CHANNELS)}"
)

print(
    f"performanceRows = {len(performance)}"
)

print(
    f"output = {output_path}"
)