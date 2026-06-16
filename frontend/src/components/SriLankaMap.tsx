import { useEffect, useRef, useState } from "react";
import { getDistrictRisks, getModelInfo, type DistrictRisk, type ModelInfo } from "@/lib/api";

// Coastline derived from real lat/lon using the same projection as the bubbles:
//   x = 10 + ((lon - 79.6) / 2.4) * 260   y = 10 + ((9.9 - lat) / 4.03) * 400
// Points go clockwise: NW Mannar coast → Jaffna peninsula tip → east coast → south tip → west coast
const ISLAND_POINTS =
  "23,99 24,87 35,70 39,50 36,32 58,21 80,17 93,24 99,38 99,65 142,73 153,99 173,127 187,140 200,164 221,199 238,225 253,268 252,314 246,343 232,367 194,387 176,384 117,405 111,401 77,392 59,377 52,348 37,305 38,278 35,195 34,149 27,112";

const RISK_FILL: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  High: "#f97316",
  Severe: "#ef4444",
};

const RISK_ORDER = ["Severe", "High", "Moderate", "Low"] as const;

function project(lat: number, lon: number): [number, number] {
  const x = 10 + ((lon - 79.6) / 2.4) * 260;
  const y = 10 + ((9.9 - lat) / 4.03) * 400;
  return [x, y];
}

interface TooltipData {
  district: string;
  risk: DistrictRisk;
  svgX: number;
  svgY: number;
}

export function SriLankaMap() {
  const [risks, setRisks] = useState<DistrictRisk[]>([]);
  const [profiles, setProfiles] = useState<ModelInfo["district_profiles"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    Promise.all([getDistrictRisks(), getModelInfo()])
      .then(([r, info]) => {
        setRisks(r);
        setProfiles(info.district_profiles);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const riskMap = Object.fromEntries(risks.map((r) => [r.district, r]));

  // Count districts by category for legend
  const categoryCounts = risks.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  // Highest-risk district
  const topRisk = risks.reduce<DistrictRisk | null>(
    (best, r) => (!best || r.score > best.score ? r : best),
    null
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="pulse-dot" />
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-brand">
              Live · {risks.length} districts scored
            </span>
          </div>
          <h3 className="text-[1.1rem] font-extrabold leading-tight">Sri Lanka Flood Risk Map</h3>
          <p className="mt-0.5 text-[0.78rem] leading-snug text-muted-foreground">
            Each district scored using its typical climate &amp; terrain profile.
            Hover to inspect · values from the live prediction engine.
          </p>
        </div>
        {topRisk && (
          <div
            className="shrink-0 rounded-xl border px-3 py-2 text-center"
            style={{
              borderColor: `${RISK_FILL[topRisk.category] ?? "#38bdf8"}40`,
              backgroundColor: `${RISK_FILL[topRisk.category] ?? "#38bdf8"}10`,
            }}
          >
            <div className="text-[0.65rem] uppercase tracking-[0.05em] text-muted-foreground">
              Highest risk
            </div>
            <div
              className="text-sm font-extrabold"
              style={{ color: RISK_FILL[topRisk.category] ?? "#38bdf8" }}
            >
              {topRisk.district}
            </div>
            <div className="tabular-nums text-[0.72rem] font-semibold text-muted-foreground">
              {topRisk.score.toFixed(3)}
            </div>
          </div>
        )}
      </div>

      {/* ── Map + tooltip ── */}
      <div className="relative flex justify-center">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-lg">
              <span className="pulse-dot" />
              Scoring all 25 districts…
            </div>
          </div>
        )}

        <div className="relative">
          <svg
            ref={svgRef}
            viewBox="0 0 280 420"
            className="w-full max-w-[220px]"
            aria-label="Sri Lanka flood risk map by district"
          >
            <defs>
              <style>{`
                @keyframes pulse-severe {
                  0%, 100% { r: 8; opacity: 0.75; }
                  50%       { r: 13; opacity: 0.0; }
                }
                @keyframes pulse-high {
                  0%, 100% { r: 7; opacity: 0.5; }
                  50%       { r: 11; opacity: 0.0; }
                }
                .ring-severe { animation: pulse-severe 2.2s ease-out infinite; }
                .ring-high   { animation: pulse-high 3s ease-out infinite; }
              `}</style>
              <radialGradient id="ocean-bg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(56,189,248,0.04)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0)" />
              </radialGradient>
              <filter id="bubble-glow">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ocean backdrop */}
            <rect x="0" y="0" width="280" height="420" fill="url(#ocean-bg)" />

            {/* island silhouette */}
            <polygon
              points={ISLAND_POINTS}
              fill="rgba(56,189,248,0.055)"
              stroke="rgba(56,189,248,0.22)"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />

            {/* district bubbles — render severe/high last so they're on top */}
            {profiles &&
              [...Object.entries(profiles)]
                .sort(([a], [b]) => {
                  const scoreA = riskMap[a]?.score ?? 0;
                  const scoreB = riskMap[b]?.score ?? 0;
                  return scoreA - scoreB; // ascending so high risk renders on top
                })
                .map(([district, profile]) => {
                  const [x, y] = project(profile.latitude, profile.longitude);
                  const risk = riskMap[district];
                  const fill = risk ? (RISK_FILL[risk.category] ?? "#38bdf8") : "rgba(56,189,248,0.3)";
                  const isHigh = risk?.category === "Severe" || risk?.category === "High";
                  const ringClass = risk?.category === "Severe" ? "ring-severe" : risk?.category === "High" ? "ring-high" : "";

                  return (
                    <g
                      key={district}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => risk && setTooltip({ district, risk, svgX: x, svgY: y })}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {/* pulsing ring for Severe / High */}
                      {isHigh && (
                        <circle
                          cx={x}
                          cy={y}
                          r={8}
                          fill={fill}
                          opacity={0.45}
                          className={ringClass}
                        />
                      )}
                      {/* main bubble */}
                      <circle
                        cx={x}
                        cy={y}
                        r={tooltip?.district === district ? 10 : 7}
                        fill={fill}
                        opacity={tooltip?.district === district ? 1 : 0.8}
                        stroke={tooltip?.district === district ? "#fff" : "rgba(0,0,0,0.2)"}
                        strokeWidth={tooltip?.district === district ? 1.5 : 0.5}
                        filter={isHigh ? "url(#bubble-glow)" : undefined}
                        style={{ transition: "r 0.15s ease, opacity 0.15s ease" }}
                      />
                    </g>
                  );
                })}
          </svg>

          {/* floating tooltip — positioned relative to the container div */}
          {tooltip && (
            <div
              className="pointer-events-none absolute z-20 min-w-[140px] rounded-xl border border-border bg-panel-2 p-3 shadow-xl transition-all"
              style={{
                left: `${(tooltip.svgX / 280) * 100}%`,
                top: `${(tooltip.svgY / 420) * 100}%`,
                transform: tooltip.svgX > 180 ? "translate(-110%, -110%)" : "translate(8px, -110%)",
              }}
            >
              <div className="mb-1 text-[0.8rem] font-bold leading-tight">{tooltip.district}</div>
              <div
                className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-bold"
                style={{
                  color: RISK_FILL[tooltip.risk.category] ?? "#38bdf8",
                  backgroundColor: `${RISK_FILL[tooltip.risk.category] ?? "#38bdf8"}20`,
                }}
              >
                {tooltip.risk.category} Risk
              </div>
              <div className="tabular-nums text-[1.1rem] font-extrabold" style={{ color: RISK_FILL[tooltip.risk.category] }}>
                {tooltip.risk.score.toFixed(3)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Category breakdown strip ── */}
      {risks.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {RISK_ORDER.filter((cat) => categoryCounts[cat]).map((cat) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: RISK_FILL[cat] }}
              />
              <span className="text-[0.72rem] font-semibold" style={{ color: RISK_FILL[cat] }}>
                {cat}
              </span>
              <span className="text-[0.72rem] text-muted-foreground">
                {categoryCounts[cat]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
