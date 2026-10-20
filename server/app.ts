import { Hono, type Context } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { workItemQuerySchema, type BoardsApi, type TeamScope } from '../shared/contracts';
import { createAdoApi } from './ado/api';
import type { Config } from './config';
import { AppError } from './errors';
import { createMockApi } from './mock/api';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError({ code: 'VALIDATION', message: 'Check the request parameters.' });
  }
  return parsed.data;
}

const typeQuery = z.object({ type: z.string().min(1) });
const scope = (c: Context): TeamScope => ({
  projectId: c.req.param('projectId')!,
  teamId: c.req.param('teamId')!,
});

export function createApp(
  config: Config,
  api: BoardsApi = config.mock ? createMockApi() : createAdoApi(config),
) {
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
  app.onError((error, c) =>
    error instanceof AppError
      ? c.json(error.body, error.status)
      : c.json({ code: 'UPSTREAM', message: 'The request could not be completed.' }, 500),
  );

  app.get('/api/session', async (c) => c.json(await api.getSession()));
  app.post('/api/session/retry', async (c) => {
    parse(z.object({}).strict(), await c.req.json().catch(() => undefined));
    return c.json(await api.retryConnection());
  });
  app.get('/api/projects', async (c) => c.json(await api.getProjects()));
  app.get('/api/projects/:projectId/teams', async (c) =>
    c.json(await api.getTeams(c.req.param('projectId'))),
  );
  app.get('/api/projects/:projectId/areas', async (c) =>
    c.json(await api.getAreaPaths(c.req.param('projectId'))),
  );
  app.get('/api/projects/:projectId/types', async (c) =>
    c.json(await api.getWorkItemTypes(c.req.param('projectId'))),
  );
  app.get('/api/projects/:projectId/states', async (c) => {
    const { type } = parse(typeQuery, c.req.query());
    return c.json(await api.getWorkItemStates(c.req.param('projectId'), type));
  });
  app.get('/api/projects/:projectId/fields', async (c) => {
    const { type } = parse(typeQuery, c.req.query());
    return c.json(await api.getWorkItemFields(c.req.param('projectId'), type));
  });
  app.get('/api/projects/:projectId/teams/:teamId/settings', async (c) =>
    c.json(await api.getTeamSettings(scope(c))),
  );
  app.get('/api/projects/:projectId/teams/:teamId/members', async (c) =>
    c.json(await api.getTeamMembers(scope(c))),
  );
  app.get('/api/projects/:projectId/teams/:teamId/iterations', async (c) =>
    c.json(await api.getIterations(scope(c))),
  );
  app.get('/api/projects/:projectId/teams/:teamId/backlogs', async (c) =>
    c.json(await api.getBacklogs(scope(c))),
  );
  app.get('/api/work-items', async (c) =>
    c.json(await api.getWorkItems(parse(workItemQuerySchema, c.req.query()))),
  );
  app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'This route was not found.' }, 404));
  return app;
}
