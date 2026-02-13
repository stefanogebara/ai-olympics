import { describe, it, expect } from 'vitest';
import { getAllTasks, getTask, getTaskById, getTasksByCategory } from './task-registry.js';

describe('task-registry', () => {
  describe('getAllTasks', () => {
    it('returns all registered tasks', () => {
      const tasks = getAllTasks();
      expect(tasks.length).toBeGreaterThanOrEqual(20);
    });

    it('returns an array', () => {
      expect(Array.isArray(getAllTasks())).toBe(true);
    });
  });

  describe('getTask / getTaskById', () => {
    it('retrieves a task by id', () => {
      const task = getTask('form-blitz');
      expect(task).toBeDefined();
      expect(task!.name).toBe('Form Blitz');
      expect(task!.category).toBe('speed');
    });

    it('getTaskById is an alias for getTask', () => {
      expect(getTaskById).toBe(getTask);
    });

    it('returns undefined for unknown task id', () => {
      expect(getTask('nonexistent-task-xyz')).toBeUndefined();
    });
  });

  describe('getTasksByCategory', () => {
    it('returns speed tasks', () => {
      const speedTasks = getTasksByCategory('speed');
      expect(speedTasks.length).toBeGreaterThanOrEqual(3);
      expect(speedTasks.every(t => t.category === 'speed')).toBe(true);
    });

    it('returns intelligence tasks', () => {
      const intelligenceTasks = getTasksByCategory('intelligence');
      expect(intelligenceTasks.length).toBeGreaterThanOrEqual(5);
      expect(intelligenceTasks.every(t => t.category === 'intelligence')).toBe(true);
    });

    it('returns creative tasks', () => {
      const creativeTasks = getTasksByCategory('creative');
      expect(creativeTasks.length).toBeGreaterThanOrEqual(3);
      expect(creativeTasks.every(t => t.category === 'creative')).toBe(true);
    });

    it('returns empty array for unknown category', () => {
      expect(getTasksByCategory('nonexistent' as any)).toHaveLength(0);
    });
  });

  describe('task definitions', () => {
    it('all tasks have required fields', () => {
      const tasks = getAllTasks();
      for (const task of tasks) {
        expect(task.id).toBeTruthy();
        expect(task.name).toBeTruthy();
        expect(task.description).toBeTruthy();
        expect(task.category).toBeTruthy();
        expect(task.difficulty).toBeTruthy();
        expect(task.timeLimit).toBeGreaterThan(0);
        expect(task.maxAgents).toBeGreaterThan(0);
        expect(task.scoringMethod).toBeTruthy();
        expect(task.maxScore).toBeGreaterThan(0);
        expect(task.systemPrompt).toBeTruthy();
        expect(task.taskPrompt).toBeTruthy();
      }
    });

    it('all task ids are unique', () => {
      const tasks = getAllTasks();
      const ids = tasks.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('specific well-known tasks exist', () => {
      const expectedIds = [
        'form-blitz',
        'research-relay',
        'data-detective',
        'prediction-market',
        'trivia',
        'math',
        'chess',
        'design-challenge',
        'writing-challenge',
        'pitch-deck',
        'code-debug',
        'code-golf',
        'api-integration',
      ];
      for (const id of expectedIds) {
        expect(getTask(id)).toBeDefined();
      }
    });

    it('tasks have valid difficulty values', () => {
      const tasks = getAllTasks();
      const validDifficulties = ['easy', 'medium', 'hard'];
      for (const task of tasks) {
        expect(validDifficulties).toContain(task.difficulty);
      }
    });

    it('tasks have valid scoring methods', () => {
      const tasks = getAllTasks();
      const validMethods = ['time', 'accuracy', 'composite', 'judged'];
      for (const task of tasks) {
        expect(validMethods).toContain(task.scoringMethod);
      }
    });
  });
});
