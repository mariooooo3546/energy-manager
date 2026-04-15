"use client";

interface Props {
  soc: number;
  batteryPower: number;
  pvPower: number;
  loadPower: number;
  gridPower: number;
  buyPrice: number;
  sellPrice: number;
  override: { active: boolean; action: string | null };
}

function PowerFlow({ label, value, icon }: { label: string; value: number; icon: string }) {
  const abs = Math.abs(value);
  const formatted = abs >= 1000 ? `${(abs / 1000).toFixed(1)} kW` : `${abs} W`;
  return (
    <div className="text-center">
      <div className="text-xl mb-0.5">{icon}</div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-mono text-sm font-semibold">{formatted}</div>
    </div>
  );
}

export function StatusCard(props: Props) {
  const modeLabel = props.override.active
    ? `OVERRIDE: ${props.override.action}`
    : "AUTO";

  const socColor =
    props.soc > 60 ? "bg-green-500" : props.soc > 30 ? "bg-yellow-500" : "bg-red-500";

  const gridDir = props.gridPower > 50 ? "📥 Import" : props.gridPower < -50 ? "📤 Export" : "⚖️ Balans";
  const battDir = props.batteryPower > 50 ? "🔋 Ładuje" : props.batteryPower < -50 ? "🔋 Rozładowuje" : "🔋 Idle";

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Status falownika</h2>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            props.override.active
              ? "bg-orange-100 text-orange-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {modeLabel}
        </span>
      </div>

      {/* Battery SOC bar */}
      <div className="mb-5">
        <div className="flex justify-between text-sm mb-1">
          <span>Bateria (SOC)</span>
          <span className="font-mono font-semibold">{props.soc}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-5">
          <div
            className={`${socColor} h-5 rounded-full transition-all flex items-center justify-end pr-2`}
            style={{ width: `${Math.max(props.soc, 8)}%` }}
          >
            {props.soc > 15 && (
              <span className="text-white text-[10px] font-bold">{props.soc}%</span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-400 mt-1">{battDir} ({props.batteryPower}W)</div>
      </div>

      {/* Power flow */}
      <div className="grid grid-cols-4 gap-2 mb-5 p-3 bg-gray-50 rounded-lg">
        <PowerFlow icon="☀️" label="Solar" value={props.pvPower} />
        <PowerFlow icon="🏠" label="Zużycie" value={props.loadPower} />
        <PowerFlow icon="🔌" label="Sieć" value={Math.abs(props.gridPower)} />
        <PowerFlow icon="🔋" label="Bateria" value={Math.abs(props.batteryPower)} />
      </div>

      {/* Grid direction indicator */}
      <div className="flex items-center justify-between text-sm mb-3 px-1">
        <span className="text-gray-500">{gridDir} ({props.gridPower}W)</span>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Cena kupna</div>
          <div className="font-mono text-lg font-semibold text-blue-600">
            {props.buyPrice?.toFixed(2)} <span className="text-xs text-gray-400">zł/kWh</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Cena sprzedaży</div>
          <div className="font-mono text-lg font-semibold text-green-600">
            {props.sellPrice?.toFixed(2)} <span className="text-xs text-gray-400">zł/kWh</span>
          </div>
        </div>
      </div>
    </div>
  );
}
