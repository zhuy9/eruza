import { describe, expect, it, vi } from 'vitest';
import { updateWorkItemSchema, workItemDetailSchema } from '../shared/contracts';
import { createAdoClient, validationError } from '../server/ado/client';
import { createWorkItem, getWorkItem, updateWorkItem } from '../server/ado/item';
import { getWorkItemFields } from '../server/ado/metadata';
import { createMockApi } from '../server/mock/api';

const owner = { id: 'outside-person', displayName: 'Outside Person' };
const account = 'outside.person@example.invalid';
const raw = {
  id: 9,
  rev: 4,
  fields: {
    'System.TeamProject': 'Sample',
    'System.WorkItemType': 'Feature',
    'System.Title': 'Review sample work',
    'System.State': 'New',
    'System.AreaPath': 'Sample',
    'System.IterationPath': 'Sample',
    'Custom.Owner': { ...owner, uniqueName: account, descriptor: 'server-only' },
    'Custom.OtherObject': { secret: 'omit this object' },
    'System.CreatedBy': {
      id: 'creator',
      displayName: 'Creator',
      uniqueName: 'creator@example.invalid',
    },
  },
};

function fakeAdo() {
  const writes: { method: string; patch: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      const method = init.method ?? 'GET';
      if (method === 'PATCH' || method === 'POST') {
        writes.push({ method, patch: JSON.parse(String(init.body)) });
        return Response.json({ ...raw, rev: method === 'POST' ? 1 : 5 });
      }
      if (url.pathname.includes('/workitemtypes/')) {
        return Response.json({
          value: [
            {
              referenceName: 'Custom.Owner',
              name: 'Owner',
              alwaysRequired: true,
              allowedValues: [account],
              defaultValue: account,
            },
          ],
        });
      }
      if (url.pathname.endsWith('/fields')) {
        return Response.json({
          value: [
            { referenceName: 'Custom.Owner', type: 'string', isIdentity: true, readOnly: false },
          ],
        });
      }
      return Response.json(raw);
    }),
  );
  const ado = createAdoClient('sample-org', {
    getAuthHeader: async () => ({ Authorization: 'Bearer test' }),
    clearToken() {},
  });
  return { ado, writes };
}

describe('custom identity fields', () => {
  it('keeps person semantics when ADO reports string plus isIdentity', async () => {
    const { ado } = fakeAdo();
    const defs = await getWorkItemFields(ado, 'Sample', 'Feature');
    expect(defs).toEqual([
      {
        referenceName: 'Custom.Owner',
        name: 'Owner',
        type: 'identity',
        required: true,
        readOnly: false,
        allowedValues: [],
        defaultValue: null,
      },
    ]);
    expect(JSON.stringify(defs)).not.toContain(account);
  });

  it('preserves an outside-team person through reads and revision-protected saves', async () => {
    const { ado, writes } = fakeAdo();
    const view = await getWorkItem(ado, 9);
    expect(view.item.fields['Custom.Owner']).toEqual(owner);
    expect(view.item.fields).not.toHaveProperty('Custom.OtherObject');
    expect(view.item.fields).not.toHaveProperty('System.CreatedBy');
    expect(ado.identities.has('creator')).toBe(false);
    expect(workItemDetailSchema.parse(view.item).fields['Custom.Owner']).toEqual(owner);
    expect(JSON.stringify(view)).not.toContain(account);
    expect(JSON.stringify(view)).not.toContain('server-only');
    const saved = await updateWorkItem(ado, 9, {
      expectedRev: view.item.rev,
      fields: { 'Custom.Owner': owner.id },
    });
    expect(writes).toEqual([
      {
        method: 'PATCH',
        patch: [
          { op: 'test', path: '/rev', value: 4 },
          { op: 'add', path: '/fields/Custom.Owner', value: account },
        ],
      },
    ]);
    expect(saved.fields['Custom.Owner']).toEqual(owner);
    expect(JSON.stringify(saved)).not.toContain(account);
  });

  it('creates with a known identity ID and rejects account text or unknown IDs', async () => {
    const { ado, writes } = fakeAdo();
    ado.identities.set(owner.id, account);
    const created = await createWorkItem(ado, {
      projectId: 'Sample',
      type: 'Feature',
      fields: { 'Custom.Owner': owner.id },
    });
    expect(created.fields['Custom.Owner']).toEqual(owner);
    expect(writes).toEqual([
      { method: 'POST', patch: [{ op: 'add', path: '/fields/Custom.Owner', value: account }] },
    ]);
    for (const value of [account, 'unknown-person']) {
      await expect(
        updateWorkItem(ado, 9, {
          expectedRev: 4,
          fields: { 'Custom.Owner': value },
        }),
      ).rejects.toMatchObject({ body: { code: 'VALIDATION' } });
    }
    expect(writes).toHaveLength(1);
    expect(
      updateWorkItemSchema.safeParse({
        expectedRev: 4,
        fields: { 'Custom.Owner': { ...owner, uniqueName: account } },
      }).success,
    ).toBe(false);
  });

  it('hides account names that ADO quotes in a rejected write', () => {
    const error = validationError({
      message: `The identity value '${account}' for field 'Owner' is an unknown identity.`,
    });
    expect(error.body.message).toBe(
      "The identity value '(account hidden)' for field 'Owner' is an unknown identity.",
    );
  });

  it('keeps an outside-team owner through edits and clears a reviewer in mock mode', async () => {
    const api = createMockApi();
    const existing = (await api.getWorkItem(1000)).item;
    expect(existing.fields['Custom.Owner']).toEqual({ id: 'person-d', displayName: 'Person D' });
    const edited = await api.updateWorkItem(1000, {
      expectedRev: existing.rev,
      fields: { 'Custom.Owner': 'person-b' },
    });
    const renamed = await api.updateWorkItem(1000, {
      expectedRev: edited.rev,
      fields: { 'System.Title': 'Keep the chosen owner' },
    });
    expect(renamed.fields['Custom.Owner']).toEqual({ id: 'person-b', displayName: 'Person B' });
    const assigned = await api.updateWorkItem(1000, {
      expectedRev: renamed.rev,
      fields: { 'Custom.Reviewer': 'person-c' },
    });
    const cleared = await api.updateWorkItem(1000, {
      expectedRev: assigned.rev,
      fields: { 'Custom.Reviewer': null },
    });
    expect(cleared.fields).not.toHaveProperty('Custom.Reviewer');
    expect(cleared.fields['Custom.Owner']).toEqual({ id: 'person-b', displayName: 'Person B' });
  });
});
