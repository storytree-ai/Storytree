/**
 * `pnpm check:manifest-fragments` — the pure judge (ADR-0556 D4, `repo-manifest-aggregate-leaves-git`).
 *
 * The repo manifest has no committed aggregate any more. Its fragments under `repo-manifest/` are its only
 * authoring surface and its only bytes, and this rung is the gate's and CI's proof of that end state, asked
 * of the checkout exactly as it stands:
 *
 *  1. THE TREE COMPOSES. Every reader stands down on a refused set; this names the refusal once, under the
 *     manifest's own name, rather than leaving three neighbouring rungs to fail on it under theirs.
 *  2. THE TREE IS WRITTEN IN ITS ONE FORM (`manifestDrift`, `@storytree/drive`): each fragment is exactly what
 *     the composer writes for what the tree declares, so its bytes are a function of the declarations and a
 *     drifted tree has one mechanical repair, `--write`.
 *  3. NO AGGREGATE SITS BESIDE IT. Nothing reads a `repo-manifest.json`, so a declaration written into one is
 *     declared nowhere — and a committed one would be the merge surface the arc removed.
 *
 * Nothing is generated and nothing is committed: the rung proves the tree reproduces its own composition, and
 * never puts a composed view back into a diff. Pure — `check-manifest-fragments.ts` supplies what the disk
 * holds.
 */

import {
  composeFragmentTree,
  manifestDrift,
  REPO_MANIFEST_TREE,
  type ManifestDrift,
  type ManifestFragmentTreeRead,
} from "@storytree/drive";

import { MONOLITH } from "./manifest-boundaries.js";

export interface ManifestTreeFacts {
  /** The fragment tree as read off the disk — `null` where there is no tree at all. */
  readonly tree: ManifestFragmentTreeRead | null;
  /** Whether a `repo-manifest.json` sits at the repo root. */
  readonly aggregatePresent: boolean;
}

export interface ManifestTreeVerdict {
  /** Empty ⇒ green. Each is worded as its own repair. */
  readonly refusals: readonly string[];
  /** The repairs `--write` makes — empty unless the tree composes. */
  readonly drift: readonly ManifestDrift[];
  /** How many files the tree held, for the report. */
  readonly fragments: number;
}

export function judgeManifestTree(facts: ManifestTreeFacts): ManifestTreeVerdict {
  const aggregate = facts.aggregatePresent
    ? [
        `${MONOLITH} sits beside the fragment tree, and nothing reads it: the aggregate left Git (ADR-0556 D4), ` +
          `so whatever it declares is declared nowhere — move each declaration into ${REPO_MANIFEST_TREE}/ and delete the file`,
      ]
    : [];
  if (facts.tree === null) {
    return {
      refusals: [
        `no ${REPO_MANIFEST_TREE}/ fragment tree at the repo root — every reader of the manifest reads it, and nothing else holds it`,
        ...aggregate,
      ],
      drift: [],
      fragments: 0,
    };
  }
  const fragments = facts.tree.fragments.length;
  const composition = composeFragmentTree(facts.tree);
  if (!composition.ok) {
    return { refusals: [...composition.faults.map((fault) => fault.message), ...aggregate], drift: [], fragments };
  }
  const drift = manifestDrift(facts.tree.fragments, composition.manifest);
  return { refusals: [...drift.map((d) => d.message), ...aggregate], drift, fragments };
}

export function formatManifestTreeVerdict(verdict: ManifestTreeVerdict): string {
  if (verdict.refusals.length === 0) {
    return (
      `✓ repo manifest (ADR-0556): ${verdict.fragments} fragment(s) under ${REPO_MANIFEST_TREE}/ compose, each written ` +
      "exactly as the composer writes it, and no aggregate sits beside them"
    );
  }
  const lines = [
    `✗ repo manifest (ADR-0556): ${verdict.refusals.length} refusal(s)`,
    ...verdict.refusals.map((refusal) => `  - ${refusal}`),
  ];
  if (verdict.drift.length > 0) {
    lines.push(
      "",
      `${verdict.drift.length} fragment(s) drifted — \`pnpm check:manifest-fragments --write\` rewrites the tree in ` +
        "its one form, and what it declares is unchanged.",
    );
  }
  return lines.join("\n");
}
