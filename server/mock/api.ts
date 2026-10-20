import type { BoardsApi, TeamScope } from '../../shared/contracts';
import { collectAncestors } from '../ado/work-items';
import { AppError } from '../errors';
import * as data from './fixtures';

const notFound = () =>
  new AppError({ code: 'NOT_FOUND', message: 'This sample record was not found.' });

function lookup<T>(record: Record<string, T>, key: string): T {
  if (!Object.hasOwn(record, key)) throw notFound();
  return structuredClone(record[key]);
}

export function createMockApi(): BoardsApi {
  const items = new Map(data.items.map((item) => [item.id, structuredClone(item)]));
  const team = (scope: TeamScope) => {
    if (!lookup(data.teams, scope.projectId).some((t) => t.id === scope.teamId)) throw notFound();
    return scope.teamId;
  };
  const session = async () =>
    ({ mode: 'mock', status: 'connected', user: data.people[0] }) as const;

  return {
    getSession: session,
    retryConnection: session,
    getProjects: async () => structuredClone(data.projects),
    getTeams: async (projectId) => lookup(data.teams, projectId),
    getTeamSettings: async (scope) => lookup(data.teamSettings, team(scope)),
    getTeamMembers: async (scope) => lookup(data.teamMembers, team(scope)),
    getIterations: async (scope) => data.iterations(team(scope)),
    getAreaPaths: async (projectId) => lookup(data.areaPaths, projectId),
    getBacklogs: async (scope) => {
      team(scope);
      return structuredClone(data.backlogs);
    },
    getWorkItemTypes: async (projectId) => {
      lookup(data.teams, projectId);
      return structuredClone(data.types);
    },
    getWorkItemStates: async (_, type) => lookup(data.states, type),
    getWorkItemFields: async (_, type) => lookup(data.fields, type),
    async getWorkItems(query) {
      const { areas } = lookup(data.teamSettings, team(query));
      const inArea = (path: string) =>
        areas.some((a) => path === a.path || (a.includeChildren && path.startsWith(`${a.path}\\`)));
      const matches = [...items.values()]
        .filter(
          (item) =>
            item.iterationPath === query.iteration &&
            inArea(item.areaPath) &&
            (!query.type || item.type === query.type),
        )
        .map((item) => structuredClone(item));
      if (query.type) return { items: matches, ancestors: [], missingIds: [], incomplete: false };
      const extra = await collectAncestors(matches, data.backlogs, async (ids) => ({
        items: ids.flatMap((id) => (items.has(id) ? [structuredClone(items.get(id)!)] : [])),
        missingIds: ids.filter((id) => !items.has(id)),
      }));
      return { items: matches, ...extra, incomplete: false };
    },
  };
}
