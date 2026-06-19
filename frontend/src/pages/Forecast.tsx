import { useCallback, useEffect, useRef, useState } from "react";
import { CloudRain, TrendingDown, TrendingUp, Minus, Play, Pause, Droplets, RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RISK_BADGE_CLASSES } from "@/lib/riskBadge";
import { getAllForecasts, getModelInfo, type DistrictForecast, type ModelInfo } from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const TREND_META = {
  Worsening: { icon: TrendingUp,   color: "#ef4444", label: "Worsening" },
  Improving:  { icon: TrendingDown, color: "#22c55e", label: "Improving" },
  Stable:     { icon: Minus,        color: "#eab308", label: "Stable"    },
} as const;

const DAY_LABELS = ["Today", "+1d", "+2d", "+3d", "+4d", "+5d", "+6d", "+7d", "+8d", "+9d"];

const RISK_FILL: Record<string, string> = {
  Low: "#22c55e", Moderate: "#eab308", High: "#f97316", Severe: "#ef4444",
};

const ISLAND_POINTS =
  "23,99 24,87 35,70 39,50 36,32 58,21 80,17 93,24 99,38 99,65 142,73 153,99 173,127 187,140 200,164 221,199 238,225 253,268 252,314 246,343 232,367 194,387 176,384 117,405 111,401 77,392 59,377 52,348 37,305 38,278 35,195 34,149 27,112";

const DISTRICT_COORDS: Record<string, [number, number]> = {
  Ampara: [7.30, 81.67], Anuradhapura: [8.34, 80.41], Badulla: [6.99, 81.05],
  Batticaloa: [7.72, 81.69], Colombo: [6.93, 79.85], Galle: [6.05, 80.22],
  Gampaha: [7.09, 80.00], Hambantota: [6.12, 81.12], Jaffna: [9.66, 80.01],
  Kalutara: [6.58, 80.08], Kandy: [7.29, 80.63], Kegalle: [7.25, 80.35],
  Kilinochchi: [9.39, 80.39], Kurunegala: [7.47, 80.37], Mannar: [8.98, 79.90],
  Matale: [7.47, 80.62], Matara: [5.95, 80.55], Monaragala: [6.87, 81.35],
  Mullaitivu: [9.27, 80.82], NuwaraEliya: [6.97, 80.78], Polonnaruwa: [7.94, 81.00],
  Puttalam: [8.03, 79.84], Ratnapura: [6.68, 80.40], Trincomalee: [8.57, 81.23],
  Vavuniya: [8.75, 80.50],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function project(lat: number, lon: number): [number, number] {
  const x = 10 + ((lon - 79.6) / 2.4) * 260;
  const y = 10 + ((9.9 - lat) / 4.03) * 400;
  return [x, y];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ForecastMap({
  forecasts,
  selectedDay,
  activeDistrict,
  onDistrictClick,
}: {
  forecasts: DistrictForecast[];
  selectedDay: number;
  activeDistrict: string;
  onDistrictClick: (d: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="relative flex justify-center">
      <svg
        viewBox="0 0 280 420"
        className="w-full max-w-[210px]"
        aria-label="Sri Lanka flood risk map"
      >
        <polygon
          points={ISLAND_POINTS}
          fill="rgba(56,189,248,0.06)"
          stroke="rgba(56,189,248,0.25)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {forecasts.map((f) => {
          const coords = DISTRICT_COORDS[f.district];
          if (!coords) return null;
          const day = f.forecast_days[selectedDay];
          if (!day) return null;
          const [x, y] = project(coords[0], coords[1]);
          const fill = RISK_FILL[day.risk_category] ?? "#38bdf8";
          const isHovered = hovered === f.district;
          const isActive = activeDistrict === f.district;
          const isPulsing = day.risk_category === "Severe" || day.risk_category === "High";

          return (
            <g
              key={f.district}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered(f.district)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onDistrictClick(f.district)}
            >
              {isPulsing && (
                <circle
                  cx={x} cy={y} r={12}
                  fill={fill}
                  opacity={0.15}
                  style={{ animation: "pulse-severe 2s ease-out infinite" }}
                />
              )}
              <circle
                cx={x} cy={y}
                r={isActive ? 10 : isHovered ? 8.5 : 7}
                fill={fill}
                opacity={isActive ? 1 : isHovered ? 0.95 : 0.82}
                stroke={isActive ? "#fff" : isHovered ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.2)"}
                strokeWidth={isActive ? 2 : 0.5}
                style={{ transition: "r 0.15s ease, opacity 0.15s ease" }}
              />
              {(isHovered || isActive) && (
                <text
                  x={x} y={y - 13}
                  textAnchor="middle"
                  fontSize="7"
                  fill={isActive ? "#fff" : "#e6edf6"}
                  fontWeight="bold"
                >
                  {f.district}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="min-w-[160px] rounded-xl border border-border bg-panel-2 p-3 shadow-xl">
      <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-wide text-muted-foreground">
        {d.date_fmt}
      </div>
      <div
        className="mb-1 text-[1.1rem] font-extrabold tabular-nums"
        style={{ color: RISK_FILL[d.risk_category] ?? "#38bdf8" }}
      >
        {d.flood_risk_score.toFixed(3)}
      </div>
      <div className={cn("mb-2 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-bold", RISK_BADGE_CLASSES[d.risk_category])}>
        {d.risk_category}
      </div>
      <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
        <Droplets className="h-3 w-3 shrink-0" />
        {d.rainfall_mm} mm today · {d.cumulative_7d_mm} mm (7-day)
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass-panel animate-pulse rounded-[16px] p-4">
      <div className="mb-3 h-3 w-24 rounded-full bg-white/8" />
      <div className="mb-1.5 h-7 w-16 rounded-md bg-white/10" />
      <div className="h-3 w-20 rounded-full bg-white/6" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Forecast() {
  const [allForecasts, setAllForecasts] = useState<DistrictForecast[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [selected, setSelected] = useState<DistrictForecast | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [district, setDistrict] = useState("Colombo");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getModelInfo().then(setModelInfo).catch(() => {});
  }, []);

  const districts = modelInfo?.categorical_options.district ?? Object.keys(DISTRICT_COORDS);

  const loadForecast = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllForecasts();
      setAllForecasts(data);
      setLoaded(true);
      setLastUpdated(new Date());
      setSelectedDay(0);
      // pick the currently-selected district
      setSelected((prev) => {
        const target = prev?.district ?? district;
        return data.find((f) => f.district === target) ?? data[0];
      });
    } catch {
      // keep showing last data
    } finally {
      setLoading(false);
    }
  }, [district]);

  // Auto-load on mount
  useEffect(() => {
    loadForecast();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When district changes after loading, switch selected
  useEffect(() => {
    if (!loaded || !allForecasts.length) return;
    const pick = allForecasts.find((f) => f.district === district) ?? allForecasts[0];
    setSelected(pick);
    setSelectedDay(0);
    setPlaying(false);
  }, [district, loaded, allForecasts]);

  // Play/pause animation
  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setSelectedDay((d) => {
          if (d >= 9) { setPlaying(false); return 9; }
          return d + 1;
        });
      }, 800);
    } else {
      if (playRef.current) clearInterval(playRef.current);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing]);

  const chartData = selected?.forecast_days.map((d, i) => ({
    ...d,
    label: DAY_LABELS[i],
    date_fmt: formatDate(d.date),
  })) ?? [];

  const trend = selected ? TREND_META[selected.trend as keyof typeof TREND_META] : null;
  const TrendIcon = trend?.icon ?? Minus;

  return (
    <div>
      <PageHero
        title="10-Day Flood Forecast"
        description="Real Open-Meteo rainfall forecasts fed through the risk model for all 25 districts. Click any district on the map or table to compare, and animate the timeline to see how risk evolves day by day."
        image="/hero/flood-network-bg.webp"
        imageAlt="Flood forecast visualization"
        overlay={
          loaded && selected && trend ? (
            <div className="absolute inset-x-5 bottom-5 z-10 hidden items-center gap-5 overflow-x-auto rounded-xl border border-white/15 bg-[#04101f]/50 px-4 py-2.5 backdrop-blur-md sm:flex">
              <div className="flex items-center gap-2">
                <TrendIcon className="h-4 w-4" style={{ color: trend.color }} />
                <span className="text-sm font-extrabold" style={{ color: trend.color }}>{selected.trend}</span>
                <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">trend</span>
              </div>
              <span className="h-4 w-px shrink-0 bg-white/10" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-extrabold tabular-nums" style={{ color: RISK_FILL[selected.forecast_days[selected.peak_risk_day]?.risk_category ?? ""] }}>
                  {selected.peak_risk_score.toFixed(3)}
                </span>
                <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">peak score</span>
              </div>
              <span className="h-4 w-px shrink-0 bg-white/10" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-extrabold tabular-nums">{selected.avg_risk_score.toFixed(3)}</span>
                <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">10-day avg</span>
              </div>
              <span className="h-4 w-px shrink-0 bg-white/10" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-[0.8rem] font-bold text-foreground">{selected.district}</span>
                <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">selected</span>
              </div>
            </div>
          ) : undefined
        }
      />

      {/* ── Control bar ── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="district-select" className="text-[0.75rem] font-semibold text-muted-foreground">
            District
          </label>
          <select
            id="district-select"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <Button
          variant="brand-outline"
          size="sm"
          onClick={loadForecast}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {loading ? "Loading…" : "Refresh"}
        </Button>

        {lastUpdated && !loading && (
          <div className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
            <span className="pulse-dot" />
            Open-Meteo · updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
          <div className="glass-panel animate-pulse rounded-[20px] p-6">
            <div className="mb-4 h-5 w-48 rounded-full bg-white/8" />
            <div className="h-[260px] rounded-xl bg-white/[0.04]" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="animate-pulse rounded-[14px] border border-border bg-card p-3">
                <div className="mb-2 h-3 w-12 rounded-full bg-white/8" />
                <div className="mb-2 h-5 w-16 rounded-md bg-white/10" />
                <div className="h-3 w-10 rounded-full bg-white/6" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Loaded content ── */}
      {!loading && loaded && selected && (
        <div className="space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {[
              {
                label: "Peak risk day",
                value: formatDate(selected.forecast_days[selected.peak_risk_day]?.date ?? ""),
                sub: `Day ${selected.peak_risk_day + 1} of 10`,
              },
              {
                label: "Peak risk score",
                value: selected.peak_risk_score.toFixed(3),
                sub: selected.forecast_days[selected.peak_risk_day]?.risk_category,
                valueColor: RISK_FILL[selected.forecast_days[selected.peak_risk_day]?.risk_category ?? ""],
                subColor: RISK_FILL[selected.forecast_days[selected.peak_risk_day]?.risk_category ?? ""],
              },
              {
                label: "10-day average",
                value: selected.avg_risk_score.toFixed(3),
                sub: `Typical: ${selected.typical_score.toFixed(3)}`,
              },
              {
                label: "Overall trend",
                value: selected.trend,
                valueColor: trend?.color,
                sub: "over next 10 days",
                subColor: trend?.color,
              },
            ].map((kpi) => (
              <div key={kpi.label} className="glass-panel rounded-[16px] p-4">
                <div className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {kpi.label}
                </div>
                <div
                  className="text-[1.45rem] font-extrabold tabular-nums leading-tight"
                  style={{ color: kpi.valueColor }}
                >
                  {kpi.value}
                </div>
                <div
                  className="mt-0.5 text-[0.73rem] font-semibold"
                  style={{ color: kpi.subColor ?? "var(--color-text-muted)" }}
                >
                  {kpi.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Chart + Map */}
          <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
            {/* Risk timeline */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{selected.district} — next 10 days</CardTitle>
                    <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                      Click a point or drag the slider to inspect a specific day
                    </p>
                  </div>
                  <Button
                    variant="brand-outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      if (selectedDay === 9) setSelectedDay(0);
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing
                      ? <><Pause className="h-3.5 w-3.5" /> Pause</>
                      : <><Play  className="h-3.5 w-3.5" /> Animate</>
                    }
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={chartData}
                    margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
                    onClick={(e) => {
                      if (e?.activeTooltipIndex != null) {
                        setSelectedDay(e.activeTooltipIndex as number);
                        setPlaying(false);
                      }
                    }}
                  >
                    <defs>
                      <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="var(--color-text-muted)"
                      tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    />
                    <YAxis
                      domain={[0, 1]}
                      tickCount={6}
                      stroke="var(--color-text-muted)"
                      tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0.45} stroke="#eab308" strokeDasharray="4 3" strokeOpacity={0.45}
                      label={{ value: "Moderate", position: "insideTopRight", fontSize: 9, fill: "#eab308", opacity: 0.7 }} />
                    <ReferenceLine y={0.65} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.45}
                      label={{ value: "High", position: "insideTopRight", fontSize: 9, fill: "#ef4444", opacity: 0.7 }} />
                    <ReferenceLine x={DAY_LABELS[selectedDay]} stroke="#38bdf8" strokeWidth={2} strokeOpacity={0.8} />
                    <Area
                      type="monotone"
                      dataKey="flood_risk_score"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      fill="url(#riskGrad)"
                      dot={{ fill: "#38bdf8", r: 3.5, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: "#38bdf8", stroke: "#fff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>

                {/* Day slider */}
                <div className="mt-4 px-1">
                  <input
                    type="range"
                    min={0} max={9} step={1}
                    value={selectedDay}
                    onChange={(e) => { setSelectedDay(+e.target.value); setPlaying(false); }}
                    className="w-full cursor-pointer accent-[#38bdf8]"
                    aria-label="Select forecast day"
                  />
                  <div className="mt-1.5 flex justify-between text-[0.65rem] font-medium text-muted-foreground/70">
                    {DAY_LABELS.map((l) => <span key={l}>{l}</span>)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Map */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm leading-tight">
                  {DAY_LABELS[selectedDay]}
                  {selected.forecast_days[selectedDay] && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {formatDate(selected.forecast_days[selectedDay].date)}
                    </span>
                  )}
                </CardTitle>
                <p className="text-[0.72rem] text-muted-foreground">
                  Click a district dot to switch
                </p>
              </CardHeader>
              <CardContent className="pt-1">
                <ForecastMap
                  forecasts={allForecasts}
                  selectedDay={selectedDay}
                  activeDistrict={district}
                  onDistrictClick={(d) => setDistrict(d)}
                />
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 justify-center">
                  {(["Low", "Moderate", "High", "Severe"] as const).map((cat) => (
                    <div key={cat} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RISK_FILL[cat] }} />
                      <span className="text-[0.68rem] font-semibold" style={{ color: RISK_FILL[cat] }}>{cat}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Day-by-day cards */}
          <div>
            <h3 className="mb-3 text-[0.82rem] font-bold uppercase tracking-[0.07em] text-muted-foreground">
              Day-by-day breakdown
            </h3>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 xl:grid-cols-10">
              {selected.forecast_days.map((day, i) => {
                const isActive = i === selectedDay;
                const isPeak  = i === selected.peak_risk_day;
                const fill    = RISK_FILL[day.risk_category] ?? "#38bdf8";
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedDay(i); setPlaying(false); }}
                    className={cn(
                      "relative rounded-[14px] border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      isActive
                        ? "border-brand/60 bg-brand/8 shadow-[0_0_18px_rgba(56,189,248,0.18)]"
                        : "border-border bg-card hover:border-brand/30 hover:bg-white/[0.025]",
                    )}
                  >
                    {isPeak && (
                      <span className="absolute -top-2 right-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wide text-white shadow">
                        PEAK
                      </span>
                    )}
                    <div className="mb-0.5 text-[0.68rem] font-bold text-muted-foreground">{DAY_LABELS[i]}</div>
                    <div className="mb-2 text-[0.62rem] text-muted-foreground/60">{formatDate(day.date)}</div>
                    <div className="mb-1.5 text-[1.05rem] font-extrabold tabular-nums leading-none" style={{ color: fill }}>
                      {day.flood_risk_score.toFixed(3)}
                    </div>
                    <div className={cn("mb-2 inline-block rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold", RISK_BADGE_CLASSES[day.risk_category])}>
                      {day.risk_category}
                    </div>
                    <div className="flex items-center gap-0.5 text-[0.62rem] text-muted-foreground">
                      <Droplets className="h-2.5 w-2.5 shrink-0" />
                      <span>{day.rainfall_mm} mm</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* All-districts ranking */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">
                  All districts · {DAY_LABELS[selectedDay]} forecast
                </CardTitle>
                <span className="text-[0.72rem] text-muted-foreground">click a row to switch district</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border/50">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-panel">
                    <tr className="border-b border-border/60 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="py-2.5 pl-4 text-left">#</th>
                      <th className="py-2.5 pr-3 text-left">District</th>
                      <th className="py-2.5 pr-3 text-right">Risk score</th>
                      <th className="py-2.5 pr-3 text-right">Category</th>
                      <th className="hidden py-2.5 pr-3 text-right sm:table-cell">Rainfall</th>
                      <th className="hidden py-2.5 pr-4 text-right sm:table-cell">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...allForecasts]
                      .sort((a, b) =>
                        (b.forecast_days[selectedDay]?.flood_risk_score ?? 0) -
                        (a.forecast_days[selectedDay]?.flood_risk_score ?? 0),
                      )
                      .map((f, rank) => {
                        const day = f.forecast_days[selectedDay];
                        if (!day) return null;
                        const tm = TREND_META[f.trend as keyof typeof TREND_META];
                        const TIcon = tm.icon;
                        const isActive = f.district === district;
                        return (
                          <tr
                            key={f.district}
                            onClick={() => setDistrict(f.district)}
                            className={cn(
                              "cursor-pointer border-t border-border/40 transition-colors hover:bg-white/[0.03]",
                              isActive && "bg-brand/[0.06] font-semibold",
                              rank % 2 === 0 && !isActive && "bg-white/[0.012]",
                            )}
                          >
                            <td className="py-2.5 pl-4 text-[0.75rem] font-bold tabular-nums text-muted-foreground">
                              {rank + 1}
                            </td>
                            <td className="py-2.5 pr-3 font-semibold">
                              {f.district}
                              {isActive && (
                                <span className="ml-2 rounded-full bg-brand/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-brand">
                                  selected
                                </span>
                              )}
                            </td>
                            <td
                              className="py-2.5 pr-3 text-right tabular-nums font-bold"
                              style={{ color: RISK_FILL[day.risk_category] }}
                            >
                              {day.flood_risk_score.toFixed(3)}
                            </td>
                            <td className="py-2.5 pr-3 text-right">
                              <span className={cn("inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-bold", RISK_BADGE_CLASSES[day.risk_category])}>
                                {day.risk_category}
                              </span>
                            </td>
                            <td className="hidden py-2.5 pr-3 text-right tabular-nums text-[0.8rem] text-muted-foreground sm:table-cell">
                              {day.rainfall_mm} mm
                            </td>
                            <td className="hidden py-2.5 pr-4 text-right sm:table-cell">
                              <div className="flex items-center justify-end gap-1">
                                <TIcon className="h-3.5 w-3.5 shrink-0" style={{ color: tm.color }} />
                                <span className="text-[0.72rem] font-semibold" style={{ color: tm.color }}>
                                  {f.trend}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edge case: loaded but no data */}
      {!loading && loaded && !selected && (
        <div className="glass-panel flex flex-col items-center justify-center rounded-[20px] py-20 text-center">
          <CloudRain className="mb-4 h-12 w-12 text-brand/40" />
          <p className="text-base font-semibold text-muted-foreground">No forecast data available</p>
          <p className="mt-1 text-sm text-muted-foreground/60">Check the backend connection and try refreshing</p>
          <Button variant="brand-outline" size="sm" className="mt-5 gap-1.5" onClick={loadForecast}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      )}
    </div>
  );
}
