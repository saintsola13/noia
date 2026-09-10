import { haversineKm } from '../lib/geo';
import type { CadIncident } from '../lib/types';

interface Props {
  incidents: CadIncident[];
  count: number;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  notice: string | null;
  originLat: number;
  originLon: number;
  onFocus?: (incident: CadIncident) => void;
  focusId?: string | null;
  onRefresh?: () => void;
  source?: string | null;
}

function snippet(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function typeTone(type: string): 'crash' | 'construction' | 'other' {
  const t = type || '';
  if (/fire|collision|crash|1183|1179|injury|shoot|stab|rescue|accident|hazmat/i.test(t)) {
    return 'crash';
  }
  if (/construction|closure|roadwork|lane\s*closed|maintenance|detour/i.test(t)) {
    return 'construction';
  }
  return 'other';
}

export function CadPanel({
  incidents,
  count,
  loading,
  error,
  updatedAt,
  notice,
  originLat,
  originLon,
  onFocus,
  focusId,
  onRefresh,
  source,
}: Props) {
  const sorted = [...incidents].sort((a, b) => {
    const da = haversineKm(originLat, originLon, a.lat, a.lon);
    const db = haversineKm(originLat, originLon, b.lat, b.lon);
    return da - db;
  });

  return (
    <section className="panel cad-panel">
      <header className="panel-head">
        <div className="panel-title-block">
          <h2>
            CAD <span className="panel-title-plain">Incidents</span>
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
        {notice || 'Public traffic CAD (CA CHP + FL FL511) — not city 911.'}
      </p>
      {error && <p className="panel-error">{error}</p>}
      <ul className="cad-list">
        {sorted.slice(0, 50).map((inc) => {
          const dist = haversineKm(originLat, originLon, inc.lat, inc.lon);
          const tone = typeTone(inc.type);
          return (
            <li key={inc.id} className={focusId === inc.id ? 'active' : ''}>
              <button
                type="button"
                className="cad-item"
                onClick={() => onFocus?.(inc)}
              >
                <div className="cad-item-top">
                  <span className={`type-pill ${tone}`}>{inc.type || 'Incident'}</span>
                  <span className="cad-item-dist">
                    {dist < 10 ? dist.toFixed(1) : Math.round(dist)} km
                  </span>
                </div>
                <div className="cad-item-loc">
                  {inc.location || '—'}
                  {inc.area ? ` · ${inc.area}` : ''}
                </div>
                {inc.locationDesc ? (
                  <div className="cad-item-desc">{snippet(inc.locationDesc)}</div>
                ) : null}
                <div className="cad-item-meta">
                  <span>{inc.logTime || '—'}</span>
                </div>
              </button>
            </li>
          );
        })}
        {!sorted.length && !loading && (
          <li className="empty cad-empty">
            <strong>No incidents in this radius</strong>
            <span>Try a larger range or hit Refresh.</span>
            <span className="cad-empty-note">
              Covers CA CHP + FL FL511 public feeds — not city 911 CAD.
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
