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

const DEFAULT_RADIUS = 40;

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

  return (
    <div className="app">
      <div className="scanlines" aria-hidden />
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <div>
            <div className="brand-title">NOIA // LOCAL INTEL</div>
            <div className="brand-sub">TACTICAL OPS BOARD · ADS-B · CAD · WX · COMMS</div>
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
            <h1>STAND BY FOR GRID LOCK</h1>
            <p>
              Enter a US ZIP code or street address to open the local intel board — live ADS-B
              aircraft, public CAD pins (CA CHP + FL FL511), weather radar, and OpenMHz call audio
              plus external scanner catalogs.
            </p>
            <ul>
              <li>ADS-B via adsb.lol / adsb.fi (civilian) — not military radar</li>
              <li>CAD: CA CHP (sa.xml) + FL FL511/FDOT traffic incidents — not city 911 CAD</li>
              <li>Weather radar tiles via RainViewer</li>
              <li>OpenMHz in-app call bursts + external Broadcastify / RadioReference links</li>
            </ul>
          </div>
        </main>
      ) : (
        <main className={`ops ${mobileTab === 'cad' ? 'cad-map-first' : ''}`}>
          <div className={`ops-map-wrap ${mobileTab === 'map' || mobileTab === 'cad' ? 'active' : ''}`}>
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
            />
            <div className="map-hud">
              <div className="hud-chip">{location.label}</div>
              <div className="hud-chip amber">
                GRID {location.lat.toFixed(4)}, {location.lon.toFixed(4)} · {location.radiusKm} km
              </div>
              <label className="hud-toggle">
                <input
                  type="checkbox"
                  checked={showRadar}
                  onChange={(e) => setShowRadar(e.target.checked)}
                />
                WX RADAR
              </label>
              <label className="hud-toggle">
                <input
                  type="checkbox"
                  checked={showCad}
                  onChange={(e) => setShowCad(e.target.checked)}
                />
                CAD
              </label>
            </div>
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
            MAP
          </button>
          <button
            type="button"
            className={mobileTab === 'adsb' ? 'active' : ''}
            onClick={() => setMobileTab('adsb')}
          >
            ADS-B
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
            SCAN
          </button>
        </nav>
      )}

      <footer className="status-bar">
        <span>NOIA OPS</span>
        <span>CAD = CA CHP + FL FL511 ≠ CITY 911</span>
        <span>ADS-B ≠ MIL RADAR</span>
        <span>POLL ~10s / CAD ~50s</span>
      </footer>
    </div>
  );
}
