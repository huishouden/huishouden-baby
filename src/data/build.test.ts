import { describe, expect, test } from 'bun:test';
import { appointmentDoc } from './build';

describe('appointment documents', () => {
  test('always carry the private flag, which helpers and kids need to see them', () => {
    expect(appointmentDoc({ title: 'Checkup', at: 1 }, 'a@example.com', 1).private).toBe(false);
    expect(appointmentDoc({ title: 'Checkup', at: 1, private: true }, 'a@example.com', 1).private).toBe(true);
  });
  test('keep who added them', () => {
    expect(appointmentDoc({ title: 'Checkup', at: 1 }, 'h@example.com', 1).by).toBe('h@example.com');
  });
});

describe('an appointment document and its reminder switch', () => {
  test('is written only when reminders are off', () => {
    expect(appointmentDoc({ title: 'Check', at: 5, remind: false }, 'a@example.com', 1).remind).toBe(false);
    expect('remind' in appointmentDoc({ title: 'Check', at: 5, remind: true }, 'a@example.com', 1)).toBe(false);
    expect('remind' in appointmentDoc({ title: 'Check', at: 5 }, 'a@example.com', 1)).toBe(false);
  });
});
