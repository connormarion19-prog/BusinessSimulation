import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { computeManagerSpanCapacity, directReportsOf } from "../engine/management";
import { computeAvailableCapacity, computeStaffingGaps, previewHireImpact, STAFFING_STATUS_LABEL, type StaffingStatus } from "../engine/workload";
import { totalAllocationPct, WORK_FUNCTIONS } from "../engine/performance";
import { formatMoney } from "../engine/dateUtils";
import type { WorkFunction } from "../types/employee";
import { Badge, Button, Card, CardHeading, ProgressBar, Table, Td, Th } from "../components/ui";

const TONE_BADGE = { strong: "good", solid: "info", mixed: "warn", concerning: "bad" } as const;

const FUNCTION_LABEL: Record<WorkFunction, string> = {
  accounting: "Accounting",
  purchasing: "Purchasing",
  sales: "Sales",
  operations: "Operations",
  administration: "Administration",
};
const FUNCTION_COLOR: Record<WorkFunction, string> = {
  accounting: "#38bdf8",
  purchasing: "#f59e0b",
  sales: "#34d399",
  operations: "#a78bfa",
  administration: "#f472b6",
};
const STATUS_TONE: Record<StaffingStatus, "info" | "good" | "warn" | "bad"> = {
  "large-surplus": "info",
  balanced: "good",
  tight: "warn",
  overloaded: "bad",
  "critically-overloaded": "bad",
};

function emptyAllocation(): Record<WorkFunction, number> {
  return { accounting: 0, purchasing: 0, sales: 0, operations: 0, administration: 0 };
}

export default function Employees() {
  const game = useGameStore((s) => s.game)!;
  const fireEmployee = useGameStore((s) => s.fireEmployee);
  const giveRaise = useGameStore((s) => s.giveRaise);
  const promoteEmployee = useGameStore((s) => s.promoteEmployee);
  const reassignManager = useGameStore((s) => s.reassignManager);
  const setEmployeeAllocation = useGameStore((s) => s.setEmployeeAllocation);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allocDraft, setAllocDraft] = useState<Record<WorkFunction, number>>(emptyAllocation());

  const industry = getIndustryDefinition(game.company.industryId)!;
  const employees = game.company.employees.filter((e) => e.status === "active");
  const selected = employees.find((e) => e.id === selectedId) ?? employees[0] ?? null;
  const managerName = (id: string | null) => (id ? employees.find((e) => e.id === id)?.name ?? "—" : "Founder");
  const facilityName = (id: string | null) => (id ? game.company.facilities.find((f) => f.id === id)?.name ?? "—" : "—");
  const eligibleManagerRole = selected
    ? industry.employeeRoles.find((r) => r.tier >= 2 && r.managesDepartment === selected.department && r.id !== selected.roleId)
    : undefined;
  const possibleManagers = selected
    ? employees.filter((e) => e.id !== selected.id && e.department === "management")
    : [];
  const selectedRoleTemplate = selected ? industry.employeeRoles.find((r) => r.id === selected.roleId) : undefined;

  useEffect(() => {
    if (selected) setAllocDraft({ ...selected.allocation });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const capacity = computeAvailableCapacity(game.company, industry.employeeRoles);
  const gaps = computeStaffingGaps(game.company, industry.employeeRoles);
  const totalCapacity = WORK_FUNCTIONS.reduce((s, fn) => s + capacity.raw[fn], 0);
  const pieData = WORK_FUNCTIONS.filter((fn) => capacity.raw[fn] > 0.5).map((fn) => ({ name: FUNCTION_LABEL[fn], fn, value: capacity.raw[fn] }));

  const worstGap = [...WORK_FUNCTIONS].sort((a, b) => (gaps[b].required - gaps[b].available) - (gaps[a].required - gaps[a].available))[0];
  const candidateRoles = industry.employeeRoles.filter((r) => r.tier === 1);
  const draftTotal = WORK_FUNCTIONS.reduce((s, fn) => s + (allocDraft[fn] ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Employees ({employees.length})</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading subtitle="What your combined workforce — founder plus every active employee — is actually spending its declared weekly capacity on.">
            Workforce Capacity — {Math.round(totalCapacity)}%
          </CardHeading>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} isAnimationActive={false}>
                      {pieData.map((d) => (
                        <Cell key={d.fn} fill={FUNCTION_COLOR[d.fn]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#111826", border: "1px solid #243044" }} formatter={(v) => `${Math.round(Number(v))}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 text-xs">
                {WORK_FUNCTIONS.map((fn) => (
                  <div key={fn} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FUNCTION_COLOR[fn] }} />
                      {FUNCTION_LABEL[fn]}
                    </span>
                    <span className="tabular-nums text-ink-300">{totalCapacity > 0 ? Math.round((capacity.raw[fn] / totalCapacity) * 100) : 0}% of workforce ({Math.round(capacity.raw[fn])}%)</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-400">No working capacity allocated anywhere yet.</p>
          )}
        </Card>

        <Card>
          <CardHeading subtitle="Required work vs. what your workforce can actually cover — the real basis for any hiring decision.">
            Workload Demand
          </CardHeading>
          <div className="flex flex-col gap-3">
            {WORK_FUNCTIONS.map((fn) => {
              const g = gaps[fn];
              const pct = g.available > 0 ? Math.min(160, (g.required / g.available) * 100) : g.required > 0 ? 160 : 0;
              return (
                <div key={fn}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{FUNCTION_LABEL[fn]}</span>
                    <span className="text-ink-400">
                      {Math.round(g.required)}% required / {Math.round(g.available)}% available
                    </span>
                  </div>
                  <ProgressBar value={pct} max={160} tone={STATUS_TONE[g.status] === "bad" ? "bad" : STATUS_TONE[g.status] === "warn" ? "warn" : "good"} />
                  <div className="mt-0.5 flex justify-between text-[11px] text-ink-500">
                    <span>{STAFFING_STATUS_LABEL[g.status]}</span>
                    <span>{g.gap > 0 ? `short ${Math.round(g.gap)}%` : `surplus ${Math.round(-g.gap)}%`} · efficiency {Math.round(g.efficiency * 100)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeading subtitle="Information only — hire, reallocate, work harder, or wait. The game doesn't decide for you.">
          Should You Hire? ({FUNCTION_LABEL[worstGap]} is your tightest function)
        </CardHeading>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {candidateRoles.map((role) => {
            const preview = previewHireImpact(game.company, industry.employeeRoles, role.id);
            if (!preview) return null;
            return (
              <div key={role.id} className="rounded-md border border-ink-700 p-2.5 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-ink-100">{role.title}</span>
                  <Badge tone={role.roleClass === "generalist" ? "info" : "neutral"}>{role.roleClass}</Badge>
                </div>
                <div className="text-ink-400">{preview.rationale.join(" ")}</div>
                <div className="mt-1 text-ink-500">Est. {formatMoney(preview.estAnnualCostLow)}–{formatMoney(preview.estAnnualCostHigh)}/yr</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeading>Roster</CardHeading>
          {employees.length === 0 && <p className="text-sm text-ink-400">No employees yet — you're doing it all yourself. Post an opening in Hiring.</p>}
          <div className="flex flex-col gap-1">
            {employees.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`rounded-md px-2.5 py-2 text-left text-sm ${selected?.id === e.id ? "bg-emerald-600/20" : "hover:bg-ink-800"}`}
              >
                <div className="font-medium">{e.name}</div>
                <div className="text-xs text-ink-400">{e.title} · {formatMoney(e.salaryWeekly)}/wk</div>
              </button>
            ))}
          </div>
        </Card>

        {selected && (
          <Card className="lg:col-span-2">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <p className="text-sm text-ink-400">
                  {selected.title} · Age {selected.age} · {selected.location}
                  {selectedRoleTemplate && <Badge tone={selectedRoleTemplate.roleClass === "generalist" ? "info" : "neutral"}> {selectedRoleTemplate.roleClass}</Badge>}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const raise = window.prompt("New weekly salary:", String(selected.salaryWeekly));
                    if (raise) giveRaise(selected.id, Number(raise));
                  }}
                >
                  Adjust Salary
                </Button>
                <Button variant="danger" onClick={() => fireEmployee(selected.id)}>Let Go</Button>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="mb-1 text-ink-400">Morale</div>
                <ProgressBar value={selected.morale} tone={selected.morale > 60 ? "good" : selected.morale > 35 ? "warn" : "bad"} />
              </div>
              <div>
                <div className="mb-1 text-ink-400">Fatigue</div>
                <ProgressBar value={selected.fatigue} tone={selected.fatigue < 40 ? "good" : selected.fatigue < 70 ? "warn" : "bad"} />
              </div>
              <div className="text-ink-400">
                Hired week {selected.hireWeek} · {selected.cumulativeErrors} cumulative errors flagged
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-ink-700 p-2.5 text-xs">
              <div>Reports to: <span className="text-ink-100">{managerName(selected.managerId)}</span></div>
              {selected.facilityId && <div>Facility: <span className="text-ink-100">{facilityName(selected.facilityId)}</span></div>}
              {selected.department === "management" && (
                <div>
                  Direct reports: <span className="text-ink-100">{directReportsOf(game.company, selected.id).length}</span>
                  {" "}/ effective capacity <span className="text-ink-100">{computeManagerSpanCapacity(selected)}</span>
                  {directReportsOf(game.company, selected.id).length > computeManagerSpanCapacity(selected) && <Badge tone="bad">Overloaded</Badge>}
                </div>
              )}
              {possibleManagers.length > 0 && (
                <label className="flex items-center gap-1.5">
                  <span className="text-ink-400">Reassign to:</span>
                  <select
                    value={selected.managerId ?? ""}
                    onChange={(e) => reassignManager(selected.id, e.target.value || null)}
                    className="rounded-md border border-ink-700 bg-ink-950 px-1.5 py-1 text-xs"
                  >
                    <option value="">Founder</option>
                    {possibleManagers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.title})</option>
                    ))}
                  </select>
                </label>
              )}
              {eligibleManagerRole && (
                <Button variant="secondary" onClick={() => promoteEmployee(selected.id, eligibleManagerRole.id)}>
                  Promote to {eligibleManagerRole.title}
                </Button>
              )}
            </div>

            <CardHeading subtitle="How this person's working week is split. Changes apply starting the next simulated week.">
              Capacity Allocation
            </CardHeading>
            <div className="mb-2 flex flex-col gap-2">
              {WORK_FUNCTIONS.map((fn) => (
                <div key={fn} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">{FUNCTION_LABEL[fn]}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={allocDraft[fn] ?? 0}
                    onChange={(e) => setAllocDraft({ ...allocDraft, [fn]: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-10 text-right text-xs tabular-nums">{Math.round(allocDraft[fn] ?? 0)}%</span>
                </div>
              ))}
            </div>
            <div className="mb-4 flex items-center justify-between">
              <span className={`text-xs ${draftTotal > 100 ? "text-rose-400" : "text-ink-400"}`}>
                Total allocated: {Math.round(draftTotal)}% {draftTotal > 100 && `(overallocated by ${Math.round(draftTotal - 100)}% — expect lower output and more errors)`}
              </span>
              <Button variant="secondary" onClick={() => setEmployeeAllocation(selected.id, allocDraft)}>Apply Allocation</Button>
            </div>

            <div className="mb-4 text-xs text-ink-300">
              <div className="font-semibold text-ink-200">{selected.education.degree}, {selected.education.field}</div>
              <div>{selected.education.school}</div>
              {selected.priorEmployers.length > 0 && (
                <div className="mt-1">Prior: {selected.priorEmployers.map((p) => `${p.company} (${p.years}yr)`).join(", ")}</div>
              )}
            </div>

            <CardHeading>Weekly Evaluations</CardHeading>
            <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {[...selected.performanceHistory].reverse().map((ev, i) => (
                <div key={i} className="rounded-md border border-ink-700 p-2.5 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-ink-500">Week {ev.week}</span>
                    <Badge tone={TONE_BADGE[ev.tone]}>{ev.tone}</Badge>
                  </div>
                  <p className="text-ink-200">{ev.narrative}</p>
                </div>
              ))}
              {selected.performanceHistory.length === 0 && <p className="text-sm text-ink-400">No evaluations yet — advance a week.</p>}
            </div>
          </Card>
        )}
      </div>

      <Card>
        <CardHeading>All-Employee Summary</CardHeading>
        <Table>
          <thead>
            <tr><Th>Name</Th><Th>Title</Th><Th>Reports To</Th><Th align="right">Total Allocated</Th><Th align="right">Salary/wk</Th><Th align="right">Morale</Th><Th align="right">Errors</Th></tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const total = totalAllocationPct(e);
              return (
                <tr key={e.id}>
                  <Td>{e.name}</Td>
                  <Td>{e.title}</Td>
                  <Td className="text-ink-400">{managerName(e.managerId)}</Td>
                  <Td align="right" className={total > 100 ? "text-rose-400" : undefined}>{Math.round(total)}%</Td>
                  <Td align="right">{formatMoney(e.salaryWeekly)}</Td>
                  <Td align="right">{e.morale}</Td>
                  <Td align="right">{e.cumulativeErrors}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
