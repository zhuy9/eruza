import { expect, test } from '@playwright/test';

for (const view of ['board', 'grid']) {
  for (const resource of ['members', 'settings']) {
    test(`${view} keeps saved filters when ${resource} fails and recovers`, async ({ page }) => {
      const area = 'Sample project\\Web\\Checkout';
      const message =
        resource === 'members' ? 'Team members could not load.' : 'Team areas could not load.';
      const path = `**/api/projects/sample-project/teams/web-team/${resource}`;
      let failed = true;
      await page.route(path, (route) =>
        failed
          ? route.fulfill({ status: 503, json: { code: 'UPSTREAM', message: 'Upstream failed.' } })
          : route.fallback(),
      );
      await page.route('**/api/work-items?*', async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        const base = data.items.find((item: { type: string }) => item.type === 'Task');
        await route.fulfill({
          json: {
            ...data,
            items: [
              {
                ...base,
                id: 7101,
                title: 'Selected ticket',
                areaPath: area,
                assignee: { id: 'person-a', displayName: 'Person A' },
              },
              {
                ...base,
                id: 7102,
                title: 'Other person',
                areaPath: area,
                assignee: { id: 'person-b', displayName: 'Person B' },
              },
              {
                ...base,
                id: 7103,
                title: 'Other area',
                areaPath: 'Sample project\\Web',
                assignee: { id: 'person-a', displayName: 'Person A' },
              },
            ],
          },
        });
      });
      const params = new URLSearchParams({ type: 'Task', assignee: 'person-a', area });
      await page.goto(`/${view}?${params}`);
      await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Assignee', exact: true })).toHaveValue(
        'person-a',
      );
      await expect(page.getByRole('combobox', { name: 'Area', exact: true })).toHaveValue(area);
      const tickets = page.locator(view === 'board' ? '.board-card' : 'tr.ticket-row');
      await expect(tickets).toHaveCount(1);
      await expect(
        tickets.getByRole('link', { name: 'Selected ticket', exact: true }),
      ).toBeVisible();

      failed = false;
      await page.reload();
      await expect(page.getByRole('combobox', { name: 'Area', exact: true })).toHaveValue(area);
      await expect(
        page.getByRole('combobox', { name: 'Assignee', exact: true }).locator('option:checked'),
      ).toHaveText('Person A');
      await expect(page.getByRole('alert').filter({ hasText: message })).toBeHidden();
      await expect(tickets).toHaveCount(1);
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(tickets).toHaveCount(3);
    });
  }
}

test('shared filters survive view changes and scope changes clear invalid selections', async ({
  page,
}) => {
  await page.goto('/board?type=Bug');
  await page.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption('@none');
  await page
    .getByRole('combobox', { name: 'Area', exact: true })
    .selectOption('Sample project\\Web');
  await page.getByRole('searchbox').fill('1004');
  await expect(page.locator('.board-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Sprint retro', exact: true }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('1004');
  await expect(page.getByRole('combobox', { name: 'Assignee', exact: true })).toHaveValue('@none');
  await expect(page.locator('tr.ticket-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption('person-a');
  await page
    .getByRole('combobox', { name: 'Area', exact: true })
    .selectOption('Sample project\\Web');
  await page.getByLabel('Team', { exact: true }).selectOption('platform-team');
  await expect(page.getByRole('combobox', { name: 'Assignee', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Area', exact: true })).toHaveValue('');
  await expect(page.getByRole('link', { name: 'Speed up search', exact: true })).toBeVisible();
  await expect(page.getByText('Keep the selected delivery option')).toBeHidden();
  await expect(
    page.getByRole('combobox', { name: 'Area', exact: true }).locator('option'),
  ).toHaveText(['All team areas', 'Sample project\\Platform']);
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('Task');
  await page.getByLabel('Project', { exact: true }).selectOption('practice-project');
  await expect(page.getByLabel('Team', { exact: true })).toHaveValue('practice-team');
  await expect(page.locator('.board-card')).toHaveCount(0);
  await expect(page).not.toHaveURL(/type=Task/);
});

test('search stays in sync after clearing filters and browser Back', async ({ page }) => {
  await page.goto('/board?type=Bug&text=1004');
  const search = page.getByRole('searchbox');
  await expect(search).toHaveValue('1004');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await page.goBack();
  await expect(search).toHaveValue('1004');
  await search.fill('different');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  // A delayed search must not restore the cleared filter.
  await page.waitForTimeout(400);
  await expect(search).toHaveValue('');
  await expect(page).not.toHaveURL(/text=/);
});

test('typing in the middle of the search keeps the caret in place', async ({ page }) => {
  await page.goto('/board?type=Bug');
  const search = page.getByRole('searchbox');
  await search.fill('1004');
  await search.press('Home');
  await search.pressSequentially('ab');
  await expect(search).toHaveValue('ab1004');
  await expect(page).toHaveURL(/text=ab1004/);
});

test('area subpaths and every selected tag filter the current sprint', async ({ page }) => {
  await page.goto('/grid?grouping=person');
  await page.route('**/api/work-items?*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const base = data.items[0];
    await route.fulfill({
      json: {
        ...data,
        items: [
          {
            ...base,
            id: 7001,
            title: 'Both tags',
            areaPath: 'Sample project\\Web\\Checkout',
            tags: ['One', 'Two'],
          },
          {
            ...base,
            id: 7002,
            title: 'Only one tag',
            areaPath: 'Sample project\\Web',
            tags: ['One'],
          },
        ],
      },
    });
  });
  await page.reload();
  await page
    .getByRole('combobox', { name: 'Area', exact: true })
    .selectOption('Sample project\\Web');
  await page.getByRole('button', { name: 'Tags', exact: true }).click();
  await page.getByRole('checkbox', { name: 'One', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Two', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('tr.ticket-row')).toHaveCount(1);
  await expect(page.getByText('Both tags', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tags: One, Two' })).toBeVisible();
  await expect(page.locator('.board-card')).toHaveCount(1);
});
