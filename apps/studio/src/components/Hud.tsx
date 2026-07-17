// Hud — the floating global chrome (ADR-0204/ADR-0205). The forest map is the landing surface; the
// top banner and the Overview page retire, and this is the ONLY global chrome left: a single
// verified-identity avatar (top-right). ADR-0205 retires the v1 brand chip (the forest IS the
// landing surface, so a permanent "back to the forest" chip is a second pathway to where you
// already are) and the menu's Library/Documents entries (the map's library drawer is the one
// Library pathway, the lens dive is the one document pathway) — the avatar menu is a PURE account
// surface: the read-only identity + role line, and the posture-/role-gated Members, Credentials,
// and Sign out actions. No navigation affordance of any kind lives in the chrome any more.
//
// Every input is a prop (the `BuildSection`/`StoreBanner` precedent) so this is a clean jsdom unit
// with no context/router coupling required — the composition root (`App`) resolves `me`/`docs` and
// the deploy `posture`. APPEARANCE is operator-attested separately (ADR-0070 stage 2); this pins
// BEHAVIOUR only — routing targets, presence/absence of chrome, and the menu's composition.

import { useState } from 'react';
import { getDesktopAuth } from '../lib/desktopAuth';
import { membersHref } from '../lib/route';
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
  posture,
}: {
  /** The verified `/api/me` identity (ADR-0043) — presented, never re-authenticated here. */
  me: MeInfo;
  /**
   * The document corpus — accepted for compatibility with the composition root's existing data
   * flow, but no longer read: ADR-0205 retires the menu's Documents shortcut (the lens dive is the
   * one document pathway), so the HUD carries no document-derived state any more.
   */
  docs: DocMeta[];
  posture: HudPosture;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const desktopAuth = getDesktopAuth();

  // Honest fallback: no invented initials while identity hasn't resolved (ANON_ME, a still-loading
  // `me`, or a genuinely unresolved caller) — a neutral placeholder glyph instead.
  const initials = me.email ? initialsFromEmail(me.email) : null;

  return (
    <div className="hud">
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
