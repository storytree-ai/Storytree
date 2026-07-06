/**
 * `storytree library` — the bare library dashboard (ADR-0023): health banner + a map of every
 * artifact + the surface command list. Moved here from the CLI dispatch (the ADR-0112 pattern) so
 * non-CLI consumers — the desktop sidecar's orientation runner (ADR-0108) — render the SAME
 * dashboard the terminal agent reads, without importing the command hub. The CLI re-exports it for
 * back-compat and keeps the deeper `artifact <id>` / `artifact list` drill-ins as its own dispatch.
 */

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { CURRENT_SCHEMA_VERSION } from "@storytree/library";

import type { Envelope } from "./envelope.js";
import { renderDoctrine } from "./doctrine.js";
import { libraryHealthCheap, levelCounts, RETIRED_FIELDS } from "./health.js";

/** Preferred category order for the dashboard; unknown kinds sort after, alphabetically. */
const KIND_ORDER = [
  "definition",
  "principle",
  "pattern",
  "guardrail",
  "techstack",
  "process",
  "agent",
  "proposal",
  "open-question",
  "friction",
  "template",
] as const;

/** Read a top-level string field off a stored doc body, or "" if absent. */
function fieldOf(stored: StoredDoc, key: "title" | "description"): string {
  const doc = stored.doc;
  if (typeof doc === "object" && doc !== null) {
    const v = (doc as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return "";
}

function groupByKind(docs: readonly StoredDoc[]): Map<string, StoredDoc[]> {
  const m = new Map<string, StoredDoc[]>();
  for (const d of docs) {
    const arr = m.get(d.kind);
    if (arr) arr.push(d);
    else m.set(d.kind, [d]);
  }
  return m;
}

function orderedKinds(present: Iterable<string>): string[] {
  const set = new Set(present);
  const out: string[] = [];
  for (const k of KIND_ORDER) {
    if (set.has(k)) {
      out.push(k);
      set.delete(k);
    }
  }
  out.push(...[...set].sort());
  return out;
}

/** `<id>  <title>` rows, id column padded to the widest id. */
function idTitleRows(docs: readonly StoredDoc[]): string[] {
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
  const width = Math.max(1, ...sorted.map((d) => d.id.length));
  return sorted.map((d) => `  ${d.id.padEnd(width)}  ${fieldOf(d, "title")}`);
}

/** `storytree library` — health check + a map of every artifact + the surface command list. */
export async function dashboard(store: Store): Promise<Envelope> {
  const docs = await store.queryDocs();
  if (docs.length === 0) {
    return {
      ok: false,
      body: "Library: EMPTY — no artifacts in the store.",
      next: ["seed it: STORYTREE_DB_USER=<iam-email> npx tsx packages/store/src/load-corpus.ts"],
    };
  }
  const groups = groupByKind(docs);
  const kinds = orderedKinds(groups.keys());
  // Real health banner from the CHEAP checks (skip the fs-heavy referential-integrity) — design §4 surface a.
  const cheap = libraryHealthCheap(docs, {
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    retiredFields: RETIRED_FIELDS,
  });
  const { fail, warn } = levelCounts(cheap);
  const banner =
    fail === 0 && warn === 0
      ? `Library: OK — ${docs.length} artifacts across ${kinds.length} categories.`
      : `Library: ${fail} FAIL, ${warn} WARN — run \`storytree library --check\` for detail.`;
  const lines: string[] = [banner, ""];
  for (const kind of kinds) {
    const arr = groups.get(kind) ?? [];
    lines.push(`${kind}  (${arr.length})`, ...idTitleRows(arr), "");
  }
  lines.push(
    "commands  (drill in with `storytree library <command> --help`):",
    "  artifact <id>                 view one artifact",
    "  artifact list <category>      list a category",
    "  artifact new | edit <id>      create / edit (writes need --pg)",
    "  artifact retire <id>          retire one artifact + rationale (needs --pg)",
    "  tree focus <id>               the local DAG of one artifact",
    "  sync-agents                   reconcile the agent tier to the seed (needs --pg)",
    "  sync-corpus                   migrate seed-only non-agent artifacts into live (needs --pg)",
    "  export-corpus [--write]       export live non-agent bodies back to the seed (dry-run; needs --pg)",
    "  graduate [--review]           agent-memory → Library worklist (ADR-0095, read-only)",
    "  (coming soon: artifact comment)",
  );
  return {
    ok: true,
    body: lines.join("\n"),
    // The just-in-time / drill-in-to-earn-the-detail stance is library doctrine, surfaced as a
    // pointer rather than restated here (ADR-0023 §4, ADR-0029 §7).
    doctrine: [await renderDoctrine(store, "pull-based-context-architecture")],
    next: [
      "storytree library artifact <id>",
      `storytree library artifact list ${kinds[0] ?? "<category>"}`,
    ],
  };
}
