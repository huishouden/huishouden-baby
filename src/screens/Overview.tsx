import { Baby, CalendarPlus, Timer, ChevronRight, MapPin, Pencil } from 'lucide-react';
import type { Appointment } from '../lib/model';
import { groupChecklist, isOpen } from '../lib/checklist';
import { formatDateLong, formatDayLong, formatTime, parseYmd, relativeDay } from '@huishouden/pwa-kit/time';
import { countdown } from '../lib/time';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { useHome } from '@huishouden/pwa-kit/react/home';
import { appointmentFromHome } from '../lib/contacts';
import type { BabyStore } from '../data/types';
import { CompleteButton, CompletionList, CompletionRow, cardClass, ghostButton, iconButton, overline, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { RoleNote } from '@huishouden/pwa-kit/react/roles';
import { AddToCalendar } from '@huishouden/pwa-kit/react/calendar';
import { dueDateEntry } from '../lib/agenda';
import { running } from '../lib/contractions';
import { useT } from '../i18n';

interface Props {
  store: BabyStore;
  /** Left out for helpers and kids, who see who can instead. */
  onSetDueDate?: () => void;
  onBabyIsHere?: () => void;
  onAddAppointment: () => void;
  onEditAppointment: (a: Appointment) => void;
  onOpen: (tab: 'appointments' | 'checklists' | 'contractions') => void;
  /** Show the contraction timer entry (not for kids). */
  contractions?: boolean;
  notify: (message: string, undo?: () => void) => void;
}

/** Before the birth: the countdown, the next appointment, and how far each checklist has come. */
export function Overview({ store, onSetDueDate, onBabyIsHere, onAddAppointment, onEditAppointment, onOpen, notify, contractions }: Props) {
  const t = useT();
  const { now } = useClock();
  const { profile, appointments, checklists } = store.data;
  const due = profile?.dueDate ? countdown(profile.dueDate, now) : null;
  const upcoming = appointments.filter((a) => a.at >= now - 3_600_000).sort((a, b) => a.at - b.at);
  const [next, ...later] = upcoming;
  const home = useHome();
  const nextAway = next ? appointmentFromHome(next.location, store.data.contacts.find((c) => c.id === next.contactId), { home }) : undefined;
  const groups = groupChecklist(checklists);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-h-0 flex-col gap-6">
        {contractions && (
          <section aria-label={t('contractions.title')}>
            <button
              type="button"
              onClick={() => onOpen('contractions')}
              className="flex min-h-20 w-full items-center gap-4 rounded-2xl bg-primary px-6 py-4 text-left text-on-primary transition-colors duration-150 hover:bg-primary-hover"
            >
              <Timer size={36} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-2xl font-semibold">{t('contractions.title')}</span>
                <span className="block text-base opacity-90">{running(store.data.contractions) ? t('contractions.runningNow') : t('contractions.overviewHint')}</span>
              </span>
              <ChevronRight size={24} aria-hidden="true" className="ml-auto shrink-0" />
            </button>
          </section>
        )}
        <section className={`${cardClass} px-8 py-6`} aria-label={t('overview.countdown')}>
          <div className="flex items-start justify-between gap-4">
            <p className={overline}>{profile?.name ? t('overview.waitingFor', { name: profile.name }) : t('overview.countdown')}</p>
            {due && onSetDueDate && (
              <button type="button" className={iconButton} aria-label={t('overview.editDue')} onClick={onSetDueDate}>
                <Pencil size={18} />
              </button>
            )}
          </div>
          {due ? (
            <>
              <p className="mt-1 text-ink">
                <span className="text-6xl font-semibold tracking-tight tabular-nums">{due.headline}</span>
                {due.suffix && <span className="ml-3 text-3xl font-medium text-muted">{due.suffix}</span>}
              </p>
              <p className="mt-3 text-xl text-muted">
                {due.week
                  ? t('overview.dueOnWeek', { date: formatDateLong(parseYmd(profile!.dueDate)!), week: due.week })
                  : t('overview.dueOn', { date: formatDateLong(parseYmd(profile!.dueDate)!) })}
              </p>
              {dueDateEntry(profile) && <AddToCalendar entry={dueDateEntry(profile)!} className="mt-3" />}
            </>
          ) : (
            <>
              <p className="mt-2 text-3xl font-semibold text-ink">{t('overview.whenDue')}</p>
              <p className="mt-2 text-lg text-muted">{t('overview.addDueHint')}</p>
            </>
          )}
          {!onSetDueDate && <RoleNote action="change-settings" className="mt-4" />}
          {onSetDueDate && onBabyIsHere && (
          <div className="mt-5 flex flex-wrap gap-3">
            {!due && (
              <button type="button" className={primaryButton} onClick={onSetDueDate}>
                {t('overview.addDue')}
              </button>
            )}
            <button type="button" className={due ? primaryButton : ghostButton} onClick={onBabyIsHere}>
              <Baby size={20} /> {t('overview.babyIsHere')}
            </button>
          </div>
          )}
        </section>

        <section className={`${cardClass} flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5`} aria-label={t('overview.nextAppointment')}>
          <div className="flex items-center justify-between gap-4">
            <p className={overline}>{t('overview.nextAppointment')}</p>
            <div className="flex gap-1">
              <button type="button" className={ghostButton} onClick={onAddAppointment}>
                <CalendarPlus size={18} /> {t('common.add')}
              </button>
              <button type="button" className={ghostButton} onClick={() => onOpen('appointments')}>
                {t('overview.all')} <ChevronRight size={18} />
              </button>
            </div>
          </div>
          {next ? (
            <>
              <button type="button" className="mt-1 -mx-2 rounded-xl px-2 py-1 text-left hover:bg-sunken" onClick={() => onEditAppointment(next)}>
                <p className="text-3xl font-semibold text-ink">{next.title}</p>
                <p className="mt-1 text-xl text-ink-soft">
                  <span className="font-semibold text-link">{relativeDay(next.at, now)}</span> · {formatDayLong(next.at)}, {formatTime(next.at)}
                </p>
                {(next.location || nextAway) && (
                  <p className="mt-1 flex items-start gap-1.5 text-lg text-muted">
                    <MapPin size={18} className="mt-1 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      {next.location}
                      {nextAway && <span className="text-base whitespace-nowrap">{next.location ? ` · ${nextAway}` : nextAway}</span>}
                    </span>
                  </p>
                )}
                {next.notes && <p className="mt-1 text-base text-muted">{next.notes}</p>}
              </button>
              {later.length > 0 && (
                <ul className="mt-4 border-t border-line">
                  {later.slice(0, 2).map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => onEditAppointment(a)} className="flex min-h-12 w-full items-center gap-4 border-b border-line py-2 text-left hover:bg-sunken">
                        <span className="w-28 shrink-0 text-base font-medium text-muted">{relativeDay(a.at, now)}</span>
                        <span className="min-w-0 flex-1 truncate text-base text-ink">{a.title}</span>
                        <span className="text-sm text-muted tabular-nums">{formatTime(a.at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-2 text-lg text-muted">{t('appointments.none')}</p>
          )}
        </section>
      </div>

      <section className={`${cardClass} flex min-h-0 flex-col p-6`} aria-label={t('checklists.title')}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink">{t('checklists.title')}</h2>
          <button type="button" className={ghostButton} onClick={() => onOpen('checklists')}>
            {t('overview.open')} <ChevronRight size={18} />
          </button>
        </div>
        {groups.length === 0 && <p className="text-base text-muted">{t('overview.noChecklists')}</p>}
        <CompletionList
          items={groups}
          isDone={(g) => !g.items.some(isOpen)}
          label={t('checklists.title')}
          allDone={t('overview.allChecklistsDone')}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {(g) => {
            const nextItem = g.items.find(isOpen);
            const progress = g.skipped > 0 ? t('checklists.progressSkipped', { done: g.done, total: g.total, skipped: g.skipped }) : t('checklists.progress', { done: g.done, total: g.total });
            if (!nextItem) return <CompletionRow key={g.list} name={g.list} title={g.list} done status={progress} onDone={() => {}} />;
            const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
            const markDone = () => {
              store.actions.setChecklistDone(nextItem.id, true);
              notify(t('toast.doneItem', { item: nextItem.text }), () => store.actions.setChecklistDone(nextItem.id, false));
            };
            return (
              <li key={g.list} data-completion="open" className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-lg font-semibold text-ink">{g.list}</p>
                  <p className="text-base text-muted tabular-nums">
                    {t('overview.progress', { done: g.done, total: g.total })}
                  </p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('overview.progressLabel', { list: g.list })}>
                  <div className="h-2 rounded-full bg-forest-600 dark:bg-forest-300" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <p className="min-w-0 flex-1 text-base text-ink [overflow-wrap:anywhere]">
                    <span className="sr-only">{t('overview.next')} </span>
                    {nextItem.text}
                  </p>
                  <CompleteButton done={false} name={nextItem.text} onDone={markDone} />
                </div>
              </li>
            );
          }}
        </CompletionList>
      </section>
    </div>
  );
}
