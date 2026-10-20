import { describe, expect, it } from 'vitest';
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
});
