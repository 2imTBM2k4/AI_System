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
import { GlassBadge } from '../glass/GlassBadge';

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

  const getRoleVariant = (role: string): 'purple' | 'cyan' | 'amber' | 'emerald' | 'indigo' => {
    switch (role.toLowerCase()) {
      case 'architect':
      case 'planner':
        return 'purple';
      case 'frontend':
        return 'cyan';
      case 'backend':
        return 'amber';
      case 'tester':
        return 'emerald';
      default:
        return 'indigo';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <GlassBadge variant="neutral">
            <Clock className="w-2.5 h-2.5" />
            <span className="text-[10px]">pending</span>
          </GlassBadge>
        );
      case 'running':
        return (
          <GlassBadge variant="amber" dot pulse>
            <span className="text-[10px]">running</span>
          </GlassBadge>
        );
      case 'passed':
        return (
          <GlassBadge variant="emerald" dot>
            <CheckCircle className="w-2.5 h-2.5" />
            <span className="text-[10px]">passed</span>
          </GlassBadge>
        );
      case 'verify_failed':
      case 'agent_failed':
      case 'bootstrap_failed':
      case 'error':
        return (
          <GlassBadge variant="rose" dot>
            <AlertCircle className="w-2.5 h-2.5" />
            <span className="text-[10px]">{status}</span>
          </GlassBadge>
        );
      case 'cancelled':
        return (
          <GlassBadge variant="neutral">
            <XCircle className="w-2.5 h-2.5" />
            <span className="text-[10px]">cancelled</span>
          </GlassBadge>
        );
      default:
        return (
          <GlassBadge variant="neutral">
            <span className="text-[10px]">{status}</span>
          </GlassBadge>
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
      className="group p-4 rounded-xl border border-black/[0.07] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.07] hover:border-indigo-400/40 dark:hover:border-white/[0.18] transition-all duration-200 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] space-y-3 relative overflow-hidden backdrop-blur-md"
    >
      {/* Subtle specular reflection on top of the card */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none"
      />

      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
          #{task.id}
        </span>
        {getStatusBadge(task.status)}
      </div>

      <div>
        <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors line-clamp-2 leading-relaxed">
          {task.title}
        </h4>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <GlassBadge variant={getRoleVariant(task.role)}>
          <span className="uppercase tracking-wider text-[10px] font-bold">
            {task.role}
          </span>
        </GlassBadge>

        <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-black/[0.03] dark:bg-black/40 px-2 py-0.5 rounded-lg border border-black/10 dark:border-white/[0.06]">
          <GitBranch className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
          <span>{task.branch}</span>
        </span>
      </div>

      {task.error && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-mono line-clamp-2">
          {task.error}
        </div>
      )}

      <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.05] flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenLog(task.id);
          }}
          className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors font-mono cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Logs</span>
        </button>

        {task.status === 'running' && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelling}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/35 transition-all text-[11px] font-semibold disabled:opacity-50 cursor-pointer shadow-sm shadow-rose-500/10"
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
