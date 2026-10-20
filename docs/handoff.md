# Resume Eruza

## Request and rules

Continue Stage 1 of Eruza, a personal localhost client for Azure DevOps Boards.
Read `AGENTS.md`, `docs/requirements.md`, `docs/architecture.md`,
`docs/api.md`, and `docs/milestones.md`.

For each milestone:

1. Implement the task.
2. Use the installed `ponytail-review` skill on the diff.
3. Fix its findings and review correctness/security separately.
4. Run the required checks and a staged privacy review.
5. Commit locally on `main`, then move to the next milestone.

Do not make product assumptions. Ask if a decision is not covered by the docs.

The user chose mock-mode work first. Build and test the ADO layer with mocked
responses, but leave live acceptance checks open. Do not use the user's Azure
CLI session or real work items yet.

Only the initial plan push was approved. Do not push implementation commits,
deploy, or change repository visibility without explicit approval.

## Git checkpoint

- Branch: `main`. M0 (`34392a6`) is pushed. M1-M4 are committed locally only.
- GitHub was verified private at the M0 push. Keep it private.
- `CLAUDE.md` is a relative symlink to `AGENTS.md`, with Git mode `120000`.

## M1 result: complete

What changed during M1 close-out:

- Moved `MeetingView` into `src/routes/workspace.tsx` (Fast Refresh warning).
- Fixed a `node --watch` restart loop in `npm run dev`: Vite's default config
  loader imports and deletes a temp file. `server/dev.ts` now uses
  `configLoader: 'native'`.
- Removed custom signal handlers. Both servers run in one process, so Ctrl+C
  stops both.
- `ponytail-review` cuts: smaller `.prettierignore`, inlined error handler,
  no `asChild`/Slot in the button, default options removed.
- Correctness fix: the avatar initial now uses the first character.

Evidence (Windows, Node `24.14.1`, npm `11.11.0`):

- `npm run check` passed: lint, format, typecheck, 8 tests, build.
- `npm ci` and `npm run check` passed in a scratch copy of the repo files.
  `npm ci` reported 0 vulnerabilities.
- `npm run test:e2e` passed (1 test): navigation, reload, dark mode,
  keyboard focus, no external requests.
- `npm run dev`: both listeners on `127.0.0.1` only (5173 and 3001).
  `/api/session` through the Vite proxy returned 200. Wrong `Host` and a
  write without origin returned 403. No restarts over 12 idle seconds.
  A real Ctrl+C event stopped both listeners and both Node processes.
- Azure CLI is not installed on this machine, so mock mode ran with it absent.
- Built bundle has no server config, Hono, ADO, or token strings.
- T3 preview showed the shell, Mock mode label, and sample items.

## M2 result: implemented; live check open

What was built:

- `server/auth.ts`: `getAuthHeader()` with an in-memory token, refresh inside
  60 seconds of expiry, and one shared in-flight refresh.
- `server/ado/client.ts`: fixed `dev.azure.com` origin, no redirects,
  dot-segment rejection, `Retry-After` delays (fails fast above 5 seconds),
  and safe error codes.
- `server/ado/metadata.ts`: current user, projects (continuation token),
  teams and members (`$top`/`$skip`), team settings and areas, iterations,
  area paths, backlogs, types, states, and fields.
- `server/ado/work-items.ts`: escaped WIQL, batches of at most 200 with
  bounded concurrency, a 5,000-item limit flag, and one batch per ancestor
  level that stops at story-level types. Mock mode uses the same ancestor walk.
- UI: project, team, and sprint pickers kept in the URL; login banner with
  the exact command and Retry; notices for no/ambiguous current sprint,
  incomplete results, and unreadable linked items.

Evidence (mocked ADO, no live calls):

- `npm run check` passed: lint, format, typecheck, 46 tests, build.
- `npm run test:e2e` passed: 3 tests (shell, scope defaults, login banner).
- Real mode with a made-up org and no Azure CLI on this machine returned
  `CLI_UNAVAILABLE` with the login command and made 0 ADO requests.
- Built bundle has no `@azure`, token, ADO URL, or server config strings.

Assumptions to confirm in the live check (M2.8):

- `connectionData` works with `api-version=7.1-preview`.
- The batch endpoint accepts `System.Parent` in `fields`.
- Iteration `attributes.timeFrame` comes back as `past`/`current`/`future`.
- Team members include `isContainer` for groups.

## M3 result: implemented; live check open

What was built:

- Server: item detail with parent and children from one batch; create with an
  optional parent in the same JSON Patch; field updates and parent changes
  that start with a `/rev` test; parent changes that remove and add relations
  by index at `expectedRev`; ID or title search; avatar and image routes that
  accept only known IDs and serve images with a sandbox CSP.
- Writes accept only known, writable fields. People are sent by unique name,
  which stays on the server. ADO rule errors become field errors. A failed
  patch is a conflict when the item's revision moved.
- Client: side panel (`?item=`) and full page (`/items/:id`) share one editor.
  Saves for one item run in order; a second quick edit uses the revision the
  first save returned, but a change made elsewhere still conflicts. Pending
  and failed values overlay server data, so refreshes never drop a draft.
  Failed saves offer "Save again", "Save together" (with fields ADO requires),
  or "Discard".
- Rich text: TipTap with inline images and tables, DOMPurify for display, and
  a round-trip check. Content the editor would change (colors, fonts,
  highlights, subscripts) stays read-only with an explanation. Opening the
  editor sends no write. The editor loads lazily to keep the main bundle small.
- Create dialog (New button and Add child): type, title, description,
  assignee, priority, tags, area, iteration, and required custom fields, with
  team and sprint defaults. The draft survives server errors.
- `I` assigns the open item to the current user, except while typing or in a
  dialog.

Evidence (mock mode, no live calls):

- `npm run check` passed: lint, format, typecheck, 85 tests, build.
- `npm run test:e2e` passed: 11 tests, including create validation and draft
  keeping, add child in one request, ordered quick edits, conflict recovery,
  state plus required field, parent change/remove/loop, safe rich text with no
  write on open, panel/page consistency, focus, and the `I` shortcut.
- Built bundle has no ADO, token, identity, or fixture strings. The main chunk
  is 180 KB gzipped; the editor chunk is 154 KB gzipped and loads on demand.

Known limits:

- "Description" means `System.Description`. Other HTML fields, such as a Bug's
  repro steps, are not edited yet.
- Styled rich text stays read-only until the editor supports those styles.
- Tags are edited as text separated by `;`.

Assumptions to confirm in the live check (M3.9):

- `connectionData` returns the user's account name in
  `authenticatedUser.properties.Account.$value` (needed for "Assign to me").
- Clearing a field with a JSON Patch `remove` works, including empty fields.
- The revisions endpoint accepts `$expand=relations`.
- A failed `/rev` test returns a 4xx that the revision re-read turns into a
  conflict.

## M4 result: implemented; live check open

What was built:

- Board columns and colors come from the selected type's state metadata. Cards
  show type-colored icons, IDs, titles, assignees, priorities, and tags, sorted
  by priority then ID.
- Drag changes only `System.State`, using the shared per-item save queue.
  Pending moves show immediately. Failures restore the card; conflicts refresh
  item and list data. Required-field failures keep the draft for "Save together"
  in the detail panel. Opening a card and choosing a state is the keyboard path.
- Column "+" uses the shared create form with the selected type and state.
  Rejected initial states keep the draft and show the server's error.
- Shared assignee, area, tag, and ID/title filters stay in the URL across board
  and meeting views. Area choices follow the team's subarea settings; selected
  tags all have to match. Scope changes clear invalid selections.
- Global New, `C`, and Cmd/Ctrl+K open the shared create form. The palette also
  links to the board and meeting views. Shortcuts respect text fields and dialogs.

Review fixes:

- Removed duplicate search state and its timer (14 fewer lines). Clearing filters
  and browser Back now keep the search box and displayed results in sync.
- Added the missing type icon and made the drag preview inert and hidden from
  assistive technology, so it does not expose a second interactive card.
- Updated older browser selectors for the shared filters and moved the
  all-ticket scope checks to the meeting list.
- Correctness and security review found no remaining blocker in the M4 changes.
  State writes use the existing revision-protected server path. No manual rank,
  new external requests, or persistent ticket storage was added.

Evidence (mock mode, no live calls):

- `npm run check` passed: lint, format, typecheck, 92 tests, build.
- `npm run test:e2e` passed: 21 tests, including custom workflows, optimistic
  drag, keyboard moves, rollback, conflict refetch, required-field recovery,
  queued moves, column create rejection, shared filters, scope changes, and
  creation shortcuts.
- The shortcut test waits for native dialog closure before the next keypress.
  Its focused check passed three repeated runs.
- Staged secret-pattern scanning and content privacy review found no secrets or
  private account data. The built JavaScript has no ADO URL, credential module,
  server setting, or synthetic identity markers. `git diff --cached --check` passed.
- Vite reports a non-blocking chunk-size warning. The main chunk is about
  197 KB gzipped; the lazy editor chunk is about 154 KB gzipped.

Limits and next work:

- M4.7 remains open. Actual ADO state rules still need the approved live check.
- Optional filters apply to the returned sprint items in memory. A capped
  server result stays labeled incomplete after filtering.
- Meeting views remain a list preview until M5. Comments and deletion remain M6.

## Machine notes

- The system drive was nearly full (about 10 MB free) and committed memory
  was close to its limit. Vite's dependency bundler once failed with "memory
  allocation failed". Freeing space on the system drive or closing large apps
  avoids this. A stale partial Playwright download in the system temp folder
  (78 MB, from the earlier failed install) was removed.

## Local browser setup

The system drive has very little free space. Keep browser downloads, npm cache,
and temp files in the ignored `tmp/` folder:

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright"
export TEMP="$PWD/tmp/temp" TMP="$PWD/tmp/temp" npm_config_cache="$PWD/tmp/npm-cache"
npx playwright install --only-shell chromium   # already done
npm run test:e2e
```

`tmp/dev-check.ps1` and `tmp/ctrlc.ps1` are ignored local scripts that repeat
the dev-server and Ctrl+C checks.

## Next steps

1. M5 in mock-first mode: meeting grid, both group orders, inline edits,
   parent drops, virtualization, and the 1,000-ticket checks.
2. Leave M2.8, M3.9, M4.7, and later live checks open. They need Azure CLI
   installed, an approved private test organization, and user approval.
