import React, { useState } from 'react';
import { GitBranch, FolderGit2, Plus, Server, Cpu, Zap, GitFork, Loader2, X, Sun, Moon } from 'lucide-react';
import type { RepoDto } from '@squad/shared-types';
import { registerRepo, detectRepoInfo, getRepoConfig, updateRepoConfig } from '../../api/client';
import { GlassButton } from '../glass/GlassButton';

interface HeaderProps {
  repos: RepoDto[];
  selectedRepoId: string | null;
  onSelectRepo: (id: string) => void;
  onRepoAdded: () => void;
  onOpenAiHub: () => void;
  isConnected: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

type ExecutionMode = 'direct' | 'worktree';

export const Header: React.FC<HeaderProps> = ({
  repos,
  selectedRepoId,
  onSelectRepo,
  onRepoAdded,
  onOpenAiHub,
  isConnected,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('direct');
  const [detectedPM, setDetectedPM] = useState<string | null>(null);
  const [bootstrapCmd, setBootstrapCmd] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

      // Step 1: Register repo
      const result = await registerRepo(repoPath.trim());
      const repoId = result.repo.id;

      // Step 2: Get current config, update executionMode and bootstrap
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
        // Config update failed but repo was registered - not fatal
      }

      resetModal();
      setShowAddModal(false);
      onRepoAdded();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Lỗi đăng ký repo');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="h-16 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/75 dark:bg-zinc-950/75 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-30 shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.3)] transition-colors duration-200">
        <div className="flex items-center gap-6">
          {/* Logo & Branding */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/25 border border-white/20">
              <GitBranch className="w-4 h-4" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:via-zinc-200 dark:to-zinc-400 bg-clip-text text-transparent">
              Squad Orchestrator
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400 border border-black/10 dark:border-white/10 uppercase tracking-wider backdrop-blur-md">
              Phase 3 Web
            </span>
          </div>

          <div className="h-5 w-px bg-black/[0.08] dark:bg-white/[0.08]" />

          {/* Repo Selector & Actions */}
          <div className="flex items-center gap-2.5">
            <FolderGit2 className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <select
              aria-label="Chọn Repository"
              className="liquid-glass-input text-xs font-medium text-zinc-800 dark:text-zinc-200 rounded-xl px-3 py-1.5 focus:outline-none transition-all cursor-pointer max-w-xs"
              value={selectedRepoId || ''}
              onChange={(e) => onSelectRepo(e.target.value)}
            >
              {repos.length === 0 ? (
                <option value="" className="bg-white dark:bg-zinc-900 text-zinc-400">Chưa có repository nào</option>
              ) : (
                repos.map((r) => (
                  <option key={r.id} value={r.id} className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                    {r.name || r.path.split(/[/\\]/).pop()} ({r.path})
                  </option>
                ))
              )}
            </select>

            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { resetModal(); setShowAddModal(true); }}
              title="Đăng ký Repository mới"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Thêm Repo</span>
            </GlassButton>

            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={onOpenAiHub}
              className="bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300"
              title="Cấu hình AI Providers, 9Router và chọn Model cho các roles"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>AI Providers &amp; Models</span>
            </GlassButton>
          </div>
        </div>

        {/* Server status indicator & Theme Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400 bg-black/[0.03] dark:bg-white/[0.03] backdrop-blur-md px-3 py-1.5 rounded-full border border-black/[0.06] dark:border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
            <Server className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            <span>127.0.0.1:4317</span>
            <span
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                isConnected
                  ? 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                  : 'bg-zinc-400 dark:bg-zinc-600'
              }`}
              title={isConnected ? 'SSE Live Stream Connected' : 'Ready'}
            />
          </div>

          {/* Theme switcher button */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] text-zinc-700 dark:text-zinc-300 border border-black/10 dark:border-white/10 transition-all cursor-pointer backdrop-blur-md shadow-sm active:scale-95"
              title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng (Light Mode)' : 'Chuyển sang Giao diện Tối (Dark Mode)'}
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

      {/* Liquid Glass Modal Add Repo */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative bg-white/90 dark:bg-zinc-950/85 backdrop-blur-2xl border border-black/10 dark:border-white/[0.12] rounded-2xl max-w-lg w-full p-6 shadow-[0_25px_60px_rgba(0,0,0,0.2)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200 overflow-hidden text-zinc-900 dark:text-zinc-100">
            {/* Top specular reflection line */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent pointer-events-none"
            />

            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-md shadow-indigo-500/10">
                  <FolderGit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Đăng ký Repository mới</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Nhập đường dẫn và chọn chế độ thực thi cho dự án</p>
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

            <form onSubmit={handleRegister} className="space-y-5">
              {/* Path input */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Đường dẫn Repo (Path)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: C:\Users\Admin\Documents\Working\MyProject"
                  className="liquid-glass-input w-full rounded-xl px-3.5 py-2.5 text-xs placeholder-zinc-400 dark:placeholder-zinc-500 font-mono focus:outline-none"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  onBlur={handlePathBlur}
                  autoFocus
                  required
                />
              </div>

              {/* Execution Mode selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                  Chế độ thực thi (Execution Mode)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Direct Mode Card */}
                  <button
                    type="button"
                    onClick={() => setExecutionMode('direct')}
                    className={`relative text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer backdrop-blur-md ${
                      executionMode === 'direct'
                        ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-500/15 shadow-[0_0_20px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/30'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] hover:border-black/15 dark:hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Zap className={`w-4 h-4 ${executionMode === 'direct' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
                      <span className={`text-xs font-bold ${executionMode === 'direct' ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-200'}`}>
                        Direct
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Agent làm việc trực tiếp trong thư mục dự án. Kết quả hiển thị ngay.
                    </p>
                    {executionMode === 'direct' && (
                      <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.9)]" />
                    )}
                  </button>

                  {/* Worktree Mode Card */}
                  <button
                    type="button"
                    onClick={() => {
                      setExecutionMode('worktree');
                      if (repoPath.trim() && !detectedPM) {
                        handleDetect(repoPath);
                      }
                    }}
                    className={`relative text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer backdrop-blur-md ${
                      executionMode === 'worktree'
                        ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-500/15 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] hover:border-black/15 dark:hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <GitFork className={`w-4 h-4 ${executionMode === 'worktree' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`} />
                      <span className={`text-xs font-bold ${executionMode === 'worktree' ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-700 dark:text-zinc-200'}`}>
                        Worktree
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Agent làm việc trong thư mục cách ly. An toàn cho production.
                    </p>
                    {executionMode === 'worktree' && (
                      <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Bootstrap config (shown when Worktree is selected) */}
              {executionMode === 'worktree' && (
                <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] backdrop-blur-md space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Bootstrap Command
                    </label>
                    {isDetecting && (
                      <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Đang phát hiện...
                      </span>
                    )}
                    {!isDetecting && detectedPM && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                        ✓ Phát hiện {detectedPM}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Ví dụ: pnpm install"
                    className="liquid-glass-input w-full rounded-lg px-3 py-1.5 text-xs font-mono placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
                    value={bootstrapCmd}
                    onChange={(e) => setBootstrapCmd(e.target.value)}
                  />
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Lệnh cài đặt dependencies trong mỗi worktree trước khi agent bắt đầu.
                  </p>
                </div>
              )}

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
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
                      <span>Đang thêm...</span>
                    </>
                  ) : (
                    <span>Xác nhận</span>
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
