"""
Generate competition submission CSV from the trained v2 model.

Usage:  python scripts/generate_submission.py
Output: submission_v2.csv  (record_id, flood_risk_score)
"""
import json
import time

import joblib
import numpy as np
import pandas as pd

from src import config
from src.features import FeatureEngineer

t0 = time.time()
model_dir = config.MODEL_DIR

print(f"Loading v2 artifacts from {model_dir} ...")
fe            = FeatureEngineer.load(model_dir / "feature_engineer.joblib")
qt            = joblib.load(model_dir / "rank_gauss.joblib")
lgb_models    = joblib.load(model_dir / "lgb_models.joblib")
xgb1_models   = joblib.load(model_dir / "xgb1_models.joblib")
xgb2_models   = joblib.load(model_dir / "xgb2_models.joblib")
cat1_models   = joblib.load(model_dir / "cat1_models.joblib")
cat2_models   = joblib.load(model_dir / "cat2_models.joblib")
catrmse_models = joblib.load(model_dir / "catrmse_models.joblib")

with open(model_dir / "meta_weights.json") as f:
    mw = json.load(f)
model_names = mw["model_names"]
weights = np.array(mw["weights"])

with open(model_dir / "posthoc.json") as f:
    ph = json.load(f)

with open(model_dir / "metadata.json") as f:
    meta = json.load(f)

train_mean = float(meta["train_target_mean"])

print(f"Loading test.csv ...")
test_df = pd.read_csv(config.TEST_PATH)
record_ids = test_df[config.ID_COL].copy()
print(f"Test rows: {len(test_df)}")

print("Transforming features ...")
X_test = fe.transform(test_df).to_numpy(dtype=np.float64)
print(f"Feature matrix: {X_test.shape}")

def inv_rg(preds: np.ndarray) -> np.ndarray:
    return np.clip(qt.inverse_transform(preds.reshape(-1, 1)).flatten(), 0.0, 1.0)

def family_pred(models, X):
    return inv_rg(np.mean([m.predict(X) for m in models], axis=0))

print("Running 6 model families ...")
base = {
    "lgb":     family_pred(lgb_models,    X_test),
    "xgb1":    family_pred(xgb1_models,   X_test),
    "xgb2":    family_pred(xgb2_models,   X_test),
    "cat1":    family_pred(cat1_models,   X_test),
    "cat2":    family_pred(cat2_models,   X_test),
    "catrmse": family_pred(catrmse_models, X_test),
}

print("Applying SLSQP blend weights ...")
oof_matrix = np.column_stack([base[m] for m in model_names])
blended = np.clip(oof_matrix @ weights, 0.0, 1.0)
print(f"  blended mean: {blended.mean():.4f}")

print("Applying posthoc transform ...")
a, b, c = float(ph["a"]), float(ph["b"]), float(ph["c"])
final = np.clip(a * np.power(np.clip(blended, 1e-6, None), b) + c, 0.0, 1.0)
print(f"  posthoc mean: {final.mean():.4f}")

# Mean calibration: align test prediction mean with training target mean
shift = train_mean - float(final.mean())
final_cal = np.clip(final + shift, 0.0, 1.0)
print(f"  calibrated mean: {final_cal.mean():.4f}  (train mean: {train_mean:.4f}, shift: {shift:+.5f})")

out_path = config.ROOT_DIR / "submission_v2.csv"
submission = pd.DataFrame({
    config.ID_COL: record_ids,
    config.TARGET: np.round(final_cal, 6),
})
submission.to_csv(out_path, index=False)

print(f"\nSaved → {out_path}")
print(f"Rows: {len(submission)}  |  Score range: [{final_cal.min():.4f}, {final_cal.max():.4f}]")
print(f"Total time: {time.time() - t0:.1f}s")
