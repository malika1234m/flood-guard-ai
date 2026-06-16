import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Building2, CloudRain, Droplets, Gauge as GaugeIcon, MapPin, Satellite, Share2, SlidersHorizontal } from "lucide-react";
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
  BASE_MODEL_NAMES,
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
  {
    id: "seasonal_index",
    label: "Seasonal flood-risk index",
    helper: "Reflects how flood-prone the current season typically is in this district.",
  },
  {
    id: "terrain_roughness_index",
    label: "Terrain roughness index",
    helper: "Describes how uneven or hilly the surrounding land is.",
  },
  {
    id: "socioeconomic_status_index",
    label: "Socioeconomic index",
    helper: "A general measure of the area's economic development and living standards.",
  },
  {
    id: "extreme_weather_index",
    label: "Extreme weather index",
    helper: "Reflects how often this district experiences extreme weather events.",
  },
] as const satisfies readonly { id: keyof FormState; label: string; helper: string }[];

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

  async function handleShare() {
    if (!result) return;
    const text =
      `FloodGuard AI — Flood Risk Assessment\n\n` +
      `District: ${form.district}\n` +
      `Risk: ${result.risk_category} (score: ${result.flood_risk_score.toFixed(3)})\n` +
      (result.ai_report ? `\n${result.ai_report.summary}` : "") +
      `\n\nAssessed at https://floodguard-production.up.railway.app/predict`;
    if (navigator.share) {
      await navigator.share({ title: "FloodGuard AI Risk Assessment", text });
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("Assessment copied to clipboard");
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
        title="Check Your Flood Risk"
        description="Answer a few questions about a location anywhere in Sri Lanka to get an instant risk score, a plain-language explanation, and recommended next steps. The form starts with typical values for a calm day — change anything you know about the location and leave the rest as-is."
        image="/hero/flood-network-bg.webp"
        imageAlt="Aerial view of a Sri Lankan coastal town at dusk, overlaid with a glowing AI sensor-network mesh"
        overlay={
          <div className="absolute inset-5 z-10 hidden flex-col items-end justify-between sm:flex">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#04101f]/45 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-md">
              <span className="pulse-dot" />
              <Satellite className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              AI scanning this location
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#04101f]/45 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-md">
              <GaugeIcon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              Model v{info?.version ?? "—"}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5.5 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">About the Location</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldSection title="Location" icon={MapPin} description="Pinpoint the location on a map, or use your best estimate for the area.">
                <FieldGrid>
                  <SelectField id="district" label="District" value={form.district} onChange={set("district")} options={options?.district ?? []} />
                  <SelectField id="urban_rural" label="Urban or rural" value={form.urban_rural} onChange={set("urban_rural")} options={options?.urban_rural ?? []} />
                  <NumberField
                    id="latitude"
                    label="Latitude"
                    value={form.latitude}
                    onChange={set("latitude")}
                    step="0.0001"
                    required
                    helperText="Right-click the location on Google Maps and copy the first number shown."
                  />
                  <NumberField
                    id="longitude"
                    label="Longitude"
                    value={form.longitude}
                    onChange={set("longitude")}
                    step="0.0001"
                    required
                    helperText="The second number from the same map coordinates."
                  />
                  <SelectField
                    id="landcover"
                    label="Land cover"
                    value={form.landcover}
                    onChange={set("landcover")}
                    options={options?.landcover ?? []}
                    helperText="What mostly covers the ground here."
                  />
                  <SelectField
                    id="soil_type"
                    label="Soil type"
                    value={form.soil_type}
                    onChange={set("soil_type")}
                    options={options?.soil_type ?? []}
                    helperText="The dominant soil type in the area, if known."
                  />
                </FieldGrid>
              </FieldSection>

              <FieldSection title="Climate & Terrain" icon={CloudRain} description="Rainfall, ground conditions, and vegetation around the location.">
                <FieldGrid>
                  <NumberField
                    id="elevation_m"
                    label="Elevation (m)"
                    value={form.elevation_m}
                    onChange={set("elevation_m")}
                    step="0.1"
                    required
                    helperText="Height above sea level. Lower-lying areas are generally at higher risk."
                  />
                  <NumberField
                    id="distance_to_river_m"
                    label="Distance to nearest river (m)"
                    value={form.distance_to_river_m}
                    onChange={set("distance_to_river_m")}
                    step="1"
                    required
                  />
                  <NumberField
                    id="rainfall_7d_mm"
                    label="Rainfall, last 7 days (mm)"
                    value={form.rainfall_7d_mm}
                    onChange={set("rainfall_7d_mm")}
                    step="0.1"
                    required
                    helperText="Total rainfall recorded in this area over the past week."
                  />
                  <NumberField
                    id="monthly_rainfall_mm"
                    label="Typical monthly rainfall (mm)"
                    value={form.monthly_rainfall_mm}
                    onChange={set("monthly_rainfall_mm")}
                    step="0.1"
                    required
                  />
                  <NumberField
                    id="drainage_index"
                    label="Drainage quality (0-2)"
                    value={form.drainage_index}
                    onChange={set("drainage_index")}
                    step="0.01"
                    required
                    helperText="How well rainwater drains away. 0 = very poor, water pools easily. 2 = excellent."
                  />
                  <NumberField
                    id="historical_flood_count"
                    label="Past flooding events"
                    value={form.historical_flood_count}
                    onChange={set("historical_flood_count")}
                    step="1"
                    required
                    helperText="How many times this area has flooded in recorded history."
                  />
                  <NumberField
                    id="ndvi"
                    label="Vegetation cover (NDVI, -1 to 1)"
                    value={form.ndvi}
                    onChange={set("ndvi")}
                    step="0.01"
                    required
                    helperText="How green the area is. -1 = bare ground or water, 1 = dense vegetation. Most land: 0.2 to 0.6."
                  />
                  <NumberField
                    id="ndwi"
                    label="Surface water index (NDWI, -1 to 1)"
                    value={form.ndwi}
                    onChange={set("ndwi")}
                    step="0.01"
                    required
                    helperText="How much open water is visible. -1 = dry land, 1 = mostly water. Most land: -0.2 to 0.2."
                  />
                  <SelectField
                    id="water_presence_flag"
                    label="Water body directly nearby?"
                    value={form.water_presence_flag}
                    onChange={set("water_presence_flag")}
                    options={options?.water_presence_flag ?? []}
                    helperText="Is there a river, lake, or reservoir right next to this location?"
                  />
                </FieldGrid>
              </FieldSection>

              <FieldSection title="Community & Infrastructure" icon={Building2} description="The people, buildings, and services around this location.">
                <FieldGrid>
                  <NumberField
                    id="population_density_per_km2"
                    label="Population density (people/km²)"
                    value={form.population_density_per_km2}
                    onChange={set("population_density_per_km2")}
                    step="1"
                    required
                    helperText="Roughly how many people live in each square kilometer of this area."
                  />
                  <NumberField
                    id="built_up_percent"
                    label="Built-up land (%)"
                    value={form.built_up_percent}
                    onChange={set("built_up_percent")}
                    step="0.1"
                    required
                    helperText="Share of the area covered by buildings and roads, rather than open land."
                  />
                  <NumberField
                    id="infrastructure_score"
                    label="Infrastructure quality (0-100)"
                    value={form.infrastructure_score}
                    onChange={set("infrastructure_score")}
                    step="0.1"
                    required
                    helperText="Overall quality of roads, utilities, and buildings. 0 = very poor, 100 = excellent."
                  />
                  <SelectField id="water_supply" label="Water supply" value={form.water_supply} onChange={set("water_supply")} options={options?.water_supply ?? []} />
                  <SelectField id="electricity" label="Electricity access" value={form.electricity} onChange={set("electricity")} options={options?.electricity ?? []} />
                  <SelectField id="road_quality" label="Road quality" value={form.road_quality} onChange={set("road_quality")} options={options?.road_quality ?? []} />
                  <NumberField
                    id="nearest_hospital_km"
                    label="Distance to nearest hospital (km)"
                    value={form.nearest_hospital_km}
                    onChange={set("nearest_hospital_km")}
                    step="0.1"
                    required
                  />
                  <NumberField
                    id="nearest_evac_km"
                    label="Distance to nearest evacuation center (km)"
                    value={form.nearest_evac_km}
                    onChange={set("nearest_evac_km")}
                    step="0.1"
                    required
                  />
                </FieldGrid>
              </FieldSection>

              <details className="mt-6 rounded-[10px] border border-border bg-white/[0.02] px-3.5 py-2">
                <summary className="flex cursor-pointer items-center gap-2 py-1.5 font-semibold text-brand">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  More options: current conditions &amp; fine-tuning (optional)
                </summary>

                <FieldSection title="Right now" description="If flooding is already happening at this location, add the details here.">
                  <FieldGrid>
                    <SelectField
                      id="flood_occurrence_current_event"
                      label="Is flooding happening right now?"
                      value={form.flood_occurrence_current_event}
                      onChange={set("flood_occurrence_current_event")}
                      options={["No", "Yes"]}
                    />
                    {form.flood_occurrence_current_event === "Yes" && (
                      <NumberField
                        id="inundation_area_sqm"
                        label="Approximate flooded area (sq. m)"
                        value={form.inundation_area_sqm}
                        onChange={set("inundation_area_sqm")}
                        step="1"
                        helperText="Roughly how much land is currently underwater."
                      />
                    )}
                    <SelectField
                      id="is_good_to_live"
                      label="Is this location currently livable?"
                      value={form.is_good_to_live}
                      onChange={set("is_good_to_live")}
                      options={["Yes", "No"]}
                      helperText="Leave as 'Yes' unless there's a serious, ongoing issue such as prolonged flooding."
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

                <FieldSection
                  title="Local fine-tuning"
                  description="These advanced figures are filled in automatically using typical values for the selected district. Only change them if you have more accurate local data."
                >
                  <FieldGrid>
                    {ADVANCED_INDEX_FIELDS.map(({ id, label, helper }) => (
                      <NumberField
                        key={id}
                        id={id}
                        label={label}
                        value={form[id]}
                        onChange={set(id)}
                        step="0.0001"
                        placeholder={placeholderFor(id)}
                        helperText={helper}
                      />
                    ))}
                  </FieldGrid>
                </FieldSection>
              </details>

              <Button type="submit" variant="gradient" size="xl" className="mt-4.5 w-full" disabled={loading}>
                {loading ? "Checking…" : "Check Flood Risk"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-22">
          <CardHeader>
            <CardTitle className="text-lg">Result</CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex flex-col items-center gap-3 py-15 text-center leading-relaxed text-muted-foreground">
                <Droplets className="h-10 w-10 text-brand/50" strokeWidth={1.5} aria-hidden="true" />
                <p>
                  Fill in the form and click <strong>Check Flood Risk</strong> to see the risk score, category, and
                  a plain-language report with recommended next steps.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="mb-1.5 flex flex-col items-center gap-2">
                  <RiskGauge score={result.flood_risk_score} category={result.risk_category} animationKey={result.prediction_id} />
                  <span className={cn("inline-block rounded-full px-3.5 py-1 text-[0.85rem] font-bold tracking-[0.03em]", RISK_BADGE_CLASSES[result.risk_category])}>
                    {result.risk_category} risk
                  </span>
                </div>

                {result.ood_flags.length > 0 && (
                  <div className="rounded-lg border border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.12)] px-3 py-2.5 text-[0.82rem] text-[#fdba74]">
                    <strong>Note:</strong> Some inputs are outside the typical range seen in our data —{" "}
                    {result.ood_flags.join("; ")}
                  </div>
                )}

                {result.ai_report && (
                  <div className="rounded-[10px] border border-border bg-panel-2 px-4 py-3.5">
                    <span className="mb-2 block text-[0.7rem] uppercase tracking-[0.06em] text-muted-foreground">
                      AI-generated risk report
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
                  <h3 className="mb-1 text-[0.95rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                    What influenced this result
                  </h3>
                  <p className="mb-2.5 text-[0.82rem] leading-snug text-muted-foreground/80">
                    These factors had the biggest impact on the score for this location.
                  </p>
                  <FactorsChart factors={result.top_factors} />
                </div>

                <details className="rounded-[10px] border border-border bg-white/[0.02] px-3.5 py-2 text-[0.82rem] text-muted-foreground">
                  <summary className="cursor-pointer py-1.5 font-semibold text-brand">Technical details</summary>
                  <div className="space-y-1.5 py-2">
                    <p>Model version: {result.model_version}</p>
                    <p>Response time: {result.latency_ms.toFixed(0)} ms</p>
                    <div className="flex flex-wrap gap-3.5 pt-1">
                      {Object.entries(result.base_model_scores).map(([k, v]) => (
                        <span key={k}>
                          {BASE_MODEL_NAMES[k] ?? k.toUpperCase()}: {v.toFixed(3)}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>

                <div className="flex flex-wrap items-center gap-3.5 border-t border-border pt-3.5">
                  <Button
                    type="button"
                    variant="brand-outline"
                    size="sm"
                    onClick={handleShare}
                    className="gap-1.5"
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Share result
                  </Button>
                  <span className="text-sm text-muted-foreground">Rate it:</span>
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
