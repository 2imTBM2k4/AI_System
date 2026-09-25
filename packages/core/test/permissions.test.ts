import { describe, it, expect } from 'vitest';
import { validateFileAccess, validateCommandAccess } from '../src/permissions.js';
import { HookPipeline } from '../src/hooks.js';

describe('Role Permission Allowlist & Hooks', () => {
  it('allows backend role to modify server and shared-types files', () => {
    const res1 = validateFileAccess('backend', 'packages/server/src/routes/users.ts');
    expect(res1.allowed).toBe(true);

    const res2 = validateFileAccess('backend', 'packages/shared-types/src/index.ts');
    expect(res2.allowed).toBe(true);
  });

  it('denies backend role from modifying frontend files in restricted mode', () => {
    const res = validateFileAccess('backend', 'apps/web/src/components/Header.tsx');
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("outside the assigned scope for role 'backend'");
  });

  it('denies dev roles from modifying acceptance tests', () => {
    const res = validateFileAccess('backend', 'packages/server/src/auth.acceptance.test.ts');
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('forbidden from modifying protected path');
  });

  it('allows frontend role to modify apps/web files and run vite/pnpm', () => {
    const resFile = validateFileAccess('frontend', 'apps/web/src/pages/Dashboard.tsx');
    expect(resFile.allowed).toBe(true);

    const resCmd = validateCommandAccess('frontend', 'pnpm --filter @squad/web build');
    expect(resCmd.allowed).toBe(true);

    const resCmd2 = validateCommandAccess('frontend', 'vite build');
    expect(resCmd2.allowed).toBe(true);
  });

  it('denies unpermitted commands for restricted roles', () => {
    const resCmd = validateCommandAccess('database', 'docker run -d postgres');
    expect(resCmd.allowed).toBe(false);
    expect(resCmd.reason).toContain("Command 'docker' is not permitted for role 'database'");
  });

  it('allows any action when mode is full', () => {
    const resFile = validateFileAccess('backend', 'apps/web/src/App.tsx', '', 'full');
    expect(resFile.allowed).toBe(true);

    const resCmd = validateCommandAccess('database', 'docker run -d postgres', 'full');
    expect(resCmd.allowed).toBe(true);
  });

  it('integrates with HookPipeline and executes pre/post hooks', async () => {
    const pipeline = new HookPipeline();
    const auditLogs: string[] = [];

    pipeline.addPostHook((ctx, result) => {
      auditLogs.push(`${ctx.role}:${ctx.actionType}:${result.decision}`);
    });

    const allowCtx = {
      runId: 'run-1',
      taskId: 'task-1',
      role: 'backend',
      actionType: 'file_write' as const,
      target: 'packages/server/src/service.ts',
      repoPath: '',
    };
    const allowRes = await pipeline.executePreHooks(allowCtx);
    expect(allowRes.decision).toBe('allow');

    const denyCtx = {
      runId: 'run-1',
      taskId: 'task-2',
      role: 'backend',
      actionType: 'file_write' as const,
      target: 'apps/web/src/index.html',
      repoPath: '',
    };
    const denyRes = await pipeline.executePreHooks(denyCtx);
    expect(denyRes.decision).toBe('deny');

    expect(auditLogs).toEqual([
      'backend:file_write:allow',
      'backend:file_write:deny',
    ]);
  });

  it('fails closed for undefined roles in validateFileAccess and validateCommandAccess', () => {
    const resDefaultFile = validateFileAccess('default', 'squad.config.json');
    expect(resDefaultFile.allowed).toBe(false);
    expect(resDefaultFile.reason).toContain("No permission policy defined for role 'default'. Refusing by default (fail-closed).");

    const resNonexistentFile = validateFileAccess('nonexistent-role', 'anything');
    expect(resNonexistentFile.allowed).toBe(false);
    expect(resNonexistentFile.reason).toContain("No permission policy defined for role 'nonexistent-role'. Refusing by default (fail-closed).");

    const resDefaultCmd = validateCommandAccess('default', 'node -e "process.exit(0)"');
    expect(resDefaultCmd.allowed).toBe(false);
    expect(resDefaultCmd.reason).toContain("No permission policy defined for role 'default'. Refusing by default (fail-closed).");

    const resNonexistentCmd = validateCommandAccess('nonexistent-role', 'pnpm test');
    expect(resNonexistentCmd.allowed).toBe(false);
    expect(resNonexistentCmd.reason).toContain("No permission policy defined for role 'nonexistent-role'. Refusing by default (fail-closed).");
  });

  it('requires exact command matching and denies prefix matches like gitxyz', () => {
    const resPrefix = validateCommandAccess('backend', 'gitxyz status', 'restricted');
    expect(resPrefix.allowed).toBe(false);
    expect(resPrefix.reason).toContain("Command 'gitxyz' is not permitted for role 'backend'");

    const resExact = validateCommandAccess('backend', 'git status', 'restricted');
    expect(resExact.allowed).toBe(true);
  });
});
