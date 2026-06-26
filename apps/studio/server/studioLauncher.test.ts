// Proves the orphan-reap parsing in the detached studio launcher (scripts/studio.mjs): `studio:down`
// must stop whatever actually HOLDS :5173, not just the pid in .studio.pid — so the PID extraction from
// `netstat -ano` has to pick exactly the right LISTENING pids for the port. The launcher is plain Node
// ESM (no tsx/deps, runs before install); its main() is guarded so this test imports the pure helper
// without launching or killing anything. (apps/* is outside the check:boundaries scan, so this
// cross-root import is fine.)
import { describe, it, expect } from 'vitest';
import { parseListeningPids } from '../../../scripts/studio.mjs';

// A representative Windows `netstat -ano` slice: the dev server listening on both IPv4 and IPv6 (same
// pid), plus decoys that must NOT match — an ESTABLISHED connection, a DIFFERENT port (:51730, the
// `:5173` prefix trap), another service (:5432), and a UDP row.
const NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       63736
  TCP    [::1]:5173             [::]:0                 LISTENING       63736
  TCP    127.0.0.1:51730        127.0.0.1:443         ESTABLISHED     999
  TCP    0.0.0.0:51730          0.0.0.0:0             LISTENING       4242
  TCP    0.0.0.0:5432           0.0.0.0:0             LISTENING       777
  UDP    0.0.0.0:5173           *:*                                   8888
`;

describe('parseListeningPids', () => {
  it('extracts the LISTENING pid for the port, deduped across IPv4 + IPv6', () => {
    expect(parseListeningPids(NETSTAT, 5173)).toEqual([63736]);
  });

  it('does not match a port that merely shares a prefix (:51730 ≠ :5173)', () => {
    expect(parseListeningPids(NETSTAT, 5173)).not.toContain(4242);
  });

  it('ignores non-LISTENING rows (ESTABLISHED) and UDP', () => {
    // 999 (ESTABLISHED on :51730) and 8888 (UDP :5173) must never appear for any port.
    const all = parseListeningPids(NETSTAT, 5173);
    expect(all).not.toContain(999);
    expect(all).not.toContain(8888);
  });

  it('finds a different port when asked', () => {
    expect(parseListeningPids(NETSTAT, 5432)).toEqual([777]);
    expect(parseListeningPids(NETSTAT, 51730)).toEqual([4242]); // the LISTENING one only
  });

  it('returns [] when nothing listens on the port (and for empty input)', () => {
    expect(parseListeningPids(NETSTAT, 9999)).toEqual([]);
    expect(parseListeningPids('', 5173)).toEqual([]);
  });
});
