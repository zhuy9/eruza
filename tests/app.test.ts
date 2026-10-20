import { describe, expect, it, vi } from 'vitest';
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
    expect(() => readConfig({ PORT: 'invalid' })).toThrow('Check MOCK and PORT in local settings.');
  });
});
