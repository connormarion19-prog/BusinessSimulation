import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useGameStore } from "../store/useGameStore";
import { getCash } from "../engine/company";
import { formatMoney } from "../engine/dateUtils";
import { Badge, Card, CardHeading, StatCard } from "../components/ui";

const SEVERITY_TONE = { info: "info", opportunity: "good", warning: "warn", urgent: "bad" } as const;

export default function Dashboard() {
  const game = useGameStore((s) => s.game)!;
  const { company } = game;
  const cash = getCash(company, game.week);
  const trailing = company.kpiHistory.slice(-16);
  const latest = company.kpiHistory[company.kpiHistory.length - 1];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">{company.name}</h1>
        <p className="text-sm text-ink-400">
          {company.stage.replace("-", " ")} · Founded {company.foundedDate} · Week {game.week}
        </p>
      </div>

      {game.lastBriefing && (
        <Card>
          <CardHeading>Weekly Briefing — Week {game.lastBriefing.week}</CardHeading>
          <p className="text-base font-medium text-ink-100">{game.lastBriefing.headline}</p>
          <div className="mt-2 flex flex-col gap-2 text-sm text-ink-300">
            {game.lastBriefing.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Cash" value={formatMoney(cash)} tone={cash < 0 ? "bad" : "neutral"} />
        <StatCard label="Weekly Revenue" value={formatMoney(latest?.revenue ?? 0)} />
        <StatCard label="Weekly Net Income" value={formatMoney(latest?.netIncome ?? 0)} tone={(latest?.netIncome ?? 0) >= 0 ? "good" : "bad"} />
        <StatCard label="Employees" value={String(latest?.employeeCount ?? 0)} />
        {game.lastManagementSnapshot && (
          <StatCard
            label="Founder Effectiveness"
            value={`${Math.round(game.lastManagementSnapshot.founderEffectiveness * 100)}%`}
            tone={game.lastManagementSnapshot.founderEffectiveness > 0.85 ? "good" : game.lastManagementSnapshot.founderEffectiveness > 0.6 ? "neutral" : "bad"}
          />
        )}
      </div>

      {game.pendingDecisions.length > 0 && (
        <Card>
          <CardHeading>Decisions Requiring Attention</CardHeading>
          <div className="flex flex-col gap-2">
            {game.pendingDecisions.map((d) => (
              <div key={d.id} className="flex items-start justify-between rounded-md border border-ink-700 p-2.5">
                <div>
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="text-xs text-ink-400">{d.detail}</div>
                </div>
                <Badge tone={SEVERITY_TONE[d.severity]}>{d.severity}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {trailing.length > 1 && (
        <Card>
          <CardHeading>Revenue &amp; Net Income — last {trailing.length} weeks</CardHeading>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trailing}>
                <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
                <XAxis dataKey="week" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: "#111826", border: "1px solid #243044" }} />
                <Line type="monotone" dataKey="revenue" stroke="#38bdf8" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="netIncome" stroke="#34d399" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <CardHeading>Recent Company History</CardHeading>
        <div className="flex flex-col gap-1.5 text-sm">
          {[...company.historyLog].slice(-8).reverse().map((h, i) => (
            <div key={i} className="flex gap-3">
              <span className="w-20 shrink-0 text-xs text-ink-500">wk {h.week}</span>
              <span>{h.headline}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
