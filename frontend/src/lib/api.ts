const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = "Request failed";
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface DistrictProfile {
  latitude: number;
  longitude: number;
  elevation_m: number;
  distance_to_river_m: number;
  population_density_per_km2: number;
  built_up_percent: number;
  rainfall_7d_mm: number;
  monthly_rainfall_mm: number;
  drainage_index: number;
  ndvi: number;
  ndwi: number;
  historical_flood_count: number;
  infrastructure_score: number;
  nearest_hospital_km: number;
  nearest_evac_km: number;
  seasonal_index: number;
  terrain_roughness_index: number;
  socioeconomic_status_index: number;
  extreme_weather_index: number;
  landcover: string;
  soil_type: string;
  water_supply: string;
  electricity: string;
  road_quality: string;
  urban_rural: string;
  water_presence_flag: string;
}

export interface ModelInfo {
  version: string;
  trained_at: string;
  n_features: number;
  n_rows: number;
  n_folds: number;
  metrics: Record<string, number>;
  top_features: [string, number][];
  categorical_options: Record<string, string[]>;
  district_defaults: Record<string, Record<string, number>>;
  advanced_field_global_defaults: Record<string, number>;
  district_profiles: Record<string, DistrictProfile>;
}

export interface PredictRequest {
  latitude: number;
  longitude: number;
  elevation_m: number;
  distance_to_river_m: number;
  population_density_per_km2: number;
  built_up_percent: number;
  rainfall_7d_mm: number;
  monthly_rainfall_mm: number;
  drainage_index: number;
  ndvi: number;
  ndwi: number;
  historical_flood_count: number;
  infrastructure_score: number;
  nearest_hospital_km: number;
  nearest_evac_km: number;

  district: string;
  landcover: string;
  soil_type: string;
  water_supply: string;
  electricity: string;
  road_quality: string;
  urban_rural: string;
  water_presence_flag: string;

  flood_occurrence_current_event?: string | null;
  inundation_area_sqm?: number | null;
  is_good_to_live?: string | null;
  reason_not_good_to_live?: string | null;

  seasonal_index?: number | null;
  terrain_roughness_index?: number | null;
  socioeconomic_status_index?: number | null;
  extreme_weather_index?: number | null;

  include_ai_report?: boolean;
}

export interface FeatureContribution {
  feature: string;
  importance: number;
  value: number;
}

export interface RiskReport {
  summary: string;
  recommendations: string[];
  source: string;
}

export interface PredictResponse {
  flood_risk_score: number;
  risk_category: "Low" | "Moderate" | "High" | "Severe";
  raw_score: number;
  calibration_shift: number;
  base_model_scores: Record<string, number>;
  model_version: string;
  ood_flags: string[];
  top_factors: FeatureContribution[];
  ai_report: RiskReport | null;
  prediction_id: number;
  latency_ms: number;
}

export interface FeedbackRequest {
  prediction_id: number;
  actual_flood_occurred?: boolean | null;
  user_rating?: number | null;
  comment?: string | null;
}

export interface RecentPrediction {
  timestamp: number;
  district: string | null;
  flood_risk_score: number;
  risk_category: string;
  latency_ms: number;
}

export interface MonitoringStats {
  total_predictions: number;
  avg_score: number | null;
  avg_latency_ms: number | null;
  category_counts: Record<string, number>;
  district_counts: Record<string, number>;
  score_histogram: number[];
  recent: RecentPrediction[];
  feedback_count: number;
  avg_user_rating: number | null;
}

// ── Endpoints ──────────────────────────────────────────────────────────

export function getModelInfo() {
  return request<ModelInfo>("/model/info");
}

export function predict(payload: PredictRequest) {
  return request<PredictResponse>("/predict", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sendFeedback(payload: FeedbackRequest) {
  return request<{ status: string }>("/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMonitoringStats() {
  return request<MonitoringStats>("/monitoring/stats");
}

export interface DistrictRisk {
  district: string;
  score: number;
  category: string;
}

export interface LiveDistrictRisk {
  district: string;
  live_score: number;
  typical_score: number;
  live_category: string;
  typical_category: string;
  rainfall_7d_mm: number;
  typical_rainfall_7d_mm: number;
  trend: "Worsening" | "Improving" | "Stable";
  trend_delta: number;
  weather_live: boolean;
}

export interface FloodAlert {
  district: string;
  severity: "Severe" | "High" | "Moderate";
  live_score: number;
  typical_score: number;
  trend: string;
  trend_delta: number;
  rainfall_7d_mm: number;
  message: string;
}

// ── Batch predict ──────────────────────────────────────────────────────

export interface BatchPredictResponse {
  results: PredictResponse[];
  total: number;
  avg_score: number;
}

export function predictBatch(records: PredictRequest[], include_ai_report = false) {
  return request<BatchPredictResponse>("/predict/batch", {
    method: "POST",
    body: JSON.stringify({ records, include_ai_report }),
  });
}

// ── 10-day forecast ────────────────────────────────────────────────────

export interface ForecastDay {
  date: string;
  day_index: number;
  rainfall_mm: number;
  cumulative_7d_mm: number;
  flood_risk_score: number;
  risk_category: string;
}

export interface DistrictForecast {
  district: string;
  forecast_days: ForecastDay[];
  peak_risk_day: number;
  peak_risk_score: number;
  avg_risk_score: number;
  trend: "Worsening" | "Improving" | "Stable";
  typical_score: number;
}

export function getDistrictForecast(district: string) {
  return request<DistrictForecast>(`/forecast/${encodeURIComponent(district)}`);
}

export function getAllForecasts() {
  return request<DistrictForecast[]>("/forecast");
}

// ── Emergency priority ─────────────────────────────────────────────────

export interface EmergencyPriorityItem {
  rank: number;
  district: string;
  priority_score: number;
  flood_risk_score: number;
  risk_category: string;
  population_score: number;
  evacuation_gap_score: number;
  flood_history_score: number;
  infrastructure_weakness_score: number;
  recommended_action: string;
  reasons: string[];
}

export function getEmergencyPriority() {
  return request<EmergencyPriorityItem[]>("/emergency-priority");
}

// ── Readiness ──────────────────────────────────────────────────────────

export interface ReadinessCheck {
  name: string;
  status: "ok" | "failed" | "skipped";
  detail?: string | null;
}

export interface ReadinessResponse {
  overall: "ok" | "degraded" | "down";
  checks: ReadinessCheck[];
  model_version: string;
}

export function getReadiness() {
  return request<ReadinessResponse>("/readiness");
}

export function getDistrictRisks() {
  return request<DistrictRisk[]>("/district-risks");
}

export function getLiveRisks() {
  return request<LiveDistrictRisk[]>("/live-risks");
}

export function getAlerts() {
  return request<FloodAlert[]>("/alerts");
}

export const BASE_MODEL_NAMES: Record<string, string> = {
  lgb: "LightGBM",
  cat: "CatBoost",
  xgb: "XGBoost",
};

export const RISK_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  High: "#f97316",
  Severe: "#ef4444",
};

export function prettify(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Plain-language labels for the model's most influential engineered features,
 * shown in the "What influenced this result" chart on the Predict page.
 * Anything not listed here falls back to prettify().
 */
export const FEATURE_LABELS: Record<string, string> = {
  district_te: "Typical risk level for this district",
  inund_log1p: "Current flooding extent",
  distance_to_river_m: "Distance to nearest river",
  reason_has_flood: "Active flooding reported",
  extreme_x_terrain: "Extreme weather & terrain combination",
  rainfall_7d_mm: "Rainfall, last 7 days",
  longitude: "Longitude",
  monthly_rainfall_mm: "Monthly rainfall",
  nearest_hospital_km: "Distance to nearest hospital",
  lon_x_river: "Location & river proximity combination",
  extreme_weather_index: "Extreme weather index",
  population_density_per_km2: "Population density",
  rain_x_pop: "Rainfall & population combination",
  distance_to_river_m_dist_rank: "River proximity, compared with the district",
  extreme_x_rain: "Extreme weather & rainfall combination",
  kmeans_5_dist: "Regional risk grouping",
  geo_cluster_te: "Typical risk level for this area",
  socio_x_infra: "Socioeconomic & infrastructure combination",
  ndwi: "Surface water index",
  latitude: "Latitude",
  ndvi_x_ndwi: "Vegetation & water combination",
  seas_x_ndwi: "Seasonal & water combination",
  ndvi: "Vegetation cover",
  terrain_roughness_index_dist_rank: "Terrain roughness, compared with the district",
  knn100_iqr: "Risk variability among similar locations",
};

export function factorLabel(feature: string) {
  return FEATURE_LABELS[feature] ?? prettify(feature);
}
