import { useState } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar, type ActiveView } from './components/layout/Sidebar';
import { PlanningChatView } from './components/views/PlanningChatView';
import { ProvidersView } from './components/views/ProvidersView';
import { AgentsView } from './components/views/AgentsView';
import { ExtensionsView } from './components/views/ExtensionsView';
import { SettingsView } from './components/views/SettingsView';
import { HistoryView } from './components/views/HistoryView';
import { PlanReviewModal } from './components/plan/PlanReviewModal';
import { AmbientBackdrop } from './components/glass/AmbientBackdrop';
import { GlassCard } from './components/glass/GlassCard';
import { useRepos } from './hooks/useRepos';
import { useSquadEvents } from './hooks/useSquadEvents';
import { useTheme } from './hooks/useTheme';
import type { PlanResponse } from '@squad/shared-types';
import { AlertCircle, Loader2 } from 'lucide-react';

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

  // Active view routing state
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [currentViewRunId, setCurrentViewRunId] = useState<string | null>(null);
  const [createdPlan, setCreatedPlan] = useState<PlanResponse | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

  const selectedRepo = repos.find((r) => r.id === selectedRepoId) || null;

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

  const handleSelectRun = (runId: string | null) => {
    setCurrentViewRunId(runId);
    if (runId) {
      refreshRunDetail();
    }
  };

  const handleViewRun = (runId: string) => {
    setCurrentViewRunId(runId);
    setActiveView('history');
    refreshRunDetail();
  };

  const handleNewPlan = () => {
    setActiveView('chat');
  };

  const handleTaskCancelled = (taskId: string) => {
    dispatch({ type: 'TASK_CANCELLED', taskId });
  };

  const getViewTitle = () => {
    switch (activeView) {
      case 'chat':
        return 'Trang Chat Lập Kế Hoạch';
      case 'providers':
        return 'Thiết Lập Nhà Cung Cấp Model';
      case 'agents':
        return 'Thiết Lập Vai Trò Agent';
      case 'extensions':
        return 'Thiết Lập Skill & Plugin';
      case 'settings':
        return 'Cài Đặt Hệ Thống & Chế Độ Thực Thi';
      case 'history':
        return 'Lịch Sử Kế Hoạch & Các Lần Thực Thi';
      default:
        return 'Squad AI Orchestrator';
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-zinc-900 dark:bg-[#07070a] dark:text-zinc-100 flex flex-col font-sans relative selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:bg-indigo-500/40 dark:selection:text-white transition-colors duration-300">
      {/* Liquid Ambient Lighting Mesh */}
      <AmbientBackdrop />

      {/* Top Header Navbar */}
      <Header
        repos={repos}
        selectedRepoId={selectedRepoId}
        onSelectRepo={handleSelectRepo}
        onRepoAdded={refreshRepos}
        isConnected={isConnected}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeViewTitle={getViewTitle()}
      />

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left AI Chat App Sidebar */}
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          runs={runs}
          selectedRunId={currentViewRunId}
          onSelectRun={handleSelectRun}
          onNewPlan={handleNewPlan}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {reposError && (
            <div className="p-4 m-4">
              <GlassCard
                variant="glow-rose"
                className="p-4 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5 border-rose-500/30"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{reposError}</span>
              </GlassCard>
            </div>
          )}

          {isReposLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 gap-3">
              <div className="relative">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <div className="absolute inset-0 blur-md bg-indigo-500/30 -z-10 rounded-full" />
              </div>
              <span className="text-xs font-medium tracking-wide uppercase">
                Đang nạp dữ liệu repositories...
              </span>
            </div>
          ) : (
            <>
              {/* RENDER ACTIVE VIEW */}
              {activeView === 'chat' && (
                <PlanningChatView
                  repoId={selectedRepoId}
                  activeRun={activeRun}
                  currentViewRunId={currentViewRunId}
                  viewingRun={viewingRun}
                  viewingTasks={viewingTasks}
                  viewingLogs={viewingLogs}
                  onPlanCreated={handlePlanCreated}
                  onRunStarted={handleRunStarted}
                  onOpenReviewModal={(p) => setCreatedPlan(p)}
                  onViewRun={handleViewRun}
                  onTaskCancelled={handleTaskCancelled}
                  onNavigateToProviders={() => setActiveView('providers')}
                />
              )}

              {activeView === 'providers' && (
                <ProvidersView onSaved={refreshRepos} />
              )}

              {activeView === 'agents' && (
                <AgentsView
                  selectedRepoId={selectedRepoId}
                  onSaved={refreshRepos}
                />
              )}

              {activeView === 'extensions' && (
                <ExtensionsView
                  selectedRepoId={selectedRepoId}
                  onSaved={refreshRepos}
                />
              )}

              {activeView === 'settings' && (
                <SettingsView
                  selectedRepo={selectedRepo}
                  onSaved={refreshRepos}
                />
              )}

              {activeView === 'history' && (
                <HistoryView
                  runs={runs}
                  selectedRunId={currentViewRunId}
                  onSelectRun={handleSelectRun}
                  onRefresh={() => {
                    refreshRuns();
                    if (currentViewRunId) refreshRunDetail();
                  }}
                  repoId={selectedRepoId || undefined}
                  viewingRun={viewingRun}
                  viewingTasks={viewingTasks}
                  viewingLogs={viewingLogs}
                  isRunLoading={isRunLoading}
                  runError={runError}
                  onTaskCancelled={handleTaskCancelled}
                  onRunStarted={handleRunStarted}
                />
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
    </div>
  );
}

export default App;
