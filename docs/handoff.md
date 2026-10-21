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

Each push needs explicit approval. The user approved pushing through `8b513e9` (M7 local work).
Do not push later commits, deploy, or change repository visibility without new approval.

## Git checkpoint

- Branch: `main`. M0-M6 and the M7 local work are on GitHub at `8b513e9`. The user
  approved each push. Later docs and audit-fix commits are local only.
- GitHub was checked as private in the M7 session (`gh repo view`). Keep it private.
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
  live checks (M2.8, M3.9, M4.7) are still open.
- The detail panel's selects (from M3) still save on every change, including keyboard
  arrow changes on Windows. The grid's `CellSelect` pattern can be reused there.
- In retro, a story heading shows the story's own estimate even when the story is
  outside the sprint or filtered out. It is a label, not a total; there is no
  estimate total.
- Vite still reports the non-blocking chunk-size warning.

## M6 result: implemented; live checks open

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

## M7 progress: local parts done; live parts open

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

Stage 1 is complete, and all ten audit findings have local commits. Pushing the
unpushed docs and audit-fix commits and any publication or visibility change need
explicit approval. Keep `refs/t3/` local; never push with `--all` or `--mirror`.
