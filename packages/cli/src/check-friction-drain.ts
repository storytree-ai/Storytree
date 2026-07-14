// The friction-drain ceiling gate (ADR-0168 D4), wired into `pnpm gate` — NOT into CI.
//
// ADR-0168's load-bearing lesson: a WARN-backed worklist with no drain OBLIGATION rots. So unlike its
// sibling advisory checks (`check:corpus-sync` / `check:corpus-content` / `check:agents-sync`, all
// WARN-only), this check is FAIL-CLOSED at a ceiling: past N open routable items or an item older than
// M days, it flips WARN → **red** (non-zero exit) and landing then requires a **board drain session** —
// a spawned adjudicator/librarian pass (D5) that drains the K oldest routable items before the gate
// goes green again. It gates QUEUE HYGIENE ONLY — no count or age here ever decides what GRADUATES
// (worth is undiluted adjudicator judgment; ADR-0032 §3/§5, reaffirmed by ADR-0168 D8).
//
// HONEST COST (ADR-0168 D4): this reads the LIVE friction worklist, so it runs only where the DB is
// reachable — local gates — and SKIPs in DB-free CI (like `check:agents-sync`). CI never enforces the
// ceiling; the standing **adjudicator duty**, not CI, is the primary drain. Reachability policy
// mirrors the sibling checks: no creds / DB unreachable → SKIP (exit 0, offline gate unaffected). The
// ONLY non-zero exit is a real ceiling breach against a successfully-read worklist — never an infra
// blip (fail-closed on the queue, fail-open on the substrate).

import { execFileSync } from "node:child_process";

import { createPool, closePool, PgLibraryStore } from "@storytree/library/store";

import {
  evaluateFrictionDrain,
  type FrictionWorklistItem,
  type FrictionDrainVerdict,
} from "./friction-drain.js";
import { loadLocalSecrets } from "./secrets.js";

const TAG = "[check:friction-drain]";
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

/** Project a stored friction doc down to the pure core's minimal shape — defensively, never throwing. */
function projectItem(stored: { id: string; doc: unknown }): FrictionWorklistItem {
  const rec =
    typeof stored.doc === "object" && stored.doc !== null
      ? (stored.doc as Record<string, unknown>)
      : {};
  const prov =
    typeof rec["provenance"] === "object" && rec["provenance"] !== null
      ? (rec["provenance"] as Record<string, unknown>)
      : {};
  return {
    id: stored.id,
    route: typeof rec["route"] === "string" ? (rec["route"] as string) : undefined,
    branch: typeof prov["branch"] === "string" ? (prov["branch"] as string) : undefined,
    date: typeof prov["date"] === "string" ? (prov["date"] as string) : undefined,
  };
}

/** The gate's own branch identifies the current session — its just-filed items are not yet routable. */
function currentBranch(): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function report(v: FrictionDrainVerdict): void {
  const tally = `${v.openCount} open (${v.routableCount} routable) · ${v.archivedCount} archived · ${v.total} total`;
  if (v.level === "ok") {
    console.log(`${TAG} OK — friction worklist within the drain ceiling: ${tally}.`);
    return;
  }
  if (v.level === "warn") {
    console.warn(`${TAG} WARN — friction backlog climbing toward the ceiling: ${tally}.`);
    for (const w of v.warnings) console.warn(`${TAG}   ${w}`);
    console.warn(
      `${TAG}   Drain the oldest ~${v.config.drainBatch} routable items in the pre-merge librarian pass (ADR-0168 D4).`,
    );
    return;
  }
  // red — fail-closed
  console.error(`${TAG} RED — friction drain ceiling breached: ${tally}.`);
  for (const b of v.breaches) console.error(`${TAG}   ${b}`);
  console.error(
    `${TAG}   Landing is blocked until a BOARD DRAIN SESSION runs (ADR-0168 D4/D5): spawn the`,
  );
  console.error(
    `${TAG}   graduation-synthesist (or librarian-curator) to adjudicate the oldest routable items —`,
  );
  console.error(
    `${TAG}   route/reinforce/archive them (\`storytree friction route …\`), clearing the backlog below N=${v.config.openCeiling} / M=${v.config.ageCeilingDays}d.`,
  );
  console.error(
    `${TAG}   (Queue hygiene only — this never decides what graduates. DB-local; CI does not enforce it.)`,
  );
}

async function main(): Promise<void> {
  // Match the CLI: hydrate STORYTREE_DB_USER from ~/.storytree/secrets.json when unset (env wins).
  loadLocalSecrets();

  if (process.env["STORYTREE_DB_USER"] === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); friction backlog unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  let items: FrictionWorklistItem[] | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);
    const docs = await withTimeout(
      pg.queryDocs({ kind: "friction" }),
      LIVE_READ_TIMEOUT_MS,
      "live read",
    );
    items = docs.map(projectItem);
  } catch (err) {
    // Infra failure (stopped DB, cold-start timeout, network) — SKIP, never red. The ceiling is
    // fail-closed on the QUEUE, fail-open on the SUBSTRATE.
    console.log(
      `${TAG} SKIP — live DB not reachable (${(err as Error).message}); drain unverified, offline gate unaffected.`,
    );
    return;
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }

  if (items === undefined) return; // unreachable; the catch returns on failure.

  const verdict = evaluateFrictionDrain(items, {
    currentBranch: currentBranch(),
    currentDate: new Date().toISOString().slice(0, 10),
  });
  report(verdict);
  // FAIL-CLOSED: only a genuine ceiling breach against a real read sets a non-zero exit.
  if (verdict.level === "red") process.exitCode = 1;
}

main().catch((err: unknown) => {
  // An unexpected error is advisory only — never fail the gate on an infra problem in this check.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); drain unverified.`);
});
