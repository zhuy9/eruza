import { queryOptions, skipToken } from '@tanstack/react-query';
import { z } from 'zod';
import {
  iterationSchema,
  projectSchema,
  sessionSchema,
  teamSchema,
  workItemListSchema,
  type WorkItemQuery,
} from '../../shared/contracts';
import { getJson } from './api';

const e = encodeURIComponent;
const METADATA_STALE_MS = 300_000;

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => getJson('/session', sessionSchema),
});

export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: () => getJson('/projects', z.array(projectSchema)),
  staleTime: METADATA_STALE_MS,
});

export const teamsQuery = (projectId?: string) =>
  queryOptions({
    queryKey: ['teams', projectId],
    queryFn: projectId
      ? () => getJson(`/projects/${e(projectId)}/teams`, z.array(teamSchema))
      : skipToken,
    staleTime: METADATA_STALE_MS,
  });

export const iterationsQuery = (projectId?: string, teamId?: string) =>
  queryOptions({
    queryKey: ['iterations', projectId, teamId],
    queryFn:
      projectId && teamId
        ? () =>
            getJson(
              `/projects/${e(projectId)}/teams/${e(teamId)}/iterations`,
              z.array(iterationSchema),
            )
        : skipToken,
    staleTime: METADATA_STALE_MS,
  });

export const workItemsQuery = (query?: WorkItemQuery) =>
  queryOptions({
    queryKey: ['work-items', query],
    queryFn: query
      ? () => getJson(`/work-items?${new URLSearchParams(query)}`, workItemListSchema)
      : skipToken,
    refetchInterval: 45_000,
  });
