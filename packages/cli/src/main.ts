#!/usr/bin/env -S tsx
import { randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { HttpStore, InMemoryStore, type Store } from "@storytree/storage-protocol";
import {
  loadCorpus,
  createPool,
  closePool,
  PgLibraryStore,
  PgAdrStore,
} from "@storytree/library/store";
import {
  captureCliInvocation,
  isTraversalCaptureEnabled,
  parseOfferFollow,
  planOfferIdentity,
  resolveAgentDescent,
  resolveArtifactOffers,
} from "@storytree/context-traversal-capture";
import { digestOverlapDeltas, type OverlapDelta } from "@storytree/notice-board";
import { PgClaimStore } from "@storytree/notice-board/store";
import { PgWorkStore, PgAttestationStore } from "@storytree/orchestrator/store";

import type { AdrAllocatorLike } from "./adr.js";
import type { AttestationStoreLike } from "./attest.js";
import { isRawEnvelope, run } from "./commands.js";
import { formatEnvelope, withDeltaFooter, type Envelope } from "./envelope.js";
import { deriveIdentity } from "@storytree/drive";
import type { ClaimLedgerStoreLike, SessionClaimStoreLike } from "@storytree/drive";
import { loadLocalSecrets } from "./secrets.js";
import { resolveStoreDoor } from "./store-door.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";
import type { UatVerdictStoreLike } from "./uat.js";

/**
 * The `storytree` CLI entry (ADR-0023). Offline-first: by default it runs against an in-memory store
 * seeded from the studio data files (`loadCorpus`), so the read commands work with NO Cloud SQL and
 * NO API key. `--pg` swaps in the live Postgres store (the instance is STOPPED by default — bring it
 * up first). The dispatch lives in `run`; this file only wires the store and prints the envelope.
 *
 * THREE stores now, in this precedence: `--pg` (explicit, wins) → the ADR-0259 store door over HTTPS
 * when `STORYTREE_STORE_URL` is set → the offline seed. The door is the read path for a client that
 * cannot open a Cloud SQL connector at all, which is every remote session (ADR-0258 D2) — and it must
 * exist BEFORE ADR-0302 D1/D2 decommit the seed, or a remote session can read nothing
 * (`session-decoupling-arc`, entry `httpstore-lands-before-offline-drops`).
 */
async function buildStore(usePg: boolean): Promise<{
  store: Store;
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
      // The write-claim store (ADR-0142 claim-at-declare): `noticeboard declare --node` takes the
      // work-time claim (the story wisp) and `done` bulk-releases, over the same pool. Presence is
      // RETIRED (ADR-0200 D7) — the claim ledger is the one session surface.
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
  // The STORE DOOR (ADR-0259 D1): ordinary HTTPS to the studio's `/api/store`, which is the only
  // shape a remote session can reach — it cannot dial Cloud SQL at all (ADR-0250 / ADR-0258 D2), and
  // ADR-0302 D1/D2 decommit the offline seed below. Read-only by the door's own decision (writes are
  // 403 there, ADR-0259 D5), so every write seam stays null exactly as it does offline, and a write
  // command refuses with its existing "needs --pg" message rather than a confusing 403 from the wire.
  const door = resolveStoreDoor(process.env);
  if (door) {
    return {
      store: new HttpStore(door),
      claims: null,
      ledger: null,
      verdicts: null,
      uatStore: null,
      attestations: null,
      adr: null,
      pullDeltas: null,
      close: async () => {},
    };
  }
  const store = new InMemoryStore();
  await loadCorpus(store);
  return { store, claims: null, ledger: null, verdicts: null, uatStore: null, attestations: null, adr: null, pullDeltas: null, close: async () => {} };
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
 * Ambient, metadata-only capture of this invocation's allowlisted READS (ADR-0235 / ADR-0241).
 *
 * FAIL-SILENT and ADDITIVE by contract, exactly like {@link attachDeltaFooter} above: it runs after
 * the envelope has already been written and the exit code already set, so nothing here can alter
 * what the command produced. It is SYNCHRONOUS and never awaits a network or DB path — `main` runs
 * on EVERY invocation, including the gate's own internal calls (ADR-0162 startup budget).
 *
 * Identity resolves in {@link resolveCaptureSessionId} and is passed in: `STORYTREE_SESSION_ID` wins
 * (the secrets-hydration precedent, and the seam a future spawned-agent adapter inherits a parent
 * session through), else the worktree derivation, which is null in the main checkout and in CI. A
 * null identity captures nothing — silently, since an uninstrumented run is a normal outcome, not an
 * error. It resolves in `main` rather than here because the offer-id plan (ADR-0260 D3) needs the
 * same answer BEFORE the render; it is still exactly ONE derivation per invocation.
 */
function resolveCaptureSessionId(): string | null {
  try {
    const override = process.env["STORYTREE_SESSION_ID"];
    if (override !== undefined && override.trim().length > 0) return override;
    return deriveIdentity()?.sessionId ?? null;
  } catch {
    return null;
  }
}

async function captureInvocation(
  argv: readonly string[],
  readArgv: readonly string[],
  ok: boolean,
  store: Store,
  sessionId: string | null,
  offerVisitId: string | undefined,
): Promise<void> {
  try {
    // An `agents <name>` essentials render resolves the agent's floor refs BY EXPLICIT ID, so each
    // one is a genuine within-process descent (ADR-0235 clause 2). Resolving needs an async store
    // read, and `captureCliInvocation` is contractually synchronous — so it happens here, inside the
    // existing try/catch and before `close()`. Every other dispatch shape resolves to [].
    //
    // Both resolutions run against `readArgv` — this invocation's argv with any `--from-offer` flag
    // stripped. A read that ANSWERS an offer is still a read, and still offers onward artifacts of
    // its own; resolving against the raw argv would break the chain after exactly one hop.
    const agentRefIds = await resolveAgentDescent(readArgv, store);
    // A `library artifact <id>` render PRINTS its onward refs as a Sources block — that block IS the
    // offer set (ADR-0260 D1), already computed by the renderer. Resolving it needs the same async
    // store read `agentRefIds` does, so it is resolved HERE and passed in. It is recorded whether or
    // not anything follows it (D2); which offer this read ANSWERED rides in its own argv (D3) and is
    // parsed inside `captureCliInvocation`, from the raw argv passed below.
    const offeredIds = await resolveArtifactOffers(readArgv, store);
    captureCliInvocation({
      argv,
      ok,
      sessionId,
      agentRefIds,
      offeredIds,
      ...(offerVisitId !== undefined ? { offerVisitId } : {}),
    });
  } catch {
    // Telemetry never breaks a command — the envelope is the payload, the trace is a courtesy.
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
  // ADR-0260 D3 — the offer's identity travels in ARGV, so the render has to know the id BEFORE it
  // prints, and capture has to record that same id afterwards. The rendering visit's id is therefore
  // pre-minted here and handed to both halves: `run` prints follow-up commands carrying
  // `candidate-set:<visitId>`, and `captureCliInvocation` records the offer under that very id. A
  // `candidate_set` event has no `visitId` field, so the id IS the join — mint it in two places and
  // the printed id names a visit that never existed.
  //
  // An id is planned ONLY where this invocation will really record the offer it names, so a render
  // can never hand out a dangling id an agent could return: `planOfferIdentity` refuses every shape
  // that records no offer (a `--pg` read, `artifact list`, any non-artifact area), and the two
  // capture preconditions are checked alongside it. Those two also keep ADR-0241 **D2** intact for a
  // run that captures nothing — with capture opted out, or no resolvable identity, the envelope is
  // byte-identical to a capture-absent one, because nothing was recorded to point at. (D2 is the
  // opt-out-clean envelope; D3's envelope clause is the narrower promise that no telemetry FAILURE
  // may alter one. ADR-0241's own Consequences make that split explicitly — don't cite D3 here.)
  const { argv: readArgv } = parseOfferFollow(argv);
  const captureSessionId = resolveCaptureSessionId();
  const offer =
    captureSessionId !== null && isTraversalCaptureEnabled()
      ? planOfferIdentity(readArgv, randomUUID)
      : null;
  const usePg = argv.includes("--pg");
  const { store, claims, ledger, verdicts, uatStore, attestations, adr, pullDeltas, close } = await buildStore(usePg);
  try {
    // Writes only persist against the live --pg store; the offline copy is read-only-by-convention.
    const actor = process.env["STORYTREE_ACTOR"];
    const env = await run(argv, {
      store,
      writable: usePg,
      presence: { claims, ledger },
      verdicts,
      uatStore,
      attestations,
      adr,
      ...(actor !== undefined ? { actor } : {}),
      ...(offer !== null ? { offerId: offer.candidateSetId } : {}),
    });
    if (isRawEnvelope(env)) {
      // `library artifact <id> --raw <field>` — the ONE deliberate exception to the envelope
      // convention: the field's exact stored bytes ALONE. No `formatEnvelope` (it strips trailing
      // whitespace and appends its own newline) and no delta footer (it appends to `body`) — either
      // one would defeat piping the value to a file, which is the whole point of the read.
      process.stdout.write(env.raw);
      process.exitCode = 0;
    } else {
      // ADR-0200 D4: the cursor-once delta footer rides the render the agent already reads.
      process.stdout.write(formatEnvelope(await attachDeltaFooter(env, pullDeltas)));
      process.exitCode = env.ok ? 0 : 1;
    }
    await captureInvocation(argv, readArgv, env.ok, store, captureSessionId, offer?.visitId);
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
