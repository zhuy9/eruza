import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });

const sprint1 = encodeURIComponent('Sample project\\Sprint 1');
const panel = (page: Page) => page.getByRole('complementary', { name: 'Work item details' });

test('phone views fit the screen and keep the sprint, New, and theme controls', async ({
  page,
}) => {
  const views = [
    ['/board', '.board-card'],
    // Many wide columns of cards: these once widened the whole page.
    [`/board?sprint=${sprint1}&type=Bug`, '.board-card'],
    ['/grid?grouping=person', '.ticket-row'],
    ['/grid?grouping=story', '.ticket-row'],
    ['/items/1001', '.title-input'],
  ];
  for (const [path, content] of views) {
    await page.goto(path);
    await expect(page.locator(content).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBe(0);
    await expect(page.getByLabel('Sprint')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toBeInViewport();
  }
});

test('a tap on a board card opens its details on screen', async ({ page }) => {
  await page.goto(`/board?sprint=${sprint1}&type=Bug`);
  const card = page.locator('.board-card').first();
  const box = (await card.boundingBox())!;
  // Away from the title link: the whole card is the tap target.
  await card.tap({ position: { x: box.width - 6, y: box.height - 6 } });
  await expect(panel(page)).toBeInViewport({ ratio: 1 });
  await panel(page).evaluate((aside) => aside.scrollTo(0, 1500));
  await panel(page).getByRole('button', { name: 'Close details' }).tap();
  await expect(panel(page)).toHaveCount(0);
});

test('a swipe on a board card scrolls the columns, and press and hold drags it', async ({
  page,
}) => {
  // A new story starts in the first column, so the next column is partly on screen.
  const created = await page.request.post('/api/work-items', {
    headers: { origin: 'http://127.0.0.1:5173' },
    data: {
      projectId: 'sample-project',
      type: 'Story',
      fields: {
        'System.Title': 'Phone drag example',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: number };
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(`${r.method()} ${r.postData()}`);
  });
  await page.goto('/board');
  const card = page
    .locator('.board-card')
    .filter({ has: page.getByText(`#${id}`, { exact: true }) });
  await card.scrollIntoViewIfNeeded();
  const board = page.locator('.board');
  const cdp = await page.context().newCDPSession(page);
  const box = (await card.boundingBox())!;
  await cdp.send('Input.synthesizeScrollGesture', {
    x: box.x + box.width - 20,
    y: box.y + box.height / 2,
    xDistance: -120,
    gestureSourceType: 'touch',
  });
  expect(await board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('.board-card.overlay')).toHaveCount(0);
  expect(writes).toEqual([]);

  await board.evaluate((el) => el.scrollTo({ left: 0 }));
  const held = (await card.boundingBox())!;
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const start = { x: held.x + held.width / 2, y: held.y + held.height / 2 };
  // A hold that ends in place must not reload the page through the card's link.
  await page.evaluate(() => ((window as { kept?: boolean }).kept = true));
  await touch('touchStart', [start]);
  await page.waitForTimeout(400);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as { kept?: boolean }).kept)).toBe(true);

  await touch('touchStart', [start]);
  await page.waitForTimeout(400);
  // Rightward, so the card lands on a later column.
  for (let step = 1; step <= 10; step++) {
    await touch('touchMove', [{ x: start.x + step * 18, y: start.y }]);
  }
  await expect(page.locator('.board-card.overlay')).toBeVisible();
  await touch('touchEnd', []);
  await expect.poll(() => writes.some((w) => w.includes('System.State'))).toBe(true);
});

test('the grid keeps row IDs and group names in view while it scrolls sideways', async ({
  page,
}) => {
  await page.goto('/grid?grouping=person');
  const firstId = page.locator('.ticket-row .cell-id').first();
  await expect(firstId).toBeVisible();
  const grid = page.locator('.grid-scroll');
  const left = (await grid.boundingBox())!.x;
  await grid.evaluate((el) => el.scrollTo({ left: 400 }));
  await expect.poll(async () => (await firstId.boundingBox())!.x).toBeCloseTo(left + 1, 0);
  // Each level keeps its indent, over its own background.
  const label = (depth: number) =>
    page.locator(`.group-row[data-depth="${depth}"] .group-toggle`).first();
  expect((await label(0).boundingBox())!.x).toBeGreaterThanOrEqual(left);
  expect((await label(1).boundingBox())!.x - (await label(0).boundingBox())!.x).toBeCloseTo(22, 0);
  expect(await label(0).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  );

  // A cell reached by keyboard comes out from under the sticky ID column.
  const id = (await firstId.boundingBox())!;
  const title = page.locator('.ticket-row .cell-link').first();
  await page.locator('.ticket-row .cell-state select').first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(title).toBeFocused();
  expect((await title.boundingBox())!.x).toBeGreaterThanOrEqual(id.x + id.width - 1);

  // A tap just past the ID column still opens the half-hidden ticket.
  // The next row, whose link does not have focus yet.
  const nextId = page.locator('.ticket-row .cell-id').nth(1);
  await grid.evaluate((el) => el.scrollTo({ left: 130 }));
  await nextId.scrollIntoViewIfNeeded();
  const edge = (await nextId.boundingBox())!;
  await page.touchscreen.tap(edge.x + edge.width + 3, edge.y + edge.height / 2);
  await expect(panel(page)).toBeVisible();
});

test('a long title wraps on a phone and saves as one line', async ({ page }) => {
  const created = await page.request.post('/api/work-items', {
    headers: { origin: 'http://127.0.0.1:5173' },
    data: {
      projectId: 'sample-project',
      type: 'Story',
      fields: {
        'System.Title':
          'Keep the selected delivery option when shoppers return to checkout from the summary',
        'System.AreaPath': 'Sample project\\Web',
        'System.IterationPath': 'Sample project\\Sprint 3',
      },
    },
  });
  const { id } = (await created.json()) as { id: number };
  const saves: unknown[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH') saves.push(r.postDataJSON());
  });
  await page.goto(`/items/${id}`);
  const title = page.getByLabel('Title', { exact: true });
  const size = await title.evaluate((el) => ({
    height: el.clientHeight,
    hidden: el.scrollWidth - el.clientWidth,
    font: parseFloat(getComputedStyle(el).fontSize),
  }));
  expect(size.hidden).toBe(0);
  expect(size.height).toBeGreaterThan(size.font * 3);

  // A pasted line break becomes a space, and Enter saves instead of adding a line.
  await title.fill('Show the order total\nbefore payment');
  await title.press('Enter');
  await expect(title).toHaveValue('Show the order total before payment');
  await expect
    .poll(() => saves)
    .toContainEqual(
      expect.objectContaining({
        fields: { 'System.Title': 'Show the order total before payment' },
      }),
    );

  // A line break pasted mid-title keeps the cursor where the paste ended.
  await title.focus();
  await title.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(9, 9));
  await page.keyboard.insertText('full\n');
  await page.keyboard.type('X');
  await expect(title).toHaveValue('Show the full Xorder total before payment');

  // An Enter that picks an IME word does not end the edit.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'にほん', selectionStart: 3, selectionEnd: 3 });
  await page.keyboard.press('Enter');
  await expect(title).toBeFocused();
});

test('the assignee picker opens its list without the on-screen keyboard', async ({ page }) => {
  await page.goto('/items/1001');
  const trigger = page.getByRole('button', { name: /^Assignee/ });
  await trigger.tap();
  await expect(page.getByRole('option', { name: 'Assign to me' })).toBeVisible();
  await expect(page.getByPlaceholder('Search people')).not.toBeFocused();

  // A hardware keyboard still opens it with focus in the search.
  await page.keyboard.press('Escape');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('Search people')).toBeFocused();
});

test('drop hints stay on a phone screen during a drag', async ({ page }) => {
  await page.goto('/grid?grouping=story');
  const handle = page.locator('.ticket-row .drag-handle').first();
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 7, box.y + 7);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 30, { steps: 5 });
  const hint = page.locator('.drop-hint').first();
  const label = page.locator('.group-row .group-toggle').first();
  // In view and clear of the story name, wherever the grid is scrolled.
  for (const left of [0, 300, 10000]) {
    await page.locator('.grid-scroll').evaluate((el, x) => el.scrollTo({ left: x }), left);
    await expect(hint).toBeInViewport({ ratio: 1 });
    const name = (await label.boundingBox())!;
    expect((await hint.boundingBox())!.x, `scrolled to ${left}`).toBeGreaterThan(
      name.x + name.width,
    );
  }
  await page.mouse.up();
});
