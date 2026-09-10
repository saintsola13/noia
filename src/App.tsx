import { useCallback, useState } from 'react';
import { geocode } from './api/client';
import { AircraftPanel } from './components/AircraftPanel';
import { CadPanel } from './components/CadPanel';
import { MapView } from './components/MapView';
import { ScannerPanel } from './components/ScannerPanel';
import { SearchBar } from './components/SearchBar';
import { useAircraft } from './hooks/useAircraft';
import { useCad } from './hooks/useCad';
import { useRadar } from './hooks/useRadar';
import { useOpenMhz } from './hooks/useOpenMhz';
import { useScanners } from './hooks/useScanners';
import type { AppLocation, CadIncident } from './lib/types';

const DEFAULT_RADIUS = 60;

export default function App() {
  const [location, setLocation] = useState<AppLocation | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS);
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showRadar, setShowRadar] = useState(true);
  const [showCad, setShowCad] = useState(true);
  const [focusCad, setFocusCad] = useState<{ lat: number; lon: number; id: string } | null>(
    null,
  );
  const [mobileTab, setMobileTab] = useState<'map' | 'adsb' | 'scan' | 'cad'>('map');

  const { aircraft, count, loading, error, updatedAt } = useAircraft(
    location?.lat ?? null,
    location?.lon ?? null,
    location?.radiusKm ?? radiusKm,
  );
  const { meta: radarMeta } = useRadar(Boolean(location) && showRadar);
  const {
    data: scanners,
    loading: scanLoading,
    error: scanError,
  } = useScanners(location?.lat ?? null, location?.lon ?? null);
  const openmhz = useOpenMhz(location?.lat ?? null, location?.lon ?? null);
  const cad = useCad(
    location?.lat ?? null,
    location?.lon ?? null,
    location?.radiusKm ?? radiusKm,
    showCad,
  );

  const onSearch = useCallback(
    async (q: string) => {
      setGeocoding(true);
      setGeoError(null);
      try {
        const result = await geocode(q);
        setLocation({
          lat: result.lat,
          lon: result.lon,
          label: result.displayName,
          radiusKm,
        });
        setFocusCad(null);
        setMobileTab('map');
      } catch (err) {
        setGeoError(err instanceof Error ? err.message : 'Geocode failed');
      } finally {
        setGeocoding(false);
      }
    },
    [radiusKm],
  );

  const onRadiusChange = (km: number) => {
    setRadiusKm(km);
    setLocation((prev) => (prev ? { ...prev, radiusKm: km } : prev));
  };

  const onFocusCad = (incident: CadIncident) => {
    setFocusCad({ lat: incident.lat, lon: incident.lon, id: incident.id });
    setShowCad(true);
    setMobileTab((tab) => (tab === 'cad' ? 'cad' : 'map'));
  };

  const mapVisible = mobileTab === 'map' || mobileTab === 'cad';
  const mapLayoutKey = `${mobileTab}-${showCad ? 'cad' : 'nocad'}-${mapVisible ? 'vis' : 'hid'}`;
  const cadFocused = mobileTab === 'cad';

  return (
    <div className="app">
      <div className="scanlines" aria-hidden />
      <div className="grid-glow" aria-hidden />
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <div>
            <div className="brand-title">NOIA</div>
            <div className="brand-sub">Local intel · ADS-B · CAD · Weather · Comms</div>
          </div>
        </div>
        <SearchBar
          onSearch={onSearch}
          loading={geocoding}
          radiusKm={radiusKm}
          onRadiusChange={onRadiusChange}
        />
      </header>

      {geoError && <div className="banner error">{geoError}</div>}

      {!location ? (
        <main className="boot-screen">
          <div className="boot-card">
            <p className="boot-kicker">Ready when you are</p>
            <h1>Enter your ZIP to start</h1>
            <p>
              Drop a US ZIP or street address to open the local intel board — live aircraft,
              public CAD pins, weather radar, and scanner audio.
            </p>
            <ul>
              <li>Aircraft via ADS-B (civilian) — not military radar</li>
              <li>CAD: CA CHP + FL FL511 traffic incidents — not city 911</li>
              <li>Weather radar tiles via RainViewer</li>
              <li>OpenMHz call audio + external scanner catalogs</li>
            </ul>
          </div>
        </main>
      ) : (
        <main className={`ops ${mobileTab === 'cad' ? 'cad-map-first' : ''}`}>
          <div className={`ops-map-wrap ${mapVisible ? 'active' : ''}`}>
            <MapView
              lat={location.lat}
              lon={location.lon}
              radiusKm={location.radiusKm}
              aircraft={aircraft}
              cadIncidents={cad.incidents}
              showCad={showCad}
              cadSource={cad.source}
              focusCadId={focusCad?.id}
              focusCad={focusCad}
              radarMeta={radarMeta}
              showRadar={showRadar}
              mapLayoutKey={mapLayoutKey}
              dimAircraft={cadFocused}
            />
            <div className="map-hud">
              <div className="hud-chip">{location.label}</div>
              <div className="hud-chip amber">
                {location.lat.toFixed(4)}, {location.lon.toFixed(4)} · {location.radiusKm} km
              </div>
              {showCad && (
                <div className="hud-chip cyan">
                  CAD · {cad.loading ? '…' : cad.count} incidents
                </div>
              )}
              <button
                type="button"
                className={`hud-pill ${showRadar ? 'active' : ''}`}
                onClick={() => setShowRadar((v) => !v)}
              >
                Weather
              </button>
              <button
                type="button"
                className={`hud-pill ${showCad ? 'active' : ''}`}
                onClick={() => setShowCad((v) => !v)}
              >
                CAD · Incidents
              </button>
            </div>
            {showCad && (
              <div className="cad-legend" aria-hidden>
                <div className="cad-legend-title">CAD</div>
                <div className="cad-legend-row">
                  <span className="cad-legend-dot crash" /> Crash
                </div>
                <div className="cad-legend-row">
                  <span className="cad-legend-dot construction" /> Construction
                </div>
                <div className="cad-legend-row">
                  <span className="cad-legend-dot other" /> Other
                </div>
              </div>
            )}
          </div>

          <aside className={`ops-side ${mobileTab !== 'map' ? 'active' : ''}`}>
            <div
              className={
                mobileTab === 'adsb' || mobileTab === 'map' ? 'side-block' : 'side-block hide-mobile'
              }
            >
              <AircraftPanel
                aircraft={aircraft}
                count={count}
                loading={loading}
                error={error}
                updatedAt={updatedAt}
              />
            </div>
            <div
              className={
                mobileTab === 'cad' || mobileTab === 'map' ? 'side-block' : 'side-block hide-mobile'
              }
            >
              <CadPanel
                incidents={cad.incidents}
                count={cad.count}
                loading={cad.loading}
                error={cad.error}
                updatedAt={cad.updatedAt}
                notice={cad.notice}
                originLat={location.lat}
                originLon={location.lon}
                onFocus={onFocusCad}
                focusId={focusCad?.id}
                onRefresh={cad.refresh}
                source={cad.source}
              />
            </div>
            <div
              className={
                mobileTab === 'scan' || mobileTab === 'map' ? 'side-block' : 'side-block hide-mobile'
              }
            >
              <ScannerPanel
                scanners={scanners}
                scanLoading={scanLoading}
                scanError={scanError}
                openmhz={openmhz}
              />
            </div>
          </aside>
        </main>
      )}

      {location && (
        <nav className="mobile-tabs" aria-label="Panels">
          <button
            type="button"
            className={mobileTab === 'map' ? 'active' : ''}
            onClick={() => setMobileTab('map')}
          >
            Map
          </button>
          <button
            type="button"
            className={mobileTab === 'adsb' ? 'active' : ''}
            onClick={() => setMobileTab('adsb')}
          >
            Aircraft
          </button>
          <button
            type="button"
            className={mobileTab === 'cad' ? 'active' : ''}
            onClick={() => {
              setMobileTab('cad');
              setShowCad(true);
            }}
          >
            CAD
          </button>
          <button
            type="button"
            className={mobileTab === 'scan' ? 'active' : ''}
            onClick={() => setMobileTab('scan')}
          >
            Scan
          </button>
        </nav>
      )}

      <footer className="status-bar">
        <span>NOIA · local intel</span>
        <span>CAD = public traffic feeds, not 911</span>
        <span>Live poll ~10s · CAD ~50s</span>
      </footer>
    </div>
  );
}
