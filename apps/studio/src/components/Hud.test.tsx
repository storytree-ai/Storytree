// @vitest-environment jsdom
//
// The floating HUD chrome (ADR-0204/ADR-0205): the forest map is the landing surface, the top
// banner and the Overview page retire, and the ONLY global chrome left is a single floating
// verified-identity avatar (top-right) whose menu is a PURE account surface. ADR-0205 retires the
// v1 brand chip (the forest IS the landing surface, so a permanent "back to the forest" chip is a
// second pathway to where you already are) and the menu's Library/Documents entries (the map's
// library drawer is the one Library pathway, the lens dive is the one document pathway). Things
// pinned here, in the ONE file the custom proof command runs:
//
//   1. the LANDING ROUTE RETIREMENT — `parseRoute` never yields `{ name: 'home' }` any more; `#/`,
//      an empty hash, and every unmatched path resolve to the forest (`{ name: 'tree', focus: null }`).
//   2. the HUD component's behavioural composition — NO brand chip, the avatar's honest identity
//      presentation (initials from a verified email, a non-invented fallback when identity hasn't
//      resolved), the menu composed of ONLY the identity/role line + role-/posture-gated Members,
//      Credentials, Sign out (NO Library, NO Documents, NO nav of any kind), and the retirement of
//      the free-text operator input from the chrome.
//
// No visual/colour/pixel assertion here (ADR-0070 stage 2 owns the LOOK) — every assertion below is
// routing, presence/absence, or menu composition, all drivable in jsdom with no real fetch/socket.

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { parseRoute, membersHref } from '../lib/route';
import type { DocMeta, MeInfo } from '../types';
import { Hud } from './Hud';

afterEach(() => {
  cleanup();
  // never leak the desktop bridge between tests
  delete (window as unknown as { desktopAuth?: unknown }).desktopAuth;
});

// ── 1. the landing route retirement ─────────────────────────────────────────────────────────

describe('landing route retirement (ADR-0204)', () => {
  it('hud-landing-routes-to-forest: `#/`, empty, and bare `/` resolve to tree', () => {
    expect(parseRoute('#/')).toEqual({ name: 'tree', focus: null });
    expect(parseRoute('#')).toEqual({ name: 'tree', focus: null });
    expect(parseRoute('#/tree')).toEqual({ name: 'tree', focus: null }); // unchanged sibling route
  });

  it('hud-route-unmatched-path-lands-on-the-forest: an unknown path falls through to tree, not home', () => {
    expect(parseRoute('#/nonsense/path')).toEqual({ name: 'tree', focus: null });
  });

  it('hud-route-never-yields-home: no input produces a route named "home"', () => {
    for (const hash of ['#/', '#', '#/members', '#/tree', '#/doc/a%2Fb', '#/asset/x', '#/unknown']) {
      expect(parseRoute(hash).name).not.toBe('home');
    }
  });

  it('hud-route-other-routes-preserved: every other route still resolves to its current variant', () => {
    expect(parseRoute('#/members')).toEqual({ name: 'members' });
    expect(parseRoute('#/tree/some-story')).toEqual({ name: 'tree', focus: 'some-story' });
    expect(parseRoute('#/doc/some%2Fpath')).toEqual({ name: 'doc', id: 'some/path' });
    expect(parseRoute('#/asset/abc123')).toEqual({ name: 'asset', id: 'abc123' });
    expect(parseRoute('#/asset/abc123/edit')).toEqual({ name: 'asset-edit', id: 'abc123' });
    expect(parseRoute('#/asset/new')).toEqual({ name: 'asset-new' });
    expect(parseRoute('#/library')).toEqual({ name: 'tree', focus: null }); // already-retired lens redirect
  });
});

// ── 2. the Hud component ────────────────────────────────────────────────────────────────────

const admin: MeInfo = { email: 'hua.mick@gmail.com', role: 'admin', status: 'active', member: true };
const member: MeInfo = { email: 'a.person@example.com', role: 'member', status: 'active', member: true };
const unresolved: MeInfo = { email: null, role: null, status: null, member: false };

const docs: DocMeta[] = [
  { id: 'decisions/0001-first.md', title: 'ADR-0001', group: 'Decisions', excerpt: 'the first decision' },
  { id: 'reference/glossary.md', title: 'Glossary', group: 'Reference', excerpt: 'terms' },
];

describe('Hud — no brand chip (ADR-0205)', () => {
  it('hud-no-navigation-chrome: the HUD renders no brand chip or forest-return link — the avatar is the only floating control', () => {
    const { container } = render(<Hud me={admin} docs={docs} posture="desktop" />);
    expect(container.querySelector('.hud-brand')).toBeNull();
    expect(screen.queryByRole('link', { name: /storytree/i })).toBeNull();
  });
});

describe('Hud — avatar identity', () => {
  it('hud-avatar-presents-verified-identity: initials derive from the email local-part, with a role tint', () => {
    render(<Hud me={admin} docs={docs} posture="desktop" />);
    const avatar = screen.getByTestId('hud-avatar');
    expect(avatar.textContent).toContain('HM'); // hua.mick@gmail.com -> HM
    expect(avatar.className).toContain('role-admin'); // the role rides the avatar as a class tint
  });

  it('hud-avatar-honest-fallback-when-identity-unresolved: no invented initials while unresolved', () => {
    render(<Hud me={unresolved} docs={docs} posture="desktop" />);
    const avatar = screen.getByTestId('hud-avatar');
    // The fallback is an honest placeholder, never a two-letter initials guess.
    expect(screen.getByTestId('hud-avatar-fallback')).toBeTruthy();
    expect(avatar.textContent ?? '').not.toMatch(/[A-Z]{2}/);
  });
});

describe('Hud — avatar menu composition', () => {
  it('hud-avatar-menu-account-only: the identity/role line renders as read-only text, never an input', () => {
    render(<Hud me={admin} docs={docs} posture="desktop" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    const identity = screen.getByTestId('hud-menu-identity');
    expect(identity.textContent).toContain('hua.mick@gmail.com');
    expect(identity.textContent).toContain('admin');
    expect(identity.querySelector('input')).toBeNull();
  });

  it('hud-menu-no-library-item: the menu carries no Library entry (the map drawer is the one Library pathway)', () => {
    render(<Hud me={admin} docs={docs} posture="desktop" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    expect(screen.queryByRole('menuitem', { name: 'Library' })).toBeNull();
  });

  it('hud-menu-no-documents-item: the menu carries no Documents entry (the lens dive is the one document pathway)', () => {
    render(<Hud me={admin} docs={docs} posture="desktop" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    expect(screen.queryByRole('menuitem', { name: 'Documents' })).toBeNull();
  });

  it('hud-menu-members-present-for-admin: Members is present for an admin', () => {
    render(<Hud me={admin} docs={docs} posture="desktop" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    const link = screen.getByRole('menuitem', { name: 'Members' });
    expect(link.getAttribute('href')).toBe(membersHref);
  });

  it('hud-menu-members-absent-for-a-member: Members is absent for a non-admin', () => {
    render(<Hud me={member} docs={docs} posture="desktop" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    expect(screen.queryByRole('menuitem', { name: 'Members' })).toBeNull();
  });

  it('hud-menu-credentials-present-with-desktop-bridge: Credentials appears when window.desktopAuth exists', () => {
    (window as unknown as { desktopAuth: unknown }).desktopAuth = {
      store: async () => {},
      status: async () => false,
      signOut: async () => true,
    };
    render(<Hud me={admin} docs={docs} posture="desktop" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    expect(screen.getByRole('menuitem', { name: 'Credentials' })).toBeTruthy();
  });

  it('hud-menu-credentials-absent-without-desktop-bridge: no dead keychain control in a plain browser', () => {
    render(<Hud me={admin} docs={docs} posture="hosted" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    expect(screen.queryByRole('menuitem', { name: 'Credentials' })).toBeNull();
  });

  it('hud-menu-signout-present-hosted-only: Sign out targets the IAP clear-cookie URL when hosted', () => {
    render(<Hud me={admin} docs={docs} posture="hosted" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    const link = screen.getByRole('menuitem', { name: 'Sign out' });
    expect(link.getAttribute('href')).toBe('/?gcp-iap-mode=CLEAR_LOGIN_COOKIE');
  });

  it('hud-menu-signout-absent-on-desktop: no Sign out affordance on the desktop posture', () => {
    render(<Hud me={admin} docs={docs} posture="desktop" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull();
  });
});

describe('Hud — free-text operator field retirement', () => {
  it('hud-topbar-and-operator-retired: the chrome renders no topbar, no banner nav, and no operator field', () => {
    const { container } = render(<Hud me={admin} docs={docs} posture="desktop" />);
    fireEvent.click(screen.getByTestId('hud-avatar'));
    // The HUD is the ENTIRE global chrome now (App renders <Hud/> and nothing else above the
    // body) — so the chrome surface must carry no banner artifacts at all.
    expect(container.querySelector('[aria-label="operator identity"]')).toBeNull();
    expect(container.querySelector('.topbar')).toBeNull();
    expect(container.querySelector('.topnav')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });
});
