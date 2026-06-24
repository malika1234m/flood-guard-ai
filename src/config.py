"""
Central configuration: paths, column groups, and constants shared across
the data pipeline, training, and inference code.

v2 upgrade: real competition metric formula, 6-model ensemble, RankGauss,
GroupKFold topo clusters, 5-stat Bayesian TE, physics features, SLSQP
blending, L-BFGS-B posthoc, DAE bottleneck, synthetic fingerprint.
"""
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
MODELS_DIR = ROOT_DIR / "models"
MODEL_VERSION = "v2"
MODEL_DIR = MODELS_DIR / MODEL_VERSION

TRAIN_PATH = DATA_DIR / "train.csv"
TEST_PATH = DATA_DIR / "test.csv"

# ── Target / identifiers ──────────────────────────────────────────────────
TARGET = "flood_risk_score"
ID_COL = "record_id"

# ── Real competition metric (reverse-engineered from leaderboard) ─────────
# (0.583210 * MAE + 1.122681 * RMSE) * (1 + 0.045804 * max(0, 1 - EV))
# RMSE has ~1.92× the weight of MAE. Lower is better.

# ── Columns dropped before model fitting ─────────────────────────────────
# elevation_m_yeojohnson / drainage_index_yeojohnson are intentionally kept
# in ZERO_GAIN: we re-derive these via our own fitted PowerTransformer inside
# _step_interactions, making them available at inference time too.
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

# Categorical columns: label-encoded + target-encoded (5 stats each).
CAT_COLS = [
    "district", "landcover", "soil_type", "water_supply", "electricity",
    "road_quality", "urban_rural", "water_presence_flag",
    "flood_occurrence_current_event", "is_good_to_live",
]

# Compound categoricals: created in _step_basic, label-encoded + TE'd.
COMPOUND_CAT_COLS = ["downstream_sig", "infra_deficit_sig"]

# ── Raw input fields exposed on the prediction form / API ───────────────
RAW_NUMERIC_COLS = [
    "latitude", "longitude", "elevation_m", "distance_to_river_m",
    "population_density_per_km2", "built_up_percent",
    "rainfall_7d_mm", "monthly_rainfall_mm", "drainage_index",
    "ndvi", "ndwi", "historical_flood_count", "infrastructure_score",
    "nearest_hospital_km", "nearest_evac_km",
]

RAW_CAT_COLS = [
    "district", "landcover", "soil_type", "water_supply", "electricity",
    "road_quality", "urban_rural", "water_presence_flag",
]

EVENT_DEFAULTS = {
    "flood_occurrence_current_event": "No",
    "inundation_area_sqm": 0,
    "is_good_to_live": "Yes",
    "reason_not_good_to_live": "",
}

ADVANCED_COLS = [
    "seasonal_index", "terrain_roughness_index",
    "socioeconomic_status_index", "extreme_weather_index",
]

QMAP_SOURCE = {
    "ndvi_qmap": "ndvi",
    "ndwi_qmap": "ndwi",
    "built_up_percent_qmap": "built_up_percent",
}

# ── Feature engineering parameters ────────────────────────────────────────
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
KMEANS_TOPO_K = 50          # topographic clusters for GroupKFold (lat/lon/elev)
KNN_K_VALUES = [5, 10, 25, 50, 75, 100]

GEO_FEATS = [
    "latitude", "longitude", "elevation_m", "rainfall_7d_mm",
    "monthly_rainfall_mm", "distance_to_river_m", "ndvi_qmap", "ndwi_qmap",
]

TE_SMOOTHING = 10.0         # Bayesian smoothing weight for 5-stat target encoding

# ── Physics-feature constants ─────────────────────────────────────────────
# Approximate soil infiltration rates (mm/hr) by soil type.
SOIL_INFILTRATION_MAP: dict[str, float] = {
    "Clay":        0.10,
    "Sandy Clay":  0.20,
    "Clay Loam":   0.25,
    "Loam":        0.35,
    "Sandy Loam":  0.50,
    "Sandy":       0.70,
    "Gravel":      1.00,
    "Peat":        0.15,
    "Rock":        0.05,
}

# Districts exposed to Bay-of-Bengal cyclone tracks.
CYCLONE_DISTRICTS: set[str] = {
    "Ampara", "Batticaloa", "Trincomalee", "Mullaitivu",
    "Kilinochchi", "Jaffna", "Hambantota",
}

# Sri Lanka wet zone (south-western, high annual rainfall).
WET_ZONE_DISTRICTS: set[str] = {
    "Colombo", "Gampaha", "Kalutara", "Galle", "Matara",
    "Ratnapura", "Kegalle", "Kandy", "Nuwara Eliya",
}

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
