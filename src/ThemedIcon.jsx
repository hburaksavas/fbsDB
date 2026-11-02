import {useSyncExternalStore} from 'react';
import {getIconTheme,iconFor,subscribeIconTheme} from './iconTheme';

export const useIconTheme = () => useSyncExternalStore(subscribeIconTheme, getIconTheme, getIconTheme);

// Renders an icon from the active icon theme, or falls back to the supplied default element. Imported packs only supply path data.
export function ThemedIcon({slot, size = 14, className = '', children}) {
  const theme = useIconTheme(), icon = iconFor(theme, slot);
  if (icon.type === 'path') return <svg className={`themed-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon-slot={slot}><path d={icon.d}/></svg>;
  if (icon.type === 'letter') return <span className={`themed-icon icon-letter ${className}`} style={{width: size, height: size, fontSize: Math.max(8, size - 5)}} aria-hidden="true" data-icon-slot={slot}>{icon.text}</span>;
  return <span className={`themed-icon-default${icon.mono ? ' icon-mono' : ''}`} data-icon-slot={slot} aria-hidden="true">{children}</span>;
}
