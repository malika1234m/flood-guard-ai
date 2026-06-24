import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Droplet, GitBranch, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveRiskPreview } from "@/components/LiveRiskPreview";
import { SectionHeader } from "@/components/SectionHeader";
import { getModelInfo, type ModelInfo } from "@/lib/api";

const STEPS = [
  {
    title: "Describe a location",
    description:
      "Tell us about the geography, climate, land cover, infrastructure, and community of a location — or start from typical values and adjust what you know.",
  },
  {
    title: "Compared with historical records",
    description:
      "Your inputs are checked against decades of district-level rainfall, terrain, and flood-history data to understand how this location compares.",
  },
  {
    title: "Multi-model risk score",
    description:
      "Six machine-learning models analyze the data independently. Their SLSQP-optimised blend is calibrated into one clear risk score from 0 to 1.",
  },
  {
    title: "AI risk report & monitoring",
    description:
      "An AI advisor explains the score and the leading factors in plain language, with recommended next steps — while every assessment is tracked on a live dashboard.",
  },
];

const FEATURES = [
  {
    icon: Layers,
    title: "Multi-model risk engine",
    description:
      "Six independent machine-learning models (LightGBM, XGBoost ×2, CatBoost ×2, CatBoost-RMSE) cross-check each other, and the SLSQP-blended result is calibrated against real flood outcomes from across Sri Lanka for a dependable score.",
  },
  {
    icon: Droplet,
    title: "Tailored to each location",
    description:
      "Every assessment is automatically enriched with district climate, terrain, and historical flood patterns — so you get a result tailored to that exact spot, not a generic estimate.",
  },
  {
    icon: Sparkles,
    title: "AI-generated risk reports",
    description:
      "Every result includes a plain-language summary of the score and the factors behind it, plus recommended actions — written for residents and decision-makers, not data scientists.",
  },
  {
    icon: Activity,
    title: "Live monitoring dashboard",
    description:
      "Every assessment is logged and visualized in real time — usage trends, score distribution, risk levels, and response times — so service performance is always visible.",
  },
  {
    icon: GitBranch,
    title: "Continuously improved",
    description:
      "Every model version is tracked and benchmarked against the last, so accuracy improvements are measured over time, not assumed.",
  },
  {
    icon: ShieldCheck,
    title: "Tested & validated",
    description:
      "Incoming data is checked for plausible ranges, unusual locations are flagged automatically, and the full system is tested before every update goes live.",
  },
];

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
      <section className="hero-aurora px-6 py-16 text-center sm:py-20">
        <div className="relative z-2 mx-auto max-w-[760px]">
          <img
            src="/logo/floodguard-full-480.png"
            alt="FloodGuard AI — Flood Alert & Prediction System"
            className="mx-auto mb-6 h-16 rounded-2xl bg-white/95 px-5 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.25)] sm:h-20"
          />
          <span className="mb-5.5 inline-flex items-center gap-2 rounded-full border border-border bg-white/3 px-3.5 py-1.5 text-[0.78rem] font-bold uppercase tracking-[0.08em] text-brand">
            <span className="pulse-dot" /> Live ML-powered flood intelligence
          </span>
          <h1 className="mb-4.5 text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold leading-[1.12] tracking-[-0.03em]">
            Know your flood risk
            <br />
            <span className="gradient-text font-serif font-semibold italic tracking-[-0.01em]">before the water rises.</span>
          </h1>
          <p className="mx-auto mb-9 max-w-[600px] text-[1.1rem] leading-[1.7] text-muted-foreground">
            FloodGuard AI scores flood risk for any location in Sri Lanka in seconds, explains the result in
            plain language, and gives you clear next steps — so residents, local authorities, and businesses
            can prepare before the water rises.
          </p>
          <div className="mb-2 flex flex-wrap items-center justify-center gap-3.5">
            <Button asChild variant="gradient" size="xl">
              <Link to="/district">Check my district</Link>
            </Button>
            <Button asChild variant="brand-outline" size="xl">
              <Link to="/forecast">10-day forecast</Link>
            </Button>
          </div>
        </div>

        {/* Live product preview */}
        <div className="relative z-2 mx-auto mt-14 max-w-[1080px] text-left">
          <LiveRiskPreview />
        </div>
      </section>

      <div className="glow-divider mx-auto my-2 w-[min(640px,80%)]" />

      {/* Why this matters */}
      <section className="relative py-16">
        <div className="pointer-events-none absolute right-0 top-4 -z-10 h-72 w-72 rounded-full bg-[rgba(239,68,68,0.10)] blur-[100px]" />
        <div className="glass-panel grid gap-8 overflow-hidden rounded-[20px] p-7 md:grid-cols-[1.1fr_1fr] md:items-center md:p-9">
          <div>
            <div className="mb-2.5 text-[0.78rem] font-bold uppercase tracking-[0.12em] text-brand">Why this matters</div>
            <h2 className="mb-3 text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold tracking-[-0.02em]">
              Built in the aftermath of <span className="gradient-text">Cyclone Ditwah</span>
            </h2>
            <p className="mb-6 leading-[1.7] text-muted-foreground">
              Cyclone Ditwah brought days of relentless rain to Sri Lanka, swelling rivers, triggering landslides, and
              submerging entire towns. Families waded through chest-deep floodwater, rescue boats navigated city
              streets, and communities were cut off for days. FloodGuard AI exists to give people that warning
              before the water rises.
            </p>
            <Button asChild variant="brand-outline" size="lg">
              <Link to="/impact">
                See the Ditwah flood impact <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <img
              src="/ditwah/ditwah-05-aerial-town.avif"
              alt="Aerial view of a Sri Lankan town almost entirely submerged by floodwater after Cyclone Ditwah"
              className="col-span-2 h-44 w-full rounded-[14px] object-cover sm:h-56"
              loading="lazy"
            />
            <img
              src="/ditwah/ditwah-08-landslide.jpeg"
              alt="Landslide damage to homes and roads in Sri Lanka after Cyclone Ditwah"
              className="h-28 w-full rounded-[14px] object-cover sm:h-32"
              loading="lazy"
            />
            <img
              src="/ditwah/ditwah-07-boat-rescue.jpeg"
              alt="Rescue boat navigating a flooded city street in Sri Lanka"
              className="h-28 w-full rounded-[14px] object-cover sm:h-32"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative py-16">
        <div className="pointer-events-none absolute -left-32 top-10 -z-10 h-80 w-80 rounded-full bg-[rgba(99,102,241,0.14)] blur-[100px]" />
        <SectionHeader
          eyebrow="How it works"
          title="From raw inputs to an actionable risk report"
          description="Every assessment runs through the same data pipeline and models described below — built to score one location at a time, in real time."
        />
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {STEPS.map((step, i) => (
            <div key={step.title} className="step-card rounded-[20px] p-5.5 pt-7">
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
      <section className="relative py-16">
        <div className="pointer-events-none absolute -right-32 top-20 -z-10 h-96 w-96 rounded-full bg-[rgba(56,189,248,0.12)] blur-[110px]" />
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
                className="group glass-panel rounded-[20px] p-6.5 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:bg-white/[0.045] hover:shadow-[0_8px_32px_rgba(56,189,248,0.18)]"
              >
                <div className="mb-4.5 flex h-11.5 w-11.5 items-center justify-center rounded-xl bg-brand/12 text-brand transition-colors duration-300 group-hover:bg-brand/20">
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
      <section className="relative py-16">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-72 w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(99,102,241,0.08)] blur-[110px]" />
        <SectionHeader
          eyebrow="Model snapshot"
          title="Trained on real Sri Lankan flood data"
          description="Live numbers from the model currently powering every assessment on this site."
        />
        <div className="glass-panel grid gap-4 rounded-[20px] p-7 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <StatPill value={info?.version ?? "–"} label="Model version" />
          <StatPill value={info?.categorical_options.district.length ?? "–"} label="Districts covered" />
          <StatPill value={info ? info.n_rows.toLocaleString() : "–"} label="Historical records analyzed" />
          <StatPill value={info?.n_folds ?? "–"} label="Independent validation rounds" />
        </div>
      </section>

      <div className="glow-divider mx-auto my-2 w-[min(640px,80%)]" />

      {/* CTA */}
      <section
        className="glass-panel relative mb-2 mt-9 overflow-hidden rounded-[20px] px-6 py-14 text-center"
        style={{
          background:
            "radial-gradient(60% 90% at 50% 100%, rgba(56,189,248,0.22), transparent 70%), radial-gradient(50% 70% at 50% 0%, rgba(99,102,241,0.16), transparent 70%), rgba(255,255,255,0.025)",
        }}
      >
        <h2 className="mb-3 text-[clamp(1.5rem,3vw,2rem)] font-extrabold tracking-[-0.02em]">Ready to check a location?</h2>
        <p className="mx-auto mb-6.5 max-w-[480px] leading-[1.6] text-muted-foreground">
          Fill in a few details about geography, climate, and infrastructure to get an instant flood-risk assessment
          and AI-written report.
        </p>
        <Button asChild variant="gradient" size="xl">
          <Link to="/district">Check my district</Link>
        </Button>
      </section>
    </div>
  );
}

function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="border-b border-white/8 pb-3.5 text-center last:border-b-0 md:border-b-0 md:border-r md:pb-0 md:last:border-r-0">
      <div className="gradient-text text-[1.7rem] font-extrabold">{value}</div>
      <div className="mt-1.5 text-[0.78rem] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
    </div>
  );
}
