import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { WorkItemView } from '../shared/contracts';
import { workItemQuery } from '../src/lib/queries';
import { expectedRev, pendingOverlay, recordSave, type Save } from '../src/lib/saves';

const state = (
  fields: Save['fields'],
  status: string,
  submittedAt: number,
  error: unknown = null,
) => ({
  save: { fields, baseRev: 1 },
  status,
  error,
  submittedAt,
});

describe('expected revision', () => {
  it('follows our own saves so quick edits use the returned revision', () => {
    recordSave(500, 3, 4);
    recordSave(500, 4, 5);
    expect(expectedRev(500, 3)).toBe(5);
    expect(expectedRev(500, 4)).toBe(5);
  });

  it('does not skip over a change made elsewhere', () => {
    recordSave(501, 3, 4);
    // Someone else moved the item from 4 to 5. An edit begun at 5 sends 5; one begun at 3 sends 4.
    expect(expectedRev(501, 5)).toBe(5);
    expect(expectedRev(501, 3)).toBe(4);
  });

  it('ignores a save that kept its revision', () => {
    // ADO returns the same revision for a write that changes nothing, such as the same title.
    recordSave(502, 6, 6);
    expect(expectedRev(502, 6)).toBe(6);
  });
});

describe('item read', () => {
  const view = (rev: number): WorkItemView => ({
    item: {
      id: 503,
      rev,
      type: 'Task',
      title: 'Sample task',
      state: 'Active',
      assignee: null,
      tags: [],
      areaPath: 'Sample',
      iterationPath: 'Sample',
      parentId: null,
      priority: null,
      remainingWork: null,
      estimate: null,
      project: 'Sample',
      description: '',
      fields: {},
      childIds: [],
    },
    related: [],
    missingIds: [],
    webUrl: null,
  });

  it('reads again when the first read predates a save this tab finished', async () => {
    recordSave(503, 1, 2);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(view(1)))
      .mockResolvedValueOnce(Response.json(view(2)));
    vi.stubGlobal('fetch', fetch);
    const result = await new QueryClient().fetchQuery(workItemQuery(503));
    expect(result.item.rev).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reads once when the read is current', async () => {
    recordSave(504, 1, 2);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...view(2), item: { ...view(2).item, id: 504 } }));
    vi.stubGlobal('fetch', fetch);
    const result = await new QueryClient().fetchQuery(workItemQuery(504));
    expect(result.item.rev).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('pending overlay', () => {
  it('shows the newest unsaved value per field', () => {
    const overlay = pendingOverlay([
      state({ 'System.Title': 'B' }, 'pending', 2),
      state({ 'System.Title': 'A', 'Microsoft.VSTS.Common.Priority': 2 }, 'pending', 1),
    ]);
    expect(overlay['System.Title'].value).toBe('B');
    expect(overlay['Microsoft.VSTS.Common.Priority'].value).toBe(2);
  });

  it('keeps a failed draft visible', () => {
    const overlay = pendingOverlay([state({ 'System.Title': 'Draft' }, 'error', 1, 'conflict')]);
    expect(overlay['System.Title']).toMatchObject({
      value: 'Draft',
      status: 'error',
      error: 'conflict',
    });
  });

  it('does not let an older failure hide a newer successful save', () => {
    const overlay = pendingOverlay([
      state({ 'System.Title': 'Old' }, 'error', 1),
      state({ 'System.Title': 'New' }, 'success', 2),
    ]);
    expect(overlay['System.Title']).toBeUndefined();
  });

  it('keeps a newer failure over an older success', () => {
    const overlay = pendingOverlay([
      state({ 'System.Title': 'Saved' }, 'success', 1),
      state({ 'System.Title': 'Rejected' }, 'error', 2),
    ]);
    expect(overlay['System.Title'].value).toBe('Rejected');
  });

  it('retries only the fields still owned by a partially superseded failure', () => {
    const failed = state({ 'System.State': 'Resolved', 'Custom.Reason': 'Fixed' }, 'error', 1);
    const overlay = pendingOverlay([failed, state({ 'System.State': 'Active' }, 'success', 2)]);
    expect(overlay['Custom.Reason'].save.fields).toEqual({ 'Custom.Reason': 'Fixed' });
    expect(failed.save.fields['System.State']).toBe('Resolved');
  });
});
