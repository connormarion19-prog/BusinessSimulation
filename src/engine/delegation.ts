import type { Company, DelegationSettings, ManagerDecisionLogEntry } from "../types/core";
import type { Employee, EmployeeRoleTemplate } from "../types/employee";
import type { RngState } from "./rng";
import { round2 } from "./ledger";
import { scoreCandidateForRole, buildEmployeeFromCandidate } from "./hiring";

let decisionCounter = 0;
function nextDecisionId(): string {
  decisionCounter += 1;
  return `mdec-${decisionCounter}-${Math.round(Math.random() * 1e6)}`;
}

export function defaultDelegationSettings(): DelegationSettings {
  return {
    purchasing: { authority: "player-approval", thresholdAmount: 5_000 },
    hiring: { authority: "player-approval", thresholdAmount: 60_000 },
  };
}

function managerForDepartment(company: Company, roles: EmployeeRoleTemplate[], department: string): Employee | undefined {
  return company.employees.find(
    (e) => e.status === "active" && e.department === "management" && roles.find((r) => r.id === e.roleId)?.managesDepartment === department,
  );
}

/**
 * Every few weeks, a delegated purchasing manager reweighs supplier allocation toward whoever is
 * pricing/performing best, blending gradually rather than lurching (a real manager renegotiates,
 * doesn't flip vendors overnight). Reallocation beyond the authorized dollar exposure is proposed,
 * not applied, until the player signs off.
 */
export function runDelegatedPurchasing(company: Company, roles: EmployeeRoleTemplate[], week: number, date: string): ManagerDecisionLogEntry[] {
  const settings = company.delegation.purchasing;
  if (settings.authority === "player-approval") return [];
  if (company.suppliers.length < 2) return [];
  if (week % 4 !== 0) return [];
  const manager = managerForDepartment(company, roles, "purchasing");
  if (!manager) return [];

  const avgPrice = company.suppliers.reduce((s, sup) => s + sup.pricePerUnit, 0) / company.suppliers.length;
  const scored = company.suppliers.map((supplier) => {
    const priceScore = avgPrice > 0 ? (avgPrice - supplier.pricePerUnit) / avgPrice : 0;
    const score = supplier.reliability * 0.4 + supplier.quality * 0.3 + priceScore * 0.3;
    return { supplier, score };
  });

  const currentTotal = company.suppliers.reduce((s, sup) => s + sup.purchaseAllocationPct, 0) || 1;
  const weightBase = scored.map((x) => Math.max(0.05, x.score + 1));
  const totalWeight = weightBase.reduce((s, w) => s + w, 0);

  const newAlloc = new Map<string, number>();
  let totalShiftFraction = 0;
  scored.forEach((x, i) => {
    const current = x.supplier.purchaseAllocationPct / currentTotal;
    const target = weightBase[i] / totalWeight;
    const blended = current * 0.7 + target * 0.3;
    newAlloc.set(x.supplier.id, blended);
    totalShiftFraction += Math.abs(blended - current);
  });
  const sumNew = [...newAlloc.values()].reduce((a, b) => a + b, 0);
  for (const [id, v] of newAlloc) newAlloc.set(id, sumNew > 0 ? v / sumNew : v);

  if (totalShiftFraction < 0.02) return [];

  const weeklySpendEstimate = company.suppliers.reduce((s, sup) => s + sup.pricePerUnit * sup.purchaseAllocationPct, 0) * 50;
  const amountInvolved = round2(totalShiftFraction * weeklySpendEstimate);

  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
  const reasoning: string[] = [];
  if (best.supplier.id !== worst.supplier.id) {
    const priceDeltaPct = worst.supplier.pricePerUnit > 0
      ? round2(((worst.supplier.pricePerUnit - best.supplier.pricePerUnit) / worst.supplier.pricePerUnit) * 100)
      : 0;
    if (priceDeltaPct > 0.5) reasoning.push(`${best.supplier.name}'s price is running ${priceDeltaPct}% below ${worst.supplier.name}'s.`);
    if (best.supplier.reliability - worst.supplier.reliability > 0.03) {
      reasoning.push(`${best.supplier.name} has been more reliable lately (${Math.round(best.supplier.reliability * 100)}% vs ${Math.round(worst.supplier.reliability * 100)}%).`);
    }
    if (best.supplier.quality - worst.supplier.quality > 0.03) {
      reasoning.push(`${best.supplier.name}'s delivered material quality is running higher.`);
    }
  }
  if (reasoning.length === 0) reasoning.push("A modest rebalance toward the better-performing supplier(s) this quarter.");

  const allocations: Record<string, number> = Object.fromEntries(newAlloc);
  const withinAuthority = settings.authority === "full-authority" || amountInvolved <= settings.thresholdAmount;

  const entry: ManagerDecisionLogEntry = {
    id: nextDecisionId(),
    week,
    date,
    managerId: manager.id,
    managerName: manager.name,
    domain: "purchasing",
    headline: `Rebalance purchasing across ${company.suppliers.length} suppliers`,
    reasoning,
    amountInvolved,
    status: withinAuthority ? "auto-approved" : "pending-approval",
    proposal: { supplierAllocations: allocations },
  };

  if (withinAuthority) applyPurchasingProposal(company, allocations);
  return [entry];
}

export function applyPurchasingProposal(company: Company, allocations: Record<string, number>): void {
  for (const supplier of company.suppliers) {
    const pct = allocations[supplier.id];
    if (typeof pct === "number") supplier.purchaseAllocationPct = round2(pct);
  }
}

/**
 * A delegated department manager reviews open candidates and hires the one who scores best for the
 * role — an imperfect read driven by the manager's own judgment and whatever interview signal the
 * player already gathered. Offers beyond the manager's salary authority are proposed, not made.
 */
export function runDelegatedHiring(company: Company, roles: EmployeeRoleTemplate[], week: number, date: string, rng: RngState): ManagerDecisionLogEntry[] {
  const settings = company.delegation.hiring;
  if (settings.authority === "player-approval") return [];
  const entries: ManagerDecisionLogEntry[] = [];

  for (const opening of company.openPositions) {
    if (opening.status !== "open" || opening.candidates.length === 0) continue;
    if (week - opening.postedWeek < 1) continue;
    if (opening.department === "management") continue;
    const role = roles.find((r) => r.id === opening.roleId);
    const manager = managerForDepartment(company, roles, opening.department);
    if (!role || !manager) continue;

    const scored = opening.candidates.map((candidate) => ({
      candidate,
      score: scoreCandidateForRole(candidate, role, manager.traits.judgment, rng),
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    const annualAsk = round2(top.candidate.askingSalaryWeekly * 52);
    const withinAuthority = settings.authority === "full-authority" || annualAsk <= settings.thresholdAmount;

    const reasoning = [
      `${top.candidate.name} scored highest among ${opening.candidates.length} applicant(s) for ${opening.title}.`,
      Object.keys(top.candidate.interviewNotes).length > 0
        ? "Interview notes already on file were factored into the read."
        : "No interview on file yet — this read relies on resume and background alone, which is noisier.",
      `Asking salary ($${Math.round(annualAsk).toLocaleString()}/yr) ${withinAuthority ? "is within" : "exceeds"} this manager's hiring authority.`,
    ];

    const entry: ManagerDecisionLogEntry = {
      id: nextDecisionId(),
      week,
      date,
      managerId: manager.id,
      managerName: manager.name,
      domain: "hiring",
      headline: `Hire ${top.candidate.name} as ${opening.title}`,
      reasoning,
      amountInvolved: annualAsk,
      status: withinAuthority ? "auto-approved" : "pending-approval",
      proposal: { openingId: opening.id, candidateId: top.candidate.id, salaryWeekly: top.candidate.askingSalaryWeekly },
    };

    if (withinAuthority) applyHireProposal(company, opening.id, top.candidate.id, top.candidate.askingSalaryWeekly, week, date, manager.id);
    entries.push(entry);
  }
  return entries;
}

export function applyHireProposal(
  company: Company,
  openingId: string,
  candidateId: string,
  salaryWeekly: number,
  week: number,
  date: string,
  managerId: string | null,
): boolean {
  const opening = company.openPositions.find((o) => o.id === openingId);
  const candidate = opening?.candidates.find((c) => c.id === candidateId);
  if (!opening || !candidate) return false;
  const facilityBound = opening.roleId === "production-worker" || opening.roleId === "machine-operator";
  const employee = buildEmployeeFromCandidate({
    candidate,
    opening,
    week,
    salaryWeekly,
    facilityId: facilityBound ? (company.facilities[0]?.id ?? null) : null,
    managerId,
  });
  company.employees.push(employee);
  opening.status = "filled";
  opening.filledByEmployeeId = employee.id;
  company.historyLog.push({
    week,
    date,
    headline: `Hired ${employee.name} as ${employee.title}${managerId ? " (delegated hire)" : ""}`,
    category: "hiring",
  });
  return true;
}

export function approveManagerDecision(company: Company, decisionId: string, week: number, date: string): boolean {
  const entry = company.managerDecisionLog.find((d) => d.id === decisionId && d.status === "pending-approval");
  if (!entry || !entry.proposal) return false;
  if (entry.domain === "purchasing" && entry.proposal.supplierAllocations) {
    applyPurchasingProposal(company, entry.proposal.supplierAllocations);
  } else if (entry.domain === "hiring" && entry.proposal.openingId && entry.proposal.candidateId && entry.proposal.salaryWeekly != null) {
    applyHireProposal(company, entry.proposal.openingId, entry.proposal.candidateId, entry.proposal.salaryWeekly, week, date, entry.managerId);
  }
  entry.status = "player-approved";
  return true;
}

export function rejectManagerDecision(company: Company, decisionId: string): boolean {
  const entry = company.managerDecisionLog.find((d) => d.id === decisionId && d.status === "pending-approval");
  if (!entry) return false;
  entry.status = "player-rejected";
  return true;
}
