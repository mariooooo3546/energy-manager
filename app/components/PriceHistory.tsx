"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface HourAvg {
  hour: number;
  avgBuy: number;
  avgSell: number;
}

interface DayData {
  day: string;
  dayIndex: number;
  isWeekend: boolean;
  hours: HourAvg[];
}

interface HistoryData {
  perDay: DayData[];
  weekdayAvg: HourAvg[];
  weekendAvg: HourAvg[];
}

type ViewMode = "weekday-weekend" | string; // day name

export function PriceHistory() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [view, setView] = useState<ViewMode>("weekday-weekend");

  useEffect(() => {
    fetch("/api/prices/history?days=21")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d);
      })
      .catch(() => {});
  }, []);

  if (!data) return null;

  const tabs: { label: string; value: ViewMode }[] = [
    { label: "Tyg. vs Weekend", value: "weekday-weekend" },
    ...data.perDay.map((d) => ({
      label: d.day.substring(0, 3) + (d.isWeekend ? "*" : ""),
      value: d.day,
    })),
  ];

  let chartData: { hour: string; kupno: number; sprzedaz: number; kupno2?: number; sprzedaz2?: number }[];

  if (view === "weekday-weekend") {
    chartData = data.weekdayAvg.map((wd, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      kupno: wd.avgBuy,
      sprzedaz: wd.avgSell,
      kupno2: data.weekendAvg[i].avgBuy,
      sprzedaz2: data.weekendAvg[i].avgSell,
    }));
  } else {
    const dayData = data.perDay.find((d) => d.day === view);
    chartData = (dayData?.hours ?? []).map((h) => ({
      hour: `${h.hour.toString().padStart(2, "0")}:00`,
      kupno: h.avgBuy,
      sprzedaz: h.avgSell,
    }));
  }

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-2">
        Srednie ceny (ostatnie 21 dni)
      </h2>

      <div className="flex flex-wrap gap-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setView(tab.value)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              view === tab.value
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <XAxis dataKey="hour" fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `${v} zl`} />
          <Tooltip
            formatter={(v, name) => [
              `${Number(v ?? 0).toFixed(2)} zl/kWh`,
              String(name ?? ""),
            ]}
          />
          <Legend />
          {view === "weekday-weekend" ? (
            <>
              <Bar dataKey="kupno" fill="#3b82f6" name="Kupno (tydzien)" />
              <Bar dataKey="sprzedaz" fill="#22c55e" name="Sprzedaz (tydzien)" />
              <Bar dataKey="kupno2" fill="#93c5fd" name="Kupno (weekend)" />
              <Bar dataKey="sprzedaz2" fill="#86efac" name="Sprzedaz (weekend)" />
            </>
          ) : (
            <>
              <Bar dataKey="kupno" fill="#3b82f6" name="Kupno" />
              <Bar dataKey="sprzedaz" fill="#22c55e" name="Sprzedaz" />
            </>
          )}
        </BarChart>
      </ResponsiveContainer>

      {view === "weekday-weekend" && (
        <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
          <div>
            <h3 className="font-medium mb-1">Dni robocze — najdrozsze godziny</h3>
            {data.weekdayAvg
              .filter((h) => h.avgBuy > 0)
              .sort((a, b) => b.avgBuy - a.avgBuy)
              .slice(0, 5)
              .map((h) => (
                <div key={h.hour} className="flex justify-between font-mono text-xs">
                  <span>{h.hour.toString().padStart(2, "0")}:00</span>
                  <span>
                    kupno {h.avgBuy.toFixed(2)} / sprzedaz {h.avgSell.toFixed(2)} zl
                  </span>
                </div>
              ))}
          </div>
          <div>
            <h3 className="font-medium mb-1">Dni robocze — najtansze godziny</h3>
            {data.weekdayAvg
              .filter((h) => h.avgBuy > 0)
              .sort((a, b) => a.avgBuy - b.avgBuy)
              .slice(0, 5)
              .map((h) => (
                <div key={h.hour} className="flex justify-between font-mono text-xs">
                  <span>{h.hour.toString().padStart(2, "0")}:00</span>
                  <span>
                    kupno {h.avgBuy.toFixed(2)} / sprzedaz {h.avgSell.toFixed(2)} zl
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
