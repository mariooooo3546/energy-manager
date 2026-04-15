"use client";

import { useEffect, useState } from "react";

type Schedule = Record<string, number>;

export function ScheduleTable() {
  const [schedule, setSchedule] = useState<Schedule>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/schedule")
      .then((r) => r.json())
      .then(setSchedule)
      .catch(() => {});
  }, []);

  function handleChange(hour: number, value: string) {
    const num = parseInt(value);
    setSchedule((prev) => {
      const next = { ...prev };
      if (value === "" || isNaN(num)) {
        delete next[String(hour)];
      } else {
        next[String(hour)] = Math.max(0, Math.min(100, num));
      }
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      setSaved(true);
    } catch {}
    setSaving(false);
  }

  const currentHour = new Date().getHours();

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Harmonogram rozladowania</h2>
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

      <p className="text-xs text-gray-500 mb-3">
        Ustaw docelowy max. SOC baterii na dana godzine. Puste = tryb auto.
        Jesli SOC &gt; cel, system sprzeda energie.
      </p>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {Array.from({ length: 24 }, (_, hour) => {
          const isActive = schedule[String(hour)] !== undefined;
          const isCurrent = hour === currentHour;

          return (
            <div
              key={hour}
              className={`rounded-lg p-2 text-center border ${
                isCurrent
                  ? "border-orange-400 bg-orange-50"
                  : isActive
                  ? "border-blue-300 bg-blue-50"
                  : "border-gray-200"
              }`}
            >
              <div
                className={`text-xs font-medium mb-1 ${
                  isCurrent ? "text-orange-600" : "text-gray-600"
                }`}
              >
                {hour.toString().padStart(2, "0")}:00
              </div>
              <input
                type="number"
                min={0}
                max={100}
                value={schedule[String(hour)] ?? ""}
                onChange={(e) => handleChange(hour, e.target.value)}
                placeholder="-"
                className="w-full text-center text-sm font-mono border rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {isActive && (
                <div className="text-[10px] text-gray-400 mt-0.5">%</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
