import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaPaths, teamMembers, teamSettings } from '../server/mock/fixtures';
import { UNASSIGNED, useFilters } from '../src/lib/filters';
import { areasQuery, membersQuery, teamSettingsQuery } from '../src/lib/queries';
import type { ViewSearch } from '../src/lib/scope';

let search: ViewSearch;
let teamId: string;
vi.mock('@tanstack/react-router', () => ({ useSearch: () => search }));
vi.mock('../src/lib/scope', () => ({
  useScope: () => ({ project: { id: 'sample-project' }, team: { id: teamId } }),
  useSetSearch: () => vi.fn(),
}));

let client: QueryClient;
const requested = { assignee: 'person-a', area: 'Sample project\\Web' };
const keys = () => ({
  members: membersQuery('sample-project', teamId).queryKey,
  settings: teamSettingsQuery('sample-project', teamId).queryKey,
  areas: areasQuery('sample-project').queryKey,
});

function loadMetadata() {
  client.setQueryData(keys().members, teamMembers[teamId]);
  client.setQueryData(keys().settings, teamSettings[teamId]);
  client.setQueryData(keys().areas, areaPaths['sample-project']);
}

function readFilters() {
  let filters: ReturnType<typeof useFilters> | undefined;
  function ReadFilters() {
    filters = useFilters();
    return null;
  }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(ReadFilters)));
  return filters!;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } },
  });
  teamId = 'web-team';
  search = { ...requested };
  loadMetadata();
});
afterEach(() => client.clear());

describe('saved filters and unavailable metadata', () => {
  it.each(['members', 'settings', 'areas'] as const)(
    'keeps filters and reports a failed %s read, then recovers',
    async (resource) => {
      const queryKey = keys()[resource];
      const error = new Error(`Could not load ${resource}.`);
      client.removeQueries({ queryKey });
      await expect(
        client.fetchQuery({ queryKey, queryFn: () => Promise.reject(error) }),
      ).rejects.toBe(error);

      const failed = readFilters();
      expect(failed.values).toMatchObject(requested);
      expect(failed.problems).toEqual([
        resource === 'members'
          ? 'Team members could not load. Assignee filters are kept but not checked.'
          : 'Team areas could not load. Area filters are kept but not checked.',
      ]);

      loadMetadata();
      const recovered = readFilters();
      expect(recovered.values).toMatchObject(requested);
      expect(recovered.problems).toEqual([]);
      expect(recovered.members).toEqual(teamMembers[teamId]);
      expect(recovered.areaOptions).toContain(requested.area);
    },
  );

  it('keeps filters while their metadata is still loading', () => {
    client.clear();
    expect(readFilters().values).toMatchObject(requested);
  });

  it('keeps unassigned without needing member metadata', () => {
    client.removeQueries({ queryKey: keys().members });
    search.assignee = UNASSIGNED;
    expect(readFilters().values.assignee).toBe(UNASSIGNED);
  });

  it('rejects invalid saved choices after metadata loads for another team', () => {
    expect(readFilters().values).toMatchObject(requested);
    teamId = 'platform-team';
    expect(readFilters().values).toMatchObject(requested);
    loadMetadata();
    expect(readFilters().values).toMatchObject({ assignee: undefined, area: undefined });
  });

  it('treats loaded empty metadata as authoritative', () => {
    client.setQueryData(keys().members, []);
    client.setQueryData(keys().areas, []);
    expect(readFilters().values).toMatchObject({ assignee: undefined, area: undefined });
  });

  it('keeps checking against cached choices when a background refresh fails', async () => {
    search = { assignee: 'person-x', area: 'Sample project\\Elsewhere' };
    const error = new Error('Could not refresh.');
    for (const queryKey of Object.values(keys())) {
      await expect(
        client.fetchQuery({ queryKey, queryFn: () => Promise.reject(error) }),
      ).rejects.toBe(error);
    }
    const filters = readFilters();
    expect(filters.values).toMatchObject({ assignee: undefined, area: undefined });
    expect(filters.problems).toEqual([]);
  });
});
