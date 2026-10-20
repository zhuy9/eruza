import { expect, test } from '@playwright/test';

test('defaults project, team, and sprint, and keeps valid choices', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByLabel('Project')).toHaveValue('sample-project');
  await expect(page.getByLabel('Team')).toHaveValue('web-team');
  await expect(page.getByLabel('Sprint')).toHaveValue('Sample project\\Sprint 3');
  await expect(page.getByText('Keep the selected delivery option')).toBeVisible();
  await expect(page.getByText('1 linked item could not be read.')).toBeVisible();

  await page.getByLabel('Sprint').selectOption({ label: 'Sprint 2' });
  await expect(page.getByText('Prepare the release')).toBeVisible();
  await page.getByRole('link', { name: 'Sprint retro' }).click();
  await expect(page.getByRole('heading', { name: 'Sprint retro' })).toBeVisible();
  await expect(page.getByLabel('Sprint')).toHaveValue('Sample project\\Sprint 2');
  await page.reload();
  await expect(page.getByLabel('Sprint')).toHaveValue('Sample project\\Sprint 2');

  await page.getByLabel('Team').selectOption({ label: 'Platform team' });
  await expect(page.getByText('Speed up search')).toBeVisible();
  await expect(page.getByLabel('Sprint')).toHaveValue('Sample project\\Sprint 3');

  await page.getByLabel('Project').selectOption({ label: 'Practice project' });
  await expect(page.getByLabel('Team')).toHaveValue('practice-team');
  await expect(page.getByText('This team has no current sprint')).toBeVisible();
  await page.getByLabel('Sprint').selectOption({ label: 'Sprint 2' });
  await expect(page.getByText('No work items in this sprint.')).toBeVisible();
});

test('shows the login command and recovers after retry', async ({ page }) => {
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
  const banner = page.getByRole('alert').filter({ hasText: 'Sign in with Azure CLI' });
  await expect(
    banner.getByText('az login --allow-no-subscriptions', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeVisible();

  await page.unroute('**/api/session');
  await banner.getByRole('button', { name: 'Retry' }).click();
  await expect(banner).toBeHidden();
});
