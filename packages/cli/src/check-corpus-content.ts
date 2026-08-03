// LIVE↔SEED content-diff check (ADR-0120), wired into `pnpm gate` — NOT into CI.
//
// `check:corpus-sync` (ADR-0103) compares ID PRESENCE only — it does not look at BODIES, so a live
// artifact whose body has drifted from its seed copy — or a seed copy degraded relative to live —
// passes it clean. This compares the export-scope tier (structured, non-agent, non-template)
// BODY-for-body, CHARGES each difference to a party, and gates only on what this branch is answerable
// for:
//
//   - authored value-drift → live is a valid current body differing from seed, on an artifact THIS
//                     BRANCH edited (its seed entry, or the last live write). Resolve by direction —
//                     export live→seed (`export-corpus --id <id> --pg --write`) if live is canonical,
//                     or re-edit on the live surface if the seed is. GATED at zero.
//   - degraded-live → live is below the schema floor / invalid; the SEED is canonical. Restore it
//                     seed→live (`storytree library artifact edit <id> --file <seed> --pg`). GATED at
//                     zero for the WHOLE population — see `corpus-content-drain.ts` for why this is
//                     the one axis where a foreign red is affordable.
//   - authored live-only → an export-scope artifact THIS BRANCH created live that the seed does not
//                     carry. GATED at zero; the check was blind to this population before ADR-0290.
//   - stale / foreign → drift no signal attributes to this branch. REPORTED in full, with the writer
//                     and the remedy, and never charged.
//
// FAIL-CLOSED AT A DRAIN CEILING (added by `verification-integrity-arc` under ADR-0252 D3, in
// ADR-0168 D4's shape). This was WARN-only, exit 0 at EVERY size — and a differential control over
// this binary with only its seed input varied found it printing a 122-item worklist and exiting 0 on
// the day the check itself landed, then wandering 18 → 14 → 16 → 14 over the following month with
// nothing ever failing. The ceilings, their independent axes, the differential control behind them,
// and every baseline live in the pure `corpus-content-drain.ts`; the authorship reasoning lives in the
// pure `corpus-content-attribution.ts`; this shell does the live read, the git reads, the event read,
// prints, and sets the exit code.
//
// SCOPED BY AUTHORSHIP, NOT LOOSENED (ADR-0290). Measured on this binary, 2026-08-02, on a branch
// identical to `origin/main` with a clean working tree and no live writes: RED, exit 1, on three
// artifacts the session had not touched. The seed is one branch's working tree and the live store is
// shared by every concurrent session, so the check was joining a per-branch surface to a
// machine-shared one and charging the total to whoever ran the gate next. Six sessions filed that
// independently. Nothing prints more quietly now — every id named before is still named, with its
// writer and the reason it is or is not yours attached — and one population the check could never see
// (live-only artifacts this branch authored) is newly charged.
//
// REACHABILITY IS UNCHANGED, and it is where fail-open lives: DB reachable + drift → WARN (or RED past
// a ceiling); clean → OK; no DB/creds → SKIP, exit 0. The ceiling adds no new way to fail on a
// substrate problem, because a deficient live store cannot manufacture a breach — it only deletes
// comparison candidates, making the counts a lower bound. It manufactures a false CLEAN instead, which
// is what `comparedLive` below exists to catch: measured on this checkout, an EMPTY live store made
// this check print `OK — every seed body matches live across 160 export-scope artifacts`.
//
// ATTRIBUTION FAILS THE OTHER WAY — CLOSED, PER AXIS. If the git or event signals cannot be read, this
// falls back to the PRE-ADR-0290 behaviour of each axis rather than to a pass: every drifted id is
// charged as authored (as before), and live-only is charged to nobody (as before, when it was
// invisible). The reason is stated in `corpus-content-attribution.ts` — a wrongly-charged red costs a
// merge or a routed report, a wrongly-excused red lands a one-sided edit no later gate will catch.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import {
  closePool,
  createPool,
  diffCorpusContent,
  loadCorpus,
  PgLibraryStore,
} from "@storytree/library/store";

import { branchOfActor, currentGitBranch } from "./cli-actor.js";
import type { DriftAttributionEvidence } from "./corpus-content-attribution.js";
import { attributeDrift } from "./corpus-content-attribution.js";
import {
  DEFAULT_CORPUS_CONTENT_DRAIN_CONFIG as CEILING,
  evaluateCorpusContentDrain,
} from "./corpus-content-drain.js";
import { loadLocalSecrets, presentEnv } from "./secrets.js";
// The git seed reads are SHARED with `check:corpus-sync` so the two checks cannot come to disagree
// about what "behind main" means (`seed-revisions.ts`).
import {
  changedSeedIds,
  git,
  repoRoot as resolveSeedRepoRoot,
  seedEntriesAt,
  workingSeedEntries,
} from "./seed-revisions.js";

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

/** The repo the seed belongs to — a PARAMETER (ADR-0246), so a scratch-root control run still works. */
function repoRoot(): string {
  return resolveSeedRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
}

const list = (ids: readonly string[]): string => (ids.length > 0 ? ids.join(", ") : "(none)");

async function main(): Promise<void> {
  loadLocalSecrets();

  if (presentEnv("STORYTREE_DB_USER") === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); live↔seed content unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);

    // The seed side is loaded here rather than through `diffSeedCorpusContent` because attribution
    // needs to run the SAME comparator against a second seed revision (origin/main's), and the only
    // honest way to ask "would main's seed have drifted too" is to diff it the same way.
    const seedStore = new InMemoryStore();
    await loadCorpus(seedStore);
    const seed = await seedStore.queryDocs();
    const live = await withTimeout(pg.queryDocs(), LIVE_READ_TIMEOUT_MS, "live read");
    const diff = diffCorpusContent(seed, live);
    const degraded = diff.drifted.filter((d) => d.cls === "degraded-live");
    const value = diff.drifted.filter((d) => d.cls === "value-drift");

    // ---- attribution evidence (git + the event log) ---------------------------------------------
    const root = repoRoot();
    const branch = currentGitBranch(root);
    const mergeBase = git(root, ["merge-base", "origin/main", "HEAD"]);
    const working = workingSeedEntries(root);
    const baseSeed = mergeBase === null ? null : seedEntriesAt(root, mergeBase);

    let writers: Map<string, { actor: string; at: string }> | null = null;
    try {
      writers = await withTimeout(pg.latestWriters(), LIVE_READ_TIMEOUT_MS, "event read");
    } catch {
      writers = null;
    }

    // Both EXACT signals are required. Missing either would silently stop charging a whole direction —
    // a git-only signal cannot see a live edit (the ceremony's normal direction), and an event-only
    // signal cannot see a hand-edited seed — so the fallback is to charge, not to excuse.
    const unattributable =
      branch === null
        ? "git could not name the current branch (detached HEAD?)"
        : mergeBase === null || baseSeed === null || working === null
          ? "the merge-base seed could not be read (no `origin/main` ref, or an unreadable knowledge.json)"
          : writers === null
            ? "the live event log could not be read, so no live write can be attributed"
            : undefined;

    const evidence: DriftAttributionEvidence = {
      branch,
      seedChangedByBranch:
        baseSeed !== null && working !== null ? changedSeedIds(baseSeed, working) : new Set<string>(),
      liveWrittenByBranch:
        writers !== null && branch !== null
          ? new Set(
              [...writers.entries()]
                .filter(([, w]) => branchOfActor(w.actor) === branch)
                .map(([id]) => id),
            )
          : new Set<string>(),
      // Diagnostic only: ids that drift against MY seed but not against origin/main's, i.e. main has
      // already landed the reconciliation and this branch simply has not merged it. Its absence costs
      // a worse message (the drift reports as `foreign`) and never a wrong verdict, so an unfetched
      // `origin/main` is not part of the fail-closed predicate above.
      reconciledOnMain: (() => {
        const mainSeed = seedEntriesAt(root, "origin/main");
        if (mainSeed === null) return new Set<string>();
        const mainDocs = [...mainSeed.values()].map((e) => ({
          id: e.id,
          kind: e.kind,
          doc: e,
          createdAt: "",
          updatedAt: "",
        }));
        const againstMain = new Set(diffCorpusContent(mainDocs, live).drifted.map((d) => d.id));
        return new Set(diff.drifted.map((d) => d.id).filter((id) => !againstMain.has(id)));
      })(),
      ...(unattributable === undefined ? {} : { unattributable }),
    };

    const valueAttrib = attributeDrift(value.map((d) => d.id), evidence);
    // Live-only falls back the OTHER way: before ADR-0290 this population was charged to nobody
    // because it was invisible, so an unmeasurable attribution must leave it uncharged rather than
    // red every session on a backlog that predates the axis. Fail-closed means "no quieter than
    // before", and per axis that is a different list.
    const authoredLiveOnly =
      unattributable === undefined
        ? diff.liveOnly.filter((id) => evidence.liveWrittenByBranch.has(id))
        : [];
    const foreignLiveOnly = diff.liveOnly.filter((id) => !authoredLiveOnly.includes(id));

    // ---- report -----------------------------------------------------------------------------------
    if (diff.clean && diff.liveOnly.length === 0) {
      // Reports the population actually COMPARED, not the seed scope. Those diverge exactly when the
      // claim stops being true: a seed id with no live row is skipped, so an absent or truncated live
      // tier reaches this branch with nothing having been matched.
      console.log(
        `${TAG} OK — every seed body matches live across ${diff.comparedLive} export-scope artifacts` +
          (diff.comparedLive === diff.compared ? "." : ` (of ${diff.compared} in the seed).`),
      );
    } else if (diff.clean) {
      console.log(
        `${TAG} OK — every seed body matches live across ${diff.comparedLive} export-scope artifacts.`,
      );
    } else {
      console.warn(
        `${TAG} ${diff.drifted.length} of ${diff.compared} export-scope artifacts differ between seed ` +
          `and live (body-level), charged by authorship (ADR-0290):`,
      );
      if (valueAttrib.authored.length > 0) {
        console.warn(
          `${TAG}   YOURS — value-drift [${valueAttrib.authored.length}]: ` +
            valueAttrib.authored.map((d) => `${d.id} (${d.because})`).join(", "),
        );
        console.warn(
          `${TAG}     → if live is canonical: pnpm storytree library export-corpus ` +
            `${valueAttrib.authored.map((d) => `--id ${d.id}`).join(" ")} --pg --write`,
        );
        console.warn(`${TAG}     → if the SEED is canonical: storytree library artifact edit <id> --file <seed> --pg`);
      }
      if (valueAttrib.stale.length > 0) {
        console.warn(
          `${TAG}   BEHIND MAIN — not yours [${valueAttrib.stale.length}]: ` +
            valueAttrib.stale.map((d) => d.id).join(", "),
        );
        console.warn(
          `${TAG}     → origin/main's seed already carries these live bodies. Remedy: git merge origin/main.` +
            " Do NOT export — it would re-author a hunk already on main.",
        );
      }
      if (valueAttrib.foreign.length > 0) {
        console.warn(
          `${TAG}   ANOTHER WRITER — not yours [${valueAttrib.foreign.length}]: ` +
            valueAttrib.foreign
              .map((d) => {
                const w = writers?.get(d.id);
                return w === undefined ? d.id : `${d.id} (last written by ${w.actor} at ${w.at})`;
              })
              .join(", "),
        );
        console.warn(
          `${TAG}     → an unexported live edit from another branch or surface. Not yours to reconcile:` +
            " route it back, or leave it. Blind-exporting commits their body under your name.",
        );
      }
      if (degraded.length > 0) {
        console.warn(
          `${TAG}   DEGRADED-LIVE [${degraded.length}] (seed canonical, charged to everyone): ` +
            degraded.map((d) => d.id).join(", "),
        );
        console.warn(
          `${TAG}     → restore seed→live: storytree library artifact edit <id> --file <seed> --pg` +
            " (merge origin/main first — restoring from a stale seed writes a stale body live).",
        );
      }
    }

    // The live-only population, which the drift axes are structurally blind to and the unscoped export
    // writes anyway. Printed on EVERY path, including the clean one, because a green drift verdict has
    // never been evidence that a bare `--write` is a no-op.
    if (diff.liveOnly.length > 0) {
      console.warn(
        `${TAG}   LIVE-ONLY [${diff.liveOnly.length}] — in live, absent from the seed; no drift axis ` +
          "can see these, but a bare `export-corpus --write` APPENDS every one:",
      );
      if (authoredLiveOnly.length > 0) {
        console.warn(`${TAG}     YOURS [${authoredLiveOnly.length}]: ${list(authoredLiveOnly)}`);
        console.warn(
          `${TAG}       → carry it into the seed: pnpm storytree library export-corpus ` +
            `${authoredLiveOnly.map((id) => `--id ${id}`).join(" ")} --pg --write`,
        );
      }
      if (foreignLiveOnly.length > 0) {
        console.warn(`${TAG}     not yours [${foreignLiveOnly.length}]: ${list(foreignLiveOnly)}`);
        console.warn(
          `${TAG}       → two OPPOSITE causes, so do not blanket-export: a graduation that never` +
            " reached the seed (export it), or an artifact deliberately RETIRED live (drop the live",
        );
        console.warn(
          `${TAG}       row instead — a blind --write resurrects it into the committed seed). Settle it` +
            " on events.library_event, per process:library-edit-ceremony.",
        );
      }
    }

    if (unattributable !== undefined) {
      console.warn(
        `${TAG}   (ATTRIBUTION UNAVAILABLE — ${unattributable}. Falling back to the pre-ADR-0290` +
          " behaviour of each axis: every drift is charged to this branch, live-only to nobody.)",
      );
    }

    // ---- the drain ceilings (ADR-0168 D4's shape, ADR-0290's aperture) ---------------------------
    const drain = evaluateCorpusContentDrain(
      {
        authoredValueDrift: valueAttrib.authored.map((d) => d.id),
        degradedLive: degraded.map((d) => d.id),
        authoredLiveOnly,
      },
      {
        compared: diff.compared,
        comparedLive: diff.comparedLive,
        deferred: valueAttrib.stale.length + valueAttrib.foreign.length + foreignLiveOnly.length,
      },
    );

    // A sweep that compared less than the whole seed scope is REPORTED, never read as a clean corpus.
    if (drain.unverified !== undefined) {
      console.warn(`${TAG}   (population not fully compared — ${drain.unverified}.)`);
    }

    if (drain.level !== "red") return;

    console.error(
      `${TAG} RED — corpus-content drain ceiling breached: ${drain.authoredDriftCount} authored ` +
        `value-drift, ${drain.degradedLiveCount} degraded-live, ${drain.authoredLiveOnlyCount} authored live-only.`,
    );
    for (const b of drain.breaches) console.error(`${TAG}   ${b}`);
    console.error(
      `${TAG}   Landing is blocked until what THIS BRANCH authored is reconciled, back to`,
    );
    console.error(
      `${TAG}   A=${CEILING.authoredDriftCeiling} / D=${CEILING.degradedLiveCeiling} / L=${CEILING.authoredLiveOnlyCeiling}.` +
        " Only your own artifacts are charged (ADR-0290); anything",
    );
    console.error(
      `${TAG}   printed above as BEHIND MAIN or ANOTHER WRITER is reported and NOT part of this breach.`,
    );
    console.error(
      `${TAG}   The drain is now one artifact wide — \`export-corpus --id <id> --pg --write\` writes only`,
    );
    console.error(
      `${TAG}   the ids you name, so it carries no sibling's body and appends no live-only artifact.`,
    );
    console.error(
      `${TAG}   Direction is still yours to call and is NOT inferable: \`sync-corpus\` is migrate-only, so`,
    );
    console.error(
      `${TAG}   a seed edit can never reach live and the SEED can be the newer side. A bare (unscoped)`,
    );
    console.error(
      `${TAG}   \`export-corpus --write\` still sweeps everything — dry-run it first if you use that form.`,
    );
    console.error(
      `${TAG}   For DEGRADED-LIVE the seed is canonical by construction — restore it per artifact:`,
    );
    console.error(
      `${TAG}   \`storytree library artifact edit <id> --file <seed> --pg\`.`,
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
