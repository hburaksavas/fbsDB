import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { ModalBackdrop } from "./ModalBackdrop";
import { sendNativeCommand, subscribeNativeMessages } from "./nativeBridge";

// FI-069: an SSH server that is not in known_hosts yet. Its key is trusted
// only after the user compares and confirms this fingerprint; fbsDB then adds
// that one key to known_hosts. A changed key is never offered here.
export function SshHostKeyDialog({ offer, actionLabel = "Trust and connect", onTrusted, onClose }) {
  const [state, setState] = useState({ busy: false, error: "" });
  const request = useRef(null), dialog = useRef(null);
  useEffect(() => { dialog.current?.querySelector('button[data-cancel]')?.focus(); }, []);
  useEffect(() => subscribeNativeMessages(message => {
    if (message.type !== "ssh.hostTrusted" || message.requestId !== request.current) return;
    request.current = null;
    if (message.success) onTrusted();
    else setState({ busy: false, error: message.message || "The host key could not be saved." });
  }), [onTrusted]);
  const trust = () => {
    setState({ busy: true, error: "" });
    request.current = sendNativeCommand("ssh.trustHost", { host: offer.host, port: offer.port, fingerprint: offer.fingerprint, ...(offer.tabId ? { tabId: offer.tabId } : {}) });
  };
  return <ModalBackdrop onClose={() => !state.busy && onClose()}>
    <section ref={dialog} className="appearance-modal transaction-guard ssh-host-key" role="alertdialog" aria-modal="true" aria-label="Unknown SSH server" onKeyDown={event => { if (event.key === "Escape" && !state.busy) { event.preventDefault(); onClose(); } }}>
      <header className="appearance-header"><div><div className="eyebrow">UNKNOWN SSH SERVER</div><h2><KeyRound size={16} /> Trust {offer.host}{offer.port === 22 ? "" : `:${offer.port}`}?</h2>
        <p>fbsDB has not connected to this SSH server before. Compare its key fingerprint with the one your server administrator gave you before you continue.</p>
        <dl className="ssh-fingerprint"><dt>Key type</dt><dd>{offer.keyType}</dd><dt>Fingerprint</dt><dd><code aria-label="SSH host key fingerprint">{offer.fingerprint}</code></dd></dl>
        <p>If you trust it, this key is added to your known_hosts file. If the key ever changes, fbsDB refuses to connect.</p>
        {state.error && <p role="alert" className="ssh-host-key-error">{state.error}</p>}
      </div></header>
      <footer className="appearance-footer"><button type="button" data-cancel className="button-secondary" disabled={state.busy} onClick={onClose}>Cancel</button><button type="button" className="button-primary" disabled={state.busy} onClick={trust}>{state.busy ? "Saving…" : actionLabel}</button></footer>
    </section>
  </ModalBackdrop>;
}
