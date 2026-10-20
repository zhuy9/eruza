import { AzureCliCredential, type AccessToken, type TokenCredential } from '@azure/identity';
import { adoError } from './ado/client';
import { AppError } from './errors';

const SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';
const REFRESH_MS = 60_000;
export const LOGIN_COMMAND = 'az login --allow-no-subscriptions';

export type Auth = ReturnType<typeof createAuth>;

export function createAuth(credential: TokenCredential = new AzureCliCredential()) {
  let token: AccessToken | null = null;
  let refresh: Promise<AccessToken> | null = null;

  async function acquire(): Promise<AccessToken> {
    try {
      const result = await credential.getToken(SCOPE);
      if (result) return result;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Azure CLI could not be found')) {
        throw adoError('CLI_UNAVAILABLE');
      }
    }
    throw new AppError({ code: 'AUTH_REQUIRED', message: 'Sign in with Azure CLI, then retry.' });
  }

  return {
    async getAuthHeader(): Promise<{ Authorization: string }> {
      if (!token || token.expiresOnTimestamp - Date.now() < REFRESH_MS) {
        refresh ??= acquire().finally(() => (refresh = null));
        token = await refresh;
      }
      return { Authorization: `Bearer ${token.token}` };
    },
    clearToken() {
      token = null;
    },
  };
}
