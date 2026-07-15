// CredentialsPanel — desktop-only credential configuration (ADR-0179 / ADR-0198).
//
// Two independent rows (oauth, api-key): boolean saved/not-saved status, an
// ephemeral password input, Store/Replace, and Sign out/Remove. The panel never reads, reveals,
// copies, exports, or pre-fills a stored value — status is boolean-only via `desktopAuth.status`,
// and store is one-way via `desktopAuth.store` with input cleared in `finally`.
// cursor-api-key was retired with the Cursor leaf (ADR-0198).
//
// APPEARANCE is owner-attested (ADR-0070): machine tests pin geometry/behaviour over an injected
// fake; the real OS-keychain round-trip is witnessed in the running desktop app.

import { useCallback, useEffect, useState } from "react";
import {
  CREDENTIAL_KINDS,
  getDesktopAuth,
  type CredentialKind,
  type DesktopAuthBridge,
} from "../lib/desktopAuth.js";

const ROW_LABELS: Record<CredentialKind, string> = {
  oauth: "Claude subscription token",
  "api-key": "Anthropic API key",
};

export function CredentialsPanel({
  auth,
}: {
  /** Injected in tests; defaults to `getDesktopAuth()` in the running desktop app. */
  auth?: DesktopAuthBridge;
}): React.JSX.Element | null {
  const bridge = auth ?? getDesktopAuth();
  if (!bridge) return null;

  return (
    <div className="credentials-panel" role="region" aria-label="Credentials">
      <div className="credentials-panel-head">Credentials</div>
      <p className="credentials-panel-lead muted small">
        Store runtime credentials in the OS keychain. Values are never shown after saving.
      </p>
      <div className="credentials-rows">
        {CREDENTIAL_KINDS.map((kind) => (
          <CredentialRow key={kind} kind={kind} auth={bridge} />
        ))}
      </div>
    </div>
  );
}

function CredentialRow({
  kind,
  auth,
}: {
  kind: CredentialKind;
  auth: DesktopAuthBridge;
}): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshStatus = useCallback(async (): Promise<void> => {
    setSaved(await auth.status(kind));
  }, [auth, kind]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleStore = async (): Promise<void> => {
    const value = input.trim();
    if (!value) {
      setError("Enter a value before storing.");
      setNotice("");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await auth.store(kind, value);
      await refreshStatus();
      setNotice("Credential stored.");
    } catch {
      setError("Could not store the credential.");
    } finally {
      setInput("");
      setBusy(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await auth.signOut(kind);
      await refreshStatus();
    } catch {
      setError("Could not remove the credential.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="credentials-row" data-kind={kind}>
      <div className="credentials-row-head">
        <span className="credentials-row-label">{ROW_LABELS[kind]}</span>
        <span
          className={`credentials-status badge ${saved ? "status-saved" : "status-unsigned"}`}
          aria-label={saved ? "saved" : "not saved"}
        >
          {saved ? "Saved" : "Not saved"}
        </span>
      </div>
      <div className="credentials-row-actions">
        <input
          type="password"
          className="credentials-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={saved ? "Replace credential" : "Enter credential"}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          aria-label={`${ROW_LABELS[kind]} input`}
        />
        <button
          type="button"
          className="btn small primary"
          disabled={busy}
          onClick={() => void handleStore()}
        >
          {saved ? "Replace" : "Store"}
        </button>
        <button
          type="button"
          className="btn small ghost"
          disabled={busy || !saved}
          onClick={() => void handleSignOut()}
        >
          {saved ? "Sign out" : "Remove"}
        </button>
      </div>
      {error && <p className="credentials-row-msg error-text small">{error}</p>}
      {notice && !error && <p className="credentials-row-msg muted small">{notice}</p>}
    </div>
  );
}
