import { expect, test, type Request } from '@playwright/test';

test('required custom people use identity picks in create, detail, and recovery', async ({
  page,
}) => {
  const writes: Request[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/work-items') && ['POST', 'PATCH'].includes(request.method())) {
      writes.push(request);
    }
  });
  await page.goto('/board');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New work item' });
  await dialog.getByLabel('Type').selectOption('Feature');
  await dialog.getByLabel('Title').fill('Review a sample feature');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByText('This field is required.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Owner: Unassigned', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Choose Owner' })).toBeVisible();
  await expect(dialog.getByRole('option', { name: 'Unassign' })).toHaveCount(0);
  await dialog.getByRole('option', { name: 'Person B', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).toBeHidden();
  const editor = page.getByRole('article', { name: /Work item \d+/ });
  await expect(editor.getByRole('button', { name: 'Owner: Person B', exact: true })).toBeVisible();
  const created = writes.find((request) => request.method() === 'POST')!.postDataJSON();
  expect(created.fields['Custom.Owner']).toBe('person-b');
  await editor.getByRole('button', { name: 'Owner: Person B', exact: true }).click();
  await editor.getByRole('option', { name: 'Person A', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  expect(writes.at(-1)!.postDataJSON().fields).toEqual({ 'Custom.Owner': 'person-a' });
  await editor.getByLabel('State', { exact: true }).selectOption('Done');
  const problem = editor.getByRole('alert').filter({ hasText: 'Not saved: State' });
  await problem.getByRole('button', { name: 'Reviewer: Unassigned', exact: true }).click();
  const writesBeforeChoice = writes.length;
  await problem.getByRole('option', { name: 'Person C', exact: true }).click();
  await problem.getByRole('button', { name: 'Save together', exact: true }).click();
  await expect(problem).toBeHidden();
  await expect(editor.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  // Choosing the reviewer sent nothing; only the combined retry was written.
  expect(writes).toHaveLength(writesBeforeChoice + 1);
  expect(writes.at(-1)!.postDataJSON().fields).toEqual({
    'System.State': 'Done',
    'Custom.Reviewer': 'person-c',
  });
  await page.reload();
  await expect(editor.getByRole('button', { name: 'Owner: Person A', exact: true })).toBeVisible();
  await expect(editor.getByLabel('State', { exact: true })).toHaveValue('Done');
  await page.goto('/board?item=1000');
  await expect(editor.getByRole('button', { name: 'Owner: Person D', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Owner: Person D', exact: true }).click();
  await expect(editor.getByRole('option', { name: 'Person D', exact: true })).toBeVisible();
});
