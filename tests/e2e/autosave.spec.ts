import { expect, test } from '@playwright/test';

const headers = { origin: 'http://127.0.0.1:5173' };

test('leaving an untouched focused field never overwrites a refreshed value', async ({ page }) => {
  const response = await page.request.post('/api/work-items', {
    headers,
    data: {
      projectId: 'sample-project',
      type: 'Task',
      fields: {
        'System.Title': 'Untouched focus example',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    },
  });
  expect(response.ok()).toBe(true);
  const item = (await response.json()) as { id: number; rev: number };
  await page.clock.install();
  await page.goto(`/board?item=${item.id}`);
  const title = page.getByLabel('Title', { exact: true });
  await expect(title).toHaveValue('Untouched focus example');
  await title.focus();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH') writes.push(request.url());
  });
  const changed = await page.request.patch(`/api/work-items/${item.id}`, {
    headers,
    data: {
      expectedRev: item.rev,
      fields: {
        'System.Title': 'Title changed elsewhere',
        'System.Tags': 'external-update',
      },
    },
  });
  expect(changed.ok()).toBe(true);
  await page.clock.runFor(45_000);
  await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('external-update');
  await expect(title).toHaveValue('Untouched focus example');
  await title.press('Tab');
  await page.clock.runFor(1500);
  await expect(title).toHaveValue('Title changed elsewhere');
  expect(writes).toEqual([]);
  const saved = await page.request.get(`/api/work-items/${item.id}`);
  expect((await saved.json()).item.title).toBe('Title changed elsewhere');
});

test('retrying a combined save does not undo a newer successful field edit', async ({ page }) => {
  const response = await page.request.post('/api/work-items', {
    headers,
    data: {
      projectId: 'sample-project',
      type: 'Bug',
      fields: {
        'System.Title': 'Partial retry example',
        'Custom.FoundIn': 'Release 3',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    },
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()) as { id: number };
  await page.goto(`/board?item=${id}`);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Partial retry example');
  const patches: Record<string, unknown>[] = [];
  let rejectCombined = true;
  await page.route(`**/api/work-items/${id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const { fields } = route.request().postDataJSON();
    patches.push(fields);
    if (rejectCombined && Object.keys(fields).length === 2) {
      rejectCombined = false;
      return route.fulfill({
        status: 503,
        json: { code: 'UPSTREAM', message: 'Try this change again.' },
      });
    }
    return route.fallback();
  });
  await page.getByLabel('State', { exact: true }).selectOption('Resolved');
  await page.getByLabel('Resolved Reason', { exact: true }).selectOption('Fixed');
  await page.getByRole('button', { name: 'Save together' }).click();
  await expect(page.getByText('Try this change again.')).toBeVisible();
  await page.getByLabel('State', { exact: true }).selectOption('Active');
  const problem = page.getByRole('alert').filter({ hasText: 'Not saved: Resolved Reason.' });
  await expect(problem).toBeVisible();
  await problem.getByRole('button', { name: 'Save again' }).click();
  await expect(problem).toBeHidden();
  expect(patches.at(-1)).toEqual({ 'Microsoft.VSTS.Common.ResolvedReason': 'Fixed' });
  const saved = await page.request.get(`/api/work-items/${id}`);
  expect((await saved.json()).item.state).toBe('Active');
});
