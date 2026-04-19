"use client";

import { useEffect, useState } from "react";

type EvStatus = {
  connected?: boolean;
  identity?: string;
  boot?: {
    chargePointVendor?: string;
    chargePointModel?: string;
    chargePointSerialNumber?: string;
    firmwareVersion?: string;
  };
  lastStatus?: {
    connectorId?: number;
    status?: string;
    errorCode?: string;
    timestamp?: string;
  };
  lastMeter?: {
    meterValue?: Array<{
      sampledValue?: Array<{
        value: string;
        measurand?: string;
        unit?: string;
      }>;
    }>;
  };
  transaction?: {
    transactionId?: number;
    startedAt?: string;
    stoppedAt?: string;
    meterStart?: number;
  };
  ageSec?: number | null;
  stale?: boolean;
  updatedAt?: string;
};

type EvOverride = {
  mode: "AUTO" | "ECO" | "CHEAP" | "FAST" | "STOP";
  setAt?: string;
};

const STATE_META: Record<string, { label: string; color: string }> = {
  Available: { label: "Wolna", color: "bg-gray-100 text-gray-700" },
  Preparing: { label: "Podłączanie", color: "bg-yellow-100 text-yellow-800" },
  Charging: { label: "Ładuje", color: "bg-green-100 text-green-800" },
  SuspendedEV: { label: "Auto wstrzymało", color: "bg-blue-100 text-blue-800" },
  SuspendedEVSE: { label: "Stacja wstrzymała", color: "bg-blue-100 text-blue-800" },
  Finishing: { label: "Kończy", color: "bg-blue-100 text-blue-800" },
  Faulted: { label: "Błąd", color: "bg-red-100 text-red-800" },
  Unavailable: { label: "Niedostępna", color: "bg-gray-200 text-gray-600" },
};

function extractMeter(m: EvStatus["lastMeter"]): {
  powerW: number;
  energyWh: number;
  current: number;
} {
  let powerW = 0;
  let energyWh = 0;
  let current = 0;
  const samples = m?.meterValue?.[0]?.sampledValue ?? [];
  for (const s of samples) {
    const v = parseFloat(s.value);
    if (isNaN(v)) continue;
    if (s.measurand === "Power.Active.Import") powerW = v;
    else if (s.measurand === "Energy.Active.Import.Register") energyWh = v;
    else if (s.measurand === "Current.Import" && current === 0) current = v;
  }
  return { powerW, energyWh, current };
}

function ModeButton({
  mode,
  active,
  emoji,
  label,
  sub,
  color,
  onClick,
  disabled,
}: {
  mode: string;
  active: boolean;
  emoji: string;
  label: string;
  sub: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border p-3 text-center transition-colors ${
        active
          ? `${color} border-current`
          : "bg-white hover:bg-gray-50 border-gray-200"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={mode}
    >
      <div className="text-2xl mb-1">{emoji}</div>
      <div className="font-semibold text-sm">{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
    </button>
  );
}

export function EvCard() {
  const [status, setStatus] = useState<EvStatus | null>(null);
  const [override, setOverride] = useState<EvOverride | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function fetchAll() {
    try {
      const [s, o] = await Promise.all([
        fetch("/api/ev").then((r) => r.json()),
        fetch("/api/ev/override").then((r) => r.json()).catch(() => ({ mode: "AUTO" })),
      ]);
      if (s.error) {
        setError(s.error);
        setStatus(null);
      } else {
        setStatus(s);
        setError(null);
      }
      setOverride(o);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 15000);
    return () => clearInterval(t);
  }, []);

  async function setMode(mode: EvOverride["mode"]) {
    setSending(true);
    try {
      await fetch("/api/ev/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      await fetchAll();
    } finally {
      setSending(false);
    }
  }

  const state = status?.lastStatus?.status ?? "Unknown";
  const stateMeta = STATE_META[state] ?? {
    label: state,
    color: "bg-gray-100 text-gray-700",
  };
  const isCharging = state === "Charging";
  const { powerW, energyWh, current } = extractMeter(status?.lastMeter);
  const currentMode = override?.mode ?? "AUTO";

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold">🚗 Ładowarka EV</h2>
        <div className="flex gap-2 items-center flex-wrap">
          {status?.connected ? (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              ● Online {status.ageSec != null && `(${status.ageSec}s)`}
            </span>
          ) : (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
              ○ Offline
            </span>
          )}
          {status?.boot?.chargePointModel && (
            <span className="text-xs text-gray-500">
              {status.boot.chargePointModel} · SN {status.boot.chargePointSerialNumber}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* Live metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded bg-gray-50 p-3 text-center">
          <div className="text-xs text-gray-500">Stan</div>
          <div className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${stateMeta.color}`}>
            {stateMeta.label}
          </div>
        </div>
        <div className="rounded bg-gray-50 p-3 text-center">
          <div className="text-xs text-gray-500">Moc</div>
          <div className="font-mono font-semibold">
            {powerW > 0 ? `${(powerW / 1000).toFixed(2)} kW` : "—"}
          </div>
        </div>
        <div className="rounded bg-gray-50 p-3 text-center">
          <div className="text-xs text-gray-500">Prąd</div>
          <div className="font-mono font-semibold">
            {current > 0 ? `${current.toFixed(0)} A` : "—"}
          </div>
        </div>
        <div className="rounded bg-gray-50 p-3 text-center">
          <div className="text-xs text-gray-500">Sesja</div>
          <div className="font-mono font-semibold">
            {energyWh > 0 ? `${(energyWh / 1000).toFixed(2)} kWh` : "—"}
          </div>
        </div>
      </div>

      {/* Mode controls */}
      <div className="border-t pt-4">
        <div className="text-sm font-medium text-gray-700 mb-2">
          Tryb ładowania {currentMode !== "AUTO" && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-800">
              Override: {currentMode}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <ModeButton
            mode="AUTO"
            active={currentMode === "AUTO"}
            emoji="🤖"
            label="Auto"
            sub="harmonogram"
            color="bg-purple-100 text-purple-800"
            onClick={() => setMode("AUTO")}
            disabled={sending}
          />
          <ModeButton
            mode="ECO"
            active={currentMode === "ECO"}
            emoji="☀️"
            label="Eco"
            sub="tylko PV"
            color="bg-green-100 text-green-800"
            onClick={() => setMode("ECO")}
            disabled={sending}
          />
          <ModeButton
            mode="CHEAP"
            active={currentMode === "CHEAP"}
            emoji="💰"
            label="Tanie"
            sub="niskie ceny"
            color="bg-blue-100 text-blue-800"
            onClick={() => setMode("CHEAP")}
            disabled={sending}
          />
          <ModeButton
            mode="FAST"
            active={currentMode === "FAST"}
            emoji="⚡"
            label="Szybko"
            sub="16A × 3f"
            color="bg-yellow-100 text-yellow-800"
            onClick={() => setMode("FAST")}
            disabled={sending}
          />
          <ModeButton
            mode="STOP"
            active={currentMode === "STOP" || !isCharging}
            emoji="🛑"
            label="Stop"
            sub="przerwij"
            color="bg-red-100 text-red-800"
            onClick={() => setMode("STOP")}
            disabled={sending}
          />
        </div>
      </div>
    </div>
  );
}
