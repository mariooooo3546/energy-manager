"use client";

import { useEffect, useState } from "react";

interface Conditions {
  sellMinPrice: number;
  sellMinSoc: number;
  buyMaxPrice: number;
  buyMaxSoc: number;
  minSocFloor: number;
}

export function ConditionsCard() {
  const [conditions, setConditions] = useState<Conditions>({
    sellMinPrice: 0.8,
    sellMinSoc: 40,
    buyMaxPrice: 0.5,
    buyMaxSoc: 80,
    minSocFloor: 20,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/conditions")
      .then((r) => r.json())
      .then(setConditions)
      .catch(() => {});
  }, []);

  function update(key: keyof Conditions, value: string) {
    setConditions((prev) => ({ ...prev, [key]: parseFloat(value) || 0 }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/conditions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conditions),
      });
      setSaved(true);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Warunki handlu</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            saved
              ? "bg-green-100 text-green-700"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          {saving ? "Zapisuje..." : saved ? "Zapisano" : "Zapisz"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Warunki sprzedaży */}
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <h3 className="font-medium text-green-800 mb-3">
            Sprzedaj gdy:
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-700 block mb-1">
                Cena energii &ge;
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={conditions.sellMinPrice}
                  onChange={(e) => update("sellMinPrice", e.target.value)}
                  className="w-24 text-center font-mono border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <span className="text-sm text-gray-600">zl/kWh</span>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-700 block mb-1">
                SOC baterii &ge;
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={conditions.sellMinSoc}
                  onChange={(e) => update("sellMinSoc", e.target.value)}
                  className="w-24 text-center font-mono border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Warunki kupna */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-medium text-blue-800 mb-3">
            Kupuj (laduj) gdy:
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-700 block mb-1">
                Cena energii &le;
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={conditions.buyMaxPrice}
                  onChange={(e) => update("buyMaxPrice", e.target.value)}
                  className="w-24 text-center font-mono border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-sm text-gray-600">zl/kWh</span>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-700 block mb-1">
                SOC baterii &le;
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={conditions.buyMaxSoc}
                  onChange={(e) => update("buyMaxSoc", e.target.value)}
                  className="w-24 text-center font-mono border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Minimalny SOC */}
      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-red-800">
              Nie schodz ponizej
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              System nigdy nie sprzeda energii jesli SOC spadnie do tego poziomu
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={conditions.minSocFloor}
              onChange={(e) => update("minSocFloor", e.target.value)}
              className="w-24 text-center font-mono border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
            <span className="text-sm text-gray-600">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
