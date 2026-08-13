/**
 * `storytree doctor` — the explorer-onboarding setup checker (ADR-0207 D6, the bottom layer).
 *
 * A deterministic, READ-ONLY, OFFLINE-CAPABLE CLI that probes each setup invariant a fresh explorer
 * environment must satisfy — git/Node present, the checkout provisioned, its dependencies current, the
 * repo fetchable, the Claude CLI present + logged in, the checkout current, the D4
 * hosted live read reachable — plus one probe that is NOT a setup invariant and is here on purpose:
 * `preamble-budget`, which weighs the eagerly-loaded guidance surface against ADR-0330 D1's ceiling.
 * ADR-0330 D2 declined to make that a gate rung and needed a surface where WARN is a first-class
 * verdict with a fix hint; this is the only offline, local, checkout-reading one. It emits machine-readable
 * results plus a fix hint per failing probe. It is the keystone of D6: D1's installer VERIFIES with it,
 * and D6's conversational guide WRAPS it (run doctor → explain a failure → propose the fix → dev
 * confirms → re-run the idempotent installer step → re-doctor).
 *
 * A probe asserts EXACTLY what it observed, never a stronger-sounding neighbour. `checkout-provisioned`
 * and `dependencies-current` are split for this reason: the first sees a completed install, the second
 * sees WHICH lockfile it ran against, and a report that answered the second with the first would tell a
 * dev "dependencies are installed" when the wrong ones are — in precisely the situation doctor is run
 * to disambiguate. Whenever a probe cannot support a claim, the honest answer is a narrower detail or
 * a WARN, never a PASS that reads better.
 *
 * Two load-bearing invariants from ADR-0207 live here:
 *   • D6 REPAIR-VOCABULARY: a fixable probe's fix is NOT new machinery — it is an idempotent D1
 *     installer step re-invoked. So each installer-repairable probe carries a {@link Probe.fixStep}
 *     naming the exact `# @step:<name>` marker in `infra/install.ps1`; the guide re-runs THAT step.
 *   • D3 NEVER-HANDLE-CREDENTIALS: the Claude-login probe DETECTS a logged-in CLI by the EXISTENCE of
 *     `~/.claude/.credentials.json` and NEVER reads its contents; its fix is an INSTRUCTION to the dev
 *     (run `claude` and sign in), never an installer step storytree executes — so `claude-login`
 *     deliberately carries NO `fixStep` (the detect-and-instruct boundary, asserted in the test).
 *
 * Shape (the health.ts pattern — one pure module surfaced multiple ways): {@link runDoctor} is a PURE
 * function over injected {@link DoctorObservations}, so the whole level/fix-hint policy is
 * fixture-testable with no filesystem or process. The thin {@link doctorCommand} shell gathers the
 * real observations (command presence, file existence) and shapes the {@link Envelope}
 * — mirroring the offline onboarding/drift/coverage commands. The guide (D6 top layer) imports
 * {@link runDoctor} directly and reads the structured {@link DoctorReport}; it never scrapes the text.
 *
 * OFFLINE-CAPABLE: doctor itself must run with no network and no DB (it is part of the zero-credential
 * path, ADR-0207 §Consequences). A probe it cannot determine offline (the remote reachability, the
 * checkout-behind count, the D4 hosted read) resolves to WARN, never FAIL — doctor never reports a
 * broken environment merely because doctor ran offline.
 *
 * NB (corrected 2026-08-08): this block used to justify the hosted-read WARN with a SECOND reason —
 * "D4 makes the offline checkout + in-memory seed the zero-credential FALLBACK, so an unreachable live
 * read DEGRADES exploring rather than breaking it". That fallback is GONE: ADR-0302 D1 deleted the seed
 * and D2 dropped offline as a supported mode, so an unreachable hosted read now breaks exploring rather
 * than degrading it. The WARN level is UNCHANGED and still correct, on the first reason alone — doctor
 * cannot conclude from offline that access is genuinely gone, the same rule repo-fetchable follows.
 * What changed is the justification, not the behaviour. The `seed-readable` probe that the fallback
 * story rested on was deleted with its subject (see where it stood, below).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { lockfileAdvanced, lockfilePair, needsRelink } from "../provision-worktree.mjs";
import type { Envelope } from "./envelope.js";
import {
  guidanceSurfacePaths,
  measureGuidanceSurface,
  type GuidanceSurface,
} from "./session-cost.js";

/** The Node major-version floor the workspace engine requires (mirrors install.ps1 Test-Node24). */
export const NODE_MAJOR_FLOOR = 24;

export type ProbeLevel = "PASS" | "WARN" | "FAIL";

/** One resolved setup-invariant probe. */
export interface Probe {
  /** Stable probe name (e.g. "checkout-provisioned"). */
  readonly name: string;
  readonly level: ProbeLevel;
  /** Human-facing one-line detail (what was observed). */
  readonly detail: string;
  /**
   * The `infra/install.ps1` `# @step:<name>` this probe's fix re-invokes (D6 repair vocabulary), when
   * the fix IS an idempotent installer step. ABSENT when the fix is not an installer re-run — a dev
   * action (the D3 Claude login) or a freshness pull. Only set on WARN/FAIL probes.
   */
  readonly fixStep?: string;
  /** The fix hint shown to the dev / guide when this probe is not PASS. Absent on PASS. */
  readonly fixHint?: string;
}

/** The whole doctor sweep. `ok` is false IFF some probe FAILed (a genuinely unmet invariant). */
export interface DoctorReport {
  readonly probes: Probe[];
  readonly failing: number;
  readonly warning: number;
  readonly passing: number;
  /** True IFF no probe FAILed (WARNs do not break — they are undetermined/offline/freshness). */
  readonly ok: boolean;
}

/**
 * The RAW observations runDoctor decides over — every environment query the shell performs, injected
 * so the decision policy is pure. `null` where the shell could not determine the value OFFLINE (the
 * remote reachability, the checkout-behind count) — those resolve to WARN, honouring offline-capable.
 */
export interface DoctorObservations {
  /** `git` resolves and runs (`git --version`). */
  readonly gitPresent: boolean;
  /** Node major version, or null if `node` is absent. */
  readonly nodeMajor: number | null;
  /** The checkout is provisioned: `node_modules/.modules.yaml` exists (the pnpm-complete marker). */
  readonly provisioned: boolean;
  /**
   * An install completed here but LINKED NOTHING (`node_modules` has no `.bin`) — the state both
   * `provisioned` and `dependencyCurrency` read as healthy, because the install did complete and the
   * lockfile did not move. False on an unprovisioned checkout, where `provisioned` is the true answer.
   */
  readonly unlinked: boolean;
  /** Whether the installed dependencies are the ones the checked-out lockfile asks for. */
  readonly dependencyCurrency: DependencyCurrency;
  /** The read-only remote answers (`git ls-remote`): true reachable, false refused, null undetermined (offline). */
  readonly remoteReachable: boolean | null;
  /** The `claude` CLI resolves (`claude --version`). */
  readonly claudeCliPresent: boolean;
  /** A logged-in CLI is DETECTED by `~/.claude/.credentials.json` EXISTENCE (never read — D3). */
  readonly claudeLoggedIn: boolean;
  /** Commits the checkout HEAD is behind `origin/main`, or null if undetermined offline. */
  readonly checkoutBehind: number | null;
  /**
   * The D4 hosted live read: can this dev's identity reach the IAP-gated hosted studio API?
   * Four genuinely different states, each with a different remedy — hence a union, not a boolean:
   *   • `ok`           — the hosted API answered; the live read works.
   *   • `refused`      — it answered 401/403 (or redirected to a login): the dev's Google identity
   *                      lacks IAP membership, or it was revoked. OWNER-side (D2's invite ceremony).
   *   • `unconfigured` — no hosted studio URL is set, so the live read simply isn't wired up here.
   *   • `unreachable`  — a network error/timeout: offline, or the hosted studio is down. We CANNOT
   *                      conclude access is gone, so this never escalates (the repo-fetchable rule).
   */
  readonly hostedRead: HostedReadState;
  /**
   * The eagerly-loaded guidance surface's size against ADR-0330 D1's ceiling. Determined entirely
   * offline from file sizes — a missing `MEMORY.md` is a determined zero on that machine, never an
   * undetermined value, so this probe has no WARN-because-offline branch.
   */
  readonly guidanceSurface: GuidanceSurface;
}

/** The four distinguishable outcomes of the D4 hosted-live-read probe. */
export type HostedReadState = "ok" | "refused" | "unconfigured" | "unreachable";

/**
 * Whether `node_modules` holds the dependencies the CHECKED-OUT lockfile asks for — the question
 * `provisioned` (an install COMPLETED here, once) cannot answer. Three states, not a boolean, because
 * the undeterminable case must not collapse into either verdict:
 *   • `current` — an install completed AND it ran against the lockfile now checked out.
 *   • `stale`   — an install completed, but the lockfile has ADVANCED past it (a package or dependency
 *                 landed on `main` and was merged in since). The deps present are the wrong ones.
 *   • `unknown` — there is no comparable pair: the checkout is unprovisioned, or a lockfile is missing
 *                 or unreadable. Reporting this as `current` would be the very over-claim this probe
 *                 exists to remove — `lockfileAdvanced` FAILS OPEN (`false`) on exactly these shapes,
 *                 which is right for the hook's question ("should I reinstall?") and wrong for ours.
 */
export type DependencyCurrency = "current" | "stale" | "unknown";

/**
 * The `hosted-read` probe's detail for the CONCRETE refusal — the one hosted-read state that is
 * owner-escalatable. Exported as a constant because `escalation-blob.ts` discriminates on it: every
 * hosted-read state is a WARN with no fixStep, so there is no other structural marker to key on.
 * Sharing the string means a reworded detail can never silently stop escalating (asserted in the test).
 */
export const HOSTED_READ_REFUSED_DETAIL =
  "the hosted studio refused your identity (IAP access missing or revoked)";

/**
 * PURE: resolve every setup-invariant probe from the raw observations. The level/fix-hint policy —
 * the valuable, testable core — lives entirely here; the shell only gathers observations and renders.
 */
export function runDoctor(obs: DoctorObservations): DoctorReport {
  const probes: Probe[] = [];

  // 1. git — version control; the clone/fetch steps need it. Installer @step:git.
  probes.push(
    obs.gitPresent
      ? { name: "git", level: "PASS", detail: "git is installed" }
      : {
          name: "git",
          level: "FAIL",
          detail: "git not found on PATH",
          fixStep: "git",
          fixHint: "re-run the installer's git step (install.ps1 @step:git) to install Git.",
        },
  );

  // 2. node — the Node 24+ workspace engine floor. Installer @step:node.
  if (obs.nodeMajor === null) {
    probes.push({
      name: "node",
      level: "FAIL",
      detail: "node not found on PATH",
      fixStep: "node",
      fixHint: `re-run the installer's node step (install.ps1 @step:node) to install Node ${NODE_MAJOR_FLOOR}+.`,
    });
  } else if (obs.nodeMajor < NODE_MAJOR_FLOOR) {
    probes.push({
      name: "node",
      level: "FAIL",
      detail: `Node v${obs.nodeMajor} is below the v${NODE_MAJOR_FLOOR} floor`,
      fixStep: "node",
      fixHint: `re-run the installer's node step (install.ps1 @step:node) to upgrade to Node ${NODE_MAJOR_FLOOR}+.`,
    });
  } else {
    probes.push({ name: "node", level: "PASS", detail: `Node v${obs.nodeMajor} (>= ${NODE_MAJOR_FLOOR})` });
  }

  // 3. checkout-provisioned — pnpm install completed (node_modules/.modules.yaml). Installer @step:provision.
  // The PASS detail states PRESENCE and nothing more: this probe observes only that an install once
  // COMPLETED here, which is the right question for the installer's fresh-clone flow but says nothing
  // about WHICH lockfile it ran against. Whether those deps are the ones now wanted is probe 4's.
  probes.push(
    obs.provisioned
      ? { name: "checkout-provisioned", level: "PASS", detail: "a completed pnpm install is present (node_modules/.modules.yaml)" }
      : {
          name: "checkout-provisioned",
          level: "FAIL",
          detail: "node_modules/.modules.yaml missing (workspace not provisioned)",
          fixStep: "provision",
          fixHint: "re-run the installer's provision step (install.ps1 @step:provision) — `pnpm install` in the checkout.",
        },
  );

  // 3b. workspace-linked — the install did not merely COMPLETE, it produced something runnable.
  // A THIRD probe rather than a widening of either neighbour, for the reason stated at the top of this
  // file: a probe asserts exactly what it observed. Probe 3 answers "did an install complete here?" and
  // probe 4 answers "against which lockfile?" — and an install that completes, matches the lockfile and
  // links NOTHING answers both of those honestly while leaving a checkout where no binary runs. That
  // combination was reachable and both probes reported PASS over it, which is the one direction a
  // diagnostic must not fail in: the session then trusts doctor and hunts the wrong cause.
  //
  // FAIL, not WARN (unlike probe 4): stale deps are a refresh, but an unlinked tree cannot run tsx,
  // tsc or the gate at all — it is broken now, not drifting. The fixHint carries the specific warning
  // that re-running install may again print "Already up to date", which is about RESOLUTION and not
  // linking, so a session does not read that line as "nothing was wrong".
  if (obs.unlinked) {
    probes.push({
      name: "workspace-linked",
      level: "FAIL",
      detail: "an install completed here but linked no packages (node_modules has no .bin)",
      fixHint:
        "run `pnpm install` in this checkout, then confirm `node_modules/.bin` exists. It may print " +
        '"Already up to date" — that is about resolution, not linking, so verify .bin rather than ' +
        "trusting the line. Until then `tsx`, `tsc` and `pnpm gate` fail as `'tsx' is not recognized`, " +
        "which is NOT the worktree-root resolution trap it resembles.",
    });
  } else if (obs.provisioned) {
    probes.push({
      name: "workspace-linked",
      level: "PASS",
      detail: "the install produced a linked node_modules (.bin present)",
    });
  }

  // 4. dependencies-current — the installed deps are the ones the CHECKED-OUT lockfile asks for.
  // Deliberately a SECOND probe rather than a widening of probe 3: presence and currency are different
  // questions with different remedies, and probe 3's is exactly right for the fresh-clone flow it was
  // built for (a clone the installer just provisioned is current by construction, so this PASSes there).
  //
  // The gap it closes is the one doctor exists for. When a new workspace package or dependency lands on
  // `main` and a session merges it in, node_modules is silently the wrong one — and the failure surfaces
  // as `TS2307` on a package this session never touched, `ERR_MODULE_NOT_FOUND`, or `tsc is not
  // recognized`, none of which name the real cause. The SessionStart provision hook auto-refreshes this
  // at session START only, so a merge performed MID-session is invisible to it; `pnpm install` then
  // reassures wrongly ("Already up to date" is about resolution, not linking). Running doctor and being
  // told "dependencies are installed" was, until this probe, the last place that trail went cold.
  //
  // WARN, never FAIL: stale deps are a refresh, not a broken install (the `checkout-current` freshness
  // precedent), so this can never fail a fresh clone or a healthy explorer. And NO fixStep — re-running
  // @step:provision would NOT repair it, because install.ps1's own `Test-Provisioned` is presence-based
  // and would report "already satisfied" without installing. Naming it as the fix would be a false entry
  // in the D6 repair vocabulary, so the fix is a direct instruction (the claude-login precedent).
  if (obs.dependencyCurrency === "current") {
    probes.push({
      name: "dependencies-current",
      level: "PASS",
      detail: "installed dependencies match the checked-out pnpm-lock.yaml",
    });
  } else if (obs.dependencyCurrency === "stale") {
    probes.push({
      name: "dependencies-current",
      level: "WARN",
      detail: "node_modules was installed against an OLDER pnpm-lock.yaml than the one checked out",
      fixHint:
        "run `pnpm install` in the checkout to relink against the current lockfile — it is idempotent and fast from the warm pnpm store. Until then a build can fail as TS2307 / ERR_MODULE_NOT_FOUND naming a package you never touched.",
    });
  } else {
    probes.push({
      name: "dependencies-current",
      level: "WARN",
      detail: "dependency currency not determined (no lockfile pair to compare)",
      fixHint:
        "provision the checkout first (`pnpm install`); currency is only comparable once an install has completed and pnpm has recorded the lockfile it ran against.",
    });
  }

  // 5. repo-fetchable — the read-only remote answers. Undetermined offline => WARN (offline-capable).
  if (obs.remoteReachable === true) {
    probes.push({ name: "repo-fetchable", level: "PASS", detail: "the read-only remote is reachable" });
  } else if (obs.remoteReachable === false) {
    probes.push({
      name: "repo-fetchable",
      level: "WARN",
      detail: "could not reach the remote (offline, or GitHub access not granted)",
      fixStep: "github-auth",
      fixHint:
        "check your network; if you are online, re-run the installer's github-auth step (install.ps1 @step:github-auth). If access was revoked, escalate to the owner.",
    });
  } else {
    probes.push({
      name: "repo-fetchable",
      level: "WARN",
      detail: "remote reachability not determined (running offline)",
      fixHint: "reconnect to the network and re-run `storytree doctor` to confirm the remote is reachable.",
    });
  }

  // The `seed-readable` probe stood here. DELETED WITH ITS SUBJECT (ADR-0302 D1), not repointed at
  // the live store — repointing would have destroyed the only thing it was good for. Its whole value
  // was answering "is this checkout INTACT?" with ZERO credentials and zero network, which is
  // exactly the situation a broken install leaves you in; a version of it that needed a database
  // could not run in the case it existed to diagnose, and would report a DB outage as a corrupt
  // checkout. Its neighbour `checkout-provisioned` answers the weaker, adjacent question (did an
  // install ever complete here) and STAYS — read the two separately, as this module's header says.

  // 7. claude-cli — the dev's own agent CLI is installed. Installer @step:claude-cli.
  probes.push(
    obs.claudeCliPresent
      ? { name: "claude-cli", level: "PASS", detail: "the Claude Code CLI is installed" }
      : {
          name: "claude-cli",
          level: "FAIL",
          detail: "the `claude` CLI not found on PATH",
          fixStep: "claude-cli",
          fixHint: "re-run the installer's claude-cli step (install.ps1 @step:claude-cli) to install the Claude Code CLI.",
        },
  );

  // 8. claude-login — a logged-in CLI is DETECTED (existence only, D3). The fix is a DEV ACTION, never
  // an installer step storytree runs: no fixStep (storytree instructs; it never executes-and-captures).
  probes.push(
    obs.claudeLoggedIn
      ? { name: "claude-login", level: "PASS", detail: "a logged-in Claude CLI is detected" }
      : {
          name: "claude-login",
          level: "FAIL",
          detail: "no logged-in Claude CLI detected",
          fixHint:
            "run `claude` and complete sign-in in your browser with your own subscription — storytree never handles your credential (ADR-0207 D3).",
        },
  );

  // 9. checkout-current — HEAD vs origin/main freshness. Undetermined offline => WARN; behind => WARN
  // (a freshness pull, not a broken invariant). Pre-D5 the app runs from the checkout, so "app version
  // vs checkout HEAD" reduces to "is the checkout up to date"; the packaged-binary comparison lands with D5.
  if (obs.checkoutBehind === null) {
    probes.push({
      name: "checkout-current",
      level: "WARN",
      detail: "checkout freshness not determined (running offline)",
      fixHint: "reconnect and re-run `storytree doctor`, or `git pull` to update the checkout.",
    });
  } else if (obs.checkoutBehind > 0) {
    probes.push({
      name: "checkout-current",
      level: "WARN",
      detail: `checkout is ${obs.checkoutBehind} commit(s) behind origin/main`,
      fixHint: "run `git pull` in the checkout to update to the latest.",
    });
  } else {
    probes.push({ name: "checkout-current", level: "PASS", detail: "checkout is up to date with origin/main" });
  }

  // 10. preamble-budget — the eagerly-loaded guidance surface against ADR-0330 D1's ceiling.
  //
  // NEVER A FAIL, AND NEVER A GATE RUNG (ADR-0330 D2). Being over budget is a cost signal, not a
  // broken environment: nothing is wrong with this checkout, and no wrong outcome has reached `main`
  // — which is the escape `process:justify-a-gate-rung` step 1 asks for and this has none of. Two
  // further reasons close it: `gate-runner.ts` has no WARN status, so a non-blocking rung would
  // print PASS on a row named for the thing while the thing was breached (step 7); and half the
  // surface (`MEMORY.md`) is per-user state that does not exist in CI, the category ADR-0311 D2
  // retired by name (step 6). So the budget speaks HERE, where a WARN is a first-class verdict and
  // carries a fix hint.
  //
  // This stretches doctor's "setup invariant" charter and the stretch is deliberate: doctor is the
  // only offline, local, checkout-reading report surface with WARN semantics and a fix slot, and a
  // budget nobody can read is a budget nobody keeps.
  {
    const surface = obs.guidanceSurface;
    const present = surface.files
      .map((f) => `${f.label} ${f.bytes === null ? "absent" : `${Math.round(f.bytes / 1024)} KiB`}`)
      .join(" + ");
    const size = `${present} = ${Math.round(surface.bytes / 1024)} KiB of ${Math.round(surface.budget / 1024)} KiB`;
    probes.push(
      surface.overBy === 0
        ? {
            name: "preamble-budget",
            level: "PASS",
            detail: `${size} (~${Math.round(surface.approxTokens / 1000)}k tokens re-read every turn)`,
          }
        : {
            name: "preamble-budget",
            level: "WARN",
            detail: `${size} — OVER by ${Math.round(surface.overBy / 1024)} KiB`,
            fixHint:
              "move text off the eagerly-loaded surface into a Library artifact, pulled just-in-time (ADR-0023 / ADR-0330 D1): anything not needed by EVERY session on its FIRST turn belongs there. Trimming is not the only move and deleting orientation re-creates ADR-0162's failures — REHOME it. `storytree session-cost` re-derives the price.",
          },
    );
  }

  // 11. hosted-read — the D4 live read through the IAP-gated hosted studio. NEVER a FAIL, because
  // doctor itself must stay offline-capable and cannot conclude from offline that access is genuinely
  // gone — the same rule repo-fetchable follows. Only the concrete `refused` is owner-escalatable. No
  // fixStep: none of these is repaired by re-running an installer step.
  // (Corrected 2026-08-08: this comment also claimed "D4 makes the offline checkout + in-memory seed
  // the zero-credential FALLBACK, so an unreachable hosted read DEGRADES exploring rather than breaking
  // it". ADR-0302 D1/D2 removed that fallback — an unreachable hosted read now BREAKS exploring. The
  // WARN level is deliberately unchanged; only its justification was wrong.)
  if (obs.hostedRead === "ok") {
    probes.push({ name: "hosted-read", level: "PASS", detail: "the hosted live read is reachable" });
  } else if (obs.hostedRead === "refused") {
    probes.push({
      name: "hosted-read",
      level: "WARN",
      detail: HOSTED_READ_REFUSED_DETAIL,
      fixHint:
        "ask the owner to grant your Google identity access to the hosted studio (the D2 invite ceremony's IAP grant). Exploring needs this read — there is no offline fallback (ADR-0302).",
    });
  } else if (obs.hostedRead === "unconfigured") {
    probes.push({
      name: "hosted-read",
      level: "WARN",
      detail: "no hosted studio URL configured (STORYTREE_STUDIO_URL unset)",
      fixHint:
        "set STORYTREE_STUDIO_URL to the hosted studio URL the owner sent you to read live tree state; without it there is nothing to explore (ADR-0302 left no offline fallback).",
    });
  } else {
    probes.push({
      name: "hosted-read",
      level: "WARN",
      detail: "hosted live read not determined (offline, or the hosted studio is down)",
      fixHint: "reconnect to the network and re-run `storytree doctor` to confirm the live read.",
    });
  }

  const failing = probes.filter((p) => p.level === "FAIL").length;
  const warning = probes.filter((p) => p.level === "WARN").length;
  const passing = probes.filter((p) => p.level === "PASS").length;
  return { probes, failing, warning, passing, ok: failing === 0 };
}

/** PURE: render a report as stable, greppable machine-readable lines + a fix hint under each non-PASS probe. */
export function formatDoctorReport(report: DoctorReport): string {
  const glyph: Record<ProbeLevel, string> = { PASS: "ok  ", WARN: "warn", FAIL: "FAIL" };
  const lines: string[] = ["storytree doctor — explorer setup check (ADR-0207 D6)", ""];
  for (const p of report.probes) {
    lines.push(`  [${glyph[p.level]}] ${p.name.padEnd(22)} ${p.detail}`);
    if (p.fixHint !== undefined) lines.push(`         fix: ${p.fixHint}`);
  }
  lines.push("");
  lines.push(
    `${report.failing} failing, ${report.warning} warning, ${report.passing} passing` +
      (report.ok ? " — setup is healthy." : "."),
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The shell: gather the real observations, then render.
// ---------------------------------------------------------------------------

/** Repo root: packages/cli/src/doctor.ts → four dirs up (the commands.ts repoRoot pattern). */
function repoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

/** True iff `<cmd> --version` runs successfully — the universal "installed" probe. Never throws. */
function commandPresent(cmd: string): boolean {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Node major from process.version (doctor runs under node), or null if unparseable. */
function nodeMajor(): number | null {
  const m = /^v?(\d+)\./.exec(process.version);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

/** The read-only remote answers within a short budget: true reachable, false refused, null undetermined. */
function remoteReachable(checkoutDir: string): boolean | null {
  try {
    execFileSync("git", ["-C", checkoutDir, "ls-remote", "--exit-code", "origin", "HEAD"], {
      stdio: "ignore",
      timeout: 8_000,
    });
    return true;
  } catch (err) {
    // A non-zero exit (access refused / no such remote) is a real "false"; a spawn/timeout error means
    // we could not determine it (offline) — surface null so the probe WARNs rather than FAILs.
    const code = (err as { code?: unknown }).code;
    if (code === "ENOENT" || code === "ETIMEDOUT") return null;
    return false;
  }
}

/** Commits behind origin/main (against the last-fetched ref — no network write), or null on error. */
function checkoutBehind(checkoutDir: string): number | null {
  try {
    const out = execFileSync("git", ["-C", checkoutDir, "rev-list", "--count", "HEAD..origin/main"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    });
    const n = Number.parseInt(out.trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Are the installed dependencies the ones the checked-out lockfile asks for? Reuses the SessionStart
 * provisioner's detector ({@link lockfileAdvanced}) rather than a second implementation of staleness,
 * so the hook and the doctor can never disagree about what "stale" means.
 *
 * The presence screen in front of it is load-bearing, not defensive duplication. `lockfileAdvanced`
 * FAILS OPEN — an unprovisioned checkout, or one missing either lockfile, returns `false` — which is
 * correct for the hook (never reinstall on a guess) and would be a lie here: it reads as "current"
 * for a checkout that has no dependencies at all. Screening those shapes into `unknown` first is what
 * keeps this probe from reproducing the very over-claim it exists to remove. The paths come from
 * {@link lockfilePair} so both readers name the same two files. Never throws.
 *
 * EXPORTED, unlike its sibling observation gatherers, for the same reason {@link
 * classifyHostedReadStatus} is: the screen is policy, not plumbing, and `lockfileAdvanced` is
 * deliberately not injectable — so the only honest proof runs it against real lockfile pairs on disk.
 */
export function dependencyCurrency(checkoutDir: string, provisioned: boolean): DependencyCurrency {
  if (!provisioned) return "unknown";
  const { wanted, current } = lockfilePair(checkoutDir);
  if (!existsSync(wanted) || !existsSync(current)) return "unknown";
  return lockfileAdvanced(checkoutDir) ? "stale" : "current";
}

/**
 * Probe the D4 hosted live read, read-only and fail-soft. Behind IAP an unauthenticated request is
 * REDIRECTED to a Google login, so `redirect: "manual"` is load-bearing: with the default
 * follow-behaviour we would chase the redirect and read Google's 200 HTML page as a healthy studio.
 * Any 3xx/401/403 therefore means "refused", a network error means "unreachable" (never "refused" —
 * offline must not be reported as revoked access), and no configured URL means "unconfigured".
 */
export async function probeHostedRead(
  baseUrl: string | undefined = process.env["STORYTREE_STUDIO_URL"],
  fetchImpl: typeof fetch = fetch,
): Promise<HostedReadState> {
  if (baseUrl === undefined || baseUrl.trim() === "") return "unconfigured";
  const url = `${baseUrl.replace(/\/+$/, "")}/api/health`;
  try {
    const res = await fetchImpl(url, {
      redirect: "manual", // an IAP login redirect must read as refused, never followed to a 200
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "application/json" },
    });
    return classifyHostedReadStatus(res.status);
  } catch {
    return "unreachable"; // DNS/timeout/offline — we cannot conclude anything about access.
  }
}

/**
 * PURE: map an HTTP status to a hosted-read verdict. Only a status that genuinely means "your
 * identity was not accepted" may read as `refused`, because `refused` is what sends the owner an
 * IAP-grant escalation — a spurious one wastes their time and misdirects the dev. So:
 *   • 2xx            → ok
 *   • 3xx            → refused: behind IAP an unauthenticated request is REDIRECTED to a Google login
 *   • 401 / 403      → refused: an explicit identity rejection
 *   • anything else  → unreachable: a 404 means the URL is not a studio at all (a misconfiguration,
 *                      NOT an access verdict) and a 5xx means the studio is unwell — neither is a
 *                      statement about this dev's access, so neither may bother the owner.
 */
export function classifyHostedReadStatus(status: number): HostedReadState {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "refused";
  if (status === 401 || status === 403) return "refused";
  return "unreachable";
}

/** Gather every real environment observation for the checkout doctor runs against. */
export async function gatherObservations(checkoutDir: string): Promise<DoctorObservations> {
  return {
    ...gatherLocalObservations(checkoutDir),
    hostedRead: await probeHostedRead(),
  };
}

/** The synchronous, purely-local half of the sweep (everything but the D4 network probe). */
function gatherLocalObservations(checkoutDir: string): Omit<DoctorObservations, "hostedRead"> {
  const provisioned = existsSync(path.join(checkoutDir, "node_modules", ".modules.yaml"));
  return {
    gitPresent: commandPresent("git"),
    nodeMajor: nodeMajor(),
    provisioned,
    unlinked: needsRelink(checkoutDir),
    dependencyCurrency: dependencyCurrency(checkoutDir, provisioned),
    remoteReachable: remoteReachable(checkoutDir),
    claudeCliPresent: commandPresent("claude"),
    // D3: DETECT a logged-in CLI by the credentials file's EXISTENCE only — never read its contents.
    claudeLoggedIn: existsSync(path.join(os.homedir(), ".claude", ".credentials.json")),
    checkoutBehind: checkoutBehind(checkoutDir),
    guidanceSurface: measureGuidanceSurface(guidanceSurfacePaths(checkoutDir, os.homedir())),
  };
}

export function doctorHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree doctor — the explorer-onboarding setup check (ADR-0207 D6).",
      "",
      "  storytree doctor",
      "      probe each setup invariant (git/Node, checkout provisioned, dependencies current, repo",
      "      fetchable, Claude CLI present + logged in, checkout current, the eagerly-loaded guidance",
      "      surface against its byte budget, hosted read) and print a fix hint per",
      "      failure. Read-only and offline-capable — it never writes, and never handles your",
      "      Claude credential (it only detects a logged-in CLI). Exits non-zero on any failure.",
    ].join("\n"),
    next: ["storytree doctor"],
  };
}

/**
 * The `storytree doctor` dispatch. Offline, read-only, never throws — it gathers the real
 * observations for the checkout it runs against (default: this checkout) and shapes the envelope.
 * `argv` is the positionals AFTER the "doctor" area word. Injected `observe` for tests.
 */
export async function doctorCommand(
  argv: readonly string[],
  deps: {
    observe?: (checkoutDir: string) => DoctorObservations | Promise<DoctorObservations>;
    checkoutDir?: string;
  } = {},
): Promise<Envelope> {
  const [sub] = argv;
  if (sub === "help") return doctorHelp();

  const checkoutDir = deps.checkoutDir ?? repoRoot();
  const observe = deps.observe ?? gatherObservations;
  const report = runDoctor(await observe(checkoutDir));

  return {
    ok: report.ok,
    body: formatDoctorReport(report),
    // A failing probe routes the reader to the installer (the repair vocabulary); a clean run points
    // onward to the guide's next step. The guide (D6 top layer) reads the report object, not this.
    next: report.ok
      ? ["storytree library", "storytree agents"]
      : ["storytree guide", "storytree guide --fix", "infra/install.md"],
  };
}
