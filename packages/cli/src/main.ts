#!/usr/bin/env -S tsx
import process from "node:process";
import { pathToFileURL } from "node:url";

import { InMemoryStore, type Store } from "@storytree/storage-protocol";
import {
  loadCorpus,
  createPool,
  closePool,
  PgLibraryStore,
  PgAdrStore,
} from "@storytree/library/store";
import { PgPresenceStore } from "@storytree/notice-board/store";
import { PgWorkStore, PgAttestationStore } from "@storytree/orchestrator/store";

import type { AdrAllocatorLike } from "./adr.js";
import type { AttestationStoreLike } from "./attest.js";
import { run } from "./commands.js";
import { formatEnvelope } from "./envelope.js";
import type { PresenceStoreLike } from "./noticeboard.js";
import { loadLocalSecrets } from "./secrets.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";

/**
 * The `storytree` CLI entry (ADR-0023). Offline-first: by default it runs against an in-memory store
 * seeded from the studio data files (`loadCorpus`), so the read commands work with NO Cloud SQL and
 * NO API key. `--pg` swaps in the live Postgres store (the instance is STOPPED by default — bring it
 * up first). The dispatch lives in `run`; this file only wires the store and prints the envelope.
 */
async function buildStore(usePg: boolean): Promise<{
  store: Store;
  presence: PresenceStoreLike | null;
  verdicts: VerdictReaderLike | null;
  attestations: AttestationStoreLike | null;
  adr: AdrAllocatorLike | null;
  close: () => Promise<void>;
}> {
  if (usePg) {
    const { pool, connector } = await createPool();
    return {
      store: new PgLibraryStore(pool),
      // The presence board (ADR-0033) shares the live pool; offline there is no presence surface.
      presence: new PgPresenceStore(pool),
      // The verdict event log (verdict-glyphs): the tree's glyph column reads events.verdict
      // through the same pool; offline the column is silently absent.
      verdicts: new PgWorkStore(pool),
      // The attestation log (ADR-0044): `storytree attest` records/reads events.attestation
      // through the same pool; offline `attest` refuses (writes/reads both need --pg).
      attestations: new PgAttestationStore(pool),
      // The ADR-number allocator (ADR-0050): `storytree adr new` reserves the next number through
      // events.adr_number on the same pool; offline it falls back to max+1 with a loud warning.
      adr: new PgAdrStore(pool),
      close: () => closePool(pool, connector),
    };
  }
  const store = new InMemoryStore();
  await loadCorpus(store);
  return { store, presence: null, verdicts: null, attestations: null, adr: null, close: async () => {} };
}

async function main(): Promise<void> {
  // The root `pnpm storytree` script forwards args after a literal `--`, which pnpm passes
  // through verbatim; drop it so parseArgs doesn't read it as the end-of-options marker
  // (which would demote every forwarded flag, e.g. --dry-run/--check, to a positional).
  const raw = process.argv.slice(2);
  const argv = raw[0] === "--" ? raw.slice(1) : raw;
  // Hydrate credentials (CLAUDE_CODE_OAUTH_TOKEN / STORYTREE_DB_USER) from ~/.storytree/
  // secrets.json when the env doesn't already carry them — env always wins (owner call,
  // 2026-06-11: one rotation point that survives sessions and worktrees).
  loadLocalSecrets();
  const usePg = argv.includes("--pg");
  const { store, presence, verdicts, attestations, adr, close } = await buildStore(usePg);
  try {
    // Writes only persist against the live --pg store; the offline copy is read-only-by-convention.
    const actor = process.env["STORYTREE_ACTOR"];
    const env = await run(argv, {
      store,
      writable: usePg,
      presence: { store: presence },
      verdicts,
      attestations,
      adr,
      ...(actor !== undefined ? { actor } : {}),
    });
    process.stdout.write(formatEnvelope(env));
    process.exitCode = env.ok ? 0 : 1;
  } finally {
    await close();
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
