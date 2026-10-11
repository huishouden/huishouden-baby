import { useState } from 'react';
import { CalendarArrowDown, CalendarPlus, ChevronDown, ChevronUp, ExternalLink, MapPin, Pencil, Phone, UserRound } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { telHref } from '@huishouden/pwa-kit/places';
import { AddToCalendar, CalendarHint, CalendarImportDialog, useCalendarSearch } from '@huishouden/pwa-kit/react/calendar';
import { appointmentEntry } from '../lib/agenda';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { useHome } from '@huishouden/pwa-kit/react/home';
import { appointmentFromHome } from '../lib/contacts';
import { cardClass, ghostButton, iconButton, linkClass, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { formatDayLong, formatTime, monthShort, relativeDay } from '@huishouden/pwa-kit/time';
import { formatNumber } from '@huishouden/pwa-kit/i18n';
import type { Appointment, BabyProfile } from '../lib/model';
import { BABY_CALENDAR_QUERIES } from '../lib/calendarImport';
import type { CalendarMatch } from '@huishouden/pwa-kit/calendar';
import type { BabyStore } from '../data/types';
import { auth } from '../data/firebase';
import { PrivateMark } from '@huishouden/pwa-kit/react/contacts';
import { mayChange } from '../lib/roles';
import { DeviceNotifications, type LiveNotifications } from '../components/Notifications';
import { useT } from '../i18n';

export function Appointments({ store, live, calendarAvailable, onAdd, onEdit, onImport }: {
  store: BabyStore;
  /** Signed in: the household and address the notifications switch acts for. */
  live?: LiveNotifications;
  calendarAvailable: boolean;
  onAdd: () => void;
  onEdit: (a: Appointment) => void;
  /** Adds calendar events as appointments, with a toast. */
  onImport: (list: CalendarMatch[]) => void;
}) {
  const t = useT();
  const { now } = useClock();
  const [showPast, setShowPast] = useState(false);
  const [importing, setImporting] = useState(false);
  const scan = useCalendarSearch(auth, 'Baby');
  const all = store.data.appointments;
  const contacts = store.data.contacts;
  const upcoming = all.filter((a) => a.at >= now - 3_600_000).sort((a, b) => a.at - b.at);
  const past = all.filter((a) => a.at < now - 3_600_000).sort((a, b) => b.at - a.at);
  const runScan = () => void scan.run(BABY_CALENDAR_QUERIES, { limit: 25 });

  return (
    <div className="mx-auto max-w-3xl space-y-6 lg:h-full lg:overflow-y-auto">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h2 className="text-2xl font-semibold text-ink">{t('tab.appointments')}</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButton}
              disabled={!calendarAvailable}
              onClick={() => {
                setImporting(true);
                // Straight from the tap: the first search opens Google's permission window.
                runScan();
              }}
            >
              <CalendarArrowDown size={20} /> {t('appointments.import')}
            </button>
            <button type="button" className={primaryButton} onClick={onAdd}>
              <CalendarPlus size={20} /> {t('appointments.add')}
            </button>
          </div>
        </div>
        <div className="mt-1 flex justify-end text-right">
          <CalendarHint app="Baby" name={t('app.name')} available={calendarAvailable} />
        </div>
      </div>

      <section className={cardClass} aria-label={t('appointments.upcoming')}>
        {upcoming.length === 0 && <p className="p-6 text-lg text-muted">{t('appointments.none')}</p>}
        <ul>
          {upcoming.map((a, i) => (
            <Row key={a.id} a={a} now={now} contacts={contacts} profile={store.data.profile} first={i === 0} onEdit={mayChange(store.role, store.me, a) ? () => onEdit(a) : undefined} />
          ))}
        </ul>
      </section>

      {past.length > 0 && (
        <section aria-label={t('appointments.past')}>
          <button type="button" className={ghostButton} onClick={() => setShowPast((s) => !s)} aria-expanded={showPast}>
            {showPast ? <ChevronUp size={18} /> : <ChevronDown size={18} />} {t('appointments.pastCount', { n: past.length })}
          </button>
          {showPast && (
            <ul className={`${cardClass} mt-2`}>
              {past.map((a) => (
                <Row key={a.id} a={a} now={now} contacts={contacts} profile={store.data.profile} onEdit={mayChange(store.role, store.me, a) ? () => onEdit(a) : undefined} />
              ))}
            </ul>
          )}
        </section>
      )}

      <DeviceNotifications live={live} />

      {importing && (
        <CalendarImportDialog
          state={scan.state}
          records={all}
          intro={t('import.intro')}
          noneFound={t('import.none')}
          allImported={t('import.allImported')}
          onRetry={runScan}
          onAdd={onImport}
          onClose={() => {
            setImporting(false);
            scan.reset();
          }}
        />
      )}
    </div>
  );
}

function Row({ a, now, contacts, profile, first, onEdit }: { a: Appointment; now: number; contacts: Contact[]; profile: BabyProfile | null; first?: boolean; onEdit?: () => void }) {
  const t = useT();
  const entry = appointmentEntry(a, profile);
  const d = new Date(a.at);
  const who = a.contactId ? contacts.find((c) => c.id === a.contactId) : undefined;
  const home = useHome();
  const away = appointmentFromHome(a.location, who, { home });
  return (
    <li className="flex items-start gap-3 border-b border-line p-4 last:border-b-0 sm:gap-5 sm:p-5">
      <div className={`flex w-16 shrink-0 flex-col items-center rounded-xl py-2 ${first ? 'bg-primary text-on-primary' : 'bg-tint text-link'}`}>
        <span className="text-sm font-medium">{monthShort(a.at)}</span>
        <span className="text-2xl font-semibold tabular-nums">{formatNumber(d.getDate())}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`${first ? 'text-2xl' : 'text-xl'} font-semibold text-ink`}>{a.title}</p>
        <p className="mt-0.5 text-base text-ink-soft">
          <span className="font-medium text-link">{relativeDay(a.at, now)}</span> · {formatDayLong(a.at)}, {formatTime(a.at)}
        </p>
        {who && (
          <div className="flex flex-wrap items-center gap-x-4 text-base text-muted">
            <span className="flex items-center gap-1.5">
              <UserRound size={16} className="shrink-0" aria-hidden="true" /> {who.name}
            </span>
            {who.phone && (
              <a className={`${linkClass} tabular-nums`} href={telHref(who.phone)} aria-label={t('contacts.call', { name: who.name, phone: who.phone })}>
                <Phone size={16} className="shrink-0" aria-hidden="true" /> {who.phone}
              </a>
            )}
          </div>
        )}
        {(a.location || away) && (
          <p className="mt-0.5 flex items-start gap-1.5 text-base text-muted">
            <MapPin size={16} className="mt-1 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              {a.location}
              {away && <span className="text-sm whitespace-nowrap">{a.location ? ` · ${away}` : away}</span>}
            </span>
          </p>
        )}
        {a.notes && <p className="mt-1 text-base whitespace-pre-line text-muted">{a.notes}</p>}
        {a.calendarLink && (
          <a className={linkClass} href={a.calendarLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" /> {t('calendar.openInCalendar')}
          </a>
        )}
      </div>
      {a.private && <PrivateMark />}
      {/* Stacked on a phone, so the appointment itself keeps the width. */}
      <div className="flex shrink-0 flex-col sm:flex-row">
        {entry && <AddToCalendar entry={entry} compact />}
        {onEdit && (
          <button type="button" className={iconButton} onClick={onEdit} aria-label={t('appointments.editName', { name: a.title })}>
            <Pencil size={18} />
          </button>
        )}
      </div>
    </li>
  );
}
