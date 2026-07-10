// DesktopCredentialsDock — the settings/control-surface entry for the Credentials panel (ADR-0179).
//
// A compact control in the topbar opens the desktop-only Credentials panel. The dock renders nothing
// when `window.desktopAuth` is absent, so the hosted/browser studio never shows dead keychain controls.

import { useState } from "react";
import { CredentialsPanel } from "./CredentialsPanel.js";
import { getDesktopAuth } from "../lib/desktopAuth.js";

export function DesktopCredentialsDock(): React.JSX.Element | null {
  const auth = getDesktopAuth();
  const [open, setOpen] = useState(false);
  if (!auth) return null;

  return (
    <div className="credentials-dock">
      {open && (
        <div className="credentials-dock-panel">
          <CredentialsPanel auth={auth} />
        </div>
      )}
      <button
        type="button"
        className={`btn small credentials-dock-btn${open ? " on" : ""}`}
        aria-expanded={open}
        aria-label={open ? "Close credentials" : "Open credentials"}
        onClick={() => setOpen((v) => !v)}
      >
        Credentials
      </button>
    </div>
  );
}
