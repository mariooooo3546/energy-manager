"use client";

import { useState } from "react";

interface ActionButtonsProps {
  override: { active: boolean; action: string | null } | null;
  onActionComplete: () => void;
}

const ACTIONS = [
  { id: "SELL", label: "Sprzedaj", emoji: "💰", color: "green", desc: "Rozładuj baterię do sieci" },
  { id: "CHARGE", label: "Ładuj", emoji: "⚡", color: "blue", desc: "Ładuj baterię z sieci" },
  { id: "NORMAL", label: "Normalny", emoji: "🔄", color: "gray", desc: "Self-consumption" },
  { id: "auto", label: "Auto", emoji: "🤖", color: "purple", desc: "Tryb automatyczny" },
] as const;

const COLOR_MAP: Record<string, { active: string; hover: string; ring: string }> = {
  green: { active: "bg-green-600 text-white", hover: "hover:bg-green-50 hover:border-green-400", ring: "ring-green-400" },
  blue: { active: "bg-blue-600 text-white", hover: "hover:bg-blue-50 hover:border-blue-400", ring: "ring-blue-400" },
  gray: { active: "bg-gray-600 text-white", hover: "hover:bg-gray-50 hover:border-gray-400", ring: "ring-gray-400" },
  purple: { active: "bg-purple-600 text-white", hover: "hover:bg-purple-50 hover:border-purple-400", ring: "ring-purple-400" },
};

export function ActionButtons({ override, onActionComplete }: ActionButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentAction = override?.active ? override.action : "auto";

  async function handleAction(actionId: string) {
    setLoading(actionId);
    setError(null);

    try {
      // 1. Set override
      const res = await fetch("/api/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionId }),
      });
      if (!res.ok) throw new Error("Błąd ustawiania override");

      // 2. Immediately run cycle to apply
      if (actionId !== "auto") {
        const cycleRes = await fetch("/api/run-cycle", { method: "POST" });
        if (!cycleRes.ok) {
          const data = await cycleRes.json();
          throw new Error(data.error || "Błąd wykonania cyklu");
        }
      }

      onActionComplete();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-2">Sterowanie ręczne</h2>
      <p className="text-xs text-gray-500 mb-4">
        Wybierz tryb pracy falownika. Komenda zostanie wysłana natychmiast.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ACTIONS.map((action) => {
          const isActive = currentAction === action.id;
          const isLoading = loading === action.id;
          const colors = COLOR_MAP[action.color];

          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              disabled={loading !== null}
              className={`
                relative rounded-lg border-2 p-4 text-center transition-all
                ${isActive
                  ? `${colors.active} border-transparent ring-2 ${colors.ring}`
                  : `border-gray-200 ${colors.hover}`
                }
                ${loading !== null ? "opacity-60 cursor-wait" : "cursor-pointer"}
              `}
            >
              <div className="text-2xl mb-1">{action.emoji}</div>
              <div className={`text-sm font-semibold ${isActive ? "" : "text-gray-800"}`}>
                {action.label}
              </div>
              <div className={`text-[10px] mt-0.5 ${isActive ? "text-white/80" : "text-gray-400"}`}>
                {action.desc}
              </div>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-3 p-2 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
