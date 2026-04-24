import { RUNTIME_CONFIG } from '../config/runtime';
import type { EducationLevelKey, SubjectKey } from '../domain/assessment';

export type AssessmentChoice = {
  id: string;
  text: string;
};

export type AssessmentQuestion = {
  id: string;
  prompt: string;
  hints: string[];
  fiftyFiftyEliminateIds: string[];
  explanation: string | null;
  difficulty: number;
  choices: AssessmentChoice[];
  correctChoiceId: string;
  correctChoiceIndex: number;
};

export type FetchAssessmentQuestionsParams = {
  category?: string;
  tags?: string[];
  deckSlug?: string;
  subject: SubjectKey;
  eduLevel: EducationLevelKey;
  excludeIds?: string[];
  limit?: number;
  cursor?: string | null;
  userHash?: string;
};

export type FetchAssessmentQuestionsResult = {
  items: AssessmentQuestion[];
  nextCursor: string | null;
  hasMore: boolean;
};

type FeedQuestionResponse = {
  id?: unknown;
  prompt?: unknown;
  hint?: unknown;
  hints?: unknown;
  explanation?: unknown;
  difficulty?: unknown;
  choices?: unknown;
  answer_index?: unknown;
  correctChoiceId?: unknown;
  correctChoiceIndex?: unknown;
  metadata?: unknown;
  media_meta?: unknown;
  lifeline_meta?: unknown;
};

const parseJsonValue = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const normalizeHintList = (...values: unknown[]) => {
  return values.flatMap((value) => {
    if (typeof value === 'string' && value.trim()) {
      return [value.trim()];
    }

    if (Array.isArray(value)) {
      return value
        .filter((hint): hint is string => typeof hint === 'string' && hint.trim().length > 0)
        .map((hint) => hint.trim());
    }

    return [];
  });
};

const normalizeStringList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const normalizeQuestion = (item: FeedQuestionResponse): AssessmentQuestion | null => {
  if (typeof item.id !== 'string' || typeof item.prompt !== 'string') {
    return null;
  }

  const rawChoicesValue = parseJsonValue(item.choices);
  const rawChoices = Array.isArray(rawChoicesValue) ? rawChoicesValue : [];
  const choices = rawChoices
    .map((choice): AssessmentChoice | null => {
      if (!choice || typeof choice !== 'object') return null;
      const value = choice as { id?: unknown; text?: unknown };
      if (typeof value.id !== 'string' || typeof value.text !== 'string') {
        return null;
      }
      return { id: value.id, text: value.text };
    })
    .filter((choice): choice is AssessmentChoice => choice !== null);

  if (choices.length < 2) {
    return null;
  }

  const indexFromPayload =
    typeof item.correctChoiceIndex === 'number' && Number.isFinite(item.correctChoiceIndex)
      ? item.correctChoiceIndex
      : typeof item.answer_index === 'number' && Number.isFinite(item.answer_index)
        ? item.answer_index
        : null;

  const idFromPayload = typeof item.correctChoiceId === 'string' ? item.correctChoiceId : null;

  const correctChoiceIndex =
    indexFromPayload !== null
      ? indexFromPayload
      : idFromPayload !== null
        ? choices.findIndex((choice) => choice.id === idFromPayload)
        : -1;

  if (correctChoiceIndex < 0 || correctChoiceIndex >= choices.length) {
    return null;
  }

  const correctChoiceId = choices[correctChoiceIndex]?.id;
  if (!correctChoiceId) {
    return null;
  }

  const metadataValue = parseJsonValue(item.metadata);
  const mediaMetaValue = parseJsonValue(item.media_meta);
  const lifelineMetaValue = parseJsonValue(item.lifeline_meta);
  const metadata =
    metadataValue && typeof metadataValue === 'object' ? metadataValue as { hint?: unknown; hints?: unknown } : null;
  const mediaMeta =
    mediaMetaValue && typeof mediaMetaValue === 'object' ? mediaMetaValue as { hint?: unknown; hints?: unknown } : null;
  const lifelineMeta =
    lifelineMetaValue && typeof lifelineMetaValue === 'object'
      ? lifelineMetaValue as { fifty_fifty?: { preferredEliminateIds?: unknown } }
      : null;

  return {
    id: item.id,
    prompt: item.prompt,
    hints: normalizeHintList(item.hint, item.hints, metadata?.hint, metadata?.hints, mediaMeta?.hint, mediaMeta?.hints),
    fiftyFiftyEliminateIds: normalizeStringList(lifelineMeta?.fifty_fifty?.preferredEliminateIds).filter(
      (choiceId) => choiceId !== correctChoiceId && choices.some((choice) => choice.id === choiceId)
    ),
    explanation: typeof item.explanation === 'string' ? item.explanation : null,
    difficulty: typeof item.difficulty === 'number' ? item.difficulty : 0.5,
    choices,
    correctChoiceId,
    correctChoiceIndex,
  };
};

const resolvePayload = (response: unknown) => {
  if (Array.isArray(response)) {
    return {
      items: response,
      nextCursor: null,
      hasMore: false,
    };
  }

  if (!response || typeof response !== 'object') {
    return null;
  }

  const value = response as {
    data?: {
      items?: unknown;
      nextCursor?: unknown;
      hasMore?: unknown;
    };
    items?: unknown;
    nextCursor?: unknown;
    hasMore?: unknown;
  };

  if (value.data && typeof value.data === 'object') {
    return {
      items: value.data.items,
      nextCursor: value.data.nextCursor,
      hasMore: value.data.hasMore,
    };
  }

  return {
    items: value.items,
    nextCursor: value.nextCursor,
    hasMore: value.hasMore,
  };
};

const parseFeedResponse = (json: unknown): FetchAssessmentQuestionsResult => {
  const payload = resolvePayload(json);

  if (!payload) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems
    .map((item) => normalizeQuestion(item as FeedQuestionResponse))
    .filter((item): item is AssessmentQuestion => item !== null);

  return {
    items,
    nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
    hasMore: payload.hasMore === true,
  };
};

const requestSwipeFeed = async (
  endpoint: string,
  anonKey: string,
  body: Record<string, unknown>
): Promise<FetchAssessmentQuestionsResult> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`swipe-feed request failed (${response.status}): ${message || 'unknown error'}`);
  }

  const json = (await response.json()) as unknown;
  return parseFeedResponse(json);
};

export async function fetchAssessmentQuestions(
  params: FetchAssessmentQuestionsParams
): Promise<FetchAssessmentQuestionsResult> {
  const endpoint = `${RUNTIME_CONFIG.supabaseUrl}${RUNTIME_CONFIG.swipeFeedPath}`;
  const baseBody = {
    category: params.category ?? RUNTIME_CONFIG.assessmentCategory,
    subject: params.subject,
    eduLevel: params.eduLevel,
    excludeIds: params.excludeIds ?? [],
    sessionSeed: params.userHash,
    recentIds: params.excludeIds?.slice(0, 80) ?? [],
    limit: params.limit ?? 8,
    cursor: params.cursor ?? null,
  };
  const strictBody = {
    ...baseBody,
    tags: params.tags ?? RUNTIME_CONFIG.assessmentTags,
    deckSlug: params.deckSlug ?? RUNTIME_CONFIG.assessmentDeckSlug,
  };

  const strictResult = await requestSwipeFeed(endpoint, RUNTIME_CONFIG.supabaseAnonKey, strictBody);
  if (strictResult.items.length > 0) {
    return strictResult;
  }

  // If strict defaults return no rows, retry once with relaxed filters.
  // This keeps current plan defaults but still works for decks that don't use mode/deckSlug tags.
  if (params.tags === undefined && params.deckSlug === undefined) {
    return requestSwipeFeed(endpoint, RUNTIME_CONFIG.supabaseAnonKey, baseBody);
  }

  return strictResult;
}
