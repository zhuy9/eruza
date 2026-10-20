import type { z } from 'zod';

export async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) throw new Error('Could not load the workspace. Try again.');
  return schema.parse(await response.json());
}
