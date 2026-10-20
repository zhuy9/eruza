# Eruza

**Eruza: Azure DevOps Boards, reimagined.**

Eruza is a planned local web app for Azure DevOps (ADO) Boards. It will provide a
state-based board, a grid for sprint meetings, and work item editing.
Azure DevOps remains the source of truth.

## Current status

M0 (plan and repo layout) and M1 (local app shell and mock foundation) are
complete. M2 (Azure CLI sign-in and ADO reads) is implemented and tested with
mocked ADO responses; it has not been checked against a live organization.
Mock mode lets you pick a project, team, and sprint and see read-only sample
work items. The board, meeting grid, and editing are not built yet.

Start with the [current handoff](docs/handoff.md), then read
[milestones and acceptance checks](docs/milestones.md).

## Stage 1

- One user, running on localhost.
- One command will start the web client and local server.
- Azure CLI provides the signed-in user's token to the server.
- The browser calls the local server, never the Azure DevOps API directly.
- No hosting, database, app registration, or separate ticket store.
- Multiple projects and teams within one organization.
- A mock mode will work without Azure CLI or organization settings.

The grid includes all work item types, with no type filter:

| Meeting view  | Grouping                |
| ------------- | ----------------------- |
| Sprint update | Person > Story > Ticket |
| Sprint retro  | Story > Person > Ticket |

Both views default to the current sprint and allow selecting previous sprints.
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

Mock mode works now. Real ADO mode (steps 4-7) needs M2.

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

The current board and meeting pages are a read-only preview, not the finished
board or meeting grid.

## Repository visibility

The repository is private during preparation and is intended to become public.
Treat every tracked file as public now. Changing visibility or pushing changes
requires explicit approval. Read the [publication checklist](docs/privacy.md)
before making the repository public.

## License

[MIT](LICENSE).
