import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTitledAdrMetasFromStore } from "@storytree/drive";
import { REPO_ROOT_ENV, resolveRepoRoot } from "@storytree/library";
import { closePool, createPool, PgLibraryStore } from "@storytree/library/store";

import {
  adrGateFailures,
  adrHealth,
  loadStoryDecisions,
  type GuardrailView,
} from "./adr-health.js";

// The repo root is a PARAMETER (ADR-0246) — `STORYTREE_REPO_ROOT` points this at another checkout;
// unset, the module-location derivation (three dirs up from `packages/cli/src/`) applies. Only the
// STORY tier is read from disk here; the decisions come from the store.
const repoRoot = (): string =>
  resolveRepoRoot({
    env: process.env[REPO_ROOT_ENV],
    derived: fileURLToPath(new URL("../../../", import.meta.url)),
  }).root;

/**
 * `check:adr-health` — the decision-binding gate, run against the LIVE STORE.
 *
 * `decision-log-home-arc` increment 07. This rung is not new work: it is where the check MOVED to.
 * `adrHealth` was fired against the real `docs/decisions` tree by a case inside `adr-health.test.ts`,
 * and `pnpm -r test` is deliberately credential-free (ADR-0302 D3 keeps `STORYTREE_DB_USER` out of
 * it), so the moment the decision log became a database the check could not stay there — a suite
 * that dialled the store would stop being hermetic, and a DB outage would surface as a unit-test
 * failure. ADR-0307 D4 draws the line this lands on: assertions about the REAL corpus belong on a
 * `check:*` rung, which may hold a connection.
 *
 * WHAT DID NOT MOVE: the pure core and every unit test over it. `adrHealth` takes injected views and
 * returns `CheckResult[]`; the suite still proves each rung's logic against literals with no store
 * and no filesystem. Only the real-corpus case is here.
 *
 * ## AN UNREADABLE STORE IS A FAILURE, NEVER A PASS
 *
 * The most dangerous shape for a check whose subject just moved behind a network call is the one
 * that treats "I could not look" as "nothing wrong". This one exits non-zero when the store cannot
 * be read, and says which of the two it hit. A green here means the decisions were READ and judged.
 */

/** Exit code for a genuine gate failure — the same 1 every other `check:*` rung uses. */
const EXIT_FAIL = 1;

async function main(): Promise<number> {
  const root = repoRoot();
  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
  } catch (err) {
    process.stdout.write(
      `✗ check:adr-health — the decision log is in the store since ADR-0403 and it could not be opened:\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n\n` +
        "  This is a FAILURE, not a skip: the decisions were never read, so nothing about them was\n" +
        "  judged. Bring the DB up (pnpm db:up) and re-run.\n",
    );
    return EXIT_FAIL;
  }

  try {
    const store = new PgLibraryStore(handle.pool);
    const { adrs, parseErrors, unreadable, numberMismatches } =
      await loadTitledAdrMetasFromStore(store);
    if (unreadable) {
      process.stdout.write(
        `✗ check:adr-health — the decision rows could not be read:\n  ${parseErrors.join("\n  ")}\n`,
      );
      return EXIT_FAIL;
    }
    // A store that answers with an EMPTY decision log is not a clean corpus, it is a corpus that has
    // not been migrated — or the wrong database. Either way judging zero decisions and reporting
    // green is the vacuous pass this rung exists to make impossible.
    if (adrs.length === 0) {
      process.stdout.write(
        "✗ check:adr-health — the store holds NO decisions.\n\n" +
          "  Zero is never a clean bill of health here: it means this database has not had the\n" +
          "  decision load run against it (`decision-log-home-arc` inc 03), or the connection is\n" +
          "  pointed somewhere else.\n\n" +
          "    npx tsx packages/library/src/store/load-decisions.ts\n",
      );
      return EXIT_FAIL;
    }

    const stories = loadStoryDecisions(path.join(root, "stories"));
    const guardrails: GuardrailView[] = [];
    for (const doc of await store.queryDocs({ kind: "guardrail" })) {
      const body = doc.doc as Record<string, unknown>;
      if (typeof body["enforcedBy"] === "string") {
        guardrails.push({ id: doc.id, enforcedBy: body["enforcedBy"] });
      }
    }

    const results = adrHealth({
      adrs,
      parseErrors,
      numberMismatches,
      stories,
      guardrails,
      pathExists: (rel) => existsSync(path.join(root, rel)),
    });

    const failures = adrGateFailures(results);
    const warns = results.filter((r) => r.level === "WARN");
    for (const r of results) {
      const mark = r.level === "PASS" ? "✓" : r.level === "WARN" ? "⚠" : "✗";
      process.stdout.write(`${mark} ${r.name}\n`);
      if (r.level !== "PASS") for (const line of r.lines) process.stdout.write(`    ${line}\n`);
    }
    process.stdout.write(
      `\n${String(adrs.length)} decisions, ${String(stories.length)} stories, ` +
        `${String(guardrails.length)} guardrails judged — ` +
        `${String(failures.length)} gate failure(s), ${String(warns.length)} warning(s).\n`,
    );
    return failures.length > 0 ? EXIT_FAIL : 0;
  } finally {
    await closePool(handle.pool, handle.connector);
  }
}

process.exitCode = await main();
