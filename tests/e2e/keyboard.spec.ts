import { expect, test, type Page } from '@playwright/test';

// Dark mode, keyboard only. Grid edits, board moves, and resizing have their own keyboard
// tests; this covers focus rings and the paths between views, dialogs, and the panel.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eruza-theme', 'dark'));
});

/**
 * The focused element when focus does not change how it looks, or '' when it does. An outline
 * counts, and so does a changed shadow, fill, or border (such as the column resize handles).
 */
const missingRing = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return '';
    const look = () => {
      const s = getComputedStyle(el);
      return [s.outlineStyle, s.outlineWidth, s.boxShadow, s.backgroundColor, s.borderColor];
    };
    const focused = look();
    const outline = focused[0] !== 'none' && parseFloat(focused[1]) > 0;
    el.blur();
    const blurred = look();
    // After a key press, focusing from script still shows the keyboard focus style.
    el.focus();
    if (outline || focused.join() !== blurred.join()) return '';
    const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${name}"`;
  });

/** Presses Tab `count` times and lists focus stops without a visible ring. */
async function tabThrough(page: Page, count: number) {
  const missing = new Set<string>();
  for (let n = 0; n < count; n++) {
    await page.keyboard.press('Tab');
    const problem = await missingRing(page);
    if (problem) missing.add(problem);
  }
  return [...missing];
}

/** Presses `key` until the focused element matches `name`, up to 80 times. */
async function tabTo(page: Page, name: string, key = 'Tab') {
  const seen: string[] = [];
  for (let n = 0; n < 80; n++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute('aria-label') ?? el?.textContent?.trim().slice(0, 30) ?? '';
    });
    if (label === name) return;
    seen.push(label);
    await page.keyboard.press(key);
  }
  throw new Error(`Could not reach "${name}" with ${key}. Visited: ${seen.join(' > ')}`);
}

test('every focus stop shows a visible focus ring in dark mode', async ({ page }) => {
  const missing: string[] = [];
  await page.goto('/board');
  await expect(page.locator('.board-card').first()).toBeVisible();
  missing.push(...(await tabThrough(page, 40)));

  await page.goto('/grid?grouping=person');
  await expect(page.locator('.meeting-grid tbody tr').nth(2)).toBeVisible();
  missing.push(...(await tabThrough(page, 60)));

  // 1012 has a plain description, so Tab never lands in a list or table there.
  await page.goto('/board?item=1012');
  await expect(page.getByRole('textbox', { name: 'New comment' })).toBeVisible();
  await page.getByRole('complementary', { name: 'Work item details' }).focus();
  missing.push(...(await tabThrough(page, 30)));

  expect(missing).toEqual([]);
});

test('keyboard alone creates, comments on, and deletes an item, and moves between views', async ({
  page,
}) => {
  await page.goto('/board');
  await expect(page.locator('.board-card').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  const main = page.locator('#content');
  await expect(main).toBeFocused();

  // C opens the form; Escape closes it and returns focus.
  await page.keyboard.press('c');
  const create = page.getByRole('dialog', { name: 'New work item' });
  await expect(create.getByLabel('Title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(create).toBeHidden();
  await expect(main).toBeFocused();

  await page.keyboard.press('c');
  await expect(create.getByLabel('Title')).toBeFocused();
  await page.keyboard.type('Keyboard sample story');
  await page.keyboard.press('Enter');
  await expect(create).toBeHidden();
  const panel = page.getByRole('complementary', { name: 'Work item details' });
  await expect(panel).toBeFocused();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keyboard sample story');

  // The comment box loads with the editor chunk.
  await expect(page.getByRole('textbox', { name: 'New comment' })).toBeVisible();
  await tabTo(page, 'New comment');
  await page.keyboard.type('Added with the keyboard.');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Add comment' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel.locator('.comment-body').first()).toHaveText('Added with the keyboard.');

  await tabTo(page, 'Delete', 'Shift+Tab');
  await page.keyboard.press('Enter');
  const remove = page.getByRole('dialog', { name: /^Delete #\d+ Keyboard sample story\?$/ });
  await expect(remove.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(remove).toBeHidden();
  await expect(page.getByRole('button', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(remove.getByRole('button', { name: 'Move to Recycle Bin' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  await expect(page.getByText(/Moved #\d+ to the Azure DevOps Recycle Bin\./)).toBeVisible();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('Sprint retro');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Sprint retro', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/grouping=story/);
});
