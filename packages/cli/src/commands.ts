import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import {
  upcastAndValidate,
  groupSources,
  CURRENT_SCHEMA_VERSION,
  KIND_SPECS,
} from "@storytree/library";
import type { UatTest, ReliabilityGate } from "@storytree/library";
import {
  loadNodeSpec,
  findNodeSpecFile,
  extractVouchingTestNames,
  resolveSignerFromEnv,
  platformShellCommand,
  runShellCommand,
} from "@storytree/orchestrator";
import { renderStoredDoc, syncSeedAgents, syncSeedCorpus, computeExportedSeed } from "@storytree/library/store";
import type { SeedEntry } from "@storytree/library/store";

import { execFileSync } from "node:child_process";

import { adrCommand, adrHelp, type AdrAllocatorLike } from "./adr.js";
import { adoptCommand, adoptHelp, type AdoptDispatchDeps } from "./adopt.js";
import type { AdoptPlanStory } from "./adopt-plan.js";
import { coverageCommand, type CoverageUnit } from "./coverage.js";
import { agentsCommand, agentsHelp } from "./agents.js";
import { attestCommand, attestHelp, type AttestationStoreLike, type AttestDeps } from "./attest.js";
import { runDrift, driftHelp } from "./drift.js";
import { renderDoctrine } from "./doctrine.js";
import { graduateCommand, defaultMemoryDir, defaultSnapshotPath } from "./graduate.js";
import type { Envelope } from "./envelope.js";
import {
  libraryHealth,
  libraryHealthCheap,
  worstLevel,
  gateFailures,
  levelCounts,
} from "./health.js";
import { lookupNodeBuildConfig, parsePocketReadings } from "@storytree/orchestrator";
import type { PocketReading } from "@storytree/orchestrator";

import { nodeBuild, nodeHelp, nodeResolve } from "@storytree/drive";
import { orchestrate } from "@storytree/drive";
import type { SdkQueryFn } from "@storytree/agent";
import { deriveIdentity, noticeboardCommand } from "@storytree/drive";
import type { PresenceStoreLike, SessionIdentity } from "@storytree/drive";
import { findDependents } from "./retire.js";
import { storyBuild, storyHelp } from "@storytree/drive";
import { flipFrontmatterStatus, type AdoptStory, type FlipResult } from "@storytree/drive";
import { treeCommand } from "./tree.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";
import {
  uatCommand,
  uatHelp,
  type GitState,
  type UatDeps,
  type UatVerdictStoreLike,
} from "./uat.js";
import { gateCommand, gateHelp, type GateDeps, type GateOpts } from "./gate.js";
import { driveBuildTestsGate } from "./gate-build-driver.js";

/**
 * Fields removed by a past migration that must not reappear (design §4 check 2): `seeAlso`
 * (migration #1, the sources incident) + the agent kind's prose authority walls and
 * `requiredReading` (migration #2, the ADR-0029 owner reshape — walls are code/guardrails,
 * context is a typed ref-list).
 */
const RETIRED_FIELDS = ["seeAlso", "owns", "doesNotTouch", "authority", "requiredReading"];

/**
 * The Library artifact whose doctrine every write surface surfaces (search-before-write). Rendered
 * on demand via {@link renderDoctrine} so the pointer's gloss is SOURCED from the artifact — edit
 * `edit-first-curation` and the CLI's nudge updates, with no hard-coded restatement to drift
 * (reference-don't-restate, ADR-0029 §7). The old hand-copied literal lived here.
 */
const EDIT_FIRST_ID = "edit-first-curation";

/**
 * The Library commands (ADR-0023). Read-only walking skeleton: `library` (dashboard), `artifact <id>`
 * (view), `artifact list <category>` (the interim search). Each returns an {@link Envelope} — the
 * result plus choose-your-own-adventure guidance. `run` parses argv and dispatches; it NEVER throws
 * on an expected miss (unknown id / bad category) — it returns an `ok: false` envelope with `next`.
 */

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

/** Read the `references` string[] off a stored doc body (the only edge field today). */
function refsOf(stored: StoredDoc): string[] {
  const doc = stored.doc;
  if (typeof doc === "object" && doc !== null) {
    const v = (doc as Record<string, unknown>).references;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  }
  return [];
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

/** The repo root, resolved from this file's location (packages/cli/src -> three dirs up). */
function repoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

/** Count the generated non-template assets in apps/studio/data/assets.json (for count-reconciliation). */
function generatedAssetCount(): number | undefined {
  try {
    const raw = readFileSync(
      path.join(repoRoot(), "apps", "studio", "data", "assets.json"),
      "utf8",
    );
    const assets = JSON.parse(raw) as { category?: string }[];
    const kinds = new Set(Object.keys(KIND_SPECS));
    return assets.filter((a) => typeof a.category === "string" && kinds.has(a.category)).length;
  } catch {
    return undefined;
  }
}

/**
 * `storytree library --check` (design §4 surface b) — the FULL per-id health report (all five checks).
 * Provides the fs-backed resolvers (docExists under <repoRoot>/docs, generatedAssetCount from
 * assets.json) so {@link libraryHealth} stays pure. Envelope `ok` is false IFF a GATE check FAILs (a
 * real gate break / non-zero exit); a WARN keeps `ok` true (design §4 "A WARN keeps ok=true").
 */
export async function libraryCheck(store: Store): Promise<Envelope> {
  const docs = await store.queryDocs();
  const docsDir = path.join(repoRoot(), "docs");
  const genCount = generatedAssetCount();
  const results = libraryHealth(docs, {
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    retiredFields: RETIRED_FIELDS,
    docExists: (rel) => {
      const target = path.join(docsDir, rel);
      try {
        return existsSync(target) && statSync(target).isFile();
      } catch {
        return false;
      }
    },
    ...(genCount !== undefined ? { generatedAssetCount: genCount } : {}),
  });
  const { fail, warn } = levelCounts(results);
  const gateFails = gateFailures(results);
  const lines: string[] = [];
  for (const r of results) {
    lines.push(`[${r.level}] ${r.name}`);
    for (const l of r.lines) lines.push(`        ${l}`);
  }
  lines.push("", `${fail} FAIL, ${warn} WARN  (worst: ${worstLevel(results)}).`);
  if (gateFails.length > 0) {
    lines.push(`GATE BROKEN: ${gateFails.map((r) => r.name).join(", ")} — fix before merge.`);
  }
  return {
    ok: gateFails.length === 0,
    body: lines.join("\n"),
    next: [
      "storytree library",
      "storytree library --check --pg   (run the same checks against the live projection)",
    ],
  };
}

/** `storytree library artifact <id>` — print one artifact to stdout. */
export async function viewArtifact(store: Store, id: string): Promise<Envelope> {
  const stored = await store.getDoc(id);
  if (!stored) {
    return {
      ok: false,
      body: `no artifact "${id}" in the Library.`,
      next: ["storytree library", "storytree library artifact list <category>"],
    };
  }
  const a = renderStoredDoc(stored);
  const lines: string[] = [`# ${a.title}    [${a.category}]`, `id: ${a.id}`, ""];
  if (a.description) lines.push(a.description, "");
  lines.push(a.body);
  // "Sources": references grouped by target type, resolved against the corpus (asset:<id> -> kind).
  const byId = new Map((await store.queryDocs()).map((d) => [d.id, d] as const));
  const sources = groupSources(a.references, (refId) => {
    const t = byId.get(refId);
    return t ? { kind: t.kind, title: fieldOf(t, "title") } : null;
  });
  if (sources.length > 0) {
    lines.push("", "Sources:");
    for (const group of sources) {
      lines.push(`  ${group.group}:`);
      for (const item of group.items) lines.push(`    - ${item.label}  (${item.ref})`);
    }
  }
  if (a.provenance) lines.push("", `provenance: ${a.provenance}`);
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      `storytree library tree focus ${a.id}   (its local DAG)`,
      `storytree library artifact edit ${a.id}   (coming soon)`,
    ],
  };
}

/** `storytree library artifact list <category>` — the interim search (list by kind). */
export async function listCategory(store: Store, category: string | undefined): Promise<Envelope> {
  const kinds = orderedKinds(groupByKind(await store.queryDocs()).keys());
  if (category === undefined || !kinds.includes(category)) {
    const which = category === undefined ? "no category given" : `unknown category "${category}"`;
    return {
      ok: false,
      body: `${which}. available categories: ${kinds.join(", ")}.`,
      next: kinds.map((k) => `storytree library artifact list ${k}`),
    };
  }
  const arr = await store.queryDocs({ kind: category });
  const body = [`${category}  (${arr.length})`, ...idTitleRows(arr)].join("\n");
  return {
    ok: true,
    body,
    doctrine: [await renderDoctrine(store, EDIT_FIRST_ID)],
    next: ["storytree library artifact <id>"],
  };
}

/** Guidance returned when a write is attempted against the offline (ephemeral) store. */
async function notWritable(store: Store): Promise<Envelope> {
  return {
    ok: false,
    body: "writes go to the shared store, not the offline copy — run with --pg (and bring the DB up first: pnpm db:up).",
    // The WHY is library doctrine, sourced not restated (ADR-0029 §7): the live store is the edit
    // surface; the body above is just the mechanical how-to.
    doctrine: [await renderDoctrine(store, "live-store-is-the-edit-surface")],
    next: [
      "pnpm db:up",
      "STORYTREE_DB_USER=<iam-email> storytree library artifact edit <id> --pg --set <field>=<value>",
    ],
  };
}

/** Pull `id` + `kind` off a validated doc (structured units carry `kind`; rendered assets carry `category`). */
function idKindOf(doc: Record<string, unknown>): { id: string; kind: string } {
  const id = typeof doc.id === "string" ? doc.id : "";
  const kind =
    typeof doc.kind === "string"
      ? doc.kind
      : typeof doc.category === "string"
        ? doc.category
        : "";
  return { id, kind };
}

/**
 * `storytree library artifact new --json '<doc>' | --file <path>` — create one artifact in the
 * shared store. Validates at the boundary (loud, but returned as guidance, not a throw) and REFUSES
 * to overwrite an existing id — pointing at `edit` instead (edit-first-curation as a guardrail).
 */
export async function newArtifact(
  deps: RunDeps,
  opts: { json: string | undefined; file: string | undefined },
): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);

  let raw = opts.json;
  if (raw === undefined && opts.file !== undefined) {
    try {
      raw = await readFile(opts.file, "utf8");
    } catch (e) {
      return {
        ok: false,
        body: `could not read --file ${opts.file}: ${(e as Error).message}`,
        next: ["storytree library artifact list <category>"],
      };
    }
  }
  if (raw === undefined) {
    return {
      ok: false,
      body: "new needs the artifact as JSON: --json '<doc>' or --file <path>.",
      doctrine: [await renderDoctrine(deps.store, EDIT_FIRST_ID)],
      next: ["storytree library artifact list <category>   (search before you write)"],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, body: `invalid JSON: ${(e as Error).message}`, next: [] };
  }
  let valid: unknown;
  try {
    // Migrate-on-write (design §3): forward an old-shape doc through pending migrations, then
    // validate — so a doc still carrying a retired field (e.g. seeAlso) is upcast, not rejected.
    valid = upcastAndValidate(parsed);
  } catch (e) {
    return { ok: false, body: `doc failed validation:\n${(e as Error).message}`, next: [] };
  }

  const { id, kind } = idKindOf(valid as Record<string, unknown>);
  if (!id) return { ok: false, body: "doc has no id.", next: [] };
  if (await deps.store.getDoc(id)) {
    return {
      ok: false,
      body: `"${id}" already exists — edit it, don't recreate it.`,
      doctrine: [await renderDoctrine(deps.store, EDIT_FIRST_ID)],
      next: [`storytree library artifact edit ${id} --set <field>=<value>`],
    };
  }
  const saved = await deps.store.upsertDoc({ id, kind, doc: valid, actor: deps.actor ?? "cli" });
  return {
    ok: true,
    body: `created ${saved.id}  [${saved.kind}].`,
    next: [`storytree library artifact ${saved.id}`, `storytree library tree focus ${saved.id}`],
  };
}

/**
 * `storytree library artifact edit <id> --set <field>=<value> ...` (or `--json`/`--file` to replace
 * wholesale) — patch one artifact in the shared store. Loads it, applies the change, re-validates
 * (a bad edit returns the validation message as guidance, never persists), then upserts (one event +
 * projection update). The id must already exist — `new` creates.
 */
export async function editArtifact(
  deps: RunDeps,
  id: string | undefined,
  opts: { sets: readonly string[]; json: string | undefined; file: string | undefined },
): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);
  if (id === undefined) {
    return {
      ok: false,
      body: "edit needs an id: storytree library artifact edit <id> --set <field>=<value>",
      next: ["storytree library artifact list <category>"],
    };
  }
  const existing = await deps.store.getDoc(id);
  if (!existing) {
    return {
      ok: false,
      body: `no artifact "${id}" to edit.`,
      next: ["storytree library artifact list <category>", "storytree library artifact new --json '<doc>'"],
    };
  }

  let nextDoc: unknown;
  let summary: string;
  if (opts.json !== undefined || opts.file !== undefined) {
    let raw = opts.json;
    if (raw === undefined && opts.file !== undefined) {
      try {
        raw = await readFile(opts.file, "utf8");
      } catch (e) {
        return { ok: false, body: `could not read --file ${opts.file}: ${(e as Error).message}`, next: [] };
      }
    }
    try {
      nextDoc = JSON.parse(raw as string);
    } catch (e) {
      return { ok: false, body: `invalid JSON: ${(e as Error).message}`, next: [] };
    }
    summary = "replaced whole doc";
  } else {
    if (opts.sets.length === 0) {
      return {
        ok: false,
        body: "nothing to change — pass --set <field>=<value> (repeatable), or --json/--file to replace.",
        next: [`storytree library artifact ${id}`],
      };
    }
    const base: Record<string, unknown> =
      typeof existing.doc === "object" && existing.doc !== null
        ? { ...(existing.doc as Record<string, unknown>) }
        : {};
    // A typed ref-list field (KIND_SPECS refList, e.g. the agent kind's context/rules) is a
    // string[] on the doc — coerce the --set string by splitting on whitespace/commas so
    // `--set context=asset:a,asset:b` works without --json.
    const kindSpecs =
      typeof base["kind"] === "string" && Object.hasOwn(KIND_SPECS, base["kind"])
        ? KIND_SPECS[base["kind"] as keyof typeof KIND_SPECS]
        : [];
    const refListFields = new Set(kindSpecs.filter((s) => s.refList === true).map((s) => s.field));
    const changed: string[] = [];
    for (const s of opts.sets) {
      const i = s.indexOf("=");
      if (i < 0) return { ok: false, body: `bad --set "${s}" — use field=value.`, next: [] };
      const field = s.slice(0, i);
      const value = s.slice(i + 1);
      base[field] = refListFields.has(field)
        ? value.split(/[\s,]+/).filter((v) => v !== "")
        : value;
      changed.push(field);
    }
    nextDoc = base;
    summary = `set ${changed.join(", ")}`;
  }

  let valid: unknown;
  try {
    // Migrate-on-write (design §3): upcast the edited doc through pending migrations before
    // validating, so an edit to a lagging-version row is forward-migrated, not rejected.
    valid = upcastAndValidate(nextDoc);
  } catch (e) {
    return {
      ok: false,
      body: `edit would make "${id}" invalid:\n${(e as Error).message}`,
      next: [`storytree library artifact ${id}`],
    };
  }
  const { id: vid, kind } = idKindOf(valid as Record<string, unknown>);
  const saved = await deps.store.upsertDoc({ id: vid || id, kind, doc: valid, actor: deps.actor ?? "cli" });
  return {
    ok: true,
    body: `updated ${saved.id} (${summary}).`,
    next: [`storytree library artifact ${saved.id}`, `storytree library tree focus ${saved.id}`],
  };
}

/** A `--superseded-by` ref must point at a replacement artifact (`asset:<id>`) or a source (`doc:<path>`). */
const SUPERSEDED_BY_REF = /^(asset:[A-Za-z0-9_-]+|doc:.+)$/;

/**
 * `storytree library artifact retire <id> --reason "..." [--superseded-by <ref>] --pg` — RETIRE one
 * artifact of ANY kind from the live store (owner call, 2026-06-20). The retire is a delete WITH a
 * recorded rationale: `deleteDoc` folds `retiredReason` / `supersededBy` onto the append-only
 * `deleted` event, so WHY the artifact left the projection is durable even though the row is gone
 * (ADR-0017: history = events). The session actor is stamped (not the curator) — this is a
 * human-driven close, distinct from the librarian-curator's in-build OQ auto-retire (curate.ts).
 *
 * The ONE gate (replacing the curator's open-question kind-fence): reference integrity. If any other
 * live artifact still references this one via an `asset:<id>` edge, the retire is HARD-REFUSED and
 * the dependents are listed — re-point or retire them first. An artifact with no inbound edges
 * retires cleanly. `--reason` is mandatory (the rationale is the whole point); `--pg` is required
 * (a retire against the ephemeral offline store would be a no-op).
 */
export async function retireArtifact(
  deps: RunDeps,
  id: string | undefined,
  opts: { reason: string | undefined; supersededBy: string | undefined },
): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);
  if (id === undefined) {
    return {
      ok: false,
      body: "retire needs an id: storytree library artifact retire <id> --reason \"...\"",
      next: ["storytree library artifact list <category>"],
    };
  }
  const reason = opts.reason?.trim();
  if (reason === undefined || reason === "") {
    return {
      ok: false,
      body: "retire needs --reason \"<why>\" — the rationale is recorded on the delete event (retire-with-rationale).",
      next: [`storytree library artifact ${id}`],
    };
  }
  if (opts.supersededBy !== undefined && !SUPERSEDED_BY_REF.test(opts.supersededBy)) {
    return {
      ok: false,
      body: `bad --superseded-by "${opts.supersededBy}" — use asset:<id> (a replacement artifact) or doc:<path> (e.g. doc:decisions/0059-x.md).`,
      next: [`storytree library artifact ${id}`],
    };
  }

  const existing = await deps.store.getDoc(id);
  if (!existing) {
    return {
      ok: false,
      body: `no artifact "${id}" to retire.`,
      next: ["storytree library artifact list <category>"],
    };
  }

  // The reference-integrity gate (the only gate): refuse while anything still depends on it.
  const dependents = findDependents(id, await deps.store.queryDocs());
  if (dependents.length > 0) {
    const rows = dependents.map((d) => `  ← ${d.id}  ${fieldOf(d, "title")}  [${d.kind}]`);
    return {
      ok: false,
      body: [
        `cannot retire "${id}" — ${dependents.length} artifact${dependents.length === 1 ? "" : "s"} still reference${dependents.length === 1 ? "s" : ""} it (asset:${id}):`,
        ...rows,
        "",
        "re-point or retire the dependents first, then retire this one.",
      ].join("\n"),
      next: [`storytree library tree focus ${id}`, ...dependents.map((d) => `storytree library artifact ${d.id}`)],
    };
  }

  const dropped = await deps.store.deleteDoc(id, {
    actor: deps.actor ?? "cli",
    reason,
    ...(opts.supersededBy !== undefined ? { supersededBy: opts.supersededBy } : {}),
  });
  if (!dropped) {
    // getDoc saw it a moment ago; a false here means a concurrent retire won the race.
    return { ok: false, body: `"${id}" was already retired (no row to drop).`, next: ["storytree library"] };
  }
  return {
    ok: true,
    body: [
      `retired ${id}  [${existing.kind}] — ${fieldOf(existing, "title")}`,
      `reason: ${reason}`,
      ...(opts.supersededBy !== undefined ? [`superseded by: ${opts.supersededBy}`] : []),
    ].join("\n"),
    next: ["storytree library", "storytree library artifact list <category>"],
  };
}

/**
 * `storytree library sync-agents --pg` — reconcile the live `agent` tier to the SEED (ADR-0055).
 *
 * The agent tier is **seed-canonical**: agents are authored in `apps/studio/data/knowledge.json` and
 * the renderer (`storytree agents`, the generated CLAUDE.md region per ADR-0051, the `.claude/agents`
 * files per ADR-0052) reads the seed offline. That makes it the exception to ADR-0023's
 * live-store-is-the-edit-surface default — so an agent-tier seed edit must be re-synced or the live
 * store (which powers `storytree agents --pg` and the studio) drifts stale. This upserts every seed
 * agent and deletes any live agent absent from the seed; agent-kind only, idempotent. Needs --pg —
 * a sync against the ephemeral offline store would be a no-op.
 */
export async function syncAgentsCommand(deps: RunDeps): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);
  const r = await syncSeedAgents(deps.store, { actor: deps.actor ?? "cli" });
  const lines = [
    r.inSync
      ? `IN SYNC — the live agent tier equals the seed's ${r.seed.length} agents.`
      : "NOT IN SYNC after reconcile — investigate (a write may have failed).",
    "",
    `before  (${r.before.length}): ${r.before.join(", ") || "(none)"}`,
    `upserted (${r.upserted.length}): ${r.upserted.join(", ")}`,
    `deleted (${r.deleted.length}): ${r.deleted.join(", ") || "(none)"}`,
    `after   (${r.after.length}): ${r.after.join(", ")}`,
  ];
  return {
    ok: r.inSync,
    body: lines.join("\n"),
    next: [
      "storytree library artifact list agent",
      "storytree agents <name> --pg   (verify it renders clean)",
    ],
  };
}

/**
 * `storytree library sync-corpus --pg` — carry seed-only NON-AGENT artifacts into the live store
 * (ADR-0103). The non-agent tier is LIVE-canonical (ADR-0023), so unlike the seed-canonical
 * `sync-agents` this is **migrate-only**: it upserts every seed artifact ABSENT from the live store
 * and leaves the rest alone — it never overwrites a live row (which may carry `artifact edit --pg`
 * edits) and never deletes a live-only artifact (a live-canonical creation). It exists to close the
 * ADR-0095 graduation gap: a freshly-graduated principle lands in `knowledge.json` and is otherwise
 * seed-only (invisible to `--pg` and rendering as a `> MISSING REF` for any agent that cites it
 * against the live store / studio). Needs --pg; idempotent.
 */
export async function syncCorpusCommand(deps: RunDeps): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);
  const r = await syncSeedCorpus(deps.store, { actor: deps.actor ?? "cli" });
  const lines = [
    r.created.length === 0
      ? `NOTHING TO MIGRATE — the live store already holds all ${r.seed.length} seed non-agent artifacts.`
      : `MIGRATED ${r.created.length} seed-only artifact(s) into the live store.`,
    "",
    `seed non-agents (${r.seed.length})`,
    `created (${r.created.length}): ${r.created.join(", ") || "(none)"}`,
    `skipped — already live, left untouched (${r.skipped.length})`,
  ];
  if (!r.complete) {
    lines.push("", "INCOMPLETE — a seed artifact is still missing from live (a write may have failed).");
  }
  return {
    // A successful run leaves every seed non-agent present in live (complete); an incomplete run is a
    // failure worth surfacing. "Nothing to migrate" is a healthy, idempotent success.
    ok: r.complete,
    body: lines.join("\n"),
    next: [
      ...(r.created.length > 0 ? [`storytree library artifact ${r.created[0]} --pg   (verify it landed)`] : []),
      "storytree library --pg",
    ],
  };
}

/**
 * `storytree library export-corpus --pg [--write]` — the INVERSE of `sync-corpus` (ADR-0120): carry the
 * canonical LIVE non-agent tier back into the seed (`apps/studio/data/knowledge.json`), the gap ADR-0103
 * left as "later work". DRY-RUN by default (reports what it WOULD change, writes nothing); `--write`
 * rewrites knowledge.json. Owner-directed policy (ADR-0120 a): OVERWRITE a seed body that drifted from
 * a valid live one + ADD live-only artifacts, but NEVER delete a seed entry, NEVER touch agents/templates,
 * and NEVER write a degraded/below-floor live body (it is refused and reported for a seed→live restore).
 * Needs --pg (it reads the LIVE store); writing the file is a local edit, so re-run build-corpus after.
 */
export async function exportCorpusCommand(deps: RunDeps, opts: { write: boolean }): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);
  const write = opts.write === true;

  const knowledgePath = path.join(repoRoot(), "apps", "studio", "data", "knowledge.json");
  const seedEntries = JSON.parse(readFileSync(knowledgePath, "utf8")) as SeedEntry[];
  const live = await deps.store.queryDocs();
  const r = computeExportedSeed(seedEntries, live);

  const lines = [
    r.noop
      ? "NOTHING TO EXPORT — every export-scope seed body already matches the live store."
      : `${write ? "EXPORTED" : "WOULD EXPORT"} ${r.updated.length} update(s) + ${r.created.length} addition(s) from live → seed.`,
    "",
    `overwritten from live (${r.updated.length}): ${r.updated.join(", ") || "(none)"}`,
    `added (live-only) (${r.created.length}): ${r.created.join(", ") || "(none)"}`,
    `REFUSED — degraded/below-floor live body, restore seed→live instead (${r.skippedDegraded.length}): ${r.skippedDegraded.join(", ") || "(none)"}`,
  ];

  if (write && !r.noop) {
    writeFileSync(knowledgePath, JSON.stringify(r.entries, null, 2) + "\n", "utf8");
    lines.push("", `WROTE ${knowledgePath}. Now regenerate the views: npx tsx apps/studio/data/build-corpus.mjs`);
  } else if (!write && !r.noop) {
    lines.push("", "DRY-RUN — nothing written. Re-run with --write to apply, then run build-corpus.mjs.");
  }

  return {
    ok: true,
    body: lines.join("\n"),
    next: write
      ? ["npx tsx apps/studio/data/build-corpus.mjs   (regenerate assets.json)", "pnpm check:corpus-content"]
      : ["storytree library export-corpus --pg --write   (apply)", "pnpm check:corpus-content   (the body-level drift report)"],
  };
}

/**
 * `storytree library tree focus <id>` — the DAG **for one node only** (ADR-0023): its outbound
 * references (intra-library `asset:` edges + `doc:` source/ADR pointers, the latter surfaced on
 * demand) and the inbound `asset:` edges that point at it (a derived back-edge scan). Honest about
 * sparsity: intra-library edges are few today, so the view doubles as a friction signal for the
 * typed `derives_from` / `consumes` edges a later slice will add.
 */
export async function treeFocus(store: Store, id: string | undefined): Promise<Envelope> {
  if (id === undefined) {
    return {
      ok: false,
      body: "tree focus needs an id: storytree library tree focus <id>",
      next: ["storytree library"],
    };
  }
  const stored = await store.getDoc(id);
  if (!stored) {
    return {
      ok: false,
      body: `no artifact "${id}" to focus.`,
      next: ["storytree library", "storytree library artifact list <category>"],
    };
  }
  const all = await store.queryDocs();
  const byId = new Map(all.map((d) => [d.id, d] as const));

  const outbound: string[] = [];
  let firstLibraryNeighbour: string | undefined;
  for (const r of refsOf(stored)) {
    if (r.startsWith("asset:")) {
      const tid = r.slice("asset:".length);
      const t = byId.get(tid);
      firstLibraryNeighbour ??= tid;
      outbound.push(`  → ${tid}${t ? `  ${fieldOf(t, "title")}  [${t.kind}]` : "  (missing target)"}   (library)`);
    } else {
      outbound.push(`  → ${r}   (source — surfaced on demand)`);
    }
  }

  const needle = `asset:${id}`;
  const inbound = all
    .filter((d) => d.id !== id && refsOf(d).includes(needle))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) => `  ← ${d.id}  ${fieldOf(d, "title")}  [${d.kind}]`);

  const hasLibraryEdge = outbound.some((l) => l.includes("(library)")) || inbound.length > 0;
  const lines: string[] = [
    `# ${fieldOf(stored, "title")}    [${stored.kind}]   — tree focus`,
    `id: ${id}`,
    "",
    "outbound  (what this references / derives from):",
    ...(outbound.length > 0 ? outbound : ["  (none)"]),
    "",
    "inbound  (what references this):",
    ...(inbound.length > 0 ? inbound : ["  (none yet)"]),
  ];
  if (!hasLibraryEdge) {
    lines.push(
      "",
      "note: no intra-library edges here yet — typed derives_from / consumes land in a later slice.",
    );
  }

  const next = [`storytree library artifact ${id}`];
  if (firstLibraryNeighbour !== undefined) {
    next.push(`storytree library tree focus ${firstLibraryNeighbour}`);
  }
  return { ok: true, body: lines.join("\n"), next };
}

function treeHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library tree — navigate the DAG, one node at a time.",
      "",
      "  storytree library tree focus <id>   the local DAG of one artifact (in/out edges)",
    ].join("\n"),
    next: ["storytree library"],
  };
}

function graduateHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library graduate — the agent-memory → Library graduation worklist (ADR-0095).",
      "",
      "Reads the harness agent-memory store, classifies each durable memory to its Library kind,",
      "resolves its [[wiki-links]] against the seed corpus, and flags duplicates. READ-ONLY: it",
      "prints a worklist for the librarian-curator to finalise — it never authors Library docs.",
      "",
      "  storytree library graduate                    the summary worklist",
      "  storytree library graduate --review           full per-candidate detail (incl. the body)",
      "  storytree library graduate --memory-dir <p>   read memory from <p> (default: the harness store)",
    ].join("\n"),
    next: ["storytree library graduate --review", "storytree library"],
  };
}

async function topHelp(store: Store): Promise<Envelope> {
  return {
    ok: true,
    body: [
      "storytree — the agent's interface to the project (ADR-0023).",
      "",
      "proof workflows (ADR-0118 — surface the GOAL; the grain primitives nest under each, reached by",
      "drilling into `<workflow> --help`):",
      "  adopt <story>    bring a brownfield story into the fold — observe-and-sign → mapped→proposed  (· plan · gate)",
      "  build <id>       drive red→green — auto-routes node vs story by tier  (· build node | story | gate --real)",
      "  witness <story>  the operator proof of a story's UAT — list · attest (a verdict) · vouch (a vouch, ADR-0044)",
      "  tree [<story>]   orient: the work hierarchy + build surface + reliability-gate & UAT glyphs",
      "",
      "the rest:",
      "  library          explore + curate the Library (the knowledge tier)",
      "  noticeboard      the session presence board (ADR-0033) — view | declare | done",
      "  coverage         does every declared contract have an observed test? the coverage-honesty check (ADR-0020)",
      "  drift            is a proof's bound code still fresh? the binding-staleness flag (ADR-0016)",
      "  adr              search the decision log (adr list) + allocate numbers (ADR-0050/0086)",
      "  agents <name>    assemble an agent's system prompt from the Library (ADR-0051)",
      "  orchestrate      run the session-orchestrator agent headlessly: orient + propose (ADR-0108)",
      "",
      "the proof primitives relocated UNDER the workflows above (ADR-0118); the old grain verbs keep",
      "working as back-compat aliases (nothing breaks, they just moved):",
      "  node build → build node · story build → build story · node resolve → build node resolve",
      "  gate run → adopt gate · gate run --real → build gate --real · gate list → tree",
      "  uat list|attest → witness list|attest · attest → witness vouch",
      "",
      "start here:",
      "  storytree library    health + a map of every artifact + the commands",
    ].join("\n"),
    // The "how to use this CLI" doctrine is library-sourced, not restated here (ADR-0029 §7): pull
    // context just-in-time, drill in to earn the detail (the choose-your-own-adventure stance, ADR-0023).
    doctrine: [await renderDoctrine(store, "pull-based-context-architecture")],
    next: ["storytree library"],
  };
}

function treeViewHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree tree — the work-hierarchy orientation surface (ADR-0033).",
      "",
      "  storytree tree [--pg]              every story, one line each",
      "  storytree tree <story-id> [--pg]   one story: capabilities, build surface, edges, presence",
      "",
      "with --pg the views weave in live presence and one signed-verdict glyph per node",
      "(✓ proven / ✗ last run failed / – never built, read from events.verdict); offline",
      "both views render without them — never an error.",
    ].join("\n"),
    next: ["storytree tree", "pnpm db:up"],
  };
}

function noticeboardHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree noticeboard — the session presence board (ADR-0033): advisory, never enforcing.",
      "identity is derived from the enclosing .claude/worktrees/<name> checkout — never typed.",
      "",
      "  storytree noticeboard --pg                                        the board (active sessions)",
      "  storytree noticeboard declare --working-on <prose> [--node <id>]... --pg   declare presence",
      "  storytree noticeboard done --pg                                   mark this session done",
      "",
      "presence needs the live DB: pnpm db:up first. Reads degrade politely without it.",
    ].join("\n"),
    next: ["pnpm db:up", "storytree noticeboard --pg"],
  };
}

function orchestrateHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree orchestrate <intent> — run the session-orchestrator agent HEADLESSLY (ADR-0108 Phase 1).",
      "",
      "Loads the SAME generated `session-orchestrator` agent the terminal session embodies (ADR-0051),",
      "wires the READ-ONLY orientation tools (tree / library / noticeboard), and drives one live SDK",
      "session that ORIENTS on the real three surfaces and PROPOSES a unit. Read/propose ONLY — it holds",
      "no signing key and writes, builds, signs, and lands NOTHING (Phases 3–5 of ADR-0108). One",
      "orchestration at a time.",
      "",
      '  storytree orchestrate "orient and propose the next unit"',
      "  storytree orchestrate <intent> --max-turns <n> --budget <usd> --model <id>",
      "",
      "Live + subscription-billed (needs CLAUDE_CODE_OAUTH_TOKEN). --max-turns gives the agent room to",
      "read several surfaces before proposing (the default 16 is tight for orientation).",
    ].join("\n"),
    next: ["storytree agents session-orchestrator", "storytree tree"],
  };
}

function coverageHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree coverage <capability-id> — does every declared contract have an observed test? (ADR-0020).",
      "",
      "A signed --real green attests the ONE authored test the gate observed (ADR-0020 §3) — it cannot",
      "forge it, but it never checks that EVERY `## Contracts` behaviour has a test (the leaf reliably",
      "drops the hardest one). This flags the gap: a contract no SUBSTANTIVE test covers (the",
      '`describe("<id>: …")` convention) is reported UNCOVERED.',
      "",
      "  storytree coverage <capability-id>   classify the capability's contracts (offline, read-only)",
      "",
      "Exits non-zero when a contract is uncovered (a green would over-claim); a fully-covered unit passes.",
      "A test must RUN and ASSERT to count (ADR-0126): a hollow `assert(true)` (or a skipped test) under",
      "the right name does NOT cover its contract. A substantive-but-irrelevant assertion still reads",
      "covered — judging that is the deeper semantic-reviewer follow-on.",
    ].join("\n"),
    next: ["storytree tree", "storytree coverage <capability-id>"],
  };
}

async function libraryHelp(store: Store): Promise<Envelope> {
  return {
    ok: true,
    body: [
      "storytree library — explore + curate the Library (the knowledge tier).",
      "",
      "  storytree library                          health + dashboard + commands",
      "  storytree library --check [--pg]           full health report (gate-fails exit non-zero)",
      "  storytree library artifact <id>            view one artifact",
      "  storytree library artifact list <category> list a category",
      "  storytree library artifact new|edit <id>   create / edit (writes need --pg)",
      "  storytree library tree focus <id>          the local DAG of one artifact",
      "  storytree library sync-agents [--pg]       reconcile the agent tier to the seed (ADR-0055)",
      "  storytree library sync-corpus [--pg]       migrate seed-only non-agent artifacts into live (ADR-0103)",
      "  storytree library export-corpus [--pg]     export live non-agent bodies back to the seed (ADR-0120)",
      "  storytree library graduate [--review]      agent-memory → Library worklist (ADR-0095)",
      "  (coming soon: artifact comment)",
    ].join("\n"),
    // The "explore just-in-time, drill in to earn the detail" stance is the library's doctrine, not
    // prose restated here (ADR-0029 §7) — surfaced as a pointer the agent can drill into (ADR-0023).
    doctrine: [await renderDoctrine(store, "pull-based-context-architecture")],
    next: ["storytree library"],
  };
}

function artifactHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library artifact — view and (soon) author Library artifacts.",
      "",
      "  storytree library artifact <id>             print an artifact to stdout",
      "  storytree library artifact list <category>  list artifacts in a category",
      "  storytree library artifact new --json '<doc>' | --file <p>   create (needs --pg)",
      "  storytree library artifact edit <id> --set <field>=<value>   edit (needs --pg)",
      "  storytree library artifact retire <id> --reason \"...\" [--superseded-by <ref>]   retire (needs --pg)",
      "  (coming soon: comment <id>)",
    ].join("\n"),
    next: ["storytree library", "storytree library artifact list <category>"],
  };
}

export interface RunDeps {
  readonly store: Store;
  /** True when the store persists across sessions (the live --pg store). Writes require it. */
  readonly writable?: boolean;
  /** Recorded as the event `actor` on writes (per-session attribution). Defaults to "cli". */
  readonly actor?: string;
  /**
   * The presence seam (ADR-0033): `store` is the live presence store when --pg (null offline);
   * `identity` is injectable for tests — when ABSENT it is derived from the enclosing worktree.
   */
  readonly presence?: {
    readonly store?: PresenceStoreLike | null;
    readonly identity?: SessionIdentity | null;
  };
  /**
   * The verdict event log (verdict-glyphs): the live work-store slice when --pg; null/absent
   * offline — the tree's glyph column is then silently absent (never an error).
   */
  readonly verdicts?: VerdictReaderLike | null;
  /**
   * The attestation log (ADR-0044 `attestation-signals`): the live store when --pg;
   * null/absent offline — `storytree attest` then refuses (writes/reads both need it).
   */
  readonly attestations?: AttestationStoreLike | null;
  /**
   * The verdict event log as a WRITE surface (ADR-0082 `uat attest`): the live work store when --pg
   * (the same PgWorkStore as `verdicts`, here typed to expose `appendEvent`); null/absent offline —
   * `storytree uat attest` then refuses (a verdict that does not persist greens nothing).
   */
  readonly uatStore?: UatVerdictStoreLike | null;
  /** The stories/ root the tree view reads. Injectable for tests; defaults to the repo's. */
  readonly storiesDir?: string;
  /**
   * The ADR-number allocator (ADR-0050): the live store when --pg; null/absent offline — `storytree
   * adr new` then falls back to max+1 with a loud "not reserved" warning. Injectable for tests.
   */
  readonly adr?: AdrAllocatorLike | null;
  /** The docs/decisions dir `storytree adr` scans + scaffolds into. Injectable for tests. */
  readonly adrDecisionsDir?: string;
  /**
   * The headless-orchestrator entry's test seam (ADR-0108 Phase 1): an injected scripted `queryFn`
   * lets `storytree orchestrate` be proven offline (no live SDK spend). Absent in production — the
   * command then omits it and `runHeadlessOrchestrator` uses the real SDK `query()` (the live leg).
   */
  readonly orchestrate?: { readonly queryFn?: SdkQueryFn };
}

/** Best-effort current git branch (recorded on an ADR allocation for audit); "unknown" if git can't answer. */
function currentBranch(): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * The session repo's git state an operator attestation pins itself to (ADR-0082): the HEAD it attests
 * and whether the tree is clean. Null when git can't answer (no repo / git missing) — `uat attest`
 * then refuses, because a verdict must pin a real commit.
 */
function readGitState(): GitState | null {
  try {
    const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (commitSha.length === 0) return null;
    const porcelain = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { commitSha, clean: porcelain.trim().length === 0 };
  } catch {
    return null;
  }
}

/** A story's declared UAT tests (parsed from `stories/<id>/story.md`); `[]` for a missing/odd spec. */
function loadStoryUatTests(storiesDir: string, storyId: string): UatTest[] {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return [];
  try {
    return loadNodeSpec(file).uatTests;
  } catch {
    return [];
  }
}

/** A story's reliability gates (parsed from `stories/<id>/story.md`, ADR-0085); `[]` for a missing/odd spec. */
function loadStoryReliabilityGates(storiesDir: string, storyId: string): ReliabilityGate[] {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return [];
  try {
    return loadNodeSpec(file).reliabilityGates;
  } catch {
    return [];
  }
}

/**
 * A story's adoptable facts for the adopt-plan classifier (ADR-0097 Layer 2): its status + declared
 * capabilities + reliability gates. Null for a missing/odd spec or a non-story tier (a capability has
 * no caps/gates of its own to classify).
 */
function loadAdoptPlanStory(storiesDir: string, storyId: string): AdoptPlanStory | null {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return null;
  try {
    const spec = loadNodeSpec(file);
    if (spec.tier !== "story") return null;
    return { status: spec.status, capabilities: spec.capabilities, gates: spec.reliabilityGates };
  } catch {
    return null;
  }
}

/** The directory prefix of a test glob, up to (not including) its first wildcard segment. */
function globBaseDir(glob: string): string {
  const base: string[] = [];
  for (const seg of glob.split("/")) {
    if (seg.includes("*")) break;
    base.push(seg);
  }
  return base.join("/");
}

/** Recursively collect `*.test.ts` files under an absolute dir (a missing/odd dir yields none). */
function walkTestFiles(absDir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory()) out.push(...walkTestFiles(full));
      else if (entry.isFile() && entry.name.endsWith(".test.ts")) out.push(full);
    }
  } catch {
    // A missing / unreadable directory yields no test files.
  }
  return out;
}

/**
 * A capability's coverage facts for the contract-coverage check (ADR-0020 follow-on): its declared
 * `## Contracts` ids + the VOUCHING test names across its proof surface (ADR-0126 — a test only counts
 * if it runs and asserts substantively, so a hollow `assert(true)` is excluded). Null for a missing/odd
 * spec. The proof surface is the registered real-build test file when present (the EXACT file a signed
 * `--real` green attests — the tightest honest signal for the gap), else the package/dir test files
 * walked from the proof scope's test globs (a suite-proven capability). Pure-by-injection seam for
 * `coverageCommand`.
 */
function loadCoverageUnit(storiesDir: string, root: string, unitId: string): CoverageUnit | null {
  const file = findNodeSpecFile(storiesDir, unitId);
  if (file === null) return null;
  let spec: ReturnType<typeof loadNodeSpec>;
  try {
    spec = loadNodeSpec(file);
  } catch {
    return null;
  }
  const real = spec.buildConfig?.real;
  let absFiles: string[];
  if (real?.testFile !== undefined) {
    absFiles = [path.join(root, real.testFile)];
  } else {
    const globs = spec.buildConfig?.scope.testGlobs ?? [];
    const dirs = [...new Set(globs.map((g) => path.join(root, globBaseDir(g))))];
    absFiles = [...new Set(dirs.flatMap((d) => walkTestFiles(d)))];
  }
  const existing = absFiles.filter((f) => existsSync(f));
  const testNames: string[] = [];
  for (const f of existing) {
    try {
      // VOUCHING names only (ADR-0126): a hollow / skipped test contributes nothing, so its contract
      // reads uncovered.
      testNames.push(...extractVouchingTestNames(readFileSync(f, "utf8")));
    } catch {
      // An unreadable test file contributes no names (fail-closed toward "uncovered").
    }
  }
  return {
    tier: spec.tier,
    contractIds: spec.contracts.map((c) => c.id),
    testNames,
    testFiles: existing.map((f) => path.relative(root, f).replace(/\\/g, "/")),
  };
}

/**
 * A story's adoptable facts for the adopt RUN engine (ADR-0097 / ADR-0106): its authored status, its
 * declared reliability gates, and its UAT legs. Null for a missing/odd spec or a non-story tier (a
 * capability has no gates/legs of its own to adopt). Mirrors {@link loadAdoptPlanStory}, which projects
 * the PLAN's fields (caps + gates) off the same spec — the run path needs gates + legs instead.
 */
function loadAdoptStory(storiesDir: string, storyId: string): AdoptStory | null {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return null;
  try {
    const spec = loadNodeSpec(file);
    if (spec.tier !== "story") return null;
    return { status: spec.status, reliabilityGates: spec.reliabilityGates, uatTests: spec.uatTests };
  } catch {
    return null;
  }
}

/**
 * The live status-flip writer the adopt RUN wires (ADR-0097): rewrite a story.md's frontmatter
 * `status: mapped → proposed` on disk. The byte-preserving, fail-closed rewrite is drive's pure
 * {@link flipFrontmatterStatus} (it refuses anything but a mapped→proposed flip); this is the thin fs
 * wrapper — read, flip, and write back ONLY when it actually changed (re-adopting a `proposed` story is
 * a clean no-op). The flip is the LAST step of adopt, so the one-line dirtied tree is the operator's to commit.
 */
function flipStatusToProposedFile(storiesDir: string, storyId: string): FlipResult {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return { ok: false, reason: `story.md not found for "${storyId}"` };
  const raw = readFileSync(file, "utf8");
  const flipped = flipFrontmatterStatus(raw, "mapped", "proposed");
  if (flipped.ok && flipped.changed) writeFileSync(file, flipped.content);
  return flipped;
}

/**
 * The spine's out-of-band observation of a reliability gate's declared command (ADR-0085): split the
 * free command string into an argv, make it spawnable on this platform (the win32 `pnpm` `.cmd`
 * rewrap), run it at the repo root with the shared {@link runShellCommand}, and surface ONLY the exit
 * code. No shell (`execFile` of file+args, injection-safe); a non-zero exit is data, not a throw.
 */
async function observeCommand(command: string): Promise<{ code: number | null }> {
  const parts = command.trim().split(/\s+/);
  const file = parts[0];
  if (file === undefined) return { code: null };
  const cmd = platformShellCommand({ file, args: parts.slice(1), cwd: repoRoot() });
  try {
    const out = await runShellCommand(cmd);
    return { code: out.code };
  } catch {
    // A genuine spawn failure (ENOENT) — the command did not run, so it did not pass (fail-closed).
    return { code: null };
  }
}

/**
 * ADR-0081 (amends ADR-0060): the in-memory verdict store is no longer a build OPTION. A `--live`/
 * `--real` build always persists to the live store so real work feeds the studio's wisp/bloom — there
 * is no run-without-persisting mode — and a `--dry-run` is already in-memory. The CLI refuses
 * `--store memory` here, at the dispatch boundary; the internal `verdictStore:"memory"` injection
 * (the offline test seam for the live/real driver) is untouched because it is not reachable from argv.
 */
function refuseMemoryStore(area: "node" | "story" | "gate", id: string | undefined): Envelope {
  // The retry hint mirrors the area's own verb: node/story `build`, a gate `run --real`.
  const retry =
    area === "gate"
      ? `storytree gate run ${id ?? "<story>#gate-<n>"} --real --pg   (a --real gate build persists by default)`
      : `storytree ${area} build ${id ?? "<id>"} --live   (persists by default — no --store needed)`;
  return {
    ok: false,
    body:
      "--store memory is no longer a build option (ADR-0081, supersedes part of ADR-0060): a --live/--real build\n" +
      "always persists to the live store so real work feeds the studio's wisp/bloom — there is no\n" +
      "run-without-persisting mode. A --dry-run is already in-memory; just drop --store. If the live\n" +
      "store is down, bring it up rather than skipping it.",
    next: ["pnpm db:status", retry],
  };
}

// ---------------------------------------------------------------------------
// build workflow (ADR-0118 — workflow-first CLI surface)
// ---------------------------------------------------------------------------

/** The argv subset the build/gate helpers read (a structural slice of `run`'s parsed `values`). */
interface BuildValues {
  "dry-run"?: boolean;
  live?: boolean;
  real?: boolean;
  "emit-wisp"?: boolean;
  dwell?: string;
  model?: string;
  budget?: string;
  "max-turns"?: string;
  actor?: string;
  store?: string;
  signer?: string;
}

/**
 * The node/story build options threaded from argv. Both `build node` and `build story` (and their
 * `node build`/`story build` back-compat aliases) take the SAME shape, so it is built once here — the
 * single source the dispatch routes into, never re-typed per area (ADR-0118: relocate the primitive,
 * don't fork it).
 */
function nodeStoryBuildOpts(values: BuildValues) {
  return {
    dryRun: values["dry-run"] === true,
    live: values.live === true,
    real: values.real === true,
    emitWisp: values["emit-wisp"] === true,
    ...(values.dwell !== undefined ? { dwellSec: Number(values.dwell) } : {}),
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.budget !== undefined ? { budgetUsd: Number(values.budget) } : {}),
    ...(values["max-turns"] !== undefined ? { maxTurns: Number(values["max-turns"]) } : {}),
    ...(values.actor !== undefined ? { actor: values.actor } : {}),
    ...(values.store !== undefined ? { verdictStore: values.store } : {}),
  };
}

/**
 * Classify a bare `build <id>` target by tier — the CLI mirror of the studio's `routedBuildRunner`
 * (ADR-0118 / ADR-0090): a unit whose spec is a `story` routes to the whole-story chain, anything else
 * (a capability/leaf node — or an unknown id, which `nodeBuild` then guides on) to a single-node build.
 * Pure over the stories dir; the auto-route forwards the operator's explicit flags (the CLI is a
 * superset of the UI — it does not pin `--real`/openPr the way the single studio Build button does).
 */
export function classifyBuildTarget(id: string, storiesDir: string): "node" | "story" {
  const file = findNodeSpecFile(storiesDir, id);
  if (file === null) return "node";
  try {
    return loadNodeSpec(file).tier === "story" ? "story" : "node";
  } catch {
    return "node";
  }
}

/** The `gate` invocation opts (signer + the build-tests `--real` switch), shared by `gate` and `build gate`. */
function makeGateOpts(values: BuildValues): GateOpts {
  return {
    ...(values.signer !== undefined ? { signer: values.signer } : {}),
    ...(values.real === true ? { real: true } : {}),
  };
}

/**
 * Wire the live `gate` seams (verdict store, gate/UAT loaders, git state, the observe runner, the
 * signer resolver, the build-tests driver, the clock) — shared by the `gate` area and the new
 * `build gate` entry so the two are literally one code path (ADR-0118 back-compat aliasing).
 */
function makeGateDeps(deps: RunDeps, values: BuildValues, storiesDir: string): GateDeps {
  return {
    store: deps.uatStore ?? null,
    loadReliabilityGates: (storyId) => loadStoryReliabilityGates(storiesDir, storyId),
    loadUatTests: (storyId) => loadStoryUatTests(storiesDir, storyId),
    gitState: readGitState,
    observe: observeCommand,
    resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
    driveBuildTestsGate: (gate, signer) =>
      driveBuildTestsGate(gate, signer, {
        storiesDir,
        repoRoot: repoRoot(),
        ...(values.store !== undefined ? { verdictStore: values.store } : {}),
        ...(values.model !== undefined ? { model: values.model } : {}),
        ...(values.budget !== undefined ? { budgetUsd: Number(values.budget) } : {}),
        ...(values["max-turns"] !== undefined ? { maxTurns: Number(values["max-turns"]) } : {}),
      }),
    now: () => new Date(),
  };
}

/**
 * `storytree build` — the build WORKFLOW help (ADR-0118). Surfaces the goal (drive red→green) at the
 * top, the tier auto-route, and the nested grain primitives; the moved verbs keep working as aliases.
 */
function buildHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree build — drive red→green (ADR-0118): the build workflow, mirroring the studio's Build button.",
      "",
      "  storytree build <id> [flags]                   AUTO-ROUTE by tier — a story id drives the whole-story",
      "                                                 chain, anything else a single node (mirrors the studio).",
      "  storytree build node <id> [flags]              drive ONE node through the prove-it-gate (was `node build`)",
      "  storytree build node resolve <id>              FREE, read-only: how a node spec resolves (was `node resolve`)",
      "  storytree build story <id> [flags]             drive a WHOLE story's nodes in dependency order (was `story build`)",
      "  storytree build gate <story>#gate-<n> --real   earn a build-tests gate by a real red→green (was `gate run --real`)",
      "",
      "flags: --dry-run (scripted, offline) · --live (SDK smoke) · --real (real build) · --budget <usd> · --model <id>",
      "",
      "An `observe` gate is NOT a build — it is observe-and-signed by adoption: `storytree adopt gate <id>`.",
      "The moved verbs keep working as back-compat aliases (`node build`, `node resolve`, `story build`,",
      "`gate run --real`), so no script or habit breaks — they just relocate under the build workflow.",
    ].join("\n"),
    next: ["storytree build node library-cli --dry-run", "storytree build story library --dry-run"],
  };
}

// ---------------------------------------------------------------------------
// witness workflow (ADR-0118 — the human/operator proof workflow)
// ---------------------------------------------------------------------------

/** The session/agent identity for the proof commands (injected by tests; else derived from the worktree). */
function sessionIdentity(deps: RunDeps): SessionIdentity | null {
  return deps.presence !== undefined && deps.presence.identity !== undefined
    ? deps.presence.identity
    : deriveIdentity();
}

/** The per-test UAT opts threaded from argv — shared by `uat` and `witness list/attest` (one code path). */
function makeUatOpts(values: { outcome?: string; signer?: string; note?: string }) {
  return {
    ...(values.outcome !== undefined ? { outcome: values.outcome } : {}),
    ...(values.signer !== undefined ? { signer: values.signer } : {}),
    ...(values.note !== undefined ? { note: values.note } : {}),
  };
}

/** Wire the live UAT seams (verdict store, test loader, git state, identity, signer, clock). */
function makeUatDeps(deps: RunDeps, identity: SessionIdentity | null, storiesDir: string): UatDeps {
  return {
    store: deps.uatStore ?? null,
    loadUatTests: (storyId) => loadStoryUatTests(storiesDir, storyId),
    gitState: readGitState,
    identity,
    resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
    now: () => new Date(),
  };
}

/** The attestation-vouch opts threaded from argv — shared by `attest` and `witness vouch`. */
function makeAttestOpts(values: {
  outcome?: string;
  witness?: string;
  signer?: string;
  "relayed-by"?: string;
  note?: string;
}) {
  return {
    ...(values.outcome !== undefined ? { outcome: values.outcome } : {}),
    ...(values.witness !== undefined ? { witness: values.witness } : {}),
    ...(values.signer !== undefined ? { signer: values.signer } : {}),
    ...(values["relayed-by"] !== undefined ? { relayedBy: values["relayed-by"] } : {}),
    ...(values.note !== undefined ? { note: values.note } : {}),
  };
}

/** Wire the live attestation seams (store, identity, signer, clock) — shared by `attest` and `witness vouch`. */
function makeAttestDeps(deps: RunDeps, identity: SessionIdentity | null): AttestDeps {
  return {
    store: deps.attestations ?? null,
    identity,
    resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
    now: () => new Date(),
  };
}

/**
 * `storytree witness` — the human/operator proof WORKFLOW (ADR-0118). It cuts across adopt AND build
 * (you witness a story's UAT whether it was adopted or built), so it is its OWN top-level workflow, not
 * nested under either. The per-test UAT proof (`witness list`/`witness attest`) and the lower-rigor vouch
 * (`witness vouch`) relocate here from `uat`/`attest`, which keep working as back-compat aliases.
 */
function witnessHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree witness — the human/operator proof workflow (ADR-0118): witness a story's UAT, whether",
      "it was adopted or built (it cuts across both, so it is its own workflow).",
      "",
      "  storytree witness list <story-id> [--pg]            a story's UAT tests + proven state (was `uat list`)",
      "  storytree witness attest <story>#uat-<n> --pg       sign an operator-attested verdict (was `uat attest`)",
      "  storytree witness vouch <story>#uat-<n> --pg        record a lower-rigor attestation vouch (was `attest`)",
      "  storytree witness vouch list <story>#uat-<n> --pg   a test's vouch history (was `attest list`)",
      "",
      "`witness attest` mints a real `operator-attested` verdict (events.verdict) — it can green a story's",
      "UAT. A `witness vouch` is a signal only (events.attestation), never greens the story (ADR-0044). The",
      "moved verbs keep working as back-compat aliases (`uat list`, `uat attest`, `attest`).",
    ].join("\n"),
    next: ["storytree witness list <story-id> --pg", "storytree tree <story-id> --pg"],
  };
}

/**
 * Parse `argv` and dispatch. `--help`/`-h` shows the page for the deepest area reached; `--pg` is a
 * store-selection flag consumed by `main` (declared here so parsing does not reject it). Returns an
 * {@link Envelope}; `main` formats it and maps `ok` to the exit code.
 */
export async function run(argv: readonly string[], deps: RunDeps): Promise<Envelope> {
  let positionals: string[];
  let help: boolean;
  let values: {
    help?: boolean;
    pg?: boolean;
    check?: boolean;
    json?: string;
    file?: string;
    set?: string[];
    "dry-run"?: boolean;
    live?: boolean;
    real?: boolean;
    "emit-wisp"?: boolean;
    dwell?: string;
    model?: string;
    budget?: string;
    "max-turns"?: string;
    actor?: string;
    store?: string;
    "working-on"?: string;
    node?: string[];
    outcome?: string;
    witness?: string;
    signer?: string;
    "relayed-by"?: string;
    note?: string;
    title?: string;
    supersedes?: string;
    amends?: string;
    decided?: boolean;
    current?: boolean;
    "load-bearing"?: boolean;
    status?: string;
    bound?: string;
    change?: string[];
    reason?: string;
    "superseded-by"?: string;
    "memory-dir"?: string;
    review?: boolean;
    readings?: string;
    write?: boolean;
  };
  try {
    const parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        pg: { type: "boolean", default: false },
        check: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        json: { type: "string" },
        file: { type: "string" },
        set: { type: "string", multiple: true },
        "dry-run": { type: "boolean", default: false },
        live: { type: "boolean", default: false },
        real: { type: "boolean", default: false },
        "emit-wisp": { type: "boolean", default: false },
        dwell: { type: "string" },
        model: { type: "string" },
        budget: { type: "string" },
        "max-turns": { type: "string" },
        actor: { type: "string" },
        store: { type: "string" },
        "working-on": { type: "string" },
        node: { type: "string", multiple: true },
        outcome: { type: "string" },
        witness: { type: "string" },
        signer: { type: "string" },
        "relayed-by": { type: "string" },
        note: { type: "string" },
        title: { type: "string" },
        supersedes: { type: "string" },
        amends: { type: "string" },
        decided: { type: "boolean", default: false },
        current: { type: "boolean", default: false },
        "load-bearing": { type: "boolean", default: false },
        status: { type: "string" },
        bound: { type: "string" },
        change: { type: "string", multiple: true },
        reason: { type: "string" },
        "superseded-by": { type: "string" },
        "memory-dir": { type: "string" },
        review: { type: "boolean", default: false },
        readings: { type: "string" },
        write: { type: "boolean", default: false },
      },
    });
    positionals = parsed.positionals;
    values = parsed.values;
    help = parsed.values.help === true;
  } catch (err) {
    return {
      ok: false,
      body: `bad arguments: ${(err as Error).message}`,
      next: ["storytree library"],
    };
  }

  const [area, sub, third, fourth] = positionals;

  if (area === undefined) return topHelp(deps.store);

  if (area === "node") {
    if (sub === undefined || help) return nodeHelp();
    if (sub === "resolve") {
      // FREE, read-only: how a node spec resolves (no build, no spend). ADR-0057 A discoverability.
      return nodeResolve(third);
    }
    if (sub !== "build") {
      return {
        ok: false,
        body: `unknown node command "${sub}". try: storytree node build <id> --dry-run | storytree node resolve <id>`,
        next: ["storytree node resolve <id>", "storytree node build <id> --dry-run"],
      };
    }
    if (values.store === "memory") return refuseMemoryStore("node", third);
    // `node build <id>` is the back-compat alias for `build node <id>` (ADR-0118) — one code path.
    return nodeBuild(third, nodeStoryBuildOpts(values));
  }

  if (area === "story") {
    if (sub === undefined || help) return storyHelp();
    // ADR-0097 Layer 2's adoption-plan report MOVED to `storytree adopt plan <story>` (the command-surface
    // reshape — adoption actions nest under `adopt`). `story` now drives only the build chain.
    if (sub !== "build") {
      return {
        ok: false,
        body: `unknown story command "${sub}". try: storytree story build <story-id> --dry-run  (adoption-plan moved to: storytree adopt plan <story-id>)`,
        next: ["storytree story build library --dry-run", "storytree adopt plan library"],
      };
    }
    if (values.store === "memory") return refuseMemoryStore("story", third);
    // `story build <id>` is the back-compat alias for `build story <id>` (ADR-0118) — one code path.
    return storyBuild(third, nodeStoryBuildOpts(values));
  }

  if (area === "build") {
    // ADR-0118 — the build WORKFLOW: the top-level goal `build`, with the grain primitives nested.
    // `build <id>` AUTO-ROUTES by tier (mirroring the studio's single Build button / routedBuildRunner);
    // `build node|story|gate` are the explicit primitives the old `node`/`story`/`gate run --real`
    // verbs relocated to (those keep working as back-compat aliases above — one code path each).
    if (help && sub === undefined) return buildHelp();
    if (sub === undefined) return buildHelp();
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");

    if (sub === "node") {
      // `build node resolve <id>` (was `node resolve`) — FREE, read-only spec resolution, no build/spend.
      if (third === "resolve") return nodeResolve(fourth);
      if (third === undefined || help) return nodeHelp();
      if (values.store === "memory") return refuseMemoryStore("node", third);
      return nodeBuild(third, nodeStoryBuildOpts(values));
    }
    if (sub === "story") {
      if (third === undefined || help) return storyHelp();
      if (values.store === "memory") return refuseMemoryStore("story", third);
      return storyBuild(third, nodeStoryBuildOpts(values));
    }
    if (sub === "gate") {
      // `build gate <story>#gate-<n> --real` (was `gate run --real`) — the build-tests primitive. The
      // observe path is NOT here: an observe gate is earned by adoption (`adopt gate`, ADR-0118), not a
      // build. gateRun routes by kind+--real internally, so this is one code path with `gate run`.
      if (third === undefined || help) return gateHelp();
      if (values.store === "memory") return refuseMemoryStore("gate", third);
      return gateCommand(
        { mode: "run", target: third },
        makeGateOpts(values),
        makeGateDeps(deps, values, storiesDir),
      );
    }

    // bare `build <id>` — auto-route by tier (a story → the whole-story chain, else a single node),
    // forwarding the operator's explicit flags (the CLI is a superset of the UI: it does not pin
    // --real/openPr the way the one studio Build button does — the operator says what they want).
    const target = sub;
    const kind = classifyBuildTarget(target, storiesDir);
    if (values.store === "memory") return refuseMemoryStore(kind, target);
    return kind === "story"
      ? storyBuild(target, nodeStoryBuildOpts(values))
      : nodeBuild(target, nodeStoryBuildOpts(values));
  }

  if (area === "noticeboard") {
    if (help) return noticeboardHelp();
    // Identity: injected by tests; otherwise derived from the enclosing worktree (never typed).
    const identity =
      deps.presence !== undefined && deps.presence.identity !== undefined
        ? deps.presence.identity
        : deriveIdentity();
    return noticeboardCommand(
      sub,
      {
        ...(values["working-on"] !== undefined ? { workingOn: values["working-on"] } : {}),
        nodes: values.node ?? [],
      },
      {
        store: deps.presence?.store ?? null,
        identity,
        now: () => new Date(),
      },
    );
  }

  if (area === "tree") {
    if (help) return treeViewHelp();
    return treeCommand(sub, {
      storiesDir: deps.storiesDir ?? path.join(repoRoot(), "stories"),
      // Display-only buildable glyph, registry-based (ADR-0057 follow-up: make it spec-aware off the
      // already-loaded spec's `proof:` block so a self-registered node also glyphs as buildable; the
      // BUILD path is already spec-first via resolveBuildConfig — this is a cosmetic understatement).
      lookupConfig: lookupNodeBuildConfig,
      presence: deps.presence?.store ?? null,
      verdicts: deps.verdicts ?? null,
      attestations: deps.attestations ?? null,
      now: () => new Date(),
    });
  }

  if (area === "attest") {
    // `attest` is the back-compat alias for `witness vouch` (ADR-0118) — the SAME code path.
    if (help || sub === undefined) return attestHelp();
    const identity = sessionIdentity(deps);
    const isList = sub === "list";
    return attestCommand(
      { mode: isList ? "list" : "record", testId: isList ? third : sub },
      makeAttestOpts(values),
      makeAttestDeps(deps, identity),
    );
  }

  if (area === "uat") {
    // ADR-0082 — the per-test UAT proof surface. `uat list`/`uat attest` are the back-compat aliases for
    // `witness list`/`witness attest` (ADR-0118) — the SAME code path, wired via makeUatDeps/makeUatOpts.
    if (help || sub === undefined) return uatHelp();
    const identity = sessionIdentity(deps);
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    const uatDeps = makeUatDeps(deps, identity, storiesDir);
    const uatOpts = makeUatOpts(values);
    if (sub === "attest") return uatCommand({ mode: "attest", target: third }, uatOpts, uatDeps);
    if (sub === "list") return uatCommand({ mode: "list", target: third }, uatOpts, uatDeps);
    // bare: `storytree uat <story-id>` lists that story's tests.
    return uatCommand({ mode: "list", target: sub }, uatOpts, uatDeps);
  }

  if (area === "witness") {
    // ADR-0118 — the human/operator proof WORKFLOW. It cuts across adopt AND build (you witness a
    // story's UAT either way), so it is its OWN workflow. `witness list`/`witness attest` are the per-test
    // UAT proof (was `uat`); `witness vouch` is the lower-rigor ADR-0044 attestation (was `attest`). The
    // old verbs keep working as back-compat aliases — these route to the SAME uat/attest code paths.
    if (sub === undefined || help) return witnessHelp();
    const identity = sessionIdentity(deps);
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    if (sub === "vouch") {
      // `witness vouch <test>` (record) / `witness vouch list <test>` (history) — was `attest` / `attest list`.
      const isList = third === "list";
      return attestCommand(
        { mode: isList ? "list" : "record", testId: isList ? fourth : third },
        makeAttestOpts(values),
        makeAttestDeps(deps, identity),
      );
    }
    const uatDeps = makeUatDeps(deps, identity, storiesDir);
    const uatOpts = makeUatOpts(values);
    if (sub === "attest") return uatCommand({ mode: "attest", target: third }, uatOpts, uatDeps);
    if (sub === "list") return uatCommand({ mode: "list", target: third }, uatOpts, uatDeps);
    // bare `witness <story-id>` lists that story's UAT tests (mirrors bare `uat <story>`).
    return uatCommand({ mode: "list", target: sub }, uatOpts, uatDeps);
  }

  if (area === "gate") {
    // ADR-0085 (ADR-0083 Fork B) — the brownfield reliability-gates proof surface: `gate list <story>`
    // (read) + `gate run <story>#gate-<n>` (observe-and-sign an `observe` gate → an `adopted` verdict).
    // ADR-0098 (U2): `gate run <story>#gate-<n> --real` DRIVES a `build-tests` gate's red→green via the
    // referenced `(build:)` node and signs a DRIVEN verdict for the gate id (the gate→loop wiring).
    // The store/git/observe seams mirror `uat`; the observe runner spawns the gate's declared command.
    if (help || sub === undefined) return gateHelp();
    // ADR-0081: a --real gate build OWNS the DB and always persists — `--store memory` is no build
    // option (the internal "memory" seam is only ever injected into driveBuildTestsGate directly).
    if (values.store === "memory") return refuseMemoryStore("gate", third);
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    // The gate seams + opts are shared with the new `build gate --real` entry (ADR-0118): `gate run`
    // stays as the back-compat alias for both the observe path (→ `adopt gate`, ADR-0118) and the
    // build-tests path (→ `build gate --real`), wired through the same makeGateDeps/makeGateOpts.
    const gateDeps = makeGateDeps(deps, values, storiesDir);
    const gateOpts = makeGateOpts(values);
    if (sub === "run") return gateCommand({ mode: "run", target: third }, gateOpts, gateDeps);
    if (sub === "list") return gateCommand({ mode: "list", target: third }, gateOpts, gateDeps);
    // bare: `storytree gate <story-id>` lists that story's gates.
    return gateCommand({ mode: "list", target: sub }, gateOpts, gateDeps);
  }

  if (area === "drift") {
    if (help) return driftHelp();
    return runDrift({
      ...(values.file !== undefined ? { file: values.file } : {}),
      ...(values.bound !== undefined ? { bound: values.bound } : {}),
      ...(values.change !== undefined ? { changes: values.change } : {}),
      ...(sub !== undefined ? { label: sub } : {}),
    });
  }

  if (area === "adr") {
    if (help) return adrHelp();
    return adrCommand(
      sub,
      {
        ...(values.title !== undefined ? { title: values.title } : {}),
        ...(values.supersedes !== undefined ? { supersedes: values.supersedes } : {}),
        ...(values.amends !== undefined ? { amends: values.amends } : {}),
        ...(values.decided === true ? { decided: true } : {}),
        ...(values.current === true ? { current: true } : {}),
        ...(values["load-bearing"] === true ? { loadBearing: true } : {}),
        ...(values.status !== undefined ? { status: values.status } : {}),
      },
      {
        allocator: deps.adr ?? null,
        decisionsDir: deps.adrDecisionsDir ?? path.join(repoRoot(), "docs", "decisions"),
        // Branch is audit-only and only used on the live (--pg) path; skip the git spawn offline.
        branch: deps.adr ? currentBranch() : "offline",
        actor: deps.actor ?? "cli",
        // The `decided:` date for an owner-directed scaffold (ADR-0110); composition-root clock.
        today: new Date().toISOString().slice(0, 10),
      },
    );
  }

  if (area === "agents") {
    if (help) return agentsHelp();
    return agentsCommand(deps.store, sub);
  }

  if (area === "orchestrate") {
    // ADR-0108 Phase 1 — the headless orchestrator runtime, driven by a programmatic intent. Loads the
    // generated session-orchestrator agent (ADR-0051), wires the READ-ONLY orientation tools, and runs
    // one live SDK session that ORIENTS on the real three surfaces and PROPOSES a unit. Read/propose
    // ONLY: it holds no signing key and writes/builds/signs/lands NOTHING (Phases 3–5).
    if (help) return orchestrateHelp();
    const intent = positionals.slice(1).join(" ").trim();
    if (intent === "") {
      return {
        ok: false,
        body: 'orchestrate needs an intent: storytree orchestrate "<what to orient and propose for>"',
        next: ['storytree orchestrate "orient and propose the next unit"', "storytree agents session-orchestrator"],
      };
    }
    // The orientation runner is the SAME run() dispatch closed over the session deps with
    // writable:false — the session's tools read tree/library/noticeboard and can never write. The
    // queryFn comes from the test seam when present (offline proof, no spend), else is omitted so
    // runHeadlessOrchestrator uses the real SDK query() (the live leg; subscription-billed).
    const result = await orchestrate({
      intent,
      store: deps.store,
      runner: (toolArgv) => run([...toolArgv], { ...deps, writable: false }),
      ...(deps.orchestrate?.queryFn !== undefined ? { queryFn: deps.orchestrate.queryFn } : {}),
      ...(values.model !== undefined ? { model: values.model } : {}),
      ...(values["max-turns"] !== undefined ? { maxTurns: Number(values["max-turns"]) } : {}),
      ...(values.budget !== undefined ? { maxBudgetUsd: Number(values.budget) } : {}),
    });
    if (!result.ok) {
      return {
        ok: false,
        body: `orchestration failed: ${result.error ?? "(no detail)"}`,
        next: ["storytree agents session-orchestrator   (the loop definition the runtime runs)"],
      };
    }
    return {
      ok: true,
      body: [
        "# Orientation / proposal — ADR-0108 Phase 1 (read/propose only; nothing built, signed, or landed)",
        "",
        result.proposal ?? "(no proposal text returned)",
        "",
        `— ${result.turns ?? "?"} turns, $${(result.costUsd ?? 0).toFixed(4)} SDK-reported (subscription-billed)`,
      ].join("\n"),
      next: ["storytree tree", "storytree library"],
    };
  }

  if (area === "adopt") {
    // ADR-0097 / ADR-0106 — the brownfield ADOPTION surface. `adopt <story> --pg` RUNS the adoption
    // (observe-and-sign the `observe` reliability gates + machine UAT legs → `adopted` verdicts, then
    // flip `mapped → proposed`) — the SAME engine the studio's Adopt button drives (adoptStory). `adopt
    // plan <story>` is the offline adoption-plan classification (ADR-0097 Layer 2). The store / git /
    // observe / signer / status-flip seams mirror `gate` (the verdict store is the same PgWorkStore under
    // --pg). ADR-0118: the OBSERVE gate primitive now nests here as `adopt gate <story>#gate-<n>`
    // (observe-and-sign one observe gate — an observe gate IS earned by adoption); the `build-tests`
    // gate, earned by a real red→green BUILD (ADR-0098), lives under `build gate --real` (Unit A), not
    // here. This un-conflates the old `gate run` phase fork at the surface (ADR-0118): observe → adopt,
    // build-tests → build. The honesty walls (only a brownfield story, an observe gate, a resolved
    // approver, the live store, a clean HEAD) live in drive's runAdopt / the gate compute; CLI wires seams.
    if (help || sub === undefined) return adoptHelp();
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    const adoptDeps: AdoptDispatchDeps = {
      store: deps.uatStore ?? null,
      loadStory: (sid) => loadAdoptStory(storiesDir, sid),
      gitState: readGitState,
      observe: observeCommand,
      resolveApprover: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
      flipStatusToProposed: (sid) => flipStatusToProposedFile(storiesDir, sid),
      loadPlanStory: (sid) => loadAdoptPlanStory(storiesDir, sid),
      now: () => new Date(),
    };
    // The approver flag is --signer (preferred) or --actor (the studio worker's name for it, ADR-0097);
    // either feeds the fail-closed chain (flag → STORYTREE_SIGNER → git email) inside runAdopt.
    const approverFlag = values.signer ?? values.actor;
    const adoptOpts = approverFlag !== undefined ? { signer: approverFlag } : {};
    if (sub === "plan") {
      // `--readings <file>` (ADR-0098 d.1): the agent's per-pocket analysis lifts the plan from the
      // mechanical covers-diff to the FULL proposal. The file IO is fail-closed here; the parsed map then
      // flows through the offline-testable dispatcher → adoptPlanCommand.
      let readings: Readonly<Record<string, PocketReading>> | undefined;
      if (values.readings !== undefined) {
        try {
          readings = parsePocketReadings(JSON.parse(readFileSync(values.readings, "utf8")));
        } catch (err) {
          return {
            ok: false,
            body: `--readings: could not read/parse "${values.readings}" as a pocket-readings JSON map — ${err instanceof Error ? err.message : String(err)}`,
            next: ["storytree adopt plan <story-id>"],
          };
        }
      }
      return adoptCommand(
        { mode: "plan", target: third, ...(readings !== undefined ? { readings } : {}) },
        adoptOpts,
        adoptDeps,
      );
    }
    // `adopt gate <story>#gate-<n>` — observe-and-sign ONE observe gate (ADR-0118; was `gate run <g>`,
    // kept as a back-compat alias). The SAME gate code path as `gate run`; the gate's kind routes it (a
    // build-tests gate is NOT adoption — the gate compute refuses it here, pointing at `build gate --real`).
    if (sub === "gate") {
      if (values.store === "memory") return refuseMemoryStore("gate", third);
      return gateCommand(
        { mode: "run", target: third },
        makeGateOpts(values),
        makeGateDeps(deps, values, storiesDir),
      );
    }
    // bare: `storytree adopt <story-id>` RUNS the adoption.
    return adoptCommand({ mode: "run", target: sub }, adoptOpts, adoptDeps);
  }

  if (area === "coverage") {
    // ADR-0020 coverage-honesty follow-on — does every declared contract have an observed test? The
    // unit loader is the pure-by-injection seam (reads the spec's `## Contracts` + the proof surface's
    // test names off disk); the classifier is `@storytree/orchestrator`'s. Offline, read-only.
    if (help) return coverageHelp();
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    const root = repoRoot();
    return coverageCommand(sub, {
      loadUnit: (unitId) => loadCoverageUnit(storiesDir, root, unitId),
    });
  }

  if (area !== "library") {
    return {
      ok: false,
      body: `unknown area "${area}". areas: library, agents, orchestrate, noticeboard, tree, witness, attest, uat, gate, adopt, build, coverage, node, story, drift, adr.`,
      next: ["storytree library", "storytree agents <name>"],
    };
  }

  if (sub === undefined) {
    if (help) return libraryHelp(deps.store);
    if (values.check === true) return libraryCheck(deps.store);
    return dashboard(deps.store);
  }

  if (sub === "sync-agents") return syncAgentsCommand(deps);
  if (sub === "sync-corpus") return syncCorpusCommand(deps);
  if (sub === "export-corpus") return exportCorpusCommand(deps, { write: values.write === true });

  if (sub === "graduate") {
    if (help) return graduateHelp();
    // Default the memory dir to the harness store keyed by the MAIN checkout (works from a worktree);
    // --memory-dir overrides. The snapshot is the offline seed corpus (ADR-0095 reads it, not the DB).
    // `defaultMemoryDir`/`defaultSnapshotPath` are shared with the `check:graduation-worklist` gate
    // nudge so the two never drift on where memory / the seed live (@storytree/cli graduate.ts).
    const memoryDir = values["memory-dir"] ?? defaultMemoryDir(os.homedir());
    return graduateCommand(
      { review: values.review === true },
      {
        memoryDir,
        snapshotPath: defaultSnapshotPath(),
        now: new Date().toISOString().slice(0, 10),
      },
    );
  }

  if (sub === "tree") {
    if (third === undefined || help) return treeHelp();
    if (third !== "focus") {
      return {
        ok: false,
        body: `unknown tree command "${third}". try: storytree library tree focus <id>`,
        next: ["storytree library"],
      };
    }
    return treeFocus(deps.store, fourth);
  }

  if (sub === "artifact") {
    if (third === undefined || help) return artifactHelp();
    if (third === "list") return listCategory(deps.store, fourth);
    if (third === "new") return newArtifact(deps, { json: values.json, file: values.file });
    if (third === "edit") {
      return editArtifact(deps, fourth, {
        sets: values.set ?? [],
        json: values.json,
        file: values.file,
      });
    }
    if (third === "retire") {
      return retireArtifact(deps, fourth, {
        reason: values.reason,
        supersededBy: values["superseded-by"],
      });
    }
    if (third === "comment") {
      return {
        ok: false,
        body: "artifact comment is coming soon (it writes to the separate comment store).",
        next: ["storytree library artifact <id>"],
      };
    }
    return viewArtifact(deps.store, third);
  }

  return {
    ok: false,
    body: `unknown library command "${sub}".`,
    next: ["storytree library", "storytree library artifact list <category>"],
  };
}
