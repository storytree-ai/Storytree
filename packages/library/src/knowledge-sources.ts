/**
 * "Sources" — the grouped-by-type render of a unit's structured `references`
 * (docs/research/library-sources-unification.md).
 *
 * A unit cites related material with opaque `doc:<relpath>` / `asset:<id>` / `node:<id>` pointers,
 * and — since ADR-0306 D1 — the two typed work-hierarchy schemes `story:<id>` / `capability:<id>`.
 * To read well, we group them by the TYPE of thing they point at (Definitions vs Decisions vs …)
 * rather than dumping a flat list. This is a *live view*: it is computed from `references` at render
 * time (studio, CLI, …), never baked into the stored body — so it never goes stale when a cited
 * artifact is recategorized or retitled.
 *
 * The `doc:` / `node:` / `story:` / `capability:` classification and the group ORDER are corpus-free
 * and owned here (the work tree is not the library's to resolve, so those tokens are their own
 * labels — resolving them against disk is `packages/drive/src/work-hierarchy.ts`'s). Resolving
 * an `asset:<id>` to its category needs the corpus, so {@link groupSources} takes a `resolveAsset`
 * callback — each call site fills it from its own corpus view (the studio from `useAppData`, the
 * CLI from the store, build steps from the loaded corpus). Pure + offline.
 */

import { NODE_REF_PREFIX } from "./oq-gating.js";
import { CAPABILITY_REF_PREFIX, STORY_REF_PREFIX, parseCiteRef } from "./knowledge.js";

/**
 * The fixed display order of Source groups; empty groups are omitted at render time.
 *
 * "Story nodes" sits between the library kinds and the out-of-library pointers: a `node:<id>` ref
 * points at the work tree, not at knowledge. It is placed BEFORE "Decisions (ADRs)" deliberately —
 * the tail `[Decisions (ADRs), Docs & references, Other]` is a pinned invariant.
 */
export const SOURCE_GROUP_ORDER = [
  "Definitions",
  "Principles",
  "Patterns",
  "Guardrails",
  "Tech stack",
  "Templates",
  "Open questions",
  "Story nodes",
  "Decisions (ADRs)",
  "Docs & references",
  "Other",
] as const;

export type SourceGroupName = (typeof SOURCE_GROUP_ORDER)[number];

/** Artifact category (the `kind` / `category` discriminator) → its Source group label. */
const CATEGORY_TO_GROUP: Readonly<Record<string, SourceGroupName>> = {
  definition: "Definitions",
  principle: "Principles",
  pattern: "Patterns",
  guardrail: "Guardrails",
  techstack: "Tech stack",
  template: "Templates",
  "open-question": "Open questions",
  adr: "Decisions (ADRs)",
};

/** One resolved citation, ready to render. `ref` is the original pointer (for the link href). */
export interface ResolvedSource {
  /** The opaque pointer, e.g. `asset:red-green` or `doc:decisions/0007-...md`. */
  readonly ref: string;
  /** Human label: an artifact's title, or the doc relpath. */
  readonly label: string;
}

/** A Source group: a type heading plus its citations, in author (reference) order. */
export interface SourceGroup {
  readonly group: SourceGroupName;
  readonly items: readonly ResolvedSource[];
}

/** The minimal artifact facts {@link groupSources} needs to place + label an `asset:` pointer. */
export interface AssetTarget {
  readonly kind: string;
  readonly title: string;
}

/**
 * Group a unit's `references` by the type of thing each points at, in {@link SOURCE_GROUP_ORDER}.
 * Within a group, citations keep their order in `references` (author intent). Empty groups are
 * dropped. `resolveAsset(id)` returns the target artifact's `{ kind, title }`, or `null`/`undefined`
 * if the id isn't found (rendered under "Other" as an unknown pointer).
 */
export function groupSources(
  references: readonly string[],
  resolveAsset: (id: string) => AssetTarget | null | undefined,
): SourceGroup[] {
  const buckets = new Map<SourceGroupName, ResolvedSource[]>();
  const add = (group: SourceGroupName, item: ResolvedSource): void => {
    const arr = buckets.get(group);
    if (arr) arr.push(item);
    else buckets.set(group, [item]);
  };

  for (const ref of references) {
    if (ref.startsWith("asset:")) {
      const id = ref.slice("asset:".length);
      const hit = resolveAsset(id);
      if (hit) add(CATEGORY_TO_GROUP[hit.kind] ?? "Other", { ref, label: hit.title });
      else add("Other", { ref, label: `${ref} (unknown asset)` });
    } else if (ref.startsWith("doc:")) {
      const rel = ref.slice("doc:".length);
      add(rel.startsWith("decisions/") ? "Decisions (ADRs)" : "Docs & references", { ref, label: rel });
    } else if (ref.startsWith(NODE_REF_PREFIX)) {
      // ADR-0107 D2's third token: a pointer at the story / capability node being proven. Named
      // in that ADR's own costs as the gap this view had ("will show a `node:` ref ungrouped until
      // that view learns the token"). Corpus-free like the `doc:` arm — the node id IS the label;
      // the work tree is not the library's to resolve.
      add("Story nodes", { ref, label: ref.slice(NODE_REF_PREFIX.length) });
    } else if (ref.startsWith(STORY_REF_PREFIX) || ref.startsWith(CAPABILITY_REF_PREFIX)) {
      // ADR-0306 D1's two typed work-hierarchy schemes. They share the "Story nodes" group with
      // `node:` because they point at the same place — the work tree, not at knowledge — and the
      // group's tail order is a pinned invariant, so a fourth and fifth GROUP would move it for a
      // distinction the LABEL can carry instead. The tier is what these tokens add over `node:`, so
      // it is what the label shows; without it a reader could not tell a cited story from a cited
      // capability, which is the whole reason the schemes are typed.
      const parsed = parseCiteRef(ref);
      add("Story nodes", {
        ref,
        label: parsed === null ? ref : `${parsed.id} (${parsed.scheme})`,
      });
    } else {
      add("Other", { ref, label: ref });
    }
  }

  const out: SourceGroup[] = [];
  for (const group of SOURCE_GROUP_ORDER) {
    const items = buckets.get(group);
    if (items && items.length > 0) out.push({ group, items });
  }
  return out;
}
