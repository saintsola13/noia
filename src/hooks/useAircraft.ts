import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAircraft } from '../api/client';
import type { Aircraft } from '../lib/types';

const POLL_MS = 10_000;

export function useAircraft(lat: number | null, lon: number | null, radiusKm: number) {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (lat == null || lon == null) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const data = await fetchAircraft(lat, lon, radiusKm);
      if (ac.signal.aborted) return;
      setAircraft(data.aircraft);
      setCount(data.count);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Aircraft feed failed');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [lat, lon, radiusKm]);

  useEffect(() => {
    if (lat == null || lon == null) {
      setAircraft([]);
      setCount(0);
      return;
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [lat, lon, radiusKm, refresh]);

  return { aircraft, count, loading, error, updatedAt, refresh };
}
