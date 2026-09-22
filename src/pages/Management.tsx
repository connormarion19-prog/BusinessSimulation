import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { computeManagerSpanCapacity, directReportsOf } from "../engine/management";
import { buildOrgTree, type OrgTreeNode } from "../engine/orgChart";
import { formatMoney } from "../engine/dateUtils";
import { Badge, Button, Card, CardHeading, ProgressBar, Table, Td, Th } from "../components/ui";
import type { AuthorityLevel } from "../types/core";

function OrgNode({ node, depth, onSelect }: { node: OrgTreeNode; depth: number; onSelect: (id: string) => void }) {
  return (
    <div className={depth > 0 ? "ml-5 border-l border-ink-700 pl-4" : ""}>
      <button
        onClick={() => onSelect(node.id)}
        className={`my-1 flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${
          node.isVacancy
            ? "border-dashed border-amber-700 bg-amber-950/20 text-amber-300"
            : node.isFounder
              ? "border-emerald-600 bg-emerald-600/10"
              : "border-ink-700 bg-ink-900 hover:bg-ink-800"
        }`}
      >
        <span className="font-medium">{node.name}</span>
        <span className="text-xs text-ink-400">{node.title}</span>
        {node.overloaded && <Badge tone="bad">Needs attention</Badge>}
      </button>
      {node.children.length > 0 && (
        <div>
          {node.children.map((c) => (
            <OrgNode key={c.id} node={c} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

const AUTHORITY_LABEL: Record<AuthorityLevel, string> = {
  "player-approval": "Player approval required",
  threshold: "Manager acts up to a threshold",
  "full-authority": "Manager has full authority",
};

const STATUS_TONE = {
  "auto-approved": "good",
  "pending-approval": "warn",
  "player-approved": "good",
  "player-rejected": "bad",
} as const;

export default function Management() {
  const game = useGameStore((s) => s.game)!;
  const setDelegationAuthority = useGameStore((s) => s.setDelegationAuthority);
  const approveManagerDecision = useGameStore((s) => s.approveManagerDecision);
  const rejectManagerDecision = useGameStore((s) => s.rejectManagerDecision);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const industry = getIndustryDefinition(game.company.industryId)!;
  const orgTree = buildOrgTree(game.company, industry.employeeRoles);
  const selectedEmployee = selectedNodeId ? game.company.employees.find((e) => e.id === selectedNodeId) : null;

  const managers = game.company.employees.filter((e) => e.status === "active" && e.department === "management");
  const pending = game.company.managerDecisionLog.filter((d) => d.status === "pending-approval");
  const recent = game.company.managerDecisionLog.slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Management</h1>

      <Card>
        <CardHeading subtitle="Real reporting relationships, not a diagram — every node is an actual employee (or a genuinely open, overloaded need). Click a node for their profile.">
          Organization
        </CardHeading>
        <div className="overflow-x-auto pb-2">
          <OrgNode node={orgTree} depth={0} onSelect={setSelectedNodeId} />
        </div>
        {selectedEmployee && (
          <div className="mt-3 rounded-md border border-ink-700 bg-ink-950 p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">{selectedEmployee.name} — {selectedEmployee.title}</span>
              <Button variant="ghost" onClick={() => setSelectedNodeId(null)}>Close</Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-ink-300 sm:grid-cols-4">
              <div>Salary: {formatMoney(selectedEmployee.salaryWeekly)}/wk</div>
              <div>Hired week {selectedEmployee.hireWeek}</div>
              <div>Morale: {selectedEmployee.morale}/100</div>
              <div>Direct reports: {directReportsOf(game.company, selectedEmployee.id).length}</div>
            </div>
          </div>
        )}
        {selectedNodeId?.startsWith("vacancy-") && (
          <div className="mt-3 rounded-md border border-dashed border-amber-700 bg-amber-950/20 p-3 text-sm text-amber-200">
            This function is overloaded with no manager owning it — promote an existing employee or post an opening from Hiring to fill this gap.
          </div>
        )}
      </Card>

      {game.lastManagementSnapshot && (
        <Card>
          <CardHeading subtitle="Every facility, product line, and hire adds to what one person has to keep track of — promote or hire managers to keep this from dragging down everything you personally still do.">
            Founder Workload
          </CardHeading>
          <div className="mb-2">
            <div className="mb-1 flex justify-between text-xs text-ink-400">
              <span>Founder effectiveness</span>
              <span>{Math.round(game.lastManagementSnapshot.founderEffectiveness * 100)}%</span>
            </div>
            <ProgressBar
              value={game.lastManagementSnapshot.founderEffectiveness * 100}
              tone={game.lastManagementSnapshot.founderEffectiveness > 0.85 ? "good" : game.lastManagementSnapshot.founderEffectiveness > 0.6 ? "warn" : "bad"}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-ink-300">
            <div>Management load: {game.lastManagementSnapshot.managementLoad.toFixed(1)}</div>
            <div>Management capacity: {game.lastManagementSnapshot.managementCapacity.toFixed(1)}</div>
            <div>Managers on staff: {game.lastManagementSnapshot.managerCount}</div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeading subtitle="Decide how much authority each manager has. Player-approval means nothing happens until you act, exactly like having no manager. A threshold lets them act on their own up to a $ amount; anything bigger queues for your sign-off.">
          Delegated Authority
        </CardHeading>
        <div className="flex flex-col gap-4">
          {(["purchasing", "hiring"] as const).map((domain) => {
            const settings = game.company.delegation[domain];
            return (
              <div key={domain} className="rounded-md border border-ink-700 p-3">
                <div className="mb-2 text-sm font-semibold capitalize">{domain}</div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={settings.authority}
                    onChange={(e) => setDelegationAuthority(domain, e.target.value as AuthorityLevel, settings.thresholdAmount)}
                    className="rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm"
                  >
                    {(Object.keys(AUTHORITY_LABEL) as AuthorityLevel[]).map((level) => (
                      <option key={level} value={level}>{AUTHORITY_LABEL[level]}</option>
                    ))}
                  </select>
                  {settings.authority === "threshold" && (
                    <label className="flex items-center gap-1.5 text-xs text-ink-400">
                      Threshold ({domain === "purchasing" ? "$ of weekly exposure" : "$/yr salary"}):
                      <input
                        type="number"
                        value={settings.thresholdAmount}
                        onChange={(e) => setDelegationAuthority(domain, "threshold", Number(e.target.value))}
                        className="w-28 rounded-md border border-ink-700 bg-ink-950 px-2 py-1 text-xs"
                      />
                    </label>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {domain === "purchasing"
                    ? "Requires a Purchasing Manager on staff. Every few weeks they compare suppliers on price/reliability/quality and gradually shift allocation toward whoever is performing better."
                    : "Requires that department's manager on staff. Once an opening has sat a week, the manager scores applicants and can hire the best one without you touching Hiring."}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeading>Awaiting Your Approval ({pending.length})</CardHeading>
          <div className="flex flex-col gap-3">
            {pending.map((d) => (
              <div key={d.id} className="rounded-md border border-amber-700/50 bg-amber-900/10 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-medium">{d.headline}</div>
                  <Badge tone="warn">${Math.round(d.amountInvolved).toLocaleString()}</Badge>
                </div>
                <div className="mb-2 text-xs text-ink-400">Proposed by {d.managerName}, week {d.week}</div>
                <ul className="mb-3 list-inside list-disc text-xs text-ink-300">
                  {d.reasoning.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                <div className="flex gap-2">
                  <Button onClick={() => approveManagerDecision(d.id)}>Approve</Button>
                  <Button variant="danger" onClick={() => rejectManagerDecision(d.id)}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeading subtitle="How many people each manager is actually running, versus how many they can effectively handle given their own leadership/judgment/organization.">
          Span of Control
        </CardHeading>
        {managers.length === 0 ? (
          <p className="text-sm text-ink-400">No managers yet — you're the only layer of management.</p>
        ) : (
          <Table>
            <thead><tr><Th>Manager</Th><Th>Department</Th><Th align="right">Direct Reports</Th><Th align="right">Effective Capacity</Th><Th></Th></tr></thead>
            <tbody>
              {managers.map((m) => {
                const reports = directReportsOf(game.company, m.id);
                const capacity = computeManagerSpanCapacity(m);
                const overloaded = reports.length > capacity;
                return (
                  <tr key={m.id}>
                    <Td>{m.name}</Td>
                    <Td className="text-ink-400">{m.title}</Td>
                    <Td align="right">{reports.length}</Td>
                    <Td align="right">{capacity}</Td>
                    <Td align="right">{overloaded ? <Badge tone="bad">Overloaded</Badge> : <Badge tone="good">OK</Badge>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeading>Recent Manager Decisions</CardHeading>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-400">No delegated decisions yet — grant a manager some authority above to see this fill in.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((d) => (
              <div key={d.id} className="rounded-md border border-ink-700 p-2.5 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{d.headline}</span>
                  <Badge tone={STATUS_TONE[d.status]}>{d.status.replace("-", " ")}</Badge>
                </div>
                <div className="mb-1 text-xs text-ink-500">{d.managerName} · week {d.week} · {formatMoney(d.amountInvolved)}</div>
                <ul className="list-inside list-disc text-xs text-ink-400">
                  {d.reasoning.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
