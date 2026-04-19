"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
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
  wattsP10?: number;
  wattsP90?: number;
}

interface ForecastDay {
  date: string;
  totalKwh: number;
  totalKwhP10?: number;
  totalKwhP90?: number;
  hours: ForecastHour[];
}

interface ForecastData {
  today: ForecastDay | null;
  tomorrow: ForecastDay | null;
  source?: string;
  fetchedAt?: string;
  cached?: boolean;
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
  // Show tomorrow when today is mostly in the past (fewer than 4h left).
  const showDay = tomorrowHours.length > todayHours.length ? "tomorrow" : "today";
  const sourceHours = showDay === "tomorrow" ? tomorrowHours : todayHours;
  const dayColor = showDay === "tomorrow" ? "#f97316" : "#eab308";

  for (let h = 0; h < 24; h++) {
    const hr = sourceHours.find((x) => x.hour === h);
    chartData.push({
      hour: `${String(h).padStart(2, "0")}:00`,
      watts: hr ? Math.round(hr.watts) : 0,
      p10: hr?.wattsP10 ? Math.round(hr.wattsP10) : 0,
      p90: hr?.wattsP90 ? Math.round(hr.wattsP90) : 0,
    });
  }

  const todayP10 = data.today?.totalKwhP10 ?? null;
  const todayP90 = data.today?.totalKwhP90 ?? null;
  const tomorrowP10 = data.tomorrow?.totalKwhP10 ?? null;
  const tomorrowP90 = data.tomorrow?.totalKwhP90 ?? null;

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">☀️ Prognoza PV</h2>
        <div className="flex gap-4 text-sm">
          {data.today && (
            <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded" title={`P10 – P90: ${todayP10} – ${todayP90} kWh`}>
              Dziś: <strong>{data.today.totalKwh}</strong>
              <span className="text-[10px] text-yellow-600 ml-1">({todayP10}–{todayP90})</span> kWh
            </span>
          )}
          {data.tomorrow && (
            <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded" title={`P10 – P90: ${tomorrowP10} – ${tomorrowP90} kWh`}>
              Jutro: <strong>{data.tomorrow.totalKwh}</strong>
              <span className="text-[10px] text-orange-600 ml-1">({tomorrowP10}–{tomorrowP90})</span> kWh
            </span>
          )}
        </div>
      </div>

      {chartData.length > 0 ? (
        <>
          <div className="text-xs text-gray-500 mb-1">
            {showDay === "tomorrow" ? "Jutro" : "Dziś"} — prognoza godzinowa (P50 słupki, widełki P10–P90)
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData}>
              <XAxis dataKey="hour" fontSize={10} />
              <YAxis fontSize={10} tickFormatter={(v) => `${v}W`} />
              <Tooltip
                formatter={(v, name) => [`${Number(v ?? 0)} W`, String(name ?? "")]}
              />
              <Legend />
              <Bar dataKey="watts" fill={dayColor} name="P50 (najbardziej prawdopodobne)" />
              <Line
                dataKey="p10"
                stroke="#9ca3af"
                strokeDasharray="3 3"
                dot={false}
                name="P10 (pesymistycznie)"
                strokeWidth={1.5}
              />
              <Line
                dataKey="p90"
                stroke="#6b7280"
                strokeDasharray="3 3"
                dot={false}
                name="P90 (optymistycznie)"
                strokeWidth={1.5}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      ) : (
        <p className="text-gray-400 text-sm text-center py-4">
          Brak danych prognozy
        </p>
      )}

      <p className="text-[10px] text-gray-300 mt-2 text-right">
        {data.source ?? "forecast.solar"} | 10 kWp | azymut: południe
        {data.fetchedAt && ` | pobrano ${new Date(data.fetchedAt).toLocaleTimeString("pl-PL")}${data.cached ? " (cache)" : ""}`}
      </p>
    </div>
  );
}
