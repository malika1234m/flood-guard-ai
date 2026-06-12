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

export const RISK_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  High: "#f97316",
  Severe: "#ef4444",
};

export function prettify(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
