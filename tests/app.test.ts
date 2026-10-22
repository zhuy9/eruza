import { describe, expect, it, vi } from 'vitest';
import { createAdoApi } from '../server/ado/api';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';

const config = readConfig({ MOCK: '1', PORT: '3001' });
const url = 'http://127.0.0.1:3001';

describe('local API boundary', () => {
  it('serves a mock session and projects without network access', async () => {
    const fetch = vi.fn(() => {
      throw new Error('Outbound access is forbidden');
    });
    vi.stubGlobal('fetch', fetch);
    const app = createApp(config);
    const session = await app.request(`${url}/api/session`);
    expect(await session.json()).toMatchObject({ mode: 'mock', status: 'connected' });
    const projects = await app.request(`${url}/api/projects`);
    expect(await projects.json()).toContainEqual(
      expect.objectContaining({ name: 'Sample project' }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an unapproved host even on reads', async () => {
    const app = createApp(config);
    const response = await app.request(`${url}/api/session`, {
      headers: { host: 'outside.invalid' },
    });
    expect(response.status).toBe(403);
  });

  it.each([
    ['cross-site', 403],
    ['same-site', 403],
    ['same-origin', 200],
    ['none', 200],
    [undefined, 200],
  ])('answers a read with fetch site %s with %i', async (site, status) => {
    const app = createApp(config);
    const response = await app.request(`${url}/api/session`, {
      headers: site ? { 'sec-fetch-site': site } : {},
    });
    expect(response.status).toBe(status);
  });

  it.each([undefined, 'http://outside.invalid', 'null'])(
    'rejects write origin %s',
    async (origin) => {
      const app = createApp(config);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (origin) headers.origin = origin;
      const response = await app.request(`${url}/api/session/retry`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      expect(response.status).toBe(403);
    },
  );

  it('requires JSON and validates the retry body', async () => {
    const app = createApp(config);
    for (const [contentType, body] of [
      ['text/plain', '{}'],
      ['application/json', '{'],
      ['application/json', '{"extra":1}'],
    ]) {
      const response = await app.request(`${url}/api/session/retry`, {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:5173', 'content-type': contentType },
        body,
      });
      expect(response.status).toBe(400);
    }
  });

  it('accepts a valid local retry', async () => {
    const app = createApp(config);
    const response = await app.request(`${url}/api/session/retry`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(200);
  });

  it('rejects invalid local settings without echoing their values', () => {
    expect(() => readConfig({ PORT: 'invalid' })).toThrow(
      'Check MOCK, PORT, and ADO_ORG in local settings.',
    );
  });
});

const retry = {
  method: 'POST',
  headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' },
  body: '{}',
};

describe('real mode session', () => {
  const real = readConfig({ MOCK: '0', ADO_ORG: 'sample-org', PORT: '3001' });

  it('stays available and shows the login command until the user signs in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ authenticatedUser: { id: 'user-1', providerDisplayName: 'Sample User' } }),
      ),
    );
    const getToken = vi
      .fn()
      .mockRejectedValue(new Error("Please run 'az login' to set up account."));
    const app = createApp(real, createAdoApi(real, { getToken }));

    const before = await (await app.request(`${url}/api/session`)).json();
    expect(before).toMatchObject({
      mode: 'ado',
      status: 'error',
      code: 'AUTH_REQUIRED',
      loginCommand: 'az login --allow-no-subscriptions',
    });
    const projects = await app.request(`${url}/api/projects`);
    expect(projects.status).toBe(401);
    expect(await projects.json()).toMatchObject({ code: 'AUTH_REQUIRED' });

    getToken.mockResolvedValue({ token: 'test-token', expiresOnTimestamp: Date.now() + 3_600_000 });
    const after = await (await app.request(`${url}/api/session/retry`, retry)).json();
    expect(after).toEqual({
      mode: 'ado',
      status: 'connected',
      user: { id: 'user-1', displayName: 'Sample User' },
    });
  });

  it('shows the login state again when ADO later rejects the sign-in', async () => {
    let status = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        status === 200
          ? Response.json({
              authenticatedUser: { id: 'user-1', providerDisplayName: 'Sample User' },
            })
          : new Response(null, { status }),
      ),
    );
    const getToken = vi
      .fn()
      .mockResolvedValue({ token: 'test-token', expiresOnTimestamp: Date.now() + 3_600_000 });
    const app = createApp(real, createAdoApi(real, { getToken }));
    const session = async () => (await app.request(`${url}/api/session`)).json();
    expect(await session()).toMatchObject({ status: 'connected' });

    status = 401;
    getToken.mockRejectedValue(new Error("Please run 'az login'"));
    expect((await app.request(`${url}/api/projects`)).status).toBe(401);
    expect(await session()).toMatchObject({ status: 'error', loginCommand: expect.any(String) });
  });

  it('rejects a dot segment before calling ADO', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const getToken = vi
      .fn()
      .mockResolvedValue({ token: 't', expiresOnTimestamp: Date.now() + 3_600_000 });
    const app = createApp(real, createAdoApi(real, { getToken }));
    // Path dot segments are normalized before routing; a query value reaches the ADO path as-is.
    const response = await app.request(`${url}/api/projects/p1/states?type=..`);
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires an organization name in real mode', () => {
    expect(() => readConfig({ MOCK: '0' })).toThrow('ADO_ORG');
    expect(() => readConfig({ MOCK: '0', ADO_ORG: 'https://dev.azure.com/x' })).toThrow('ADO_ORG');
  });
});

describe('mock reads', () => {
  const app = () => createApp(config);
  const get = async (path: string) => {
    const response = await app().request(`${url}/api${path}`);
    return { status: response.status, body: await response.json() };
  };

  it('serves team metadata and validates parameters', async () => {
    expect((await get('/projects/sample-project/teams')).body).toContainEqual(
      expect.objectContaining({ id: 'web-team', isDefault: true }),
    );
    expect((await get('/projects/unknown/teams')).status).toBe(404);
    expect((await get('/projects/sample-project/states')).status).toBe(400);
    expect((await get('/work-items?projectId=sample-project&teamId=web-team')).status).toBe(400);
  });

  it('returns sprint items with grouping ancestors and missing parents', async () => {
    const query = new URLSearchParams({
      projectId: 'sample-project',
      teamId: 'web-team',
      iteration: 'Sample project\\Sprint 3',
    });
    const { body } = await get(`/work-items?${query}`);
    const ids = body.items.map((item: { id: number }) => item.id);
    expect(ids).toContain(1004); // unassigned bug
    expect(ids).not.toContain(1100); // other team's area
    expect(body.ancestors.map((item: { id: number }) => item.id).sort()).toEqual([1010, 1050]);
    expect(body.missingIds).toEqual([9999]);
  });
});
