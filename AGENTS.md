# Eruza project instructions

## Goal

Build Stage 1: a personal localhost client for Azure DevOps Boards.
Azure DevOps owns the work items. Do not add a database or persistent ticket
cache. Do not implement hosting, Entra sign-in, or multi-user support.

## Start here

1. Read `docs/handoff.md` and `docs/milestones.md` for the checkpoint and next work.
2. Read `docs/requirements.md`, `docs/architecture.md`, and `docs/api.md`.
3. Check Git status and preserve existing changes.
4. State the milestone, assumptions, and checks before coding.
5. Work on the requested milestone. If none is named, start with the first open
   milestone whose dependencies are complete.

Read the handoff before running commands or claiming that a feature or check
is complete. If the system drive is low on space, use the `tmp/` paths it lists.

## Project conventions

- Use simple American English in docs, comments, and messages.
- Use one npm package and one lockfile.
- Use React, strict TypeScript, Vite, Hono, and the stack in the README.
- Keep ADO access and tokens on the server.
- Keep all token acquisition behind `getAuthHeader()`.
- Use native `fetch` for ADO REST calls.
- Use ESLint and Prettier. Pin dependencies and commit the lockfile.
- Use small functions and existing library features. Do not add a generic
  plugin system, repository framework, or extra state store.
- Treat ADO HTML and API responses as untrusted data.

## Important behavior

- Grid: all work item types, no type filter.
- Sprint update: Person > Story > Ticket.
- Sprint retro: Story > Person > Ticket.
- Group by the ticket's assignee, not the story's assignee.
- Filter tickets by sprint before adding ancestor records for group labels.
- Board: select one type and fetch its states. Do not hardcode states.
- Use a `/rev` test for every field or parent update.
- Keep saves for one item in order and handle conflicts without losing drafts.
- Preserve existing rich text. Loading an editor must not trigger a save.
- Use metadata for types, fields, backlog levels, and team defaults.
- Mock data must be made up. Never copy real tickets into fixtures.

## Commands and checks

These commands exist and passed at the end of M1:

- `npm run dev`
- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- `npm run check` for lint, formatting, types, unit/integration tests, and build

Run the applicable checks before each commit. Add behavior tests for meaningful
changes. Never mark an unrun check as passed. Mock tests do not prove live ADO
behavior.

## Milestone handoff

- For each milestone: implement, run `ponytail-review` on the diff, fix its
  findings, run the required checks and privacy review, then commit.
- Review correctness and security separately; `ponytail-review` checks only
  unnecessary complexity.
- Commit each milestone before starting the next. Do not push implementation
  commits unless the user approves that action.
- Complete mock-mode work first. Leave live ADO checks open until the user
  provides local configuration and approves live verification.
- Use the acceptance IDs in `docs/milestones.md`.
- Update the milestone status only after its required checks pass.
- Record what changed, commands run, results, skipped checks, and the next step.
- Keep live checks open if access is missing. State the blocker.
- Keep evidence free of private organization names, work item content, and
  personal information.
- Do not silently drop a requirement to close a milestone.

## Git and privacy

- Work on `main` unless the user requests something else.
- Use the configured global Git identity. Do not set a repo-local identity.
- Use conventional commit prefixes.
- Follow `docs/privacy.md` and inspect staged files before every commit.
- Never commit real organization, project, team, tenant, or user details.
- Do not push, deploy, or change visibility without explicit approval for that
  action.

## Instruction file exception

For this project, `AGENTS.md` is the source file and `CLAUDE.md` is a relative
symlink to `AGENTS.md`. This is the requested direction, even if a global
instruction uses the opposite direction.

On Windows, keep `git config core.symlinks true`. Verify that Git records
`CLAUDE.md` with mode `120000` and target `AGENTS.md`.
