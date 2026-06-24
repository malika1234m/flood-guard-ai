import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CloudRain,
  Gauge,
  LocateFixed,
  MapPin,
  RefreshCw,
  Satellite,
  ShieldAlert,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskGauge } from "@/components/RiskGauge";
import { RISK_BADGE_CLASSES } from "@/lib/riskBadge";
import { cn } from "@/lib/utils";
import { BASE_MODEL_NAMES, getModelInfo, predict, type ModelInfo, type PredictRequest, type PredictResponse } from "@/lib/api";
import { getCurrentPosition, nearestDistrict, type GeoPosition } from "@/lib/geo";

const FALLBACK_LOCATION = { name: "Galle District", latitude: 6.0535, longitude: 80.221 };

const FALLBACK_RESULT: PredictResponse = {
  flood_risk_score: 0.78,
  risk_category: "High",
  raw_score: 0.78,
  calibration_shift: 0,
  base_model_scores: { lgb: 0.80, xgb: 0.79, cat: 0.78, catrmse: 0.76 },
  model_version: "preview",
  ood_flags: [],
  top_factors: [],
  ai_report: {
    summary:
      "Heavy monsoon rainfall combined with a low-lying, riverside location pushes this district into the high-risk band.",
    recommendations: [
      "Monitor river levels and move belongings above ground floor",
      "Keep evacuation routes to the nearest shelter clear",
      "Avoid travel through low-lying roads during heavy rain",
      "Coordinate with local authorities on relief readiness",
    ],
    source: "preview",
  },
  prediction_id: -1,
  latency_ms: 0,
};

interface SnapshotLocation {
  payload: PredictRequest;
  districtName: string;
  latitude: number;
  longitude: number;
  matchDistanceKm: number | null;
}

/** Galle District example payload, used before geolocation resolves and as a fallback
 * when location permission is denied or no district profile is available. */
function buildExamplePayload(info: ModelInfo): SnapshotLocation {
  const pick = (field: string, fallback: string) => info.categorical_options[field]?.[0] ?? fallback;
  const districtOptions = info.categorical_options.district ?? [];
  const district = districtOptions.includes("Galle") ? "Galle" : districtOptions[0] ?? "Galle";

  return {
    payload: {
      latitude: FALLBACK_LOCATION.latitude,
      longitude: FALLBACK_LOCATION.longitude,
      elevation_m: 4,
      distance_to_river_m: 180,
      population_density_per_km2: 2100,
      built_up_percent: 48,
      rainfall_7d_mm: 186,
      monthly_rainfall_mm: 340,
      drainage_index: 0.35,
      ndvi: 0.38,
      ndwi: 0.22,
      historical_flood_count: 4,
      infrastructure_score: 52,
      nearest_hospital_km: 3.2,
      nearest_evac_km: 2.4,
      district,
      landcover: pick("landcover", "Urban"),
      soil_type: pick("soil_type", "Silty"),
      water_supply: pick("water_supply", "Grid"),
      electricity: pick("electricity", "Grid"),
      road_quality: pick("road_quality", "Fair"),
      urban_rural: pick("urban_rural", "Urban"),
      water_presence_flag: pick("water_presence_flag", "Likely"),
      flood_occurrence_current_event: "No",
      inundation_area_sqm: null,
      is_good_to_live: "Yes",
      reason_not_good_to_live: null,
      seasonal_index: null,
      terrain_roughness_index: null,
      socioeconomic_status_index: null,
      extreme_weather_index: null,
      include_ai_report: true,
    },
    districtName: FALLBACK_LOCATION.name,
    latitude: FALLBACK_LOCATION.latitude,
    longitude: FALLBACK_LOCATION.longitude,
    matchDistanceKm: null,
  };
}

/** Builds a prediction payload for the user's real coordinates, using the nearest
 * district's typical conditions as a stand-in for fields we can't sense directly. */
function buildLocationPayload(info: ModelInfo, coords: GeoPosition): SnapshotLocation | null {
  const match = nearestDistrict(coords.latitude, coords.longitude, info.district_profiles);
  if (!match) return null;

  const { district, profile, distanceKm } = match;
  return {
    payload: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      elevation_m: profile.elevation_m,
      distance_to_river_m: profile.distance_to_river_m,
      population_density_per_km2: profile.population_density_per_km2,
      built_up_percent: profile.built_up_percent,
      rainfall_7d_mm: profile.rainfall_7d_mm,
      monthly_rainfall_mm: profile.monthly_rainfall_mm,
      drainage_index: profile.drainage_index,
      ndvi: profile.ndvi,
      ndwi: profile.ndwi,
      historical_flood_count: profile.historical_flood_count,
      infrastructure_score: profile.infrastructure_score,
      nearest_hospital_km: profile.nearest_hospital_km,
      nearest_evac_km: profile.nearest_evac_km,
      district,
      landcover: profile.landcover,
      soil_type: profile.soil_type,
      water_supply: profile.water_supply,
      electricity: profile.electricity,
      road_quality: profile.road_quality,
      urban_rural: profile.urban_rural,
      water_presence_flag: profile.water_presence_flag,
      flood_occurrence_current_event: "No",
      inundation_area_sqm: null,
      is_good_to_live: "Yes",
      reason_not_good_to_live: null,
      seasonal_index: profile.seasonal_index,
      terrain_roughness_index: profile.terrain_roughness_index,
      socioeconomic_status_index: profile.socioeconomic_status_index,
      extreme_weather_index: profile.extreme_weather_index,
      include_ai_report: true,
    },
    districtName: district,
    latitude: coords.latitude,
    longitude: coords.longitude,
    matchDistanceKm: distanceKm,
  };
}

function buildConditions(payload: PredictRequest) {
  return [
    { label: "Rain (7d)", value: `${Math.round(payload.rainfall_7d_mm)} mm` },
    { label: "Monthly rain", value: `${Math.round(payload.monthly_rainfall_mm)} mm` },
    { label: "Drainage", value: `${payload.drainage_index.toFixed(2)} / 2` },
    { label: "Elevation", value: `${Math.round(payload.elevation_m)} m` },
    { label: "Population density", value: `${Math.round(payload.population_density_per_km2).toLocaleString()}/km²` },
    { label: "Infrastructure score", value: `${Math.round(payload.infrastructure_score)} / 100` },
  ];
}

const INITIAL_CONDITIONS = [
  { label: "Rain (7d)", value: "186 mm" },
  { label: "Monthly rain", value: "340 mm" },
  { label: "Drainage", value: "0.35 / 2" },
  { label: "Elevation", value: "4 m" },
  { label: "Population density", value: "2,100/km²" },
  { label: "Infrastructure score", value: "52 / 100" },
];

type LocationStatus = "pending" | "granted" | "unavailable";

/** Live preview of the FloodGuard AI risk engine, styled as a flood-intelligence dashboard. */
export function LiveRiskPreview() {
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(() => new Date());
  const [coords, setCoords] = useState<GeoPosition | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("pending");
  const [snapshotLocation, setSnapshotLocation] = useState<SnapshotLocation | null>(null);

  const refresh = useCallback(async (coordsOverride?: GeoPosition | null) => {
    setLoading(true);
    try {
      const info = await getModelInfo();
      const activeCoords = coordsOverride !== undefined ? coordsOverride : coords;
      const located = activeCoords ? buildLocationPayload(info, activeCoords) : null;
      const snapshot = located ?? buildExamplePayload(info);
      setSnapshotLocation(snapshot);
      const data = await predict(snapshot.payload);
      setResult(data);
    } catch {
      setResult(FALLBACK_RESULT);
    } finally {
      setLoading(false);
    }
  }, [coords]);

  const requestLocation = useCallback(async () => {
    setLocationStatus("pending");
    const pos = await getCurrentPosition();
    setCoords(pos);
    setLocationStatus(pos ? "granted" : "unavailable");
    await refresh(pos);
  }, [refresh]);

  useEffect(() => {
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const data = result ?? FALLBACK_RESULT;
  const recommendations = data.ai_report?.recommendations ?? FALLBACK_RESULT.ai_report!.recommendations;
  const conditions = snapshotLocation ? buildConditions(snapshotLocation.payload) : INITIAL_CONDITIONS;
  const usingUserLocation = locationStatus === "granted" && !!snapshotLocation && snapshotLocation.matchDistanceKm !== null;
  const districtName = snapshotLocation?.districtName ?? FALLBACK_LOCATION.name;
  const latitude = snapshotLocation?.latitude ?? FALLBACK_LOCATION.latitude;
  const longitude = snapshotLocation?.longitude ?? FALLBACK_LOCATION.longitude;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[36px] bg-[radial-gradient(60%_60%_at_50%_35%,rgba(56,189,248,0.3),transparent_70%)] blur-[90px]" />
      <div className="relative overflow-hidden rounded-[20px] shadow-elevated ring-1 ring-white/10 lg:h-[680px]">
        <img
          src="/hero/flood-network-bg.webp"
          alt="Aerial view of a flooded Sri Lankan coastal town at dusk, overlaid with a glowing AI sensor-network mesh"
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#04101f]/55 via-transparent to-[#04101f]/60" />

        {/* Status bar */}
        <div className="relative z-10 m-5 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#04101f]/35 px-3 py-2.5 backdrop-blur-md sm:m-6 sm:mb-5 lg:absolute lg:inset-x-5 lg:top-5 lg:m-0">
          <div>
            <div className="flex items-center gap-2 text-sm font-extrabold tracking-tight">
              <Satellite className="h-4 w-4 text-brand" aria-hidden="true" />
              Sri Lanka Flood Intelligence System
            </div>
            <div className="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {usingUserLocation
                ? "AI-powered flood risk analysis · your location"
                : "AI-powered flood risk analysis · example location"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur-md sm:inline-flex">
              <span className="pulse-dot" /> System active
            </span>
            <span className="rounded-full border border-border bg-white/5 px-3 py-1 text-xs font-semibold tabular-nums text-muted-foreground backdrop-blur-md">
              {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <Button variant="brand-outline" size="sm" onClick={() => refresh()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Left column: location (top) + conditions/ensemble (bottom) */}
        <div className="relative z-10 mx-5 mb-4 flex flex-col gap-4 sm:mx-6 lg:absolute lg:inset-x-auto lg:top-[84px] lg:bottom-[76px] lg:left-5 lg:mx-0 lg:mb-0 lg:w-[300px] lg:justify-between">
          <PreviewPanel icon={MapPin} title={usingUserLocation ? "Your location" : "Example location"}>
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.35),rgba(11,19,32,0.9)_70%)]">
                <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:10px_10px]" />
                <span className="absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_12px_3px_rgba(56,189,248,0.7)]" />
              </div>
              <div>
                <div className="text-base font-bold">
                  {usingUserLocation ? `Near ${districtName}, Sri Lanka` : `${districtName}, Sri Lanka`}
                </div>
                <div className="text-sm text-muted-foreground">
                  {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°E
                </div>
                {usingUserLocation && snapshotLocation?.matchDistanceKm != null && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Using {districtName} district profile (~{Math.round(snapshotLocation.matchDistanceKm)} km away)
                  </div>
                )}
                {!usingUserLocation && (
                  <button
                    type="button"
                    onClick={requestLocation}
                    disabled={loading}
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand/20 disabled:opacity-50"
                  >
                    <LocateFixed className="h-3 w-3" aria-hidden="true" />
                    {locationStatus === "pending" ? "Detecting your location…" : "Show risk for my location"}
                  </button>
                )}
              </div>
            </div>
          </PreviewPanel>

          <PreviewPanel icon={CloudRain} title="Conditions analyzed">
            <div className="grid grid-cols-2 gap-3">
              {conditions.map((c) => (
                <Stat key={c.label} {...c} />
              ))}
            </div>
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-brand" aria-hidden="true" /> Model ensemble
              </div>
              <div className="flex flex-col gap-2.5">
                {Object.entries(data.base_model_scores).map(([k, v]) => (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold text-muted-foreground">{BASE_MODEL_NAMES[k] ?? k.toUpperCase()}</span>
                      <span className="font-bold tabular-nums">{v.toFixed(3)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2"
                        style={{ width: `${Math.max(0, Math.min(100, v * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PreviewPanel>
        </div>

        {/* Right column: risk gauge (top) + recommended actions (bottom) */}
        <div className="relative z-10 mx-5 mb-4 flex flex-col gap-4 sm:mx-6 lg:absolute lg:inset-x-auto lg:top-[84px] lg:bottom-[76px] lg:right-5 lg:mx-0 lg:mb-0 lg:w-[280px] lg:justify-between">
          <PreviewPanel icon={Gauge} title="AI flood risk index" className="text-center">
            <div className="flex flex-col items-center gap-2.5">
              <RiskGauge score={data.flood_risk_score} category={data.risk_category} animationKey={result?.prediction_id} />
              <span className={cn("inline-block rounded-full px-3.5 py-1 text-[0.85rem] font-bold tracking-[0.03em]", RISK_BADGE_CLASSES[data.risk_category])}>
                {data.risk_category} risk
              </span>
            </div>
          </PreviewPanel>

          <PreviewPanel icon={ShieldAlert} title="Recommended actions">
            <ul className="space-y-2 text-sm leading-relaxed">
              {recommendations.slice(0, 3).map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                  <span className="text-muted-foreground">{r}</span>
                </li>
              ))}
            </ul>
          </PreviewPanel>
        </div>

        {/* Bottom nav */}
        <div className="relative z-10 mx-5 mb-5 flex flex-wrap items-center justify-center gap-2 sm:mx-6 sm:mb-6 lg:absolute lg:inset-x-5 lg:bottom-5 lg:m-0">
          {usingUserLocation ? (
            <Link
              to={`/district?district=${encodeURIComponent(districtName)}`}
              className="flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-bold text-[#04101f] shadow-lg transition-all hover:bg-brand/90 hover:scale-[1.03] active:scale-[0.98]"
            >
              <MapPin className="h-4 w-4" />
              View {districtName} evacuation map →
            </Link>
          ) : (
            <PreviewNavLink to="/predict" icon={Gauge} label="Run an assessment" />
          )}
          <PreviewNavLink to="/dashboard" icon={Activity} label="Live monitoring" />
          <PreviewNavLink to="/impact" icon={Waves} label="Ditwah impact" />
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({
  icon: Icon,
  title,
  className,
  children,
}: {
  icon: typeof MapPin;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-[14px] border border-white/15 bg-[#04101f]/40 p-4 shadow-[0_8px_24px_rgba(2,8,23,0.45)] backdrop-blur-md", className)}>
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-brand" aria-hidden="true" /> {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[0.7rem] uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
    </div>
  );
}

function PreviewNavLink({ to, icon: Icon, label }: { to: string; icon: typeof MapPin; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-md transition-colors hover:border-brand hover:text-brand"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Link>
  );
}
