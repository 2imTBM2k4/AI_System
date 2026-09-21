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
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/70 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-indigo-400">
                #{task.id}
              </span>
              <span className="text-xs font-semibold text-zinc-200">
                {task.title}
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Branch: {task.branch} • Role: {task.role}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
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
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
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
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-400 text-xs uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Chi tiết lỗi ({task.status}):</span>
            </div>
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-rose-200 bg-black/40 p-3 rounded-lg border border-rose-500/20">
              {task.error}
            </pre>
          </div>
        )}

        {logs.length === 0 ? (
          !task.error && (
            <div className="text-zinc-600 italic py-8 text-center">
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
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/40 text-[11px] text-zinc-500 flex items-center justify-between font-mono">
        <span>Trạng thái: <span className="text-zinc-300">{task.status}</span></span>
        <span>{logs.length} chunk(s)</span>
      </div>
    </div>
  );
};
