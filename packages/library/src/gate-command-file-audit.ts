/**
 * ADR-0436 Consequences: "the reverse-direction hole named on `uat-journey-surgery-arc` is closed for
 * gates → criteria ONLY. Its general form — nothing checks that a declared gate's COMMAND CAN RUN —
 * is NOT closed. A gate naming a deleted TEST FILE is the same class of defect and remains unchecked
 * (`ci-cd` gates 1 and 7 were an instance, repaired by hand in PR #1470)." This audit closes that gap.
 *
 * A reliability gate's declared `proofCommand` is a shell command, not a bare path — usually a
 * compound `pnpm`/`node` invocation — so "can this command run" cannot be answered as cheaply as
 * `auditGateCriterionBindings` answers "does this id exist". What CAN be answered cheaply and
 * reliably is narrower and still catches the bitten shape: does every REPO-FILE-SHAPED token the
 * command names (a test file to run, a config file to read) still exist on disk?
 *
 * PURE: this module never touches the filesystem. It extracts path-shaped tokens from each LIVE
 * gate's command by regex ({@link extractGateCommandPathTokens}) and works out which `pnpm --filter`
 * package, if any, the token would resolve relative to ({@link extractFilterTargets}) — the CLI
 * wiring supplies the real package→directory map and the real existence check
 * ({@link auditGateCommandFileRefs}'s `packageDirs` / `fileExists` parameters), the same
 * inject-the-impure-answer split `classifySourceDrift` uses for content hashes.
 *
 * SCOPE, DELIBERATELY NARROW (a general command-interpreter was sized and rejected as not worth it —
 * see the arc increment this closes): a token counts only if it is unambiguously PATH-SHAPED — at
 * least one `/` and a recognised source/config extension — which is exactly the shape of every real
 * file reference measured across the corpus's ~90 gates (`fs.readFileSync('…')` arguments inside
 * inline `node -e` scripts, `--test <path>` / `exec vitest run <path>` / `pnpm … test -- <path>`
 * positionals) and NEVER the shape of the other quoted content those same commands are full of
 * (`'check:boundaries'`, `'uses: actions/checkout@v6'`, `uatc_<hex>` ids — none end in a recognised
 * extension, so none are candidates). ONE audit over the whole corpus (ADR-0097 §2), never one per
 * story or gate.
 *
 * Under-catching (a real broken reference this regex cannot see — e.g. a path built by string
 * concatenation) is the accepted failure direction; a corpus-wide gate must never manufacture a false
 * red by mis-flagging a healthy command.
 */

import { activeReliabilityGates, parseReliabilityGates } from "./reliability-gates.js";

/** One disk-canonical story document supplied by a read-only corpus reader. */
export interface GateCommandFileAuditStory {
  readonly storyId: string;
  /** Repository-relative source path, retained so a reader can locate the declaration. */
  readonly sourcePath: string;
  /** The literal frontmatter-markdown document. This audit never writes it. */
  readonly body: string;
}

/** One read-only audit row: a live gate's command names a file this checkout does not have. */
export interface GateCommandFileAuditRow {
  readonly storyId: string;
  readonly sourcePath: string;
  /** The gate at the centre of the finding. */
  readonly gateId: string;
  /** The path-shaped token exactly as it appears in the declared command. */
  readonly token: string;
  /**
   * Every repo-relative path this audit tried on the token's behalf, in the order tried — a
   * repo-root reading, and (if the command carries one or more `pnpm --filter <pkg>`) one reading
   * per resolvable filter target. NONE of these existed, which is what makes this a finding.
   */
  readonly triedPaths: readonly string[];
  /** A reader-facing sentence naming what is wrong and what to do. */
  readonly detail: string;
}

/**
 * Extensions a path-shaped token must end in to be treated as a file reference. Deliberately a
 * finite, extensible allowlist (add a line, not a new mechanism) rather than "any short suffix" —
 * the latter would treat things like `actions/checkout@v6` or `auth@v3` as candidates.
 */
const PATH_EXTENSIONS = "ts|tsx|js|jsx|mjs|cjs|json|ya?ml|sql|md";

/**
 * A path-shaped token: at least one `/`-separated directory segment, ending in a recognised
 * extension, bounded on both sides by a non-path character (so it never matches a SUBSTRING of a
 * longer non-path run). Matches `.github/workflows/ci.yml`, `packages/cli/src/gate-order.ts`,
 * `src/landing-deps.test.ts` — never `uatc_<hex>` (no `/`), `check:boundaries` (no extension), or
 * `actions/checkout@v6` (`@v6` is not a recognised extension).
 */
const PATH_TOKEN = new RegExp(
  `(?<![\\w./-])((?:\\.\\.?/)?(?:[.\\w-]+/)+[.\\w-]+\\.(?:${PATH_EXTENSIONS}))(?![\\w./-])`,
  "g",
);

/** Strip `http(s)://…` spans before token-scanning, so a URL segment is never mistaken for a repo path. */
const URL_SPAN = /https?:\/\/\S+/g;

/**
 * PURE: every path-shaped token a command names, in first-seen order, deduplicated. Exported so the
 * extraction rule has exactly one home and can be unit-tested against real gate commands directly.
 */
export function extractGateCommandPathTokens(command: string): string[] {
  const scrubbed = command.replace(URL_SPAN, " ");
  const seen = new Set<string>();
  for (const match of scrubbed.matchAll(PATH_TOKEN)) seen.add(match[1]!);
  return [...seen];
}

/** Match a `--filter <pkg>` or `--filter=<pkg>` flag value. pnpm allows either form. */
const FILTER_FLAG = /--filter[=\s]+(\S+)/g;

/**
 * PURE: every `pnpm --filter <pkg>` target a command names, in first-seen order, deduplicated. A
 * command run through `pnpm --filter <pkg> exec|test …` executes with that package's directory as
 * its cwd, so a path token it names resolves THERE, not at the repo root.
 */
export function extractFilterTargets(command: string): string[] {
  const seen = new Set<string>();
  for (const match of command.matchAll(FILTER_FLAG)) seen.add(match[1]!);
  return [...seen];
}

/**
 * PURE: every repo-relative path worth trying for a token drawn from `command` — a repo-root
 * reading always, plus one reading per `--filter` target the command names AND `packageDirs` can
 * resolve (an unresolvable filter, e.g. a typo, is silently skipped rather than guessed at). Order
 * matches {@link extractFilterTargets}'s first-seen order; duplicates collapse.
 */
export function candidatePaths(
  token: string,
  command: string,
  packageDirs: ReadonlyMap<string, string>,
): string[] {
  const candidates = [token];
  for (const pkg of extractFilterTargets(command)) {
    const dir = packageDirs.get(pkg);
    if (dir === undefined) continue;
    const joined = `${dir.replace(/\/+$/, "")}/${token}`;
    if (!candidates.includes(joined)) candidates.push(joined);
  }
  return candidates;
}

/**
 * PURE: audit a disk-canonical corpus for LIVE reliability gates whose declared command names a
 * repo file that does not exist in this checkout. Returns rows in a stable order (by source path,
 * then gate id, then token) — never dependent on the corpus reader's traversal order or on
 * `Set`/regex iteration order. An empty result is the healthy state.
 *
 * `packageDirs` and `fileExists` are the two impure answers a caller must supply (package name →
 * repo-relative directory; whether a repo-relative path exists in the checkout) — this function
 * itself performs no I/O. Retired gates ({@link activeReliabilityGates}) are skipped entirely: a
 * retired gate's command is EXPECTED to be unrunnable, that is the whole point of retiring it
 * (ADR-0436), so auditing one here would just re-report what `(retired)` already declares.
 *
 * NON-VACUITY: a story whose text fails to parse THROWS (inherited from `parseReliabilityGates`)
 * rather than being skipped as clean.
 */
export function auditGateCommandFileRefs(
  stories: readonly GateCommandFileAuditStory[],
  packageDirs: ReadonlyMap<string, string>,
  fileExists: (repoRelativePath: string) => boolean,
): GateCommandFileAuditRow[] {
  const rows: GateCommandFileAuditRow[] = [];

  for (const story of [...stories].sort(compareStories)) {
    const gates = parseReliabilityGates(story.storyId, story.body);
    for (const gate of activeReliabilityGates(gates)) {
      const command = gate.proofCommand;
      if (command === undefined) continue;
      for (const token of extractGateCommandPathTokens(command)) {
        const tried = candidatePaths(token, command, packageDirs);
        if (tried.some((p) => fileExists(p))) continue;
        rows.push({
          storyId: story.storyId,
          sourcePath: story.sourcePath,
          gateId: gate.id,
          token,
          triedPaths: tried,
          detail:
            `${gate.id} declares a command naming \`${token}\`, which does not exist at any of ` +
            `${tried.map((p) => `\`${p}\``).join(" or ")} in this checkout. The gate can never run, ` +
            `so it holds the story crown at \`unproven\` forever (ADR-0085 own-proof union) unless ` +
            `something changes. Either repair the reference, or — if the file's removal was ` +
            `deliberate and the gate is kept only so later gates keep their ordinals — retire it in ` +
            `place with a \`(retired)\` tag (ADR-0436).`,
        });
      }
    }
  }

  return rows.sort(compareRows);
}

function compareStories(a: GateCommandFileAuditStory, b: GateCommandFileAuditStory): number {
  if (a.sourcePath !== b.sourcePath) return a.sourcePath < b.sourcePath ? -1 : 1;
  if (a.storyId !== b.storyId) return a.storyId < b.storyId ? -1 : 1;
  return 0;
}

function compareRows(a: GateCommandFileAuditRow, b: GateCommandFileAuditRow): number {
  if (a.sourcePath !== b.sourcePath) return a.sourcePath < b.sourcePath ? -1 : 1;
  if (a.gateId !== b.gateId) return a.gateId < b.gateId ? -1 : 1;
  return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
}
