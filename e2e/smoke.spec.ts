import { expect, test } from '@playwright/test';
import {
  expectCleanLoad,
  expectBottomNav,
  expectCompactSampleBanner,
  expectGoogleSignInPopup,
  expectHuishoudenFrame,
  expectInstallable,
  expectSecurityHeaders,
  expectThemeConsistent,
} from '@huishouden/pwa-kit/e2e';

test('loads without runtime errors and shows the sample countdown', async ({ page }) => {
  await expectCleanLoad(page);
  await expect(page.getByText('Sample data')).toBeVisible();
  await expect(page.getByText('12 weeks')).toBeVisible();
  await expectHuishoudenFrame(page, { app: 'Baby', portalUrl: '/' });
});

test('the sample log answers a one-tap feed with an undo', async ({ page }) => {
  await expectCleanLoad(page, './?demo=after');
  await expect(page.getByText('Last fed')).toBeVisible();
  await page.getByRole('button', { name: 'Log breast feed, right' }).click();
  await expect(page.getByText(/Logged feed, right/)).toBeVisible();
  await expect(page.getByText('Just now')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Just now')).toHaveCount(0);
  await expect(page.getByText(/^ago · left,/)).toBeVisible();
});

test('is installable', ({ page, request }) => expectInstallable(page, request));

test('Google sign-in popup reaches Google with an allowed redirect URI', ({ page, context }) =>
  expectGoogleSignInPopup(page, context, async (p) => {
    await p.getByRole('button', { name: 'Sign in with Google' }).first().click();
  }));

test('agenda links open their tab', async ({ page }) => {
  await expectCleanLoad(page, './#appointments');
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible();
  await page.evaluate(() => (location.hash = '#checklists'));
  await expect(page.getByRole('heading', { name: 'Checklists', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toHaveCount(0);
});

test('sends the security headers and leaves sign-in un-framed', ({ request }) => expectSecurityHeaders(request, './', { camera: true }));

test('the Sample data banner is one line on a phone', ({ page }) => expectCompactSampleBanner(page, './'));

test('on a phone the sections are a bottom bar', ({ page }) => expectBottomNav(page, { path: './', labels: ['Overview', 'Timer', 'Visits', 'Checklists', 'More'] }));

test('a sample checklist item is skipped and put back, counting neither as done nor as to do', async ({ page }) => {
  await expectCleanLoad(page, './#checklists');
  const nursery = page.getByRole('region', { name: 'Nursery' });
  const skipped = (text: string) => nursery.getByRole('listitem').filter({ hasText: text }).getByText('Skipped', { exact: true });
  await expect(skipped('Night light')).toBeVisible();
  await expect(nursery.getByText('3 of 5 done, 1 skipped')).toBeVisible();
  await nursery.getByRole('button', { name: 'Skip: Changing pad' }).click();
  await expect(skipped('Changing pad')).toBeVisible();
  await expect(nursery.getByText('3 of 4 done, 2 skipped')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(nursery.getByRole('checkbox', { name: 'Changing pad' })).toBeVisible();
  await nursery.getByRole('button', { name: 'Un-skip: Night light' }).click();
  await expect(nursery.getByRole('checkbox', { name: 'Night light' })).toBeVisible();
  await expect(nursery.getByText('3 of 6 done')).toBeVisible();
});

test('done and not done read differently: an outlined Mark done, then a done row; checklists sort done after open', async ({ page }) => {
  await expectCleanLoad(page, './');
  const card = page.getByRole('region', { name: 'Checklists' });
  const nursery = card.getByRole('listitem').filter({ hasText: 'Nursery' });
  await expect(nursery).toHaveAttribute('data-completion', 'open');
  await nursery.getByRole('button', { name: 'Mark Changing pad done' }).click();
  await nursery.getByRole('button', { name: 'Mark Swaddles and sleep sacks done' }).click();
  await expect(nursery).toHaveAttribute('data-completion', 'done');
  await expect(nursery.getByRole('button')).toHaveCount(0);
  await expect(nursery.getByText('5 of 5 done, 1 skipped')).toBeVisible();
  await expect(card.getByRole('listitem').last()).toContainText('Nursery');
  await expect(page.locator('[aria-pressed]').filter({ hasText: /done/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(nursery.getByRole('button', { name: 'Mark Swaddles and sleep sacks done' })).toBeVisible();

  await page.getByRole('button', { name: 'Checklists', exact: true }).first().click();
  const list = page.getByRole('region', { name: 'Nursery' });
  await expect(list.getByRole('checkbox', { name: 'Changing pad', checked: true })).toBeVisible();
  await expect(list.getByRole('checkbox', { name: 'Swaddles and sleep sacks', checked: false })).toBeVisible();
  const order = await list.getByRole('listitem').allInnerTexts();
  expect(order[0]).toContain('Swaddles and sleep sacks');
  expect(order.at(-1)).toContain('Night light');
  await expect(list.getByRole('button', { name: 'Move up: Changing pad' })).toHaveCount(0);
});

test('follows the suite theme: dark on a dark device, readable', ({ page }) => expectThemeConsistent(page, { path: './' }));

test('the contraction timer starts, stops and removes a mistaken tap', async ({ page }) => {
  await expectCleanLoad(page);
  await page.getByRole('button', { name: /Contractions/ }).first().click();
  await expect(page.getByRole('note').filter({ hasText: 'Call your provider' })).toContainText('Call your provider or L&D right away');
  await expect(page.getByTestId('status')).toBeVisible();
  const before = await page.getByRole('button', { name: /^Delete the contraction/ }).count();
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByTestId('elapsed')).toBeVisible();
  await page.getByRole('button', { name: /^Stop/ }).click();
  await expect(page.getByRole('button', { name: /^Delete the contraction/ })).toHaveCount(before + 1);
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: /Mistaken tap/ }).click();
  await expect(page.getByRole('button', { name: /^Delete the contraction/ })).toHaveCount(before + 1);
});
