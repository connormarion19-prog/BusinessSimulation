export type Department = "production" | "purchasing" | "sales" | "accounting" | "management" | "quality" | "maintenance" | "administration";

/**
 * The five buckets weekly working capacity is allocated across — orthogonal to `Department`
 * (which is org-chart/reporting-line membership). A specialist's capacity is concentrated in
 * one function; a generalist's is deliberately spread across several. See engine/workload.ts.
 */
export type WorkFunction = "accounting" | "purchasing" | "sales" | "operations" | "administration";

export interface EmployeeRoleTemplate {
  id: string;
  title: string;
  department: Department;
  tier: number; // 1 = individual contributor, higher = more senior/managerial
  salaryRange: [number, number]; // annual
  description: string;
  /** What delegating this role frees the founder (or a manager) from doing personally. */
  delegates: string;
  /** For tier-2+ roles: which operational department this manager oversees (their own `department` is usually "management"). */
  managesDepartment?: Department;
  /** Generalists spread capacity and capability broadly; specialists concentrate both. Purely informational/UI framing — functionAffinity is what actually drives the math. */
  roleClass: "generalist" | "specialist";
  /** 0-1.3ish multiplier applied to this role's trait-derived skill in each function — a specialist is high in one, low elsewhere; a generalist is moderate everywhere. */
  functionAffinity: Record<WorkFunction, number>;
  /** Starting weekly-capacity allocation (percent, should sum to ~100) a new hire in this role is given by default; the player can rebalance it afterward. */
  defaultAllocation: Record<WorkFunction, number>;
}

/**
 * Hidden performance-driving traits, 0-100. Never shown to the player directly —
 * only inferred through resumes, interview answers, and observed weekly output.
 */
export interface EmployeeTraits {
  technicalAbility: number;
  reliability: number;
  attentionToDetail: number;
  communication: number;
  initiative: number;
  judgment: number;
  leadership: number;
  learningAbility: number;
  adaptability: number;
  organization: number;
}

export interface EmployeeEducation {
  degree: string;
  field: string;
  school: string;
}

export interface PriorEmployer {
  company: string;
  title: string;
  years: number;
  note?: string;
}

export type EmployeeStatus = "active" | "on-leave" | "terminated" | "resigned";

export interface WeeklyEvaluation {
  week: number;
  employeeId: string;
  narrative: string;
  tone: "strong" | "solid" | "mixed" | "concerning";
  metrics: Record<string, number>;
  errors: number;
  managerNote?: string;
}

export interface Employee {
  id: string;
  name: string;
  age: number;
  location: string;
  roleId: string;
  title: string;
  department: Department;
  hireWeek: number;
  salaryWeekly: number;
  managerId: string | null; // null = reports directly to founder
  /** Which facility this employee physically works at. Only meaningful for facility-bound roles (production-worker, machine-operator); null for company-wide roles. */
  facilityId: string | null;
  /** Weekly working-capacity allocation across functions, in percent. A specialist's is concentrated in one function by default; a generalist's spans several. Sums over 100 are allowed but penalized — see engine/workload.ts. */
  allocation: Record<WorkFunction, number>;
  traits: EmployeeTraits;
  education: EmployeeEducation;
  priorEmployers: PriorEmployer[];
  status: EmployeeStatus;
  morale: number; // 0-100
  fatigue: number; // 0-100, resets partially each week
  performanceHistory: WeeklyEvaluation[];
  cumulativeErrors: number;
  cumulativeTasksCompleted: number;
  lastRaiseWeek: number | null;
  resignationRiskNote?: string;
  onPip: boolean;
}

export interface Candidate {
  id: string;
  name: string;
  age: number;
  location: string;
  roleId: string;
  askingSalaryWeekly: number;
  education: EmployeeEducation;
  priorEmployers: PriorEmployer[];
  resumeSummary: string;
  traits: EmployeeTraits; // hidden ground truth
  interviewNotes: Record<string, string>; // questionId -> impression text, imperfect signal of traits
  referenceCheckNote?: string;
  availableFromWeek: number;
  appliedWeek: number;
}

export interface JobOpening {
  id: string;
  roleId: string;
  title: string;
  department: Department;
  salaryRangeMin: number;
  salaryRangeMax: number;
  postedWeek: number;
  status: "open" | "filled" | "closed";
  candidates: Candidate[];
  filledByEmployeeId?: string;
}

export interface InterviewQuestion {
  id: string;
  prompt: string;
  assesses: keyof EmployeeTraits;
}

export interface FounderAllocation {
  production: number;
  purchasing: number;
  sales: number;
  accounting: number;
  /** Time spent on strategy/hiring/financing/expansion — not directly operational, but real: time here is time not spent personally covering a function. */
  administration: number;
}
