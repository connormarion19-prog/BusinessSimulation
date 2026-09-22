import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { Prospect } from "../types/core";
import { Badge, Button, Card, CardHeading, ProgressBar, Table, Td, Th } from "../components/ui";

const STATUS_TONE = {
  new: "neutral",
  researched: "info",
  contacted: "warn",
  interested: "info",
  qualified: "warn",
  negotiation: "warn",
  won: "good",
  lost: "bad",
} as const;

function PitchForm({ prospect }: { prospect: Prospect }) {
  const game = useGameStore((s) => s.game)!;
  const pitchProspect = useGameStore((s) => s.pitchProspect);
  const [productId, setProductId] = useState(game.company.products[0]?.id ?? "");
  const midWtp = (prospect.estimate.willingnessToPayRangePerUnit[0] + prospect.estimate.willingnessToPayRangePerUnit[1]) / 2;
  const midVolume = Math.round((prospect.estimate.annualVolumeRangeUnits[0] + prospect.estimate.annualVolumeRangeUnits[1]) / 2);
  const [price, setPrice] = useState(Math.round(midWtp * 100) / 100);
  const [volume, setVolume] = useState(midVolume);
  const [terms, setTerms] = useState(30);
  const [contractWeeks, setContractWeeks] = useState(26);
  const [result, setResult] = useState<{ ok: boolean; won?: boolean; reason?: string } | null>(null);

  return (
    <div className="mt-2 rounded-md border border-ink-700 bg-ink-950 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Pitch {prospect.name}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs">
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs">
            {game.company.products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Price/unit
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs" />
        </label>
        <label className="text-xs">
          Annual volume
          <input type="number" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs" />
        </label>
        <label className="text-xs">
          Payment terms (days)
          <input type="number" value={terms} onChange={(e) => setTerms(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs" />
        </label>
        <label className="text-xs">
          Contract length (weeks)
          <input type="number" value={contractWeeks} onChange={(e) => setContractWeeks(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs" />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-ink-500">
        Their estimated willingness to pay is ${prospect.estimate.willingnessToPayRangePerUnit[0].toFixed(2)}–${prospect.estimate.willingnessToPayRangePerUnit[1].toFixed(2)}/unit — an estimate, not the exact truth.
        A pitch costs a small outreach fee regardless of outcome.
      </p>
      <Button
        className="mt-2"
        onClick={() => {
          const r = pitchProspect(prospect.id, { productId, priceOffered: price, volumeCommitmentUnits: volume, paymentTermsDaysOffered: terms, contractLengthWeeks: contractWeeks });
          setResult(r);
        }}
        disabled={!productId}
      >
        Send Pitch
      </Button>
      {result && (
        <p className={`mt-2 text-xs ${result.won ? "text-emerald-400" : "text-rose-400"}`}>
          {result.won ? "Closed the deal! " : "Didn't close. "}{result.reason}
        </p>
      )}
    </div>
  );
}

function ProspectCard({ prospect }: { prospect: Prospect }) {
  const researchProspect = useGameStore((s) => s.researchProspect);
  const [expanded, setExpanded] = useState(false);
  const isActive = prospect.status !== "won" && prospect.status !== "lost";

  return (
    <div className="rounded-md border border-ink-700 p-3">
      <div className="mb-1.5 flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">{prospect.name}</div>
          <div className="text-xs text-ink-400">{prospect.location} · {prospect.industryNote}</div>
        </div>
        <Badge tone={STATUS_TONE[prospect.status]}>{prospect.status}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-xs text-ink-300 sm:grid-cols-4">
        <div>Est. annual demand: <span className="text-ink-100">{prospect.estimate.annualVolumeRangeUnits[0].toLocaleString()}–{prospect.estimate.annualVolumeRangeUnits[1].toLocaleString()}</span></div>
        <div>Est. willingness to pay: <span className="text-ink-100">${prospect.estimate.willingnessToPayRangePerUnit[0].toFixed(2)}–${prospect.estimate.willingnessToPayRangePerUnit[1].toFixed(2)}</span></div>
        <div>Est. interest: <span className="text-ink-100">{prospect.estimate.probabilityOfInterestPct}%</span></div>
        <div>Contact attempts: <span className="text-ink-100">{prospect.contactAttempts}</span></div>
      </div>
      {prospect.lostReason && prospect.status !== "won" && (
        <p className="mt-1.5 text-xs text-amber-400">Last outcome: {prospect.lostReason}</p>
      )}
      {isActive && (
        <div className="mt-2 flex gap-2">
          {!prospect.researched && <Button variant="secondary" onClick={() => researchProspect(prospect.id)}>Research ($60)</Button>}
          <Button variant={expanded ? "ghost" : "primary"} onClick={() => setExpanded(!expanded)}>{expanded ? "Cancel" : "Pitch"}</Button>
        </div>
      )}
      {expanded && isActive && <PitchForm prospect={prospect} />}
    </div>
  );
}

export default function Customers() {
  const game = useGameStore((s) => s.game)!;
  const [tab, setTab] = useState<"accounts" | "prospects">(game.company.customers.length === 0 ? "prospects" : "accounts");
  const customers = game.company.customers;
  const productNameById = Object.fromEntries(game.company.products.map((p) => [p.id, p.name]));
  const activeProspects = game.company.prospects.filter((p) => p.status !== "won" && p.status !== "lost");
  const closedProspects = game.company.prospects.filter((p) => p.status === "won" || p.status === "lost");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Customers</h1>
        <div className="flex gap-1">
          <button onClick={() => setTab("accounts")} className={`rounded-md px-3 py-1 text-xs ${tab === "accounts" ? "bg-emerald-600 text-white" : "bg-ink-800 text-ink-300"}`}>
            Accounts ({customers.length})
          </button>
          <button onClick={() => setTab("prospects")} className={`rounded-md px-3 py-1 text-xs ${tab === "prospects" ? "bg-emerald-600 text-white" : "bg-ink-800 text-ink-300"}`}>
            Prospects ({activeProspects.length})
          </button>
        </div>
      </div>

      {tab === "accounts" && (
        <Card>
          <CardHeading subtitle="Contracted accounts, won through real pitches on the Prospects tab — losing a large one is a real event, not a rounding error.">Accounts</CardHeading>
          {customers.length === 0 ? (
            <p className="text-sm text-ink-400">No contracted customers yet. Spot-market sales can still happen once you're producing, but real contracted revenue means winning someone over on the Prospects tab.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th><Th>Product</Th><Th>Segment</Th><Th align="right">Annual Volume</Th><Th align="right">Relationship</Th><Th align="right">Terms</Th><Th align="right">Last Order</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.name}</Td>
                    <Td className="text-ink-400">{productNameById[c.productId] ?? "—"}</Td>
                    <Td className="text-ink-400">{c.segment.replace(/-/g, " ")}</Td>
                    <Td align="right">{c.annualVolumeUnits.toLocaleString()}</Td>
                    <Td align="right" className="w-28"><ProgressBar value={c.relationshipStrength} tone={c.relationshipStrength > 60 ? "good" : c.relationshipStrength > 35 ? "warn" : "bad"} /></Td>
                    <Td align="right">{c.paymentTermsDays}d</Td>
                    <Td align="right">{c.lastOrderWeek ?? "—"}</Td>
                    <Td>{c.atRisk ? <Badge tone="bad">At risk</Badge> : <Badge tone="good">Healthy</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "prospects" && (
        <>
          <Card>
            <CardHeading subtitle="Real leads, not customers already in hand. Research narrows the estimate; pitching with the right price, volume, and terms is what actually wins the account.">
              Active Prospects
            </CardHeading>
            <div className="flex flex-col gap-3">
              {activeProspects.map((p) => (
                <ProspectCard key={p.id} prospect={p} />
              ))}
              {activeProspects.length === 0 && <p className="text-sm text-ink-400">No active prospects right now — more will surface over the coming weeks.</p>}
            </div>
          </Card>
          {closedProspects.length > 0 && (
            <Card>
              <CardHeading>Closed Prospects</CardHeading>
              <Table>
                <thead><tr><Th>Name</Th><Th>Location</Th><Th>Result</Th><Th align="right">Attempts</Th></tr></thead>
                <tbody>
                  {closedProspects.map((p) => (
                    <tr key={p.id}>
                      <Td>{p.name}</Td>
                      <Td className="text-ink-400">{p.location}</Td>
                      <Td><Badge tone={p.status === "won" ? "good" : "bad"}>{p.status}</Badge></Td>
                      <Td align="right">{p.contactAttempts}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
