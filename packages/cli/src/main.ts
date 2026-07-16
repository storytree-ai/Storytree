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
import { digestOverlapDeltas, type OverlapDelta } from "@storytree/notice-board";
import { PgClaimStore, PgPresenceStore } from "@storytree/notice-board/store";
import { PgWorkStore, PgAttestationStore } from "@storytree/orchestrator/store";

import type { AdrAllocatorLike } from "./adr.js";
import type { AttestationStoreLike } from "./attest.js";
import { run } from "./commands.js";
import { formatEnvelope, withDeltaFooter, type Envelope } from "./envelope.js";
import { deriveIdentity } from "@storytree/drive";
import type { ClaimLedgerStoreLike, PresenceStoreLike, SessionClaimStoreLike } from "@storytree/drive";
import { loadLocalSecrets } from "./secrets.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";
import type { UatVerdictStoreLike } from "./uat.js";

/**
 * The `storytree` CLI entry (ADR-0023). Offline-first: by default it runs against an in-memory store
 * seeded from the studio data files (`loadCorpus`), so the read commands work with NO Cloud SQL and
 * NO API key. `--pg` swaps in the live Postgres store (the instance is STOPPED by default — bring it
 * up first). The dispatch lives in `run`; this file only wires the store and prints the envelope.
 */
async function buildStore(usePg: boolean): Promise<{
  store: Store;
  presence: PresenceStoreLike | null;
  claims: SessionClaimStoreLike | null;
  ledger: ClaimLedgerStoreLike | null;
  verdicts: VerdictReaderLike | null;
  uatStore: UatVerdictStoreLike | null;
  attestations: AttestationStoreLike | null;
  adr: AdrAllocatorLike | null;
  /** The cursor-once overlap-delta pull (ADR-0200 D4); null offline — no footer surface. */
  pullDeltas: ((sessionId: string) => Promise<OverlapDelta[]>) | null;
  close: () => Promise<void>;
}> {
  if (usePg) {
    const { pool, connector } = await createPool();
    // One PgWorkStore over the live pool serves both reads (verdict glyphs, rollup) and the
    // `uat attest` WRITE — it satisfies the read-only VerdictReaderLike and the write-capable
    // UatVerdictStoreLike alike, so the same instance is passed under both seams.
    const work = new PgWorkStore(pool);
    // One PgClaimStore over the live pool serves both claim seams: the declare/done glue
    // (SessionClaimStoreLike, ADR-0142) and the graded ledger verbs (ClaimLedgerStoreLike,
    // ADR-0200 D2 — claim / upgrade / downgrade / release / claims).
    const claimStore = new PgClaimStore(pool);
    return {
      store: new PgLibraryStore(pool),
      // The presence board (ADR-0033) shares the live pool; offline there is no presence surface.
      presence: new PgPresenceStore(pool),
      // The write-claim store (ADR-0142 claim-at-declare): `noticeboard declare --node` takes the
      // work-time claim (the story wisp) and `done` bulk-releases, over the same pool.
      claims: claimStore,
      ledger: claimStore,
      // The verdict event log (verdict-glyphs): the tree's glyph column reads events.verdict
      // through the same pool; offline the column is silently absent.
      verdicts: work,
      // The per-test UAT write surface (ADR-0082): `uat attest` appends a signed operator-attested
      // verdict to events.verdict through the same work store; offline `uat attest` refuses.
      uatStore: work,
      // The attestation log (ADR-0044): `storytree attest` records/reads events.attestation
      // through the same pool; offline `attest` refuses (writes/reads both need --pg).
      attestations: new PgAttestationStore(pool),
      // The ADR-number allocator (ADR-0050): `storytree adr new` reserves the next number through
      // events.adr_number on the same pool; offline it falls back to max+1 with a loud warning.
      adr: new PgAdrStore(pool),
      // The cursor-once overlap-delta pull (ADR-0200 D4): every --pg command's envelope render
      // piggybacks the deltas that touch this session's own claims — see main() below.
      pullDeltas: (sessionId: string) => claimStore.pullOverlapDeltas(sessionId),
      close: () => closePool(pool, connector),
    };
  }
  const store = new InMemoryStore();
  await loadCorpus(store);
  return { store, presence: null, claims: null, ledger: null, verdicts: null, uatStore: null, attestations: null, adr: null, pullDeltas: null, close: async () => {} };
}

/** Time budget for the delta footer's store read — a slow DB never stalls the command's output. */
const DELTA_FOOTER_TIMEOUT_MS = 3_000;

/**
 * Piggyback the cursor-once overlap deltas on the envelope this command already renders
 * (ADR-0200 D4 — deltas ride outputs the agent already reads; never a schedule). FAIL-SILENT by
 * contract: no worktree identity (the lobby, CI), a delta-read error, or a slow DB (time-boxed)
 * all return the envelope UNCHANGED — a courtesy footer never fails or stalls a command.
 */
async function attachDeltaFooter(
  env: Envelope,
  pullDeltas: ((sessionId: string) => Promise<OverlapDelta[]>) | null,
): Promise<Envelope> {
  if (pullDeltas === null) return env;
  try {
    const identity = deriveIdentity();
    if (identity === null) return env;
    const timeout = new Promise<OverlapDelta[]>((resolve) => {
      setTimeout(() => resolve([]), DELTA_FOOTER_TIMEOUT_MS).unref();
    });
    const deltas = await Promise.race([pullDeltas(identity.sessionId).catch(() => []), timeout]);
    return withDeltaFooter(env, digestOverlapDeltas(deltas));
  } catch {
    return env; // fail-silent — the footer is a courtesy, the command's envelope is the payload
  }
}

/**
 * The CLI's async entry. Exported so the direct launcher (`packages/cli/launch.mjs`, ADR-0162
 * inc 2) can register the tsx loader in-process and call this WITHOUT re-spawning a second node
 * through pnpm — the launcher's `import.meta.url` is the launcher, not this file, so the
 * entry-guard below never fires under it. Still self-runs under `tsx src/main.ts` (the fallback).
 */
export async function main(): Promise<void> {
  // The root `pnpm storytree` script forwards args after a literal `--`, which pnpm passes
  // through verbatim; drop it so parseArgs doesn't read it as the end-of-options marker
  // (which would demote every forwarded flag, e.g. --dry-run/--check, to a positional).
  const raw = process.argv.slice(2);
  const argv = raw[0] === "--" ? raw.slice(1) : raw;
  // Hydrate credentials (CLAUDE_CODE_OAUTH_TOKEN / STORYTREE_DB_USER) from
  // ~/.storytree/secrets.json when the env doesn't already carry them — env always wins
  // (CURSOR_API_KEY hydration retired with the Cursor leaf — ADR-0198).
  loadLocalSecrets();
  const usePg = argv.includes("--pg");
  const { store, presence, claims, ledger, verdicts, uatStore, attestations, adr, pullDeltas, close } = await buildStore(usePg);
  try {
    // Writes only persist against the live --pg store; the offline copy is read-only-by-convention.
    const actor = process.env["STORYTREE_ACTOR"];
    const env = await run(argv, {
      store,
      writable: usePg,
      presence: { store: presence, claims, ledger },
      verdicts,
      uatStore,
      attestations,
      adr,
      ...(actor !== undefined ? { actor } : {}),
    });
    // ADR-0200 D4: the cursor-once delta footer rides the render the agent already reads.
    process.stdout.write(formatEnvelope(await attachDeltaFooter(env, pullDeltas)));
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
