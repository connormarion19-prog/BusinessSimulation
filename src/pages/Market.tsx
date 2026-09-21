import { useGameStore } from "../store/useGameStore";
import { Card, CardHeading, Table, Td } from "../components/ui";

export default function Market() {
  const game = useGameStore((s) => s.game)!;
  const { market, economy } = game;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Market &amp; Economy</h1>

      <Card>
        <CardHeading subtitle="Demand and average market price are always estimates — the real figure is never exact.">Regional Market</CardHeading>
        <Table>
          <tbody>
            <tr><Td>Estimated weekly demand</Td><Td align="right">{Math.round(market.estimatedDemandRangeUnits[0]).toLocaleString()}–{Math.round(market.estimatedDemandRangeUnits[1]).toLocaleString()} {market.unitLabel}s</Td></tr>
            <tr><Td>Average market price</Td><Td align="right">${market.avgMarketPrice.toFixed(2)}/{market.unitLabel}</Td></tr>
            <tr><Td>{market.inputLabel} price</Td><Td align="right">${market.inputPricePerUnit.toFixed(2)}/{market.inputLabel}</Td></tr>
            <tr><Td>Price elasticity (industry estimate)</Td><Td align="right">{market.priceElasticity.toFixed(2)}</Td></tr>
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeading subtitle="Macroeconomic backdrop — affects every business in the region to some degree.">Economy</CardHeading>
        <Table>
          <tbody>
            <tr><Td>Cycle phase</Td><Td align="right" className="capitalize">{economy.cyclePhase}</Td></tr>
            <tr><Td>Demand index (1.0 = normal)</Td><Td align="right">{economy.demandIndex.toFixed(2)}</Td></tr>
            <tr><Td>Interest rate (annual)</Td><Td align="right">{(economy.interestRateAnnual * 100).toFixed(2)}%</Td></tr>
            <tr><Td>Inflation (annual)</Td><Td align="right">{(economy.inflationAnnual * 100).toFixed(2)}%</Td></tr>
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
