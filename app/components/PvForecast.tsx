"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ForecastHour {
  hour: number;
  watts: number;
  wattHours: number;
}

interface ForecastDay {
  date: string;
  totalKwh: number;
  hours: ForecastHour[];
}

interface ForecastData {
  today: ForecastDay | null;
  tomorrow: ForecastDay | null;
}

export function PvForecast() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/forecast")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border p-6 bg-white shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Prognoza PV</h2>
        <p className="text-gray-400 text-sm">Ładowanie prognozy...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border p-6 bg-white shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Prognoza PV</h2>
        <p className="text-red-500 text-sm">{error || "Brak danych"}</p>
      </div>
    );
  }

  const chartData = [];
  const todayHours = data.today?.hours ?? [];
  const tomorrowHours = data.tomorrow?.hours ?? [];

  // Merge into single dataset
  for (let h = 0; h < 24; h++) {
    const t = todayHours.find((x) => x.hour === h);
    const tm = tomorrowHours.find((x) => x.hour === h);
    if (t || tm) {
      chartData.push({
        hour: `${String(h).padStart(2, "0")}:00`,
        dzis: t ? Math.round(t.watts) : 0,
        jutro: tm ? Math.round(tm.watts) : 0,
      });
    }
  }

  const currentHour = new Date().getHours();

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">☀️ Prognoza PV</h2>
        <div className="flex gap-4 text-sm">
          {data.today && (
            <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded">
              Dziś: <strong>{data.today.totalKwh} kWh</strong>
            </span>
          )}
          {data.tomorrow && (
            <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded">
              Jutro: <strong>{data.tomorrow.totalKwh} kWh</strong>
            </span>
          )}
        </div>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis dataKey="hour" fontSize={10} />
            <YAxis fontSize={10} tickFormatter={(v) => `${v}W`} />
            <Tooltip
              formatter={(v, name) => [
                `${Number(v ?? 0)} W`,
                String(name ?? ""),
              ]}
            />
            <Legend />
            <Bar dataKey="dzis" fill="#eab308" name="Dziś" />
            <Bar dataKey="jutro" fill="#f97316" name="Jutro" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-gray-400 text-sm text-center py-4">
          Brak danych prognozy
        </p>
      )}

      <p className="text-[10px] text-gray-300 mt-2 text-right">
        forecast.solar | 10 kWp | azymut: południe
      </p>
    </div>
  );
}
