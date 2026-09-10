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
}

function snippet(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
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
}: Props) {
  const sorted = [...incidents].sort((a, b) => {
    const da = haversineKm(originLat, originLon, a.lat, a.lon);
    const db = haversineKm(originLat, originLon, b.lat, b.lon);
    return da - db;
  });

  return (
    <section className="panel cad-panel">
      <header className="panel-head">
        <h2>CAD // ACTIVE</h2>
        <div className="panel-head-actions">
          <span className="panel-meta">
            {loading ? 'SYNC…' : `${count} incidents`}
            {updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString()}` : ''}
          </span>
          {onRefresh ? (
            <button
              type="button"
              className="panel-refresh"
              onClick={() => onRefresh()}
              disabled={loading}
            >
              {loading ? 'SYNC' : 'REFRESH'}
            </button>
          ) : null}
        </div>
      </header>
      <p className="panel-notice">
        {notice ||
          'CAD: CA (CHP) + FL (FL511/FDOT) public traffic incidents — not city 911 CAD.'}
      </p>
      {error && <p className="panel-error">{error}</p>}
      <ul className="cad-list">
        {sorted.slice(0, 50).map((inc) => {
          const dist = haversineKm(originLat, originLon, inc.lat, inc.lon);
          return (
            <li key={inc.id} className={focusId === inc.id ? 'active' : ''}>
              <button
                type="button"
                className="cad-item"
                onClick={() => onFocus?.(inc)}
              >
                <div className="cad-item-type">{inc.type || 'Incident'}</div>
                <div className="cad-item-loc">
                  {inc.location || '—'}
                  {inc.area ? ` · ${inc.area}` : ''}
                </div>
                {inc.locationDesc ? (
                  <div className="cad-item-desc">{snippet(inc.locationDesc)}</div>
                ) : null}
                <div className="cad-item-meta">
                  <span>{dist < 10 ? dist.toFixed(1) : Math.round(dist)} km</span>
                  <span>{inc.logTime || '—'}</span>
                </div>
              </button>
            </li>
          );
        })}
        {!sorted.length && !loading && (
          <li className="empty cad-empty">
            No public CAD incidents in range. Coverage is California (CHP sa.xml) and Florida
            (FL511 / FDOT traffic incidents) — city PD domestic 911 CAD is not in these feeds.
          </li>
        )}
      </ul>
    </section>
  );
}
