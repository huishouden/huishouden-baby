import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { Contraction } from './model';
import { knownRole } from './contacts';

// The contraction timer's maths. Pure: `now` is passed in. Nothing here diagnoses; the status is
// only whether the last hour matches the common 5-1-1 guide.

const MIN = 60_000;
/** Contractions further apart than this belong to different sessions. */
export const SESSION_GAP = 3 * 60 * MIN;
/** The summary and the 5-1-1 check look at this much time. */
export const WINDOW = 60 * MIN;
/** 5-1-1 with a little slack: about 5 minutes apart or closer, about a minute long. */
export const MAX_INTERVAL = 5.5 * MIN;
export const MIN_DURATION = 55_000;
/** The pattern must have held for about the whole hour, and have at least this many contractions. */
export const MIN_SPAN = 50 * MIN;
export const MIN_COUNT = 8;

export const isRunning = (c: Contraction): boolean => c.end == null;
export const durationOf = (c: Contraction, now: number): number => Math.max(0, (c.end ?? now) - c.start);

const byStart = (a: Contraction, b: Contraction) => a.start - b.start;

/** The contraction in progress, if any (the newest without an end). */
export function running(list: Contraction[]): Contraction | undefined {
  return list.filter(isRunning).sort((a, b) => b.start - a.start)[0];
}

/** Start-to-start gap to the contraction before it, or null for the first of a session. */
export function intervalBefore(sorted: Contraction[], i: number): number | null {
  return i > 0 ? sorted[i].start - sorted[i - 1].start : null;
}

export interface Session {
  /** Oldest first. */
  items: Contraction[];
  start: number;
}

/** Sessions, newest first, split where the quiet between contractions exceeds three hours. */
export function sessions(list: Contraction[]): Session[] {
  const sorted = [...list].sort(byStart);
  const out: Session[] = [];
  let last = -Infinity;
  for (const c of sorted) {
    if (c.start - last > SESSION_GAP) out.push({ items: [], start: c.start });
    out[out.length - 1].items.push(c);
    last = c.end ?? c.start;
  }
  return out.reverse();
}

export type Trend = 'closer' | 'longer' | 'closerLonger' | 'steady' | 'unknown';

export type Status =
  /** Nothing timed in the last hour. */
  | 'none'
  /** Fewer than three contractions in the last hour: too few to say. */
  | 'few'
  | 'irregular'
  /** Close and long, but not yet held for the hour. */
  | 'building'
  | 'match'
  /** The household's own instructions from L&D are met (the note). */
  | 'call'
  /** Before 37 weeks: four or more in the hour. */
  | 'preCall'
  /** Before 37 weeks, fewer than that. */
  | 'preKeep';

/** What changes the status: how far along the pregnancy is, and the household's own threshold. */
export interface Rules {
  /** Before 37 completed weeks (needs the due date). 5-1-1 is for term; earlier, any regular pattern means call. */
  preterm?: boolean;
  /** From the note: call at this many contractions in an hour. */
  noteCount?: number;
  /** From the note: call when they are this many minutes apart or closer. */
  noteMinutes?: number;
}

/** Before 37 weeks this many contractions in the hour reads as regular. */
export const PRETERM_COUNT = 4;

/** Reads "call if 6 in an hour" and "call when 5 minutes apart" out of the household's note. */
export function parseNote(note: string | undefined): Pick<Rules, 'noteCount' | 'noteMinutes'> {
  if (!note) return {};
  const out: Pick<Rules, 'noteCount' | 'noteMinutes'> = {};
  const count = /(\d{1,2})\s*(?:contractions?\s*|weeën\s*|contracciones\s*)?(?:in|per|\/|en|binnen|por)\s*(?:an?\s*|1\s*|one\s*|een\s*|una\s*|1\s*)?(?:hour|hr|h|uur|hora)\b/i.exec(note);
  if (count) out.noteCount = Number(count[1]);
  const apart = /(\d{1,2})\s*(?:min(?:utes?|uten)?|m)\s*(?:apart|or less apart|auseinander|uit elkaar|de separación)|every\s*(\d{1,2})\s*min/i.exec(note);
  if (apart) out.noteMinutes = Number(apart[1] ?? apart[2]);
  return out;
}

/** Completed weeks and days of pregnancy from the due date's remaining days (40 weeks = 280 days). */
export function gestation(daysToDue: number): { weeks: number; days: number } | null {
  const d = 280 - daysToDue;
  return d >= 0 && d <= 300 ? { weeks: Math.floor(d / 7), days: d % 7 } : null;
}

export interface Summary {
  count: number;
  /** Milliseconds; null when no contraction in the window has ended / has a gap. */
  avgDuration: number | null;
  avgInterval: number | null;
  trend: Trend;
  status: Status;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Relative change below this reads as steady. */
const CHANGE = 0.15;

/** The last hour: count, averages, trend and the 5-1-1 status. */
export function summarize(list: Contraction[], now: number, rules: Rules = {}): Summary {
  const w = list.filter((c) => c.start >= now - WINDOW && c.start <= now).sort(byStart);
  const durations = w.filter((c) => !isRunning(c)).map((c) => durationOf(c, now));
  const intervals = w.slice(1).map((c, i) => c.start - w[i].start);
  const avgDuration = mean(durations);
  const avgInterval = mean(intervals);
  const base = { count: w.length, avgDuration, avgInterval };
  if (w.length === 0) return { ...base, trend: 'unknown', status: 'none' };
  const trend = trendOf(durations, intervals);
  // The household's own instructions from L&D come before any general guide.
  const noteMet = (rules.noteCount != null && w.length >= rules.noteCount) || (rules.noteMinutes != null && w.length >= 3 && avgInterval != null && avgInterval <= rules.noteMinutes * MIN);
  if (noteMet) return { ...base, trend, status: 'call' };
  if (rules.preterm) return { ...base, trend, status: w.length >= PRETERM_COUNT ? 'preCall' : 'preKeep' };
  if (w.length < 3 || avgInterval == null || avgDuration == null) return { ...base, trend, status: 'few' };
  const closeAndLong = avgInterval <= MAX_INTERVAL && avgDuration >= MIN_DURATION;
  if (!closeAndLong) return { ...base, trend, status: 'irregular' };
  const held = w.length >= MIN_COUNT && now - w[0].start >= MIN_SPAN;
  return { ...base, trend, status: held ? 'match' : 'building' };
}

/** Compares the first half of the window with the second; needs at least four of each. */
function trendOf(durations: number[], intervals: number[]): Trend {
  const change = (xs: number[]): number | null => {
    if (xs.length < 4) return null;
    const half = Math.floor(xs.length / 2);
    const a = mean(xs.slice(0, half))!;
    const b = mean(xs.slice(xs.length - half))!;
    return a === 0 ? null : (b - a) / a;
  };
  const ci = change(intervals);
  const cd = change(durations);
  if (ci == null && cd == null) return 'unknown';
  const closer = ci != null && ci <= -CHANGE;
  const longer = cd != null && cd >= CHANGE;
  if (closer && longer) return 'closerLonger';
  if (closer) return 'closer';
  if (longer) return 'longer';
  return 'steady';
}

/** "1:05" for 65 seconds, "12:30" for 12 minutes 30 seconds; hours roll into minutes ("75:00"). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const LABOR = /\b(labou?r\s*(&|and)\s*delivery|l\s*&\s*d|l&d|ob\s*triage|triage|kraamafdeling|bevalling|sala de partos|parto)\b/iu;

/** The household contact to call first: labor and delivery or OB triage, else an OB or midwife, else a hospital, that has a phone number. */
export function providerContact(contacts: Contact[]): Contact | undefined {
  const withPhone = contacts.filter((c) => c.phone?.trim());
  const labor = withPhone.find((c) => LABOR.test(`${c.role ?? ''} ${c.name}`));
  if (labor) return labor;
  for (const role of ['midwife', 'hospital'] as const) {
    const hit = withPhone.find((c) => knownRole(c.role) === role);
    if (hit) return hit;
  }
  return undefined;
}
