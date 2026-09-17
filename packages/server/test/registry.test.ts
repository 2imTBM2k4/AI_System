import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { SquadStore, type Plan } from '@squad/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.js';
import { RegistryError, RepoRegistry, squadHome } from '../src/registry.js';
import { serverListenOptions } from '../src/server-config.js';

const execFileAsync = promisify(execFile);
let fixtureRoot = '';
let repoPath = '';
let registryHome = '';

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'squad-server-'));
  repoPath = join(fixtureRoot, 'repo');
  registryHome = join(fixtureRoot, 'registry-home');
  await mkdir(repoPath);
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'squad-server@example.com'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Squad Server Test'], { cwd: repoPath });
  await writeFile(join(repoPath, 'README.md'), '# server fixture\n');
  await writeFile(
    join(repoPath, 'squad.config.json'),
    JSON.stringify({ agents: { default: { command: [process.execPath, '-e', 'process.exit(0)'] } } }),
  );
  await execFileAsync('git', ['add', '.'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'base'], { cwd: repoPath });
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe('RepoRegistry', () => {
  it('defaults to the local-only host and non-common server port', () => {
    expect(serverListenOptions({})).toEqual({ host: '127.0.0.1', port: 4317 });
    expect(serverListenOptions({ SQUAD_SERVER_HOST: '0.0.0.0', SQUAD_SERVER_PORT: '9999' })).toEqual({
      host: '0.0.0.0', port: 9999,
    });
    expect(() => serverListenOptions({ SQUAD_SERVER_PORT: '0' })).toThrow('SQUAD_SERVER_PORT');
  });

  it('uses SQUAD_HOME when configured and registers a repository idempotently', async () => {
    expect(squadHome({ SQUAD_HOME: registryHome })).toBe(resolve(registryHome));
    const registry = await RepoRegistry.open(registryHome);

    const results = await Promise.all([registry.register(repoPath), registry.register(repoPath)]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results[0].repo).toEqual(results[1].repo);
    expect(registry.list()).toEqual([results[0].repo]);
    registry.close();
  });

  it('fails fast for a non-repository or a Git repository without squad.config.json', async () => {
    const registry = await RepoRegistry.open(registryHome);
    await expect(registry.register(join(fixtureRoot, 'missing'))).rejects.toMatchObject({
      code: 'REPO_PATH_INVALID',
    } satisfies Partial<RegistryError>);

    const uninitialized = join(fixtureRoot, 'uninitialized');
    await mkdir(uninitialized);
    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: uninitialized });
    await expect(registry.register(uninitialized)).rejects.toMatchObject({
      code: 'REPO_NOT_INITIALIZED',
    } satisfies Partial<RegistryError>);
    registry.close();
  });
});

describe('server registry routes and startup reconciliation', () => {
  it('handles concurrent POST /repos requests for the same path idempotently', async () => {
    const registry = await RepoRegistry.open(registryHome);
    const app = await buildServer({ registry });

    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/repos', payload: { path: repoPath } }),
      app.inject({ method: 'POST', url: '/repos', payload: { path: repoPath } }),
    ]);
    const list = await app.inject({ method: 'GET', url: '/repos' });

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 201]);
    expect(first.json().repo).toEqual(second.json().repo);
    expect(list.json().repos).toEqual([first.json().repo]);
    await app.close();
    registry.close();
  });

  it('reconciles a dead coordinator for every registered repository before accepting requests', async () => {
    const registry = await RepoRegistry.open(registryHome);
    await registry.register(repoPath);
    const plan: Plan = {
      goal: 'recover',
      tasks: [{
        id: 'orphan', title: 'orphan', role: 'default', files: [], dependsOn: [],
        prompt: 'recover', branch: 'squad/orphan',
      }],
    };
    const dbFile = join(repoPath, '.squad', 'squad.db');
    const store = await SquadStore.open(dbFile);
    store.createPlannedRun('orphaned-run', repoPath, plan);
    store.startPlannedRun(
      'orphaned-run',
      plan,
      new Map([['orphan', join(repoPath, 'orphan.log')]]),
      { type: 'run:start', runId: 'orphaned-run', plan },
      2_147_483_647,
    );
    store.close();

    const app = await buildServer({ registry });

    const reopened = await SquadStore.open(dbFile);
    expect(reopened.getRun('orphaned-run')).toMatchObject({ status: 'interrupted', pid: null });
    expect(reopened.listTasks('orphaned-run')[0]).toMatchObject({ status: 'interrupted', pid: null });
    reopened.close();
    await app.close();
    registry.close();
  });
});
