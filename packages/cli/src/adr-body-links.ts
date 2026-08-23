/**
 * Markdown cross-links between decision BODIES that still address a deleted file.
 *
 * ONE regex, TWO callers, deliberately. The `adr-body-links` rung in `adr-health.ts` reports these,
 * and {@link delinkDecisionFileLinks} removes them. If the finder and the fixer ever used separate
 * patterns, a link the fixer skipped would still read as clean to the gate — the
 * cheap-prefilter-narrower-than-its-matcher shape, where the two copies of one assumption drift and
 * a skipped input is indistinguishable from an absent one.
 *
 * ## WHY THESE EXIST AND WHY THEY ARE DEAD
 *
 * Until ADR-0403 dec 1 a decision was a FILE under `docs/decisions/`, so a body could address a
 * sibling by a relative markdown link: `[ADR-0139](0139-the-accepted-adr-set-….md)`. PR #1546 deleted
 * every one of those files. The links survived verbatim in the migrated row bodies — correctly, since
 * the migration's job was to preserve prose, not to edit it — and 3,300 of them across 318 of 412
 * rows now render as links to nothing in the studio and in `storytree library artifact adr-NNNN`.
 * Under ADR-0139 an accepted ADR carries no stale prose, and a dead link is stale prose.
 *
 * ## WHY DE-LINKING, RATHER THAN RE-POINTING
 *
 * The NUMBER is the address now. There is no stable per-decision URL to re-point at, and the
 * structural pointer is already carried: the migration loader lifted every body cross-link into
 * `references` as `asset:adr-NNNN`, where `referential-integrity` reads it. So the words are the only
 * thing left to preserve, and `storytree library artifact adr-NNNN` is the verb that opens one. This
 * is the same transformation `decision-log-readers-arc` increment 05 applied to 301 committed
 * markdown links, for the same reason.
 *
 * ## WHY THIS IS A GATE RUNG AND NOT A ONE-SHOT
 *
 * `adr-link-integrity` — the rung that guarded these links against rename rot while they were files —
 * was retired by ADR-0403 on the grounds that its rot class was rehomed into `references`. That held
 * for the DATA and not for the PROSE, and the lifting was a ONE-SHOT: `store/load-decisions.ts` ran
 * once and has since been deleted, so nothing has lifted a body cross-link authored after
 * 2026-08-22 05:21. Measured: three edges (adr-0085 → adr-0395, adr-0222 → adr-0395,
 * adr-0395 → adr-0085) were authored into bodies AFTER the migration and are absent from
 * `references` for exactly that reason. The class is live, not historical, so removing the 3,300
 * without a guard would leave the next one to be found by a reader.
 */

/**
 * A markdown link whose target is a decision FILE: an optional relative prefix, then `NNNN-` and a
 * `.md` basename.
 *
 * The link text excludes `[` and `]` BOTH. Excluding only `]` (as the retired migration loader's
 * pattern did) makes the match start at the opening bracket of any enclosing bracketed aside —
 * `[Amended by [ADR-0272](0272-….md)]` captures `Amended by [ADR-0272` as the text — and the
 * replacement would then eat the aside's own bracket. Excluding both anchors on the link's own `[`.
 *
 * The path segment excludes `/` so the match cannot run past a directory boundary into an unrelated
 * `.md` file, and the prefix alternatives are exactly the four spellings the corpus uses
 * (`0139-x.md`, `./0139-x.md`, `../../0139-x.md`, `docs/decisions/0139-x.md` and its `../` forms).
 */
const DECISION_FILE_LINK =
  /\[([^[\]]*)\]\((?:\.\/)?(?:\.\.\/)*(?:docs\/)?(?:decisions\/)?(\d{4})-[^)/]*?\.md\)/g;

/** One dead cross-link found in a decision body. */
export interface DecisionFileLink {
  /** The link text, verbatim — what survives de-linking. */
  readonly text: string;
  /** The decision number the target file named. */
  readonly number: number;
  /** The whole `[text](target)` span, for a diagnostic that quotes what it found. */
  readonly raw: string;
}

/** PURE: every decision-file cross-link in one body, in source order. */
export function findDecisionFileLinks(body: string): DecisionFileLink[] {
  const found: DecisionFileLink[] = [];
  // `matchAll` on a `g` regex does not share `lastIndex` across calls the way `exec` does, so the
  // module-level constant stays safe to reuse from both callers.
  for (const m of body.matchAll(DECISION_FILE_LINK)) {
    const text = m[1];
    const raw4 = m[2];
    if (text === undefined || raw4 === undefined) continue;
    found.push({ text, number: Number(raw4), raw: m[0] });
  }
  return found;
}

/** `12` → `ADR-0012`. */
function adrRef(n: number): string {
  return `ADR-${String(n).padStart(4, "0")}`;
}

/**
 * PURE: the replacement text for one dead link — the words, with the address guaranteed to survive.
 *
 * Three shapes, measured across all 3,300 occurrences rather than imagined:
 *
 * 1. **`[ADR-0139](0139-….md)`** (3,229 of them) → `ADR-0139`. The overwhelming default: the text
 *    already IS the address, so de-linking loses nothing at all.
 * 2. **The text mentions the target number some other way** (14) — `[ADR-0074 §6](0074-….md)`,
 *    `[ADR-0011: Own the agent loop](0011-….md)` → kept verbatim. Still self-addressing.
 * 3. **The text does NOT carry the number** (57) — `[the owner-fork bar](0097-….md)`,
 *    `` [`reference-dont-restate`](0029-….md) ``, and the bare-number reference lists
 *    `[0145](0145-….md)` → `the owner-fork bar (ADR-0097)`, and the bare-number form is promoted
 *    outright to `ADR-0145` rather than left as a naked `0145`. Dropping the target here would erase
 *    a pointer rather than tidy one, which is the difference between de-linking and deleting.
 */
export function delinkedText(link: DecisionFileLink): string {
  const trimmed = link.text.trim();
  // A bare `0145` was only ever legible as the link's own label. Promote it, don't strand it.
  if (/^\d{4}$/.test(trimmed) && Number(trimmed) === link.number) return adrRef(link.number);
  // `ADR-0074 §6` / `ADR-0011: …` / `renamed by ADR-0078` — the address is already in the words.
  if (new RegExp(`ADR-0*${String(link.number)}\\b`).test(link.text)) return link.text;
  return `${link.text} (${adrRef(link.number)})`;
}

/**
 * PURE: one decision body with every dead cross-link de-linked. Idempotent — the output contains no
 * match, so a second pass is a no-op, which is what makes the migration safe to re-run.
 */
export function delinkDecisionFileLinks(body: string): string {
  return body.replace(DECISION_FILE_LINK, (raw, text: string, num: string) =>
    delinkedText({ text, number: Number(num), raw }),
  );
}

// ---------------------------------------------------------------------------------------------
// The SECOND link class in the same bodies: markdown links to REPO PATHS.
// ---------------------------------------------------------------------------------------------

/**
 * A markdown link whose target is a REPO PATH reached by `../` — the class increment 07 measured
 * and deliberately left, and which increment 09 found needs no per-target judgment after all.
 *
 * ## WHY THIS LOOKED LIKE 96 LOOKUPS AND IS ACTUALLY ONE RULE
 *
 * The worry was that unlike the decision cross-links, these are NOT uniformly dead: some name live
 * source (`packages/orchestrator/src/prove-it-gate.ts` exists), some name files ADR-0302 deleted
 * (`apps/studio/data/knowledge.json`), some name paths that MOVED — so keep / re-point / de-link
 * looked like a per-target call across 96 targets.
 *
 * MEASURED OVER ALL 230 OCCURRENCES, AND THE FORM SETTLES IT: every single one is `../`-relative,
 * and NONE is root-relative. They were all written to resolve from `docs/decisions/`, the directory
 * PR #1546 deleted. A row has no location, so there is no base to resolve them from — which means
 * whether the TARGET still exists has no bearing on whether the LINK works. None of them work. The
 * live ones are not a different case; they are the same broken link pointing at a file that happens
 * to survive.
 *
 * The depth confirms the base rather than assuming it: 46 occurrences at one `../` land in
 * `research` / `guidelines` / `design` / `open-questions.md` (all `docs/` children), and 184 at two
 * land in `packages` / `stories` / `apps` / `web` / `.gitmodules` (all repo-ROOT children). Not one
 * exception, which is what makes {@link rootedRepoPath} a mechanical rewrite rather than a guess.
 *
 * ## WHAT REPLACES THEM, AND WHAT IS DELIBERATELY NOT DECIDED HERE
 *
 * A backticked ROOTED path — strictly more useful than what it replaces, since it resolves from the
 * repo root a reader actually has, where the original resolved from nowhere.
 *
 * A path naming a DELETED file is left standing as prose, and that is not an oversight. A body
 * sentence about `packages/core/src/anchor.ts` is describing what was true when the decision was
 * made, and ADR-0139's true-in-full rule is about claims, not about history. Whether a given
 * sentence has been overtaken is a per-body judgment for the librarian; the LINK is the mechanical
 * defect, because it is a false affordance no reader can follow.
 *
 * ## THE ONE THING THIS PATTERN MUST NOT SWALLOW
 *
 * `../0139-slug.md` is a DECISION-file link and belongs to {@link findDecisionFileLinks} — it gets a
 * different replacement, one that promotes the number rather than a path. The two finders are
 * mutually exclusive by construction ({@link isDecisionFileTarget}) rather than by call order, so
 * neither depends on running first and a body can be scanned by either alone.
 *
 * Absolute `https://` links are untouched and always were: 28 of them sit in these bodies, and a URL
 * resolves the same from a row as from a file.
 */
const REPO_PATH_LINK = /\[([^[\]]*)\]\(((?:\.\.\/)+[^)\s]+)\)/g;

/** The decision-FILE shape, once the `../` prefix is off — {@link findDecisionFileLinks}'s domain. */
function isDecisionFileTarget(target: string): boolean {
  const rest = target.replace(/^(?:\.\.\/)+/, "").replace(/^docs\//, "").replace(/^decisions\//, "");
  return /^\d{4}-[^/]*\.md$/.test(rest);
}

/**
 * PURE: `../research/x.md` → `docs/research/x.md`; `../../packages/y.ts` → `packages/y.ts`.
 *
 * A decision file lived at `docs/decisions/NNNN-slug.md`, so one `../` is `docs/` and two is the
 * repo root. Depth 3+ does not occur in the corpus and is treated as the root rather than invented
 * above it — a path that walks out of the repo has no meaning to a reader, and the root is the
 * nearest honest answer.
 */
export function rootedRepoPath(target: string): string {
  const depth = (target.match(/\.\.\//g) ?? []).length;
  const rest = target.replace(/^(?:\.\.\/)+/, "");
  return depth === 1 ? `docs/${rest}` : rest;
}

/** One repo-path link found in a decision body. */
export interface RepoPathLink {
  /** The link text, verbatim — what survives de-linking. */
  readonly text: string;
  /** The link target as authored, `../` prefix and all. */
  readonly target: string;
  /** The whole `[text](target)` span, for a diagnostic that quotes what it found. */
  readonly raw: string;
}

/** PURE: every repo-path link in one body, in source order. Decision-file links are NOT included. */
export function findRepoPathLinks(body: string): RepoPathLink[] {
  const found: RepoPathLink[] = [];
  for (const m of body.matchAll(REPO_PATH_LINK)) {
    const text = m[1];
    const target = m[2];
    if (text === undefined || target === undefined) continue;
    if (isDecisionFileTarget(target)) continue;
    found.push({ text, target, raw: m[0] });
  }
  return found;
}

/**
 * PURE: the replacement for one repo-path link — the words, with the address guaranteed to survive.
 *
 * The same three-shape rule {@link delinkedText} applies to the decision class, because the corpus
 * has the same three shapes here:
 *
 * 1. **The text already IS the address** — `` [`docs/research/agentic-foundation-survey.md`](../research/…) ``
 *    → kept verbatim, backticks and all. De-linking loses nothing.
 * 2. **The text CONTAINS the rooted path** → kept verbatim, same reason.
 * 3. **The text names the target some other way** — `` [`agent-library-interaction`](../research/…) ``,
 *    `[§5](../open-questions.md)`, `[test-command-registry.ts](../../packages/…)` → the words, then
 *    the rooted path in backticks. Dropping the target for these would erase a pointer rather than
 *    tidy one, which is the whole difference between de-linking and deleting.
 */
export function delinkedRepoPathText(link: RepoPathLink): string {
  const rooted = rootedRepoPath(link.target);
  const bare = link.text.trim().replace(/^`+/, "").replace(/`+$/, "");
  if (bare === rooted || bare === link.target || link.text.includes(rooted)) return link.text;
  return `${link.text} (\`${rooted}\`)`;
}

/**
 * PURE: one decision body with every repo-path link de-linked. Idempotent — the replacement carries
 * no `](`, so a second pass matches nothing and re-running the migration is safe.
 */
export function delinkRepoPathLinks(body: string): string {
  return body.replace(REPO_PATH_LINK, (raw: string, text: string, target: string) =>
    isDecisionFileTarget(target) ? raw : delinkedRepoPathText({ text, target, raw }),
  );
}
