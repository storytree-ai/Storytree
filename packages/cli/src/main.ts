#!/usr/bin/env -S tsx
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { HttpStore, type Store } from "@storytree/storage-protocol";
import {
  createPool,
  closePool,
  PgLibraryStore,
  PgAdrStore,
} from "@storytree/library/store";
import {
  captureCliInvocation,
  resolveAgentDescent,
  resolveTraceIdentity,
} from "@storytree/context-traversal-capture";
import type {
  CaptureCliInvocationInput,
  TraceIdentity,
} from "@storytree/context-traversal-capture";
import { digestOverlapDeltas, type OverlapDelta } from "@storytree/notice-board";
import { PgClaimStore } from "@storytree/notice-board/store";
import { PgWorkStore, PgAttestationStore } from "@storytree/orchestrator/store";
import { PgUserStore } from "@storytree/studio-members/store";

import type { AdrAllocatorLike } from "./adr.js";
import type { AttestationStoreLike } from "./attest.js";
import { isRawEnvelope, run } from "./commands.js";
import type { RunDeps } from "./commands.js";
import { formatEnvelope, withDeltaFooter, type Envelope } from "./envelope.js";
import {
  createClaimUniverseLoader,
  deregisterSpawn,
  deriveIdentity,
  openCorpusStore,
  registerSpawn,
  repoRoot,
  resolveStoreDoor,
} from "@storytree/drive";
import type { OpenCorpusStore } from "@storytree/drive";
import type { ClaimLedgerStoreLike, SessionClaimStoreLike } from "@storytree/drive";
import { loadLocalSecrets } from "./secrets.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";
import type { MemberStoreLike } from "./members.js";
import type { WorkLogReaderLike } from "./work-log.js";
import type { UatVerdictStoreLike } from "./uat.js";

/**
 * The `storytree` CLI entry (ADR-0023). ONLINE-ONLY since ADR-0302 D1/D2: every store below is the
 * live corpus, because there is no longer a second one. The dispatch lives in `run`; this file only
 * wires the store and prints the envelope.
 *
 * THREE store shapes, one source, in this precedence:
 *   `--pg`                       → the Cloud SQL connector WITH the write seams (claims, verdicts,
 *                                  attestations, the ADR allocator). The only writing branch.
 *   `STORYTREE_STORE_URL` set    → the ADR-0259 store door over ordinary HTTPS — the read path for a
 *                                  client that cannot open a Cloud SQL connector at all, which is
 *                                  every remote session (ADR-0258 D2). Read-only by the door's own
 *                                  decision (ADR-0259 D5).
 *   neither                      → the same live store, read-only, opened LAZILY on first use, so a
 *                                  command that reads no corpus (`adr list`, `doctor`, the help
 *                                  surfaces) never dials the connector at all.
 *
 * What used to sit in that third slot was an `InMemoryStore` seeded from the committed corpus. That
 * seed is deleted; the hermetic suites read `@storytree/library/fixture` instead, and nothing in a
 * PRODUCTION path reads a file corpus any more.
 */
async function buildStore(usePg: boolean): Promise<{
  store: Store;
  claims: SessionClaimStoreLike | null;
  ledger: ClaimLedgerStoreLike | null;
  verdicts: VerdictReaderLike | null;
  /** The row-level work-event read (`node log`, ADR-0350 D3); null off --pg. */
  workLog: WorkLogReaderLike | null;
  uatStore: UatVerdictStoreLike | null;
  attestations: AttestationStoreLike | null;
  /** The studio member directory (ADR-0043) — `storytree members`; null off --pg (no door, no offline form). */
  members: MemberStoreLike | null;
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
      // The SAME PgWorkStore under a wider seam: `node log` renders whole rows (actor, at, and the
      // optional causal edge), which the glyph-shaped VerdictReaderLike does not carry.
      workLog: work,
      // The per-test UAT write surface (ADR-0082): `uat attest` appends a signed operator-attested
      // verdict to events.verdict through the same work store; offline `uat attest` refuses.
      uatStore: work,
      // The attestation log (ADR-0044): `storytree attest` records/reads events.attestation
      // through the same pool; offline `attest` refuses (writes/reads both need --pg).
      attestations: new PgAttestationStore(pool),
      // The studio member DIRECTORY (ADR-0043): `storytree members` writes through the SAME
      // PgUserStore the studio's /api/users handler uses, so the last-admin guard and the audit
      // append apply identically rather than being re-implemented beside them.
      members: new PgUserStore(pool),
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
      workLog: null,
      uatStore: null,
      attestations: null,
      members: null,
      adr: null,
      pullDeltas: null,
      close: async () => {},
    };
  }
  // NO FLAG, NO DOOR — the live store, read-only, and opened LAZILY. The committed seed that used
  // to answer here is GONE (ADR-0302 D1), and the two shapes it could have been replaced by are
  // both wrong: an EMPTY in-memory store would report `no artifact "x"` for artifacts that plainly
  // exist — the exact fail-open ADR-0259's door rule was written against — and a refusal telling
  // the reader to add `--pg` would be a papercut on the most-used verb in the CLI for a flag that,
  // with one corpus left, carries no information about WHERE to read.
  //
  // LAZY IS NOT AN OPTIMISATION, IT IS THE CORRECTNESS CONDITION. `buildStore` runs before dispatch,
  // for EVERY command — including the many that never touch the corpus (`adr list`, `doctor`,
  // `noticeboard`, the help surfaces). Opening the connector eagerly would put a ~7 s Cloud SQL
  // handshake, and a hard dependency on the database, in front of commands that read nothing but
  // disk. It would also make `pnpm -r test` non-hermetic wherever a suite spawns the real binary,
  // which ADR-0302 D3 deliberately prevents. So the pool opens on the FIRST store call and not
  // before, and a command that makes none never dials at all.
  //
  // `--pg` keeps the meaning it always had for WRITES: it is the branch above, the only one that
  // returns the claim / verdict / attestation / ADR-allocator seams. Those stay null here, so
  // `library artifact edit` (and every other write) refuses with its existing "needs --pg" message
  // rather than acquiring write power by accident.
  //
  // Unreachable is a LOUD, named failure carrying the remedy — never a degraded success.
  let opened: OpenCorpusStore | null = null;
  const open = async (): Promise<Store> => {
    opened ??= await openCorpusStore("storytree");
    return opened.store;
  };
  return {
    store: lazyStore(open),
    claims: null,
    ledger: null,
    verdicts: null,
    workLog: null,
    uatStore: null,
    attestations: null,
    members: null,
    adr: null,
    pullDeltas: null,
    close: async () => {
      if (opened !== null) await opened.close();
    },
  };
}

/**
 * A {@link Store} that opens its backing store on the first call and not before.
 *
 * Every method just forwards, so this adds no behaviour of its own — including errors: an
 * unreachable store throws `openCorpusStore`'s full remedy message out of whichever call first
 * needed it, which is the command that actually wanted the corpus rather than the process start.
 */
function lazyStore(open: () => Promise<Store>): Store {
  return {
    upsertDoc: async (input) => (await open()).upsertDoc(input),
    patchDoc: async (input) => (await open()).patchDoc(input),
    getDoc: async (id) => (await open()).getDoc(id),
    queryDocs: async (filter) => (await open()).queryDocs(filter),
    deleteDoc: async (id, opts) => (await open()).deleteDoc(id, opts),
    appendEvent: async (e) => (await open()).appendEvent(e),
    readEvents: async (filter) => (await open()).readEvents(filter),
  };
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
 * Identity resolves in {@link resolveInvocationIdentities} and is passed in. A null identity
 * captures nothing — silently, since an uninstrumented run is a normal outcome, not an error. It
 * resolves in `main` rather than here because the offer-id plan (ADR-0260 D3) needs the same answer
 * BEFORE the render; it is still exactly ONE derivation per invocation.
 */
interface InvocationIdentities {
  /**
   * The WORKTREE identity — the spawn registry's key and the delta footer's session (`storytree
   * own`, ADR-0200 D4). Slot-grained on purpose: those two ask "which worktree is running this?",
   * which is exactly what a slot answers.
   */
  readonly registry: { sessionId: string; branch: string } | null;
  /**
   * The TRACE identity — one context WINDOW, or null to capture nothing
   * (`linked-session-context-arc-inc-30`). Deliberately NOT the registry identity above: a slot is
   * pooled across the parent session, its subagents, and every later session handed the same slot,
   * so keying a trace by it reports many windows' reads as one session's.
   */
  readonly trace: TraceIdentity | null;
}

/**
 * Resolve BOTH identities from ONE `deriveIdentity()` call.
 *
 * One call is a budget constraint, not tidiness: `deriveIdentity()` shells out to git, `main` runs
 * on every invocation including the gate's own internal calls, and ADR-0162's startup budget is
 * what that pays for. Deriving once and deriving twice would be indistinguishable in behaviour and
 * measurably different in cost.
 */
function resolveInvocationIdentities(): InvocationIdentities {
  try {
    const derived = deriveIdentity();
    const override = process.env["STORYTREE_SESSION_ID"];
    const registry =
      override !== undefined && override.trim().length > 0
        ? { sessionId: override, branch: derived?.branch ?? "" }
        : derived === null
          ? null
          : { sessionId: derived.sessionId, branch: derived.branch };
    return {
      registry,
      trace: resolveTraceIdentity({ env: process.env, slot: derived?.sessionId ?? null }),
    };
  } catch {
    return { registry: null, trace: null };
  }
}

/**
 * Register this invocation in the spawn registry, and hand back the de-registration
 * (`shared-box-session-ownership-arc` inc 1).
 *
 * WHY EVERY INVOCATION AND NOT JUST THE LONG ONES. The registry has to be able to answer "what am I
 * still running?" for the command that HUNG, and which command that will be is not knowable when it
 * starts. A `library artifact edit --pg` is the cheap one that hangs — measured on this box — and it
 * is also the one whose late commit silently reverts a field another session already corrected. So
 * the registration is unconditional and the cost is kept to what it must be: one `mkdir -p` and one
 * small `writeFileSync` at start, one `unlink` at exit, and NO extra `git` call — the identity is the
 * one `main` already derived for capture (ADR-0162's startup budget).
 *
 * FAIL-SILENT and ADDITIVE, like the delta footer and the traversal capture beside it: a `null`
 * identity (the primary checkout, CI) registers nothing, and a registry write that throws leaves the
 * command untouched and simply uninventoried — the state every run was in before this existed.
 */
function registerThisInvocation(
  argv: readonly string[],
  identity: { sessionId: string; branch: string } | null,
): () => void {
  if (identity === null) return () => {};
  try {
    const filePath = registerSpawn({
      sessionId: identity.sessionId,
      branch: identity.branch,
      pid: process.pid,
      command: `storytree ${argv.join(" ")}`,
      cwd: process.cwd(),
      startedAt: new Date().toISOString(),
    });
    if (filePath === null) return () => {};
    return () => {
      deregisterSpawn(filePath);
    };
  } catch {
    return () => {};
  }
}

async function captureInvocation(
  argv: readonly string[],
  ok: boolean,
  store: Store,
  trace: TraceIdentity | null,
  observedResultIds: readonly string[] | undefined,
): Promise<void> {
  try {
    // An `agents <name>` essentials render resolves the agent's floor refs BY EXPLICIT ID, so each
    // one is a genuine within-process descent (ADR-0235 clause 2). Resolving needs an async store
    // read, and `captureCliInvocation` is contractually synchronous — so it happens here, inside the
    // existing try/catch and before `close()`. Every other dispatch shape resolves to [].
    //
    // Resolved against this invocation's argv exactly as the shell handed it over. Until ADR-0464 D1
    // there was a second, PRE-STRIPPED argv here, because a read answering an offer carried a
    // `--from-offer` flag the observer's allowlist would have refused. With no flag to carry there is
    // one argv again, and the two-argv seam that existed only to serve it is gone.
    const agentRefIds = await resolveAgentDescent(argv, store);
    // Each optional field is added only when it is present — `CaptureCliInvocationInput`'s
    // properties are readonly, so every addition is a fresh literal rather than an assignment.
    let capture: CaptureCliInvocationInput = {
      argv,
      ok,
      sessionId: trace?.sessionId ?? null,
      agentRefIds,
      // What a SEARCH-shaped read returned (ADR-0484 D3). The command computed it; the observer is
      // pure and could only get it by running the ranking a second time. Passed through as-is,
      // `undefined` included — the absent-vs-empty decision belongs where every other capture
      // attribute makes it, in the composition that writes the line.
      resultNodeIds: observedResultIds,
    };
    // Stamped on every line this invocation writes: what the session id NAMES, and the worktree
    // slot it ran in as a grouping attribute beside it — so a later reader states the trace's
    // identity grade rather than inferring it from the id's shape.
    if (trace !== null) capture = { ...capture, grade: trace.grade, slot: trace.slot };
    captureCliInvocation(capture);
  } catch {
    // Telemetry never breaks a command — the envelope is the payload, and a trace that could not be
    // written must not reach the caller's control flow, exit code, or envelope (ADR-0241 D3).
    // "A courtesy" is withdrawn as too weak (ADR-0484 D4): what stands is that it never BLOCKS.
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
  // ADR-0464 D1 REMOVED A WHOLE PRE-RENDER STEP HERE, and it is worth saying what it was, because the
  // shape it created is the kind that grows back. ADR-0260 D3 made the offer's identity travel in
  // ARGV, so the render had to know a visit id BEFORE it printed: an id was pre-minted here and handed
  // to both halves — `run` printed follow-up commands carrying `candidate-set:<visitId>`, and
  // `captureCliInvocation` recorded the offer under that very id. Nothing prints an offer now, so
  // there is no id to agree about, no pre-mint, and no `--from-offer` to strip out of argv before the
  // observer's allowlist sees it.
  //
  // What that leaves is simply the identity resolution the rest of the entry point already needed.
  // ADR-0241 **D2**'s opt-out-clean envelope is unaffected and in fact easier to hold: with nothing
  // printed conditionally on capture being enabled, an opted-out run's envelope is byte-identical to a
  // captured one for free, rather than by two call sites agreeing to stay silent together.
  const { registry: identity, trace } = resolveInvocationIdentities();
  // `shared-box-session-ownership-arc` inc 1 — this invocation becomes visible to `storytree own`
  // for as long as it runs. Registered BEFORE the store is built, because a `--pg` command that
  // hangs on the connector handshake is precisely the one a session needs to be able to find.
  const deregister = registerThisInvocation(argv, identity);
  const usePg = argv.includes("--pg");
  const { store, claims, ledger, verdicts, workLog, uatStore, attestations, members, adr, pullDeltas, close } =
    await buildStore(usePg);
  try {
    // Writes only persist against the live --pg store; the offline copy is read-only-by-convention.
    const actor = process.env["STORYTREE_ACTOR"];
    // `RunDeps`' optional fields are readonly, so each one that is present is added by rebuilding
    // the bag rather than by assigning into it. Absent stays ABSENT — never `undefined`.
    let deps: RunDeps = {
      store,
      writable: usePg,
      presence: { claims, ledger },
      verdicts,
      workLog,
      uatStore,
      attestations,
      members,
      adr,
    };
    // The claim NAMESPACE (ADR-0310 D2) — supplied HERE and only here, because this is the one
    // place that knows the store is the live corpus rather than a test double. A memoised loader,
    // invoked lazily by the claim-taking verbs alone, so a command that takes no claim never
    // reads it; and only under --pg, since every one of those verbs already refuses without it.
    if (usePg) {
      deps = {
        ...deps,
        claimUniverse: createClaimUniverseLoader({
          storiesDir: path.join(repoRoot(), "stories"),
          library: store,
          // The declared subtree map (ADR-0317 D2/D3) — the third source. Unreadable here means
          // the whole check stands down, never that a subtree claim starts being refused.
          manifestPath: path.join(repoRoot(), "repo-manifest.json"),
        }),
      };
    }
    if (actor !== undefined) deps = { ...deps, actor };
    const env = await run(argv, deps);
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
      // `ok` maps to 0/1 for every command whose exit code is its OWN. `exitCode` is the narrow
      // exception for a command REPORTING ANOTHER PROCESS'S status (`dispatch --wait`), where
      // collapsing to 0/1 would destroy the gate's reserved 3 (SKIP) and 4 (PARTIAL RUN).
      process.exitCode = env.exitCode ?? (env.ok ? 0 : 1);
    }
    await captureInvocation(argv, env.ok, store, trace, env.observedResultIds);
  } finally {
    await close();
    // LAST, and outside every other concern: the record must survive until the command genuinely
    // stops doing work. `close()` above is the pool teardown that has itself been observed to hang
    // after a `--pg` write commits — the exact shape a session needs `storytree own` to show it.
    deregister();
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
