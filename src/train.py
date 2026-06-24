"""
Production training pipeline v2.

Upgrades over v1:
  - Real competition metric: (0.583210·MAE + 1.122681·RMSE)·(1+0.045804·max(0,1-EV))
  - RankGauss: QuantileTransformer(normal) applied to target before each model
  - GroupKFold on topographic clusters (k=50) to prevent spatial leakage
  - 6-model ensemble: LGB·1 MAE, XGB·2 MAE (diff seeds), CAT·2 MAE (diff seeds) + CAT·1 RMSE
  - SLSQP multi-start metric-optimised blending (30 random starts)
  - L-BFGS-B post-hoc power transform  a·pred^b + c
  - Saves: rank_gauss.joblib, meta_weights.json, posthoc.json + district_profiles.json
"""
import json
import time

import joblib
import lightgbm as lgb
import catboost as cb
import xgboost as xgb
import mlflow
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.metrics import explained_variance_score, mean_absolute_error
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import QuantileTransformer

from . import config
from .data_validation import validate_training_data
from .features import FeatureEngineer

# Real district centroids (same as scripts/build_district_profiles.py)
_DISTRICT_CENTROIDS: dict[str, tuple[float, float]] = {
    "Ampara": (7.30, 81.68), "Anuradhapura": (8.31, 80.41),
    "Badulla": (6.99, 81.06), "Batticaloa": (7.71, 81.70),
    "Colombo": (6.93, 79.86), "Galle": (6.05, 80.22),
    "Gampaha": (7.09, 80.00), "Hambantota": (6.12, 81.12),
    "Jaffna": (9.66, 80.02), "Kalutara": (6.58, 80.00),
    "Kandy": (7.29, 80.63), "Kegalle": (7.25, 80.35),
    "Kilinochchi": (9.40, 80.40), "Kurunegala": (7.49, 80.36),
    "Mannar": (8.98, 79.90), "Matale": (7.47, 80.62),
    "Matara": (5.95, 80.54), "Monaragala": (6.87, 81.35),
    "Mullaitivu": (9.27, 80.81), "Nuwara Eliya": (6.97, 80.77),
    "Polonnaruwa": (7.94, 81.00), "Puttalam": (8.04, 79.84),
    "Ratnapura": (6.68, 80.40), "Trincomalee": (8.59, 81.20),
    "Vavuniya": (8.75, 80.50),
}

_DP_NUMERIC = [
    "elevation_m", "distance_to_river_m", "population_density_per_km2",
    "built_up_percent", "rainfall_7d_mm", "monthly_rainfall_mm",
    "drainage_index", "ndvi", "ndwi", "historical_flood_count",
    "infrastructure_score", "nearest_hospital_km", "nearest_evac_km",
    "seasonal_index", "terrain_roughness_index",
    "socioeconomic_status_index", "extreme_weather_index",
]
_DP_CAT = ["landcover", "soil_type", "water_supply", "electricity",
           "road_quality", "urban_rural", "water_presence_flag"]

# ── Model hyperparameters ─────────────────────────────────────────────────
LGB_PARAMS = dict(
    objective="regression_l1", metric="mae",
    learning_rate=0.025, num_leaves=96, max_depth=8,
    min_child_samples=25, feature_fraction=0.75, bagging_fraction=0.8,
    bagging_freq=5, reg_alpha=0.3, reg_lambda=0.3,
    verbose=-1, n_jobs=-1, seed=config.RANDOM_STATE,
)

XGB_MAE_PARAMS_BASE = dict(
    objective="reg:absoluteerror",  # MAE loss (was RMSE in v1 — fixed)
    n_estimators=1500, learning_rate=0.04, max_depth=6,
    min_child_weight=8, subsample=0.8, colsample_bytree=0.7,
    reg_alpha=0.3, reg_lambda=1.0, gamma=0.1,
    early_stopping_rounds=100, eval_metric="mae",
    verbosity=0, n_jobs=-1,
)

CAT_MAE_PARAMS_BASE = dict(
    loss_function="MAE", iterations=2000,
    learning_rate=0.04, depth=7, l2_leaf_reg=3.0,
    bagging_temperature=0.5, random_strength=0.5, border_count=128,
    early_stopping_rounds=100, verbose=False,
)

CAT_RMSE_PARAMS = dict(
    loss_function="RMSE", iterations=2000,
    learning_rate=0.04, depth=7, l2_leaf_reg=3.0,
    bagging_temperature=0.5, random_strength=0.5, border_count=128,
    early_stopping_rounds=100, verbose=False, random_seed=123,
)

# ── Competition metric (reverse-engineered) ───────────────────────────────
def custom_metric(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true, y_pred = np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)
    mae  = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    ev   = float(explained_variance_score(y_true, y_pred))
    return (0.583210 * mae + 1.122681 * rmse) * (1.0 + 0.045804 * max(0.0, 1.0 - ev))


# ── SLSQP weight optimisation ─────────────────────────────────────────────
def _optimise_weights(oof_matrix: np.ndarray, y: np.ndarray, n_starts: int = 30) -> np.ndarray:
    n_models = oof_matrix.shape[1]
    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
    bounds = [(0.0, 1.0)] * n_models

    def obj(w):
        blended = np.clip(oof_matrix @ np.clip(w, 0, None), 0, 1)
        return custom_metric(y, blended)

    best_score = np.inf
    best_w = np.ones(n_models) / n_models
    rng = np.random.RandomState(42)
    for _ in range(n_starts):
        w0 = rng.dirichlet(np.ones(n_models))
        res = minimize(obj, w0, method="SLSQP", bounds=bounds,
                       constraints=constraints,
                       options={"maxiter": 500, "ftol": 1e-9})
        if res.success and res.fun < best_score:
            best_score = res.fun
            best_w = res.x
    w = np.clip(best_w, 0, None)
    return w / w.sum()


# ── L-BFGS-B posthoc power transform ─────────────────────────────────────
def _optimise_posthoc(meta_pred: np.ndarray, y: np.ndarray, n_starts: int = 10) -> tuple[float, float, float]:
    bounds = [(0.8, 1.2), (0.5, 2.0), (-0.05, 0.05)]

    def obj(params):
        a, b, c = params
        pred = a * np.power(np.clip(meta_pred, 1e-6, None), b) + c
        return custom_metric(y, np.clip(pred, 0, 1))

    best_score = obj([1.0, 1.0, 0.0])
    best_params = [1.0, 1.0, 0.0]
    rng = np.random.RandomState(7)
    for _ in range(n_starts):
        p0 = [rng.uniform(0.8, 1.2), rng.uniform(0.5, 2.0), rng.uniform(-0.05, 0.05)]
        res = minimize(obj, p0, method="L-BFGS-B", bounds=bounds,
                       options={"maxiter": 200})
        if res.fun < best_score:
            best_score = res.fun
            best_params = res.x.tolist()
    return float(best_params[0]), float(best_params[1]), float(best_params[2])


def main():
    t0 = time.time()
    mlflow.set_tracking_uri(f"file://{config.ROOT_DIR / 'mlruns'}")
    mlflow.set_experiment("flood-risk-production")

    print("Loading & validating training data...")
    train_df = pd.read_csv(config.TRAIN_PATH)
    report = validate_training_data(train_df, "train")
    print(report)
    if not report.is_valid:
        raise SystemExit("Training data failed validation, aborting.")

    with mlflow.start_run(run_name=f"ensemble_{config.MODEL_VERSION}"):
        fe = FeatureEngineer()
        print("Fitting feature pipeline...")
        X = fe.fit_transform(train_df)
        y = train_df[config.TARGET].to_numpy(dtype=np.float64)
        Xv = X.to_numpy(dtype=np.float64)
        print(f"Feature matrix: {Xv.shape}  ({time.time() - t0:.1f}s elapsed)")

        # RankGauss: normalise target to N(0,1) before model training
        qt = QuantileTransformer(output_distribution="normal", random_state=42)
        y_rg = qt.fit_transform(y.reshape(-1, 1)).flatten()

        mlflow.log_params({"n_features": Xv.shape[1], "n_rows": Xv.shape[0], "n_folds": config.N_FOLDS})

        # GroupKFold on topographic clusters (set by FeatureEngineer.fit_transform)
        groups = fe.train_topo_groups
        gkf = GroupKFold(n_splits=config.N_FOLDS)
        splits = list(gkf.split(Xv, y, groups=groups))

        MODEL_NAMES = ["lgb", "xgb1", "xgb2", "cat1", "cat2", "catrmse"]
        oof: dict[str, np.ndarray] = {m: np.zeros(len(y)) for m in MODEL_NAMES}
        fold_models: dict[str, list] = {m: [] for m in MODEL_NAMES}

        for fold, (tr_idx, va_idx) in enumerate(splits):
            print(f"\n--- Fold {fold + 1}/{config.N_FOLDS} ---")
            Xtr, Xva = Xv[tr_idx], Xv[va_idx]
            ytr_rg, yva_rg = y_rg[tr_idx], y_rg[va_idx]
            yva = y[va_idx]

            def inv_rg(pred: np.ndarray) -> np.ndarray:
                return np.clip(qt.inverse_transform(pred.reshape(-1, 1)).flatten(), 0, 1)

            # LGB (MAE loss on RankGauss target)
            dtr = lgb.Dataset(Xtr, label=ytr_rg, feature_name=fe.feature_cols)
            dva = lgb.Dataset(Xva, label=yva_rg, feature_name=fe.feature_cols, reference=dtr)
            m_lgb = lgb.train(
                LGB_PARAMS, dtr, num_boost_round=2500, valid_sets=[dva],
                callbacks=[lgb.early_stopping(100, verbose=False), lgb.log_evaluation(-1)],
            )
            oof["lgb"][va_idx] = inv_rg(m_lgb.predict(Xva))
            fold_models["lgb"].append(m_lgb)

            # XGB1 (MAE, seed 42)
            m_xgb1 = xgb.XGBRegressor(**XGB_MAE_PARAMS_BASE, random_state=42)
            m_xgb1.fit(Xtr, ytr_rg, eval_set=[(Xva, yva_rg)], verbose=False)
            oof["xgb1"][va_idx] = inv_rg(m_xgb1.predict(Xva))
            fold_models["xgb1"].append(m_xgb1)

            # XGB2 (MAE, seed 789 — diversity)
            m_xgb2 = xgb.XGBRegressor(**XGB_MAE_PARAMS_BASE, random_state=789)
            m_xgb2.fit(Xtr, ytr_rg, eval_set=[(Xva, yva_rg)], verbose=False)
            oof["xgb2"][va_idx] = inv_rg(m_xgb2.predict(Xva))
            fold_models["xgb2"].append(m_xgb2)

            # CAT1 (MAE, seed 42)
            m_cat1 = cb.CatBoostRegressor(**CAT_MAE_PARAMS_BASE, random_seed=42)
            m_cat1.fit(Xtr, ytr_rg, eval_set=(Xva, yva_rg), use_best_model=True)
            oof["cat1"][va_idx] = inv_rg(m_cat1.predict(Xva))
            fold_models["cat1"].append(m_cat1)

            # CAT2 (MAE, seed 789 — diversity)
            m_cat2 = cb.CatBoostRegressor(**CAT_MAE_PARAMS_BASE, random_seed=789)
            m_cat2.fit(Xtr, ytr_rg, eval_set=(Xva, yva_rg), use_best_model=True)
            oof["cat2"][va_idx] = inv_rg(m_cat2.predict(Xva))
            fold_models["cat2"].append(m_cat2)

            # CATRMSE (RMSE loss — captures different error surface)
            m_catrmse = cb.CatBoostRegressor(**CAT_RMSE_PARAMS)
            m_catrmse.fit(Xtr, ytr_rg, eval_set=(Xva, yva_rg), use_best_model=True)
            oof["catrmse"][va_idx] = inv_rg(m_catrmse.predict(Xva))
            fold_models["catrmse"].append(m_catrmse)

            fold_metrics = {name: custom_metric(yva, oof[name][va_idx]) for name in MODEL_NAMES}
            print("  " + ", ".join(f"{k}={v:.5f}" for k, v in fold_metrics.items()))
            mlflow.log_metrics({f"fold{fold+1}_{k}": v for k, v in fold_metrics.items()})

        print("\n=== OOF metrics ===")
        for name in MODEL_NAMES:
            m = custom_metric(y, oof[name])
            print(f"  {name}: {m:.5f}")
            mlflow.log_metric(f"oof_{name}", m)

        # SLSQP metric-optimised blending (30 random starts)
        print("\nOptimising SLSQP blend weights...")
        oof_matrix = np.column_stack([oof[m] for m in MODEL_NAMES])
        meta_weights = _optimise_weights(oof_matrix, y, n_starts=30)
        meta_pred = np.clip(oof_matrix @ meta_weights, 0, 1)
        blend_metric = custom_metric(y, meta_pred)
        print(f"SLSQP blend OOF: {blend_metric:.5f}")
        print(f"Weights: {dict(zip(MODEL_NAMES, meta_weights.round(4)))}")
        mlflow.log_metric("oof_blend", blend_metric)

        # L-BFGS-B posthoc power transform  a·pred^b + c
        print("Optimising posthoc transform...")
        a_opt, b_opt, c_opt = _optimise_posthoc(meta_pred, y)
        final_pred = np.clip(a_opt * np.power(np.clip(meta_pred, 1e-6, None), b_opt) + c_opt, 0, 1)
        posthoc_metric = custom_metric(y, final_pred)
        print(f"Posthoc OOF: {posthoc_metric:.5f}  (a={a_opt:.4f}, b={b_opt:.4f}, c={c_opt:.5f})")
        mlflow.log_metric("oof_posthoc", posthoc_metric)
        mlflow.log_metrics({"posthoc_a": a_opt, "posthoc_b": b_opt, "posthoc_c": c_opt})

        # Feature importances (LGB fold-0) for the AI advisor / UI
        importances = dict(zip(fe.feature_cols, fold_models["lgb"][0].feature_importance(importance_type="gain")))
        top_features = sorted(importances.items(), key=lambda kv: -kv[1])[:25]

        # ── Save artifacts ──────────────────────────────────────────────
        model_dir = config.MODEL_DIR
        model_dir.mkdir(parents=True, exist_ok=True)

        fe.save(model_dir / "feature_engineer.joblib")
        joblib.dump(qt,                    model_dir / "rank_gauss.joblib")
        joblib.dump(fold_models["lgb"],    model_dir / "lgb_models.joblib")
        joblib.dump(fold_models["xgb1"],   model_dir / "xgb1_models.joblib")
        joblib.dump(fold_models["xgb2"],   model_dir / "xgb2_models.joblib")
        joblib.dump(fold_models["cat1"],   model_dir / "cat1_models.joblib")
        joblib.dump(fold_models["cat2"],   model_dir / "cat2_models.joblib")
        joblib.dump(fold_models["catrmse"], model_dir / "catrmse_models.joblib")

        with open(model_dir / "meta_weights.json", "w") as f:
            json.dump({"model_names": MODEL_NAMES, "weights": meta_weights.tolist()}, f, indent=2)

        with open(model_dir / "posthoc.json", "w") as f:
            json.dump({"a": a_opt, "b": b_opt, "c": c_opt}, f, indent=2)

        # District profiles (needed by the API)
        profiles: dict[str, dict] = {}
        for district, grp in train_df.groupby("district"):
            p: dict = {}
            centroid = _DISTRICT_CENTROIDS.get(str(district))
            if centroid:
                p["latitude"], p["longitude"] = centroid
            for col in _DP_NUMERIC:
                p[col] = round(float(grp[col].mean()), 4)
            for col in _DP_CAT:
                p[col] = grp[col].mode().iloc[0]
            profiles[str(district)] = p
        with open(model_dir / "district_profiles.json", "w") as f:
            json.dump(profiles, f, indent=2, sort_keys=True)

        train_mean = float(y.mean())
        pred_mean  = float(final_pred.mean())

        metadata = {
            "version":         config.MODEL_VERSION,
            "trained_at":      pd.Timestamp.now().isoformat(),
            "n_features":      int(Xv.shape[1]),
            "n_rows":          int(Xv.shape[0]),
            "n_folds":         config.N_FOLDS,
            "model_names":     MODEL_NAMES,
            "blend_weights":   dict(zip(MODEL_NAMES, meta_weights.tolist())),
            "posthoc":         {"a": a_opt, "b": b_opt, "c": c_opt},
            "train_target_mean": train_mean,
            "pred_mean":       pred_mean,
            "metrics": {
                **{f"oof_{m}": custom_metric(y, oof[m]) for m in MODEL_NAMES},
                "oof_blend":   blend_metric,
                "oof_posthoc": posthoc_metric,
            },
            "top_features":    [(name, float(val)) for name, val in top_features],
            "categorical_options": fe.categorical_options(train_df),
            "district_defaults":   fe.district_defaults(),
            "advanced_field_global_defaults": fe.global_means,
            "training_seconds": time.time() - t0,
        }
        meta_path = model_dir / "metadata.json"
        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2, default=float)
        mlflow.log_artifact(str(meta_path))

        print(f"\nSaved model artifacts to {model_dir}")
        print(f"Final OOF: {posthoc_metric:.5f}  (train mean: {train_mean:.4f}, pred mean: {pred_mean:.4f})")
        print(f"Total time: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
