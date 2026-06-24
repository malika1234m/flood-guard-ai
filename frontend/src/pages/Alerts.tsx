import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Phone,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAlerts,
  getModelInfo,
  subscribe,
  unsubscribe,
  type FloodAlert,
  type ModelInfo,
} from "@/lib/api";
import { RISK_BADGE_CLASSES } from "@/lib/riskBadge";

const SEVERITY_COLOR: Record<string, string> = {
  Severe: "border-red-500 bg-red-500/10 text-red-400",
  High: "border-orange-500 bg-orange-500/10 text-orange-400",
  Moderate: "border-yellow-500 bg-yellow-500/10 text-yellow-400",
};

type Mode = "subscribe" | "unsubscribe";

export function Alerts() {
  const [alerts, setAlerts] = useState<FloodAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const [districts, setDistricts] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("subscribe");

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAlertsLoading(true);
    getAlerts()
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setAlertsLoading(false));

    getModelInfo()
      .then((info: ModelInfo) => setDistricts(Object.keys(info.district_profiles).sort()))
      .catch(() => {});
  }, []);

  function toggleDistrict(d: string) {
    setSelected((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (mode === "subscribe") {
        if (selected.length === 0) {
          setError("Select at least one district to monitor.");
          setSubmitting(false);
          return;
        }
        await subscribe({ name: name.trim(), phone: phone.trim(), districts: selected });
        setSuccess(
          `You're subscribed! You'll receive SMS alerts when flood risk rises in your selected district(s). Reply STOP to any message to unsubscribe.`,
        );
        setName("");
        setPhone("");
        setSelected([]);
      } else {
        await unsubscribe(phone.trim());
        setSuccess("You've been unsubscribed. You won't receive any further alerts.");
        setPhone("");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
          <Bell className="h-7 w-7 text-brand" />
          SMS Flood Alerts
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Get a text message the moment flood risk rises in your district. Free to sign up — powered by live weather data.
        </p>
      </div>

      {/* Active alerts banner */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Current Active Alerts
        </h2>
        {alertsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            No active alerts right now. All districts are within normal risk ranges.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {alerts.map((a) => (
              <li
                key={a.district}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm",
                  SEVERITY_COLOR[a.severity] ?? "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                    {a.district}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide", RISK_BADGE_CLASSES[a.severity])}>
                    {a.severity}
                  </span>
                </div>
                <p className="text-[0.82rem] leading-snug opacity-90">{a.message}</p>
                <p className="text-[0.75rem] opacity-60">
                  Score {a.live_score.toFixed(2)} · {a.rainfall_7d_mm.toFixed(0)} mm this week · {a.trend}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sign-up form */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {/* Mode toggle */}
        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => { setMode("subscribe"); setError(null); setSuccess(null); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              mode === "subscribe"
                ? "bg-brand text-white"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Bell className="h-3.5 w-3.5" /> Subscribe
          </button>
          <button
            type="button"
            onClick={() => { setMode("unsubscribe"); setError(null); setSuccess(null); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              mode === "unsubscribe"
                ? "bg-destructive text-white"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <BellOff className="h-3.5 w-3.5" /> Unsubscribe
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === "subscribe" && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <User className="h-3.5 w-3.5 text-muted-foreground" /> Your name
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kumari Perera"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Mobile number
            </label>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+94771234567"
              type="tel"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="mt-1 text-[0.75rem] text-muted-foreground">
              International format — include country code (e.g. +94 for Sri Lanka).
            </p>
          </div>

          {mode === "subscribe" && (
            <div>
              <label className="mb-2 block text-sm font-medium">
                Districts to monitor
                {selected.length > 0 && (
                  <span className="ml-2 text-brand">({selected.length} selected)</span>
                )}
              </label>
              {districts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading districts…
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {districts.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDistrict(d)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[0.78rem] font-medium transition-colors",
                        selected.includes(d)
                          ? "border-brand bg-brand/20 text-brand"
                          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Feedback messages */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <X className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2.5 text-sm text-green-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {success}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60",
              mode === "subscribe" ? "bg-brand hover:bg-brand/90" : "bg-destructive hover:bg-destructive/90",
            )}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "subscribe" ? (
              <><MessageSquare className="h-4 w-4" /> Sign me up</>
            ) : (
              <><BellOff className="h-4 w-4" /> Remove my number</>
            )}
          </button>
        </form>
      </section>

      {/* How it works */}
      <section className="text-sm text-muted-foreground">
        <h3 className="mb-2 font-semibold text-foreground">How it works</h3>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Enter your name and mobile number above, then pick the districts you want to monitor.</li>
          <li>FloodGuard checks live weather data and our ML model continuously.</li>
          <li>When a district you follow reaches <strong>Moderate, High, or Severe</strong> risk, you get an SMS within minutes.</li>
          <li>We wait 6 hours between alerts for the same event so you're not spammed.</li>
          <li>Reply <strong>STOP</strong> to any message — or use the Unsubscribe tab above — to opt out at any time.</li>
        </ol>
      </section>
    </div>
  );
}
