// Best-effort LIVE non-agent corpus drift check (ADR-0103), wired into `pnpm gate` — NOT into CI.
//
// The non-agent tier (principle / definition / pattern / guardrail / techstack / process /
// open-question / proposal / template) is LIVE-canonical (ADR-0023), but the ADR-0095 graduation flow
// writes a freshly-derived artifact into the SEED (knowledge.json), where the offline agent renderer
// reads it. That leaves it seed-only: invisible to `--pg` and the studio, and rendered as a
// `> MISSING REF` by any agent that cites it against the LIVE store. This WARNs when a seed non-agent
// artifact is missing from the live store, so the drift is visible before a push:
//
//   - DB reachable + a seed artifact missing -> WARN naming the fix (`storytree library sync-corpus --pg`).
//   - DB reachable + every seed artifact present -> OK.
//   - DB not reachable / no creds (stopped, fresh worktree, web container) -> SKIP.
//
// It is DELIBERATELY one-directional: it does NOT flag live artifacts absent from the seed (those are
// expected live-canonical creations) or content drift (the seed is a lagging export) — only the
// migration gap. EPHEMERAL kinds (`plan`, ADR-0183 D2) are out of scope entirely (live-only by
// design, so never a gap). It is read-only (no writes), and lives in `pnpm gate` rather than CI
// because CI's verify job is deliberately DB-free.
//
// IT IS NO LONGER UNCONDITIONALLY EXIT-0. Since 2026-07-28 the migration-gap worklist is held to a
// DRAIN CEILING (ADR-0252 D3, `verification-integrity-arc`) — see `sync-drain.ts` for the differential
// control that measured this list reaching SIX items while exiting 0, five of which are still absent
// from the live store today because they left the seed instead of draining through the command below.
// The ceiling is ZERO, so any seed-only artifact now FAILS the local gate; the remedy is the
// migrate-only sync the WARN already names, never a raise. The FAIL-OPEN paths are unchanged and still
// exit 0: no creds, an unreachable store, or an unreadable seed.
//
// IT CLASSIFIES THE ABSENCE BEFORE IT PRESCRIBES A REMEDY. This printed ONE unconditional instruction
// for every seed-only id — "DRAIN it — `sync-corpus --pg`" — while being blind to both of the signals
// ADR-0290 gave its sibling `check:corpus-content` (measured 2026-08-03: `grep -c
// "origin/main\|merge-base\|library_event"` returned ZERO here and in `sync-drain.ts`). On a branch
// cut before an owner-directed live RETIREMENT, obeying that instruction RESURRECTS the retired
// artifact — `oq-diff-view-altitude` oscillated four times in `events.library_event` before a
// librarian pass caught it. The cause is now measured and the remedy matches it (NEVER MIGRATED /
// RETIRED LIVE / BEHIND MAIN); the reasoning, the precedence and the fail-closed posture live in the
// pure `corpus-content-attribution.ts`, and the git reads are shared with corpus-content via
// `seed-revisions.ts`.
//
// NO CEILING MOVED. M=0 still stands (ADR-0252 D3) and no tunable was added. What narrowed is the
// APERTURE — only a genuine migration gap is charged — on ADR-0269 4(f)/ADR-0290's reasoning that the
// population was not enlarged but WRONG.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPool, closePool, PgLibraryStore, loadCorpus, diffCorpus } from "@storytree/library/store";
import { InMemoryStore } from "@storytree/storage-protocol";

import { currentGitBranch } from "./cli-actor.js";
import type { AbsenceEvidence } from "./corpus-content-attribution.js";
import { classifyAbsence } from "./corpus-content-attribution.js";
import { loadLocalSecrets, presentEnv } from "./secrets.js";
import {
  git,
  repoRoot as resolveSeedRepoRoot,
  seedEntriesAt,
  seedIdsAddedBetween,
  workingSeedEntries,
} from "./seed-revisions.js";
import { evaluateCorpusSyncDrain } from "./sync-drain.js";

const TAG = "[check:corpus-sync]";
/** Bound the live read so a stopped DB can't hang the gate. > the ~6s Cloud SQL cold-handshake so a
 *  warm-but-cold instance isn't mistaken for unreachable. */
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

/**
 * Gather the three signals and classify every seed-only id — the IO half of the absence pass.
 *
 * The event read is PER ABSENT ID rather than a whole-log sweep: the migration gap is normally EMPTY
 * (measured 2026-08-03: zero) and at worst a handful, while `readEvents()` unfiltered returns every
 * event ever written with its full doc body — thousands of rows to answer a question about, usually,
 * none. It also needs no new store method: `readEvents({ id })` is already on the narrow `Store` port.
 *
 * Fails CLOSED per ADR-0290 D7 — an unreadable signal charges everything rather than excusing it.
 */
async function classifyAbsences(absentIds: readonly string[], pg: PgLibraryStore) {
  // The common case by a wide margin is an EMPTY gap (measured 2026-08-03: zero), and there is nothing
  // to classify then — so no git subprocesses and no `git show origin/main:knowledge.json` over a 1.1 MB
  // seed on every clean gate run.
  if (absentIds.length === 0) {
    return { neverMigrated: [], retiredLive: [], behindMain: [], mainSeedUnread: false };
  }
  const root = resolveSeedRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  const branch = currentGitBranch(root);
  const mergeBase = git(root, ["merge-base", "origin/main", "HEAD"]);
  const working = workingSeedEntries(root);
  const baseSeed = mergeBase === null ? null : seedEntriesAt(root, mergeBase);
  const mainSeed = seedEntriesAt(root, "origin/main");

  // The event signal, bounded to the ids actually in question.
  let retiredLive: Map<string, { actor: string; at: string }> | null = new Map();
  for (const id of absentIds) {
    try {
      const events = await withTimeout(pg.readEvents({ id }), LIVE_READ_TIMEOUT_MS, "event read");
      const last = events.at(-1);
      // LATEST event, not ever-deleted: a retired-then-refiled artifact is live again, so its absence
      // from live would mean something else entirely.
      if (last?.type === "deleted") retiredLive?.set(id, { actor: last.actor, at: last.at });
    } catch {
      retiredLive = null;
      break;
    }
  }

  const unattributable =
    branch === null
      ? "git could not name the current branch (detached HEAD?)"
      : mergeBase === null || baseSeed === null || working === null
        ? "the merge-base seed could not be read (no `origin/main` ref, or an unreadable knowledge.json)"
        : retiredLive === null
          ? "the live event log could not be read, so no retirement can be seen"
          : undefined;

  const evidence: AbsenceEvidence = {
    branch,
    seedAddedByBranch:
      baseSeed !== null && working !== null ? seedIdsAddedBetween(baseSeed, working) : new Set<string>(),
    retiredLive: retiredLive ?? new Map(),
    absentFromMainSeed:
      mainSeed === null ? new Set<string>() : new Set(absentIds.filter((id) => !mainSeed.has(id))),
    ...(unattributable === undefined ? {} : { unattributable }),
  };
  return {
    ...classifyAbsence(absentIds, evidence),
    // An unread `origin/main` seed is DIAGNOSTIC, never part of the fail-closed predicate above, and
    // the distinction matters: an unfetched ref is ordinary (nothing fetches for you before the local
    // gate), so folding it in would silently switch OFF the retirement protection — the whole point of
    // this pass — for every session that had not fetched. Without it a BEHIND MAIN absence simply
    // falls through to NEVER MIGRATED, i.e. charged, i.e. exactly today's behaviour; the safe
    // direction. Retirements are still seen, because that signal is the event log, not git.
    mainSeedUnread: mainSeed === null,
  };
}

async function main(): Promise<void> {
  // Match the CLI: hydrate STORYTREE_DB_USER from ~/.storytree/secrets.json when unset (env wins).
  loadLocalSecrets();

  if (presentEnv("STORYTREE_DB_USER") === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); live corpus tier unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);
    // The seed is loaded EXPLICITLY rather than through `diffSeedCorpus` so the unit count the seed
    // FILE contributed is observable. It is not derivable from the diff: `libraryTemplates()` adds 13
    // code-derived `template` artifacts no seed file can remove, so an EMPTY seed still reports a
    // plausible non-zero population (measured — `sync-drain.ts`). Everything else is unchanged; this
    // is exactly what `diffSeedCorpus` does internally. Bound the whole thing so a stopped instance
    // can't hang the gate.
    const { diff, seedUnitsRead } = await withTimeout(
      (async () => {
        const seed = new InMemoryStore();
        const counts = await loadCorpus(seed);
        return { diff: await diffCorpus(seed, pg), seedUnitsRead: counts.knowledge };
      })(),
      LIVE_READ_TIMEOUT_MS,
      "live read",
    );
    // ---- why each absence is an absence (the two signals ADR-0290 gave corpus-content) -----------
    const absence = await classifyAbsences(diff.missing, pg);

    // The drain ceiling (ADR-0252 D3). Evaluated BEFORE the headline is chosen, because a withheld
    // verdict must not print under an `OK —` line: the substrate case measured here (an empty seed
    // still comparing 13 `libraryTemplates()` artifacts) would otherwise state `OK` and then deny it
    // one line later, which is prose its own verdict contradicts.
    //
    // ONLY the never-migrated list is charged. The other two causes are reported in full below with
    // their own remedy and never counted — draining them is the harm, not the fix.
    const deferred = absence.retiredLive.length + absence.behindMain.length;
    const verdict = evaluateCorpusSyncDrain(
      { missing: absence.neverMigrated.map((a) => a.id), seedScope: diff.seed.length },
      { seedUnitsRead, deferred },
    );

    if (diff.complete && verdict.unverified === undefined) {
      console.log(`${TAG} OK — the live store holds every seed non-agent artifact (${diff.seed.length}).`);
    } else if (diff.complete) {
      console.warn(
        `${TAG} WARN — no seed artifact is missing from the live store, but this run is NOT evidence ` +
          `of a reconciled corpus: ${verdict.unverified}.`,
      );
    } else {
      console.warn(
        `${TAG} WARN — ${diff.missing.length} seed non-agent artifact(s) of ${diff.seed.length} are ` +
          "absent from the live store, classified by CAUSE (each cause has its own remedy):",
      );
      if (absence.neverMigrated.length > 0) {
        console.warn(
          `${TAG}   NEVER MIGRATED [${absence.neverMigrated.length}]: ` +
            absence.neverMigrated.map((a) => `${a.id} (${a.because})`).join(", "),
        );
        console.warn(
          `${TAG}     → DRAIN it: pnpm storytree library sync-corpus --pg  (\`--pg\`/studio + any agent` +
            " citing them are affected; offline rendering is not).",
        );
      }
      if (absence.retiredLive.length > 0) {
        console.warn(
          `${TAG}   RETIRED LIVE [${absence.retiredLive.length}] — deliberately deleted, NOT a gap: ` +
            absence.retiredLive.map((a) => `${a.id} (${a.because})`).join(", "),
        );
        console.warn(
          `${TAG}     → do NOT run sync-corpus: it would RESURRECT an artifact an owner retired.` +
            " `oq-diff-view-altitude` oscillated four times in events.library_event this way.",
        );
        console.warn(
          `${TAG}     → the seed row is the half that has not landed: drop it, per` +
            " process:retire-realized-proposal / process:library-edit-ceremony.",
        );
      }
      if (absence.behindMain.length > 0) {
        console.warn(
          `${TAG}   BEHIND MAIN [${absence.behindMain.length}] — not yours: ` +
            absence.behindMain.map((a) => a.id).join(", "),
        );
        console.warn(
          `${TAG}     → origin/main's seed has already dropped these rows. Remedy: git merge origin/main.` +
            " Do NOT sync-corpus — on a stale base it re-authors a row main deliberately dropped.",
        );
      }
      if (absence.unattributable !== undefined) {
        console.warn(
          `${TAG}   (CAUSE UNAVAILABLE — ${absence.unattributable}. Falling back to the pre-classification` +
            " behaviour: every absence is charged and prescribed the drain.)",
        );
      } else if (absence.mainSeedUnread) {
        console.warn(
          `${TAG}   (origin/main's seed could not be read — \`git fetch origin\` for a BEHIND MAIN verdict.` +
            " Staleness is charged as a gap until then; retirements are unaffected.)",
        );
      }
      if (verdict.unverified !== undefined) console.warn(`${TAG}   note: ${verdict.unverified}`);
    }

    // The breach is layered ABOVE the WARN, never in place of it — the advisory lines above still
    // print in full, and this states outright that the gate now fails, so a reader never has to
    // reconcile an advisory tone with a non-zero exit.
    if (verdict.breaches.length > 0) {
      console.error(`${TAG} RED — the migration-gap ceiling is breached, and this FAILS the gate (ADR-0252 D3, \`sync-drain.ts\`):`);
      for (const breach of verdict.breaches) console.error(`${TAG}   · ${breach}`);
      console.error(`${TAG}   DRAIN it — \`pnpm storytree library sync-corpus --pg\`. Never raise the ceiling.`);
      console.error(
        `${TAG}   Only NEVER MIGRATED is charged; anything printed above as RETIRED LIVE or BEHIND MAIN` +
          " is reported and is NOT part of this breach.",
      );
      process.exitCode = 1;
    }
  } catch (err) {
    console.log(
      `${TAG} SKIP — could not compare the tiers (${(err as Error).message}); drift unverified, ` +
        "offline gate unaffected.",
    );
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }
}

main().catch((err: unknown) => {
  // Even an unexpected error fails OPEN — a check that cannot run has observed no gap, and redding on
  // its own failure would make the ceiling unclearable by the drain it names.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); drift unverified.`);
});
