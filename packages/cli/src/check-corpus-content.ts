// LIVE↔SEED content-diff check (ADR-0120), wired into `pnpm gate` — NOT into CI.
//
// `check:corpus-sync` (ADR-0103) compares ID PRESENCE only — it does not look at BODIES, so a live
// artifact whose body has drifted from its seed copy — or a seed copy degraded relative to live —
// passes it clean. This compares the export-scope tier (structured,
// non-agent, non-template) BODY-for-body and WARNs on drift, classifying each:
//
//   - value-drift   → live is a valid current body that differs: a genuine edit. Resolve by direction —
//                     export live→seed (`storytree library export-corpus --pg --write`) if live is
//                     canonical, or re-edit on the live surface if the seed is.
//   - degraded-live → live is below the schema floor / invalid; the SEED is canonical. Restore it
//                     seed→live (`storytree library artifact edit <id> --file <seed> --pg`).
//
// FAIL-CLOSED AT A DRAIN CEILING (added by `verification-integrity-arc` under ADR-0252 D3, in
// ADR-0168 D4's shape). This was WARN-only, exit 0 at EVERY size — and a differential control over
// this binary with only its seed input varied found it printing a 122-item worklist and exiting 0 on
// the day the check itself landed, then wandering 18 → 14 → 16 → 14 over the following month with
// nothing ever failing. The ceiling, its two independent axes, the differential control behind them,
// and both baselines live in the pure `corpus-content-drain.ts`; this shell does the live read,
// prints, and sets the exit code. The OK/WARN lines are UNCHANGED — RED is layered above them, so this
// check is strictly stronger than before and never quieter.
//
// REACHABILITY IS UNCHANGED, and it is where fail-open lives: DB reachable + drift → WARN (or RED past
// a ceiling); clean → OK; no DB/creds → SKIP, exit 0. The ceiling adds no new way to fail on a
// substrate problem, because a deficient live store cannot manufacture a breach — it only deletes
// comparison candidates, making the counts a lower bound. It manufactures a false CLEAN instead, which
// is what `comparedLive` below exists to catch: measured on this checkout, an EMPTY live store made
// this check print `OK — every seed body matches live across 160 export-scope artifacts`.

import { createPool, closePool, PgLibraryStore, diffSeedCorpusContent } from "@storytree/library/store";

import {
  DEFAULT_CORPUS_CONTENT_DRAIN_CONFIG as CEILING,
  evaluateCorpusContentDrain,
} from "./corpus-content-drain.js";
import { loadLocalSecrets } from "./secrets.js";

const TAG = "[check:corpus-content]";
/** Bound the live read so a stopped DB can't hang the gate (matches check:corpus-sync). */
const LIVE_READ_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

async function main(): Promise<void> {
  loadLocalSecrets();

  if (process.env["STORYTREE_DB_USER"] === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); live↔seed content unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);
    const diff = await withTimeout(diffSeedCorpusContent(pg), LIVE_READ_TIMEOUT_MS, "live read");
    const degraded = diff.drifted.filter((d) => d.cls === "degraded-live");
    const value = diff.drifted.filter((d) => d.cls === "value-drift");

    if (diff.clean) {
      // Reports the population actually COMPARED, not the seed scope. Those diverge exactly when the
      // claim stops being true: a seed id with no live row is skipped, so an absent or truncated live
      // tier reaches this branch with nothing having been matched.
      console.log(
        `${TAG} OK — every seed body matches live across ${diff.comparedLive} export-scope artifacts` +
          (diff.comparedLive === diff.compared ? "." : ` (of ${diff.compared} in the seed).`),
      );
    } else {
      console.warn(
        `${TAG} WARN — ${diff.drifted.length} of ${diff.compared} export-scope artifacts differ between ` +
          "seed and live (body-level). Reconcile by direction (ADR-0120):",
      );
      if (value.length > 0) {
        console.warn(
          `${TAG}   value-drift [${value.length}] (genuine edits): ${value.map((d) => d.id).join(", ")}`,
        );
        console.warn(`${TAG}     → if live is canonical: pnpm storytree library export-corpus --pg --write`);
      }
      if (degraded.length > 0) {
        console.warn(
          `${TAG}   degraded-live [${degraded.length}] (seed canonical): ${degraded.map((d) => d.id).join(", ")}`,
        );
        console.warn(`${TAG}     → restore seed→live: storytree library artifact edit <id> --file <seed> --pg`);
      }
    }

    // ---- the drain ceiling (ADR-0168 D4's shape) ------------------------------------------------
    const drain = evaluateCorpusContentDrain(
      { valueDrift: value.map((d) => d.id), degradedLive: degraded.map((d) => d.id) },
      { compared: diff.compared, comparedLive: diff.comparedLive },
    );

    // A sweep that compared less than the whole seed scope is REPORTED, never read as a clean corpus.
    if (drain.unverified !== undefined) {
      console.warn(`${TAG}   (population not fully compared — ${drain.unverified}.)`);
    }

    if (drain.level !== "red") return;

    console.error(
      `${TAG} RED — corpus-content drain ceiling breached: ${drain.valueDriftCount} value-drift, ` +
        `${drain.degradedLiveCount} degraded-live.`,
    );
    for (const b of drain.breaches) console.error(`${TAG}   ${b}`);
    console.error(
      `${TAG}   Landing is blocked until the ADR-0120 reconciliation backlog is drained back below`,
    );
    console.error(
      `${TAG}   V=${CEILING.valueDriftCeiling} / D=${CEILING.degradedLiveCeiling}. For VALUE-DRIFT, resolve by direction: export live→seed with`,
    );
    console.error(
      `${TAG}   \`pnpm storytree library export-corpus --pg --write\` where live is canonical (it is`,
    );
    console.error(
      `${TAG}   ALL-OR-NOTHING across every drifted artifact — a librarian judgement, not a reflex), or`,
    );
    console.error(
      `${TAG}   re-edit on the live surface where the seed is. For DEGRADED-LIVE the seed is canonical by`,
    );
    console.error(
      `${TAG}   construction — restore it per artifact: \`storytree library artifact edit <id> --file <seed> --pg\`.`,
    );
    console.error(
      `${TAG}   (Accumulation only — this never decides WHICH side of a drift is canonical.)`,
    );
    // FAIL-CLOSED: only a genuine ceiling breach sets a non-zero exit. Every substrate path above
    // returns early or SKIPs, and both exit 0.
    process.exitCode = 1;
  } catch (err) {
    console.log(
      `${TAG} SKIP — live DB not reachable (${(err as Error).message}); content drift unverified, offline gate unaffected.`,
    );
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }
}

main().catch((err: unknown) => {
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); content drift unverified.`);
});
