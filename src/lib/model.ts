// Firestore shapes under households/{householdId}. The project's rules accept exactly these keys,
// so writers build documents from these types and never add fields.

export type EventKind = 'feed' | 'sleep' | 'diaper' | 'pump';
export type Side = 'left' | 'right' | 'both';
export type FeedMethod = 'breast' | 'bottle';
export type DiaperKind = 'wet' | 'dirty' | 'both';

/** babyProfile/main */
export interface BabyProfile {
  name?: string;
  dueDate?: string;
  birthDate?: string;
  /** The provider's instructions for the contraction timer ("call if 6 in an hour"). */
  contractionNote?: string;
  updatedAt: number;
  updatedBy: string;
}

/** babyEvents/{id} */
export interface BabyEventData {
  kind: EventKind;
  at: number;
  endAt?: number | null;
  side?: Side;
  method?: FeedMethod;
  amountMl?: number;
  diaper?: DiaperKind;
  note?: string;
  by: string;
  createdAt: number;
  updatedAt?: number;
}
export interface BabyEvent extends BabyEventData {
  id: string;
}

/** babyChecklists/{id} */
export interface ChecklistItemData {
  list: string;
  text: string;
  done: boolean;
  order: number;
  /** Not needed after all: kept in its list as "Skipped", counted neither as done nor as left to do. */
  skipped?: boolean;
  skippedAt?: number;
  createdAt: number;
  by: string;
}
export interface ChecklistItem extends ChecklistItemData {
  id: string;
}

/** babyAppointments/{id} */
export interface AppointmentData {
  title: string;
  at: number;
  location?: string;
  notes?: string;
  /** The household contact this appointment is with (households/{id}/contacts). */
  contactId?: string;
  /** The Google Calendar event it came from, so an import never adds it twice. */
  calendarEventId?: string;
  calendarLink?: string;
  /** Only admins and members see it (pwa-kit roles); always written, `false` included. */
  private?: boolean;
  /** Written only as `false`, when its reminders are turned off; absent means on. */
  remind?: false;
  createdAt: number;
  by: string;
}
export interface Appointment extends AppointmentData {
  id: string;
}

/** babyContractions/{id}: one contraction; `end` is absent while it is still going. */
export interface ContractionData {
  start: number;
  end?: number;
  by: string;
  createdAt: number;
  updatedAt?: number;
}
export interface Contraction extends ContractionData {
  id: string;
}

export const LIMITS = { name: 60, note: 500, itemText: 200, title: 120, location: 200, notes: 500, contractionNote: 300 } as const;

/** The editable part of an event; `by`/`createdAt` stay with the original logger. */
export type EventFields = Pick<BabyEventData, 'kind' | 'at' | 'endAt' | 'side' | 'method' | 'amountMl' | 'diaper' | 'note'>;

/** Drops undefined values (Firestore rejects them) and rounds times to whole milliseconds. */
export function cleanEvent<T extends Partial<BabyEventData>>(e: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (v === undefined) continue;
    if ((k === 'at' || k === 'endAt' || k === 'createdAt' || k === 'updatedAt') && typeof v === 'number') out[k] = Math.round(v);
    else if (k === 'amountMl' && typeof v === 'number') out[k] = Math.round(v);
    else out[k] = v;
  }
  return out as T;
}
