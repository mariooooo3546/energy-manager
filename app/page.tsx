"use client";

import { useEffect, useState } from "react";
import { StatusCard } from "./components/StatusCard";
import { ActionButtons } from "./components/ActionButtons";
import { PriceChart } from "./components/PriceChart";
import { DecisionLog } from "./components/DecisionLog";
import { ProfitCard } from "./components/ProfitCard";
import { ScheduleTable } from "./components/ScheduleTable";
import { ConditionsCard } from "./components/ConditionsCard";
import { PriceHistory } from "./components/PriceHistory";

export default function Dashboard() {
  const [status, setStatus] = useState<any>(null);
  const [prices, setPrices] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [profit, setProfit] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function fetchAll() {
    try {
      const safeFetch = async (url: string) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return { error: `HTTP ${r.status}` };
          const text = await r.text();
          return text ? JSON.parse(text) : { error: "Empty response" };
        } catch (e) {
          return { error: String(e) };
        }
      };
      const [s, p, h, pr] = await Promise.all([
        safeFetch("/api/status"),
        safeFetch("/api/prices"),
        safeFetch("/api/history"),
        safeFetch("/api/profit"),
      ]);
      if (s.error) {
        setError(s.error);
        setStatus(null);
      } else {
        setStatus(s);
        setError(null);
      }
      if (!p.error) setPrices(p);
      setHistory(Array.isArray(h) ? h : []);
      if (!pr.error) setProfit(pr);
      setLastRefresh(new Date());
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Energy Manager</h1>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-400">
              Odświeżono: {lastRefresh.toLocaleTimeString("pl-PL")}
            </span>
          )}
          <button
            onClick={fetchAll}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            🔄 Odśwież
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div>
      )}

      <div className="grid gap-6 max-w-5xl">
        {status && <StatusCard {...status} />}
        <ActionButtons override={status?.override ?? null} onActionComplete={fetchAll} />
        {profit && <ProfitCard {...profit} />}
        {prices?.today && <PriceChart frames={prices.today} />}
        <PriceHistory />
        <ConditionsCard />
        <ScheduleTable />
        <DecisionLog decisions={history} />
      </div>
    </main>
  );
}
