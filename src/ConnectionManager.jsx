import { ModalBackdrop } from "./ModalBackdrop";
import { useEffect, useRef, useState } from "react";
import { Database, Plus, X, Settings2 } from "lucide-react";
import { isNativeHost, sendNativeCommand, subscribeNativeMessages } from "./nativeBridge";

export function useDialogFocus(ref, onClose) {
  const close = useRef(onClose); close.current = onClose;
  const opener = useRef(document.activeElement);
  useEffect(() => {
    const previous = opener.current;
    const root = ref.current;
    const elements = () => [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(e => e.getClientRects().length);
    (root.querySelector("input:not(:disabled), select:not(:disabled)") || elements()[0])?.focus();
    const key = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current?.(); }
      if (event.key === "Tab") {
        const items = elements(), first = items[0], last = items.at(-1);
        if (!items.length) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    root.addEventListener("keydown", key);
    return () => { root.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus(); };
  }, []);
}

export function ProfileEditor({ profile, aliases, onClose, onSaved, onPreviewSave }) {
  const dialog = useRef(null), request = useRef(null);
  const [draft, setDraft] = useState({ method: profile?.method || (profile?.id || profile?.alias ? "tns" : "basic"), host: profile?.method === "basic" ? profile.host || "" : "", port: profile?.method === "basic" ? profile.port || "1521" : "1521", service: profile?.method === "basic" ? profile.service || "" : "", targetType: profile?.targetType || "service", descriptor: profile?.descriptor || "", name: profile?.name || "", user: profile?.user || "", alias: profile?.alias || aliases[0]?.id || "", source: profile?.source || aliases[0]?.source || "", environment: profile?.env || "UNKNOWN", password: "", remember: true });
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  useDialogFocus(dialog, () => !busy && onClose());
  useEffect(() => subscribeNativeMessages(message => {
    if (message.type !== "connection.managed" || message.requestId !== request.current?.id) return;
    setBusy(false);
    if (!message.success) { setNotice({ error: true, text: message.message }); return; }
    if (message.operation === "connection.test") setNotice({ text: "Connection successful. Your active session is unchanged." });
    else onSaved(message.profileId, request.current.connect, request.current.credentials);
  }), [onSaved]);
  const change = (key, value) => { setDraft(d => ({ ...d, [key]: value })); setNotice(null); };
  const selectedAlias = aliases.find(a => a.id === draft.alias && a.source === draft.source);
  const submit = (operation, connect = false) => {
    setNotice(null);
    if (!draft.user.trim() || operation === "connection.save" && !draft.name.trim()) { setNotice({ error: true, text: "Enter a connection name and username." }); return; }
    if (draft.method === "tns" && !selectedAlias) { setNotice({ error: true, text: "Choose an available TNS alias." }); return; }
    if (draft.method === "basic" && (!/^[a-zA-Z0-9_.:\[\]%-]+$/.test(draft.host.trim()) || !/^\d+$/.test(draft.port) || Number(draft.port) < 1 || Number(draft.port) > 65535 || !/^[a-zA-Z0-9_.$#-]+$/.test(draft.service.trim()))) { setNotice({ error: true, text: "Enter a host, a port between 1 and 65535, and a service name or SID." }); return; }
    if (draft.method === "descriptor" && !/^\(\s*DESCRIPTION(?:_LIST)?\s*=/i.test(draft.descriptor.trim())) { setNotice({ error: true, text: "Enter a full Oracle connect descriptor starting with (DESCRIPTION=...)." }); return; }
    if (!isNativeHost) {
      if (operation === "connection.test") { setNotice({ error: true, text: "Use the Windows app to test an Oracle connection." }); return; }
      onPreviewSave({ ...(draft.method === "tns" ? selectedAlias : {}), ...draft, ...(draft.method === "tns" ? { host: selectedAlias.host, port: selectedAlias.port, service: selectedAlias.service } : { alias: "", source: "" }), id: profile?.id || crypto.randomUUID(), env: draft.environment, password: undefined }, connect); return;
    }
    setBusy(true);
    request.current = { id: sendNativeCommand(operation, { ...draft, profileId: profile?.id || undefined }), connect, credentials: { user: draft.user, password: draft.password, remember: draft.remember } };
  };
  return <ModalBackdrop onClose={onClose}><form ref={dialog} className="connection-modal profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" onSubmit={e => { e.preventDefault(); submit("connection.save"); }}>
    <header className="modal-header"><div><div className="eyebrow">CONNECTION PROFILE</div><h2 id="profile-editor-title">{profile?.id ? "Edit connection" : "New connection"}</h2><p>Choose how to reach Oracle. Credentials are stored separately.</p></div><button type="button" className="icon-button" aria-label="Close connection editor" disabled={busy} onClick={onClose}><X size={17} /></button></header>
    <fieldset disabled={busy} className="profile-fields">
      <label>Connection name<input autoFocus maxLength={80} value={draft.name} onChange={e => change("name", e.target.value)} placeholder="Finance · Read only" /></label>
      <label>Connection method<select value={draft.method} onChange={e => change("method", e.target.value)}><option value="basic">Basic</option><option value="tns">TNS</option><option value="descriptor">Custom descriptor</option></select></label>
      {draft.method === "basic" && <><div className="profile-field-row"><label>Host<input value={draft.host} onChange={e => change("host", e.target.value)} placeholder="db.example.com" /></label><label className="profile-port">Port<input type="number" min="1" max="65535" value={draft.port} onChange={e => change("port", e.target.value)} /></label></div><div className="profile-field-row"><label>Database identifier<select value={draft.targetType} onChange={e => change("targetType", e.target.value)}><option value="service">Service name</option><option value="sid">SID</option></select></label><label>{draft.targetType === "sid" ? "SID" : "Service name"}<input value={draft.service} onChange={e => change("service", e.target.value)} placeholder={draft.targetType === "sid" ? "ORCL" : "FREEPDB1"} /></label></div></>}
      {draft.method === "tns" && <>
      <label>TNS alias<select value={selectedAlias ? JSON.stringify([draft.alias, draft.source]) : ""} onChange={e => { const [alias, source] = JSON.parse(e.target.value); setDraft(d => ({ ...d, alias, source })); setNotice(null); }}><option value="" disabled>Select an alias</option>{aliases.map(a => <option key={a.id + a.source} value={JSON.stringify([a.id, a.source])}>{a.id}{a.duplicate ? ` · ${a.source}` : ""}</option>)}</select></label>
      {selectedAlias ? <div className="profile-target"><Database size={14} /><span>{selectedAlias.host}:{selectedAlias.port}/{selectedAlias.service}<small>{selectedAlias.source}</small></span></div> : <p>No alias available. Configure TNS sources in Settings.</p>}
      </>}
      {draft.method === "descriptor" && <label>Connect descriptor<textarea spellCheck={false} rows={5} maxLength={32768} value={draft.descriptor} onChange={e => change("descriptor", e.target.value)} placeholder="(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db.example.com)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=FREEPDB1)))" /><small>Paste an Oracle Net descriptor. Enter username and password below.</small></label>}
      <label>Username<input autoComplete="username" maxLength={128} value={draft.user} onChange={e => change("user", e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="new-password" value={draft.password} onChange={e => change("password", e.target.value)} placeholder={profile?.hasSavedCredentials ? "Leave blank to keep saved password" : "Optional; you can enter it when connecting"} /></label>
      <label className="profile-checkbox"><input type="checkbox" checked={draft.remember} onChange={e => change("remember", e.target.checked)} />Save supplied password securely on this Windows account</label>
      <label>Environment<select value={draft.environment} onChange={e => change("environment", e.target.value)}>{["UNKNOWN", "DEV", "TEST", "UAT", "PROD"].map(env => <option key={env}>{env}</option>)}</select></label>
    </fieldset>
    {notice && <div className={`profile-notice ${notice.error ? "error" : ""}`} role="status">{notice.text}</div>}
    <footer className="modal-footer"><button type="button" className="button-secondary" disabled={busy || (draft.method === "tns" && !selectedAlias)} onClick={() => submit("connection.test")}>{busy ? "Working…" : "Test"}</button><div><button type="submit" className="button-secondary" disabled={busy}>Save</button><button type="button" className="button-primary" disabled={busy} onClick={() => submit("connection.save", true)}>Save & connect</button></div></footer>
  </form></ModalBackdrop>;
}

export function TnsSources({ aliases, onClose }) {
  const dialog = useRef(null); useDialogFocus(dialog, onClose);
  return <ModalBackdrop onClose={onClose}><section ref={dialog} className="connection-modal profile-editor" role="dialog" aria-modal="true" aria-label="TNS sources"><header className="modal-header"><div><h2>TNS sources</h2><p>Aliases are discovered from TNS_ADMIN and configured Oracle folders.</p></div><button className="icon-button" aria-label="Close TNS sources" onClick={onClose}><X size={17} /></button></header><div className="profile-fields">{[...new Set(aliases.map(a => a.source))].map(source => <div className="profile-target" key={source}><Database size={14} /><span>{source}</span></div>)}{!aliases.length && <p>No aliases found. Check TNS_ADMIN or add a tnsnames.ora file.</p>}</div><footer className="modal-footer"><button className="button-secondary" onClick={() => sendNativeCommand("connection.list")}><Settings2 size={14} />Refresh</button><button className="button-primary" onClick={() => sendNativeCommand("tns.add")}><Plus size={14} />Add TNS file</button></footer></section></ModalBackdrop>;
}
