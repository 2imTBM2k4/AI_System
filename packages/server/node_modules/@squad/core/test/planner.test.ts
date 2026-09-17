import { describe, expect, it } from 'vitest';
import {
  PlanError,
  detectCycle,
  extractJson,
  fileConflicts,
  parsePlanOutput,
  topoSort,
} from '../src/planner.js';
import type { Task } from '../src/types.js';

const task = (overrides: Partial<Task> & Pick<Task, 'id'>): Task => ({
  id: overrides.id,
  title: overrides.title ?? overrides.id,
  role: overrides.role ?? 'backend',
  files: overrides.files ?? [],
  dependsOn: overrides.dependsOn ?? [],
  prompt: overrides.prompt ?? 'Implement the task.',
  branch: overrides.branch ?? `squad/${overrides.id}`,
  ...(overrides.verify === undefined ? {} : { verify: overrides.verify }),
});

const plannerOutput = (tasks: unknown[]) => JSON.stringify({ tasks });

const expectPlanInvalid = (action: () => unknown): void => {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PlanError);
    expect(error).toMatchObject({ code: 'PLAN_INVALID' });
    return;
  }

  throw new Error('Expected PLAN_INVALID.');
};

describe('planner JSON parsing', () => {
  it('extracts raw JSON and fenced JSON surrounded by prose', () => {
    const raw = '{"tasks":[]}';
    const fenced = 'Plan follows:\n```json\n{"tasks":[]}\n```\nEnd.';
    expect(extractJson(raw)).toBe(raw);
    expect(extractJson(fenced)).toBe(raw);
  });

  it('throws PLAN_INVALID when planner output has no JSON object', () => {
    expectPlanInvalid(() => extractJson('No plan was generated.'));
  });

  it('accepts one to six tasks and rejects empty or oversized plans', () => {
    const oneTask = plannerOutput([
      { id: 'one', title: 'One', role: 'backend', prompt: 'Do one.' },
    ]);
    expect(parsePlanOutput(oneTask, 'Goal').tasks).toHaveLength(1);
    expect(
      parsePlanOutput(
        plannerOutput(
          Array.from({ length: 6 }, (_, index) => ({
            id: `valid-${index}`,
            title: `Valid ${index}`,
            role: 'backend',
            prompt: 'Do it.',
          })),
        ),
        'Goal',
      ).tasks,
    ).toHaveLength(6);

    expectPlanInvalid(() => parsePlanOutput(plannerOutput([]), 'Goal'));
    expectPlanInvalid(() =>
      parsePlanOutput(
        plannerOutput(
          Array.from({ length: 7 }, (_, index) => ({
            id: `t${index}`,
            title: `Task ${index}`,
            role: 'backend',
            prompt: 'Do it.',
          })),
        ),
        'Goal',
      ),
    );
  });
});

describe('planner dependency validation', () => {
  it('rejects a cycle and accepts a valid dependency chain', () => {
    expectPlanInvalid(() =>
      detectCycle([task({ id: 'a', dependsOn: ['b'] }), task({ id: 'b', dependsOn: ['a'] })]),
    );

    expect(() =>
      detectCycle([
        task({ id: 'a' }),
        task({ id: 'b', dependsOn: ['a'] }),
        task({ id: 'c', dependsOn: ['b'] }),
      ]),
    ).not.toThrow();
  });

  it('rejects duplicate ids and missing dependency ids', () => {
    expectPlanInvalid(() => detectCycle([task({ id: 'a' }), task({ id: 'a' })]));
    expectPlanInvalid(() => detectCycle([task({ id: 'a', dependsOn: ['missing'] })]));
  });

  it('generates a branch from a missing branch and title slug', () => {
    const plan = parsePlanOutput(
      plannerOutput([
        { id: 'api', title: 'Create User API', role: 'backend', prompt: 'Create it.' },
      ]),
      'Goal',
    );
    expect(plan.tasks[0].branch).toBe('squad/api-create-user-api');
  });
});

describe('planner conflict and ordering helpers', () => {
  it('reports same-file conflicts only for tasks without a dependency relationship', () => {
    expect(
      fileConflicts([
        task({ id: 'a', files: ['src/app.ts'] }),
        task({ id: 'b', files: ['src/app.ts'] }),
      ]),
    ).toEqual([{ taskA: 'a', taskB: 'b', files: ['src/app.ts'] }]);

    expect(
      fileConflicts([
        task({ id: 'a', files: ['src/app.ts'] }),
        task({ id: 'b', files: ['src/app.ts'], dependsOn: ['a'] }),
      ]),
    ).toEqual([]);
  });

  it('reports nested directory/file overlaps', () => {
    expect(
      fileConflicts([
        task({ id: 'api', files: ['src/api'] }),
        task({ id: 'user', files: ['src/api/user.js'] }),
      ]),
    ).toEqual([{ taskA: 'api', taskB: 'user', files: ['src/api'] }]);
  });

  it('sorts a dependency chain with parents before children', () => {
    const ordered = topoSort([
      task({ id: 'c', dependsOn: ['b'] }),
      task({ id: 'b', dependsOn: ['a'] }),
      task({ id: 'a' }),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });
});
