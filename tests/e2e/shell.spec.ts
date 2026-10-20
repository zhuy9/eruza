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
