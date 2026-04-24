import { calculateAssessmentResult, type AssessmentStageResult } from '../domain/assessment';

describe('calculateAssessmentResult', () => {
  it('aggregates answered/correct and returns accuracy', () => {
    const stages: AssessmentStageResult[] = [
      { eduLevel: 'elem_low', answered: 2, correct: 2 },
      { eduLevel: 'elem_high', answered: 2, correct: 1 },
      { eduLevel: 'middle', answered: 3, correct: 2 },
    ];

    const result = calculateAssessmentResult(stages);

    expect(result.answered).toBe(7);
    expect(result.correct).toBe(5);
    expect(result.accuracy).toBe(71);
  });

  it('applies percentile floor when a stage is failed', () => {
    const stages: AssessmentStageResult[] = [
      { eduLevel: 'elem_low', answered: 2, correct: 0 },
      { eduLevel: 'elem_high', answered: 2, correct: 0 },
      { eduLevel: 'middle', answered: 3, correct: 0, failed: true },
    ];

    const result = calculateAssessmentResult(stages, { k: 200 });

    expect(result.topPercent).toBe(80);
  });
});
