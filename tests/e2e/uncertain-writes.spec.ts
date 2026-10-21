import { expect, test } from '@playwright/test';

test('an unreadable successful create keeps the draft and warns before repeating', async ({
  page,
}) => {
  await page.goto('/board');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New work item' });
  await dialog.getByLabel('Type', { exact: true }).selectOption('Task');
  await dialog.getByLabel('Title', { exact: true }).fill('Uncertain create example');
  let writes = 0;
  await page.route('**/api/work-items', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    expect((await route.fetch()).ok()).toBe(true);
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{broken' });
  });
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('It may already exist.');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Uncertain create example');
  expect(writes).toBe(1);
});

test('an unreadable successful comment keeps the draft and refreshes the thread', async ({
  page,
}) => {
  await page.goto('/board?item=1011');
  const box = page.getByRole('textbox', { name: 'New comment' });
  await expect(box).toBeVisible();
  await box.fill('Uncertain comment example.');
  let writes = 0;
  await page.route('**/api/work-items/1011/comments', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    expect((await route.fetch()).ok()).toBe(true);
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{broken' });
  });
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('It may already be posted.');
  await expect(box).toHaveText('Uncertain comment example.');
  await expect(
    page.locator('.comment-body').filter({ hasText: 'Uncertain comment example.' }),
  ).toHaveCount(1);
  expect(writes).toBe(1);
});
