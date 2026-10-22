import { expect, test, type Page } from '@playwright/test';

const origin = { origin: 'http://127.0.0.1:5173' };
const LARGE = `/grid?grouping=person&sprint=${encodeURIComponent('Sample project\\Sprint 1')}`;
const panel = (page: Page) => page.getByRole('complementary', { name: 'Work item details' });
const row = (page: Page, id: number) => page.locator(`tr.ticket-row[data-id="${id}"]`);
const heading = (page: Page, label: string) =>
  page.locator('tr.group-row').filter({ has: page.getByRole('button', { name: label }) });

/** Group headings and ticket IDs in screen order, with depth shown by dashes. */
const outline = (page: Page) =>
  page
    .locator('.meeting-grid tbody tr[aria-rowindex]')
    .evaluateAll((rows) =>
      rows.map((r) =>
        r.classList.contains('group-row')
          ? `${'- '.repeat(Number(r.getAttribute('data-depth')) + 1)}${r.querySelector('button')!.textContent} (${r.querySelector('.count-badge')!.textContent})`
          : `#${r.getAttribute('data-id')}`,
      ),
    );

/** The group headings above a ticket row, outermost first. */
const groupsOf = (page: Page, id: number) =>
  row(page, id).evaluate((ticket) => {
    const labels: string[] = [];
    let depth = Infinity;
    for (let r = ticket.previousElementSibling; r && depth > 0; r = r.previousElementSibling) {
      const d = Number(r.getAttribute('data-depth'));
      if (r.classList.contains('group-row') && d < depth) {
        labels.unshift(r.querySelector('button')!.textContent!);
        depth = d;
      }
    }
    return labels;
  });

async function createTicket(page: Page, title: string, fields: Record<string, unknown> = {}) {
  const response = await page.request.post('/api/work-items', {
    headers: origin,
    data: {
      projectId: 'sample-project',
      type: 'Task',
      parentId: 1001,
      fields: {
        'System.Title': title,
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
        'System.AssignedTo': 'person-a',
        'Microsoft.VSTS.Scheduling.RemainingWork': 2,
        ...fields,
      },
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { id: number; rev: number; title: string };
}

/** Shows only the given ticket and its groups. */
const showOnly = (page: Page, view: 'person' | 'story', id: number) =>
  page.goto(`/grid?grouping=${view}&text=${id}`);

async function dragTo(page: Page, id: number, target: string) {
  const from = await row(page, id).locator('.drag-handle').boundingBox();
  const to = await heading(page, target).boundingBox();
  expect(from && to).toBeTruthy();
  await page.mouse.move(from!.x + 5, from!.y + 5);
  await page.mouse.down();
  await page.mouse.move(from!.x + 15, from!.y + 15, { steps: 3 });
  await page.mouse.move(to!.x + 200, to!.y + to!.height / 2, { steps: 12 });
  // A drag near the window's edge scrolls the page, so aim again at the heading's new place.
  const settled = (await heading(page, target).boundingBox())!;
  await page.mouse.move(settled.x + 200, settled.y + settled.height / 2, { steps: 3 });
}

const person = (id: string, name: string) => ({ id, displayName: name });
const ticket = (
  id: number,
  type: string,
  assignee: ReturnType<typeof person> | null,
  parentId: number | null,
  extra: Record<string, unknown> = {},
) => ({
  id,
  rev: 1,
  type,
  title: `Grouping example ${id}`,
  state: type === 'Spike' ? 'Exploring' : 'New',
  assignee,
  tags: [],
  areaPath: 'Sample project\\Web',
  iterationPath: 'Sample project\\Sprint 3',
  parentId,
  priority: 2,
  remainingWork: null,
  estimate: null,
  ...extra,
});
/** The saved-item response for a ticket from `ticket`. */
const detail = (item: ReturnType<typeof ticket>) => ({
  ...item,
  project: 'Sample project',
  description: '',
  fields: {},
  childIds: [],
});

test.describe('grouping', () => {
  test.use({ viewport: { width: 1440, height: 1400 } });

  test('both presets group the same sprint, with every ticket once', async ({ page }) => {
    const a = person('person-a', 'Person A');
    const b = person('person-b', 'Person B');
    const c = person('person-c', 'Person C');
    const points = { field: 'Microsoft.VSTS.Scheduling.StoryPoints', label: 'Story Points' };
    await page.route('**/api/work-items?*', (route) =>
      route.fulfill({
        json: {
          items: [
            ticket(8001, 'Story', a, null, { estimate: { ...points, value: 5 } }),
            ticket(8002, 'Task', a, 8001, { remainingWork: 3 }),
            ticket(8003, 'Task', b, 8001, { remainingWork: 2 }),
            ticket(8004, 'Bug', null, 8001),
            ticket(8005, 'Task', b, 8100, { remainingWork: 1 }),
            ticket(8006, 'Task', a, 8200, { remainingWork: 4 }),
            ticket(8007, 'Task', c, null),
            ticket(8008, 'Task', c, 8999),
            ticket(8009, 'Spike', a, null, { estimate: { ...points, value: 2 } }),
            ticket(8010, 'Task', b, 8009),
            ticket(8011, 'Feature', c, null),
          ],
          ancestors: [
            ticket(8100, 'Story', c, null, {
              iterationPath: 'Sample project\\Sprint 2',
              estimate: { ...points, value: 8 },
            }),
            ticket(8200, 'Task', b, 8001, { iterationPath: 'Sample project\\Sprint 2' }),
          ],
          missingIds: [8999],
          incomplete: false,
        },
      }),
    );
    await page.goto('/grid?grouping=person');
    await expect(page.getByText('1 linked item could not be read.')).toBeVisible();
    expect(await outline(page)).toEqual([
      '- Person A (4 tickets)',
      '- - #8001 Grouping example 8001 (3 tickets)',
      '#8001',
      '#8002',
      '#8006',
      '- - #8009 Grouping example 8009 (1 ticket)',
      '#8009',
      '- Person B (3 tickets)',
      '- - #8001 Grouping example 8001 (1 ticket)',
      '#8003',
      '- - #8009 Grouping example 8009 (1 ticket)',
      '#8010',
      '- - #8100 Grouping example 8100 (1 ticket)',
      '#8005',
      '- Person C (3 tickets)',
      '- - No parent story (2 tickets)',
      '#8007',
      '#8011',
      '- - Unavailable story (1 ticket)',
      '#8008',
      '- Unassigned (1 ticket)',
      '- - #8001 Grouping example 8001 (1 ticket)',
      '#8004',
    ]);
    // Sprint update leaves story estimates out of person and story headings.
    await expect(page.locator('tr.group-row', { hasText: 'Story Points' })).toHaveCount(0);
    await expect(heading(page, 'Person A')).toContainText('Remaining work 7');
    await expect(heading(page, 'Person C')).not.toContainText('Remaining work');

    await page.getByRole('link', { name: 'Sprint retro', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sprint retro' })).toBeVisible();
    expect(await outline(page)).toEqual([
      '- #8001 Grouping example 8001 (5 tickets)',
      '- - Person A (3 tickets)',
      '#8001',
      '#8002',
      '#8006',
      '- - Person B (1 ticket)',
      '#8003',
      '- - Unassigned (1 ticket)',
      '#8004',
      '- #8009 Grouping example 8009 (2 tickets)',
      '- - Person A (1 ticket)',
      '#8009',
      '- - Person B (1 ticket)',
      '#8010',
      '- #8100 Grouping example 8100 (1 ticket)',
      '- - Person B (1 ticket)',
      '#8005',
      '- No parent story (2 tickets)',
      '- - Person C (2 tickets)',
      '#8007',
      '#8011',
      '- Unavailable story (1 ticket)',
      '- - Person C (1 ticket)',
      '#8008',
    ]);
    // Each story estimate shows once, on its story heading, with its own label.
    const story = heading(page, '#8001 Grouping example 8001');
    await expect(story).toContainText('Remaining work 9');
    await expect(story).toContainText('Story Points 5');
    await expect(heading(page, '#8100 Grouping example 8100')).toContainText('Story Points 8');
    await expect(page.locator('tr.group-row', { hasText: 'Story Points' })).toHaveCount(3);
    await expect(heading(page, 'Unavailable story')).toContainText('A parent could not be read.');

    // Totals cover the filtered tickets only.
    await page.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption('person-b');
    await expect(page.locator('tr.ticket-row')).toHaveCount(3);
    await expect(page.locator('.list-toolbar')).toContainText('Tickets 3');
    await expect(page.locator('.list-toolbar')).toContainText('Remaining work 3');
    await expect(story).toContainText('1 ticket');
    await expect(story).toContainText('Remaining work 2');
  });
});

test('groups collapse, and column choices survive the view toggle and reload', async ({ page }) => {
  await page.goto(LARGE);
  // Unreadable saved choices fall back to the defaults.
  await page.evaluate(() => localStorage.setItem('eruza-grid-columns', 'null'));
  await page.reload();
  const personA = heading(page, 'Person A');
  await expect(personA).toBeVisible();
  await personA.getByRole('button').click();
  await expect(personA.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  await expect(row(page, 2000)).toHaveCount(0);
  await expect(heading(page, 'Person B')).toBeVisible();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(row(page, 2000)).toBeVisible();
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.locator('tr.ticket-row')).toHaveCount(0);
  await expect(page.locator('tr.group-row')).toHaveCount(5);
  await page.getByRole('button', { name: 'Expand all' }).click();

  // Sorting orders tickets inside their groups; groups keep their order and missing
  // values go last.
  await page.getByRole('button', { name: 'Remaining work', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Remaining work' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  expect((await outline(page)).slice(0, 6)).toEqual([
    '- Person A (214 tickets)',
    '- - #2000 Bulk sample story 1 (4 tickets)',
    '#2005',
    '#2010',
    '#2000',
    '#2015',
  ]);
  const sortPriority = page.getByRole('button', { name: 'Priority', exact: true });
  await sortPriority.click();
  await sortPriority.click();
  await expect(page.getByRole('columnheader', { name: 'Priority' })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  expect((await outline(page)).slice(2, 6)).toEqual(['#2015', '#2010', '#2000', '#2005']);

  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('checkbox', { name: 'Type' }).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('columnheader', { name: 'Type' })).toHaveCount(0);

  // The grid fills its view. Columns keep their set widths; the free width comes last.
  const title = page.getByRole('columnheader', { name: 'Title' });
  const grid = page.locator('.grid-scroll');
  expect(
    await grid.evaluate((view) => view.clientWidth - view.querySelector('table')!.offsetWidth),
  ).toBe(0);
  const before = (await title.boundingBox())!.width;
  expect(before).toBe(260);
  const handle = (await title.locator('.column-resizer').boundingBox())!;
  await page.mouse.move(handle.x + 2, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + 82, handle.y + 10, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await title.boundingBox())!.width).toBeGreaterThan(before + 60);
  const dragged = (await title.boundingBox())!.width;
  // The resize handle also works from the keyboard.
  const separator = page.getByRole('separator', { name: 'Resize Title' });
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await title.boundingBox())!.width).toBeCloseTo(dragged + 40, 0);
  const resized = (await title.boundingBox())!.width;

  await page.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption('person-b');
  await page.getByRole('link', { name: 'Sprint retro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sprint retro' })).toBeVisible();
  const kept = async () => {
    await expect(page.getByLabel('Sprint')).toHaveValue('Sample project\\Sprint 1');
    await expect(page.getByRole('combobox', { name: 'Assignee', exact: true })).toHaveValue(
      'person-b',
    );
    await expect(page.getByRole('columnheader', { name: 'Type' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Priority' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect((await title.boundingBox())!.width).toBeCloseTo(resized, 0);
  };
  await kept();
  await page.reload();
  await kept();
});

test('inline edits save in order and move rows between groups', async ({ page }) => {
  const item = await createTicket(page, 'Grid inline edit example');
  await showOnly(page, 'person', item.id);
  await expect(row(page, item.id)).toBeVisible();
  expect(await groupsOf(page, item.id)).toEqual(['Person A', '#1001 Make checkout easier']);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/work-items/${item.id}`, async (route) => {
    if (route.request().method() === 'PATCH') await gate;
    await route.fallback();
  });
  const patch = () =>
    page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith(`/${item.id}`));

  let sent = patch();
  await row(page, item.id)
    .getByRole('button', { name: `Assignee of #${item.id}: Person A` })
    .click();
  await page.locator('.popover').getByRole('option', { name: 'Person B' }).click();
  expect((await sent).postDataJSON()).toEqual({
    expectedRev: item.rev,
    fields: { 'System.AssignedTo': 'person-b' },
  });
  // The row moves before the save finishes; the assignee changes, the story does not.
  await expect
    .poll(() => groupsOf(page, item.id))
    .toEqual(['Person B', '#1001 Make checkout easier']);

  sent = patch();
  await row(page, item.id)
    .getByRole('combobox', { name: `State of #${item.id}` })
    .selectOption('In progress');
  release();
  expect((await sent).postDataJSON()).toEqual({
    expectedRev: item.rev + 1,
    fields: { 'System.State': 'In progress' },
  });
  sent = patch();
  const priority = row(page, item.id).getByRole('combobox', { name: `Priority of #${item.id}` });
  await expect(priority.locator('option')).toHaveText(['—', '1', '2', '3', '4']);
  await priority.selectOption('1');
  expect((await sent).postDataJSON()).toEqual({
    expectedRev: item.rev + 2,
    fields: { 'Microsoft.VSTS.Common.Priority': 1 },
  });
  await expect
    .poll(async () => (await (await page.request.get(`/api/work-items/${item.id}`)).json()).item)
    .toMatchObject({ state: 'In progress', priority: 1, assignee: { id: 'person-b' } });

  // The panel and board show the saved values too.
  await row(page, item.id).getByRole('link', { name: item.title }).click();
  await expect(panel(page).getByLabel('State', { exact: true })).toHaveValue('In progress');
  await page.getByRole('button', { name: 'Close details' }).click();

  // An iteration edit moves the ticket out of this sprint.
  await row(page, item.id)
    .getByRole('combobox', { name: `Iteration of #${item.id}` })
    .selectOption({ label: 'Sprint 2' });
  await expect(page.getByText(`#${item.id} is moving to another sprint`)).toBeVisible();
  await expect(row(page, item.id)).toHaveCount(0);
  await page.getByLabel('Sprint').selectOption({ label: 'Sprint 2' });
  await expect(row(page, item.id)).toBeVisible();
  await page.goto(`/board?type=Task&sprint=${encodeURIComponent('Sample project\\Sprint 2')}`);
  await expect(
    page.getByRole('region', { name: /^In progress, / }).getByText(item.title),
  ).toBeVisible();
});

test('a failed inline edit rolls back in the grid, panel, and board', async ({ page }) => {
  const item = await createTicket(page, 'Grid rollback example');
  await showOnly(page, 'person', item.id);
  await page.route(`**/api/work-items/${item.id}`, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 403, json: { code: 'FORBIDDEN', message: 'Update denied.' } })
      : route.fallback(),
  );
  await row(page, item.id)
    .getByRole('button', { name: `Assignee of #${item.id}: Person A` })
    .click();
  await page.locator('.popover').getByRole('option', { name: 'Unassign', exact: true }).click();
  await expect(page.getByText(`Could not change #${item.id}. Update denied.`)).toBeVisible();
  expect(await groupsOf(page, item.id)).toEqual(['Person A', '#1001 Make checkout easier']);
  const state = row(page, item.id).getByRole('combobox', { name: `State of #${item.id}` });
  await state.selectOption('Done');
  await expect(page.getByText(`Could not move #${item.id} to Done.`)).toBeVisible();
  await expect(state).toHaveValue('Queued');

  await row(page, item.id).getByRole('link', { name: item.title }).click();
  await expect(panel(page).getByLabel('State', { exact: true })).toHaveValue('Queued');
  await expect(page.getByText('Not saved')).toHaveCount(0);
  await page.goto('/board?type=Task');
  await expect(page.getByRole('region', { name: /^Queued, / }).getByText(item.title)).toBeVisible();
});

test('dropping on a story changes only the parent, with a keyboard alternative', async ({
  page,
}) => {
  const item = await createTicket(page, 'Grid drop example', { 'System.AssignedTo': 'person-b' });
  await page.request.put(`/api/work-items/${item.id}/parent`, {
    headers: origin,
    data: { parentId: 1010, expectedRev: item.rev },
  });
  await page.goto('/grid?grouping=story&assignee=person-b');
  await expect(row(page, item.id)).toBeVisible();
  expect(await groupsOf(page, item.id)).toEqual(['#1010 Show order history', 'Person B']);

  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes(`/work-items/${item.id}`) && r.method() !== 'GET') {
      requests.push(`${r.method()} ${r.postData()}`);
    }
  });
  await dragTo(page, item.id, '#1001 Make checkout easier');
  await expect(page.locator('.drag-preview')).toContainText(
    'Set parent to #1001 Make checkout easier. The assignee stays the same.',
  );
  await expect(heading(page, '#1001 Make checkout easier')).toContainText('Release to set parent');
  await page.mouse.up();
  await expect
    .poll(() => groupsOf(page, item.id))
    .toEqual(['#1001 Make checkout easier', 'Person B']);
  await expect
    .poll(() => requests)
    .toEqual([`PUT ${JSON.stringify({ parentId: 1001, expectedRev: item.rev + 1 })}`]);
  await expect(
    row(page, item.id).getByRole('button', { name: `Assignee of #${item.id}: Person B` }),
  ).toBeVisible();

  // A rule failure from ADO shows its message and puts the row back.
  await page.route(`**/api/work-items/${item.id}/parent`, (route) =>
    route.fulfill({
      status: 400,
      json: { code: 'VALIDATION', message: 'This change would make the item its own ancestor.' },
    }),
  );
  await dragTo(page, item.id, '#1010 Show order history');
  await page.mouse.up();
  await expect(
    page.getByText(`Could not change the parent of #${item.id}. This change would make`),
  ).toBeVisible();
  await expect
    .poll(() => groupsOf(page, item.id))
    .toEqual(['#1001 Make checkout easier', 'Person B']);
  await page.unroute(`**/api/work-items/${item.id}/parent`);

  // Keyboard: open the ticket and use the parent picker.
  await row(page, item.id).getByRole('link', { name: item.title }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Change parent' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('1030');
  await expect(page.getByRole('option', { name: /#1030/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => groupsOf(page, item.id))
    .toEqual(['#1030 Compare address lookup options', 'Person B']);
});

test('moving a story out of the sprint keeps its tickets grouped under it', async ({ page }) => {
  const story = await createTicket(page, 'Grid story move example', {
    'System.AssignedTo': 'person-b',
  });
  await page.request.put(`/api/work-items/${story.id}/parent`, {
    headers: origin,
    data: { parentId: null, expectedRev: story.rev },
  });
  const created = await page.request.post('/api/work-items', {
    headers: origin,
    data: {
      projectId: 'sample-project',
      type: 'Story',
      fields: {
        'System.Title': 'Grid story move example parent',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
        'System.AssignedTo': 'person-b',
      },
    },
  });
  const parent = (await created.json()) as { id: number; title: string };
  const moved = await page.request.put(`/api/work-items/${story.id}/parent`, {
    headers: origin,
    data: { parentId: parent.id, expectedRev: story.rev + 1 },
  });
  expect(moved.ok()).toBe(true);
  await page.goto('/grid?grouping=story&text=Grid%20story%20move%20example');
  const label = `#${parent.id} ${parent.title}`;
  await expect.poll(() => groupsOf(page, story.id)).toEqual([label, 'Person B']);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/work-items/${parent.id}`, async (route) => {
    if (route.request().method() === 'PATCH') await gate;
    await route.fallback();
  });
  await row(page, parent.id)
    .getByRole('combobox', { name: `Iteration of #${parent.id}` })
    .selectOption({ label: 'Sprint 2' });
  await expect(row(page, parent.id)).toHaveCount(0);
  expect(await groupsOf(page, story.id)).toEqual([label, 'Person B']);
  release();
  await expect
    .poll(async () => (await (await page.request.get(`/api/work-items/${parent.id}`)).json()).item)
    .toMatchObject({ iterationPath: 'Sample project\\Sprint 2' });
  await page.reload();
  await expect.poll(() => groupsOf(page, story.id)).toEqual([label, 'Person B']);
});

test('keyboard edits save on Enter and keep focus on the ticket', async ({ page }) => {
  await page.goto(LARGE);
  const assignee = row(page, 2005).getByRole('button', { name: /^Assignee of #2005/ });
  await assignee.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Person B');
  await page.keyboard.press('Enter');
  // The ticket moves far down to Person B, and focus follows it.
  await expect(assignee).toBeFocused();
  await expect(assignee).toHaveAccessibleName('Assignee of #2005: Person B');
  await expect(assignee).toBeInViewport();
  // The focused row can move before the rows around it are drawn again.
  await expect.poll(async () => (await groupsOf(page, 2005))[0]).toBe('Person B');

  let writes = 0;
  page.on('request', (r) => (writes += r.method() === 'PATCH' ? 1 : 0));
  // A pick that arrives well after a key press, as from an open list, saves at once.
  const state = row(page, 2005).getByRole('combobox', { name: 'State of #2005' });
  await state.focus();
  await page.keyboard.press('Shift');
  await page.waitForTimeout(250);
  await state.selectOption('Queued');
  await expect.poll(() => writes).toBe(1);

  // Stepping through a closed select with the keyboard only drafts until Enter.
  const iteration = row(page, 2005).getByRole('combobox', { name: 'Iteration of #2005' });
  await iteration.focus();
  await page.keyboard.press('s');
  await expect(iteration.locator('option:checked')).toHaveText('Sprint 2');
  await page.waitForTimeout(300);
  expect(writes).toBe(1);
  const index = Number(await row(page, 2005).getAttribute('aria-rowindex'));
  await page.keyboard.press('Enter');
  await expect(row(page, 2005)).toHaveCount(0);
  expect(writes).toBe(2);
  // Focus moves to the same control in the row that took its place.
  const next = page.locator(`tr[aria-rowindex="${index}"] .cell-iterationPath select`);
  await expect(next).toBeFocused();

  // Put the sample ticket back for the other checks on this sprint.
  const saved = (await (await page.request.get('/api/work-items/2005')).json()).item;
  await page.request.patch('/api/work-items/2005', {
    headers: origin,
    data: {
      expectedRev: saved.rev,
      fields: {
        'System.IterationPath': 'Sample project\\Sprint 1',
        'System.AssignedTo': 'person-a',
        'System.State': 'Done',
      },
    },
  });
});

test('a keyboard draft keeps the revision it started from', async ({ page }) => {
  await page.clock.install();
  const item = await createTicket(page, 'Grid draft revision example');
  await showOnly(page, 'person', item.id);
  const state = row(page, item.id).getByRole('combobox', { name: `State of #${item.id}` });
  await expect(state.locator('option')).toHaveText(['Queued', 'In progress', 'Done']);
  await state.focus();
  await page.keyboard.press('d');
  await expect(state).toHaveValue('Done');
  // Someone else edits the ticket, and the 45-second refresh brings the new revision.
  await page.request.patch(`/api/work-items/${item.id}`, {
    headers: origin,
    data: { expectedRev: item.rev, fields: { 'Microsoft.VSTS.Common.Priority': 3 } },
  });
  const refreshed = page.waitForResponse((r) => r.url().includes('/api/work-items?'));
  await page.clock.runFor(46_000);
  await refreshed;
  await expect(row(page, item.id).getByRole('combobox', { name: /^Priority/ })).toHaveValue('3');
  const sent = page.waitForRequest((r) => r.method() === 'PATCH');
  await page.keyboard.press('Enter');
  expect((await sent).postDataJSON()).toEqual({
    expectedRev: item.rev,
    fields: { 'System.State': 'Done' },
  });
  await expect(page.getByText(`#${item.id} changed elsewhere`)).toBeVisible();
  await expect(state).toHaveValue('Queued');
});

for (const finish of ['Enter', 'Tab', 'Escape']) {
  test(`a keyboard draft survives scrolling until ${finish}`, async ({ page }) => {
    const items = Array.from({ length: 1000 }, (_, index) =>
      ticket(2001 + index, 'Task', person('person-a', 'Person A'), null, {
        iterationPath: 'Sample project\\Sprint 1',
        state: 'Queued',
        rev: 7,
      }),
    );
    await page.route('**/api/work-items?*', (route) =>
      route.fulfill({ json: { items, ancestors: [], missingIds: [], incomplete: false } }),
    );
    const writes: unknown[] = [];
    await page.route('**/api/work-items/2005', (route) => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: detail({ ...items[4], rev: 8, state: 'Done' }) });
    });
    await page.goto(LARGE);
    const state = row(page, 2005).getByRole('combobox', { name: 'State of #2005' });
    await expect(state.locator('option')).toHaveText(['Queued', 'In progress', 'Done']);
    await state.evaluate((element: HTMLSelectElement) => {
      element.focus();
      // Keep change within the 100ms keyboard-draft window on every platform.
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
      element.value = 'Done';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(state).toHaveValue('Done');
    expect(writes).toEqual([]);
    const grid = page.locator('.grid-scroll');
    const height = await grid.evaluate((element) => element.scrollHeight);
    await grid.evaluate((element) => (element.scrollTop = 15_000));
    await expect
      .poll(async () =>
        Number(await page.locator('tr.ticket-row').last().getAttribute('data-index')),
      )
      .toBeGreaterThan(350);
    await expect(row(page, 2005)).toHaveCount(1);
    await expect(state).toBeFocused();
    await expect(state).toHaveValue('Done');
    expect(await page.locator('tr.ticket-row').count()).toBeLessThan(150);
    expect(await grid.evaluate((element) => element.scrollTop)).toBe(15_000);
    expect(await grid.evaluate((element) => element.scrollHeight)).toBe(height);
    expect(
      await grid.evaluate((element) => {
        const top =
          element.getBoundingClientRect().top + element.querySelector('thead')!.offsetHeight;
        const bottom = element.getBoundingClientRect().top + element.clientHeight;
        const boxes = [...element.querySelectorAll('tr.ticket-row')].map((r) =>
          r.getBoundingClientRect(),
        );
        return (
          boxes.some((b) => b.top <= top + 1 && b.bottom > top) &&
          boxes.some((b) => b.top < bottom && b.bottom >= bottom - 1)
        );
      }),
    ).toBe(true);
    await page.keyboard.press(finish);
    if (finish === 'Escape') {
      await expect(state).toHaveValue('Queued');
      // Leaving the grid lets the row unmount, and a canceled draft never saves.
      await page.getByRole('button', { name: 'Expand all' }).focus();
      await expect(row(page, 2005)).toHaveCount(0);
      await page.waitForTimeout(300);
      expect(writes).toEqual([]);
    } else {
      await expect
        .poll(() => writes)
        .toEqual([{ expectedRev: 7, fields: { 'System.State': 'Done' } }]);
    }
  });
}

test('a sorted keyboard save that moves the row far away keeps its control in view', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'eruza-grid-columns',
      JSON.stringify({ sorting: [{ id: 'state', desc: false }] }),
    ),
  );
  // Sorted by State, the one Done ticket is first. As Queued, it sorts after the other 999.
  const items = Array.from({ length: 1000 }, (_, index) =>
    ticket(2001 + index, 'Task', person('person-a', 'Person A'), null, {
      iterationPath: 'Sample project\\Sprint 1',
      state: index === 999 ? 'Done' : 'Queued',
      rev: 7,
    }),
  );
  await page.route('**/api/work-items?*', (route) =>
    route.fulfill({ json: { items, ancestors: [], missingIds: [], incomplete: false } }),
  );
  let writes = 0;
  await page.route('**/api/work-items/3000', (route) => {
    writes++;
    items[999] = { ...items[999], rev: 8, state: 'Queued' };
    return route.fulfill({ json: detail(items[999]) });
  });
  await page.goto(LARGE);
  const state = row(page, 3000).getByRole('combobox', { name: 'State of #3000' });
  await expect(state).toBeInViewport();
  await state.evaluate((element: HTMLSelectElement) => {
    element.focus();
    // Keep change within the 100ms keyboard-draft window on every platform.
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    element.value = 'Queued';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.keyboard.press('Enter');
  await expect.poll(() => writes).toBe(1);
  await expect
    .poll(async () => Number(await row(page, 3000).getAttribute('aria-rowindex')))
    .toBeGreaterThan(900);
  await expect(state).toBeFocused();
  await expect(state).toBeInViewport();
});

test('a story dropped on its own heading is rejected without a request', async ({ page }) => {
  const created = await page.request.post('/api/work-items', {
    headers: origin,
    data: {
      projectId: 'sample-project',
      type: 'Story',
      fields: {
        'System.Title': 'Grid own heading example',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    },
  });
  const own = (await created.json()) as { id: number };
  await showOnly(page, 'story', own.id);
  let writes = 0;
  page.on('request', (r) => (writes += r.method() === 'PUT' ? 1 : 0));
  await dragTo(page, own.id, `#${own.id} Grid own heading example`);
  await expect(page.locator('.drag-preview')).toContainText('An item cannot be its own parent.');
  await page.mouse.up();
  await expect(
    page.locator('.toast', { hasText: 'An item cannot be its own parent.' }),
  ).toBeVisible();
  expect(writes).toBe(0);
});

test('a 1,000-ticket sprint mounts few rows and scrolls to the end without gaps', async ({
  page,
}) => {
  await page.goto(LARGE);
  const grid = page.locator('.grid-scroll');
  await expect(row(page, 2000)).toBeVisible();
  await expect(page.locator('.list-toolbar')).toContainText(/Tickets 10\d\d/);
  const rowCount = Number(await page.locator('.meeting-grid').getAttribute('aria-rowcount'));
  let mostMounted = 0;
  for (;;) {
    const view = await grid.evaluate((el) => {
      const rows = [...el.querySelectorAll('tbody tr[aria-rowindex]')];
      const top = el.getBoundingClientRect().top + el.querySelector('thead')!.offsetHeight;
      const bottom = el.getBoundingClientRect().top + el.clientHeight;
      const boxes = rows.map((r) => r.getBoundingClientRect());
      return {
        indexes: rows.map((r) => Number(r.getAttribute('aria-rowindex'))),
        tickets: el.querySelectorAll('tr.ticket-row').length,
        covered:
          boxes.some((b) => b.top <= top + 1 && b.bottom > top) &&
          boxes.some((b) => b.top < bottom && b.bottom >= bottom - 1),
        end: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
      };
    });
    mostMounted = Math.max(mostMounted, view.tickets);
    expect(view.indexes).toEqual(view.indexes.map((_, i) => view.indexes[0] + i));
    expect(view.covered).toBe(true);
    if (view.end) {
      expect(view.indexes.at(-1)).toBe(rowCount);
      break;
    }
    await grid.evaluate((el) => (el.scrollTop += el.clientHeight * 0.9));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  }
  console.log(`most ticket rows mounted: ${mostMounted} of ${rowCount - 1} rows`);
  expect(mostMounted).toBeGreaterThan(0);
  expect(mostMounted).toBeLessThan(150);
});

/** Runs `act` in the page and returns the milliseconds until `done` holds, checked each frame. */
const timeIt = (page: Page, act: string, done: string) =>
  page.evaluate(`(async () => {
    const start = performance.now();
    ${act};
    while (!(${done})) await new Promise((r) => requestAnimationFrame(r));
    return Math.round(performance.now() - start);
  })()`) as Promise<number>;
const click = (text: string) =>
  `[...document.querySelectorAll('a, button')].find((e) => e.textContent.trim() === ${JSON.stringify(text)}).click()`;
const type = (value: string) =>
  `(() => {
    const input = document.querySelector('input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`;
const tickets = `document.querySelectorAll('tr.ticket-row').length`;

test('UI response times on the 1,000-ticket sprint', async ({ page, browserName }) => {
  await page.goto(LARGE);
  await expect(row(page, 2000)).toBeVisible();
  const size = await page.locator('.list-toolbar .count-badge').textContent();
  const times = {
    toRetro: await timeIt(
      page,
      click('Sprint retro'),
      `document.querySelector('tr.group-row button')?.textContent.startsWith('#2000')`,
    ),
    toUpdate: await timeIt(
      page,
      click('Sprint update'),
      `document.querySelector('tr.group-row button')?.textContent === 'Person A'`,
    ),
    collapseAll: await timeIt(page, click('Collapse all'), `${tickets} === 0`),
    expandAll: await timeIt(page, click('Expand all'), `${tickets} > 0`),
    filter: await timeIt(page, type('2005'), `${tickets} === 1`),
    clearFilter: await timeIt(page, type(''), `${tickets} > 1`),
    inlineEdit: await timeIt(
      page,
      `(() => {
        const select = document.querySelector('tr.ticket-row[data-id="2005"] select[aria-label^="Iteration"]');
        select.value = 'Sample project\\\\Sprint 2';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`,
      `!document.querySelector('tr.ticket-row[data-id="2005"]')`,
    ),
    // Grouping changes, then collapse and expand on Person, then Type, then Story.
    addLevel: await timeIt(
      page,
      `document.querySelector('[data-add="type"]').click()`,
      `!!document.querySelector('tr.group-row[data-depth="2"]')`,
    ),
    moveLevel: await timeIt(
      page,
      `document.querySelector('[data-level="type"] [data-action="earlier"]').click()`,
      `document.querySelector('tr.group-row[data-depth="1"] button')?.textContent.startsWith('Type: ')`,
    ),
    customCollapseAll: await timeIt(page, click('Collapse all'), `${tickets} === 0`),
    customExpandAll: await timeIt(page, click('Expand all'), `${tickets} > 0`),
  };
  const viewport = page.viewportSize();
  const note = `${browserName} ${page.context().browser()?.version()}, ${viewport?.width}x${viewport?.height}, ${size} tickets: ${JSON.stringify(times)} ms`;
  test.info().annotations.push({ type: 'timing', description: note });
  console.log(note);
  for (const ms of Object.values(times)) expect(ms).toBeLessThan(2000);
  // Put the edited ticket back for later runs on the same server.
  const saved = await (await page.request.get('/api/work-items/2005')).json();
  await page.request.patch('/api/work-items/2005', {
    headers: origin,
    data: {
      expectedRev: saved.item.rev,
      fields: { 'System.IterationPath': 'Sample project\\Sprint 1' },
    },
  });
});

const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => value === 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  }, state);

test('no per-ticket reads, and polling pauses while the page is hidden', async ({ page }) => {
  await page.clock.install();
  const counts = { list: 0, item: 0, members: 0 };
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path === '/api/work-items') counts.list++;
    else if (/^\/api\/work-items\/\d+/.test(path)) counts.item++;
    else if (path.endsWith('/members')) counts.members++;
  });
  await page.goto(LARGE);
  await expect(row(page, 2000)).toBeVisible();
  await page.locator('.grid-scroll').evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
  await page.locator('.grid-scroll').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.locator('tr.ticket-row').first()).toBeVisible();
  expect(counts).toEqual({ list: 1, item: 0, members: 1 });

  await page.clock.runFor(46_000);
  await expect.poll(() => counts.list).toBe(2);
  await setVisibility(page, 'hidden');
  await page.clock.runFor(140_000);
  expect(counts.list).toBe(2);
  await setVisibility(page, 'visible');
  await expect.poll(() => counts.list).toBe(3);
  expect(counts.item).toBe(0);
});

test('a custom grouping URL regroups the grid, and drops need a story level', async ({ page }) => {
  const item = await createTicket(page, 'Custom grouping example', {
    'System.AssignedTo': 'person-b',
  });
  const update = page.getByRole('link', { name: 'Sprint update', exact: true });
  const retro = page.getByRole('link', { name: 'Sprint retro', exact: true });

  await page.goto(`/grid?group=type,person&text=${item.id}`);
  await expect(page.getByRole('heading', { name: 'Custom grouping' })).toBeVisible();
  await expect(page.locator('.page-description')).toHaveText('Grouped by Type, then Person.');
  expect(await groupsOf(page, item.id)).toEqual(['Type: Task', 'Person B']);
  await expect(row(page, item.id).locator('.drag-handle')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Story' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Person' })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]grouping=/);
  await expect(update).not.toHaveAttribute('aria-current', 'page');
  await expect(retro).not.toHaveAttribute('aria-current', 'page');

  // An order that matches a preset is that preset, and old links still highlight.
  await page.goto('/grid?group=story,person');
  await expect(page.getByRole('heading', { name: 'Sprint retro' })).toBeVisible();
  await expect(retro).toHaveAttribute('aria-current', 'page');
  await page.goto('/grid?grouping=story');
  await expect(retro).toHaveAttribute('aria-current', 'page');
  await update.click();
  await expect(page.getByRole('heading', { name: 'Sprint update' })).toBeVisible();

  // Story as a later level still accepts drops on its headings.
  await page.goto(`/grid?group=type,story,person&text=${item.id}`);
  expect(await groupsOf(page, item.id)).toEqual([
    'Type: Task',
    '#1001 Make checkout easier',
    'Person B',
  ]);
  // Room below the target, so the drag never nears the window edge and auto-scrolls.
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/grid?group=type,story,person&assignee=person-b');
  await dragTo(page, item.id, '#1010 Show order history');
  await expect(page.locator('.drag-preview')).toContainText(
    'Set parent to #1010 Show order history.',
  );
  await page.mouse.up();
  await expect
    .poll(() => groupsOf(page, item.id))
    .toEqual(['Type: Task', '#1010 Show order history', 'Person B']);
});

test('the Group by bar adds, moves, removes, and resets levels from the keyboard', async ({
  page,
}) => {
  await page.goto('/grid?grouping=person');
  const bar = page.getByRole('group', { name: 'Group by' });
  const levels = bar.getByRole('listitem');
  await expect(levels).toHaveText([/Person/, /Story/]);

  await bar.getByRole('button', { name: 'Add Type level' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Custom grouping' })).toBeVisible();
  await expect(page).toHaveURL(/[?&]group=person%2Cstory%2Ctype/);
  await expect(bar.getByRole('button', { name: 'Move Type earlier' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(bar.getByRole('button', { name: 'Move Type earlier' })).toBeFocused();
  await page.keyboard.press('Enter');
  // Type is first now, so focus moves to the button that still applies.
  await expect(bar.getByRole('button', { name: 'Move Type later' })).toBeFocused();
  await expect(levels).toHaveText([/Type/, /Person/, /Story/]);
  await expect(bar.getByRole('status')).toHaveText('Grouped by Type, then Person, then Story.');
  for (const name of ['Sprint update', 'Sprint retro']) {
    await expect(page.getByRole('link', { name, exact: true })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  await expect(page.locator('tr.group-row[data-depth="0"]').first()).toContainText('Type: ');
  await expect(page.locator('tr.group-row[data-depth="2"]').first()).toBeVisible();

  await bar.getByRole('button', { name: 'Remove Story' }).focus();
  await page.keyboard.press('Enter');
  await expect(bar.getByRole('button', { name: 'Add Story level' })).toBeFocused();
  await expect(levels).toHaveText([/Type/, /Person/]);
  await expect(page.locator('.drag-handle')).toHaveCount(0);

  await bar.getByRole('button', { name: 'Sprint retro order' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Sprint retro' })).toBeVisible();
  await expect(page).toHaveURL(/[?&]grouping=story/);
  await expect(page).not.toHaveURL(/[?&]group=/);
  await expect(bar.getByRole('button', { name: 'Sprint update order' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Sprint retro', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(bar.getByRole('button', { name: 'Remove Story' })).toBeEnabled();
});
