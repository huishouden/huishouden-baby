import type { ContactWrites } from '@huishouden/pwa-kit/contacts';
import { track } from '@huishouden/pwa-kit/observability';
import { withoutId, type Backend as KitBackend, type Op as KitOp } from '@huishouden/pwa-kit/store';
import { nextOrder } from '../lib/checklist';
import type { BabyData } from '../lib/demo';
import { cleanEvent, type BabyProfile } from '../lib/model';
import { appointmentDoc, eventFields, newEventDoc, profileDoc } from './build';
import type { BabyActions } from './types';

// The Baby actions, written once over a small storage interface that the live (Firestore) and the
// sample (memory) stores each implement (@huishouden/pwa-kit/store), so the sample behaves exactly
// like the real app.

/** Firestore collection names under households/{id}, by the data key that holds them. */
export const COLLECTIONS = {
  events: 'babyEvents',
  checklists: 'babyChecklists',
  appointments: 'babyAppointments',
  contractions: 'babyContractions',
} as const satisfies Partial<Record<keyof BabyData, string>>;
export type DataKey = keyof typeof COLLECTIONS;

export type Op = KitOp<DataKey>;

export interface Backend extends KitBackend<DataKey> {
  /** babyProfile/main, one document rather than a list. */
  saveProfile(profile: BabyProfile): void;
  contacts: ContactWrites;
}

export function createActions(backend: Backend, read: () => BabyData, me: string, clock: () => number): BabyActions {
  const put = (col: DataKey, id: string, data: object) => backend.write([{ col, id, data }]);
  const del = (col: DataKey, id: string) => backend.write([{ col, id, data: null }]);

  return {
    saveProfile: (p) => {
      track('save baby profile');
      backend.saveProfile(profileDoc(p, me, clock()));
    },
    logEvent: (f) => {
      track('log entry', { kind: f.kind });
      const now = clock();
      const data = newEventDoc({ ...f, at: f.at ?? now }, me, now);
      const id = backend.newId('events');
      put('events', id, data);
      return { id, ...data };
    },
    updateEvent: (event, f) => put('events', event.id, cleanEvent({ ...eventFields(f), by: event.by, createdAt: event.createdAt, updatedAt: clock() })),
    deleteEvent: (id) => del('events', id),
    restoreEvent: (e) => put('events', e.id, cleanEvent(withoutId(e))),
    addChecklistItem: (list, text) => {
      track('add checklist item');
      const t = text.trim().slice(0, 200);
      const l = list.trim().slice(0, 60);
      if (!t || !l) return;
      put('checklists', backend.newId('checklists'), { list: l, text: t, done: false, order: nextOrder(read().checklists, l), createdAt: clock(), by: me });
    },
    // Ticks and reorders change only their field, so they never write back another device's edit.
    setChecklistDone: (id, done) => backend.write([{ col: 'checklists', id, data: { done }, merge: true }]),
    // The same write as the portal's Skip (lib/todos), with the moment filled in here.
    setChecklistSkipped: (id, skipped) =>
      backend.write([{ col: 'checklists', id, data: skipped ? { skipped: true, skippedAt: clock() } : { skipped: false }, merge: true }]),
    deleteChecklistItem: (id) => del('checklists', id),
    restoreChecklistItem: (item) => put('checklists', item.id, withoutId(item)),
    reorderChecklist: (writes) => backend.write(writes.map((w) => ({ col: 'checklists', id: w.id, data: { order: w.order }, merge: true }))),
    saveAppointment: (id, input) => {
      track('save appointment');
      const existing = id ? read().appointments.find((a) => a.id === id) : undefined;
      put('appointments', id ?? backend.newId('appointments'), appointmentDoc(input, existing?.by ?? me, existing?.createdAt ?? clock()));
    },
    deleteAppointment: (id) => del('appointments', id),
    restoreAppointment: (a) => put('appointments', a.id, withoutId(a)),
    startContraction: () => {
      track('start contraction');
      const now = Math.round(clock());
      const id = backend.newId('contractions');
      put('contractions', id, { start: now, by: me, createdAt: now });
      return id;
    },
    // Only the end changes, so stopping someone else's contraction (a helper may) never rewrites it.
    stopContraction: (id) => {
      track('stop contraction');
      const now = Math.round(clock());
      backend.write([{ col: 'contractions', id, data: { end: now, updatedAt: now }, merge: true }]);
    },
    deleteContraction: (id) => del('contractions', id),
    restoreContraction: (c) => put('contractions', c.id, withoutId(c)),
    saveContact: (id, input) => backend.contacts.save(id, input),
    deleteContact: (id) => {
      const c = read().contacts.find((x) => x.id === id);
      if (c) backend.contacts.remove(c);
    },
    restoreContact: (c) => backend.contacts.restore(c),
  };
}
