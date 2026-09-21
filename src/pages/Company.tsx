import { useGameStore } from "../store/useGameStore";
import { LOCATIONS_BY_ID } from "../data/locations";
import { formatMoney } from "../engine/dateUtils";
import { Card, CardHeading, Table, Td, Th } from "../components/ui";

export default function CompanyPage() {
  const game = useGameStore((s) => s.game)!;
  const { company } = game;
  const location = LOCATIONS_BY_ID[company.locationId];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Company &amp; Ownership</h1>

      <Card>
        <CardHeading>Profile</CardHeading>
        <Table>
          <tbody>
            <tr><Td>Name</Td><Td align="right">{company.name}</Td></tr>
            <tr><Td>Industry</Td><Td align="right">{company.industryId.replace(/-/g, " ")}</Td></tr>
            <tr><Td>Stage</Td><Td align="right" className="capitalize">{company.stage.replace("-", " ")}</Td></tr>
            <tr><Td>Location</Td><Td align="right">{location?.city}, {location?.state}</Td></tr>
            <tr><Td>Founded</Td><Td align="right">{company.foundedDate} (week {company.foundedWeek})</Td></tr>
            <tr><Td>Target customer</Td><Td align="right">{company.targetCustomerSegment.replace(/-/g, " ")}</Td></tr>
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeading>Ownership</CardHeading>
        <Table>
          <thead><tr><Th>Stakeholder</Th><Th>Type</Th><Th align="right">Equity %</Th></tr></thead>
          <tbody>
            <tr><Td>Founder (you)</Td><Td>—</Td><Td align="right">{company.ownership.founderEquityPct}%</Td></tr>
            {company.ownership.stakeholders.map((s, i) => (
              <tr key={i}><Td>{s.name}</Td><Td className="text-ink-400">{s.type}</Td><Td align="right">{s.equityPct}%</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeading>Debt</CardHeading>
        {company.loans.length === 0 && <p className="text-sm text-ink-400">No outstanding loans.</p>}
        <Table>
          <thead><tr><Th>Lender</Th><Th align="right">Balance</Th><Th align="right">Rate</Th><Th align="right">Weekly Payment</Th><Th align="right">Weeks Left</Th></tr></thead>
          <tbody>
            {company.loans.map((l) => (
              <tr key={l.id}>
                <Td>{l.lender}</Td>
                <Td align="right">{formatMoney(l.balance)}</Td>
                <Td align="right">{(l.annualRate * 100).toFixed(2)}%</Td>
                <Td align="right">{formatMoney(l.weeklyPayment)}</Td>
                <Td align="right">{l.weeksRemaining}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
