import { useState } from 'react';
import type { OpenMhzCall, OpenMhzSystem, ScannerLinks } from '../lib/types';

interface OpenMhzControls {
  systems: OpenMhzSystem[];
  locationLabel: string;
  selectedShortName: string | null;
  selectSystem: (shortName: string) => void;
  calls: OpenMhzCall[];
  queue: OpenMhzCall[];
  nowPlaying: OpenMhzCall | null;
  autoPlay: boolean;
  setAutoPlay: (v: boolean) => void;
  playing: boolean;
  systemsLoading: boolean;
  callsLoading: boolean;
  error: string | null;
  reloadSystems: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  playManual: (call: OpenMhzCall) => void;
}

interface Props {
  scanners: ScannerLinks | null;
  scanLoading: boolean;
  scanError: string | null;
  openmhz: OpenMhzControls;
}

function formatCallTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLen(len: number): string {
  if (!len || len <= 0) return '';
  return `${len.toFixed(len >= 10 ? 0 : 1)}s`;
}

export function ScannerPanel({ scanners, scanLoading, scanError, openmhz }: Props) {
  const [catalogsOpen, setCatalogsOpen] = useState(false);
  const {
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
  } = openmhz;

  const metaLabel = systemsLoading
    ? 'RESOLVING…'
    : locationLabel || scanners?.locationLabel || '—';

  return (
    <section className="panel scanner-panel">
      <header className="panel-head">
        <h2>COMMS // OPENMHZ</h2>
        <span className="panel-meta">{metaLabel}</span>
      </header>

      {(error || scanError) && (
        <div className="panel-error-row">
          <p className="panel-error">{error || scanError}</p>
          {error && (
            <button
              type="button"
              className="radio-btn"
              onClick={() => reloadSystems()}
              disabled={systemsLoading}
              title="Retry OpenMHz systems load"
            >
              RETRY
            </button>
          )}
        </div>
      )}

      <div className="radio-system-row">
        <label className="radio-label" htmlFor="openmhz-system">
          SYSTEM
        </label>
        <select
          id="openmhz-system"
          className="radio-select"
          value={selectedShortName ?? ''}
          disabled={!systems.length || systemsLoading}
          onChange={(e) => selectSystem(e.target.value)}
        >
          {!systems.length && <option value="">No nearby systems</option>}
          {systems.map((s) => (
            <option key={s.shortName} value={s.shortName}>
              {s.shortName} · {s.name}
              {s.city ? ` · ${s.city}` : ''}
              {s.active ? '' : ' [idle]'}
            </option>
          ))}
        </select>
      </div>

      <div className="radio-now">
        <div className="radio-now-info">
          <span className="radio-now-tag">{playing ? '▶ LIVE' : nowPlaying ? '❚❚ HOLD' : '○ STANDBY'}</span>
          <span className="radio-now-detail">
            {nowPlaying
              ? `TG ${nowPlaying.talkgroupNum} · ${formatCallTime(nowPlaying.time)} · ${formatLen(nowPlaying.len)}`
              : autoPlay
                ? queue.length
                  ? `QUEUE ${queue.length}`
                  : 'Waiting for calls…'
                : 'Auto-play off'}
          </span>
        </div>
        <div className="radio-controls">
          <label className="radio-auto">
            <input
              type="checkbox"
              checked={autoPlay}
              onChange={(e) => setAutoPlay(e.target.checked)}
            />
            AUTO
          </label>
          {playing ? (
            <button type="button" className="radio-btn" onClick={pause} title="Pause">
              PAUSE
            </button>
          ) : (
            <button
              type="button"
              className="radio-btn"
              onClick={resume}
              title="Play / resume"
              disabled={!nowPlaying && queue.length === 0 && !calls.length}
            >
              PLAY
            </button>
          )}
          <button type="button" className="radio-btn" onClick={skip} title="Skip">
            SKIP
          </button>
        </div>
      </div>

      <div className="radio-calls-head">
        <span>LIVE CALLS</span>
        <span className="panel-meta">
          {callsLoading ? 'POLL…' : `${calls.length} buf`}
          {queue.length ? ` · Q${queue.length}` : ''}
        </span>
      </div>
      <ul className="radio-call-list">
        {calls.slice(0, 20).map((call) => {
          const active = nowPlaying?.id === call.id;
          return (
            <li key={call.id} className={active ? 'active' : ''}>
              <button type="button" className="radio-call-btn" onClick={() => playManual(call)}>
                <span className="radio-call-tg">TG {call.talkgroupNum}</span>
                <span className="radio-call-meta">
                  {formatCallTime(call.time)}
                  {call.len ? ` · ${formatLen(call.len)}` : ''}
                </span>
                <span className="radio-call-play">{active && playing ? '▶' : '▷'}</span>
              </button>
            </li>
          );
        })}
        {!calls.length && !callsLoading && selectedShortName && (
          <li className="empty">No recent calls on this system</li>
        )}
        {!selectedShortName && !systemsLoading && (
          <li className="empty">Lock a location to load OpenMHz systems</li>
        )}
      </ul>

      <p className="panel-disclaimer radio-credit">
        Call audio from OpenMHz — not affiliated. Attribution: Audio via OpenMHz.
      </p>

      <details
        className="external-catalogs"
        open={catalogsOpen}
        onToggle={(e) => setCatalogsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>External catalogs (Broadcastify / RadioReference)</summary>
        {scanLoading && <p className="panel-meta">Resolving links…</p>}
        <ul className="link-list">
          {scanners?.links.map((link) => (
            <li key={link.url}>
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                <span className="link-src">{link.source.toUpperCase()}</span>
                <span>{link.label}</span>
              </a>
            </li>
          ))}
          {!scanners && !scanLoading && (
            <li className="empty">Lock a location for external deep-links</li>
          )}
        </ul>
        <p className="panel-disclaimer">
          {scanners?.disclaimer ??
            'External catalog links only — NOIA does not embed or proxy Broadcastify streams. OpenMHz call bursts play in-app separately.'}
        </p>
      </details>
    </section>
  );
}
