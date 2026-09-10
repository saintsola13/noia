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
        <span className="panel-meta">
          {loading ? 'SYNC…' : `${count} incidents`}
          {updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString()}` : ''}
        </span>
      </header>
      <p className="panel-notice">
        {notice ||
          'CHP statewide public incidents (CA) — mostly traffic/highway/public safety. Not full city 911 CAD.'}
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
            No CHP public incidents in range. Coverage is California Highway Patrol statewide
            (traffic / highway / public safety) — city PD domestic CAD is not in this feed.
          </li>
        )}
      </ul>
    </section>
  );
}
