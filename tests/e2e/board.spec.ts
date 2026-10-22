import { expect, test, type Page } from '@playwright/test';

const origin = { origin: 'http://127.0.0.1:5173' };
const column = (page: Page, state: string) =>
  page.getByRole('region', { name: new RegExp(`^${state}, \\d+ items$`) });

async function createItem(page: Page, title: string, type = 'Story') {
  const response = await page.request.post('/api/work-items', {
    headers: origin,
    data: {
      projectId: 'sample-project',
      type,
      fields: {
        'System.Title': title,
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
        ...(type === 'Bug' && { 'Custom.FoundIn': 'Release 3' }),
      },
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function drag(page: Page, title: string, state: string) {
  const card = page.locator('.board .board-card').filter({ hasText: title });
  const from = await card.boundingBox();
  const to = await column(page, state).boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + 15, from!.y + 15);
  await page.mouse.down();
  await page.mouse.move(from!.x + 25, from!.y + 25, { steps: 3 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 65, { steps: 12 });
  await page.mouse.up();
}

test('custom types and states come from metadata and cards show required fields', async ({
  page,
}) => {
  await page.goto('/board?type=Spike');
  await expect(column(page, 'Exploring')).toBeVisible();
  await expect(column(page, 'Concluded')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New', exact: true })).toHaveCount(0);
  const card = page.locator('.board-card').filter({ hasText: '#1030' });
  await expect(card.getByText('Compare address lookup options')).toBeVisible();
  await expect(card.getByRole('img', { name: 'Spike' })).toBeVisible();
  await expect(card.getByText('Person D', { exact: true })).toHaveCount(1);
  await expect(card.getByText('P2', { exact: true })).toBeVisible();
  await expect(page.locator('.board-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('Story');
  await expect(column(page, 'Ready for review')).toBeVisible();
  await expect(page.locator('.board-card .tag').first()).toBeVisible();
});

test('drag moves optimistically and the detail panel offers a keyboard state move', async ({
  page,
}) => {
  const item = await createItem(page, 'Board move example');
  await page.goto('/board?type=Story');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/work-items/${item.id}`, async (route) => {
    if (route.request().method() === 'PATCH') await gate;
    await route.fallback();
  });
  const request = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().endsWith(`/work-items/${item.id}`),
  );
  await drag(page, item.title, 'In progress');
  await expect(column(page, 'In progress').getByText(item.title)).toBeVisible();
  expect((await request).postDataJSON()).toEqual({
    expectedRev: item.rev,
    fields: { 'System.State': 'In progress' },
  });
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/work-items/${item.id}`),
  );
  release();
  expect((await saved).ok()).toBe(true);
  await page.getByRole('link', { name: item.title, exact: true }).focus();
  await page.keyboard.press('Enter');
  const state = page.getByLabel('State', { exact: true });
  await state.focus();
  // Type-ahead changes a closed select on every platform; arrow keys open it on macOS.
  // A keyboard step is a draft until Enter, so stepping past a state does not save it.
  await state.press('r');
  await expect(state).toHaveValue('Ready for review');
  await expect(column(page, 'In progress').getByText(item.title)).toBeVisible();
  await state.press('Enter');
  await expect(column(page, 'Ready for review').getByText(item.title)).toBeVisible();
});

test('failed drags roll back and conflicts refetch the actual state', async ({ page }) => {
  const item = await createItem(page, 'Board failure example');
  await page.goto('/board?type=Story');
  await page.route(`**/api/work-items/${item.id}`, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 403, json: { code: 'FORBIDDEN', message: 'Update denied.' } })
      : route.fallback(),
  );
  await drag(page, item.title, 'In progress');
  await expect(page.getByText(`Could not move #${item.id}`, { exact: false })).toBeVisible();
  await expect(column(page, 'New').getByText(item.title)).toBeVisible();
  await page.unroute(`**/api/work-items/${item.id}`);
  await page.request.patch(`/api/work-items/${item.id}`, {
    headers: origin,
    data: { expectedRev: item.rev, fields: { 'System.State': 'Done' } },
  });
  await drag(page, item.title, 'In progress');
  await expect(page.getByText(`#${item.id} changed elsewhere`, { exact: false })).toBeVisible();
  await expect(column(page, 'Done').getByText(item.title)).toBeVisible();
});

test('a rejected drag keeps required-field drafts for Save together', async ({ page }) => {
  const item = await createItem(page, 'Board required-field example', 'Bug');
  await page.goto('/board?type=Bug');
  await drag(page, item.title, 'Resolved');
  await expect(page.getByText(`#${item.id} needs more fields`, { exact: false })).toBeVisible();
  await expect(column(page, 'New').getByText(item.title)).toBeVisible();
  await page.getByRole('link', { name: item.title, exact: true }).click();
  const problem = page.getByRole('alert').filter({ hasText: 'Not saved: State' });
  await problem.getByLabel('Resolved Reason').selectOption('Fixed');
  await problem.getByRole('button', { name: 'Save together' }).click();
  await expect(problem).toBeHidden();
  await expect(column(page, 'Resolved').getByText(item.title)).toBeVisible();
});

const leaveBlocked = (page: Page) =>
  page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
// Firefox sends no blur when it removes a focused element. Block the one Chromium sends,
// so a draft must be saved when its input unmounts. React ignores focusout then anyway.
const blockBlur = (page: Page) =>
  page.evaluate(() =>
    window.addEventListener('blur', (event) => event.stopImmediatePropagation(), true),
  );

test('a later move replaces a rejected drag, so leaving no longer asks', async ({ page }) => {
  const item = await createItem(page, 'Replaced drag example', 'Bug');
  await page.goto('/board?type=Bug');
  await drag(page, item.title, 'Resolved');
  await expect(page.getByText(`#${item.id} needs more fields`, { exact: false })).toBeVisible();
  // The kept draft shows nowhere once a later move saves, so it must not block leaving.
  await drag(page, item.title, 'Active');
  await expect(column(page, 'Active').getByText(item.title)).toBeVisible();
  await expect.poll(() => leaveBlocked(page)).toBe(false);
});

test('going back right after stepping a select still saves it', async ({ page }) => {
  const item = await createItem(page, 'Step and leave example');
  await page.goto('/board?type=Story');
  await page.getByRole('link', { name: item.title, exact: true }).click();
  const state = page.getByLabel('State', { exact: true });
  await state.focus();
  await state.press('r');
  await expect(state).toHaveValue('Ready for review');
  await blockBlur(page);
  await page.goBack();
  await expect(state).toBeHidden();
  await expect
    .poll(async () => (await (await page.request.get(`/api/work-items/${item.id}`)).json()).item)
    .toMatchObject({ state: 'Ready for review' });
});

test('a draft that fails after the panel closes shows a toast', async ({ page }) => {
  const item = await createItem(page, 'Closed panel conflict example');
  await page.goto('/board?type=Story');
  await page.getByRole('link', { name: item.title, exact: true }).click();
  const title = page.getByLabel('Title', { exact: true });
  await expect(title).toHaveValue(item.title);
  const changed = await page.request.patch(`/api/work-items/${item.id}`, {
    headers: origin,
    data: { expectedRev: item.rev, fields: { 'System.Tags': 'changed-elsewhere' } },
  });
  expect(changed.ok()).toBe(true);
  await title.fill('Typed just before closing the panel');
  await blockBlur(page);
  await page.goBack();
  await expect(title).toBeHidden();
  await expect(page.getByText(`#${item.id}: Title not saved. Open it to review.`)).toBeVisible();
});

test('an older failed move does not discard a newer queued move', async ({ page }) => {
  const item = await createItem(page, 'Queued board move example');
  await page.goto('/board?type=Story');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  await page.route(`**/api/work-items/${item.id}`, async (route) => {
    if (route.request().method() === 'PATCH' && calls++ === 0) {
      await gate;
      return route.fulfill({
        status: 403,
        json: { code: 'FORBIDDEN', message: 'Update denied.' },
      });
    }
    return route.fallback();
  });
  await drag(page, item.title, 'In progress');
  await expect(column(page, 'In progress').getByText(item.title)).toBeVisible();
  await drag(page, item.title, 'Ready for review');
  await expect(column(page, 'Ready for review').getByText(item.title)).toBeVisible();
  release();
  await expect
    .poll(
      async () => (await (await page.request.get(`/api/work-items/${item.id}`)).json()).item.state,
    )
    .toBe('Ready for review');
  await expect(column(page, 'Ready for review').getByText(item.title)).toBeVisible();
  expect(calls).toBe(2);
});

test('column creation sends the chosen state and keeps a rejected draft', async ({ page }) => {
  await page.goto('/board?type=Spike');
  await page.getByRole('button', { name: 'New Spike in Concluded' }).click();
  const dialog = page.getByRole('dialog', { name: 'New work item' });
  await expect(dialog.getByLabel('Type')).toHaveValue('Spike');
  await dialog.getByLabel('Title').fill('Finished exploration example');
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/work-items'),
  );
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  expect((await (await response).json()).state).toBe('Concluded');
  await expect(dialog).toBeHidden();
  await page.goto('/board?type=Bug');
  await page.getByRole('button', { name: 'New Bug in Closed' }).click();
  await dialog.getByLabel('Title').fill('Rejected starting state example');
  await dialog.getByLabel('Found In').fill('Release 3');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('A new Bug cannot start in the Closed state.');
  await expect(dialog.getByLabel('Title')).toHaveValue('Rejected starting state example');
  await expect(dialog.getByLabel('Found In')).toHaveValue('Release 3');
});

test('New, C, and Ctrl or Cmd K open the shared create form without interrupting typing', async ({
  page,
}) => {
  await page.goto('/board');
  const dialog = page.getByRole('dialog', { name: 'New work item' });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator('#content').focus();
  await page.keyboard.press('c');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('searchbox').fill('c');
  await expect(dialog).toBeHidden();
  for (const shortcut of ['Control+k', 'Meta+k']) {
    await page.locator('#content').focus();
    await page.keyboard.press(shortcut);
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();
    await palette.getByRole('combobox').fill('New Spike');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Type')).toHaveValue('Spike');
    await dialog.getByLabel('Title').fill('c');
    await expect(dialog.getByLabel('Title')).toHaveValue('c');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test('the new item dialog keeps its draft on outside clicks and stays open while creating', async ({
  page,
}) => {
  await page.goto('/board');
  await expect(page.locator('.board-card').first()).toBeVisible();
  await page.keyboard.press('c');
  const dialog = page.getByRole('dialog', { name: 'New work item' });
  const title = dialog.getByLabel('Title');
  await title.fill('Dialog draft example');
  await page.mouse.click(10, 450);
  await expect(title).toHaveValue('Dialog draft example');
  await expect(title).toBeFocused();

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/work-items', async (route) => {
    if (route.request().method() === 'POST') await held;
    return route.fallback();
  });
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  // Focus stays in the dialog, so C cannot replace it and Tab cannot leave it.
  await page.keyboard.press('c');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(title).toHaveValue('Dialog draft example');
  for (const key of ['Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  release();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Dialog draft example');
});
