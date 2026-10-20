# Stage 1 API

## Boundaries

The browser calls Hono at `/api`. It sends typed inputs, not WIQL, ADO URLs,
access tokens, or arbitrary JSON Patch.

The server offers the same application operations in real and mock mode.
Real operations use small ADO helper functions. Mock operations use synthetic
in-memory records; they do not need to parse WIQL.

This document defines the contract to implement. These types and routes do
not exist yet.

## Main types

| Type                  | Required meaning                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `TeamScope`           | `projectId` and `teamId`                                                                                       |
| `Filters`             | Iteration path, optional assignee, area path, tags, and text                                                   |
| `Identity`            | ADO identity ID, display name, and local avatar URL                                                            |
| `WorkItemSummary`     | ID, revision, project ID, type, title, state, assignee, tags, paths, available numeric fields, and parent ID   |
| `WorkItemDetail`      | Summary plus description, editable field values, parent, and child summaries                                   |
| `WorkItemList`        | Matching items, supporting ancestors, missing IDs, and an `incomplete` flag                                    |
| `FieldDefinition`     | Reference name, label, value type, allowed values, default, required flag, and read-only/system-managed status |
| `BacklogLevel`        | Backlog category and its work item types, including the requirement/story level                                |
| `CreateWorkItemInput` | Project ID, type, fields, and optional parent ID                                                               |
| `UpdateWorkItemInput` | `expectedRev` and changed fields                                                                               |
| `AddCommentInput`     | Editor content with supported identity mentions                                                                |
| `CommentPage`         | Comments and an optional continuation cursor                                                                   |
| `SessionInfo`         | Mock/real mode, connection status, current user when known, and a safe login instruction when needed           |

Use metadata-validated field reference names. Field values can be strings,
numbers, booleans, or null where clearing is valid. HTML is a string that
requires sanitization. Identity input uses a stable ID that the server resolves
to the form expected by ADO.

Do not fabricate zero values for absent numeric fields. Do not use display names
as identity keys. Do not expose identity email fields unless a supported ADO
write needs them internally on the server.

## Application operations

The type names below describe the intended shared contracts. Define them in
`shared/contracts.ts` during implementation and validate inputs at runtime.

```ts
interface BoardsApi {
  getSession(): Promise<SessionInfo>;
  retryConnection(): Promise<SessionInfo>;
  getProjects(): Promise<Project[]>;
  getTeams(projectId: string): Promise<Team[]>;
  getTeamSettings(scope: TeamScope): Promise<TeamSettings>;
  getTeamMembers(scope: TeamScope): Promise<Identity[]>;
  getIterations(scope: TeamScope): Promise<Iteration[]>;
  getAreaPaths(projectId: string): Promise<AreaPath[]>;
  getBacklogs(scope: TeamScope): Promise<BacklogLevel[]>;

  getWorkItemTypes(projectId: string): Promise<WorkItemType[]>;
  getWorkItemStates(projectId: string, type: string): Promise<State[]>;
  getWorkItemFields(projectId: string, type: string): Promise<FieldDefinition[]>;

  getWorkItems(scope: TeamScope, filters: Filters, boardType?: string): Promise<WorkItemList>;
  getWorkItem(id: number): Promise<WorkItemDetail>;
  searchWorkItems(projectId: string, text: string): Promise<SearchResult>;

  createWorkItem(input: CreateWorkItemInput): Promise<WorkItemDetail>;
  updateWorkItem(id: number, input: UpdateWorkItemInput): Promise<WorkItemDetail>;
  setParent(id: number, parentId: number | null, expectedRev: number): Promise<WorkItemDetail>;

  getComments(id: number, cursor?: string): Promise<CommentPage>;
  addComment(id: number, input: AddCommentInput): Promise<Comment>;
  deleteWorkItem(id: number): Promise<void>;
}
```

Only the board supplies `boardType`. The grid always requests all ticket types.
Search returns matching summaries and an incomplete/next-page indication if
there are more results. It must allow direct lookup by item ID.

Project, team, member, and metadata operations handle their upstream pages
inside the server. Comments expose a cursor so the thread can load more.

## Local HTTP routes

Use validated query parameters for filters and metadata selection.
Encode names and paths; never insert raw user input into a URL or WIQL string.

| Method and path                                         | Purpose                                     |
| ------------------------------------------------------- | ------------------------------------------- |
| `GET /api/session`                                      | Mode, current user, and connection status   |
| `POST /api/session/retry`                               | Retry authentication and connection lookup  |
| `GET /api/projects`                                     | Accessible projects                         |
| `GET /api/projects/:projectId/teams`                    | Teams in a project                          |
| `GET /api/projects/:projectId/areas`                    | Area path choices                           |
| `GET /api/projects/:projectId/types`                    | Work item types                             |
| `GET /api/projects/:projectId/states?type=...`          | States for a type                           |
| `GET /api/projects/:projectId/fields?type=...`          | Fields for a type                           |
| `GET /api/projects/:projectId/teams/:teamId/settings`   | Team and area defaults                      |
| `GET /api/projects/:projectId/teams/:teamId/members`    | Team members                                |
| `GET /api/projects/:projectId/teams/:teamId/iterations` | Team sprints and current status             |
| `GET /api/projects/:projectId/teams/:teamId/backlogs`   | Story-level type mapping                    |
| `GET /api/work-items`                                   | Sprint list and supporting ancestors        |
| `GET /api/work-items/search`                            | Parent search by ID or title                |
| `GET /api/work-items/:id`                               | Item detail with parent and children        |
| `POST /api/work-items`                                  | Create, optionally with a parent            |
| `PATCH /api/work-items/:id`                             | Update fields with `expectedRev`            |
| `PUT /api/work-items/:id/parent`                        | Set/change/remove parent with `expectedRev` |
| `GET /api/work-items/:id/comments`                      | Comment page                                |
| `POST /api/work-items/:id/comments`                     | Add a comment                               |
| `DELETE /api/work-items/:id`                            | Recoverable deletion only                   |
| `GET /api/avatars/:identityId`                          | Controlled avatar fetch                     |
| `GET /api/work-items/:id/images/:resourceId`            | Controlled existing image fetch             |

Image resource IDs must be resolved by the server from known item content.
Do not accept an arbitrary remote URL from the browser.

## Server-only ADO helpers

Provide typed functions for:

```ts
getAuthHeader(): Promise<{ Authorization: string }>;
getConnectionData(): Promise<ConnectionData>;
queryByWiql(scope: TeamScope, query: string): Promise<WiqlResult>;
batchGet(ids: number[], options: BatchGetOptions): Promise<BatchGetResult>;
```

`WiqlResult` preserves the returned IDs and query time.
`BatchGetOptions` selects fields and whether relations are needed.
`BatchGetResult` contains items and missing/unreadable IDs.
`batchGet` deduplicates and splits requests into chunks of at most 200.

Also provide typed ADO functions for create, update, parent changes, comments,
delete, types, fields, states, teams, members, area settings, and iterations.
Keep the functions grouped by feature, not one file per endpoint.

Use REST API 7.1 where supported. Comments use their supported preview version.
Pin versions per endpoint and verify any special endpoint, including
`connectionData`, during M2. Do not assume one version works everywhere.

## Important ADO mappings

| Operation          | ADO mechanism                                                               |
| ------------------ | --------------------------------------------------------------------------- |
| Current user       | Organization `_apis/connectionData`, then `authenticatedUser`               |
| Search/list IDs    | Project/team WIQL endpoint                                                  |
| Details            | Work items batch endpoint with selected fields and relations                |
| Create             | Work item type create endpoint with JSON Patch                              |
| Update             | Work item patch with `test /rev` first                                      |
| Parent             | `System.LinkTypes.Hierarchy-Reverse` relation                               |
| Children           | `System.LinkTypes.Hierarchy-Forward` relations                              |
| Field rules        | Project work item type fields with expanded properties, plus field metadata |
| Team area defaults | Team settings and team field values endpoints                               |
| Sprints            | Team iterations endpoint, including current timeframe                       |
| Story types        | Team backlog metadata for the requirement category                          |
| Members            | Teams members API, including all pages                                      |
| Comments           | Comments API with format and continuation handling                          |
| Delete             | Work item delete without permanent destruction                              |

For parent writes, the server finds relation indexes at `expectedRev`.
The client never supplies an array index. Set, change, and remove parent use
one operation with nullable `parentId`.

Create and add-comment requests do not have an existing work item `/rev` patch
contract. Delete also does not use the JSON Patch revision test. Do not claim
revision protection for these operations.

## Errors

Use a consistent response:

```ts
type ApiError = {
  code:
    | 'AUTH_REQUIRED'
    | 'CLI_UNAVAILABLE'
    | 'FORBIDDEN'
    | 'VALIDATION'
    | 'CONFLICT'
    | 'NOT_FOUND'
    | 'RATE_LIMITED'
    | 'NETWORK'
    | 'UNKNOWN_OUTCOME'
    | 'UPSTREAM';
  message: string;
  fieldErrors?: Record<string, string>;
  retryAfterMs?: number;
};
```

- Normalize ADO revision failures to a local conflict response.
  Do not detect conflicts only by expecting ADO to return HTTP 409.
- Use field errors only when the field is known. Preserve a useful form-level
  message for other rule failures.
- A network error after sending a write may be `UNKNOWN_OUTCOME`.
  Explain that the user should check before repeating it.
- Return safe messages, not raw headers, CLI output, stack traces, or bodies.
- Keep authorization failures distinct from expired or missing login.

## References

- [WIQL query](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql/query-by-wiql?view=azure-devops-rest-7.1)
- [Work item fields](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-item-types-field/list?view=azure-devops-rest-7.1)
- [Backlog metadata](https://learn.microsoft.com/en-us/rest/api/azure/devops/work/backlogs/list?view=azure-devops-rest-7.1)
- [Add comment](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/comments/add-comment?view=azure-devops-rest-7.1)
- [Comment pages](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/comments/get-comments?view=azure-devops-rest-7.1)
- [Recoverable deletion](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/delete?view=azure-devops-rest-7.1)
