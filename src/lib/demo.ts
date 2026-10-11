import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { HouseholdHome } from '@huishouden/pwa-kit/home';
import type { Appointment, BabyEvent, BabyProfile, ChecklistItem, Contraction } from './model';
import { defaultChecklistDocs } from './checklist';
import { toYmd } from '@huishouden/pwa-kit/time';
import { t } from '../i18n';

// Invented sample data for the signed-out app: README screenshots and first impressions. Everything
// is relative to one fixed day in 2031 so nothing resembles a real family's dates.

/** Wednesday 14 May 2031, 10:30 local time. The demo's clock starts here. */
export const DEMO_NOW = new Date(2031, 4, 14, 10, 30).getTime();

export const DEMO_MEMBERS = ['sam@example.com', 'alex@example.com'];
const [SAM, ALEX] = DEMO_MEMBERS;

export type DemoScenario = 'before' | 'after';

export interface BabyData {
  profile: BabyProfile | null;
  events: BabyEvent[];
  checklists: ChecklistItem[];
  appointments: Appointment[];
  /** The contraction timer's entries; empty for a kid, who has no access. */
  contractions: Contraction[];
  /** The household's contacts shown in Baby. */
  contacts: Contact[];
}

/** Local time on the day `dayOffset` days from the demo day. */
function at(dayOffset: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(DEMO_NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

type Row = [string, Partial<BabyEvent> & Pick<BabyEvent, 'kind'>, string?];

function day(offset: number, rows: Row[], startId: number): BabyEvent[] {
  return rows.map(([time, e, by], i) => ({
    id: `demo-${startId + i}`,
    at: at(offset, time),
    by: by ?? (i % 3 === 0 ? ALEX : SAM),
    createdAt: at(offset, time),
    ...e,
  }));
}

const sleepUntil = (offset: number, hhmm: string) => at(offset, hhmm);

function afterEvents(): BabyEvent[] {
  const yesterday: Row[] = [
    ['00:20', { kind: 'feed', method: 'breast', side: 'left' }],
    ['00:45', { kind: 'sleep', endAt: sleepUntil(-1, '03:00') }],
    ['03:05', { kind: 'diaper', diaper: 'wet' }],
    ['03:15', { kind: 'feed', method: 'breast', side: 'right' }],
    ['03:45', { kind: 'sleep', endAt: sleepUntil(-1, '06:10') }],
    ['06:20', { kind: 'feed', method: 'bottle', amountMl: 90 }, ALEX],
    ['06:30', { kind: 'diaper', diaper: 'dirty' }],
    ['07:00', { kind: 'sleep', endAt: sleepUntil(-1, '08:40') }],
    ['09:00', { kind: 'feed', method: 'breast', side: 'both' }],
    ['09:20', { kind: 'pump', amountMl: 110 }, SAM],
    ['10:00', { kind: 'sleep', endAt: sleepUntil(-1, '11:45') }],
    ['11:50', { kind: 'diaper', diaper: 'wet' }],
    ['12:05', { kind: 'feed', method: 'breast', side: 'left' }],
    ['13:00', { kind: 'sleep', endAt: sleepUntil(-1, '14:20') }],
    ['14:40', { kind: 'diaper', diaper: 'both' }],
    ['15:00', { kind: 'feed', method: 'bottle', amountMl: 100 }, ALEX],
    ['15:40', { kind: 'sleep', endAt: sleepUntil(-1, '17:30') }],
    ['17:45', { kind: 'feed', method: 'breast', side: 'right' }],
    ['18:10', { kind: 'diaper', diaper: 'wet' }],
    ['19:30', { kind: 'sleep', endAt: sleepUntil(-1, '20:15') }],
    ['20:40', { kind: 'feed', method: 'breast', side: 'left' }],
    ['21:00', { kind: 'pump', amountMl: 130 }, SAM],
    ['21:20', { kind: 'diaper', diaper: 'wet' }],
    ['21:40', { kind: 'sleep', endAt: sleepUntil(-1, '23:50') }],
  ];
  const today: Row[] = [
    ['00:05', { kind: 'feed', method: 'breast', side: 'right' }, SAM],
    ['00:30', { kind: 'diaper', diaper: 'wet' }, ALEX],
    ['00:40', { kind: 'sleep', endAt: sleepUntil(0, '03:05') }, ALEX],
    ['03:10', { kind: 'diaper', diaper: 'both' }, ALEX],
    ['03:20', { kind: 'feed', method: 'breast', side: 'both' }, SAM],
    ['03:50', { kind: 'sleep', endAt: sleepUntil(0, '05:30') }, SAM],
    ['05:45', { kind: 'feed', method: 'bottle', amountMl: 90, note: 'Took it slowly, burped twice' }, ALEX],
    ['05:55', { kind: 'diaper', diaper: 'wet' }, ALEX],
    ['06:10', { kind: 'pump', amountMl: 120 }, SAM],
    ['06:15', { kind: 'sleep', endAt: sleepUntil(0, '07:50') }, ALEX],
    ['08:00', { kind: 'diaper', diaper: 'dirty' }, SAM],
    ['08:20', { kind: 'feed', method: 'breast', side: 'left' }, SAM],
    ['08:50', { kind: 'sleep', endAt: sleepUntil(0, '09:25') }, ALEX],
    ['09:40', { kind: 'diaper', diaper: 'wet' }, ALEX],
    ['09:55', { kind: 'sleep', endAt: null }, SAM],
  ];
  return [...day(-1, yesterday, 100), ...day(0, today, 200)];
}

const PEDIATRICS = 'demo-contact-1';
const CLINIC = 'demo-contact-2';
const HOSPITAL = 'demo-contact-3';

/** The sample family's home, so the care team's cards and appointments say how far they are. */
export const DEMO_HOME: HouseholdHome = { address: '12 Example Lane, Springfield, Illinois 62701', lat: 39.7817, lng: -89.6501, setBy: SAM, updatedAt: at(-60, '12:00') };

/** Invented practices on an invented street; 555-01xx numbers are reserved for fiction. */
function contacts(): Contact[] {
  const base = { apps: ['baby'], createdAt: at(-60, '12:00'), by: SAM };
  return [
    {
      id: PEDIATRICS,
      name: 'Example Pediatrics',
      role: 'Pediatrician',
      phone: '(555) 010-0142',
      website: 'https://pediatrics.example.com',
      address: '12 Example Street, Springfield',
      lat: 39.7817,
      lng: -89.6066,
      notes: 'Taking new patients. Newborn visit within 3 days of coming home.',
      ...base,
    },
    {
      id: CLINIC,
      name: 'Riverside Family Clinic',
      role: 'OB / midwife',
      phone: '(555) 010-0187',
      email: 'frontdesk@clinic.example.com',
      website: 'https://clinic.example.com',
      address: '40 River Road, Springfield',
      lat: 39.7690,
      lng: -89.6230,
      ...base,
    },
    {
      id: HOSPITAL,
      name: 'City Hospital',
      role: 'Hospital',
      phone: '(555) 010-0100',
      address: '1 Hospital Way, Springfield',
      lat: 39.7990,
      lng: -89.6440,
      notes: 'Labor and delivery is on level 3. Park in garage B.',
      ...base,
    },
  ];
}

function appointments(after: boolean): Appointment[] {
  const list: [number, string, string, string, string?, string?][] = after
    ? [
        [2, '11:00', 'Two-week weight check', '12 Example Street, Springfield', undefined, PEDIATRICS],
        [9, '09:30', 'Postpartum check-up', 'Riverside Family Clinic', 'Bring the feeding log', CLINIC],
        [27, '10:15', 'One-month check and vaccines', '12 Example Street, Springfield', undefined, PEDIATRICS],
        [-12, '14:00', 'Newborn hearing test', 'City Hospital, level 2', undefined, HOSPITAL],
      ]
    : [
        [2, '09:30', 'Midwife check-up', 'Riverside Family Clinic, room 4', 'Ask about the birth plan and the hospital tour', CLINIC],
        [9, '08:00', 'Glucose test', 'Riverside lab', 'Fast from midnight'],
        [16, '18:30', 'Hospital tour', 'City Hospital, main entrance', undefined, HOSPITAL],
        [23, '19:00', 'Birth class, part 2', 'Community centre, room B'],
        [-14, '19:00', 'Birth class, part 1', 'Community centre, room B'],
        [-42, '10:00', '20-week scan', 'City Hospital, imaging', undefined, HOSPITAL],
      ];
  return list.map(([d, time, title, location, notes, contactId], i) => ({
    id: `demo-appt-${i + 1}`,
    title,
    at: at(d, time),
    location,
    ...(notes ? { notes } : {}),
    ...(contactId ? { contactId } : {}),
    // The glucose test is kept to admins and members, to show the private flag.
    private: title === 'Glucose test',
    createdAt: at(-60, '12:00'),
    by: i % 2 ? ALEX : SAM,
  }));
}

const SKIPPED = 'default-3-6';

function checklists(after: boolean): ChecklistItem[] {
  const doneBefore = new Set(['default-1-1', 'default-1-2', 'default-1-4', 'default-2-1', 'default-2-2', 'default-3-1', 'default-3-2', 'default-3-3', 'default-4-1', 'default-4-2']);
  const items: ChecklistItem[] = defaultChecklistDocs(at(-60, '12:00'), SAM).map(({ id, data }) => ({
    id,
    ...data,
    done: after ? !id.startsWith('default-4-5') && !id.startsWith('default-4-6') && id !== SKIPPED : doneBefore.has(id),
    // The night light turned out not to be needed: skipped, still shown in the list.
    ...(id === SKIPPED ? { skipped: true, skippedAt: at(-25, '12:00') } : {}),
  }));
  // One of the household's own items, about finding someone the care team does not have yet (in the
  // page's language, like the starter lists it sits with).
  items.push({ id: 'demo-item-1', list: t('template.paperwork'), text: t('sample.lactationItem'), done: false, order: 4100, createdAt: at(-20, '12:00'), by: ALEX });
  return items;
}

/** Eight contractions in the hour before the demo's "now", getting closer and longer. */
function sampleContractions(): Contraction[] {
  const min = 60_000;
  const gaps = [0, 9, 8, 7, 6.5, 6, 5.5, 5];
  const lens = [42, 45, 48, 50, 55, 58, 60, 63];
  let start = DEMO_NOW - 58 * min;
  return gaps.map((g, i) => {
    start += g * min;
    return { id: `demo-contraction-${i + 1}`, start, end: start + lens[i] * 1000, by: i % 2 ? ALEX : SAM, createdAt: start };
  });
}

export function demoData(scenario: DemoScenario): BabyData {
  const after = scenario === 'after';
  const profile: BabyProfile = after
    ? { name: 'Robin', dueDate: toYmd(at(-15, '12:00')), birthDate: toYmd(at(-18, '12:00')), updatedAt: at(-18, '12:00'), updatedBy: SAM }
    : { dueDate: toYmd(at(12 * 7 + 3, '12:00')), updatedAt: at(-30, '12:00'), updatedBy: SAM };
  return {
    profile,
    events: after ? afterEvents() : [],
    checklists: checklists(after),
    appointments: appointments(after),
    contractions: after ? [] : sampleContractions(),
    contacts: contacts(),
  };
}
