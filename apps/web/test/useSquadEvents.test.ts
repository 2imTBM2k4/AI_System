import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSquadEvents } from '../src/hooks/useSquadEvents';
import * as apiClient from '../src/api/client';
import type { RunDetailResponse } from '@squad/shared-types';

class MockEventSource {
  public url: string;
  public close = vi.fn();
  public onopen: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((e: { data: string }) => void) | null = null;

  static instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

describe('useSquadEvents lifecycle and EventSource leak prevention', () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    // @ts-expect-error Mocking global EventSource
    globalThis.EventSource = MockEventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    vi.restoreAllMocks();
  });

  it('closes old EventSource when runId changes to a new runId', async () => {
    vi.spyOn(apiClient, 'getRunDetail').mockImplementation(async (runId) => {
      return {
        run: {
          id: runId,
          repoPath: '/dummy',
          goal: `Goal for ${runId}`,
          plan: null,
          pid: 100,
          status: 'running',
          createdAt: new Date().toISOString(),
          endedAt: null,
        },
        tasks: [],
      } as RunDetailResponse;
    });

    const { rerender, unmount } = renderHook(
      ({ runId }: { runId: string | null }) => useSquadEvents(runId),
      { initialProps: { runId: 'run-A' } }
    );

    // Đợi snapshot và EventSource của run-A được mở
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const esRunA = MockEventSource.instances[0];
    expect(esRunA.url).toBe('/runs/run-A/events');
    expect(esRunA.close).not.toHaveBeenCalled();

    // Đổi prop sang run-B
    act(() => {
      rerender({ runId: 'run-B' });
    });

    // EventSource của run-A PHẢI được đóng ngay lập tức
    expect(esRunA.close).toHaveBeenCalledTimes(1);

    // Đợi EventSource của run-B được mở
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(2);
    });

    const esRunB = MockEventSource.instances[1];
    expect(esRunB.url).toBe('/runs/run-B/events');
    expect(esRunB.close).not.toHaveBeenCalled();

    // Unmount component
    unmount();

    // EventSource của run-B PHẢI được đóng khi unmount
    expect(esRunB.close).toHaveBeenCalledTimes(1);
  });

  it('never creates EventSource if component unmounts before getRunDetail resolves', async () => {
    let resolveDetail: (value: RunDetailResponse) => void;
    const pendingPromise = new Promise<RunDetailResponse>((resolve) => {
      resolveDetail = resolve;
    });

    vi.spyOn(apiClient, 'getRunDetail').mockReturnValue(pendingPromise);

    const { unmount } = renderHook(() => useSquadEvents('run-slow'));

    // Unmount trong khi REST call đang in-flight
    unmount();

    // Cho REST call resolve sau khi đã unmount
    await act(async () => {
      resolveDetail!({
        run: {
          id: 'run-slow',
          repoPath: '/dummy',
          goal: 'Slow goal',
          plan: null,
          pid: 100,
          status: 'running',
          createdAt: new Date().toISOString(),
          endedAt: null,
        },
        tasks: [],
      });
    });

    // Không được có EventSource nào được tạo sau khi unmount
    expect(MockEventSource.instances.length).toBe(0);
  });

  it('does not open EventSource if run has already ended (completed)', async () => {
    vi.spyOn(apiClient, 'getRunDetail').mockResolvedValue({
      run: {
        id: 'run-completed',
        repoPath: '/dummy',
        goal: 'Completed run',
        plan: null,
        pid: 100,
        status: 'completed',
        createdAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
      tasks: [],
    });

    const { result } = renderHook(() => useSquadEvents('run-completed'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.run?.id).toBe('run-completed');
    });

    // Run đã kết thúc -> không mở SSE delta
    expect(MockEventSource.instances.length).toBe(0);
  });
});
