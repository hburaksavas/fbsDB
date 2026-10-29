import { ChevronDown, Database, LoaderCircle, PlugZap } from 'lucide-react';

export function ConnectionControl({ profile, inactive, connected, connecting, connectingProfile, disabled, open, onOpen }) {
  const name = connecting ? connectingProfile || profile.name || profile.id : connected ? profile.name || profile.id : 'Connect';
  const environment = String(profile.env || 'UNKNOWN').toUpperCase();
  const state = connecting ? 'connecting' : inactive ? 'inactive' : connected ? 'connected' : 'disconnected';
  const Icon = connecting ? LoaderCircle : connected ? Database : PlugZap;
  const label = connecting ? `Connecting to ${name}` : connected ? `Change connection: ${name}` : 'Connect to Oracle';
  return <button type="button" className="connection-control" data-state={state} disabled={disabled} onClick={onOpen}
    aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-busy={connecting || undefined}
    title={connected && !connecting ? `${name} · ${environment} · Change connection` : label}>
    <span className="connection-control-mark" aria-hidden="true"><Icon size={14}/>{connected && !connecting && <span className="connection-control-status"/>}</span>
    <span className="connection-control-name">{name}</span>
    {connected && !connecting && <span className="connection-control-environment" data-env={environment}>{inactive ? "Inactive" : environment}</span>}
    <span className="connection-control-chevron" aria-hidden="true"><ChevronDown size={11}/></span>
  </button>;
}
