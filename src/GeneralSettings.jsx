import {ResultDefaultsSettings} from './ResultDefaultsSettings';
export function GeneralSettings({settings,onChange,queryTimeout,onQueryTimeoutChange}){
  return <section className="general-settings"><h3>General</h3><label className="default-setting-row">Query timeout (seconds, 0 = unlimited)<input type="number" min="0" max="86400" disabled={settings.readOnly} value={queryTimeout} onChange={event=>onQueryTimeoutChange(Math.max(0,Math.min(86400,Number(event.target.value)||0)))}/></label><ResultDefaultsSettings settings={settings} onChange={onChange} category="accessibility"/><ResultDefaultsSettings settings={settings} onChange={onChange} category="privacy"/></section>;
}
