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

The user chose mock-mode work first, then explicitly approved live checks in a
private test project, creation of sprints and disposable items, and mentioning the
signed-in user. Those live checks passed on 2026-10-20. Stage 1 is complete.
The milestone sections below retain the earlier mock-only evidence; the final
live verification section records what was checked afterward.

Each push needs explicit approval. On 2026-10-26 the owner approved pushing `main`
through the Node 24.22.1 update below. Do not push later commits, deploy, or change
repository visibility without new approval.

## Git checkpoint

- Branch: `main`. Everything below, through the Node 24.22.1 update, is on GitHub:
  M0-M9, the audit and review fixes, the README rewrite, the lower-severity review
  fixes, the grid width and phone and tablet layout work, and the Node 24.22.1 update.
- The repository is public (checked with `gh repo view` on 2026-10-22). Every commit is
  public, so keep following `docs/privacy.md`.
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

## M2 result: complete (live check passed 2026-10-20)

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

## M3 result: complete (live check passed 2026-10-20)

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

## M4 result: complete (live check passed 2026-10-20)

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

## Shortcut fix before M5: `bf845b0`

On macOS, the board shortcut test failed in full runs. The cause was a real race:
Cancel closes the native dialog first, and React clears the request only when the
async `close` event fires. A `C` pressed in that gap reused the closing dialog, and the
late event then closed it. Each open now gets its own dialog key. The board keyboard
state-move test now uses select type-ahead, because arrow keys open a closed select on
macOS instead of changing it.

## M5 result: complete (mock mode)

What was built:

- `src/features/grid/grouping.ts`: pure grouping. Each ticket's story is itself when
  it is story-level, else its nearest story-level ancestor (from backlog metadata).
  Rows sort by person then story (update) or story then person (retro), with
  Unassigned, No parent story, and Unavailable story last. Filters apply to tickets
  first; filtered-out tickets and ancestors only label groups.
- `src/features/grid/grid.tsx`: one TanStack Table (v9 grouping and sorting, column
  sizing, resizing, and visibility) and TanStack Virtual rows in a native table with
  spacer rows, `aria-rowcount`, and `aria-rowindex`. Group headings show ticket counts,
  remaining work from tickets that have it, and, in retro only, the story's estimate
  with its own label. Collapse and expand work per group and for all groups.
- Column choices (sort, width, hidden columns) are UI preferences in local storage,
  checked with a schema when loaded. Columns resize by mouse, touch, or the keyboard
  (focus the separator and use the arrow keys).
- Inline state, assignee, priority, and iteration edits use each row's type metadata
  and the shared per-item save queue. Pending values move rows between groups at once;
  an iteration edit removes the row from the sprint view. Failures roll back with a
  toast (shared `useQuickSave`, now also used by the board), except when ADO needs
  other fields: that draft stays for "Save together" in the panel.
- Grid selects save a pick from the open list (pointer or keyboard) at once. Stepping
  through a closed select with arrow keys or type-ahead keeps a draft that saves on
  Enter or blur, so each step is not its own save. A draft keeps the revision it started
  from, so a change made elsewhere meanwhile still conflicts. After a keyboard edit
  moves or removes a row, focus returns to the same control in that row, or to the row
  or group heading now in its place.
- Story headings are dnd-kit drop targets. The drag preview and heading show the
  action before the drop. A drop changes only the parent through the same revision
  check and rollback as the parent picker; self-parenting is rejected without a
  request. The parent picker in the detail panel is the keyboard path.
- Mock fixtures add a synthetic Sprint 1 with 1,070 matching tickets (60 stories,
  some outside the sprint, intermediate parents, no parent, unreadable parents, and
  unassigned tickets).
- The old list preview (`src/routes/workspace.tsx`) and its CSS were removed.

Review fixes (`ponytail-review` plus separate correctness, concurrency, security, and
accessibility reviews, each checked by an adversarial verifier):

- Let the table own sort, size, and visibility state; removed hand-written state
  wrappers, a duplicate number sort, and three ways of hiding the grouping columns.
- A story moved out of the sprint no longer turns its children into "Unavailable story".
- The grid waits for backlog metadata before grouping.
- The priority select no longer shows a second blank option that saved priority 0.
- Added keyboard resizing, keyboard select drafts, focus restore, ticket IDs in
  assignee button names, readable drag announcements, `scroll-padding-top` under the
  sticky header, `color-scheme: dark` for native popups, and a darker muted text color
  (light theme) to meet 4.5:1 contrast.
- `useFilters` returns stable values, so column resizing and scrolling do not rebuild
  the 1,000-ticket rows (checked: 0 rebuilds while resizing and scrolling).
- A second review pass on these fixes found six more issues, now fixed: keyboard picks
  from an open select only drafted, long drafts used a newer revision, a failed
  background backlog refresh hid the grid, focus restore missed group headings and ran
  after pointer edits, the resize handle's name leaked into column header names, and
  the priority cell hid its value while metadata loaded.

Evidence (mock mode, macOS, Node `24.14.1`, npm `11.11.0`, no live calls):

- `npm run check` passed: lint, format, typecheck, 101 tests, build.
- `npm run test:e2e` passed: 33 tests (12 grid tests), in three full runs.
- Grouping unit tests cover both orders, shared stories, parents outside the sprint,
  intermediate parents, custom story types, unassigned, no story, unreadable parents,
  loops, filters before grouping, totals, and pending changes (M5.1-M5.4).
- Browser checks cover both presets on one fixture, totals, collapse and expand, sort,
  resize (mouse and keyboard), hide, the view toggle and reload keeping choices,
  inline edits and rollback across grid, panel, and board, iteration moves, parent
  drops, the keyboard parent path, and self-drop rejection (M5.1-M5.7).
- M5.8: on the 1,070-ticket sprint at 1440x900 (1,385 rows with group headings), at
  most 29 ticket rows were mounted at once (limit 150). A step-by-step scroll reached
  the final row with contiguous, unique row indexes and no uncovered space.
- M5.9: Chromium 156 (Playwright headless shell), 1440x900, 1,070 tickets, measured
  in the page from action to updated DOM, over six runs: switch to retro 45-60 ms, back
  to update 26-29 ms, collapse all 4-11 ms, expand all 13-16 ms, filter by ID 6-12 ms,
  clear filter 14-15 ms, iteration edit removing a row 20-21 ms. These are mock numbers;
  they say nothing about live ADO speed.
- M5.10: loading and scrolling the large grid made 1 list request, 1 member request,
  and 0 per-item requests. With a fake clock, the list refreshed after 45 seconds,
  made no requests during 140 hidden seconds, and refreshed when the page became
  visible again.
- Mutation checks: each new keyboard, draft-revision, and story-move test failed when
  its fix was reverted.
- Headless Chromium on macOS cannot drive a native select menu, so the open-list pick
  is checked with a late `change` after a key press. A live keyboard check on Windows
  and macOS is still worth doing in M7.4.
- Built JavaScript has no ADO URL, credential module, token scope, server setting, or
  fixture strings. Main chunk 223 KB gzipped (was 197 KB; TanStack Table and Virtual).

Limits and next work:

- No live check is listed for M5. The grid uses the M2-M4 read and write paths, whose
  live checks (M2.8, M3.9, M4.7) passed on 2026-10-20.
- The detail panel's selects (from M3) still save on every change, including keyboard
  arrow changes on Windows. The grid's `CellSelect` pattern can be reused there.
- In retro, a story heading shows the story's own estimate even when the story is
  outside the sprint or filtered out. It is a label, not a total; there is no
  estimate total.
- Vite still reports the non-blocking chunk-size warning.

## M6 result: complete (live checks passed 2026-10-20)

What was built:

- `server/ado/comments.ts` reads comments with the comments API `7.1-preview.4`: 50 per
  page, newest first, `$expand=renderedText`, and ADO's continuation token passed through
  as the cursor. ADO's rendered HTML is used when present, so Markdown comments arrive as
  HTML. Authors map to ID and display name; unique names stay on the server. Attachment
  images become local image URLs.
- Add comment posts once as HTML (`format=html`). A lost or unreadable response is
  `UNKNOWN_OUTCOME` and is never repeated automatically.
- The image route also serves a comment attachment after a comment read showed it for that
  item (an in-memory list, no extra ADO reads). Image URL helpers moved to
  `server/ado/images.ts`.
- Delete sends `DELETE _apis/wit/workitems/{id}?destroy=false`. The local route needs the
  usual local origin, JSON, and an empty `{}` body. Success is shown only after ADO answers.
- Item views include `webUrl`, built on the server from the organization, the encoded
  project, and the ID. The schema requires the `https://dev.azure.com/` prefix. Mock mode
  returns null and hides the link.
- Mock mode adds synthetic comments (23 on #1001, three pages of 10; a mention, Markdown,
  and hostile markup on #1003), add comment, and delete.
- The Comments section loads lazily (2.4 KB gzipped). It shows the newest page and "Show
  older comments", drops repeated comment IDs across pages, and sanitizes each comment with
  the existing DOMPurify setup. It polls every 45 seconds only while one page is loaded;
  longer threads refresh on focus and after a new comment.
- The comment box uses the description editor's extensions plus
  `@tiptap/extension-mention`. Typing `@` lists the selected team's members (arrow keys,
  Enter or Tab, Escape); `aria-activedescendant` follows the highlight. Mentions are saved
  as ADO markup. The box is read-only while sending. A failure keeps the draft and says
  whether the comment may already exist.
- Item actions in the panel and full page: Copy ID (the number), Copy link (the Eruza
  full-page URL), Open in Azure DevOps (new tab, `noopener noreferrer`), and Delete.
  Clipboard results and failures show as toasts.
- The delete dialog names the item, explains the Recycle Bin, starts on Cancel, and cannot
  close while the request runs. It waits for the item's queued saves. Success closes the
  panel, or returns from the full page to the board with the view kept, and refreshes lists.
- Found while checking: Escape inside a dialog also closed the detail panel (fixed).
  Native dialogs sat in the top-left corner since M3 because Tailwind's reset removed the
  browser's `margin: auto` (fixed for create and delete). Links with their unsafe `href`
  removed no longer look like links.

Review fixes:

- `ponytail-review`: no direct `@tiptap/suggestion` dependency (the lockfile pins it as
  the mention extension's peer), no Markdown escaping fallback, `toLocaleString` instead of
  a formatter and guard, shared list CSS, and no extra clones in the mock.
- Correctness review: the dialog stays open while deleting, so late errors show; a
  comment saved after the user switched items no longer touches the destroyed editor;
  comment images no longer re-read up to 10 comment pages per image; long threads stop
  polling every page; full-page delete keeps the view. Not changed: mentions use the
  selected team (like the assignee picker), and delete refreshes all item details (like
  parent changes).
- Security review (separate pass): no findings at the reporting bar. Applied its hardening
  note: the comment image list matches only this item's local image URLs. Low notes on the
  shared sanitizer (existing code): `srcset`, `video poster`, and `input type=image` can
  load outside images, and SVG links skip the link hook. DOMPurify still blocks script URLs.

Evidence (mock mode, macOS, Node `24.14.1`, npm `11.11.0`, no live calls):

- `npm run check` passed: lint, format, typecheck, 113 tests, build.
- `npm run test:e2e` passed: 38 tests (5 new), in three full runs.
- Unit tests: comment paging parameters and cursor, rendered Markdown, image rewriting,
  authors without unique names, HTML post with mention markup, lost and unreadable post
  responses (one call, unknown outcome), the comment image list, delete with
  `destroy=false`, refused and lost deletes, web link encoding, mention round trip and
  sanitizing, and the mock comment and delete routes.
- Browser tests: pages in order with a repeated comment dropped (M6.1); safe Markdown,
  mention, and hostile markup with no script dialogs (M6.1); a keyboard mention, and a
  server error and a lost connection that keep the draft with one request per click (M6.2);
  copy ID and link and a blocked clipboard, and the ADO link attributes (M6.4); delete
  Cancel and Escape send nothing, the dialog stays open while deleting, a refusal shows its
  error, success closes the panel, and full-page delete returns to the board (M6.5).
- Mutation checks: removing the repeat filter, adding an automatic retry, clearing the
  draft on error, letting Escape close the panel from a dialog, and letting the dialog close
  while deleting each made a test fail.
- Built JavaScript has no credential module, token scope, server setting, unique names, or
  fixture strings. Its only ADO string is the `https://dev.azure.com/` prefix used to check
  the Open link. Main chunk 225 KB gzipped (was 223); lazy editor chunk 159 KB (was 154).

Assumptions to confirm in the live checks (M6.3, M6.6):

- The comments API accepts `order=desc`, `$expand=renderedText`, and the continuation
  token, and returns `renderedText` for Markdown comments.
- Posting `<a href="#" data-vss-mention="version:2.0,{id}">@Name</a>` with
  `format=html` mentions the person whose ID came from the team members API.
- Delete works without the project in the path, and the item appears in the Recycle Bin.
- `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}` opens the item.

Limits:

- Comments can be added, not edited or deleted. The draft lives in the open editor.
- Mention suggestions come from the selected team, like the assignee picker.
- A description that already contains a mention stays read-only in Eruza (nothing is lost).

## M7 result: complete (live parts passed 2026-10-20)

What was checked or changed:

- M7.1: the README now has a "Known limitations" section. M7.1 stays open until the
  live checks pass.
- M7.2 (local part): a fresh clone of `origin/main` (`2c27ce6`) on macOS ran `npm ci`
  (0 vulnerabilities) and `npm run check` (113 tests), with `.env` copied from
  `.env.example`. `npm run dev` listened on `127.0.0.1` only (5173 and 3001),
  `/api/session` through the proxy returned the mock session, a wrong `Host` got 403, and
  SIGINT stopped both servers. `npm run test:e2e` passed (38 tests) and `npm run format`
  changed nothing. Every script named in the README and `AGENTS.md` exists. The Playwright
  browser was already cached, so `npx playwright install chromium` was not rerun. Live
  startup (README steps 4-7) is open.
- M7.3: `npm audit` and `npm audit --omit=dev` found 0 vulnerabilities. `npm outdated`
  lists only major versions we do not need: `@types/node` 26 (Node 24 is pinned) and
  TypeScript 7.
- M7.4: `tests/e2e/a11y.spec.ts` runs axe-core (`@axe-core/playwright`, a pinned dev
  dependency) for WCAG 2.0 and 2.1 A and AA in light and dark mode. It covers the board,
  both grid presets, the detail panel with comments, the assignee picker, the mention
  list, the delete dialog, the full item page, the create dialog, the command palette, and
  the login banner. `tests/e2e/keyboard.spec.ts` runs in dark mode. It checks that every
  Tab stop on the board, grid, and detail panel visibly changes when focused, and walks
  through the skip link, `C`, create, a comment, delete (with Escape and focus return), and
  the command palette by keyboard alone. Older tests cover grid keyboard edits and
  resizing, keyboard board moves, the parent picker, and `I`.
- Fixes from these checks:
  - The sidebar logo link was named "Eruza home", which did not include its visible text
    (WCAG 2.5.3). It now takes its name from that text.
  - Since M3, `C` and New opened the create form with focus on Type, not Title:
    `showModal` focuses the first field and overrides React's `autoFocus`. Focus now moves
    to Title after the dialog opens.
  - Enter on Delete right after Escape could open the dialog and then close it at once
    (the same late close event as `bf845b0`). Each open now gets its own key.
- M7.5 review. Mock and unit coverage has no open gap; the live parts wait for M2.8 and
  M3.9.

  | Area              | Covered by                                                                                                                                                 | Live part                     |
  | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
  | Active refresh    | 45-second polling, paused while hidden, resumed on return (grid); same setup for board, detail, and the first comment page                                 | Live timing not measured      |
  | Conflict recovery | `/rev` conflict detection (unit); drafts kept in the panel, board, and grid (browser)                                                                      | M3.9 stale revision           |
  | Token expiry      | Refresh inside 60 seconds, shared refresh, CLI missing vs. login missing, retry without restart (unit); login banner and Retry (app and browser)           | M2.8                          |
  | Query limits      | 5,000-item cap marks the result incomplete (unit); notice in board and grid and a `+` count (new browser test)                                             | None                          |
  | Rate limits       | `Retry-After` honored before the next request; long waits fail fast with `RATE_LIMITED` (unit); message shown and next refresh recovers (new browser test) | Real 429 responses unverified |

- M7.6: the built JavaScript has no credential module, token scope, `Bearer`, server
  setting names, unique names, axe-core, or fixture strings. Its only ADO string is the
  `https://dev.azure.com/` prefix used to check the Open link. Checked with `grep` on
  `dist/assets/*.js` after `npm run build`.
- M7.7 publication review, at `2c27ce6` plus this M7 work: all history (16 commits,
  including local T3 Code checkpoint refs under `refs/t3/`) has no secrets, tokens,
  personal paths, real organization names, or emails other than `example.invalid` and the
  noreply author addresses. GUIDs in history are the synthetic image ID and the public
  Azure DevOps token scope. No images, screenshots, traces, or recordings are tracked.
  `.env.example` is blank. The LICENSE copyright holder is the only identity. GitHub has
  only `main`, with no pull requests, issues, releases, workflow runs, artifacts,
  deployments, or tags, and the wiki is off. The repository is private. The `refs/t3/`
  refs are local only; never push with `--all` or `--mirror`. Repeat this review just
  before any visibility change.

Evidence (mock mode, macOS, Node `24.14.1`, npm `11.11.0`, no live calls):

- `npm run check` passed: lint, format, typecheck, 113 tests, build.
- `npm run test:e2e` passed: 44 tests (6 new), in three full runs.
- Mutation checks: restoring the old logo label failed the axe test; removing the Title
  focus failed the keyboard walkthrough; removing the dialog key failed the walkthrough in
  2 of 3 runs (the race depends on timing).
- Main chunk 225 KB gzipped; lazy editor chunk 159 KB.

Limits:

- Axe and the focus checks run in headless Chromium. A screen reader and a Windows browser
  have not been tried. The focus check counts any visible change in outline, shadow, fill,
  or border; it does not measure the ring's contrast.

## Final Stage 1 verification (2026-10-20)

Stage 1 is complete. No application code changed during live verification.
The earlier mock evidence and the live evidence below have different scopes.

### Live evidence

The user approved Azure CLI access to the configured private test project,
creating sprints and disposable items, and mentioning only the signed-in user.

- M2.8: the CLI-backed session connected. `connectionData` accepted
  `api-version=7.1-preview`; `authenticatedUser.properties.Account.$value` matched
  the signed-in CLI account. The configured project was private. Its default team,
  members, area/default settings, backlog levels, types, fields, and states loaded.
  Three dated iterations were created and enrolled in the team. Their live
  `timeFrame` values were `past`, `current`, and `future`; the app chose the single
  current sprint. WIQL and a summary batch accepted `System.Parent` and fetched a
  story outside the sprint as a supporting ancestor, without counting it as a
  matching ticket. This team had one person and no groups; `isContainer` was absent.
  Group filtering remains covered by synthetic tests, not this live sample.
- M3.9: disposable story/task creation, field editing, Assign to me, Unassign,
  clearing populated fields, and clearing already-empty fields passed. A stale
  `/rev` write was rejected and surfaced as local `CONFLICT` (HTTP 409), without
  overwriting the saved title. Add child created the relation in one request.
  The revisions endpoint accepted `$expand=relations`; changing and removing a
  parent preserved both items and a separate Related link. Opening the editor
  left the item revision unchanged.
- M4.7: the selected type's actual state metadata supplied the columns. ADO
  rejected a create in a later state under its initial-state rule; creation in
  the initial state succeeded. A later state move succeeded. Inspection of the
  outbound patch confirmed exactly a `/rev` test and `System.State`, with no rank
  field. Both grid presets also loaded the live sprint; the grid had no type filter.
- M6.3: the production HTML comment path sent the approved self-mention from the
  selected team's identity. ADO's comment response preserved the HTML but omitted
  `mentions`, including with all expansion options. That echo was not counted as
  proof. After the user signed in to the collaborative browser, ADO rendered the
  comment as a person mention, marked it as the current user, and opened a contact
  card whose name and account matched the signed-in identity. No other person was
  mentioned. Email delivery was not checked.
- M6.6: HTML comment creation and reads, rendered Markdown, descending order, and
  a real continuation token passed. A three-comment thread was read with a
  two-comment upstream page, then the cursor was passed through Eruza for the
  remaining comment, with no repeat. The generated ADO web link returned the item
  page and opened it in the signed-in browser. All nine disposable work items were
  deleted with `destroy=false`, using the project-free delete path, and each was
  confirmed in the project's Recycle Bin. Nothing was permanently destroyed.
  The three created sprints remain available. Existing work items, sprint dates,
  and team defaults were preserved.
- M7.2: a clean local clone of `main` at `965e71d` ran `npm ci` (0 vulnerabilities)
  and `npm run check` (113 tests and build). Ignored local settings supplied the
  README steps 4-7 values; the user had already completed sign-in. The README token
  expiry command succeeded with its output suppressed. Mock and live `npm run dev`
  startup each passed. Both listeners bound to `127.0.0.1`; the live session
  connected through the Vite proxy without a token in its response. Wrong Host and
  missing write Origin returned 403. Ctrl+C stopped both listeners.
- M7.5: the live board refreshed after about 45.3 seconds. A real concurrent title
  edit caused the detail editor's stale draft to conflict; the draft stayed
  visible, and Save again saved it against the refreshed revision. Session Retry
  reacquired CLI credentials without a restart. With real CLI-backed tokens and
  simulated near-expiry timestamps, a subsequent concurrent read shared one
  refresh (two total acquisitions). Natural token expiration and a real 429 were
  not induced. Expiry timing, query limits, and rate-limit delays/recovery retain
  their unit and mock browser evidence; this run does not claim those upstream
  events occurred.

All assumptions listed under the earlier milestones were checked as described
above. The membership flag assumption could not be exercised with a real group;
the API omitted it for the only person. No production fix was needed.

### Local evidence and privacy

- `npm run check` passed three full runs: twice in the working checkout and once
  in the clean clone (113 unit/integration tests each, plus lint, formatting,
  types, and build).
- `npm run test:e2e` passed three valid full runs (44 browser tests each):
  57.5, 57.3, and 56.5 seconds. One separate attempt had 43 passes and a grid
  drag failure. Its trace showed a document reload before mouse release and no
  second parent write; Vite and React restarted during concurrent file edits.
  The replacement run used a frozen workspace and passed the same drag test.
  No application or test change was needed.
- The required `ponytail-review` on the docs diff found no remaining findings.
  A separate correctness/security/privacy review caught an accidentally changed
  generic milestone-status instruction; its original wording was restored.
  That review found no remaining blocker or private values in the evidence.
- `npm audit` and `npm audit --omit=dev` each found 0 vulnerabilities.
- M7.6: four generated JavaScript assets were inspected. No credential module,
  token scope/header, server setting, unique-name, fixture, axe, private-path, or
  JWT markers were present. The only ADO URL was the public prefix used to check
  the Open link. Main chunk: 225.04 KB gzipped; editor: 159.26 KB. The existing
  chunk-size warning remains.
- M7.7: all 221 blobs reachable from 30 commits across all local refs were scanned
  before the acceptance docs change. No secret, private account identifier, or
  personal-path match was found. No screenshots, recordings, traces, or raw live
  responses are tracked. Account values in `.env.example` are blank; `CLAUDE.md`
  remains mode `120000`, targeting `AGENTS.md`. The global Git identity is used.
  GitHub was private, with one branch, no tags, pull requests, issues, releases,
  workflow runs, artifacts, or deployments, and the wiki disabled. No `refs/t3/`
  refs were remote. Repeat the publication review before changing visibility.
- The staged file/content review, secret and private-value scans, and
  `git diff --cached --check` passed. Only the README and acceptance docs were
  staged; ignored account settings and live helpers were not added.

### Handoff (M7.8)

The README states the remaining Stage 1 limits, including rich-text restrictions,
the 5,000-item cap, detail-panel select behavior, and browser/accessibility scope.
A screen reader and a Windows browser remain untried; no Stage 2 work was added.

The original `.env` was preserved. Live verification helpers and identifiers were
kept in ignored temporary storage, and no private values were added to evidence.
The disposable work items are recoverable in ADO's Recycle Bin. The three dated
sprints remain available for future local use.

The next action is user-directed use or separately scoped work. Pushing any
unpushed commits, deploying, or publishing/changing repository visibility still
requires explicit approval. No push or visibility change was performed.

## Post-acceptance audit fixes

The user requested fixes for the ten audit findings, with one local commit per
finding. Items use the audit finding numbers. These checks use synthetic mock data;
they add no live ADO evidence. Pushing and publication still need explicit approval.

1. Focused text/number fields now commit only after an edit. Leaving an untouched
   field after a refresh adopts the new value without a write. The new browser
   regression failed before the fix and passed afterward. `npm run check` passed
   (113 unit/integration tests), and `npm run test:e2e` passed (45 browser tests).
   Ponytail, separate correctness/security, and staged privacy reviews passed.
2. Retrying a partly superseded save now sends only the fields it still owns.
   Unit and browser regressions failed before the fix and passed afterward; the
   browser checks a failed combined save followed by a successful State edit.
   `npm run check` passed (114 tests), and `npm run test:e2e` passed (46 tests).
   Ponytail, separate correctness/security, and staged privacy reviews passed.
3. A failed detail refresh shows a warning above the cached editor. It no longer
   unmounts the editor or loses comment drafts. The new browser regression failed
   before the fix and passed through failure and recovery afterward.
   `npm run check` passed (114 tests), and `npm run test:e2e` passed (47 tests).
   Ponytail, separate correctness/security, and staged privacy reviews passed.
4. The rich-text guard now rejects unsupported elements and attributes, including
   colored tables, alignment, reversed lists, and media. Supported formatting and
   editor-generated table widths stay editable. The delegated regressions failed
   before implementation; all 32 rich-text tests passed after integration.
   `npm run check` passed (138 tests), and `npm run test:e2e` passed (47 tests).
   Ponytail, separate correctness/security, and staged privacy reviews passed.
5. Unreadable successful write responses now report `UNKNOWN_OUTCOME` from both
   clients, including failed body streams and invalid item responses. Classified
   failures, reads, and empty DELETE 204 responses keep their behavior. Delegated
   unit and root browser regressions failed before the fix. The browser confirms
   one create/comment write, the warning, the draft, and the refreshed comment.
   `npm run check` passed (173 tests), and `npm run test:e2e` passed (49 tests).
   Ponytail, separate correctness/security, and staged privacy reviews passed.

6. A focused grid row stays mounted while it is outside the virtual window, so
   scrolling can no longer drop a keyboard select draft. Spacer rows keep the retained
   row at its real offset. If a keyboard save moves the still-focused row far away
   (for example, in a sorted grid), the grid scrolls it back into view. Three browser
   regressions (draft through scrolling, then Enter, Tab, or Escape) failed before the
   fix and pass now. A review then found the moved-row case; its browser regression
   failed until the scroll fix. `npm run check` passed (173 tests), and
   `npm run test:e2e` passed (53 tests). Ponytail review removed a duplicate jsdom test.
   The separate correctness review found a timing-sensitive group check in an existing
   browser test; it now retries. The security and staged privacy reviews found nothing.
7. Item editors, comment mentions, and Add child now use the item's own project. The
   URL team and sprint apply only when the URL's project is the item's project, so a
   direct link to an item in another project offers that project's members and sprints.
   Open full page, Copy link, and parent/child links keep the URL project and team when
   they match the item. Links from another project's view stay bare, as before. Five of
   the seven new unit tests and all four new browser tests failed before the fix.
   `npm run check` passed (180 tests), and `npm run test:e2e` passed (57 tests). Ponytail
   review removed a duplicate jsdom mention test. The correctness review found only nits:
   the item lookup now matches project names only, and a unit test now covers the URL
   sprint for an item in the workspace project. The security and staged privacy reviews
   found nothing.
8. Required custom person fields now use the person picker in the create dialog, the
   editor, and save recovery, and they send identity IDs. Field metadata keeps ADO's
   `isIdentity` flag and drops person allowed values and defaults, which can hold
   account names. Item details return person fields outside `System.*` with only an ID
   and display name, so an existing value from outside the team shows and re-saves.
   Account names stay on the server, and `System.*` people such as the creator are not
   sent. Required person fields offer no Unassign. ADO validation messages now hide
   quoted account names. All five new unit tests and the browser regression failed
   before the fix. `npm run check` passed (185 tests), and `npm run test:e2e` passed
   (58 tests). One earlier full run overlapped system sleep and timed out in five
   unrelated tests; the rerun passed. Ponytail review shortened `FieldInput` and removed
   mock steps that the browser test repeats. The correctness review had the browser test
   confirm the combined retry. The security review led to the message redaction. The
   staged privacy review found nothing. `docs/api.md` describes the new field values.
9. If team members, team settings, or areas fail to load, saved assignee and area
   filters stay applied instead of being dropped. The filter bar names what failed and
   says those filters are kept but not checked, and the selects show the kept values.
   Loaded metadata, including empty lists, still rules out invalid values, and so does
   cached metadata after a failed background refresh. Six of the eight new unit tests
   and all four new browser cases (board and grid, members and settings) failed before
   the fix. With the alert kept but the old filter logic, the browser cases still failed
   at the kept values. `npm run check` passed (193 tests), and `npm run test:e2e`
   passed (62 tests). The alert sits in the shared filter bar, so a list error is never
   hidden behind it. Ponytail review removed a duplicate browser case and repeated
   checks. The correctness review had the refresh test use invalid values; mutation
   checks showed it now catches both related regressions. The security and staged
   privacy reviews found nothing.

10. Concurrent Retry-After responses can only extend the shared deadline.
    Requests recheck it after authentication and each wait. Three new unit regressions
    failed before the fix and passed afterward: extension while waiting, a shorter
    concurrent delay, and a delay received during authentication. `npm run check`
    passed (117 tests), and `npm run test:e2e` passed (47 tests). Ponytail, separate
    correctness/security, and staged privacy reviews passed. Real 429s were not induced.

## Follow-up engineering review fixes

The user asked for one local commit for each finding from two later code reviews:
three from an engineering review and the no-op save loop from a whole-codebase
review. These fixes use synthetic mock data and add no live ADO evidence. Checks ran
against the full working tree, which held all four fixes.

1. Text and rich-text editors keep the revision of the value they display. A refresh
   that arrives while a field has focus no longer moves that field's base revision,
   so an unseen remote edit now conflicts and keeps the draft instead of being
   overwritten. Leaving an untouched description adopts refreshed text without
   saving. The editor replaces its content only when the document differs, so
   switching tabs keeps the caret in place. New links use the same `rel` the
   sanitizer writes, so saved links match. A new edit after a conflict replaces the
   older failed draft of the same field, so one Discard shows the saved value. This
   covers M3.4, M3.7, and M7.5. The three browser regressions failed before the fix.
   So did the caret, second-edit, and unit checks added after review. `npm run check`
   passed (196 tests), and `npm run test:e2e` passed (69 tests). Ponytail review
   removed redundant request and server checks from the tests. The correctness
   review found the caret jump and the stacked Discard. A second review found two
   cases where the content check still missed (lone newlines and new links); both
   are fixed. The security reviews and the staged privacy review found nothing.

2. A failed session refresh keeps the loaded page mounted and shows the connection
   warning above it, so full-page drafts such as an unsent comment survive the
   failure and recovery. A failure on first load still shows only the warning. The
   detail panel was never affected. The browser regression failed before the fix.
   `npm run check` passed (196 tests), and `npm run test:e2e` passed (69 tests).
   Ponytail, separate correctness and security, and staged privacy reviews found
   nothing.

3. The item view ignores a response older than the revision it holds, so a refresh
   that started during a save can no longer bring back the old value after "Saved".
   The guard uses TanStack Query's `structuralSharing` option on the item query, so it
   also covers a save response that arrives after a newer refresh. The browser
   regression failed before the fix and passed ten repeated runs after it.
   `npm run check` passed (196 tests), and `npm run test:e2e` passed (69 tests).
   Ponytail review found nothing to cut. The correctness review tightened the test's
   "Saved" check. The security and staged privacy reviews found nothing. Known gap:
   when no view of the item is cached yet, for example when the panel opens while a
   board drag is still saving, a first read that started before the save can show
   the older value until the next refresh, at most 45 seconds. The mock cannot
   produce that ordering, and it does not affect what is saved.

4. A save that changes nothing no longer freezes later saves of that item.
   `recordSave` ignores a write that kept its revision, so `expectedRev` cannot loop.
   The mock keeps the revision when a write changes nothing. On 2026-10-21, with the
   user's approval, a live check on one sample item in the private test project showed
   ADO keeping the revision for a write of the same title, the case that looped. Writing
   the same assignee again added a revision there, while the mock treats it as no change.
   The app handles both. Before the fix,
   the unit regression hung, the mock regression failed, and with only the mock
   change the browser regression froze at the next title save. `npm run check`
   passed (196 tests), and `npm run test:e2e` passed (69 tests). Ponytail review
   removed two redundant test checks. The security review found nothing. The
   correctness review noted that removing the guard later would hang the unit test
   instead of failing it; that hang is a loud signal, so the test stays as it is. The
   staged privacy review found nothing.

## Collapsible sidebar

At the user's request, a button under the sidebar footer collapses the sidebar to a
64px icon rail and expands it again. The user chose the rail (logo mark, view icons,
avatar, theme toggle, and the toggle) and remembering the choice in `localStorage`
(`eruza-sidebar`), with no keyboard shortcut. The project and team pickers are hidden
in the rail. Link and logo text stay available to screen readers, and the links show
hover titles. At 600px and below the existing stacked layout is unchanged. A new
browser test covers collapsing, navigating while collapsed, and expanding across
reloads, and the accessibility test now checks the collapsed state in both themes. All
three failed before the change. `npm run check` passed (199 tests), and
`npm run test:e2e` passed (70 tests). Ponytail review replaced a tooltip helper with
plain titles. The correctness review found the logo link losing its name in the rail
and a gap at fractional widths near 600px; both are fixed, and the toggle moved to its
own row so the footer does not squeeze. The security and staged privacy reviews found
nothing. Screenshots of both states at 1440px and 800px were checked.

## shadcn components

The user asked to build more of the UI from shadcn components: Select, Input, Dialog,
and Tooltip. They chose shadcn's Native Select (a styled native `<select>`) over the
Radix Select, and shadcn's Dialog over the native `<dialog>`. Each component is
adapted from the official new-york-v4 registry to the app's colors and focus outline,
like the existing Button, and each step is its own commit.

1. Native Select and Input replace every `<select>` and text or number `<input>`.
   NativeSelect's `className` sizes its wrapper (upstream puts it on the select), so
   width classes work. Grid cells keep a borderless select until hover. The large
   title stays a plain input, and checkboxes stay native. The old `.select` and
   `.input` CSS is gone, and picker triggers match the 36px controls. Screenshots of
   every view in both themes were compared before and after. `npm run check` passed
   (199 tests), and `npm run test:e2e` passed (70 tests). Ponytail review removed an
   unused class. The correctness review found a low-contrast chevron (fixed: 5.2:1),
   a dead minimum-width rule, and 14px text in two toolbars; all are fixed. The
   security and staged privacy reviews found nothing.
2. shadcn's Dialog (Radix, `@radix-ui/react-dialog` 1.3.1) replaces the native
   `<dialog>` for New work item and Delete. The dialogs have no Radix Trigger, so
   closing returns focus to whatever had it before, or to the main content, unless
   something new, such as the created item's panel, already took focus. Both dialogs
   stay open while their request runs. The create dialog ignores clicks outside, so a
   stray click cannot discard the draft, and clicking the overlay keeps focus in the
   dialog so page shortcuts do not fire behind it. Tall dialogs scroll. The new
   browser regression failed before the review fixes, and the keyboard test caught
   the focus return. `npm run check` passed (199 tests), and `npm run test:e2e`
   passed (71 tests). Ponytail review shortened the wrapper. The correctness review
   found a late create success closing a newer dialog, no scrolling, outside clicks
   discarding the draft, lost focus when the opener was gone, an active X while
   deleting, and reversed button order on narrow screens; all are fixed. The
   security and staged privacy reviews found nothing.
3. shadcn's Tooltip (`@radix-ui/react-tooltip` 1.4.1) replaces every `title`: icon
   buttons, the Azure DevOps link, the board avatar, the grid drag handle (opening to
   the left so it never covers the handle above), and the collapsed rail's links and
   toggle. One provider in `main.tsx` uses a 300 ms delay. `WithTooltip` renders
   nothing extra without a label, opens on keyboard focus but not on mouse focus,
   and the detail panel ignores an Escape that a tooltip already used. The new
   browser checks failed before the fixes. `npm run check` passed (199 tests), and
   `npm run test:e2e` passed (73 tests). Ponytail review folded the unused tooltip
   parts into `WithTooltip`. The correctness review found tooltips stuck open behind
   label-less links, tooltips reopening after mouse clicks, Escape closing the panel,
   and the drag-handle overlap; all are fixed. A saved collapsed state still shows
   rail hints in the narrow stacked layout, which is left as is. The security and
   staged privacy reviews found nothing.

## M8 result: complete (mock mode)

The user asked to borrow a configurable "Group by" idea from a separate project's
table view for the meeting grid. A review of that design kept its numbered level chips
and "+ field" buttons, and left out its mouse-only drag reordering, lost-on-reload
state, A-to-Z group order, and lack of virtualization. The user chose a
keyboard-friendly chip bar with Person, Story, and Type levels.

- `docs/requirements.md` and M8 define the behavior (commit `8c995ce`).
- Commit `34e67a4` turned grouping into an ordered list of levels with no change
  to the presets: all 73 browser tests passed unchanged, plus 200 unit tests.
- The feature commit adds `src/features/grid/group-bar.tsx`. Its chips move earlier,
  later, or out with buttons, focus follows the change, and a status region states
  the order. Presets keep `grouping=person|story`. Other orders use only `group=`, so no
  preset link is active, and an order equal to a preset becomes that preset. The Person
  and Story key columns are hidden, a sort on a column that becomes a level is
  dropped, story estimates show only at the outermost level, and the drag handle and
  the no-story-level notice apply only while Story is a level.
- `npm run check` passed (202 tests), and `npm run test:e2e` passed (75 tests). New
  tests cover level order and URL parsing, custom URLs, a drop with Story as the second
  level, the bar from the keyboard, and axe on three levels in both themes.
- Mock timing on the 1,070-ticket sprint (Chromium, 1440x900): adding a level 31 ms,
  moving one 29 ms, collapse all 4 ms and expand all 12 ms with three levels. The
  existing preset timings stayed at or under 35 ms.
- Ponytail review merged the chip buttons and the preset text. The correctness review
  found the preset nav link lighting up on custom views, empty Person and Story
  columns, a saved sort reordering groups, silent level changes for screen readers,
  the story notice hiding the grid without a Story level, and Safari dropping list
  semantics; all are fixed. The security and staged privacy reviews found nothing,
  and no code, names, or text from the other project are in this repo.

## Sample data for live mode

The user asked for made-up data to try Eruza against Azure DevOps. `npm run seed`
(`server/seed.ts`) creates 17 sample items in the current sprint of the default
project's default team, with one story in the next sprint. The README lists the rules:
the `eruza-sample` tag, assignment only to the signed-in user, a typed confirmation
(or `--yes`), and `--remove`, which recycles only tagged items listed in the ignored
`tmp/sample-ids.json` for the same organization. Mock mode only prints a note. Three
unit tests run it against the mock API: the full run and removal, real bugs under
stories, and the refusals (an unfillable required field, a declined target). Ponytail
review found nothing worth cutting. Two rounds of separate correctness and security
reviews led to the tag and organization checks on removal, the confirmation, bug
placement, saving IDs after each create, and clearer messages. `main()` itself has no
unit test. `npm run check` passed (199 tests). The staged privacy review found nothing.
On 2026-10-21 the user approved a live run against the private test project. It
created all 17 items. That project uses the Basic process, so stories were Issues and
the bug samples became Tasks; every state change and both comments succeeded. The
items remain for the user to try, and the no-op check above edited one sample title.

## Favicon

Added `public/favicon.svg` and the icon link in `index.html`. The icon uses the
existing brand's white lowercase e on a rounded indigo square, with vector paths
and no external fonts or resources.

- `npm run check` passed: lint, formatting, types, all 202 tests, and build.
- Local HTTP checks confirmed the icon link, a 200 response with the SVG content
  type, and the same asset and link in the build output.
- A Playwright render confirmed the SVG decodes at 16, 32, and 48 pixels. The
  render was visually checked on light and dark backgrounds. The shared browser's
  snapshot timed out twice, so the installed Playwright browser was used instead.
- Ponytail review and separate correctness, security, and staged privacy reviews
  found no issues. No runtime behavior changed, so no new test was added and the
  full browser suite was not rerun. No live ADO calls were made.
- The existing build chunk-size warning remains. Next step: normal app use; a
  push still needs approval.

## M9 result: complete (mock mode)

The user chose name and logo customization through local configuration.
`VITE_BRAND_NAME` and `VITE_BRAND_LOGO` in the ignored `.env` file change the
sidebar and browser tab. The logo must be an image file under the ignored
`public/branding/` folder. Blank values preserve Eruza's defaults. Broken images
restore the default mark and favicon. Names render as text and truncate visually
without losing the accessible link name. The README describes setup, restart,
supported formats, and the display values copied into a local build.

- M9.1-M9.2: five new unit tests cover blank and independent settings, valid image
  paths, rejected URLs/traversal, literal text, favicon type, and failed-image
  fallback. The first run failed because the new modules did not exist. An initial
  full check caught an environment typing error; explicitly reading the two named
  settings fixed it. `npm run check` then passed with 207 tests and a build.
- M9.3: seven existing shell/accessibility browser tests passed using
  `npm run test:e2e -- --config tmp/branding-check/playwright.config.ts`. Three
  temporary custom-branding checks passed with `custom.config.ts` in that folder:
  light/dark, long names, reload, the collapsed rail, local image loading, tab
  title/favicon, accessible names, no external requests, and broken-image fallback.
  Branding fit at widths 1440, 800, and 375. Mock screenshots were visually checked.
- The test harness served Vite and the mock API on loopback port 5174, leaving the
  existing app on 5173 alone. The full 75-test browser suite was not rerun; the seven
  applicable existing tests and three custom checks were used. No live ADO calls
  were made. A broad mobile-page assertion initially failed: the board is 510px wide
  at a 375px viewport with default branding and with the brand removed. The targeted
  sidebar fit check passes; the existing board overflow is outside M9.
- A separate build with synthetic branding confirmed the name, logo path, and
  image asset were included, while the synthetic private organization value,
  server setting names, token scope, and credential code were absent. Temporary
  logos were removed. Browser test configuration clears local branding overrides.
- Ponytail review and separate correctness/security/privacy reviews found no
  remaining issues. No dependency or API endpoint was added. Staged scanning and
  Git whitespace checks passed. The existing build chunk-size warning remains.

Next step: set either branding value in local configuration if desired. A push
still needs explicit approval.

## Lower-severity review fixes (2026-10-22)

The handoff listed the lower-severity findings from the whole-codebase review as open,
without the list. The list was recovered from that review: 17 findings (S1-S17). Each one
was checked again against the current code before any change. The user asked for one
`fix:` commit per finding. Each fix has a test that failed before it, a simplicity
review, `npm run check`, and the full browser suite. A separate correctness and security
review followed each commit, and the commit was amended when the review found a real
problem. These are mock and unit checks unless noted.

Read-only live checks in the private test project (no writes): adding a comment created a
new item revision (comment count 0 to 1). Adding child links did not change the parent's
revision. No item in the project has an embedded image.

Client fixes:

1. `b92d31a` (S17, which also covers S3): `C`, `I`, and `Cmd/Ctrl+K` are ignored while
   any dialog is open, even after focus drops to the page when a button disables itself.
   Dialogs also keep focus inside while their request runs. A pending create can no longer
   be replaced, losing its result. The old keys unit test was hollow; it is fixed.
2. `5c37dbb` (S5): the search box keeps a local draft, so typing in the middle of the text
   no longer moves the caret to the end. Clear filters and Back still update it.
3. `a6d2d6a` (S2): a State, Area, or Iteration select whose list is empty (loading,
   failed, or no sprints) is disabled with a short note, instead of a text box that saved
   each keystroke. Editor and grid selects now share one control: arrow keys or
   type-ahead on a closed select make a draft that saves on Enter or when you leave the
   field, and Escape cancels it. Mouse choices still save at once. This removes the old
   README limitation about arrow keys on Windows.
4. `70deea8` (S1): after a comment, the item and lists are read again, and the mock adds
   a revision like ADO. The next edit no longer reports a false conflict. Known gap: a save
   sent while the comment is still sending can conflict once; the draft is kept.
5. `3e28573` (S6): a conflict now shows "Azure DevOps now has <field>: <value>" as plain
   text, cut at 200 characters, after the newer item arrives. Save again no longer
   overwrites a value the user never saw.
6. `8256ab6` (S4): a text, rich-text, or stepped-select draft is sent when its editor
   closes, for example on browser Back. Leaving or reloading the page asks first while a
   save is running or a failure is still shown. A save that fails after its editor closed
   shows a toast.
7. `2fc8049` (S14): if the first read of an item is older than a save this tab already
   finished, it reads once more. This closes the known gap from follow-up fix 3, so it
   no longer needs a live check.

Server fixes (built in a separate worktree, then cherry-picked):

8. `eeaa38d` (S9): the Azure CLI token call times out after 30 seconds, so a hung `az`
   no longer blocks every request, and Retry works. A timeout shows the sign-in message.
9. `2aa0d73` (S10): each ADO request times out after 30 seconds, including the body.
   Writes report `UNKNOWN_OUTCOME`, and reads report `NETWORK`. Known limit: a very large
   image on a slow link can hit the 30-second limit.
10. `28c0cfd` (S11): a 502, 503, or 504 after a write is `UNKNOWN_OUTCOME`, so the UI
    asks the user to check instead of inviting a duplicate.
11. `c4fc5b5` (S7): the local API rejects browser requests marked `cross-site` or
    `same-site`. The full browser suite confirms the app's own requests still pass.
12. `2da82aa` (S8): an unknown field makes the server read the org field list once more
    before it rejects the write, so a field added during the session can be saved. A
    failed read no longer drops a newer cached read.
13. `3731dff` (S13): only numbers from 1 to 2,147,483,647 are searched as IDs, so a long
    number no longer breaks the whole parent search.

Not changed:

- S12 (embedded image and avatar routes drop `fileName` and ask for JSON): still open.
  It needs a live image, and adding one is a write that needs the owner's approval.
- S15 (every save reloads the visible lists): accepted. It costs speed only on very
  large sprints, with no correctness risk.
- S16 (the mock does not add a parent revision on link changes): not a bug. The live
  check shows ADO does not either.

Final checks on `main` after all 13 commits: `npm run check` passed (225 unit and
integration tests, plus the build, with the existing chunk-size warning). The first full
`npm run test:e2e` run passed 85 of 86. The capped-result test in `limits.spec.ts` timed
out once; it passed 3 of 3 alone, and the second full run passed 86 of 86 in 2.1 minutes.
Earlier full runs during the fixes had similar one-off timeouts in other specs, each
passing alone and on the next full run. No commit has a Co-Authored-By trailer, at the
owner's request.

## Grid width and phone and tablet layouts (2026-10-22)

The owner asked for a grid that is not a fixed width, then for phone and tablet support.

What changed:

- Grid width: the table fills its scroll area. The owner chose to put the free width
  in an empty last column (an `aria-hidden` cell per row) over giving it to Title, so
  every column keeps its set width and every resize handle follows the pointer. The
  first attempt gave Title the free width. Review found a click on Title's handle saved
  the filled width, its `aria-valuenow` showed the stored size, and columns right of
  Title grew to the left. Default widths: ID 90 to 110 (four-digit IDs were cut off),
  Title 280 to 260, so the default total stays 1140px.
- Phones (600px or less): a compact stacked sidebar (Project and Team side by side,
  nav on one row), the theme button in the brand row, and a bar with the Sprint picker,
  New, and the mode badge. These were hidden before. One-column forms and item fields,
  a full-width filter bar, and a grid as tall as the screen.
- Board: `.board` is positioned, so the hidden assignee names in cards no longer widen
  the page. That had pushed the detail panel and create dialog off-screen. Drag uses
  `MouseSensor` and `TouchSensor` (press and hold for 250 ms) with
  `touch-action: manipulation`, so a swipe on a card scrolls. A touch hold that ends in
  place no longer reloads the page: dnd-kit stops that click before the router sees it,
  so the board cancels it for 50 ms after a touch drag. On touch screens, a tap anywhere
  on a card opens it, and cards show the assignee's name.
- Grid: the ID column and group names stay in view while the grid scrolls sideways.
  Keyboard focus that lands under the sticky ID cell scrolls into view; mouse and touch
  focus does not, so a tap near that edge is not lost. The title link fills its cell.
- Touch screens (`pointer: coarse`): 16px fields (iOS zooms on smaller ones), larger
  group-by buttons, sort buttons, resize handles, drag handles, and dialog X. Without
  hover, editable cells and the title show their border.
- All widths: the topbar wraps; long unbroken words wrap in cards, notices, links,
  and dialogs; rich-text tables scroll inside the text; popovers fit the available
  height; toasts use the screen width; the detail panel's close bar sticks on narrow or
  touch screens.

Checks:

- An audit at 360-1440px with touch found 47 issues. Two later review rounds (phone,
  tablet, desktop comparison with the last commit, correctness, and simplicity, with each
  finding checked by a separate agent) found 37 more, mostly in the new code. All
  confirmed findings were fixed except the ones under "Not done".
- `tests/e2e/mobile.spec.ts` (4 tests, 375x740 with touch): no page-level horizontal
  overflow on five views; sprint, New, and theme controls in view; a card tap opens the
  panel on screen and its close button works after scrolling; a swipe on a card scrolls
  the columns with no write, a hold that ends in place keeps the page, and press, hold,
  and move saves a state; the grid keeps IDs, group indents, and opaque group names,
  moves keyboard focus out from under the ID column, and still opens a ticket tapped
  just past it. All four failed on the last commit, and each later fix's check failed
  with that fix removed. `grid.spec.ts` now checks that the grid fills its view.
- `npm run check` passed (225 tests). `npm run test:e2e` passed 90 of 90. The owner's dev
  server held port 5173, so the browser tests ran in an ignored copy of the repo with the
  ports changed to 5175 and 3003. The existing grid drop test depends on auto-scroll
  timing: it also failed on the last commit under `--repeat-each`, and passed in the full
  runs.
- Chromium device emulation only. No real phone or tablet, no WebKit or Firefox. The iOS
  focus-zoom fix is inferred from computed sizes. No live ADO calls.

### Follow-up: the open items

The owner asked to close the items left open above. What changed:

- Title: the large item title is a `<textarea rows={1}>` with `field-sizing: content`
  (Chrome 123, Safari 26.2, Firefox 152), so a long title wraps and the box grows. Titles
  are one line in Azure DevOps, so a pasted line break becomes a space, with the cursor
  kept where the paste ended. Enter still saves, except an Enter that picks an IME word
  (`isComposing` or key code 229), which the old input also got wrong. Desktop height is
  unchanged (43px). On macOS, Home and End in the title now scroll, as in any multi-line
  box; Cmd+arrow keys move the cursor. `items.spec.ts` now places the cursor directly.
- Assignee picker: a tap opens the list without focusing the search, so the on-screen
  keyboard stays closed. A keyboard open still focuses the search. The parent picker
  keeps its search focus, because typing is how it finds items.
- Drop hint: it floats to the right end of the group row and sticks at the grid's edge,
  so it stays in view and clear of the group name at any sideways scroll. Its line
  height matches the group name button, so the two line up.
- The 404 page shows a notice inside the app. `src/lib/theme.ts` applies the theme and
  sets `<meta name="theme-color">` to the sidebar color. The colors are fixed in code,
  because WebKit can run the script before the stylesheet loads.
- The grid drop test aimed at a heading the page had since auto-scrolled away from. It
  now aims again after the move: 5 of 5 alone, where it had passed 1 of 5 with the
  sticky hint and failed now and then before this work.

Checks:

- WebKit (Playwright's WebKit 27.2, installed for this): at 375x667, 390x844, and
  844x390, no page-level horizontal overflow on six views, and the sprint, New, theme,
  and panel controls are in view. The wrapping title, the picker, the 404 notice, and the
  bar color behave the same as in Chromium.
- A separate correctness and simplicity review found five problems, all fixed: the
  cursor jump after a pasted line break, the IME Enter, the drop hint going off-screen or
  covering the group name after a sideways scroll, the picker skipping focus for a
  hardware keyboard on a touch screen, and the WebKit stylesheet race for the bar color.
  Each new check in `mobile.spec.ts` and `shell.spec.ts` failed with its fix removed.

Still open: no check on a real iPhone or in the iOS Simulator. No Simulator runtime is
installed, and one is a download of several GB. The app listens on `127.0.0.1` only, so
a phone on the network cannot reach it by design; the Simulator can. Tooltips do not
open on touch, by design (controls keep their accessible names).

## Node 24.22.1 security update (2026-10-26)

The owner reported CVE-2026-111497, a high-severity bug in the Brotli decoder bundled with
Node.js. Node 24.22.1, the October 21, 2026 security release, fixes it, and every older
24.x has it. It was the newest 24.x on 2026-10-26. Eruza pinned 24.14.1. The risk was low:
the decoder runs when the local server's `fetch` reads a Brotli response (Node asks HTTPS
servers for `br`), and the server fetches only from `dev.azure.com`, with redirects off.

What changed:

- The pin moved from `24.14.1` to `24.22.1` in `.node-version`, `engines` in
  `package.json`, the root package's `engines` in `package-lock.json`, and the Get
  started step in `README.md`. M1.1 needs one exact Node version, so the pin stays exact.
- No dependency changed. The earlier `24.14.1` mentions in this file, including Machine
  notes, are kept, because they record the Node version those checks ran on.

Checks (mock mode, macOS, Node `24.22.1`, npm `11.19.1`, no live calls):

- `node -v` in a new login shell printed `v24.22.1`, the nvm default.
- `npm run check` passed: lint, format, typecheck, 225 unit and integration tests, and the
  build, with the existing chunk-size warning.
- In a scratch copy of the tracked files outside the repo, `npm ci` passed with no engine
  warning, and `npm run check` passed. The owner's dev server held ports 5173 and 3001,
  so the browser tests ran there with the ports changed to 5175 and 3003: 93 of 93 passed
  in 2.0 minutes. A first `npm run check` with the changed ports failed 15 unit tests,
  because they send origin 5173. It passed after the files were restored.
- `npm run dev` in that copy, on the same ports: the page and `/api/session` through the
  proxy returned 200, a wrong `Host` returned 403, and nothing restarted in 12 idle
  seconds. SIGINT to its process group, as Ctrl+C sends, stopped all three processes and
  both listeners.
- `npm ci` reported 2 high-severity advisories in `@azure/msal-node`, which comes through
  `@azure/identity` (GHSA-xcx6-jx8p-x3h5, about the authorization code flow). Eruza uses
  only `AzureCliCredential`. No dependency changed here, so this is still open.
- A review checked the release, the CVE, and every tracked file for other Node version
  references, and found nothing else to change.
- Not run: Windows and live ADO calls.

npm 11.19.1 comes with Node 24.22.1. `npm install --package-lock-only` adds 66 lines to
the lockfile for bundled packages of `@tailwindcss/oxide-wasm32-wasi`; a full
`npm install` does not. That comes from the newer npm, not from this change.

Next step: restart any dev server that started before this change, so it runs on
24.22.1. Decide how to handle the `@azure/msal-node` advisory above. The owner approved
pushing this update, and it is on GitHub.

## `@azure/msal-node` advisory fix (2026-10-26)

The owner asked to fix the advisory found during the Node update: GHSA-xcx6-jx8p-x3h5
(CVE-2026-109461, high) in the `@azure/msal-node` authorization code flow, fixed in 7.1.0.
Eruza never uses that flow. It uses only `AzureCliCredential`, which runs `az`. The newest
stable `@azure/identity`, 4.14.0, allows only `@azure/msal-node` 6.x, and the newest 6.x
(6.0.1) has the bug. The 4.15.0 beta also allows only 6.x.

What changed:

- `package.json` overrides `@azure/msal-node` to 7.1.1. The lockfile changes only
  `@azure/msal-node` (6.0.1 to 7.1.1) and its own `@azure/msal-common` (16.14.1 to
  16.14.3). Both integrity values match the registry.
- `docs/architecture.md` notes the override and when to remove it.
- Not chosen: `npm audit fix --force` would downgrade `@azure/identity` to 4.13.0, whose
  `AzureCliCredential` runs `az` through a shell string; 4.13.1 to 4.13.3 have the bug.
  Calling `az` directly would go against `docs/architecture.md` and would need its own
  Windows `az.cmd`, timeout, and error handling.
- No test was added, because app behavior does not change. `tests/app.test.ts` and
  `tests/mock-writes.test.ts` load the real `@azure/identity`, so they would fail if it
  could not load with msal-node 7.

Checks (mock mode, macOS, Node `24.22.1`, npm `11.19.1`, no live calls):

- msal-node 7.0.0's only breaking change removes `responseMode` from interactive
  requests. `@azure/identity` 4.14.0 does not use it, and its ESM and CommonJS builds
  both load with 7.1.1. 7.1.1 is the newest 7.x and has no other advisory.
- In a scratch copy of the tracked files: `npm ci` and `npm audit` found 0
  vulnerabilities, and `npm ls` shows `@azure/msal-node@7.1.1 overridden`. `npm run check`
  passed (225 tests and the build, with the existing chunk-size warning). The browser
  tests passed 93 of 93 on ports 5175 and 3003, because the owner's dev server held 5173
  and 3001.
- The real `createAuth()` credential, with a fake `az` first on `PATH`, loaded msal-node
  7.1.1 and returned the fake token. `az` got the expected arguments.
- A review found `npm ci` works with the override on npm 9, 10, 11.11, and 11.19, and a
  full `npm install` on npm 11 leaves the lockfile unchanged.
- The repo's own `node_modules` still has 6.0.1. The owner's dev server was running from
  it on the removed Node 24.16.0 binary, and `node --watch` restarts when a loaded file
  changes.
- Not run: Windows, live ADO calls, and a real `az` sign-in.

Next step: stop the dev server, run `npm ci`, and start it again on Node 24.22.1. Remove
the override when `@azure/identity` allows 7.1.0 or later; Azure/azure-sdk-for-js issue
40441 tracks the move to msal-node 7. A push needs explicit approval.

## Machine notes

- The M5 session ran on macOS with plenty of disk space. Node `24.14.1` came from
  `nvm install 24.14.1`; Playwright used its default browser cache. The Windows notes
  below still apply to the Windows machine.

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

Stage 1, M8, M9, the review fixes, the grid width and phone and tablet work, and the
Node 24.22.1 update are on GitHub. Check the phone layouts on a real iPhone or in the iOS
Simulator, which needs an iOS runtime download of several GB. The `@azure/msal-node` fix
is local only. Remove its override when `@azure/identity` allows 7.1.0 or later.
Open: S12 needs a live image check, which is a write and needs approval. Keep `refs/t3/`
local; never push with `--all` or `--mirror`.
