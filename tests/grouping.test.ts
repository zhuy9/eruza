import { describe, expect, it } from 'vitest';
import type { Identity, WorkItemSummary } from '../shared/contracts';
import {
  gridRows,
  NO_STORY,
  parseLevels,
  presetOf,
  PRESETS,
  remainingTotal,
  storyKey,
  UNAVAILABLE_STORY,
  type GridRow,
} from '../src/features/grid/grouping';
import { UNASSIGNED } from '../src/lib/filters';
import { withPending } from '../src/lib/saves';

const ana: Identity = { id: 'id-ana', displayName: 'Ana Sample' };
const ben: Identity = { id: 'id-ben', displayName: 'Ben Sample' };
const cy: Identity = { id: 'id-cy', displayName: 'Cy Sample' };

const item = (
  id: number,
  type: string,
  assignee: Identity | null,
  parentId: number | null,
  extra: Partial<WorkItemSummary> = {},
): WorkItemSummary => ({
  id,
  rev: 1,
  type,
  title: `Sample item ${id}`,
  state: 'Active',
  assignee,
  tags: [],
  areaPath: 'Sample\\Web',
  iterationPath: 'Sample\\Sprint 1',
  parentId,
  priority: 2,
  remainingWork: null,
  estimate: null,
  ...extra,
});

const storyTypes = new Set(['Story', 'Spike']);
// Matching tickets in the sprint.
const items = [
  item(10, 'Story', ana, null, { estimate: { field: 'Points', label: 'Story Points', value: 5 } }),
  item(11, 'Task', ana, 10, { remainingWork: 3 }),
  item(12, 'Task', ben, 10, { remainingWork: 2 }),
  item(13, 'Bug', null, 10),
  item(14, 'Task', ben, 20, { remainingWork: 1 }), // story outside the sprint
  item(15, 'Task', ana, 30), // intermediate parent (a task) under story 10
  item(16, 'Task', cy, null), // no parent
  item(17, 'Task', cy, 99), // unreadable parent
  item(40, 'Spike', ana, null), // custom story type
  item(41, 'Task', ben, 40),
  item(51, 'Task', ana, 50), // parent is a feature with no story above it
  item(60, 'Feature', cy, null), // not a task or bug, still a ticket
];
// Supporting ancestors read only for group labels.
const ancestors = [
  item(20, 'Story', cy, null, { iterationPath: 'Sample\\Sprint 0' }),
  item(30, 'Task', ben, 10, { iterationPath: 'Sample\\Sprint 0' }),
  item(50, 'Feature', ana, null, { iterationPath: 'Sample' }),
];
const byId = new Map([...ancestors, ...items].map((i) => [i.id, i]));
const keys = (rows: GridRow[]) => rows.map((r) => [r.person, r.story, r.id]);

describe('story keys', () => {
  it('walks to the nearest story-level ancestor', () => {
    const story = (id: number) => storyKey(byId.get(id)!, byId, storyTypes);
    expect(story(10)).toBe('10');
    expect(story(11)).toBe('10');
    expect(story(14)).toBe('20');
    expect(story(15)).toBe('10');
    expect(story(41)).toBe('40');
    expect(story(16)).toBe(NO_STORY);
    expect(story(51)).toBe(NO_STORY);
    expect(story(60)).toBe(NO_STORY);
    expect(story(17)).toBe(UNAVAILABLE_STORY);
  });

  it('stops on a parent loop', () => {
    const loop = new Map([
      [1, item(1, 'Task', null, 2)],
      [2, item(2, 'Task', null, 1)],
    ]);
    expect(storyKey(loop.get(1)!, loop, storyTypes)).toBe(NO_STORY);
  });
});

describe('grid rows', () => {
  it('orders sprint update rows by person, then story, then ticket', () => {
    expect(keys(gridRows(items, byId, {}, storyTypes, PRESETS.person))).toEqual([
      ['id-ana', '10', 10],
      ['id-ana', '10', 11],
      ['id-ana', '10', 15],
      ['id-ana', '40', 40],
      ['id-ana', NO_STORY, 51],
      ['id-ben', '10', 12],
      ['id-ben', '20', 14],
      ['id-ben', '40', 41],
      ['id-cy', NO_STORY, 16],
      ['id-cy', NO_STORY, 60],
      ['id-cy', UNAVAILABLE_STORY, 17],
      [UNASSIGNED, '10', 13],
    ]);
  });

  it('orders sprint retro rows by story, then person, with one story group for everyone', () => {
    expect(keys(gridRows(items, byId, {}, storyTypes, PRESETS.story))).toEqual([
      ['id-ana', '10', 10],
      ['id-ana', '10', 11],
      ['id-ana', '10', 15],
      ['id-ben', '10', 12],
      [UNASSIGNED, '10', 13],
      ['id-ben', '20', 14],
      ['id-ana', '40', 40],
      ['id-ben', '40', 41],
      ['id-ana', NO_STORY, 51],
      ['id-cy', NO_STORY, 16],
      ['id-cy', NO_STORY, 60],
      ['id-cy', UNAVAILABLE_STORY, 17],
    ]);
  });

  it('keeps every matching ticket exactly once, including stories and other types', () => {
    const rows = gridRows(items, byId, {}, storyTypes, PRESETS.person);
    expect(rows.map((r) => r.id).toSorted((a, b) => a - b)).toEqual(
      items.map((i) => i.id).toSorted((a, b) => a - b),
    );
    expect(rows.some((r) => r.id === 20 || r.id === 30 || r.id === 50)).toBe(false);
  });

  it('orders custom levels, such as type, then person', () => {
    const rows = gridRows(items, byId, {}, storyTypes, ['type', 'person']);
    expect(rows.map((r) => [r.type, r.person, r.id])).toEqual([
      ['Bug', UNASSIGNED, 13],
      ['Feature', 'id-cy', 60],
      ['Spike', 'id-ana', 40],
      ['Story', 'id-ana', 10],
      ['Task', 'id-ana', 11],
      ['Task', 'id-ana', 15],
      ['Task', 'id-ana', 51],
      ['Task', 'id-ben', 12],
      ['Task', 'id-ben', 14],
      ['Task', 'id-ben', 41],
      ['Task', 'id-cy', 16],
      ['Task', 'id-cy', 17],
    ]);
  });

  it('filters tickets first, then still labels groups with filtered-out stories', () => {
    const rows = gridRows(items, byId, { assignee: ben.id }, storyTypes, PRESETS.story);
    expect(keys(rows)).toEqual([
      ['id-ben', '10', 12],
      ['id-ben', '20', 14],
      ['id-ben', '40', 41],
    ]);
  });
});

describe('totals', () => {
  it('sums remaining work only from rows that have it', () => {
    expect(remainingTotal([items[0], items[3]])).toBeNull();
    expect(remainingTotal([items[0], items[1], items[2]])).toBe(5);
    expect(remainingTotal([item(1, 'Task', null, null, { remainingWork: 0 })])).toBe(0);
  });
});

describe('pending changes', () => {
  it('moves a row to its new person and story groups before the save finishes', () => {
    const changes = [
      { id: 11, fields: { 'System.AssignedTo': ben.id }, baseRev: 1 },
      { id: 11, parentId: 20, baseRev: 1 },
    ];
    const next = withPending(items[1], changes, [ana, ben]);
    expect(next.assignee).toEqual(ben);
    expect(next.parentId).toBe(20);
    expect(storyKey(next, byId, storyTypes)).toBe('20');
    expect(withPending(items[2], changes, [ana, ben])).toBe(items[2]);
  });

  it('applies state, priority, iteration, and unassign in order', () => {
    const next = withPending(
      items[1],
      [
        {
          id: 11,
          fields: { 'System.State': 'Done', 'Microsoft.VSTS.Common.Priority': 1 },
          baseRev: 1,
        },
        { id: 11, fields: { 'System.IterationPath': 'Sample\\Sprint 2' }, baseRev: 1 },
        { id: 11, fields: { 'System.AssignedTo': null }, baseRev: 1 },
      ],
      [],
    );
    expect(next).toMatchObject({
      state: 'Done',
      priority: 1,
      iterationPath: 'Sample\\Sprint 2',
      assignee: null,
    });
  });
});

describe('grouping levels in the URL', () => {
  it('keeps known levels once, in order, and ignores the rest', () => {
    expect(parseLevels('type,person')).toEqual(['type', 'person']);
    expect(parseLevels('story,story,bogus,type')).toEqual(['story', 'type']);
    expect(parseLevels('bogus')).toBeUndefined();
    expect(parseLevels('')).toBeUndefined();
    expect(parseLevels(['type'])).toBeUndefined();
  });

  it('names the preset only for its exact order', () => {
    expect(presetOf(['person', 'story'])).toBe('person');
    expect(presetOf(['story', 'person'])).toBe('story');
    expect(presetOf(['person'])).toBeUndefined();
    expect(presetOf(['person', 'story', 'type'])).toBeUndefined();
  });
});
