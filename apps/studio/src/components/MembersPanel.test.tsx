// @vitest-environment jsdom
//
// Behaviour test for the MEMBERS PANEL's role surface (`invite-ui` capability of the
// studio-members story; ADR-0043 invite-ui, ADR-0117 builder-role).
//
// WHAT THIS FILE EXISTS TO PIN. `builder` has been a real role since ADR-0117 — `USER_ROLES`
// carries it, `resolveAccess` resolves its brokered-write scope, `guestPolicy` and `writeBroker`
// honour it, the `/api/users` route validator accepts it and `storytree members` grants it. The one
// surface that could not was this panel: its invite `<select>` hardcoded two `<option>`s, and
// re-roling was `u.role === 'admin' ? 'member' : 'admin'` — a binary flip with no reachable third
// state. So `studio-members` UAT leg 8 ("an admin grants `friend@example.com` the **builder** role
// through the same in-app `/api/users` route the Members panel calls") was honestly RED even though
// every layer beneath the panel would have accepted the write.
//
// THE ASSERTIONS ARE WRITTEN AGAINST THE ENUM, NOT AGAINST A LITERAL. The gap existed because the
// role set was written down four separate times and one copy fell behind. A test that asserted the
// three roles by name would be a fifth copy with the same failure mode. Each case below iterates
// `USER_ROLES` — so a role added to the schema is a role this panel is immediately held to, and the
// suite cannot go green against a stale list. `builder` is additionally asserted BY NAME in one
// place, because deleting it from `USER_ROLES` must red this suite rather than quietly shrink what
// it checks (the vacuous-green fault class).
//
// SEAMS, NOT MODULE MOCKS (`no-module-mocking` is at `error`, no override). The transport is the
// fail-closed `httpDouble` — the real `api` client builds the URL, serialises the body and unwraps
// `{error}`, so "the panel granted builder" means the panel issued a request a real server would
// have accepted. The app-wide context comes from the real provider via `WithAppData`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { USER_ROLES } from '@storytree/studio-members';

import { MembersPanel } from './MembersPanel';
import { WithAppData, TEST_ME } from '../test/appData';
import { HttpDouble, installHttpDouble } from '../test/httpDouble';
import type { InviteResult, Member, UserRole } from '../types';

const USERS = '/api/users';
const NOW = '2026-01-01T00:00:00.000Z';

let http: HttpDouble;

function member(email: string, role: UserRole, overrides: Partial<Member> = {}): Member {
  return {
    email,
    role,
    status: 'active',
    invitedBy: 'operator@example.com',
    createdAt: NOW,
    lastSeenAt: NOW,
    ...overrides,
  };
}

function inviteResult(email: string, role: UserRole): InviteResult {
  return { ...member(email, role, { status: 'invited' }), notify: { status: 'sent' } };
}

/** Render the panel as an admin (the only caller it renders controls for) over a given directory. */
async function renderPanel(rows: readonly Member[]): Promise<void> {
  http.get(USERS, () => rows);
  render(
    <WithAppData me={{ ...TEST_ME, role: 'admin' }}>
      <MembersPanel />
    </WithAppData>,
  );
  // The panel lists on mount; wait for the table rather than asserting against the loading state.
  await screen.findByRole('table');
}

/**
 * The row whose FIRST cell carries `email`. Scoped to the first cell deliberately: an admin's
 * address also appears in every row they invited (the `Invited by` column), so a document-wide text
 * match would resolve to whichever row happened to come first.
 */
function rowFor(email: string): HTMLTableRowElement {
  const row = screen
    .getAllByRole<HTMLTableRowElement>('row')
    .find((candidate) => candidate.cells[0]?.textContent?.startsWith(email));
  if (!row) throw new Error(`no table row for ${email}`);
  return row;
}

beforeEach(() => {
  http = installHttpDouble();
});

afterEach(() => {
  http.uninstall();
  cleanup();
});

describe('MembersPanel role surface', () => {
  // ── mp-invite-offers-every-role ───────────────────────────────────────────
  it('mp-invite-offers-every-role: the invite select offers EVERY role in USER_ROLES, builder included', async () => {
    await renderPanel([member('operator@example.com', 'admin')]);

    const select = screen.getByLabelText('role');
    const offered = within(select)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

    // Derived, not restated: a role added to the schema must appear here without editing this test.
    expect([...offered].sort()).toEqual([...USER_ROLES].sort());
    // …and asserted by name once, so deleting `builder` from the enum reds this suite rather than
    // silently shrinking what it checks.
    expect(offered).toContain('builder');
  });

  // ── mp-invite-grants-builder ─────────────────────────────────────────────
  it('mp-invite-grants-builder: inviting with builder selected POSTs role="builder" to /api/users', async () => {
    await renderPanel([member('operator@example.com', 'admin')]);
    http.post(USERS, () => inviteResult('friend@example.com', 'builder'));

    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'friend@example.com' },
    });
    fireEvent.change(screen.getByLabelText('role'), { target: { value: 'builder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      const posts = http.requestsTo(USERS).filter((r) => r.method === 'POST');
      expect(posts).toHaveLength(1);
      expect(posts[0]?.body).toEqual({ email: 'friend@example.com', role: 'builder' });
    });
  });

  // ── mp-rerole-reaches-every-role ─────────────────────────────────────────
  it('mp-rerole-reaches-every-role: an existing member can be re-roled to EVERY role, not flipped between two', async () => {
    // Two admins, so the last-admin guard is never what a re-role runs into here.
    await renderPanel([
      member('operator@example.com', 'admin'),
      member('other@example.com', 'admin'),
      member('friend@example.com', 'member'),
    ]);

    const select = within(rowFor('friend@example.com')).getByLabelText(
      'role for friend@example.com',
    );
    const offered = within(select)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

    expect([...offered].sort()).toEqual([...USER_ROLES].sort());
  });

  // ── mp-rerole-grants-builder ─────────────────────────────────────────────
  it('mp-rerole-grants-builder: re-roling to builder PATCHes role="builder" — the in-app grant UAT leg 8 walks', async () => {
    await renderPanel([
      member('operator@example.com', 'admin'),
      member('friend@example.com', 'member'),
    ]);
    http.patch(USERS, () => member('friend@example.com', 'builder'));

    fireEvent.change(
      within(rowFor('friend@example.com')).getByLabelText('role for friend@example.com'),
      { target: { value: 'builder' } },
    );

    await waitFor(() => {
      const patches = http.requestsTo(USERS).filter((r) => r.method === 'PATCH');
      expect(patches).toHaveLength(1);
      expect(patches[0]?.body).toEqual({ email: 'friend@example.com', role: 'builder' });
    });
  });

  // ── mp-rerole-refresh-shows-new-role ─────────────────────────────────────
  it('mp-rerole-refresh-shows-new-role: after the grant the panel re-lists and shows the builder badge', async () => {
    await renderPanel([
      member('operator@example.com', 'admin'),
      member('friend@example.com', 'member'),
    ]);
    http.patch(USERS, () => member('friend@example.com', 'builder'));
    // The re-list after a successful write answers with the granted role.
    http.get(USERS, () => [
      member('operator@example.com', 'admin'),
      member('friend@example.com', 'builder'),
    ]);

    fireEvent.change(
      within(rowFor('friend@example.com')).getByLabelText('role for friend@example.com'),
      { target: { value: 'builder' } },
    );

    // Read back what the ROW now shows. The select's value is driven off the listed row, so this is
    // the server-confirmed state re-rendered — not an optimistic paint the write never earned.
    // (Asserted on the control rather than the badge text: every row also carries a `builder`
    // <option>, so a bare text match would pass without the re-list ever happening.)
    await waitFor(() => {
      const select = within(rowFor('friend@example.com')).getByLabelText<HTMLSelectElement>(
        'role for friend@example.com',
      );
      expect(select.value).toBe('builder');
    });
    // …and the Role column's badge agrees, which is the thing an admin actually reads.
    const roleCell = rowFor('friend@example.com').cells[1];
    expect(roleCell?.textContent).toBe('builder');
  });

  // ── mp-rerole-error-surfaces ─────────────────────────────────────────────
  it('mp-rerole-error-surfaces: a refused re-role (the last-admin 409) surfaces as the error line', async () => {
    await renderPanel([
      member('operator@example.com', 'admin'),
      member('friend@example.com', 'member'),
    ]);
    http.patch(USERS, () =>
      new Response(JSON.stringify({ error: 'the last admin cannot be demoted' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    fireEvent.change(
      within(rowFor('operator@example.com')).getByLabelText('role for operator@example.com'),
      { target: { value: 'member' } },
    );

    await waitFor(() => {
      expect(screen.getByText(/last admin cannot be demoted/i)).toBeTruthy();
    });
  });
});
