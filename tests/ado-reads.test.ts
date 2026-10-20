import { describe, expect, it, vi } from 'vitest';
import { createAdoClient } from '../server/ado/client';
import { getCurrentUser, getProjects, getTeams } from '../server/ado/metadata';
import {
  batchGet,
  getWorkItems,
  QUERY_LIMIT,
  sprintQuery,
  wiqlString,
} from '../server/ado/work-items';

type Route = ((url: URL, body: unknown) => unknown) | object;

/** A tiny fake ADO. Each handler matches a path suffix. */
function fakeAdo(routes: Record<string, Route>) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path: url.pathname, body });
      const key = Object.keys(routes).find((suffix) => url.pathname.endsWith(suffix));
      if (!key) return new Response(null, { status: 404 });
      const route = routes[key];
      const result = typeof route === 'function' ? route(url, body) : route;
      return result instanceof Response ? result : Response.json(result);
    }),
  );
  const auth = { getAuthHeader: async () => ({ Authorization: 'Bearer test' }), clearToken() {} };
  return { ado: createAdoClient('sample-org', auth), calls };
}

const raw = (id: number, type: string, parent?: number) => ({
  id,
  rev: 3,
  fields: {
    'System.WorkItemType': type,
    'System.Title': `Item ${id}`,
    'System.State': 'Active',
    'System.AreaPath': 'Sample\\Web',
    'System.IterationPath': 'Sample\\Sprint 1',
    ...(parent && { 'System.Parent': parent }),
  },
});

/** Serves batch reads from a fixed set of items; unknown IDs are omitted like errorPolicy=omit. */
const batchFrom = (items: ReturnType<typeof raw>[]) => (_: URL, body: unknown) => {
  const { ids } = body as { ids: number[] };
  return { value: ids.map((id) => items.find((item) => item.id === id) ?? null) };
};

const teamRoutes = {
  '/teamsettings': { defaultIteration: null },
  '/teamfieldvalues': {
    defaultValue: 'Sample\\Web',
    values: [{ value: "Sample\\Web's area", includeChildren: true }],
  },
  '/backlogs': {
    value: [
      { id: 'req', name: 'Stories', type: 'requirement', workItemTypes: [{ name: 'Story' }] },
    ],
  },
};

describe('WIQL', () => {
  it('escapes quotes in every user-supplied value', () => {
    expect(wiqlString("it's")).toBe("'it''s'");
    const query = sprintQuery(
      {
        defaultAreaPath: '',
        defaultIterationPath: null,
        areas: [
          { path: "Team's area", includeChildren: true },
          { path: 'Exact', includeChildren: false },
        ],
      },
      "Sprint' OR 1=1 --",
      "Bug'",
    );
    expect(query).toContain("[System.IterationPath] = 'Sprint'' OR 1=1 --'");
    expect(query).toContain(
      "[System.AreaPath] UNDER 'Team''s area' OR [System.AreaPath] = 'Exact'",
    );
    expect(query).toContain("[System.WorkItemType] = 'Bug'''");
  });
});

describe('batched reads', () => {
  it('deduplicates IDs, never sends more than 200, and reports missing IDs', async () => {
    const items = Array.from({ length: 449 }, (_, i) => raw(i + 1, 'Task'));
    const { ado, calls } = fakeAdo({ '/workitemsbatch': batchFrom(items) });
    const ids = [...Array.from({ length: 450 }, (_, i) => i + 1), 1, 2, 3];
    const result = await batchGet(ado, 'project-1', ids);
    const sizes = calls.map((call) => (call.body as { ids: number[] }).ids.length);
    expect(sizes.sort((a, b) => b - a)).toEqual([200, 200, 50]);
    expect(result.items).toHaveLength(449);
    expect(result.missingIds).toEqual([450]);
  });

  it('reads a shared ancestor once and stops at story-level types', async () => {
    const items = [
      raw(1, 'Task', 10),
      raw(2, 'Task', 10),
      raw(3, 'Bug', 11),
      raw(10, 'Task', 20), // intermediate parent outside the sprint
      raw(20, 'Story', 30), // its story parent; 30 must not be read
      raw(11, 'Story', 30),
    ];
    const { ado, calls } = fakeAdo({
      ...teamRoutes,
      '/wiql': { workItems: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] },
      '/workitemsbatch': batchFrom([...items, raw(4, 'Task', 99)]),
    });
    const list = await getWorkItems(ado, {
      projectId: 'project-1',
      teamId: 'team-1',
      iteration: 'Sample\\Sprint 1',
    });
    const batches = calls
      .filter((call) => call.path.endsWith('/workitemsbatch'))
      .map((call) => (call.body as { ids: number[] }).ids);
    expect(batches).toEqual([[1, 2, 3, 4], [10, 11, 99], [20]]);
    expect(list.items.map((i) => i.id)).toEqual([1, 2, 3, 4]);
    expect(list.ancestors.map((i) => i.id)).toEqual([10, 11, 20]);
    expect(list.missingIds).toEqual([99]);
    expect(list.incomplete).toBe(false);
    const wiql = calls.find((call) => call.path.endsWith('/wiql'))!.body as { query: string };
    expect(wiql.query).toContain("UNDER 'Sample\\Web''s area'");
  });

  it('marks a result incomplete when the query limit is reached', async () => {
    const ids = Array.from({ length: QUERY_LIMIT + 1 }, (_, i) => ({ id: i + 1 }));
    const { ado, calls } = fakeAdo({
      ...teamRoutes,
      '/wiql': { workItems: ids },
      '/workitemsbatch': (_: URL, body: unknown) => ({
        value: (body as { ids: number[] }).ids.map((id) => raw(id, 'Story')),
      }),
    });
    const list = await getWorkItems(ado, {
      projectId: 'p',
      teamId: 't',
      iteration: 'Sample\\Sprint 1',
      type: 'Story',
    });
    expect(list.incomplete).toBe(true);
    expect(list.items).toHaveLength(QUERY_LIMIT);
    expect(calls.find((c) => c.path.endsWith('/wiql'))).toBeDefined();
  });
});

describe('metadata reads', () => {
  it('follows the projects continuation token and marks the default project', async () => {
    let page = 0;
    const { ado } = fakeAdo({
      '/_apis/projects': () =>
        page++ === 0
          ? Response.json(
              { value: [{ id: 'p2', name: 'Second' }] },
              { headers: { 'x-ms-continuationtoken': '1' } },
            )
          : { value: [{ id: 'p1', name: 'First' }] },
    });
    expect(await getProjects(ado, 'Second')).toEqual([
      { id: 'p1', name: 'First', isDefault: false },
      { id: 'p2', name: 'Second', isDefault: true },
    ]);
  });

  it('reads every team page and marks the default team', async () => {
    const teams = Array.from({ length: 101 }, (_, i) => ({ id: `t${i}`, name: `Team ${i}` }));
    const { ado } = fakeAdo({
      '/teams': (url) => {
        const skip = Number(url.searchParams.get('$skip'));
        return { value: teams.slice(skip, skip + Number(url.searchParams.get('$top'))) };
      },
      '/_apis/projects/p1': { defaultTeam: { id: 't100' } },
    });
    const result = await getTeams(ado, 'p1');
    expect(result).toHaveLength(101);
    expect(result.filter((t) => t.isDefault).map((t) => t.id)).toEqual(['t100']);
  });

  it('takes the current user from connectionData', async () => {
    const { ado } = fakeAdo({
      '/connectionData': {
        authenticatedUser: { id: 'user-1', providerDisplayName: 'Sample User' },
      },
    });
    expect(await getCurrentUser(ado)).toEqual({ id: 'user-1', displayName: 'Sample User' });
  });
});
