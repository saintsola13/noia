import type { Aircraft } from '../lib/types';
import { formatAltitudeFt, formatHeading, formatSpeedKt } from '../lib/geo';

interface Props {
  aircraft: Aircraft[];
  count: number;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
}

export function AircraftPanel({ aircraft, count, loading, error, updatedAt }: Props) {
  const sorted = [...aircraft].sort(
    (a, b) => (b.baroAltitude ?? b.geoAltitude ?? 0) - (a.baroAltitude ?? a.geoAltitude ?? 0),
  );

  return (
    <section className="panel aircraft-panel">
      <header className="panel-head">
        <h2>ADS-B TRACK</h2>
        <span className="panel-meta">
          {loading ? 'SYNC…' : `${count} contacts`}
          {updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString()}` : ''}
        </span>
      </header>
      <p className="panel-notice">Source: OpenSky Network ADS-B — civilian feed, not military radar.</p>
      {error && <p className="panel-error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CS</th>
              <th>ALT</th>
              <th>SPD</th>
              <th>HDG</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 40).map((ac) => (
              <tr key={ac.icao24}>
                <td>{ac.callsign}</td>
                <td>{formatAltitudeFt(ac.baroAltitude ?? ac.geoAltitude)}</td>
                <td>{formatSpeedKt(ac.velocity)}</td>
                <td>{formatHeading(ac.heading)}</td>
              </tr>
            ))}
            {!sorted.length && !loading && (
              <tr>
                <td colSpan={4} className="empty">
                  No airborne contacts in range
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
