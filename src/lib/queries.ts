import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { projectSchema, sessionSchema, workItemListSchema } from '../../shared/contracts';
import { getJson } from './api';

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => getJson('/session', sessionSchema),
});
export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: () => getJson('/projects', z.array(projectSchema)),
  staleTime: 300_000,
});
export const workItemsQuery = queryOptions({
  queryKey: ['work-items'],
  queryFn: () => getJson('/work-items', workItemListSchema),
  refetchInterval: 45_000,
});
