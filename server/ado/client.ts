import type { ApiError } from '../../shared/contracts';
import type { Auth } from '../auth';
import { AppError } from '../errors';

const ORIGIN = 'https://dev.azure.com';

const MESSAGES: Record<ApiError['code'], string> = {
  AUTH_REQUIRED:
    'Azure DevOps did not accept the sign-in. Sign in with an account that can access this organization, then retry.',
  CLI_UNAVAILABLE: 'Azure CLI was not found. Install it, sign in, then retry.',
  FORBIDDEN: 'You do not have permission for this Azure DevOps resource.',
  VALIDATION: 'Azure DevOps rejected the request.',
  CONFLICT: 'The item changed in Azure DevOps. Review the latest version.',
  NOT_FOUND: 'The Azure DevOps resource was not found, or you cannot read it.',
  RATE_LIMITED: 'Azure DevOps asked Eruza to slow down. Try again shortly.',
  NETWORK: 'Could not reach Azure DevOps. Check your connection, then retry.',
  UNKNOWN_OUTCOME: 'The request may or may not have been saved. Check before repeating it.',
  UPSTREAM: 'Azure DevOps returned an unexpected response.',
};

const CODES: Record<number, ApiError['code']> = {
  400: 'VALIDATION',
  401: 'AUTH_REQUIRED',
  203: 'AUTH_REQUIRED', // ADO answers some sign-in failures with a 203 HTML page.
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  412: 'CONFLICT',
  429: 'RATE_LIMITED',
};

export const adoError = (code: ApiError['code'], extra: Partial<ApiError> = {}) =>
  new AppError({ code, message: MESSAGES[code], ...extra });

/** Encodes one path segment. Dot segments would move the URL, so they are rejected. */
export function segment(value: string) {
  if (value === '.' || value === '..') throw adoError('VALIDATION');
  return encodeURIComponent(value);
}

export type Ado = ReturnType<typeof createAdoClient>;
type Init = { method?: string; body?: unknown };
const MAX_WAIT_MS = 5000;

/** Calls ADO for one organization. Paths are relative to the organization URL. */
export function createAdoClient(organization: string, auth: Auth) {
  let notBefore = 0;

  async function request(path: string, init: Init = {}): Promise<Response> {
    // Built on a fixed origin, so a path can never send the token to another host.
    const url = new URL(`${encodeURIComponent(organization)}/${path}`, `${ORIGIN}/`);
    const wait = notBefore - Date.now();
    if (wait > MAX_WAIT_MS) throw adoError('RATE_LIMITED', { retryAfterMs: wait });
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const headers: Record<string, string> = {
      ...(await auth.getAuthHeader()),
      Accept: 'application/json',
    };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: 'manual',
      });
    } catch {
      throw adoError('NETWORK');
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    if (retryAfter > 0) notBefore = Date.now() + retryAfter * 1000;
    const code = CODES[response.status] ?? (response.ok ? null : 'UPSTREAM');
    if (!code) return response;
    if (code === 'AUTH_REQUIRED') auth.clearToken();
    throw adoError(
      code,
      code === 'RATE_LIMITED' && retryAfter > 0 ? { retryAfterMs: retryAfter * 1000 } : {},
    );
  }

  return {
    request,
    json: async <T>(path: string, init?: Init): Promise<T> =>
      (await request(path, init)).json() as Promise<T>,
  };
}
