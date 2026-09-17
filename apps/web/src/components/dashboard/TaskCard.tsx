import React, { useState } from 'react';
import {
  Terminal,
  StopCircle,
  Clock,
  GitBranch,
  CheckCircle,
  AlertCircle,
  Loader2,
  XCircle,
} from 'lucide-react';
import type { TaskRecordDto } from '@squad/shared-types';
import { cancelTask } from '../../api/client';

interface TaskCardProps {
  task: TaskRecordDto;
  onOpenLog: (taskId: string) => void;
  onCancelled?: (taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onOpenLog,
  onCancelled,
}) => {
  const [isCancelling, setIsCancelling] = useState(false);

  const getRoleStyle = (role: string) => {
    switch (role.toLowerCase()) {
      case 'architect':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'frontend':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'backend':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'tester':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default:
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/50">
            <Clock className="w-3 h-3" />
            pending
          </span>
        );
      case 'running':
        return (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            running
          </span>
        );
      case 'passed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            passed
          </span>
        );
      case 'verify_failed':
      case 'agent_failed':
      case 'bootstrap_failed':
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            {status}
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700/50">
            <XCircle className="w-3 h-3" />
            cancelled
          </span>
        );
      default:
        return (
          <span className="text-[11px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsCancelling(true);
      await cancelTask(task.runId, task.id);
      if (onCancelled) onCancelled(task.id);
    } catch (err) {
      console.error('Lỗi khi hủy task:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div
      onClick={() => onOpenLog(task.id)}
      className="group p-4 rounded-xl border border-zinc-800/90 bg-zinc-900/70 hover:bg-zinc-850 hover:border-zinc-700/80 transition-all cursor-pointer shadow-sm hover:shadow-md space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-mono font-semibold text-zinc-400 group-hover:text-indigo-400 transition-colors">
          #{task.id}
        </span>
        {getStatusBadge(task.status)}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors line-clamp-2">
          {task.title}
        </h4>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getRoleStyle(
            task.role
          )}`}
        >
          {task.role}
        </span>

        <span className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded-md border border-zinc-800">
          <GitBranch className="w-3 h-3 text-zinc-500" />
          {task.branch}
        </span>
      </div>

      {task.error && (
        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono line-clamp-2">
          {task.error}
        </div>
      )}

      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenLog(task.id);
          }}
          className="flex items-center gap-1 text-zinc-400 hover:text-indigo-400 transition-colors font-mono"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Logs</span>
        </button>

        {task.status === 'running' && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelling}
            className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors text-[11px] font-semibold disabled:opacity-50"
            title="Hủy task này"
          >
            {isCancelling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <StopCircle className="w-3 h-3" />
            )}
            <span>Hủy Task</span>
          </button>
        )}
      </div>
    </div>
  );
};
