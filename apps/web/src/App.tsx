import { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ActiveRunBanner } from './components/plan/ActiveRunBanner';
import { PlanCreator } from './components/plan/PlanCreator';
import { PlanReviewModal } from './components/plan/PlanReviewModal';
import { KanbanBoard } from './components/dashboard/KanbanBoard';
import { AiProviderHubModal } from './components/providers/AiProviderHubModal';
import { AmbientBackdrop } from './components/glass/AmbientBackdrop';
import { GlassCard } from './components/glass/GlassCard';
import { useRepos } from './hooks/useRepos';
import { useSquadEvents } from './hooks/useSquadEvents';
import { useTheme } from './hooks/useTheme';
import type { PlanResponse } from '@squad/shared-types';
import { Layers, AlertCircle, Loader2 } from 'lucide-react';

export function App() {
  const { theme, toggleTheme } = useTheme();

  const {
    repos,
    selectedRepoId,
    setSelectedRepoId,
    runs,
    activeRun,
    isLoading: isReposLoading,
    error: reposError,
    refreshRepos,
    refreshRuns,
  } = useRepos();

  const [currentViewRunId, setCurrentViewRunId] = useState<string | null>(null);
  const [createdPlan, setCreatedPlan] = useState<PlanResponse | null>(null);
  const [showAiHubModal, setShowAiHubModal] = useState(false);

  // Mặc định view run active gần nhất nếu có, hoặc run đầu tiên trong lịch sử
  useEffect(() => {
    if (activeRun) {
      setCurrentViewRunId(activeRun.id);
    } else if (runs.length > 0 && !currentViewRunId) {
      setCurrentViewRunId(runs[0].id);
    }
  }, [activeRun, runs, currentViewRunId]);

  // Hook quản lý snapshot + SSE delta cho run đang xem
  const {
    run: viewingRun,
    tasks: viewingTasks,
    taskLogs: viewingLogs,
    isConnected,
    isLoading: isRunLoading,
    error: runError,
    dispatch,
    refresh: refreshRunDetail,
  } = useSquadEvents(currentViewRunId);

  const handleSelectRepo = (repoId: string) => {
    setSelectedRepoId(repoId);
    setCurrentViewRunId(null);
  };

  const handlePlanCreated = (planData: PlanResponse) => {
    setCreatedPlan(planData);
  };

  const handleRunStarted = (runId: string) => {
    setCreatedPlan(null);
    refreshRuns();
    setCurrentViewRunId(runId);
    refreshRunDetail();
  };

  const handleRefresh = () => {
    refreshRuns();
    refreshRunDetail();
  };

  const handleTaskCancelled = (taskId: string) => {
    dispatch({ type: 'TASK_CANCELLED', taskId });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-zinc-900 dark:bg-[#07070a] dark:text-zinc-100 flex flex-col font-sans relative selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:bg-indigo-500/40 dark:selection:text-white transition-colors duration-300">
      {/* Liquid Ambient Lighting Mesh */}
      <AmbientBackdrop />

      {/* Top Glass Navbar */}
      <Header
        repos={repos}
        selectedRepoId={selectedRepoId}
        onSelectRepo={handleSelectRepo}
        onRepoAdded={refreshRepos}
        onOpenAiHub={() => setShowAiHubModal(true)}
        isConnected={isConnected}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left Frosted Glass Sidebar */}
        <Sidebar
          runs={runs}
          selectedRunId={currentViewRunId}
          onSelectRun={(runId) => setCurrentViewRunId(runId)}
          onRefresh={handleRefresh}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
          {reposError && (
            <GlassCard
              variant="glow-rose"
              className="p-4 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2.5 border-rose-500/30"
            >
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
              <span>{reposError}</span>
            </GlassCard>
          )}

          {isReposLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-500 dark:text-zinc-400 gap-3">
              <div className="relative">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500 dark:text-indigo-400" />
                <div className="absolute inset-0 blur-md bg-indigo-500/30 -z-10 rounded-full" />
              </div>
              <span className="text-xs font-medium tracking-wide uppercase">
                Đang nạp dữ liệu repositories...
              </span>
            </div>
          ) : !selectedRepoId ? (
            <GlassCard
              variant="default"
              className="text-center py-20 p-8 max-w-2xl mx-auto"
            >
              <div className="w-16 h-16 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/5">
                <Layers className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
              </div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                Chưa có Repository nào được chọn
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                Vui lòng chọn repository từ thanh menu trên hoặc bấm &ldquo;Thêm Repo&rdquo; để đăng ký thư mục dự án và bắt đầu điều phối đa agent.
              </p>
            </GlassCard>
          ) : (
            <>
              {/* RÀNG BUỘC KIẾN TRÚC: 1 RUN ACTIVE / REPO
                  Nếu repo có run active: ẨN form tạo plan, HIỆN ActiveRunBanner
                  Nếu repo rảnh: HIỆN PlanCreator
              */}
              {activeRun ? (
                <ActiveRunBanner
                  activeRun={activeRun}
                  onViewRun={(runId) => setCurrentViewRunId(runId)}
                />
              ) : (
                <PlanCreator
                  repoId={selectedRepoId}
                  onPlanCreated={handlePlanCreated}
                />
              )}

              {/* View Run Board */}
              {isRunLoading ? (
                <div className="flex items-center justify-center py-20 text-zinc-500 dark:text-zinc-400 gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500 dark:text-indigo-400" />
                  <span className="text-xs font-mono">Đang nạp snapshot trạng thái...</span>
                </div>
              ) : viewingRun ? (
                <>
                  {runError && (
                    <GlassCard
                      variant="glow-amber"
                      className="p-3 mb-4 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2 border-amber-500/30"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>{runError}</span>
                    </GlassCard>
                  )}
                  <KanbanBoard
                    run={viewingRun}
                    tasks={viewingTasks}
                    taskLogs={viewingLogs}
                    repoId={selectedRepoId || undefined}
                    onTaskCancelled={handleTaskCancelled}
                    onRunStarted={handleRunStarted}
                  />
                </>
              ) : runError ? (
                <GlassCard
                  variant="glow-rose"
                  className="p-4 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{runError}</span>
                </GlassCard>
              ) : (
                <GlassCard variant="default" className="text-center py-16 p-6">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Chọn một run từ danh sách lịch sử ở sidebar trái để xem chi tiết điều phối.
                  </p>
                </GlassCard>
              )}
            </>
          )}
        </main>
      </div>

      {/* Plan Review Modal */}
      {createdPlan && selectedRepoId && (
        <PlanReviewModal
          repoId={selectedRepoId}
          planData={createdPlan}
          onClose={() => setCreatedPlan(null)}
          onRunStarted={handleRunStarted}
        />
      )}

      {/* AI Provider Hub & Model Manager Modal */}
      {showAiHubModal && (
        <AiProviderHubModal
          selectedRepoId={selectedRepoId}
          onClose={() => setShowAiHubModal(false)}
        />
      )}
    </div>
  );
}

export default App;
