import React, { useState, useEffect } from 'react';
import {
  Wifi,
  Sparkles,
  Eye,
  EyeOff,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import type {
  ProviderConfigDto,
  TestProviderResponse,
} from '@squad/shared-types';
import { getProviders, saveProviders, testProvider } from '../../api/client';
import { GlassButton } from '../glass/GlassButton';
import { GlassBadge } from '../glass/GlassBadge';
import { GlassCard } from '../glass/GlassCard';

interface ProvidersViewProps {
  onSaved?: () => void;
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

export const ProvidersView: React.FC<ProvidersViewProps> = ({ onSaved }) => {
  const [providers, setProviders] = useState<ProviderConfigDto[]>([]);
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

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setIsLoading(true);
        const data = await getProviders();
        if (active) {
          setProviders(data.providers);
        }
      } catch (err) {
        if (active) {
          setFeedback({
            type: 'error',
            message: err instanceof Error ? err.message : 'Không thể tải cấu hình AI providers',
          });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, []);

  const handleProviderToggle = (id: string, enabled: boolean) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled } : p))
    );
  };

  const handleProviderChange = (
    id: string,
    field: keyof ProviderConfigDto,
    value: string
  ) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleToggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleTestProvider = async (provider: ProviderConfigDto) => {
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

  const handleAddCustomProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customBaseUrl.trim()) return;

    const id = `custom_${customName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
    const newProv: ProviderConfigDto = {
      id,
      name: customName.trim(),
      baseUrl: customBaseUrl.trim(),
      apiKey: customApiKey.trim() || undefined,
      enabled: true,
      customModels: ['deepseek-chat', 'deepseek-reasoner'],
    };

    setProviders((prev) => [...prev, newProv]);
    setCustomName('');
    setCustomBaseUrl('');
    setCustomApiKey('');
    setShowAddCustom(false);
  };

  const handleDeleteCustomProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setFeedback(null);
      await saveProviders(providers);
      setFeedback({
        type: 'success',
        message: 'Đã lưu cấu hình AI Providers thành công!',
      });
      if (onSaved) onSaved();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể lưu cấu hình',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const nineRouter = providers.find((p) => p.id === '9router');

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/20">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Thiết Lập Nhà Cung Cấp Model (AI Providers &amp; 9Router)
              </h2>
              {nineRouter?.enabled && (
                <GlassBadge variant="emerald" dot pulse>
                  <span className="text-[10px] font-bold">9Router Active</span>
                </GlassBadge>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Quản lý API Keys, 9Router Gateway cục bộ, và kiểm tra kết nối thời gian thực với các mô hình AI.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <GlassButton
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setShowAddCustom((v) => !v)}
          >
            <Plus className="w-4 h-4 text-indigo-500" />
            <span>Thêm Custom Provider</span>
          </GlassButton>

          <GlassButton
            type="button"
            variant="primary"
            size="md"
            glow
            disabled={isSaving || isLoading}
            onClick={handleSave}
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

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 backdrop-blur-md animate-in fade-in duration-200 ${
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
            <span className="font-medium">{feedback.message}</span>
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

      {/* 9Router Highlight Box */}
      <GlassCard variant="glow-indigo" className="p-5 space-y-2">
        <div className="font-semibold flex items-center gap-2 text-indigo-900 dark:text-indigo-200 text-sm">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Khuyên dùng: 9Router Local AI Gateway</span>
        </div>
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-xs">
          9Router giúp gom các tài khoản AI (Claude, Gemini, OpenAI, OpenRouter), tự động cân bằng tải (round-robin), chống rate limit 429 khi nhiều coding agent chạy song song, và tự động tối ưu token.
        </p>
      </GlassCard>

      {/* Form thêm custom provider */}
      {showAddCustom && (
        <form
          onSubmit={handleAddCustomProvider}
          className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-indigo-400/40 space-y-4 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl shadow-lg"
        >
          <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
              Thêm Nhà Cung Cấp Mới (OpenAI-Compatible / Ollama / Groq)
            </h4>
            <button
              type="button"
              onClick={() => setShowAddCustom(false)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
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
                placeholder="Ví dụ: Ollama, Groq, OpenRouter..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                Base URL Endpoint *
              </label>
              <input
                type="text"
                required
                placeholder="Ví dụ: http://localhost:11434/v1"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
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
                className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
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
            <GlassButton type="submit" variant="primary" size="sm">
              Xác Nhận Thêm
            </GlassButton>
          </div>
        </form>
      )}

      {/* Danh sách Providers */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 dark:text-indigo-400" />
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Đang nạp danh sách providers...
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => {
            const is9Router = p.id === '9router';
            const isCustom = p.id.startsWith('custom_') || p.id === 'custom';
            const testStatus = testStatuses[p.id];
            const isKeyVisible = showKeys[p.id] || false;

            return (
              <div
                key={p.id}
                className={`p-5 rounded-2xl border transition-all duration-200 backdrop-blur-xl ${
                  p.enabled
                    ? 'bg-white/80 dark:bg-zinc-900/80 border-black/10 dark:border-white/10 shadow-sm'
                    : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.05] dark:border-white/[0.05] opacity-75'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`enable-${p.id}`}
                      checked={p.enabled}
                      onChange={(e) => handleProviderToggle(p.id, e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 cursor-pointer accent-indigo-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`enable-${p.id}`}
                          className="text-sm font-bold text-zinc-900 dark:text-zinc-100 cursor-pointer"
                        >
                          {p.name}
                        </label>
                        {is9Router && (
                          <GlassBadge variant="indigo">
                            <span className="text-[9px] font-bold uppercase">Gateway Cục Bộ</span>
                          </GlassBadge>
                        )}
                        {isCustom && (
                          <GlassBadge variant="cyan">
                            <span className="text-[9px] font-bold uppercase">Custom API</span>
                          </GlassBadge>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                        ID: {p.id}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Kết quả Test */}
                    {testStatus && !testStatus.testing && testStatus.result && (
                      <span
                        className={`text-xs font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                          testStatus.result.success
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {testStatus.result.success ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{testStatus.result.latencyMs}ms</span>
                            <span className="text-[10px]">({testStatus.result.models.length} models)</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Lỗi kết nối</span>
                          </>
                        )}
                      </span>
                    )}

                    <GlassButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={testStatus?.testing}
                      onClick={() => handleTestProvider(p)}
                    >
                      {testStatus?.testing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang kiểm tra...</span>
                        </>
                      ) : (
                        <span>Kiểm Tra Kết Nối (Ping)</span>
                      )}
                    </GlassButton>

                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomProvider(p.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Xóa Custom Provider này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                      Base URL Endpoint
                    </label>
                    <input
                      type="text"
                      value={p.baseUrl || ''}
                      onChange={(e) => handleProviderChange(p.id, 'baseUrl', e.target.value)}
                      placeholder={is9Router ? 'http://127.0.0.1:20128/v1' : 'https://api.openai.com/v1'}
                      className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 font-mono flex items-center justify-between">
                      <span>API Key</span>
                      <button
                        type="button"
                        onClick={() => handleToggleShowKey(p.id)}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1 font-sans cursor-pointer text-[10px]"
                      >
                        {isKeyVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{isKeyVisible ? 'Ẩn' : 'Hiện'}</span>
                      </button>
                    </label>
                    <input
                      type={isKeyVisible ? 'text' : 'password'}
                      value={p.apiKey || ''}
                      onChange={(e) => handleProviderChange(p.id, 'apiKey', e.target.value)}
                      placeholder={is9Router ? 'sk-9router-... (để trống nếu không dùng auth)' : 'sk-ant-... hoặc sk-...'}
                      className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Models tags */}
                <div className="pt-3">
                  <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 block mb-1.5">
                    Các Model khả dụng ({p.customModels?.length || COMMON_MODELS[p.id]?.length || 0}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(p.customModels || COMMON_MODELS[p.id] || []).map((m) => (
                      <span
                        key={m}
                        className="px-2 py-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] border border-black/10 dark:border-white/10 text-[10px] font-mono text-zinc-700 dark:text-zinc-300"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
