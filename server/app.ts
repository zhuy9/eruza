import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import type { Config } from './config';
import { createMockApi } from './mock/api';

export function createApp(config: Config) {
  if (!config.mock) throw new Error('Real ADO mode is not implemented yet. Set MOCK=1.');
  const api = createMockApi();
  const app = new Hono();
  const hosts = new Set(
    [config.port, 5173].flatMap((port) => [`127.0.0.1:${port}`, `localhost:${port}`]),
  );
  const origins = new Set([...hosts].map((host) => `http://${host}`));

  app.use('/api/*', secureHeaders());
  app.use('/api/*', async (c, next) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    if (!hosts.has(host))
      return c.json({ code: 'FORBIDDEN', message: 'Host is not allowed.' }, 403);
    c.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      if (!origins.has(c.req.header('origin') ?? '')) {
        return c.json({ code: 'FORBIDDEN', message: 'A local origin is required.' }, 403);
      }
      if (c.req.header('content-type')?.split(';')[0] !== 'application/json') {
        return c.json({ code: 'VALIDATION', message: 'Send a JSON request.' }, 400);
      }
    }
    await next();
  });
  app.onError((_, c) =>
    c.json({ code: 'UPSTREAM', message: 'The request could not be completed.' }, 500),
  );
  app.get('/api/session', async (c) => c.json(await api.getSession()));
  app.post('/api/session/retry', async (c) => {
    const parsed = z
      .object({})
      .strict()
      .safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success)
      return c.json({ code: 'VALIDATION', message: 'Send an empty JSON object.' }, 400);
    return c.json(await api.getSession());
  });
  app.get('/api/projects', async (c) => c.json(await api.getProjects()));
  app.get('/api/work-items', async (c) => c.json(await api.getWorkItems()));
  app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'This route was not found.' }, 404));
  return app;
}
