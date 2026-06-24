import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Clock,
  CloudRain,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getLiveRisks,
  getModelInfo,
  getReports,
  submitReport,
  type FloodReport,
  type FloodReportRequest,
  type LiveDistrictRisk,
} from "@/lib/api";
import { getCurrentPosition, nearestDistrict } from "@/lib/geo";
import { RISK_BADGE_CLASSES } from "@/lib/riskBadge";
import { FloodRiskMap, RISK_COLORS } from "@/components/FloodRiskMap";

// ── Constants ─────────────────────────────────────────────────────────────────

const EMERGENCY_CONTACTS = [
  { name: "DMC Emergency", number: "117", color: "#ef4444" },
  { name: "Police", number: "119", color: "#f97316" },
  { name: "Ambulance", number: "110", color: "#22c55e" },
  { name: "Suwa Sariya", number: "1990", color: "#38bdf8" },
];

const GUIDANCE: Record<
  string,
  { title: string; steps: string[]; }
> = {
  Low: {
    title: "Stay informed",
    steps: [
      "Normal activities are safe — no immediate action needed.",
      "Check weather updates regularly during the rainy season.",
      "Confirm your family knows the nearest evacuation centre.",
      "Keep emergency supplies (water, food, documents) accessible.",
    ],
  },
  Moderate: {
    title: "Be prepared",
    steps: [
      "Prepare your emergency go-bag: documents, medications, cash, phone charger.",
      "Identify your nearest evacuation centre and the route to reach it.",
      "Monitor water levels in rivers and drains close to your home.",
      "Call DMC info line 117 for the latest updates on your district.",
      "Move valuables and electrical equipment off the floor.",
    ],
  },
  High: {
    title: "Take action now",
    steps: [
      "Consider evacuating low-lying areas — don't wait for water to enter.",
      "Call 117 (DMC) immediately if you need guidance or help evacuating.",
      "Secure your home: turn off electricity at the main switch, close gas valves.",
      "Stay off flooded roads — even 30 cm of fast water can sweep a vehicle.",
      "Keep children and the elderly away from riverbanks and drains.",
    ],
  },
  Severe: {
    title: "EVACUATE IMMEDIATELY",
    steps: [
      "Leave NOW — do not wait for floodwater to reach you.",
      "Call 117 (DMC) or 119 (Police) if you need rescue assistance.",
      "Move to the nearest evacuation centre or high ground.",
      "DO NOT drive through floodwater — turn around, find another route.",
      "If trapped, call 117 and signal rescuers from the highest point.",
    ],
  },
};

const DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo",
  "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara",
  "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar",
  "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya",
  "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya",
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskGauge({ score, category }: { score: number; category: string }) {
  const color = RISK_COLORS[category] ?? "#38bdf8";
  const pct = Math.round(score * 100);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
        <circle
          cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 56 56)"
          style={{ transition: "stroke-dasharray 0.9s ease" }}
        />
        <text x="56" y="52" textAnchor="middle" fill={color} fontSize="21" fontWeight="800" fontFamily="inherit">
          {pct}
        </text>
        <text x="56" y="67" textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="11" fontFamily="inherit">
          / 100
        </text>
      </svg>
      <span className={cn("mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold", RISK_BADGE_CLASSES[category])}>
        {category} Risk
      </span>
    </div>
  );
}

function TrendBadge({ trend, delta }: { trend: string; delta: number }) {
  if (trend === "Worsening")
    return (
      <span className="flex items-center gap-1 text-sm font-bold text-red-400">
        <TrendingUp className="h-4 w-4" /> Worsening (+{(delta * 100).toFixed(0)}%)
      </span>
    );
  if (trend === "Improving")
    return (
      <span className="flex items-center gap-1 text-sm font-bold text-green-400">
        <TrendingDown className="h-4 w-4" /> Improving ({(delta * 100).toFixed(0)}%)
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
      <Minus className="h-4 w-4" /> Stable
    </span>
  );
}

// ── Subdivision analysis panel ────────────────────────────────────────────────

interface SubdivisionFeature {
  subdivision: string;
  zone: string;
  blended_risk: number;
  blend_color: string;
  evac_rank: number;
  flood_rank: number;
}

function SubdivisionPanel({
  district,
  districtScore,
}: {
  district: string;
  districtScore: number;
}) {
  const [subdivisions, setSubdivisions] = useState<SubdivisionFeature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/geodata/srilanka_subdivisions.geojson")
      .then((r) => r.json())
      .then((data: { features: { properties: SubdivisionFeature & { district: string; risk_modifier: number } }[] }) => {
        const distName = district.replace(/_/g, " ").trim();
        const subs = data.features
          .filter((f) => f.properties.district === distName)
          .map((f) => {
            const p = f.properties;
            const blended = districtScore * 0.6 + p.risk_modifier * 0.4;
            const blend_color =
              blended >= 0.62 ? "#ef4444"
              : blended >= 0.48 ? "#f97316"
              : blended >= 0.34 ? "#eab308"
              : "#22c55e";
            return { ...p, blended_risk: blended, blend_color } as SubdivisionFeature;
          })
          .sort((a, b) => b.blended_risk - a.blended_risk);
        setSubdivisions(subs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [district, districtScore]);

  const floodZones = subdivisions.filter((s) => s.zone === "flood_zone");
  const safeZones = subdivisions.filter((s) => s.zone === "safe_zone");
  const moderate = subdivisions.filter((s) => s.zone === "moderate");

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading area analysis…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Flood hotspots */}
      {floodZones.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Waves className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[0.72rem] font-extrabold uppercase tracking-[0.07em] text-red-400">
              Highest Flood Risk Areas
            </span>
          </div>
          <div className="space-y-1.5">
            {floodZones.map((s) => (
              <div
                key={s.subdivision}
                className="flex items-center justify-between rounded-xl border border-red-500/25 bg-red-500/08 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🌊</span>
                  <div>
                    <div className="text-sm font-bold">{s.subdivision}</div>
                    <div className="text-[0.68rem] text-red-300/70">High likelihood of inundation</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-extrabold tabular-nums text-red-400">
                    {Math.round(s.blended_risk * 100)}%
                  </div>
                  <div className="text-[0.6rem] text-red-400/60">risk</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Safe evacuation zones */}
      {safeZones.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
            <span className="text-[0.72rem] font-extrabold uppercase tracking-[0.07em] text-green-400">
              Safest Evacuation Areas
            </span>
          </div>
          <div className="space-y-1.5">
            {safeZones.map((s, i) => (
              <div
                key={s.subdivision}
                className="flex items-center justify-between rounded-xl border border-green-500/25 bg-green-500/08 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🛡</span>
                  <div>
                    <div className="text-sm font-bold">{s.subdivision}</div>
                    <div className="text-[0.68rem] text-green-300/70">
                      {i === 0 ? "Best evacuation point" : "Recommended safe area"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-extrabold tabular-nums text-green-400">
                    {Math.round(s.blended_risk * 100)}%
                  </div>
                  <div className="text-[0.6rem] text-green-400/60">risk</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other subdivisions */}
      {moderate.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none text-[0.7rem] font-bold text-muted-foreground hover:text-white/70">
            <span className="group-open:hidden">▶ Show all {moderate.length} other areas</span>
            <span className="hidden group-open:inline">▼ Hide other areas</span>
          </summary>
          <div className="mt-2 space-y-1">
            {moderate.map((s) => (
              <div
                key={s.subdivision}
                className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ backgroundColor: `${s.blend_color}08`, borderLeft: `2px solid ${s.blend_color}40` }}
              >
                <span className="text-sm">{s.subdivision}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: s.blend_color }}>
                  {Math.round(s.blended_risk * 100)}%
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: FloodReport }) {
  const SEV: Record<string, string> = { minor: "#eab308", moderate: "#f97316", severe: "#ef4444" };
  const c = SEV[report.severity] ?? "#38bdf8";
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: `${c}25`, backgroundColor: `${c}07` }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[0.68rem] font-extrabold uppercase tracking-wide" style={{ color: c }}>
          {report.severity}
        </span>
        <span className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
          <Clock className="h-3 w-3" /> {report.time_ago}
        </span>
      </div>
      <p className="text-sm leading-[1.55]">{report.description}</p>
      {report.reporter_name && (
        <p className="mt-1 text-xs text-muted-foreground">— {report.reporter_name}</p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function District() {
  const [searchParams] = useSearchParams();
  const initialDistrict = searchParams.get("district") ?? "Colombo";
  const [selectedDistrict, setSelectedDistrict] = useState(
    DISTRICTS.includes(initialDistrict) ? initialDistrict : "Colombo",
  );
  const [risks, setRisks] = useState<LiveDistrictRisk[]>([]);
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportForm, setReportForm] = useState<FloodReportRequest>({
    district: DISTRICTS.includes(initialDistrict) ? initialDistrict : "Colombo",
    severity: "moderate",
    description: "",
    reporter_name: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Auto-detect nearest district from geolocation when no ?district= param given
  useEffect(() => {
    if (searchParams.get("district")) return;
    (async () => {
      const [pos, info] = await Promise.all([getCurrentPosition(), getModelInfo()]);
      if (!pos || !info?.district_profiles) return;
      const match = nearestDistrict(pos.latitude, pos.longitude, info.district_profiles);
      if (!match) return;
      setSelectedDistrict(match.district);
      setReportForm((f) => ({ ...f, district: match.district }));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = useCallback(async (district: string) => {
    setLoading(true);
    try {
      const [liveData, reportData] = await Promise.all([
        getLiveRisks(),
        getReports(district),
      ]);
      setRisks(liveData);
      setReports(reportData);
      setLastUpdated(new Date());
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedDistrict);
  }, [loadData, selectedDistrict]);

  const selectDistrict = (d: string) => {
    setSelectedDistrict(d);
    setReportForm((f) => ({ ...f, district: d }));
    setSubmitted(false);
    setShowReportForm(false);
    // On mobile, scroll the details panel into view
    if (window.innerWidth < 1024) {
      setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportForm.description.trim()) return;
    setSubmitting(true);
    try {
      await submitReport({ ...reportForm, reporter_name: reportForm.reporter_name || null });
      setSubmitted(true);
      setShowReportForm(false);
      setReportForm((f) => ({ ...f, description: "", reporter_name: "" }));
      const fresh = await getReports(selectedDistrict);
      setReports(fresh);
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  const current = risks.find((r) => r.district === selectedDistrict);
  const guidance = current ? GUIDANCE[current.live_category] ?? GUIDANCE.Low : null;
  const riskColor = current ? (RISK_COLORS[current.live_category] ?? "#38bdf8") : "#38bdf8";

  return (
    <div className="min-h-screen pb-12">
      {/* Page header */}
      <div className="px-4 pb-5 pt-5 text-center sm:px-6">
        <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-brand">
          Live Flood Risk · Sri Lanka
        </div>
        <h1 className="text-[1.75rem] font-extrabold tracking-[-0.02em] sm:text-3xl">
          District Risk Map
        </h1>
        <p className="mt-1.5 text-[0.88rem] text-muted-foreground">
          Click any district on the map to see real-time risk, guidance, and emergency contacts.
        </p>
      </div>

      {/* ── Two-column layout on large screens ── */}
      <div className="mx-auto max-w-[1340px] px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_400px] lg:gap-6 xl:gap-8">

        {/* ── LEFT: Map ── */}
        <div className="space-y-3">
          <FloodRiskMap
            liveRisks={risks}
            selectedDistrict={selectedDistrict}
            onDistrictClick={selectDistrict}
            loading={loading && risks.length === 0}
          />

          {/* District quick-select below map (visible on mobile/tablet, hidden when side panel shows) */}
          <div className="glass-panel rounded-[14px] p-4 lg:hidden">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Or select from list
            </label>
            <div className="relative">
              <select
                value={selectedDistrict}
                onChange={(e) => selectDistrict(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-panel-2 px-4 py-3 pr-10 text-sm font-semibold focus:border-brand focus:outline-none"
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* District risk summary grid — all 25 districts ranked */}
          <div className="glass-panel rounded-[14px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                All districts — ranked by risk
              </h2>
              {lastUpdated && (
                <button
                  onClick={() => loadData(selectedDistrict)}
                  className="flex items-center gap-1 text-[0.7rem] text-brand hover:text-brand/80"
                >
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {[...risks]
                .sort((a, b) => b.live_score - a.live_score)
                .map((r) => {
                  const c = RISK_COLORS[r.live_category] ?? "#38bdf8";
                  const isSelected = r.district === selectedDistrict;
                  return (
                    <button
                      key={r.district}
                      onClick={() => selectDistrict(r.district)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all hover:bg-white/5",
                        isSelected ? "border-white/20 bg-white/8" : "border-transparent",
                      )}
                    >
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: c }}
                      />
                      <span className="flex-1 text-[0.82rem] font-semibold">
                        {r.district}
                      </span>
                      <span
                        className="text-[0.78rem] font-extrabold tabular-nums"
                        style={{ color: c }}
                      >
                        {Math.round(r.live_score * 100)}%
                      </span>
                    </button>
                  );
                })}
              {risks.length === 0 &&
                DISTRICTS.map((d) => (
                  <button
                    key={d}
                    onClick={() => selectDistrict(d)}
                    className="flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left hover:bg-white/5"
                  >
                    <div className="h-2 w-2 shrink-0 rounded-full bg-white/20" />
                    <span className="flex-1 text-[0.82rem] font-semibold">{d}</span>
                    <span className="h-3 w-10 animate-pulse rounded bg-white/10" />
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Details panel ── */}
        <div ref={detailsRef} className="mt-5 space-y-4 lg:mt-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">

          {/* District selector (desktop only) */}
          <div className="glass-panel hidden rounded-[14px] p-4 lg:block">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Selected district
            </label>
            <div className="relative">
              <select
                value={selectedDistrict}
                onChange={(e) => selectDistrict(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-panel-2 px-4 py-3 pr-10 text-sm font-semibold focus:border-brand focus:outline-none"
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Risk card */}
          {loading && risks.length === 0 ? (
            <div className="glass-panel flex items-center justify-center rounded-[14px] py-12">
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
            </div>
          ) : current ? (
            <div
              className="rounded-[14px] border p-5"
              style={{
                borderColor: `${riskColor}30`,
                backgroundColor: `${riskColor}07`,
              }}
            >
              {/* District name */}
              <div className="mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" style={{ color: riskColor }} />
                <h2 className="text-xl font-extrabold tracking-[-0.01em]">
                  {current.district}
                </h2>
                {current.weather_live && (
                  <span className="ml-auto rounded-full bg-brand/12 px-2 py-0.5 text-[0.62rem] font-bold text-brand">
                    LIVE
                  </span>
                )}
              </div>

              {/* Gauge + stats */}
              <div className="flex items-center justify-between gap-4">
                <RiskGauge score={current.live_score} category={current.live_category} />
                <div className="flex-1 space-y-2.5">
                  <div>
                    <div className="mb-0.5 text-[0.68rem] text-muted-foreground">
                      Rainfall (7 days)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CloudRain className="h-4 w-4 text-blue-400" />
                      <span className="font-bold">{current.rainfall_7d_mm.toFixed(0)} mm</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 text-[0.68rem] text-muted-foreground">
                      Typical rainfall
                    </div>
                    <span className="text-sm">{current.typical_rainfall_7d_mm.toFixed(0)} mm</span>
                  </div>
                  <div>
                    <div className="mb-0.5 text-[0.68rem] text-muted-foreground">Trend</div>
                    <TrendBadge trend={current.trend} delta={current.trend_delta} />
                  </div>
                </div>
              </div>

              {lastUpdated && (
                <div className="mt-3 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                  <span className="pulse-dot" />
                  Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel rounded-[14px] p-5 text-center text-sm text-muted-foreground">
              No data for {selectedDistrict} — try refreshing.
            </div>
          )}

          {/* Sub-district flood analysis */}
          <div className="glass-panel rounded-[14px] p-4">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-brand" />
              <h3 className="text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                Area Analysis — {selectedDistrict}
              </h3>
            </div>
            <SubdivisionPanel
              district={selectedDistrict}
              districtScore={current?.live_score ?? 0.4}
            />
          </div>

          {/* Action guidance */}
          {guidance && current && (
            <div
              className="rounded-[14px] border p-4 space-y-3"
              style={{
                borderColor: `${riskColor}30`,
                backgroundColor: `${riskColor}07`,
              }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: riskColor }} />
                <h3 className="font-extrabold" style={{ color: riskColor }}>
                  {guidance.title}
                </h3>
              </div>
              <ul className="space-y-2">
                {guidance.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-[1.55]">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-extrabold"
                      style={{ backgroundColor: `${riskColor}20`, color: riskColor }}
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Emergency contacts */}
          <div className="glass-panel rounded-[14px] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> Emergency Contacts
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {EMERGENCY_CONTACTS.map((c) => (
                <a
                  key={c.name}
                  href={`tel:${c.number}`}
                  className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all hover:bg-white/5 active:scale-[0.98]"
                  style={{ borderColor: `${c.color}28`, backgroundColor: `${c.color}08` }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
                    style={{ backgroundColor: `${c.color}20`, color: c.color }}
                  >
                    {c.number}
                  </div>
                  <span className="text-[0.75rem] font-semibold leading-tight">{c.name}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Community flood reports */}
          <div className="glass-panel rounded-[14px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                Community Reports
              </h3>
              <button
                onClick={() => { setShowReportForm(!showReportForm); setSubmitted(false); }}
                className="flex items-center gap-1.5 rounded-full bg-brand/12 px-3 py-1.5 text-[0.72rem] font-bold text-brand hover:bg-brand/20 transition-colors"
              >
                <Send className="h-3 w-3" /> Report flooding
              </button>
            </div>

            {/* Report form */}
            {showReportForm && (
              <div className="mb-3 space-y-3 rounded-xl border border-border bg-panel-2 p-4">
                <div className="text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">
                  Submit a community flood report
                </div>
                {/* Severity */}
                <div>
                  <div className="mb-1.5 text-xs text-muted-foreground">Severity</div>
                  <div className="flex gap-2">
                    {(["minor", "moderate", "severe"] as const).map((s) => {
                      const cls = s === "severe"
                        ? "border-red-500 bg-red-500/15 text-red-400"
                        : s === "moderate"
                          ? "border-orange-500 bg-orange-500/15 text-orange-400"
                          : "border-yellow-500 bg-yellow-500/15 text-yellow-400";
                      return (
                        <button
                          key={s}
                          onClick={() => setReportForm((f) => ({ ...f, severity: s }))}
                          className={cn(
                            "flex-1 rounded-lg border py-1.5 text-xs font-bold capitalize transition-colors",
                            reportForm.severity === s ? cls : "border-border text-muted-foreground hover:border-white/20",
                          )}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Description */}
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">What are you seeing? *</div>
                  <textarea
                    value={reportForm.description}
                    onChange={(e) => setReportForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Roads flooded near the temple, water knee-deep on Main Street…"
                    rows={3}
                    maxLength={500}
                    className="w-full resize-none rounded-lg border border-border bg-panel px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-brand focus:outline-none"
                  />
                  <div className="mt-0.5 text-right text-[0.68rem] text-muted-foreground">
                    {reportForm.description.length}/500
                  </div>
                </div>
                {/* Name */}
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Your name (optional)</div>
                  <input
                    type="text"
                    value={reportForm.reporter_name ?? ""}
                    onChange={(e) => setReportForm((f) => ({ ...f, reporter_name: e.target.value }))}
                    placeholder="Anonymous"
                    maxLength={80}
                    className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-brand focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleSubmitReport}
                  disabled={submitting || !reportForm.description.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-[#04101f] transition-colors hover:bg-brand/90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit report
                </button>
              </div>
            )}

            {submitted && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Report submitted — thank you for helping your community.
              </div>
            )}

            {/* Reports list */}
            <div className="space-y-2">
              {reports.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-7 text-center text-sm text-muted-foreground">
                  No reports yet for {selectedDistrict}.
                  <br />
                  <span className="text-xs">Be the first to report if you see flooding.</span>
                </div>
              ) : (
                reports.map((r) => <ReportCard key={r.id} report={r} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
