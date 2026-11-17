"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rupiah, rupiahShort } from "@/lib/format";

interface DayPoint {
  date: string;
  revenue: number;
  grossProfit: number;
  expense: number;
}

const SERIES = [
  { key: "revenue", name: "Pendapatan", color: "var(--chart-1)" },
  { key: "grossProfit", name: "Laba Kotor", color: "var(--chart-5)" },
  { key: "expense", name: "Pengeluaran", color: "var(--chart-3)" },
] as const;

const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(
    new Date(`${key}T00:00:00`),
  );

const fullLabel = (key: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(
    new Date(`${key}T00:00:00`),
  );

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-(--shadow-popover) ring-1 ring-foreground/10">
      <p className="mb-1.5 font-medium text-popover-foreground">{fullLabel(label)}</p>
      <div className="space-y-0.5">
        {payload.map((p) => (
          <p key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              {p.name}
            </span>
            <span className="tnum font-medium text-popover-foreground">
              {rupiah(p.value ?? 0)}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Satu chart untuk pendapatan, laba kotor, dan pengeluaran.
 * Sebelumnya pendapatan dan pengeluaran dipisah di dua kartu, padahal
 * pertanyaan pemiliknya justru perbandingan keduanya — memisahkannya
 * memaksa mata melompat antar dua sumbu Y yang skalanya berbeda.
 */
export function PerformanceChart({ data }: { data: DayPoint[] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {SERIES.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            {s.name}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={rupiahShort}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            content={<MoneyTooltip />}
            cursor={{ fill: "var(--muted)", opacity: 0.45 }}
          />
          <Bar
            dataKey="expense"
            name="Pengeluaran"
            fill="var(--chart-3)"
            fillOpacity={0.55}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
          <Area
            dataKey="revenue"
            name="Pendapatan"
            type="monotone"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#revFill)"
            activeDot={{ r: 3 }}
          />
          <Line
            dataKey="grossProfit"
            name="Laba Kotor"
            type="monotone"
            stroke="var(--chart-5)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
