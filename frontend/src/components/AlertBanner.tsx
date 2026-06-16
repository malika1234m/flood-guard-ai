import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Radio, X } from "lucide-react";
import { getAlerts, type FloodAlert } from "@/lib/api";

const SEV_COLOR: Record<string, string> = {
  Severe: "#ef4444",
  High: "#f97316",
  Moderate: "#eab308",
};

const SEV_BG: Record<string, string> = {
  Severe: "rgba(239,68,68,0.10)",
  High: "rgba(249,115,22,0.10)",
  Moderate: "rgba(234,179,8,0.10)",
};

const TREND_ICON: Record<string, string> = {
  Worsening: "↑",
  Improving: "↓",
  Stable: "→",
};

function AlertPill({ alert }: { alert: FloodAlert }) {
  const color = SEV_COLOR[alert.severity] ?? "#38bdf8";
  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}12` }}
    >
      <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.06em]" style={{ color }}>
        {alert.severity}
      </span>
      <span className="text-[0.75rem] font-semibold text-foreground">{alert.district}</span>
      <span className="text-[0.65rem] text-muted-foreground">
        {TREND_ICON[alert.trend]} {alert.rainfall_7d_mm.toFixed(0)} mm
      </span>
    </div>
  );
}

export function AlertBanner() {
  const [alerts, setAlerts] = useState<FloodAlert[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function load() {
      getAlerts()
        .then(setAlerts)
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = tickerRef.current;
    if (!el || alerts.length === 0) return;
    let raf: number;
    let x = 0;
    const speed = 0.5; // px per frame
    function tick() {
      x -= speed;
      if (el && -x >= el.scrollWidth / 2) x = 0;
      if (el) el.style.transform = `translateX(${x}px)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [alerts]);

  if (alerts.length === 0 || dismissed) return null;

  const worst = alerts[0];
  const worstColor = SEV_COLOR[worst.severity] ?? "#f97316";
  const worstBg = SEV_BG[worst.severity] ?? "rgba(249,115,22,0.10)";

  return (
    <div
      className="mb-4 overflow-hidden rounded-xl border"
      style={{ borderColor: `${worstColor}35`, backgroundColor: worstBg }}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 animate-pulse" style={{ color: worstColor }} />
          <span
            className="text-[0.68rem] font-extrabold uppercase tracking-[0.07em]"
            style={{ color: worstColor }}
          >
            Live Alerts · {alerts.length} district{alerts.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex flex-1 items-center overflow-hidden">
          <div className="overflow-hidden">
            <div ref={tickerRef} className="flex gap-3" style={{ whiteSpace: "nowrap" }}>
              {/* Duplicate for seamless loop */}
              {[...alerts, ...alerts].map((a, i) => (
                <AlertPill key={`${a.district}-${i}`} alert={a} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg px-2 py-1 text-[0.7rem] font-semibold text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Hide" : "Details"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="border-t px-4 py-3" style={{ borderColor: `${worstColor}20` }}>
          <div className="flex flex-col gap-2">
            {alerts.map((a) => {
              const c = SEV_COLOR[a.severity] ?? "#38bdf8";
              return (
                <div key={a.district} className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: c }} />
                  <div className="min-w-0">
                    <span className="mr-2 text-[0.75rem] font-bold" style={{ color: c }}>
                      [{a.severity}]
                    </span>
                    <span className="text-[0.75rem] text-foreground">{a.message}</span>
                  </div>
                  <div className="ml-auto shrink-0 tabular-nums text-[0.7rem] text-muted-foreground">
                    {a.live_score.toFixed(3)}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 text-[0.65rem] text-muted-foreground">
            Powered by Open-Meteo live rainfall · FloodGuard AI ML engine · Refreshes every 5 min
          </p>
        </div>
      )}
    </div>
  );
}
