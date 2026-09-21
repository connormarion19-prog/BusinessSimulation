import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { LOCATIONS, LOCATIONS_BY_ID } from "../data/locations";
import { formatMoney } from "../engine/dateUtils";
import { Badge, Button, Card, CardHeading, ProgressBar, Table, Td } from "../components/ui";

export default function Facilities() {
  const game = useGameStore((s) => s.game)!;
  const openFacility = useGameStore((s) => s.openFacility);
  const industry = getIndustryDefinition(game.company.industryId)!;

  const [templateId, setTemplateId] = useState(industry.facilityTemplates[0].id);
  const [locationId, setLocationId] = useState(LOCATIONS[0].id);

  const template = industry.facilityTemplates.find((t) => t.id === templateId)!;
  const location = LOCATIONS_BY_ID[locationId];
  const previewLease = Math.round(template.weeklyLeaseCost * location.commercialRentIndex);
  const previewUtility = Math.round(template.weeklyUtilityBaseCost * location.commercialRentIndex);
  const previewDeposit = previewLease * 4;

  const employeesByFacility = (facilityId: string) =>
    game.company.employees.filter((e) => e.status === "active" && e.facilityId === facilityId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Facilities ({game.company.facilities.length})</h1>

      <Card>
        <CardHeading subtitle="Production/machine-operator hires you assign to a facility work there; every other role serves the whole company regardless of location.">
          Current Facilities
        </CardHeading>
        <div className="flex flex-col gap-4">
          {game.company.facilities.map((facility) => {
            const loc = LOCATIONS_BY_ID[facility.locationId];
            const staff = employeesByFacility(facility.id);
            return (
              <div key={facility.id} className="rounded-md border border-ink-700 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{facility.name}</div>
                    <div className="text-xs text-ink-400">{loc?.city}, {loc?.state}</div>
                  </div>
                  <Badge>{staff.length} staff assigned</Badge>
                </div>
                <div className="mb-2">
                  <div className="mb-1 flex justify-between text-xs text-ink-400">
                    <span>Equipment condition</span>
                    <span>{Math.round(facility.condition)}%</span>
                  </div>
                  <ProgressBar value={facility.condition} tone={facility.condition < 40 ? "bad" : facility.condition < 70 ? "warn" : "good"} />
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs text-ink-300 sm:grid-cols-4">
                  <div>Capacity: {facility.baseWeeklyCapacityUnits.toLocaleString()}/wk</div>
                  <div>Lease: {formatMoney(facility.weeklyLeaseCost)}/wk</div>
                  <div>Utilities (base): {formatMoney(facility.weeklyUtilityBaseCost)}/wk</div>
                  <div>Labor cost index: {Math.round((loc?.laborCostIndex ?? 1) * 100)}%</div>
                </div>
                {staff.length > 0 && (
                  <div className="mt-2 text-xs text-ink-500">{staff.map((e) => e.name).join(", ")}</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeading subtitle="Different locations trade off labor cost, rent, taxes, and local demand — the facility's costs scale with the location you pick.">
          Open a New Facility
        </CardHeading>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Facility Type</div>
            <div className="flex flex-col gap-1.5">
              {industry.facilityTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-md border p-2 text-left text-xs ${templateId === t.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
                >
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-ink-400">{t.description}</div>
                  <div className="text-ink-500">Capacity {t.baseWeeklyCapacityUnits.toLocaleString()}/wk</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Location</div>
            <div className="flex flex-col gap-1.5">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setLocationId(loc.id)}
                  className={`rounded-md border p-2 text-left text-xs ${locationId === loc.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
                >
                  <div className="font-semibold">{loc.city}, {loc.state}</div>
                  <div className="text-ink-500">Labor {(loc.laborCostIndex * 100).toFixed(0)}% · Rent {(loc.commercialRentIndex * 100).toFixed(0)}% · Tax {loc.corporateTaxRatePct}%</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-ink-700 bg-ink-950 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Estimated Economics</div>
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-300 sm:grid-cols-4">
            <div>Weekly lease: <span className="font-semibold text-ink-100">{formatMoney(previewLease)}</span></div>
            <div>Weekly utilities: <span className="font-semibold text-ink-100">{formatMoney(previewUtility)}</span></div>
            <div>Security deposit (upfront): <span className="font-semibold text-ink-100">{formatMoney(previewDeposit)}</span></div>
            <div>Capacity added: <span className="font-semibold text-ink-100">{template.baseWeeklyCapacityUnits.toLocaleString()}/wk</span></div>
          </div>
          <p className="mt-2 text-xs text-amber-400">
            A new facility produces nothing until you assign production/machine-operator staff to it — the founder can only physically work the original facility.
          </p>
          <Button className="mt-3" onClick={() => openFacility(templateId, locationId)}>
            Open This Facility
          </Button>
        </div>
      </Card>

      {game.lastManagementSnapshot && (
        <Card>
          <CardHeading subtitle="Every facility, product line, and hire adds to what one person has to keep track of.">Management Load</CardHeading>
          <Table>
            <tbody>
              <tr><Td>Management load this week</Td><Td align="right">{game.lastManagementSnapshot.managementLoad.toFixed(1)}</Td></tr>
              <tr><Td>Management capacity (you + managers)</Td><Td align="right">{game.lastManagementSnapshot.managementCapacity.toFixed(1)}</Td></tr>
              <tr><Td>Founder effectiveness</Td><Td align="right">{Math.round(game.lastManagementSnapshot.founderEffectiveness * 100)}%</Td></tr>
              <tr><Td>Managers on staff</Td><Td align="right">{game.lastManagementSnapshot.managerCount}</Td></tr>
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
