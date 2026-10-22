import { expect, test, type Page, type Request } from '@playwright/test';

// Shares the mock server with the other specs. Comments go on 1011, deletions use new items.

const origin = { origin: 'http://127.0.0.1:5173' };

/** Opens the item in the panel. Other specs may have renamed it, so the title comes from the API. */
async function openItem(page: Page, id: number) {
  const { item } = await (await page.request.get(`/api/work-items/${id}`)).json();
  await page.goto(`/board?item=${id}`);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(item.title);
}

function writes(page: Page) {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET') seen.push(request);
  });
  return seen;
}

const describe = (requests: Request[]) =>
  requests.map((r) => `${r.method()} ${new URL(r.url()).pathname}`);

test('comment pages load newest first without repeats, and markup shows safely', async ({
  page,
}) => {
  const alerts: string[] = [];
  page.on('dialog', (dialog) => {
    alerts.push(dialog.message());
    void dialog.dismiss();
  });
  // A comment added between page loads can shift ADO's pages and repeat a comment.
  const first = await (
    await page.request.get('/api/work-items/1001/comments?projectId=sample-project')
  ).json();
  await page.route('**/api/work-items/1001/comments?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('cursor') !== '10') return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, comments: [first.comments.at(-1), ...body.comments] },
    });
  });

  await openItem(page, 1001);
  const comments = page.getByRole('region', { name: 'Comments' });
  const bodies = comments.locator('.comment-body');
  await expect(bodies).toHaveCount(10);
  await expect(bodies.first()).toHaveText('Sample comment 23.');
  await comments.getByRole('button', { name: 'Show older comments' }).click();
  await expect(bodies).toHaveCount(20);
  await comments.getByRole('button', { name: 'Show older comments' }).click();
  await expect(bodies).toHaveCount(23);
  await expect(comments.getByRole('button', { name: 'Show older comments' })).toBeHidden();
  const numbers = (await bodies.allTextContents()).map((text) => Number(/\d+/.exec(text)![0]));
  expect(numbers).toEqual(Array.from({ length: 23 }, (_, k) => 23 - k));
  await expect(comments.locator('strong', { hasText: 'Sample comment 20' })).toBeVisible();

  await openItem(page, 1003);
  await expect(comments.locator('a[data-vss-mention="version:2.0,person-b"]')).toHaveText(
    '@Person B',
  );
  await expect(comments.getByText('Plain *Markdown* note')).toBeVisible();
  await expect(comments.getByRole('link', { name: 'notes' })).toHaveAttribute(
    'href',
    'https://example.com/notes',
  );
  await expect(comments.locator('a', { hasText: 'this' })).not.toHaveAttribute('href', /.*/);
  await expect(comments.locator('.comment-body img, .comment-body script')).toHaveCount(0);
  expect(alerts).toEqual([]);
});

test('a comment with a mention is sent once per click, and failures keep the draft', async ({
  page,
}) => {
  await openItem(page, 1011);
  const sent = writes(page);
  const box = page.getByRole('textbox', { name: 'New comment' });
  const send = page.getByRole('button', { name: 'Add comment' });
  await expect(send).toBeDisabled();
  await box.click();
  await page.keyboard.type('Please check this @Per');
  const people = page.getByRole('listbox', { name: 'Team members' });
  await expect(people.getByRole('option')).toHaveText(['Person A', 'Person B', 'Person C']);
  await page.keyboard.press('ArrowDown');
  await expect(people.getByRole('option', { name: 'Person B' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(box).toHaveAttribute(
    'aria-activedescendant',
    (await people.getByRole('option', { name: 'Person B' }).getAttribute('id'))!,
  );
  await page.keyboard.press('Enter');
  await expect(people).toBeHidden();
  await page.keyboard.type('today.');

  let attempt = 0;
  await page.route('**/api/work-items/1011/comments', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempt++;
    if (attempt === 1) {
      return route.fulfill({
        status: 502,
        json: { code: 'UPSTREAM', message: 'Azure DevOps returned an unexpected response.' },
      });
    }
    return attempt === 2 ? route.abort('failed') : route.fallback();
  });
  await send.click();
  await expect(page.getByRole('alert')).toContainText('The comment was not added.');
  await expect(box).toContainText('Please check this @Person B today.');
  await send.click();
  await expect(page.getByRole('alert')).toContainText('It may already be posted.');
  await expect(box).toContainText('Please check this @Person B today.');
  expect(describe(sent)).toEqual(Array(2).fill('POST /api/work-items/1011/comments'));

  await send.click();
  await expect(box).toHaveText('');
  const newest = page.getByRole('region', { name: 'Comments' }).locator('.comment-body').first();
  await expect(newest).toHaveText('Please check this @Person B today.');
  await expect(newest.locator('a[data-vss-mention]')).toHaveAttribute(
    'data-vss-mention',
    'version:2.0,person-b',
  );
  expect(describe(sent)).toEqual(Array(3).fill('POST /api/work-items/1011/comments'));
  expect(sent[2].postDataJSON()).toEqual({
    projectId: 'Sample project',
    html: '<p>Please check this <a href="#" data-vss-mention="version:2.0,person-b">@Person B</a> today.</p>',
  });
  const stored = await (
    await page.request.get('/api/work-items/1011/comments?projectId=sample-project')
  ).json();
  expect(
    stored.comments.filter((c: { html: string }) => c.html.includes('Please check')),
  ).toHaveLength(1);
});

test('copy actions use the clipboard and report failures', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openItem(page, 1012);
  await expect(page.getByRole('link', { name: 'Open in Azure DevOps' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy ID' }).click();
  await expect(page.getByText('Copied ID 1012.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1012');
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Copied the link to #1012.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'http://127.0.0.1:5173/items/1012',
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: () => Promise.reject(new Error('blocked')),
    }),
  );
  await page.getByRole('button', { name: 'Copy ID' }).click();
  await expect(page.getByText('Could not copy.')).toBeVisible();
});

test('the Azure DevOps link opens the item page in a new tab', async ({ page }) => {
  const url = 'https://dev.azure.com/sample-org/Sample%20project/_workitems/edit/1012';
  await page.route('**/api/work-items/1012', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), webUrl: url } });
  });
  await openItem(page, 1012);
  const link = page.getByRole('link', { name: 'Open in Azure DevOps' });
  await expect(link).toHaveAttribute('href', url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

async function createTask(page: Page, title: string): Promise<number> {
  const response = await page.request.post('/api/work-items', {
    headers: origin,
    data: {
      projectId: 'sample-project',
      type: 'Task',
      fields: {
        'System.Title': title,
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id;
}

test('delete asks first, cancel sends nothing, and confirming uses the recycle bin', async ({
  page,
}) => {
  const id = await createTask(page, 'Disposable sample task');
  await openItem(page, id);
  const sent = writes(page);
  const panel = page.getByRole('complementary', { name: 'Work item details' });
  const dialog = page.getByRole('dialog', { name: `Delete #${id} Disposable sample task?` });

  await panel.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toContainText('Recycle Bin, where it can be restored');
  await expect(dialog).toContainText('never deletes items permanently');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(sent).toEqual([]);

  let refuse = true;
  let answer = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route(`**/api/work-items/${id}`, async (route) => {
    if (route.request().method() !== 'DELETE' || !refuse) return route.fallback();
    refuse = false;
    await answered;
    return route.fulfill({
      status: 403,
      json: { code: 'FORBIDDEN', message: 'You do not have permission for this resource.' },
    });
  });
  await panel.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Move to Recycle Bin' }).click();
  // While ADO has not answered, the dialog cannot close, so its outcome stays visible.
  await expect(dialog.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  // The disabled buttons must not let Tab reach the page behind the dialog.
  for (const key of ['Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  answer();
  await expect(dialog.getByRole('alert')).toHaveText(
    'You do not have permission for this resource.',
  );
  await expect(page.getByText(/Moved #\d+ to/)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Move to Recycle Bin' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByText(`Moved #${id} to the Azure DevOps Recycle Bin.`)).toBeVisible();
  expect(describe(sent)).toEqual(Array(2).fill(`DELETE /api/work-items/${id}`));
  expect((await page.request.get(`/api/work-items/${id}`)).status()).toBe(404);

  const pageId = await createTask(page, 'Disposable page task');
  await page.goto(`/items/${pageId}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Move to Recycle Bin' }).click();
  await expect(page).toHaveURL(/\/board/);
  expect((await page.request.get(`/api/work-items/${pageId}`)).status()).toBe(404);
});
