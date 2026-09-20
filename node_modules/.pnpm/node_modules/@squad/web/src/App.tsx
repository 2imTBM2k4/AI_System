import { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ActiveRunBanner } from './components/plan/ActiveRunBanner';
import { PlanCreator } from './components/plan/PlanCreator';
import { PlanReviewModal } from './components/plan/PlanReviewModal';
import { KanbanBoard } from './components/dashboard/KanbanBoard';
import { AiProviderHubModal } from './components/providers/AiProviderHubModal';
import { useRepos } from './hooks/useRepos';
import { useSquadEvents } from './hooks/useSquadEvents';
import type { PlanResponse } from '@squad/shared-types';
import { Layers, AlertCircle, Loader2 } from 'lucide-react';

export function App() {
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
  };

  const handleTaskCancelled = (taskId: string) => {
    dispatch({ type: 'TASK_CANCELLED', taskId });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Header
        repos={repos}
        selectedRepoId={selectedRepoId}
        onSelectRepo={handleSelectRepo}
        onRepoAdded={refreshRepos}
        onOpenAiHub={() => setShowAiHubModal(true)}
        isConnected={isConnected}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          runs={runs}
          selectedRunId={currentViewRunId}
          onSelectRun={(runId) => setCurrentViewRunId(runId)}
          onRefresh={refreshRuns}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 space-y-8">
          {reposError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>{reposError}</span>
            </div>
          )}

          {isReposLoading ? (
            <div className="flex items-center justify-center py-20 text-zinc-500 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-sm">Đang tải thông tin repositories...</span>
            </div>
          ) : !selectedRepoId ? (
            <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl p-8">
              <Layers className="w-12 h-12 mx-auto text-zinc-600 mb-3" />
              <h2 className="text-base font-bold text-zinc-200 mb-1">
                Chưa có Repository nào được chọn
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Vui lòng chọn repository từ thanh menu trên hoặc bấm &quot;Thêm Repo&quot; để đăng ký thư mục dự án của bạn.
              </p>
            </div>
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
                <div className="flex items-center justify-center py-20 text-zinc-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-xs">Đang nạp snapshot trạng thái...</span>
                </div>
              ) : runError ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {runError}
                </div>
              ) : viewingRun ? (
                <KanbanBoard
                  run={viewingRun}
                  tasks={viewingTasks}
                  taskLogs={viewingLogs}
                  onTaskCancelled={handleTaskCancelled}
                />
              ) : (
                <div className="text-center py-16 border border-zinc-800/80 bg-zinc-900/20 rounded-2xl p-6">
                  <p className="text-xs text-zinc-400">
                    Chọn một run từ danh sách lịch sử ở sidebar trái để xem chi tiết điều phối.
                  </p>
                </div>
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
