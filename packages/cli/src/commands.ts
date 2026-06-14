import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import type { Store, StoredDoc } from "@storytree/core";
import {
  upcastAndValidate,
  groupSources,
  CURRENT_SCHEMA_VERSION,
  KIND_SPECS,
  resolveSignerFromEnv,
} from "@storytree/core";
import { renderStoredDoc } from "@storytree/store";

import { execFileSync } from "node:child_process";

import { adrCommand, adrHelp, type AdrAllocatorLike } from "./adr.js";
import { agentsCommand, agentsHelp } from "./agents.js";
import { attestCommand, attestHelp, type AttestationStoreLike } from "./attest.js";
import { renderDoctrine } from "./doctrine.js";
import type { Envelope } from "./envelope.js";
import {
  libraryHealth,
  libraryHealthCheap,
  worstLevel,
  gateFailures,
  levelCounts,
} from "./health.js";
import { lookupNodeBuildConfig } from "@storytree/orchestrator";

import { nodeBuild, nodeHelp } from "./node-build.js";
import { deriveIdentity, noticeboardCommand } from "./noticeboard.js";
import type { PresenceStoreLike, SessionIdentity } from "./noticeboard.js";
import { storyBuild, storyHelp } from "./story-build.js";
import { treeCommand } from "./tree.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";

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
    "  tree focus <id>               the local DAG of one artifact",
    "  (coming soon: artifact comment)",
  );
  return {
    ok: true,
    body: lines.join("\n"),
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
function notWritable(): Envelope {
  return {
    ok: false,
    body: "writes go to the shared store, not the offline copy — run with --pg (and bring the DB up first: pnpm db:up).",
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
  if (deps.writable !== true) return notWritable();

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
  if (deps.writable !== true) return notWritable();
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

function topHelp(): Envelope {
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
      "  node             drive ONE node through the prove-it-gate (dry-run | live | real)",
      "  story            drive a WHOLE story's nodes in dependency order (Phase E)",
      "  adr              allocate the next ADR number from the live store (ADR-0050) — no collisions",
      "  agents <name>    assemble an agent's system prompt from the Library (ADR-0051)",
      "",
      "start here:",
      "  storytree library    health + a map of every artifact + the commands",
    ].join("\n"),
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

function libraryHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library — explore the Library, choose-your-own-adventure style.",
      "context is just-in-time: drill in to earn the detail.",
      "",
      "  storytree library                          health + dashboard + commands",
      "  storytree library --check [--pg]           full health report (gate-fails exit non-zero)",
      "  storytree library artifact <id>            view one artifact",
      "  storytree library artifact list <category> list a category",
      "  storytree library tree focus <id>          the local DAG of one artifact",
      "  (coming soon: artifact new|edit|comment)",
    ].join("\n"),
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

  if (area === undefined) return topHelp();

  if (area === "node") {
    if (sub === undefined || help) return nodeHelp();
    if (sub !== "build") {
      return {
        ok: false,
        body: `unknown node command "${sub}". try: storytree node build <id> --dry-run`,
        next: ["storytree node build <id> --dry-run"],
      };
    }
    return nodeBuild(third, {
      dryRun: values["dry-run"] === true,
      live: values.live === true,
      real: values.real === true,
      ...(values.model !== undefined ? { model: values.model } : {}),
      ...(values.budget !== undefined ? { budgetUsd: Number(values.budget) } : {}),
      ...(values["max-turns"] !== undefined ? { maxTurns: Number(values["max-turns"]) } : {}),
      ...(values.actor !== undefined ? { actor: values.actor } : {}),
      ...(values.store !== undefined ? { verdictStore: values.store } : {}),
    });
  }

  if (area === "story") {
    if (sub === undefined || help) return storyHelp();
    if (sub !== "build") {
      return {
        ok: false,
        body: `unknown story command "${sub}". try: storytree story build <story-id> --dry-run`,
        next: ["storytree story build library --dry-run"],
      };
    }
    return storyBuild(third, {
      dryRun: values["dry-run"] === true,
      live: values.live === true,
      ...(values.model !== undefined ? { model: values.model } : {}),
      ...(values.budget !== undefined ? { budgetUsd: Number(values.budget) } : {}),
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

  if (area === "adr") {
    if (help) return adrHelp();
    return adrCommand(
      sub,
      {
        ...(values.title !== undefined ? { title: values.title } : {}),
        ...(values.supersedes !== undefined ? { supersedes: values.supersedes } : {}),
        ...(values.amends !== undefined ? { amends: values.amends } : {}),
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
      body: `unknown area "${area}". areas: library, agents, noticeboard, tree, attest, node, story, adr.`,
      next: ["storytree library", "storytree agents <name>"],
    };
  }

  if (sub === undefined) {
    if (help) return libraryHelp();
    if (values.check === true) return libraryCheck(deps.store);
    return dashboard(deps.store);
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
