import { describe, expect, it } from 'vitest';
import type { WorkItemSummary } from '../shared/contracts';
import { matchesFilters, teamAreas, UNASSIGNED } from '../src/lib/filters';

const item = (overrides: Partial<WorkItemSummary> = {}): WorkItemSummary => ({
  id: 1201,
  rev: 1,
  type: 'Task',
  title: 'Tune the search index',
  state: 'Active',
  assignee: { id: 'person-a', displayName: 'Person A' },
  tags: ['Speed', 'search'],
  areaPath: 'Sample\\Web\\Checkout',
  iterationPath: 'Sample\\Sprint 1',
  parentId: null,
  priority: 2,
  remainingWork: null,
  estimate: null,
  ...overrides,
});

describe('filters', () => {
  it('matches everything when no filter is set', () => {
    expect(matchesFilters(item(), {})).toBe(true);
  });

  it('filters by assignee or unassigned', () => {
    expect(matchesFilters(item(), { assignee: 'person-a' })).toBe(true);
    expect(matchesFilters(item(), { assignee: 'person-b' })).toBe(false);
    expect(matchesFilters(item(), { assignee: UNASSIGNED })).toBe(false);
    expect(matchesFilters(item({ assignee: null }), { assignee: UNASSIGNED })).toBe(true);
  });

  it('includes subareas but not areas that only share a prefix', () => {
    expect(matchesFilters(item(), { area: 'Sample\\Web' })).toBe(true);
    expect(matchesFilters(item(), { area: 'Sample\\Web\\Checkout' })).toBe(true);
    expect(matchesFilters(item({ areaPath: 'Sample\\Website' }), { area: 'Sample\\Web' })).toBe(
      false,
    );
  });

  it('requires every selected tag, ignoring case', () => {
    expect(matchesFilters(item(), { tags: ['speed'] })).toBe(true);
    expect(matchesFilters(item(), { tags: ['speed', 'SEARCH'] })).toBe(true);
    expect(matchesFilters(item(), { tags: ['speed', 'quality'] })).toBe(false);
  });

  it('matches an exact ID or part of the title', () => {
    expect(matchesFilters(item(), { text: '1201' })).toBe(true);
    expect(matchesFilters(item(), { text: '120' })).toBe(false);
    expect(matchesFilters(item(), { text: 'SEARCH idx' })).toBe(false);
    expect(matchesFilters(item(), { text: ' search ' })).toBe(true);
  });

  it('offers team areas and their subareas only where the team includes them', () => {
    const paths = [
      'Sample',
      'Sample\\Web',
      'Sample\\Web\\Checkout',
      'Sample\\Platform',
      'Sample\\Platform\\Jobs',
    ];
    const settings = {
      defaultAreaPath: 'Sample\\Web',
      defaultIterationPath: null,
      areas: [
        { path: 'Sample\\Web', includeChildren: true },
        { path: 'Sample\\Platform', includeChildren: false },
      ],
    };
    expect(teamAreas(paths, settings)).toEqual([
      'Sample\\Web',
      'Sample\\Web\\Checkout',
      'Sample\\Platform',
    ]);
  });
});
