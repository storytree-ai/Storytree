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

  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (keyRegex.test(lines[i] ?? "")) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/**
 * The body of one job block within the workflow's `jobs:` section — every line indented under
 * `  <jobName>:`, up to the next job key at the same (two-space) indent, or end of section. Returns
 * `null` when the workflow declares no `jobs:` section or no job of that name.
 */
function jobBlock(yaml: string, jobName: string): string | null {
  const jobsSection = topLevelSection(yaml, "jobs");
  if (jobsSection === null) return null;

  const lines = jobsSection.split("\n");
  const indent = " ".repeat(JOB_KEY_INDENT);
  const jobKeyRegex = new RegExp(`^${indent}[A-Za-z0-9_-]+:\\s*$`);
  const targetKeyRegex = new RegExp(`^${indent}${escapeRegExp(jobName)}:\\s*$`);

  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (targetKeyRegex.test(lines[i] ?? "")) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) {
    if (jobKeyRegex.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/**
 * Split a job block's `steps:` list into one raw text chunk per step item (the item's own line
 * through the line before the next item, or end of block). Returns `[]` when the block declares no
 * `steps:` key.
 */
function stepItems(block: string): string[] {
  const lines = block.split("\n");
  const stepsKeyRegex = /^(\s*)steps:\s*$/;

  let stepsIndent = -1;
  let stepsLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (isCommentLine(line)) continue;
    const match = stepsKeyRegex.exec(line);
    if (match) {
      stepsIndent = (match[1] ?? "").length;
      stepsLine = i;
      break;
    }
  }
  if (stepsLine === -1) return [];

  const itemRegex = new RegExp(`^ {${stepsIndent + 2}}- `);
  const itemStarts: number[] = [];
  for (let i = stepsLine + 1; i < lines.length; i += 1) {
    if (itemRegex.test(lines[i] ?? "")) itemStarts.push(i);
  }

  const items: string[] = [];
  for (let i = 0; i < itemStarts.length; i += 1) {
    const from = itemStarts[i];
    if (from === undefined) continue;
    const to = itemStarts[i + 1] ?? lines.length;
    items.push(lines.slice(from, to).join("\n"));
  }
  return items;
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
      if (isCommentLine(line)) continue;
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
    if (isCommentLine(line)) continue;
    if (runRegex.test(line.trim())) return true;
  }
  return false;
}

/**
 * `red-blocks-the-merge`: does the named job declare `needs: <neededJob>` (as a scalar or as one
 * member of a needs list)? Word-bounded so `needs: verify` is not mistaken for a job named
 * `verify-legacy`, and never invents an edge the workflow doesn't declare.
 */
export function jobDeclaresNeeds(yaml: string, jobName: string, neededJob: string): boolean {
  const block = jobBlock(yaml, jobName);
  if (block === null) return false;

  const neededRegex = new RegExp(`\\b${escapeRegExp(neededJob)}\\b`);
  for (const line of block.split("\n")) {
    if (isCommentLine(line)) continue;
    const trimmed = line.trim();
    if (/^needs:/.test(trimmed) && neededRegex.test(trimmed)) return true;
  }
  return false;
}
