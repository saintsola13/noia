import { useMemo } from 'react';
import { TileLayer } from 'react-leaflet';
import type { RadarMeta } from '../lib/types';

interface Props {
  meta: RadarMeta | null;
  opacity?: number;
}

/** RainViewer radar raster only exists through zoom 7; z8+ returns "Zoom Level Not Supported". */
const RADAR_MAX_NATIVE_ZOOM = 7;

export function RadarLayer({ meta, opacity = 0.55 }: Props) {
  const latest = useMemo(() => {
    const past = meta?.radar?.past ?? [];
    const nowcast = meta?.radar?.nowcast ?? [];
    const frames = [...past, ...nowcast];
    if (!frames.length) return null;
    return frames[frames.length - 1];
  }, [meta]);

  if (!latest || !meta?.host) return null;

  // RainViewer tile path: {host}{path}/256/{z}/{x}/{y}/{color}/{options}.png
  const url = `${meta.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;

  return (
    <TileLayer
      url={url}
      opacity={opacity}
      zIndex={350}
      maxNativeZoom={RADAR_MAX_NATIVE_ZOOM}
      maxZoom={18}
      attribution='Radar © <a href="https://www.rainviewer.com/">RainViewer</a>'
    />
  );
}
