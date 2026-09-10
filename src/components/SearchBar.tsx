import { useState, type FormEvent } from 'react';

interface Props {
  onSearch: (q: string) => void;
  loading?: boolean;
  radiusKm: number;
  onRadiusChange: (km: number) => void;
}

export function SearchBar({ onSearch, loading, radiusKm, onRadiusChange }: Props) {
  const [q, setQ] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form className="search-bar" onSubmit={submit}>
      <label className="sr-only" htmlFor="loc">
        ZIP or address
      </label>
      <input
        id="loc"
        className="search-input"
        type="text"
        inputMode="search"
        placeholder="US ZIP or address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="postal-code"
        spellCheck={false}
      />
      <label className="radius-label">
        <span>RNG</span>
        <select
          value={radiusKm}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          aria-label="Search radius km"
        >
          <option value={20}>20 km</option>
          <option value={40}>40 km</option>
          <option value={80}>80 km</option>
          <option value={120}>120 km</option>
        </select>
      </label>
      <button className="search-btn" type="submit" disabled={loading || !q.trim()}>
        {loading ? 'LOC…' : 'LOCK'}
      </button>
    </form>
  );
}
