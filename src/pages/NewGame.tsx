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

const STARTING_SCALES = [
  { id: "micro", label: "Micro Startup", range: [10_000, 25_000] as [number, number], note: "As lean as it gets. Zero margin for error, but the fastest way to learn the business." },
  { id: "small", label: "Small Business", range: [25_000, 100_000] as [number, number], note: "Enough cushion to survive a rough first few months while you find your footing." },
  { id: "custom", label: "Custom", range: [0, 0] as [number, number], note: "Pick your own amount within the financing source's range." },
] as const;

interface StepProps {
  title: string;
  why: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

function Step({ title, why, children, onBack, onNext, nextLabel = "Next →", nextDisabled }: StepProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-xl font-bold text-emerald-400">{title}</h2>
      <p className="mb-5 text-sm text-ink-400">{why}</p>
      <div className="flex flex-col gap-4">{children}</div>
      <div className="mt-6 flex justify-between">
        {onBack ? <Button variant="ghost" onClick={onBack}>← Back</Button> : <span />}
        <Button onClick={onNext} disabled={nextDisabled} className="px-6 py-2.5 text-base">{nextLabel}</Button>
      </div>
    </div>
  );
}

export default function NewGame() {
  const navigate = useNavigate();
  const startNewGame = useGameStore((s) => s.startNewGame);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("realistic");
  const [industryId, setIndustryId] = useState("paper-manufacturing");
  const [locationId, setLocationId] = useState(LOCATIONS[0].id);
  const [scaleId, setScaleId] = useState<(typeof STARTING_SCALES)[number]["id"]>("small");
  const [financingSourceId, setFinancingSourceId] = useState("bank-loan");
  const [startingCash, setStartingCash] = useState(60_000);
  const [customerSegmentId, setCustomerSegmentId] = useState("regional-distributors");
  const [productTemplateId, setProductTemplateId] = useState("copy-paper");
  const [facilityTemplateId, setFacilityTemplateId] = useState("small-job-shop");

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
      name: name.trim() || "Untitled Co.",
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
    startNewGame(industryId, `${params.name} save`, params);
    navigate("/game");
  }

  const steps = [
    // 0: Name
    <Step key="name" title="Name Your Company" why="Every business starts with an idea and a name. This is yours." onNext={() => setStep(step + 1)} nextDisabled={name.trim().length === 0}>
      <Card>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Riverbend Paper Co."
          className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-base"
        />
      </Card>
    </Step>,

    // 1: Difficulty
    <Step key="difficulty" title="Choose Difficulty" why="Realistic mode is a close simulation of real business conditions — full uncertainty, real constraints. Easy mode is more forgiving while you learn, but it's still a real simulation you can still fail." onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)}>
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
                ? "Lower operating costs, slightly better demand, more forgiving financing and hiring, and lower event severity."
                : "Full uncertainty, real financing constraints, real consequences — but every number is always explainable."}
            </div>
          </button>
        ))}
      </div>
    </Step>,

    // 2: Industry
    <Step key="industry" title="Choose Your Industry" why="What kind of business are you building? Only one is fully built out right now — the rest are honestly marked as coming soon rather than faked." onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)}>
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
    </Step>,

    // 3: Location
    <Step key="location" title="Where Do You Operate?" why="Location sets your labor cost, rent, taxes, and local demand — a real, ongoing cost consequence, not flavor text." onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)}>
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
    </Step>,

    // 4: Starting scale + financing
    <Step key="financing" title="How Big Do You Start?" why="A real founder chooses how much capital to raise and where it comes from — and lives with the tradeoff. More capital means more cushion, but every source has a cost: debt, dilution, or your own savings." onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {STARTING_SCALES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setScaleId(s.id);
              if (s.id !== "custom") setStartingCash(Math.round((s.range[0] + s.range[1]) / 2));
            }}
            className={`rounded-md border p-3 text-left text-xs ${scaleId === s.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
          >
            <div className="font-semibold">{s.label}</div>
            {s.id !== "custom" && <div className="mt-1 text-ink-500">{formatMoney(s.range[0])} – {formatMoney(s.range[1])}</div>}
            <div className="mt-1 text-ink-400">{s.note}</div>
          </button>
        ))}
      </div>

      <Card>
        <CardHeading subtitle="This is your starting capital and its consequences — you make the final call.">Financing Source</CardHeading>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FINANCING_SOURCES.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFinancingSourceId(f.id);
                const scale = STARTING_SCALES.find((s) => s.id === scaleId);
                const targetRange = scale && scale.id !== "custom" ? scale.range : f.capitalRange;
                const clamped = Math.max(f.capitalRange[0], Math.min(f.capitalRange[1], Math.round((targetRange[0] + targetRange[1]) / 2)));
                setStartingCash(clamped);
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
              step={2500}
              value={startingCash}
              onChange={(e) => {
                setStartingCash(Number(e.target.value));
                setScaleId("custom");
              }}
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
    </Step>,

    // 5: Target customer
    <Step key="segment" title="Who Are You Trying to Sell To?" why="This shapes what kind of customer prospects you'll actually meet once you start — it doesn't hand you any customers, only points you toward the right kind of leads." onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)}>
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
    </Step>,

    // 6: Product
    <Step key="product" title="What Will You Make?" why="Your first product line. You'll set its price yourself once you're in — nothing here locks in a price or a customer for it." onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)}>
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
    </Step>,

    // 7: Facility
    <Step key="facility" title="Where Will You Produce It?" why="Bigger facilities cost more up front and every week after, but give you room to grow. A tiny startup usually can't justify more than a small leased space yet." onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {industry.facilityTemplates.filter((f) => f.role === "production").map((f) => (
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
        <p className="text-xs text-amber-400">
          Warning: your starting capital ({formatMoney(startingCash)}) is below the recommended minimum ({formatMoney(facility.minStartingCapitalRecommended)}) for this facility. You can still proceed, but cash will be tight early on.
        </p>
      )}
    </Step>,

    // 8: Summary / begin operations
    <Step
      key="summary"
      title="Begin Operations"
      why="This is everything you're starting with — and, just as importantly, everything you're not. No customers, no suppliers, no employees beyond yourself. You build the rest from here."
      onBack={() => setStep(step - 1)}
      onNext={handleStart}
      nextLabel="Start the Company →"
    >
      <Card>
        <CardHeading>{name.trim() || "Untitled Co."}</CardHeading>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div><span className="text-ink-500">Starting cash</span><div className="font-semibold text-emerald-400">{formatMoney(startingCash)}</div></div>
          <div><span className="text-ink-500">Product</span><div className="font-semibold">{industry.productTemplates.find((p) => p.id === productTemplateId)?.name}</div></div>
          <div><span className="text-ink-500">Facility</span><div className="font-semibold">{facility?.name}</div></div>
          <div><span className="text-ink-500">Employees</span><div className="font-semibold">0 — just you</div></div>
          <div><span className="text-ink-500">Customers</span><div className="font-semibold">0 — real leads to chase</div></div>
          <div><span className="text-ink-500">Suppliers</span><div className="font-semibold">0 — pick one before production can run</div></div>
        </div>
        <p className="mt-4 text-xs text-ink-400">
          Your first real decisions once you're in: find a raw-material supplier (Suppliers), set your price, and start pitching customer prospects (Customers). Nothing runs itself.
        </p>
      </Card>
    </Step>,
  ];

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-10 text-ink-100">
      <div className="mb-6 flex items-center gap-1.5">
        {steps.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-emerald-500" : "bg-ink-800"}`} />
        ))}
      </div>
      {steps[step]}
    </div>
  );
}
