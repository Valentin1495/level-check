const MIN_ELO = 600;
const MAX_ELO = 2400;
const BASE_ELO = 1200;
const ELO_SPREAD = 800;

export const USER_K = 24;

export const SUBJECT_OPTIONS = [
  { key: 'korean', label: '국어' },
  { key: 'english', label: '영어' },
  { key: 'science', label: '과학' },
  { key: 'social', label: '사회' },
  { key: 'logic', label: '논리' },
] as const;

export type SubjectKey = (typeof SUBJECT_OPTIONS)[number]['key'];

export const EDU_LEVEL_STEPS = [
  { key: 'elem_low', label: '초등 저학년' },
  { key: 'elem_high', label: '초등 고학년' },
  { key: 'middle', label: '중등' },
  { key: 'high', label: '고등' },
  { key: 'college_basic', label: '대학 교양' },
  { key: 'college_plus', label: '대학 심화' },
] as const;

export type EducationLevelKey = (typeof EDU_LEVEL_STEPS)[number]['key'];

export const QUESTIONS_PER_LEVEL: Record<EducationLevelKey, number> = {
  elem_low: 2,
  elem_high: 2,
  middle: 3,
  high: 3,
  college_basic: 3,
  college_plus: 3,
};

export const ALLOWED_MISSES_PER_LEVEL: Record<EducationLevelKey, number> = {
  elem_low: 1,
  elem_high: 1,
  middle: 1,
  high: 1,
  college_basic: 0,
  college_plus: 0,
};

const EDUCATION_LEVEL_ELO: Record<EducationLevelKey, number> = {
  elem_low: 800,
  elem_high: 1000,
  middle: 1200,
  high: 1400,
  college_basic: 1600,
  college_plus: 1800,
};

const EDUCATION_LEVEL_PERCENTILE_FLOOR: Partial<Record<EducationLevelKey, number>> = {
  elem_high: 80,
  middle: 60,
  high: 40,
  college_basic: 25,
  college_plus: 12,
};

export type AssessmentStageResult = {
  eduLevel: EducationLevelKey;
  answered: number;
  correct: number;
  failed?: boolean;
};

export type AssessmentResult = {
  finalElo: number;
  topPercent: number;
  accuracy: number;
  answered: number;
  correct: number;
};

const clampElo = (value: number) => {
  return Math.max(MIN_ELO, Math.min(MAX_ELO, Math.round(value)));
};

const expectedScore = (userElo: number, questionElo: number) => {
  return 1 / (1 + Math.pow(10, (questionElo - userElo) / 400));
};

const projectElo = (current: number, opponent: number, result: 1 | 0, k: number) => {
  const expectation = expectedScore(current, opponent);
  const next = current + k * (result - expectation);
  return clampElo(next);
};

const mapEloToPercentile = (elo: number) => {
  const probability = 1 / (1 + Math.exp(-(elo - BASE_ELO) / 200));
  return Math.max(0, Math.min(100, Math.round((1 - probability) * 100)));
};

const getPreviousEducationLevel = (levelKey: EducationLevelKey): EducationLevelKey | null => {
  const currentIndex = EDU_LEVEL_STEPS.findIndex((step) => step.key === levelKey);
  if (currentIndex <= 0) return null;
  return EDU_LEVEL_STEPS[currentIndex - 1]?.key ?? null;
};

const getAssessmentPercentileFloor = (stageResults: AssessmentStageResult[]) => {
  const failedStage = stageResults.find((stage) => stage.failed);
  if (!failedStage) return null;

  const floorLevel = getPreviousEducationLevel(failedStage.eduLevel);
  if (!floorLevel) return null;

  return EDUCATION_LEVEL_PERCENTILE_FLOOR[floorLevel] ?? null;
};

export const calculateAssessmentResult = (
  stageResults: AssessmentStageResult[],
  options?: { initialElo?: number; k?: number }
): AssessmentResult => {
  const initialElo = options?.initialElo ?? BASE_ELO;
  const k = options?.k ?? USER_K;

  let currentElo = clampElo(initialElo);
  let answered = 0;
  let correct = 0;

  stageResults.forEach((stage) => {
    const questionElo = EDUCATION_LEVEL_ELO[stage.eduLevel] ?? BASE_ELO;
    const safeAnswered = Math.max(0, stage.answered);
    const safeCorrect = Math.max(0, Math.min(stage.correct, safeAnswered));
    const incorrect = safeAnswered - safeCorrect;

    answered += safeAnswered;
    correct += safeCorrect;

    for (let i = 0; i < safeCorrect; i += 1) {
      currentElo = projectElo(currentElo, questionElo, 1, k);
    }

    for (let i = 0; i < incorrect; i += 1) {
      currentElo = projectElo(currentElo, questionElo, 0, k);
    }
  });

  const finalElo = answered > 0 ? currentElo : BASE_ELO;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const rawTopPercent = mapEloToPercentile(finalElo);
  const percentileFloor = getAssessmentPercentileFloor(stageResults);
  const topPercent = percentileFloor === null ? rawTopPercent : Math.min(rawTopPercent, percentileFloor);

  return {
    finalElo,
    topPercent,
    accuracy,
    answered,
    correct,
  };
};

export const getLevelQuestionCount = (level: EducationLevelKey) => {
  return QUESTIONS_PER_LEVEL[level] ?? 3;
};

export const getLevelAllowedMisses = (level: EducationLevelKey) => {
  return ALLOWED_MISSES_PER_LEVEL[level] ?? 1;
};

export const normalizeSubjectKey = (value: string): SubjectKey | null => {
  return SUBJECT_OPTIONS.find((subject) => subject.key === value)?.key ?? null;
};

export const mapDifficultyToElo = (difficulty: number | null | undefined) => {
  if (difficulty === null || difficulty === undefined) {
    return BASE_ELO;
  }
  return clampElo(BASE_ELO + (difficulty - 0.5) * ELO_SPREAD);
};
