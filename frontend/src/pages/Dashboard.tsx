import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RISK_BADGE_CLASSES } from "@/lib/riskBadge";
import { RISK_COLORS, getMonitoringStats, type MonitoringStats } from "@/lib/api";

const REFRESH_INTERVAL_MS = 15000;

function fmt(value: number | null | undefined, digits = 3) {
  return value === null || value === undefined ? "--" : value.toFixed(digits);
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 px-4.5">
      <div className="text-[1.7rem] font-extrabold tabular-nums">{value}</div>
      <div className="mt-1 text-[0.8rem] uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
    </div>
  );
}

function HeroTickerStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-sm font-extrabold tabular-nums">{value}</span>
      <span className="text-[0.7rem] uppercase tracking-[0.05em] text-muted-foreground">{label}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyChart() {
  return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No data yet</div>;
}

function ScoreHistogramChart({ bins }: { bins: number[] }) {
  if (bins.every((v) => v === 0)) return <EmptyChart />;

  const data = bins.map((count, i) => ({
    range: `${(i / bins.length).toFixed(1)}-${((i + 1) / bins.length).toFixed(1)}`,
    count,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--color-line)" vertical={false} />
        <XAxis dataKey="range" stroke="var(--color-text-muted)" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
        <YAxis allowDecimals={false} stroke="var(--color-text-muted)" tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
        <Tooltip
          cursor={{ fill: "var(--color-panel-2)" }}
          contentStyle={{
            background: "var(--color-panel-2)",
            border: "1px solid var(--color-line)",
            borderRadius: 8,
            color: "var(--color-text)",
            fontSize: "0.85rem",
          }}
        />
        <Bar dataKey="count" name="Predictions" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoryDonutChart({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <EmptyChart />;

  const data = entries.map(([name, value]) => ({ name, value }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={data.length > 1 ? 3 : 0}
          cornerRadius={data.length > 1 ? 4 : 0}
          stroke="var(--color-panel)"
          strokeWidth={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? "var(--color-brand-2)"} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: "0.8rem", color: "var(--color-text)" }} />
        <Tooltip
          contentStyle={{
            background: "var(--color-panel-2)",
            border: "1px solid var(--color-line)",
            borderRadius: 8,
            color: "var(--color-text)",
            fontSize: "0.85rem",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DistrictBarChart({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <EmptyChart />;

  const data = entries.map(([name, count]) => ({ name, count }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--color-line)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} stroke="var(--color-text-muted)" tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
        <YAxis
          type="category"
          dataKey="name"
          stroke="var(--color-text)"
          tick={{ fontSize: 12, fill: "var(--color-text)" }}
          width={100}
        />
        <Tooltip
          cursor={{ fill: "var(--color-panel-2)" }}
          contentStyle={{
            background: "var(--color-panel-2)",
            border: "1px solid var(--color-line)",
            borderRadius: 8,
            color: "var(--color-text)",
            fontSize: "0.85rem",
          }}
        />
        <Bar dataKey="count" name="Predictions" fill="var(--color-brand-2)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setStats(await getMonitoringStats());
    } catch {
      // keep showing the last known stats on a transient failure
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div>
      <PageHero
        title="Monitoring Dashboard"
        description="Live view of prediction volume, score distribution, latency, and user feedback — backed by a local log of every /predict call. Refreshes automatically every 15 seconds."
        image="/hero/flood-network-bg.webp"
        imageAlt="Aerial view of a Sri Lankan coastal town at dusk, overlaid with a glowing AI sensor-network mesh"
        action={
          <Button variant="brand-outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        }
        overlay={
          <>
            <div className="absolute right-5 top-5 z-10 hidden items-center gap-1.5 rounded-full border border-white/15 bg-[#04101f]/45 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-md sm:flex">
              <span className="pulse-dot" /> Live · refreshes every 15s
            </div>
            <div className="absolute inset-x-5 bottom-5 z-10 hidden items-center gap-5 overflow-x-auto rounded-xl border border-white/15 bg-[#04101f]/45 px-4 py-2.5 backdrop-blur-md sm:flex">
              <HeroTickerStat value={stats?.total_predictions ?? "--"} label="Predictions" />
              <span className="h-4 w-px shrink-0 bg-white/10" />
              <HeroTickerStat value={fmt(stats?.avg_score)} label="Avg risk score" />
              <span className="h-4 w-px shrink-0 bg-white/10" />
              <HeroTickerStat value={`${fmt(stats?.avg_latency_ms, 1)} ms`} label="Avg latency" />
              <span className="h-4 w-px shrink-0 bg-white/10" />
              <HeroTickerStat value={stats?.feedback_count ?? "--"} label="Feedback" />
              <span className="h-4 w-px shrink-0 bg-white/10" />
              <HeroTickerStat value={fmt(stats?.avg_user_rating, 2)} label="Avg rating" />
            </div>
          </>
        }
      />

      <div className="mb-4.5 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        <StatCard value={stats?.total_predictions ?? "--"} label="Predictions" />
        <StatCard value={fmt(stats?.avg_score)} label="Avg Risk Score" />
        <StatCard value={fmt(stats?.avg_latency_ms, 1)} label="Avg Latency (ms)" />
        <StatCard value={stats?.feedback_count ?? "--"} label="Feedback Received" />
        <StatCard value={fmt(stats?.avg_user_rating, 2)} label="Avg User Rating" />
      </div>

      <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-2">
        <ChartCard title="Score distribution">
          <ScoreHistogramChart bins={stats?.score_histogram ?? []} />
        </ChartCard>
        <ChartCard title="Risk category breakdown">
          <CategoryDonutChart counts={stats?.category_counts ?? {}} />
        </ChartCard>
        <ChartCard title="Top districts">
          <DistrictBarChart counts={stats?.district_counts ?? {}} />
        </ChartCard>
        <ChartCard title="Recent predictions">
          <div className="max-h-[280px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Latency (ms)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!stats || stats.recent.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No predictions yet
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.recent.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{new Date(r.timestamp * 1000).toLocaleString()}</TableCell>
                      <TableCell>{r.district ?? "--"}</TableCell>
                      <TableCell className="tabular-nums">{fmt(r.flood_risk_score)}</TableCell>
                      <TableCell>
                        <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-bold", RISK_BADGE_CLASSES[r.risk_category])}>
                          {r.risk_category}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{fmt(r.latency_ms, 1)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
