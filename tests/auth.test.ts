import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '../server/auth';

const MINUTE = 60_000;
const token = (value: string, msLeft: number) => ({
  token: value,
  expiresOnTimestamp: Date.now() + msLeft,
});
const credential = (getToken: (...args: unknown[]) => unknown) => ({ getToken: vi.fn(getToken) });

describe('getAuthHeader', () => {
  it('reuses a token until it is within 60 seconds of expiry', async () => {
    const cred = credential(async () => token('first', 10 * MINUTE));
    const auth = createAuth(cred as never);
    expect(await auth.getAuthHeader()).toEqual({ Authorization: 'Bearer first' });
    await auth.getAuthHeader();
    expect(cred.getToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes when fewer than 60 seconds remain', async () => {
    const values = [token('old', 59_000), token('new', 10 * MINUTE)];
    const cred = credential(async () => values.shift());
    const auth = createAuth(cred as never);
    await auth.getAuthHeader();
    expect(await auth.getAuthHeader()).toEqual({ Authorization: 'Bearer new' });
    expect(cred.getToken).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight refresh across concurrent callers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const cred = credential(async () => {
      await gate;
      return token('shared', 10 * MINUTE);
    });
    const auth = createAuth(cred as never);
    const calls = Promise.all([auth.getAuthHeader(), auth.getAuthHeader(), auth.getAuthHeader()]);
    release();
    expect(new Set((await calls).map((h) => h.Authorization))).toEqual(new Set(['Bearer shared']));
    expect(cred.getToken).toHaveBeenCalledTimes(1);
  });

  it('reports a missing Azure CLI separately from a missing login', async () => {
    const missing = createAuth(
      credential(async () => {
        throw new Error('Azure CLI could not be found. Please visit https://aka.ms/azure-cli');
      }) as never,
    );
    await expect(missing.getAuthHeader()).rejects.toMatchObject({
      body: { code: 'CLI_UNAVAILABLE' },
    });
  });

  it.each([
    "Please run 'az login' from a command prompt to authenticate before using this credential.",
    'AADSTS700082: The refresh token has expired. Please run az login to setup account.',
  ])('asks for login when the CLI says: %s', async (message) => {
    const auth = createAuth(
      credential(async () => {
        throw new Error(message);
      }) as never,
    );
    const error = await auth.getAuthHeader().catch((e: unknown) => e);
    expect(error).toMatchObject({ body: { code: 'AUTH_REQUIRED' } });
    expect(JSON.stringify(error)).not.toContain('AADSTS');
  });

  it('tries again after a failed login without a restart', async () => {
    const cred = credential(async () => token('after-login', 10 * MINUTE));
    cred.getToken.mockRejectedValueOnce(new Error("Please run 'az login'"));
    const auth = createAuth(cred as never);
    await expect(auth.getAuthHeader()).rejects.toThrow();
    expect(await auth.getAuthHeader()).toEqual({ Authorization: 'Bearer after-login' });
  });
});
