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
  | 'match';

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
export function summarize(list: Contraction[], now: number): Summary {
  const w = list.filter((c) => c.start >= now - WINDOW && c.start <= now).sort(byStart);
  const durations = w.filter((c) => !isRunning(c)).map((c) => durationOf(c, now));
  const intervals = w.slice(1).map((c, i) => c.start - w[i].start);
  const avgDuration = mean(durations);
  const avgInterval = mean(intervals);
  const base = { count: w.length, avgDuration, avgInterval };
  if (w.length === 0) return { ...base, trend: 'unknown', status: 'none' };
  const trend = trendOf(durations, intervals);
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

/** The household contact to call first: an OB or midwife, else a hospital, that has a phone number. */
export function providerContact(contacts: Contact[]): Contact | undefined {
  const withPhone = contacts.filter((c) => c.phone?.trim());
  for (const role of ['midwife', 'hospital'] as const) {
    const hit = withPhone.find((c) => knownRole(c.role) === role);
    if (hit) return hit;
  }
  return undefined;
}
