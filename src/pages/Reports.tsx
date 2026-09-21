import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useGameStore } from "../store/useGameStore";
import { Card, CardHeading, Table, Td, Th } from "../components/ui";

export default function Reports() {
  const game = useGameStore((s) => s.game)!;
  const history = game.company.kpiHistory;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Reports</h1>

      {history.length > 1 && (
        <>
          <Card>
            <CardHeading>Cash Over Time</CardHeading>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
                  <XAxis dataKey="week" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#111826", border: "1px solid #243044" }} />
                  <Line type="monotone" dataKey="cash" stroke="#38bdf8" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardHeading>Headcount Over Time</CardHeading>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
                  <XAxis dataKey="week" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#111826", border: "1px solid #243044" }} />
                  <Line type="monotone" dataKey="employeeCount" stroke="#f59e0b" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      <Card>
        <CardHeading>Full Company History</CardHeading>
        <Table>
          <thead><tr><Th>Week</Th><Th>Date</Th><Th>Category</Th><Th>Event</Th></tr></thead>
          <tbody>
            {[...game.company.historyLog].reverse().map((h, i) => (
              <tr key={i}>
                <Td>{h.week}</Td>
                <Td>{h.date}</Td>
                <Td className="capitalize text-ink-400">{h.category}</Td>
                <Td>{h.headline}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
