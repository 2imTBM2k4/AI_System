import { useState, useEffect, useCallback } from 'react';
import type { RepoDto, RunRecordDto } from '@squad/shared-types';
import { listRepos, listRuns } from '../api/client';

export function useRepos() {
  const [repos, setRepos] = useState<RepoDto[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecordDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshRepos = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await listRepos();
      setRepos(data.repos);
      if (data.repos.length > 0 && !selectedRepoId) {
        setSelectedRepoId(data.repos[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách repositories');
    } finally {
      setIsLoading(false);
    }
  }, [selectedRepoId]);

  const refreshRuns = useCallback(async () => {
    if (!selectedRepoId) {
      setRuns([]);
      return;
    }
    try {
      const data = await listRuns(selectedRepoId);
      // Sort newest first
      const sorted = [...data.runs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRuns(sorted);
    } catch (err) {
      console.error('Không thể nạp lịch sử runs:', err);
    }
  }, [selectedRepoId]);

  useEffect(() => {
    refreshRepos();
  }, [refreshRepos]);

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  // Xác định active run (chỉ tính những run đang thực sự chạy)
  const activeRun = runs.find((r) => r.status === 'running') || null;

  return {
    repos,
    selectedRepoId,
    setSelectedRepoId,
    runs,
    activeRun,
    isLoading,
    error,
    refreshRepos,
    refreshRuns,
  };
}
