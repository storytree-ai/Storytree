import { describe, expect, it } from 'vitest';

import { blankDbCredentialRefusal, createBackend } from './libraryBackend';

/**
 * A blank `STORYTREE_DB_USER` must fail at the boundary that can still NAME it.
 *
 * THE RED→GREEN PAIR is the measured failure of 2026-08-02 (branch `claude/musing-hertz-44d3ee`): a
 * shell-mangled command substitution exported `STORYTREE_DB_USER=`, which read as PRESENT, travelled
 * to the Cloud SQL connector, and surfaced one process away as `{"store":"pg","db":"unreachable"}`
 * with `/api/tree` 503ing. ~25 minutes were spent on a database that was never down — a direct
 * connector `SELECT 1` answered `{"ok":1}` throughout. The refusal is worth its own test because the
 * failure it removes MANUFACTURES the evidence `asset:probe-dont-assume-db-reachability` tells a
 * session to trust.
 */
describe('blankDbCredentialRefusal', () => {
  it('refuses a blank value, naming the VARIABLE and the hydration source — never the database', () => {
    const msg = blankDbCredentialRefusal({ STORYTREE_DB_USER: '' });
    expect(msg).not.toBeNull();
    expect(msg).toContain('STORYTREE_DB_USER');
    expect(msg).toContain('~/.storytree/secrets.json');
    expect(msg).toMatch(/not a\s+database problem/);
  });

  it('refuses a whitespace-only value too', () => {
    expect(blankDbCredentialRefusal({ STORYTREE_DB_USER: '   ' })).not.toBeNull();
    expect(blankDbCredentialRefusal({ STORYTREE_DB_USER: '\t\n' })).not.toBeNull();
  });

  it('leaves an ABSENT credential alone — that is the hydration path, not a mangled export', () => {
    // Refusing absence would break every legitimate run that lets `loadLocalSecrets` fill the value
    // from `~/.storytree/secrets.json`, and every DB-free path that simply never sets it.
    expect(blankDbCredentialRefusal({})).toBeNull();
  });

  it('leaves a real credential alone', () => {
    expect(blankDbCredentialRefusal({ STORYTREE_DB_USER: 'iam@example.com' })).toBeNull();
  });
});

describe('createBackend', () => {
  const withEnv = <T>(vars: Record<string, string | undefined>, fn: () => T): T => {
    const saved = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
    try {
      for (const [k, v] of Object.entries(vars)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      return fn();
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  const opts = {
    assetsFile: '/tmp/assets.json',
    commentsFile: '/tmp/comments.json',
    usersFile: '/tmp/users.json',
    attestationsFile: '/tmp/attestations.json',
  };

  it('REFUSES AT STARTUP under a blank credential, before any connector call', () => {
    // Deliberately here rather than in `PgBackend.#ready()`: `health()` catches everything and answers
    // `db: 'unreachable'`, so a lazy throw would be folded straight back into the misleading verdict
    // this exists to stop printing for a healthy database.
    withEnv({ STORYTREE_DB_USER: '', STORYTREE_STUDIO_STORE: undefined }, () => {
      expect(() => createBackend(opts)).toThrow(/STORYTREE_DB_USER is SET BUT EMPTY/);
    });
  });

  it('starts normally when the credential is absent (hydration fills it) or real', () => {
    withEnv({ STORYTREE_DB_USER: undefined, STORYTREE_STUDIO_STORE: undefined }, () => {
      expect(() => createBackend(opts)).not.toThrow();
    });
    withEnv({ STORYTREE_DB_USER: 'iam@example.com', STORYTREE_STUDIO_STORE: undefined }, () => {
      expect(() => createBackend(opts)).not.toThrow();
    });
  });

  it('never refuses the OFFLINE json backend — it needs no credential at all', () => {
    withEnv({ STORYTREE_DB_USER: '', STORYTREE_STUDIO_STORE: 'json' }, () => {
      expect(() => createBackend(opts)).not.toThrow();
    });
  });
});
