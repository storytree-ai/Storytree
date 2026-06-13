// The Members admin panel (ADR-0043 invite-ui): list the members, invite by email + role,
// re-role, and remove — all admin-only. The server enforces the admin gate and the last-admin
// guard (a 409 surfaces here as the error line); this panel is also hidden from members in the nav
// and refuses to render its controls for a non-admin caller.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import type { InviteResult, Member, UserRole } from '../types';

/** One line telling the admin whether the invite email actually reached the new member. */
function inviteNotice(r: InviteResult): string {
  if (r.notify.status === 'sent') return `Invited ${r.email} — an invite email is on its way.`;
  if (r.notify.status === 'failed') {
    return `Invited ${r.email}, but the email didn't send (${r.notify.detail ?? 'unknown error'}). Share the studio link manually.`;
  }
  return `Invited ${r.email}. ${r.notify.detail ?? 'Email is off — share the studio link manually.'}`;
}

export function MembersPanel(): React.JSX.Element {
  const { me } = useAppData();
  const [users, setUsers] = useState<Member[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setUsers(await api.listUsers());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (me.role !== 'admin') {
    return (
      <div className="pad error-box">
        <h2>Admins only</h2>
        <p className="muted">Members are managed by admins. Ask an admin if you need access changed.</p>
      </div>
    );
  }

  async function withBusy(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    await withBusy(async () => {
      const result = await api.inviteUser(email.trim().toLowerCase(), role);
      setNotice(inviteNotice(result));
      setEmail('');
      setRole('member');
      await refresh();
    });
  }

  const toggleRole = (u: Member): Promise<void> =>
    withBusy(async () => {
      await api.setUserRole(u.email, u.role === 'admin' ? 'member' : 'admin');
      await refresh();
    });

  const remove = (u: Member): Promise<void> =>
    withBusy(async () => {
      if (!window.confirm(`Remove ${u.email}? Their comment history stays attributed.`)) return;
      await api.removeUser(u.email);
      await refresh();
    });

  return (
    <div className="members pad">
      <div className="doc-crumb muted small">members</div>
      <h1>Members</h1>
      <p className="muted">
        Who can read, comment, and edit. IAP authenticates the Google account;
        the studio authorizes from this list (ADR-0043). The last remaining admin can’t be removed.
      </p>

      <form className="members-invite" onSubmit={invite}>
        <input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          spellCheck={false}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} aria-label="role">
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" className="btn primary" disabled={busy || !email.trim()}>
          Invite
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}
      {notice && <p className="muted small members-notice">{notice}</p>}

      {users === null ? (
        <p className="muted">Loading members…</p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Invited by</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>
                  {u.email}
                  {u.email === me.email && <span className="badge ghost you">you</span>}
                </td>
                <td>
                  <span className={`badge role-${u.role}`}>{u.role}</span>
                </td>
                <td>
                  <span className={`badge status-${u.status}`}>{u.status}</span>
                </td>
                <td className="muted small">{u.invitedBy ?? '—'}</td>
                <td className="members-actions">
                  <button type="button" className="btn small" disabled={busy} onClick={() => void toggleRole(u)}>
                    {u.role === 'admin' ? 'Make member' : 'Make admin'}
                  </button>
                  <button type="button" className="btn small ghost" disabled={busy} onClick={() => void remove(u)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
