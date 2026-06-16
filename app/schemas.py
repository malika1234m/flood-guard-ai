"""Pydantic request/response models for the FloodGuard AI API."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    # Core location numerics
    latitude: float = Field(..., description="Latitude (degrees)")
    longitude: float = Field(..., description="Longitude (degrees)")
    elevation_m: float = Field(..., description="Elevation above sea level (m)")
    distance_to_river_m: float = Field(..., description="Distance to nearest river (m)")
    population_density_per_km2: float
    built_up_percent: float
    rainfall_7d_mm: float = Field(..., description="Rainfall in the last 7 days (mm)")
    monthly_rainfall_mm: float
    drainage_index: float = Field(..., description="0-1 drainage capacity index")
    ndvi: float = Field(..., description="Normalized vegetation index")
    ndwi: float = Field(..., description="Normalized water index")
    historical_flood_count: float
    infrastructure_score: float
    nearest_hospital_km: float
    nearest_evac_km: float

    # Core location categoricals
    district: str
    landcover: str
    soil_type: str
    water_supply: str
    electricity: str
    road_quality: str
    urban_rural: str
    water_presence_flag: str

    # Optional "current event" overrides (default to a calm baseline)
    flood_occurrence_current_event: Optional[str] = None
    inundation_area_sqm: Optional[float] = None
    is_good_to_live: Optional[str] = None
    reason_not_good_to_live: Optional[str] = None

    # Optional quantile-mapped / advanced composite fields
    # (auto-derived/defaulted server-side if omitted)
    ndvi_qmap: Optional[float] = None
    ndwi_qmap: Optional[float] = None
    built_up_percent_qmap: Optional[float] = None
    seasonal_index: Optional[float] = None
    terrain_roughness_index: Optional[float] = None
    socioeconomic_status_index: Optional[float] = None
    extreme_weather_index: Optional[float] = None

    include_ai_report: bool = True


class FeatureContribution(BaseModel):
    feature: str
    importance: float
    value: float


class RiskReport(BaseModel):
    summary: str
    recommendations: list[str]
    source: str


class PredictResponse(BaseModel):
    flood_risk_score: float
    risk_category: str
    raw_score: float
    calibration_shift: float
    base_model_scores: dict[str, float]
    model_version: str
    ood_flags: list[str]
    top_factors: list[FeatureContribution]
    ai_report: Optional[RiskReport] = None
    prediction_id: int
    latency_ms: float


class FeedbackRequest(BaseModel):
    prediction_id: int
    actual_flood_occurred: Optional[bool] = None
    user_rating: Optional[int] = Field(default=None, ge=1, le=5)
    comment: Optional[str] = None


class DistrictRisk(BaseModel):
    district: str
    score: float
    category: str


class DistrictProfile(BaseModel):
    latitude: float
    longitude: float
    elevation_m: float
    distance_to_river_m: float
    population_density_per_km2: float
    built_up_percent: float
    rainfall_7d_mm: float
    monthly_rainfall_mm: float
    drainage_index: float
    ndvi: float
    ndwi: float
    historical_flood_count: float
    infrastructure_score: float
    nearest_hospital_km: float
    nearest_evac_km: float
    seasonal_index: float
    terrain_roughness_index: float
    socioeconomic_status_index: float
    extreme_weather_index: float
    landcover: str
    soil_type: str
    water_supply: str
    electricity: str
    road_quality: str
    urban_rural: str
    water_presence_flag: str


class ModelInfo(BaseModel):
    version: str
    trained_at: str
    n_features: int
    n_rows: int
    n_folds: int
    metrics: dict[str, float]
    top_features: list
    categorical_options: dict[str, list[str]]
    district_defaults: dict[str, dict[str, float]]
    advanced_field_global_defaults: dict[str, float]
    district_profiles: dict[str, DistrictProfile]


class HealthResponse(BaseModel):
    status: str
    model_version: str
    model_loaded: bool


class LiveDistrictRisk(BaseModel):
    district: str
    live_score: float
    typical_score: float
    live_category: str
    typical_category: str
    rainfall_7d_mm: float          # actual live value (or typical if API unavailable)
    typical_rainfall_7d_mm: float
    trend: str                     # "Worsening" | "Improving" | "Stable"
    trend_delta: float             # live_score − typical_score
    weather_live: bool             # True if real weather was fetched


class FloodAlert(BaseModel):
    district: str
    severity: str                  # "Severe" | "High" | "Moderate"
    live_score: float
    typical_score: float
    trend: str
    trend_delta: float
    rainfall_7d_mm: float
    message: str
