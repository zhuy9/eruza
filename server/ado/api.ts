import type { TokenCredential } from '@azure/identity';
import type { BoardsApi, SessionInfo } from '../../shared/contracts';
import { createAuth, LOGIN_COMMAND } from '../auth';
import type { Config } from '../config';
import { AppError } from '../errors';
import { createAdoClient } from './client';
import * as item from './item';
import * as metadata from './metadata';
import { getWorkItems } from './work-items';

export function createAdoApi(config: Config, credential?: TokenCredential): BoardsApi {
  const auth = createAuth(credential);
  const ado = createAdoClient(config.organization, auth);

  async function connect(): Promise<SessionInfo> {
    try {
      return { mode: 'ado', status: 'connected', user: await metadata.getCurrentUser(ado) };
    } catch (error) {
      const { code, message } =
        error instanceof AppError
          ? error.body
          : { code: 'UPSTREAM' as const, message: 'Could not connect to Azure DevOps.' };
      const needsLogin = code === 'AUTH_REQUIRED' || code === 'CLI_UNAVAILABLE';
      return {
        mode: 'ado',
        status: 'error',
        code,
        message,
        ...(needsLogin && { loginCommand: LOGIN_COMMAND }),
      };
    }
  }
  return {
    // Checked on every call, so an expired login shows up when the page refocuses.
    getSession: connect,
    retryConnection: () => {
      auth.clearToken();
      return connect();
    },
    getProjects: () => metadata.getProjects(ado, config.defaultProject),
    getTeams: (projectId) => metadata.getTeams(ado, projectId),
    getTeamSettings: (scope) => metadata.getTeamSettings(ado, scope),
    getTeamMembers: (scope) => metadata.getTeamMembers(ado, scope),
    getIterations: (scope) => metadata.getIterations(ado, scope),
    getAreaPaths: (projectId) => metadata.getAreaPaths(ado, projectId),
    getBacklogs: (scope) => metadata.getBacklogs(ado, scope),
    getWorkItemTypes: (projectId) => metadata.getWorkItemTypes(ado, projectId),
    getWorkItemStates: (projectId, type) => metadata.getWorkItemStates(ado, projectId, type),
    getWorkItemFields: (projectId, type) => metadata.getWorkItemFields(ado, projectId, type),
    getWorkItems: (query) => getWorkItems(ado, query),
    getWorkItem: (id) => item.getWorkItem(ado, id),
    searchWorkItems: (projectId, text) => item.searchWorkItems(ado, projectId, text),
    createWorkItem: (input) => item.createWorkItem(ado, input),
    updateWorkItem: (id, input) => item.updateWorkItem(ado, id, input),
    setParent: (id, input) => item.setParent(ado, id, input),
    getAvatar: (identityId) => metadata.getAvatar(ado, identityId),
    getImage: (id, resourceId) => item.getImage(ado, id, resourceId),
  };
}
