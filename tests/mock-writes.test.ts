import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { IMAGE_ID } from '../server/mock/fixtures';

const base = 'http://127.0.0.1:3001/api';
const write = { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(`${base}${path}`, {
    method,
    headers: method === 'GET' ? {} : write,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

beforeEach(() => {
  app = createApp(readConfig({ MOCK: '1', PORT: '3001' }));
});

describe('mock create', () => {
  const bug = { projectId: 'sample-project', type: 'Bug' };
  const place = {
    'System.AreaPath': 'Sample project\\Web',
    'System.IterationPath': 'Sample project\\Sprint 3',
  };

  it('reports each missing required field and creates once they are filled', async () => {
    const missing = await call('POST', '/work-items', { ...bug, fields: place });
    expect(missing.status).toBe(400);
    expect(Object.keys(missing.body.fieldErrors).sort()).toEqual([
      'Custom.FoundIn',
      'System.Title',
    ]);

    const created = await call('POST', '/work-items', {
      ...bug,
      fields: { ...place, 'System.Title': 'Totals drift', 'Custom.FoundIn': 'Release 3' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ type: 'Bug', state: 'New', rev: 1 });
  });

  it('adds a child that is linked to its parent at creation', async () => {
    const created = await call('POST', '/work-items', {
      projectId: 'sample-project',
      type: 'Task',
      fields: { ...place, 'System.Title': 'Check the totals' },
      parentId: 1001,
    });
    expect(created.body.parentId).toBe(1001);
    const parent = await call('GET', '/work-items/1001');
    expect(parent.body.item.childIds).toContain(created.body.id);
  });
});

describe('mock update', () => {
  it('saves quick edits in order using each returned revision, and rejects a stale one', async () => {
    const first = await call('PATCH', '/work-items/1002', {
      expectedRev: 1,
      fields: { 'System.Title': 'First' },
    });
    const second = await call('PATCH', '/work-items/1002', {
      expectedRev: first.body.rev,
      fields: { 'Microsoft.VSTS.Common.Priority': 3 },
    });
    expect(second.body).toMatchObject({ title: 'First', priority: 3, rev: 3 });
    const stale = await call('PATCH', '/work-items/1002', {
      expectedRev: 1,
      fields: { 'System.Title': 'Late' },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');
  });

  it('asks for conditionally required fields and accepts them with the state change', async () => {
    const alone = await call('PATCH', '/work-items/1004', {
      expectedRev: 1,
      fields: { 'System.State': 'Resolved' },
    });
    expect(alone.body.fieldErrors).toEqual({
      'Microsoft.VSTS.Common.ResolvedReason': 'This field is required.',
    });
    const together = await call('PATCH', '/work-items/1004', {
      expectedRev: 1,
      fields: { 'System.State': 'Resolved', 'Microsoft.VSTS.Common.ResolvedReason': 'Fixed' },
    });
    expect(together.body).toMatchObject({ state: 'Resolved', rev: 2 });
  });

  it('assigns by identity ID and unassigns with null', async () => {
    const assigned = await call('PATCH', '/work-items/1004', {
      expectedRev: 1,
      fields: { 'System.AssignedTo': 'person-b' },
    });
    expect(assigned.body.assignee).toEqual({ id: 'person-b', displayName: 'Person B' });
    const cleared = await call('PATCH', '/work-items/1004', {
      expectedRev: 2,
      fields: { 'System.AssignedTo': null },
    });
    expect(cleared.body.assignee).toBeNull();
  });

  it('keeps the revision when a write changes nothing', async () => {
    const same = await call('PATCH', '/work-items/1004', {
      expectedRev: 1,
      fields: { 'System.Title': 'Keep the selected delivery option', 'System.AssignedTo': null },
    });
    expect(same.body.rev).toBe(1);
  });
});

describe('mock parents', () => {
  it('changes and removes a parent without touching either item', async () => {
    const moved = await call('PUT', '/work-items/1002/parent', { parentId: 1010, expectedRev: 1 });
    expect(moved.body.parentId).toBe(1010);
    const removed = await call('PUT', '/work-items/1002/parent', {
      parentId: null,
      expectedRev: 2,
    });
    expect(removed.body.parentId).toBeNull();
    expect((await call('GET', '/work-items/1010')).status).toBe(200);
    expect((await call('GET', '/work-items/1002')).body.item.title).toBe(
      'Simplify the checkout form',
    );
  });

  it('rejects self-parenting and loops clearly', async () => {
    const self = await call('PUT', '/work-items/1001/parent', { parentId: 1001, expectedRev: 1 });
    expect(self.body.message).toMatch(/own parent/);
    const loop = await call('PUT', '/work-items/1001/parent', { parentId: 1050, expectedRev: 1 });
    expect(loop.status).toBe(400);
    expect(loop.body.message).toMatch(/own ancestor/);
  });
});

describe('mock detail', () => {
  it('returns parent and children, and keeps an assignee outside the team', async () => {
    const view = await call('GET', '/work-items/1030');
    expect(view.body.item.assignee).toEqual({ id: 'person-d', displayName: 'Person D' });
    expect(view.body.related.map((i: { id: number }) => i.id)).toEqual([1031]);
    const orphan = await call('GET', '/work-items/1020');
    expect(orphan.body.missingIds).toEqual([9999]);
  });

  it('serves only referenced images and known avatars, with a sandbox policy', async () => {
    const image = await app.request(`${base}/work-items/1001/images/${IMAGE_ID}`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/svg+xml');
    expect(image.headers.get('content-security-policy')).toContain('sandbox');
    expect((await app.request(`${base}/work-items/1002/images/${IMAGE_ID}`)).status).toBe(404);
    expect((await app.request(`${base}/avatars/person-a`)).status).toBe(200);
    expect((await app.request(`${base}/avatars/..%2Fx`)).status).toBe(400);
  });

  it('finds items by ID or title', async () => {
    const byTitle = await call('GET', '/work-items/search?projectId=sample-project&text=checkout');
    expect(byTitle.body.items.map((i: { id: number }) => i.id)).toEqual([1000, 1001, 1002, 1003]);
    const byId = await call('GET', '/work-items/search?projectId=sample-project&text=1040');
    expect(byId.body.items.map((i: { id: number }) => i.id)).toEqual([1040]);
  });
});

describe('mock initial state', () => {
  it('rejects a state a new item cannot start in', async () => {
    const response = await call('POST', '/work-items', {
      projectId: 'sample-project',
      type: 'Bug',
      fields: {
        'System.Title': 'Starts closed',
        'Custom.FoundIn': 'Release 3',
        'System.State': 'Closed',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('A new Bug cannot start in the Closed state.');
  });
});

describe('mock comments', () => {
  const thread = (cursor?: string, projectId = 'sample-project') =>
    `/work-items/1001/comments?${new URLSearchParams({ projectId, ...(cursor && { cursor }) })}`;

  it('pages newest first without repeats', async () => {
    const ids: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const { status, body } = await call('GET', thread(cursor));
      expect(status).toBe(200);
      ids.push(...body.comments.map((c: { id: number }) => c.id));
      cursor = body.cursor ?? undefined;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(ids).size).toBe(23);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it('rejects a bad cursor and a project that does not own the item', async () => {
    expect((await call('GET', thread('-1'))).status).toBe(400);
    expect((await call('GET', thread('next'))).status).toBe(400);
    expect((await call('GET', thread(undefined, 'practice-project'))).status).toBe(404);
    expect((await call('GET', '/work-items/1001/comments')).status).toBe(400);
  });

  it('adds a comment at the top and validates the input', async () => {
    const added = await call('POST', '/work-items/1001/comments', {
      projectId: 'sample-project',
      html: '<p>New note</p>',
    });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ html: '<p>New note</p>', author: { id: 'person-a' } });
    expect((await call('GET', thread())).body.comments[0].id).toBe(added.body.id);
    for (const bad of [
      { projectId: 'sample-project', html: '   ' },
      { projectId: 'sample-project', html: '<p>x</p>', format: 'markdown' },
      { html: '<p>x</p>' },
    ]) {
      expect((await call('POST', '/work-items/1001/comments', bad)).status).toBe(400);
    }
  });
});

describe('mock deletion', () => {
  it('needs a local origin and an empty JSON body, then removes the item', async () => {
    const url = `${base}/work-items/1040`;
    expect((await app.request(url, { method: 'DELETE' })).status).toBe(403);
    const plain = await app.request(url, { method: 'DELETE', headers: { origin: write.origin } });
    expect(plain.status).toBe(400);
    expect((await call('DELETE', '/work-items/1040', { destroy: true })).status).toBe(400);
    expect((await call('GET', '/work-items/1040')).status).toBe(200);

    expect((await call('DELETE', '/work-items/1040', {})).status).toBe(204);
    expect((await call('GET', '/work-items/1040')).status).toBe(404);
    expect((await call('DELETE', '/work-items/1040', {})).status).toBe(404);
  });
});
