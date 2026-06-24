"""
FloodRiskPredictor v2: loads models/v2/ artifacts and scores a single record
through the full v2 pipeline:
  1. FeatureEngineer.transform  (physics features, 5-stat TE, DAE, etc.)
  2. RankGauss inverse transform per base model
  3. SLSQP weight blend
  4. L-BFGS-B posthoc power transform  a·pred^b + c
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from . import config
from .data_validation import flag_out_of_distribution
from .features import FeatureEngineer

ALL_INPUT_COLS = (
    config.RAW_NUMERIC_COLS
    + config.RAW_CAT_COLS
    + list(config.EVENT_DEFAULTS.keys())
    + list(config.QMAP_SOURCE.keys())
    + config.ADVANCED_COLS
)

NUMERIC_INPUT_COLS = (
    config.RAW_NUMERIC_COLS
    + list(config.QMAP_SOURCE.keys())
    + config.ADVANCED_COLS
    + ["inundation_area_sqm"]
)


class FloodRiskPredictor:
    def __init__(self, model_dir: Path | None = None):
        model_dir = model_dir or config.MODEL_DIR

        self.fe = FeatureEngineer.load(model_dir / "feature_engineer.joblib")

        # RankGauss transformer (inverse-transform model outputs back to [0,1])
        self.rank_gauss = joblib.load(model_dir / "rank_gauss.joblib")

        # 6 model families
        self.lgb_models    = joblib.load(model_dir / "lgb_models.joblib")
        self.xgb1_models   = joblib.load(model_dir / "xgb1_models.joblib")
        self.xgb2_models   = joblib.load(model_dir / "xgb2_models.joblib")
        self.cat1_models   = joblib.load(model_dir / "cat1_models.joblib")
        self.cat2_models   = joblib.load(model_dir / "cat2_models.joblib")
        self.catrmse_models = joblib.load(model_dir / "catrmse_models.joblib")

        with open(model_dir / "meta_weights.json") as f:
            mw = json.load(f)
        self.model_names   = mw["model_names"]           # list[str]
        self.meta_weights  = np.array(mw["weights"])     # shape (6,)

        with open(model_dir / "posthoc.json") as f:
            ph = json.load(f)
        self.posthoc_a = float(ph["a"])
        self.posthoc_b = float(ph["b"])
        self.posthoc_c = float(ph["c"])

        with open(model_dir / "metadata.json") as f:
            self.metadata = json.load(f)
        with open(model_dir / "district_profiles.json") as f:
            self.district_profiles = json.load(f)

        self.top_features = self.metadata["top_features"]

    # ── input handling ───────────────────────────────────────────────
    def _build_input_df(self, record: dict) -> pd.DataFrame:
        row = {col: record.get(col) for col in ALL_INPUT_COLS}
        row["generation_date"] = record.get("generation_date")
        df = pd.DataFrame([row])
        for col in NUMERIC_INPUT_COLS:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        return df

    # ── base-model ensemble ──────────────────────────────────────────
    def _inv_rg(self, raw_preds: np.ndarray) -> np.ndarray:
        """Inverse-transform RankGauss predictions to the original [0,1] scale."""
        return np.clip(
            self.rank_gauss.inverse_transform(raw_preds.reshape(-1, 1)).flatten(),
            0.0, 1.0,
        )

    def _family_pred(self, models: list, X: np.ndarray) -> np.ndarray:
        """Average fold predictions then inverse RankGauss."""
        raw = np.mean([m.predict(X) for m in models], axis=0)
        return self._inv_rg(raw)

    def _base_predictions(self, X: np.ndarray) -> dict[str, np.ndarray]:
        return {
            "lgb":     self._family_pred(self.lgb_models,    X),
            "xgb1":    self._family_pred(self.xgb1_models,   X),
            "xgb2":    self._family_pred(self.xgb2_models,   X),
            "cat1":    self._family_pred(self.cat1_models,   X),
            "cat2":    self._family_pred(self.cat2_models,   X),
            "catrmse": self._family_pred(self.catrmse_models, X),
        }

    # ── public API ───────────────────────────────────────────────────
    def predict(self, record: dict) -> dict:
        df = self._build_input_df(record)
        X  = self.fe.transform(df).to_numpy(dtype=np.float64)

        base = self._base_predictions(X)

        # SLSQP-optimised weighted blend
        preds  = np.array([float(base[m][0]) for m in self.model_names])
        blended = float(np.clip(np.dot(preds, self.meta_weights), 0.0, 1.0))

        # Posthoc power transform  a·pred^b + c
        ph_input = max(blended, 1e-6)
        final    = float(np.clip(self.posthoc_a * ph_input ** self.posthoc_b + self.posthoc_c, 0.0, 1.0))

        return {
            "flood_risk_score":   round(final, 4),
            "risk_category":      config.risk_category(final),
            "raw_score":          round(blended, 4),
            "base_model_scores": {
                "lgb":     round(float(base["lgb"][0]), 4),
                "xgb":     round(float((base["xgb1"][0] + base["xgb2"][0]) / 2), 4),
                "cat":     round(float((base["cat1"][0] + base["cat2"][0]) / 2), 4),
                "catrmse": round(float(base["catrmse"][0]), 4),
            },
            "model_version":      self.metadata["version"],
            "ood_flags":          flag_out_of_distribution(record),
        }

    def feature_contributions(self, record: dict, top_n: int = 8) -> list[dict]:
        df  = self._build_input_df(record)
        X   = self.fe.transform(df)
        row = X.iloc[0]
        return [
            {
                "feature":    name,
                "importance": round(importance, 2),
                "value":      round(float(row.get(name, 0.0)), 4),
            }
            for name, importance in self.top_features[:top_n]
        ]


if __name__ == "__main__":
    predictor = FloodRiskPredictor()
    train_df  = pd.read_csv(config.TRAIN_PATH)
    sample    = train_df.sample(5, random_state=123)

    print(f"Posthoc: a={predictor.posthoc_a:.4f}, b={predictor.posthoc_b:.4f}, c={predictor.posthoc_c:.5f}")
    print(f"{'actual':>8} {'predicted':>10} {'category':>10}  lgb/xgb/cat/catrmse")
    for _, r in sample.iterrows():
        record = {col: r[col] for col in ALL_INPUT_COLS if col in r.index}
        out    = predictor.predict(record)
        bms    = out["base_model_scores"]
        print(
            f"{r[config.TARGET]:8.4f} {out['flood_risk_score']:10.4f} "
            f"{out['risk_category']:>10}  "
            f"{bms['lgb']:.4f}/{bms['xgb']:.4f}/{bms['cat']:.4f}/{bms['catrmse']:.4f}"
        )
