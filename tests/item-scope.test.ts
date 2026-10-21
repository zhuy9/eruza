// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Iteration, Team } from '../shared/contracts';
import { useScope, type ViewSearch } from '../src/lib/scope';

const route = vi.hoisted(() => ({ search: {} as ViewSearch }));
vi.mock('@tanstack/react-router', () => ({ useSearch: () => route.search }));

const projects = [
  { id: 'sample-project', name: 'Sample project', isDefault: true },
  { id: 'practice-project', name: 'Practice project', isDefault: false },
];
const teams: Record<string, Team[]> = {
  'sample-project': [
    { id: 'sample-team', name: 'Sample team', isDefault: true },
    { id: 'sample-other', name: 'Other sample team', isDefault: false },
  ],
  'practice-project': [
    { id: 'practice-team', name: 'Practice team', isDefault: true },
    { id: 'practice-other', name: 'Other practice team', isDefault: false },
  ],
};
const iteration = (team: string, name: string, timeFrame: Iteration['timeFrame']): Iteration => ({
  id: `${team}-${name}`,
  name,
  path: `${team}\\${name}`,
  startDate: null,
  finishDate: null,
  timeFrame,
});
const sprints = (team: string) => [
  iteration(team, 'Sprint 2', 'current'),
  iteration(team, 'Sprint 1', 'past'),
];

let root: Root | undefined;
let client: QueryClient;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  client?.clear();
  document.body.replaceChildren();
});

async function render(component: ReturnType<typeof createElement>, search: ViewSearch = {}) {
  route.search = search;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['projects'], projects);
  for (const project of projects) {
    client.setQueryData(['teams', project.id], teams[project.id]);
    for (const team of teams[project.id]) {
      client.setQueryData(['iterations', project.id, team.id], sprints(team.id));
    }
  }
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(() => root!.render(createElement(QueryClientProvider, { client }, component)));
}

async function scope(project?: string, search?: ViewSearch) {
  let result: ReturnType<typeof useScope>;
  function Probe() {
    result = useScope(project);
    return null;
  }
  await render(createElement(Probe), search);
  return result!;
}

describe('item project scope', () => {
  it('keeps workspace defaults when no item project is supplied', async () => {
    const actual = await scope();
    expect(actual.project?.id).toBe('sample-project');
    expect(actual.team?.id).toBe('sample-team');
  });

  it('uses the actual project default team for a direct link', async () => {
    const actual = await scope('Practice project');
    expect(actual.project?.id).toBe('practice-project');
    expect(actual.team?.id).toBe('practice-team');
    expect(actual.iterations.data).toEqual(sprints('practice-team'));
  });

  it('keeps a valid explicit team and sprint for the same project, and links keep the team', async () => {
    const actual = await scope('Practice project', {
      project: 'practice-project',
      team: 'practice-other',
      sprint: 'practice-other\\Sprint 1',
    });
    expect(actual.team?.id).toBe('practice-other');
    expect(actual.sprint).toEqual({ path: 'practice-other\\Sprint 1' });
    expect(actual.context).toEqual({ project: 'practice-project', team: 'practice-other' });
  });

  it('keeps a team chosen in the default project without a project in the URL', async () => {
    const actual = await scope('Sample project', { team: 'sample-other' });
    expect(actual.team?.id).toBe('sample-other');
    expect(actual.context).toEqual({ project: undefined, team: 'sample-other' });
  });

  it('ignores team and sprint context from a different project', async () => {
    const actual = await scope('Practice project', {
      project: 'sample-project',
      team: 'practice-other',
      sprint: 'practice-other\\Sprint 1',
    });
    expect(actual.team?.id).toBe('practice-team');
    expect(actual.sprint).toEqual({ path: 'practice-team\\Sprint 2' });
    expect(actual.context).toEqual({});
  });

  it('falls back to the item project default for an invalid explicit team', async () => {
    const actual = await scope('Practice project', {
      project: 'practice-project',
      team: 'sample-team',
    });
    expect(actual.team?.id).toBe('practice-team');
  });

  it('never borrows the root project when the item project cannot be resolved', async () => {
    const actual = await scope('Unavailable project');
    expect(actual.project).toBeUndefined();
    expect(actual.team).toBeUndefined();
    expect(actual.iterations.data).toBeUndefined();
  });
});
