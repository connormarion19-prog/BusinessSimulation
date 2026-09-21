export type Department = "production" | "purchasing" | "sales" | "accounting" | "management" | "quality" | "maintenance";

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
}
