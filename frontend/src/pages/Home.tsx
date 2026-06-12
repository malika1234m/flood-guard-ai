import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Droplet, GitBranch, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getModelInfo, type ModelInfo } from "@/lib/api";

const STEPS = [
  {
    title: "Describe a location",
    description:
      "Enter geography, climate, land cover, infrastructure, and socioeconomic details — or start from a district average.",
  },
  {
    title: "223 engineered features",
    description:
      "A fit/transform feature pipeline reproduces district stats, KMeans clusters, KNN flood-history, and target encodings for that single record.",
  },
  {
    title: "Stacked ensemble score",
    description:
      "LightGBM, CatBoost, and XGBoost predictions are combined by a Ridge meta-model and calibrated to produce a 0–1 risk score.",
  },
  {
    title: "AI risk report & monitoring",
    description:
      "An AI advisor explains the score and top factors in plain language, while every request is logged to the live dashboard.",
  },
];

const FEATURES = [
  {
    icon: Layers,
    title: "Stacked ensemble model",
    description:
      "LightGBM, CatBoost, and XGBoost predictions are combined with a Ridge meta-learner and a mean-calibration shift, carrying forward the winning Initial Round approach.",
  },
  {
    icon: Droplet,
    title: "Single-record feature pipeline",
    description:
      "A fit/transform FeatureEngineer turns batch-only feature engineering — district stats, clustering, KNN, target encoding — into millisecond inference.",
  },
  {
    icon: Sparkles,
    title: "AI-generated risk reports",
    description:
      "Claude turns the score and top contributing factors into a plain-language summary and recommended actions, with a deterministic template fallback.",
  },
  {
    icon: Activity,
    title: "Live monitoring dashboard",
    description:
      "Every prediction is logged to SQLite and visualized — volume, score distribution, risk categories, latency, and user feedback.",
  },
  {
    icon: GitBranch,
    title: "Versioned experiments",
    description:
      "MLflow tracks hyperparameters, fold metrics, and artifacts for every training run, so model versions can be compared directly.",
  },
  {
    icon: ShieldCheck,
    title: "Validation & CI/CD",
    description:
      "Schema and range checks run before training, out-of-distribution flags run at inference, and GitHub Actions runs the test suite on every push.",
  },
];

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto mb-11 max-w-[620px] text-center">
      <div className="mb-2.5 text-[0.78rem] font-bold uppercase tracking-[0.12em] text-brand">{eyebrow}</div>
      <h2 className="mb-3 text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-[-0.02em]">{title}</h2>
      <p className="leading-[1.6] text-muted-foreground">{description}</p>
    </div>
  );
}

export function Home() {
  const [info, setInfo] = useState<ModelInfo | null>(null);

  useEffect(() => {
    getModelInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);

  return (
    <div className="-mt-7">
      {/* Hero */}
      <section
        className="hero-aurora rounded-b-[2rem] px-6 py-22 text-center sm:py-28"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.22), transparent 70%), radial-gradient(45% 40% at 85% 10%, rgba(56,189,248,0.16), transparent 70%)",
        }}
      >
        <div className="relative z-2 mx-auto max-w-[760px]">
          <span className="mb-5.5 inline-flex items-center gap-2 rounded-full border border-border bg-white/3 px-3.5 py-1.5 text-[0.78rem] font-bold uppercase tracking-[0.08em] text-brand">
            <span className="pulse-dot" /> Live ML-powered flood intelligence
          </span>
          <h1 className="mb-4.5 text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold leading-[1.12] tracking-[-0.03em]">
            <span className="mb-1.5 block font-serif text-[clamp(1.05rem,2.2vw,1.5rem)] font-medium italic tracking-[0.06em] text-muted-foreground">
              FloodGuard<span className="ml-1 text-brand">/</span>
            </span>
            Know your flood risk
            <br />
            <span className="gradient-text font-serif font-semibold italic tracking-[-0.01em]">before the water rises.</span>
          </h1>
          <p className="mx-auto mb-9 max-w-[600px] text-[1.1rem] leading-[1.7] text-muted-foreground">
            FloodGuard AI scores flood risk for any location in Sri Lanka in milliseconds, explains the result in
            plain language, and tracks every prediction on a live monitoring dashboard — a complete
            model-to-production system built on the ML Opsidian: Genesis Initial Round model.
          </p>
          <div className="mb-2 flex flex-wrap items-center justify-center gap-3.5">
            <Button asChild variant="gradient" size="xl">
              <Link to="/predict">Assess a location</Link>
            </Button>
            <Button asChild variant="brand-outline" size="xl">
              <Link to="/dashboard">View live monitoring</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <SectionHeader
          eyebrow="How it works"
          title="From raw inputs to an actionable risk report"
          description="Every request runs through the same pipeline that powers the Initial Round model — rebuilt to score one location at a time, in real time."
        />
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {STEPS.map((step, i) => (
            <div key={step.title} className="step-card rounded-[20px] border border-border p-5.5 pt-7">
              <span className="mb-3.5 inline-flex h-8.5 w-8.5 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand to-brand-2 text-sm font-extrabold text-[#08111f]">
                {i + 1}
              </span>
              <h3 className="mb-2 text-base font-bold">{step.title}</h3>
              <p className="text-[0.88rem] leading-[1.6] text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <SectionHeader
          eyebrow="Built for production"
          title="An MLOps system, not just a model"
          description="FloodGuard AI packages the full machine-learning lifecycle — data, training, serving, and monitoring — into a single deployable service."
        />
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-[20px] border border-border bg-card p-6.5 transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_8px_24px_rgba(2,8,23,0.35)]"
              >
                <div className="mb-4.5 flex h-11.5 w-11.5 items-center justify-center rounded-xl bg-brand/12 text-brand">
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <h3 className="mb-2 text-[1.02rem] font-bold">{feature.title}</h3>
                <p className="text-[0.9rem] leading-[1.6] text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Live model snapshot */}
      <section className="py-16">
        <SectionHeader
          eyebrow="Model snapshot"
          title="Trained on real Sri Lankan flood data"
          description="Live numbers, pulled directly from the currently deployed model artifact."
        />
        <div className="grid gap-4 rounded-[20px] border border-border bg-card p-7 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <StatPill value={info?.version ?? "–"} label="Model version" />
          <StatPill value={info?.n_features ?? "–"} label="Engineered features" />
          <StatPill value={info ? info.n_rows.toLocaleString() : "–"} label="Training records" />
          <StatPill value={info ? info.metrics.oof_calibrated.toFixed(3) : "–"} label="OOF custom metric" />
          <StatPill value={info?.n_folds ?? "–"} label="Cross-validation folds" />
        </div>
      </section>

      {/* CTA */}
      <section
        className="relative mb-2 overflow-hidden rounded-[20px] border border-border px-6 py-14 text-center"
        style={{ background: "radial-gradient(60% 80% at 50% 100%, rgba(56,189,248,0.16), transparent 70%), var(--color-panel)" }}
      >
        <h2 className="mb-3 text-[clamp(1.5rem,3vw,2rem)] font-extrabold tracking-[-0.02em]">Ready to check a location?</h2>
        <p className="mx-auto mb-6.5 max-w-[480px] leading-[1.6] text-muted-foreground">
          Fill in a few details about geography, climate, and infrastructure to get an instant flood-risk assessment
          and AI-written report.
        </p>
        <Button asChild variant="gradient" size="xl">
          <Link to="/predict">Assess a location</Link>
        </Button>
      </section>
    </div>
  );
}

function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="border-b border-border pb-3.5 text-center last:border-b-0 md:border-b-0 md:border-r md:pb-0 md:last:border-r-0">
      <div className="gradient-text text-[1.7rem] font-extrabold">{value}</div>
      <div className="mt-1.5 text-[0.78rem] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
    </div>
  );
}
