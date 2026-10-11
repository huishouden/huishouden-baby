import { devices, expect, test, type Page } from '@playwright/test';
import { runPortalTodo, useTestHousehold } from '@huishouden/pwa-kit/e2e';

// Signed in as the invented people of a household of this run's own (pwa-kit STANDARD.md
// "Staging"), against the real rules: on the emulators (`bun run e2e:emulator`), and on
// staging for what needs the suite's site (@staging) or a kit bump (@smoke).
const hh = useTestHousehold(test);

/** The log is the main screen once the baby is born; the household starts at the countdown. */
async function openLog(page: Page) {
  await expect(page.getByRole('button', { name: /Log breast feed, left|Baby is here/ }).first()).toBeVisible({ timeout: 20_000 });
  if (await page.getByRole('button', { name: 'Baby is here' }).isVisible()) {
    await page.getByRole('button', { name: 'Baby is here' }).click();
    const dialog = page.getByRole('dialog', { name: 'Baby is here' });
    await dialog.getByLabel('Name').fill('Test baby');
    await dialog.getByRole('button', { name: 'Start the log' }).click();
  }
  await expect(page.getByRole('button', { name: 'Log bottle feed' })).toBeVisible();
}

/** Logs a bottle feed of `ml` (201 to 999: outside the presets, so each test's own amount). */
async function logBottle(page: Page, ml: number) {
  await page.getByRole('button', { name: 'Log bottle feed' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bottle feed' });
  await dialog.getByLabel('Amount in ml').fill(String(ml));
  await dialog.getByRole('button', { name: 'Log bottle' }).click();
}

test('a bottle feed one member logs shows for the other', { tag: '@smoke' }, async ({ browser }) => {
  const page = await hh.open(browser, 'admin');
  await openLog(page);
  const ml = 210;
  const feed = (p: Page) => p.getByText(new RegExp(`\\b${ml} ml\\b`)).first();
  await logBottle(page, ml);
  await expect(page.getByText(new RegExp(`^Logged bottle, ${ml} ml at `))).toBeVisible();
  await expect(feed(page)).toBeVisible();

  // Saved in the household, not just on this screen: the other member's own browser shows it.
  const theirs = await hh.open(browser, 'member');
  await expect(feed(theirs)).toBeVisible({ timeout: 20_000 });
});

// People on the shared tablet tap and close the app at once. Firestore takes a few milliseconds to
// put a write in its offline cache, so a reload inside that gap used to lose the entry.
for (const leave of ['reload', 'close'] as const) {
  test(`a feed logged just before the app ${leave === 'reload' ? 'reloads' : 'is closed'} is kept`, async ({ page, context }) => {
    await hh.signIn(page, 'admin');
    await openLog(page);
    const ml = leave === 'reload' ? 220 : 230;
    await logBottle(page, ml);
    if (leave === 'reload') await page.reload();
    else {
      await page.close();
      page = await context.newPage();
      await page.goto('./');
    }
    await openLog(page);
    await expect(page.getByText(new RegExp(`\\b${ml} ml\\b`)).first()).toBeVisible({ timeout: 20_000 });
    // Written again and then forgotten: nothing is left waiting in the outbox.
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hh-outbox:')).length)).toBe(0);
  });
}

// The same on a phone, where the feed is often logged with no signal: logged offline, the app
// reloaded still offline, then the network back. And once more with IndexedDB refused (storage
// full, a private window), where Firestore keeps its cache in memory only and the kit's outbox note
// is all that outlives the page: the note now stays until the server has the write.
test.describe('on a phone', () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  for (const cache of ['persistent', 'memory'] as const) {
    test(`a feed logged offline, reloaded, then back online is saved (${cache} cache)`, async ({ page, context, browser }) => {
      if (cache === 'memory')
        await context.addInitScript(() => {
          const open = indexedDB.open.bind(indexedDB);
          indexedDB.open = (name: string, version?: number) => {
            if (name.startsWith('firestore/')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
            return open(name, version);
          };
        });
      await hh.signIn(page, 'admin');
      await openLog(page);
      const ml = cache === 'persistent' ? 270 : 280;
      await context.setOffline(true);
      await logBottle(page, ml);
      await expect(page.getByText(new RegExp(`^Logged bottle, ${ml} ml at `))).toBeVisible();
      await page.reload();
      // With a memory cache the app has nothing to show offline: the network comes back as it loads.
      if (cache === 'persistent') await openLog(page);
      await context.setOffline(false);
      await openLog(page);
      await expect(page.getByText(new RegExp(`\\b${ml} ml\\b`)).first()).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hh-outbox:')).length), { timeout: 20_000 }).toBe(0);
      // On the server, not only on this phone.
      const theirs = await hh.open(browser, 'member');
      await expect(theirs.getByText(new RegExp(`\\b${ml} ml\\b`)).first()).toBeVisible({ timeout: 20_000 });
    });
  }
});

// Roles (pwa-kit STANDARD.md "Roles"): the household's helper logs their own feeds and changes
// those, but not what someone else logged, and is told who can.
// A row's text runs on into the logger's initial ("320 mlT"), so the amount is matched without a
// trailing word boundary.
test.describe('as a helper', () => {
  test("a helper logs and changes their own feed but can't change a member's", async ({ browser }) => {
    // A member's feed, logged first (which also starts the log if no test has yet).
    const ml = 240;
    const admin = await hh.open(browser, 'admin');
    await openLog(admin);
    await logBottle(admin, ml);
    await expect(admin.getByText(new RegExp(`^Logged bottle, ${ml} ml at `))).toBeVisible();

    const page = await hh.open(browser, 'helper');
    await expect(page.getByRole('button', { name: 'Log bottle feed' })).toBeVisible({ timeout: 20_000 });
    const timeline = page.getByRole('list', { name: 'Timeline' });
    const members = timeline.getByRole('listitem').filter({ hasText: new RegExp(`\\b${ml} ml`) });
    await expect(members.first()).toBeVisible({ timeout: 20_000 });
    // Refused: no edit on the member's feed, and the reason said; the baby's details aren't theirs to edit.
    await expect(members.first().getByRole('button', { name: /^Edit / })).toHaveCount(0);
    await expect(page.getByText('Only admins and members can change or delete what someone else added.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit baby details' })).toHaveCount(0);

    // Permitted: their own feed, which they can open and delete.
    const mine = 250;
    await logBottle(page, mine);
    const own = timeline.getByRole('listitem').filter({ hasText: new RegExp(`\\b${mine} ml`) }).first();
    await expect(own).toBeVisible();
    await own.getByRole('button', { name: /^Edit / }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(timeline.getByText(new RegExp(`\\b${mine} ml\\b`))).toHaveCount(0, { timeout: 20_000 });
  });

  test('a helper ends a sleep a member started', async ({ browser }) => {
    const admin = await hh.open(browser, 'admin');
    await openLog(admin);
    await admin.getByRole('button', { name: /^Fell asleep/ }).click();
    await expect(admin.getByRole('button', { name: /^Woke up/ })).toBeVisible();

    const page = await hh.open(browser, 'helper');
    await page.getByRole('button', { name: /^Woke up/ }).click({ timeout: 20_000 });
    await expect(page.getByText(/^Woke up after /)).toBeVisible();
    // Kept by the server (a refused write would put the sleep back after a reload).
    await page.waitForTimeout(3000);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Fell asleep/ })).toBeVisible({ timeout: 20_000 });
  });

  test('a helper stops a contraction a member started, and can’t delete it', async ({ browser }) => {
    const admin = await hh.open(browser, 'admin');
    await admin.getByRole('button', { name: 'Contractions', exact: true }).first().click();
    await admin.getByRole('button', { name: /^Start/ }).click();
    await expect(admin.getByTestId('elapsed')).toBeVisible();

    const page = await hh.open(browser, 'helper');
    await page.getByRole('button', { name: 'Contractions', exact: true }).first().click();
    await page.getByRole('button', { name: /^Stop/ }).click({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible();
    await page.waitForTimeout(3000);
    await page.reload();
    await page.getByRole('button', { name: 'Contractions', exact: true }).first().click();
    await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Delete the contraction/ })).toHaveCount(0);
  });
});

// The household to-do list (pwa-kit STANDARD.md "To-dos"): a checklist item Baby publishes is
// ticked off or skipped on the portal's To-do tab, and Baby shows the change.
// @staging: the portal's To-do list is another app on the suite's site.
test.describe('on the portal to-do list', () => {
  for (const action of ['done', 'cancel'] as const) {
    test(`a checklist item ${action === 'done' ? 'ticked' : 'skipped'} there is ${action === 'done' ? 'done' : 'skipped'} in Baby`, { tag: '@staging' }, async ({ page }) => {
      test.setTimeout(120_000);
      const list = `E2E list ${action}`;
      const title = `E2E to-do ${action}`;
      await hh.signIn(page, 'admin', './#checklists');
      await page.getByRole('button', { name: 'New list' }).click({ timeout: 20_000 });
      const dialog = page.getByRole('dialog', { name: 'New list' });
      await dialog.getByLabel('List name').fill(list);
      await dialog.getByLabel('First item').fill(title);
      await dialog.getByRole('button', { name: 'Create list' }).click();
      const section = page.getByRole('region', { name: list });
      await expect(section.getByRole('checkbox', { name: title })).toBeVisible();
      // Baby publishes 3 s after a checklist change; leaving sooner would cancel that sync.
      await page.waitForTimeout(6000);
      await runPortalTodo(page, title, { action });
      await page.goto('./#checklists');
      if (action === 'done') await expect(section.getByRole('checkbox', { name: title })).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
      else await expect(section.getByRole('listitem').filter({ hasText: title }).getByText('Skipped', { exact: true })).toBeVisible({ timeout: 20_000 });
    });
  }
});
