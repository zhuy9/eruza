import { expect, test } from '@playwright/test';

const headers = { origin: 'http://127.0.0.1:5173' };

for (const field of ['Title', 'Description']) {
  test(`editing a focused ${field} after refresh keeps the displayed revision`, async ({
    page,
  }) => {
    const response = await page.request.post('/api/work-items', {
      headers,
      data: {
        projectId: 'sample-project',
        type: 'Task',
        fields: {
          'System.Title': 'Original title',
          'System.Description': '<p>Original description</p>',
          'System.AreaPath': 'Sample project\\Web',
          'System.IterationPath': 'Sample project\\Sprint 3',
        },
      },
    });
    expect(response.ok()).toBe(true);
    const item = (await response.json()) as { id: number; rev: number };
    await page.clock.install();
    await page.goto(`/items/${item.id}`);
    const input = page.getByRole('textbox', { name: field, exact: true });
    await expect(input).toBeVisible();
    await input.focus();
    const remote = field === 'Title' ? 'Remote title' : '<p>Remote description</p>';
    const changed = await page.request.patch(`/api/work-items/${item.id}`, {
      headers,
      data: {
        expectedRev: item.rev,
        fields: { [`System.${field}`]: remote, 'System.Tags': 'refreshed' },
      },
    });
    expect(changed.ok()).toBe(true);
    await page.clock.runFor(45_000);
    await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('refreshed');
    const problem = page.getByRole('alert').filter({ hasText: 'changed in Azure DevOps' });
    const draft = `Original ${field.toLowerCase()} appended`;
    // Editing again after the conflict still conflicts, and one Discard clears both drafts.
    for (const text of [draft, `${draft} again`]) {
      await input.fill(text);
      await input.press('Tab');
      await expect(problem).toBeVisible();
    }
    if (field === 'Title') await expect(input).toHaveValue(`${draft} again`);
    else await expect(input).toHaveText(`${draft} again`);
    await problem.getByRole('button', { name: 'Discard my change' }).click();
    if (field === 'Title') await expect(input).toHaveValue('Remote title');
    else await expect(input).toHaveText('Remote description');
  });
}

test('leaving an untouched description adopts refreshed text without saving', async ({ page }) => {
  await page.clock.install();
  await page.goto('/items/1011');
  const description = page.getByRole('textbox', { name: 'Description', exact: true });
  await expect(description).toBeVisible();
  await description.focus();
  const before = (await (await page.request.get('/api/work-items/1011')).json()).item;
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH') writes.push(request.url());
  });
  const changed = await page.request.patch('/api/work-items/1011', {
    headers,
    data: {
      expectedRev: before.rev,
      fields: {
        'System.Description': '<p>Refreshed description</p>',
        'System.Tags': 'description-refreshed',
      },
    },
  });
  expect(changed.ok()).toBe(true);
  await page.clock.runFor(45_000);
  await expect(page.getByLabel('Tags', { exact: true })).toHaveValue('description-refreshed');
  await description.press('Tab');
  await expect(description).toHaveText('Refreshed description');
  expect(writes).toEqual([]);
});

test('switching away from an untouched description keeps its caret', async ({ page }) => {
  const response = await page.request.post('/api/work-items', {
    headers,
    data: {
      projectId: 'sample-project',
      type: 'Task',
      fields: {
        'System.Title': 'Selection example',
        'System.Description': '<p>Select this text</p>',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    },
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()) as { id: number };
  await page.goto(`/items/${id}`);
  const description = page.getByRole('textbox', { name: 'Description', exact: true });
  await description.click();
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  // Switching tabs or apps blurs the editor but keeps it as the active element.
  await description.evaluate((el) => el.dispatchEvent(new FocusEvent('blur')));
  await page.keyboard.type('First, ');
  await expect(description).toHaveText('First, Select this text');
});

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

test('a failed background refresh keeps the comment draft through recovery', async ({ page }) => {
  await page.clock.install();
  await page.goto('/board?item=1011');
  const box = page.getByRole('textbox', { name: 'New comment' });
  await expect(box).toBeVisible();
  await box.fill('Keep this unsent comment.');
  let failing = true;
  let failures = 0;
  await page.route('**/api/work-items/1011', (route) => {
    if (!failing || route.request().method() !== 'GET') return route.fallback();
    failures++;
    return route.fulfill({
      status: 502,
      json: { code: 'UPSTREAM', message: 'Temporary detail refresh failure.' },
    });
  });
  await page.clock.runFor(45_000);
  await expect.poll(() => failures).toBe(1);
  await page.clock.runFor(2_000);
  await expect.poll(() => failures).toBe(2);
  const warning = page.getByRole('alert').filter({ hasText: 'Temporary detail refresh failure.' });
  await expect(warning).toBeVisible();
  await expect(box).toHaveText('Keep this unsent comment.');
  failing = false;
  await page.clock.runFor(45_000);
  await expect(warning).toBeHidden();
  await expect(box).toHaveText('Keep this unsent comment.');
});

test('retrying a combined save does not undo a newer successful field edit', async ({ page }) => {
  const response = await page.request.post('/api/work-items', {
    headers,
    data: {
      projectId: 'sample-project',
      type: 'Bug',
      fields: {
        'System.Title': 'Partial retry example',
        'Custom.FoundIn': 'Release 3',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    },
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()) as { id: number };
  await page.goto(`/board?item=${id}`);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Partial retry example');
  const patches: Record<string, unknown>[] = [];
  let rejectCombined = true;
  await page.route(`**/api/work-items/${id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const { fields } = route.request().postDataJSON();
    patches.push(fields);
    if (rejectCombined && Object.keys(fields).length === 2) {
      rejectCombined = false;
      return route.fulfill({
        status: 503,
        json: { code: 'UPSTREAM', message: 'Try this change again.' },
      });
    }
    return route.fallback();
  });
  await page.getByLabel('State', { exact: true }).selectOption('Resolved');
  await page.getByLabel('Resolved Reason', { exact: true }).selectOption('Fixed');
  await page.getByRole('button', { name: 'Save together' }).click();
  await expect(page.getByText('Try this change again.')).toBeVisible();
  await page.getByLabel('State', { exact: true }).selectOption('Active');
  const problem = page.getByRole('alert').filter({ hasText: 'Not saved: Resolved Reason.' });
  await expect(problem).toBeVisible();
  await problem.getByRole('button', { name: 'Save again' }).click();
  await expect(problem).toBeHidden();
  expect(patches.at(-1)).toEqual({ 'Microsoft.VSTS.Common.ResolvedReason': 'Fixed' });
  const saved = await page.request.get(`/api/work-items/${id}`);
  expect((await saved.json()).item.state).toBe('Active');
});
