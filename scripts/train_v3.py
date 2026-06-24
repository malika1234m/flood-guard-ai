"""
FloodGuard AI — Competition Training Script v3
================================================
Architecture ported from KruthimaOps v703 (best LB: 0.382030).

Key upgrades over FloodGuard v2 (OOF ~0.38384):
  1. Target conflict resolution inside each CV fold (biggest single gain)
  2. Pseudo-labeling using submission_v2.csv as soft labels for test rows
  3. Multi-seed × 3 (seeds 42, 2024, 7) averaging for stability
  4. Value frequency count features (exposes synthetic grid density)
  5. Coordinate decimal-precision fingerprints (synthetic row indicator)
  6. Multi-scale grid target encodings (4 resolutions) + composite sigs
  7. L2-regularized metric-driven Level-2 stacker with intercept
  8. Post-hoc L-BFGS-B power transform  a·pred^b + c

Run:
    cd /path/to/flood-guard-ai
    python -m scripts.train_v3
"""

import os
import time
import warnings

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.metrics import (explained_variance_score, mean_absolute_error,
                             root_mean_squared_error)
from sklearn.model_selection import GroupKFold
from sklearn.neighbors import KNeighborsRegressor

import xgboost as xgb
import catboost as cb
import lightgbm as lgb

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────
ROOT      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR  = os.path.join(ROOT, "data")
OUT_DIR   = ROOT   # submission CSVs go in project root

PSEUDO_PATH = os.path.join(ROOT, "submission_v2.csv")   # best current submission

# ── Metric (reverse-engineered from KruthimaOps PathWeGo.txt, validated
#    against 12 real LB submissions, max error 0.001)
# LB = (0.645794·MAE + 0.535293·RMSE) · (1 + 0.613798·(1−EV))
# Stacker uses same constants scaled to the objective optimiser.
C_MAE  = 0.645794
C_RMSE = 0.535293
C_EV   = 0.613798

def competition_metric(y_true, y_pred):
    y_true = np.asarray(y_true, float)
    y_pred = np.asarray(y_pred, float)
    mae  = mean_absolute_error(y_true, y_pred)
    rmse = float(root_mean_squared_error(y_true, y_pred))
    ev   = explained_variance_score(y_true, y_pred)
    return (C_MAE * mae + C_RMSE * rmse) * (1.0 + C_EV * max(0.0, 1.0 - ev))

# ── Config ─────────────────────────────────────────────────────────────────
SEEDS   = [42, 2024, 7]
N_FOLDS = 5

# Categorical columns for CatBoost
CAT_FEATURES = [
    "district", "landcover", "soil_type", "water_supply",
    "electricity", "road_quality", "urban_rural",
    "water_presence_flag", "flood_occurrence_current_event",
    "is_good_to_live", "reason_not_good_to_live", "downstream_risk_count",
]

# Columns used for target-encoding (produces _target_enc, _q25, _q75, _cnt)
TARGET_ENC_COLS = [
    "district", "grid_id",
    "downstream_sig", "downstream_quad_sig", "infra_deficit_sig",
    "landcover", "soil_type", "water_supply", "electricity", "road_quality",
    "downstream_risk_count",
    "grid_id_100", "grid_id_050", "grid_id_025", "grid_id_012",
]
STD_ENC_COLS = ["district", "downstream_sig"]

# Smoothing for Bayesian target encoding
SMOOTHING = 10

# ── Model hyperparameters (identical to v703) ──────────────────────────────
MODEL_NAMES = ["XGB-MAE-1(d7)", "CAT-MAE-1(d5)", "CAT-MAE-2(d5)",
               "CAT-RMSE(d5)",  "LGB-MAE(d5)",   "XGB-MAE-2(d5)"]

# ─────────────────────────────────────────────────────────────────────────────
print("=" * 75)
print("  FLOODGUARD AI v3 — KruthimaOps v703 Architecture")
print("=" * 75)

# ── 1. LOAD & DEDUP ──────────────────────────────────────────────────────────
print("\n[LOAD] Reading data...")
train_df = pd.read_csv(os.path.join(DATA_DIR, "train.csv"))
test_df  = pd.read_csv(os.path.join(DATA_DIR, "test.csv"))
train_df = train_df.drop_duplicates()
print(f"  Train: {train_df.shape}  Test: {test_df.shape}")

# ── 2. PRECISION FINGERPRINTS (synthetic-row indicator) ──────────────────────
print("\n[FEAT] Coordinate decimal-precision fingerprints...")
for df in [train_df, test_df]:
    df["lat_decimal_len"] = df["latitude"].apply(
        lambda x: len(str(x).split(".")[1]) if "." in str(x) and str(x).lower() != "nan" else 0)
    df["lon_decimal_len"] = df["longitude"].apply(
        lambda x: len(str(x).split(".")[1]) if "." in str(x) and str(x).lower() != "nan" else 0)

# ── 3. VALUE FREQUENCY COUNT FEATURES (synthetic grid density) ───────────────
print("\n[FEAT] Value frequency count features...")
FREQ_COLS = ["latitude", "longitude", "elevation_m", "distance_to_river_m",
             "rainfall_7d_mm", "monthly_rainfall_mm", "inundation_area_sqm"]
_raw = pd.concat(
    [train_df[[c for c in FREQ_COLS if c in train_df.columns]],
     test_df[[c for c in FREQ_COLS if c in test_df.columns]]],
    ignore_index=True,
)
for col in FREQ_COLS:
    if col not in _raw.columns:
        continue
    freq_map = _raw[col].value_counts().to_dict()
    for df in [train_df, test_df]:
        if col in df.columns:
            df[f"{col}_freq"] = df[col].map(freq_map).fillna(0).astype(float)
    print(f"  {col}_freq: {len(freq_map):,} unique vals, max_freq={max(freq_map.values())}")

# ── 4. PSEUDO-LABELING ───────────────────────────────────────────────────────
print(f"\n[SEMI] Pseudo-labeling from {PSEUDO_PATH}...")
train_df["is_pseudo"] = 0
test_df["is_pseudo"]  = 0

if os.path.exists(PSEUDO_PATH):
    pseudo_sub = pd.read_csv(PSEUDO_PATH)
    test_pseudo = test_df.merge(pseudo_sub, on="record_id", how="left")
    pseudo_rows = test_pseudo.copy()
    pseudo_rows["is_pseudo"] = 1
    train_df = pd.concat([train_df, pseudo_rows], ignore_index=True)
    print(f"  Added {len(pseudo_rows):,} pseudo-labeled test rows (mean={pseudo_sub['flood_risk_score'].mean():.4f})")
else:
    print("  WARNING: submission_v2.csv not found — skipping pseudo-labels")

# ── 5. GEOSPATIAL IMPUTATION ─────────────────────────────────────────────────
print("\n[IMPUTE] Geospatial imputation...")
_combined = pd.concat([
    train_df.drop(columns=["flood_risk_score"], errors="ignore"), test_df
], ignore_index=True)

coords_lookup = (
    _combined.groupby(["place_name", "district"])[["latitude", "longitude"]]
    .median().to_dict("index")
)
for df in [train_df, test_df]:
    mask = df["latitude"].isnull() & df["place_name"].notnull() & df["district"].notnull()
    for idx in df[mask].index:
        key = (df.loc[idx, "place_name"], df.loc[idx, "district"])
        if key in coords_lookup and not np.isnan(coords_lookup[key]["latitude"]):
            df.loc[idx, "latitude"]  = coords_lookup[key]["latitude"]
            df.loc[idx, "longitude"] = coords_lookup[key]["longitude"]

for col in ["elevation_m", "distance_to_river_m"]:
    donor = _combined.dropna(subset=["latitude", "longitude", col])
    knn   = KNeighborsRegressor(n_neighbors=3, weights="distance")
    knn.fit(donor[["latitude", "longitude"]], donor[col])
    for df in [train_df, test_df]:
        mm = df[col].isnull() & df["latitude"].notnull() & df["longitude"].notnull()
        if mm.any():
            df.loc[mm, col] = knn.predict(df.loc[mm, ["latitude", "longitude"]])

for col in ["elevation_m", "distance_to_river_m", "latitude", "longitude"]:
    for df in [train_df, test_df]:
        df[col] = df[col].fillna(df.groupby("district")[col].transform("median"))
        df[col] = df[col].fillna(train_df[col].median())

print("  Done.")

# ── 6. FEATURE ENGINEERING ───────────────────────────────────────────────────
print("\n[FEAT] Engineering features...")

_district_elev_std      = _combined.groupby("district")["elevation_m"].std().to_dict()
_landcover_mean_inund   = _combined.groupby("landcover")["inundation_area_sqm"].mean().to_dict()
_soil_infilt_map = {"Sandy": 0.8, "Loamy": 0.6, "Silty": 0.4, "Clay": 0.2, "Peaty": 0.1}
_cyclone_districts = {"Batticaloa", "Trincomalee", "Ampara", "Mullaitivu", "Jaffna"}
_wet_zone_districts = {"Colombo", "Gampaha", "Kalutara", "Galle", "Matara", "Ratnapura", "Kegalle"}


def engineer_features(df):
    df = df.copy()

    df["confirmed_severe_risk"] = (
        (df["flood_occurrence_current_event"].astype(str).str.strip().str.lower() == "yes") &
        (df["is_good_to_live"].astype(str).str.strip().str.lower() == "no") &
        (df["inundation_area_sqm"] > 0)
    ).astype(int)

    df["no_flood_confirmed"] = (
        (df["flood_occurrence_current_event"].astype(str).str.strip().str.lower() == "no") &
        (df["is_good_to_live"].astype(str).str.strip().str.lower() == "yes")
    ).astype(int)

    df["inundation_per_capita"] = df["inundation_area_sqm"] / (
        np.expm1(df["population_density_per_km2_log1p"]) + 1.0)

    has_reason = (~df["reason_not_good_to_live"].astype(str).str.strip().str.lower()
                  .isin(["nan", "none", "", "missing", "n/a"])).astype(int)
    df["downstream_risk_count"] = (
        (df["flood_occurrence_current_event"].astype(str).str.strip().str.lower() == "yes").astype(int)
        + (df["is_good_to_live"].astype(str).str.strip().str.lower() == "no").astype(int)
        + has_reason
        + (df["inundation_area_sqm"] > 0).astype(int)
    )

    df["downstream_sig"] = (
        df["flood_occurrence_current_event"].astype(str).str.strip() + "_" +
        df["is_good_to_live"].astype(str).str.strip() + "_" +
        df["reason_not_good_to_live"].astype(str).str.strip()
    )
    df["downstream_quad_sig"] = (
        df["flood_occurrence_current_event"].astype(str).str.strip() + "_" +
        df["is_good_to_live"].astype(str).str.strip() + "_" +
        df["reason_not_good_to_live"].astype(str).str.strip() + "_" +
        (df["inundation_area_sqm"] > 0).astype(int).astype(str)
    )
    df["infra_deficit_sig"] = (
        df["water_supply"].astype(str).str.strip() + "_" +
        df["electricity"].astype(str).str.strip() + "_" +
        df["road_quality"].astype(str).str.strip()
    )

    date_s = pd.to_datetime(df["generation_date"])
    df["month"]    = date_s.dt.month
    df["is_yala"]  = df["month"].isin([5, 6, 7, 8, 9]).astype(int)
    df["is_maha"]  = df["month"].isin([11, 12, 1]).astype(int)
    df["zone_code"] = df["district"].astype(str).map(
        lambda x: 1 if x in _wet_zone_districts else 2)
    df["monsoon_impact"] = (
        df["rainfall_7d_mm"] * df["is_yala"] * (df["zone_code"] == 1).astype(int)
        + df["rainfall_7d_mm"] * df["is_maha"] * (df["zone_code"] == 2).astype(int)
    )

    df["urban_runoff_potential"]  = df["rainfall_7d_mm"] * df["built_up_percent"] / (df["drainage_index"] + 1e-5)
    df["fluvial_risk_score_feat"] = df["rainfall_7d_mm"] / (df["distance_to_river_m"] + 1.0)
    df["soil_infiltration"]       = df["soil_type"].astype(str).map(_soil_infilt_map).fillna(0.4)
    df["soil_saturation_limit"]   = df["rainfall_7d_mm"] / (df["soil_infiltration"] + 0.1)
    df["pseudo_twi"]              = np.log1p((df["distance_to_river_m"] + 1.0) / (df["elevation_m"].clip(lower=0.0) + 1.0))
    df["flatness_index"]          = df["district"].astype(str).map(_district_elev_std).fillna(df["elevation_m"].std())
    df["in_cyclone_path"]         = df["district"].astype(str).map(lambda x: 1 if x in _cyclone_districts else 0)
    df["cyclone_vulnerability"]   = df["in_cyclone_path"] * df["extreme_weather_index"]
    df["slope_proxy"]             = df["elevation_m"] / (df["distance_to_river_m"] + 1.0)
    df["isolation_index"]         = np.log1p(df["nearest_hospital_km"]) + np.log1p(df["nearest_evac_km"])
    df["vulnerability"]           = df["isolation_index"] / (df["infrastructure_score"] + 1.0)
    df["elevation_divergence"]    = df["elevation_m"] - df["elevation_m_yeojohnson"]

    df["inundation_area_log"]        = np.log1p(df["inundation_area_sqm"])
    df["flood_occurrence_yes"]       = (df["flood_occurrence_current_event"].astype(str).str.strip().str.lower() == "yes").astype(int)
    df["inundation_flood_interaction"]= df["flood_occurrence_yes"] * df["inundation_area_log"]
    df["river_rain_interaction"]     = df["distance_to_river_m_log1p"] * df["rainfall_7d_mm_log1p"]
    df["river_monthly_exposure"]     = df["distance_to_river_m_log1p"] * df["monthly_rainfall_mm_log1p"]
    df["elev_rain_risk"]             = df["elevation_m_yeojohnson"] / (df["rainfall_7d_mm_log1p"] + 1e-6)
    df["water_signal"]               = df["ndwi_qmap"].clip(lower=0)
    df["drainage_deficit"]           = (df["rainfall_7d_mm_log1p"] + 1) * (1.0 - df["drainage_index_yeojohnson"].clip(0, 1))
    df["infra_resilience"]           = df["infrastructure_score"] / (df["population_density_per_km2_log1p"] + 1e-6)
    df["evacuation_difficulty"]      = df["nearest_hospital_km_log1p"] + df["nearest_evac_km_log1p"]
    df["inundation_density_risk"]    = df["inundation_area_log"] / (df["population_density_per_km2_log1p"] + 1e-6)
    df["terrain_veg_risk"]           = df["terrain_roughness_index"] * (1.0 - df["ndvi_qmap"].clip(-1, 1))
    df["flood_pressure"]             = df["extreme_weather_index"] * df["seasonal_index"].clip(lower=0)
    df["is_repeat_flood_zone"]       = (df["historical_flood_count"] > 2).astype(int)
    df["rain_spike_ratio"]           = df["rainfall_7d_mm"] / (df["monthly_rainfall_mm"] + 1e-6)
    df["confirmed_risk"]             = (
        (df["flood_occurrence_current_event"].astype(str).str.strip().str.lower() == "yes") &
        (df["is_good_to_live"].astype(str).str.strip().str.lower() == "no")
    ).astype(int)

    _lc_mean = df["landcover"].astype(str).map(_landcover_mean_inund).fillna(
        _combined["inundation_area_sqm"].mean())
    df["inundation_ratio"]         = df["inundation_area_sqm"] / (_lc_mean + 1.0)
    df["pooling_vulnerability"]    = df["ndwi_qmap"].clip(lower=0) * (1.0 - df["ndvi_qmap"].clip(-1, 1).clip(lower=0))
    df["soil_drainage_saturation"] = df["soil_saturation_limit"] * (1.0 - df["drainage_index_yeojohnson"].clip(0, 1))

    # Multi-scale spatial grids
    lat = df["latitude"].fillna(df["latitude"].median())
    lon = df["longitude"].fillna(df["longitude"].median())
    df["grid_id_100"] = (lat / 1.0).astype(int).astype(str) + "_" + (lon / 1.0).astype(int).astype(str)
    df["grid_id_050"] = (lat / 0.5).astype(int).astype(str) + "_" + (lon / 0.5).astype(int).astype(str)
    df["grid_id_025"] = (lat / 0.25).astype(int).astype(str) + "_" + (lon / 0.25).astype(int).astype(str)
    df["grid_id_012"] = (lat / 0.125).astype(int).astype(str) + "_" + (lon / 0.125).astype(int).astype(str)
    df["lat_bin"]  = (lat / 0.5).astype(int)
    df["lon_bin"]  = (lon / 0.5).astype(int)
    df["grid_id"]  = df["lat_bin"].astype(str) + "_" + df["lon_bin"].astype(str)

    df = df.drop(columns=["inundation_area_sqm", "month"], errors="ignore")
    return df


train_df = engineer_features(train_df)
test_df  = engineer_features(test_df)

# ── 7. FEATURE LISTS & DTYPE PREP ────────────────────────────────────────────
TARGET  = "flood_risk_score"
ID_COL  = "record_id"
DROP    = [ID_COL, "place_name", "is_synthetic", "generation_date", "is_pseudo"]
IGNORE  = DROP + [
    TARGET, "flood_occurrence_yes", "downstream_sig",
    "downstream_quad_sig", "infra_deficit_sig",
]
SPATIAL_HELPERS = ["lat_bin", "lon_bin", "grid_id",
                   "grid_id_100", "grid_id_050", "grid_id_025", "grid_id_012"]
DOWNSTREAM_COLS = [
    "confirmed_severe_risk", "no_flood_confirmed", "inundation_per_capita",
    "downstream_risk_count", "downstream_sig", "downstream_quad_sig",
    "confirmed_risk", "inundation_ratio", "flood_occurrence_yes",
    "inundation_flood_interaction", "inundation_density_risk",
]

BASE_FEATURES = [c for c in train_df.columns if c not in IGNORE and c not in SPATIAL_HELPERS]
CONFLICT_KEY_COLS = [c for c in BASE_FEATURES if c not in DOWNSTREAM_COLS]

print(f"\n[PREP] Base features: {len(BASE_FEATURES)}")

print("[PREP] Casting dtypes...")
cat_dtype_map = {}
for col in BASE_FEATURES:
    if col in CAT_FEATURES:
        train_df[col] = train_df[col].fillna("missing").astype(str)
        test_df[col]  = test_df[col].fillna("missing").astype(str)
        all_vals = sorted(set(train_df[col].unique()) | set(test_df[col].unique()))
        cdt = pd.CategoricalDtype(categories=all_vals, ordered=False)
        train_df[col] = train_df[col].astype(cdt)
        test_df[col]  = test_df[col].astype(cdt)
        cat_dtype_map[col] = cdt
    elif train_df[col].dtype in ["int64", "float64", "int32", "float32"]:
        med = train_df[col].median()
        train_df[col] = train_df[col].fillna(med)
        test_df[col]  = test_df[col].fillna(med)

cat_feature_names = [c for c in CAT_FEATURES if c in BASE_FEATURES]

# ── 8. GLOBAL STATS ──────────────────────────────────────────────────────────
y              = train_df[TARGET]
real_mask_bool = (train_df["is_pseudo"] == 0)
GLOBAL_MEAN    = float(y[real_mask_bool].mean())
GLOBAL_STD     = float(y[real_mask_bool].std())
GLOBAL_Q25     = float(y[real_mask_bool].quantile(0.25))
GLOBAL_Q75     = float(y[real_mask_bool].quantile(0.75))
GLOBAL_MEDIAN  = float(y[real_mask_bool].median())

original_y     = y[real_mask_bool].values
original_df    = train_df[real_mask_bool].reset_index(drop=True)
original_groups= original_df["grid_id"].values

gkf_l2 = GroupKFold(n_splits=N_FOLDS)

# ── 9. L2 METRIC-DRIVEN LEVEL-2 STACKER ─────────────────────────────────────
def fit_metric_stacker(X_meta, y_true, alpha=0.1):
    n = X_meta.shape[1]

    def loss_fn(params):
        w, b = params[:n], params[n]
        pred = np.clip(np.dot(X_meta, w) + b, 0.0, 1.0)
        return competition_metric(y_true, pred) + alpha * np.sum(w ** 2)

    w0 = np.append(np.ones(n) / n, 0.0)
    bounds = [(0.0, None)] * n + [(None, None)]
    res = minimize(loss_fn, w0, bounds=bounds, method="L-BFGS-B")
    return res.x[:n], res.x[n]


# ── 10. MAIN TRAINING LOOP ───────────────────────────────────────────────────
groups_full = train_df["grid_id"].values
gkf         = GroupKFold(n_splits=N_FOLDS)

all_oof_stacked  = np.zeros(len(original_y))
all_tst_stacked  = []

print("\n" + "=" * 75)
print(f"  5-FOLD SPATIAL GroupKFold — 3-SEED PIPELINE  ({len(BASE_FEATURES)} base features)")
print("=" * 75)
t_global = time.time()

for seed in SEEDS:
    print(f"\n{'=' * 20} SEED {seed} {'=' * 20}")
    oof_preds = {m: np.zeros(len(train_df)) for m in MODEL_NAMES}
    tst_preds = {m: np.zeros(len(test_df))  for m in MODEL_NAMES}

    for fold, (tr_idx, va_idx) in enumerate(gkf.split(train_df, y, groups_full)):
        t0 = time.time()

        va_is_pseudo  = train_df.iloc[va_idx]["is_pseudo"] == 1
        va_idx_clean  = va_idx[~va_is_pseudo.values] if va_is_pseudo.any() else va_idx

        tr_rows = train_df.iloc[tr_idx].copy()
        va_rows = train_df.iloc[va_idx_clean].copy()

        # ── Target conflict resolution (group median within fold) ───────
        temp_keys = tr_rows[CONFLICT_KEY_COLS].copy()
        for col in temp_keys.columns:
            if temp_keys[col].dtype in ["object", "category"]:
                temp_keys[col] = temp_keys[col].astype(str).fillna("missing")
            else:
                temp_keys[col] = temp_keys[col].fillna(-999)
        gr_med = tr_rows.groupby([temp_keys[c] for c in temp_keys.columns])[TARGET].transform("median")
        tr_rows[TARGET] = gr_med

        # ── Per-fold target encodings (real rows only) ─────────────────
        real_tr = tr_rows[tr_rows["is_pseudo"] == 0]
        te_features = []
        for col in TARGET_ENC_COLS:
            gs = real_tr.groupby(col)[TARGET].agg(
                median="median", count="count", mean="mean", std="std",
                q25=lambda x: x.quantile(0.25), q75=lambda x: x.quantile(0.75),
            )
            gs["std"] = gs["std"].fillna(0.0)
            s = SMOOTHING
            sm_median = (gs["count"] * gs["median"] + s * GLOBAL_MEDIAN) / (gs["count"] + s)
            sm_mean   = (gs["count"] * gs["mean"]   + s * GLOBAL_MEAN)   / (gs["count"] + s)
            sm_std    = (gs["count"] * gs["std"]    + s * GLOBAL_STD)    / (gs["count"] + s)
            sm_q25    = (gs["count"] * gs["q25"]    + s * GLOBAL_Q25)    / (gs["count"] + s)
            sm_q75    = (gs["count"] * gs["q75"]    + s * GLOBAL_Q75)    / (gs["count"] + s)
            log_cnt   = np.log1p(gs["count"])

            for tdf in [tr_rows, va_rows, test_df]:
                key = tdf[col].astype(str)
                tdf[f"{col}_target_enc"] = key.map(sm_median).fillna(GLOBAL_MEDIAN).astype(float)
                tdf[f"{col}_target_q25"] = key.map(sm_q25).fillna(GLOBAL_Q25).astype(float)
                tdf[f"{col}_target_q75"] = key.map(sm_q75).fillna(GLOBAL_Q75).astype(float)
                tdf[f"{col}_target_cnt"] = key.map(log_cnt).fillna(0.0).astype(float)
                if col in STD_ENC_COLS:
                    tdf[f"{col}_target_std"] = key.map(sm_std).fillna(GLOBAL_STD).astype(float)

            te_features += [f"{col}_target_enc", f"{col}_target_q25",
                             f"{col}_target_q75", f"{col}_target_cnt"]
            if col in STD_ENC_COLS:
                te_features.append(f"{col}_target_std")

        FEATURES = BASE_FEATURES + te_features
        cat_cols = [c for c in cat_feature_names if c in FEATURES]

        y_tr = tr_rows[TARGET]
        y_va = va_rows[TARGET]
        X_tr = tr_rows[FEATURES].copy()
        X_va = va_rows[FEATURES].copy()
        X_te = test_df[FEATURES].copy()

        # XGB format: encode cats as integer codes
        def to_xgb(df):
            df = df.copy()
            for c in df.columns:
                if hasattr(df[c], "cat"):
                    df[c] = df[c].cat.codes.astype("int32")
            return df

        # CAT format: cats as strings
        def to_cat(df):
            df = df.copy()
            for c in cat_cols:
                if c in df.columns:
                    df[c] = df[c].astype(str)
            return df

        X_tr_xgb = to_xgb(X_tr); X_va_xgb = to_xgb(X_va); X_te_xgb = to_xgb(X_te)
        X_tr_cat = to_cat(X_tr); X_va_cat = to_cat(X_va); X_te_cat = to_cat(X_te)
        for col in cat_cols:
            for df2 in [X_tr, X_va, X_te]:
                df2[col] = df2[col].astype(str).astype(cat_dtype_map[col])

        # ── XGB-MAE-1 (depth 7) ────────────────────────────────────────
        m1 = xgb.XGBRegressor(
            n_estimators=4000, learning_rate=0.03, max_depth=7,
            min_child_weight=4, subsample=0.85, colsample_bytree=0.6,
            colsample_bylevel=0.6, reg_alpha=2.0, reg_lambda=4.0,
            gamma=0.1, max_delta_step=1,
            objective="reg:absoluteerror", eval_metric="mae",
            tree_method="hist", enable_categorical=False,
            early_stopping_rounds=100, random_state=seed, n_jobs=-1,
        )
        m1.fit(X_tr_xgb, y_tr, eval_set=[(X_va_xgb, y_va)], verbose=False)

        # ── CAT-MAE-1 (depth 5) ───────────────────────────────────────
        m2 = cb.CatBoostRegressor(
            iterations=5000, learning_rate=0.03, depth=5, l2_leaf_reg=5.0,
            bagging_temperature=0.7, random_strength=2.0, border_count=254,
            loss_function="MAE", eval_metric="MAE", task_type="CPU",
            random_seed=seed, verbose=False,
        )
        m2.fit(X_tr_cat, y_tr, cat_features=cat_cols,
               eval_set=(X_va_cat, y_va), early_stopping_rounds=150, verbose=False)

        # ── CAT-MAE-2 (depth 5, higher regularisation) ───────────────
        m3 = cb.CatBoostRegressor(
            iterations=5000, learning_rate=0.03, depth=5, l2_leaf_reg=12.0,
            bagging_temperature=0.4, random_strength=5.0, border_count=254,
            loss_function="MAE", eval_metric="MAE", task_type="CPU",
            random_seed=seed + 1, verbose=False,
        )
        m3.fit(X_tr_cat, y_tr, cat_features=cat_cols,
               eval_set=(X_va_cat, y_va), early_stopping_rounds=150, verbose=False)

        # ── CAT-RMSE (depth 5) ────────────────────────────────────────
        m4 = cb.CatBoostRegressor(
            iterations=4000, learning_rate=0.03, depth=5, l2_leaf_reg=8.0,
            bagging_temperature=0.6, random_strength=3.0, border_count=254,
            loss_function="RMSE", eval_metric="RMSE", task_type="CPU",
            random_seed=seed + 2, verbose=False,
        )
        m4.fit(X_tr_cat, y_tr, cat_features=cat_cols,
               eval_set=(X_va_cat, y_va), early_stopping_rounds=150, verbose=False)

        # ── LGB-MAE (depth 5) ─────────────────────────────────────────
        m5 = lgb.LGBMRegressor(
            n_estimators=4000, learning_rate=0.03, num_leaves=31, max_depth=5,
            min_child_samples=40, subsample=0.8, subsample_freq=1,
            colsample_bytree=0.6, reg_alpha=2.0, reg_lambda=5.0,
            objective="regression_l1", random_state=seed, n_jobs=-1, verbosity=-1,
        )
        m5.fit(X_tr, y_tr, eval_set=[(X_va, y_va)],
               callbacks=[lgb.early_stopping(150, verbose=False)])

        # ── XGB-MAE-2 (depth 5, higher regularisation) ────────────────
        m6 = xgb.XGBRegressor(
            n_estimators=4000, learning_rate=0.03, max_depth=5,
            min_child_weight=6, subsample=0.75, colsample_bytree=0.5,
            colsample_bylevel=0.8, reg_alpha=5.0, reg_lambda=10.0,
            gamma=0.2, max_delta_step=1,
            objective="reg:absoluteerror", eval_metric="mae",
            tree_method="hist", enable_categorical=False,
            early_stopping_rounds=100, random_state=seed + 3, n_jobs=-1,
        )
        m6.fit(X_tr_xgb, y_tr, eval_set=[(X_va_xgb, y_va)], verbose=False)

        oof_preds["XGB-MAE-1(d7)"][va_idx_clean] = m1.predict(X_va_xgb)
        oof_preds["CAT-MAE-1(d5)"][va_idx_clean] = m2.predict(X_va_cat)
        oof_preds["CAT-MAE-2(d5)"][va_idx_clean] = m3.predict(X_va_cat)
        oof_preds["CAT-RMSE(d5)"][va_idx_clean]  = m4.predict(X_va_cat)
        oof_preds["LGB-MAE(d5)"][va_idx_clean]   = m5.predict(X_va)
        oof_preds["XGB-MAE-2(d5)"][va_idx_clean] = m6.predict(X_va_xgb)

        tst_preds["XGB-MAE-1(d7)"] += m1.predict(X_te_xgb) / N_FOLDS
        tst_preds["CAT-MAE-1(d5)"] += m2.predict(X_te_cat)  / N_FOLDS
        tst_preds["CAT-MAE-2(d5)"] += m3.predict(X_te_cat)  / N_FOLDS
        tst_preds["CAT-RMSE(d5)"]  += m4.predict(X_te_cat)  / N_FOLDS
        tst_preds["LGB-MAE(d5)"]   += m5.predict(X_te)      / N_FOLDS
        tst_preds["XGB-MAE-2(d5)"] += m6.predict(X_te_xgb)  / N_FOLDS

        ens_fold = np.mean([oof_preds[m][va_idx_clean] for m in MODEL_NAMES], axis=0)
        f_mae  = mean_absolute_error(y_va.values, ens_fold)
        f_rmse = float(root_mean_squared_error(y_va.values, ens_fold))
        iters  = [m1.best_iteration, m2.best_iteration_, m3.best_iteration_,
                  m4.best_iteration_, m5.best_iteration_, m6.best_iteration]
        print(f"  Fold {fold+1}/5 | iters={iters} | MAE={f_mae:.4f} RMSE={f_rmse:.4f} [{time.time()-t0:.0f}s]")

    # ── Per-seed L2 stacking ───────────────────────────────────────────────
    oof_meta_s  = np.column_stack([oof_preds[m][real_mask_bool] for m in MODEL_NAMES])
    tst_meta_s  = np.column_stack([tst_preds[m] for m in MODEL_NAMES])

    # nested CV for best L2 alpha
    print(f"  [STACK seed {seed}] Searching best L2 alpha...")
    best_alpha, best_score = 0.1, np.inf
    for alpha in [0.001, 0.01, 0.1, 1.0, 10.0]:
        oof_cv = np.zeros(len(original_y))
        for _, (tr_l2, va_l2) in enumerate(gkf_l2.split(original_df, original_y, original_groups)):
            w_cv, b_cv = fit_metric_stacker(oof_meta_s[tr_l2], original_y[tr_l2], alpha=alpha)
            oof_cv[va_l2] = np.clip(np.dot(oof_meta_s[va_l2], w_cv) + b_cv, 0.0, 1.0)
        s = competition_metric(original_y, oof_cv)
        if s < best_score:
            best_score, best_alpha = s, alpha

    print(f"  [STACK seed {seed}] Best alpha={best_alpha} score={best_score:.5f}")

    oof_stacked_s = np.zeros(len(original_y))
    for _, (tr_l2, va_l2) in enumerate(gkf_l2.split(original_df, original_y, original_groups)):
        w_f, b_f = fit_metric_stacker(oof_meta_s[tr_l2], original_y[tr_l2], alpha=best_alpha)
        oof_stacked_s[va_l2] = np.clip(np.dot(oof_meta_s[va_l2], w_f) + b_f, 0.0, 1.0)
    all_oof_stacked += oof_stacked_s / len(SEEDS)

    w_final, b_final = fit_metric_stacker(oof_meta_s, original_y, alpha=best_alpha)
    tst_s = np.clip(np.dot(tst_meta_s, w_final) + b_final, 0.0, 1.0)
    all_tst_stacked.append(tst_s)

    print(f"  Seed {seed} weights: { {n: round(float(w),4) for n,w in zip(MODEL_NAMES, w_final)} }")

# ── 11. GLOBAL OOF RESULTS ───────────────────────────────────────────────────
g_mae  = mean_absolute_error(original_y, all_oof_stacked)
g_rmse = float(root_mean_squared_error(original_y, all_oof_stacked))
g_ev   = explained_variance_score(original_y, all_oof_stacked)
g_lb   = competition_metric(original_y, all_oof_stacked)

print("\n" + "=" * 75)
print("  GLOBAL OOF (v3 — 3-seed L2 stacked)")
print(f"    MAE: {g_mae:.5f}  RMSE: {g_rmse:.5f}  EV: {g_ev:.5f}")
print(f"    Est. LB: {g_lb:.5f}")
print("=" * 75)

# ── 12. POST-HOC POWER TRANSFORM  a·pred^b + c ───────────────────────────────
print("\nOptimising post-hoc power transform...")
tst_base = np.clip(np.mean(all_tst_stacked, axis=0), 0.0, 1.0)


def posthoc_obj(params):
    a, b, c = params
    pred = a * np.power(np.clip(all_oof_stacked, 1e-6, None), b) + c
    return competition_metric(original_y, np.clip(pred, 0, 1))


best_ph = [1.0, 1.0, 0.0]
best_ph_score = posthoc_obj(best_ph)
rng = np.random.RandomState(7)
for _ in range(20):
    p0 = [rng.uniform(0.85, 1.15), rng.uniform(0.7, 1.5), rng.uniform(-0.03, 0.03)]
    res = minimize(posthoc_obj, p0, method="L-BFGS-B",
                   bounds=[(0.8, 1.2), (0.5, 2.0), (-0.05, 0.05)])
    if res.fun < best_ph_score:
        best_ph_score, best_ph = res.fun, res.x.tolist()

a_ph, b_ph, c_ph = best_ph
opt_oof = np.clip(a_ph * np.power(np.clip(all_oof_stacked, 1e-6, None), b_ph) + c_ph, 0, 1)
opt_tst = np.clip(a_ph * np.power(np.clip(tst_base, 1e-6, None), b_ph) + c_ph, 0, 1)

opt_lb = competition_metric(original_y, opt_oof)
print(f"  a={a_ph:.4f}  b={b_ph:.4f}  c={c_ph:.5f}")
print(f"  OOF after posthoc: {opt_lb:.5f}  (pred mean: {opt_tst.mean():.4f})")

# ── 13. SAVE SUBMISSIONS ─────────────────────────────────────────────────────
test_ids = pd.read_csv(os.path.join(DATA_DIR, "test.csv"))["record_id"]

# Base submission (no posthoc)
sub_base = pd.DataFrame({"record_id": test_ids, "flood_risk_score": np.clip(tst_base, 0, 1)})
sub_base.to_csv(os.path.join(OUT_DIR, "submission_v3.csv"), index=False)

# Optimised submission
sub_opt = pd.DataFrame({"record_id": test_ids, "flood_risk_score": opt_tst})
sub_opt.to_csv(os.path.join(OUT_DIR, "submission_v3_optimized.csv"), index=False)

# OOF arrays (for future blending)
np.save(os.path.join(OUT_DIR, "oof_v3.npy"),           all_oof_stacked)
np.save(os.path.join(OUT_DIR, "oof_v3_optimized.npy"), opt_oof)

print(f"\n[DONE] submission_v3.csv           mean={sub_base['flood_risk_score'].mean():.4f}")
print(f"[DONE] submission_v3_optimized.csv mean={sub_opt['flood_risk_score'].mean():.4f}")
print(f"[DONE] oof_v3.npy + oof_v3_optimized.npy saved")
print(f"\nTotal training time: {(time.time() - t_global) / 60:.1f} min")
