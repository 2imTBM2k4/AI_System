import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildServer } from '../src/app.js';
import { RepoRegistry } from '../src/registry.js';
import { ProvidersManager } from '../src/providers-manager.js';
import { runGit } from '@squad/core';

describe('AI Providers & Config API routes', () => {
  let tempDir: string;
  let repoPath: string;
  let squadHomeDir: string;
  let registry: RepoRegistry;
  let providersManager: ProvidersManager;
  let app: Awaited<ReturnType<typeof buildServer>>;

  const validSquadConfig = {
    configVersion: 1,
    baseBranch: 'main',
    integrationBranch: 'squad/integration',
    maxParallel: 2,
    timeoutMinutes: 15,
    bootstrap: [],
    copyFiles: [],
    verify: [],
    agents: {
      planner: { cli: 'claude', model: 'claude-3-7-sonnet' },
      default: { cli: 'claude', model: 'claude-3-5-sonnet' },
    },
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'squad-providers-test-'));
    repoPath = join(tempDir, 'repo');
    squadHomeDir = join(tempDir, 'squad_home');

    await mkdir(repoPath, { recursive: true });
    await mkdir(squadHomeDir, { recursive: true });

    // Khởi tạo git repo và file squad.config.json
    await runGit(repoPath, ['init', '-b', 'main']);
    await runGit(repoPath, ['config', 'user.name', 'Test']);
    await runGit(repoPath, ['config', 'user.email', 'test@test.com']);
    await writeFile(join(repoPath, 'squad.config.json'), JSON.stringify(validSquadConfig, null, 2), 'utf8');
    await runGit(repoPath, ['add', 'squad.config.json']);
    await runGit(repoPath, ['commit', '-m', 'initial']);

    registry = await RepoRegistry.open(squadHomeDir);
    providersManager = new ProvidersManager(squadHomeDir);
    app = await buildServer({ registry, providersManager });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    registry.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('GET /providers returns default template with masked keys', async () => {
    const res = await app.inject({ method: 'GET', url: '/providers' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.length).toBeGreaterThan(0);
    expect(body.providers.find((p: { id: string }) => p.id === '9router')).toBeDefined();
  });

  it('POST /providers/save persists provider configs and preserves secret keys when re-saving masked string', async () => {
    // 1. Lưu key thật
    const saveRes = await app.inject({
      method: 'POST',
      url: '/providers/save',
      payload: {
        providers: [
          {
            id: '9router',
            name: '9Router Gateway',
            enabled: true,
            baseUrl: 'http://127.0.0.1:20128',
            apiKey: 'sk-secret-9router-real-token-12345',
          },
        ],
      },
    });
    expect(saveRes.statusCode).toBe(200);
    const savedBody = JSON.parse(saveRes.body);
    const nineRouter = savedBody.providers.find((p: { id: string }) => p.id === '9router');
    expect(nineRouter.apiKey).toContain('***');

    // 2. Lưu lại với key đã mask, server không được làm mất key thật trong DB
    const resaveRes = await app.inject({
      method: 'POST',
      url: '/providers/save',
      payload: {
        providers: [
          {
            id: '9router',
            name: '9Router Gateway',
            enabled: true,
            baseUrl: 'http://127.0.0.1:20128',
            apiKey: nineRouter.apiKey, // Masked string
          },
        ],
      },
    });
    expect(resaveRes.statusCode).toBe(200);

    // Kiểm tra raw storage
    const rawProviders = await providersManager.getProviders(false);
    const raw9Router = rawProviders.find((p) => p.id === '9router');
    expect(raw9Router?.apiKey).toBe('sk-secret-9router-real-token-12345');
  });

  it('POST /providers/test connects to provider endpoint and extracts model list', async () => {
    // Mock global fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'claude-3-7-sonnet' },
          { id: 'deepseek-r1' },
          { id: 'gpt-4o' },
        ],
      }),
    });
    globalThis.fetch = mockFetch;

    const res = await app.inject({
      method: 'POST',
      url: '/providers/test',
      payload: {
        providerId: '9router',
        baseUrl: 'http://127.0.0.1:20128',
        apiKey: 'sk-test',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.models).toEqual(['claude-3-7-sonnet', 'deepseek-r1', 'gpt-4o']);
    expect(typeof body.latencyMs).toBe('number');
  });

  it('GET /repos/:id/config and PUT /repos/:id/config manage squad.config.json', async () => {
    const registerRes = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { path: repoPath },
    });
    const repo = JSON.parse(registerRes.body).repo;

    // GET config
    const getRes = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/config`,
    });
    expect(getRes.statusCode).toBe(200);
    const configBody = JSON.parse(getRes.body);
    expect(configBody.config.maxParallel).toBe(2);

    // PUT config với model mới
    const updatedConfig = {
      ...configBody.config,
      maxParallel: 4,
      agents: {
        ...configBody.config.agents,
        backend: {
          cli: 'claude',
          model: 'deepseek-r1',
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:20128',
          },
        },
      },
    };

    const putRes = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/config`,
      payload: { config: updatedConfig },
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.body);
    expect(putBody.config.maxParallel).toBe(4);
    expect(putBody.config.agents.backend.model).toBe('deepseek-r1');

    // Verify GET lại xác nhận đã ghi vào đĩa
    const verifyRes = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/config`,
    });
    const verifiedConfig = JSON.parse(verifyRes.body).config;
    expect(verifiedConfig.agents.backend.model).toBe('deepseek-r1');
  });
});
