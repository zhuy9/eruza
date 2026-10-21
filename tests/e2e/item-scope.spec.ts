import { expect, test, type Page } from '@playwright/test';
import type { WorkItemDetail } from '../../shared/contracts';

const defaultSprint = 'Practice project\\Default sprint';
const otherSprint = 'Practice project\\Other sprint';
const sampleSprint = 'Sample project\\Root sprint';
const person = (team: string) => ({
  id: `${team}-member`,
  displayName:
    team === 'practice-team'
      ? 'Practice member'
      : team === 'practice-other'
        ? 'Other practice member'
        : 'Sample member',
});
const item = (id: number): WorkItemDetail => ({
  id,
  rev: 1,
  project: 'Practice project',
  type: 'Task',
  title: `Practice item ${id}`,
  state: 'To Do',
  assignee: null,
  tags: [],
  areaPath: 'Practice project',
  iterationPath: defaultSprint,
  parentId: id === 7001 ? 7002 : null,
  priority: 2,
  remainingWork: null,
  estimate: null,
  description: '',
  fields: {
    'System.Title': `Practice item ${id}`,
    'System.State': 'To Do',
    'System.AreaPath': 'Practice project',
    'System.IterationPath': defaultSprint,
  },
  childIds: [],
});

/** The @mention list offers exactly one person. Names exclude the avatar's fallback initial. */
async function mentionsAre(page: Page, name: string) {
  const options = page.getByRole('listbox', { name: 'Team members' }).getByRole('option');
  await expect(options).toHaveCount(1);
  await expect(options).toHaveAccessibleName(name);
}

// Two projects have distinct teams, members, defaults, and sprint paths.
async function metadata(page: Page) {
  await page.route('**/api/projects/practice-project/teams', (route) =>
    route.fulfill({
      json: [
        { id: 'practice-team', name: 'Practice team', isDefault: true },
        { id: 'practice-other', name: 'Other practice team', isDefault: false },
      ],
    }),
  );
  await page.route('**/api/projects/*/teams/*/*', (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const team = parts[5];
    const path =
      team === 'practice-team'
        ? defaultSprint
        : team === 'practice-other'
          ? otherSprint
          : sampleSprint;
    switch (parts[6]) {
      case 'members':
        return route.fulfill({ json: [person(team)] });
      case 'iterations':
        return route.fulfill({
          json: [
            {
              id: `${team}-sprint`,
              name: 'Team sprint',
              path,
              startDate: null,
              finishDate: null,
              timeFrame: 'current',
            },
          ],
        });
      case 'settings': {
        const area = path.split('\\')[0];
        return route.fulfill({
          json: {
            defaultAreaPath: area,
            defaultIterationPath: path,
            areas: [{ path: area, includeChildren: true }],
          },
        });
      }
      default:
        return route.fallback();
    }
  });
  for (const id of [7001, 7002]) {
    await page.route(`**/api/work-items/${id}`, (route) =>
      route.fulfill({
        json: {
          item: item(id),
          related: id === 7001 ? [item(7002)] : [],
          missingIds: [],
          webUrl: null,
        },
      }),
    );
    await page.route(`**/api/work-items/${id}/comments?*`, (route) =>
      route.fulfill({ json: { comments: [], cursor: null } }),
    );
  }
}

for (const search of ['', '?project=sample-project&team=web-team']) {
  test(`direct item choices and comment suggestions use its own default team (${search || 'bare link'})`, async ({
    page,
  }) => {
    await metadata(page);
    await page.goto(`/items/7001${search}`);
    const editor = page.getByRole('article', { name: 'Work item 7001' });
    await expect(editor.getByLabel('Iteration', { exact: true }).locator('option')).toHaveText([
      'Choose…',
      defaultSprint,
    ]);
    await editor.getByRole('button', { name: 'Assignee: Unassigned' }).click();
    await expect(page.getByRole('option', { name: 'Practice member', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Sample member', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await editor.getByRole('textbox', { name: 'New comment' }).click();
    await page.keyboard.type('@member');
    await mentionsAre(page, 'Practice member');
  });
}

test('full-page, copy, and related links retain a valid explicit item team', async ({
  page,
  context,
}) => {
  await metadata(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/board?project=practice-project&team=practice-other&item=7001');
  await page.getByRole('link', { name: 'Open full page' }).click();
  await expect(page).toHaveURL(/\/items\/7001\?project=practice-project&team=practice-other$/);
  const editor = page.getByRole('article', { name: 'Work item 7001' });
  await expect(editor.getByLabel('Iteration', { exact: true }).locator('option')).toHaveText([
    'Choose…',
    defaultSprint,
    otherSprint,
  ]);
  await editor.getByRole('textbox', { name: 'New comment' }).click();
  await page.keyboard.type('@member');
  await mentionsAre(page, 'Other practice member');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Copied the link to #7001.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'http://127.0.0.1:5173/items/7001?project=practice-project&team=practice-other',
  );
  await editor.getByRole('region', { name: 'Parent' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/items\/7002\?project=practice-project&team=practice-other$/);
});

test('Add child uses its parent project defaults while general New keeps workspace scope', async ({
  page,
}) => {
  await metadata(page);
  await page.goto('/board?project=sample-project&team=web-team&item=7001');
  await page.getByRole('button', { name: 'Add child' }).click();
  const dialog = page.getByRole('dialog', { name: 'New child of #7001' });
  await expect(dialog.getByLabel('Area Path')).toHaveValue('Practice project');
  await expect(dialog.getByLabel('Iteration Path')).toHaveValue(defaultSprint);
  await dialog.getByLabel('Title', { exact: true }).fill('Practice child');
  await page.route('**/api/work-items', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 201, json: { ...item(7003), title: 'Practice child' } })
      : route.fallback(),
  );
  const sent = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/work-items',
  );
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    projectId: 'practice-project',
    parentId: 7001,
    fields: {
      'System.AreaPath': 'Practice project',
      'System.IterationPath': defaultSprint,
    },
  });
  await expect(dialog).toBeHidden();
  // The open detail panel covers the header, so return to the board first.
  await page.goto('/board?project=sample-project&team=web-team');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const general = page.getByRole('dialog', { name: 'New work item' });
  await expect(general.getByLabel('Area Path')).toHaveValue('Sample project');
  await expect(general.getByLabel('Iteration Path')).toHaveValue(sampleSprint);
});
