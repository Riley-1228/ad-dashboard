
from pathlib import Path
import tempfile
import pandas as pd
import numpy as np
import generate_test_scenarios as g

def test_generate_one_shapes():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td)
        g.generate_one(out, "normal", 123, days=30)
        perf = pd.read_csv(out/"naver_synthetic_performance.csv")
        truth = pd.read_csv(out/"naver_synthetic_ground_truth.csv")
        bounds = pd.read_csv(out/"campaign_budget_bounds.csv")
        assert len(perf) == 12*30
        assert len(truth) == 12
        assert len(bounds) == 12
        assert set(["spend","revenue","roas","campaign_id","date"]).issubset(perf.columns)
        assert np.isfinite(perf["spend"]).all()
        assert np.isfinite(perf["revenue"]).all()
        assert (perf["spend"] > 0).all()

def test_all_scenarios_generate():
    with tempfile.TemporaryDirectory() as td:
        base = Path(td)
        for s in g.SCENARIOS:
            out = base/s
            g.generate_one(out, s, 1, days=10)
            assert (out/"naver_synthetic_performance.csv").is_file()
            assert (out/"naver_synthetic_ground_truth.csv").is_file()
            assert (out/"campaign_budget_bounds.csv").is_file()
