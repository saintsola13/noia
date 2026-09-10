import type { ScannerLinks } from '../lib/types';

interface Props {
  data: ScannerLinks | null;
  loading: boolean;
  error: string | null;
}

export function ScannerPanel({ data, loading, error }: Props) {
  return (
    <section className="panel scanner-panel">
      <header className="panel-head">
        <h2>COMMS // SCANNERS</h2>
        <span className="panel-meta">{loading ? 'RESOLVING…' : data?.locationLabel ?? '—'}</span>
      </header>
      {error && <p className="panel-error">{error}</p>}
      <ul className="link-list">
        {data?.links.map((link) => (
          <li key={link.url}>
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              <span className="link-src">{link.source.toUpperCase()}</span>
              <span>{link.label}</span>
            </a>
          </li>
        ))}
        {!data && !loading && <li className="empty">Lock a location to resolve scanner deep-links</li>}
      </ul>
      <p className="panel-disclaimer">
        {data?.disclaimer ??
          'NOIA does not embed or proxy scanner audio. External Broadcastify / RadioReference links only.'}
      </p>
    </section>
  );
}
