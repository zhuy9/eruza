import type { WorkItemSummary } from '../../../shared/contracts';
import { matchesFilters, UNASSIGNED, type Filters } from '../../lib/filters';

/** A grouping level. Levels are listed outermost first, each at most once. */
export type GroupKey = 'person' | 'story' | 'type';
/** Level names, in the order the Group by bar offers them. */
export const LEVEL_LABELS: Record<GroupKey, string> = {
  person: 'Person',
  story: 'Story',
  type: 'Type',
};
export const GROUP_KEYS = Object.keys(LEVEL_LABELS) as GroupKey[];
/** The meeting presets, by their `grouping` URL value. */
export const PRESETS = {
  person: ['person', 'story'],
  story: ['story', 'person'],
} as const satisfies Record<string, readonly GroupKey[]>;
export type Preset = keyof typeof PRESETS;
export const PRESET_TEXT: Record<Preset, { name: string; description: string }> = {
  person: { name: 'Sprint update', description: 'Each person, their stories, and their tickets.' },
  story: { name: 'Sprint retro', description: 'Each story, the people on it, and their tickets.' },
};

/** Custom levels from the URL's `group` value. Unknown and repeated keys are ignored. */
export function parseLevels(value: unknown): GroupKey[] | undefined {
  if (typeof value !== 'string') return undefined;
  const levels = [...new Set(value.split(','))].filter((key): key is GroupKey =>
    GROUP_KEYS.includes(key as GroupKey),
  );
  return levels.length ? levels : undefined;
}

/** The preset with exactly these levels, if any. */
export const presetOf = (levels: readonly GroupKey[]) =>
  (Object.keys(PRESETS) as Preset[]).find((preset) => PRESETS[preset].join() === levels.join());

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
const ORDER: Record<GroupKey, (a: GridRow, b: GridRow) => number> = {
  person: byPerson,
  story: byStory,
  type: (a, b) => a.type.localeCompare(b.type),
};

/**
 * Grid rows: sprint tickets that match the filters, in group order. Filtered-out tickets
 * and ancestors only label groups. `byId` finds any item a group label needs.
 */
export function gridRows(
  items: WorkItemSummary[],
  byId: Map<number, WorkItemSummary>,
  filters: Filters,
  storyTypes: Set<string>,
  levels: readonly GroupKey[],
): GridRow[] {
  return items
    .filter((item) => matchesFilters(item, filters))
    .map((item) => ({
      ...item,
      person: item.assignee?.id ?? UNASSIGNED,
      story: storyKey(item, byId, storyTypes),
    }))
    .sort((a, b) => {
      for (const key of levels) {
        const order = ORDER[key](a, b);
        if (order) return order;
      }
      return Number(isOwnStory(b)) - Number(isOwnStory(a)) || a.id - b.id;
    });
}

/** Remaining work summed over the rows that have it. Null when none do; missing is not zero. */
export const remainingTotal = (rows: WorkItemSummary[]) =>
  rows.reduce<number | null>(
    (sum, row) => (row.remainingWork === null ? sum : (sum ?? 0) + row.remainingWork),
    null,
  );
