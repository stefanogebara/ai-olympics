import { describe, it, expect } from 'vitest';
import {
  getAllGauntletTasks,
  getTaskById,
  pickWeeklyTasks,
  computeTimeMultiplier,
  computeTaskScore,
} from './gauntlet-tasks.js';

describe('getAllGauntletTasks', () => {
  it('returns exactly 20 tasks', () => {
    const tasks = getAllGauntletTasks();
    expect(tasks).toHaveLength(20);
  });

  it('returns 8 web-research tasks', () => {
    const tasks = getAllGauntletTasks();
    const webTasks = tasks.filter((t) => t.category === 'web-research');
    expect(webTasks).toHaveLength(8);
  });

  it('returns 8 github-workflow tasks', () => {
    const tasks = getAllGauntletTasks();
    const ghTasks = tasks.filter((t) => t.category === 'github-workflow');
    expect(ghTasks).toHaveLength(8);
  });

  it('returns 4 wildcard tasks', () => {
    const tasks = getAllGauntletTasks();
    const wildTasks = tasks.filter((t) => t.category === 'wildcard');
    expect(wildTasks).toHaveLength(4);
  });
});

describe('getTaskById', () => {
  it('returns the correct task for web-001', () => {
    const task = getTaskById('web-001');
    expect(task).toBeDefined();
    expect(task?.id).toBe('web-001');
    expect(task?.category).toBe('web-research');
  });

  it('returns undefined for a non-existent id', () => {
    const task = getTaskById('nonexistent-999');
    expect(task).toBeUndefined();
  });
});

describe('pickWeeklyTasks', () => {
  it('returns exactly 5 tasks', () => {
    const tasks = pickWeeklyTasks(1, 2026);
    expect(tasks).toHaveLength(5);
  });

  it('returns 2 web-research tasks', () => {
    const tasks = pickWeeklyTasks(1, 2026);
    const webTasks = tasks.filter((t) => t.category === 'web-research');
    expect(webTasks).toHaveLength(2);
  });

  it('returns 2 github-workflow tasks', () => {
    const tasks = pickWeeklyTasks(1, 2026);
    const ghTasks = tasks.filter((t) => t.category === 'github-workflow');
    expect(ghTasks).toHaveLength(2);
  });

  it('returns 1 wildcard task', () => {
    const tasks = pickWeeklyTasks(1, 2026);
    const wildTasks = tasks.filter((t) => t.category === 'wildcard');
    expect(wildTasks).toHaveLength(1);
  });

  it('is deterministic — same result on repeat call', () => {
    const first = pickWeeklyTasks(1, 2026);
    const second = pickWeeklyTasks(1, 2026);
    expect(first.map((t) => t.id)).toEqual(second.map((t) => t.id));
  });

  it('returns different task sets for different weeks', () => {
    const week1 = pickWeeklyTasks(1, 2026);
    const week2 = pickWeeklyTasks(2, 2026);
    const week1Ids = week1.map((t) => t.id);
    const week2Ids = week2.map((t) => t.id);
    expect(week1Ids).not.toEqual(week2Ids);
  });
});

describe('computeTimeMultiplier', () => {
  it('returns 2.0 at 10% of time limit (well within early threshold)', () => {
    expect(computeTimeMultiplier(30_000, 300_000)).toBe(2.0);
  });

  it('returns 2.0 at exactly 20% of time limit (boundary)', () => {
    expect(computeTimeMultiplier(60_000, 300_000)).toBe(2.0);
  });

  it('returns 1.0 at 100% of time limit', () => {
    expect(computeTimeMultiplier(300_000, 300_000)).toBe(1.0);
  });

  it('returns 0.5 at 200% of time limit', () => {
    expect(computeTimeMultiplier(600_000, 300_000)).toBe(0.5);
  });

  it('returns 0 beyond 200% of time limit', () => {
    expect(computeTimeMultiplier(900_000, 300_000)).toBe(0.0);
  });
});

describe('computeTaskScore', () => {
  it('returns 200 for perfect quality at early time (max score)', () => {
    expect(computeTaskScore(1.0, 60_000, 300_000)).toBe(200);
  });

  it('returns 50 for 0.5 quality at time limit', () => {
    // quality 0.5 × multiplier 1.0 × 100 = 50
    expect(computeTaskScore(0.5, 300_000, 300_000)).toBe(50);
  });

  it('returns 0 for zero quality', () => {
    expect(computeTaskScore(0.0, 60_000, 300_000)).toBe(0);
  });
});
