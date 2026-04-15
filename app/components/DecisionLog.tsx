"use client";

import { Decision } from "@/src/lib/types";

interface Props {
  decisions: Decision[];
}

const actionConfig: Record<string, { bg: string; emoji: string; label: string }> = {
  CHARGE: { bg: "bg-blue-100 text-blue-800", emoji: "⚡", label: "Ładuj" },
  SELL: { bg: "bg-green-100 text-green-800", emoji: "💰", label: "Sprzedaj" },
  NORMAL: { bg: "bg-gray-100 text-gray-800", emoji: "🔄", label: "Normalny" },
};

export function DecisionLog({ decisions }: Props) {
  const sorted = [...decisions].reverse();

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Historia decyzji</h2>
        <span className="text-xs text-gray-400">{decisions.length} wpisów</span>
      </div>
      {sorted.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">
          Brak decyzji — system jeszcze nie wykonał żadnego cyklu
        </p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {sorted.map((d, i) => {
            const cfg = actionConfig[d.action] ?? actionConfig.NORMAL;
            const date = new Date(d.timestamp);
            return (
              <div
                key={i}
                className="flex items-start gap-2 text-sm p-2 rounded hover:bg-gray-50 transition-colors"
              >
                <span className="font-mono text-gray-400 text-xs mt-0.5 w-24 shrink-0">
                  {date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })}{" "}
                  {date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${cfg.bg}`}>
                  {cfg.emoji} {cfg.label}
                </span>
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                  {d.soc}%
                </span>
                <span className="text-gray-500 text-xs truncate" title={d.reason}>
                  {d.reason}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
