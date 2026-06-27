// Generate apps/studio/data/unit-status.json — the on-disk, git-visible projection of PROVEN progress
// (ADR-0120, finding 1 / "Story DAG"). Signed verdicts live only in the live store (events.verdict);
// `healthy` is DERIVED from them and never authored to stories/*.md frontmatter (ADR-0020/0040), so
// without this view the single biggest fact about the project — what is proven — is invisible in git.
//
//   storytree-cli: node --import tsx src/build-unit-status.ts          regenerate + write (needs --pg creds)
//   storytree-cli: node --import tsx src/build-unit-status.ts --check  fail (exit 1) if the file is stale
//
// Owner decision (ADR-0120 b): a SEPARATE generated file (not folded into knowledge.json), regenerated
// like assets.json / glossary.md. It is a VIEW, never an edit surface — editing it is meaningless.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SIGNING_EVENT_KIND, Verdict } from "@storytree/proof-protocol";
import { rollupStatus } from "@storytree/orchestrator";
import { createPool, closePool } from "@storytree/library/store";
import { PgWorkStore } from "@storytree/orchestrator/store";

import { loadLocalSecrets } from "./secrets.js";

/** The minimal event slice the derivation reads (StoreEvent / the CLI verdict reader both satisfy it). */
export interface StatusEvent {
  readonly kind: string;
  readonly seq: number;
  readonly doc: unknown;
}

export interface UnitStatusRow {
  readonly id: string;
  /** The derived lifecycle status (e.g. "healthy") — a projection of the verdicts, never authored. */
  readonly status: string;
  readonly latestVerdict: {
    readonly outcome: string;
    readonly proofMode: string;
    readonly runId: string;
    readonly commitSha: string;
    readonly signer: string;
    readonly approvedBy?: string;
  };
}

/**
 * Derive one row per unit that has a verdict-borne status, from a raw work/verdict event stream.
 * Pure (no IO) so it is unit-testable offline. Status comes from {@link rollupStatus} (the canonical
 * projection — the same one the tree/world derive green from); a unit whose projection abstains
 * (`null`, e.g. a latest-FAIL verdict) is omitted. Rows are sorted by id for a stable, diffable file.
 */
export function deriveUnitStatuses(events: readonly StatusEvent[]): UnitStatusRow[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const latest = new Map<string, Verdict>();
  for (const e of sorted) {
    if (e.kind !== SIGNING_EVENT_KIND) continue;
    const parsed = Verdict.safeParse(e.doc);
    if (!parsed.success) continue;
    latest.set(parsed.data.unitId, parsed.data);
  }

  const rows: UnitStatusRow[] = [];
  for (const [id, v] of latest) {
    const status = rollupStatus(id, events);
    if (status === null) continue; // projection abstains → not proven, omit
    rows.push({
      id,
      status,
      latestVerdict: {
        outcome: v.outcome,
        proofMode: v.proofMode,
        runId: v.runId,
        commitSha: v.commitSha,
        signer: v.signer,
        ...(v.approvedBy !== undefined ? { approvedBy: v.approvedBy } : {}),
      },
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}

/** Serialize the rows to the exact on-disk form (the writer and the `--check` compare share it). */
export function renderUnitStatusFile(rows: readonly UnitStatusRow[]): string {
  return (
    JSON.stringify(
      {
        _comment:
          "GENERATED from signed verdicts (events.verdict) -- DO NOT EDIT. Regenerate with " +
          "`pnpm build:status` (build-unit-status.ts). `healthy` is DERIVED from verdicts, never " +
          "authored (ADR-0020/0040, ADR-0120).",
        units: rows,
      },
      null,
      2,
    ) + "\n"
  );
}

/** Repo root: packages/cli/src/build-unit-status.ts → four dirs up (the build-claude-md.ts pattern). */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const statusPath = path.join(repoRoot, "apps", "studio", "data", "unit-status.json");
const toLf = (s: string): string => s.replace(/\r\n/g, "\n");

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  loadLocalSecrets();

  const { pool, connector } = await createPool();
  try {
    const work = new PgWorkStore(pool);
    const events = await work.readEvents();
    const rows = deriveUnitStatuses(events);
    const generated = renderUnitStatusFile(rows);

    if (check) {
      let onDisk = "";
      try {
        onDisk = readFileSync(statusPath, "utf8");
      } catch {
        onDisk = "";
      }
      if (toLf(onDisk) !== toLf(generated)) {
        console.error(
          `build:status — unit-status.json is STALE (${rows.length} verdict-borne units in live). ` +
            "Regenerate with `pnpm build:status` and commit.",
        );
        process.exit(1);
      }
      console.log(`build:status — unit-status.json in sync (${rows.length} verdict-borne units).`);
      return;
    }

    writeFileSync(statusPath, generated, "utf8");
    console.log(`build:status — wrote ${rows.length} verdict-borne units → ${statusPath}`);
  } finally {
    await closePool(pool, connector);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
