import type { Contact, ContactInput } from '@huishouden/pwa-kit/contacts';
import type { Role } from '@huishouden/pwa-kit/roles';
import type { Appointment, BabyEvent, ChecklistItem, Contraction, EventFields } from '../lib/model';
import type { BabyData } from '../lib/demo';

export type { BabyData };

export interface ProfileInput {
  name?: string;
  dueDate?: string;
  birthDate?: string;
  contractionNote?: string;
}

export interface AppointmentInput {
  title: string;
  at: number;
  location?: string;
  notes?: string;
  contactId?: string;
  calendarEventId?: string;
  calendarLink?: string;
  private?: boolean;
  /** Reminders the day before and 2 hours before; on unless `false`. */
  remind?: boolean;
}

/** Writes return immediately (Firestore queues them offline); failures arrive through `onError`. */
export interface BabyActions {
  saveProfile(p: ProfileInput): void;
  /** The provider's instructions for the contraction timer; admins and members. */
  saveContractionNote(note: string): void;
  logEvent(fields: Omit<EventFields, 'at'> & { at?: number }): BabyEvent;
  updateEvent(event: BabyEvent, fields: EventFields): void;
  deleteEvent(id: string): void;
  restoreEvent(event: BabyEvent): void;
  addChecklistItem(list: string, text: string): void;
  setChecklistDone(id: string, done: boolean): void;
  /** Skip an item that isn't needed after all, or put it back on the list. */
  setChecklistSkipped(id: string, skipped: boolean): void;
  deleteChecklistItem(id: string): void;
  restoreChecklistItem(item: ChecklistItem): void;
  reorderChecklist(writes: { id: string; order: number }[]): void;
  saveAppointment(id: string | null, input: AppointmentInput): void;
  deleteAppointment(id: string): void;
  restoreAppointment(a: Appointment): void;
  /** Starts timing a contraction now; returns its id. */
  startContraction(): string;
  /** Ends a running contraction now. */
  stopContraction(id: string): void;
  deleteContraction(id: string): void;
  restoreContraction(c: Contraction): void;
  saveContact(id: string | null, input: ContactInput): void;
  deleteContact(id: string): void;
  /** Puts a deleted contact back under its old id, so appointments that point at it still do. */
  restoreContact(c: Contact): void;
}

export interface BabyStore {
  data: BabyData;
  /** False until the profile and lists have answered once (from cache or server). */
  ready: boolean;
  actions: BabyActions;
  /** Lowercase emails of the household, for consistent avatar colours. */
  members: string[];
  /** The signed-in member's email (or the demo's). */
  me: string;
  /** Their role in the household (pwa-kit roles): helpers and kids change only what they added. */
  role: Role | null;
}
