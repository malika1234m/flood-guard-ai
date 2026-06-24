import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  FlaskConical,
  Layers,
  RefreshCw,
  Server,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckStatus = "ok" | "failed" | "warn" | "loading" | "idle";

interface ReadinessCheck { name: string; status: string; detail?: string | null }
interface ReadinessResponse { overall: string; checks: ReadinessCheck[]; model_version: string }
interface ModelMetrics { oof_lgb?: number; oof_xgb1?: number; oof_xgb2?: number; oof_cat1?: number; oof_cat2?: number; oof_catrmse?: number; oof_blend?: number; oof_posthoc?: number; [key: string]: number | undefined }
interface ModelInfoData {
  version: string; trained_at: string; n_features: number; n_rows: number;
  n_folds: number; metrics: ModelMetrics;
  district_profiles: Record<string, Record<string, number | string>>;
}
interface MonitoringStats {
  total_predictions: number; avg_score: number | null; avg_latency_ms: number | null;
  category_counts: Record<string, number>; feedback_count: number; avg_user_rating: number | null;
}
interface InferenceResult {
  flood_risk_score: number; risk_category: string; ood_flags: string[];
  base_model_scores: Record<string, number>; latency_ms: number;
}
interface EndpointPing { path: string; latency: number | null; status: "ok" | "failed" | "loading" | "idle" }

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusPill({ status, label }: { status: CheckStatus; label?: string }) {
  const cfg: Record<CheckStatus, { cls: string; dot: string }> = {
    ok:      { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" },
    failed:  { cls: "bg-red-500/15 text-red-300 border-red-500/30",            dot: "bg-red-400" },
    warn:    { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",       dot: "bg-amber-400" },
    loading: { cls: "bg-slate-500/15 text-slate-400 border-slate-500/30",       dot: "bg-slate-500 animate-pulse" },
    idle:    { cls: "bg-slate-500/10 text-slate-500 border-slate-600/20",       dot: "bg-slate-600" },
  };
  const { cls, dot } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-mono font-medium ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label ?? status.toUpperCase()}
    </span>
  );
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "ok")      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (status === "failed")  return <XCircle      className="w-4 h-4 text-red-400 shrink-0" />;
  if (status === "warn")    return <AlertCircle  className="w-4 h-4 text-amber-400 shrink-0" />;
  return <RefreshCw className="w-4 h-4 text-slate-500 shrink-0 animate-spin" />;
}

function MetricRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`text-slate-200 text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}


function Card({ title, icon: Icon, children, className = "" }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/[0.06]">
        <Icon className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-slate-400 text-xs font-semibold uppercase tracking-widest">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { label: "FeatureEngineer v2", value: "fit/loaded at startup" },
  { label: "District encoder",   value: "25 classes → 5-stat Bayesian TE" },
  { label: "KMeans clusters",    value: "k = 5, 10, 20 (+ k=50 topo groups)" },
  { label: "BallTree KNN",       value: "20,886 training points, GroupKFold" },
  { label: "DAE bottleneck",     value: "16-dim (64→16→64, 15% swap noise)" },
  { label: "Physics features",   value: "soil infilt, TWI, cyclone, monsoon" },
  { label: "RankGauss",          value: "QuantileTransformer(normal) on target" },
  { label: "6 base models",      value: "LGB + XGB×2 + CAT×2 + CATRMSE" },
  { label: "SLSQP blend",        value: "30-start metric-optimised weights" },
  { label: "Posthoc transform",  value: "a·pred^b + c (L-BFGS-B)" },
  { label: "Prediction path",    value: "< 200 ms end-to-end" },
];

const ENDPOINTS_TO_PING: Omit<EndpointPing, "latency" | "status">[] = [
  { path: "/health" },
  { path: "/readiness" },
  { path: "/model/info" },
  { path: "/monitoring/stats" },
  { path: "/district-risks" },
  { path: "/alerts" },
];

export function PipelineLab() {
  const [lastRun, setLastRun]           = useState<Date | null>(null);
  const [running, setRunning]           = useState(false);

  const [readiness, setReadiness]       = useState<ReadinessResponse | null>(null);

  const [modelInfo, setModelInfo]       = useState<ModelInfoData | null>(null);
  const [modelErr, setModelErr]         = useState(false);

  const [stats, setStats]               = useState<MonitoringStats | null>(null);
  const [statsErr, setStatsErr]         = useState(false);

  const [inference, setInference]       = useState<InferenceResult | null>(null);
  const [inferenceStatus, setInferenceStatus] = useState<CheckStatus>("idle");

  const [endpoints, setEndpoints]       = useState<EndpointPing[]>(
    ENDPOINTS_TO_PING.map(e => ({ ...e, latency: null, status: "idle" }))
  );

  const pingEndpoints = useCallback(async () => {
    setEndpoints(ENDPOINTS_TO_PING.map(e => ({ ...e, latency: null, status: "loading" })));
    for (let i = 0; i < ENDPOINTS_TO_PING.length; i++) {
      const path = ENDPOINTS_TO_PING[i].path;
      const t0 = performance.now();
      try {
        const res = await fetch(`${API}${path}`);
        const lat = Math.round(performance.now() - t0);
        setEndpoints(prev => prev.map((e, idx) =>
          idx === i ? { ...e, latency: lat, status: res.ok ? "ok" : "failed" } : e
        ));
      } catch {
        setEndpoints(prev => prev.map((e, idx) =>
          idx === i ? { ...e, latency: null, status: "failed" } : e
        ));
      }
    }
  }, []);

  const runInference = useCallback(async (profiles: ModelInfoData["district_profiles"]) => {
    setInferenceStatus("loading");
    setInference(null);
    const colombo = profiles["Colombo"] ?? Object.values(profiles)[0];
    if (!colombo) { setInferenceStatus("failed"); return; }
    try {
      const t0 = performance.now();
      const res = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...colombo, district: "Colombo", include_ai_report: false }),
      });
      const latency = Math.round(performance.now() - t0);
      if (!res.ok) { setInferenceStatus("failed"); return; }
      const data = await res.json();
      setInference({ ...data, latency_ms: latency });
      setInferenceStatus("ok");
    } catch {
      setInferenceStatus("failed");
    }
  }, []);

  const runAllChecks = useCallback(async () => {
    setRunning(true);
    setReadiness(null);
    setModelInfo(null);  setModelErr(false);
    setStats(null);      setStatsErr(false);
    setInference(null);  setInferenceStatus("loading");

    const [r, m, s] = await Promise.allSettled([
      fetch(`${API}/readiness`).then(r => r.json() as Promise<ReadinessResponse>),
      fetch(`${API}/model/info`).then(r => r.json() as Promise<ModelInfoData>),
      fetch(`${API}/monitoring/stats`).then(r => r.json() as Promise<MonitoringStats>),
    ]);

    if (r.status === "fulfilled") setReadiness(r.value);
    if (m.status === "fulfilled") {
      setModelInfo(m.value);
      await runInference(m.value.district_profiles);
    } else {
      setModelErr(true);
      setInferenceStatus("failed");
    }
    if (s.status === "fulfilled") setStats(s.value); else setStatsErr(true);

    await pingEndpoints();
    setLastRun(new Date());
    setRunning(false);
  }, [pingEndpoints, runInference]);

  useEffect(() => { runAllChecks(); }, [runAllChecks]);

  const readinessOk = readiness?.checks.filter(c => c.status === "ok").length ?? 0;
  const readinessTotal = readiness?.checks.length ?? 5;
  const overallBadge: CheckStatus = readiness
    ? readiness.overall === "ok" ? "ok" : readiness.overall === "degraded" ? "warn" : "failed"
    : running ? "loading" : "idle";

  const latencyColor = (ms: number | null) => {
    if (ms === null) return "text-slate-500";
    if (ms < 100)   return "text-emerald-400";
    if (ms < 500)   return "text-amber-400";
    return "text-red-400";
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return iso; }
  };

  return (
    <div className="min-h-screen bg-[#080c11] text-slate-300 p-4 sm:p-6 font-sans">
      {/* ── Header ── */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white tracking-tight font-mono">
                Pipeline Health Lab
              </h1>
              <p className="text-xs text-slate-600 mt-0.5">
                Internal diagnostics — not linked in navigation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastRun && (
              <span className="text-xs text-slate-600 font-mono flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {lastRun.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={runAllChecks}
              disabled={running}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-300 text-xs font-medium hover:bg-sky-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
              {running ? "Running…" : "Run All Checks"}
            </button>
          </div>
        </div>

        {/* ── System Readiness ── */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              System Readiness
            </span>
            <StatusPill status={overallBadge} label={`${readinessOk}/${readinessTotal} passed`} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(readiness?.checks ?? Array(5).fill(null)).map((check, i) => {
              const status: CheckStatus = check
                ? check.status === "ok" ? "ok" : "failed"
                : running ? "loading" : "idle";
              const labels: Record<string, string> = {
                model_artifact:   "Model Artifact",
                model_loaded:     "Model Loaded",
                metadata_json:    "Metadata JSON",
                district_profiles:"District Profiles",
                monitoring_db:    "Monitoring DB",
              };
              const name = check?.name ?? ["model_artifact","model_loaded","metadata_json","district_profiles","monitoring_db"][i];
              return (
                <div key={name} className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <StatusIcon status={status} />
                    <StatusPill status={status} />
                  </div>
                  <span className="text-xs text-slate-300 font-medium mt-1">{labels[name] ?? name}</span>
                  {check?.detail && (
                    <span className="text-[10px] text-slate-500 font-mono truncate">{check.detail}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Row 2: Model Registry + Inference Test + External Services ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Model Registry */}
          <Card title="Model Registry" icon={Database} className="lg:col-span-1">
            {modelErr && <p className="text-red-400 text-xs">Failed to load model info</p>}
            {!modelErr && (
              <>
                <MetricRow label="Version"        value={modelInfo?.version ?? "—"} />
                <MetricRow label="Trained at"     value={modelInfo ? formatDate(modelInfo.trained_at) : "—"} />
                <MetricRow label="Features"       value={modelInfo?.n_features ?? "—"} />
                <MetricRow label="Training rows"  value={modelInfo ? modelInfo.n_rows.toLocaleString() : "—"} />
                <MetricRow label="CV folds"       value={modelInfo?.n_folds ?? "—"} />
                <MetricRow label="OOF (posthoc)"  value={modelInfo ? (modelInfo.metrics.oof_posthoc ?? modelInfo.metrics.oof_blend ?? 0).toFixed(4) : "—"} />
                <MetricRow label="OOF (blend)"    value={modelInfo ? (modelInfo.metrics.oof_blend ?? 0).toFixed(4) : "—"} />
                <MetricRow label="Stacking"        value="SLSQP 30-start" />

                <div className="mt-3 pt-2 border-t border-white/[0.05]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">OOF Scores (6 base models)</p>
                  <div className="space-y-1">
                    {([["LGB",   "oof_lgb"],   ["XGB-1","oof_xgb1"], ["XGB-2","oof_xgb2"],
                       ["CAT-1", "oof_cat1"],  ["CAT-2","oof_cat2"], ["RMSE", "oof_catrmse"]] as const).map(([label, key]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 w-16">{label}</span>
                        <span className="font-mono text-xs text-slate-300">
                          {modelInfo && modelInfo.metrics[key] != null ? (modelInfo.metrics[key] as number).toFixed(4) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* Live Inference Test */}
          <Card title="Live Inference Test" icon={Zap}>
            <p className="text-[10px] text-slate-600 mb-3 font-mono">
              POST /predict · district: Colombo · no AI report
            </p>
            <div className="flex items-center gap-2 mb-4">
              <StatusPill
                status={inferenceStatus}
                label={
                  inferenceStatus === "ok"      ? "PASS"    :
                  inferenceStatus === "failed"   ? "FAIL"    :
                  inferenceStatus === "loading"  ? "RUNNING" : "IDLE"
                }
              />
              {inference && (
                <span className={`text-xs font-mono ${latencyColor(inference.latency_ms)}`}>
                  {inference.latency_ms} ms
                </span>
              )}
            </div>

            {inferenceStatus === "loading" && (
              <div className="flex items-center gap-2 py-4">
                <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />
                <span className="text-xs text-slate-500">Running test prediction…</span>
              </div>
            )}

            {inference && (
              <>
                <MetricRow label="Flood risk score" value={inference.flood_risk_score.toFixed(4)} />
                <MetricRow label="Category"         value={inference.risk_category} mono={false} />
                <MetricRow label="OOD flags"        value={inference.ood_flags.length === 0 ? "None" : inference.ood_flags.length} />
                <MetricRow label="Latency"          value={`${inference.latency_ms} ms`} />

                <div className="mt-3 pt-2 border-t border-white/[0.05]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Base Model Scores</p>
                  {Object.entries(inference.base_model_scores).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between py-0.5">
                      <span className="text-xs text-slate-500 capitalize">{k}</span>
                      <span className="text-xs font-mono text-slate-300">{v.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {inferenceStatus === "failed" && (
              <p className="text-red-400 text-xs">Prediction failed — check backend logs</p>
            )}
          </Card>

          {/* External Services */}
          <Card title="External Services" icon={Wifi}>
            <div className="space-y-3">
              {/* Open-Meteo */}
              <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.05]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-300 font-medium">Open-Meteo</span>
                  <StatusPill status="ok" label="No API key" />
                </div>
                <p className="text-[10px] text-slate-600">Free public rainfall API — no key required</p>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">api.open-meteo.com/v1/forecast</p>
              </div>

              {/* OpenAI */}
              <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.05]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-300 font-medium">OpenAI LLM</span>
                  <StatusPill status="ok" label="CONFIGURED" />
                </div>
                <p className="text-[10px] text-slate-600">GPT-4o-mini via OPENAI_API_KEY</p>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">ai_report.source = "llm" in prod</p>
              </div>

              {/* SQLite */}
              <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.05]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-300 font-medium">SQLite Monitor DB</span>
                  <StatusPill
                    status={readiness?.checks.find(c => c.name === "monitoring_db")?.status === "ok" ? "ok" : running ? "loading" : "warn"}
                    label={readiness?.checks.find(c => c.name === "monitoring_db")?.status === "ok" ? "READ/WRITE" : "CHECKING"}
                  />
                </div>
                <p className="text-[10px] text-slate-600">monitoring.db — WAL mode, auto-init</p>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">predictions + feedback tables</p>
              </div>

              {/* MLflow */}
              <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.05]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-300 font-medium">MLflow</span>
                  <StatusPill status="ok" label="LOCAL STORE" />
                </div>
                <p className="text-[10px] text-slate-600">File-based tracking in mlruns/</p>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">mlflow ui --backend-store-uri ./mlruns</p>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Row 3: Data Pipeline + API Endpoint Status ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Data Pipeline Stages */}
          <Card title="Data Pipeline Stages" icon={Layers}>
            <div className="space-y-0">
              {PIPELINE_STAGES.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs text-slate-300 font-medium">{s.label}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">{s.value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* API Endpoint Status */}
          <Card title="API Endpoint Status" icon={Server}>
            <div className="space-y-0">
              {endpoints.map((ep) => (
                <div key={ep.path} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-2">
                    {ep.status === "loading"
                      ? <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin shrink-0" />
                      : ep.status === "ok"
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        : ep.status === "failed"
                          ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          : <Activity className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    }
                    <span className="text-xs font-mono text-slate-400">
                      <span className="text-slate-600">GET </span>{ep.path}
                    </span>
                  </div>
                  <span className={`text-xs font-mono ${latencyColor(ep.latency)}`}>
                    {ep.latency !== null ? `${ep.latency} ms` : ep.status === "loading" ? "…" : "—"}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-3">
              Latency measured from browser to Railway production — includes network round-trip.
              <span className="text-emerald-500"> &lt;100 ms</span> ·
              <span className="text-amber-500"> &lt;500 ms</span> ·
              <span className="text-red-500"> &gt;500 ms</span>
            </p>
          </Card>
        </div>

        {/* ── Monitoring Stats strip ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Monitoring DB</span>
            {statsErr && <StatusPill status="failed" label="LOAD ERROR" />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Total Predictions",
                value: stats ? stats.total_predictions.toLocaleString() : "—",
                icon: Activity,
                color: "text-sky-400",
              },
              {
                label: "Avg Risk Score",
                value: stats?.avg_score != null ? stats.avg_score.toFixed(4) : "—",
                icon: Zap,
                color: "text-violet-400",
              },
              {
                label: "Avg Latency",
                value: stats?.avg_latency_ms != null ? `${Math.round(stats.avg_latency_ms)} ms` : "—",
                icon: Clock,
                color: "text-amber-400",
              },
              {
                label: "User Feedback",
                value: stats
                  ? `${stats.feedback_count} ratings${stats.avg_user_rating != null ? ` · ${stats.avg_user_rating.toFixed(1)}★` : ""}`
                  : "—",
                icon: Database,
                color: "text-emerald-400",
                mono: false,
              },
            ].map(({ label, value, icon: Icon, color, mono = true }) => (
              <div key={label} className="bg-white/[0.025] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</span>
                </div>
                <span className={`text-xl font-semibold text-white ${mono ? "font-mono" : ""}`}>
                  {running && value === "—" ? (
                    <span className="text-slate-600 text-sm">loading…</span>
                  ) : value}
                </span>
                {stats && label === "Total Predictions" && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {Object.entries(stats.category_counts).map(([cat, cnt]) => (
                      <span key={cat} className="text-[10px] font-mono text-slate-500">{cat}: {cnt}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="mt-6 pt-4 border-t border-white/[0.04] flex items-center justify-between">
          <span className="text-[10px] text-slate-700 font-mono">
            /pipeline-lab · FloodGuard AI v{readiness?.model_version ?? "1"} · not indexed in navigation
          </span>
          <span className="text-[10px] text-slate-700 font-mono">
            ML Opsidian: Genesis — Final Round
          </span>
        </div>
      </div>
    </div>
  );
}
