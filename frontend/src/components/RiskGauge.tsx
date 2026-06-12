import { RISK_COLORS } from "@/lib/api";

interface RiskGaugeProps {
  score: number;
  category: string;
  /** Changing this remounts the gauge, replaying the ripple animation. */
  animationKey?: number | string;
}

export function RiskGauge({ score, category, animationKey }: RiskGaugeProps) {
  const color = RISK_COLORS[category] ?? "var(--color-brand)";
  const pct = Math.max(0, Math.min(100, score * 100));

  return (
    <div
      key={animationKey}
      className="relative flex h-44 w-44 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${color} ${pct}%, var(--color-panel-2) 0)` }}
    >
      <span
        className="animate-gauge-ripple absolute -inset-2 rounded-full border-2 opacity-0"
        style={{ borderColor: color }}
      />
      <div className="absolute inset-3.5 rounded-full bg-card" />
      <div className="relative flex flex-col items-center">
        <span className="text-3xl font-extrabold tabular-nums">{score.toFixed(3)}</span>
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          risk score
        </span>
      </div>
    </div>
  );
}
