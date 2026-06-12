"""
Central configuration: paths, column groups, and constants shared across
the data pipeline, training, and inference code.

This is the production evolution of the Initial Round solution
(`solution_v10.py`): same target, same custom metric, same feature-
engineering philosophy (geo/KNN features, district stats, target
encoding, interaction features), reduced to a 3-model ensemble that can
be trained quickly and served for single-record predictions.
"""
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
MODELS_DIR = ROOT_DIR / "models"
MODEL_VERSION = "v1"
MODEL_DIR = MODELS_DIR / MODEL_VERSION

TRAIN_PATH = DATA_DIR / "train.csv"
TEST_PATH = DATA_DIR / "test.csv"

# ── Target / identifiers ──────────────────────────────────────────────────
TARGET = "flood_risk_score"
ID_COL = "record_id"

# ── Custom competition metric ────────────────────────────────────────────
# score = (0.5*MAE + 0.5*RMSE) * (1 + max(0, 1 - explained_variance))
# lower is better.

# ── Columns dropped (zero feature-importance in v10 search) ─────────────
ZERO_GAIN = [
    "elevation_m_yeojohnson", "drainage_index_yeojohnson",
    "nearest_hospital_km_log1p", "nearest_evac_km_log1p",
    "population_density_per_km2_log1p", "rainfall_7d_mm_log1p",
    "monthly_rainfall_mm_log1p", "distance_to_river_m_log1p",
]

# Columns never used as model features.
DROP_COLS = [
    ID_COL, "place_name", "reason_not_good_to_live",
    "is_synthetic", "generation_date", TARGET, "inundation_area_sqm",
]

# Categorical columns: label-encoded + target-encoded.
CAT_COLS = [
    "district", "landcover", "soil_type", "water_supply", "electricity",
    "road_quality", "urban_rural", "water_presence_flag",
    "flood_occurrence_current_event", "is_good_to_live",
]

# ── Raw input fields exposed on the prediction form / API ───────────────
# Numeric fields a real-world user would know about a location.
RAW_NUMERIC_COLS = [
    "latitude", "longitude", "elevation_m", "distance_to_river_m",
    "population_density_per_km2", "built_up_percent",
    "rainfall_7d_mm", "monthly_rainfall_mm", "drainage_index",
    "ndvi", "ndwi", "historical_flood_count", "infrastructure_score",
    "nearest_hospital_km", "nearest_evac_km",
]

# Categorical fields a real-world user would know about a location.
RAW_CAT_COLS = [
    "district", "landcover", "soil_type", "water_supply", "electricity",
    "road_quality", "urban_rural", "water_presence_flag",
]

# "Current event" fields - default to a calm/no-event baseline for a
# forward-looking risk assessment, but editable.
EVENT_DEFAULTS = {
    "flood_occurrence_current_event": "No",
    "inundation_area_sqm": 0,
    "is_good_to_live": "Yes",
    "reason_not_good_to_live": "",
}

# Dataset-precomputed composite indices with no direct raw counterpart.
# Exposed as "advanced" optional fields, pre-filled from district means.
ADVANCED_COLS = [
    "seasonal_index", "terrain_roughness_index",
    "socioeconomic_status_index", "extreme_weather_index",
]

# Dataset-precomputed "quantile-mapped" columns: learned via an empirical
# monotonic mapping from the corresponding raw column (see features.py).
QMAP_SOURCE = {
    "ndvi_qmap": "ndvi",
    "ndwi_qmap": "ndwi",
    "built_up_percent_qmap": "built_up_percent",
}

# ── Feature engineering parameters (ported from v10) ────────────────────
AGG_COLS = [
    "rainfall_7d_mm", "monthly_rainfall_mm", "distance_to_river_m",
    "elevation_m", "drainage_index", "ndvi", "ndwi", "infrastructure_score",
    "nearest_hospital_km", "nearest_evac_km",
    "extreme_weather_index", "terrain_roughness_index",
    "seasonal_index", "socioeconomic_status_index",
]

QCOLS = [
    "rainfall_7d_mm", "monthly_rainfall_mm", "elevation_m", "drainage_index",
    "ndvi_qmap", "ndwi_qmap", "infrastructure_score", "extreme_weather_index",
    "terrain_roughness_index", "distance_to_river_m",
]

RANK_COLS = [
    "rainfall_7d_mm", "monthly_rainfall_mm", "distance_to_river_m",
    "elevation_m", "drainage_index", "ndvi_qmap", "ndwi_qmap",
    "infrastructure_score", "nearest_hospital_km", "nearest_evac_km",
    "extreme_weather_index", "terrain_roughness_index",
    "population_density_per_km2", "built_up_percent_qmap",
    "historical_flood_count",
]

KMEANS_KS = [5, 10, 20]
KNN_K_VALUES = [5, 10, 25, 50, 75, 100]

GEO_FEATS = [
    "latitude", "longitude", "elevation_m", "rainfall_7d_mm",
    "monthly_rainfall_mm", "distance_to_river_m", "ndvi_qmap", "ndwi_qmap",
]

# ── CV / training ─────────────────────────────────────────────────────────
N_FOLDS = 5
RANDOM_STATE = 42

# ── Risk categories for UI ──────────────────────────────────────────────
RISK_BANDS = [
    (0.00, 0.25, "Low"),
    (0.25, 0.50, "Moderate"),
    (0.50, 0.75, "High"),
    (0.75, 1.01, "Severe"),
]


def risk_category(score: float) -> str:
    for lo, hi, label in RISK_BANDS:
        if lo <= score < hi:
            return label
    return "Severe"
