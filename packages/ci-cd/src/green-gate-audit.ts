// green-gate-audit.ts — pure static-YAML readers for the `green-gate` capability.
//
// Every export here is a PURE reader: text in, data out. None of them touch disk — the caller reads
// `.github/workflows/ci.yml` (or a fixture) and hands the text in. There is no YAML dependency in this
// workspace (and none may be added — see the node spec), so parsing is a small line-oriented reader
// tuned to the two-space-indent shape GitHub Actions workflows in this repo actually use: a block key
// ("key:" with nothing after the colon) opens a nested section whose children are indented two spaces
// deeper, and a scalar key ("key: value") carries its value on the same line.
//
// That shape is sufficient for what this module reads (job identity, step boundaries, `ref:`/
// `continue-on-error:`/`run:`/`needs:` values) and deliberately does not attempt to be a general YAML
// parser — it would be unproven surface area for behaviour nothing here demands.

const JOB_KEY_INDENT = 2;

/** A YAML list item sits two columns right of the key that owns the list (`steps:` → `  - name:`). */
const LIST_ITEM_INDENT = 2;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCommentLine(line: string): boolean {
  return line.trim().startsWith("#");
}

/**
 * The body of a top-level (column-0) YAML block key — every line indented under it, exclusive of the
 * key line itself, up to the next column-0 non-blank line (or end of document).
 */
function topLevelSection(yaml: string, key: string): string | null {
  const lines = yaml.split("\n");
  const keyRegex = new RegExp(`^${escapeRegExp(key)}:\\s*$`);

  const key0 = numbered(lines).find(({ line }) => keyRegex.test(line));
  if (key0 === undefined) return null;

  const body = lines.slice(key0.index + 1);
  return sliceUntilDedent(body, (line) => /^\S/.test(line)).join("\n");
}

/**
 * `lines` paired with their own indices, so a lookup returns the LINE and its POSITION together.
 *
 * The point is what it removes. A `findIndex` + `=== -1` pair carries two mutants nothing can
 * discriminate: forcing the guard false leaves `slice(-1 + 1)` — which is `slice(0)`, an answer
 * usually indistinguishable from the real one — and `-1 → +1` shifts a sentinel no reader compares
 * against. Reading `lines[i]` back instead needs a `?? ""` fallback the match has already ruled out.
 * A `find` over pairs has neither: absence is `undefined`, and forcing that guard false throws.
 */
function numbered(lines: string[]): Array<{ line: string; index: number }> {
  return lines.map((line, index) => ({ line, index }));
}

/**
 * `lines` up to (excluding) the first member satisfying `isBoundary`, or all of them when none does.
 *
 * Extracted because the same "read a block's body until its terminator" walk is wanted three times,
 * and each hand-written copy was an index-walking `for` loop — the shape whose `i += 1 → i -= 1`
 * mutant does not FAIL but HANGS, which `check:mutation-diff` scores UNPROVEN rather than killed.
 * `findIndex` + `slice` has no counter to invert, and the `-1`-means-no-terminator branch is a real
 * fork a fixture reaches (a block that runs to end-of-document).
 */
function sliceUntilDedent(lines: string[], isBoundary: (line: string) => boolean): string[] {
  const boundary = lines.findIndex(isBoundary);
  if (boundary === -1) return lines;
  return lines.slice(0, boundary);
}

/**
 * The body of one job block within the workflow's `jobs:` section — every line indented under
 * `  <jobName>:`, up to the next job key at the same (two-space) indent, or end of section. Returns
 * `null` when the workflow declares no `jobs:` section or no job of that name.
 *
 * Exported because it is the seam every reader below shares: a test can pin the slice DIRECTLY
 * rather than inferring it from whichever steps happened to fall out of one of the four contracts.
 * Where a job's boundaries are wrong, every contract answers confidently about the wrong text.
 */
export function jobBlock(yaml: string, jobName: string): string | null {
  const jobsSection = topLevelSection(yaml, "jobs");
  if (jobsSection === null) return null;

  const lines = jobsSection.split("\n");
  const indent = " ".repeat(JOB_KEY_INDENT);
  const jobKeyRegex = new RegExp(`^${indent}[A-Za-z0-9_-]+:\\s*$`);
  const targetKeyRegex = new RegExp(`^${indent}${escapeRegExp(jobName)}:\\s*$`);

  const key0 = numbered(lines).find(({ line }) => targetKeyRegex.test(line));
  if (key0 === undefined) return null;

  const body = lines.slice(key0.index + 1);
  return sliceUntilDedent(body, (line) => jobKeyRegex.test(line)).join("\n");
}

/**
 * Split a job block's `steps:` list into one raw text chunk per step item (the item's own line
 * through the line before the next item, or end of block). Returns `[]` when the block declares no
 * `steps:` key.
 *
 * Exported alongside {@link jobBlock} for the same reason, and it is the stronger of the two: an
 * item list that is right in COUNT while wrong in EXTENT still answers most questions correctly, so
 * only a direct assertion on the chunks discriminates it.
 */
export function stepItems(block: string): string[] {
  const lines = block.split("\n");

  // An EXACT comparison, not a regex. `/^\s*steps:\s*$/` says the same thing while carrying three
  // anchor/character-class mutants whose only discriminating inputs are keys no workflow writes
  // (`post-steps:`), and it needs a comment guard beside it. `trim() === "steps:"` cannot match a
  // comment, so the guard goes too — a guard nothing can reach reads as rigour and is the opposite.
  const header = numbered(lines).find(({ line }) => line.trim() === "steps:");
  if (header === undefined) return [];

  const stepsIndent = header.line.length - header.line.trimStart().length;
  const itemRegex = new RegExp(`^ {${stepsIndent + LIST_ITEM_INDENT}}- `);
  const body = lines.slice(header.index + 1);
  // Offsets are relative to `body`, so the `steps:` key line itself can never open an item.
  const itemStarts = body
    .map((line, offset) => (itemRegex.test(line) ? offset : -1))
    .filter((offset) => offset !== -1);

  return itemStarts.map((from, position) =>
    body.slice(from, itemStarts[position + 1] ?? body.length).join("\n"),
  );
}

/**
 * `proves-against-merge-ref`: does the named job's checkout step declare a `ref:` override? On a
 * `pull_request` event `actions/checkout` defaults to the merge commit of branch+main — a `ref:`
 * input pins the branch's own head sha instead, silently reverting the job to branch-alone. Returns
 * `false` when the job (or a checkout step within it) doesn't exist — absence of an override, not
 * absence of evidence, is the only thing this reader claims.
 */
export function checkoutOverridesRef(yaml: string, jobName: string): boolean {
  const block = jobBlock(yaml, jobName);
  if (block === null) return false;

  for (const item of stepItems(block)) {
    if (!/uses:\s*actions\/checkout@/.test(item)) continue;
    for (const line of item.split("\n")) {
      // No comment guard: the pattern is ANCHORED at the start of the trimmed line, so a comment
      // (`# ref: abc`) cannot reach it. `softStepLines` below keeps its guard precisely because its
      // pattern is NOT anchored, and there the guard is load-bearing.
      if (/^ref:\s+\S/.test(line.trim())) return true;
    }
  }
  return false;
}

/**
 * `every-step-is-required`: every `continue-on-error: true` line declared anywhere within the named
 * job block, trimmed. `[]` means the job carries no soft step. Comment lines are excluded so prose
 * that merely mentions the key (as this very workflow's own comments do) cannot be mistaken for a
 * declared one.
 */
export function softStepLines(yaml: string, jobName: string): string[] {
  const block = jobBlock(yaml, jobName);
  if (block === null) return [];

  const matches: string[] = [];
  for (const line of block.split("\n")) {
    if (isCommentLine(line)) continue;
    if (/continue-on-error:\s*true\b/.test(line)) matches.push(line.trim());
  }
  return matches;
}

/**
 * `generated-views-in-sync` (and general step-content probing): does the named job run the given
 * `pnpm <command>` as a step's `run:` value? Matches a `run:` line whose value is exactly that
 * command (optionally followed by further words), so `check:guidance` never matches a step that only
 * runs `check:guidance-something-else`.
 */
export function jobRunsCheck(yaml: string, jobName: string, checkCommand: string): boolean {
  const block = jobBlock(yaml, jobName);
  if (block === null) return false;

  const runRegex = new RegExp(`^run:\\s*pnpm\\s+${escapeRegExp(checkCommand)}(?:\\s|$)`);
  for (const line of block.split("\n")) {
    // Anchored, so no comment guard is needed — see `checkoutOverridesRef`.
    if (runRegex.test(line.trim())) return true;
  }
  return false;
}

const NEEDS_KEY = "needs:";

/**
 * A YAML flow sequence's contents (`[a, b]` → `a, b`), or `value` unchanged when it is not a
 * MATCHED pair. The pairing is the point: two independent `replace(/^\[/)` / `replace(/\]$/)` calls
 * would happily strip one half of an unbalanced value, and each anchor is separately droppable
 * without any well-formed input noticing.
 */
function unbracket(value: string): string {
  if (!value.startsWith("[") || !value.endsWith("]")) return value;
  return value.slice(1, -1);
}

/**
 * The job names the named job declares in `needs:` — the scalar form (`needs: verify`) and the
 * inline-list form (`needs: [verify, other]`). `[]` when the job, or its `needs:` key, is absent.
 *
 * ⚠ THE BLOCK-LIST FORM IS DELIBERATELY NOT READ, and the omission is FAIL-CLOSED. A `needs:` whose
 * members sit on following lines yields `[]` here, so {@link jobDeclaresNeeds} answers FALSE and
 * contract 4 goes RED — a loud "someone changed the shape of this declaration, come and look",
 * never a silent pass. Reading a form this workflow does not use would be unproven surface area
 * whose mutants no fixture could reach.
 *
 * ⚠ AND IT PARSES MEMBERS RATHER THAN SUBSTRING-MATCHING, which is not a refinement but a
 * correctness fix. The first draft tested `\bverify\b` against the whole line; measured, that
 * matches `needs: verify-legacy`, because `-` is a non-word character and therefore IS a word
 * boundary. The contract asserting "no path to main skips a green verify" would have passed on a
 * workflow that gated automerge on some other job entirely.
 */
export function jobNeeds(yaml: string, jobName: string): string[] {
  const block = jobBlock(yaml, jobName);
  if (block === null) return [];

  const declaration = block
    .split("\n")
    .map((line) => line.trim())
    .find((line) => !isCommentLine(line) && line.startsWith(NEEDS_KEY));
  if (declaration === undefined) return [];

  return unbracket(declaration.slice(NEEDS_KEY.length).trim())
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member.length > 0);
}

/**
 * `red-blocks-the-merge`: does the named job declare `needs: <neededJob>`? True only when
 * `neededJob` is one of the DECLARED MEMBERS ({@link jobNeeds}) — never a substring of one, and
 * never an edge the workflow does not declare.
 */
export function jobDeclaresNeeds(yaml: string, jobName: string, neededJob: string): boolean {
  return jobNeeds(yaml, jobName).includes(neededJob);
}
