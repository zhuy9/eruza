import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { commentSchema, workItemDetailSchema } from '../shared/contracts';
import { apiError, ApiRequestError, getJson, sendJson } from '../src/lib/api';

const writes: { method: string; path: string; schema: z.ZodType }[] = [
  { method: 'POST', path: '/work-items', schema: workItemDetailSchema },
  { method: 'POST', path: '/work-items/9/comments', schema: commentSchema },
  { method: 'PATCH', path: '/work-items/9', schema: workItemDetailSchema },
  { method: 'PUT', path: '/work-items/9/parent', schema: workItemDetailSchema },
];

describe('local API client', () => {
  it.each(writes)(
    'reports malformed successful $method $path responses as unknown without retrying',
    async ({ method, path, schema }) => {
      const fetch = vi.fn().mockResolvedValue(new Response('{broken', { status: 201 }));
      vi.stubGlobal('fetch', fetch);

      await expect(sendJson(method, path, {}, schema)).rejects.toMatchObject({
        error: { code: 'UNKNOWN_OUTCOME' },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each(writes)(
    'reports wrong-shaped successful $method $path responses as unknown without retrying',
    async ({ method, path, schema }) => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ unexpected: true }, { status: 201 }));
      vi.stubGlobal('fetch', fetch);

      await expect(sendJson(method, path, {}, schema)).rejects.toMatchObject({
        error: { code: 'UNKNOWN_OUTCOME' },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('reports a failed successful-response body stream as unknown without exposing it', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('synthetic body stream failure'));
          },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const error = await sendJson('POST', '/work-items', {}, workItemDetailSchema).catch(apiError);

    expect(error).toMatchObject({ code: 'UNKNOWN_OUTCOME' });
    expect(JSON.stringify(error)).not.toContain('synthetic body stream failure');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not treat an unreadable successful write as a null response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{broken', { status: 201 })));
    await expect(sendJson('POST', '/work-items', {}, z.null())).rejects.toMatchObject({
      error: { code: 'UNKNOWN_OUTCOME' },
    });
  });

  it('accepts an empty 204 delete response as null', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await expect(sendJson('DELETE', '/work-items/9', {}, z.null())).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['VALIDATION', 'CONFLICT', 'UNKNOWN_OUTCOME'] as const)(
    'preserves a classified %s write error',
    async (code) => {
      const error = {
        code,
        message: 'Synthetic server error.',
        fieldErrors: { Title: 'Required.' },
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(error, { status: 400 })));
      const failure = await sendJson('POST', '/work-items', {}, workItemDetailSchema).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ApiRequestError);
      expect(failure).toMatchObject({ error });
    },
  );

  it('keeps an unreadable failed response as a known upstream failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{broken', { status: 500 })));
    await expect(sendJson('POST', '/work-items', {}, workItemDetailSchema)).rejects.toMatchObject({
      error: { code: 'UPSTREAM' },
    });
  });

  it('preserves read parsing behavior', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('{broken')),
    );
    await expect(getJson('/work-items/9', workItemDetailSchema)).rejects.toBeInstanceOf(z.ZodError);
    await expect(getJson('/work-items/9', z.null())).resolves.toBeNull();
  });

  it.each([
    ['GET', 'NETWORK'],
    ['POST', 'UNKNOWN_OUTCOME'],
  ])('preserves %s network failure classification', async (method, code) => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('synthetic connection failure'));
    vi.stubGlobal('fetch', fetch);
    await expect(sendJson(method, '/work-items', {}, workItemDetailSchema)).rejects.toMatchObject({
      error: { code },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
