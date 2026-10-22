# Stage 1 requirements

## Product and scope

Eruza is a personal web client for Azure DevOps Boards.
The tagline is "Eruza: Azure DevOps Boards, reimagined."
Do not put "Azure" or "Microsoft" in the product name or logo.
Descriptive references to Azure DevOps are fine.

Stage 1 runs on localhost for one user. Azure DevOps Services at
`dev.azure.com` is the target. Azure DevOps owns all work items and comments.
Eruza keeps only temporary in-memory data and UI preferences.

The app supports multiple projects and teams in one configured organization.
Select a project and team before loading team work. Start with the project's
default team when available.

## Shared filters and defaults

- Sprint: default to the selected team's current sprint.
- Allow choosing previous sprints from a dropdown.
- If no current sprint exists, show that state and allow a selection.
  Use the team's configured default iteration for new items.
- If more than one sprint is current, ask the user to select one.
- Assignee, area path, tags, and text search are optional filters.
- Text search matches an item ID or title. Description search is not required.
- Multiple selected tags must all match.
- Respect the team's configured areas and whether each includes subareas.
- Keep the selected sprint and shared filters when switching board/grid views.
- On a project or team change, clear selections that are no longer valid.
- Include completed tickets. Do not hide them from a retro by default.

The grid includes all work item types and has no type filter. The board's type
selector is separate from these shared filters.

## Grid: meeting views

Use one grid with two grouping presets:

| Preset        | Group order             | Meeting purpose                 |
| ------------- | ----------------------- | ------------------------------- |
| Sprint update | Person > Story > Ticket | Review each person's work       |
| Sprint retro  | Story > Person > Ticket | Review each story across people |

Person means the ticket's assignee. It does not mean the parent story's owner.
A story shared by several people appears under each person in Sprint update.
In Sprint retro, that story appears once with people underneath.

### Custom grouping (M8)

The presets are starting points. A "Group by" bar above the grid shows the levels
as numbered chips. The user can add a level, remove one, move one earlier or later,
or reset to either preset.

- Levels: Person, Story, and Type, each used once, from one to three levels.
- Person and Story keep the rules above. Type groups use the type name, sorted A to Z,
  with a "Type:" caption on the heading.
- Every control works with the keyboard. Reordering never needs a mouse drag.
- The presets keep `grouping=person|story` in the URL, so old links still work.
  Any other order is stored as `group=type,person,...` and titled "Custom grouping."
  The sidebar links and the command palette always open a preset.
- A story's estimate appears only when Story is the outermost level, so it shows
  once per story. Drag to change a parent works only while Story is a level.

### Which records appear

1. Find all tickets matching the selected sprint, team areas, and other filters.
2. Keep every matching work item type. Do not limit the grid to Tasks and Bugs.
3. Fetch parent records needed for grouping, even outside the selected sprint.
4. Walk parent links to the nearest story-level ancestor.
5. Put each matching ticket in exactly one leaf row.

"Story" means a work item type in the team's requirement backlog, such as a
User Story or Product Backlog Item. Read that mapping from ADO metadata.
Do not assume all projects use those names.

If a matching ticket is itself a story-level item, use that item as its story
group and keep its editable ticket row. A group heading is not an extra ticket.
Other matching items with no story ancestor go under "No parent story."
An unreadable ancestor goes under "Unavailable story," with a clear notice.
An item without an assignee goes under "Unassigned."

If requirement backlog metadata is unavailable, show the problem. Do not
silently guess story types from their names. Board access can still work.

### Groups and totals

- Use item IDs and identity IDs as keys, not titles or display names.
- Groups can collapse. Include expand-all and collapse-all controls.
- Show the number of matching ticket rows in each group.
- Sum remaining work from matching tickets that have the field.
- Show story estimates separately from ticket remaining work.
- In Sprint retro, show the estimate once on the story group.
  In Sprint update, omit story estimates from person-group rollups.
  With custom grouping, show it only when Story is the outermost level.
- Keep Story Points, Effort, and Size labels and units distinct.
- Do not treat missing values as zero or mix estimates with remaining work.
- Label totals as covering the filtered tickets, not all descendants.
- Supporting ancestors do not increase ticket counts or totals unless they
  also match the filter and have their own ticket row.

### Columns and editing

Columns: ID, title, type, state, assignee, iteration, priority, remaining work,
and estimate where available. Use the process's label for its estimate field.
Columns are sortable, resizable, and can be hidden.

Allow inline edits for state, assignee, priority, and iteration.
Use each row's type metadata to offer valid values.
Editing an assignee or parent moves the row to its new group.
Editing an iteration may remove the row from the current sprint.

Use row virtualization. Group headers and ticket rows must remain usable with
at least 1,000 matching tickets.

### Drag to change a parent

- A story heading is a drop target for setting that story as the direct parent.
- Show the target story and the action before the drop completes.
- The action changes the parent only. It does not change the assignee.
- The row keeps its assignee and its other group values in the destination story
  group.
- Reject self-parenting and cycles. Show ADO rule errors clearly.
- Use the same revision check and rollback behavior as the parent picker.

## Board

- Select one work item type from the project's available types.
- Fetch its states and colors. Never hardcode column names.
- Use states as columns. Matching ADO's separately configured board columns,
  split columns, swimlanes, and manual card rank is not part of Stage 1.
- Cards show ID, title, type icon, assignee avatar, priority, and tags.
- Clicking a card opens the detail panel.
- Dragging between columns updates `System.State`.
- Update immediately in the UI, then confirm with ADO.
- On failure, restore the correct state and show a toast.
- On a revision conflict, refetch and explain that the item changed elsewhere.
- Each column has a "+" action to create in that state.
- If ADO rejects creation or transition into that state, keep the draft and
  show the required fields or error.
- Use a stable card sort. Manual ordering within a column is not required.
- Provide a keyboard-accessible state change action as well as dragging.

## Work item creation

Entry points:

- Global New button.
- `C` shortcut.
- Command palette with Cmd+K or Ctrl+K.
- Board column "+".
- Add child on a work item.

Fields: type, required title, rich-text description, assignee, optional priority,
tags, area path, iteration, and any additional editable required fields.
Fetch types and field definitions from the project.
Default area to the selected team's default area and iteration to the selected
sprint. If no sprint is selected, use the team default.

Use metadata defaults, allowed values, and required flags. Do not ask the user
to fill system-managed fields. ADO still makes the final validation decision.
Show errors by field when possible; otherwise show a form-level error.
Keep the draft when creation fails.

Add child includes the parent relation in the create patch. It must not create
an unlinked item first and link it in a second write.

## Detail panel and full page

Provide a side panel and a full-page route for the same work item.
Both use the same editing controls and data.

Editable core fields: title, description, state, assignee, priority, tags,
area path, iteration, estimate, and remaining work, where the type supports them.
Show editable required custom fields when needed to complete an operation.

- Save selects immediately.
- Save text on blur or after a short debounce, not on every keystroke.
- Show saving, saved, and failed states. No single large Save button.
- Keep pending edits visible during background refresh.
- When a transition needs other fields, collect them and send one patch.
- Show the parent and children as clickable items.
- Fetch linked items in batches.
- Copy ID, copy the Eruza item link, or open the item in Azure DevOps.

## Parent actions

- Set parent: search for an existing item by ID or title and link it.
- Change parent: remove the old parent relation and add the new one in one
  patch.
- Remove parent: remove only the relation, never either work item.
- Add child: create with the parent relation in the same request.
- Preserve unrelated relations.
- Include a `/rev` test in every patch to an existing item.
- Keep the user's expected revision. Never fetch a newer revision merely to
  bypass a conflict.

## Assignees, comments, and deletion

Assignee picker:

- Search the selected team's members, with avatars.
- Include Assign to me and Unassign.
- Resolve "me" from `connectionData`.
- Keep an existing assignee visible even if they are not in the team list.
- Support `I` to assign the selected/open item to the current user.

Comments:

- Load the thread with pagination and add new rich-text comments.
- Handle HTML and Markdown comment formats.
- Support actual ADO mentions of team members, not only visible `@name` text.
- Preserve supported mention markup through editing and sanitization.
- A failed send keeps the draft.

Deletion:

- Use a confirmation dialog naming the item.
- Explain that ADO moves the item to its recycle bin and it is recoverable.
- Never offer permanent deletion.
- Report success only after ADO confirms it.

## Correctness, speed, and keyboard use

- Use optimistic updates for field edits, state moves, and parent changes.
- Keep saves for each item in order and use the latest successful revision.
- Update or invalidate every affected board, grid, and detail cache.
- A rollback must not undo a newer successful edit.
- On a conflict, refetch, preserve the draft, and ask the user to review it.
- Do not automatically repeat creates or comments after an uncertain outcome.
- Show cached data immediately and refresh active views every 45 seconds.
- Pause polling when the page is hidden and refresh when it becomes active.
- Batch ADO requests and honor rate-limit guidance.
- Support dark mode, visible keyboard focus, and keyboard alternatives to drag.
- Do not trigger single-letter shortcuts while typing in an input or editor.

## Rich text and privacy

Treat descriptions, comments, titles, links, and metadata as untrusted content.
Sanitize rendered HTML and allow only safe links.
Do not silently discard existing formatting, tables, or embedded content when
saving. Opening an editor alone must never save a normalized copy.

If content cannot be edited without loss, keep it readable and explain the
limitation instead of silently deleting content. Resolve this limitation before
claiming support for that content in the acceptance checks.

Protected avatars and existing embedded ADO images go through controlled
server routes. Uploading attachments is out of scope.
Never send tokens to the browser or write real work item content to logs.

## Mock mode

`MOCK=1` must run without Azure CLI, an organization, or an ADO connection.
It uses the same HTTP routes and application contracts as real mode.
Use synthetic records only. Keep edits in memory and reset them on restart.

Fixtures must cover custom types and states, several people sharing a story,
unassigned items, missing parents, parents outside the sprint, required fields,
comments, and at least 1,000 tickets.
Automated tests must also cover conflicts, validation errors, and network errors.
Show a visible Mock mode label.

## Local branding (M9)

Optional local configuration can replace the sidebar name and logo. The same
values set the browser title and favicon. Blank settings keep Eruza's defaults.
Custom logos come from an ignored local folder, with no external image requests.
Names render as plain text; long names fit the sidebar and remain available to
screen readers. A broken logo falls back to the default mark. The expanded and
collapsed sidebar must work in both themes. Color customization and an in-app
branding settings screen are outside this change.

## Out of scope

Hosting, Entra/MSAL sign-in, multiple local users, a database, persistent ticket
storage, offline writes, sprint planning, dashboards, admin settings, attachment
uploads, bulk editing, non-parent link editing, work item history, real-time
push updates, Epic grouping, and manual board ranking.

Stage 2 is future work. Do not build its infrastructure during Stage 1.
