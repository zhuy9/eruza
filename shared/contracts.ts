import { z } from 'zod';

export const identitySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
});

export const projectSchema = z.object({ id: z.string(), name: z.string() });
export const sessionSchema = z.object({
  mode: z.enum(['mock', 'ado']),
  status: z.enum(['connected', 'error']),
  user: identitySchema.optional(),
  message: z.string().optional(),
  loginCommand: z.string().optional(),
});

export const workItemSchema = z.object({
  id: z.number().int(),
  rev: z.number().int(),
  projectId: z.string(),
  type: z.string(),
  title: z.string(),
  state: z.string(),
  assignee: identitySchema.nullable(),
  tags: z.array(z.string()),
  areaPath: z.string(),
  iterationPath: z.string(),
  parentId: z.number().int().nullable(),
  priority: z.number().nullable(),
  remainingWork: z.number().nullable(),
  estimate: z.object({ field: z.string(), label: z.string(), value: z.number() }).nullable(),
});

export const workItemListSchema = z.object({
  items: z.array(workItemSchema),
  ancestors: z.array(workItemSchema),
  missingIds: z.array(z.number()),
  incomplete: z.boolean(),
});

export type Identity = z.infer<typeof identitySchema>;
export type SessionInfo = z.infer<typeof sessionSchema>;
export type WorkItemSummary = z.infer<typeof workItemSchema>;
export type WorkItemList = z.infer<typeof workItemListSchema>;
