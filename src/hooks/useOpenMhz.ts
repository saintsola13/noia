import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOpenMhzCalls, fetchOpenMhzSystems } from '../api/client';
import type { OpenMhzCall, OpenMhzSystem } from '../lib/types';

const CALLS_POLL_MS = 13_000;
const MAX_QUEUE = 24;

export function useOpenMhz(lat: number | null, lon: number | null) {
  const [systems, setSystems] = useState<OpenMhzSystem[]>([]);
  const [locationLabel, setLocationLabel] = useState<string>('');
  const [selectedShortName, setSelectedShortName] = useState<string | null>(null);
  const [calls, setCalls] = useState<OpenMhzCall[]>([]);
  const [queue, setQueue] = useState<OpenMhzCall[]>([]);
  const [nowPlaying, setNowPlaying] = useState<OpenMhzCall | null>(null);
  const [autoPlay, setAutoPlay] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [systemsLoading, setSystemsLoading] = useState(false);
  const [callsLoading, setCallsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const primingRef = useRef(true);
  const autoPlayRef = useRef(autoPlay);
  const queueRef = useRef<OpenMhzCall[]>([]);
  const nowPlayingRef = useRef<OpenMhzCall | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  const systemsLoadGenRef = useRef(0);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('ended', () => {
        setPlaying(false);
        setNowPlaying(null);
        nowPlayingRef.current = null;
        playNextRef.current();
      });
      audio.addEventListener('pause', () => {
        if (audio.ended || audio.currentTime === 0) return;
        setPlaying(false);
      });
      audio.addEventListener('play', () => setPlaying(true));
      audio.addEventListener('error', () => {
        setPlaying(false);
        setNowPlaying(null);
        nowPlayingRef.current = null;
        playNextRef.current();
      });
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  const playCall = useCallback(
    (call: OpenMhzCall) => {
      const audio = ensureAudio();
      setNowPlaying(call);
      nowPlayingRef.current = call;
      audio.src = call.url;
      void audio.play().catch((err) => {
        console.warn('OpenMHz play failed', call.url, err);
        setError('Audio blocked or failed — tap PLAY again or pick a call in the list');
        setPlaying(false);
        setNowPlaying(null);
        nowPlayingRef.current = null;
        playNextRef.current();
      });
    },
    [ensureAudio],
  );

  const playNext = useCallback(() => {
    if (nowPlayingRef.current) return;
    const next = queueRef.current[0];
    if (!next) return;
    setQueue((q) => {
      const rest = q.slice(1);
      queueRef.current = rest;
      return rest;
    });
    playCall(next);
  }, [playCall]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const enqueueNew = useCallback(
    (incoming: OpenMhzCall[], { seed }: { seed: boolean }) => {
      // incoming is newest-first
      const fresh: OpenMhzCall[] = [];
      for (const call of incoming) {
        if (seenIdsRef.current.has(call.id)) continue;
        seenIdsRef.current.add(call.id);
        fresh.push(call);
      }

      let toQueue: OpenMhzCall[] = [];
      if (seed) {
        // Prime with a short backlog so PLAY/AUTO have something immediately
        // (cached snapshots rarely get "new" ids on the next poll).
        toQueue = [...fresh].slice(0, 8).reverse(); // oldest of the newest 8 first
      } else if (fresh.length) {
        toQueue = [...fresh].reverse();
      }
      if (!toQueue.length) return;

      setQueue((prev) => {
        const merged = [...prev, ...toQueue].slice(-MAX_QUEUE);
        queueRef.current = merged;
        return merged;
      });
      if (autoPlayRef.current && !nowPlayingRef.current) {
        queueMicrotask(() => playNextRef.current());
      }
    },
    [],
  );

  const loadSystems = useCallback(async () => {
    if (lat == null || lon == null) {
      setSystems([]);
      setLocationLabel('');
      setSelectedShortName(null);
      setCalls([]);
      setQueue([]);
      setNowPlaying(null);
      seenIdsRef.current = new Set();
      primingRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
      return;
    }

    const gen = ++systemsLoadGenRef.current;
    setSystemsLoading(true);
    setError(null);
    try {
      const data = await fetchOpenMhzSystems(lat, lon);
      if (gen !== systemsLoadGenRef.current) return;
      setSystems(data.systems);
      setLocationLabel(data.locationLabel);
      const firstActive =
        data.systems.find((s) => s.active) ?? data.systems[0] ?? null;
      setSelectedShortName(firstActive?.shortName ?? null);
    } catch (err) {
      if (gen !== systemsLoadGenRef.current) return;
      setError(err instanceof Error ? err.message : 'OpenMHz systems failed');
      setSystems([]);
      setSelectedShortName(null);
    } finally {
      if (gen === systemsLoadGenRef.current) setSystemsLoading(false);
    }
  }, [lat, lon]);

  // Load systems when location locks (or reloadSystems bumps deps via loadSystems identity)
  useEffect(() => {
    void loadSystems();
    return () => {
      systemsLoadGenRef.current += 1;
    };
  }, [loadSystems]);

  const reloadSystems = useCallback(() => {
    void loadSystems();
  }, [loadSystems]);

  // Poll calls for selected system
  useEffect(() => {
    if (!selectedShortName) {
      setCalls([]);
      return;
    }

    let cancelled = false;
    seenIdsRef.current = new Set();
    primingRef.current = true;
    setQueue([]);
    queueRef.current = [];
    setNowPlaying(null);
    nowPlayingRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    setPlaying(false);

    const tick = async () => {
      setCallsLoading(true);
      try {
        const data = await fetchOpenMhzCalls(selectedShortName);
        if (cancelled) return;
        const sorted = [...data.calls].sort((a, b) => {
          const ta = Date.parse(a.time) || 0;
          const tb = Date.parse(b.time) || 0;
          return tb - ta;
        });
        setCalls(sorted);
        setError(null);
        const seed = primingRef.current;
        primingRef.current = false;
        enqueueNew(sorted, { seed });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'OpenMHz calls failed');
        }
      } finally {
        if (!cancelled) setCallsLoading(false);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), CALLS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selectedShortName, enqueueNew]);

  // When autoPlay turns on, kick the queue
  useEffect(() => {
    if (autoPlay) playNext();
  }, [autoPlay, playNext]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  const selectSystem = useCallback((shortName: string) => {
    setSelectedShortName(shortName);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (nowPlayingRef.current && audioRef.current) {
      void audioRef.current.play().catch(() => setPlaying(false));
      return;
    }
    // If queue is empty (seed skipped / autoplay blocked), bootstrap from buffer
    if (!queueRef.current.length && calls.length) {
      const backlog = [...calls].slice(0, 8).reverse();
      for (const c of backlog) seenIdsRef.current.add(c.id);
      queueRef.current = backlog;
      setQueue(backlog);
    }
    // Ensure autoplay path can run after a user gesture
    autoPlayRef.current = true;
    setAutoPlay(true);
    playNext();
  }, [playNext, calls]);

  const skip = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    setPlaying(false);
    setNowPlaying(null);
    nowPlayingRef.current = null;
    playNext();
  }, [playNext]);

  const playManual = useCallback(
    (call: OpenMhzCall) => {
      // Manual play interrupts queue item but keeps auto queue for later
      if (audioRef.current) {
        audioRef.current.pause();
      }
      playCall(call);
    },
    [playCall],
  );

  return {
    systems,
    locationLabel,
    selectedShortName,
    selectSystem,
    calls,
    queue,
    nowPlaying,
    autoPlay,
    setAutoPlay,
    playing,
    systemsLoading,
    callsLoading,
    error,
    reloadSystems,
    pause,
    resume,
    skip,
    playManual,
  };
}
