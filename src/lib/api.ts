import type { z } from 'zod';
import { apiErrorSchema, type ApiError } from '../../shared/contracts';

/** A failed local API call with a safe, typed error body. */
export class ApiRequestError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
  }
}

/** The safe error body of a failed call, or a generic one. */
export const apiError = (error: unknown): ApiError =>
  error instanceof ApiRequestError
    ? error.error
    : { code: 'UPSTREAM', message: 'Something went wrong. Try again.' };

async function send<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const writing = init?.method && init.method !== 'GET';
  const unknownOutcome: ApiError = {
    code: 'UNKNOWN_OUTCOME',
    message: 'Lost contact with Eruza. Check the item before repeating the change.',
  };
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiRequestError(
      writing
        ? unknownOutcome
        : { code: 'NETWORK', message: 'Could not reach the local Eruza server.' },
    );
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      error.success
        ? error.data
        : { code: 'UPSTREAM', message: 'The local server did not respond as expected.' },
    );
  }
  try {
    const body: unknown = await response.json().catch((error: unknown) => {
      if (writing && response.status !== 204) throw error;
      return null;
    });
    return schema.parse(body);
  } catch (error) {
    if (writing) throw new ApiRequestError(unknownOutcome);
    throw error;
  }
}

export const getJson = <T>(path: string, schema: z.ZodType<T>) => send(path, schema);

/** Sends JSON with the given method. */
export const sendJson = <T>(method: string, path: string, body: unknown, schema: z.ZodType<T>) =>
  send(path, schema, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
