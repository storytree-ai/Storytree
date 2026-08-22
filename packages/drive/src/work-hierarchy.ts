import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parseCiteRef, type CiteScheme } from "@storytree/library";

/**
 * THE WORK-HIERARCHY REF RESOLVER (ADR-0306 D1) — the disk half of the typed `story:` / `capability:`
 * citation edge.
 *
 * ADR-0306 D1 gives the corpus two pointer types that can name a work-hierarchy unit, and states the
 * one rule that makes them safe: *"a resolver turns each into the unit it names, and a validator
 * reports a ref that resolves to nothing. Unresolvable refs are a **report**, not a write-time
 * rejection."* Nothing in this module throws, refuses, or returns an error — every function here
 * answers a question, and it is the CALLER's surface that decides how loudly to say so.
 *
 * That posture is forced by the substrate, not chosen for leniency. The work hierarchy is
 * disk-canonical and lives under `stories/**` (ADR-0002/0010), so **what resolves depends on which
 * branch is checked out**. An increment authored on the branch that CREATES a story must be writable
 * before that story exists anywhere else, and a checkout that lacks the story is not evidence the
 * story is fictional — it is the corpus's own recorded trap, *ref-scoped searches falsify absence*.
 * So "does not resolve here" is the strongest thing this module ever says, and it says it with the
 * checkout named.
 *
 * It sits in `drive` for the reason the arc rollup used to: both readers need it and neither can
 * share `cli` (the studio server must not depend on `@storytree/cli`). The rollup itself has since
 * moved DOWN into `@storytree/arc` (`arc-tier-extraction-arc`) and now reads this module across that
 * boundary — this one stayed, because resolving a `story:`/`capability:` ref against a checkout is
 * the work hierarchy's job, not the arc's. It is the sibling of `storyArcStamps` — the same
 * defensive frontmatter scan of the same tree, answering the other half of ADR-0306 D4's two paths.
 */

/** The three tiers of the work hierarchy (ADR-0002). `contract` never appears in a ref scheme. */
export type WorkTier = "story" | "capability" | "contract";

/** One unit found on disk: its id, its declared tier, and the story directory it lives in. */
export interface WorkUnit {
  readonly id: string;
  readonly tier: WorkTier;
  /** The `stories/<dir>` this spec was found under — a story's own dir is itself. */
  readonly story: string;
}

/** The tier a `story:` / `capability:` scheme demands its target actually be. */
const SCHEME_TIER = { story: "story", capability: "capability" } satisfies Readonly<Record<string, WorkTier>>;

/** Read one `key: value` line out of a leading `---` frontmatter block; undefined when absent. */
function frontmatterField(content: string, key: string): string | undefined {
  if (!content.startsWith("---")) return undefined;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return undefined;
  const fm = content.slice(0, end);
  const m = new RegExp(`^${key}:\\s*["']?([A-Za-z0-9_-]+)["']?\\s*$`, "m").exec(fm);
  return m?.[1];
}

/**
 * PURE-ish (fs read, never throws): every work-hierarchy unit under a stories tree, keyed by id.
 *
 * Layout is `stories/<story>/story.md` for a story and `stories/<story>/<id>.md` for everything
 * below it (the same layout `findNodeSpecFile` walks). The declared `tier` frontmatter wins; when a
 * spec omits it the POSITION decides, so a half-authored file is still placed rather than dropped —
 * an unplaced unit would read as "does not exist", which is the one answer this resolver must not
 * give wrongly.
 *
 * A missing/unreadable directory or file is skipped, never thrown: the view has to stay derivable on
 * a partial checkout, which is the ordinary case this whole edge exists to describe honestly.
 *
 * Ids are assumed unique across the tree (the corpus guard in `packages/cli` enforces it); on a
 * duplicate the FIRST wins and the scan does not complain — deduplicating the work hierarchy is not
 * this reader's job.
 */
export function loadWorkHierarchyIndex(storiesDir: string): Map<string, WorkUnit> {
  const out = new Map<string, WorkUnit>();
  let dirs: string[];
  try {
    dirs = readdirSync(storiesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return out;
  }
  for (const dir of dirs) {
    let files: string[];
    try {
      files = readdirSync(path.join(storiesDir, dir))
        .filter((f) => f.endsWith(".md"))
        .sort();
    } catch {
      continue;
    }
    for (const file of files) {
      const full = path.join(storiesDir, dir, file);
      if (!existsSync(full)) continue;
      let content: string;
      try {
        content = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const isStorySpec = file === "story.md";
      const declaredTier = frontmatterField(content, "tier");
      const tier: WorkTier =
        declaredTier === "story" || declaredTier === "capability" || declaredTier === "contract"
          ? declaredTier
          : isStorySpec
            ? "story"
            : "capability";
      const id = frontmatterField(content, "id") ?? (isStorySpec ? dir : file.slice(0, -3));
      if (!out.has(id)) out.set(id, { id, tier, story: dir });
    }
  }
  return out;
}

/** What {@link resolveCites} concluded about one pointer, against ONE checkout. */
export type CiteStatus =
  /** The unit exists here at the tier the scheme claims. */
  | "resolved"
  /** Nothing of that id is in this checkout — a REPORT, and legal (ADR-0306 D1). */
  | "unresolved"
  /** The id exists but at a different tier — `story:` naming a capability, or the reverse. */
  | "tier-mismatch"
  /** An `asset:` Library pointer: out of this resolver's tree, resolved by the store instead. */
  | "not-checked";

/** One pointer plus what this checkout can say about it. */
export interface ResolvedCite {
  /** The original token, so a caller can print exactly what was authored. */
  readonly ref: string;
  readonly scheme: CiteScheme;
  readonly id: string;
  readonly status: CiteStatus;
  /** On `tier-mismatch`, the tier the unit ACTUALLY has here. */
  readonly actualTier?: WorkTier;
}

/**
 * PURE: resolve an increment's `cites` against one checkout's work hierarchy.
 *
 * `asset:` pointers come back `not-checked` rather than being silently dropped: they ARE resolvable,
 * just not here — they name a Library artifact, and the store is what holds those (the
 * referential-integrity check in `health.ts` fails a dangling one, since an in-library break is a
 * real graph break rather than a branch artefact). Returning them keeps the caller's list total, so
 * a render can show every authored ref rather than a filtered subset that reads as the whole set.
 *
 * A token matching none of the three schemes is skipped entirely — the schema's `CiteRef` regex
 * already refuses one at the write boundary, so reaching this function means the doc predates the
 * field or was written around the validated path, and inventing a status for it would report a
 * resolution failure where the real fault is the token.
 */
export function resolveCites(
  cites: readonly string[],
  index: ReadonlyMap<string, WorkUnit>,
): ResolvedCite[] {
  const out: ResolvedCite[] = [];
  for (const ref of cites) {
    const parsed = parseCiteRef(ref);
    if (parsed === null) continue;
    if (parsed.scheme === "asset") {
      out.push({ ref, scheme: parsed.scheme, id: parsed.id, status: "not-checked" });
      continue;
    }
    const hit = index.get(parsed.id);
    const wanted = SCHEME_TIER[parsed.scheme];
    if (hit === undefined) {
      out.push({ ref, scheme: parsed.scheme, id: parsed.id, status: "unresolved" });
    } else if (wanted !== undefined && hit.tier !== wanted) {
      out.push({
        ref,
        scheme: parsed.scheme,
        id: parsed.id,
        status: "tier-mismatch",
        actualTier: hit.tier,
      });
    } else {
      out.push({ ref, scheme: parsed.scheme, id: parsed.id, status: "resolved" });
    }
  }
  return out;
}

/**
 * The refs this checkout cannot honour, as one-line reasons — the report ADR-0306 D1 asks for, in
 * the words every surface prints. Empty when every work-hierarchy ref lands.
 *
 * `tier-mismatch` is kept DISTINCT from `unresolved` because collapsing them lies in the more
 * expensive direction: a `story:` ref naming a real capability would read as "no such unit", sending
 * a reader to look for something that is right there under a different tier, when the fix is one
 * token. The two states cost one enum value and one branch, and they are not the same defect.
 */
export function danglingCiteReasons(resolved: readonly ResolvedCite[]): string[] {
  const out: string[] = [];
  for (const r of resolved) {
    if (r.status === "unresolved") {
      out.push(`${r.ref} (no such ${r.scheme} in this checkout)`);
    } else if (r.status === "tier-mismatch") {
      out.push(`${r.ref} (exists, but as a ${r.actualTier ?? "?"} — wrong scheme)`);
    }
  }
  return out;
}
