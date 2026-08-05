/**
 * The DEFINITIONS PROJECTION — the tiny generated file the `UserPromptSubmit` definition hook reads
 * (ADR-0307 D4).
 *
 * ## Why this exists
 *
 * `packages/cli/definition-injection.mjs` scans each submitted prompt for Library `definition` terms
 * and injects their `oneLine` summaries. It reads the 1.25 MB committed seed corpus to do it — and
 * uses **0.99% of the file**: 52 definitions × (`id`, `title`, `oneLine`) is 11.8 KB. ADR-0302 D1
 * decommits that seed, at which point the hook's `readFileSync` throws ENOENT into its own
 * fail-safe `catch {}` and definition injection **stops silently** — no error, no banner, nothing a
 * session could notice.
 *
 * The hook also cannot follow the other seed consumers onto the live store, and ADR-0307 D4 draws
 * that line as a decision rather than leaving it per-consumer: a generator is *invoked* and may hold
 * a store connection; anything on the harness's startup or per-prompt path may not. The hook is the
 * latter three times over — it runs on every prompt submit and blocks the model's response (~150 ms
 * budget; a Cloud SQL handshake measured 6.9 s cold), it is bare node with zero non-builtin deps so
 * it works in a worktree with no `node_modules`, and it must survive a checkout that has never had
 * credentials.
 *
 * So it gets a **generated projection committed beside it** — the same argument ADR-0302 D5 makes
 * for CLAUDE.md and the harness agent views, applied to data instead of prose.
 *
 * ## Why it ships with the CLI, not with the repo under inspection
 *
 * The file sits next to the hook in `packages/cli/`, not under a repo-root path. Definitions are
 * storytree's METHOD corpus — they describe the way of working, not the project being described —
 * so under ADR-0246's repo-root parameterisation they belong with the tooling, exactly as the studio
 * anchors its own data dir to `studioRoot` rather than `repoRoot` (ADR-0244 D3). A forest for
 * someone else's project still wants storytree's definitions injected.
 *
 * ## What it deliberately does NOT carry
 *
 * Only `id`, `title` and `oneLine` — the three fields the hook reads. Never the `whatItIs` /
 * `whatItIsNot` body: ADR-0156 keeps bodies pull-based behind `storytree library artifact <id>`, and
 * ADR-0135 retired the generated glossary. A projection that grew bodies would re-create it.
 */

/**
 * One definition, as the hook needs it.
 *
 * `kind` is carried even though every entry has the same value: it lets the hook feed this file
 * straight into its own `selectDefinitions`, which filters on `kind === "definition"`. Dropping it
 * would force the hook onto a second, untested code path for projection input — the divergence
 * being worth far more than the ~1.4 KB the repeated field costs.
 */
export interface DefinitionEntry {
  kind: "definition";
  id: string;
  title: string;
  oneLine: string;
}

/** The generated file's name; it lives beside `definition-injection.mjs` in `packages/cli/`. */
export const DEFINITIONS_PROJECTION_BASENAME = "definitions.generated.json";

/** The `kind` this projects. */
const DEFINITION_KIND = "definition" as const;

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

/**
 * PURE: project stored definition docs into the hook's shape.
 *
 * Accepts the `StoredDoc` envelope (`{ id, kind, doc }`) and reads `title` / `oneLine` from the
 * inner doc, falling back to the envelope so a raw seed-shaped array (where the fields are
 * top-level) projects identically — the two shapes differ only by nesting, and accepting both keeps
 * this usable from a store OR from a plain corpus array.
 *
 * Entries without a usable `oneLine` are DROPPED rather than emitted empty: the hook renders
 * `- <id>: <oneLine>`, so a blank one would inject a line that teaches nothing and still spends a
 * slot against the hook's cap.
 *
 * Sorted by id so the output is stable — a projection that reordered on every regeneration would
 * produce a diff per build and re-create the churn this whole effort is removing.
 */
export function buildDefinitionsProjection(docs: readonly unknown[]): DefinitionEntry[] {
  const out: DefinitionEntry[] = [];
  for (const raw of docs) {
    if (typeof raw !== "object" || raw === null) continue;
    const envelope = raw as Record<string, unknown>;
    const inner =
      typeof envelope["doc"] === "object" && envelope["doc"] !== null
        ? (envelope["doc"] as Record<string, unknown>)
        : envelope;
    if (readString(envelope, "kind") !== DEFINITION_KIND && readString(inner, "kind") !== DEFINITION_KIND) {
      continue;
    }
    const id = readString(envelope, "id") || readString(inner, "id");
    const oneLine = readString(inner, "oneLine") || readString(envelope, "oneLine");
    const title = readString(inner, "title") || readString(envelope, "title") || id;
    if (id === "" || oneLine === "") continue;
    out.push({ kind: DEFINITION_KIND, id, title, oneLine });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/**
 * PURE: render the projection file's exact bytes. Pretty-printed with a trailing newline — it is a
 * committed file, so it should diff readably when a definition's wording changes, and a
 * single-line blob would show every regeneration as one giant changed line (the same trap that made
 * the CLAUDE.md generated region conflict-prone).
 */
export function renderDefinitionsProjection(entries: readonly DefinitionEntry[]): string {
  return `${JSON.stringify(entries, null, 2)}\n`;
}
