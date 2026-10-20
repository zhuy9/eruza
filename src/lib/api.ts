import type { z } from 'zod';
import { apiErrorSchema, type ApiError } from '../../shared/contracts';

/** A failed local API call with a safe, typed error body. */
export class ApiRequestError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
  }
}

async function send<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      error.success
        ? error.data
        : { code: 'UPSTREAM', message: 'The local server did not respond as expected.' },
    );
  }
  return schema.parse(body);
}

export const getJson = <T>(path: string, schema: z.ZodType<T>) => send(path, schema);

export const postJson = <T>(path: string, body: unknown, schema: z.ZodType<T>) =>
  send(path, schema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
