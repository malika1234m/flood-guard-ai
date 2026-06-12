"""
Production training pipeline for the flood-risk model.

Evolution of `solution_v10.py` (Initial Round): same feature-engineering
philosophy and the same winning ideas (ensemble + Ridge meta-stack +
mean calibration), reduced from a 5-model / 10-fold / multi-seed /
pseudo-labeling search to a 3-model / 5-fold ensemble with fixed,
well-chosen hyperparameters so it (a) trains in minutes, and (b) produces
artifacts that `src/inference.py` can load to score a single new record.

Logs params/metrics/artifacts to MLflow (local file store under
`mlruns/`) for experiment tracking, model versioning, and performance
comparison across runs.
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
from sklearn.linear_model import Ridge
from sklearn.metrics import explained_variance_score, mean_absolute_error
from sklearn.model_selection import KFold

from . import config
from .data_validation import validate_training_data
from .features import FeatureEngineer

LGB_PARAMS = dict(
    objective="regression_l1", metric="mae",
    learning_rate=0.025, num_leaves=96, max_depth=8,
    min_child_samples=25, feature_fraction=0.75, bagging_fraction=0.8,
    bagging_freq=5, reg_alpha=0.3, reg_lambda=0.3,
    verbose=-1, n_jobs=-1, seed=config.RANDOM_STATE,
)

CAT_PARAMS = dict(
    loss_function="MAE", iterations=2000,
    learning_rate=0.04, depth=7, l2_leaf_reg=3.0,
    bagging_temperature=0.5, random_strength=0.5, border_count=128,
    early_stopping_rounds=100, verbose=False, random_seed=config.RANDOM_STATE,
)

XGB_PARAMS = dict(
    objective="reg:squarederror", n_estimators=1500,
    learning_rate=0.04, max_depth=6, min_child_weight=8,
    subsample=0.8, colsample_bytree=0.7, reg_alpha=0.3, reg_lambda=1.0,
    gamma=0.1, early_stopping_rounds=100,
    eval_metric="rmse", verbosity=0, random_state=config.RANDOM_STATE, n_jobs=-1,
)


def custom_metric(y_true, y_pred) -> float:
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    mae = mean_absolute_error(y_true, y_pred)
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    base = 0.5 * mae + 0.5 * rmse
    ev = explained_variance_score(y_true, y_pred)
    return base * (1 + max(0.0, 1.0 - ev))


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
        y = train_df[config.TARGET].to_numpy(dtype=np.float32)
        Xv = X.to_numpy()
        print(f"Feature matrix: {Xv.shape}  ({time.time() - t0:.1f}s elapsed)")

        mlflow.log_params({
            "n_features": Xv.shape[1], "n_rows": Xv.shape[0],
            "n_folds": config.N_FOLDS,
        })
        mlflow.log_params({f"lgb_{k}": v for k, v in LGB_PARAMS.items()})
        mlflow.log_params({f"cat_{k}": v for k, v in CAT_PARAMS.items()})
        mlflow.log_params({f"xgb_{k}": v for k, v in XGB_PARAMS.items()})

        kf = KFold(n_splits=config.N_FOLDS, shuffle=True, random_state=config.RANDOM_STATE)
        oof = {"lgb": np.zeros(len(y)), "cat": np.zeros(len(y)), "xgb": np.zeros(len(y))}
        fold_models: dict[str, list] = {"lgb": [], "cat": [], "xgb": []}

        for fold, (tr_idx, va_idx) in enumerate(kf.split(Xv)):
            print(f"\n--- Fold {fold + 1}/{config.N_FOLDS} ---")
            Xtr, Xva = Xv[tr_idx], Xv[va_idx]
            ytr, yva = y[tr_idx], y[va_idx]

            dtr = lgb.Dataset(Xtr, label=ytr, feature_name=fe.feature_cols)
            dva = lgb.Dataset(Xva, label=yva, feature_name=fe.feature_cols, reference=dtr)
            m_lgb = lgb.train(
                LGB_PARAMS, dtr, num_boost_round=2500, valid_sets=[dva],
                callbacks=[lgb.early_stopping(100, verbose=False), lgb.log_evaluation(-1)],
            )
            oof["lgb"][va_idx] = m_lgb.predict(Xva)
            fold_models["lgb"].append(m_lgb)

            m_cat = cb.CatBoostRegressor(**CAT_PARAMS)
            m_cat.fit(Xtr, ytr, eval_set=(Xva, yva), use_best_model=True)
            oof["cat"][va_idx] = m_cat.predict(Xva)
            fold_models["cat"].append(m_cat)

            m_xgb = xgb.XGBRegressor(**XGB_PARAMS)
            m_xgb.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)
            oof["xgb"][va_idx] = m_xgb.predict(Xva)
            fold_models["xgb"].append(m_xgb)

            fold_metrics = {name: custom_metric(yva, oof[name][va_idx]) for name in oof}
            print(f"Fold {fold + 1} metrics: " + ", ".join(f"{k}={v:.5f}" for k, v in fold_metrics.items()))
            mlflow.log_metrics({f"fold{fold + 1}_{k}": v for k, v in fold_metrics.items()})

        print("\n=== OOF metrics ===")
        for name in oof:
            m = custom_metric(y, oof[name])
            print(f"  {name}: {m:.5f}")
            mlflow.log_metric(f"oof_{name}", m)

        # Ridge meta-learner stacking (the v10 idea that produced our best calibration)
        oof_stack = np.column_stack(list(oof.values()))
        meta = Ridge(alpha=1.0, positive=True)
        meta.fit(oof_stack, y)
        meta_oof = meta.predict(oof_stack)
        ensemble_metric = custom_metric(y, meta_oof)
        print(f"\nEnsemble (Ridge stack) OOF: {ensemble_metric:.5f}")
        print(f"Ridge weights: {dict(zip(oof.keys(), meta.coef_.round(4)))}")
        mlflow.log_metric("oof_ensemble", ensemble_metric)

        # Mean-calibration shift (key insight from Initial Round analysis)
        train_mean = float(y.mean())
        pred_mean = float(meta_oof.mean())
        shift = train_mean - pred_mean
        calibrated_oof = np.clip(meta_oof + shift, 0.0, 1.0)
        calibrated_metric = custom_metric(y, calibrated_oof)
        print(f"Calibration shift: {shift:+.5f}  ->  calibrated OOF: {calibrated_metric:.5f}")
        mlflow.log_metric("oof_calibrated", calibrated_metric)
        mlflow.log_metric("calibration_shift", shift)

        # Feature importances (gain) from fold-0 LightGBM, for the LLM advisor / UI
        importances = dict(zip(fe.feature_cols, fold_models["lgb"][0].feature_importance(importance_type="gain")))
        top_features = sorted(importances.items(), key=lambda kv: -kv[1])[:25]

        # ── Save artifacts ──────────────────────────────────────────────
        config.MODEL_DIR.mkdir(parents=True, exist_ok=True)
        fe.save(config.MODEL_DIR / "feature_engineer.joblib")
        joblib.dump(fold_models["lgb"], config.MODEL_DIR / "lgb_models.joblib")
        joblib.dump(fold_models["cat"], config.MODEL_DIR / "cat_models.joblib")
        joblib.dump(fold_models["xgb"], config.MODEL_DIR / "xgb_models.joblib")
        joblib.dump(meta, config.MODEL_DIR / "meta_model.joblib")

        metadata = {
            "version": config.MODEL_VERSION,
            "trained_at": pd.Timestamp.now().isoformat(),
            "n_features": int(Xv.shape[1]),
            "n_rows": int(Xv.shape[0]),
            "n_folds": config.N_FOLDS,
            "metrics": {
                "oof_lgb": custom_metric(y, oof["lgb"]),
                "oof_cat": custom_metric(y, oof["cat"]),
                "oof_xgb": custom_metric(y, oof["xgb"]),
                "oof_ensemble": ensemble_metric,
                "oof_calibrated": calibrated_metric,
            },
            "calibration_shift": shift,
            "train_target_mean": train_mean,
            "ridge_weights": {k: float(v) for k, v in zip(oof.keys(), meta.coef_)},
            "ridge_intercept": float(meta.intercept_),
            "top_features": [(name, float(val)) for name, val in top_features],
            "categorical_options": fe.categorical_options(train_df),
            "district_defaults": fe.district_defaults(),
            "advanced_field_global_defaults": fe.global_means,
            "training_seconds": time.time() - t0,
        }
        meta_path = config.MODEL_DIR / "metadata.json"
        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2, default=float)
        mlflow.log_artifact(str(meta_path))

        print(f"\nSaved model artifacts to {config.MODEL_DIR}")
        print(f"Total time: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
