import React, { useEffect, useRef, useState } from 'react';
import {
  Terminal,
  X,
  Copy,
  Check,
  AlertCircle,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import type { TaskRecordDto } from '@squad/shared-types';

interface LogDrawerProps {
  task: TaskRecordDto | null;
  logs: string[];
  allTasks?: TaskRecordDto[];
  runningTasks?: TaskRecordDto[];
  onSelectTask?: (taskId: string) => void;
  onClose: () => void;
  mode?: 'docked' | 'fixed';
  width?: number;
}

const getRoleIcon = (role: string) => {
  switch (role.toLowerCase()) {
    case 'pm':
    case 'planner':
      return '📋';
    case 'techlead':
      return '📐';
    case 'backend':
      return '⚙️';
    case 'frontend':
      return '🎨';
    case 'mobile':
      return '📱';
    case 'database':
      return '🗄️';
    case 'qa':
    case 'tester':
      return '🧪';
    case 'devops':
      return '🚀';
    default:
      return '🤖';
  }
};

export const LogDrawer: React.FC<LogDrawerProps> = ({
  task,
  logs,
  allTasks = [],
  runningTasks = [],
  onSelectTask,
  onClose,
  mode = 'docked',
  width,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Tự động cuộn xuống cuối khi có log mới
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  if (!task) return null;

  const handleCopy = () => {
    const allText = [
      task.error ? `[ERROR]: ${task.error}\n\n` : '',
      ...logs,
    ].join('');
    navigator.clipboard.writeText(allText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tasksToDisplay = allTasks.length > 0 ? allTasks : runningTasks;

  const isFixed = mode === 'fixed';

  return (
    <>
      {/* Backdrop: Luôn hiện trên fixed mode; trên docked mode chỉ hiện trên mobile */}
      <div
        className={
          isFixed
            ? 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200'
            : 'fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-200'
        }
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        style={!isFixed && !isExpanded && width ? { width: `${width}px` } : undefined}
        className={`${
          isFixed
            ? `fixed inset-y-0 right-0 z-50 shrink-0 shadow-2xl ${
                isExpanded
                  ? 'w-full md:w-[720px] lg:w-[820px] xl:w-[920px]'
                  : 'w-full md:w-[480px] lg:w-[520px] xl:w-[560px]'
              }`
            : isExpanded
            ? 'w-full md:w-[80vw] shrink-0'
            : width
            ? 'shrink-0'
            : `fixed md:relative inset-y-0 right-0 md:inset-auto z-40 md:z-10 w-full md:w-auto md:flex-1 md:min-w-0`
        } h-full border-l border-[var(--color-warm-mist)] flex flex-col bg-[#181714] text-[#f0ece1] ${
          width && !isExpanded ? '' : 'transition-all duration-150 ease-in-out'
        } overflow-hidden select-text`}
      >
      {/* Panel Header */}
      <div className="p-3 border-b border-[#33322d] bg-[#201f1c] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#2a2924] border border-[#3a3934] text-zinc-300 flex items-center justify-center shrink-0">
            <span className="text-sm">{getRoleIcon(task.role)}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-medium text-teal-300 bg-teal-500/15 px-1.5 py-0.5 rounded border border-teal-500/25 shrink-0">
                #{task.id}
              </span>
              <span className="text-xs font-medium text-zinc-100 truncate">
                {task.title}
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate flex items-center gap-1.5">
              <span className="text-zinc-300 capitalize">{task.role}</span>
              <span>•</span>
              <span className="text-zinc-500">branch:</span>
              <span className="text-zinc-300 font-mono">{task.branch}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Nút phóng to / thu nhỏ panel */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer hidden md:flex items-center"
            title={isExpanded ? 'Thu nhỏ panel' : 'Mở rộng panel'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Nút sao chép logs */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center"
            title="Sao chép toàn bộ logs và lỗi"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Nút đóng panel */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center"
            title="Đóng panel terminal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Task Switcher Pill Navigation Bar */}
      {tasksToDisplay.length > 0 && (
        <div className="px-3 py-1.5 border-b border-[#33322d] bg-[#141310] flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono shrink-0 no-scrollbar">
          <span className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Activity className="w-3 h-3 text-teal-400" />
            <span>Agents:</span>
          </span>
          {tasksToDisplay.map((t) => {
            const isSelected = t.id === task.id;
            const isRunning = t.status === 'running';
            const isPassed = t.status === 'passed';
            const isFailed = t.status === 'failed' || t.status === 'cancelled';

            return (
              <button
                key={t.id}
                onClick={() => onSelectTask?.(t.id)}
                className={`px-2.5 py-0.5 rounded-full border transition-all shrink-0 cursor-pointer flex items-center gap-1.5 text-[11px] ${
                  isSelected
                    ? 'bg-[var(--color-deep-teal)] border-[var(--color-deep-teal)] text-white font-medium'
                    : isRunning
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                    : 'bg-white/[0.02] border-[#33322d] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                <span>{getRoleIcon(t.role)}</span>
                <span className="capitalize">{t.role}</span>
                {isRunning && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                  </span>
                )}
                {isPassed && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                {isFailed && <AlertCircle className="w-3 h-3 text-rose-400" />}
              </button>
            );
          })}
        </div>
      )}


      {/* Live Streaming Indicator Banner */}
      {task.status === 'running' && (
        <div className="px-3.5 py-1.5 bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-300 font-mono backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="font-bold tracking-wide text-[11px]">🔴 LIVE STREAMING</span>
            <span className="text-amber-200/80 text-[10px] hidden sm:inline">• Agent đang chạy</span>
          </div>
          {task.pid && (
            <span className="text-[10px] text-amber-300/80 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
              PID: {task.pid}
            </span>
          )}
        </div>
      )}

      {/* Terminal Output Body */}
      <div
        ref={terminalRef}
        className="flex-1 p-4 font-mono text-xs text-zinc-300 overflow-y-auto bg-black/70 space-y-2 select-text scroll-smooth"
      >
        {task.error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 space-y-2 backdrop-blur-md">
            <div className="flex items-center gap-2 font-bold text-rose-400 text-xs uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Chi tiết lỗi ({task.status}):</span>
            </div>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-rose-200 bg-black/50 p-2.5 rounded-lg border border-rose-500/20">
              {task.error}
            </pre>
          </div>
        )}

        {logs.length === 0 ? (
          !task.error && (
            <div className="text-zinc-500 italic py-16 text-center text-xs flex flex-col items-center justify-center gap-2">
              <Terminal className="w-6 h-6 text-zinc-600" />
              <span>Chưa có dòng log nào được ghi nhận cho task này...</span>
            </div>
          )
        ) : (
          logs.map((chunk, idx) => (
            <pre
              key={idx}
              className="whitespace-pre-wrap break-all leading-relaxed text-[11px]"
            >
              {chunk}
            </pre>
          ))
        )}

        {task.status === 'running' && (
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs pt-3 pb-1">
            <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse" />
            <span className="text-zinc-400 italic text-[11px]">Đang lắng nghe tiến trình agent qua SSE stream...</span>
          </div>
        )}
      </div>

      {/* Terminal Status Footer */}
      <div className="p-2.5 border-t border-white/[0.08] bg-white/[0.02] text-[11px] text-zinc-400 flex items-center justify-between font-mono shrink-0">
        <div className="flex items-center gap-2">
          <span>Status:</span>
          <span
            className={`font-semibold capitalize ${
              task.status === 'running'
                ? 'text-amber-400'
                : task.status === 'passed'
                ? 'text-emerald-400'
                : task.status === 'failed' || task.status === 'cancelled'
                ? 'text-rose-400'
                : 'text-zinc-400'
            }`}
          >
            {task.status}
          </span>
        </div>
        <span className="bg-white/[0.04] px-2 py-0.5 rounded text-zinc-400 border border-white/[0.05] text-[10px]">
          {logs.length} chunk(s)
        </span>
      </div>
    </aside>
    </>
  );
};
