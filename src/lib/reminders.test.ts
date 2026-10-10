import { afterEach, describe, expect, test } from 'bun:test';
import { setLangForTests } from '@huishouden/pwa-kit/i18n';
import { localizeReminders } from '@huishouden/pwa-kit/reminders';
import { DAY, HOUR } from '@huishouden/pwa-kit/time';
import { DEMO_NOW } from './demo';
import type { Appointment, BabyProfile } from './model';
import { appointmentReminders, reminderRef, reminderSource } from './reminders';

afterEach(() => setLangForTests('en'));

const URL = 'https://example.test/baby/#appointments';
const profile = { name: 'Robin' } as BabyProfile;
const visit: Appointment = { id: 'v1', title: 'Prenatal visit', at: DEMO_NOW + 3 * DAY, location: 'Riverside Family Clinic', private: false, createdAt: 1, by: 'a@example.com' };

describe('appointment reminders', () => {
  test('one the day before and one 2 hours before, with the source that cancels them', () => {
    const list = appointmentReminders([visit], profile, DEMO_NOW, URL);
    expect(list.map((r) => [r.ref, r.at])).toEqual([
      ['appointment:v1:day', visit.at - DAY],
      ['appointment:v1:soon', visit.at - 2 * HOUR],
    ]);
    for (const r of list) {
      expect(r).toMatchObject({ app: 'baby', url: URL, recipients: 'all', private: false });
      expect(r.source).toEqual({ checks: [{ doc: 'babyAppointments/v1', due: [{ field: 'at', in: [visit.at] }] }] });
    }
    expect(reminderRef('v1', 'day')).toBe('appointment:v1:day');
    expect(reminderSource(visit).checks).toHaveLength(1);
  });

  test('times already past are skipped', () => {
    const soon = { ...visit, at: DEMO_NOW + 5 * HOUR };
    expect(appointmentReminders([soon], profile, DEMO_NOW, URL).map((r) => r.ref)).toEqual(['appointment:v1:soon']);
    expect(appointmentReminders([{ ...visit, at: DEMO_NOW + HOUR }], profile, DEMO_NOW, URL)).toEqual([]);
    expect(appointmentReminders([{ ...visit, at: DEMO_NOW - DAY }], profile, DEMO_NOW, URL)).toEqual([]);
  });

  test('an appointment with reminders off has none; on by default', () => {
    expect(appointmentReminders([{ ...visit, remind: false }], profile, DEMO_NOW, URL)).toEqual([]);
    expect(appointmentReminders([visit], profile, DEMO_NOW, URL)).toHaveLength(2);
  });

  test('a private appointment has private reminders; a blank title has none', () => {
    expect(appointmentReminders([{ ...visit, private: true }], profile, DEMO_NOW, URL).every((r) => r.private)).toBe(true);
    expect(appointmentReminders([{ ...visit, title: ' ' }], profile, DEMO_NOW, URL)).toEqual([]);
  });

  test('the words name the baby and the place when there are some', () => {
    const [day, soon] = appointmentReminders([visit], profile, DEMO_NOW, URL);
    expect(day?.title).toBe('Tomorrow: Prenatal visit');
    expect(soon?.title).toBe('In 2 hours: Prenatal visit');
    expect(day?.body).toMatch(/ for Robin at Riverside Family Clinic$/);
    const [bare] = appointmentReminders([{ ...visit, location: undefined }], null, DEMO_NOW, URL);
    expect(bare?.body).not.toContain(' for ');
    expect(bare?.body).not.toContain(' at Riverside');
  });

  test('carry every language, each device is notified in its own', async () => {
    const list = await localizeReminders(() => appointmentReminders([visit], profile, DEMO_NOW, URL));
    expect(list[0]?.texts.nl?.title).toBe('Morgen: Prenatal visit');
    expect(list[0]?.texts.es?.title).toBe('Mañana: Prenatal visit');
    expect(list[1]?.texts.nl?.title).toBe('Over 2 uur: Prenatal visit');
    expect(list[1]?.texts.es?.body).toContain('Riverside Family Clinic');
    expect(list[1]?.texts.en?.body).toContain('Robin');
  });
});
