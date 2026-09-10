import { useState } from 'react';
import type { WeatherAlert } from '../lib/types';

interface Props {
  alerts: WeatherAlert[];
  count: number;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  source?: string | null;
  onRefresh?: () => void;
  highlightId?: string | null;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AlertsPanel({
  alerts,
  count,
  loading,
  error,
  updatedAt,
  source,
  onRefresh,
  highlightId,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="panel wx-alerts-panel" id="wx-alerts-panel">
      <header className="panel-head">
        <div className="panel-title-block">
          <h2>
            WX <span className="panel-title-plain">Alerts</span>
          </h2>
          <div className="panel-chips">
            <span className="count-badge">{loading ? '…' : count}</span>
            {source ? <span className="source-chip">{source}</span> : null}
          </div>
        </div>
        <div className="panel-head-actions">
          <span className="panel-meta">
            {updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'}
          </span>
          {onRefresh ? (
            <button
              type="button"
              className="panel-refresh prominent"
              onClick={() => onRefresh()}
              disabled={loading}
            >
              {loading ? 'Syncing…' : 'Refresh'}
            </button>
          ) : null}
        </div>
      </header>
      <p className="panel-notice">
        NWS active alerts for this location — not a substitute for local emergency alerts / WEA.
      </p>
      {error && <p className="panel-error">{error}</p>}
      <ul className="wx-alert-list">
        {alerts.map((a) => {
          const expanded = openId === a.id || highlightId === a.id;
          return (
            <li
              key={a.id}
              className={expanded ? 'active' : ''}
              style={{ ['--wx-sev' as string]: a.color }}
            >
              <button
                type="button"
                className="wx-alert-item"
                onClick={() => setOpenId((id) => (id === a.id ? null : a.id))}
              >
                <div className="wx-alert-item-top">
                  <span className={`sev-pill sev-${a.severity.toLowerCase()}`}>{a.severity}</span>
                  <span className="wx-alert-item-event">{a.event}</span>
                </div>
                <div className="wx-alert-item-head">{a.headline}</div>
                {a.areaDesc ? <div className="wx-alert-item-area">{a.areaDesc}</div> : null}
                <div className="wx-alert-item-meta">
                  <span>Onset {formatWhen(a.onset)}</span>
                  <span>Ends {formatWhen(a.ends)}</span>
                </div>
              </button>
              {expanded && (
                <div className="wx-alert-expand">
                  {a.description ? (
                    <p className="wx-alert-desc">{a.description}</p>
                  ) : null}
                  {a.instruction ? (
                    <p className="wx-alert-instr">
                      <strong>What to do:</strong> {a.instruction}
                    </p>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
        {!alerts.length && !loading && (
          <li className="empty cad-empty">
            <strong>No active NWS alerts for this point.</strong>
            <span>Watches, warnings, and advisories will appear here when issued.</span>
          </li>
        )}
      </ul>
    </section>
  );
}
