
from __future__ import annotations
import argparse
import json
from pathlib import Path
import pandas as pd

from optimization_safety_gate import GateConfig, evaluate_gate


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--demo-dir", type=Path, required=True)
    p.add_argument("--aggregate-results", type=Path, required=True)
    p.add_argument("--output-dir", type=Path)
    args = p.parse_args()

    out = args.output_dir or args.demo_dir / "safety_gate"
    out.mkdir(parents=True, exist_ok=True)

    campaigns, summary = evaluate_gate(
        demo_dir=args.demo_dir,
        aggregate_results_path=args.aggregate_results,
        cfg=GateConfig(),
    )

    campaigns.to_csv(out / "campaign_safety_decisions.csv", index=False, encoding="utf-8-sig")
    (out / "portfolio_safety_decision.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("[DONE] Safety gate completed.")
    print("Portfolio action:", summary["portfolio_action"])
    print("Campaign counts:", summary["campaign_counts"])
    print("Production write enabled:", summary["production_write_enabled"])
    print("Output folder:", out.resolve())


if __name__ == "__main__":
    main()
