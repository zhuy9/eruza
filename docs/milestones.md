# Stage 1 milestones and handoff

## Current checkpoint

Stage 1 (M0-M7) is complete. The previously open live checks M2.8, M3.9,
M4.7, M6.3, and M6.6 passed on 2026-10-20 in the approved private test project.
M7 now includes clean-checkout mock/live startup, refresh and conflict checks,
final local checks, privacy review, and the final handoff. No application code
changed during live verification. Everything through `3c66e09` is on GitHub. Later
commits stay local until the user approves a push.
Read [the handoff](handoff.md) before continuing.

The user then requested ten audit fixes in separate local commits. All ten are
committed locally; the changes and the additional mock regression evidence are
recorded in the handoff.

The GitHub repository was private when checked in the M7 session. Do not assume
visibility is unchanged in a later session; check it before publication work.

| Milestone                                          | Status   | Depends on |
| -------------------------------------------------- | -------- | ---------- |
| M0: Repo layout and handoff                        | Complete | None       |
| M1: Local app shell and mock foundation            | Complete | M0         |
| M2: Azure CLI auth and ADO reads                   | Complete | M1         |
| M3: Create, detail, and parent actions             | Complete | M2         |
| M4: Board and shared filters                       | Complete | M3         |
| M5: Meeting grid                                   | Complete | M3, M4     |
| M6: Comments and remaining actions                 | Complete | M3         |
| M7: Stage 1 acceptance and public-readiness review | Complete | M1-M6      |

## How to use this plan

- For each milestone: implement, use the `ponytail-review` skill to review the
  diff, fix findings, run required checks, then commit before moving on.
- Check correctness and security separately from the complexity review.
- Complete mock-mode work first. Build and test the real ADO integration with
  mocked responses, but leave live acceptance checks open.
- Implement a small behavior test before a meaningful code change.
- Use the acceptance IDs below when reporting progress.
- Mark a milestone Complete only when all its required checks pass.
- If code is ready but a required live check is blocked, use
  "Implemented; verification pending" and name the blocker.
- Later mock/UI work can continue while a live check is pending, but that does
  not close the earlier milestone or Stage 1.
- Record actual commands and results. Do not report a planned test as evidence.
- Before each commit, run the relevant project checks and the staged privacy
  review in [privacy.md](privacy.md).
- Keep commits small. Pushing and publishing require separate approval.

The [requirements](requirements.md) define product behavior.
The [architecture](architecture.md) and [API](api.md) define boundaries.
If a milestone omits a detail, the requirements still apply.

## M0: Repo layout and handoff

Deliver the repo structure and docs only. Do not start the app implementation
as part of M0.

Acceptance:

- [x] M0.1: README clearly says the app and npm commands are not implemented.
- [x] M0.2: Requirements include both meeting group orders, all ticket types,
      and no grid type filter.
- [x] M0.3: `AGENTS.md` is the source instruction file. `CLAUDE.md` is a real
      relative symlink to it, recorded by Git with mode `120000`.
- [x] M0.4: `.gitignore`, blank account settings in `.env.example`, and the
      MIT license are present.
- [x] M0.5: Local doc links resolve, Git whitespace checks pass, and private
      paths are ignored.
- [x] M0.6: Staged files pass secret-pattern scanning and content privacy review.
      No real account data, personal paths, or company details are included.
- [x] M0.7: Every later milestone has clear work, checks, and a handoff path.

Check with local file/link validation, `git diff --cached --check`,
`git check-ignore`, and `git ls-files --stage CLAUDE.md`.
There are no app tests or live ADO checks to run at this milestone.

## M1: Local app shell and mock foundation

Build:

- One npm package with exact dependency versions and a lockfile.
- Pinned supported Node version, strict TypeScript, ESLint, and Prettier.
- Vite/React client, Hono server, and shared request validation.
- TanStack Router and Query setup, app layout, dark mode, and error display.
- A cross-platform dev command that starts and stops both processes.
- Initial synthetic metadata and read operations in mock mode.
- Vitest and browser test setup, with the commands listed in `AGENTS.md`.

Acceptance:

- [x] M1.1: A clean install and `npm run dev` work on Windows.
      Document the exact supported Node version and startup URL.
- [x] M1.2: Both servers bind to loopback; the client uses the Vite `/api`
      proxy. Stopping the dev command stops both processes.
- [x] M1.3: `MOCK=1` works with blank ADO settings and Azure CLI absent.
      No credential provider or outbound ADO request is invoked.
- [x] M1.4: Mock mode has a visible label and only synthetic content.
- [x] M1.5: Host/origin and request validation tests reject invalid writes.
      No ADO secret or server-only module is present in the client bundle.
- [x] M1.6: App navigation, keyboard focus, dark mode, and route reload work
      in a browser test.
- [x] M1.7: `npm run check` and the initial `npm run test:e2e` pass.

Evidence: install/check commands, browser test result, and the mock network
isolation test. No live ADO claim is needed for M1.

## M2: Azure CLI auth and ADO reads

Build:

- `getAuthHeader()`, token caching, and one shared in-flight refresh.
- Startup connection check and current-user lookup.
- Project/team selection, members, areas, sprints, types, fields, and backlogs.
- WIQL and batched item/ancestor reads.
- Safe errors, pagination, bounded concurrency, and rate-limit handling.

Acceptance:

- [x] M2.1: Tests cover token reuse, refresh within 60 seconds of expiry,
      concurrent refresh, CLI missing, expired login, and permission denial.
- [x] M2.2: The UI shows the exact login command and can retry after login.
      Authentication failure does not stop the local app from loading.
- [x] M2.3: "Me" comes from `connectionData`; no identity is hardcoded.
- [x] M2.4: Project/team selection loads correct defaults. Current, previous,
      absent, and overlapping current sprint cases have tests.
- [x] M2.5: Batch requests never exceed 200 IDs. Shared ancestors are fetched
      once per read operation, not once per ticket. A test spans several batches.
- [x] M2.6: All supported pagination is handled. Missing items and query limits
      are visible; incomplete results cannot appear as complete totals.
- [x] M2.7: Tests cover WIQL escaping, `Retry-After`, and prevention of token
      forwarding to an unapproved host or redirect.
- [x] M2.8: Live read check confirms CLI auth, current user, project/team
      metadata, current iteration lookup, and a work item batch.

Evidence: unit/integration checks plus a sanitized live checklist.
If live access is missing, leave M2.8 open.

## M3: Create, detail, and parent actions

Build:

- Shared create form, detail panel, and full-page item route.
- Metadata-driven inputs and conditional validation feedback.
- Field autosave, optimistic updates, and per-item save ordering.
- Assignee picker, Assign to me, and Unassign.
- Add child, parent search, set/change/remove parent, and linked item navigation.
- Safe rich-text rendering and editing.

Acceptance:

- [x] M3.1: Create validates title and editable required custom fields, applies
      defaults, and keeps the draft after ADO validation errors.
- [x] M3.2: Add child creates the item and parent relation in one request.
- [x] M3.3: Every existing-item field/parent patch tests `/rev`.
      State plus conditionally required fields can be submitted together.
- [x] M3.4: Two quick edits to one item save in order using returned revisions.
      Conflict, failed save, and background refresh tests preserve the draft and
      do not undo a later successful edit.
- [x] M3.5: Change parent removes and adds in one patch. Remove parent preserves
      both items and unrelated links. Self-parenting/cycles fail clearly.
- [x] M3.6: Parent and children are clickable, and children are batch-fetched.
      Existing assignees outside the team list remain visible.
- [x] M3.7: Tests cover malicious HTML/URLs and safe rich-text round trips with
      tables, links, images, and supported formatting. Opening the editor sends no
      write. Unsupported content cannot be silently lost.
- [x] M3.8: Detail panel and full page edit the same item consistently.
      Keyboard focus and the `I` shortcut work without interrupting typing.
- [x] M3.9: A live disposable-item check confirms create, field edit, stale
      revision rejection, add child, change parent, and remove parent.

Evidence: behavior tests, browser tests, and a sanitized live checklist.
Do not store the disposable item's ID or content in tracked evidence.

## M4: Board and shared filters

Build:

- State-based board for one selected type.
- Shared sprint, assignee, area, tags, and ID/title search controls.
- Drag state changes, card detail opening, and column creation.
- Global New, `C`, and command palette creation.

Acceptance:

- [x] M4.1: Custom type/state fixtures produce columns and cards without
      hardcoded workflow names. Cards show all required fields.
- [x] M4.2: Dragging succeeds, rolls back on failure, and refetches on revision
      conflict. The same move is possible with a keyboard.
- [x] M4.3: A column "+" sets the requested initial state. Invalid initial
      states show ADO errors without losing the create draft.
- [x] M4.4: Current and previous sprints work. Area subpaths and tag matching
      follow the selected team and documented filter rules.
- [x] M4.5: Shared filters survive view changes. Switching projects/teams does
      not reuse invalid metadata or show stale results as current.
- [x] M4.6: New, `C`, and Cmd+K/Ctrl+K reach the shared create form.
      Single-letter shortcuts do not fire while typing.
- [x] M4.7: A live state move and column create use the selected project's
      actual state rules. No manual board rank is written.

Evidence: filter and mutation tests, browser drag/keyboard checks, and the
sanitized live state check.

## M5: Meeting grid

Build:

- One TanStack Table with TanStack Virtual.
- Sprint update: Person > Story > Ticket.
- Sprint retro: Story > Person > Ticket.
- All ticket types, no type filter.
- Collapsible groups, counts, totals, column controls, and inline edits.
- Explicit story drop targets for reparenting.

Acceptance:

- [x] M5.1: The same sprint fixture yields the correct hierarchy in both
      presets. Two people sharing a story are split by person in update and
      combined under one story in retro.
- [x] M5.2: Every matching ticket appears once as a leaf, including types other
      than Tasks and Bugs. A matching story's own row is counted only once.
- [x] M5.3: Tests cover parent stories outside the sprint, intermediate parents,
      custom story types, unassigned tickets, no story, and unreadable ancestors.
- [x] M5.4: Counts and remaining-work totals use filtered rows only. Story
      estimates are not duplicated across people or mixed with other units.
- [x] M5.5: Groups collapse/expand. Columns sort, resize, and hide.
      The view toggle preserves the sprint, filters, and column choices.
- [x] M5.6: Inline state, assignee, priority, and iteration edits work, including
      moving rows between groups or out of the current sprint. Failures roll back
      correctly across grid, board, and detail.
- [x] M5.7: Dropping onto a story changes only the parent. The assignee stays
      unchanged, and the row appears in the correct nested group. The parent picker
      provides a keyboard alternative.
- [x] M5.8: With at least 1,000 matching tickets in a 900-pixel-tall viewport,
      fewer than 150 ticket row elements are mounted at once. Scrolling reaches
      the final row without blank or duplicate rows.
- [x] M5.9: On that fixture, test group switching, expand/collapse, filtering,
      and inline editing. Record browser/viewport, fixture size, and measured UI
      response times. Do not claim live ADO speed from a mock test.
- [x] M5.10: A request-count check shows no per-ticket parent or member fetches.
      Polling pauses while hidden and resumes when the page becomes active.

Evidence: grouping fixtures, request-count tests, browser results, and actual
local performance measurements. M5 has no live check of its own; it uses the M2-M4
ADO paths, whose live checks passed on 2026-10-20.

## M6: Comments and remaining actions

Build:

- Paged comment thread and rich-text comment creation with mentions.
- Copy link, copy ID, and Open in Azure DevOps.
- Recoverable deletion with confirmation.

Acceptance:

- [x] M6.1: Multiple comment pages load in order without duplicates.
      HTML and Markdown comments display safely.
- [x] M6.2: Comment failure keeps the draft. An ambiguous write failure does
      not automatically repeat the comment.
- [x] M6.3: A live mention check confirms ADO resolves the intended identity.
      Use only an explicitly selected test identity, not an arbitrary team member.
- [x] M6.4: Clipboard actions work and failures are visible. Opening the ADO
      item uses a safe URL with no token.
- [x] M6.5: Deletion requires confirmation, explains the recycle bin, and never
      requests permanent destruction. Cancel sends no delete request.
- [x] M6.6: Live checks confirm comment creation and recoverable deletion of a
      disposable item.

Evidence: API/browser tests and a sanitized live checklist.

## M7: Stage 1 acceptance and public-readiness review

Finish and verify Stage 1; do not add Stage 2 features.

Acceptance:

- [x] M7.1: All earlier acceptance checks are complete, including live checks.
      Remaining limitations are stated plainly in the README.
- [x] M7.2: From a clean checkout, install, mock startup, and live startup follow
      the README. All documented commands exist and run.
- [x] M7.3: `npm run check`, `npm run test:e2e`, and Git whitespace checks pass.
      Review dependency audit results and resolve material findings.
- [x] M7.4: Keyboard and dark-mode checks cover create, board, grid, detail,
      comments, dialogs, and navigation.
- [x] M7.5: Active refresh, conflict recovery, token expiry, query limits, and
      rate-limit behavior have no unresolved acceptance gaps.
- [x] M7.6: A build inspection confirms no tokens, private config, or server
      credential code is shipped to the browser.
- [x] M7.7: Complete the full publication review in `privacy.md`, including
      tracked/generated files, history, refs, metadata, and remote artifacts.
- [x] M7.8: The handoff states what was verified locally, what was verified
      live, and that publishing still needs explicit approval.

M7's local checks and the final live checks passed. Natural token expiration and
real 429 responses were not induced: near-expiry refresh used real CLI tokens
with simulated timestamps, and rate/query-limit edge cases retain their unit and
mock browser evidence. The live mention was verified in ADO's resolved contact
card, not merely by echoed HTML. See [handoff.md](handoff.md) for the evidence and
remaining limits.

Stage 1 is complete only when M1-M7 pass. Making the repository public is a
separate user-approved action, not a required side effect of finishing M7.

## Latest handoff

- Stage 1 (M0-M7): complete. No Stage 2 work was added.
- M2.8, M3.9, M4.7, M6.3, and M6.6 passed live in the approved private test project.
  M7.2 mock/live startup also passed from a clean local clone.
- Nine disposable items were created and confirmed in the ADO Recycle Bin after
  deletion with `destroy=false`. The three dated test sprints remain available.
- Local and live evidence, remaining limits, review results, and actual command
  results are recorded separately in [handoff.md](handoff.md).
- M0-M7, the ten audit fixes, and the four follow-up review fixes in
  [handoff.md](handoff.md) are on GitHub at `a27b994`. Pushing, deploying, or changing
  visibility requires explicit approval.
- Next step: work the user chooses.
