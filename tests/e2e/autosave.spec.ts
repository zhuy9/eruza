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
