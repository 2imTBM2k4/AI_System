import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AiProviderHubModal } from '../src/components/providers/AiProviderHubModal';
import * as apiClient from '../src/api/client';
import type { SquadConfigDto, ProviderConfigDto } from '@squad/shared-types';

describe('AiProviderHubModal', () => {
  const dummyProviders: ProviderConfigDto[] = [
    {
      id: '9router',
      name: '9Router Gateway (Local)',
      enabled: true,
      baseUrl: 'http://127.0.0.1:20128',
      apiKey: '',
      customModels: ['claude-3-7-sonnet'],
    },
    {
      id: 'openai',
      name: 'OpenAI (Codex / API)',
      enabled: false,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      customModels: [],
    },
  ];

  const dummyConfig: SquadConfigDto = {
    configVersion: 1,
    baseBranch: 'main',
    integrationBranch: 'squad/integration',
    maxParallel: 3,
    timeoutMinutes: 30,
    agents: {
      planner: { cli: 'claude', model: 'claude-3-7-sonnet' },
      backend: { cli: 'claude', model: 'claude-3-7-sonnet' },
      frontend: { cli: 'codex', model: 'gpt-4o' },
      tester: { cli: 'gemini', model: 'gemini-2.5-pro' },
      default: { cli: 'claude', model: 'claude-3-7-sonnet' },
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'getProviders').mockResolvedValue({
      providers: dummyProviders,
    });
    vi.spyOn(apiClient, 'getRepoConfig').mockResolvedValue({
      config: dummyConfig,
    });
    vi.spyOn(apiClient, 'saveProviders').mockResolvedValue({
      providers: dummyProviders,
    });
    vi.spyOn(apiClient, 'updateRepoConfig').mockResolvedValue({
      config: dummyConfig,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders provider list with 9Router enabled by default', async () => {
    render(
      <AiProviderHubModal
        selectedRepoId="repo-1"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/9Router Gateway/)).toBeDefined();
    });

    expect(screen.getByText(/AI Providers & Model Hub/)).toBeDefined();
    expect(screen.getByText(/1\. Nhà Cung Cấp & 9Router/)).toBeDefined();
    expect(screen.getByText(/2\. Phân Bổ Model Theo Vai Trò/)).toBeDefined();
  });

  it('switches to role allocation tab and displays role model mapping', async () => {
    render(
      <AiProviderHubModal
        selectedRepoId="repo-1"
        onClose={vi.fn()}
      />
    );

    // Chờ loading ban đầu xong
    await waitFor(() => {
      expect(screen.getByText(/9Router Gateway/)).toBeDefined();
    });

    // Chuyển sang Tab 2
    fireEvent.click(screen.getByText(/2\. Phân Bổ Model Theo Vai Trò/));

    await waitFor(() => {
      expect(screen.getByText(/Agent Phân Rã Kế Hoạch/)).toBeDefined();
    });

    expect(screen.getByText(/Agent Lập Trình Backend \/ API/)).toBeDefined();
    expect(screen.getByText(/Agent Giao Diện & Client/)).toBeDefined();
    expect(screen.getByText(/Agent Viết Test & Kiểm Thử/)).toBeDefined();
  });

  it('tests provider connection and displays online latency badge', async () => {
    vi.spyOn(apiClient, 'testProvider').mockResolvedValue({
      success: true,
      latencyMs: 15,
      models: ['claude-3-7-sonnet', 'deepseek-r1'],
    });

    render(
      <AiProviderHubModal
        selectedRepoId="repo-1"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Test & Lấy Models/)[0]).toBeDefined();
    });

    fireEvent.click(screen.getAllByText(/Test & Lấy Models/)[0]);

    await waitFor(() => {
      expect(screen.getByText(/Online \(15ms • 2 models\)/)).toBeDefined();
    });
  });
});
