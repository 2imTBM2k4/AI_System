import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Sliders,
  Terminal,
  GitMerge,
  Ban,
  Activity,
  MessageSquare,
  Workflow,
  RotateCcw,
  FileText,
  BookOpen,
} from 'lucide-react';
import type { PlanResponse, RunRecordDto, TaskRecordDto, MergeReportDto, ChatMode } from '@squad/shared-types';
import { startRun, mergeRun, sendChatMessage, retryTask, getRepoFile } from '../../api/client';
import { GlassCard } from '../glass/GlassCard';
import { GlassBadge } from '../glass/GlassBadge';
import { GlassButton } from '../glass/GlassButton';
import { LogDrawer } from '../terminal/LogDrawer';
import { MarkdownPreviewDrawer } from '../preview/MarkdownPreviewDrawer';
import { MergeModal } from '../dashboard/MergeModal';
import type { ChatSession } from '../../lib/chatStorage';

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
  activeSession?: ChatSession | null;
  onUpdateSessionMessages?: (messages: ChatMessage[], newTitle?: string, runId?: string) => void;
  onPlanCreated: (planData: PlanResponse) => void;
  onRunStarted: (runId: string) => void;
  onOpenReviewModal: (planData: PlanResponse) => void;
  onViewRun: (runId: string) => void;
  onTaskCancelled?: (taskId: string) => void;
  onNavigateToProviders?: () => void;
}

export const PlanningChatView: React.FC<PlanningChatViewProps> = ({
  repoId,
  activeRun,
  currentViewRunId,
  viewingRun,
  viewingTasks,
  viewingLogs,
  activeSession,
  onUpdateSessionMessages,
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

  // Markdown Preview Drawer state
  const [activeMarkdownDoc, setActiveMarkdownDoc] = useState<{
    title: string;
    content: string;
    filePath?: string;
  } | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'terminal' | 'markdown'>('markdown');
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);

  const handleOpenMarkdownPreview = useCallback((title: string, content: string, filePath?: string) => {
    setActiveMarkdownDoc({ title, content, filePath });
    setRightPanelTab('markdown');
  }, []);

  const handleOpenFilePreview = useCallback(
    async (filePath: string) => {
      if (!repoId) return;
      setLoadingFilePath(filePath);
      try {
        const res = await getRepoFile(repoId, filePath);
        setActiveMarkdownDoc({
          title: filePath.split('/').pop() || filePath,
          content: res.content,
          filePath,
        });
        setRightPanelTab('markdown');
      } catch (err: any) {
        alert(`Không thể đọc file ${filePath}: ${err?.message || 'File không tồn tại'}`);
      } finally {
        setLoadingFilePath(null);
      }
    },
    [repoId]
  );

  // Merge state
  const [mergeReport, setMergeReport] = useState<MergeReportDto | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const [chatMode, setChatMode] = useState<ChatMode>('auto');
  const [retryingTaskIds, setRetryingTaskIds] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (activeSession && activeSession.messages && activeSession.messages.length > 0) {
      return activeSession.messages;
    }
    return [
      {
        id: 'msg-welcome',
        sender: 'assistant',
        text: 'Xin chào! Tôi là **Squad AI Orchestrator & Technical Advisor**.\n\nBạn có thể:\n- 💬 **Hỏi đáp / Tư vấn**: Hỏi về kiến trúc codebase, giải thích file code, thảo luận giải pháp kỹ thuật.\n- ⚡ **Lập kế hoạch**: Nhập nhiệm vụ lập trình để tôi phân rã thành các task song song cho các agent (Backend, Frontend, Tester, DevOps) thực thi.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  // Tự động tải lịch sử chat khi chuyển activeSession
  useEffect(() => {
    if (activeSession && activeSession.messages && activeSession.messages.length > 0) {
      setMessages(activeSession.messages);
    }
  }, [activeSession?.id]);

  // Kích thước Terminal drawer (kéo chuột để co giãn tùy ý)
  const [terminalWidth, setTerminalWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.min(Math.max(Math.floor(window.innerWidth * 0.46), 440), 920);
    }
    return 560;
  });
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const minW = 320;
      const maxW = Math.max(320, window.innerWidth - 360);
      setTerminalWidth(Math.min(Math.max(newWidth, minW), maxW));
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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
    const assistantMsgId = `ast-${Date.now()}`;

    let messageText = goal;
    let effectiveMode: ChatMode = chatMode;

    if (messageText.startsWith('/ask ')) {
      effectiveMode = 'ask';
      messageText = messageText.slice(5).trim();
    } else if (messageText.startsWith('/plan ')) {
      effectiveMode = 'plan';
      messageText = messageText.slice(6).trim();
    } else if (messageText.startsWith('/chat ')) {
      effectiveMode = 'ask';
      messageText = messageText.slice(6).trim();
    }

    const newMsgs: ChatMessage[] = [
      ...messages,
      {
        id: userMsgId,
        sender: 'user',
        text: goal,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: assistantMsgId,
        sender: 'assistant',
        text: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isPlanning: true,
      },
    ];

    setMessages(newMsgs);
    const sessionTitle =
      !activeSession?.title || activeSession.title === 'Cuộc trò chuyện mới' ? messageText : undefined;
    onUpdateSessionMessages?.(newMsgs, sessionTitle);

    setInputGoal('');
    setIsGenerating(true);

    try {
      const response = await sendChatMessage(repoId, messageText, effectiveMode);

      if (response.type === 'plan') {
        onPlanCreated(response);
        setMessages((prev) => {
          const next = prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  isPlanning: false,
                  plan: response,
                  text: `Tôi đã lập kế hoạch và phân rã thành **${response.plan.tasks.length} tasks song song**. Mỗi agent sẽ nhận một nhiệm vụ riêng biệt. Hãy xem chi tiết và bấm **Bắt đầu thực thi** để kích hoạt các agent.`,
                }
              : msg
          );
          onUpdateSessionMessages?.(next);
          return next;
        });
      } else {
        setMessages((prev) => {
          const next = prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  isPlanning: false,
                  text: response.reply,
                }
              : msg
          );
          onUpdateSessionMessages?.(next);
          return next;
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Không thể xử lý yêu cầu';
      setMessages((prev) => {
        const next = prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                isPlanning: false,
                text: `Rất tiếc, đã xảy ra lỗi: ${errMsg}`,
                error: errMsg,
              }
            : msg
        );
        onUpdateSessionMessages?.(next);
        return next;
      });
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

      setMessages((prev) => {
        const next = prev.map((msg) =>
          msg.id === msgId
            ? {
                ...msg,
                runId: res.run.id,
                text: `${msg.text}\n\n🚀 **Đã khởi chạy Run #${res.run.id.slice(0, 8)} thành công!** Các agent chuyên trách đang bắt đầu nhận việc song song bên dưới:`,
              }
            : msg
        );
        onUpdateSessionMessages?.(next, undefined, res.run.id);
        return next;
      });
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

  const handleRetryTask = async (targetRunId: string, taskId: string) => {
    try {
      setRetryingTaskIds((prev) => new Set(prev).add(taskId));
      const targetTask = viewingTasks[taskId];
      if (targetTask) {
        setActiveLogTask({
          ...targetTask,
          status: 'running',
          error: null,
        });
      }
      await retryTask(targetRunId, taskId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể thử lại task này');
    } finally {
      setRetryingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
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
    <div
      className={`flex-1 flex h-full w-full overflow-hidden relative min-h-0 bg-[var(--canvas-bg)] ${
        isResizing ? 'select-none cursor-col-resize' : ''
      }`}
    >
      {/* Left Chat Pane */}
      <div
        className={`flex flex-col h-full overflow-hidden min-w-0 min-h-0 ${
          activeLogTask
            ? 'flex-1 min-w-[320px] border-r border-[var(--color-warm-mist)]'
            : 'flex-1 max-w-4xl mx-auto w-full'
        }`}
      >
        {/* Banner thông báo nếu có run đang chạy */}
        {activeRun && (
          <div className="pt-3 pb-1 px-4 md:px-6 shrink-0">
            <div className="p-3 rounded-2xl bg-amber-500/[0.05] dark:bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 shadow-[var(--shadow-subtle)] animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                <span className="text-xs font-medium text-amber-800 dark:text-amber-300 shrink-0">
                  Run <span className="font-mono">#{activeRun.id.slice(0, 8)}</span>:
                </span>
                <span className="text-xs text-[var(--text-primary)] truncate font-normal">
                  {activeRun.goal}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {tasksArray.length > 0 && (
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (activeLogTask) {
                        setActiveLogTask(null);
                      } else {
                        const targetTask = runningTasks[0] || tasksArray[0];
                        if (targetTask) setActiveLogTask(targetTask);
                      }
                    }}
                    className={`transition-colors ${
                      activeLogTask
                        ? 'border-[var(--color-deep-teal)] text-[var(--color-deep-teal)] dark:text-teal-300 font-medium'
                        : 'text-[var(--text-secondary)]'
                    }`}
                    title="Bật/tắt thanh Terminal Log bên phải"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>{activeLogTask ? 'Ẩn Terminal' : 'Terminal'}</span>
                  </GlassButton>
                )}
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onViewRun(activeRun.id)}
                  className="shrink-0 text-amber-700 dark:text-amber-300 border-amber-500/30"
                >
                  <span>Kanban</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </GlassButton>
              </div>
            </div>
          </div>
        )}

        {/* Main Chat Thread Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-5 scroll-smooth pr-2 min-h-0">
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
              className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* Avatar Bot */}
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-[var(--card-bg)] border border-[var(--color-warm-mist)] text-[var(--color-deep-teal)] flex items-center justify-center shrink-0 shadow-[var(--shadow-subtle)] mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              {/* Message Bubble Container */}
              <div className={`max-w-3xl space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Orchestrator Badge & Sub-agent Chips */}
                {!isUser && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-medium tracking-wider text-[var(--color-deep-teal)] uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-deep-teal)]" />
                      ORCHESTRATOR
                    </span>

                    {/* Chips các sub-agent / tools liên quan */}
                    {distinctRoles.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {distinctRoles.map((r) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-[var(--color-warm-mist)] text-[10px] font-mono text-[var(--text-secondary)] flex items-center gap-1"
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
                  className={`p-3.5 rounded-2xl text-xs md:text-sm leading-relaxed transition-all ${
                    isUser
                      ? 'bg-[var(--card-bg)] border border-[var(--color-warm-mist)] text-[var(--text-primary)] shadow-[var(--shadow-subtle)] ml-12'
                      : 'bg-[var(--card-bg)] border border-[var(--color-warm-mist)] text-[var(--text-primary)] shadow-[var(--shadow-subtle)]'
                  }`}
                >
                  {/* Thinking status */}
                  {message.isPlanning && (
                    <div className="flex items-center gap-2.5 py-1 text-[var(--color-deep-teal)] font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--color-deep-teal)]" />
                      <span className="text-xs">
                        {chatMode === 'ask'
                          ? 'Đang tìm kiếm thông tin và suy nghĩ câu trả lời...'
                          : chatMode === 'plan'
                          ? 'Đang phân tích codebase và lập kế hoạch phân rã task...'
                          : 'Đang xử lý yêu cầu và phân tích ngữ cảnh...'}
                      </span>
                    </div>
                  )}

                  {/* Text content */}
                  {message.text && (
                    <div className="whitespace-pre-wrap font-sans text-xs md:text-sm">
                      {message.text}
                    </div>
                  )}

                  {/* Actions & File badges for Assistant message */}
                  {!isUser && message.text && (
                    <div className="mt-3 pt-2.5 border-t border-[var(--color-warm-mist)]/50 flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleOpenMarkdownPreview('Phản Hồi AI', message.text)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-deep-teal)]/10 text-[var(--color-deep-teal)] dark:text-teal-300 hover:bg-[var(--color-deep-teal)]/20 border border-[var(--color-deep-teal)]/25 transition-all cursor-pointer shadow-sm"
                        title="Mở xem trước định dạng Markdown của phản hồi này ở cột bên phải"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Xem Preview .md bên phải</span>
                      </button>

                      {/* Các file .md được nhắc đến trong tin nhắn */}
                      {(() => {
                        const mdMatches = Array.from(new Set(message.text.match(/\b[\w.-]+\.md\b/gi) || []));
                        if (mdMatches.length === 0 || !repoId) return null;
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                              <BookOpen className="w-3 h-3" /> File tài liệu:
                            </span>
                            {mdMatches.map((fileName) => (
                              <button
                                key={fileName}
                                type="button"
                                disabled={loadingFilePath === fileName}
                                onClick={() => handleOpenFilePreview(fileName)}
                                className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[var(--color-deep-teal)]/15 hover:text-[var(--color-deep-teal)] border border-[var(--color-warm-mist)] transition-colors cursor-pointer flex items-center gap-1 text-[var(--text-secondary)]"
                                title={`Nạp và xem trước file ${fileName} từ repository`}
                              >
                                {loadingFilePath === fileName ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-[var(--color-deep-teal)]" />
                                ) : (
                                  <FileText className="w-3 h-3 text-[var(--color-deep-teal)]" />
                                )}
                                <span>{fileName}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
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
                    className="p-4 space-y-3 border-[var(--color-warm-mist)] shadow-[var(--shadow-subtle)] animate-in zoom-in-95 duration-200"
                  >
                    <div className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--color-warm-mist)]">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-[var(--color-deep-teal)]" />
                          <h4 className="text-sm font-medium text-[var(--text-primary)]">
                            Phân Bổ Kế Hoạch Cho Các Agent
                          </h4>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {message.plan.plan.tasks.length} tasks • Chạy song song độc lập theo worktree
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <GlassButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenReviewModal(message.plan!)}
                          title="Xem chi tiết và chỉnh sửa từng task"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                          <span>Chi tiết / Sửa</span>
                        </GlassButton>

                        <GlassButton
                          type="button"
                          variant="teal"
                          size="sm"
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
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
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

                    {/* LIVE SUB-AGENT WORK MONITOR */}
                    {isLiveTracking && viewingRun ? (
                      <div className="space-y-3 pt-1">
                        {/* Overall Progress Bar */}
                        <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--color-warm-mist)] space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5 text-[var(--color-deep-teal)]" />
                              <span>Tiến Độ Điều Phối Đa Agent:</span>
                            </span>
                            <span className="font-mono text-[var(--text-muted)]">
                              {completedTasks}/{totalTasks} tasks ({progressPercent}%)
                            </span>
                          </div>

                          <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-deep-teal)] transition-all duration-300 rounded-full"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Sub-agent Activity Rows */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-medium">
                              Các Agent Đang Hoạt Động (Live Sub-Agents)
                            </div>
                            {tasksArray.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeLogTask) {
                                    setActiveLogTask(null);
                                  } else {
                                    const running = runningTasks[0] || tasksArray[0];
                                    if (running) {
                                      setActiveLogTask(running);
                                      setRightPanelTab('terminal');
                                    }
                                  }
                                }}
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-normal text-[var(--text-secondary)] hover:text-[var(--color-deep-teal)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors cursor-pointer font-mono"
                              >
                                <Terminal className="w-3.5 h-3.5 text-[var(--color-deep-teal)]" />
                                <span>{activeLogTask ? 'Thu gọn Terminal' : 'Mở Terminal Bên Phải'}</span>
                              </button>
                            )}
                          </div>

                          {tasksArray.map((task) => {
                            const isRunning = task.status === 'running';
                            const isPassed = task.status === 'passed';
                            const isFailed =
                              task.status === 'failed' ||
                              task.status === 'agent_failed' ||
                              task.status === 'bootstrap_failed' ||
                              task.status === 'verify_failed' ||
                              task.status === 'interrupted' ||
                              task.status === 'error' ||
                              task.status === 'cancelled';
                            const isPending = task.status === 'pending';
                            const logs = viewingLogs[task.id] || [];
                            const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;
                            const isCurrentLogActive = activeLogTask?.id === task.id;
                            const planTask = (viewingRun || activeRun)?.plan?.tasks.find((pt) => pt.id === task.id);
                            const taskFiles: string[] = planTask?.files || [];

                            return (
                              <div
                                key={task.id}
                                className={`p-3 rounded-xl border transition-all duration-150 space-y-2 ${
                                  isRunning
                                    ? 'bg-amber-500/[0.04] dark:bg-amber-500/10 border-amber-500/40'
                                    : isPassed
                                    ? 'bg-emerald-500/[0.03] dark:bg-emerald-500/10 border-emerald-500/30'
                                    : isFailed
                                    ? 'bg-rose-500/[0.03] dark:bg-rose-500/10 border-rose-500/30'
                                    : 'bg-[var(--card-bg)] border-[var(--color-warm-mist)]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  {/* Role avatar & title */}
                                  <div className="flex items-start gap-2.5">
                                    <div className="w-6 h-6 rounded-md bg-black/[0.03] dark:bg-white/[0.05] border border-[var(--color-warm-mist)] flex items-center justify-center text-xs shrink-0 mt-0.5">
                                      {getRoleIcon(task.role)}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <GlassBadge variant={getRoleVariant(task.role)}>
                                          <span className="uppercase font-medium text-[9px]">
                                            Agent {task.role}
                                          </span>
                                        </GlassBadge>
                                        <span className="text-xs font-medium text-[var(--text-primary)]">
                                          {task.title}
                                        </span>
                                      </div>

                                      <div className="text-[11px] text-[var(--text-secondary)] font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                                        <span>Nhánh: <code className="bg-black/[0.04] dark:bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">{task.branch}</code></span>
                                      </div>

                                      {/* Files của task */}
                                      {taskFiles.length > 0 && (
                                        <div className="flex items-center gap-1 flex-wrap mt-1">
                                          {taskFiles.map((file) => {
                                            const isMd = file.toLowerCase().endsWith('.md');
                                            return isMd ? (
                                              <button
                                                key={file}
                                                type="button"
                                                onClick={() => handleOpenFilePreview(file)}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--color-deep-teal)]/10 text-[var(--color-deep-teal)] dark:text-teal-300 hover:bg-[var(--color-deep-teal)]/20 border border-[var(--color-deep-teal)]/25 transition-colors cursor-pointer"
                                                title={`Xem trước file tài liệu ${file} ở cột bên phải`}
                                              >
                                                <FileText className="w-2.5 h-2.5" />
                                                <span>{file}</span>
                                              </button>
                                            ) : (
                                              <span
                                                key={file}
                                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/[0.03] dark:bg-white/[0.05] text-[var(--text-muted)]"
                                              >
                                                {file}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Status badge & quick actions */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isRunning && (
                                      <GlassBadge variant="amber" dot pulse>
                                        <span className="text-[10px] font-medium">Đang làm việc</span>
                                      </GlassBadge>
                                    )}
                                    {isPassed && (
                                      <GlassBadge variant="emerald" dot>
                                        <span className="text-[10px] font-medium">Hoàn thành</span>
                                      </GlassBadge>
                                    )}
                                    {isFailed && (
                                      <GlassBadge variant="rose" dot>
                                        <span className="text-[10px] font-medium">Lỗi / Hủy</span>
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
                                      onClick={() => {
                                        setActiveLogTask(isCurrentLogActive ? null : task);
                                        setRightPanelTab('terminal');
                                      }}
                                      className={`p-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono ${
                                        isCurrentLogActive
                                          ? 'bg-[var(--color-deep-teal)]/15 text-[var(--color-deep-teal)] dark:text-teal-300 font-medium'
                                          : 'text-[var(--text-secondary)] hover:text-[var(--color-deep-teal)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                                      }`}
                                      title="Xem log terminal thời gian thực của agent này ở bên phải"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">Log ({logs.length})</span>
                                    </button>

                                    {/* Thử lại task nếu bị lỗi hoặc bỏ qua */}
                                    {(isFailed || task.status === 'skipped') && (viewingRun || activeRun) && (
                                      <button
                                        type="button"
                                        disabled={retryingTaskIds.has(task.id)}
                                        onClick={() => handleRetryTask((viewingRun || activeRun)!.id, task.id)}
                                        className="px-2 py-1 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                        title="Thử lại và chạy lại task này"
                                      >
                                        <RotateCcw className={`w-3 h-3 ${retryingTaskIds.has(task.id) ? 'animate-spin' : ''}`} />
                                        <span>Thử lại</span>
                                      </button>
                                    )}

                                    {/* Hủy task nếu đang chạy */}
                                    {isRunning && onTaskCancelled && (
                                      <button
                                        type="button"
                                        onClick={() => onTaskCancelled(task.id)}
                                        className="p-1 rounded-md text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                        title="Hủy task này"
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Live Terminal log preview snippet */}
                                {latestLog && (
                                  <div
                                    onClick={() => {
                                      setActiveLogTask(task);
                                      setRightPanelTab('terminal');
                                    }}
                                    className="p-2 rounded-lg bg-[var(--color-ink)] text-[var(--color-parchment)] font-mono text-[11px] truncate flex items-center justify-between gap-2 border border-transparent cursor-pointer hover:border-[var(--color-deep-teal)] transition-colors group"
                                    title="Click để mở terminal bên phải"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-emerald-400 font-medium">$</span>
                                      <span className="truncate">{latestLog}</span>
                                    </div>
                                    <span className="text-[10px] text-zinc-400 group-hover:text-white hidden sm:inline-flex items-center gap-1 shrink-0">
                                      <Terminal className="w-3 h-3" />
                                      <span>Mở terminal</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* All tasks passed -> Merge Action Banner */}
                        {allTasksPassed && (
                          <div className="p-3.5 rounded-xl bg-emerald-500/[0.08] dark:bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs animate-in zoom-in-95 duration-200">
                            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              <span>Tất cả các Agent đã hoàn thành nhiệm vụ và pass kiểm thử!</span>
                            </div>

                            <GlassButton
                              type="button"
                              variant="teal"
                              size="sm"
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
                                  <span>Hợp Nhất Code (Auto Merge)</span>
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
                            className="p-3 rounded-xl border border-[var(--color-warm-mist)] bg-[var(--card-bg)] flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="w-6 h-6 rounded-md bg-black/[0.03] dark:bg-white/[0.05] border border-[var(--color-warm-mist)] flex items-center justify-center text-xs mt-0.5">
                                {getRoleIcon(task.role)}
                              </div>
                              <div className="space-y-0.5">
                                <div className="font-medium text-[var(--text-primary)]">
                                  {task.title}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--text-secondary)] font-mono">
                                  <span>Nhánh: <code className="bg-black/[0.04] dark:bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">{task.branch}</code></span>
                                  {task.dependsOn && task.dependsOn.length > 0 && (
                                    <span>• Phụ thuộc: {task.dependsOn.join(', ')}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <GlassBadge variant={getRoleVariant(task.role)}>
                              <span className="uppercase font-medium text-[9px]">{task.role}</span>
                            </GlassBadge>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions footer */}
                    {message.runId && (
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-warm-mist)] text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 font-mono">
                          <CheckCircle2 className="w-4 h-4" /> Run #{message.runId.slice(0, 8)}
                        </span>
                        <GlassButton
                          type="button"
                          variant="ghost"
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

                <div className="text-[10px] text-[var(--text-muted)] font-mono px-1">
                  {message.timestamp}
                </div>
              </div>

              {/* Avatar User */}
              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-[var(--color-ink)] text-[var(--color-parchment)] flex items-center justify-center shrink-0 mt-0.5 shadow-[var(--shadow-subtle)]">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Locked Bottom Chat Input Box (Khóa cứng vị trí ở đáy) */}
      <div className="shrink-0 px-4 md:px-6 pt-2 pb-3 border-t border-[var(--color-warm-mist)] bg-[var(--canvas-bg)]/95 backdrop-blur-md z-20">
        <div className="relative rounded-2xl paper-input p-2.5 bg-[var(--card-bg)] shadow-[var(--shadow-subtle)]">
          {/* Top subtle bar inside input with Mode Switcher */}
          <div className="flex items-center justify-between px-2 py-1 text-[11px] text-[var(--text-secondary)] border-b border-[var(--color-warm-mist)]/60 mb-2">
            <div className="flex items-center gap-2">
              {/* Mode Switcher Pill */}
              <div className="flex items-center gap-0.5 bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-lg border border-[var(--color-warm-mist)] text-[11px]">
                <button
                  type="button"
                  onClick={() => setChatMode('auto')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all cursor-pointer font-medium ${
                    chatMode === 'auto'
                      ? 'bg-[var(--card-bg)] text-[var(--color-deep-teal)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Chế độ Tự động: AI tự động phân biệt câu hỏi tư vấn hay nhiệm vụ lập trình (/ask hoặc /plan)"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Tự động</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode('ask')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all cursor-pointer font-medium ${
                    chatMode === 'ask'
                      ? 'bg-[var(--card-bg)] text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Chế độ Hỏi đáp: Chỉ tư vấn, giải thích code, khảo sát kiến trúc (không sinh task/plan)"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>Hỏi đáp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode('plan')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all cursor-pointer font-medium ${
                    chatMode === 'plan'
                      ? 'bg-[var(--card-bg)] text-amber-600 dark:text-amber-400 shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Chế độ Lập kế hoạch: Bắt buộc phân rã task và lập roadmap cho các agent"
                >
                  <Workflow className="w-3 h-3" />
                  <span>Lập kế hoạch</span>
                </button>
              </div>
            </div>

            {onNavigateToProviders && (
              <button
                type="button"
                onClick={onNavigateToProviders}
                className="hover:text-[var(--color-deep-teal)] flex items-center gap-1 transition-colors cursor-pointer text-[var(--text-secondary)] font-mono"
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
              !repoId
                ? 'Vui lòng chọn repository ở thanh menu trên trước...'
                : chatMode === 'ask'
                ? 'Hỏi bất kỳ điều gì về dự án, giải thích file code, tư vấn giải pháp... (gõ /ask)'
                : chatMode === 'plan'
                ? 'Mô tả nhiệm vụ cần thực thi (ví dụ: Tạo module auth JWT và viết unit tests)... (gõ /plan)'
                : 'Hỏi đáp tư vấn hoặc mô tả nhiệm vụ lập trình... (hỗ trợ /ask và /plan)'
            }
            className="w-full bg-transparent px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none leading-relaxed max-h-44 min-h-[44px]"
          />

          {/* Footer bar with shortcut and Send button */}
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-[var(--color-warm-mist)]">
                Enter
              </kbd>
              <span>gửi</span>
              <kbd className="px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-[var(--color-warm-mist)]">
                Shift+Enter
              </kbd>
              <span>xuống dòng</span>
            </div>

            <GlassButton
              type="button"
              variant={inputGoal.trim() ? "teal" : "primary"}
              size="sm"
              disabled={!inputGoal.trim() || isGenerating}
              onClick={() => handleSend()}
              className="rounded-xl px-4 py-1.5"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    {chatMode === 'ask'
                      ? 'Đang trả lời...'
                      : chatMode === 'plan'
                      ? 'Đang lập kế hoạch...'
                      : 'Đang xử lý...'}
                  </span>
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

        <div className="text-[11px] text-[var(--text-muted)] text-center pt-2 select-none">
          {chatMode === 'ask'
            ? 'Chế độ Hỏi Đáp: Trả lời và tư vấn kỹ thuật trực tiếp, không tạo kế hoạch thực thi.'
            : chatMode === 'plan'
            ? 'Chế độ Lập Kế Hoạch: Phân rã lộ trình task cho các agent thực thi song song.'
            : 'Squad AI tự động nhận diện câu hỏi tư vấn hoặc nhiệm vụ lập trình đa tác nhân.'}
        </div>
      </div>
      </div>

      {/* Resize Handle Splitter */}
      {(activeLogTask || activeMarkdownDoc) && (
        <div
          onMouseDown={startResizing}
          className={`w-2 -ml-1 z-30 cursor-col-resize h-full flex items-center justify-center shrink-0 transition-colors select-none group ${
            isResizing
              ? 'bg-[var(--color-deep-teal)]'
              : 'hover:bg-[var(--color-deep-teal)]/40 bg-transparent'
          }`}
          title="Kéo sang trái/phải để tùy ý chỉnh kích thước cột bên phải"
        >
          <div className="w-0.5 h-10 rounded-full bg-[var(--color-warm-mist)] group-hover:bg-[var(--color-deep-teal)] transition-colors pointer-events-none" />
        </div>
      )}

      {/* Terminal Log Drawer (docked bên phải) */}
      {((rightPanelTab === 'terminal' && activeLogTask) || (Boolean(activeLogTask) && !activeMarkdownDoc)) && activeLogTask && (
        <LogDrawer
          width={terminalWidth}
          task={activeLogTask}
          logs={viewingLogs[activeLogTask.id] || []}
          allTasks={tasksArray}
          runningTasks={runningTasks}
          onSelectTask={(taskId) => {
            const nextTask = viewingTasks[taskId];
            if (nextTask) setActiveLogTask(nextTask);
          }}
          onClose={() => {
            setActiveLogTask(null);
            if (activeMarkdownDoc) setRightPanelTab('markdown');
          }}
          activeTab={rightPanelTab}
          onTabChange={setRightPanelTab}
          hasMarkdownDoc={Boolean(activeMarkdownDoc)}
        />
      )}

      {/* Markdown Preview Drawer (docked bên phải) */}
      {((rightPanelTab === 'markdown' && activeMarkdownDoc) || (Boolean(activeMarkdownDoc) && !activeLogTask)) && activeMarkdownDoc && (
        <MarkdownPreviewDrawer
          width={terminalWidth}
          title={activeMarkdownDoc.title}
          content={activeMarkdownDoc.content}
          filePath={activeMarkdownDoc.filePath}
          onClose={() => {
            setActiveMarkdownDoc(null);
            if (activeLogTask) setRightPanelTab('terminal');
          }}
          activeTab={rightPanelTab}
          onTabChange={setRightPanelTab}
          hasTerminalLog={Boolean(activeLogTask)}
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
