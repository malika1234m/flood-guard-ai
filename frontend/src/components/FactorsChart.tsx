import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FeatureContribution } from "@/lib/api";
import { prettify } from "@/lib/api";

export function FactorsChart({ factors }: { factors: FeatureContribution[] }) {
  const data = factors.map((f) => ({ name: prettify(f.feature), importance: f.importance }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--color-line)" horizontal={false} />
        <XAxis type="number" stroke="var(--color-text-muted)" tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
        <YAxis
          type="category"
          dataKey="name"
          stroke="var(--color-text)"
          tick={{ fontSize: 12, fill: "var(--color-text)" }}
          width={150}
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
        <Bar dataKey="importance" name="Model importance" fill="var(--color-brand)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
