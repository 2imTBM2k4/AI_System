import React, { useState, useEffect } from 'react';
import {
  Puzzle,
  Terminal,
  Package,
  Wrench,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Bot,
} from 'lucide-react';
import type { SquadConfigDto, McpServerDto, SkillConfigDto, PluginConfigDto } from '@squad/shared-types';
import { getRepoConfig, updateRepoConfig } from '../../api/client';
import { GlassButton } from '../glass/GlassButton';
import { GlassBadge } from '../glass/GlassBadge';
import { GlassCard } from '../glass/GlassCard';

interface ExtensionsViewProps {
  selectedRepoId: string | null;
  onSaved?: () => void;
}

export const ExtensionsView: React.FC<ExtensionsViewProps> = ({ selectedRepoId, onSaved }) => {
  const [repoConfig, setRepoConfig] = useState<SquadConfigDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sub-tab selection: 'mcp' | 'skills' | 'plugins'
  const [subTab, setSubTab] = useState<'mcp' | 'skills' | 'plugins'>('mcp');

  // MCP server state
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpCommand, setNewMcpCommand] = useState('npx');
  const [newMcpArgs, setNewMcpArgs] = useState('');

  // Skill state
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillPath, setNewSkillPath] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');

  // Plugin state
  const [showAddPlugin, setShowAddPlugin] = useState(false);
  const [newPluginName, setNewPluginName] = useState('');
  const [newPluginVersion, setNewPluginVersion] = useState('1.0.0');

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!selectedRepoId) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const cfgData = await getRepoConfig(selectedRepoId);
        if (active) {
          setRepoConfig(cfgData.config);
        }
      } catch (err) {
        if (active) {
          setFeedback({
            type: 'error',
            message: err instanceof Error ? err.message : 'Không thể tải cấu hình MCP & Plugins',
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

  // MCP handlers
  const handleToggleMcp = (name: string, enabled: boolean) => {
    if (!repoConfig) return;
    const currentMcp: McpServerDto = repoConfig.mcpServers?.[name] || { name, command: 'npx', enabled: true };
    setRepoConfig({
      ...repoConfig,
      mcpServers: {
        ...(repoConfig.mcpServers || {}),
        [name]: {
          ...currentMcp,
          name,
          enabled,
        },
      },
    });
  };

  const handleAddMcp = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMcpName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!name || !repoConfig) return;

    const args = newMcpArgs
      .trim()
      .split(' ')
      .filter((s) => s.length > 0);

    const newMcp: McpServerDto = {
      name,
      command: newMcpCommand.trim(),
      args,
      enabled: true,
    };

    setRepoConfig({
      ...repoConfig,
      mcpServers: {
        ...(repoConfig.mcpServers || {}),
        [name]: newMcp,
      },
    });

    setNewMcpName('');
    setNewMcpCommand('npx');
    setNewMcpArgs('');
    setShowAddMcp(false);
  };

  const handleDeleteMcp = (name: string) => {
    if (!repoConfig?.mcpServers) return;
    const nextMcp = { ...repoConfig.mcpServers };
    delete nextMcp[name];
    setRepoConfig({
      ...repoConfig,
      mcpServers: nextMcp,
    });
  };

  // Skill handlers
  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSkillName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!name || !repoConfig) return;

    const newSkill: SkillConfigDto = {
      name,
      path: newSkillPath.trim(),
      description: newSkillDesc.trim(),
      enabled: true,
    };

    setRepoConfig({
      ...repoConfig,
      skills: {
        ...(repoConfig.skills || {}),
        [name]: newSkill,
      },
    });

    setNewSkillName('');
    setNewSkillPath('');
    setNewSkillDesc('');
    setShowAddSkill(false);
  };

  const handleToggleSkill = (name: string, enabled: boolean) => {
    if (!repoConfig) return;
    const current: SkillConfigDto = repoConfig.skills?.[name] || { name, path: '', enabled: true };
    setRepoConfig({
      ...repoConfig,
      skills: {
        ...(repoConfig.skills || {}),
        [name]: {
          ...current,
          name,
          enabled,
        },
      },
    });
  };

  const handleDeleteSkill = (name: string) => {
    if (!repoConfig?.skills) return;
    const nextSkills = { ...repoConfig.skills };
    delete nextSkills[name];
    setRepoConfig({
      ...repoConfig,
      skills: nextSkills,
    });
  };

  // Plugin handlers
  const handleAddPlugin = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPluginName.trim();
    if (!name || !repoConfig) return;

    const newPlugin: PluginConfigDto = {
      name,
      version: newPluginVersion.trim() || '1.0.0',
      enabled: true,
    };

    setRepoConfig({
      ...repoConfig,
      plugins: {
        ...(repoConfig.plugins || {}),
        [name]: newPlugin,
      },
    });

    setNewPluginName('');
    setNewPluginVersion('1.0.0');
    setShowAddPlugin(false);
  };

  const handleTogglePlugin = (name: string, enabled: boolean) => {
    if (!repoConfig) return;
    const current: PluginConfigDto = repoConfig.plugins?.[name] || { name, version: '1.0.0', enabled: true };
    setRepoConfig({
      ...repoConfig,
      plugins: {
        ...(repoConfig.plugins || {}),
        [name]: {
          ...current,
          name,
          enabled,
        },
      },
    });
  };

  const handleDeletePlugin = (name: string) => {
    if (!repoConfig?.plugins) return;
    const nextPlugins = { ...repoConfig.plugins };
    delete nextPlugins[name];
    setRepoConfig({
      ...repoConfig,
      plugins: nextPlugins,
    });
  };

  const handleSave = async () => {
    if (!selectedRepoId || !repoConfig) return;
    try {
      setIsSaving(true);
      setFeedback(null);
      await updateRepoConfig(selectedRepoId, repoConfig);
      setFeedback({
        type: 'success',
        message: 'Đã lưu cấu hình MCP Servers, Skills & Plugins thành công!',
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

  if (!selectedRepoId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <GlassCard variant="default" className="text-center py-16 p-8 max-w-md mx-auto">
          <Bot className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-1">
            Chưa Chọn Repository
          </h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Vui lòng chọn một repository ở thanh menu trên để quản lý MCP, Skills và Plugins.
          </p>
        </GlassCard>
      </div>
    );
  }

  const mcpCount = Object.keys(repoConfig?.mcpServers || {}).length;
  const skillsCount = Object.keys(repoConfig?.skills || {}).length;
  const pluginsCount = Object.keys(repoConfig?.plugins || {}).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/20">
            <Puzzle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Thiết Lập Skills, MCP Servers &amp; Plugins
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Mở rộng năng lực tương tác hệ thống, database, CLI và kịch bản nghiệp vụ cho các Agents.
            </p>
          </div>
        </div>

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
              <span>Lưu Cấu Hình</span>
            </>
          )}
        </GlassButton>
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

      {/* Sub-tab navigation */}
      <div className="flex items-center gap-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-1">
        <button
          type="button"
          onClick={() => setSubTab('mcp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'mcp'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>MCP Servers ({mcpCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('skills')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'skills'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Skills ({skillsCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('plugins')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'plugins'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Plugins ({pluginsCount})</span>
        </button>
      </div>

      {isLoading || !repoConfig ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Đang nạp cấu hình extensions...
          </span>
        </div>
      ) : (
        <>
          {/* TAB 1: MCP SERVERS */}
          {subTab === 'mcp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Model Context Protocol (MCP) Servers
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Cung cấp công cụ mở rộng tiêu chuẩn MCP cho các agent (Filesystem, Postgres, Git, v.v.)
                  </p>
                </div>
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddMcp((v) => !v)}
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Thêm MCP Server</span>
                </GlassButton>
              </div>

              {showAddMcp && (
                <form
                  onSubmit={handleAddMcp}
                  className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-indigo-400/40 space-y-4 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl shadow-lg"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
                      Đăng Ký MCP Server Mới
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddMcp(false)}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                        Tên Định Danh (Key ID) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: filesystem, postgres..."
                        value={newMcpName}
                        onChange={(e) => setNewMcpName(e.target.value)}
                        className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                        Command Thực Thi *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: npx, node, python..."
                        value={newMcpCommand}
                        onChange={(e) => setNewMcpCommand(e.target.value)}
                        className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                      Arguments (cách nhau bởi dấu cách)
                    </label>
                    <input
                      type="text"
                      placeholder="-y @modelcontextprotocol/server-filesystem C:\Projects"
                      value={newMcpArgs}
                      onChange={(e) => setNewMcpArgs(e.target.value)}
                      className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <GlassButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddMcp(false)}
                    >
                      Hủy
                    </GlassButton>
                    <GlassButton type="submit" variant="primary" size="sm">
                      Xác Nhận Thêm
                    </GlassButton>
                  </div>
                </form>
              )}

              {Object.entries(repoConfig.mcpServers || {}).length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-zinc-500 font-mono">
                  Chưa có MCP Server nào được khai báo. Hãy bấm &quot;Thêm MCP Server&quot; để cấu hình.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(repoConfig.mcpServers || {}).map(([name, mcp]) => (
                    <div
                      key={name}
                      className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`mcp-enable-${name}`}
                          checked={mcp.enabled !== false}
                          onChange={(e) => handleToggleMcp(name, e.target.checked)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 cursor-pointer accent-indigo-500"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`mcp-enable-${name}`}
                              className="text-sm font-bold text-zinc-900 dark:text-zinc-100 cursor-pointer"
                            >
                              {name}
                            </label>
                            <GlassBadge variant="indigo">
                              <span className="text-[9px] font-mono uppercase">MCP</span>
                            </GlassBadge>
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                            <code>{mcp.command} {(mcp.args || []).join(' ')}</code>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteMcp(name)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Xóa MCP Server này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SKILLS */}
          {subTab === 'skills' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Agent Custom Skills
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Các kỹ năng chuyên biệt (SKILL.md, tài liệu hướng dẫn) được nạp theo ngữ cảnh cho các agent.
                  </p>
                </div>
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddSkill((v) => !v)}
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Thêm Skill</span>
                </GlassButton>
              </div>

              {showAddSkill && (
                <form
                  onSubmit={handleAddSkill}
                  className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-indigo-400/40 space-y-4 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl shadow-lg"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
                      Đăng Ký Skill Mới
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddSkill(false)}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                        Tên Skill *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: deploy-k8s, sql-optimizer..."
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                        Đường Dẫn Tới Thư Mục Skill (Path) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder=".squad/skills/my-skill"
                        value={newSkillPath}
                        onChange={(e) => setNewSkillPath(e.target.value)}
                        className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                      Mô Tả Kỹ Năng
                    </label>
                    <input
                      type="text"
                      placeholder="Hướng dẫn triển khai cụm Kubernetes hoặc chạy kiểm thử..."
                      value={newSkillDesc}
                      onChange={(e) => setNewSkillDesc(e.target.value)}
                      className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <GlassButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddSkill(false)}
                    >
                      Hủy
                    </GlassButton>
                    <GlassButton type="submit" variant="primary" size="sm">
                      Xác Nhận Thêm
                    </GlassButton>
                  </div>
                </form>
              )}

              {Object.entries(repoConfig.skills || {}).length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-zinc-500 font-mono">
                  Chưa có Skill nào được cấu hình trong dự án.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(repoConfig.skills || {}).map(([name, skill]) => (
                    <div
                      key={name}
                      className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`skill-enable-${name}`}
                          checked={skill.enabled !== false}
                          onChange={(e) => handleToggleSkill(name, e.target.checked)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 cursor-pointer accent-indigo-500"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`skill-enable-${name}`}
                              className="text-sm font-bold text-zinc-900 dark:text-zinc-100 cursor-pointer"
                            >
                              {name}
                            </label>
                            <GlassBadge variant="cyan">
                              <span className="text-[9px] font-mono uppercase">SKILL</span>
                            </GlassBadge>
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                            {skill.description || skill.path}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(name)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Xóa Skill này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PLUGINS */}
          {subTab === 'plugins' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Plugins Đã Kích Hoạt
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Các gói plugin tiện ích đóng gói sẵn cho hệ thống Squad Orchestrator.
                  </p>
                </div>
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddPlugin((v) => !v)}
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Thêm Plugin</span>
                </GlassButton>
              </div>

              {showAddPlugin && (
                <form
                  onSubmit={handleAddPlugin}
                  className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-indigo-400/40 space-y-4 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl shadow-lg"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
                      Khai Báo Plugin Mới
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddPlugin(false)}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                        Tên Plugin *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="@squad/plugin-git-hooks"
                        value={newPluginName}
                        onChange={(e) => setNewPluginName(e.target.value)}
                        className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1 font-mono">
                        Phiên Bản (Version)
                      </label>
                      <input
                        type="text"
                        placeholder="1.0.0"
                        value={newPluginVersion}
                        onChange={(e) => setNewPluginVersion(e.target.value)}
                        className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <GlassButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddPlugin(false)}
                    >
                      Hủy
                    </GlassButton>
                    <GlassButton type="submit" variant="primary" size="sm">
                      Xác Nhận Thêm
                    </GlassButton>
                  </div>
                </form>
              )}

              {Object.entries(repoConfig.plugins || {}).length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-zinc-500 font-mono">
                  Chưa có Plugin nào được đăng ký trong dự án.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(repoConfig.plugins || {}).map(([name, plug]) => (
                    <div
                      key={name}
                      className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`plug-enable-${name}`}
                          checked={plug.enabled !== false}
                          onChange={(e) => handleTogglePlugin(name, e.target.checked)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 cursor-pointer accent-indigo-500"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`plug-enable-${name}`}
                              className="text-sm font-bold text-zinc-900 dark:text-zinc-100 cursor-pointer"
                            >
                              {name}
                            </label>
                            <GlassBadge variant="emerald">
                              <span className="text-[9px] font-mono uppercase">PLUGIN</span>
                            </GlassBadge>
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                            v{plug.version}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeletePlugin(name)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Xóa Plugin này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
