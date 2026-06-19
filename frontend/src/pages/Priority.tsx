import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Shield, Users, Truck, History, Wrench, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RISK_BADGE_CLASSES } from "@/lib/riskBadge";
import { getEmergencyPriority, type EmergencyPriorityItem } from "@/lib/api";

const RISK_FILL: Record<string, string> = {
  Low: "#22c55e", Moderate: "#eab308", High: "#f97316", Severe: "#ef4444",
};

const ACTION_COLOR: Record<string, string> = {
  "Deploy emergency response teams immediately": "#ef4444",
  "Issue public flood warning and pre-position resources": "#f97316",
  "Monitor closely and prepare evacuation routes": "#eab308",
  "Maintain standard preparedness": "#22c55e",
};

function ScoreBar({ value, label, color, icon: Icon }: { value: number; label: string; color: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 text-[0.75rem]">
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
      <span className="w-28 shrink-0 font-medium text-muted-foreground">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${value * 100}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 shrink-0 text-right tabular-nums font-bold" style={{ color }}>{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function PriorityRow({ item, expanded, onToggle }: { item: EmergencyPriorityItem; expanded: boolean; onToggle: () => void }) {
  const actionColor = ACTION_COLOR[item.recommended_action] ?? "#38bdf8";
  const urgency = item.priority_score > 0.65 ? "critical" : item.priority_score > 0.50 ? "high" : item.priority_score > 0.38 ? "moderate" : "low";
  const urgencyColors: Record<string, string> = {
    critical: "#ef4444", high: "#f97316", moderate: "#eab308", low: "#22c55e",
  };

  return (
    <>
      <tr className={cn(
        "cursor-pointer border-t border-border/50 transition-colors hover:bg-white/[0.03]",
        expanded ? "bg-white/[0.04]" : item.rank % 2 === 0 && "bg-white/[0.012]",
      )} onClick={onToggle}>
        {/* Rank */}
        <td className="py-3 pl-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full text-[0.75rem] font-extrabold"
            style={{ backgroundColor: `${urgencyColors[urgency]}20`, color: urgencyColors[urgency] }}>
            {item.rank}
          </div>
        </td>
        {/* District */}
        <td className="py-3 pr-3">
          <div className="font-bold text-sm">{item.district}</div>
          <div className="mt-0.5 text-[0.68rem] text-muted-foreground">
            {item.reasons[0] ?? "Cumulative risk factors"}
          </div>
        </td>
        {/* Priority score */}
        <td className="py-3 pr-3">
          <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-white/8">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${item.priority_score * 100}%`, backgroundColor: urgencyColors[urgency] }} />
          </div>
          <div className="mt-1 tabular-nums text-[0.8rem] font-bold" style={{ color: urgencyColors[urgency] }}>
            {(item.priority_score * 100).toFixed(1)}
          </div>
        </td>
        {/* Flood risk */}
        <td className="hidden py-3 pr-3 sm:table-cell">
          <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold", RISK_BADGE_CLASSES[item.risk_category])}>
            {item.risk_category}
          </span>
          <div className="mt-0.5 tabular-nums text-[0.75rem] text-muted-foreground">{item.flood_risk_score.toFixed(3)}</div>
        </td>
        {/* Action */}
        <td className="hidden py-3 pr-3 text-[0.75rem] font-semibold lg:table-cell" style={{ color: actionColor }}>
          {item.recommended_action}
        </td>
        {/* Expand toggle */}
        <td className="py-3 pr-4 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-white/[0.02]">
          <td colSpan={6} className="px-4 pb-4 pt-1">
            <div className="rounded-[12px] border border-border/60 bg-panel p-4">
              <div className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Priority score breakdown
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ScoreBar value={item.flood_risk_score} label="Flood risk" color={RISK_FILL[item.risk_category] ?? "#38bdf8"} icon={AlertTriangle} />
                <ScoreBar value={item.population_score} label="Population" color="#38bdf8" icon={Users} />
                <ScoreBar value={item.evacuation_gap_score} label="Evacuation gap" color="#f97316" icon={Truck} />
                <ScoreBar value={item.flood_history_score} label="Flood history" color="#6366f1" icon={History} />
                <ScoreBar value={item.infrastructure_weakness_score} label="Infra weakness" color="#eab308" icon={Wrench} />
              </div>
              {item.reasons.length > 1 && (
                <div className="mt-3 border-t border-border/50 pt-3">
                  <div className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Why this district ranks here</div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.reasons.map((r) => (
                      <span key={r} className="rounded-full border border-border bg-panel-2 px-2.5 py-0.5 text-[0.68rem] font-semibold text-foreground">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 border-t border-border/50 pt-3">
                <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Recommended action</div>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"
                  style={{ borderColor: `${actionColor}40`, backgroundColor: `${actionColor}10`, color: actionColor }}>
                  <Shield className="h-4 w-4 shrink-0" />
                  {item.recommended_action}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function Priority() {
  const [items, setItems] = useState<EmergencyPriorityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getEmergencyPriority());
      setLastUpdated(new Date());
    } catch {
      // keep showing last
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const critical = items.filter((i) => i.priority_score > 0.65).length;
  const high = items.filter((i) => i.priority_score > 0.50 && i.priority_score <= 0.65).length;
  const needsAction = items.filter((i) => i.priority_score > 0.38).length;
  const topDistrict = items[0];

  return (
    <div>
      <PageHero
        title="Emergency Priority"
        description="Districts ranked by a composite emergency response priority score that combines flood risk, population exposure, evacuation access, flood history, and infrastructure resilience. Use this to decide where to deploy resources first."
        image="/hero/flood-network-bg.webp"
        imageAlt="Emergency priority visualization"
        action={
          <div className="flex items-center gap-3">
            {lastUpdated && !loading && (
              <div className="hidden items-center gap-1.5 text-[0.72rem] text-muted-foreground sm:flex">
                <Clock className="h-3 w-3" />
                {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            <Button variant="brand-outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
        overlay={
          topDistrict ? (
            <div className="absolute right-5 top-5 z-10 hidden items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2 backdrop-blur-md sm:flex">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-[0.78rem] font-bold text-red-300">Highest priority: {topDistrict.district}</span>
            </div>
          ) : undefined
        }
      />

      {/* ── KPI strip ── */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {[
          { label: "Critical priority", value: critical, color: "#ef4444", icon: AlertTriangle },
          { label: "High priority", value: high, color: "#f97316", icon: Shield },
          { label: "Needs attention", value: needsAction, color: "#eab308", icon: Users },
          { label: "Districts ranked", value: items.length, color: "#38bdf8", icon: Truck },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="glass-panel rounded-[16px] p-4">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${kpi.color}18` }}>
                <Icon className="h-5 w-5" style={{ color: kpi.color }} />
              </div>
              <div className="text-[1.7rem] font-extrabold tabular-nums" style={{ color: kpi.color }}>
                {loading ? "–" : kpi.value}
              </div>
              <div className="mt-0.5 text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">{kpi.label}</div>
            </div>
          );
        })}
      </div>

      {/* ── How it's calculated ── */}
      <Card className="mb-5">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">Priority formula:</span>
            {[
              { weight: "40%", label: "Flood risk", color: "#ef4444" },
              { weight: "25%", label: "Population", color: "#38bdf8" },
              { weight: "20%", label: "Evacuation gap", color: "#f97316" },
              { weight: "10%", label: "Flood history", color: "#6366f1" },
              { weight: "5%", label: "Infra weakness", color: "#eab308" },
            ].map((w, i, arr) => (
              <span key={w.label} className="flex items-center gap-1">
                <span className="rounded-full px-2 py-0.5 text-[0.72rem] font-bold" style={{ backgroundColor: `${w.color}15`, color: w.color }}>
                  {w.weight} {w.label}
                </span>
                {i < arr.length - 1 && <span className="text-muted-foreground">+</span>}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Priority table ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">District emergency priority ranking</CardTitle>
            {!loading && <span className="text-[0.72rem] text-muted-foreground">{items.length} districts · click a row to expand</span>}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
              <div>
                <p className="font-semibold text-muted-foreground">Computing priority scores…</p>
                <p className="mt-0.5 text-[0.8rem] text-muted-foreground/60">Scoring all 25 districts across 5 risk factors</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pl-4 text-left w-12">#</th>
                    <th className="pb-3 pr-3 text-left">District</th>
                    <th className="pb-3 pr-3 text-left">Priority score</th>
                    <th className="pb-3 pr-3 text-left hidden sm:table-cell">Flood risk</th>
                    <th className="pb-3 pr-3 text-left hidden lg:table-cell">Action</th>
                    <th className="pb-3 pr-4 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <PriorityRow
                      key={item.district}
                      item={item}
                      expanded={expanded === item.rank}
                      onToggle={() => setExpanded(expanded === item.rank ? null : item.rank)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Action legend ── */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ACTION_COLOR).map(([action, color]) => (
          <div key={action} className="flex items-start gap-2.5 rounded-[12px] border p-3" style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}>
            <Shield className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
            <span className="text-[0.75rem] font-semibold leading-[1.4]" style={{ color }}>{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
