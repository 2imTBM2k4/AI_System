import { useState, useEffect } from 'react';
import { getServerHealth, type ServerHealthInfo } from '../api/client';

export interface ServerHealthState {
  isOnline: boolean;
  latencyMs: number | null;
  info: ServerHealthInfo | null;
  lastChecked: Date | null;
  error: string | null;
}

export function useServerHealth(pollIntervalMs: number = 3000): ServerHealthState {
  const [state, setState] = useState<ServerHealthState>({
    isOnline: false,
    latencyMs: null,
    info: null,
    lastChecked: null,
    error: null,
  });

  useEffect(() => {
    let active = true;

    async function checkHealth() {
      const start = performance.now();
      try {
        const info = await getServerHealth();
        const latency = Math.round(performance.now() - start);
        if (!active) return;
        setState({
          isOnline: true,
          latencyMs: latency,
          info,
          lastChecked: new Date(),
          error: null,
        });
      } catch (err) {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          isOnline: false,
          latencyMs: null,
          lastChecked: new Date(),
          error: err instanceof Error ? err.message : 'Mất kết nối server',
        }));
      }
    }

    checkHealth();
    const timer = setInterval(checkHealth, pollIntervalMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pollIntervalMs]);

  return state;
}
