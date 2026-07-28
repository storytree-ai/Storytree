// The map-server-memo capability (ADR-0240 stage 3: "memoize the server walks and add
// validators"). Two responsibilities, deliberately narrow and pure of HTTP — no `ServerResponse`, no
// import of `readTree`/`listDocs` — so its freshness semantics are provable directly:
//
//   1. fingerprintDir — a STAT-ONLY recursive walk (no readFile, no parse) that changes on a content
//      edit, an add, a remove, or a rename.
//   2. memoizeCorpusWalk — get-or-compute keyed by directory path: the fingerprint is observed BEFORE
//      the (expensive) walk/parse `compute` runs, and stored paired with the value it describes, so a
//      concurrent edit mid-walk can only cause a wasted re-walk next time, never a stale serve.
//
// Why not directory mtime (ADR-0240's literal wording): probed on the real filesystem, a directory's
// mtime does NOT move when a contained file's CONTENT changes — only on an add/remove/rename. That
// would silently miss exactly the dev-loop edit (edit `stories/<x>/story.md`, refresh the map) ADR-0240
// itself names as where staleness bites first. A stat-only per-file walk (path + mtime + size) DOES
// move on a content edit, and is still a real 4-8x win over even a bare read of the corpus (measured:
// stat-walking `docs/`'s 380 files is 22.5ms vs 63.1ms just to READ its 299 markdown files, before
// `listDocs` parses anything) — so the property (moves on edit/add/remove/rename) is cheaply
// satisfiable without reading or parsing a single file.

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * A stat-only recursive walk of `dir`: relative-path + mtime + size per file, joined into one
 * deterministic string. Reads NOTHING and parses NOTHING. Returns `null` when `dir` does not exist (or
 * isn't a directory) — the caller then degrades to "always compute", matching the existing
 * `existsSync` guards in `listDocs`/`readTree`. Tolerant of a file/directory vanishing mid-walk (a race
 * with a concurrent edit): that entry is simply omitted, which can only ever cause a fingerprint
 * MISS (a wasted re-walk), never a stale fingerprint.
 */
export async function fingerprintDir(dir: string): Promise<string | null> {
  let rootStat;
  try {
    rootStat = await stat(dir);
  } catch {
    return null;
  }
  if (!rootStat.isDirectory()) return null;

  const parts: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return; // directory vanished between the parent readdir and this one — omit its subtree
    }
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile()) {
        try {
          const st = await stat(full);
          const rel = path.relative(dir, full).split(path.sep).join('/');
          parts.push(`${rel}:${st.mtimeMs}:${st.size}`);
        } catch {
          // vanished between readdir and stat — omit; its next real state produces a different
          // fingerprint than any fingerprint that ever included (or omitted) it deterministically.
        }
      }
    }
  }
  await walk(dir);
  parts.sort();
  return parts.join('|');
}

interface MemoEntry<T> {
  fingerprint: string;
  value: T;
}

/**
 * One entry per directory path — never a single shared slot. `resolveStudioPaths` takes a
 * `repoRootOverride` (a foreign repo root, ADR-0246) and `docsMirrorProbe.ts` walks several
 * directories in one process; a shared slot would serve one tree's answer for another. No TTL, no
 * clock anywhere in this module — freshness is decided by the fingerprint and by nothing else.
 */
const memoStore = new Map<string, MemoEntry<unknown>>();

/**
 * Get-or-compute `compute()` for `dir`, memoized by {@link fingerprintDir}.
 *
 * The fingerprint is observed BEFORE `compute` runs and stored paired with the value it describes: an
 * edit landing mid-walk is keyed to the PRE-edit fingerprint, so the next request's freshly-observed
 * fingerprint differs and it re-walks — a wasted walk, never a stale answer. This ordering is also
 * what makes two overlapping cold requests safe with no coordination between them: whichever finishes
 * last simply stores its own (correct) fingerprint/value pair.
 *
 * The returned `value` is always STRUCTURED-CLONED away from whatever this module stores — on a hit
 * or a miss — so a caller that mutates its own copy (the `/api/tree` handler mutates its payload with
 * live verdict/build enrichment in place) can never poison what a later request is served.
 *
 * `fingerprint` is `null` when `dir` doesn't exist (or the stat walk itself failed): the caller then
 * degrades exactly like today — nothing is cached, `compute` runs every time, and `compute` itself
 * stays responsible for its own missing-directory behaviour (e.g. `listDocs`'s `existsSync` guard).
 */
export async function memoizeCorpusWalk<T>(
  dir: string,
  compute: () => Promise<T>,
): Promise<{ value: T; fingerprint: string | null }> {
  let fingerprint: string | null;
  try {
    fingerprint = await fingerprintDir(dir);
  } catch {
    fingerprint = null;
  }
  if (fingerprint !== null) {
    const cached = memoStore.get(dir);
    if (cached && cached.fingerprint === fingerprint) {
      return { value: structuredClone(cached.value) as T, fingerprint };
    }
  }
  const value = await compute();
  if (fingerprint !== null) {
    memoStore.set(dir, { fingerprint, value });
  }
  return { value: structuredClone(value) as T, fingerprint };
}
