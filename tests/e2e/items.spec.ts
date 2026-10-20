import { expect, test, type Page, type Request } from '@playwright/test';

// These tests share one in-memory mock server. Each uses its own items and leaves
// the items other specs check (1004, 1020, 1050, 1100) unchanged.

const origin = { origin: 'http://127.0.0.1:5173' };

async function openItem(page: Page, id: number, title: string) {
  await page.goto(`/board?item=${id}`);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
}

function writes(page: Page) {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET') seen.push(request);
  });
  return seen;
}

const getItem = async (page: Page, id: number) =>
  (await (await page.request.get(`/api/work-items/${id}`)).json()).item;

test('create validates required fields and keeps the draft after a server error', async ({
  page,
}) => {
  await page.goto('/board');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New work item' });
  await dialog.getByLabel('Type').selectOption('Bug');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByText('Enter a title.')).toBeVisible();
  await expect(dialog.getByText('This field is required.')).toBeVisible();

  await dialog.getByLabel('Title').fill('Totals drift after refresh');
  await dialog.getByLabel('Found In').fill('Release 3');
  let rejectOnce = true;
  await page.route('**/api/work-items', async (route) => {
    if (route.request().method() === 'POST' && rejectOnce) {
      rejectOnce = false;
      return route.fulfill({
        status: 400,
        json: {
          code: 'VALIDATION',
          message: 'Some fields need attention.',
          fieldErrors: { 'Custom.FoundIn': 'Azure DevOps rejected this value.' },
        },
      });
    }
    return route.fallback();
  });
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByText('Azure DevOps rejected this value.')).toBeVisible();
  await expect(dialog.getByLabel('Title')).toHaveValue('Totals drift after refresh');
  await expect(dialog.getByLabel('Found In')).toHaveValue('Release 3');

  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Totals drift after refresh');
});

test('add child creates the item and its parent link in one request', async ({ page }) => {
  await openItem(page, 1010, 'Show order history');
  const sent = writes(page);
  await page.getByRole('button', { name: 'Add child' }).click();
  const dialog = page.getByRole('dialog', { name: 'New child of #1010' });
  await expect(dialog.getByLabel('Type')).toHaveValue('Task');
  await dialog.getByLabel('Title').fill('Check older order totals');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Check older order totals');
  await expect(
    page.getByRole('region', { name: 'Parent' }).getByText('Show order history'),
  ).toBeVisible();
  expect(sent.map((r) => `${r.method()} ${new URL(r.url()).pathname}`)).toEqual([
    'POST /api/work-items',
  ]);
  expect(sent[0].postDataJSON().parentId).toBe(1010);
});

test('quick edits save in order using the returned revisions', async ({ page }) => {
  const before = await getItem(page, 1002);
  await openItem(page, 1002, before.title);
  const sent = writes(page);
  await page.getByLabel('Priority').selectOption('3');
  await page.getByLabel('Title', { exact: true }).fill('Simplify the checkout form fields');
  await page.getByLabel('Title', { exact: true }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  const revs = sent.filter((r) => r.method() === 'PATCH').map((r) => r.postDataJSON().expectedRev);
  expect(revs).toEqual([before.rev, before.rev + 1]);
  expect(await getItem(page, 1002)).toMatchObject({
    title: 'Simplify the checkout form fields',
    priority: 3,
    rev: before.rev + 2,
  });
});

test('a conflict keeps the draft until the user saves it again', async ({ page }) => {
  const before = await getItem(page, 1003);
  await openItem(page, 1003, before.title);
  // Someone else changes the item after it was opened.
  await page.request.patch('/api/work-items/1003', {
    headers: origin,
    data: { expectedRev: before.rev, fields: { 'Microsoft.VSTS.Scheduling.RemainingWork': 5 } },
  });
  const title = page.getByLabel('Title', { exact: true });
  await title.fill('Cover checkout with end-to-end tests');
  await title.press('Enter');
  const problem = page.getByRole('alert').filter({ hasText: 'This item changed in Azure DevOps' });
  await expect(problem).toBeVisible();
  await expect(title).toHaveValue('Cover checkout with end-to-end tests');
  await expect(page.getByLabel('Remaining Work')).toHaveValue('5');
  await problem.getByRole('button', { name: 'Save again' }).click();
  await expect(problem).toBeHidden();
  expect(await getItem(page, 1003)).toMatchObject({
    title: 'Cover checkout with end-to-end tests',
    remainingWork: 5,
  });
});

test('a state change can carry the fields ADO requires in one save', async ({ page }) => {
  await openItem(page, 1040, 'Fix the currency label');
  await page.getByLabel('State').selectOption('Resolved');
  const problem = page.getByRole('alert').filter({ hasText: 'Not saved: State' });
  await problem.getByLabel('Resolved Reason').selectOption('Fixed');
  await problem.getByRole('button', { name: 'Save together' }).click();
  await expect(problem).toBeHidden();
  await expect(page.getByLabel('State')).toHaveValue('Resolved');
  expect((await getItem(page, 1040)).fields['Microsoft.VSTS.Common.ResolvedReason']).toBe('Fixed');
});

test('parents can be changed and removed, and loops are refused', async ({ page }) => {
  await openItem(page, 1012, 'Page through older orders');
  const parent = page.getByRole('region', { name: 'Parent' });
  await parent.getByRole('button', { name: 'Change parent' }).click();
  await page
    .getByRole('combobox')
    .and(page.getByPlaceholder('Search by ID or title'))
    .fill('Make checkout');
  await page.getByRole('option', { name: /#1001/ }).click();
  await expect(parent.getByText('Make checkout easier')).toBeVisible();
  await parent.getByRole('button', { name: 'Remove parent' }).click();
  await expect(parent.getByText('No parent.')).toBeVisible();
  expect((await page.request.get('/api/work-items/1001')).ok()).toBe(true);

  await openItem(page, 1001, 'Make checkout easier');
  await page
    .getByRole('region', { name: 'Parent' })
    .getByRole('button', { name: 'Change parent' })
    .click();
  await page.getByRole('combobox').and(page.getByPlaceholder('Search by ID or title')).fill('1002');
  await page.getByRole('option', { name: /#1002/ }).click();
  await expect(page.getByText('This change would make the item its own ancestor.')).toBeVisible();
});

test('rich text is shown safely and opening the editor sends no write', async ({ page }) => {
  const alerts: string[] = [];
  page.on('dialog', (dialog) => {
    alerts.push(dialog.message());
    void dialog.dismiss();
  });
  const sent = writes(page);
  await openItem(page, 1001, 'Make checkout easier');
  const editor = page.getByRole('textbox', { name: 'Description' });
  await expect(editor.locator('table')).toBeVisible();
  await expect(editor.getByRole('img', { name: 'Checkout flow' })).toHaveAttribute(
    'src',
    /\/api\/work-items\/1001\/images\//,
  );
  await editor.locator('p').first().click();
  await page.getByLabel('Title', { exact: true }).focus();
  await page.waitForTimeout(2000);
  expect(sent).toEqual([]);

  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ready to ship.');
  await page.getByLabel('Title', { exact: true }).focus();
  await expect
    .poll(async () => (await getItem(page, 1001)).description)
    .toContain('Ready to ship.');
  const saved = (await getItem(page, 1001)).description;
  expect(saved).toContain('<table');
  expect(saved).toContain('/images/');

  await openItem(page, 1002, (await getItem(page, 1002)).title);
  await expect(page.getByText('formatting Eruza cannot edit without losing it')).toBeVisible();
  await openItem(page, 1003, (await getItem(page, 1003)).title);
  await expect(page.getByRole('link', { name: 'test plan' })).toHaveAttribute(
    'href',
    'https://example.com/test-plan',
  );
  await expect(page.locator('.rich-text a', { hasText: 'Run' })).not.toHaveAttribute('href', /.*/);
  expect(alerts).toEqual([]);
});

test('panel and full page edit the same item, and I assigns it to me', async ({ page }) => {
  await openItem(page, 1031, 'Summarize lookup findings');
  await expect(page.getByRole('complementary', { name: 'Work item details' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Assignee: Person D' })).toBeVisible();
  const title = page.getByLabel('Title', { exact: true });
  await title.focus();
  await title.press('End');
  // Typing "i" in a field must not trigger the shortcut.
  await page.keyboard.type(' in review');
  await title.press('Enter');
  await expect(page.getByRole('button', { name: 'Assignee: Person D' })).toBeVisible();

  await page.getByRole('complementary', { name: 'Work item details' }).focus();
  await page.keyboard.press('i');
  await expect(page.getByRole('button', { name: 'Assignee: Person A' })).toBeVisible();

  await page.getByRole('link', { name: 'Open full page' }).click();
  await expect(page).toHaveURL(/\/items\/1031/);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Summarize lookup findings in review',
  );
  await expect(page.getByRole('button', { name: 'Assignee: Person A' })).toBeVisible();
  await page.getByRole('region', { name: 'Parent' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/items\/1030/);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Compare address lookup options',
  );
});
