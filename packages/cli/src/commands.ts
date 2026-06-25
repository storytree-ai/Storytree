import { existsSync, readFileSync, statSync } from "node:fs";
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
  resolveSignerFromEnv,
  platformShellCommand,
  runShellCommand,
} from "@storytree/orchestrator";
import { renderStoredDoc, syncSeedAgents, syncSeedCorpus } from "@storytree/library/store";

import { execFileSync } from "node:child_process";

import { adrCommand, adrHelp, type AdrAllocatorLike } from "./adr.js";
import { adoptPlanCommand, type AdoptPlanStory } from "./adopt-plan.js";
import { agentsCommand, agentsHelp } from "./agents.js";
import { attestCommand, attestHelp, type AttestationStoreLike } from "./attest.js";
import { runDrift, driftHelp } from "./drift.js";
import { renderDoctrine } from "./doctrine.js";
import { graduateCommand, harnessMemoryDir } from "./graduate.js";
import type { Envelope } from "./envelope.js";
import {
  libraryHealth,
  libraryHealthCheap,
  worstLevel,
  gateFailures,
  levelCounts,
} from "./health.js";
import { lookupNodeBuildConfig } from "@storytree/orchestrator";

import { nodeBuild, nodeHelp, nodeResolve } from "./node-build.js";
import { deriveIdentity, noticeboardCommand } from "./noticeboard.js";
import type { PresenceStoreLike, SessionIdentity } from "./noticeboard.js";
import { findDependents } from "./retire.js";
import { storyBuild, storyHelp } from "./story-build.js";
import { treeCommand } from "./tree.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";
import {
  uatCommand,
  uatHelp,
  type GitState,
  type UatDeps,
  type UatVerdictStoreLike,
} from "./uat.js";
import { gateCommand, gateHelp, type GateDeps } from "./gate.js";
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

/**
 * The MAIN checkout's directory (the `library graduate` default, ADR-0095): the harness keys its
 * agent-memory store by the PRIMARY working directory, never a worktree, so `git worktree list
 * --porcelain` (whose first entry is always the main worktree) resolves it from inside a
 * `.claude/worktrees/<name>` checkout. Falls back to `dir` when git can't answer — the resulting
 * default dir is always overridable with `--memory-dir`.
 */
function mainCheckoutDir(dir: string): string {
  try {
    const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      if (line.startsWith("worktree ")) return path.resolve(line.slice("worktree ".length).trim());
    }
  } catch {
    // git missing / not a repo — fall back to the given dir.
  }
  return dir;
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
      "areas:",
      "  library          explore + curate the Library (the knowledge tier)",
      "  noticeboard      the session presence board (ADR-0033) — view | declare | done",
      "  tree             the work hierarchy — stories, build surface, presence, verdict glyphs",
      "  attest           record a per-UAT-test attestation (ADR-0044) — a signed vouch, not a verdict",
      "  uat              per-test UAT proof (ADR-0082): list a story's tests · attest one (a real verdict)",
      "  gate             brownfield reliability gates (ADR-0085): list a story's gates · run (observe-and-sign) one",
      "  node             drive ONE node through the prove-it-gate (dry-run | live | real)",
      "  story            drive a WHOLE story's nodes in dependency order (Phase E)",
      "  drift            is a proof's bound code still fresh? the binding-staleness flag (ADR-0016)",
      "  adr              search the decision log (adr list) + allocate numbers (ADR-0050/0086)",
      "  agents <name>    assemble an agent's system prompt from the Library (ADR-0051)",
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
    current?: boolean;
    "load-bearing"?: boolean;
    status?: string;
    bound?: string;
    change?: string[];
    reason?: string;
    "superseded-by"?: string;
    "memory-dir"?: string;
    review?: boolean;
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
        current: { type: "boolean", default: false },
        "load-bearing": { type: "boolean", default: false },
        status: { type: "string" },
        bound: { type: "string" },
        change: { type: "string", multiple: true },
        reason: { type: "string" },
        "superseded-by": { type: "string" },
        "memory-dir": { type: "string" },
        review: { type: "boolean", default: false },
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
    return nodeBuild(third, {
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
    });
  }

  if (area === "story") {
    if (sub === undefined || help) return storyHelp();
    if (sub === "adopt-plan") {
      // ADR-0097 Layer 2: the offline adoption-plan report — classify which of a brownfield story's
      // capabilities are covered by a declared `(covers:)` gate vs uncovered (owe real work). Read-only,
      // no DB, no spend; the story-author agent reads this to do the deeper observe/R1/R2 analysis.
      const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
      return adoptPlanCommand(third, { loadStory: (sid) => loadAdoptPlanStory(storiesDir, sid) });
    }
    if (sub !== "build") {
      return {
        ok: false,
        body: `unknown story command "${sub}". try: storytree story build <story-id> --dry-run | storytree story adopt-plan <story-id>`,
        next: ["storytree story build library --dry-run", "storytree story adopt-plan library"],
      };
    }
    if (values.store === "memory") return refuseMemoryStore("story", third);
    return storyBuild(third, {
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
    });
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
    if (help || sub === undefined) return attestHelp();
    // Identity (the scribing agent for relayedBy): injected by tests; else derived from the worktree.
    const identity =
      deps.presence !== undefined && deps.presence.identity !== undefined
        ? deps.presence.identity
        : deriveIdentity();
    const isList = sub === "list";
    return attestCommand(
      { mode: isList ? "list" : "record", testId: isList ? third : sub },
      {
        ...(values.outcome !== undefined ? { outcome: values.outcome } : {}),
        ...(values.witness !== undefined ? { witness: values.witness } : {}),
        ...(values.signer !== undefined ? { signer: values.signer } : {}),
        ...(values["relayed-by"] !== undefined ? { relayedBy: values["relayed-by"] } : {}),
        ...(values.note !== undefined ? { note: values.note } : {}),
      },
      {
        store: deps.attestations ?? null,
        identity,
        resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
        now: () => new Date(),
      },
    );
  }

  if (area === "uat") {
    // ADR-0082 — the per-test UAT proof surface: `uat list <story>` (read) + `uat attest <test>` (write
    // a signed operator-attested verdict). Identity (the no-self-attest guard) is injected by tests,
    // else derived from the worktree; git state pins the attested commit.
    if (help || sub === undefined) return uatHelp();
    const identity =
      deps.presence !== undefined && deps.presence.identity !== undefined
        ? deps.presence.identity
        : deriveIdentity();
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    const uatDeps: UatDeps = {
      store: deps.uatStore ?? null,
      loadUatTests: (storyId) => loadStoryUatTests(storiesDir, storyId),
      gitState: readGitState,
      identity,
      resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
      now: () => new Date(),
    };
    const uatOpts = {
      ...(values.outcome !== undefined ? { outcome: values.outcome } : {}),
      ...(values.signer !== undefined ? { signer: values.signer } : {}),
      ...(values.note !== undefined ? { note: values.note } : {}),
    };
    if (sub === "attest") return uatCommand({ mode: "attest", target: third }, uatOpts, uatDeps);
    if (sub === "list") return uatCommand({ mode: "list", target: third }, uatOpts, uatDeps);
    // bare: `storytree uat <story-id>` lists that story's tests.
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
    const gateDeps: GateDeps = {
      store: deps.uatStore ?? null,
      loadReliabilityGates: (storyId) => loadStoryReliabilityGates(storiesDir, storyId),
      loadUatTests: (storyId) => loadStoryUatTests(storiesDir, storyId),
      gitState: readGitState,
      observe: observeCommand,
      resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
      // ADR-0098 (U2): the build driver for a `build-tests --real` run — resolves the `(build:)` node's
      // real config, drives the prove-it-gate in a fresh worktree, and signs for the gate id. The
      // store/worktree/leaf I/O lives here, keeping gate.ts pure (it just routes to this seam).
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
    const gateOpts = {
      ...(values.signer !== undefined ? { signer: values.signer } : {}),
      ...(values.real === true ? { real: true } : {}),
    };
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
      },
    );
  }

  if (area === "agents") {
    if (help) return agentsHelp();
    return agentsCommand(deps.store, sub);
  }

  if (area !== "library") {
    return {
      ok: false,
      body: `unknown area "${area}". areas: library, agents, noticeboard, tree, attest, uat, gate, node, story, adr.`,
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

  if (sub === "graduate") {
    if (help) return graduateHelp();
    // Default the memory dir to the harness store keyed by the MAIN checkout (works from a worktree);
    // --memory-dir overrides. The snapshot is the offline seed corpus (ADR-0095 reads it, not the DB).
    const memoryDir = values["memory-dir"] ?? harnessMemoryDir(os.homedir(), mainCheckoutDir(repoRoot()));
    return graduateCommand(
      { review: values.review === true },
      {
        memoryDir,
        snapshotPath: path.join(repoRoot(), "apps", "studio", "data", "knowledge.json"),
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
