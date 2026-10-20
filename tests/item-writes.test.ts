import { describe, expect, it, vi } from 'vitest';
import { createAdoClient } from '../server/ado/client';
import {
  createWorkItem,
  getImage,
  getWorkItem,
  setParent,
  toAdoImages,
  toLocalImages,
  updateWorkItem,
} from '../server/ado/item';

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
