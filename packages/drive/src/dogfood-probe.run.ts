/**
 * The cold-start dogfood PROBE RUN (ADR-0184, Story UAT leg 7). The deliberate, out-of-band, live-only
 * run that PRODUCES the artifact `drive-machinery#gate-7` (dogfood-witness.check.ts) witnesses. It is
 * NOT a `*.test.ts` and never runs on a gate pass — it spawns a fresh, subscription-funded Claude Code
 * session (nested SDK spend), so ADR-0010 §5 keeps it out-of-band.
 *
 * What it does: cut a clean, isolated worktree from `origin/main`; spawn a fresh `claude -p` session in
 * it whose ONLY coaching is the repo's CLAUDE.md (auto-loaded by Claude Code) and whose task
 * ({@link probeTaskPrompt}) names the OUTCOME (a signed proof verdict for a tiny new `dogfood-probe-*`
 * unit) but never the inner-loop MEANS; wait for it; then confirm from the live store that the fresh
 * agent actually reached a signed verdict. The prompt's uncoached integrity is proven offline by
 * `dogfood-probe.test.ts` (`auditUncoached`), so this run needs no coaching audit — it just executes.
 *
 * Success (exit 0) = a `dogfood-probe-*` verdict now exists in events.verdict (the agent discovered the
 * inner loop unaided and drove a genuine red→green to a signed pass). The proof commit lands via its
 * promoted `claude/real/dogfood-probe-*` branch, and gate-7 then witnesses it. A probe that stalls or
 * signs nothing is a nondeterministic MISS (exit 1) — re-run it (ADR-0184 d.4: nondeterministic by
 * design; the integrity audit is one-time, the run is repeatable).
 *
 * Usage: `pnpm --filter @storytree/drive exec node --import tsx src/dogfood-probe.run.ts`
 * (DB up + subscription auth in ~/.storytree/secrets.json; a laptop/full-clone, not a 443-only remote).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closePool, createPool } from "@storytree/library/store";

import { ensureLiveDb } from "./db-control.js";
import { auditUncoached, probeNodeId, probeTaskPrompt } from "./dogfood-probe.js";
import { loadLocalSecrets } from "./secrets.js";

/** Wall-clock ceiling for the whole probe (onboard + author + nested --real build). */
const PROBE_TIMEOUT_MS = 45 * 60_000;

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function log(msg: string): void {
  console.log(`[dogfood-probe] ${msg}`);
}

async function main(): Promise<number> {
  loadLocalSecrets(); // CLAUDE_CODE_OAUTH_TOKEN (probe + nested leaf) + STORYTREE_DB_USER (verdict store)

  const toplevel = git(["rev-parse", "--show-toplevel"], process.cwd());
  const seed = Date.now().toString(36);
  const nodeId = probeNodeId(seed);
  const branch = `claude/${nodeId}`;
  const prompt = probeTaskPrompt(nodeId);

  // The prompt's uncoached integrity is the standing test (dogfood-probe.test.ts); assert it here too
  // so a run can never accidentally coach the probe (fail-closed before any spend).
  const audit = auditUncoached(prompt);
  if (!audit.ok) {
    console.error(`[dogfood-probe] REFUSED: task prompt leaked inner-loop terms: ${audit.found.join(", ")}`);
    return 1;
  }

  log(`bringing the live store up (the probe signs --store pg)…`);
  const ready = await ensureLiveDb((m) => console.error(`[db] ${m}`));
  if (!ready.ok) {
    console.error(`[dogfood-probe] the database could not be brought up: ${ready.reason}`);
    return 1;
  }

  log(`fetching origin/main…`);
  git(["fetch", "origin", "--quiet"], toplevel);

  const wt = mkdtempSync(path.join(tmpdir(), "storytree-dogfood-"));
  log(`cutting an isolated probe worktree at ${wt} (branch ${branch} off origin/main)…`);
  git(["worktree", "add", "-b", branch, wt, "refs/remotes/origin/main"], toplevel);

  try {
    log(`provisioning the probe worktree (pnpm install)…`);
    const install = spawnSync("pnpm", ["install", "--prefer-offline"], {
      cwd: wt,
      encoding: "utf8",
      shell: true,
      timeout: 10 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (install.status !== 0) {
      console.error(`[dogfood-probe] pnpm install failed in the probe worktree (status ${install.status}).`);
      console.error((install.stderr ?? "").slice(-2000));
      return 1;
    }

    log(`spawning the fresh uncoached agent (claude -p) — node id "${nodeId}". This is the live run…`);
    const t0 = Date.now();
    const res = spawnSync(
      "claude",
      ["-p", "--permission-mode", "bypassPermissions", "--output-format", "json"],
      {
        cwd: wt,
        input: prompt,
        encoding: "utf8",
        shell: true,
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: 256 * 1024 * 1024,
        env: process.env,
      },
    );
    const mins = ((Date.now() - t0) / 60_000).toFixed(1);
    if (res.error !== undefined && (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      log(`the probe hit the ${PROBE_TIMEOUT_MS / 60_000}-min wall-clock ceiling (${mins}m) — checking for a verdict anyway…`);
    } else if (res.status !== 0) {
      log(`claude exited non-zero (status ${res.status}) after ${mins}m — checking for a verdict anyway…`);
    } else {
      log(`the probe session finished after ${mins}m.`);
    }
    // Surface the agent's final result text (best-effort JSON parse of the last result message).
    try {
      const parsed = JSON.parse(res.stdout ?? "{}") as { subtype?: string; num_turns?: number; result?: string };
      log(`agent: subtype=${parsed.subtype ?? "?"} turns=${parsed.num_turns ?? "?"}`);
      if (typeof parsed.result === "string") log(`agent said: ${parsed.result.slice(0, 600)}`);
    } catch {
      log(`(could not parse the agent's JSON result; stdout tail) ${(res.stdout ?? "").slice(-600)}`);
    }

    // The definitive success signal: did a signed verdict for the probe node reach the live store?
    log(`querying events.verdict for "${nodeId}"…`);
    const { pool, connector } = await createPool();
    let rows: Array<{ proof_mode: string; outcome: string; commit: string; signer: string; at: string }>;
    try {
      const q = await pool.query(
        `SELECT proof_mode, outcome, left(commit_sha, 10) AS commit, signer,
                to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at
           FROM events.verdict WHERE unit_id = $1 ORDER BY at DESC`,
        [nodeId],
      );
      rows = q.rows as typeof rows;
    } finally {
      await closePool(pool, connector);
    }

    const promoted = (() => {
      try {
        return git(["ls-remote", "--heads", "origin", `claude/real/${nodeId}-*`], toplevel);
      } catch {
        return "";
      }
    })();

    if (rows.length > 0 && rows.some((r) => r.outcome === "pass")) {
      const v = rows.find((r) => r.outcome === "pass")!;
      log(`SUCCESS — the fresh agent reached a SIGNED verdict for ${nodeId}:`);
      log(`  ${v.proof_mode}/${v.outcome} @ ${v.commit} signed by ${v.signer} at ${v.at}`);
      if (promoted !== "") log(`  promotion branch(es) on origin:\n${promoted}`);
      log(`Next: land the promoted claude/real/${nodeId}-* branch (non-squash), then gate-7 witnesses it.`);
      log(`(probe worktree left at ${wt} for inspection; branch ${branch} kept.)`);
      return 0;
    }

    console.error(`[dogfood-probe] MISS — no signed pass verdict for "${nodeId}" reached events.verdict.`);
    console.error(`[dogfood-probe] The uncoached agent did not complete the loop this run (nondeterministic, ADR-0184 d.4) — re-run.`);
    if (rows.length > 0) console.error(`[dogfood-probe]   (rows present but no pass: ${rows.map((r) => `${r.proof_mode}/${r.outcome}`).join(", ")})`);
    return 1;
  } finally {
    // Leave the worktree + branch for inspection on success; the caller cleans up with
    // `git worktree remove --force <wt>` once the promoted branch is landed.
    log(`(worktree kept at ${wt}; remove with: git worktree remove --force "${wt}")`);
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`[dogfood-probe] unexpected error: ${(e as Error).message}`);
    process.exit(1);
  },
);
