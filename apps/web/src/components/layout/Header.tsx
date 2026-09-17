import React, { useState } from 'react';
import { GitBranch, FolderGit2, Plus, Server } from 'lucide-react';
import type { RepoDto } from '@squad/shared-types';
import { registerRepo } from '../../api/client';

interface HeaderProps {
  repos: RepoDto[];
  selectedRepoId: string | null;
  onSelectRepo: (id: string) => void;
  onRepoAdded: () => void;
  isConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  repos,
  selectedRepoId,
  onSelectRepo,
  onRepoAdded,
  isConnected,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await registerRepo(repoPath.trim());
      setRepoPath('');
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
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
              <GitBranch className="w-4 h-4" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              Squad Orchestrator
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50">
              Phase 3 Web
            </span>
          </div>

          <div className="h-5 w-px bg-zinc-800" />

          {/* Repo Selector */}
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-zinc-400" />
            <select
              aria-label="Chọn Repository"
              className="bg-zinc-800/90 text-sm font-medium text-zinc-200 border border-zinc-700/80 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer max-w-xs"
              value={selectedRepoId || ''}
              onChange={(e) => onSelectRepo(e.target.value)}
            >
              {repos.length === 0 ? (
                <option value="">Chưa có repository nào</option>
              ) : (
                repos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || r.path.split(/[/\\]/).pop()} ({r.path})
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-1.5 rounded-lg border border-zinc-700/80 transition-colors"
              title="Đăng ký Repository mới"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              Thêm Repo
            </button>
          </div>
        </div>

        {/* Server status indicator */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 bg-zinc-800/60 px-3 py-1.5 rounded-full border border-zinc-700/50">
            <Server className="w-3.5 h-3.5 text-zinc-400" />
            <span>127.0.0.1:4317</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                  : 'bg-zinc-500'
              }`}
              title={isConnected ? 'SSE Live Stream Connected' : 'Ready'}
            />
          </div>
        </div>
      </header>

      {/* Modal Add Repo */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <FolderGit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">Đăng ký Repository mới</h3>
                <p className="text-xs text-zinc-400">Nhập đường dẫn tuyệt đối của git repository trên máy</p>
              </div>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Đường dẫn Repo (Path)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: C:\Users\Admin\Documents\Working\MyProject"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              {submitError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !repoPath.trim()}
                  className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors shadow-lg shadow-indigo-600/20"
                >
                  {isSubmitting ? 'Đang thêm...' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
