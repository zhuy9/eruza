import { describe, expect, it, vi } from 'vitest';
import { createAdoClient } from '../server/ado/client';
import { addComment, getComments } from '../server/ado/comments';
import {
  createWorkItem,
  deleteWorkItem,
  getImage,
  getWorkItem,
  setParent,
  updateWorkItem,
  webUrl,
} from '../server/ado/item';
import { toAdoImages, toLocalImages } from '../server/ado/images';

type Call = { method: string; path: string; search: string; body: unknown; type: string | null };

/** A fake ADO that records every request. Handlers match `METHOD path-suffix`. */
function fakeAdo(routes: Record<string, (call: Call) => unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      const call = {
        method: init.method ?? 'GET',
        path: url.pathname,
        search: url.search,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        type: new Headers(init.headers).get('content-type'),
      };
      calls.push(call);
      const key = Object.keys(routes).find((k) => {
        const [method, suffix] = k.split(' ');
        return method === call.method && call.path.endsWith(suffix);
      });
      if (!key) return new Response(null, { status: 404 });
      const result = routes[key](call);
      return result instanceof Response ? result : Response.json(result);
    }),
  );
  const auth = { getAuthHeader: async () => ({ Authorization: 'Bearer test' }), clearToken() {} };
  const ado = createAdoClient('sample-org', auth);
  ado.identities.set('person-1', 'person.one@example.invalid');
  return { ado, calls };
}

const fieldsList = {
  value: [
    { referenceName: 'System.Title', readOnly: false },
    { referenceName: 'System.State', readOnly: false },
    { referenceName: 'System.AssignedTo', readOnly: false, isIdentity: true },
    { referenceName: 'Custom.Reason', readOnly: false },
    { referenceName: 'System.Rev', readOnly: true },
  ],
};

const rawItem = (id: number, rev: number, relations: { rel: string; url: string }[] = []) => ({
  id,
  rev,
  fields: {
    'System.TeamProject': 'Sample',
    'System.WorkItemType': 'Task',
    'System.Title': `Item ${id}`,
    'System.State': 'Active',
    'System.AreaPath': 'Sample',
    'System.IterationPath': 'Sample',
    'System.Description': '<p>Hello</p>',
  },
  relations,
});

const link = (rel: string, id: number) => ({
  rel,
  url: `https://dev.azure.com/sample-org/_apis/wit/workItems/${id}`,
});
const PARENT = 'System.LinkTypes.Hierarchy-Reverse';
const CHILD = 'System.LinkTypes.Hierarchy-Forward';

describe('create', () => {
  it('creates a child with its parent relation in one JSON Patch request', async () => {
    const { ado, calls } = fakeAdo({
      'GET /_apis/wit/fields': () => fieldsList,
      'POST /workitems/$Task': () => rawItem(50, 1, [link(PARENT, 7)]),
    });
    const created = await createWorkItem(ado, {
      projectId: 'Sample',
      type: 'Task',
      fields: { 'System.Title': 'New task', 'System.AssignedTo': 'person-1' },
      parentId: 7,
    });
    const writes = calls.filter((c) => c.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0].type).toBe('application/json-patch+json');
    expect(writes[0].body).toEqual([
      { op: 'add', path: '/fields/System.Title', value: 'New task' },
      { op: 'add', path: '/fields/System.AssignedTo', value: 'person.one@example.invalid' },
      { op: 'add', path: '/relations/-', value: link(PARENT, 7) },
    ]);
    expect(created).toMatchObject({ id: 50, rev: 1 });
  });

  it('rejects read-only or unknown fields before writing', async () => {
    const { ado, calls } = fakeAdo({ 'GET /_apis/wit/fields': () => fieldsList });
    for (const field of ['System.Rev', 'Custom.Unknown', 'System.Parent']) {
      await expect(
        createWorkItem(ado, { projectId: 'Sample', type: 'Task', fields: { [field]: 1 } }),
      ).rejects.toMatchObject({
        body: { code: 'VALIDATION', fieldErrors: { [field]: expect.any(String) } },
      });
    }
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('reports an unknown outcome when the create response is lost', async () => {
    const { ado } = fakeAdo({ 'GET /_apis/wit/fields': () => fieldsList });
    const fetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const real = fetch.getMockImplementation() as (
      url: URL,
      init: RequestInit,
    ) => Promise<Response>;
    fetch.mockImplementation(async (url: URL, init: RequestInit) => {
      if (init.method === 'POST') throw new TypeError('socket hang up');
      return real(url, init);
    });
    await expect(
      createWorkItem(ado, { projectId: 'Sample', type: 'Task', fields: { 'System.Title': 'x' } }),
    ).rejects.toMatchObject({ body: { code: 'UNKNOWN_OUTCOME' } });
  });

  it.each(['{broken', JSON.stringify({ unexpected: true })])(
    'reports an unreadable 201 create response as unknown without repeating it: %s',
    async (body) => {
      const { ado, calls } = fakeAdo({
        'GET /_apis/wit/fields': () => fieldsList,
        'POST /workitems/$Task': () => new Response(body, { status: 201 }),
      });
      await expect(
        createWorkItem(ado, { projectId: 'Sample', type: 'Task', fields: { 'System.Title': 'x' } }),
      ).rejects.toMatchObject({ body: { code: 'UNKNOWN_OUTCOME' } });
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    },
  );
});

describe('update', () => {
  it('starts with a /rev test and sends state and required fields together', async () => {
    const { ado, calls } = fakeAdo({
      'GET /_apis/wit/fields': () => fieldsList,
      'PATCH /workitems/9': () => rawItem(9, 5),
    });
    await updateWorkItem(ado, 9, {
      expectedRev: 4,
      fields: { 'System.State': 'Resolved', 'Custom.Reason': 'Fixed' },
    });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toEqual([
      { op: 'test', path: '/rev', value: 4 },
      { op: 'add', path: '/fields/System.State', value: 'Resolved' },
      { op: 'add', path: '/fields/Custom.Reason', value: 'Fixed' },
    ]);
  });

  it('re-reads the field list once before rejecting an unknown field', async () => {
    const fields = [...fieldsList.value];
    const { ado, calls } = fakeAdo({
      'GET /_apis/wit/fields': () => ({ value: fields }),
      'PATCH /workitems/9': () => rawItem(9, 5),
    });
    const reads = () => calls.filter((c) => c.path.endsWith('/_apis/wit/fields')).length;
    await updateWorkItem(ado, 9, { expectedRev: 4, fields: { 'System.Title': 'x' } });
    fields.push({ referenceName: 'Custom.Added', readOnly: false });
    await updateWorkItem(ado, 9, { expectedRev: 5, fields: { 'Custom.Added': 'Yes' } });
    expect(calls.at(-1)!.body).toEqual([
      { op: 'test', path: '/rev', value: 5 },
      { op: 'add', path: '/fields/Custom.Added', value: 'Yes' },
    ]);
    const before = reads();
    await expect(
      updateWorkItem(ado, 9, { expectedRev: 5, fields: { 'Custom.Missing': 'x' } }),
    ).rejects.toMatchObject({
      body: { code: 'VALIDATION', fieldErrors: { 'Custom.Missing': expect.any(String) } },
    });
    expect(reads() - before).toBe(1);
  });

  it('turns ADO rule errors into field errors', async () => {
    const { ado } = fakeAdo({
      'GET /_apis/wit/fields': () => fieldsList,
      'PATCH /workitems/9': () =>
        Response.json(
          {
            message: 'TF401320: Rule Error for field Reason. Error code: Required, InvalidEmpty.',
            customProperties: {
              RuleValidationErrors: [
                { fieldReferenceName: 'Custom.Reason', fieldStatusFlags: 'required, invalidEmpty' },
              ],
            },
          },
          { status: 400 },
        ),
      'GET /workitems/9': () => ({ id: 9, rev: 4, fields: {} }),
    });
    await expect(
      updateWorkItem(ado, 9, { expectedRev: 4, fields: { 'System.State': 'Resolved' } }),
    ).rejects.toMatchObject({
      body: {
        code: 'VALIDATION',
        message: expect.stringContaining('Rule Error for field Reason'),
        fieldErrors: { 'Custom.Reason': 'This field is required.' },
      },
    });
  });

  it('reports a conflict when the revision moved, whatever status ADO used', async () => {
    const { ado } = fakeAdo({
      'GET /_apis/wit/fields': () => fieldsList,
      'PATCH /workitems/9': () => Response.json({ message: 'Test failed' }, { status: 400 }),
      'GET /workitems/9': () => ({ id: 9, rev: 6, fields: {} }),
    });
    await expect(
      updateWorkItem(ado, 9, { expectedRev: 4, fields: { 'System.Title': 'x' } }),
    ).rejects.toMatchObject({ body: { code: 'CONFLICT' } });
  });

  it.each(['{broken', JSON.stringify({ ...rawItem(9, 5), rev: 'invalid' })])(
    'reports an unreadable successful patch as unknown without repeating it: %s',
    async (body) => {
      const { ado, calls } = fakeAdo({
        'GET /_apis/wit/fields': () => fieldsList,
        'PATCH /workitems/9': () => new Response(body),
      });
      await expect(
        updateWorkItem(ado, 9, { expectedRev: 4, fields: { 'System.Title': 'x' } }),
      ).rejects.toMatchObject({ body: { code: 'UNKNOWN_OUTCOME' } });
      expect(calls.map((call) => call.method)).toEqual(['GET', 'PATCH']);
    },
  );
});

describe('parent changes', () => {
  const routes = (relations: { rel: string; url: string }[]) => ({
    'GET /workitems/9/revisions/4': () => rawItem(9, 4, relations),
    'PATCH /workitems/9': () => rawItem(9, 5),
  });

  it('removes the old parent and adds the new one in one patch, keeping other links', async () => {
    const { ado, calls } = fakeAdo(
      routes([link(CHILD, 20), link('System.LinkTypes.Related', 30), link(PARENT, 7)]),
    );
    await setParent(ado, 9, { parentId: 8, expectedRev: 4 });
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual([
      { op: 'test', path: '/rev', value: 4 },
      { op: 'remove', path: '/relations/2' },
      { op: 'add', path: '/relations/-', value: link(PARENT, 8) },
    ]);
  });

  it('removes only the parent relation', async () => {
    const { ado, calls } = fakeAdo(routes([link(CHILD, 20), link(PARENT, 7)]));
    await setParent(ado, 9, { parentId: null, expectedRev: 4 });
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual([
      { op: 'test', path: '/rev', value: 4 },
      { op: 'remove', path: '/relations/1' },
    ]);
  });

  it('reports a successful parent response with an invalid item as unknown', async () => {
    const { ado, calls } = fakeAdo({
      ...routes([link(PARENT, 7)]),
      'PATCH /workitems/9': () => ({ ...rawItem(9, 5), rev: 'invalid' }),
    });
    await expect(setParent(ado, 9, { parentId: 8, expectedRev: 4 })).rejects.toMatchObject({
      body: { code: 'UNKNOWN_OUTCOME' },
    });
    expect(calls.map((call) => call.method)).toEqual(['GET', 'PATCH']);
  });

  it('refuses self-parenting without calling ADO', async () => {
    const { ado, calls } = fakeAdo({});
    await expect(setParent(ado, 9, { parentId: 9, expectedRev: 4 })).rejects.toMatchObject({
      body: { code: 'VALIDATION' },
    });
    expect(calls).toEqual([]);
  });
});

describe('detail and images', () => {
  it('batch-reads the parent and children in one request', async () => {
    const { ado, calls } = fakeAdo({
      'GET /workitems/9': () => ({
        ...rawItem(9, 4, [link(PARENT, 7), link(CHILD, 20), link(CHILD, 21)]),
        fields: { ...rawItem(9, 4).fields, 'System.Parent': 7 },
      }),
      'POST /workitemsbatch': (call) => ({
        value: (call.body as { ids: number[] }).ids
          .filter((id) => id !== 21)
          .map((id) => rawItem(id, 1)),
      }),
    });
    const view = await getWorkItem(ado, 9);
    expect(view.item.childIds).toEqual([20, 21]);
    expect(view.related.map((i) => i.id)).toEqual([7, 20]);
    expect(view.missingIds).toEqual([21]);
    expect(calls.filter((c) => c.path.endsWith('/workitemsbatch'))).toHaveLength(1);
    expect(view.webUrl).toBe('https://dev.azure.com/sample-org/Sample/_workitems/edit/9');
  });

  it('builds the Azure DevOps link from settings and IDs only', () => {
    expect(webUrl('sample-org', 'Sample project/#?', 9)).toBe(
      'https://dev.azure.com/sample-org/Sample%20project%2F%23%3F/_workitems/edit/9',
    );
  });

  it('maps ADO attachment images to the local route and back', () => {
    const guid = '0b5c3a52-1d43-4c4e-9a43-6a2c1f1e7d10';
    const ado = `<img src="https://dev.azure.com/sample-org/project-1/_apis/wit/attachments/${guid}?fileName=a.png">`;
    const local = toLocalImages(ado, 'sample-org', 9);
    expect(local).toBe(`<img src="/api/work-items/9/images/${guid}?fileName=a.png">`);
    expect(toAdoImages(local, 'sample-org')).toBe(
      `<img src="https://dev.azure.com/sample-org/_apis/wit/attachments/${guid}?fileName=a.png">`,
    );
    expect(
      toLocalImages('<img src="https://outside.invalid/_apis/wit/attachments/x">', 'sample-org', 9),
    ).toContain('outside.invalid');
  });

  it('serves only images referenced by the item', async () => {
    const { ado, calls } = fakeAdo({
      'GET /workitems/9': () => ({
        id: 9,
        rev: 1,
        fields: { 'System.Description': '<p>none</p>' },
      }),
    });
    await expect(getImage(ado, 9, '0b5c3a52-1d43-4c4e-9a43-6a2c1f1e7d10')).rejects.toMatchObject({
      body: { code: 'NOT_FOUND' },
    });
    await expect(getImage(ado, 9, '../../_apis/projects')).rejects.toMatchObject({
      body: { code: 'NOT_FOUND' },
    });
    expect(calls.some((c) => c.path.includes('/attachments/'))).toBe(false);
  });
});

const GUID = '0b5c3a52-1d43-4c4e-9a43-6a2c1f1e7d10';
const author = {
  id: 'person-1',
  displayName: 'Person One',
  uniqueName: 'person.one@example.invalid',
};
const MENTION = '<a href="#" data-vss-mention="version:2.0,person-1">@Person One</a>';

describe('comments', () => {
  it('reads newest first, renders Markdown, and passes the cursor on', async () => {
    const { ado, calls } = fakeAdo({
      'GET /workItems/9/comments': () => ({
        comments: [
          {
            id: 3,
            format: 'html',
            text: `<p>Hi ${MENTION}<img src="https://dev.azure.com/sample-org/p1/_apis/wit/attachments/${GUID}?fileName=a.png"></p>`,
            createdBy: author,
            createdDate: '2026-01-03T00:00:00Z',
          },
          {
            id: 2,
            format: 'markdown',
            text: '**bold**',
            renderedText: '<p><strong>bold</strong></p>',
            createdBy: author,
            createdDate: '2026-01-02T00:00:00Z',
          },
          { id: 1, text: '<p>Plain</p>', createdDate: '2026-01-01T00:00:00Z' },
        ],
        continuationToken: 'next+page/1',
      }),
    });
    const page = await getComments(ado, 9, 'Sample project', 'older token/=');
    expect(calls[0].path).toBe('/sample-org/Sample%20project/_apis/wit/workItems/9/comments');
    expect(Object.fromEntries(new URLSearchParams(calls[0].search))).toEqual({
      $top: '50',
      order: 'desc',
      $expand: 'renderedText',
      continuationToken: 'older token/=',
      'api-version': '7.1-preview.4',
    });
    expect(page.cursor).toBe('next+page/1');
    expect(page.comments.map((c) => c.html)).toEqual([
      `<p>Hi ${MENTION}<img src="/api/work-items/9/images/${GUID}?fileName=a.png"></p>`,
      '<p><strong>bold</strong></p>',
      '<p>Plain</p>',
    ]);
    expect(page.comments.map((c) => c.author)).toEqual([
      { id: 'person-1', displayName: 'Person One' },
      { id: 'person-1', displayName: 'Person One' },
      null,
    ]);
    expect(JSON.stringify(page)).not.toContain('example.invalid');

    const last = fakeAdo({ 'GET /workItems/9/comments': () => ({ comments: [] }) });
    expect(await getComments(last.ado, 9, 'Sample')).toEqual({ comments: [], cursor: null });
    expect(last.calls[0].search).not.toContain('continuationToken');
  });

  it('reports a malformed 201 comment response as unknown without repeating it', async () => {
    const { ado, calls } = fakeAdo({
      'POST /workItems/9/comments': () => new Response('{broken', { status: 201 }),
    });
    await expect(
      addComment(ado, 9, { projectId: 'Sample', html: '<p>Synthetic comment</p>' }),
    ).rejects.toMatchObject({ body: { code: 'UNKNOWN_OUTCOME' } });
    expect(calls).toHaveLength(1);
  });

  it('posts HTML with mentions once and reports a lost response as an unknown outcome', async () => {
    const posted = {
      id: 4,
      format: 'html',
      text: `<p>Hi ${MENTION}</p>`,
      createdBy: author,
      createdDate: '2026-01-04T00:00:00Z',
    };
    const { ado, calls } = fakeAdo({ 'POST /workItems/9/comments': () => posted });
    const html = `<p>Hi ${MENTION}<img src="/api/work-items/9/images/${GUID}"></p>`;
    const comment = await addComment(ado, 9, { projectId: 'Sample', html });
    expect(calls).toMatchObject([
      { method: 'POST', path: '/sample-org/Sample/_apis/wit/workItems/9/comments' },
    ]);
    expect(calls[0].search).toBe('?format=html&api-version=7.1-preview.4');
    expect(calls[0].body).toEqual({
      text: `<p>Hi ${MENTION}<img src="https://dev.azure.com/sample-org/_apis/wit/attachments/${GUID}"></p>`,
    });
    expect(comment).toMatchObject({ id: 4, html: posted.text });

    const lost = fakeAdo({
      'POST /workItems/9/comments': () => {
        throw new TypeError('socket hang up');
      },
    });
    await expect(addComment(lost.ado, 9, { projectId: 'Sample', html })).rejects.toMatchObject({
      body: { code: 'UNKNOWN_OUTCOME' },
    });
    expect(lost.calls).toHaveLength(1);

    const garbled = fakeAdo({ 'POST /workItems/9/comments': () => ({ unexpected: true }) });
    await expect(addComment(garbled.ado, 9, { projectId: 'Sample', html })).rejects.toMatchObject({
      body: { code: 'UNKNOWN_OUTCOME' },
    });
  });

  it('serves a comment image only after a comment read showed it', async () => {
    const { ado, calls } = fakeAdo({
      'GET /workitems/9': () => ({
        id: 9,
        rev: 1,
        fields: { 'System.Description': '<p>none</p>' },
      }),
      'GET /workItems/9/comments': () => ({
        comments: [
          {
            id: 1,
            text: `<img src="https://dev.azure.com/sample-org/_apis/wit/attachments/${GUID}">`,
            createdDate: '2026-01-01T00:00:00Z',
          },
        ],
      }),
      [`GET /attachments/${GUID.toUpperCase()}`]: () =>
        new Response('png', { headers: { 'content-type': 'image/png' } }),
    });
    await expect(getImage(ado, 9, GUID)).rejects.toMatchObject({ body: { code: 'NOT_FOUND' } });
    await getComments(ado, 9, 'Sample');
    await expect(getImage(ado, 10, GUID)).rejects.toMatchObject({ body: { code: 'NOT_FOUND' } });
    calls.length = 0;
    expect((await getImage(ado, 9, GUID.toUpperCase())).contentType).toBe('image/png');
    expect(calls.map((c) => c.path)).toEqual([
      `/sample-org/_apis/wit/attachments/${GUID.toUpperCase()}`,
    ]);
  });
});

describe('delete', () => {
  it('moves the item to the recycle bin and never destroys it', async () => {
    const { ado, calls } = fakeAdo({ 'DELETE /workitems/9': () => ({ id: 9, code: 200 }) });
    await deleteWorkItem(ado, 9);
    expect(calls).toMatchObject([
      {
        method: 'DELETE',
        path: '/sample-org/_apis/wit/workitems/9',
        search: '?destroy=false&api-version=7.1',
      },
    ]);
  });

  it('accepts an empty 204 response without decoding it', async () => {
    const { ado, calls } = fakeAdo({
      'DELETE /workitems/9': () => new Response(null, { status: 204 }),
    });
    await expect(deleteWorkItem(ado, 9)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('reports refusal and lost responses without trying again', async () => {
    const denied = fakeAdo({ 'DELETE /workitems/9': () => new Response(null, { status: 403 }) });
    await expect(deleteWorkItem(denied.ado, 9)).rejects.toMatchObject({
      body: { code: 'FORBIDDEN' },
    });
    const lost = fakeAdo({
      'DELETE /workitems/9': () => {
        throw new TypeError('connection reset');
      },
    });
    await expect(deleteWorkItem(lost.ado, 9)).rejects.toMatchObject({
      body: { code: 'UNKNOWN_OUTCOME' },
    });
    expect(lost.calls).toHaveLength(1);
  });
});
