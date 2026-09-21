import { create } from "zustand";
import type { AuthorityLevel, GameState } from "../types/core";
import type { Employee } from "../types/employee";
import type { NewCompanyParams } from "../types/industry";
import { createNewGame } from "../engine/newGame";
import { advanceWeek as advanceWeekEngine } from "../engine/clock";
import { getIndustryDefinition } from "../industries/registry";
import { generateApplicantPool, answerInterviewQuestion as answerInterviewQuestionEngine, generateReferenceCheckNote, INTERVIEW_QUESTION_BANK } from "../engine/hiring";
import { makeEntry, dr, cr } from "../engine/ledger";
import { addProductToCompany, discontinueProductOnCompany } from "../engine/products";
import { addSupplierToCompany, removeSupplierFromCompany } from "../engine/suppliers";
import { openFacilityForCompany } from "../engine/facilities";
import { promoteEmployeeToManager } from "../engine/management";
import { approveManagerDecision as approveManagerDecisionEngine, rejectManagerDecision as rejectManagerDecisionEngine } from "../engine/delegation";
import { listSaves, loadGame as loadGameFromDisk, saveGame as persistGame, deleteGame as deleteGameFromDisk, type SaveIndexEntry } from "./saveSlots";

function clone<T>(value: T): T {
  return structuredClone(value);
}

interface GameStoreState {
  game: GameState | null;
  saves: SaveIndexEntry[];
  refreshSaves: () => void;
  startNewGame: (industryId: string, saveName: string, params: NewCompanyParams) => void;
  loadGame: (saveId: string) => void;
  saveCurrentGame: () => void;
  deleteSave: (saveId: string) => void;
  exitToMenu: () => void;
  advanceWeek: () => void;
  setProductPrice: (productId: string, price: number) => void;
  addProduct: (productTemplateId: string) => void;
  setProductCapacityAllocation: (productId: string, pct: number) => void;
  discontinueProduct: (productId: string) => void;
  addSupplier: (supplierTemplateId: string) => void;
  setSupplierAllocation: (supplierId: string, pct: number) => void;
  removeSupplier: (supplierId: string) => void;
  setFounderAllocation: (allocation: { production: number; purchasing: number; sales: number; accounting: number }) => void;
  postJobOpening: (roleId: string, salaryMin: number, salaryMax: number) => void;
  askInterviewQuestion: (openingId: string, candidateId: string, questionId: string) => void;
  runReferenceCheck: (openingId: string, candidateId: string) => void;
  hireCandidate: (openingId: string, candidateId: string, salaryWeekly: number, facilityId?: string) => void;
  closeOpening: (openingId: string) => void;
  fireEmployee: (employeeId: string) => void;
  giveRaise: (employeeId: string, newSalaryWeekly: number) => void;
  promoteEmployee: (employeeId: string, managerRoleId: string) => void;
  reassignManager: (employeeId: string, managerId: string | null) => void;
  openFacility: (facilityTemplateId: string, locationId: string) => void;
  setDelegationAuthority: (domain: "purchasing" | "hiring", authority: AuthorityLevel, thresholdAmount: number) => void;
  approveManagerDecision: (decisionId: string) => void;
  rejectManagerDecision: (decisionId: string) => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  game: null,
  saves: listSaves(),

  refreshSaves: () => set({ saves: listSaves() }),

  startNewGame: (industryId, saveName, params) => {
    const game = createNewGame(industryId, saveName, params);
    persistGame(game);
    set({ game, saves: listSaves() });
  },

  loadGame: (saveId) => {
    const game = loadGameFromDisk(saveId);
    if (game) set({ game });
  },

  saveCurrentGame: () => {
    const { game } = get();
    if (!game) return;
    persistGame(game);
    set({ saves: listSaves() });
  },

  deleteSave: (saveId) => {
    deleteGameFromDisk(saveId);
    set({ saves: listSaves() });
  },

  exitToMenu: () => set({ game: null }),

  advanceWeek: () => {
    const { game } = get();
    if (!game) return;
    const next = advanceWeekEngine(clone(game));
    persistGame(next);
    set({ game: next, saves: listSaves() });
  },

  setProductPrice: (productId, price) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const product = next.company.products.find((p) => p.id === productId);
    if (product) product.priceWeekly = Math.max(0.01, price);
    set({ game: next });
  },

  addProduct: (productTemplateId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const industry = getIndustryDefinition(next.company.industryId);
    if (!industry) return;
    if (!addProductToCompany(next.company, industry, productTemplateId, next.week, next.currentDate, next.rng)) return;
    set({ game: next });
  },

  setProductCapacityAllocation: (productId, pct) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const product = next.company.products.find((p) => p.id === productId);
    if (product) product.capacityAllocationPct = Math.max(0, Math.min(1, pct));
    set({ game: next });
  },

  discontinueProduct: (productId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    if (!discontinueProductOnCompany(next.company, productId, next.week, next.currentDate)) return;
    set({ game: next });
  },

  addSupplier: (supplierTemplateId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const industry = getIndustryDefinition(next.company.industryId);
    if (!industry) return;
    if (!addSupplierToCompany(next.company, industry, supplierTemplateId, next.week, next.currentDate)) return;
    set({ game: next });
  },

  setSupplierAllocation: (supplierId, pct) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const supplier = next.company.suppliers.find((s) => s.id === supplierId);
    if (supplier) supplier.purchaseAllocationPct = Math.max(0, Math.min(1, pct));
    set({ game: next });
  },

  removeSupplier: (supplierId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    if (!removeSupplierFromCompany(next.company, supplierId, next.week, next.currentDate)) return;
    set({ game: next });
  },

  setFounderAllocation: (allocation) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    next.company.founderAllocation = allocation;
    set({ game: next });
  },

  postJobOpening: (roleId, salaryMin, salaryMax) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const industry = getIndustryDefinition(next.company.industryId);
    const role = industry?.employeeRoles.find((r) => r.id === roleId);
    if (!industry || !role) return;
    const candidates = generateApplicantPool(role, next.rng, next.week, 4);
    next.company.openPositions.push({
      id: `opening-${next.week}-${roleId}-${Math.round(Math.random() * 1e6)}`,
      roleId,
      title: role.title,
      department: role.department,
      salaryRangeMin: salaryMin,
      salaryRangeMax: salaryMax,
      postedWeek: next.week,
      status: "open",
      candidates,
    });
    next.company.entries.push(
      makeEntry({
        week: next.week,
        date: next.currentDate,
        memo: `Posted opening: ${role.title}`,
        source: "recruiting",
        lines: [dr("recruiting-expense", 150), cr("cash", 150)],
        cashFlowCategory: "operating",
      }),
    );
    set({ game: next });
  },

  askInterviewQuestion: (openingId, candidateId, questionId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const opening = next.company.openPositions.find((o) => o.id === openingId);
    const candidate = opening?.candidates.find((c) => c.id === candidateId);
    const question = INTERVIEW_QUESTION_BANK.find((q) => q.id === questionId);
    if (!candidate || !question) return;
    candidate.interviewNotes[questionId] = answerInterviewQuestionEngine(candidate, question, next.rng);
    set({ game: next });
  },

  runReferenceCheck: (openingId, candidateId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const opening = next.company.openPositions.find((o) => o.id === openingId);
    const candidate = opening?.candidates.find((c) => c.id === candidateId);
    if (!candidate) return;
    candidate.referenceCheckNote = generateReferenceCheckNote(candidate, next.rng);
    set({ game: next });
  },

  hireCandidate: (openingId, candidateId, salaryWeekly, facilityId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const opening = next.company.openPositions.find((o) => o.id === openingId);
    const candidate = opening?.candidates.find((c) => c.id === candidateId);
    if (!opening || !candidate) return;

    const facilityBound = opening.roleId === "production-worker" || opening.roleId === "machine-operator";

    const employee: Employee = {
      id: `emp-${next.week}-${Math.round(Math.random() * 1e6)}`,
      name: candidate.name,
      age: candidate.age,
      location: candidate.location,
      roleId: candidate.roleId,
      title: opening.title,
      department: opening.department,
      hireWeek: next.week,
      salaryWeekly,
      managerId: null,
      facilityId: facilityBound ? (facilityId ?? next.company.facilities[0]?.id ?? null) : null,
      traits: candidate.traits,
      education: candidate.education,
      priorEmployers: candidate.priorEmployers,
      status: "active",
      morale: 62,
      fatigue: 15,
      performanceHistory: [],
      cumulativeErrors: 0,
      cumulativeTasksCompleted: 0,
      lastRaiseWeek: null,
      onPip: false,
    };

    // An existing manager over this department automatically picks up the new hire as a direct report.
    if (opening.department !== "management") {
      const manager = next.company.employees.find(
        (e) =>
          e.status === "active" &&
          e.department === "management" &&
          getIndustryDefinition(next.company.industryId)?.employeeRoles.find((r) => r.id === e.roleId)?.managesDepartment === opening.department,
      );
      if (manager) employee.managerId = manager.id;
    }

    next.company.employees.push(employee);
    opening.status = "filled";
    opening.filledByEmployeeId = employee.id;
    next.company.historyLog.push({
      week: next.week,
      date: next.currentDate,
      headline: `Hired ${employee.name} as ${employee.title}`,
      category: "hiring",
    });
    set({ game: next });
  },

  closeOpening: (openingId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const opening = next.company.openPositions.find((o) => o.id === openingId);
    if (opening) opening.status = "closed";
    set({ game: next });
  },

  fireEmployee: (employeeId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const employee = next.company.employees.find((e) => e.id === employeeId);
    if (!employee) return;
    employee.status = "terminated";
    next.company.historyLog.push({
      week: next.week,
      date: next.currentDate,
      headline: `${employee.name} (${employee.title}) let go`,
      category: "hiring",
    });
    set({ game: next });
  },

  giveRaise: (employeeId, newSalaryWeekly) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const employee = next.company.employees.find((e) => e.id === employeeId);
    if (!employee) return;
    employee.salaryWeekly = Math.max(0, newSalaryWeekly);
    employee.lastRaiseWeek = next.week;
    set({ game: next });
  },

  promoteEmployee: (employeeId, managerRoleId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const industry = getIndustryDefinition(next.company.industryId);
    const managerRole = industry?.employeeRoles.find((r) => r.id === managerRoleId);
    if (!industry || !managerRole) return;
    if (!promoteEmployeeToManager(next.company, employeeId, managerRole, next.week, next.currentDate)) return;
    set({ game: next });
  },

  reassignManager: (employeeId, managerId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const employee = next.company.employees.find((e) => e.id === employeeId);
    if (!employee) return;
    if (managerId && !next.company.employees.some((e) => e.id === managerId && e.status === "active" && e.department === "management")) return;
    employee.managerId = managerId;
    set({ game: next });
  },

  openFacility: (facilityTemplateId, locationId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const industry = getIndustryDefinition(next.company.industryId);
    if (!industry) return;
    const result = openFacilityForCompany(next.company, industry, facilityTemplateId, locationId, next.week, next.currentDate);
    if (!result.ok) return;
    next.company.entries.push(...result.entries);
    set({ game: next });
  },

  setDelegationAuthority: (domain, authority, thresholdAmount) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    next.company.delegation[domain] = { authority, thresholdAmount: Math.max(0, thresholdAmount) };
    set({ game: next });
  },

  approveManagerDecision: (decisionId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    if (!approveManagerDecisionEngine(next.company, decisionId, next.week, next.currentDate)) return;
    set({ game: next });
  },

  rejectManagerDecision: (decisionId) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    if (!rejectManagerDecisionEngine(next.company, decisionId)) return;
    set({ game: next });
  },
}));
