import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ProvidersView } from '../src/components/views/ProvidersView';
import * as apiClient from '../src/api/client';
import type { ProviderConfigDto } from '@squad/shared-types';

describe('ProvidersView', () => {
  const dummyProviders: ProviderConfigDto[] = [
    {
      id: '9router',
      name: '9Router Gateway (Local)',
      enabled: true,
      baseUrl: 'http://127.0.0.1:20128',
      apiKey: '',
      customModels: ['ag/gemini-3.8-flash'],
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

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'getProviders').mockResolvedValue({
      providers: dummyProviders,
    });
    vi.spyOn(apiClient, 'saveProviders').mockResolvedValue({
      providers: dummyProviders,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders provider list with 9Router enabled by default', async () => {
    render(<ProvidersView />);

    await waitFor(() => {
      expect(screen.getByText(/9Router Gateway/)).toBeDefined();
    });

    expect(screen.getByText(/Thiết Lập Nhà Cung Cấp Model/)).toBeDefined();
    expect(screen.getByText(/Lưu Cấu Hình/)).toBeDefined();
  });

  it('tests provider connection and displays latency result', async () => {
    vi.spyOn(apiClient, 'testProvider').mockResolvedValue({
      success: true,
      latencyMs: 15,
      models: ['ag/gemini-3.8-flash', 'cx/gpt-5.5'],
    });

    render(<ProvidersView />);

    await waitFor(() => {
      expect(screen.getAllByText(/Kiểm Tra Kết Nối/)[0]).toBeDefined();
    });

    fireEvent.click(screen.getAllByText(/Kiểm Tra Kết Nối/)[0]);

    await waitFor(() => {
      expect(screen.getByText(/15ms/)).toBeDefined();
    });
  });

  it('toggles adding custom provider form', async () => {
    render(<ProvidersView />);

    await waitFor(() => {
      expect(screen.getByText(/Thêm Custom Provider/)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Thêm Custom Provider/));

    expect(screen.getByText(/Thêm Nhà Cung Cấp Mới/)).toBeDefined();
    expect(screen.getByPlaceholderText(/Ví dụ: Ollama, Groq, OpenRouter/)).toBeDefined();
  });

  it('triggers save providers on save button click', async () => {
    const saveSpy = vi.spyOn(apiClient, 'saveProviders').mockResolvedValue({
      providers: dummyProviders,
    });

    render(<ProvidersView />);

    await waitFor(() => {
      expect(screen.getByText(/Lưu Cấu Hình/)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Lưu Cấu Hình/));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });
  });
});
