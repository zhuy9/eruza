import { expect, test } from '@playwright/test';

test('mock shell supports navigation, reload, theme, and keyboard focus', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByText('Mock mode', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Sprint update', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sprint update', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sprint update', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Sprint retro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sprint retro', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  expect(external).toEqual([]);
});

test('a failed session refresh keeps the full-page comment draft', async ({ page }) => {
  await page.clock.install();
  await page.goto('/items/1011');
  const box = page.getByRole('textbox', { name: 'New comment' });
  await box.fill('Keep this unsent comment.');
  await page.route('**/api/session', (route) => route.abort());
  await page.clock.runFor(31_000);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await page.clock.runFor(2_000);
  const warning = page.getByRole('alert').filter({ hasText: 'Could not reach' });
  await expect(warning).toBeVisible();
  await expect(box).toHaveText('Keep this unsent comment.');
  await page.unroute('**/api/session');
  await warning.getByRole('button', { name: 'Try again' }).click();
  await expect(warning).toBeHidden();
  await expect(box).toHaveText('Keep this unsent comment.');
});

test('the sidebar collapses to icons and remembers the choice', async ({ page }) => {
  await page.goto('/board');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByLabel('Project', { exact: true })).toBeHidden();
  expect((await page.locator('aside.sidebar').boundingBox())?.width).toBeLessThan(80);
  await page.getByRole('link', { name: 'Sprint update' }).click();
  await expect(page.getByRole('heading', { name: 'Sprint update', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.getByLabel('Project', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
});
