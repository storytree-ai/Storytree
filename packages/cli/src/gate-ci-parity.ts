// Gate <-> CI parity (`gate-ci-parity` capability).
//
// A META-gate: it does not re-run the local gate or CI, it reads the two DECLARATIONS — the real
// `GATE_PLAN` (`packages/cli/src/gate-order.ts`) and the real `verify` job in
// `.github/workflows/ci.yml` — and asserts the relationship between them is exactly what is declared:
// a shared content floor both run, a two-way delta of named steps each side keeps and the other does
// not, and an honest note that CI proves a different REF than the local gate does (HEAD vs the PR
// merge ref), which is the second half of "local-green / CI-red": a branch behind `main` can pass
// locally and still fail CI on the merge, surfaced here as a checkable, diagnosable condition rather
// than a silent surprise.
//
// Pure: every function here takes text/data and returns data. The caller (the test) supplies the real
// files; nothing in this module touches disk itself.

import type { GateStep } from "./gate-order.js";

// ── mechanism: read a workflow file's steps ──────────────────────────────────────

/**
 * Every `pnpm <...>` invocation a `run:` step of the named job issues, IN ORDER, with the leading
 * `pnpm ` stripped — covering both the single-line `run: pnpm <x>` form and the block-scalar
 * `run: |` / `run: >` form (where any child line starting with `pnpm ` counts). Comment lines (`#…`)
 * are never read as a step, in either form. A job the text does not declare yields `[]`.
 *
 * Scoped strictly to the named job: job blocks are found by the YAML convention this repo's
 * workflow already follows — a job name is a bare `<name>:` key indented exactly two spaces under a
 * top-level `jobs:` key — so a sibling job's steps can never leak into the requested one.
 */
export function extractPnpmInvocations(workflowText: string, jobName: string): string[] {
  const lines = workflowText.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIndex === -1) return [];

  const jobHeaderPattern = /^ {2}([A-Za-z0-9_-]+):\s*$/;
  const boundaries: Array<{ name: string; start: number }> = [];
  for (let i = jobsIndex + 1; i < lines.length; i++) {
    const match = jobHeaderPattern.exec(lines[i] ?? "");
    if (match !== null) boundaries.push({ name: match[1] ?? "", start: i });
  }

  const targetIdx = boundaries.findIndex((b) => b.name === jobName);
  if (targetIdx === -1) return [];
  const target = boundaries[targetIdx];
  if (target === undefined) return [];
  const nextBoundary = boundaries[targetIdx + 1];
  const end = nextBoundary === undefined ? lines.length : nextBoundary.start;
  const blockLines = lines.slice(target.start + 1, end);

  const results: string[] = [];
  let i = 0;
  while (i < blockLines.length) {
    const rawLine = blockLines[i] ?? "";
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const singleMatch = /^run:\s*pnpm\s+(.+)$/.exec(trimmed);
    if (singleMatch !== null) {
      results.push((singleMatch[1] ?? "").trimEnd());
      i++;
      continue;
    }

    const blockMatch = /^run:\s*[|>][+-]?\s*$/.exec(trimmed);
    if (blockMatch !== null) {
      const runIndent = rawLine.length - rawLine.trimStart().length;
      i++;
      while (i < blockLines.length) {
        const childLine = blockLines[i] ?? "";
        if (childLine.trim() === "") {
          i++;
          continue;
        }
        const childIndent = childLine.length - childLine.trimStart().length;
        if (childIndent <= runIndent) break;
        const childTrimmed = childLine.trim();
        if (!childTrimmed.startsWith("#")) {
          const pnpmMatch = /^pnpm\s+(.+)$/.exec(childTrimmed);
          if (pnpmMatch !== null) results.push((pnpmMatch[1] ?? "").trimEnd());
        }
        i++;
      }
      continue;
    }

    i++;
  }
  return results;
}

// ── mechanism: normalise one invocation into a canonical content-check token ─────

/**
 * Maps one `pnpm`-stripped invocation (as {@link extractPnpmInvocations} yields, or a GATE_PLAN
 * command with its own `pnpm ` prefix stripped) to the canonical token the parity comparison judges
 * by, or `undefined` when the invocation is plumbing (install, exec-a-script, browser install) rather
 * than a content check.
 *
 * Canonical forms: a `check:*` script name is its own token; `lint` becomes `"pnpm lint"`; any
 * invocation ENDING in `typecheck` / `test` / `build` (whatever scoping prefix precedes it — `-r`,
 * `-r --no-bail`, or CI's `${{ steps.affected.outputs.pnpm_args || '-r' }}` templated form) collapses
 * to the full-scope token `"pnpm -r <word>"`, because {@link GATE_PLAN} always DECLARES the full form
 * even when the runner later rewrites it to an affected-scoped one; `ci:affected` becomes
 * `"pnpm ci:affected"`.
 */
export function normalizeContentStep(invocation: string): string | undefined {
  const trimmed = invocation.trim();
  if (/^check:[\w-]+$/.test(trimmed)) return trimmed;
  if (trimmed === "lint") return "pnpm lint";
  if (trimmed === "ci:affected") return "pnpm ci:affected";
  const wordMatch = /(?:^|\s)(typecheck|test|build)$/.exec(trimmed);
  if (wordMatch !== null) return `pnpm -r ${wordMatch[1] ?? ""}`;
  return undefined;
}

// ── mechanism: compose extraction + normalisation for each side ──────────────────

/** The tracked content-check token set a workflow's named job actually runs. */
export function ciContentChecks(workflowText: string, jobName: string): Set<string> {
  const tokens = new Set<string>();
  for (const invocation of extractPnpmInvocations(workflowText, jobName)) {
    const token = normalizeContentStep(invocation);
    if (token !== undefined) tokens.add(token);
  }
  return tokens;
}

/**
 * The same canonical token set, derived from a {@link GateStep}-shaped plan (i.e. the real
 * `GATE_PLAN`): a step's own `check` field is used directly when present (it already names the
 * canonical `check:*` token), otherwise its `command` is normalised the same way a CI invocation is.
 */
export function localGatePlanTokens(steps: readonly GateStep[]): Set<string> {
  const tokens = new Set<string>();
  for (const step of steps) {
    if (step.check !== undefined) {
      tokens.add(step.check);
      continue;
    }
    const withoutPrefix = step.command.trim().replace(/^pnpm\s+/, "");
    const token = normalizeContentStep(withoutPrefix);
    if (token !== undefined) tokens.add(token);
  }
  return tokens;
}

// ── the two-way delta ──────────────────────────────────────────────────────────

/** The three-way split of two content-check token sets. */
export interface GateCiParity {
  /** Present in BOTH sets. */
  readonly sharedFloor: readonly string[];
  /** Present in `ci` only. */
  readonly ciOnly: readonly string[];
  /** Present in `local` only. */
  readonly localOnly: readonly string[];
}

/** Split a local token set and a CI token set into shared / ci-only / local-only. */
export function computeGateCiParity(
  local: ReadonlySet<string>,
  ci: ReadonlySet<string>,
): GateCiParity {
  const sharedFloor: string[] = [];
  const localOnly: string[] = [];
  for (const token of local) {
    if (ci.has(token)) sharedFloor.push(token);
    else localOnly.push(token);
  }
  const ciOnly: string[] = [...ci].filter((token) => !local.has(token));
  return { sharedFloor, ciOnly, localOnly };
}

// ── contract 2: the ref delta is declared, not silently assumed ──────────────────

/** One side of a declared, expected difference between what the local gate proves and what CI does. */
export interface RefDelta {
  readonly local: string;
  readonly ci: string;
  readonly reason: string;
}

/**
 * The local gate proves `HEAD` — the branch exactly as it stands in the working tree. CI's `verify`
 * job checks out the `pull_request` MERGE ref — this branch merged onto `main`'s current tip. Those
 * are honestly different refs, and the difference is exactly the second half of "local-green /
 * CI-red": a branch that has fallen behind `main` can be green on its own `HEAD` and still fail CI on
 * the merge, which is what {@link diagnoseStaleBranch} exists to surface as a checkable condition
 * rather than a silent surprise.
 */
export const REF_DELTA: RefDelta = {
  local: "HEAD — this branch exactly as it stands in the working tree",
  ci: "the pull_request MERGE ref — this branch merged onto main's current tip",
  reason:
    "the local gate can only ever prove the branch it is run on; CI proves that branch AS MERGED " +
    "onto main's current tip, so a branch that has fallen behind main can be green locally on HEAD " +
    "and still fail CI on the merge — the ref delta is expected, not a bug in either gate",
};

// ── contract 3: a stale branch is diagnosed, not a silent CI surprise ────────────

/** Whether a branch is behind `main`, and — when it is — the standard remedy. */
export interface StaleBranchDiagnosis {
  readonly stale: boolean;
  readonly behind: number;
  readonly remedy: string | undefined;
}

/**
 * A branch with ANY commits behind `main` is stale — this is a presence check, not a magnitude
 * threshold, because CI proves the MERGE ref (see {@link REF_DELTA}) and even one missed commit on
 * `main` can be the one a local-green run never saw. The remedy is the standard one CLAUDE.md
 * documents, so a session hitting this reaches for the one recipe rather than an invented one.
 */
export function diagnoseStaleBranch(input: { ahead: number; behind: number }): StaleBranchDiagnosis {
  const stale = input.behind > 0;
  return {
    stale,
    behind: input.behind,
    remedy: stale
      ? "git fetch origin && git merge origin/main, then re-gate and push."
      : undefined,
  };
}
