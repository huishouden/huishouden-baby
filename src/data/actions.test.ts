import { describe, expect, test } from 'bun:test';
import { memoryStore } from '@huishouden/pwa-kit/store';
import { DEMO_NOW, demoData, type BabyData } from '../lib/demo';
import { createActions, type Backend, type Op } from './actions';

/** The actions over the sample's memory backend, recording every write as the live batches would. */
function harness(me = 'sam@example.com') {
  const store = memoryStore<BabyData>(demoData('after'), () => {});
  const writes: Op[][] = [];
  const backend: Backend = {
    newId: store.backend.newId,
    write: (ops) => {
      writes.push(ops);
      store.backend.write(ops);
    },
    saveProfile: (profile) => store.patch((d) => ({ ...d, profile })),
    contacts: { save: () => {}, remove: () => {}, restore: () => {} },
  };
  return { actions: createActions(backend, store.read, me, () => DEMO_NOW), read: store.read, writes };
}

describe('the log', () => {
  test('a logged feed is stamped with who and when; delete and restore put it back as it was', () => {
    const h = harness();
    const e = h.actions.logEvent({ kind: 'feed', method: 'breast', side: 'left' });
    expect(e).toMatchObject({ kind: 'feed', side: 'left', at: DEMO_NOW, by: 'sam@example.com', createdAt: DEMO_NOW });
    expect(h.read().events.find((x) => x.id === e.id)).toEqual(e);
    h.actions.deleteEvent(e.id);
    expect(h.read().events.some((x) => x.id === e.id)).toBe(false);
    h.actions.restoreEvent(e);
    expect(h.read().events.find((x) => x.id === e.id)).toEqual(e);
  });

  test('ending someone else’s sleep keeps who started it', () => {
    const h = harness('jo@example.com');
    const sleep = h.read().events.find((e) => e.kind === 'sleep')!;
    h.actions.updateEvent(sleep, { ...sleep, endAt: DEMO_NOW });
    expect(h.read().events.find((e) => e.id === sleep.id)).toMatchObject({ by: sleep.by, createdAt: sleep.createdAt, endAt: DEMO_NOW, updatedAt: DEMO_NOW });
  });
});

describe('checklists', () => {
  test('a tick and a reorder write only their field', () => {
    const h = harness();
    const [a, b] = h.read().checklists;
    h.actions.setChecklistDone(a.id, !a.done);
    h.actions.reorderChecklist([{ id: b.id, order: 99 }]);
    expect(h.writes.slice(-2)).toEqual([[{ col: 'checklists', id: a.id, data: { done: !a.done }, merge: true }], [{ col: 'checklists', id: b.id, data: { order: 99 }, merge: true }]]);
    expect(h.read().checklists.find((c) => c.id === a.id)).toEqual({ ...a, done: !a.done });
  });

  test('skipping stamps when and writes only the skip fields; un-skipping puts it back on the list', () => {
    const h = harness();
    const item = h.read().checklists.find((c) => !c.done && !c.skipped)!;
    h.actions.setChecklistSkipped(item.id, true);
    expect(h.writes.at(-1)).toEqual([{ col: 'checklists', id: item.id, data: { skipped: true, skippedAt: DEMO_NOW }, merge: true }]);
    expect(h.read().checklists.find((c) => c.id === item.id)).toEqual({ ...item, skipped: true, skippedAt: DEMO_NOW });
    h.actions.setChecklistSkipped(item.id, false);
    expect(h.writes.at(-1)).toEqual([{ col: 'checklists', id: item.id, data: { skipped: false }, merge: true }]);
    expect(h.read().checklists.find((c) => c.id === item.id)).toMatchObject({ skipped: false, done: false });
  });

  test('a new item goes last in its list; blank text adds nothing', () => {
    const h = harness();
    const list = h.read().checklists[0].list;
    const last = Math.max(...h.read().checklists.filter((c) => c.list === list).map((c) => c.order));
    h.actions.addChecklistItem(` ${list} `, ' Nappies ');
    expect(h.read().checklists.at(-1)).toMatchObject({ list, text: 'Nappies', done: false, order: last + 10 });
    const count = h.writes.length;
    h.actions.addChecklistItem(list, '   ');
    expect(h.writes).toHaveLength(count);
  });
});

test('an edited appointment keeps its author and creation time', () => {
  const h = harness('alex@example.com');
  const a = h.read().appointments[0];
  h.actions.saveAppointment(a.id, { title: 'Check-up, moved', at: a.at + 3600_000 });
  expect(h.read().appointments.find((x) => x.id === a.id)).toMatchObject({ title: 'Check-up, moved', by: a.by, createdAt: a.createdAt, private: false });
});

describe('the contraction timer', () => {
  test('start records who and when; stop sets only the end, so a helper may stop another’s', () => {
    const h = harness('sam@example.com');
    const id = h.actions.startContraction();
    expect(h.read().contractions.find((c) => c.id === id)).toEqual({ id, start: DEMO_NOW, by: 'sam@example.com', createdAt: DEMO_NOW });
    h.actions.stopContraction(id);
    expect(h.writes.at(-1)).toEqual([{ col: 'contractions', id, data: { end: DEMO_NOW, updatedAt: DEMO_NOW }, merge: true }]);
    expect(h.read().contractions.find((c) => c.id === id)).toMatchObject({ end: DEMO_NOW, by: 'sam@example.com' });
  });

  test('delete and restore put a mistaken tap back as it was', () => {
    const h = harness();
    const id = h.actions.startContraction();
    const c = h.read().contractions.find((x) => x.id === id)!;
    h.actions.deleteContraction(id);
    expect(h.read().contractions.some((x) => x.id === id)).toBe(false);
    h.actions.restoreContraction(c);
    expect(h.read().contractions.find((x) => x.id === id)).toEqual(c);
  });
});
