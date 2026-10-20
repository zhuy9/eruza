import type { SessionInfo, WorkItemList } from '../../shared/contracts';
import { items, people, projects } from './fixtures';

export function createMockApi() {
  return {
    getSession: async (): Promise<SessionInfo> => ({
      mode: 'mock',
      status: 'connected',
      user: people[0],
    }),
    getProjects: async () => structuredClone(projects),
    getWorkItems: async (): Promise<WorkItemList> => ({
      items: structuredClone(items),
      ancestors: [],
      missingIds: [],
      incomplete: false,
    }),
  };
}
