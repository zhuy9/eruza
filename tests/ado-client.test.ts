import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdoClient, segment } from '../server/ado/client';
import { getImage } from '../server/ado/item';
import { getAvatar, getProjects } from '../server/ado/metadata';

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

  it.each(['headers', 'body'])(
    'times out a request stalled on its %s: unknown for writes, network for reads',
    async (phase) => {
      const timer = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timer.signal);
      const fetch = vi.fn(async (_url: URL, init?: RequestInit) => {
        const aborted = new Promise<never>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
        );
        if (phase === 'headers') return aborted;
        return new Response(
          new ReadableStream({ start: (c) => void aborted.catch((e: unknown) => c.error(e)) }),
        );
      });
      vi.stubGlobal('fetch', fetch);
      const ado = createAdoClient('sample-org', fakeAuth());
      const write = ado.json('x', { method: 'POST', write: true }).catch((e: unknown) => e);
      const guid = '00000000-0000-0000-0000-000000000001';
      ado.commentImages.add(`1/${guid}`);
      const reads = [
        ado.json('x'),
        getProjects(ado, ''),
        getAvatar(ado, 'sample-id'),
        getImage(ado, 1, guid),
      ].map((p) => p.catch((e: unknown) => e));
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
      expect(timeout).toHaveBeenCalledWith(30_000);
      timer.abort(new DOMException('synthetic timeout', 'TimeoutError'));
      expect(await write).toMatchObject({ body: { code: 'UNKNOWN_OUTCOME' } });
      for (const read of reads) expect(await read).toMatchObject({ body: { code: 'NETWORK' } });
    },
  );

  it('reports a malformed successful write response as unknown without retrying', async () => {
    const fetch = stubFetch(new Response('{broken', { status: 201 }));
    const ado = createAdoClient('sample-org', fakeAuth());
    await expect(ado.json('x', { method: 'POST', write: true })).rejects.toMatchObject({
      body: { code: 'UNKNOWN_OUTCOME' },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a failed successful-write body stream as unknown without exposing it', async () => {
    const fetch = stubFetch(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('synthetic body stream failure'));
          },
        }),
        { status: 201 },
      ),
    );
    const error = await createAdoClient('sample-org', fakeAuth())
      .json('x', { method: 'POST', write: true })
      .catch((error: unknown) => error);
    expect(error).toMatchObject({ body: { code: 'UNKNOWN_OUTCOME' } });
    expect(JSON.stringify(error)).not.toContain('synthetic body stream failure');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 404, 409, 429, 500])(
    'preserves classified HTTP %i errors for writes',
    async (status) => {
      const fetch = stubFetch(
        new Response('{broken', { status }),
        new Response('{broken', { status }),
      );
      const ado = createAdoClient('sample-org', fakeAuth());
      const readError = await ado.json('x').catch((error: unknown) => error);
      await expect(ado.json('x', { method: 'POST', write: true })).rejects.toEqual(readError);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('preserves JSON decoding errors for POST reads', async () => {
    const fetch = stubFetch(new Response('{broken'));
    await expect(
      createAdoClient('sample-org', fakeAuth()).json('x', { method: 'POST' }),
    ).rejects.toBeInstanceOf(SyntaxError);
    expect(fetch).toHaveBeenCalledTimes(1);
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

  it('rechecks a concurrent extension while a request is waiting', async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    const fetch = stubFetch();
    fetch.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    fetch.mockResolvedValueOnce(Response.json({}, { headers: { 'retry-after': '1' } }));
    const ado = createAdoClient('sample-org', fakeAuth());
    const inFlight = ado.json('slow');
    await vi.advanceTimersByTimeAsync(0);
    await ado.json('initial-limit');
    const queued = ado.json('queued');
    await vi.advanceTimersByTimeAsync(200);
    finish(Response.json({}, { headers: { 'retry-after': '2' } }));
    await inFlight;
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await queued;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not shorten a deadline when another response asks for less time', async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    const fetch = stubFetch();
    fetch.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    fetch.mockResolvedValueOnce(Response.json({}, { headers: { 'retry-after': '3' } }));
    const ado = createAdoClient('sample-org', fakeAuth());
    const inFlight = ado.json('slow');
    await vi.advanceTimersByTimeAsync(0);
    await ado.json('long-limit');
    await vi.advanceTimersByTimeAsync(200);
    finish(Response.json({}, { headers: { 'retry-after': '1' } }));
    await inFlight;
    const queued = ado.json('queued');
    await vi.advanceTimersByTimeAsync(2799);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await queued;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('checks the latest deadline after authentication finishes', async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    let signIn!: (header: { Authorization: string }) => void;
    const fetch = stubFetch();
    fetch.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const auth = fakeAuth();
    const ado = createAdoClient('sample-org', auth);
    const inFlight = ado.json('slow');
    await vi.advanceTimersByTimeAsync(0);
    auth.getAuthHeader.mockImplementationOnce(() => new Promise((resolve) => (signIn = resolve)));
    const queued = ado.json('queued');
    finish(Response.json({}, { headers: { 'retry-after': '1' } }));
    await inFlight;
    signIn({ Authorization: 'Bearer test-token' });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await queued;
    expect(fetch).toHaveBeenCalledTimes(2);
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
