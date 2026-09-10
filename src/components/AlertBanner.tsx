import type { WeatherAlert } from '../lib/types';

interface Props {
  alerts: WeatherAlert[];
  onOpen?: () => void;
}

function topSeverity(alerts: WeatherAlert[]): WeatherAlert | null {
  if (!alerts.length) return null;
  return alerts[0];
}

export function AlertBanner({ alerts, onOpen }: Props) {
  const top = topSeverity(alerts);
  if (!top) return null;

  const extra = alerts.length > 1 ? ` · +${alerts.length - 1} more` : '';
  const short =
    top.headline.length > 110 ? `${top.headline.slice(0, 109)}…` : top.headline;

  return (
    <button
      type="button"
      className={`wx-alert-banner sev-${top.severity.toLowerCase()}`}
      style={{ ['--wx-sev' as string]: top.color }}
      onClick={() => onOpen?.()}
      title="Open WX Alerts panel"
    >
      <span className="wx-alert-pulse" aria-hidden />
      <span className="wx-alert-badge">{top.severity}</span>
      <span className="wx-alert-event">{top.event}</span>
      <span className="wx-alert-head">{short}{extra}</span>
      <span className="wx-alert-cta">VIEW</span>
    </button>
  );
}
