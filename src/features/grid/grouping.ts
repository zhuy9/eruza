import type { WorkItemSummary } from '../../../shared/contracts';
import { matchesFilters, UNASSIGNED, type Filters } from '../../lib/filters';

export type Grouping = 'person' | 'story';

/** Story group keys for tickets without a readable story. Story groups use the story's ID. */
export const NO_STORY = 'none';
export const UNAVAILABLE_STORY = 'unavailable';

/** A matching ticket with the keys of its person group and story group. */
export type GridRow = WorkItemSummary & { person: string; story: string };

/** The item itself when it is story-level, else its nearest story-level ancestor. */
export function storyKey(
  item: WorkItemSummary,
  byId: Map<number, WorkItemSummary>,
  storyTypes: Set<string>,
): string {
  const seen = new Set<number>();
  let current = item;
  while (!storyTypes.has(current.type)) {
    if (current.parentId === null || seen.has(current.parentId)) return NO_STORY;
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) return UNAVAILABLE_STORY;
    current = parent;
  }
  return String(current.id);
}

const byPerson = (a: GridRow, b: GridRow) =>
  Number(!a.assignee) - Number(!b.assignee) ||
  (a.assignee?.displayName ?? '').localeCompare(b.assignee?.displayName ?? '') ||
  a.person.localeCompare(b.person);
const LAST_STORIES: Record<string, number> = { [NO_STORY]: 1, [UNAVAILABLE_STORY]: 2 };
const byStory = (a: GridRow, b: GridRow) =>
  (LAST_STORIES[a.story] ?? 0) - (LAST_STORIES[b.story] ?? 0) ||
  (Number(a.story) || 0) - (Number(b.story) || 0);
const isOwnStory = (row: GridRow) => row.story === String(row.id);

/**
 * Grid rows: sprint tickets that match the filters, in group order. Filtered-out tickets
 * and ancestors only label groups. `byId` finds any item a group label needs.
 */
export function gridRows(
  items: WorkItemSummary[],
  byId: Map<number, WorkItemSummary>,
  filters: Filters,
  storyTypes: Set<string>,
  grouping: Grouping,
): GridRow[] {
  const [first, second] = grouping === 'person' ? [byPerson, byStory] : [byStory, byPerson];
  return items
    .filter((item) => matchesFilters(item, filters))
    .map((item) => ({
      ...item,
      person: item.assignee?.id ?? UNASSIGNED,
      story: storyKey(item, byId, storyTypes),
    }))
    .sort(
      (a, b) =>
        first(a, b) || second(a, b) || Number(isOwnStory(b)) - Number(isOwnStory(a)) || a.id - b.id,
    );
}

/** Remaining work summed over the rows that have it. Null when none do; missing is not zero. */
export const remainingTotal = (rows: WorkItemSummary[]) =>
  rows.reduce<number | null>(
    (sum, row) => (row.remainingWork === null ? sum : (sum ?? 0) + row.remainingWork),
    null,
  );
