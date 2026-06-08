import { parseArgs } from "node:util";

import type { Store, StoredDoc } from "@storytree/core";
import { renderStoredDoc } from "@storytree/store";

import type { Envelope } from "./envelope.js";

/**
 * The Library commands (ADR-0022). Read-only walking skeleton: `library` (dashboard), `artifact <id>`
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
  const lines: string[] = [
    `Library: OK — ${docs.length} artifacts across ${kinds.length} categories.`,
    "",
  ];
  for (const kind of kinds) {
    const arr = groups.get(kind) ?? [];
    lines.push(`${kind}  (${arr.length})`, ...idTitleRows(arr), "");
  }
  lines.push(
    "commands  (drill in with `storytree library <command> --help`):",
    "  artifact <id>              view one artifact",
    "  artifact list <category>   list a category",
    "  (coming soon: artifact new|edit|comment, tree focus <id>)",
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
  if (a.references.length > 0) {
    lines.push("", "references:", ...a.references.map((r) => `  - ${r}`));
  }
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      `storytree library tree focus ${a.id}   (coming soon — its local DAG)`,
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
    doctrine: [
      "edit-first-curation — search before you write; edit beats create.  (storytree library artifact edit-first-curation)",
    ],
    next: ["storytree library artifact <id>"],
  };
}

function topHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree — the agent's interface to the project (ADR-0022).",
      "",
      "areas:",
      "  library          explore + curate the Library (the knowledge tier)",
      "  agents <name>    (coming soon) an agent's system prompt",
      "",
      "start here:",
      "  storytree library    health + a map of every artifact + the commands",
    ].join("\n"),
    next: ["storytree library"],
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
      "  storytree library artifact <id>            view one artifact",
      "  storytree library artifact list <category> list a category",
      "  (coming soon: artifact new|edit|comment, tree focus <id>)",
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
      "  storytree library artifact <id>            print an artifact to stdout",
      "  storytree library artifact list <category> list artifacts in a category",
      "  (coming soon: new <kind>, edit <id>, comment <id>)",
    ].join("\n"),
    next: ["storytree library", "storytree library artifact list <category>"],
  };
}

export interface RunDeps {
  readonly store: Store;
}

/**
 * Parse `argv` and dispatch. `--help`/`-h` shows the page for the deepest area reached; `--pg` is a
 * store-selection flag consumed by `main` (declared here so parsing does not reject it). Returns an
 * {@link Envelope}; `main` formats it and maps `ok` to the exit code.
 */
export async function run(argv: readonly string[], deps: RunDeps): Promise<Envelope> {
  let positionals: string[];
  let help: boolean;
  try {
    const parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        pg: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    positionals = parsed.positionals;
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
  if (area !== "library") {
    return {
      ok: false,
      body: `unknown area "${area}". areas: library (agents coming soon).`,
      next: ["storytree library"],
    };
  }

  if (sub === undefined) return help ? libraryHelp() : dashboard(deps.store);
  if (sub !== "artifact") {
    return {
      ok: false,
      body: `unknown library command "${sub}".`,
      next: ["storytree library", "storytree library artifact list <category>"],
    };
  }

  if (third === undefined || help) return artifactHelp();
  if (third === "list") return listCategory(deps.store, fourth);
  return viewArtifact(deps.store, third);
}
