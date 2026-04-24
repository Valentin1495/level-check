import { getAnonymousKey } from '@apps-in-toss/framework';

export type ResolvedUserKey = {
  type: 'hash' | 'fallback';
  value: string;
};

type AnonymousKeyResult =
  | {
      type: 'HASH';
      hash: string;
    }
  | 'INVALID_CATEGORY'
  | 'ERROR'
  | undefined;

type ResolveUserKeyOptions = {
  getKey?: () => Promise<AnonymousKeyResult>;
  now?: () => number;
  random?: () => number;
};

const createFallbackKey = (now: number, random: number) => {
  const randomChunk = Math.floor(random * 1_000_000)
    .toString(36)
    .padStart(4, '0');
  return `session_${now.toString(36)}_${randomChunk}`;
};

export async function resolveUserKey(options?: ResolveUserKeyOptions): Promise<ResolvedUserKey> {
  const getKey = options?.getKey ?? getAnonymousKey;
  const now = options?.now ?? Date.now;
  const random = options?.random ?? Math.random;

  try {
    const result = await getKey();
    if (result && typeof result === 'object' && result.type === 'HASH' && typeof result.hash === 'string') {
      return {
        type: 'hash',
        value: result.hash,
      };
    }
  } catch {
    // Ignore and fallback to local session key.
  }

  return {
    type: 'fallback',
    value: createFallbackKey(now(), random()),
  };
}
