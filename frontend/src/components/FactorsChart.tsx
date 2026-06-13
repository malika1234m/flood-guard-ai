import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FeatureContribution } from "@/lib/api";
import { factorLabel } from "@/lib/api";

export function FactorsChart({ factors }: { factors: FeatureContribution[] }) {
  const max = Math.max(...factors.map((f) => f.importance), 1);
  const data = factors.map((f) => ({ name: factorLabel(f.feature), influence: Math.round((f.importance / max) * 100) }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--color-line)" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke="var(--color-text-muted)"
          tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="var(--color-text)"
          tick={{ fontSize: 12, fill: "var(--color-text)" }}
          width={150}
        />
        <Tooltip
          formatter={(value) => [`${value}%`, "Relative influence"]}
          cursor={{ fill: "var(--color-panel-2)" }}
          contentStyle={{
            background: "var(--color-panel-2)",
            border: "1px solid var(--color-line)",
            borderRadius: 8,
            color: "var(--color-text)",
            fontSize: "0.85rem",
          }}
        />
        <Bar dataKey="influence" name="Relative influence" fill="var(--color-brand)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
