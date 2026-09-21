import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wifi,
  Sparkles,
  Sliders,
  Eye,
  EyeOff,
  Save,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  ProviderConfigDto,
  SquadConfigDto,
  TestProviderResponse,
} from '@squad/shared-types';
import {
  getProviders,
  saveProviders,
  testProvider,
  getRepoConfig,
  updateRepoConfig,
} from '../../api/client';
import { GlassButton } from '../glass/GlassButton';
import { GlassBadge } from '../glass/GlassBadge';

interface AiProviderHubModalProps {
  selectedRepoId: string | null;
  onClose: () => void;
  onConfigSaved?: () => void;
}

interface TestStatus {
  testing: boolean;
  result: TestProviderResponse | null;
}

const COMMON_MODELS: Record<string, string[]> = {
  '9router': [
    'ag/gemini-3.8-flash',
    'ag/gemini-pro-agent',
    'ag/claude-sonnet-4-6',
    'ag/claude-opus-4-6-thinking',
    'cx/gpt-5.6-sol',
    'cx/gpt-5.5',
    'openrouter/poolside/laguna-xs-2.1:free',
    'openrouter/nvidia/nemotron-3.5-lightning:free',
    'ag/gpt-oss-120b-medium',
  ],
  anthropic: [
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'o1',
    'o3-mini',
  ],
  gemini: [
    'ag/gemini-3.8-flash',
    'ag/gemini-pro-agent',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
  ],
  custom: [
    'deepseek-chat',
    'deepseek-reasoner',
  ],
};

export const AiProviderHubModal: React.FC<AiProviderHubModalProps> = ({
  selectedRepoId,
  onClose,
  onConfigSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'roles'>('providers');
  const [providers, setProviders] = useState<ProviderConfigDto[]>([]);
  const [repoConfig, setRepoConfig] = useState<SquadConfigDto | null>(null);
  const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Thêm custom provider state
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');

  // Load initial data
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        setIsLoading(true);
        const provData = await getProviders();
        if (!active) return;
        setProviders(provData.providers);

        if (selectedRepoId) {
          const cfgData = await getRepoConfig(selectedRepoId);
          if (!active) return;
          setRepoConfig(cfgData.config);
        }
      } catch (err) {
        if (!active) return;
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Không thể tải cấu hình',
        });
      } finally {
        if (active) setIsLoading(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [selectedRepoId]);

  const handleProviderChange = (
    id: string,
    field: keyof ProviderConfigDto,
    value: unknown
  ) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleAddCustomProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const newId = `custom-${Date.now()}`;
    const newProv: ProviderConfigDto = {
      id: newId,
      name: customName.trim(),
      enabled: true,
      baseUrl: customBaseUrl.trim() || 'http://localhost:11434/v1',
      apiKey: customApiKey.trim(),
      customModels: [],
    };
    setProviders((prev) => [...prev, newProv]);
    setCustomName('');
    setCustomBaseUrl('');
    setCustomApiKey('');
    setShowAddCustom(false);
  };

  const handleDeleteProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
  };

  const handleTestConnection = async (provider: ProviderConfigDto) => {
    setTestStatuses((prev) => ({
      ...prev,
      [provider.id]: { testing: true, result: null },
    }));

    try {
      const res = await testProvider({
        providerId: provider.id,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
      });

      setTestStatuses((prev) => ({
        ...prev,
        [provider.id]: { testing: false, result: res },
      }));

      // Nếu lấy được models mới, lưu vào customModels của provider
      if (res.success && res.models.length > 0) {
        setProviders((prev) =>
          prev.map((p) =>
            p.id === provider.id
              ? { ...p, customModels: Array.from(new Set([...(p.customModels || []), ...res.models])) }
              : p
          )
        );
      }
    } catch (err) {
      setTestStatuses((prev) => ({
        ...prev,
        [provider.id]: {
          testing: false,
          result: {
            success: false,
            latencyMs: 0,
            models: [],
            error: err instanceof Error ? err.message : 'Lỗi kết nối',
          },
        },
      }));
    }
  };

  const handleRoleModelChange = (role: string, model: string) => {
    if (!repoConfig) return;
    const currentAgent = repoConfig.agents[role] || { cli: '9router' };
    let cli = currentAgent.cli || '9router';
    // Tự động chuyển CLI sang 9router nếu chọn model của 9Router (ag/..., openrouter/..., cx/...)
    if (model.startsWith('ag/') || model.startsWith('openrouter/') || model.startsWith('cx/')) {
      if (cli === 'codex' || !cli) {
        cli = '9router';
      }
    }
    setRepoConfig({
      ...repoConfig,
      agents: {
        ...repoConfig.agents,
        [role]: {
          ...currentAgent,
          cli,
          model,
        },
      },
    });
  };

  const handleRoleCliChange = (role: string, cli: string) => {
    if (!repoConfig) return;
    const currentAgent = repoConfig.agents[role] || {};
    setRepoConfig({
      ...repoConfig,
      agents: {
        ...repoConfig.agents,
        [role]: {
          ...currentAgent,
          cli,
        },
      },
    });
  };

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      setFeedback(null);

      // 1. Lưu Provider credentials vào server ~/.squad/providers.json
      await saveProviders(providers);

      // 2. Nếu có repo, cập nhật squad.config.json kèm tiêm env 9router nếu đang bật
      if (selectedRepoId && repoConfig) {
        const nineRouter = providers.find((p) => p.id === '9router');
        const is9RouterEnabled = nineRouter?.enabled;
        const nineRouterBase = nineRouter?.baseUrl || 'http://127.0.0.1:20128';

        const updatedAgents: Record<string, typeof repoConfig.agents[string]> = {};
        for (const [roleKey, spec] of Object.entries(repoConfig.agents)) {
          const envVars: Record<string, string> = { ...(spec.env || {}) };

          if (is9RouterEnabled) {
            envVars.ANTHROPIC_BASE_URL = nineRouterBase;
            envVars.OPENAI_BASE_URL = nineRouterBase.endsWith('/v1')
              ? nineRouterBase
              : `${nineRouterBase.replace(/\/+$/, '')}/v1`;
            if (nineRouter?.apiKey && !nineRouter.apiKey.includes('***')) {
              envVars.ANTHROPIC_API_KEY = nineRouter.apiKey;
              envVars.OPENAI_API_KEY = nineRouter.apiKey;
            } else {
              envVars.OPENAI_API_KEY = envVars.OPENAI_API_KEY || 'sk-9router';
              envVars.ANTHROPIC_API_KEY = envVars.ANTHROPIC_API_KEY || 'sk-9router';
            }
          }

          let command = spec.command;
          if (spec.cli === '9router') {
            command = command || [
              'node',
              'packages/core/bin/direct-runner.mjs',
              '--model',
              '{{model}}',
              '--prompt',
              '{{prompt}}',
            ];
          }

          updatedAgents[roleKey] = {
            ...spec,
            command,
            env: envVars,
          };
        }

        const finalConfig: SquadConfigDto = {
          ...repoConfig,
          agents: updatedAgents,
        };

        await updateRepoConfig(selectedRepoId, finalConfig);
      }

      setFeedback({
        type: 'success',
        message: 'Đã lưu cấu hình AI Providers và cập nhật squad.config.json thành công!',
      });
      if (onConfigSaved) onConfigSaved();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể lưu cấu hình',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Gom toàn bộ danh sách model khả dụng cho dropdown
  const getAllAvailableModels = () => {
    const list: string[] = [];
    for (const p of providers) {
      if (p.customModels) list.push(...p.customModels);
      if (COMMON_MODELS[p.id]) list.push(...COMMON_MODELS[p.id]);
    }
    return Array.from(new Set(list));
  };

  const availableModels = getAllAvailableModels();
  const nineRouter = providers.find((p) => p.id === '9router');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative bg-white/95 dark:bg-zinc-950/85 backdrop-blur-2xl border border-black/10 dark:border-white/[0.12] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.85)] animate-in zoom-in-95 duration-200 overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Specular edge highlight */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent pointer-events-none"
        />

        {/* Modal Header */}
        <div className="p-6 border-b border-black/[0.06] dark:border-white/[0.08] flex items-start justify-between bg-black/[0.01] dark:bg-white/[0.02]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  AI Providers &amp; Model Hub
                </h3>
                {nineRouter?.enabled && (
                  <GlassBadge variant="emerald" dot pulse>
                    <span className="text-[10px] font-bold">9Router Active</span>
                  </GlassBadge>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Quản lý các tài khoản AI, Gateway 9Router, và chọn Model trực tiếp cho các coding agents
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center gap-4 bg-black/[0.01] dark:bg-white/[0.01]">
          <button
            type="button"
            onClick={() => setActiveTab('providers')}
            className={`flex items-center gap-2 pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'providers'
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-300 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>1. Nhà Cung Cấp &amp; 9Router</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`flex items-center gap-2 pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'roles'
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-300 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>2. Phân Bổ Model Theo Vai Trò</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 dark:text-indigo-400" />
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Đang nạp thông tin providers...</span>
            </div>
          ) : (
            <>
              {feedback && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 backdrop-blur-md ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{feedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeedback(null)}
                    className="p-1 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* TAB 1: PROVIDERS & 9ROUTER */}
              {activeTab === 'providers' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 text-xs text-indigo-800 dark:text-indigo-300 space-y-1 backdrop-blur-md">
                    <div className="font-semibold flex items-center gap-1.5 text-indigo-900 dark:text-indigo-200">
                      <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Khuyên dùng: 9Router Local AI Gateway
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-[11px]">
                      9Router giúp gom các tài khoản Pro/Max, tự động cân bằng tải (round-robin), chống rate limit 429 khi nhiều agent chạy song song, và tự động nén token bằng RTK Saver.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Danh Sách Nhà Cung Cấp ({providers.length})
                    </span>
                    <GlassButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAddCustom((v) => !v)}
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                      <span>Thêm Nhà Cung Cấp</span>
                    </GlassButton>
                  </div>

                  {showAddCustom && (
                    <form
                      onSubmit={handleAddCustomProvider}
                      className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-indigo-300 dark:border-indigo-500/35 space-y-3 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
                    >
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
                          Thêm Nhà Cung Cấp Mới (OpenAI-Compatible)
                        </h5>
                        <button
                          type="button"
                          onClick={() => setShowAddCustom(false)}
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                            Tên Nhà Cung Cấp *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ví dụ: Groq, Ollama, OpenRouter..."
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            className="liquid-glass-input w-full rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                            Base URL Endpoint *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ví dụ: https://api.groq.com/openai/v1"
                            value={customBaseUrl}
                            onChange={(e) => setCustomBaseUrl(e.target.value)}
                            className="liquid-glass-input w-full rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                            API Key (Tùy chọn)
                          </label>
                          <input
                            type="password"
                            placeholder="sk-..."
                            value={customApiKey}
                            onChange={(e) => setCustomApiKey(e.target.value)}
                            className="liquid-glass-input w-full rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <GlassButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAddCustom(false)}
                        >
                          Hủy
                        </GlassButton>
                        <GlassButton
                          type="submit"
                          variant="primary"
                          size="sm"
                        >
                          Thêm vào Danh Sách
                        </GlassButton>
                      </div>
                    </form>
                  )}

                  <div className="space-y-3">
                    {providers.map((p) => {
                      const status = testStatuses[p.id];
                      const is9Router = p.id === '9router';
                      const showPassword = showKeys[p.id] || false;
                      const canDelete = !['9router', 'anthropic', 'openai', 'gemini'].includes(p.id);

                      return (
                        <div
                          key={p.id}
                          className={`p-4 rounded-xl border transition-all duration-200 backdrop-blur-md relative overflow-hidden ${
                            p.enabled
                              ? 'bg-black/[0.02] dark:bg-white/[0.03] border-black/[0.08] dark:border-white/[0.09] shadow-sm'
                              : 'bg-black/[0.01] dark:bg-white/[0.01] border-black/[0.04] dark:border-white/[0.05] opacity-75'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id={`toggle-${p.id}`}
                                checked={p.enabled}
                                onChange={(e) =>
                                  handleProviderChange(p.id, 'enabled', e.target.checked)
                                }
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 cursor-pointer accent-indigo-500"
                              />
                              <label
                                htmlFor={`toggle-${p.id}`}
                                className="text-sm font-bold text-zinc-900 dark:text-zinc-100 cursor-pointer flex items-center gap-2"
                              >
                                {p.name}
                                {is9Router && (
                                  <GlassBadge variant="indigo">
                                    <span className="text-[10px] uppercase font-bold tracking-wider">Gateway</span>
                                  </GlassBadge>
                                )}
                              </label>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Test Status Badge */}
                              {status?.testing ? (
                                <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-mono">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang kiểm tra...
                                </span>
                              ) : status?.result ? (
                                status.result.success ? (
                                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Online ({status.result.latencyMs}ms • {status.result.models.length} models)
                                  </span>
                                ) : (
                                  <span
                                    className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-2.5 py-0.5 rounded-full font-mono max-w-xs truncate"
                                    title={status.result.error}
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    {status.result.error}
                                  </span>
                                )
                              ) : null}

                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProvider(p.id)}
                                  className="text-zinc-400 hover:text-rose-500 p-1 transition-colors cursor-pointer"
                                  title="Xóa nhà cung cấp này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {p.enabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                              <div>
                                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                                  Base URL Endpoint
                                </label>
                                <input
                                  type="text"
                                  placeholder={
                                    is9Router ? 'http://127.0.0.1:20128' : 'https://api.openai.com/v1'
                                  }
                                  value={p.baseUrl || ''}
                                  onChange={(e) =>
                                    handleProviderChange(p.id, 'baseUrl', e.target.value)
                                  }
                                  className="liquid-glass-input w-full rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none"
                                />
                              </div>

                              <div>
                                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1 font-mono flex items-center justify-between">
                                  <span>API Key / Token</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowKeys((prev) => ({
                                        ...prev,
                                        [p.id]: !prev[p.id],
                                      }))
                                    }
                                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                                  >
                                    {showPassword ? (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder={
                                      is9Router
                                        ? 'Tùy chọn (để trống nếu 9Router không set auth)'
                                        : 'sk-...'
                                    }
                                    value={p.apiKey || ''}
                                    onChange={(e) =>
                                      handleProviderChange(p.id, 'apiKey', e.target.value)
                                    }
                                    className="liquid-glass-input flex-1 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none"
                                  />

                                  <GlassButton
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleTestConnection(p)}
                                    disabled={status?.testing}
                                    className="whitespace-nowrap"
                                  >
                                    {status?.testing ? 'Đang test...' : 'Test & Lấy Models'}
                                  </GlassButton>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: ROLE MODEL MAPPING */}
              {activeTab === 'roles' && (
                <div className="space-y-6">
                  {!selectedRepoId ? (
                    <div className="p-6 text-center border border-dashed border-black/10 dark:border-white/[0.08] rounded-xl bg-black/[0.01] dark:bg-white/[0.01]">
                      <AlertCircle className="w-8 h-8 text-amber-500 dark:text-amber-400 mx-auto mb-2" />
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 font-semibold">
                        Vui lòng chọn repository trước khi phân bổ model
                      </p>
                    </div>
                  ) : !repoConfig ? (
                    <div className="text-center py-8 text-zinc-500 text-xs">
                      Không tìm thấy file squad.config.json trong repository này
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> Phân Bổ Agent Theo Vai Trò
                          </h4>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                            Auto-sync với squad.config.json
                          </span>
                        </div>

                        {/* OpenRouter / 9Router Tip */}
                        <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-2.5 backdrop-blur-md">
                          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-200">
                              Cách dùng Model Free từ OpenRouter qua 9Router:
                            </div>
                            <ul className="text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside text-[11px] leading-relaxed">
                              <li>
                                <strong className="text-indigo-700 dark:text-indigo-300">Khuyên dùng OpenAI Codex:</strong> Chọn CLI Tool là <code className="bg-black/[0.04] dark:bg-black/40 border border-black/10 dark:border-white/[0.06] px-1 py-0.5 rounded text-zinc-800 dark:text-zinc-200 font-mono">OpenAI Codex</code> để chạy bất kỳ model nào từ OpenRouter (ví dụ: <code className="bg-black/[0.04] dark:bg-black/40 border border-black/10 dark:border-white/[0.06] px-1 py-0.5 rounded text-zinc-800 dark:text-zinc-200 font-mono">openrouter/...</code>, <code className="bg-black/[0.04] dark:bg-black/40 border border-black/10 dark:border-white/[0.06] px-1 py-0.5 rounded text-zinc-800 dark:text-zinc-200 font-mono">deepseek/...</code>).
                              </li>
                              <li>
                                <strong className="text-indigo-700 dark:text-indigo-300">Nếu dùng Claude Code:</strong> Do Claude Code kiểm tra tên model ở máy client, hãy mở 9Router và tạo <em className="text-zinc-800 dark:text-zinc-200">Model Alias</em> (ví dụ: đặt alias <code className="bg-black/[0.04] dark:bg-black/40 border border-black/10 dark:border-white/[0.06] px-1 py-0.5 rounded text-zinc-800 dark:text-zinc-200 font-mono">claude-3-5-sonnet</code> trỏ tới model free của OpenRouter).
                              </li>
                            </ul>
                          </div>
                        </div>

                        {/* List of roles */}
                        {['planner', 'backend', 'frontend', 'tester', 'default'].map(
                          (role) => {
                            const spec = repoConfig.agents[role] || {
                              cli: 'claude',
                              model: 'claude-3-7-sonnet',
                            };

                            const getRoleBadgeVariant = (r: string): 'purple' | 'amber' | 'cyan' | 'emerald' | 'indigo' => {
                              switch (r) {
                                case 'planner':
                                  return 'purple';
                                case 'backend':
                                  return 'amber';
                                case 'frontend':
                                  return 'cyan';
                                case 'tester':
                                  return 'emerald';
                                default:
                                  return 'indigo';
                              }
                            };

                            return (
                              <div
                                key={role}
                                className="p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.025] hover:border-black/15 dark:hover:border-white/[0.14] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md"
                              >
                                <div className="flex items-center gap-3">
                                  <GlassBadge variant={getRoleBadgeVariant(role)}>
                                    <span className="uppercase tracking-wider font-bold text-[10px]">
                                      {role}
                                    </span>
                                  </GlassBadge>
                                  <div>
                                    <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                      {role === 'planner'
                                        ? 'Agent Phân Rã Kế Hoạch'
                                        : role === 'backend'
                                        ? 'Agent Lập Trình Backend / API'
                                        : role === 'frontend'
                                        ? 'Agent Giao Diện & Client'
                                        : role === 'tester'
                                        ? 'Agent Viết Test & Kiểm Thử'
                                        : 'Agent Mặc Định (Fallback)'}
                                    </div>
                                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                                      CLI: <span className="text-zinc-700 dark:text-zinc-300">{spec.cli || 'custom'}</span> • Model: <span className="text-zinc-700 dark:text-zinc-300">{spec.model || 'chưa gán'}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {/* CLI Tool */}
                                  <select
                                    aria-label={`Chọn CLI Tool cho vai trò ${role}`}
                                    value={spec.cli || '9router'}
                                    onChange={(e) => handleRoleCliChange(role, e.target.value)}
                                    className="liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs focus:outline-none font-mono cursor-pointer"
                                  >
                                    <option value="9router" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">9Router Gateway (Trực tiếp, khuyên dùng ⭐)</option>
                                    <option value="claude" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">Claude Code CLI</option>
                                    <option value="codex" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">OpenAI Codex CLI</option>
                                    <option value="gemini" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">Google Gemini CLI</option>
                                  </select>

                                  {/* Model Dropdown with Datalist */}
                                  <div className="relative">
                                    <input
                                      type="text"
                                      list={`models-list-${role}`}
                                      placeholder="Chọn hoặc nhập model..."
                                      value={spec.model || ''}
                                      onChange={(e) =>
                                        handleRoleModelChange(role, e.target.value)
                                      }
                                      className="liquid-glass-input rounded-xl px-3 py-1.5 text-xs placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none font-mono w-64"
                                    />
                                    <datalist id={`models-list-${role}`}>
                                      {availableModels.map((m) => (
                                        <option key={m} value={m} />
                                      ))}
                                    </datalist>
                                  </div>
                                </div>

                                {/* Cảnh báo không tương thích nếu dùng Codex CLI với model Gemini / Claude / OpenRouter */}
                                {spec.cli === 'codex' &&
                                  spec.model &&
                                  !spec.model.startsWith('gpt-') &&
                                  !spec.model.startsWith('o1') &&
                                  !spec.model.startsWith('o3') &&
                                  !spec.model.startsWith('cx/') && (
                                    <div className="w-full text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                                      <span>⚠️</span>
                                      <span>
                                        <strong>Chú ý:</strong> Codex CLI với tài khoản ChatGPT không hỗ trợ model <code>{spec.model}</code>. Vui lòng đổi CLI sang <strong>&quot;9Router Gateway (Trực tiếp)&quot;</strong>!
                                      </span>
                                    </div>
                                  )}
                              </div>
                            );
                          }
                        )}
                      </div>

                      {/* Orchestration settings */}
                      <div className="p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] space-y-3 backdrop-blur-md">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                          <Sliders className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> Tham Số Điều Phối Song Song
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                          <div>
                            <label className="block text-zinc-600 dark:text-zinc-400 mb-1">
                              Số task chạy song song tối đa ({repoConfig.maxParallel} tasks):
                            </label>
                            <input
                              type="range"
                              min={1}
                              max={10}
                              value={repoConfig.maxParallel}
                              onChange={(e) =>
                                setRepoConfig({
                                  ...repoConfig,
                                  maxParallel: parseInt(e.target.value, 10),
                                })
                              }
                              className="w-full cursor-pointer accent-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-zinc-600 dark:text-zinc-400 mb-1">
                              Timeout tối đa cho mỗi task (phút):
                            </label>
                            <input
                              type="number"
                              min={5}
                              max={120}
                              value={repoConfig.timeoutMinutes}
                              onChange={(e) =>
                                setRepoConfig({
                                  ...repoConfig,
                                  timeoutMinutes: parseInt(e.target.value, 10) || 30,
                                })
                              }
                              className="liquid-glass-input w-full rounded-lg px-3 py-1.5 text-xs focus:outline-none font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] flex items-center justify-between rounded-b-2xl">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
            * Cấu hình credentials được bảo mật tại thư mục cá nhân (~/.squad).
          </span>

          <div className="flex items-center gap-3">
            <GlassButton
              type="button"
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={isSaving}
            >
              Hủy
            </GlassButton>
            <GlassButton
              type="button"
              variant="primary"
              size="md"
              glow
              onClick={handleSaveAll}
              disabled={isSaving || isLoading}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Lưu Cấu Hình</span>
                </>
              )}
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  );
};
