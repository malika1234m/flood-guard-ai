import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, Building2, ChevronRight, CloudRain, Droplets, Gauge as GaugeIcon, MapPin, Satellite, Share2, SlidersHorizontal, Trees, Waves, Zap } from "lucide-react";
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

const PROVINCE_GROUPS = [
  { province: "Western",       color: "#38bdf8", districts: ["Colombo", "Gampaha", "Kalutara"] },
  { province: "Central",       color: "#6366f1", districts: ["Kandy", "Matale", "Nuwara Eliya"] },
  { province: "Southern",      color: "#22c55e", districts: ["Galle", "Hambantota", "Matara"] },
  { province: "Northern",      color: "#f97316", districts: ["Jaffna", "Kilinochchi", "Mannar", "Mullaitivu", "Vavuniya"] },
  { province: "Eastern",       color: "#eab308", districts: ["Ampara", "Batticaloa", "Trincomalee"] },
  { province: "North Western", color: "#a855f7", districts: ["Kurunegala", "Puttalam"] },
  { province: "North Central", color: "#14b8a6", districts: ["Anuradhapura", "Polonnaruwa"] },
  { province: "Uva",           color: "#f43f5e", districts: ["Badulla", "Moneragala"] },
  { province: "Sabaragamuwa",  color: "#84cc16", districts: ["Kegalle", "Ratnapura"] },
];

// ── Quick Mode step-2 options ─────────────────────────────────────────────────

const AREA_OPTIONS = [
  {
    key: "Urban",
    label: "Urban",
    desc: "Dense buildings, high traffic, limited drainage",
    color: "#38bdf8",
    icon: Building2,
  },
  {
    key: "Suburban",
    label: "Suburban",
    desc: "Mixed residential, moderate density — district typical",
    color: "#38bdf8",
    icon: Building2,
  },
  {
    key: "Rural",
    label: "Rural",
    desc: "Farmland, open land, low population density",
    color: "#22c55e",
    icon: Trees,
  },
] as const;

const TERRAIN_OPTIONS = [
  {
    key: "Lowland",
    label: "Low-lying / Near river",
    desc: "Flat land, close to a river, canal, or coast",
    color: "#0ea5e9",
    icon: Waves,
  },
  {
    key: "Typical",
    label: "Typical terrain",
    desc: "Average elevation for this district",
    color: "#38bdf8",
    icon: MapPin,
  },
  {
    key: "Highland",
    label: "Elevated / Hillside",
    desc: "Higher ground, slopes, or hill country",
    color: "#8b5cf6",
    icon: CloudRain,
  },
] as const;

const RAINFALL_OPTIONS = [
  { key: "Dry",     label: "Dry",     desc: "Little or no rain this week",           color: "#22c55e" },
  { key: "Normal",  label: "Normal",  desc: "Typical seasonal rainfall",              color: "#38bdf8" },
  { key: "Heavy",   label: "Heavy",   desc: "Sustained heavy rain — above average",   color: "#f97316" },
  { key: "Extreme", label: "Extreme", desc: "Severe rainfall, potential flash floods", color: "#ef4444" },
] as const;

type AreaKey    = typeof AREA_OPTIONS[number]["key"];
type TerrainKey = typeof TERRAIN_OPTIONS[number]["key"];
type RainfallKey = typeof RAINFALL_OPTIONS[number]["key"];

import type { DistrictProfile } from "@/lib/api";

function applyQuickModifiers(
  profile: DistrictProfile,
  area: AreaKey,
  terrain: TerrainKey,
  rainfall: RainfallKey,
  customElev: string,
  customRiver: string,
  customRain7d: string,
): Partial<DistrictProfile> {
  const p = profile;
  const out: Partial<DistrictProfile> = {};

  // Area type — affects density, built-up cover, drainage, infrastructure
  if (area === "Urban") {
    out.built_up_percent          = Math.min(95, p.built_up_percent + 25);
    out.population_density_per_km2 = p.population_density_per_km2 * 2.0;
    out.infrastructure_score      = Math.min(100, p.infrastructure_score + 8);
    out.drainage_index            = Math.max(0, p.drainage_index - 0.25);
    out.urban_rural               = "Urban";
  } else if (area === "Rural") {
    out.built_up_percent          = Math.max(2, p.built_up_percent - 20);
    out.population_density_per_km2 = p.population_density_per_km2 * 0.3;
    out.infrastructure_score      = Math.max(10, p.infrastructure_score - 15);
    out.drainage_index            = Math.min(2, p.drainage_index + 0.2);
    out.urban_rural               = "Rural";
  }

  // Terrain — affects elevation, river distance, water indices
  if (terrain === "Lowland") {
    out.elevation_m          = Math.max(1, p.elevation_m * 0.22);
    out.distance_to_river_m  = 75;
    out.water_presence_flag  = "Yes";
    out.ndwi                 = Math.min(0.75, p.ndwi + 0.35);
    out.drainage_index       = Math.max(0, (out.drainage_index ?? p.drainage_index) - 0.4);
  } else if (terrain === "Highland") {
    out.elevation_m         = p.elevation_m * 2.8;
    out.distance_to_river_m = p.distance_to_river_m * 2.5;
    out.drainage_index      = Math.min(2, (out.drainage_index ?? p.drainage_index) + 0.35);
    out.ndwi                = Math.max(-0.5, p.ndwi - 0.25);
    out.water_presence_flag = "No";
  }

  // Rainfall — affects 7-day and monthly totals
  if (rainfall === "Dry") {
    out.rainfall_7d_mm      = Math.round(p.rainfall_7d_mm * 0.12);
    out.monthly_rainfall_mm = Math.round(p.monthly_rainfall_mm * 0.38);
  } else if (rainfall === "Heavy") {
    out.rainfall_7d_mm      = Math.round(p.rainfall_7d_mm * 2.8);
    out.monthly_rainfall_mm = Math.round(p.monthly_rainfall_mm * 1.7);
  } else if (rainfall === "Extreme") {
    out.rainfall_7d_mm      = Math.round(p.rainfall_7d_mm * 6.5);
    out.monthly_rainfall_mm = Math.round(p.monthly_rainfall_mm * 2.6);
  }

  // User-entered custom overrides (highest priority)
  const elev  = parseFloat(customElev);
  const river = parseFloat(customRiver);
  const rain  = parseFloat(customRain7d);
  if (!isNaN(elev))  out.elevation_m         = elev;
  if (!isNaN(river)) out.distance_to_river_m = river;
  if (!isNaN(rain))  out.rainfall_7d_mm      = rain;

  return out;
}

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
  const [quickMode, setQuickMode] = useState(false);
  const [quickStep, setQuickStep] = useState<1 | 2>(1);
  const [quickDistrict, setQuickDistrict] = useState<string | null>(null);
  const [quickArea, setQuickArea]         = useState<AreaKey>("Suburban");
  const [quickTerrain, setQuickTerrain]   = useState<TerrainKey>("Typical");
  const [quickRainfall, setQuickRainfall] = useState<RainfallKey>("Normal");
  const [quickCustomElev, setQuickCustomElev]   = useState("");
  const [quickCustomRiver, setQuickCustomRiver] = useState("");
  const [quickCustomRain7d, setQuickCustomRain7d] = useState("");

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

  // Step 1 → Step 2: just record the district and advance
  function handleQuickDistrictSelect(district: string) {
    setQuickDistrict(district);
    setQuickArea("Suburban");
    setQuickTerrain("Typical");
    setQuickRainfall("Normal");
    setQuickCustomElev("");
    setQuickCustomRiver("");
    setQuickCustomRain7d("");
    setQuickStep(2);
  }

  // Step 2 → Run prediction with modifiers applied
  async function handleQuickSubmit() {
    const district = quickDistrict!;
    const profile  = info?.district_profiles[district];
    if (!profile) return;

    const mods = applyQuickModifiers(
      profile, quickArea, quickTerrain, quickRainfall,
      quickCustomElev, quickCustomRiver, quickCustomRain7d,
    );
    const merged = { ...profile, ...mods };

    // Keep the full form in sync so "Adjust details" works
    setForm({
      district,
      urban_rural:               merged.urban_rural,
      latitude:                  String(merged.latitude),
      longitude:                 String(merged.longitude),
      landcover:                 merged.landcover,
      soil_type:                 merged.soil_type,
      elevation_m:               String(merged.elevation_m),
      distance_to_river_m:      String(merged.distance_to_river_m),
      rainfall_7d_mm:            String(merged.rainfall_7d_mm),
      monthly_rainfall_mm:       String(merged.monthly_rainfall_mm),
      drainage_index:            String(merged.drainage_index),
      historical_flood_count:    String(merged.historical_flood_count),
      ndvi:                      String(merged.ndvi),
      ndwi:                      String(merged.ndwi),
      water_presence_flag:       merged.water_presence_flag,
      population_density_per_km2: String(merged.population_density_per_km2),
      built_up_percent:          String(merged.built_up_percent),
      infrastructure_score:      String(merged.infrastructure_score),
      water_supply:              merged.water_supply,
      electricity:               merged.electricity,
      road_quality:              merged.road_quality,
      nearest_hospital_km:       String(merged.nearest_hospital_km),
      nearest_evac_km:           String(merged.nearest_evac_km),
      flood_occurrence_current_event: quickRainfall === "Extreme" ? "Yes" : "No",
      inundation_area_sqm:       "0",
      is_good_to_live:           "Yes",
      reason_not_good_to_live:   "",
      seasonal_index:            String(merged.seasonal_index),
      terrain_roughness_index:   String(merged.terrain_roughness_index),
      socioeconomic_status_index: String(merged.socioeconomic_status_index),
      extreme_weather_index:     String(merged.extreme_weather_index),
    });

    const payload: PredictRequest = {
      latitude:                  merged.latitude,
      longitude:                 merged.longitude,
      elevation_m:               merged.elevation_m,
      distance_to_river_m:      merged.distance_to_river_m,
      population_density_per_km2: merged.population_density_per_km2,
      built_up_percent:          merged.built_up_percent,
      rainfall_7d_mm:            merged.rainfall_7d_mm,
      monthly_rainfall_mm:       merged.monthly_rainfall_mm,
      drainage_index:            merged.drainage_index,
      ndvi:                      merged.ndvi,
      ndwi:                      merged.ndwi,
      historical_flood_count:    merged.historical_flood_count,
      infrastructure_score:      merged.infrastructure_score,
      nearest_hospital_km:       merged.nearest_hospital_km,
      nearest_evac_km:           merged.nearest_evac_km,
      district,
      landcover:                 merged.landcover,
      soil_type:                 merged.soil_type,
      water_supply:              merged.water_supply,
      electricity:               merged.electricity,
      road_quality:              merged.road_quality,
      urban_rural:               merged.urban_rural,
      water_presence_flag:       merged.water_presence_flag,
      flood_occurrence_current_event: quickRainfall === "Extreme" ? "Yes" : "No",
      inundation_area_sqm:       null,
      is_good_to_live:           "Yes",
      reason_not_good_to_live:   null,
      seasonal_index:            merged.seasonal_index,
      terrain_roughness_index:   merged.terrain_roughness_index,
      socioeconomic_status_index: merged.socioeconomic_status_index,
      extreme_weather_index:     merged.extreme_weather_index,
      include_ai_report:         true,
    };

    setLoading(true);
    try {
      const data = await predict(payload);
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {quickMode && quickStep === 2 && (
                  <button
                    type="button"
                    onClick={() => setQuickStep(1)}
                    className="flex shrink-0 items-center gap-1 text-[0.78rem] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Districts
                  </button>
                )}
                {quickMode && quickStep === 2 && (
                  <span className="text-muted-foreground/40">/</span>
                )}
                <CardTitle className="text-lg truncate">
                  {!quickMode
                    ? "About the Location"
                    : quickStep === 1
                    ? "Quick Mode — Select District"
                    : quickDistrict ?? "Refine Location"
                  }
                </CardTitle>
              </div>
              <Button
                type="button"
                variant={quickMode ? "gradient" : "brand-outline"}
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => {
                  setQuickMode(!quickMode);
                  setQuickStep(1);
                  setQuickDistrict(null);
                }}
                disabled={!info}
              >
                <Zap className="h-3.5 w-3.5" />
                {quickMode ? "Full form" : "Quick Mode"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {quickMode ? (
              quickStep === 1 ? (
                /* ── Step 1: District selection ── */
                <div>
                  <p className="mb-5 text-[0.83rem] leading-relaxed text-muted-foreground">
                    Pick a district to start. You&apos;ll then choose the type of area within it
                    — terrain, density, and recent rainfall — before running the model.
                  </p>
                  <div className="space-y-5">
                    {PROVINCE_GROUPS.map(({ province, color, districts }) => (
                      <div key={province}>
                        <div className="mb-2.5 flex items-center gap-2">
                          <div className="h-1 w-6 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                            {province} Province
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {districts.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => handleQuickDistrictSelect(d)}
                              className={cn(
                                "group flex items-center gap-1.5 rounded-full border px-4 py-2 text-[0.82rem] font-semibold",
                                "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                                "border-border bg-white/[0.04] text-muted-foreground",
                                "hover:border-white/25 hover:bg-white/[0.08] hover:text-foreground hover:shadow-sm active:scale-[0.97]",
                              )}
                            >
                              {d}
                              <ChevronRight className="h-3 w-3 opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-60 group-hover:translate-x-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* ── Step 2: Refine location ── */
                <div className="space-y-6">

                  {/* Area type */}
                  <div>
                    <div className="mb-2 text-[0.75rem] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                      Area type
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AREA_OPTIONS.map(({ key, label, desc, color }) => {
                        const isActive = quickArea === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={desc}
                            onClick={() => setQuickArea(key)}
                            className={cn(
                              "rounded-lg border px-4 py-2.5 text-left transition-all duration-150",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                              isActive
                                ? "border-transparent text-white shadow-md"
                                : "border-border bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:bg-white/[0.07] hover:text-foreground",
                            )}
                            style={isActive ? { backgroundColor: color, boxShadow: `0 3px 12px ${color}35` } : undefined}
                          >
                            <div className="text-[0.82rem] font-semibold">{label}</div>
                            <div className={cn("mt-0.5 text-[0.68rem] leading-snug", isActive ? "text-white/75" : "text-muted-foreground/70")}>
                              {desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Terrain */}
                  <div>
                    <div className="mb-2 text-[0.75rem] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                      Location within district
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {TERRAIN_OPTIONS.map(({ key, label, desc, color, icon: Icon }) => {
                        const isActive = quickTerrain === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={desc}
                            onClick={() => setQuickTerrain(key)}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg border px-4 py-2.5 text-left transition-all duration-150",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                              isActive
                                ? "border-transparent text-white shadow-md"
                                : "border-border bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:bg-white/[0.07] hover:text-foreground",
                            )}
                            style={isActive ? { backgroundColor: color, boxShadow: `0 3px 12px ${color}35` } : undefined}
                          >
                            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isActive ? "text-white/90" : "text-muted-foreground/60")} />
                            <div>
                              <div className="text-[0.82rem] font-semibold">{label}</div>
                              <div className={cn("mt-0.5 text-[0.68rem] leading-snug", isActive ? "text-white/75" : "text-muted-foreground/70")}>
                                {desc}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rainfall */}
                  <div>
                    <div className="mb-2 text-[0.75rem] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                      Recent rainfall
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {RAINFALL_OPTIONS.map(({ key, label, desc, color }) => {
                        const isActive = quickRainfall === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={desc}
                            onClick={() => setQuickRainfall(key)}
                            className={cn(
                              "rounded-lg border px-4 py-2.5 text-left transition-all duration-150",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                              isActive
                                ? "border-transparent text-white shadow-md"
                                : "border-border bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:bg-white/[0.07] hover:text-foreground",
                            )}
                            style={isActive ? { backgroundColor: color, boxShadow: `0 3px 12px ${color}35` } : undefined}
                          >
                            <div className="text-[0.82rem] font-semibold">{label}</div>
                            <div className={cn("mt-0.5 text-[0.68rem] leading-snug", isActive ? "text-white/75" : "text-muted-foreground/70")}>
                              {desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Optional key overrides */}
                  <details className="rounded-[10px] border border-border bg-white/[0.02] px-3.5 py-2">
                    <summary className="cursor-pointer py-1.5 text-[0.8rem] font-semibold text-brand">
                      Enter exact values (optional)
                    </summary>
                    <p className="mt-1 mb-3 text-[0.75rem] text-muted-foreground leading-relaxed">
                      Know the specific details? Override any of the three most impactful fields.
                      Leave blank to use values derived from your selections above.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        { id: "qElev",  label: "Elevation (m)",           value: quickCustomElev,   set: setQuickCustomElev,   placeholder: "e.g. 15" },
                        { id: "qRiver", label: "Distance to river (m)",   value: quickCustomRiver,  set: setQuickCustomRiver,  placeholder: "e.g. 200" },
                        { id: "qRain",  label: "Last 7-day rainfall (mm)", value: quickCustomRain7d, set: setQuickCustomRain7d, placeholder: "e.g. 180" },
                      ].map(({ id, label, value, set: setter, placeholder }) => (
                        <div key={id}>
                          <label htmlFor={id} className="mb-1 block text-[0.72rem] font-semibold text-muted-foreground">
                            {label}
                          </label>
                          <input
                            id={id}
                            type="number"
                            value={value}
                            onChange={(e) => setter(e.target.value)}
                            placeholder={placeholder}
                            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/40"
                          />
                        </div>
                      ))}
                    </div>
                  </details>

                  {/* Submit */}
                  <Button
                    type="button"
                    variant="gradient"
                    size="xl"
                    className="w-full gap-2"
                    disabled={loading}
                    onClick={handleQuickSubmit}
                  >
                    {loading ? (
                      <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Running model…</>
                    ) : (
                      <>Get Flood Risk Reading</>
                    )}
                  </Button>

                  {/* Adjust in full form */}
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-[0.75rem] text-muted-foreground">
                      Need more control?
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuickMode(false)}
                      className="text-[0.78rem] font-semibold text-brand hover:underline"
                    >
                      Open full form with these values →
                    </button>
                  </div>
                </div>
              )
            ) : (
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
            )}
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-22">
          <CardHeader>
            <CardTitle className="text-lg">Result</CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex flex-col items-center gap-3 py-15 text-center leading-relaxed text-muted-foreground">
                {loading ? (
                  <>
                    <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
                    <div className="text-center">
                      <p className="font-semibold">Running model for <strong>{quickDistrict}</strong>…</p>
                      {quickMode && (
                        <p className="mt-1 text-[0.8rem] text-muted-foreground/70">
                          {quickArea} · {TERRAIN_OPTIONS.find(t => t.key === quickTerrain)?.label} · {quickRainfall} rainfall
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Droplets className="h-10 w-10 text-brand/50" strokeWidth={1.5} aria-hidden="true" />
                    <p>
                      {quickMode && quickStep === 1
                        ? "Select a district to continue."
                        : quickMode && quickStep === 2
                        ? <>Choose your conditions on the left, then click <strong>Get Flood Risk Reading</strong>.</>
                        : <>Fill in the form and click <strong>Check Flood Risk</strong> to see the risk score, category, and a plain-language report.</>
                      }
                    </p>
                  </>
                )}
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
