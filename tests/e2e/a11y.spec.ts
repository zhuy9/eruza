import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Read-only: these checks open views and dialogs but never save.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Each WCAG A/AA problem axe finds on the page, with up to three example elements. */
async function problems(page: Page, state: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(
    (v) =>
      `${state}: ${v.id} (${v.nodes.length}) ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
}

for (const theme of ['light', 'dark']) {
  test(`views and dialogs meet WCAG A and AA in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('eruza-theme', value), theme);
    const found: string[] = [];

    await page.goto('/board');
    await expect(page.locator('.board-card').first()).toBeVisible();
    found.push(...(await problems(page, 'board')));
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    found.push(...(await problems(page, 'collapsed sidebar')));
    await page.getByRole('button', { name: 'Expand sidebar' }).click();

    for (const grouping of ['person', 'story']) {
      await page.goto(`/grid?grouping=${grouping}`);
      await expect(page.locator('.meeting-grid tbody tr').nth(2)).toBeVisible();
      found.push(...(await problems(page, `grid ${grouping}`)));
    }
    await page.goto('/grid?group=type,story,person');
    await expect(page.locator('tr.group-row[data-depth="2"]').first()).toBeVisible();
    found.push(...(await problems(page, 'grid custom grouping')));

    await page.goto('/board?item=1001');
    await expect(page.locator('.comment-body').first()).toBeVisible();
    found.push(...(await problems(page, 'detail panel')));

    await page.getByRole('button', { name: /^Assignee:/ }).click();
    await expect(page.getByPlaceholder('Search people')).toBeVisible();
    found.push(...(await problems(page, 'assignee picker')));
    await page.keyboard.press('Escape');

    await page.getByRole('textbox', { name: 'New comment' }).click();
    await page.keyboard.type('Hi @Per');
    await expect(page.getByRole('listbox', { name: 'Team members' })).toBeVisible();
    found.push(...(await problems(page, 'mention list')));
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog', { name: /^Delete #1001/ })).toBeVisible();
    found.push(...(await problems(page, 'delete dialog')));
    await page.keyboard.press('Escape');

    await page.goto('/items/1003');
    await expect(page.locator('.comment-body').first()).toBeVisible();
    found.push(...(await problems(page, 'item page')));

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'New work item' })).toBeVisible();
    found.push(...(await problems(page, 'create dialog')));
    await page.keyboard.press('Escape');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByPlaceholder('Type a command')).toBeVisible();
    found.push(...(await problems(page, 'command palette')));
    await page.keyboard.press('Escape');

    await page.route('**/api/session', (route) =>
      route.fulfill({
        json: {
          mode: 'ado',
          status: 'error',
          code: 'AUTH_REQUIRED',
          message: 'Sign in with Azure CLI, then retry.',
          loginCommand: 'az login --allow-no-subscriptions',
        },
      }),
    );
    await page.goto('/board');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    found.push(...(await problems(page, 'login banner')));

    expect(found).toEqual([]);
  });
}
