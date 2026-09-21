import { useState } from "react";
import { Link } from "react-router-dom";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { INTERVIEW_QUESTION_BANK } from "../engine/hiring";
import { formatMoney } from "../engine/dateUtils";
import { Badge, Button, Card, CardHeading, Table, Td, Th } from "../components/ui";

export default function Hiring() {
  const game = useGameStore((s) => s.game)!;
  const postJobOpening = useGameStore((s) => s.postJobOpening);
  const askInterviewQuestion = useGameStore((s) => s.askInterviewQuestion);
  const runReferenceCheck = useGameStore((s) => s.runReferenceCheck);
  const hireCandidate = useGameStore((s) => s.hireCandidate);
  const closeOpening = useGameStore((s) => s.closeOpening);

  const industry = getIndustryDefinition(game.company.industryId)!;
  const [roleId, setRoleId] = useState(industry.employeeRoles[0].id);
  const [openOpeningId, setOpenOpeningId] = useState<string | null>(null);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const [facilityId, setFacilityId] = useState(game.company.facilities[0]?.id ?? "");

  const role = industry.employeeRoles.find((r) => r.id === roleId)!;
  const openPositions = game.company.openPositions.filter((o) => o.status === "open");
  const opening = openPositions.find((o) => o.id === openOpeningId) ?? openPositions[0] ?? null;
  const candidate = opening?.candidates.find((c) => c.id === openCandidateId) ?? opening?.candidates[0] ?? null;
  const openingNeedsFacility = opening && (opening.roleId === "production-worker" || opening.roleId === "machine-operator") && game.company.facilities.length > 1;

  const hiringDelegated = game.company.delegation.hiring.authority !== "player-approval";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Hiring</h1>

      {hiringDelegated && (
        <Badge tone="info">
          Hiring is delegated ({game.company.delegation.hiring.authority.replace("-", " ")}) — department managers may fill openings on their own. See <Link className="underline" to="/game/management">Management</Link> for the decision log.
        </Badge>
      )}

      <Card>
        <CardHeading>Post a New Opening</CardHeading>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Role
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="mt-1 block rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
              {industry.employeeRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </label>
          <div className="text-xs text-ink-400 max-w-sm">{role.description} <span className="text-ink-500">Suggested range: {formatMoney(role.salaryRange[0] / 52)}–{formatMoney(role.salaryRange[1] / 52)}/wk.</span></div>
          <Button onClick={() => postJobOpening(roleId, role.salaryRange[0] / 52, role.salaryRange[1] / 52)}>Post Opening ($150)</Button>
        </div>
      </Card>

      <Card>
        <CardHeading>Open Positions ({openPositions.length})</CardHeading>
        <div className="flex flex-col gap-1">
          {openPositions.map((o) => {
            const pendingManagerReview = game.company.managerDecisionLog.some(
              (d) => d.status === "pending-approval" && d.domain === "hiring" && d.proposal?.openingId === o.id,
            );
            return (
              <button
                key={o.id}
                onClick={() => { setOpenOpeningId(o.id); setOpenCandidateId(null); }}
                className={`flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm ${opening?.id === o.id ? "bg-emerald-600/20" : "hover:bg-ink-800"}`}
              >
                <span>{o.title} — {o.candidates.length} candidate(s), posted week {o.postedWeek}</span>
                {pendingManagerReview && <Badge tone="warn">Manager recommendation pending your approval</Badge>}
              </button>
            );
          })}
          {openPositions.length === 0 && <p className="text-sm text-ink-400">No open positions.</p>}
        </div>
      </Card>

      {opening && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeading>Candidates</CardHeading>
            <div className="flex flex-col gap-1">
              {opening.candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setOpenCandidateId(c.id)}
                  className={`rounded-md px-2.5 py-2 text-left text-sm ${candidate?.id === c.id ? "bg-emerald-600/20" : "hover:bg-ink-800"}`}
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-ink-400">Asking {formatMoney(c.askingSalaryWeekly)}/wk</div>
                </button>
              ))}
            </div>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => closeOpening(opening.id)}>Close this opening</Button>
          </Card>

          {candidate && (
            <Card className="lg:col-span-2">
              <div className="mb-3">
                <h2 className="text-lg font-semibold">{candidate.name}</h2>
                <p className="text-sm text-ink-400">Age {candidate.age} · {candidate.location} · Asking {formatMoney(candidate.askingSalaryWeekly)}/wk</p>
              </div>
              <p className="mb-4 text-sm text-ink-200">{candidate.resumeSummary}</p>

              <CardHeading>Interview</CardHeading>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {INTERVIEW_QUESTION_BANK.map((q) => (
                  <button
                    key={q.id}
                    disabled={!!candidate.interviewNotes[q.id]}
                    onClick={() => askInterviewQuestion(opening.id, candidate.id, q.id)}
                    className="rounded-md bg-ink-800 px-2 py-1 text-xs text-ink-200 hover:bg-ink-700 disabled:opacity-40"
                  >
                    {q.prompt}
                  </button>
                ))}
              </div>
              <div className="mb-4 flex flex-col gap-1.5 text-sm">
                {Object.entries(candidate.interviewNotes).map(([qid, note]) => (
                  <div key={qid} className="rounded-md border border-ink-700 p-2 text-ink-300">{note}</div>
                ))}
              </div>

              <div className="mb-4">
                <Button variant="secondary" onClick={() => runReferenceCheck(opening.id, candidate.id)} disabled={!!candidate.referenceCheckNote}>
                  Run Reference Check
                </Button>
                {candidate.referenceCheckNote && <p className="mt-2 text-sm text-ink-300">{candidate.referenceCheckNote}</p>}
              </div>

              {openingNeedsFacility && (
                <label className="mb-3 block text-sm">
                  Assign to facility
                  <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className="mt-1 block rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
                    {game.company.facilities.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <Button onClick={() => hireCandidate(opening.id, candidate.id, candidate.askingSalaryWeekly, facilityId || undefined)}>
                Offer &amp; Hire at {formatMoney(candidate.askingSalaryWeekly)}/wk
              </Button>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeading>Filled &amp; Closed Positions</CardHeading>
        <Table>
          <thead><tr><Th>Title</Th><Th>Status</Th><Th align="right">Posted Week</Th></tr></thead>
          <tbody>
            {game.company.openPositions.filter((o) => o.status !== "open").map((o) => (
              <tr key={o.id}><Td>{o.title}</Td><Td>{o.status}</Td><Td align="right">{o.postedWeek}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
