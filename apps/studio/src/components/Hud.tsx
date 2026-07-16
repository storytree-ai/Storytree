// Hud — the floating global chrome (ADR-0204). The forest map is the landing surface; the top
// banner and the Overview page retire, and this is the ONLY global chrome left: a brand chip
// (top-left) linking back to the forest, and a verified-identity avatar (top-right) whose menu
// carries the read-only identity + role, the Library lens, Documents, and the posture-/role-gated
// Members, Credentials, and Sign out actions.
//
// Every input is a prop (the `BuildSection`/`StoreBanner` precedent) so this is a clean jsdom unit
// with no context/router coupling required — the composition root (`App`) resolves `me`/`docs` and
// the deploy `posture`. APPEARANCE is operator-attested separately (ADR-0070 stage 2); this pins
// BEHAVIOUR only — routing targets, presence/absence of chrome, and the menu's composition.

import { useState } from 'react';
import { getDesktopAuth } from '../lib/desktopAuth';
import { docHref, homeHref, libraryHref, membersHref } from '../lib/route';
import type { DocMeta, MeInfo } from '../types';
import { CredentialsPanel } from './CredentialsPanel';

/**
 * The deploy posture the HUD's "Sign out" affordance gates on: `desktop` (the injected
 * `window.desktopAuth` bridge is present, or a local dev browser standing in for it — never
 * Sign out) vs `hosted` (a production browser under IAP with no desktop bridge — Sign out clears
 * the IAP session cookie). The composition root resolves which; this component only renders off
 * the given value (ADR-0204's posture discriminator — the leaf's plumbing, the contract pins the
 * render).
 */
export type HudPosture = 'desktop' | 'hosted';

/** The IAP session-clear URL (ADR-0043) — the only thing "Sign out" can honestly mean here. */
const IAP_SIGN_OUT_HREF = '/?gcp-iap-mode=CLEAR_LOGIN_COOKIE';

/**
 * Initials from a verified email's local-part (e.g. "hua.mick@gmail.com" -> "HM"). Never invoked
 * for an unresolved identity — see the honest fallback in {@link Hud} below.
 */
function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const segments = local.split(/[._+-]+/).filter((s) => s.length > 0);
  const first = segments[0] ?? local;
  const second = segments[1] ?? '';
  const a = first.slice(0, 1);
  const b = second.length > 0 ? second.slice(0, 1) : first.slice(1, 2);
  return (a + b).toUpperCase();
}

export function Hud({
  me,
  docs,
  posture,
}: {
  /** The verified `/api/me` identity (ADR-0043) — presented, never re-authenticated here. */
  me: MeInfo;
  /** The document corpus, so the "Documents" menu item has somewhere real to land. */
  docs: DocMeta[];
  posture: HudPosture;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const desktopAuth = getDesktopAuth();

  // Honest fallback: no invented initials while identity hasn't resolved (ANON_ME, a still-loading
  // `me`, or a genuinely unresolved caller) — a neutral placeholder glyph instead.
  const initials = me.email ? initialsFromEmail(me.email) : null;

  const firstDoc = docs.find((d) => d.group === 'Decisions') ?? docs[0];

  return (
    <div className="hud">
      <a className="hud-brand" href={homeHref}>
        <span className="hud-brand-mark" aria-hidden="true">
          ▴
        </span>
        <span className="hud-brand-name">storytree</span>
      </a>

      <div className="hud-account">
        <button
          type="button"
          data-testid="hud-avatar"
          className={`hud-avatar${me.role ? ` role-${me.role}` : ''}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {initials ?? (
            <span data-testid="hud-avatar-fallback" aria-hidden="true">
              •
            </span>
          )}
        </button>

        {menuOpen && (
          <div className="hud-menu" role="menu">
            <div className="hud-menu-identity" data-testid="hud-menu-identity">
              <span className="hud-menu-email">{me.email ?? 'not signed in'}</span>
              {me.role && <span className={`badge role-${me.role}`}>{me.role}</span>}
            </div>

            <a className="hud-menu-item" role="menuitem" href={libraryHref()}>
              Library
            </a>

            {firstDoc && (
              <a className="hud-menu-item" role="menuitem" href={docHref(firstDoc.id)}>
                Documents
              </a>
            )}

            {me.role === 'admin' && (
              <a className="hud-menu-item" role="menuitem" href={membersHref}>
                Members
              </a>
            )}

            {desktopAuth && (
              <button
                type="button"
                className="hud-menu-item"
                role="menuitem"
                onClick={() => setCredentialsOpen((v) => !v)}
              >
                Credentials
              </button>
            )}

            {posture === 'hosted' && (
              <a className="hud-menu-item" role="menuitem" href={IAP_SIGN_OUT_HREF}>
                Sign out
              </a>
            )}

            {desktopAuth && credentialsOpen && (
              <div className="hud-menu-credentials">
                <CredentialsPanel auth={desktopAuth} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
