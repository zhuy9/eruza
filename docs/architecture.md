# Stage 1 architecture

## Keep the app small

Use one npm package, one lockfile, and one TypeScript codebase with separate
client, server, and shared folders. Use plain functions for ADO operations.
Do not add a monorepo tool or generic repository framework.

The source directories are placeholders at M0. Add files when their milestone
needs them.

## Folder layout

```text
eruza/
  AGENTS.md                  Project instructions
  CLAUDE.md -> AGENTS.md      Relative symlink
  README.md                  Setup and entry point
  LICENSE
  .env.example
  .gitignore
  .gitattributes
  docs/
    requirements.md          What Stage 1 must do
    architecture.md          This file
    api.md                   Contracts and ADO mappings
    milestones.md            Work order, checks, and handoff
    privacy.md               Public repo rules
  src/
    routes/                  Board, grid, item page, route state
    features/
      board/                 State columns and cards
      grid/                  Meeting groups and virtual rows
      work-items/            Create, detail, parent, comments
    components/              Shared controls and shadcn components
    lib/                     HTTP client, queries, shared mutations
  server/
    ado/                     REST calls, metadata, patches, comments
    mock/                    Synthetic fixtures and operations
  shared/                    HTTP types and runtime validation
  tests/                     Integration and browser tests
```

M1 adds `package.json`, the lockfile, Vite and TypeScript config, lint and format
config, test config, and the development entry points.

Planned server files:

- `server/index.ts`: load settings and bind the local listener.
- `server/app.ts`: Hono routes and request validation.
- `server/auth.ts`: `getAuthHeader()` and the in-memory token cache.
- `server/ado/client.ts`: URL building, fetch, API versions, and errors.
- `server/ado/metadata.ts`: projects, teams, members, fields, and states.
- `server/ado/work-items.ts`: WIQL, batch reads, field and parent writes.
- `server/ado/comments.ts`: paged comments and comment creation.
- `shared/contracts.ts`: shared application types and input schemas.

## Request flow

```text
Browser
  -> Vite /api proxy
  -> Hono routes
  -> Typed application operations
  -> ADO REST calls or mock operations
```

The browser never receives an ADO access token.
Only `server/auth.ts` uses the Azure CLI credential.
The ADO layer calls `getAuthHeader()` to authorize requests.

Use relative `/api` URLs in the browser. Keep server-only settings and imports
out of the client bundle. Do not put credentials in `VITE_` variables.

The optional `VITE_BRAND_NAME` and `VITE_BRAND_LOGO` settings are display-only
exceptions: they are intentionally included in the browser build. Custom logo
files live in the ignored `public/branding/` folder and are copied into local
build output. No ADO configuration or credentials are part of branding.

## Local server and configuration

- `npm run dev` starts Vite and Hono, watches both, and stops both on exit.
- Bind both listeners to loopback. Do not use `0.0.0.0`.
- `PORT` selects the Hono port; Vite proxies to that port.
- Validate the Host header and require an allowed local origin for writes.
- Reject browser requests whose `Sec-Fetch-Site` is `cross-site` or `same-site`. Allow a
  missing header, for tests and command-line clients.
- Validate JSON inputs and reject unexpected mutation content types.
- Do not enable broad cross-origin access.
- Build ADO URLs from configured organization and validated IDs or names.
- Do not expose an arbitrary URL proxy or forward tokens across redirects.
- Avatar and image routes resolve approved ADO resources from known IDs.
- Keep real organization settings in ignored local configuration.

`MOCK=1` selects mock operations before credential creation or ADO startup
checks. Missing ADO settings are valid in mock mode.

## Authentication

Use `AzureCliCredential` from `@azure/identity` with scope:

```text
499b84ac-1321-427f-aa17-267ca6975798/.default
```

`package.json` overrides `@azure/msal-node` to 7.1.1. `@azure/identity` 4.14.0
allows only 6.x, which has advisory GHSA-xcx6-jx8p-x3h5. Remove the override
when `@azure/identity` allows 7.1.0 or later.

`getAuthHeader()` returns a Bearer authorization header. Cache the token only in
server memory. Refresh on the next request when fewer than 60 seconds remain
before `expiresOnTimestamp`. Share an in-flight refresh across callers.

On real-mode startup, call the organization's `connectionData` endpoint and
resolve the current user from `authenticatedUser`.
If authentication fails, keep the app available and show:

```sh
az login --allow-no-subscriptions
```

Explain the optional tenant form without guessing a tenant:

```sh
az login --allow-no-subscriptions --tenant <domain>
```

Retry must work after login without restarting the app.
Separate missing CLI/login, permission failure, and network failure messages.
Never log the credential's raw output, token, or authorization header.

## Data reads

- Compile typed filters to WIQL on the server. Escape values correctly.
- Use WIQL for IDs, then fetch selected fields in batches of at most 200.
- Load description and comments only when the user opens an item.
- For hierarchy, request relations and collect missing ancestors.
- Fetch one deduplicated batch set per ancestor level, with a visited-ID set.
- Do not fetch one parent per ticket. Limit request concurrency.
- Ancestors support grouping even when they do not match the sprint filter.
- Preserve missing/unreadable IDs so the UI can explain incomplete results.
- If a query reaches a configured result limit, say the result is incomplete.
  Do not present a partial result or rollup as the full sprint.
- Handle pagination for projects, teams, members, and comments as their
  endpoints require. WIQL is not a continuation-token feed.

Cache metadata longer than work items. Refresh active work views every
45 seconds. Keep UI preferences in local storage if useful, but do not persist
ticket bodies, comments, tokens, or team member data there.

## Data writes

Use JSON Patch with `application/json-patch+json`.
For existing items, start field and relation patches with:

```json
{ "op": "test", "path": "/rev", "value": 7 }
```

The number above is synthetic. In the app it comes from the user's item
revision, not a hardcoded value.

The browser sends field changes or parent IDs, not arbitrary JSON Patch.
Validate fields against the type's metadata.
ADO remains the final authority on permissions and process rules.

For a parent change, locate the old relation at the expected revision, then
remove it and add the new parent in one patch. Preserve all unrelated links.
If the current revision differs, return a conflict instead of substituting it.

Return the saved item and new revision after a successful write.
Serialize client saves per item. Update all relevant Query caches and then
reconcile with the saved response. Preserve pending drafts during refetch.

Do not blindly retry writes. A connection failure can happen after ADO has
accepted a request. In particular, creates and comments can be duplicated.
Honor `Retry-After` when scheduling later requests, including when it appears
on a successful response.

## Rich text and mentions

Choose TipTap extensions to support the ADO content used by the app.
Keep the original content until an actual user edit is accepted.
Test HTML round trips, tables, links, embedded images, and mention attributes.
Sanitize HTML using a maintained library; do not write an HTML sanitizer.

An unsupported editor node must not be silently removed on save.
If safe editing cannot preserve it, explain the limitation and keep the
original content. Record the remaining acceptance gap.

Use the comment's format and safe rendered HTML when available.
Confirm actual ADO mentions in a live integration check.

## Testing boundaries

Use Vitest for pure behavior and server integration tests.
Use browser tests for keyboard access, editing, drag actions, group changes,
and the 1,000-ticket grid.
Use mock mode for repeatable tests without credentials.

Live checks need a private, disposable ADO test area.
Never commit responses, screenshots, or identifiers from that area.
Report mock and live evidence separately.

No extra layer is needed for Stage 2. Keeping auth and ADO access on the server
is enough for this stage. Future login and hosting work has its own scope.

## API references

- [Azure CLI credential](https://learn.microsoft.com/en-us/javascript/api/%40azure/identity/azureclicredential?view=azure-node-preview)
- [Team settings](https://learn.microsoft.com/en-us/rest/api/azure/devops/work/teamsettings/get?view=azure-devops-rest-7.1)
- [Team area values](https://learn.microsoft.com/en-us/rest/api/azure/devops/work/teamfieldvalues/get?view=azure-devops-rest-7.1)
- [Work item batch reads](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-items-batch?view=azure-devops-rest-7.1)
- [Work item updates](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/update?view=azure-devops-rest-7.1)
- [ADO rate limits](https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits?view=azure-devops)
- [TipTap schema behavior](https://tiptap.dev/docs/editor/core-concepts/schema)
