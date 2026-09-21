import { create } from "zustand";
import type { GameState } from "../types/core";
import type { Employee } from "../types/employee";
import type { NewCompanyParams } from "../types/industry";
import { createNewGame } from "../engine/newGame";
import { advanceWeek as advanceWeekEngine } from "../engine/clock";
import { getIndustryDefinition } from "../industries/registry";
import { generateApplicantPool, answerInterviewQuestion as answerInterviewQuestionEngine, generateReferenceCheckNote, INTERVIEW_QUESTION_BANK } from "../engine/hiring";
import { makeEntry, dr, cr } from "../engine/ledger";
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
  setFounderAllocation: (allocation: { production: number; purchasing: number; sales: number; accounting: number }) => void;
  postJobOpening: (roleId: string, salaryMin: number, salaryMax: number) => void;
  askInterviewQuestion: (openingId: string, candidateId: string, questionId: string) => void;
  runReferenceCheck: (openingId: string, candidateId: string) => void;
  hireCandidate: (openingId: string, candidateId: string, salaryWeekly: number) => void;
  closeOpening: (openingId: string) => void;
  fireEmployee: (employeeId: string) => void;
  giveRaise: (employeeId: string, newSalaryWeekly: number) => void;
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

  hireCandidate: (openingId, candidateId, salaryWeekly) => {
    const { game } = get();
    if (!game) return;
    const next = clone(game);
    const opening = next.company.openPositions.find((o) => o.id === openingId);
    const candidate = opening?.candidates.find((c) => c.id === candidateId);
    if (!opening || !candidate) return;

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
}));
