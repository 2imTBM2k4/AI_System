import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  loadSquadConfig,
  parseSquadConfig,
  type SquadConfig,
} from '@squad/core';
import type {
  ProviderConfigDto,
  TestProviderRequest,
  TestProviderResponse,
} from '@squad/shared-types';
import { squadHome } from './registry.js';

const PROVIDERS_FILE = 'providers.json';

export const DEFAULT_PROVIDERS: ProviderConfigDto[] = [
  {
    id: '9router',
    name: '9Router Gateway (Local)',
    enabled: true,
    baseUrl: 'http://127.0.0.1:20128',
    apiKey: '',
    customModels: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude Code / API)',
    enabled: false,
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    customModels: [
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI (Codex / API)',
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    customModels: [
      'gpt-4o',
      'gpt-4o-mini',
      'o1',
      'o3-mini',
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    enabled: false,
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: '',
    customModels: [
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
    ],
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible (DeepSeek / OpenRouter)',
    enabled: false,
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    customModels: [
      'deepseek-chat',
      'deepseek-reasoner',
    ],
  },
];

export function maskApiKey(key?: string): string {
  if (!key || key.trim().length === 0) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

export class ProvidersManager {
  private readonly providersPath: string;

  constructor(private readonly home = squadHome()) {
    this.providersPath = join(this.home, PROVIDERS_FILE);
  }

  async getProviders(mask = true): Promise<ProviderConfigDto[]> {
    try {
      const content = await readFile(this.providersPath, 'utf8');
      const loaded: ProviderConfigDto[] = JSON.parse(content);
      return loaded.map((p) => (mask ? { ...p, apiKey: maskApiKey(p.apiKey) } : p));
    } catch {
      // File chưa có, trả về template mặc định
      return DEFAULT_PROVIDERS.map((p) =>
        mask ? { ...p, apiKey: maskApiKey(p.apiKey) } : p
      );
    }
  }

  async saveProviders(incoming: ProviderConfigDto[]): Promise<ProviderConfigDto[]> {
    await mkdir(this.home, { recursive: true });

    // Lấy secret keys cũ để không bị đè bởi masked string
    let currentRaw: ProviderConfigDto[] = [];
    try {
      const content = await readFile(this.providersPath, 'utf8');
      currentRaw = JSON.parse(content);
    } catch {
      currentRaw = DEFAULT_PROVIDERS;
    }

    const currentKeyMap = new Map<string, string>();
    for (const p of currentRaw) {
      if (p.apiKey) currentKeyMap.set(p.id, p.apiKey);
    }

    const toSave = incoming.map((p) => {
      let finalKey = p.apiKey?.trim() || '';
      // Nếu key gửi lên là masked (chứa '***'), giữ lại key gốc
      if (finalKey.includes('***')) {
        finalKey = currentKeyMap.get(p.id) || '';
      }
      return {
        ...p,
        apiKey: finalKey,
      };
    });

    await writeFile(this.providersPath, JSON.stringify(toSave, null, 2), 'utf8');
    return toSave.map((p) => ({ ...p, apiKey: maskApiKey(p.apiKey) }));
  }

  async testConnection(req: TestProviderRequest): Promise<TestProviderResponse> {
    const startTime = Date.now();
    let baseUrl = req.baseUrl?.trim();
    let apiKey = req.apiKey?.trim();

    // Nếu key là masked, load key thật từ đĩa
    if (!apiKey || apiKey.includes('***')) {
      const rawProviders = await this.getProviders(false);
      const found = rawProviders.find((p) => p.id === req.providerId);
      if (found?.apiKey) apiKey = found.apiKey;
      if (!baseUrl && found?.baseUrl) baseUrl = found.baseUrl;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      let targetUrl = '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (req.providerId === '9router' || req.providerId === 'openai' || req.providerId === 'custom') {
        const cleanBase = (baseUrl || 'http://127.0.0.1:20128').replace(/\/+$/, '');
        targetUrl = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
      } else if (req.providerId === 'anthropic') {
        const cleanBase = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
        targetUrl = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
        if (apiKey) {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
        }
      } else if (req.providerId === 'gemini') {
        targetUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey || ''}`;
      } else {
        const cleanBase = (baseUrl || 'http://127.0.0.1:20128').replace(/\/+$/, '');
        targetUrl = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(targetUrl, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let errDetail = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errBody = await response.json();
          if (errBody?.error?.message) errDetail = errBody.error.message;
        } catch {}
        return {
          success: false,
          latencyMs,
          models: [],
          error: errDetail,
        };
      }

      const json = await response.json();
      const models: string[] = [];

      if (Array.isArray(json?.data)) {
        for (const item of json.data) {
          if (typeof item?.id === 'string') models.push(item.id);
        }
      } else if (Array.isArray(json?.models)) {
        for (const item of json.models) {
          if (typeof item?.name === 'string') {
            models.push(item.name.replace(/^models\//, ''));
          }
        }
      }

      return {
        success: true,
        latencyMs,
        models: models.length > 0 ? models : (DEFAULT_PROVIDERS.find((p) => p.id === req.providerId)?.customModels || []),
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        models: [],
        error: error instanceof Error ? error.message : 'Không thể kết nối đến provider',
      };
    }
  }

  async getRepoConfig(repoPath: string): Promise<SquadConfig> {
    const configPath = resolve(repoPath, 'squad.config.json');
    const loaded = await loadSquadConfig(configPath);
    return loaded.config;
  }

  async updateRepoConfig(repoPath: string, newConfig: unknown): Promise<SquadConfig> {
    const validated = parseSquadConfig(newConfig);
    const configPath = resolve(repoPath, 'squad.config.json');
    await writeFile(configPath, JSON.stringify(validated, null, 2), 'utf8');
    return validated;
  }
}
