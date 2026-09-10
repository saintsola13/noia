import { useEffect, useState } from 'react';
import { fetchScanners } from '../api/client';
import type { ScannerLinks } from '../lib/types';

export function useScanners(lat: number | null, lon: number | null) {
  const [data, setData] = useState<ScannerLinks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lon == null) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchScanners(lat, lon)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Scanner lookup failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return { data, loading, error };
}
