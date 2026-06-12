"""
FloodRiskPredictor: loads the saved `models/v1/` artifacts and scores a
single new record end-to-end, replicating `train.py`'s ensemble +
Ridge meta-stack + mean-calibration pipeline for live inference.
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

# All raw fields the predictor accepts from a request/record dict.
ALL_INPUT_COLS = (
    config.RAW_NUMERIC_COLS
    + config.RAW_CAT_COLS
    + list(config.EVENT_DEFAULTS.keys())
    + list(config.QMAP_SOURCE.keys())
    + config.ADVANCED_COLS
)

# Fields that must be coerced to numeric (None -> NaN) before they hit
# the feature pipeline.
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
        self.lgb_models = joblib.load(model_dir / "lgb_models.joblib")
        self.cat_models = joblib.load(model_dir / "cat_models.joblib")
        self.xgb_models = joblib.load(model_dir / "xgb_models.joblib")
        self.meta_model = joblib.load(model_dir / "meta_model.joblib")
        with open(model_dir / "metadata.json") as f:
            self.metadata = json.load(f)
        self.calibration_shift = float(self.metadata["calibration_shift"])
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
    def _base_predictions(self, X: np.ndarray) -> dict[str, np.ndarray]:
        lgb_pred = np.mean([m.predict(X) for m in self.lgb_models], axis=0)
        cat_pred = np.mean([m.predict(X) for m in self.cat_models], axis=0)
        xgb_pred = np.mean([m.predict(X) for m in self.xgb_models], axis=0)
        return {"lgb": lgb_pred, "cat": cat_pred, "xgb": xgb_pred}

    # ── public API ───────────────────────────────────────────────────
    def predict(self, record: dict) -> dict:
        df = self._build_input_df(record)
        X = self.fe.transform(df).to_numpy()

        base = self._base_predictions(X)
        stack = np.column_stack([base["lgb"], base["cat"], base["xgb"]])
        raw_pred = float(self.meta_model.predict(stack)[0])
        calibrated = float(np.clip(raw_pred + self.calibration_shift, 0.0, 1.0))

        return {
            "flood_risk_score": round(calibrated, 4),
            "risk_category": config.risk_category(calibrated),
            "raw_score": round(raw_pred, 4),
            "calibration_shift": round(self.calibration_shift, 6),
            "base_model_scores": {k: round(float(v[0]), 4) for k, v in base.items()},
            "model_version": self.metadata["version"],
            "ood_flags": flag_out_of_distribution(record),
        }

    def feature_contributions(self, record: dict, top_n: int = 8) -> list[dict]:
        """Top globally-important features + this record's engineered
        values, used by the LLM advisor and the UI's "key factors" panel."""
        df = self._build_input_df(record)
        X = self.fe.transform(df)
        row = X.iloc[0]
        return [
            {"feature": name, "importance": round(importance, 2), "value": round(float(row.get(name, 0.0)), 4)}
            for name, importance in self.top_features[:top_n]
        ]


if __name__ == "__main__":
    predictor = FloodRiskPredictor()
    train_df = pd.read_csv(config.TRAIN_PATH)
    sample = train_df.sample(5, random_state=123)

    print(f"Calibration shift: {predictor.calibration_shift:+.6f}")
    print(f"{'actual':>8} {'predicted':>10} {'category':>10}  base (lgb/cat/xgb)")
    for _, r in sample.iterrows():
        record = {col: r[col] for col in ALL_INPUT_COLS if col in r.index}
        out = predictor.predict(record)
        base = out["base_model_scores"]
        print(
            f"{r[config.TARGET]:8.4f} {out['flood_risk_score']:10.4f} "
            f"{out['risk_category']:>10}  "
            f"{base['lgb']:.4f}/{base['cat']:.4f}/{base['xgb']:.4f}"
        )

    print("\nTop feature contributions for last sample:")
    for fc in predictor.feature_contributions(record):
        print(f"  {fc['feature']:<25} importance={fc['importance']:>10.2f}  value={fc['value']}")
