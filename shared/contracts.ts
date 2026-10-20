import { z } from 'zod';

export const apiErrorSchema = z.object({
  code: z.enum([
    'AUTH_REQUIRED',
    'CLI_UNAVAILABLE',
    'FORBIDDEN',
    'VALIDATION',
    'CONFLICT',
    'NOT_FOUND',
    'RATE_LIMITED',
    'NETWORK',
    'UNKNOWN_OUTCOME',
    'UPSTREAM',
  ]),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
  retryAfterMs: z.number().optional(),
});

export const identitySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
});

export const sessionSchema = z.object({
  mode: z.enum(['mock', 'ado']),
  status: z.enum(['connected', 'error']),
  user: identitySchema.optional(),
  code: apiErrorSchema.shape.code.optional(),
  message: z.string().optional(),
  loginCommand: z.string().optional(),
});

export const projectSchema = z.object({ id: z.string(), name: z.string(), isDefault: z.boolean() });
export const teamSchema = projectSchema;

export const teamSettingsSchema = z.object({
  defaultAreaPath: z.string(),
  areas: z.array(z.object({ path: z.string(), includeChildren: z.boolean() })),
  defaultIterationPath: z.string().nullable(),
});

export const iterationSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  startDate: z.string().nullable(),
  finishDate: z.string().nullable(),
  timeFrame: z.enum(['past', 'current', 'future']),
});

export const backlogLevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['portfolio', 'requirement', 'task']),
  workItemTypes: z.array(z.string()),
});

export const workItemTypeSchema = z.object({ name: z.string(), color: z.string() });
export const stateSchema = z.object({ name: z.string(), color: z.string(), category: z.string() });

export const fieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const fieldDefinitionSchema = z.object({
  referenceName: z.string(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  readOnly: z.boolean(),
  allowedValues: z.array(fieldValueSchema),
  defaultValue: fieldValueSchema,
});

export const workItemSchema = z.object({
  id: z.number().int(),
  rev: z.number().int(),
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

export const workItemDetailSchema = workItemSchema.extend({
  project: z.string(),
  description: z.string(),
  /** Scalar field values by reference name. Identity values are not included. */
  fields: z.record(z.string(), fieldValueSchema),
  childIds: z.array(z.number()),
});

/** An item plus its parent and children, read in one batch. */
export const workItemViewSchema = z.object({
  item: workItemDetailSchema,
  related: z.array(workItemSchema),
  missingIds: z.array(z.number()),
});

const fieldChanges = z.record(z.string().min(1), fieldValueSchema);

export const createWorkItemSchema = z
  .object({
    projectId: z.string().min(1),
    type: z.string().min(1),
    fields: fieldChanges,
    parentId: z.number().int().positive().optional(),
  })
  .strict();

export const updateWorkItemSchema = z
  .object({
    expectedRev: z.number().int().positive(),
    fields: fieldChanges.refine((fields) => Object.keys(fields).length > 0),
  })
  .strict();

export const setParentSchema = z
  .object({
    parentId: z.number().int().positive().nullable(),
    expectedRev: z.number().int().positive(),
  })
  .strict();

export const searchQuerySchema = z.object({
  projectId: z.string().min(1),
  text: z.string().trim().min(1).max(200),
});

export const searchResultSchema = z.object({
  items: z.array(workItemSchema),
  incomplete: z.boolean(),
});

export const workItemQuerySchema = z.object({
  projectId: z.string().min(1),
  teamId: z.string().min(1),
  iteration: z.string().min(1),
  type: z.string().min(1).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type SessionInfo = z.infer<typeof sessionSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Team = z.infer<typeof teamSchema>;
export type TeamSettings = z.infer<typeof teamSettingsSchema>;
export type Iteration = z.infer<typeof iterationSchema>;
export type BacklogLevel = z.infer<typeof backlogLevelSchema>;
export type WorkItemType = z.infer<typeof workItemTypeSchema>;
export type State = z.infer<typeof stateSchema>;
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export type WorkItemSummary = z.infer<typeof workItemSchema>;
export type WorkItemList = z.infer<typeof workItemListSchema>;
export type WorkItemQuery = z.infer<typeof workItemQuerySchema>;
export type FieldValue = z.infer<typeof fieldValueSchema>;
export type WorkItemDetail = z.infer<typeof workItemDetailSchema>;
export type WorkItemView = z.infer<typeof workItemViewSchema>;
export type CreateWorkItemInput = z.infer<typeof createWorkItemSchema>;
export type UpdateWorkItemInput = z.infer<typeof updateWorkItemSchema>;
export type SetParentInput = z.infer<typeof setParentSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type Binary = { bytes: ArrayBuffer; contentType: string };
export type TeamScope = { projectId: string; teamId: string };

/** Application operations offered by both real and mock mode. */
export interface BoardsApi {
  getSession(): Promise<SessionInfo>;
  retryConnection(): Promise<SessionInfo>;
  getProjects(): Promise<Project[]>;
  getTeams(projectId: string): Promise<Team[]>;
  getTeamSettings(scope: TeamScope): Promise<TeamSettings>;
  getTeamMembers(scope: TeamScope): Promise<Identity[]>;
  getIterations(scope: TeamScope): Promise<Iteration[]>;
  getAreaPaths(projectId: string): Promise<string[]>;
  getBacklogs(scope: TeamScope): Promise<BacklogLevel[]>;
  getWorkItemTypes(projectId: string): Promise<WorkItemType[]>;
  getWorkItemStates(projectId: string, type: string): Promise<State[]>;
  getWorkItemFields(projectId: string, type: string): Promise<FieldDefinition[]>;
  getWorkItems(query: WorkItemQuery): Promise<WorkItemList>;
  getWorkItem(id: number): Promise<WorkItemView>;
  searchWorkItems(projectId: string, text: string): Promise<SearchResult>;
  createWorkItem(input: CreateWorkItemInput): Promise<WorkItemDetail>;
  updateWorkItem(id: number, input: UpdateWorkItemInput): Promise<WorkItemDetail>;
  setParent(id: number, input: SetParentInput): Promise<WorkItemDetail>;
  getAvatar(identityId: string): Promise<Binary>;
  getImage(id: number, resourceId: string): Promise<Binary>;
}
