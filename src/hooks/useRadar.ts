import { useEffect, useState } from 'react';
import { fetchRadar } from '../api/client';
import type { RadarMeta } from '../lib/types';

export function useRadar(enabled: boolean) {
  const [meta, setMeta] = useState<RadarMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchRadar();
        if (!cancelled) {
          setMeta(data as RadarMeta);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Radar failed');
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  return { meta, error };
}
