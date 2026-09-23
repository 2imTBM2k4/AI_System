import React, { useState } from 'react';
import {
  FolderGit2,
  Plus,
  Server,
  Zap,
  GitFork,
  Loader2,
  X,
  Sun,
  Moon,
  Activity,
} from 'lucide-react';
import type { RepoDto } from '@squad/shared-types';
import { registerRepo, detectRepoInfo, getRepoConfig, updateRepoConfig } from '../../api/client';
import { GlassButton } from '../glass/GlassButton';
import { useServerHealth } from '../../hooks/useServerHealth';

interface HeaderProps {
  repos: RepoDto[];
  selectedRepoId: string | null;
  onSelectRepo: (id: string) => void;
  onRepoAdded: () => void;
  isConnected: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  activeViewTitle?: string;
}

type ExecutionMode = 'direct' | 'worktree';

const ServerStatusBadge: React.FC<{ isConnected: boolean }> = ({ isConnected }) => {
  const { isOnline, latencyMs, info } = useServerHealth(3000);
  const [showDetail, setShowDetail] = useState(false);

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '0s';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        className="flex items-center gap-2 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400 bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] backdrop-blur-md px-3 py-1.5 rounded-full border border-black/[0.08] dark:border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] cursor-pointer transition-all select-none"
        title="Bấm để xem chi tiết tình trạng Server real-time"
      >
        <Server className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
        <span>127.0.0.1:4317</span>

        {isOnline ? (
          <>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
              {latencyMs !== null ? `${latencyMs}ms` : ''}
            </span>
            <span
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                isConnected
                  ? 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                  : 'bg-amber-500 dark:bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
              }`}
              title={isConnected ? 'Server Online • Live SSE Stream' : 'Server Online • Idle'}
            />
          </>
        ) : (
          <>
            <span className="text-[10px] text-rose-500 font-semibold font-mono">Offline</span>
            <span
              className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
              title="Mất kết nối server"
            />
          </>
        )}
      </button>

      {/* Popover detail */}
      {showDetail && (
        <div
          className="absolute right-0 top-full mt-2 w-72 p-4 rounded-2xl bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl border border-black/10 dark:border-white/[0.12] shadow-2xl z-50 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150 text-zinc-800 dark:text-zinc-200"
        >
          <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-1.5 font-bold">
              <Activity className="w-4 h-4 text-indigo-500" />
              <span>Real-Time Server Health</span>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                isOnline
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
              }`}
            >
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="space-y-1.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center justify-between">
              <span>Endpoint:</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-semibold">127.0.0.1:4317</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Latency (Ping):</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {latencyMs !== null ? `${latencyMs} ms` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>SSE Live Stream:</span>
              <span className={isConnected ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400'}>
                {isConnected ? 'Connected (Active)' : 'Idle / Ready'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Server Uptime:</span>
              <span className="text-zinc-800 dark:text-zinc-200">{formatUptime(info?.uptime)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Registered Repos:</span>
              <span className="text-zinc-800 dark:text-zinc-200">{info?.registeredRepos ?? 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({
  repos,
  selectedRepoId,
  onSelectRepo,
  onRepoAdded,
  isConnected,
  theme = 'dark',
  onToggleTheme,
  activeViewTitle,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('direct');
  const [detectedPM, setDetectedPM] = useState<string | null>(null);
  const [bootstrapCmd, setBootstrapCmd] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  const resetModal = () => {
    setRepoPath('');
    setExecutionMode('direct');
    setDetectedPM(null);
    setBootstrapCmd('');
    setIsDetecting(false);
    setIsSubmitting(false);
    setSubmitError(null);
  };

  const handleDetect = async (path: string) => {
    if (!path.trim()) return;
    setIsDetecting(true);
    try {
      const info = await detectRepoInfo(path.trim());
      setDetectedPM(info.packageManager);
      setBootstrapCmd(info.bootstrap.join(' && '));
    } catch {
      setDetectedPM(null);
      setBootstrapCmd('');
    } finally {
      setIsDetecting(false);
    }
  };

  const handlePathBlur = () => {
    if (repoPath.trim()) {
      handleDetect(repoPath);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const result = await registerRepo(repoPath.trim());
      const repoId = result.repo.id;

      try {
        const { config } = await getRepoConfig(repoId);
        const updatedConfig = {
          ...config,
          executionMode,
          ...(executionMode === 'worktree' && bootstrapCmd.trim()
            ? { bootstrap: bootstrapCmd.split('&&').map((s) => s.trim()).filter(Boolean) }
            : {}),
        };
        await updateRepoConfig(repoId, updatedConfig);
      } catch {
        // config update fallback
      }

      resetModal();
      setShowAddModal(false);
      onRepoAdded();
      onSelectRepo(repoId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Lỗi đăng ký repo');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="h-16 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/75 dark:bg-zinc-950/75 backdrop-blur-xl px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.25)] transition-colors duration-200">
        {/* Left Section: Active View Title / Breadcrumb */}
        <div className="flex items-center gap-4">
          {activeViewTitle && (
            <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight hidden sm:block">
              {activeViewTitle}
            </h1>
          )}
        </div>

        {/* Center / Repo Selector Section */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 p-1 pl-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08]">
            <FolderGit2 className="w-4 h-4 text-indigo-500 shrink-0" />
            <select
              aria-label="Chọn Repository"
              className="bg-transparent text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none cursor-pointer max-w-xs md:max-w-md truncate"
              value={selectedRepoId || ''}
              onChange={(e) => onSelectRepo(e.target.value)}
              title={selectedRepo ? selectedRepo.path : 'Chọn repository dự án'}
            >
              {repos.length === 0 ? (
                <option value="" className="bg-white dark:bg-zinc-900 text-zinc-400">
                  Chưa có repository nào
                </option>
              ) : (
                repos.map((r) => (
                  <option
                    key={r.id}
                    value={r.id}
                    className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                  >
                    {r.name || r.path.split(/[/\\]/).pop()} ({r.path})
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={() => {
                resetModal();
                setShowAddModal(true);
              }}
              className="p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold px-2.5"
              title="Đăng ký thêm thư mục repository mới"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Thêm Repo</span>
            </button>
          </div>
        </div>

        {/* Right Section: Server Status Indicator & Theme Switcher */}
        <div className="flex items-center gap-3 relative">
          <ServerStatusBadge isConnected={isConnected} />

          {/* Theme switcher */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] text-zinc-700 dark:text-zinc-300 border border-black/10 dark:border-white/10 transition-all cursor-pointer backdrop-blur-md shadow-sm active:scale-95"
              title={
                theme === 'dark'
                  ? 'Chuyển sang Giao diện Sáng (Light Mode)'
                  : 'Chuyển sang Giao diện Tối (Dark Mode)'
              }
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 animate-in spin-in-180 duration-300" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600 animate-in spin-in-180 duration-300" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Modal Đăng Ký Repo */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl border border-black/10 dark:border-white/[0.12] rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-zinc-900 dark:text-zinc-100">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-md">
                  <FolderGit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    Đăng Ký Repository Dự Án
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Nhập đường dẫn thư mục mã nguồn để bắt đầu điều phối đa agent
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Đường dẫn thư mục dự án (Path) *
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: C:\Users\Admin\Documents\Working\MyProject"
                  className="liquid-glass-input w-full rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  onBlur={handlePathBlur}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                  Chế độ thực thi (Execution Mode)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExecutionMode('direct')}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                      executionMode === 'direct'
                        ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-500/15 ring-1 ring-indigo-500/30'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Zap className={`w-3.5 h-3.5 ${executionMode === 'direct' ? 'text-indigo-600' : 'text-zinc-400'}`} />
                      <span className="text-xs font-bold">Direct Mode</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Chỉnh sửa trực tiếp thư mục dự án. Nhanh và đơn giản.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setExecutionMode('worktree');
                      if (repoPath.trim() && !detectedPM) handleDetect(repoPath);
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                      executionMode === 'worktree'
                        ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-500/15 ring-1 ring-emerald-500/30'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <GitFork className={`w-3.5 h-3.5 ${executionMode === 'worktree' ? 'text-emerald-600' : 'text-zinc-400'}`} />
                      <span className="text-xs font-bold">Worktree Mode</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Cách ly an toàn trên Git worktrees riêng biệt.
                    </p>
                  </button>
                </div>
              </div>

              {executionMode === 'worktree' && (
                <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Bootstrap Command
                    </label>
                    {isDetecting && (
                      <span className="flex items-center gap-1 text-xs text-zinc-400 font-mono">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Đang dò...
                      </span>
                    )}
                    {!isDetecting && detectedPM && (
                      <span className="text-xs text-emerald-600 font-mono font-medium">
                        ✓ {detectedPM}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="pnpm install"
                    className="liquid-glass-input w-full rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none"
                    value={bootstrapCmd}
                    onChange={(e) => setBootstrapCmd(e.target.value)}
                  />
                </div>
              )}

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setShowAddModal(false)}
                >
                  Hủy
                </GlassButton>
                <GlassButton
                  type="submit"
                  variant="primary"
                  size="md"
                  glow
                  disabled={isSubmitting || !repoPath.trim()}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang đăng ký...</span>
                    </>
                  ) : (
                    <span>Đăng Ký Repo</span>
                  )}
                </GlassButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
