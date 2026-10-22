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
  // The mobile browser bar follows the theme.
  const barColor = page.locator('meta[name="theme-color"]');
  await expect(barColor).toHaveAttribute('content', '#f8f9fc');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(barColor).toHaveAttribute('content', '#191f2b');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(barColor).toHaveAttribute('content', '#191f2b');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.goto('/no-such-page');
  await expect(page.getByRole('alert')).toHaveText(
    'This page does not exist. Choose a view from the menu.',
  );
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

test('icon buttons and rail links show tooltips', async ({ page }) => {
  await page.goto('/board?item=1001');
  const tooltip = page.locator('[data-slot="tooltip-content"]');
  await page.getByRole('button', { name: 'Copy ID' }).hover();
  await expect(tooltip).toContainText('Copy ID');
  // Expanded links have no hint, and hovering one leaves nothing to show after collapsing.
  await page.mouse.move(700, 700, { steps: 5 });
  await expect(tooltip).toHaveCount(0);
  const board = page.getByRole('link', { name: 'Board', exact: true });
  await board.hover();
  await board.hover({ position: { x: 20, y: 10 } });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(300);
  await expect(tooltip).toHaveCount(0);
  await page.getByRole('link', { name: 'Sprint update' }).hover();
  await expect(tooltip).toContainText('Sprint update');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
});

test('Escape first closes a focused button tooltip, then the panel', async ({ page }) => {
  await page.goto('/board?item=1001');
  const panel = page.getByRole('complementary', { name: 'Work item details' });
  const copy = page.getByRole('button', { name: 'Copy ID' });
  await expect(panel).toBeFocused();
  for (let i = 0; i < 10 && !(await copy.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  const tooltip = page.locator('[data-slot="tooltip-content"]');
  await expect(tooltip).toContainText('Copy ID');
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});
