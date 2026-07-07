import { describe, it, expect } from 'vitest';
import { eventMatchesCompetition } from './eventMatch';

describe('eventMatchesCompetition', () => {
  const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('accepts an event whose competitionId matches the scope', () => {
    expect(eventMatchesCompetition({ competitionId: A }, A)).toBe(true);
  });

  it('rejects an event from a different competition (the bleed case)', () => {
    // This is the bug the filter exists for: B's events must not render in A's view.
    expect(eventMatchesCompetition({ competitionId: B }, A)).toBe(false);
  });

  it('sees everything when the hook is unscoped (no competitionId)', () => {
    expect(eventMatchesCompetition({ competitionId: B }, undefined)).toBe(true);
    expect(eventMatchesCompetition({ competitionId: B }, '')).toBe(true);
  });

  it('allows events that carry no competitionId (timer ticks, legacy flat payloads)', () => {
    expect(eventMatchesCompetition({ elapsed: 1234 }, A)).toBe(true);
    expect(eventMatchesCompetition({}, A)).toBe(true);
    expect(eventMatchesCompetition({ competitionId: null }, A)).toBe(true);
    expect(eventMatchesCompetition({ competitionId: undefined }, A)).toBe(true);
  });

  it('is null-safe on a missing event object', () => {
    // Handlers receive network payloads; a malformed/empty event must not throw.
    expect(eventMatchesCompetition(undefined as unknown as Record<string, unknown>, A)).toBe(true);
    expect(eventMatchesCompetition(null as unknown as Record<string, unknown>, A)).toBe(true);
  });
});
