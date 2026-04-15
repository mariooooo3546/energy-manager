"use client";

interface Props {
  soc: number;
  pvPower: number;
  loadPower: number;
  gridPower: number;
  buyPrice: number;
  sellPrice: number;
  override: { active: boolean; action: string | null };
}

export function StatusCard(props: Props) {
  const modeLabel = props.override.active
    ? `OVERRIDE: ${props.override.action}`
    : "AUTO";

  const socColor =
    props.soc > 60 ? "bg-green-500" : props.soc > 30 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Status</h2>
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

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>Bateria</span>
          <span className="font-mono">{props.soc}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`${socColor} h-4 rounded-full transition-all`}
            style={{ width: `${props.soc}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">PV</span>
          <p className="font-mono text-lg text-gray-800">{props.pvPower}W</p>
        </div>
        <div>
          <span className="text-gray-500">Zuzycie</span>
          <p className="font-mono text-lg text-gray-800">{props.loadPower}W</p>
        </div>
        <div>
          <span className="text-gray-500">Cena kupna</span>
          <p className="font-mono text-lg text-gray-800">{props.buyPrice?.toFixed(2)} zl</p>
        </div>
        <div>
          <span className="text-gray-500">Cena sprzedazy</span>
          <p className="font-mono text-lg text-gray-800">{props.sellPrice?.toFixed(2)} zl</p>
        </div>
      </div>
    </div>
  );
}
