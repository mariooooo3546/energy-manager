"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface PriceFrame {
  start: string;
  metrics: {
    pricing: {
      price_gross: number;
      price_prosumer_gross: number;
    };
  };
}

interface Props {
  frames: PriceFrame[];
}

export function PriceChart({ frames }: Props) {
  const currentHour = new Date().getHours();

  const data = frames.map((f) => {
    const hour = new Date(f.start).getHours();
    return {
      hour: `${hour.toString().padStart(2, "0")}:00`,
      kupno: f.metrics.pricing.price_gross,
      sprzedaz: f.metrics.pricing.price_prosumer_gross,
      isCurrent: hour === currentHour,
    };
  });

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Ceny energii dzis</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="hour" fontSize={12} />
          <YAxis fontSize={12} tickFormatter={(v) => `${v} zl`} />
          <Tooltip formatter={(v) => `${Number(v).toFixed(2)} zl/kWh`} />
          <Legend />
          <Bar dataKey="kupno" fill="#3b82f6" name="Kupno" />
          <Bar dataKey="sprzedaz" fill="#22c55e" name="Sprzedaz" />
          <ReferenceLine x={`${currentHour.toString().padStart(2, "0")}:00`} stroke="#f59e0b" strokeWidth={2} label="Teraz" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
