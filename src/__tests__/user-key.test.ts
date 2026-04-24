import { resolveUserKey } from '../lib/user-key';

jest.mock('@apps-in-toss/framework', () => ({
  getAnonymousKey: jest.fn(),
}));

const { getAnonymousKey } = jest.requireMock('@apps-in-toss/framework') as {
  getAnonymousKey: jest.Mock;
};

describe('resolveUserKey', () => {
  beforeEach(() => {
    getAnonymousKey.mockReset();
  });

  it('returns hash key when getAnonymousKey succeeds', async () => {
    getAnonymousKey.mockResolvedValue({ type: 'HASH', hash: 'abc123hash' });

    const result = await resolveUserKey();

    expect(result).toEqual({ type: 'hash', value: 'abc123hash' });
  });

  it('falls back when getAnonymousKey returns ERROR', async () => {
    getAnonymousKey.mockResolvedValue('ERROR');

    const result = await resolveUserKey({
      now: () => 1700000000000,
      random: () => 0.12345,
    });

    expect(result.type).toBe('fallback');
    expect(result.value).toMatch(/^session_/);
  });

  it('falls back when getAnonymousKey throws', async () => {
    getAnonymousKey.mockRejectedValue(new Error('boom'));

    const result = await resolveUserKey({
      now: () => 1700000000100,
      random: () => 0.5,
    });

    expect(result.type).toBe('fallback');
    expect(result.value).toMatch(/^session_/);
  });
});
