"use client";

import { Decision } from "@/src/lib/types";

interface Props {
  decisions: Decision[];
}

const actionStyles: Record<string, string> = {
  CHARGE: "bg-blue-100 text-blue-800",
  SELL: "bg-green-100 text-green-800",
  NORMAL: "bg-gray-100 text-gray-800",
};

export function DecisionLog({ decisions }: Props) {
  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Historia decyzji</h2>
      {decisions.length === 0 ? (
        <p className="text-gray-500 text-sm">Brak danych</p>
      ) : (
        <div className="space-y-2">
          {decisions.map((d, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="font-mono text-gray-500 w-28 shrink-0">
                {new Date(d.timestamp).toLocaleDateString("pl-PL", {
                  day: "2-digit",
                  month: "2-digit",
                })}{" "}
                {new Date(d.timestamp).toLocaleTimeString("pl-PL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionStyles[d.action]}`}>
                {d.action}
              </span>
              <span className="font-mono">SOC:{d.soc}%</span>
              <span className="text-gray-500 truncate">{d.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
