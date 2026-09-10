import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCad } from '../api/client';
import type { CadIncident } from '../lib/types';

const POLL_MS = 50_000;

export function useCad(
  lat: number | null,
  lon: number | null,
  radiusKm: number,
  enabled = true,
) {
  const [incidents, setIncidents] = useState<CadIncident[]>([]);
  const [count, setCount] = useState(0);
  const [source, setSource] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      const data = await fetchCad(lat, lon, radiusKm);
      if (ac.signal.aborted) return;
      setIncidents(data.incidents);
      setCount(data.count);
      setSource(data.source);
      setNotice(data.notice);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'CAD feed failed');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [lat, lon, radiusKm, enabled]);

  useEffect(() => {
    if (lat == null || lon == null || !enabled) {
      setIncidents([]);
      setCount(0);
      return;
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [lat, lon, radiusKm, enabled, refresh]);

  return { incidents, count, source, notice, loading, error, updatedAt, refresh };
}
