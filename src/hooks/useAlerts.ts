import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAlerts } from '../api/client';
import type { WeatherAlert } from '../lib/types';

const POLL_MS = 150_000; // ~2.5 min

export function useAlerts(lat: number | null, lon: number | null, enabled = true) {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [count, setCount] = useState(0);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (lat == null || lon == null || !enabled) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const data = await fetchAlerts(lat, lon);
      if (ac.signal.aborted) return;
      setAlerts(data.alerts);
      setCount(data.count);
      setSource(data.source);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Alerts feed failed');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [lat, lon, enabled]);

  useEffect(() => {
    if (lat == null || lon == null || !enabled) {
      setAlerts([]);
      setCount(0);
      return;
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [lat, lon, enabled, refresh]);

  return { alerts, count, source, loading, error, updatedAt, refresh };
}
