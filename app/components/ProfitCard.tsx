"use client";

interface HourlyEntry {
  hour: number;
  sold: number;
  bought: number;
  sellPrice: number;
  buyPrice: number;
  revenue: number;
  cost: number;
}

interface Props {
  gridFeedIn: number;
  purchased: number;
  production: number;
  consumption: number;
  sellRevenue: number;
  buyCost: number;
  netProfit: number;
  hourly: HourlyEntry[];
}

export function ProfitCard(props: Props) {
  const profitColor =
    props.netProfit > 0 ? "text-green-600" : "text-red-600";

  const activeHours = props.hourly.filter((h) => h.sold > 0 || h.bought > 0);

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Dzienny zysk</h2>
        <span className={`text-2xl font-bold font-mono ${profitColor}`}>
          {props.netProfit > 0 ? "+" : ""}
          {props.netProfit.toFixed(2)} zl
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <div className="p-3 bg-green-50 rounded-lg">
          <span className="text-gray-600">Sprzedaz do sieci</span>
          <p className="font-mono text-lg text-green-700">
            {props.gridFeedIn.toFixed(1)} kWh
          </p>
          <p className="font-mono text-green-600 font-medium">
            +{props.sellRevenue.toFixed(2)} zl
          </p>
        </div>
        <div className="p-3 bg-red-50 rounded-lg">
          <span className="text-gray-600">Kupno z sieci</span>
          <p className="font-mono text-lg text-red-700">
            {props.purchased.toFixed(1)} kWh
          </p>
          <p className="font-mono text-red-600 font-medium">
            -{props.buyCost.toFixed(2)} zl
          </p>
        </div>
      </div>

      {activeHours.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-600 mb-2">
            Rozliczenie godzinowe
          </h3>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-gray-400 border-b">
                  <th className="text-left py-1">Godz.</th>
                  <th className="text-right py-1">Sprzedaz</th>
                  <th className="text-right py-1">Cena</th>
                  <th className="text-right py-1">Kupno</th>
                  <th className="text-right py-1">Cena</th>
                  <th className="text-right py-1">Bilans</th>
                </tr>
              </thead>
              <tbody>
                {activeHours.map((h) => (
                  <tr key={h.hour} className="border-b border-gray-50">
                    <td className="py-1 font-mono">
                      {h.hour.toString().padStart(2, "0")}:00
                    </td>
                    <td className="text-right font-mono text-green-600">
                      {h.sold > 0 ? `${h.sold} kWh` : "-"}
                    </td>
                    <td className="text-right font-mono text-gray-400">
                      {h.sold > 0 ? `${h.sellPrice.toFixed(2)}` : ""}
                    </td>
                    <td className="text-right font-mono text-red-600">
                      {h.bought > 0 ? `${h.bought} kWh` : "-"}
                    </td>
                    <td className="text-right font-mono text-gray-400">
                      {h.bought > 0 ? `${h.buyPrice.toFixed(2)}` : ""}
                    </td>
                    <td
                      className={`text-right font-mono font-medium ${
                        h.revenue - h.cost >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {(h.revenue - h.cost) >= 0 ? "+" : ""}
                      {(h.revenue - h.cost).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm border-t pt-3">
        <div>
          <span className="text-gray-600">Produkcja PV</span>
          <p className="font-mono"><span className="text-gray-800">{props.production.toFixed(1)} kWh</span></p>
        </div>
        <div>
          <span className="text-gray-600">Zuzycie</span>
          <p className="font-mono"><span className="text-gray-800">{props.consumption.toFixed(1)} kWh</span></p>
        </div>
      </div>
    </div>
  );
}
