import React, { useState, useEffect } from 'react';
import {
  Layers,
  Sparkles,
  Plus,
  Trash2,
  FileText,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Bot,
} from 'lucide-react';
import type {
  ProviderConfigDto,
  SquadConfigDto,
} from '@squad/shared-types';
import {
  getProviders,
  getRepoConfig,
  updateRepoConfig,
} from '../../api/client';
import { GlassButton } from '../glass/GlassButton';
import { GlassBadge } from '../glass/GlassBadge';
import { GlassCard } from '../glass/GlassCard';
import { AgentFileEditorModal } from '../providers/AgentFileEditorModal';

interface AgentsViewProps {
  selectedRepoId: string | null;
  onSaved?: () => void;
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
};

export const AgentsView: React.FC<AgentsViewProps> = ({ selectedRepoId, onSaved }) => {
  const [providers, setProviders] = useState<ProviderConfigDto[]>([]);
  const [repoConfig, setRepoConfig] = useState<SquadConfigDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add role state
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRoleDuty, setNewRoleDuty] = useState('');
  const [newRoleCli, setNewRoleCli] = useState('9router');
  const [newRoleModel, setNewRoleModel] = useState('');

  // Markdown editor state
  const [editingRoleFile, setEditingRoleFile] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setIsLoading(true);
        const provData = await getProviders();
        if (active) {
          setProviders(provData.providers);
        }

        if (selectedRepoId) {
          const cfgData = await getRepoConfig(selectedRepoId);
          if (active) {
            setRepoConfig(cfgData.config);
          }
        }
      } catch (err) {
        if (active) {
          setFeedback({
            type: 'error',
            message: err instanceof Error ? err.message : 'Không thể tải cấu hình Agents',
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
  }, [selectedRepoId]);

  const handleRoleModelChange = (role: string, model: string) => {
    if (!repoConfig) return;
    const currentAgent = repoConfig.agents[role] || { cli: '9router' };
    let cli = currentAgent.cli || '9router';
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

  const handleRoleDutyChange = (role: string, duty: string) => {
    if (!repoConfig) return;
    const currentAgent = repoConfig.agents[role] || {};
    setRepoConfig({
      ...repoConfig,
      agents: {
        ...repoConfig.agents,
        [role]: {
          ...currentAgent,
          duty,
        },
      },
    });
  };

  const handleAddRole = (e: React.FormEvent) => {
    e.preventDefault();
    const key = newRoleKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!key || !repoConfig) return;
    setRepoConfig({
      ...repoConfig,
      agents: {
        ...repoConfig.agents,
        [key]: {
          cli: newRoleCli,
          model: newRoleModel || undefined,
          description: newRoleDescription || undefined,
          duty: newRoleDuty || undefined,
        },
      },
    });

    setNewRoleKey('');
    setNewRoleDescription('');
    setNewRoleDuty('');
    setNewRoleModel('');
    setNewRoleCli('9router');
    setShowAddRole(false);
  };

  const handleDeleteRole = (roleKey: string) => {
    if (!repoConfig) return;
    const nextAgents = { ...repoConfig.agents };
    delete nextAgents[roleKey];
    setRepoConfig({
      ...repoConfig,
      agents: nextAgents,
    });
  };

  const handleSave = async () => {
    if (!selectedRepoId || !repoConfig) return;
    try {
      setIsSaving(true);
      setFeedback(null);

      // Build updated squad.config.json with correct command and env
      const nineRouter = providers.find((p) => p.id === '9router');
      const updatedAgents = { ...repoConfig.agents };

      for (const [roleKey, spec] of Object.entries(updatedAgents)) {
        let command: string[] = spec.command || ['npx', '@squad/runner'];
        const envVars = { ...(spec.env || {}) };

        if (spec.cli === '9router') {
          const routerUrl = nineRouter?.baseUrl || 'http://127.0.0.1:20128/v1';
          const routerKey = nineRouter?.apiKey || 'sk-9router-local';
          envVars['OPENAI_BASE_URL'] = routerUrl;
          envVars['OPENAI_API_KEY'] = routerKey;
          envVars['ANTHROPIC_BASE_URL'] = routerUrl;
          envVars['ANTHROPIC_API_KEY'] = routerKey;
          envVars['GEMINI_BASE_URL'] = routerUrl;
          envVars['GEMINI_API_KEY'] = routerKey;
          command = ['npx', '@squad/runner', '--provider', 'openai-compatible'];
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
      setFeedback({
        type: 'success',
        message: 'Đã lưu cấu hình Agents vào squad.config.json thành công!',
      });
      if (onSaved) onSaved();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể lưu cấu hình Agents',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Gom toàn bộ danh sách models
  const getAllAvailableModels = () => {
    const list: string[] = [];
    for (const p of providers) {
      if (p.customModels) list.push(...p.customModels);
      if (COMMON_MODELS[p.id]) list.push(...COMMON_MODELS[p.id]);
    }
    return Array.from(new Set(list));
  };

  const availableModels = getAllAvailableModels();

  if (!selectedRepoId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <GlassCard variant="default" className="text-center py-16 p-8 max-w-md mx-auto">
          <Bot className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-1">
            Chưa Chọn Repository
          </h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Vui lòng chọn một repository ở thanh menu trên để xem và cấu hình các vai trò Agent cho dự án.
          </p>
        </GlassCard>
      </div>
    );
  }

  const standardRoles = [
    'pm',
    'techlead',
    'backend',
    'frontend',
    'mobile',
    'database',
    'qa',
    'devops',
    'default',
  ];
  const customRoleKeys = Object.keys(repoConfig?.agents || {}).filter(
    (k) => !standardRoles.includes(k) && !['planner', 'tester', 'reviewer'].includes(k)
  );
  const allRoleKeys = [...standardRoles, ...customRoleKeys];

  const getRoleBadgeVariant = (r: string): 'purple' | 'amber' | 'cyan' | 'emerald' | 'indigo' => {
    switch (r) {
      case 'pm':
      case 'planner':
        return 'purple';
      case 'techlead':
        return 'indigo';
      case 'backend':
      case 'database':
        return 'amber';
      case 'frontend':
      case 'mobile':
        return 'cyan';
      case 'qa':
      case 'tester':
      case 'devops':
        return 'emerald';
      default:
        return 'indigo';
    }
  };

  const getRoleTitle = (role: string, defaultDesc?: string): string => {
    switch (role) {
      case 'pm':
      case 'planner':
        return 'Project Manager (Khả thi, Timeline & Phân rã Task)';
      case 'techlead':
        return 'Tech Lead (Kiến trúc hệ thống & Hợp đồng API Contract)';
      case 'backend':
        return 'Backend Developer (API, Services & Business Logic)';
      case 'frontend':
        return 'Frontend Developer (Giao diện người dùng & Client State)';
      case 'mobile':
        return 'Mobile Developer (Ứng dụng di động Flutter/React Native/iOS/Android)';
      case 'database':
        return 'Database Engineer (Lược đồ dữ liệu, Migrations & Tối ưu Query)';
      case 'qa':
      case 'tester':
        return 'QA Tester (Kiểm thử chức năng, Nghiệp vụ & Duyệt chất lượng)';
      case 'devops':
        return 'DevOps Engineer (Kiểm tra môi trường, Build & Đóng gói bàn giao)';
      case 'default':
        return 'Agent Mặc Định (General Developer Fallback)';
      default:
        return defaultDesc || `Agent ${role}`;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Thiết Lập Vai Trò Agent (Multi-Agent Squad)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Phân bổ Model, CLI thực thi, hướng dẫn nghiệp vụ và tùy chỉnh file Prompt Markdown cho từng Agent.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <GlassButton
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setShowAddRole((v) => !v)}
          >
            <Plus className="w-4 h-4 text-indigo-500" />
            <span>Thêm Agent Vai Trò Mới</span>
          </GlassButton>

          <GlassButton
            type="button"
            variant="primary"
            size="md"
            glow
            disabled={isSaving || isLoading || !repoConfig}
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
                <span>Lưu Cấu Hình Agents</span>
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

      {/* Tip guide */}
      <GlassCard variant="glow-indigo" className="p-4 space-y-1.5">
        <div className="font-semibold flex items-center gap-2 text-indigo-900 dark:text-indigo-200 text-xs">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Hướng dẫn gán Model &amp; CLI tối ưu:</span>
        </div>
        <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed">
          - <strong>Planner Agent:</strong> Nên dùng mô hình có khả năng suy luận logic sâu (Claude 3.7 Sonnet Thinking, GPT-4o, Gemini 3.8 Flash).<br />
          - <strong>Backend &amp; Frontend:</strong> Có thể kết nối qua <strong>9Router</strong> để tận dụng các model mã nguồn mở hoặc token saver khi lập trình song song.<br />
          - Nhấn nút <strong>&quot;Chỉnh sửa Prompt Markdown&quot;</strong> để tinh chỉnh trực tiếp chỉ dẫn chi tiết của agent trong thư mục dự án.
        </p>
      </GlassCard>

      {/* Add Custom Role Form */}
      {showAddRole && (
        <form
          onSubmit={handleAddRole}
          className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-indigo-400/40 space-y-4 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl shadow-lg"
        >
          <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
              Thêm Agent Vai Trò Tùy Chỉnh (Custom Role)
            </h4>
            <button
              type="button"
              onClick={() => setShowAddRole(false)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                Tên Vai Trò (Key ID, chữ thường không dấu) *
              </label>
              <input
                type="text"
                required
                placeholder="Ví dụ: database, devops, security..."
                value={newRoleKey}
                onChange={(e) => setNewRoleKey(e.target.value)}
                className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                Mô Tả Hiển Thị
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Chuyên viên tối ưu cơ sở dữ liệu"
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
                className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
              Nhiệm Vụ &amp; Nguyên Tắc Hoạt Động (Duty)
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Tối ưu query, thêm index và thiết kế migrations SQL an toàn..."
              value={newRoleDuty}
              onChange={(e) => setNewRoleDuty(e.target.value)}
              className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                CLI Tool Thực Thi
              </label>
              <select
                value={newRoleCli}
                onChange={(e) => setNewRoleCli(e.target.value)}
                className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none cursor-pointer"
              >
                <option value="9router">9Router Gateway (Khuyên dùng ⭐)</option>
                <option value="claude">Claude Code CLI</option>
                <option value="codex">OpenAI Codex CLI</option>
                <option value="gemini">Google Gemini CLI</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                Model Khởi Tạo Mặc Định
              </label>
              <input
                type="text"
                list="models-list-new"
                placeholder="ag/gemini-3.8-flash"
                value={newRoleModel}
                onChange={(e) => setNewRoleModel(e.target.value)}
                className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
              />
              <datalist id="models-list-new">
                {availableModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAddRole(false)}
            >
              Hủy
            </GlassButton>
            <GlassButton type="submit" variant="primary" size="sm">
              Xác Nhận Thêm Agent
            </GlassButton>
          </div>
        </form>
      )}

      {/* Danh sách Roles */}
      {isLoading || !repoConfig ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Đang nạp cấu hình vai trò Agents...
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {allRoleKeys.map((role) => {
            const spec = repoConfig.agents[role] || {
              cli: '9router',
              model: 'ag/gemini-3.8-flash',
            };
            const isStandard = standardRoles.includes(role);

            return (
              <div
                key={role}
                className="p-5 rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl shadow-sm space-y-4 transition-all hover:border-black/20 dark:hover:border-white/20"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <GlassBadge variant={getRoleBadgeVariant(role)}>
                      <span className="uppercase tracking-wider font-bold text-[10px]">
                        {role}
                      </span>
                    </GlassBadge>
                    <div>
                      <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {getRoleTitle(role, spec.description)}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                        Role Key: {role}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <GlassButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingRoleFile(role)}
                      title="Mở trình soạn thảo Markdown Prompt cho vai trò này"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Sửa Prompt (.md)</span>
                    </GlassButton>

                    {!isStandard && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(role)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Xóa vai trò tùy chỉnh này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                      CLI Tool Thực Thi
                    </label>
                    <select
                      value={spec.cli || '9router'}
                      onChange={(e) => handleRoleCliChange(role, e.target.value)}
                      className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none cursor-pointer"
                    >
                      <option value="9router">9Router Gateway (Khuyên dùng ⭐)</option>
                      <option value="claude">Claude Code CLI</option>
                      <option value="codex">OpenAI Codex CLI</option>
                      <option value="gemini">Google Gemini CLI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                      Model Được Gán
                    </label>
                    <input
                      type="text"
                      list={`models-list-${role}`}
                      value={spec.model || ''}
                      onChange={(e) => handleRoleModelChange(role, e.target.value)}
                      placeholder="Chọn hoặc nhập tên Model..."
                      className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                    />
                    <datalist id={`models-list-${role}`}>
                      {availableModels.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                    Nhiệm Vụ &amp; Phạm Vi Nghiệp Vụ (Duty)
                  </label>
                  <input
                    type="text"
                    value={spec.duty || ''}
                    onChange={(e) => handleRoleDutyChange(role, e.target.value)}
                    placeholder="Mô tả phạm vi trách nhiệm của agent này khi nhận task..."
                    className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agent Markdown File Editor Modal */}
      {selectedRepoId && (
        <AgentFileEditorModal
          isOpen={Boolean(editingRoleFile)}
          repoId={selectedRepoId}
          role={editingRoleFile || ''}
          onClose={() => setEditingRoleFile(null)}
        />
      )}
    </div>
  );
};
