import { describe, expect, test } from 'bun:test';
import type { Contraction } from './model';
import { clock, gestation, parseNote, providerContact, running, sessions, summarize } from './contractions';

const MIN = 60_000;
const NOW = 1_900_000_000_000;
let n = 0;
const c = (minAgo: number, seconds: number | null): Contraction => {
  const start = NOW - minAgo * MIN;
  return { id: `c${n++}`, start, ...(seconds == null ? {} : { end: start + seconds * 1000 }), by: 'a@example.com', createdAt: start };
};
/** Contractions every `gap` minutes for `span` minutes up to now, each `secs` long. */
const steady = (gap: number, span: number, secs: number) => {
  const out: Contraction[] = [];
  for (let m = span; m >= 0; m -= gap) out.push(c(m, secs));
  return out;
};

describe('summarize', () => {
  test('nothing in the last hour', () => {
    expect(summarize([c(90, 60)], NOW).status).toBe('none');
    expect(summarize([], NOW)).toMatchObject({ count: 0, status: 'none', avgInterval: null });
  });

  test('two contractions are too few to say', () => {
    expect(summarize([c(10, 60), c(5, 60)], NOW).status).toBe('few');
  });

  test('averages: count, duration, start-to-start interval', () => {
    const s = summarize([c(20, 40), c(14, 50), c(8, 60)], NOW);
    expect(s.count).toBe(3);
    expect(s.avgDuration).toBe(50_000);
    expect(s.avgInterval).toBe(6 * MIN);
  });

  test('5-1-1 held for the hour matches', () => {
    const s = summarize(steady(5, 58, 62), NOW);
    expect(s.status).toBe('match');
  });

  test('close and long but only for 20 minutes is still building', () => {
    expect(summarize(steady(5, 20, 62), NOW).status).toBe('building');
  });

  test('short or far apart is irregular', () => {
    expect(summarize(steady(5, 58, 30), NOW).status).toBe('irregular');
    expect(summarize(steady(10, 58, 70), NOW).status).toBe('irregular');
  });

  test('the running contraction counts toward intervals but not duration', () => {
    const s = summarize([c(12, 60), c(6, 60), c(0.2, null)], NOW);
    expect(s.count).toBe(3);
    expect(s.avgDuration).toBe(60_000);
    expect(s.avgInterval).toBeCloseTo(5.9 * MIN, -3);
  });

  test('trend: closer together, longer, both, steady, not enough', () => {
    const closer = [c(50, 50), c(40, 50), c(31, 50), c(23, 50), c(16, 50), c(10, 50), c(5, 50)];
    expect(summarize(closer, NOW).trend).toBe('closer');
    const both = [c(50, 40), c(40, 40), c(31, 45), c(23, 55), c(16, 65), c(10, 70), c(5, 75)];
    expect(summarize(both, NOW).trend).toBe('closerLonger');
    expect(summarize(steady(5, 40, 50), NOW).trend).toBe('steady');
    expect(summarize([c(10, 60), c(5, 60)], NOW).trend).toBe('unknown');
  });
});

describe('sessions', () => {
  test('split where the quiet exceeds three hours, newest first', () => {
    const list = [c(600, 60), c(595, 60), c(30, 60), c(25, 60)];
    const s = sessions(list);
    expect(s).toHaveLength(2);
    expect(s[0].items).toHaveLength(2);
    expect(s[0].items[0].start).toBeLessThan(s[0].items[1].start);
    expect(s[1].items[0].start).toBe(list[0].start);
  });

  test('a gap of exactly three hours stays one session', () => {
    expect(sessions([c(300, 60), c(120, 60)])).toHaveLength(1);
  });
});

test('running finds the newest contraction without an end', () => {
  const a = c(5, null);
  expect(running([c(10, 60), a])).toBe(a);
  expect(running([c(10, 60)])).toBeUndefined();
});

test('clock', () => {
  expect(clock(65_000)).toBe('1:05');
  expect(clock(750_000)).toBe('12:30');
  expect(clock(-5)).toBe('0:00');
});

describe('providerContact', () => {
  const contact = (name: string, role: string, phone?: string) => ({ id: name, name, role, phone, apps: ['baby'], createdAt: 1, by: 'a@example.com' });
  test('prefers an OB or midwife with a phone, then a hospital', () => {
    expect(providerContact([contact('Hosp', 'Hospital', '555'), contact('Mid', 'OB / midwife', '556')])?.name).toBe('Mid');
    expect(providerContact([contact('Hosp', 'Hospital', '555'), contact('Mid', 'OB / midwife')])?.name).toBe('Hosp');
    expect(providerContact([contact('Ped', 'Pediatrician', '555')])).toBeUndefined();
  });
});

describe('before 37 weeks and the household’s note', () => {
  const pre = { preterm: true };
  test('four in the hour: call; fewer: keep timing; none: nothing', () => {
    expect(summarize([c(40, 50), c(30, 50), c(20, 50), c(10, 50)], NOW, pre).status).toBe('preCall');
    expect(summarize([c(30, 50), c(10, 50)], NOW, pre).status).toBe('preKeep');
    expect(summarize([], NOW, pre).status).toBe('none');
  });
  test('never leads with 5-1-1 before 37 weeks', () => {
    expect(summarize(steady(5, 58, 62), NOW, pre).status).toBe('preCall');
  });
  test('the note’s count wins, at term and before', () => {
    const six = [50, 40, 30, 20, 10, 2].map((m) => c(m, 40));
    expect(summarize(six, NOW, { noteCount: 6 }).status).toBe('call');
    expect(summarize(six.slice(1), NOW, { noteCount: 6, preterm: true }).status).toBe('preCall');
  });
  test('the note’s spacing', () => {
    expect(summarize([c(20, 40), c(14, 40), c(8, 40)], NOW, { noteMinutes: 7 }).status).toBe('call');
    expect(summarize([c(30, 40), c(15, 40), c(0.5, 40)], NOW, { noteMinutes: 7 }).status).not.toBe('call');
  });
});

test('parseNote', () => {
  expect(parseNote('Call if 6 in an hour')).toEqual({ noteCount: 6 });
  expect(parseNote('call L&D with 4 contractions per hour')).toEqual({ noteCount: 4 });
  expect(parseNote('Call when 5 minutes apart')).toEqual({ noteMinutes: 5 });
  expect(parseNote('every 7 min and 5 in an hour')).toEqual({ noteCount: 5, noteMinutes: 7 });
  expect(parseNote('call for anything')).toEqual({});
  expect(parseNote(undefined)).toEqual({});
});

test('gestation: 35 weeks 1 day is 118 days to the due date', () => {
  expect(gestation(280 - (35 * 7 + 1))).toEqual({ weeks: 35, days: 1 });
  expect(gestation(-30)).toBeNull();
});

test('providerContact prefers labor and delivery over the OB', () => {
  const ct = (name: string, role: string) => ({ id: name, name, role, phone: '555', apps: ['baby'], createdAt: 1, by: 'a@example.com' });
  expect(providerContact([ct('Mid', 'OB / midwife'), ct('Example OB — Labor & Delivery', 'Labor & delivery')])?.name).toContain('Labor');
});
