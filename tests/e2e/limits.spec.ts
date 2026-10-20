import { expect, test } from '@playwright/test';

// Read-only. Simulates server limits by changing list responses in the browser.

const LIMIT = 'This sprint has more items than Eruza can load at once.';
const SLOW_DOWN = 'Azure DevOps asked Eruza to slow down. Try again shortly.';

test('a capped result is labeled incomplete on the board and in the grid', async ({ page }) => {
  await page.route('**/api/work-items?*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), incomplete: true } });
  });
  await page.goto('/board');
  await expect(page.getByText(LIMIT)).toBeVisible();
  await page.goto('/grid?grouping=person');
  await expect(page.getByText(LIMIT)).toBeVisible();
  await expect(page.locator('.list-toolbar .count-badge')).toHaveText(/^\d+\+$/);
});

test('rate limiting shows a message, and the next refresh recovers', async ({ page }) => {
  await page.clock.install();
  let limited = true;
  await page.route('**/api/work-items?*', (route) =>
    limited
      ? route.fulfill({
          status: 429,
          json: { code: 'RATE_LIMITED', message: SLOW_DOWN, retryAfterMs: 30_000 },
        })
      : route.fallback(),
  );
  await page.goto('/board');
  await expect(page.getByText(SLOW_DOWN)).toBeVisible();
  limited = false;
  await page.clock.runFor(46_000);
  await expect(page.locator('.board-card').first()).toBeVisible();
  await expect(page.getByText(SLOW_DOWN)).toBeHidden();
});
