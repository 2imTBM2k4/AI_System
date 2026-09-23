import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  Play,
  Edit3,
  Bot,
  User,
  CheckCircle2,
  ChevronRight,
  ArrowUpRight,
  Zap,
  Sliders,
  Terminal,
  GitMerge,
  Ban,
  Activity,
} from 'lucide-react';
import type { PlanResponse, RunRecordDto, TaskRecordDto, MergeReportDto } from '@squad/shared-types';
import { createPlan, startRun, mergeRun } from '../../api/client';
import { GlassCard } from '../glass/GlassCard';
import { GlassBadge } from '../glass/GlassBadge';
import { GlassButton } from '../glass/GlassButton';
import { LogDrawer } from '../terminal/LogDrawer';
import { MergeModal } from '../dashboard/MergeModal';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isPlanning?: boolean;
  plan?: PlanResponse;
  error?: string;
  runId?: string;
}

interface PlanningChatViewProps {
  repoId: string | null;
  activeRun: RunRecordDto | null;
  currentViewRunId: string | null;
  viewingRun: RunRecordDto | null;
  viewingTasks: Record<string, TaskRecordDto>;
  viewingLogs: Record<string, string[]>;
  onPlanCreated: (planData: PlanResponse) => void;
  onRunStarted: (runId: string) => void;
  onOpenReviewModal: (planData: PlanResponse) => void;
  onViewRun: (runId: string) => void;
  onTaskCancelled?: (taskId: string) => void;
  onNavigateToProviders?: () => void;
}

const QUICK_PROMPTS = [
  {
    title: 'Tối ưu hóa Database Queries',
    desc: 'Phân tích chậm, đánh index và refactor câu query',
    prompt: 'Tối ưu hóa performance database query và thêm index cho các bảng dữ liệu chính',
  },
  {
    title: 'Viết Bộ Unit Tests',
    desc: 'Bổ sung test coverage cho core runner và modules',
    prompt: 'Viết bộ kiểm thử unit tests toàn diện cho core module và runner với Vitest',
  },
  {
    title: 'Xây Dựng REST API Endpoint',
    desc: 'Thêm route, middleware xác thực JWT và validation',
    prompt: 'Thêm middleware xác thực token JWT, viết route kiểm tra quyền và bổ sung unit tests',
  },
  {
    title: 'Refactor Codebase & Clean Code',
    desc: 'Tách components, chuẩn hóa TypeScript types và lints',
    prompt: 'Tái cấu trúc mã nguồn, chuẩn hóa TypeScript types và dọn dẹp các warnings',
  },
];

export const PlanningChatView: React.FC<PlanningChatViewProps> = ({
  repoId,
  activeRun,
  currentViewRunId,
  viewingRun,
  viewingTasks,
  viewingLogs,
  onPlanCreated,
  onRunStarted,
  onOpenReviewModal,
  onViewRun,
  onTaskCancelled,
  onNavigateToProviders,
}) => {
  const [inputGoal, setInputGoal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [executingPlanId, setExecutingPlanId] = useState<string | null>(null);

  // Terminal Log Drawer state
  const [activeLogTask, setActiveLogTask] = useState<TaskRecordDto | null>(null);

  // Merge state
  const [mergeReport, setMergeReport] = useState<MergeReportDto | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'msg-welcome',
        sender: 'assistant',
        text: 'Xin chào! Tôi là **Squad Orchestrator**. Hãy mô tả mục tiêu bạn muốn thực hiện. Tôi sẽ phân rã mục tiêu thành các task song song độc lập và điều phối các agent chuyên trách (Backend, Frontend, Tester) thực thi cùng lúc.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Tự động co giãn chiều cao textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputGoal]);

  const handleSend = async (goalToSend?: string) => {
    const goal = (goalToSend || inputGoal).trim();
    if (!goal || isGenerating) return;

    if (!repoId) {
      const errorMsgId = `err-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          sender: 'user',
          text: goal,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        {
          id: errorMsgId,
          sender: 'assistant',
          text: 'Vui lòng chọn một Repository ở thanh menu trên trước khi yêu cầu lập kế hoạch.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: 'Chưa chọn Repository',
        },
      ]);
      setInputGoal('');
      return;
    }

    const userMsgId = `usr-${Date.now()}`;
    const plannerMsgId = `plan-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: goal,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: plannerMsgId,
        sender: 'assistant',
        text: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isPlanning: true,
      },
    ]);

    setInputGoal('');
    setIsGenerating(true);

    try {
      const planData = await createPlan(repoId, goal);
      onPlanCreated(planData);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === plannerMsgId
            ? {
                ...msg,
                isPlanning: false,
                plan: planData,
                text: `Tôi đã lập kế hoạch và phân rã thành **${planData.plan.tasks.length} tasks song song**. Mỗi agent sẽ nhận một nhiệm vụ riêng biệt. Hãy xem chi tiết và bấm **Bắt đầu thực thi** để kích hoạt các agent.`,
              }
            : msg
        )
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Không thể lập kế hoạch với Planner Agent';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === plannerMsgId
            ? {
                ...msg,
                isPlanning: false,
                text: `Rất tiếc, đã xảy ra lỗi khi tạo kế hoạch: ${errMsg}`,
                error: errMsg,
              }
            : msg
        )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExecutePlan = async (planData: PlanResponse, msgId: string) => {
    if (!repoId) return;
    try {
      setExecutingPlanId(msgId);
      const res = await startRun(repoId, { plan: planData.plan });
      onRunStarted(res.run.id);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === msgId
            ? {
                ...msg,
                runId: res.run.id,
                text: `${msg.text}\n\n🚀 **Đã khởi chạy Run #${res.run.id.slice(0, 8)} thành công!** Các agent chuyên trách đang bắt đầu nhận việc song song bên dưới:`,
              }
            : msg
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi khi khởi chạy kế hoạch');
    } finally {
      setExecutingPlanId(null);
    }
  };

  const handleMerge = async (runId: string) => {
    try {
      setIsMerging(true);
      setMergeError(null);
      const res = await mergeRun(runId);
      setMergeReport(res.report);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Lỗi khi hợp nhất nhánh');
    } finally {
      setIsMerging(false);
    }
  };

  const getRoleVariant = (role: string): 'purple' | 'amber' | 'cyan' | 'emerald' | 'indigo' => {
    switch (role.toLowerCase()) {
      case 'pm':
      case 'planner':
        return 'purple';
      case 'techlead':
        return 'indigo';
      case 'backend':
      case 'database':
        return 'amber';
      case 'frontend':
      case 'mobile':
        return 'cyan';
      case 'qa':
      case 'tester':
      case 'devops':
        return 'emerald';
      default:
        return 'indigo';
    }
  };

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

  // Tính toán số task và tiến độ của run đang xem
  const tasksArray = Object.values(viewingTasks);
  const totalTasks = tasksArray.length;
  const completedTasks = tasksArray.filter((t) => t.status === 'passed').length;
  const runningTasks = tasksArray.filter((t) => t.status === 'running');
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const allTasksPassed = totalTasks > 0 && completedTasks === totalTasks;

  return (
    <div className="flex-1 flex flex-col h-full max-w-5xl mx-auto w-full px-4 md:px-6 relative">
      {/* Banner thông báo nếu có run đang chạy */}
      {activeRun && (
        <div className="pt-4 pb-1 shrink-0">
          <div className="p-3.5 rounded-2xl bg-amber-500/[0.08] dark:bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Đang có Run <span className="font-mono font-bold">#{activeRun.id.slice(0, 8)}</span> hoạt động:
              </span>
              <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-md font-medium">
                {activeRun.goal}
              </span>
            </div>
            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onViewRun(activeRun.id)}
              className="shrink-0 text-amber-700 dark:text-amber-300 border-amber-500/30"
            >
              <span>Xem Bảng Kanban</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </GlassButton>
          </div>
        </div>
      )}

      {/* Main Chat Thread Area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6 scroll-smooth pr-1">
        {messages.map((message) => {
          const isUser = message.sender === 'user';
          const planTasks = message.plan?.plan?.tasks || [];
          const distinctRoles = Array.from(new Set(planTasks.map((t) => t.role)));

          // Run liên kết với message này nếu có
          const linkedRunId = message.runId || (message.plan && currentViewRunId === message.plan.runId ? currentViewRunId : null);
          const isLiveTracking = Boolean(linkedRunId && viewingRun && viewingRun.id === linkedRunId);

          return (
            <div
              key={message.id}
              className={`flex gap-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* Avatar Bot */}
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20 border border-white/20 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              {/* Message Bubble Container */}
              <div className={`max-w-3xl space-y-3 ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Orchestrator Badge & Sub-agent Chips (Style giống như trong ảnh người dùng gửi) */}
                {!isUser && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                      ORCHESTRATOR
                    </span>

                    {/* Chips các sub-agent / tools liên quan */}
                    {distinctRoles.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {distinctRoles.map((r) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 text-[10px] font-mono text-zinc-600 dark:text-zinc-300 flex items-center gap-1"
                          >
                            <span>{getRoleIcon(r)}</span>
                            <span>{r}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed backdrop-blur-xl ${
                    isUser
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 rounded-tr-sm ml-12'
                      : 'bg-white/80 dark:bg-zinc-900/80 border border-black/[0.08] dark:border-white/[0.09] text-zinc-800 dark:text-zinc-200 shadow-sm rounded-tl-sm'
                  }`}
                >
                  {/* Thinking status */}
                  {message.isPlanning && (
                    <div className="flex items-center gap-3 py-2 text-indigo-600 dark:text-indigo-400 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                      <span className="text-xs">
                        Orchestrator đang phân tích codebase và chia nhỏ mục tiêu thành các tasks song song...
                      </span>
                    </div>
                  )}

                  {/* Text content */}
                  {message.text && (
                    <div className="whitespace-pre-wrap font-sans text-xs md:text-sm">
                      {message.text}
                    </div>
                  )}

                  {/* Error display */}
                  {message.error && (
                    <div className="mt-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
                      {message.error}
                    </div>
                  )}
                </div>

                {/* Plan Card embedded in chat */}
                {message.plan && (
                  <GlassCard
                    variant="default"
                    className="p-5 space-y-4 border-indigo-500/30 shadow-lg shadow-indigo-500/5 animate-in zoom-in-95 duration-200"
                  >
                    <div className="flex items-start justify-between gap-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            Phân Bổ Kế Hoạch Cho Các Agent
                          </h4>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {message.plan.plan.tasks.length} tasks • Chạy song song độc lập theo worktree
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <GlassButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onOpenReviewModal(message.plan!)}
                          title="Xem chi tiết và chỉnh sửa từng task"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Chi tiết / Sửa</span>
                        </GlassButton>

                        <GlassButton
                          type="button"
                          variant="primary"
                          size="sm"
                          glow
                          disabled={executingPlanId === message.id || Boolean(message.runId)}
                          onClick={() => handleExecutePlan(message.plan!, message.id)}
                        >
                          {executingPlanId === message.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang khởi chạy...</span>
                            </>
                          ) : message.runId ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Đang Thực Thi</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Bắt Đầu Thực Thi</span>
                            </>
                          )}
                        </GlassButton>
                      </div>
                    </div>

                    {/* LIVE SUB-AGENT WORK MONITOR (Hiển thị thời gian thực agent nào đang làm việc nào) */}
                    {isLiveTracking && viewingRun ? (
                      <div className="space-y-4 pt-1">
                        {/* Overall Progress Bar */}
                        <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5 text-indigo-500" />
                              <span>Tiến Độ Điều Phối Đa Agent:</span>
                            </span>
                            <span className="font-mono text-zinc-500 dark:text-zinc-400">
                              {completedTasks}/{totalTasks} tasks ({progressPercent}%)
                            </span>
                          </div>

                          <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-300 rounded-full"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Sub-agent Activity Rows */}
                        <div className="space-y-2.5">
                          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold px-1">
                            Các Agent Đang Hoạt Động (Live Sub-Agents)
                          </div>

                          {tasksArray.map((task) => {
                            const isRunning = task.status === 'running';
                            const isPassed = task.status === 'passed';
                            const isFailed = task.status === 'failed' || task.status === 'cancelled';
                            const isPending = task.status === 'pending';
                            const logs = viewingLogs[task.id] || [];
                            const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

                            return (
                              <div
                                key={task.id}
                                className={`p-3.5 rounded-xl border transition-all duration-200 backdrop-blur-md space-y-2 ${
                                  isRunning
                                    ? 'bg-amber-500/[0.06] dark:bg-amber-500/10 border-amber-400/40 shadow-[0_0_15px_rgba(245,158,11,0.1)] ring-1 ring-amber-400/20'
                                    : isPassed
                                    ? 'bg-emerald-500/[0.04] dark:bg-emerald-500/10 border-emerald-500/30'
                                    : isFailed
                                    ? 'bg-rose-500/[0.04] dark:bg-rose-500/10 border-rose-500/30'
                                    : 'bg-black/[0.015] dark:bg-white/[0.02] border-black/[0.05] dark:border-white/[0.06]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  {/* Role avatar & title */}
                                  <div className="flex items-start gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 flex items-center justify-center text-sm shrink-0 mt-0.5">
                                      {getRoleIcon(task.role)}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <GlassBadge variant={getRoleVariant(task.role)}>
                                          <span className="uppercase font-bold text-[9px]">
                                            Agent {task.role}
                                          </span>
                                        </GlassBadge>
                                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                          {task.title}
                                        </span>
                                      </div>

                                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                                        <span>Nhánh: <code className="bg-black/[0.04] dark:bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">{task.branch}</code></span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Status badge & quick actions */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isRunning && (
                                      <GlassBadge variant="amber" dot pulse>
                                        <span className="text-[10px] font-bold">Đang làm việc</span>
                                      </GlassBadge>
                                    )}
                                    {isPassed && (
                                      <GlassBadge variant="emerald" dot>
                                        <span className="text-[10px] font-bold">Hoàn thành</span>
                                      </GlassBadge>
                                    )}
                                    {isFailed && (
                                      <GlassBadge variant="rose" dot>
                                        <span className="text-[10px] font-bold">Lỗi / Hủy</span>
                                      </GlassBadge>
                                    )}
                                    {isPending && (
                                      <GlassBadge variant="neutral">
                                        <span className="text-[10px]">Đang chờ</span>
                                      </GlassBadge>
                                    )}

                                    {/* Nút xem Live Terminal */}
                                    <button
                                      type="button"
                                      onClick={() => setActiveLogTask(task)}
                                      className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono"
                                      title="Xem log terminal thời gian thực của agent này"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">Log ({logs.length})</span>
                                    </button>

                                    {/* Hủy task nếu đang chạy */}
                                    {isRunning && onTaskCancelled && (
                                      <button
                                        type="button"
                                        onClick={() => onTaskCancelled(task.id)}
                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                                        title="Hủy task này"
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Live Terminal log preview snippet */}
                                {latestLog && (
                                  <div className="p-2 rounded-lg bg-zinc-950 text-zinc-300 font-mono text-[11px] truncate flex items-center gap-2 border border-white/[0.06]">
                                    <span className="text-emerald-400 font-bold">$</span>
                                    <span className="truncate">{latestLog}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* All tasks passed -> Merge Action Banner */}
                        {allTasksPassed && (
                          <div className="p-4 rounded-xl bg-emerald-500/[0.08] dark:bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs animate-in zoom-in-95 duration-200">
                            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              <span>Tất cả các Agent đã hoàn thành nhiệm vụ và pass kiểm thử!</span>
                            </div>

                            <GlassButton
                              type="button"
                              variant="primary"
                              size="sm"
                              glow
                              disabled={isMerging}
                              onClick={() => handleMerge(viewingRun.id)}
                            >
                              {isMerging ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Đang hợp nhất...</span>
                                </>
                              ) : (
                                <>
                                  <GitMerge className="w-3.5 h-3.5" />
                                  <span>Hợp Nhất Nhánh (Merge)</span>
                                </>
                              )}
                            </GlassButton>
                          </div>
                        )}

                        {mergeError && (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
                            {mergeError}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Preview tĩnh trước khi chạy */
                      <div className="space-y-2">
                        {message.plan.plan.tasks.map((task, idx) => (
                          <div
                            key={task.id || idx}
                            className="p-3 rounded-xl border border-black/[0.05] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.02] flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="w-6 h-6 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-xs mt-0.5">
                                {getRoleIcon(task.role)}
                              </div>
                              <div className="space-y-1">
                                <div className="font-medium text-zinc-900 dark:text-zinc-200">
                                  {task.title}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                                  <span>Nhánh: <code className="bg-black/[0.05] dark:bg-white/[0.06] px-1 py-0.5 rounded">{task.branch}</code></span>
                                  {task.dependsOn && task.dependsOn.length > 0 && (
                                    <span>• Phụ thuộc: {task.dependsOn.join(', ')}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <GlassBadge variant={getRoleVariant(task.role)}>
                              <span className="uppercase font-bold text-[9px]">{task.role}</span>
                            </GlassBadge>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions footer */}
                    {message.runId && (
                      <div className="flex items-center justify-between pt-2 border-t border-black/[0.06] dark:border-white/[0.08] text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 font-mono">
                          <CheckCircle2 className="w-4 h-4" /> Run #{message.runId.slice(0, 8)}
                        </span>
                        <GlassButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onViewRun(message.runId!)}
                        >
                          <span>Mở Bảng Điều Phối (Kanban)</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </GlassButton>
                      </div>
                    )}
                  </GlassCard>
                )}

                <div className="text-[10px] text-zinc-400 font-mono px-1">
                  {message.timestamp}
                </div>
              </div>

              {/* Avatar User */}
              {isUser && (
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5 shadow-sm">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Quick Prompts suggestions if few messages */}
      {messages.length <= 2 && (
        <div className="pb-3 shrink-0 animate-in fade-in duration-300">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Gợi ý mục tiêu kế hoạch:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {QUICK_PROMPTS.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => handleSend(item.prompt)}
                className="text-left p-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.025] hover:border-indigo-400/50 hover:bg-white/90 dark:hover:bg-white/[0.05] transition-all cursor-pointer group backdrop-blur-md"
              >
                <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center justify-between">
                  <span>{item.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                  {item.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Bottom Chat Input Box */}
      <div className="pb-6 pt-2 shrink-0">
        <div className="relative rounded-2xl liquid-glass-panel p-2 shadow-2xl transition-all border border-black/10 dark:border-white/[0.12]">
          {/* Top subtle bar inside input */}
          <div className="flex items-center justify-between px-3 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 border-b border-black/[0.04] dark:border-white/[0.05] mb-2 font-mono">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Bot className="w-3 h-3 text-indigo-500" />
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Squad Orchestrator</span>
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">•</span>
              <span className="text-indigo-600 dark:text-indigo-400">Điều phối đa agent song song</span>
            </div>

            {onNavigateToProviders && (
              <button
                type="button"
                onClick={onNavigateToProviders}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors cursor-pointer"
                title="Thay đổi Model hoặc API Provider trong cài đặt"
              >
                <Sliders className="w-3 h-3" />
                <span>Cấu hình Model</span>
              </button>
            )}
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputGoal}
            onChange={(e) => setInputGoal(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            placeholder={
              repoId
                ? 'Mô tả mục tiêu của bạn (ví dụ: Tạo module auth JWT và viết unit tests)... Nhấn Enter để gửi'
                : 'Vui lòng chọn repository ở thanh trên trước...'
            }
            className="w-full bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none resize-none leading-relaxed max-h-44 min-h-[44px]"
          />

          {/* Footer bar with shortcut and Send button */}
          <div className="flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10">
                Enter
              </kbd>
              <span>gửi</span>
              <kbd className="px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10">
                Shift+Enter
              </kbd>
              <span>xuống dòng</span>
            </div>

            <GlassButton
              type="button"
              variant="primary"
              size="sm"
              glow={Boolean(inputGoal.trim())}
              disabled={!inputGoal.trim() || isGenerating}
              onClick={() => handleSend()}
              className="rounded-xl px-4 py-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lập kế hoạch...</span>
                </>
              ) : (
                <>
                  <span>Gửi</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </GlassButton>
          </div>
        </div>
      </div>

      {/* Terminal Log Drawer (khi click vào xem log của agent) */}
      {activeLogTask && (
        <LogDrawer
          task={activeLogTask}
          logs={viewingLogs[activeLogTask.id] || []}
          runningTasks={runningTasks}
          onSelectTask={(taskId) => {
            const nextTask = viewingTasks[taskId];
            if (nextTask) setActiveLogTask(nextTask);
          }}
          onClose={() => setActiveLogTask(null)}
        />
      )}

      {/* Merge Modal */}
      {mergeReport && (
        <MergeModal
          report={mergeReport}
          onClose={() => setMergeReport(null)}
        />
      )}
    </div>
  );
};
