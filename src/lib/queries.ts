import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query';
import { z } from 'zod';
import {
  backlogLevelSchema,
  commentPageSchema,
  fieldDefinitionSchema,
  identitySchema,
  iterationSchema,
  projectSchema,
  searchResultSchema,
  sessionSchema,
  stateSchema,
  teamSchema,
  teamSettingsSchema,
  workItemListSchema,
  workItemTypeSchema,
  workItemViewSchema,
  type WorkItemQuery,
} from '../../shared/contracts';
import { getJson } from './api';

const e = encodeURIComponent;
const METADATA_STALE_MS = 300_000;
const REFRESH_MS = 45_000;

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => getJson('/session', sessionSchema),
});

export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: () => getJson('/projects', z.array(projectSchema)),
  staleTime: METADATA_STALE_MS,
});

/** Metadata that changes rarely. `path` is relative to /api; undefined disables the query. */
const metadata = <T>(key: unknown[], path: string | undefined, schema: z.ZodType<T>) =>
  queryOptions({
    queryKey: key,
    queryFn: path ? () => getJson(path, schema) : skipToken,
    staleTime: METADATA_STALE_MS,
  });

const projectPath = (projectId: string | undefined, rest: string) =>
  projectId ? `/projects/${e(projectId)}${rest}` : undefined;
const teamPath = (projectId: string | undefined, teamId: string | undefined, rest: string) =>
  teamId ? projectPath(projectId, `/teams/${e(teamId)}${rest}`) : undefined;

export const teamsQuery = (projectId?: string) =>
  metadata(['teams', projectId], projectPath(projectId, '/teams'), z.array(teamSchema));

export const iterationsQuery = (projectId?: string, teamId?: string) =>
  metadata(
    ['iterations', projectId, teamId],
    teamPath(projectId, teamId, '/iterations'),
    z.array(iterationSchema),
  );

export const teamSettingsQuery = (projectId?: string, teamId?: string) =>
  metadata(
    ['team-settings', projectId, teamId],
    teamPath(projectId, teamId, '/settings'),
    teamSettingsSchema,
  );

export const membersQuery = (projectId?: string, teamId?: string) =>
  metadata(
    ['members', projectId, teamId],
    teamPath(projectId, teamId, '/members'),
    z.array(identitySchema),
  );

export const backlogsQuery = (projectId?: string, teamId?: string) =>
  metadata(
    ['backlogs', projectId, teamId],
    teamPath(projectId, teamId, '/backlogs'),
    z.array(backlogLevelSchema),
  );

export const areasQuery = (projectId?: string) =>
  metadata(['areas', projectId], projectPath(projectId, '/areas'), z.array(z.string()));

export const typesQuery = (projectId?: string) =>
  metadata(['types', projectId], projectPath(projectId, '/types'), z.array(workItemTypeSchema));

export const statesQuery = (projectId?: string, type?: string) =>
  metadata(
    ['states', projectId, type],
    type ? projectPath(projectId, `/states?type=${e(type)}`) : undefined,
    z.array(stateSchema),
  );

export const fieldsQuery = (projectId?: string, type?: string) =>
  metadata(
    ['fields', projectId, type],
    type ? projectPath(projectId, `/fields?type=${e(type)}`) : undefined,
    z.array(fieldDefinitionSchema),
  );

export const workItemsQuery = (query?: WorkItemQuery) =>
  queryOptions({
    queryKey: ['work-items', query],
    queryFn: query
      ? () => getJson(`/work-items?${new URLSearchParams(query)}`, workItemListSchema)
      : skipToken,
    refetchInterval: REFRESH_MS,
  });

export const workItemQuery = (id: number) =>
  queryOptions({
    queryKey: ['work-item', id],
    queryFn: () => getJson(`/work-items/${id}`, workItemViewSchema),
    refetchInterval: REFRESH_MS,
  });

/** Newest comments first; each next page is older. Polls only while one page is loaded. */
export const commentsQuery = (id: number, projectId: string) =>
  infiniteQueryOptions({
    queryKey: ['comments', id],
    queryFn: ({ pageParam }) =>
      getJson(
        `/work-items/${id}/comments?${new URLSearchParams(pageParam ? { projectId, cursor: pageParam } : { projectId })}`,
        commentPageSchema,
      ),
    initialPageParam: '',
    getNextPageParam: (page) => page.cursor ?? undefined,
    // A refetch reloads every loaded page, so long threads refresh on focus instead.
    refetchInterval: (query) => ((query.state.data?.pages.length ?? 1) > 1 ? false : REFRESH_MS),
  });

export const searchQuery = (projectId?: string, text = '') =>
  queryOptions({
    queryKey: ['search', projectId, text],
    queryFn:
      projectId && text.trim()
        ? () =>
            getJson(
              `/work-items/search?${new URLSearchParams({ projectId, text: text.trim() })}`,
              searchResultSchema,
            )
        : skipToken,
  });
