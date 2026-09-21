import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { computeManagerSpanCapacity, directReportsOf } from "../engine/management";
import { formatMoney } from "../engine/dateUtils";
import { Badge, Button, Card, CardHeading, ProgressBar, Table, Td, Th } from "../components/ui";

const TONE_BADGE = { strong: "good", solid: "info", mixed: "warn", concerning: "bad" } as const;

export default function Employees() {
  const game = useGameStore((s) => s.game)!;
  const fireEmployee = useGameStore((s) => s.fireEmployee);
  const giveRaise = useGameStore((s) => s.giveRaise);
  const promoteEmployee = useGameStore((s) => s.promoteEmployee);
  const reassignManager = useGameStore((s) => s.reassignManager);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Employees ({employees.length})</h1>
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
                <p className="text-sm text-ink-400">{selected.title} · Age {selected.age} · {selected.location}</p>
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
            <tr><Th>Name</Th><Th>Title</Th><Th>Reports To</Th><Th align="right">Salary/wk</Th><Th align="right">Morale</Th><Th align="right">Errors</Th></tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <Td>{e.name}</Td>
                <Td>{e.title}</Td>
                <Td className="text-ink-400">{managerName(e.managerId)}</Td>
                <Td align="right">{formatMoney(e.salaryWeekly)}</Td>
                <Td align="right">{e.morale}</Td>
                <Td align="right">{e.cumulativeErrors}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
