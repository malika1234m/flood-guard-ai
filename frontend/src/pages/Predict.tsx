import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FactorsChart } from "@/components/FactorsChart";
import { PageHero } from "@/components/PageHero";
import { RiskGauge } from "@/components/RiskGauge";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGrid, FieldSection, NumberField, SelectField, TextField } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { RISK_BADGE_CLASSES } from "@/lib/riskBadge";
import {
  getModelInfo,
  predict,
  sendFeedback,
  type ModelInfo,
  type PredictRequest,
  type PredictResponse,
} from "@/lib/api";

interface FormState {
  district: string;
  urban_rural: string;
  latitude: string;
  longitude: string;
  landcover: string;
  soil_type: string;
  elevation_m: string;
  distance_to_river_m: string;
  rainfall_7d_mm: string;
  monthly_rainfall_mm: string;
  drainage_index: string;
  historical_flood_count: string;
  ndvi: string;
  ndwi: string;
  water_presence_flag: string;
  population_density_per_km2: string;
  built_up_percent: string;
  infrastructure_score: string;
  water_supply: string;
  electricity: string;
  road_quality: string;
  nearest_hospital_km: string;
  nearest_evac_km: string;
  flood_occurrence_current_event: string;
  inundation_area_sqm: string;
  is_good_to_live: string;
  reason_not_good_to_live: string;
  seasonal_index: string;
  terrain_roughness_index: string;
  socioeconomic_status_index: string;
  extreme_weather_index: string;
}

const DEFAULT_FORM: FormState = {
  district: "",
  urban_rural: "",
  latitude: "6.9271",
  longitude: "79.8612",
  landcover: "",
  soil_type: "",
  elevation_m: "8",
  distance_to_river_m: "300",
  rainfall_7d_mm: "120",
  monthly_rainfall_mm: "280",
  drainage_index: "0.5",
  historical_flood_count: "2",
  ndvi: "0.35",
  ndwi: "0.1",
  water_presence_flag: "",
  population_density_per_km2: "2500",
  built_up_percent: "55",
  infrastructure_score: "60",
  water_supply: "",
  electricity: "",
  road_quality: "",
  nearest_hospital_km: "4",
  nearest_evac_km: "3",
  flood_occurrence_current_event: "No",
  inundation_area_sqm: "0",
  is_good_to_live: "Yes",
  reason_not_good_to_live: "",
  seasonal_index: "",
  terrain_roughness_index: "",
  socioeconomic_status_index: "",
  extreme_weather_index: "",
};

const CATEGORICAL_FIELDS = [
  "district",
  "urban_rural",
  "landcover",
  "soil_type",
  "water_supply",
  "electricity",
  "road_quality",
  "water_presence_flag",
] as const satisfies readonly (keyof FormState)[];

const ADVANCED_INDEX_FIELDS = [
  { id: "seasonal_index", label: "Seasonal index" },
  { id: "terrain_roughness_index", label: "Terrain roughness index" },
  { id: "socioeconomic_status_index", label: "Socioeconomic status index" },
  { id: "extreme_weather_index", label: "Extreme weather index" },
] as const satisfies readonly { id: keyof FormState; label: string }[];

function optionalNumber(value: string): number | null {
  return value.trim() === "" ? null : parseFloat(value);
}

function buildPayload(form: FormState): PredictRequest {
  return {
    latitude: parseFloat(form.latitude),
    longitude: parseFloat(form.longitude),
    elevation_m: parseFloat(form.elevation_m),
    distance_to_river_m: parseFloat(form.distance_to_river_m),
    population_density_per_km2: parseFloat(form.population_density_per_km2),
    built_up_percent: parseFloat(form.built_up_percent),
    rainfall_7d_mm: parseFloat(form.rainfall_7d_mm),
    monthly_rainfall_mm: parseFloat(form.monthly_rainfall_mm),
    drainage_index: parseFloat(form.drainage_index),
    ndvi: parseFloat(form.ndvi),
    ndwi: parseFloat(form.ndwi),
    historical_flood_count: parseFloat(form.historical_flood_count),
    infrastructure_score: parseFloat(form.infrastructure_score),
    nearest_hospital_km: parseFloat(form.nearest_hospital_km),
    nearest_evac_km: parseFloat(form.nearest_evac_km),
    district: form.district,
    landcover: form.landcover,
    soil_type: form.soil_type,
    water_supply: form.water_supply,
    electricity: form.electricity,
    road_quality: form.road_quality,
    urban_rural: form.urban_rural,
    water_presence_flag: form.water_presence_flag,
    flood_occurrence_current_event: form.flood_occurrence_current_event,
    inundation_area_sqm: optionalNumber(form.inundation_area_sqm),
    is_good_to_live: form.is_good_to_live,
    reason_not_good_to_live: form.reason_not_good_to_live.trim() === "" ? null : form.reason_not_good_to_live.trim(),
    seasonal_index: optionalNumber(form.seasonal_index),
    terrain_roughness_index: optionalNumber(form.terrain_roughness_index),
    socioeconomic_status_index: optionalNumber(form.socioeconomic_status_index),
    extreme_weather_index: optionalNumber(form.extreme_weather_index),
    include_ai_report: true,
  };
}

export function Predict() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    getModelInfo()
      .then((data) => {
        setInfo(data);
        setForm((prev) => {
          const next = { ...prev };
          for (const field of CATEGORICAL_FIELDS) {
            if (!next[field]) {
              next[field] = data.categorical_options[field]?.[0] ?? "";
            }
          }
          return next;
        });
      })
      .catch(() => toast.error("Failed to load model configuration."));
  }, []);

  const set = (key: keyof FormState) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const districtDefaults = info ? info.district_defaults[form.district] ?? info.advanced_field_global_defaults : undefined;

  function placeholderFor(field: keyof FormState) {
    const v = districtDefaults?.[field as string];
    return v !== undefined ? `District avg: ${v.toFixed(4)}` : undefined;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await predict(buildPayload(form));
      setResult(data);
      setRating(0);
      setFeedbackSent(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRate(value: number) {
    if (!result) return;
    setRating(value);
    try {
      await sendFeedback({ prediction_id: result.prediction_id, user_rating: value });
      setFeedbackSent(true);
    } catch {
      toast.error("Failed to submit feedback.");
    }
  }

  const options = info?.categorical_options;

  return (
    <div>
      <PageHero
        title="Flood Risk Predictor & AI Advisor"
        description="Enter conditions for a location in Sri Lanka to get a flood-risk score (0-1) from our LightGBM + CatBoost + XGBoost ensemble, plus a plain-language AI risk report with recommended actions. Fields left at their defaults represent a calm, no-event baseline."
      />

      <div className="grid grid-cols-1 gap-5.5 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Location &amp; Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldSection title="Location">
                <FieldGrid>
                  <SelectField id="district" label="District" value={form.district} onChange={set("district")} options={options?.district ?? []} />
                  <SelectField id="urban_rural" label="Urban / Rural" value={form.urban_rural} onChange={set("urban_rural")} options={options?.urban_rural ?? []} />
                  <NumberField id="latitude" label="Latitude" value={form.latitude} onChange={set("latitude")} step="0.0001" required />
                  <NumberField id="longitude" label="Longitude" value={form.longitude} onChange={set("longitude")} step="0.0001" required />
                  <SelectField id="landcover" label="Land cover" value={form.landcover} onChange={set("landcover")} options={options?.landcover ?? []} />
                  <SelectField id="soil_type" label="Soil type" value={form.soil_type} onChange={set("soil_type")} options={options?.soil_type ?? []} />
                </FieldGrid>
              </FieldSection>

              <FieldSection title="Environment">
                <FieldGrid>
                  <NumberField id="elevation_m" label="Elevation (m)" value={form.elevation_m} onChange={set("elevation_m")} step="0.1" required />
                  <NumberField id="distance_to_river_m" label="Distance to river (m)" value={form.distance_to_river_m} onChange={set("distance_to_river_m")} step="1" required />
                  <NumberField id="rainfall_7d_mm" label="Rainfall, last 7 days (mm)" value={form.rainfall_7d_mm} onChange={set("rainfall_7d_mm")} step="0.1" required />
                  <NumberField id="monthly_rainfall_mm" label="Monthly rainfall (mm)" value={form.monthly_rainfall_mm} onChange={set("monthly_rainfall_mm")} step="0.1" required />
                  <NumberField id="drainage_index" label="Drainage index (0-2)" value={form.drainage_index} onChange={set("drainage_index")} step="0.01" required />
                  <NumberField id="historical_flood_count" label="Historical flood count" value={form.historical_flood_count} onChange={set("historical_flood_count")} step="1" required />
                  <NumberField id="ndvi" label="NDVI (vegetation, -1 to 1)" value={form.ndvi} onChange={set("ndvi")} step="0.01" required />
                  <NumberField id="ndwi" label="NDWI (surface water, -1 to 1)" value={form.ndwi} onChange={set("ndwi")} step="0.01" required />
                  <SelectField id="water_presence_flag" label="Water body nearby?" value={form.water_presence_flag} onChange={set("water_presence_flag")} options={options?.water_presence_flag ?? []} />
                </FieldGrid>
              </FieldSection>

              <FieldSection title="Infrastructure & Socioeconomic">
                <FieldGrid>
                  <NumberField id="population_density_per_km2" label="Population density (per km²)" value={form.population_density_per_km2} onChange={set("population_density_per_km2")} step="1" required />
                  <NumberField id="built_up_percent" label="Built-up land (%)" value={form.built_up_percent} onChange={set("built_up_percent")} step="0.1" required />
                  <NumberField id="infrastructure_score" label="Infrastructure score (0-100)" value={form.infrastructure_score} onChange={set("infrastructure_score")} step="0.1" required />
                  <SelectField id="water_supply" label="Water supply" value={form.water_supply} onChange={set("water_supply")} options={options?.water_supply ?? []} />
                  <SelectField id="electricity" label="Electricity" value={form.electricity} onChange={set("electricity")} options={options?.electricity ?? []} />
                  <SelectField id="road_quality" label="Road quality" value={form.road_quality} onChange={set("road_quality")} options={options?.road_quality ?? []} />
                  <NumberField id="nearest_hospital_km" label="Nearest hospital (km)" value={form.nearest_hospital_km} onChange={set("nearest_hospital_km")} step="0.1" required />
                  <NumberField id="nearest_evac_km" label="Nearest evacuation center (km)" value={form.nearest_evac_km} onChange={set("nearest_evac_km")} step="0.1" required />
                </FieldGrid>
              </FieldSection>

              <details className="mt-4.5 rounded-[10px] border border-border bg-white/[0.02] px-3.5 py-2">
                <summary className="cursor-pointer py-1.5 font-semibold text-brand">
                  Advanced: current event &amp; composite indices (optional)
                </summary>

                <FieldSection title="Current event">
                  <FieldGrid>
                    <SelectField
                      id="flood_occurrence_current_event"
                      label="Flooding happening right now?"
                      value={form.flood_occurrence_current_event}
                      onChange={set("flood_occurrence_current_event")}
                      options={["No", "Yes"]}
                    />
                    {form.flood_occurrence_current_event === "Yes" && (
                      <NumberField
                        id="inundation_area_sqm"
                        label="Inundated area (sq. m)"
                        value={form.inundation_area_sqm}
                        onChange={set("inundation_area_sqm")}
                        step="1"
                      />
                    )}
                    <SelectField
                      id="is_good_to_live"
                      label="Currently considered good to live?"
                      value={form.is_good_to_live}
                      onChange={set("is_good_to_live")}
                      options={["Yes", "No"]}
                    />
                    {form.is_good_to_live === "No" && (
                      <TextField
                        id="reason_not_good_to_live"
                        label="Reason (optional)"
                        value={form.reason_not_good_to_live}
                        onChange={set("reason_not_good_to_live")}
                        placeholder="e.g. frequent flooding, poor road access"
                      />
                    )}
                  </FieldGrid>
                </FieldSection>

                <FieldSection title="Composite indices (auto-filled from district averages)">
                  <FieldGrid>
                    {ADVANCED_INDEX_FIELDS.map(({ id, label }) => (
                      <NumberField
                        key={id}
                        id={id}
                        label={label}
                        value={form[id]}
                        onChange={set(id)}
                        step="0.0001"
                        placeholder={placeholderFor(id)}
                      />
                    ))}
                  </FieldGrid>
                </FieldSection>
              </details>

              <Button type="submit" variant="gradient" size="xl" className="mt-4.5 w-full" disabled={loading}>
                {loading ? "Assessing…" : "Assess Flood Risk"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Result</CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="py-15 text-center leading-relaxed text-muted-foreground">
                Fill in the form and click <strong>Assess Flood Risk</strong> to see the predicted score, risk
                category, and AI-generated recommendations.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="mb-1.5 flex flex-col items-center gap-2">
                  <RiskGauge score={result.flood_risk_score} category={result.risk_category} animationKey={result.prediction_id} />
                  <span className={cn("inline-block rounded-full px-3.5 py-1 text-[0.85rem] font-bold tracking-[0.03em]", RISK_BADGE_CLASSES[result.risk_category])}>
                    {result.risk_category}
                  </span>
                  <div className="flex flex-wrap justify-center gap-3.5 text-[0.82rem] text-muted-foreground">
                    {Object.entries(result.base_model_scores).map(([k, v]) => (
                      <span key={k}>
                        {k.toUpperCase()}: {v.toFixed(3)}
                      </span>
                    ))}
                  </div>
                </div>

                {result.ood_flags.length > 0 && (
                  <div className="rounded-lg border border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.12)] px-3 py-2.5 text-[0.82rem] text-[#fdba74]">
                    <strong>Note:</strong> Some inputs are outside the typical training range — {result.ood_flags.join("; ")}
                  </div>
                )}

                {result.ai_report && (
                  <div className="rounded-[10px] border border-border bg-panel-2 px-4 py-3.5">
                    <span className="mb-2 block text-[0.7rem] uppercase tracking-[0.06em] text-muted-foreground">
                      {result.ai_report.source === "llm" ? "AI-generated (Claude)" : "Generated from a rule-based template"}
                    </span>
                    <p className="leading-relaxed">{result.ai_report.summary}</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
                      {result.ai_report.recommendations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 className="mb-2 text-[0.95rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                    Top contributing factors
                  </h3>
                  <FactorsChart factors={result.top_factors} />
                </div>

                <div className="flex flex-wrap items-center gap-3.5 border-t border-border pt-3.5">
                  <span className="text-sm">Was this useful? Rate it:</span>
                  <StarRating value={rating} onChange={handleRate} />
                  {feedbackSent && <span className="text-[0.85rem] text-risk-low">Thanks for your feedback!</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
