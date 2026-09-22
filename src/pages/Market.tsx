import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { LOCATIONS, LOCATIONS_BY_ID } from "../data/locations";
import { estimateExpansionForecast, previewEntryInvestment, previewRegionalMarket } from "../engine/expansion";
import { formatMoney } from "../engine/dateUtils";
import type { FacilityOwnershipType, MarketEntryMode } from "../types/core";
import { Badge, Button, Card, CardHeading, Table, Td, Th } from "../components/ui";

const MODE_LABEL: Record<MarketEntryMode, string> = {
  remote: "Remote sales",
  distributor: "Distributor",
  warehouse: "Local warehouse",
  facility: "Local facility",
};
const MODE_DESCRIPTION: Record<MarketEntryMode, string> = {
  remote: "Sell in from your existing facilities. Cheapest and fastest, but the worst freight economics and no local presence.",
  distributor: "A local distributor resells for you — moderate setup, gives up a permanent commission instead of paying freight.",
  warehouse: "Lease or build a local distribution center you stock via internal transfers — near-local delivery once it's stocked.",
  facility: "A full local production facility. Highest capital and longest lead time, but removes freight and regional risk entirely.",
};

export default function Market() {
  const game = useGameStore((s) => s.game)!;
  const enterMarket = useGameStore((s) => s.enterMarket);
  const exitMarket = useGameStore((s) => s.exitMarket);
  const { market, economy } = game;
  const industry = getIndustryDefinition(game.company.industryId)!;

  const [productId, setProductId] = useState(game.company.products[0]?.id ?? "");
  const [targetLocationId, setTargetLocationId] = useState(LOCATIONS.find((l) => l.id !== game.company.locationId)?.id ?? LOCATIONS[0].id);
  const [mode, setMode] = useState<MarketEntryMode>("remote");
  const [ownershipType, setOwnershipType] = useState<FacilityOwnershipType>("lease");
  const [entryMessage, setEntryMessage] = useState<string | null>(null);

  const otherLocations = LOCATIONS.filter((l) => l.id !== game.company.locationId);
  const previewRegion = previewRegionalMarket(market, game.competitors, targetLocationId);
  const previewInvestment = previewEntryInvestment(industry, mode, targetLocationId, ownershipType);
  const forecast = estimateExpansionForecast(previewRegion, mode, previewInvestment);
  const alreadyIn = game.company.enteredMarkets.some(
    (e) => e.locationId === targetLocationId && e.productId === productId && e.status !== "exited",
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Market &amp; Economy</h1>

      <Card>
        <CardHeading subtitle="Demand and average market price are always estimates — the real figure is never exact.">Home Market — {LOCATIONS_BY_ID[game.company.locationId]?.city}</CardHeading>
        <Table>
          <tbody>
            <tr><Td>Estimated weekly demand</Td><Td align="right">{Math.round(market.estimatedDemandRangeUnits[0]).toLocaleString()}–{Math.round(market.estimatedDemandRangeUnits[1]).toLocaleString()} {market.unitLabel}s</Td></tr>
            <tr><Td>Average market price</Td><Td align="right">${market.avgMarketPrice.toFixed(2)}/{market.unitLabel}</Td></tr>
            <tr><Td>{market.inputLabel} price</Td><Td align="right">${market.inputPricePerUnit.toFixed(2)}/{market.inputLabel}</Td></tr>
            <tr><Td>Price elasticity (industry estimate)</Td><Td align="right">{market.priceElasticity.toFixed(2)}</Td></tr>
          </tbody>
        </Table>
      </Card>

      {Object.keys(market.regions).length > 1 && (
        <Card>
          <CardHeading subtitle="Every market you've entered has its own demand pool, price level, and competitive pressure.">Regional Markets</CardHeading>
          <Table>
            <thead><tr><Th>Region</Th><Th align="right">Est. weekly demand</Th><Th align="right">Avg price</Th><Th align="right">Competitive pressure</Th></tr></thead>
            <tbody>
              {Object.values(market.regions).map((r) => {
                const loc = LOCATIONS_BY_ID[r.locationId];
                return (
                  <tr key={r.locationId}>
                    <Td>{loc?.city ?? r.locationId}, {loc?.state}{r.locationId === game.company.locationId && <span className="ml-1 text-ink-500">(home)</span>}</Td>
                    <Td align="right">{Math.round(r.estimatedDemandRangeUnits[0]).toLocaleString()}–{Math.round(r.estimatedDemandRangeUnits[1]).toLocaleString()}</Td>
                    <Td align="right">${r.avgMarketPrice.toFixed(2)}</Td>
                    <Td align="right">{Math.round(r.competitivePressure * 100)}%</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {game.company.enteredMarkets.length > 0 && (
        <Card>
          <CardHeading subtitle="Forecast vs. actual — every expansion decision is tracked so you can see how it's actually going.">Your Market Entries</CardHeading>
          <Table>
            <thead><tr><Th>Region</Th><Th>Mode</Th><Th>Status</Th><Th align="right">Forecast yr-1 revenue</Th><Th align="right">Actual revenue to date</Th><Th /></tr></thead>
            <tbody>
              {game.company.enteredMarkets.map((entry) => {
                const loc = LOCATIONS_BY_ID[entry.locationId];
                return (
                  <tr key={entry.id}>
                    <Td>{loc?.city ?? entry.locationId}</Td>
                    <Td className="capitalize">{entry.mode}</Td>
                    <Td>
                      <Badge tone={entry.status === "active" ? "good" : entry.status === "entering" ? "warn" : "neutral"}>
                        {entry.status === "entering" ? `ramping up (live wk ${entry.activeFromWeek})` : entry.status}
                      </Badge>
                    </Td>
                    <Td align="right">{formatMoney(entry.forecast.expectedFirstYearRevenueLow)}–{formatMoney(entry.forecast.expectedFirstYearRevenueHigh)}</Td>
                    <Td align="right">{formatMoney(entry.actualRevenueToDate)} <span className="text-ink-500">({entry.actualWeeksActive} wk)</span></Td>
                    <Td align="right">
                      {entry.status !== "exited" && (
                        <Button variant="ghost" onClick={() => exitMarket(entry.id)}>Exit</Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeading subtitle="Pick a product and a market, and the entry mode that fits your capital and risk appetite — the feasibility report below is a real estimate from the current market model, not a guarantee.">
          Expand Into a New Market
        </CardHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Product
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
              {game.company.products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Target market
            <select value={targetLocationId} onChange={(e) => setTargetLocationId(e.target.value)} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
              {otherLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.city}, {l.state}</option>
              ))}
            </select>
          </label>
          {(mode === "warehouse" || mode === "facility") && (
            <label className="text-sm">
              Ownership
              <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value as FacilityOwnershipType)} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
                <option value="lease">Lease</option>
                <option value="purchase">Purchase</option>
                <option value="construction">Build</option>
              </select>
            </label>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-4">
          {(Object.keys(MODE_LABEL) as MarketEntryMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md border p-2 text-left text-xs ${mode === m ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
            >
              <div className="font-semibold">{MODE_LABEL[m]}</div>
              <div className="text-ink-500">{MODE_DESCRIPTION[m]}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-ink-700 bg-ink-950 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
            Feasibility Report — {LOCATIONS_BY_ID[targetLocationId]?.city}, {LOCATIONS_BY_ID[targetLocationId]?.state}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-300 sm:grid-cols-3">
            <div>Estimated market size: <span className="text-ink-100">{formatMoney(forecast.estimatedMarketSizeLow)}–{formatMoney(forecast.estimatedMarketSizeHigh)}</span></div>
            <div>Expected yr-1 revenue: <span className="text-ink-100">{formatMoney(forecast.expectedFirstYearRevenueLow)}–{formatMoney(forecast.expectedFirstYearRevenueHigh)}</span></div>
            <div>Expected operating margin: <span className="text-ink-100">{Math.round(forecast.expectedOperatingMarginLow * 100)}%–{Math.round(forecast.expectedOperatingMarginHigh * 100)}%</span></div>
            <div>Required investment: <span className="text-ink-100">{formatMoney(forecast.requiredInvestmentLow)}–{formatMoney(forecast.requiredInvestmentHigh)}</span></div>
            <div>Estimated break-even: <span className="text-ink-100">{forecast.estimatedBreakEvenYearsLow.toFixed(1)}–{forecast.estimatedBreakEvenYearsHigh.toFixed(1)} yrs</span></div>
            <div>Regional competitive pressure: <span className="text-ink-100">{Math.round(previewRegion.competitivePressure * 100)}%</span></div>
          </div>
          <div className="mt-2 text-xs text-ink-400">
            <span className="font-medium text-ink-300">Key risks: </span>
            {forecast.risks.join(" ")}
          </div>
          {alreadyIn && <p className="mt-2 text-xs text-amber-400">Already active or entering this market for this product.</p>}
          <Button className="mt-3" onClick={() => {
            const result = enterMarket({ locationId: targetLocationId, productId, mode, ownershipType });
            setEntryMessage(result.ok ? "Entry decision made — see it under Your Market Entries above." : result.reason ?? "Could not enter this market.");
          }} disabled={alreadyIn || !productId}>
            Commit to This Entry
          </Button>
          {entryMessage && <p className="mt-2 text-xs text-ink-400">{entryMessage}</p>}
        </div>
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
