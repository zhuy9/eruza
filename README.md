# Eruza

**Eruza: Azure DevOps Boards, reimagined.**

Eruza is a local web app in development for Azure DevOps (ADO) Boards. It provides
a state-based board, a grid for sprint meetings, and work item editing.
Azure DevOps remains the source of truth.

## Current status

Stage 1 (M0-M7) is complete. Local automated checks and live checks against a
private test project cover Azure CLI sign-in, metadata and sprint reads, item
creation and editing, parent actions, state changes, comments, mentions, and
recoverable deletion.

You can pick a project, team, and sprint, open items in a side panel
or full page, edit fields and descriptions, create items, and change parents.
The board has metadata-driven state columns, drag moves, and column creation.
Shared filters and the `C` and Cmd/Ctrl+K creation shortcuts work across views.
The meeting grid groups the sprint by person and story in either order, with counts,
remaining work, sortable and resizable columns, inline edits, and drag-to-parent.
It stays responsive with more than 1,000 tickets. Items show a paged comment thread
with rich-text comments and `@` mentions of team members. Items can be copied by ID or
link, opened in Azure DevOps (real mode only), and moved to the ADO Recycle Bin after a
confirmation.

Start with the [current handoff](docs/handoff.md), then read
[milestones and acceptance checks](docs/milestones.md).

## Known limitations

- Only Azure DevOps Services at `dev.azure.com` is supported.
- A sprint view loads at most 5,000 items. A larger result is labeled incomplete.
- The board uses work item states as columns. It does not copy ADO board columns,
  swimlanes, or manual card order.
- Only the Description field is edited as rich text. Other HTML fields, such as a
  bug's repro steps, are not editable. Text with colors, fonts, highlights, or mentions
  stays read-only in Eruza; edit it in Azure DevOps. Attachments cannot be uploaded.
- Tags are edited as text separated by `;`.
- Comments can be added but not edited or deleted. Mention suggestions come from the
  selected team.
- Select fields in the detail panel save on every change, including arrow-key changes
  on Windows.
- Automated checks run in headless Chromium. Screen readers and other browsers have not
  been checked.
- The first download is about 225 KB gzipped, plus about 160 KB for the editor when an
  item first opens.

## Stage 1

- One user, running on localhost.
- One command starts the web client and local server.
- Azure CLI provides the signed-in user's token to the server.
- The browser calls the local server, never the Azure DevOps API directly.
- No hosting, database, app registration, or separate ticket store.
- Multiple projects and teams within one organization.
- Mock mode works without Azure CLI or organization settings.

The grid includes all work item types, with no type filter:

| Meeting view  | Grouping                |
| ------------- | ----------------------- |
| Sprint update | Person > Story > Ticket |
| Sprint retro  | Story > Person > Ticket |

Both views default to the current sprint and allow selecting previous sprints.
A "Group by" bar can reorder those levels or add Type, as a custom grouping.
The board has a separate work item type selector because its columns use that
type's states.

## Stack

- React, TypeScript, and Vite.
- TanStack Query, Router, Table, and Virtual.
- Tailwind CSS and shadcn/ui with Radix.
- dnd-kit, TipTap, and cmdk.
- Node.js with Hono and native `fetch`.
- `@azure/identity` with `AzureCliCredential`.
- Vitest and Playwright, with ESLint and Prettier.

One npm package and one lockfile. Node and dependency versions are pinned.

## Local setup

Mock and real ADO startup have been verified from a clean checkout on macOS.
Mock mode does not need Azure CLI or account settings.

1. Install Node.js `24.14.1` (see `.node-version`) and Azure CLI.
2. Run `npm ci`.
3. Copy `.env.example` to `.env`.
4. Set `MOCK=0` for real ADO access. Set `ADO_ORG` to the organization name,
   not a URL.
5. Optionally set `ADO_DEFAULT_PROJECT`. `PORT` is the local API port.
6. Sign in:

   ```sh
   az login --allow-no-subscriptions
   ```

   If a specific tenant is needed:

   ```sh
   az login --allow-no-subscriptions --tenant <domain>
   ```

7. Check that a token can be acquired without printing it:

   ```sh
   az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query expiresOn --output tsv
   ```

8. Run `npm run dev` and open <http://127.0.0.1:5173>.
   The local API listens on `127.0.0.1` at `PORT` (default `3001`).
   Press Ctrl+C to stop both servers.

Azure CLI must remain installed. The credential uses it to acquire tokens.
Eruza will not run `az boards` commands. Access still depends on the signed-in
user's Azure DevOps permissions.

For mock mode, set `MOCK=1` in `.env` (or skip `.env`; mock is the default) and
run `npm run dev`. Leave organization settings blank. Mock mode does not need
Azure CLI. Mock edits stay in memory and reset when the server restarts.

### Custom branding

Set either or both of these optional values in your ignored `.env` file:

```dotenv
VITE_BRAND_NAME="Sample workspace"
VITE_BRAND_LOGO=/branding/logo.svg
```

Create `public/branding/` and put your logo there, for example
`public/branding/logo.svg`. Use a square image for the sidebar and favicon.
Supported formats are SVG, PNG, WebP, JPEG, GIF, and ICO. The filename may contain
letters, numbers, hyphens, and underscores. Remote URLs and other paths are ignored.

Restart `npm run dev` after changing these settings, or rebuild if using build
output. The name appears in the sidebar and browser tab; the logo replaces the
sidebar mark and favicon. Blank settings keep Eruza's branding. A missing or broken
logo falls back to the default mark and favicon. Long names are shortened visually
to fit the sidebar, with the full name available to screen readers.

Both `.env` and `public/branding/` are ignored by Git. Branding values and logo files
are included in the local browser build, so use only display information in these
`VITE_` settings. Keep account settings and credentials on the server.

### Sample items in Azure DevOps

Mock mode already has sample data. To try Eruza against Azure DevOps, use a test
project, set it as `ADO_DEFAULT_PROJECT`, and run `npm run seed` with `MOCK=0`. It
creates 17 made-up stories, tasks, and bugs: 16 in the current sprint of the project's
default team and one story in the next sprint. It shows the project, team, and sprint
and waits for you to type `yes`. `npm run seed -- --yes` skips that step.

- It stops before creating anything if those types need fields it cannot fill.
- Every sample has the `eruza-sample` tag.
- Some samples are assigned to you and the rest are unassigned, so nobody else gets an
  assignment notice.
- `npm run seed -- --remove` moves the samples to the ADO recycle bin. It only removes
  items that still have the tag. Their IDs and organization are kept in the ignored
  `tmp/sample-ids.json`.
- A second `npm run seed` stops until the earlier samples are removed.

## Checks

| Command            | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| `npm run check`    | Lint, format check, type check, unit/integration tests, build |
| `npm run test:e2e` | Browser tests against mock mode                               |
| `npm run format`   | Format all files with Prettier                                |

Before the first browser test, run `npx playwright install chromium`.

Do not put tokens, passwords, or private keys in `.env`. The file is ignored
because even organization and project names can be private.

## Repo guide

| Path                                         | Purpose                                    |
| -------------------------------------------- | ------------------------------------------ |
| [AGENTS.md](AGENTS.md)                       | Project rules and how to resume work       |
| [CLAUDE.md](CLAUDE.md)                       | Relative symlink to `AGENTS.md`            |
| [docs/requirements.md](docs/requirements.md) | Stage 1 behavior and scope                 |
| [docs/architecture.md](docs/architecture.md) | Folder layout and data flow                |
| [docs/api.md](docs/api.md)                   | API contracts and ADO operations           |
| [docs/milestones.md](docs/milestones.md)     | Work order, acceptance checks, and handoff |
| [docs/privacy.md](docs/privacy.md)           | Rules for a repo intended to be public     |

## Repository visibility

The repository is private during preparation and is intended to become public.
Treat every tracked file as public now. Changing visibility or pushing changes
requires explicit approval. Read the [publication checklist](docs/privacy.md)
before making the repository public.

## License

[MIT](LICENSE).
