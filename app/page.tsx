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

  async function fetchAll() {
    try {
      const [s, p, h, pr] = await Promise.all([
        fetch("/api/status").then((r) => r.json()),
        fetch("/api/prices").then((r) => r.json()),
        fetch("/api/history").then((r) => r.json()),
        fetch("/api/profit").then((r) => r.json()),
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
      <h1 className="text-2xl font-bold mb-6">Energy Manager</h1>

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
