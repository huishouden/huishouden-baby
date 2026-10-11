import { useEffect, useState } from 'react';
import { Pencil, Phone, Play, Square, Trash2 } from 'lucide-react';
import { telHref } from '@huishouden/pwa-kit/places';
import { formatDayLong, formatTime } from '@huishouden/pwa-kit/time';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { cardClass, iconButton, inputClass, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import type { BabyStore } from '../data/types';
import { clock, durationOf, gestation, intervalBefore, parseNote, providerContact, running, sessions, summarize, type Status, type Trend } from '../lib/contractions';
import type { Contraction } from '../lib/model';
import { can } from '@huishouden/pwa-kit/roles';
import { RoleNote } from '@huishouden/pwa-kit/react/roles';
import { mayChange } from '../lib/roles';
import { countdown } from '../lib/time';
import { LIMITS } from '../lib/model';
import { useT } from '../i18n';

const STATUS_KEYS = {
  none: 'contractions.status.none',
  few: 'contractions.status.few',
  irregular: 'contractions.status.irregular',
  building: 'contractions.status.building',
  call: 'contractions.status.call',
  preCall: 'contractions.status.preCall',
  preKeep: 'contractions.status.preKeep',
  match: 'contractions.status.match',
} as const satisfies Record<Status, string>;

const TREND_KEYS = {
  closer: 'contractions.trend.closer',
  longer: 'contractions.trend.longer',
  closerLonger: 'contractions.trend.closerLonger',
  steady: 'contractions.trend.steady',
  unknown: 'contractions.trend.unknown',
} as const satisfies Record<Trend, string>;

interface Props {
  store: BabyStore;
  notify: (message: string, undo?: () => void) => void;
}

/** The contraction timer: one big Start / Stop button, the last hour at a glance, and the history. */
export function Contractions({ store, notify }: Props) {
  const t = useT();
  const { now: slow, read } = useClock();
  const { contractions, contacts } = store.data;
  const current = running(contractions);
  const currentId = current?.id;
  // The elapsed time of a running contraction moves every second; the shared clock only every 15.
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    if (!currentId) {
      setTick(null);
      return;
    }
    const id = setInterval(() => setTick(read()), 1000);
    return () => clearInterval(id);
  }, [currentId, read]);
  const now = Math.max(slow, tick ?? 0);

  const { profile } = store.data;
  const due = profile?.dueDate ? countdown(profile.dueDate, now) : null;
  const weeks = due ? gestation(due.days) : null;
  const preterm = weeks != null && weeks.weeks < 37;
  const note = profile?.contractionNote;
  const summary = summarize(contractions, now, { preterm, ...parseNote(note) });
  const callNow = summary.status === 'call' || summary.status === 'preCall' || summary.status === 'match';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const canEditNote = can(store.role, 'change-settings');
  const provider = providerContact(contacts);
  const history = sessions(contractions);
  const last = [...contractions].sort((a, b) => b.start - a.start).find((c) => c.id !== currentId);

  const toggle = () => {
    // Stops every open one: two phones tapping Start at once leave a stray that would never end.
    if (current) for (const c of contractions) if (c.end == null) store.actions.stopContraction(c.id);
    else store.actions.startContraction();
  };
  const remove = (c: Contraction) => {
    store.actions.deleteContraction(c.id);
    notify(t('contractions.deleted'), () => store.actions.restoreContraction(c));
  };
  const mayDelete = (c: Contraction) => mayChange(store.role, store.me, c);

  return (
    <div className="space-y-4 lg:h-full lg:overflow-y-auto">
      <p role="note" className="rounded-2xl border border-line bg-attention-tint px-4 py-3 text-base text-ink">
        {t('contractions.callNote')}
      </p>

      <section className={`${cardClass} p-4`} aria-label={t('contractions.instructions')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={overline}>{t('contractions.instructions')}</p>
            {weeks && <p className="mt-1 text-sm text-muted">{t('contractions.weeks', { weeks: weeks.weeks, days: weeks.days })}</p>}
          </div>
          {canEditNote && !editing && (
            <button type="button" className={iconButton} aria-label={t('contractions.editInstructions')} onClick={() => { setDraft(note ?? ''); setEditing(true); }}>
              <Pencil size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {editing ? (
          <form
            className="mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              store.actions.saveContractionNote(draft);
              setEditing(false);
            }}
          >
            <input className={inputClass} value={draft} maxLength={LIMITS.contractionNote} placeholder={t('contractions.instructionsPlaceholder')} aria-label={t('contractions.instructions')} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex gap-2">
              <button type="submit" className={primaryButton}>{t('common.save')}</button>
              <button type="button" className={secondaryButton} onClick={() => setEditing(false)}>{t('common.cancel')}</button>
            </div>
          </form>
        ) : (
          <p className="mt-1 text-lg text-ink [overflow-wrap:anywhere]" data-testid="instructions">{note || t('contractions.noInstructions')}</p>
        )}
      </section>

      <section className={`${cardClass} p-4 sm:p-6`} aria-label={t('contractions.title')}>
        <button
          type="button"
          onClick={toggle}
          className={`flex min-h-40 w-full flex-col items-center justify-center gap-1 rounded-2xl px-4 py-6 text-3xl font-semibold transition-colors duration-150 ${current ? 'border-2 border-attention-fill bg-attention-tint text-ink' : 'bg-primary text-on-primary hover:bg-primary-hover'}`}
        >
          <span className="flex items-center gap-3">
            {current ? <Square size={32} aria-hidden="true" /> : <Play size={32} aria-hidden="true" />}
            {current ? t('contractions.stop') : t('contractions.start')}
          </span>
          {current ? (
            <span className="text-5xl tabular-nums" data-testid="elapsed">
              {clock(durationOf(current, now))}
            </span>
          ) : last ? (
            <span className="text-lg font-medium opacity-90">{t('contractions.lastAgo', { span: clock(now - last.start) })}</span>
          ) : null}
        </button>
        {current && mayDelete(current) && (
          <button type="button" className={`${secondaryButton} mt-3 w-full`} onClick={() => remove(current)}>
            <Trash2 size={18} aria-hidden="true" /> {t('contractions.cancel')}
          </button>
        )}
      </section>

      <section className={`${cardClass} p-4 sm:p-6`} aria-label={t('contractions.lastHour')} data-testid="summary">
        <p className={overline}>{t('contractions.lastHour')}</p>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
          <Stat label={t('contractions.count')} value={String(summary.count)} />
          <Stat label={t('contractions.avgLong')} value={summary.avgDuration == null ? '–' : clock(summary.avgDuration)} />
          <Stat label={t('contractions.avgApart')} value={summary.avgInterval == null ? '–' : clock(summary.avgInterval)} />
        </dl>
        <p className="mt-3 text-base text-muted">{t(TREND_KEYS[summary.trend])}</p>
        <p className={`mt-2 text-lg font-medium text-ink ${callNow ? 'rounded-xl border-2 border-attention-fill bg-attention-tint px-3 py-2' : ''}`} data-testid="status" data-status={summary.status}>
          {t(STATUS_KEYS[summary.status])}
        </p>
        {!preterm && <p className="mt-1 text-sm text-muted">{t('contractions.guide')}</p>}
        {provider?.phone && (
          <a className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-lg font-semibold text-link" href={telHref(provider.phone)}>
            <Phone size={20} aria-hidden="true" />
            <span className="min-w-0 text-left">
              <span className="block [overflow-wrap:anywhere]">{t('contractions.call', { name: provider.name })}</span>
              <span className="block text-base font-medium tabular-nums">{provider.phone}</span>
            </span>
          </a>
        )}
      </section>

      {!can(store.role, 'edit-others') && contractions.some((c) => c.by !== store.me) && <RoleNote action="edit-others" />}

      <section className="space-y-4" aria-label={t('contractions.history')}>
        {history.length === 0 && <p className="text-lg text-muted">{t('contractions.none')}</p>}
        {history.map((s, si) => {
          const items = [...s.items].reverse();
          return (
            <div key={s.start} className={`${cardClass} p-4 sm:p-6`}>
              <p className={overline}>
                {si === 0 ? t('contractions.latestSession') : t('contractions.session')} · {formatDayLong(s.start)}, {formatTime(s.start)} · {t('contractions.sessionCount', { n: s.items.length })}
              </p>
              <ul className="mt-2">
                {items.map((c, ii) => {
                  const iv = intervalBefore(s.items, s.items.length - 1 - ii);
                  return (
                    <li key={c.id} className="flex min-h-14 items-center gap-3 border-b border-line py-2 last:border-b-0">
                      <span className="w-16 shrink-0 text-base text-muted tabular-nums">{formatTime(c.start)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-semibold text-ink tabular-nums">
                          {c.end == null ? t('contractions.going', { span: clock(durationOf(c, now)) }) : t('contractions.long', { span: clock(durationOf(c, now)) })}
                        </span>
                        <span className="block text-sm text-muted tabular-nums">{iv == null ? t('contractions.first') : t('contractions.apart', { span: clock(iv) })}</span>
                      </span>
                      {mayDelete(c) && (
                        <button type="button" className={iconButton} aria-label={t('contractions.delete', { time: formatTime(c.start) })} onClick={() => remove(c)}>
                          <Trash2 size={20} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-3xl font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
