import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdoClient, segment } from '../server/ado/client';

const fakeAuth = () => ({
  getAuthHeader: vi.fn(async () => ({ Authorization: 'Bearer test-token' })),
  clearToken: vi.fn(),
});

function stubFetch(...responses: Response[]) {
  const fetch = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(
    async () => responses.shift() ?? Response.json({}),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.useRealTimers());

describe('ADO client', () => {
  it('sends the token only to dev.azure.com, even for a hostile path', async () => {
    const fetch = stubFetch();
    const ado = createAdoClient('sample-org', fakeAuth());
    await ado.json('https://outside.invalid/steal');
    await ado.json('//outside.invalid/steal');
    for (const [url] of fetch.mock.calls) {
      expect(url.origin).toBe('https://dev.azure.com');
      expect(url.pathname.startsWith('/sample-org/')).toBe(true);
    }
  });

  it('does not follow redirects, so the token is never forwarded', async () => {
    const fetch = stubFetch(
      new Response(null, { status: 302, headers: { location: 'https://outside.invalid/' } }),
    );
    const ado = createAdoClient('sample-org', fakeAuth());
    await expect(ado.json('_apis/projects')).rejects.toMatchObject({ body: { code: 'UPSTREAM' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.redirect).toBe('manual');
  });

  it.each([
    [401, 'AUTH_REQUIRED'],
    [203, 'AUTH_REQUIRED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [500, 'UPSTREAM'],
  ])('maps HTTP %i to %s with a safe message', async (status, code) => {
    stubFetch(new Response('TF400813: secret upstream detail', { status }));
    const auth = fakeAuth();
    const error = await createAdoClient('sample-org', auth)
      .json('_apis/projects')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ body: { code } });
    expect(JSON.stringify(error)).not.toContain('TF400813');
    expect(auth.clearToken).toHaveBeenCalledTimes(code === 'AUTH_REQUIRED' ? 1 : 0);
  });

  it('reports a network failure without echoing it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.1')),
    );
    const error = await createAdoClient('sample-org', fakeAuth())
      .json('_apis/projects')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ body: { code: 'NETWORK' } });
    expect(JSON.stringify(error)).not.toContain('ECONNREFUSED');
  });

  it('returns RATE_LIMITED with the server delay', async () => {
    stubFetch(new Response(null, { status: 429, headers: { 'retry-after': '7' } }));
    await expect(createAdoClient('sample-org', fakeAuth()).json('x')).rejects.toMatchObject({
      body: { code: 'RATE_LIMITED', retryAfterMs: 7000 },
    });
  });

  it('honors Retry-After from a successful response before the next request', async () => {
    vi.useFakeTimers();
    const fetch = stubFetch(Response.json({}, { headers: { 'retry-after': '3' } }));
    const ado = createAdoClient('sample-org', fakeAuth());
    await ado.json('first');
    const second = ado.json('second');
    await vi.advanceTimersByTimeAsync(2900);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await second;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects dot segments that would move the URL out of the organization', () => {
    expect(segment('team one')).toBe('team%20one');
    expect(() => segment('..')).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ code: 'VALIDATION' }) }),
    );
    expect(() => segment('.')).toThrow();
  });

  it('fails fast instead of hanging when the server asks for a long wait', async () => {
    const fetch = stubFetch(Response.json({}, { headers: { 'retry-after': '60' } }));
    const ado = createAdoClient('sample-org', fakeAuth());
    await ado.json('first');
    const error = await ado.json('second').catch((e: unknown) => e);
    expect(error).toMatchObject({ body: { code: 'RATE_LIMITED' } });
    expect((error as { body: { retryAfterMs: number } }).body.retryAfterMs).toBeGreaterThan(55_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
