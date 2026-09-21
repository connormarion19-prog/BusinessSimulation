import type { Candidate, EmployeeEducation, EmployeeRoleTemplate, EmployeeTraits, InterviewQuestion, PriorEmployer } from "../types/employee";
import type { RngState } from "./rng";
import { nextFloat, nextInt, nextNormal, pick, weightedPick } from "./rng";
import { CITIES, FIELDS_BUSINESS, FIELDS_GENERAL, FIELDS_TECHNICAL, FIRST_NAMES, LAST_NAMES, PRIOR_EMPLOYERS, SCHOOLS } from "../data/names";

let candidateCounter = 0;
function nextCandidateId(): string {
  candidateCounter += 1;
  return `cand-${candidateCounter}`;
}

function clampTrait(n: number): number {
  return Math.round(Math.max(5, Math.min(98, n)));
}

function randomTraits(rng: RngState, mean: number, spread: number): EmployeeTraits {
  return {
    technicalAbility: clampTrait(nextNormal(rng, mean, spread)),
    reliability: clampTrait(nextNormal(rng, mean, spread)),
    attentionToDetail: clampTrait(nextNormal(rng, mean, spread)),
    communication: clampTrait(nextNormal(rng, mean, spread)),
    initiative: clampTrait(nextNormal(rng, mean, spread)),
    judgment: clampTrait(nextNormal(rng, mean, spread)),
    leadership: clampTrait(nextNormal(rng, mean, spread)),
    learningAbility: clampTrait(nextNormal(rng, mean, spread)),
    adaptability: clampTrait(nextNormal(rng, mean, spread)),
    organization: clampTrait(nextNormal(rng, mean, spread)),
  };
}

function educationForRole(rng: RngState, role: EmployeeRoleTemplate): EmployeeEducation {
  const isTechnical = role.department === "production" || role.department === "maintenance" || role.department === "quality";
  const isBusiness = role.department === "accounting" || role.department === "sales" || role.department === "purchasing" || role.department === "management";
  const degree = role.tier >= 2
    ? pick(rng, ["Bachelor's Degree", "Master's Degree"] as const)
    : weightedPick(rng, [
        ["High School Diploma", 3],
        ["Associate's Degree", 4],
        ["Bachelor's Degree", 3],
      ] as const);
  const field = isTechnical
    ? pick(rng, FIELDS_TECHNICAL)
    : isBusiness
      ? pick(rng, FIELDS_BUSINESS)
      : pick(rng, FIELDS_GENERAL);
  return { degree, field, school: pick(rng, SCHOOLS) };
}

function priorEmployersFor(rng: RngState, count: number): PriorEmployer[] {
  const out: PriorEmployer[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      company: pick(rng, PRIOR_EMPLOYERS),
      title: "Prior role",
      years: nextInt(rng, 1, 6),
    });
  }
  return out;
}

function resumeSummaryFor(traits: EmployeeTraits, education: EmployeeEducation, employers: PriorEmployer[], role: EmployeeRoleTemplate): string {
  const years = employers.reduce((s, e) => s + e.years, 0);
  const strongest = Object.entries(traits).sort((a, b) => b[1] - a[1])[0][0];
  const strongestLabel: Record<string, string> = {
    technicalAbility: "hands-on technical skill",
    reliability: "a dependable attendance record",
    attentionToDetail: "careful, detail-oriented work",
    communication: "clear written and verbal communication",
    initiative: "a habit of taking initiative without being asked",
    judgment: "sound judgment under pressure",
    leadership: "informal leadership experience",
    learningAbility: "picking up new systems quickly",
    adaptability: "adapting well to changing priorities",
    organization: "strong personal organization",
  };
  const employerLine = employers.length
    ? `Previously worked ${years} year${years === 1 ? "" : "s"} across ${employers.map((e) => e.company).join(", ")}.`
    : "No directly relevant prior employer listed.";
  const educationLine = education.degree === "High School Diploma"
    ? `${education.degree} from ${education.school}.`
    : `${education.degree} in ${education.field} from ${education.school}.`;
  return `${educationLine} ${employerLine} Cover letter emphasizes ${strongestLabel[strongest]}, applying for ${role.title}.`;
}

export function generateCandidateForRole(role: EmployeeRoleTemplate, rng: RngState, week: number): Candidate {
  const isTechnicalRole = role.department === "production" || role.department === "maintenance" || role.department === "quality";
  const traitMean = 40 + role.tier * 8 + nextFloat(rng) * 15;
  const traits = randomTraits(rng, traitMean, 16);
  if (isTechnicalRole) traits.technicalAbility = clampTrait(traits.technicalAbility + 10);
  if (role.department === "sales") traits.communication = clampTrait(traits.communication + 10);
  if (role.department === "accounting") traits.attentionToDetail = clampTrait(traits.attentionToDetail + 10);
  if (role.department === "management") traits.leadership = clampTrait(traits.leadership + 12);

  const education = educationForRole(rng, role);
  const employers = priorEmployersFor(rng, nextInt(rng, 0, 3));
  const [minSalary, maxSalary] = role.salaryRange;
  const experienceFactor = Math.min(1, employers.reduce((s, e) => s + e.years, 0) / 10);
  const askingAnnual = Math.round((minSalary + (maxSalary - minSalary) * (0.3 + experienceFactor * 0.6)) / 100) * 100;

  return {
    id: nextCandidateId(),
    name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    age: nextInt(rng, 20, 60),
    location: pick(rng, CITIES),
    roleId: role.id,
    askingSalaryWeekly: Math.round((askingAnnual / 52) * 100) / 100,
    education,
    priorEmployers: employers,
    resumeSummary: resumeSummaryFor(traits, education, employers, role),
    traits,
    interviewNotes: {},
    availableFromWeek: week + nextInt(rng, 1, 3),
    appliedWeek: week,
  };
}

export function generateApplicantPool(role: EmployeeRoleTemplate, rng: RngState, week: number, count = 4): Candidate[] {
  return Array.from({ length: count }, () => generateCandidateForRole(role, rng, week));
}

export const INTERVIEW_QUESTION_BANK: InterviewQuestion[] = [
  { id: "q-priority", prompt: "Walk me through how you'd prioritize when three things go wrong at once.", assesses: "judgment" },
  { id: "q-mistake", prompt: "Tell me about a time you caught your own mistake before anyone else noticed.", assesses: "attentionToDetail" },
  { id: "q-conflict", prompt: "How would you handle a coworker who isn't pulling their weight?", assesses: "communication" },
  { id: "q-new-system", prompt: "How do you approach learning a new system or process you've never used?", assesses: "learningAbility" },
  { id: "q-initiative", prompt: "Describe something you improved at a past job without being asked to.", assesses: "initiative" },
  { id: "q-reliability", prompt: "What does your attendance and punctuality record actually look like?", assesses: "reliability" },
  { id: "q-change", prompt: "Tell me about a time priorities changed on you midway through a shift or project.", assesses: "adaptability" },
  { id: "q-lead", prompt: "Have you ever informally ended up leading a group of coworkers? What happened?", assesses: "leadership" },
  { id: "q-organize", prompt: "How do you keep track of multiple ongoing tasks so nothing falls through the cracks?", assesses: "organization" },
  { id: "q-technical", prompt: "Walk me through the most technically demanding part of your last job.", assesses: "technicalAbility" },
];

/**
 * Produces a noisy, textual impression of the candidate's true trait — accurate on
 * average, but skewed by their communication skill (charisma can inflate a weak
 * answer) and by ordinary interview randomness, exactly the "interviews well but
 * isn't necessarily great" gap the design calls for.
 */
export function answerInterviewQuestion(candidate: Candidate, question: InterviewQuestion, rng: RngState): string {
  const trueValue = candidate.traits[question.assesses];
  const charismaSkew = (candidate.traits.communication - 50) * 0.15;
  const noise = nextNormal(rng, 0, 14);
  const perceived = Math.max(0, Math.min(100, trueValue + charismaSkew + noise));

  let tier: "poor" | "weak" | "solid" | "strong" | "exceptional";
  if (perceived < 25) tier = "poor";
  else if (perceived < 45) tier = "weak";
  else if (perceived < 65) tier = "solid";
  else if (perceived < 85) tier = "strong";
  else tier = "exceptional";

  const templates: Record<typeof tier, string[]> = {
    poor: [
      "Struggled to give a concrete example — answer stayed vague and generic.",
      "Answer suggested they haven't really thought about this before; some hesitation and backtracking.",
    ],
    weak: [
      "Gave an answer, but it was thin on specifics and didn't fully address the question.",
      "Answer was serviceable but unremarkable — no real evidence either way.",
    ],
    solid: [
      "Gave a reasonable, specific example that addressed the question directly.",
      "Competent answer — walked through a real situation with a sensible outcome.",
    ],
    strong: [
      "Gave a well-structured answer with a specific, credible example and a clear outcome.",
      "Answer stood out — thoughtful, specific, and self-aware about what they'd do differently.",
    ],
    exceptional: [
      "One of the strongest answers of the round — specific, reflective, and clearly grounded in real experience.",
      "Answer immediately built confidence — precise example, honest about tradeoffs, strong outcome.",
    ],
  };
  return pick(rng, templates[tier]);
}

export function generateReferenceCheckNote(candidate: Candidate, _rng: RngState): string {
  if (candidate.priorEmployers.length === 0) {
    return "No professional references available to check — candidate has no listed prior employer.";
  }
  const reliability = candidate.traits.reliability;
  const employer = candidate.priorEmployers[0].company;
  if (reliability > 70) {
    return `Reference at ${employer} confirmed strong attendance and said they'd rehire without hesitation.`;
  }
  if (reliability > 45) {
    return `Reference at ${employer} was measured — confirmed employment and dates, offered little unprompted detail.`;
  }
  return `Reference at ${employer} was hesitant, mentioned "some attendance issues toward the end" without elaborating.`;
}
