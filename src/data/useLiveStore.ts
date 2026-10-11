import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { commitOps, setDoc, writeBatch } from '@huishouden/pwa-kit/firestore';
import { householdContacts, markUnflaggedOpen, watchContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { can, isRestricted, type Role } from '@huishouden/pwa-kit/roles';
import type { Appointment, BabyEvent, BabyProfile, ChecklistItem, Contraction } from '../lib/model';
import { APP } from '../lib/contacts';
import { defaultChecklistDocs } from '../lib/checklist';
import { DAY } from '@huishouden/pwa-kit/time';
import { readError } from '@huishouden/pwa-kit/feedback';
import { localizeAgenda, removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { localizeReminders, replaceReminders, syncReminders } from '@huishouden/pwa-kit/reminders';
import { localizeTodos, syncTodos } from '@huishouden/pwa-kit/todos';
import { agendaItems, appointmentAgenda, appointmentRef, tabUrl } from '../lib/agenda';
import { todoItems } from '../lib/todos';
import { appointmentReminders, reminderRefs } from '../lib/reminders';
import { db } from './firebase';
import { COLLECTIONS, createActions, type Backend } from './actions';
import type { BabyData, BabyStore } from './types';
import { t } from '../i18n';

/** How far back the log reads: enough for the day picker, small enough to stay fast. */
const HISTORY_DAYS = 14;

/** How far back the contraction history reads. */
const CONTRACTION_DAYS = 30;

/** The household agenda is a copy for the portal: a failed write there never interrupts Baby. */
const publish = (p: Promise<unknown>) => void p.catch((e) => console.warn("Couldn't update the household agenda", e));
/** The to-do list is the same kind of copy. */
const publishTodos = (p: Promise<unknown>) => void p.catch((e) => console.warn("Couldn't update the household to-do list", e));

/** How long after a checklist change the to-do list follows, so a run of ticks is one sync. */
const TODO_DELAY = 3000;

/**
 * Live household data from Firestore with onSnapshot listeners. Writes are fire-and-forget: the
 * persistent cache applies them locally at once (also offline) and syncs later. They come from the
 * kit, which also notes each one in localStorage until the server has it, so a feed logged as the
 * app is closed or reloaded, online or off, is not lost. The kit's contact and agenda helpers write the same way.
 */
export function useLiveStore(householdId: string, me: string, members: string[], role: Role | null, onError: (message: string) => void): BabyStore {
  // Helpers and kids read only appointments and contacts not marked private, and must ask for just those.
  const restricted = isRestricted(role);
  const [profile, setProfile] = useState<BabyProfile | null>(null);
  const [events, setEvents] = useState<BabyEvent[]>([]);
  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contractions, setContractions] = useState<Contraction[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [answered, setAnswered] = useState({ profile: false, checklists: false });
  const data: BabyData = { profile, events, checklists, appointments, contractions, contacts };
  // The data as of the last render, for actions (an edit keeps its author; a new item goes last).
  const current = useRef(data);
  current.current = data;
  // Whether the profile and appointments have answered from the server, not just the local cache:
  // the agenda is reconciled against them once per household when both have.
  const [fromServer, setFromServer] = useState({ profile: false, appointments: false, checklists: false });
  const syncedFor = useRef<string | null>(null);
  const todosFor = useRef<string | null>(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const base = `households/${householdId}`;

  useEffect(() => {
    // The message is worded when the error comes, in the language of that moment.
    const fail = (what: () => string) => (e: Error) => errorRef.current(readError(e, what()));
    const since = Date.now() - HISTORY_DAYS * DAY;
    const unsubs = [
      onSnapshot(
        doc(db, base, 'babyProfile', 'main'),
        { includeMetadataChanges: true },
        (s) => {
          setProfile(s.exists() ? (s.data() as BabyProfile) : null);
          setAnswered((a) => ({ ...a, profile: true }));
          if (!s.metadata.fromCache) setFromServer((f) => (f.profile ? f : { ...f, profile: true }));
        },
        (e) => {
          setAnswered((a) => ({ ...a, profile: true }));
          fail(() => t('error.loadProfile'))(e);
        },
      ),
      onSnapshot(
        query(collection(db, base, 'babyEvents'), where('at', '>=', since)),
        (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BabyEvent, 'id'>) }))),
        fail(() => t('error.loadLog')),
      ),
      onSnapshot(
        collection(db, base, 'babyChecklists'),
        { includeMetadataChanges: true },
        (s) => {
          setChecklists(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChecklistItem, 'id'>) })));
          setAnswered((a) => ({ ...a, checklists: true }));
          if (!s.metadata.fromCache) setFromServer((f) => (f.checklists ? f : { ...f, checklists: true }));
          // First visit for this household: start the checklists with sensible defaults, in this
          // device's language (the household's text from then on). Stable ids make a second device
          // seeding at the same moment harmless.
          const key = `baby-seeded-${householdId}`;
          if (s.empty && !s.metadata.fromCache && !localStorage.getItem(key)) {
            localStorage.setItem(key, '1');
            const batch = writeBatch(db);
            for (const { id, data } of defaultChecklistDocs(Date.now(), me)) batch.set(doc(db, base, 'babyChecklists', id), data);
            batch.commit().catch((e) => {
              localStorage.removeItem(key);
              errorRef.current(readError(e, t('error.seed')));
            });
          } else if (!s.empty) localStorage.setItem(key, '1');
        },
        (e) => {
          setAnswered((a) => ({ ...a, checklists: true }));
          fail(() => t('error.loadChecklists'))(e);
        },
      ),
      onSnapshot(
        restricted ? query(collection(db, base, 'babyAppointments'), where('private', '==', false)) : collection(db, base, 'babyAppointments'),
        { includeMetadataChanges: true },
        (s) => {
          setAppointments(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) })));
          if (!s.metadata.fromCache) setFromServer((f) => (f.appointments ? f : { ...f, appointments: true }));
        },
        fail(() => t('error.loadAppointments')),
      ),
      // Kids have no access to the contraction timer (the rules refuse the read).
      ...(role == null || role === 'kid'
        ? []
        : [
            onSnapshot(
              query(collection(db, base, 'babyContractions'), where('start', '>=', Date.now() - CONTRACTION_DAYS * DAY)),
              (s) => setContractions(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contraction, 'id'>) }))),
              fail(() => t('error.loadContractions')),
            ),
          ]),
      watchContacts(db, householdId, setContacts, { app: APP, restricted, backfillPositions: true, onError: fail(() => t('error.loadContacts')) }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [base, householdId, me, restricted, role]);

  // Appointments saved before the private flag are hidden from helpers and kids until written with
  // `private: false`: an admin's or member's device does that once they have loaded.
  const seesPrivate = can(role, 'see-private');
  useEffect(() => {
    if (!seesPrivate || !fromServer.appointments || !appointments.some((a) => typeof a.private !== 'boolean')) return;
    markUnflaggedOpen(db, householdId, 'babyAppointments', appointments).catch(() => {});
  }, [seesPrivate, fromServer.appointments, appointments, householdId]);

  useEffect(() => {
    if (!fromServer.profile || !fromServer.appointments || syncedFor.current === householdId) return;
    syncedFor.current = householdId;
    publish(localizeAgenda(() => agendaItems({ profile, appointments })).then((items) => syncAgenda(db, householdId, APP, items, { by: me, restricted })));
  }, [fromServer, householdId, me, profile, appointments, restricted]);

  // The household to-do list follows the checklists: at once on open (once the server has answered,
  // so a stale cache never clears it), then a few seconds after each change.
  useEffect(() => {
    if (!fromServer.checklists) return;
    const first = todosFor.current !== householdId;
    todosFor.current = householdId;
    const timer = setTimeout(
      () => publishTodos(localizeTodos(() => todoItems(checklists)).then((items) => syncTodos(db, householdId, APP, items, { by: me, restricted }))),
      first ? 0 : TODO_DELAY,
    );
    return () => clearTimeout(timer);
  }, [fromServer.checklists, checklists, householdId, me, restricted]);

  // Reminders for the appointments (the day before and 2 hours before). On open, once the server has
  // answered so a stale cache never cancels any; after that, with each appointment saved or deleted
  // (see `scheduleReminders` below), so a change to its time, privacy or switch is not left to a timer.
  // Every language's words go along, so each device is notified in its own.
  const scheduleReminders = useCallback(
    (appointments: Appointment[], profile: BabyProfile | null, changed?: string[]) => {
      const now = Date.now();
      const url = tabUrl(location.origin, 'appointments');
      const warn = (e: unknown) => console.warn("Couldn't schedule reminders", e);
      if (!restricted) {
        localizeReminders(() => appointmentReminders(appointments, profile, now, url))
          .then((items) => syncReminders(db, householdId, 'baby', items, me, now, {}))
          .catch(warn);
        return;
      }
      // A helper's or kid's device touches only the appointments it just saved or deleted, by ref and
      // without a source (the kit allows that only to admins and members), so it never rewrites the
      // reminders an admin or member scheduled for others.
      if (!changed?.length) return;
      localizeReminders(() => appointmentReminders(appointments.filter((a) => changed.includes(a.id)), profile, now, url, false))
        .then((items) =>
          Promise.all(changed.flatMap(reminderRefs).map((ref) => replaceReminders(db, householdId, ref, items.filter((r) => r.ref === ref), me, now, { restricted }))),
        )
        .catch(warn);
    },
    [householdId, me, restricted],
  );
  const remindersFor = useRef<string | null>(null);
  useEffect(() => {
    if (restricted || !fromServer.profile || !fromServer.appointments || remindersFor.current === householdId) return;
    remindersFor.current = householdId;
    scheduleReminders(appointments, profile);
  }, [restricted, fromServer.profile, fromServer.appointments, appointments, profile, householdId, scheduleReminders]);

  const actions = useMemo(() => {
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, t('error.save'))));
    const publishAppointment = (a: Appointment) =>
      publish(
        localizeAgenda(() => appointmentAgenda(a, current.current.profile)).then((items) =>
          replaceAgenda(db, householdId, APP, appointmentRef(a.id), items, { by: me, restricted }),
        ),
      );
    const backend: Backend = {
      newId: (col) => doc(collection(db, base, COLLECTIONS[col])).id,
      write: (ops) => {
        report(commitOps(db, base, ops, (col) => COLLECTIONS[col]));
        // The reminders follow too, from the appointments as they will stand once these writes land.
        if (ops.some((op) => op.col === 'appointments')) {
          const next = new Map(current.current.appointments.map((x) => [x.id, x]));
          for (const op of ops) if (op.col === 'appointments') op.data ? next.set(op.id, { id: op.id, ...(op.data as Omit<Appointment, 'id'>) }) : next.delete(op.id);
          scheduleReminders([...next.values()], current.current.profile, ops.filter((op) => op.col === 'appointments').map((op) => op.id));
        }
        // The household agenda follows each appointment saved, restored or deleted.
        for (const op of ops) {
          if (op.col !== 'appointments') continue;
          if (op.data) publishAppointment({ id: op.id, ...(op.data as Omit<Appointment, 'id'>) });
          else publish(removeAgenda(db, householdId, APP, appointmentRef(op.id), { restricted }));
        }
      },
      saveProfile: (profile) => {
        report(setDoc(doc(db, base, 'babyProfile', 'main'), profile));
        // The due date and the baby's name on every appointment may both have changed.
        publish(
          localizeAgenda(() => agendaItems({ profile, appointments: current.current.appointments })).then((items) =>
            syncAgenda(db, householdId, APP, items, { by: me, restricted }),
          ),
        );
      },
      contacts: householdContacts(db, householdId, APP, me, report),
    };
    return createActions(backend, () => current.current, me, () => Date.now());
  }, [base, householdId, me, restricted, scheduleReminders]);

  return {
    data,
    ready: answered.profile && answered.checklists,
    actions,
    members,
    me,
    role,
  };
}
