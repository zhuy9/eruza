import { z } from 'zod';
import type {
  BacklogLevel,
  TeamScope,
  TeamSettings,
  WorkItemList,
  WorkItemQuery,
  WorkItemSummary,
} from '../../shared/contracts';
import { adoError, segment, type Ado } from './client';
import { getBacklogs, getTeamSettings } from './metadata';

const e = segment;
const BATCH_SIZE = 200;
export const QUERY_LIMIT = 5000;
const CONCURRENCY = 4;

const ESTIMATES = [
  ['Microsoft.VSTS.Scheduling.StoryPoints', 'Story Points'],
  ['Microsoft.VSTS.Scheduling.Effort', 'Effort'],
  ['Microsoft.VSTS.Scheduling.Size', 'Size'],
] as const;

export const SUMMARY_FIELDS = [
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'System.AssignedTo',
  'System.Tags',
  'System.AreaPath',
  'System.IterationPath',
  'System.Parent',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  ...ESTIMATES.map(([field]) => field),
];

const number = z.number().optional();
export const identityRef = z.object({
  id: z.string(),
  displayName: z.string(),
  uniqueName: z.string().optional(),
});
const rawItem = z.object({
  id: z.number(),
  rev: z.number(),
  fields: z.object({
    'System.WorkItemType': z.string(),
    'System.Title': z.string(),
    'System.State': z.string(),
    'System.AssignedTo': identityRef.optional(),
    'System.Tags': z.string().optional(),
    'System.AreaPath': z.string(),
    'System.IterationPath': z.string(),
    'System.Parent': number,
    'Microsoft.VSTS.Common.Priority': number,
    'Microsoft.VSTS.Scheduling.RemainingWork': number,
    'Microsoft.VSTS.Scheduling.StoryPoints': number,
    'Microsoft.VSTS.Scheduling.Effort': number,
    'Microsoft.VSTS.Scheduling.Size': number,
  }),
});

/** Maps an ADO work item to a summary. Records assignee unique names on the server only. */
export function toSummary(raw: unknown, identities: Map<string, string>): WorkItemSummary {
  const parsed = rawItem.safeParse(raw);
  if (!parsed.success) throw adoError('UPSTREAM');
  const { id, rev, fields: f } = parsed.data;
  const assignee = f['System.AssignedTo'];
  if (assignee?.uniqueName) identities.set(assignee.id, assignee.uniqueName);
  const estimate = ESTIMATES.find(([field]) => f[field] !== undefined);
  return {
    id,
    rev,
    type: f['System.WorkItemType'],
    title: f['System.Title'],
    state: f['System.State'],
    assignee: assignee ? { id: assignee.id, displayName: assignee.displayName } : null,
    tags: (f['System.Tags'] ?? '')
      .split(';')
      .map((tag) => tag.trim())
      .filter(Boolean),
    areaPath: f['System.AreaPath'],
    iterationPath: f['System.IterationPath'],
    parentId: f['System.Parent'] ?? null,
    priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
    remainingWork: f['Microsoft.VSTS.Scheduling.RemainingWork'] ?? null,
    estimate: estimate
      ? { field: estimate[0], label: estimate[1], value: f[estimate[0]] as number }
      : null,
  };
}

/** Quotes a WIQL string literal. */
export const wiqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function sprintQuery(settings: TeamSettings, iteration: string, type?: string) {
  const areas = settings.areas
    .map((a) => `[System.AreaPath] ${a.includeChildren ? 'UNDER' : '='} ${wiqlString(a.path)}`)
    .join(' OR ');
  return [
    'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
    `AND [System.IterationPath] = ${wiqlString(iteration)}`,
    areas && `AND (${areas})`,
    type && `AND [System.WorkItemType] = ${wiqlString(type)}`,
    'ORDER BY [System.Id]',
  ]
    .filter(Boolean)
    .join(' ');
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Reads summaries in batches of at most 200. Unreadable IDs come back in missingIds. */
export async function batchGet(ado: Ado, projectId: string, ids: number[]) {
  const unique = [...new Set(ids)];
  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) chunks.push(unique.slice(i, i + BATCH_SIZE));
  const pages = await mapLimit(chunks, CONCURRENCY, (chunk) =>
    ado.json<{ value: unknown[] }>(`${e(projectId)}/_apis/wit/workitemsbatch?api-version=7.1`, {
      method: 'POST',
      body: { ids: chunk, fields: SUMMARY_FIELDS, errorPolicy: 'omit' },
    }),
  );
  const items = pages.flatMap((page) =>
    page.value.filter(Boolean).map((raw) => toSummary(raw, ado.identities)),
  );
  const found = new Set(items.map((item) => item.id));
  return { items, missingIds: unique.filter((id) => !found.has(id)) };
}

type ReadLevel = (ids: number[]) => Promise<{ items: WorkItemSummary[]; missingIds: number[] }>;

/**
 * Reads the ancestors needed to group `items`, one deduplicated level at a time.
 * Stops at story-level types, so story parents (features, epics) are not read.
 */
export async function collectAncestors(
  items: WorkItemSummary[],
  backlogs: BacklogLevel[],
  read: ReadLevel,
) {
  const storyTypes = new Set(
    backlogs.filter((b) => b.type === 'requirement').flatMap((b) => b.workItemTypes),
  );
  const ancestors: WorkItemSummary[] = [];
  const missingIds: number[] = [];
  const seen = new Set(items.map((item) => item.id));
  const parentsOf = (list: WorkItemSummary[]) => [
    ...new Set(
      list
        .filter((item) => !storyTypes.has(item.type) && item.parentId !== null)
        .map((item) => item.parentId as number)
        .filter((id) => !seen.has(id)),
    ),
  ];
  for (let level = parentsOf(items); level.length;) {
    level.forEach((id) => seen.add(id));
    const result = await read(level);
    ancestors.push(...result.items);
    missingIds.push(...result.missingIds);
    level = parentsOf(result.items);
  }
  return { ancestors, missingIds };
}

/** Sprint tickets for one team, plus grouping ancestors unless a board type is given. */
export async function getWorkItems(ado: Ado, query: WorkItemQuery): Promise<WorkItemList> {
  const scope: TeamScope = { projectId: query.projectId, teamId: query.teamId };
  const [settings, backlogs] = await Promise.all([
    getTeamSettings(ado, scope),
    query.type ? [] : getBacklogs(ado, scope),
  ]);
  const result = await ado.json<{ workItems: { id: number }[] }>(
    `${e(scope.projectId)}/${e(scope.teamId)}/_apis/wit/wiql?$top=${QUERY_LIMIT + 1}&api-version=7.1`,
    { method: 'POST', body: { query: sprintQuery(settings, query.iteration, query.type) } },
  );
  const incomplete = result.workItems.length > QUERY_LIMIT;
  const ids = result.workItems.slice(0, QUERY_LIMIT).map((item) => item.id);
  const { items, missingIds } = await batchGet(ado, scope.projectId, ids);
  if (query.type) return { items, ancestors: [], missingIds, incomplete };
  const extra = await collectAncestors(items, backlogs, (level) =>
    batchGet(ado, scope.projectId, level),
  );
  return {
    items,
    ancestors: extra.ancestors,
    missingIds: [...missingIds, ...extra.missingIds],
    incomplete,
  };
}
