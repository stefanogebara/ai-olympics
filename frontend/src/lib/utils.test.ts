import { describe, it, expect } from 'vitest';
import { cn, formatDuration, formatScore, getAgentColor, truncate, generateAgentAvatar } from './utils';

describe('formatDuration', () => {
  it('formats zero', () => {
    expect(formatDuration(0)).toBe('00:00.00');
  });

  it('formats seconds and centiseconds', () => {
    expect(formatDuration(1234)).toBe('00:01.23'); // 1s + 23 centiseconds
  });

  it('rolls seconds into minutes', () => {
    expect(formatDuration(65_000)).toBe('01:05.00');
  });

  it('does not cap minutes', () => {
    expect(formatDuration(3_661_000)).toBe('61:01.00'); // 61m 01s
  });
});

describe('formatScore', () => {
  it('leaves small numbers ungrouped', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(42)).toBe('42');
  });

  it('group-separates large numbers (locale-agnostic digits)', () => {
    // Assert the digits are present in order regardless of the grouping symbol.
    expect(formatScore(1_234_567)).toMatch(/1.?234.?567/);
  });
});

describe('getAgentColor', () => {
  it('maps known providers to their brand color', () => {
    expect(getAgentColor('claude')).toBe('#D97706');
    expect(getAgentColor('gemini')).toBe('#4285F4');
  });

  it('falls back to neutral gray for unknown ids', () => {
    expect(getAgentColor('totally-unknown')).toBe('#6B7280');
  });
});

describe('truncate', () => {
  it('leaves text at or under the limit untouched', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('exact', 5)).toBe('exact');
  });

  it('cuts and appends an ellipsis past the limit', () => {
    expect(truncate('hello world', 8)).toBe('hello...'); // slice(0,5) + '...'
  });
});

describe('generateAgentAvatar', () => {
  it('returns an inline SVG data URI', () => {
    const uri = generateAgentAvatar('agent-1', 'Claude');
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('is deterministic for the same id + name', () => {
    expect(generateAgentAvatar('agent-1', 'Claude')).toBe(generateAgentAvatar('agent-1', 'Claude'));
  });

  it('differs for different ids (unique per agent)', () => {
    expect(generateAgentAvatar('agent-1', 'Claude')).not.toBe(generateAgentAvatar('agent-2', 'Claude'));
  });

  it('renders the name initial', () => {
    // '>N<' survives URI-encoding as 'N' (alphanumerics are not escaped).
    expect(generateAgentAvatar('x', 'Nova')).toContain('N');
  });
});

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('lets a later Tailwind utility win over an earlier conflicting one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});
