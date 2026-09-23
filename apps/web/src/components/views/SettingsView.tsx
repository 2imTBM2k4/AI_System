import React, { useState, useEffect } from 'react';
import {
  Settings,
  Zap,
  GitFork,
  Server,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Bot,
  RefreshCw,
} from 'lucide-react';
import type { SquadConfigDto, RepoDto } from '@squad/shared-types';
import {
  getRepoConfig,
  updateRepoConfig,
  detectRepoInfo,
  getServerHealth,
  type ServerHealthInfo,
} from '../../api/client';
import { GlassButton } from '../glass/GlassButton';
import { GlassCard } from '../glass/GlassCard';

interface SettingsViewProps {
  selectedRepo: RepoDto | null;
  onSaved?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ selectedRepo, onSaved }) => {
  const [repoConfig, setRepoConfig] = useState<SquadConfigDto | null>(null);
  const [executionMode, setExecutionMode] = useState<'direct' | 'worktree'>('direct');
  const [bootstrapCmd, setBootstrapCmd] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedPM, setDetectedPM] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Server health state
  const [healthInfo, setHealthInfo] = useState<ServerHealthInfo | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!selectedRepo) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const cfgData = await getRepoConfig(selectedRepo.id);
        if (active) {
          setRepoConfig(cfgData.config);
          setExecutionMode(cfgData.config.executionMode || 'direct');
          setBootstrapCmd((cfgData.config.bootstrap || []).join(' && '));
        }
      } catch (err) {
        if (active) {
          setFeedback({
            type: 'error',
            message: err instanceof Error ? err.message : 'Không thể tải cấu hình dự án',
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
  }, [selectedRepo]);

  const loadServerHealth = async () => {
    try {
      setIsHealthLoading(true);
      const info = await getServerHealth();
      setHealthInfo(info);
    } catch {
      setHealthInfo(null);
    } finally {
      setIsHealthLoading(false);
    }
  };

  useEffect(() => {
    loadServerHealth();
  }, []);

  const handleDetect = async () => {
    if (!selectedRepo?.path) return;
    try {
      setIsDetecting(true);
      const info = await detectRepoInfo(selectedRepo.path);
      setDetectedPM(info.packageManager);
      if (info.bootstrap && info.bootstrap.length > 0) {
        setBootstrapCmd(info.bootstrap.join(' && '));
      }
    } catch {
      setDetectedPM(null);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedRepo?.id || !repoConfig) return;
    try {
      setIsSaving(true);
      setFeedback(null);

      const bootstrapList = bootstrapCmd
        .split('&&')
        .map((s) => s.trim())
        .filter(Boolean);

      const updatedConfig: SquadConfigDto = {
        ...repoConfig,
        executionMode,
        bootstrap: bootstrapList.length > 0 ? bootstrapList : undefined,
      };

      await updateRepoConfig(selectedRepo.id, updatedConfig);
      setRepoConfig(updatedConfig);
      setFeedback({
        type: 'success',
        message: 'Đã lưu cài đặt dự án thành công!',
      });
      if (onSaved) onSaved();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể lưu cài đặt',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '0s';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m ${s}s`;
  };

  if (!selectedRepo) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <GlassCard variant="default" className="text-center py-16 p-8 max-w-md mx-auto">
          <Bot className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-1">
            Chưa Chọn Repository
          </h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Vui lòng chọn một repository ở thanh menu trên để quản lý cài đặt chế độ thực thi và cấu hình chung.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/20">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Cài Đặt Hệ Thống &amp; Chế Độ Thực Thi Dự Án
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Cấu hình cách Agent thao tác với repository (Direct / Worktree), lệnh bootstrap và theo dõi server.
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
              <span>Lưu Cài Đặt</span>
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

      {/* Repository Info Card */}
      <GlassCard variant="default" className="p-5 space-y-2">
        <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
          Thông Tin Repository Hiện Tại
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
          <div>
            <span className="text-zinc-500">Tên Repository:</span>
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {selectedRepo.name || selectedRepo.path.split(/[/\\]/).pop()}
            </div>
          </div>
          <div>
            <span className="text-zinc-500">Đường dẫn cục bộ:</span>
            <div className="font-mono text-zinc-800 dark:text-zinc-200 truncate mt-0.5" title={selectedRepo.path}>
              {selectedRepo.path}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Execution Mode */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
          Chế Độ Thực Thi (Execution Mode)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Direct Mode Card */}
          <button
            type="button"
            onClick={() => setExecutionMode('direct')}
            className={`relative text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer backdrop-blur-xl ${
              executionMode === 'direct'
                ? 'border-indigo-500 bg-indigo-50/90 dark:bg-indigo-500/15 shadow-[0_0_24px_rgba(99,102,241,0.18)] ring-1 ring-indigo-500/40'
                : 'border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-zinc-900/60 hover:border-black/15 dark:hover:border-white/[0.16]'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className={`w-4 h-4 ${executionMode === 'direct' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
              <span className={`text-sm font-bold ${executionMode === 'direct' ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                Direct Mode (Thao tác trực tiếp)
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Các Agent chạy và chỉnh sửa code trực tiếp trong thư mục dự án đang mở. Phù hợp cho việc phát triển nhanh hoặc dự án cá nhân.
            </p>
            {executionMode === 'direct' && (
              <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
            )}
          </button>

          {/* Worktree Mode Card */}
          <button
            type="button"
            onClick={() => {
              setExecutionMode('worktree');
              if (!detectedPM) handleDetect();
            }}
            className={`relative text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer backdrop-blur-xl ${
              executionMode === 'worktree'
                ? 'border-emerald-500 bg-emerald-50/90 dark:bg-emerald-500/15 shadow-[0_0_24px_rgba(16,185,129,0.18)] ring-1 ring-emerald-500/40'
                : 'border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-zinc-900/60 hover:border-black/15 dark:hover:border-white/[0.16]'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <GitFork className={`w-4 h-4 ${executionMode === 'worktree' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`} />
              <span className={`text-sm font-bold ${executionMode === 'worktree' ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                Worktree Mode (Cách ly an toàn ⭐)
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Mỗi agent làm việc trên một Git worktree riêng biệt. Không làm gián đoạn mã nguồn chính, cho phép merge an toàn sau khi hoàn thành.
            </p>
            {executionMode === 'worktree' && (
              <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
            )}
          </button>
        </div>
      </div>

      {/* Bootstrap Command Configuration */}
      <GlassCard variant="default" className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              Lệnh Cài Đặt Khởi Tạo (Bootstrap Command)
            </h4>
            <p className="text-xs text-zinc-500 mt-0.5">
              Lệnh chạy để cài dependencies khi tạo một worktree cách ly mới.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {detectedPM && (
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                ✓ Đã nhận diện {detectedPM}
              </span>
            )}
            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={isDetecting}
              onClick={handleDetect}
            >
              {isDetecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang dò...</span>
                </>
              ) : (
                <span>Tự Động Phát Hiện</span>
              )}
            </GlassButton>
          </div>
        </div>

        <input
          type="text"
          value={bootstrapCmd}
          onChange={(e) => setBootstrapCmd(e.target.value)}
          placeholder="Ví dụ: pnpm install"
          className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none"
        />
      </GlassCard>

      {/* Server Health Card */}
      <GlassCard variant="default" className="p-5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-2 font-bold text-xs text-zinc-900 dark:text-zinc-100">
            <Server className="w-4 h-4 text-indigo-500" />
            <span>Thông Số Server Real-time</span>
          </div>

          <button
            type="button"
            onClick={loadServerHealth}
            disabled={isHealthLoading}
            className="p-1.5 rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Làm mới trạng thái server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isHealthLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05]">
            <span className="text-zinc-500 text-[11px] block">Endpoint Server</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">127.0.0.1:4317</span>
          </div>

          <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05]">
            <span className="text-zinc-500 text-[11px] block">Thời Gian Hoạt Động (Uptime)</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatUptime(healthInfo?.uptime)}</span>
          </div>

          <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05]">
            <span className="text-zinc-500 text-[11px] block">Repositories Đã Đăng Ký</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{healthInfo?.registeredRepos ?? 0}</span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
