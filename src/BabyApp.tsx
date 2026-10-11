import { Baby as BabyIcon, CalendarDays, Contact as ContactIcon, ListChecks, NotebookPen, Timer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { Appointment } from './lib/model';
import { isImported, type CalendarMatch } from '@huishouden/pwa-kit/calendar';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { CalendarSuggestions, calendarAvailable, useCalendarSuggestions } from '@huishouden/pwa-kit/react/calendar';
import { ContactDialog } from '@huishouden/pwa-kit/react/contacts';
import { Toast, type ToastState } from '@huishouden/pwa-kit/react/ui';
import { can, refusal } from '@huishouden/pwa-kit/roles';
import { mayChange } from './lib/roles';
import type { BabyStore } from './data/types';
import { Header, type Tab } from './components/Header';
import { ProfileDialog, type ProfileMode } from './components/ProfileDialog';
import { AppointmentDialog } from './components/AppointmentDialog';
import { APP, ROLE_NAMES, STORED_ROLES, shownRole } from './lib/contacts';
import { BABY_CALENDAR_QUERIES, fromCalendar, importMessage } from './lib/calendarImport';
import { auth } from './data/firebase';
import { LogScreen } from './screens/LogScreen';
import { Overview } from './screens/Overview';
import { Appointments } from './screens/Appointments';
import { Checklists } from './screens/Checklists';
import { Contacts } from './screens/Contacts';
import { Contractions } from './screens/Contractions';
import { useT } from './i18n';

type TabId = 'home' | 'contractions' | 'appointments' | 'checklists' | 'contacts';
const TAB_IDS: readonly TabId[] = ['home', 'contractions', 'appointments', 'checklists', 'contacts'];

/** The tab a link asks for ("#appointments", as the household agenda links), if any. */
const tabFromHash = (): TabId | undefined => TAB_IDS.find((id) => `#${id}` === location.hash);

interface Props {
  store: BabyStore;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
  toast: ToastState | null;
  notify: (message: string, undo?: () => void) => void;
  clearToast: () => void;
  /** Shown above the content: the sample-data banner. */
  banner?: ReactNode;
  initialTab?: TabId;
  /** The signed-in household, for the notifications switch. */
  householdId?: string;
}

/** Everything inside the frame once there is data to show (live or sample). */
export function BabyApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner, initialTab, householdId }: Props) {
  const t = useT();
  const { now } = useClock();
  const [tab, setTab] = useState<TabId>(() => initialTab ?? tabFromHash() ?? 'home');
  const [profileMode, setProfileMode] = useState<ProfileMode | null>(null);
  const [appointment, setAppointment] = useState<Appointment | 'new' | null>(null);
  const [contact, setContact] = useState<{ contact: Contact | null; role?: string } | null>(null);
  const { profile } = store.data;
  const born = !!profile?.birthDate;
  const calendar = calendarAvailable(user);
  const appointments = store.data.appointments;
  const canSettings = can(store.role, 'change-settings');
  const canPrivate = can(store.role, 'see-private');
  /** Opens an appointment to edit, or says who can when it isn't theirs. */
  const openAppointment = (a: Appointment) => (mayChange(store.role, store.me, a) ? setAppointment(a) : notify(refusal('edit-others')));
  /** The baby's details are the household's settings: admins and members. */
  const openProfile = (mode: ProfileMode) => (canSettings ? setProfileMode(mode) : notify(refusal('change-settings')));
  const suggested = useCalendarSuggestions({ auth, words: BABY_CALENDAR_QUERIES, isImported: (m) => isImported(m, appointments), app: 'Baby' });

  /** Calendar events in as appointments: Import from calendar and the new-in-your-calendar card. */
  const importEvents = (list: CalendarMatch[]) => {
    for (const m of list) store.actions.saveAppointment(null, fromCalendar(m));
    notify(importMessage(list));
  };

  const title = t('app.title');
  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const follow = () => {
      const id = tabFromHash();
      if (id) setTab(id);
    };
    addEventListener('hashchange', follow);
    return () => removeEventListener('hashchange', follow);
  }, []);

  const tabs: Tab[] = [
    { id: 'home', label: born ? t('tab.log') : t('tab.overview'), icon: born ? NotebookPen : BabyIcon },
    // Kids have no access to the contraction timer.
    ...(store.role == null || store.role === 'kid' ? [] : [{ id: 'contractions', label: t('tab.contractions'), short: t('tab.contractionsShort'), icon: Timer }]),
    { id: 'appointments', label: t('tab.appointments'), short: t('tab.appointmentsShort'), icon: CalendarDays },
    { id: 'checklists', label: t('tab.checklists'), icon: ListChecks },
    { id: 'contacts', label: t('tab.contacts'), icon: ContactIcon },
  ];

  let content: ReactNode;
  if (!store.ready) content = <p className="p-2 text-lg text-muted">{t('app.loading')}</p>;
  else if (tab === 'contractions' && store.role != null && store.role !== 'kid') content = <Contractions store={store} notify={notify} />;
  else if (tab === 'appointments')
    content = <Appointments store={store} live={householdId && user?.email ? { householdId, email: user.email.toLowerCase() } : undefined} calendarAvailable={calendar} onAdd={() => setAppointment('new')} onEdit={openAppointment} onImport={importEvents} />;
  else if (tab === 'checklists') content = <Checklists store={store} notify={notify} onAddContact={(role) => setContact({ contact: null, role: ROLE_NAMES[role] })} />;
  else if (tab === 'contacts')
    content = <Contacts store={store} notify={notify} onAdd={() => setContact({ contact: null })} onEdit={(c) => setContact({ contact: c })} />;
  else if (born) content = <LogScreen store={store} notify={notify} onEditProfile={canSettings ? () => setProfileMode('edit') : undefined} />;
  else
    content = (
      <Overview
        store={store}
        onSetDueDate={canSettings ? () => openProfile('due') : undefined}
        onBabyIsHere={canSettings ? () => openProfile('born') : undefined}
        onAddAppointment={() => setAppointment('new')}
        onEditAppointment={openAppointment}
        onOpen={setTab}
        contractions={store.role != null && store.role !== 'kid'}
        notify={notify}
      />
    );

  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased lg:h-dvh lg:overflow-hidden">
      <Header tabs={tabs} tab={tab} onTab={(id) => setTab(id as TabId)} user={user} onSignIn={onSignIn} onSignOut={onSignOut} signingIn={signingIn} />
      <main className="mx-auto flex w-full max-w-[1200px] min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
        {banner}
        {tab === 'home' && store.ready && (
          <CalendarSuggestions suggestions={suggested.suggestions} now={now} onAdd={(m) => importEvents([m])} onDismiss={suggested.dismiss} />
        )}
        <div className="min-h-0 flex-1">{content}</div>
      </main>

      {profileMode && (
        <ProfileDialog
          mode={profileMode}
          profile={profile}
          now={now}
          onClose={() => setProfileMode(null)}
          onSave={(p) => {
            const before = profile;
            store.actions.saveProfile(p);
            if (profileMode === 'born') {
              setTab('home');
              notify(p.name?.trim() ? t('toast.welcome', { name: p.name.trim() }) : t('toast.logReady'), before ? () => store.actions.saveProfile(before) : undefined);
            }
          }}
        />
      )}
      {appointment && (
        <AppointmentDialog
          appointment={appointment === 'new' ? null : appointment}
          now={now}
          contacts={store.data.contacts}
          calendarAvailable={calendar}
          canMarkPrivate={canPrivate}
          onClose={() => setAppointment(null)}
          onSave={(input) => store.actions.saveAppointment(appointment === 'new' ? null : appointment.id, input)}
          onDelete={
            appointment === 'new'
              ? undefined
              : () => {
                  const gone = appointment;
                  store.actions.deleteAppointment(gone.id);
                  notify(t('common.deleted', { name: gone.title }), () => store.actions.restoreAppointment(gone));
                }
          }
        />
      )}
      {contact && (
        <ContactDialog
          contact={contact.contact}
          app={APP}
          roles={STORED_ROLES}
          roleLabel={shownRole}
          role={contact.role}
          searchPlaceholder={t('contactDialog.searchPlaceholder')}
          namePlaceholder={t('contactDialog.namePlaceholder')}
          auth={auth}
          canMarkPrivate={canPrivate}
          onClose={() => setContact(null)}
          onSave={(input) => {
            store.actions.saveContact(contact.contact?.id ?? null, input);
            if (!contact.contact) notify(t('common.added', { name: input.name }));
          }}
          onDelete={
            contact.contact
              ? () => {
                  const gone = contact.contact!;
                  store.actions.deleteContact(gone.id);
                  notify(t('common.deleted', { name: gone.name }), () => store.actions.restoreContact(gone));
                }
              : undefined
          }
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
