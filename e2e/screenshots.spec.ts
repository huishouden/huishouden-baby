import { expect, test } from '@playwright/test';
import { captureScreenshot } from '@huishouden/pwa-kit/e2e';
import places from './fixtures/nominatim.json' with { type: 'json' };
import { calendarEvents, mockCalendar } from './fixtures/calendar';

// README images of the signed-out app's invented sample family, refreshed by CI after each deploy.
// The clock is frozen at the sample data's moment so every run renders the same.
const fixedTime = '2031-05-14T10:30:00';

test('before: countdown', ({ page }) =>
  captureScreenshot(page, 'before', {
    fixedTime,
    prepare: (p) => expect(p.getByText('12 weeks')).toBeVisible(),
  }));

test('after: log', ({ page }) =>
  captureScreenshot(page, 'log', {
    path: './?demo=after',
    fixedTime,
    prepare: (p) => expect(p.getByText('Last fed')).toBeVisible(),
  }));

test('checklists', ({ page }) =>
  captureScreenshot(page, 'checklists', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Checklists', exact: true }).click();
      await expect(p.getByText('Install the car seat')).toBeVisible();
    },
  }));

test('phone: log', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-log', {
    path: './?demo=after',
    fixedTime,
    prepare: (p) => expect(p.getByText('Last fed')).toBeVisible(),
  });
});

test('contacts', ({ page }) =>
  captureScreenshot(page, 'contacts', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: /^More/ }).click();
      await p.getByRole('button', { name: 'Contacts', exact: true }).click();
      await expect(p.getByText('Example Pediatrics')).toBeVisible();
    },
  }));

test('appointments', ({ page }) =>
  captureScreenshot(page, 'appointments', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Appointments', exact: true }).click();
      await expect(p.getByText('Midwife check-up')).toBeVisible();
    },
  }));

test('contact search', async ({ page }) => {
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({ json: places }));
  await captureScreenshot(page, 'contact-search', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Contacts', exact: true }).click();
      await p.getByRole('button', { name: 'Add contact' }).click();
      const dialog = p.getByRole('dialog', { name: 'New contact' });
      await dialog.getByLabel('Find a business').fill('Example Kids Springfield');
      await dialog.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(dialog.getByRole('list', { name: 'Places' })).toBeVisible();
    },
  });
});

test('calendar import', async ({ page }) => {
  await page.addInitScript(mockCalendar, calendarEvents);
  await captureScreenshot(page, 'calendar-import', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Appointments', exact: true }).click();
      await p.getByRole('button', { name: 'Import from calendar' }).click();
      await expect(p.getByRole('list', { name: 'Calendar events' })).toBeVisible();
    },
  });
});

test('phone: contacts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-contacts', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: /^More/ }).click();
      await p.getByRole('button', { name: 'Contacts', exact: true }).click();
      await expect(p.getByText('Example Pediatrics')).toBeVisible();
    },
  });
});

test('phone: contraction timer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-contractions', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Timer', exact: true }).click();
      await expect(p.getByTestId('status')).toBeVisible();
    },
  });
});

test('checklists: care team', ({ page }) =>
  captureScreenshot(page, 'checklist-contacts', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Checklists', exact: true }).click();
      const paperwork = p.getByRole('region', { name: 'Paperwork' });
      await paperwork.scrollIntoViewIfNeeded();
      await expect(paperwork.getByRole('button', { name: 'Add contact: Lactation consultant' })).toBeVisible();
    },
  }));

// The kit's app bar with an invented signed-in person and the account menu open.
test('account menu', ({ page }) =>
  captureScreenshot(page, 'account-menu', {
    fixedTime,
    prepare: async (p) => {
      await p.locator('hh-app-bar').evaluate((bar: HTMLElementTagNameMap['hh-app-bar']) => {
        bar.user = { name: 'Sam Example', email: 'sam@example.com', photoURL: null };
      });
      await p.getByRole('button', { name: 'Signed in as sam@example.com' }).click();
      await expect(p.getByRole('link', { name: 'All apps' })).toBeVisible();
    },
  }));
