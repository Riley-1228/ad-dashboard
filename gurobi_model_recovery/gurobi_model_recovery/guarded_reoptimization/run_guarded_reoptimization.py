
from __future__ import annotations

import argparse
from pathlib import Path
from guarded_reoptimization import GuardrailConfig, run_guarded_reoptimization


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--demo-dir", type=Path, required=True)
    p.add_argument("--safety-decisions", type=Path, required=True)
    p.add_argument("--performance", type=Path, required=True)
    p.add_argument("--bounds", type=Path, required=True)
    p.add_argument("--frozen-dir", type=Path, required=True)
    p.add_argument("--output-dir", type=Path)
    p.add_argument(
        "--review-policy",
        choices=["freeze", "restrict"],
        default="freeze",
        help="Default strict shadow mode freezes REVIEW campaigns at current.",
    )
    p.add_argument(
        "--review-max-change",
        type=float,
        default=0.10,
        help="Used only when --review-policy restrict.",
    )
    args = p.parse_args()

    out = args.output_dir or args.demo_dir / "guarded_reoptimization"

    _, _, comparison, evaluation, meta = run_guarded_reoptimization(
        demo_dir=args.demo_dir,
        safety_decisions_path=args.safety_decisions,
        performance_path=args.performance,
        business_bounds_path=args.bounds,
        frozen_dir=args.frozen_dir,
        output_dir=out,
        cfg=GuardrailConfig(
            review_policy=args.review_policy,
            review_max_change_pct=args.review_max_change,
        ),
    )

    print("[DONE] Guarded reoptimization completed.")
    print("Review policy:", meta["review_policy"])
    print("Production write enabled:", meta["production_write_enabled"])
    print("Fixed/restricted notes:")
    for note in meta["notes"]:
        print(" -", note)
    print("\nEstimated comparison:")
    print(evaluation.to_string(index=False))
    print("\nOutput folder:", out.resolve())


if __name__ == "__main__":
    main()
