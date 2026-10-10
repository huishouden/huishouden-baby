import type { AppointmentData, BabyEventData, BabyProfile, EventFields } from '../lib/model';
import { LIMITS, cleanEvent } from '../lib/model';
import type { AppointmentInput, ProfileInput } from './types';

// Builds documents with exactly the keys the rules accept; shared by the live and demo stores.

const trimmed = (s: string | undefined, max: number) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : undefined;
};

export function profileDoc(p: ProfileInput, by: string, now: number): BabyProfile {
  const out: BabyProfile = { updatedAt: Math.round(now), updatedBy: by };
  const name = trimmed(p.name, LIMITS.name);
  if (name) out.name = name;
  if (p.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(p.dueDate)) out.dueDate = p.dueDate;
  if (p.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) out.birthDate = p.birthDate;
  return out;
}

/** Only the keys that belong to the event's kind. */
export function eventFields(f: Omit<EventFields, 'at'> & { at: number }): EventFields {
  const base: EventFields = { kind: f.kind, at: Math.round(f.at) };
  const note = trimmed(f.note, LIMITS.note);
  if (note) base.note = note;
  switch (f.kind) {
    case 'feed':
      base.method = f.method ?? 'breast';
      if (base.method === 'breast') base.side = f.side ?? 'both';
      else if (f.amountMl && f.amountMl > 0) base.amountMl = Math.round(f.amountMl);
      break;
    case 'sleep':
      base.endAt = f.endAt == null ? null : Math.round(f.endAt);
      break;
    case 'diaper':
      base.diaper = f.diaper ?? 'wet';
      break;
    case 'pump':
      if (f.amountMl && f.amountMl > 0) base.amountMl = Math.round(f.amountMl);
      break;
  }
  return base;
}

export function newEventDoc(f: Omit<EventFields, 'at'> & { at: number }, by: string, now: number): BabyEventData {
  return cleanEvent({ ...eventFields(f), by, createdAt: Math.round(now) });
}

export function appointmentDoc(a: AppointmentInput, by: string, createdAt: number): AppointmentData {
  const out: AppointmentData = { title: a.title.trim().slice(0, LIMITS.title), at: Math.round(a.at), createdAt: Math.round(createdAt), by };
  const location = trimmed(a.location, LIMITS.location);
  const notes = trimmed(a.notes, LIMITS.notes);
  if (location) out.location = location;
  if (notes) out.notes = notes;
  if (a.contactId) out.contactId = a.contactId;
  if (a.calendarEventId) out.calendarEventId = a.calendarEventId;
  if (a.calendarLink && /^https:\/\//.test(a.calendarLink)) out.calendarLink = a.calendarLink;
  // Written every time: an appointment without the flag is hidden from helpers and kids.
  out.private = a.private === true;
  // Reminders are on unless turned off, so only the off state is written.
  if (a.remind === false) out.remind = false;
  return out;
}
