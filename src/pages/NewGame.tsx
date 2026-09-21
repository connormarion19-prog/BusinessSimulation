import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/useGameStore";
import type { Difficulty } from "../types/core";
import { INDUSTRY_META_LIST } from "../data/industryMeta";
import { LOCATIONS } from "../data/locations";
import { FINANCING_SOURCES } from "../data/financingSources";
import { getIndustryDefinition } from "../industries/registry";
import { weeklyPaymentFor } from "../engine/loans";
import { formatMoney } from "../engine/dateUtils";
import { Button, Card, CardHeading, Badge } from "../components/ui";

export default function NewGame() {
  const navigate = useNavigate();
  const startNewGame = useGameStore((s) => s.startNewGame);

  const [difficulty, setDifficulty] = useState<Difficulty>("realistic");
  const [industryId, setIndustryId] = useState("paper-manufacturing");
  const [name, setName] = useState("Riverbend Paper Co.");
  const [locationId, setLocationId] = useState(LOCATIONS[0].id);
  const [financingSourceId, setFinancingSourceId] = useState("bank-loan");
  const [startingCash, setStartingCash] = useState(180_000);
  const [customerSegmentId, setCustomerSegmentId] = useState("regional-distributors");
  const [productTemplateId, setProductTemplateId] = useState("copy-paper");
  const [facilityTemplateId, setFacilityTemplateId] = useState("mid-size-mill");

  const industry = getIndustryDefinition(industryId);
  const financing = FINANCING_SOURCES.find((f) => f.id === financingSourceId)!;
  const facility = industry?.facilityTemplates.find((f) => f.id === facilityTemplateId);

  const weeklyPayment = useMemo(() => {
    if (financing.structure !== "loan" || !financing.loanAnnualRate || !financing.loanTermWeeks) return null;
    return weeklyPaymentFor(startingCash, financing.loanAnnualRate, financing.loanTermWeeks);
  }, [financing, startingCash]);

  if (!industry) return null;

  function handleStart() {
    const foundedDate = "2025-01-06";
    const params = {
      name,
      difficulty,
      locationId,
      financingSourceId,
      startingCash,
      loanTerms: financing!.structure === "loan"
        ? { principal: startingCash, annualRate: financing!.loanAnnualRate!, termWeeks: financing!.loanTermWeeks!, lender: financing!.name }
        : undefined,
      investorEquityPct: financing!.structure === "equity" ? financing!.equityDilutionPct : undefined,
      targetCustomerSegmentId: customerSegmentId,
      productTemplateId,
      facilityTemplateId,
      foundedWeek: 0,
      foundedDate,
    };
    startNewGame(industryId, `${name} save`, params);
    navigate("/game");
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 text-ink-100">
      <h1 className="mb-1 text-2xl font-bold text-emerald-400">Found Your Company</h1>
      <p className="mb-6 text-sm text-ink-400">Every choice below has real, ongoing consequences — the numbers shown are the best information you'd realistically have before day one.</p>

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeading>Difficulty</CardHeading>
          <div className="flex gap-3">
            {(["easy", "realistic"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 rounded-md border px-4 py-3 text-left text-sm ${difficulty === d ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
              >
                <div className="font-semibold capitalize">{d}</div>
                <div className="mt-1 text-xs text-ink-400">
                  {d === "easy"
                    ? "Slightly more forgiving demand, financing, and catastrophic-event odds. Still a real business — you can still fail."
                    : "A close simulation of real business conditions: full uncertainty, real financing constraints, real consequences."}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeading>Industry</CardHeading>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {INDUSTRY_META_LIST.map((ind) => (
              <button
                key={ind.id}
                disabled={!ind.implemented}
                onClick={() => setIndustryId(ind.id)}
                className={`rounded-md border p-2 text-left text-xs disabled:opacity-40 ${industryId === ind.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
              >
                <div className="font-semibold">{ind.name}</div>
                <div className="mt-0.5 text-ink-400">{ind.implemented ? ind.tagline : "Coming soon"}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeading>Company &amp; Location</CardHeading>
          <label className="mb-3 block text-sm">
            Company name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LOCATIONS.map((loc) => (
              <button
                key={loc.id}
                onClick={() => setLocationId(loc.id)}
                className={`rounded-md border p-3 text-left text-xs ${locationId === loc.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
              >
                <div className="font-semibold">{loc.city}, {loc.state}</div>
                <div className="mt-1 text-ink-400">{loc.description}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone="info">Labor {(loc.laborCostIndex * 100).toFixed(0)}%</Badge>
                  <Badge tone="info">Rent {(loc.commercialRentIndex * 100).toFixed(0)}%</Badge>
                  <Badge tone="info">Tax {loc.corporateTaxRatePct}%</Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeading subtitle="This is your starting capital and its consequences — you make the final call.">Financing Source</CardHeading>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FINANCING_SOURCES.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setFinancingSourceId(f.id);
                  setStartingCash(Math.round((f.capitalRange[0] + f.capitalRange[1]) / 2));
                }}
                className={`rounded-md border p-3 text-left text-xs ${financingSourceId === f.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
              >
                <div className="font-semibold">{f.name}</div>
                <div className="mt-1 text-ink-400">{f.description}</div>
                <div className="mt-1 text-ink-500">Range: {formatMoney(f.capitalRange[0])} – {formatMoney(f.capitalRange[1])}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-md border border-ink-700 bg-ink-950 p-3">
            <label className="block text-sm">
              Capital to raise from {financing.name}: <span className="font-semibold text-emerald-400">{formatMoney(startingCash)}</span>
              <input
                type="range"
                min={financing.capitalRange[0]}
                max={financing.capitalRange[1]}
                step={5000}
                value={startingCash}
                onChange={(e) => setStartingCash(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-300">
              <div><span className="text-ink-500">Major risk:</span> {financing.majorRisk}</div>
              <div><span className="text-ink-500">Major benefit:</span> {financing.majorBenefit}</div>
              <div><span className="text-ink-500">Control:</span> {financing.controlImplication}</div>
              {financing.structure === "loan" && weeklyPayment && (
                <div><span className="text-ink-500">Est. weekly payment:</span> {formatMoney(weeklyPayment)} for {financing.loanTermWeeks} weeks at {(financing.loanAnnualRate! * 100).toFixed(1)}%</div>
              )}
              {financing.structure === "equity" && (
                <div><span className="text-ink-500">Ownership given up:</span> {financing.equityDilutionPct}%</div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeading>Target Customer</CardHeading>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {industry.customerSegments.map((seg) => (
              <button
                key={seg.id}
                onClick={() => setCustomerSegmentId(seg.id)}
                className={`rounded-md border p-3 text-left text-xs ${customerSegmentId === seg.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
              >
                <div className="font-semibold">{seg.name}</div>
                <div className="mt-1 text-ink-400">{seg.description}</div>
                <div className="mt-1 text-ink-500">Typical volume: {seg.typicalAnnualVolumeUnits[0].toLocaleString()}–{seg.typicalAnnualVolumeUnits[1].toLocaleString()} units/yr</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeading>Initial Product</CardHeading>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {industry.productTemplates.map((p) => (
              <button
                key={p.id}
                onClick={() => setProductTemplateId(p.id)}
                className={`rounded-md border p-3 text-left text-xs ${productTemplateId === p.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
              >
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 text-ink-400">{p.description}</div>
                <div className="mt-1 text-ink-500">Suggested price: ${p.suggestedUnitPrice.toFixed(2)}/{p.unitLabel} · Var. cost ~${p.baseUnitVariableCost.toFixed(2)}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeading>Facility</CardHeading>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {industry.facilityTemplates.map((f) => (
              <button
                key={f.id}
                onClick={() => setFacilityTemplateId(f.id)}
                className={`rounded-md border p-3 text-left text-xs ${facilityTemplateId === f.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
              >
                <div className="font-semibold">{f.name}</div>
                <div className="mt-1 text-ink-400">{f.description}</div>
                <div className="mt-1 text-ink-500">Capacity: {f.baseWeeklyCapacityUnits.toLocaleString()} units/wk · Lease: {formatMoney(f.weeklyLeaseCost)}/wk</div>
                <div className="mt-1 text-ink-500">Recommended capital: {formatMoney(f.minStartingCapitalRecommended)}+</div>
              </button>
            ))}
          </div>
          {facility && startingCash < facility.minStartingCapitalRecommended && (
            <p className="mt-3 text-xs text-amber-400">
              Warning: your starting capital ({formatMoney(startingCash)}) is below the recommended minimum ({formatMoney(facility.minStartingCapitalRecommended)}) for this facility. You can still proceed, but cash will be tight early on.
            </p>
          )}
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleStart} className="px-6 py-2.5 text-base">Start the Company →</Button>
        </div>
      </div>
    </div>
  );
}
