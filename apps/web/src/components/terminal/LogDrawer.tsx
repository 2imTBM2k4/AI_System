import React, { useEffect, useRef } from 'react';
import { Terminal, X, Copy, Check, AlertCircle } from 'lucide-react';
import type { TaskRecordDto } from '@squad/shared-types';

interface LogDrawerProps {
  task: TaskRecordDto | null;
  logs: string[];
  onClose: () => void;
}

export const LogDrawer: React.FC<LogDrawerProps> = ({
  task,
  logs,
  onClose,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

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

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-zinc-950/90 backdrop-blur-2xl border-l border-white/[0.1] shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col animate-in slide-in-from-right duration-250 relative overflow-hidden">
      {/* Specular edge highlight along left border */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-indigo-400/40 to-transparent pointer-events-none"
      />

      {/* Drawer Header */}
      <div className="p-4 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 text-zinc-300 flex items-center justify-center shadow-md">
            <Terminal className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/25">
                #{task.id}
              </span>
              <span className="text-xs font-bold text-zinc-100 line-clamp-1 max-w-xs">
                {task.title}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              Branch: <span className="text-zinc-300">{task.branch}</span> • Role: <span className="text-zinc-300">{task.role}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Sao chép toàn bộ logs và lỗi"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div
        ref={terminalRef}
        className="flex-1 p-4 font-mono text-xs text-zinc-300 overflow-y-auto bg-black/60 space-y-2 select-text"
      >
        {task.error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 space-y-2 backdrop-blur-md">
            <div className="flex items-center gap-2 font-bold text-rose-400 text-xs uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Chi tiết lỗi ({task.status}):</span>
            </div>
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-rose-200 bg-black/50 p-3 rounded-lg border border-rose-500/20">
              {task.error}
            </pre>
          </div>
        )}

        {logs.length === 0 ? (
          !task.error && (
            <div className="text-zinc-500 italic py-12 text-center text-xs">
              Chưa có dòng log nào được ghi nhận cho task này...
            </div>
          )
        ) : (
          logs.map((chunk, idx) => (
            <pre
              key={idx}
              className="whitespace-pre-wrap break-all leading-relaxed"
            >
              {chunk}
            </pre>
          ))
        )}
      </div>

      {/* Terminal Footer */}
      <div className="p-3 border-t border-white/[0.08] bg-white/[0.02] text-[11px] text-zinc-400 flex items-center justify-between font-mono">
        <span>Trạng thái: <span className="text-zinc-200 font-semibold">{task.status}</span></span>
        <span className="bg-white/[0.04] px-2 py-0.5 rounded text-zinc-400 border border-white/[0.05]">{logs.length} chunk(s)</span>
      </div>
    </div>
  );
};
