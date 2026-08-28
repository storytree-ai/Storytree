/**
 * The DEV-PERSONA probe group for `storytree doctor` — the half that answers "can this machine do
 * the WORK?", as opposed to ADR-0207's explorer group, which answers "can this machine READ?".
 *
 * WHY THIS EXISTS. Doctor's eleven original probes are all explorer-shaped: git, node, the checkout,
 * its dependencies, the remote, the Claude CLI + login, freshness, the preamble budget, the hosted
 * read. That set is complete for the persona it was built for and contains nothing about the
 * database, `~/.storytree/secrets.json`, GitHub auth, the write-authority wall, or worktree identity
 * — so it reports "setup is healthy" on a machine that cannot open a PR, cannot write a `--pg`
 * artifact, and cannot run a full gate. A blind self-onboarding agent reads that green as permission
 * to stop, which is precisely the failure this group removes.
 *
 * WHY IT IS OPT-IN (`storytree doctor --dev`) AND WHY THE BARE RUN STILL NAMES IT. ADR-0207 D2/D4
 * give the explorer read-only GitHub and a hosted live read; D6's own words are that "explorer mode
 * has no `--pg`". An explorer machine with no ADC and no secrets file is CORRECTLY set up, so
 * failing it on those would make doctor lie about the persona it was built for. But a group nobody
 * runs is no better than no group, so the cost is paid on the OTHER side: a bare sweep never prints
 * an unqualified "setup is healthy" — it says the dev group was NOT RUN and names the flag, the same
 * GREEN, NARROWED vocabulary `pnpm gate` uses for a skipped step. A green that names what it did not
 * check is not an authoritative green.
 *
 * THE FAULT CLASS THIS GROUP IS DESIGNED AGAINST is the project's commonest: a probe that cannot go
 * red converts an unverified machine into an authoritative green. Every probe here therefore has a
 * reachable non-PASS state driven by a real producer, and `doctor-dev.test.ts` mutation-tests each
 * one — breaks the condition, asserts the probe stops passing. Two guards inside the classifiers
 * exist for the same reason and are worth naming, because both would otherwise be silent vacuous
 * greens: {@link classifyWriteAuthority} returns `unknown` (never `installed`) when the expected
 * rule set computes EMPTY, and {@link classifyDbReachability}'s `not-attempted` keeps a missing
 * `STORYTREE_DB_USER` from being reported as a database outage.
 *
 * THE SECOND-ORDER TRAP, WHICH IS THIS MODULE'S OWN. These probes are authored on the Windows box
 * they will pass on; one written against Windows behaviour that silently no-ops elsewhere would hand
 * an unprovisioned Linux box a green doctor — the very defect being fixed, reintroduced by the fix.
 * So every platform-sensitive mechanism is a PURE function over an injected `platform`/`env`
 * ({@link adcCredentialsPath}) and is tested on both, and the one mechanism that has only ever been
 * exercised on Windows (`write-authority`) can report UNKNOWN rather than PASS.
 *
 * D3 NEVER-HANDLE-CREDENTIALS (ADR-0207) BINDS HARDEST HERE, because this group is the one that
 * looks at credentials at all. Every probe below observes PRESENCE and NON-BLANKNESS only: no value
 * is read into a detail, logged, hashed, or compared. `gcloud-adc` stats a file it never opens;
 * `secrets-file` reads the JSON but emits only KEY NAMES; `gh-auth` runs `gh auth status` with its
 * output discarded, because that command prints a masked token; `db-reachable` reports a verdict and
 * an elapsed time and deliberately drops the connector's own error string, which can carry the IAM
 * principal.
 *
 * BLANK IS A GAP, NOT A CREDENTIAL. {@link presentEnv}'s rule is applied to the secrets FILE as well
 * as the environment, for the reason recorded in `packages/drive/src/secrets.ts`: reading `VAR=` as
 * present once sent an empty string to the Cloud SQL connector and made a perfectly healthy database
 * report itself unreachable for ~25 minutes.
 *
 * WHAT THIS GROUP OWNS THAT THE EXPLORER SET DOES NOT, ADDED BY `codex-onboarding-journey-arc`: the
 * OPT-IN SECOND RUNTIME. `codex-cli` and `codex-login` sit here rather than beside `claude-cli` /
 * `claude-credential` on the explorer side, and the symmetry is deliberately not the argument. The
 * Claude CLI is the EXPLORER'S OWN HARNESS — it is what they are reading storytree through — whereas
 * Codex is a way of doing WORK: driving a session, or running the `--runtime codex` prove-it leaf.
 * An ADR-0207 explorer needs neither, so putting them in the explorer set would hand every explorer
 * two permanent warnings about a runtime they will never use, in the group most sensitive to noise.
 * Both are WARN-only for a stated reason (see the probes); neither can ever break a sweep.
 *
 * THE REPAIR VOCABULARY. ADR-0207 D6's rule is that a probe never invents machinery — it points at
 * the ONE idempotent step that repairs it. Two of these probes repair through a real `install.ps1`
 * `# @step:` marker and carry a {@link Probe.fixStep} accordingly; the rest repair through a step of
 * `docs/machine-onboarding.md`, whose anchors are frozen in {@link GUIDE_ANCHORS} by agreement with
 * the session writing that guide in parallel. The hints name those anchors; the test asserts every
 * hint names one, so a renamed anchor cannot silently rot into a dead pointer.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  isChatGptManagedLogin,
  scrubMeteredCodexAuth,
  type CodexCommandResult,
} from "@storytree/agent";
import {
  DB_PROBE_TIMEOUT_MS,
  SECRET_KEYS,
  deriveIdentity,
  lobbyDenyRules,
  presentEnv,
  probeLiveDbDetailed,
  type ManifestRootSlice,
} from "@storytree/drive";

import type { Probe } from "./doctor.js";
import { defaultWallInstallIo, protectedRoot, userSettingsPath } from "./write-authority-install.js";

// ---------------------------------------------------------------------------
// The guide the fix hints point at (inc-04's `docs/machine-onboarding.md`).
// ---------------------------------------------------------------------------

/** The machine-onboarding guide, repo-relative. The dev group's repair vocabulary lives in it. */
export const MACHINE_GUIDE = "docs/machine-onboarding.md";

/**
 * The Codex journey document — the ONE place both Codex journeys are written down
 * (`codex-onboarding-journey-arc`). Named separately from {@link MACHINE_GUIDE} rather than added to
 * {@link GUIDE_ANCHORS}, because it is a different document and not an anchor within that one: the
 * machine guide covers what EVERY runtime needs, and this covers the opt-in one. The Codex hints
 * name it FIRST and the machine guide second, so a reader following a Codex row lands on the
 * document that answers instead of on a signpost that redirects.
 */
export const CODEX_GUIDE = "docs/codex-onboarding.md";

/**
 * The guide's step anchors. FROZEN BY AGREEMENT, not by observation: this module and the guide were
 * written in parallel branches, so the anchors are a contract fixed up front rather than something
 * either side reads off the other. Asserting them as a literal set is what keeps a later rename from
 * turning every hint into a dead pointer with nothing to say so — the guide file itself cannot be
 * the check, because a check that no-ops while the file is absent is exactly the vacuous green this
 * module exists to prevent.
 */
export const GUIDE_ANCHORS = {
  bootstrap: "#1-bootstrap-the-machine",
  signIns: "#2-the-three-sign-ins",
  secrets: "#3-the-secrets-file",
  worktree: "#4-work-from-a-linked-worktree",
  wall: "#5-install-the-write-authority-wall",
  proveIt: "#6-prove-it",
} as const;

/** `docs/machine-onboarding.md#<anchor>` — the pointer form every dev fix hint ends with. */
export function guideStep(anchor: keyof typeof GUIDE_ANCHORS): string {
  return `${MACHINE_GUIDE}${GUIDE_ANCHORS[anchor]}`;
}

// ---------------------------------------------------------------------------
// Observation shapes — one union per probe, each with a real producer per member.
// ---------------------------------------------------------------------------

/** gcloud application-default credentials, by FILE EXISTENCE only — the file is never opened. */
export type AdcState = "present" | "absent";

/**
 * The live store's answer to the canonical `createPool` + `SELECT 1`.
 *
 * `not-attempted` is not defensive padding: `createPool` REFUSES without `STORYTREE_DB_USER`, so
 * running the probe anyway would spend the budget and then report a missing credential as a database
 * that did not answer — an over-claim that sends the reader down the `db:up` / cold-start / ADR-0250
 * tree rooted at the wrong substrate. The state exists so the probe can say which half is missing.
 */
export type DbReachability = "reachable" | "unreachable" | "not-attempted";

/** `gh` presence and authentication, read from `gh auth status`'s EXIT CODE (never its output). */
export type GhAuthState = "authenticated" | "unauthenticated" | "absent";

/**
 * Whether Bun is INVOKABLE — which is a different question from whether it is installed, and the
 * difference is the whole reason this probe exists (ADR-0433 D3).
 *
 * `bun-runtime-migration-arc` made Bun the test RUNTIME for 21 packages while deliberately ruling
 * the package-manager axis out of scope: pnpm still installs everything and still owns
 * `pnpm-lock.yaml`. So Bun is a MACHINE dependency in the same class as `git`, `gh` and `gcloud` —
 * `pnpm install` cannot supply it, and nothing in the workspace can.
 *
 * ⚠ `absent` here means "not resolvable on PATH", NOT "not on disk". Measured on the owner's box
 * 2026-08-24: the binary had been installed for four days and was simply not on PATH, and the gate
 * reported seven packages as `test: Failed` — a message naming neither Bun nor PATH. An installed
 * binary nothing can invoke is indistinguishable from an absent one, which is why the observation
 * is an invocation rather than a file stat.
 */
export type BunState = "present" | "absent";

/**
 * Which Codex binary, if any, ANSWERED when invoked — the observation behind the `codex-cli` probe
 * (`codex-onboarding-journey-arc`).
 *
 * THREE STATES BECAUSE THERE ARE TWO CODEX JOURNEYS AND THEY HAVE DIFFERENT BINARIES. Journey A is
 * Codex as the interactive session driver: a person opens Codex Desktop or the `codex` CLI on this
 * repository and it runs the session loop. Journey B is Codex as the PROVE-IT LEAF (`--runtime
 * codex`, ADR-0232/ADR-0356), where the spine drives one `codex exec` turn per phase through the
 * wrapper `@openai/codex` pins into `packages/agent/node_modules`. A boolean would have to pick one
 * of them and would then report the other as healthy or as broken, both wrongly:
 *   • `path`           — the PRODUCT answered on PATH. Both journeys have their binary.
 *   • `workspace-only` — ONLY the pinned leaf wrapper answered. This is the state `pnpm install`
 *                        leaves on EVERY provisioned box, so it is the commonest reading in the
 *                        fleet and it means exactly: the leaf can run, an interactive Codex session
 *                        cannot be started here.
 *   • `absent`         — neither answered. Not even the leaf can run.
 *
 * ⚠ `absent` means "did not answer when invoked", NOT "not on disk" — {@link BunState}'s rule, and
 * for the same measured reason: an installed binary nothing can reach is indistinguishable from an
 * absent one to every caller that matters. So this is an INVOCATION, never a file stat, on both
 * routes. The wrapper is invoked THROUGH `node` rather than through its `.bin` shim, so the reading
 * does not depend on a shim shape that differs by platform (a symlink here, a `.CMD` on Windows).
 *
 * ⚠ KNOWN BLINDNESS, stated rather than papered over: like every probe in this group except
 * {@link ToolchainShellState}, this one runs in DOCTOR'S OWN environment. A machine where `codex`
 * resolves for the operator's interactive shell but not for an ssh-driven or hook-driven one reads
 * `path` here and still fails that work. `toolchain-shell` is the probe that asks that question, and
 * `codex` is deliberately NOT added to {@link TOOLCHAIN_COMMANDS} — Codex is opt-in (ADR-0030), so
 * requiring it there would turn an existing probe permanently red on every Claude-only box.
 */
export type CodexCliState = "path" | "workspace-only" | "absent";

/**
 * Whether a Codex credential of the ONE kind ADR-0232 accepts is present.
 *
 * THE PREDICATE IS THE LEAF'S OWN. `isChatGptManagedLogin` is imported from `@storytree/agent` — the
 * exact function `CodexPhaseAuthor` calls before every phase — rather than re-implemented here, on
 * the `db-reachable`/`probeLiveDbDetailed` precedent: a probe that PASSED where the leaf REFUSES
 * would be the false healthy this arc exists to remove, wearing a subtler mask. The environment is
 * scrubbed with the leaf's own `scrubMeteredCodexAuth` first, for the same reason — the leaf strips
 * `OPENAI_API_KEY` / `CODEX_API_KEY` / `CODEX_ACCESS_TOKEN` before it asks, so a probe that left
 * them in place could observe a login the leaf will never see.
 *
 *   • `chatgpt`      — `codex login status` exited 0 emitting exactly the ChatGPT-managed line on
 *                      one channel and nothing on the other. The only state the leaf accepts.
 *   • `other`        — it exited 0 but did NOT emit that line: a login exists and is not the one
 *                      ADR-0232 permits (an API-key login is the shape to expect). The leaf refuses.
 *   • `logged-out`   — it answered non-zero. No credential; `~/.codex/auth.json` is not there.
 *   • `undetermined` — no Codex binary could be invoked to ask. A question that could not be put has
 *                      not been answered, so this is never a PASS ({@link ToolchainShellUnavailable}'s
 *                      rule) — and never a FAIL either, since it is the CLI that is missing, not the
 *                      credential, and `codex-cli` is the row that owns that finding.
 *
 * D3 BOUNDARY: this is a bounded enum and the classifier is where the CLI's raw output dies. No
 * status text, path or token ever reaches an observation, a detail or a hint.
 */
export type CodexLoginState = "chatgpt" | "other" | "logged-out" | "undetermined";

/**
 * The commands automation on this machine must be able to resolve. One list, shared by the probe
 * script and the classifier, so the thing asked for and the thing checked can never diverge.
 */
export const TOOLCHAIN_COMMANDS = ["node", "pnpm", "bun"] as const;

/**
 * Whether a shell that is NOT DOCTOR'S OWN can resolve the toolchain — the one question no other
 * probe in this group can answer, because every one of them is either an in-process observation or a
 * subprocess INHERITING doctor's environment, and that environment is by construction one where the
 * toolchain resolved well enough to launch doctor.
 *
 * The states are the two shell SHAPES compared, not two tools:
 *   • `resolvable`   — a plain non-login, non-interactive `bash -c` resolves all of
 *     {@link TOOLCHAIN_COMMANDS}. That is the strictest shape, the one sshd and the SessionStart hook
 *     actually get, so if it answers, every looser shape does too.
 *   • `login-only`   — `bash -lc` resolves them and plain `bash -c` does not. A REAL steady state, not
 *     a transient: a plain non-login shell never sources `~/.bashrc` at all, so no edit to that file
 *     can reach it.
 *   • `unresolvable` — neither shape resolves them. This is the measured breakage: `~/.bashrc` puts
 *     the toolchain lines BELOW bash's own non-interactive early return, so `ssh box 'pnpm gate'`
 *     answers `pnpm: command not found` and the provision hook cannot find `node` — the hook that
 *     exists to announce a broken worktree, defeated by the gap it would have reported.
 *   • `no-shell`     — no reading could be taken. UNKNOWN, and never a PASS: see
 *     {@link ToolchainShellUnavailable} for the two producers and why they must not read alike.
 */
export type ToolchainShellState = "resolvable" | "login-only" | "unresolvable" | "no-shell";

/**
 * Why {@link ToolchainShellState} reached `no-shell`. Two genuinely different producers reaching one
 * state, on {@link classifyWriteAuthority}'s precedent — so the DETAIL has to tell them apart:
 *   • `not-posix` — Windows. The login/non-login dotfile split is a POSIX mechanism; here PATH comes
 *     from the persistent user environment and every new process inherits it, so there are not two
 *     shapes to compare. This is THIS MODULE'S SECOND-ORDER TRAP handled in the direction it actually
 *     points: the probe is authored for Linux, so a silent PASS on Windows would hand the box a green
 *     for a mechanism only ever exercised elsewhere — the defect reintroduced by its own fix.
 *   • `no-bash`   — bash itself could not be invoked, so neither shape could be asked. A shape that
 *     could not be asked has not been verified.
 */
export type ToolchainShellUnavailable = "not-posix" | "no-bash";

/**
 * What each shell shape resolved — carried beside the state on the `dbReachable`/`dbElapsedMs` and
 * `bun`/`bunVersion` precedent: the STATE picks the level, the datum makes the detail line say
 * something a reader can act on ("a login shell finds node, pnpm — a plain one finds nothing").
 *
 * Names only, never a PATH and never an environment: this module emits no value it was handed.
 */
export interface ToolchainShellReadings {
  /** Commands `bash -lc` resolved (a LOGIN shell: sources `~/.profile`, hence `~/.bashrc`). */
  readonly login: readonly string[] | null;
  /** Commands plain `bash -c` resolved (neither login nor interactive: sources NEITHER file). */
  readonly plain: readonly string[] | null;
  /** Set only when no reading could be taken at all; null whenever both shapes answered. */
  readonly unavailable: ToolchainShellUnavailable | null;
}

/**
 * The generated `permissions.deny` block for THIS checkout (ADR-0255/0257/0284).
 *
 * `stale` is a first-class state because the block is DERIVED from `repo-manifest.json`: a new
 * top-level entry leaves the wall silently short by exactly that path, which reads as installed to
 * anything that only asks "is there a block?". `unknown` is the platform/undeterminable escape —
 * see {@link classifyWriteAuthority} for the three producers and why none of them may read as PASS.
 */
export type WriteAuthorityState = "installed" | "stale" | "absent" | "unknown";

/**
 * Whether {@link deriveIdentity} would return a claimable identity from the cwd — i.e. whether
 * `noticeboard declare` can succeed here at all. `primary-checkout` is the deliberate ADR-0033 D1
 * refusal (the shared lobby has no isolated identity); `no-identity` is every other shape, including
 * the unregistered empty husk a half-finished worktree create leaves behind.
 */
export type WorktreeIdentityState = "linked" | "primary-checkout" | "no-identity";

/**
 * `~/.storytree/secrets.json`, by KEY NAME only. No value is ever read into this object.
 *
 * The env split is load-bearing rather than pedantic. CLAUDE.md's rule is that env ALWAYS wins and
 * the file only fills gaps, so a machine carrying both variables in its environment works today —
 * but the file exists precisely because it survives across sessions and git worktrees, which an
 * exported variable does not. A key resolvable only from the environment is therefore working-now
 * and not durable: a WARN, not a failure, and not a PASS either.
 */
export interface SecretsFileState {
  /** Whether the file could be read and parsed as a JSON object. */
  readonly file: "ok" | "absent" | "unreadable";
  /** {@link SECRET_KEYS} holding a non-blank string IN THE FILE. Names only. */
  readonly keysInFile: readonly string[];
  /** {@link SECRET_KEYS} absent/blank in the file but non-blank in the environment. Names only. */
  readonly keysFromEnvOnly: readonly string[];
  /** {@link SECRET_KEYS} resolvable from neither. Names only. */
  readonly keysMissing: readonly string[];
}

/** The RAW dev-persona observations {@link devProbes} decides over — gathered by the shell. */
export interface DevObservations {
  readonly gcloudAdc: AdcState;
  readonly dbReachable: DbReachability;
  /**
   * How long the DB probe took, or null when it was not attempted. The connector's own error string
   * is deliberately NOT carried: it can name the IAM principal, and the elapsed time plus the state
   * is what actually distinguishes the reader's cases (a cold start runs long, a refusal returns).
   */
  readonly dbElapsedMs: number | null;
  readonly secretsFile: SecretsFileState;
  readonly ghAuth: GhAuthState;
  /** Whether `bun` answered when invoked — see {@link BunState} for why this is not a file stat. */
  readonly bun: BunState;
  /**
   * The version `bun --version` reported, or null when it did not answer. Carried as its own field
   * on the `dbReachable`/`dbElapsedMs` precedent: the STATE decides the level, the datum makes the
   * detail line say something a reader can act on.
   *
   * Deliberately NOT compared against CI's pinned `bun-version` (1.4.0 in `ci.yml`). No version skew
   * has cost anything yet, and a floor invented ahead of its evidence is a second source of truth
   * that must be updated in lockstep with the workflow — the hand-maintained-list failure ADR-0433
   * D5 declines on its own account. If skew ever bites, the honest fix reads the pin from `ci.yml`
   * rather than restating it here.
   */
  readonly bunVersion: string | null;
  /** Which Codex binary answered when invoked — see {@link CodexCliState}. Never a file stat. */
  readonly codexCli: CodexCliState;
  /**
   * The version string whichever Codex binary answered reported, or null when none did. Carried as
   * its own field on the `bun`/`bunVersion` precedent: the STATE picks the level, the datum makes
   * the detail line say something a reader can act on. Deliberately NOT compared against the
   * `@openai/codex` pin in `packages/agent/package.json` — the leaf runs the pinned wrapper it
   * resolves itself, so a PATH product at a different version is not a defect, and a floor invented
   * ahead of its evidence is a second source of truth (the `bunVersion` reasoning, verbatim).
   */
  readonly codexVersion: string | null;
  /** Whether a ChatGPT-managed Codex login is present — see {@link CodexLoginState}. */
  readonly codexLogin: CodexLoginState;
  readonly writeAuthority: WriteAuthorityState;
  readonly worktreeIdentity: WorktreeIdentityState;
  /** Whether a shell OTHER than doctor's own resolves the toolchain — see {@link ToolchainShellState}. */
  readonly toolchainShell: ToolchainShellState;
  /** What each shell shape found; the datum behind the state. See {@link ToolchainShellReadings}. */
  readonly toolchainShellReadings: ToolchainShellReadings;
}

// ---------------------------------------------------------------------------
// PURE: the level / fix-hint policy.
// ---------------------------------------------------------------------------

/**
 * PURE: resolve the dev-persona probes from the raw observations. Appended to the explorer group by
 * {@link ../doctor.ts | runDoctor} only when dev observations were gathered.
 *
 * LEVELS, and why they are not uniform. FAIL is reserved for an invariant whose absence stops the
 * machine doing work and whose remedy is unambiguous — no ADC, no credential, no GitHub auth. The
 * other three are WARNs on stated reasoning rather than timidity:
 *   • `db-reachable` can never FAIL, because doctor's standing invariant is that it runs offline and
 *     an unreachable database is indistinguishable from an offline doctor. It follows the
 *     `repo-fetchable` / `hosted-read` rule exactly: doctor never reports a broken environment
 *     merely because doctor ran with no network.
 *   • `write-authority` is a containment guardrail, not a capability — its absence costs isolation,
 *     not the ability to work — and ADR-0284 records that the wall does not bind Bash or Codex
 *     anyway. A FAIL would also red every non-Windows box for a mechanism only ever verified there.
 *   • `worktree-identity` reports WHERE you are standing, and the primary checkout is a legitimate
 *     place to stand for every read command. It is a pre-explanation for a refusal, not a defect.
 */
export function devProbes(obs: DevObservations): Probe[] {
  const probes: Probe[] = [];

  // --- gcloud-adc ------------------------------------------------------------------------------
  // PRESENCE ONLY. ADR-0021 makes DB auth keyless Cloud SQL IAM over ambient ADC, so this file's
  // absence is the root cause behind a whole family of downstream symptoms (a --pg read that hangs,
  // a --real build that refuses its preflight). It is stat'd, never opened: doctor has no business
  // reading a credential, and the question it answers does not need the contents.
  probes.push(
    obs.gcloudAdc === "present"
      ? {
          name: "gcloud-adc",
          level: "PASS",
          detail: "application-default credentials are present (file existence only — never read)",
        }
      : {
          name: "gcloud-adc",
          level: "FAIL",
          detail: "no gcloud application-default credentials found",
          fixHint:
            "run `gcloud auth application-default login`. DB auth is keyless Cloud SQL IAM over " +
            `ambient ADC (ADR-0021) — there is no key file to fall back on. See ${guideStep("signIns")}.`,
        },
  );

  // --- db-reachable ----------------------------------------------------------------------------
  // The canonical probe `pnpm db:probe` runs, at the canonical budget, so the two can never
  // disagree. NEVER A FAIL: see the levels note above.
  if (obs.dbReachable === "reachable") {
    probes.push({
      name: "db-reachable",
      level: "PASS",
      detail: `the live store answered SELECT 1 in ${obs.dbElapsedMs ?? 0} ms`,
    });
  } else if (obs.dbReachable === "not-attempted") {
    probes.push({
      name: "db-reachable",
      level: "WARN",
      detail: "not attempted — STORYTREE_DB_USER is not set, so the connector would refuse before dialling",
      fixHint:
        "this is a CREDENTIAL gap, not a database one — fix `secrets-file` first and re-run. " +
        `See ${guideStep("secrets")}.`,
    });
  } else {
    probes.push({
      name: "db-reachable",
      level: "WARN",
      detail: `the live store did not answer within ${Math.round((obs.dbElapsedMs ?? DB_PROBE_TIMEOUT_MS) / 1000)}s`,
      fixHint:
        "bring it up with `pnpm db:up`, then re-probe with `pnpm db:probe`. TWO traps before you " +
        "conclude anything: an instance at status RUNNABLE can be COLD-STARTING (measured up to " +
        "~21 min) — that is not a wedge, wait and re-probe; and a SATURATED box makes this probe " +
        "lie, so check `storytree own --all` before trusting a refusal. Offline is also this " +
        `answer, which is why it can never fail the sweep. See ${guideStep("proveIt")}.`,
    });
  }

  // --- secrets-file ----------------------------------------------------------------------------
  // KEY NAMES ONLY — this probe sits directly on the ADR-0207 D3 trust boundary, and the one thing
  // it must never do is prove it read a value. Blankness is a gap (presentEnv's rule), applied to
  // the file as well as the environment.
  {
    const { file, keysFromEnvOnly, keysMissing } = obs.secretsFile;
    const where =
      file === "ok"
        ? ""
        : file === "absent"
          ? " (~/.storytree/secrets.json is absent)"
          : " (~/.storytree/secrets.json is present but is not readable JSON)";
    if (keysMissing.length > 0) {
      probes.push({
        name: "secrets-file",
        level: "FAIL",
        detail: `no non-blank value for ${keysMissing.join(", ")}${where}`,
        fixHint:
          "write `~/.storytree/secrets.json` as a JSON object holding " +
          `${SECRET_KEYS.join(" and ")}. A BLANK value is a gap, not a credential — an empty ` +
          "string travels to the connector and surfaces as a healthy database reporting itself " +
          `unreachable. storytree never handles the values (ADR-0207 D3). See ${guideStep("secrets")}.`,
      });
    } else if (keysFromEnvOnly.length > 0) {
      probes.push({
        name: "secrets-file",
        level: "WARN",
        detail: `${keysFromEnvOnly.join(", ")} resolves from the environment only, not the file${where}`,
        fixHint:
          "this works in THIS shell and will not survive a fresh session or a new git worktree — " +
          `that durability is the whole reason the file exists. Move it into ` +
          `~/.storytree/secrets.json (env still wins where both are set). See ${guideStep("secrets")}.`,
      });
    } else {
      probes.push({
        name: "secrets-file",
        level: "PASS",
        detail: `~/.storytree/secrets.json holds a non-blank ${SECRET_KEYS.join(" and ")} (names only — values never read)`,
      });
    }
  }

  // --- gh-auth ---------------------------------------------------------------------------------
  // Without it the machine cannot open a PR, so it cannot LAND anything — the merge ceremony's last
  // step is unreachable. Both failure shapes repair through a real install.ps1 @step, so unlike the
  // rest of this group they carry a fixStep: this is the D6 repair vocabulary, not a new one.
  if (obs.ghAuth === "authenticated") {
    probes.push({ name: "gh-auth", level: "PASS", detail: "the GitHub CLI is authenticated" });
  } else if (obs.ghAuth === "unauthenticated") {
    probes.push({
      name: "gh-auth",
      level: "FAIL",
      detail: "the GitHub CLI is installed but not authenticated",
      fixStep: "github-auth",
      fixHint:
        "run `gh auth login` (the installer's github-auth step, install.ps1 @step:github-auth) — " +
        `without it this machine cannot open a PR and so cannot land anything. See ${guideStep("signIns")}.`,
    });
  } else {
    probes.push({
      name: "gh-auth",
      level: "FAIL",
      detail: "the `gh` CLI not found on PATH",
      fixStep: "gh-cli",
      fixHint:
        "install the GitHub CLI (install.ps1 @step:gh-cli), then `gh auth login`. See " +
        `${guideStep("signIns")}.`,
    });
  }

  // --- bun ---------------------------------------------------------------------------------------
  // A FAIL on this file's own stated rule: an invariant whose absence stops the machine doing work
  // and whose remedy is unambiguous. 21 packages' `test` scripts ARE `bun test`, so without Bun the
  // gate cannot be trusted — and it does not merely fail, it fails DISHONESTLY, naming packages
  // rather than the missing runtime. This probe exists to turn that into one line.
  //
  // Local fact, no network, so doctor's offline invariant (see the levels note above) does not apply
  // the way it does to `db-reachable`.
  probes.push(
    obs.bun === "present"
      ? {
          name: "bun",
          level: "PASS",
          detail: `bun ${obs.bunVersion ?? "(version unreported)"} is on PATH`,
        }
      : {
          name: "bun",
          level: "FAIL",
          detail: "bun is not resolvable on PATH — 21 packages run their tests through it",
          fixHint:
            "install Bun (https://bun.sh) and put its bin directory on PATH — on Windows that is " +
            "typically `%USERPROFILE%\\.bun\\bin`. CHECK PATH BEFORE RE-INSTALLING: an installed " +
            "Bun that is not on PATH reads exactly like an absent one here, and that is the case " +
            "actually observed. Never run `bun install` — pnpm owns the lockfile " +
            `(bun is a test RUNTIME only). See ${guideStep("bootstrap")}.`,
        },
  );

  // --- codex-cli ---------------------------------------------------------------------------------
  // THE ROW WHOSE ABSENCE WAS THE FINDING (`codex-onboarding-journey-arc`). Until this landed, doctor
  // probed `claude-cli` and `claude-credential` and had NO Codex counterpart at all, so it printed
  // "setup is healthy" on a host where Codex had never been installed — measured on the owner's Linux
  // box 2026-08-28: `0 failing, 3 warning, 16 passing - dev setup is healthy`, with no `codex` on PATH
  // and no `~/.codex/auth.json`. A missing probe reads as reassurance, which is worse than a red.
  //
  // WARN AND NEVER FAIL, on this file's own stated bar. FAIL is reserved for an invariant whose
  // absence stops THE MACHINE doing work. Codex is opt-in (ADR-0030: Claude Agent SDK by default,
  // Codex opt-in), so a Claude-only box with no Codex is a complete and correct configuration, not a
  // broken one — it simply cannot drive Codex sessions or run `--runtime codex` builds, which is what
  // these details say. A FAIL here would red every box in the fleet permanently, and a permanently-red
  // doctor teaches readers to ignore doctor: the vacuous green wearing the other mask, exactly the
  // reasoning `toolchain-shell`'s `login-only` WARN already applies. Promote to FAIL only if Codex
  // stops being opt-in, or against a box that has DECLARED itself Codex-primary — a state that does
  // not exist today and should not be invented ahead of a machine that needs it.
  //
  // It DOES carry a fixStep: the remedy is an install, which is exactly what the D6 repair vocabulary
  // is for. Its sibling `codex-login` deliberately carries none (see there).
  if (obs.codexCli === "path") {
    probes.push({
      name: "codex-cli",
      level: "PASS",
      detail: `the Codex CLI answered on PATH (${obs.codexVersion ?? "version unreported"})`,
    });
  } else if (obs.codexCli === "workspace-only") {
    probes.push({
      name: "codex-cli",
      level: "WARN",
      detail:
        "no Codex CLI on PATH — only the pinned leaf wrapper in packages/agent/node_modules answered " +
        `(${obs.codexVersion ?? "version unreported"})`,
      fixStep: "codex-cli",
      fixHint:
        "this is what `pnpm install` alone leaves, and it is enough for the prove-it leaf " +
        "(`--runtime codex`) but NOT for an interactive Codex session on this repo. If you want one, " +
        "install the product (`npm install -g @openai/codex`, or Codex Desktop) and re-run. If this " +
        "box only ever drives Claude, this row is informational and nothing is wrong. " +
        `See ${CODEX_GUIDE}, and ${guideStep("bootstrap")}.`,
    });
  } else {
    probes.push({
      name: "codex-cli",
      level: "WARN",
      detail:
        "no Codex CLI answered — neither on PATH nor the pinned wrapper in packages/agent/node_modules",
      fixStep: "codex-cli",
      fixHint:
        "NEITHER Codex journey can run here. The leaf's binary comes from `pnpm install` " +
        "(`@openai/codex` is pinned by packages/agent), so its absence usually means the workspace " +
        "is not provisioned — check `checkout-provisioned` first. For an interactive Codex session " +
        `install the product: \`npm install -g @openai/codex\` (no root needed). See ${CODEX_GUIDE}, and ${guideStep("bootstrap")}.`,
    });
  }

  // --- codex-login -------------------------------------------------------------------------------
  // DETECT AND INSTRUCT, NEVER REPAIR — ADR-0207 D3's surviving half, applied exactly as
  // `claude-credential` applies it: NO fixStep, because storytree never mints, captures or discloses
  // a credential and a Codex sign-in is a browser action only the operator can take. Naming an
  // installer step here would be a false entry in the D6 repair vocabulary (the `dependencies-current`
  // precedent), because no installer step can produce a login.
  //
  // THE ASYMMETRY WITH `claude-credential` IS THE RULE BEING APPLIED, NOT BROKEN — do not "fix" it.
  // `claude-credential` is named for its SUBJECT because ADR-0430 gave Claude TWO disjoint routes to
  // one credential (a browser login, or a vault-fetched token) and neither is the subject. ADR-0232
  // gives the Codex leaf saved ChatGPT-managed auth ONLY: the API-key fallback is forbidden and the
  // three key variables are stripped before every run. Codex therefore has exactly ONE route and it
  // IS a login, so `codex-login` beside `claude-credential` is two probes each asserting exactly what
  // it observes. If Codex ever gains a vault route it renames then, on the same rule.
  //
  // WHY IT IS A SEPARATE PROBE FROM `codex-cli`, AND THE COUPLING IT EXISTS TO STATE. `pnpm install`
  // gives the leaf its BINARY and never its CREDENTIAL: the leaf hydrates no secrets, deliberately,
  // unlike the Claude leaf. So the credential is a side effect of the INTERACTIVE product's ChatGPT
  // sign-in, a coupling nothing in the repository stated before this row existed. Folding the two
  // into one probe would hide precisely the state that costs an afternoon — binary present, work
  // still impossible.
  if (obs.codexLogin === "chatgpt") {
    probes.push({
      name: "codex-login",
      level: "PASS",
      detail: "a ChatGPT-managed Codex login is present (status read by name only — no value is read)",
    });
  } else if (obs.codexLogin === "other") {
    probes.push({
      name: "codex-login",
      level: "WARN",
      detail: "the Codex CLI reports a login that is NOT ChatGPT-managed — the leaf will refuse it",
      fixHint:
        "ADR-0232 accepts subscription (ChatGPT-managed) auth ONLY; an API-key login is forbidden and " +
        "OPENAI_API_KEY / CODEX_API_KEY / CODEX_ACCESS_TOKEN are stripped before every run, so " +
        "`--runtime codex` will refuse with `Codex subscription auth required`. Run `codex login` and " +
        `sign in with your ChatGPT account. storytree never mints or handles the credential. See ${CODEX_GUIDE}, and ${guideStep("bootstrap")}.`,
    });
  } else if (obs.codexLogin === "logged-out") {
    probes.push({
      name: "codex-login",
      level: "WARN",
      detail: "the Codex CLI reports no login — `~/.codex/auth.json` has not been written",
      fixHint:
        "run `codex login` and sign in with your ChatGPT account (a browser action; storytree never " +
        "mints or handles the credential). `pnpm install` gives the prove-it leaf its BINARY and never " +
        "its credential, so this is the step that makes `--runtime codex` builds — and an interactive " +
        `Codex session — actually work. See ${CODEX_GUIDE}, and ${guideStep("bootstrap")}.`,
    });
  } else {
    probes.push({
      name: "codex-login",
      level: "WARN",
      detail: "Codex login not determined — no Codex CLI could be invoked to ask",
      fixHint:
        "this is the `codex-cli` finding, not a credential one: fix that row first and re-run. A " +
        "question that could not be put has not been answered, so this never reads as a pass. " +
        `See ${CODEX_GUIDE}, and ${guideStep("bootstrap")}.`,
    });
  }

  // --- toolchain-shell -------------------------------------------------------------------------
  // THE PROBE THAT ASKS A SHELL THAT IS NOT DOCTOR'S OWN. Every other probe in this group is an
  // in-process observation or a subprocess INHERITING doctor's environment, and doctor's environment
  // is by construction one where the toolchain resolved well enough to launch doctor. So the group is
  // blind IN PRINCIPLE to the machine where `ssh box 'pnpm gate'` answers `pnpm: command not found`
  // and the SessionStart provision hook cannot resolve `node` — the state that left a worktree
  // unprovisioned while this very group reported the toolchain healthy. That is the module header's
  // own fault class arriving from a direction the header did not anticipate: the instrument cannot
  // observe the state that would have stopped the instrument running.
  //
  // The nearest precedent is one step in. ADR-0433 D3's `bun` probe INVOKES rather than stats, because
  // an installed binary nothing can invoke is indistinguishable from an absent one. This is that same
  // argument one step further out: a toolchain no OTHER shell can invoke is, to every automation
  // caller, absent.
  //
  // WHY THE LEVELS ARE NOT UNIFORM, which is the part most easily got wrong. `login-only` is a WARN
  // and not a FAIL because it is a legitimate steady state — a plain non-login shell never sources
  // `~/.bashrc`, so a box whose dotfiles are as good as dotfiles can be still reads `login-only`, and
  // a FAIL would red it permanently. A permanent red teaches readers to ignore doctor, which is the
  // vacuous-green failure wearing the other mask. `unresolvable` IS a FAIL on this file's own stated
  // bar: it stops all ssh-driven and hook-driven work, and its remedy is unambiguous.
  {
    const { login, plain, unavailable } = obs.toolchainShellReadings;
    const found = (names: readonly string[] | null): string =>
      names === null || names.length === 0 ? "nothing" : names.join(", ");
    const shapes = `a login shell finds ${found(login)}, a plain non-interactive shell finds ${found(plain)}`;

    if (obs.toolchainShell === "resolvable") {
      probes.push({
        name: "toolchain-shell",
        level: "PASS",
        detail: `a plain non-interactive shell resolves ${TOOLCHAIN_COMMANDS.join(", ")} — ssh- and hook-driven work can run`,
      });
    } else if (obs.toolchainShell === "login-only") {
      probes.push({
        name: "toolchain-shell",
        level: "WARN",
        detail: `only a LOGIN shell resolves the toolchain — ${shapes}`,
        fixHint:
          "do NOT reach for ~/.bashrc: a plain non-login, non-interactive bash never sources it, so " +
          "that edit cannot reach this shape however many times it is tried. Only something read " +
          "unconditionally gets there — a wrapper that sets the environment itself (this fleet uses " +
          "`~/.storytree/fleet-ssh/stfleet`), or BASH_ENV. A WARN because ssh- and hook-driven work " +
          `still runs through the login shape; this is the residue, not a break. See ${guideStep("bootstrap")}.`,
      });
    } else if (obs.toolchainShell === "unresolvable") {
      probes.push({
        name: "toolchain-shell",
        level: "FAIL",
        detail: `no shell but doctor's own resolves the toolchain — ${shapes}`,
        fixHint:
          "the toolchain lines are almost certainly BELOW ~/.bashrc's non-interactive early return " +
          "(the `case $- in *i*) ;; *) return;; esac` near the top), so no non-interactive shell ever " +
          "reaches them. Move them ABOVE that return, or into ~/.profile. Until then every ssh-driven " +
          "command and every SessionStart hook gets `command not found` — including the hook whose job " +
          `is to announce a broken worktree. See ${guideStep("bootstrap")}.`,
      });
    } else if (unavailable === "not-posix") {
      probes.push({
        name: "toolchain-shell",
        level: "WARN",
        detail: "not determined here — the login/non-login shell split is a POSIX mechanism, and this is not a POSIX machine",
        fixHint:
          "an UNKNOWN here is deliberate and is NOT a no-op. On Windows, PATH comes from the " +
          "persistent user environment and every new process inherits it, so there are not two shell " +
          "shapes to compare and nothing this probe could honestly assert. A silent PASS would hand " +
          "this machine a green for a mechanism only ever exercised on Linux — which is the exact " +
          `defect this probe exists to remove. Run it on the Linux box. See ${guideStep("bootstrap")}.`,
      });
    } else {
      probes.push({
        name: "toolchain-shell",
        level: "WARN",
        detail: "not determined — bash could not be invoked, so the two shell shapes could not be compared",
        fixHint:
          "make `bash` resolvable and re-run. This is UNKNOWN rather than a pass on the same rule the " +
          "rest of this group follows: a shape that could not be asked has not been verified, and a " +
          `probe that cannot go red turns an unchecked machine into an authoritative green. See ${guideStep("bootstrap")}.`,
      });
    }
  }

  // --- write-authority -------------------------------------------------------------------------
  // THE PLATFORM-SENSITIVE ONE. The wall has only ever been exercised on Windows, so `unknown` is a
  // real verdict here rather than a hedge — and it is why this probe may never PASS on evidence it
  // does not have. WARN, never FAIL: an absent wall costs session isolation, not the ability to work.
  if (obs.writeAuthority === "installed") {
    probes.push({
      name: "write-authority",
      level: "PASS",
      detail: "the generated permissions.deny block is installed for this checkout",
    });
  } else if (obs.writeAuthority === "stale") {
    probes.push({
      name: "write-authority",
      level: "WARN",
      detail: "an older deny block is installed — it no longer covers every entry repo-manifest.json lists",
      fixHint:
        "re-run `pnpm storytree write-authority install --write` (idempotent). The block is DERIVED " +
        "from repo-manifest.json, so a new top-level entry leaves the wall short by exactly that " +
        `path — never hand-edit it. See ${guideStep("wall")}.`,
    });
  } else if (obs.writeAuthority === "absent") {
    probes.push({
      name: "write-authority",
      level: "WARN",
      detail: "no deny block is installed for this checkout — the primary checkout is writable by your file tools",
      fixHint:
        "run `pnpm storytree write-authority install --write` to install it (ADR-0255/0257). Until " +
        "then nothing refuses a file-tool write into the shared lobby; work from a linked worktree " +
        `regardless — the wall never bound Bash or Codex (ADR-0284). See ${guideStep("wall")}.`,
    });
  } else {
    probes.push({
      name: "write-authority",
      level: "WARN",
      detail: "wall state not determined (repo-manifest.json or ~/.claude/settings.json unreadable, or the rule set computed empty)",
      fixHint:
        "an UNKNOWN here is deliberate — the wall has only ever been exercised on Windows, and a " +
        "state that cannot be computed must not read as installed. Check that repo-manifest.json " +
        "parses and that ~/.claude/settings.json is valid JSON, then re-run " +
        `\`pnpm storytree write-authority install --write\`. See ${guideStep("wall")}.`,
    });
  }

  // --- worktree-identity -----------------------------------------------------------------------
  // The probe that EXPLAINS A REFUSAL IN ADVANCE. `noticeboard declare` refuses from the primary
  // checkout by design (ADR-0033 D1 — the shared lobby has no isolated identity to claim under), and
  // that refusal is correct, deliberate, and completely baffling on first contact. It calls
  // deriveIdentity itself rather than re-deriving the rule, so the two can never disagree.
  if (obs.worktreeIdentity === "linked") {
    probes.push({
      name: "worktree-identity",
      level: "PASS",
      detail: "this is a git-registered linked worktree — it has a claimable session identity",
    });
  } else if (obs.worktreeIdentity === "primary-checkout") {
    probes.push({
      name: "worktree-identity",
      level: "WARN",
      detail: "this is the PRIMARY CHECKOUT — it has no session identity, so `noticeboard declare` will refuse here",
      fixHint:
        "reads are fine from here; to CLAIM and land work, create and enter a linked worktree " +
        "(`pnpm storytree worktree create --node <id> --intent \"<what>\" --pg`, or " +
        "`git worktree add -b <branch> <path>`) and re-run from there. The refusal is deliberate, " +
        `not a bug — there is no flag to supply an identity. See ${guideStep("worktree")}.`,
    });
  } else {
    probes.push({
      name: "worktree-identity",
      level: "WARN",
      detail: "no session identity here (not a git worktree git has registered)",
      fixHint:
        "run from a git-registered linked worktree. An EMPTY, unregistered slot under " +
        "`.claude/worktrees/` is a known half-finished create (ADR-0033) and reads as this state — " +
        `\`git worktree list\` shows what git actually knows about. See ${guideStep("worktree")}.`,
    });
  }

  return probes;
}

// ---------------------------------------------------------------------------
// PURE classifiers — the platform-sensitive and parse-sensitive halves, injectable and tested.
// ---------------------------------------------------------------------------

/**
 * PURE: where gcloud keeps application-default credentials on this platform.
 *
 * Pure and platform-injected on purpose. Hard-coding the Windows location — which is `%APPDATA%`,
 * NOT `~/.config` — would make this probe silently report "absent" on every Linux box, handing a
 * FAIL to a correctly-provisioned machine; hard-coding the POSIX one would do the mirror image here.
 * Both are asserted in the test, on both platform values, from one machine.
 *
 * Precedence follows gcloud's own: an explicit `GOOGLE_APPLICATION_CREDENTIALS` file wins, then a
 * relocated `CLOUDSDK_CONFIG` directory, then the platform default.
 */
export function adcCredentialsPath(
  env: NodeJS.ProcessEnv,
  homeDir: string,
  platform: NodeJS.Platform,
): string {
  const explicit = presentEnv("GOOGLE_APPLICATION_CREDENTIALS", env);
  if (explicit !== undefined) return explicit;
  const configDir = presentEnv("CLOUDSDK_CONFIG", env);
  if (configDir !== undefined) return path.join(configDir, "application_default_credentials.json");
  if (platform === "win32") {
    const appData = presentEnv("APPDATA", env);
    if (appData !== undefined) return path.join(appData, "gcloud", "application_default_credentials.json");
  }
  return path.join(homeDir, ".config", "gcloud", "application_default_credentials.json");
}

/**
 * PURE: classify `~/.storytree/secrets.json` by KEY NAME. `body` is the raw file text, or null when
 * the file does not exist. NO VALUE IS RETURNED — the result carries names and nothing else.
 *
 * Blankness is applied on BOTH sides. A `"STORYTREE_DB_USER": ""` in the file is a gap exactly as
 * `STORYTREE_DB_USER=` in the environment is, because that is what the hydrator itself decides
 * (`loadLocalSecrets` skips a blank file value, `presentEnv` skips a blank env value) — a classifier
 * that disagreed would report a key the CLI will not actually use.
 */
export function classifySecretsFile(
  body: string | null,
  env: NodeJS.ProcessEnv = process.env,
): SecretsFileState {
  let doc: Record<string, unknown> | null = null;
  let file: SecretsFileState["file"] = "absent";
  if (body !== null) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        doc = parsed as Record<string, unknown>;
        file = "ok";
      } else {
        file = "unreadable";
      }
    } catch {
      file = "unreadable";
    }
  }

  const keysInFile: string[] = [];
  const keysFromEnvOnly: string[] = [];
  const keysMissing: string[] = [];
  for (const key of SECRET_KEYS) {
    const fromFile = doc?.[key];
    if (typeof fromFile === "string" && fromFile.trim().length > 0) keysInFile.push(key);
    else if (presentEnv(key, env) !== undefined) keysFromEnvOnly.push(key);
    else keysMissing.push(key);
  }
  return { file, keysInFile, keysFromEnvOnly, keysMissing };
}

/**
 * PURE: is the generated deny block installed for `primaryRoot`?
 *
 * THE VACUOUS-GREEN GUARD IS THE POINT OF THIS FUNCTION, not the comparison. Three separate inputs
 * can leave the expected rule set uncomputable or empty, and every one of them would otherwise
 * resolve to `installed` — a probe reporting an enforcing wall over a machine that has none:
 *   • an unreadable or unparseable `repo-manifest.json` — nothing to derive the rules FROM;
 *   • an unparseable `~/.claude/settings.json` — we cannot say a block is absent from a file we
 *     cannot read, and telling someone to reinstall over an unparseable settings file is wrong;
 *   • a manifest that parses but yields ZERO rules — an empty expectation is satisfied by an empty
 *     wall, so a naive `every` would report an enforcing wall over nothing at all.
 * All three return `unknown`, which the probe renders as WARN. A MISSING settings file is different
 * and is honestly `absent`: no file means no block.
 *
 * `generate` is injected for ONE reason, and it is the reason this increment exists. Today's
 * generator emits an `EXTRA_DENIED_DIRS` floor (`.git`, `node_modules`) for every input, so the
 * zero-rule branch is unreachable through it — and an unreachable guard is one a test cannot red,
 * which is the same vacuous green in defensive clothing. Injecting the generator makes the guard
 * provable without adding a second copy of the rules: the real path still calls
 * {@link lobbyDenyRules}, so the wall and this probe can never disagree about what a rule is.
 */
export function classifyWriteAuthority(
  settingsBody: string | null,
  manifestBody: string | null,
  primaryRoot: string,
  generate: (manifest: ManifestRootSlice, root: string) => string[] = lobbyDenyRules,
): WriteAuthorityState {
  if (manifestBody === null) return "unknown";
  let manifest: ManifestRootSlice;
  try {
    manifest = JSON.parse(manifestBody) as ManifestRootSlice;
  } catch {
    return "unknown";
  }

  let expected: string[];
  try {
    expected = generate(manifest, primaryRoot);
  } catch {
    return "unknown";
  }
  // An empty expectation is satisfied by anything, so it may never read as installed.
  if (expected.length === 0) return "unknown";

  if (settingsBody === null) return "absent";
  let deny: Set<string>;
  try {
    const parsed: unknown = JSON.parse(settingsBody);
    const perms = (parsed as { permissions?: { deny?: unknown } } | null)?.permissions;
    const list = perms?.deny;
    deny = new Set(Array.isArray(list) ? list.filter((r): r is string => typeof r === "string") : []);
  } catch {
    return "unknown";
  }

  const present = expected.filter((rule) => deny.has(rule)).length;
  if (present === expected.length) return "installed";
  return present === 0 ? "absent" : "stale";
}

/**
 * PURE: turn the identity answer plus git's two dir readings into the reportable state.
 *
 * `identityFound` comes from {@link deriveIdentity} itself rather than a re-derivation of its rules,
 * so the probe cannot drift from the thing it predicts. The git dirs are only ever used to explain
 * WHY there is no identity, never to decide whether there is one.
 */
export function classifyWorktreeIdentity(
  identityFound: boolean,
  gitDir: string | null,
  commonDir: string | null,
): WorktreeIdentityState {
  if (identityFound) return "linked";
  if (gitDir === null || commonDir === null) return "no-identity";
  const norm = (p: string): string => p.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  return norm(gitDir) === norm(commonDir) ? "primary-checkout" : "no-identity";
}

/**
 * PURE: the DB verdict, given the probe result and whether the connector's required credential is
 * even set. Separated from the round trip so the `not-attempted` short-circuit — the one branch that
 * decides a missing credential is not a database outage — is provable without a database.
 */
/** The DB verdict plus how long the probe took — `null` when no probe was attempted. */
export interface DbReachabilityVerdict {
  readonly state: DbReachability;
  readonly elapsedMs: number | null;
}

export function classifyDbReachability(
  dbUserPresent: boolean,
  result: { reachable: boolean; elapsedMs: number } | null,
): DbReachabilityVerdict {
  if (!dbUserPresent || result === null) return { state: "not-attempted", elapsedMs: null };
  return { state: result.reachable ? "reachable" : "unreachable", elapsedMs: result.elapsedMs };
}

// ---------------------------------------------------------------------------
// The shell: gather the real dev observations.
// ---------------------------------------------------------------------------

/** Read a file, or null when it is absent/unreadable. Never throws — an absent file is an answer. */
function readOrNull(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * `gh auth status`, read from its EXIT CODE ONLY. `stdio: "ignore"` is load-bearing rather than
 * tidy: that command prints the account's token (masked, but still a credential surface) and doctor
 * must not capture it — the D3 boundary applied to the one probe that shells out to an auth tool.
 */
function ghAuthState(): GhAuthState {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore", timeout: 10_000 });
    return "authenticated";
  } catch (err) {
    // ENOENT means the CLI is not installed at all — a different remedy from a failed sign-in.
    return (err as { code?: unknown }).code === "ENOENT" ? "absent" : "unauthenticated";
  }
}

/**
 * `bun --version`, read by INVOKING it — the observation ADR-0433 D3 needs.
 *
 * Not a file stat and not a lookup in a known install directory: both would report "installed" for
 * the exact machine state that breaks the gate, where the binary exists and nothing can reach it.
 * Any failure at all — ENOENT, a non-zero exit, a hang past the budget — is `absent`, because from
 * a test script's point of view they are the same thing.
 */
interface BunReading {
  readonly state: BunState;
  /** The version string bun reported, or null when it did not answer. */
  readonly version: string | null;
}

function bunState(): BunReading {
  try {
    const out = execFileSync("bun", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
    return { state: "present", version: out === "" ? null : out };
  } catch {
    return { state: "absent", version: null };
  }
}

/** How long either Codex invocation may take before it counts as no answer. */
const CODEX_PROBE_TIMEOUT_MS = 15_000;

/**
 * The pinned prove-it-leaf wrapper `@openai/codex` installs, repo-root-relative. EXPORTED so the path
 * is asserted rather than assumed: it is the one place this module names another package's private
 * `node_modules` layout, so a rename there would otherwise surface as a silent `workspace-only` ->
 * `absent` demotion on every box at once. Invoked through
 * `node` rather than through `packages/agent/node_modules/.bin/codex`, so the reading does not
 * depend on a shim shape that differs by platform (a symlink on POSIX, a `.CMD`/`.ps1` on Windows —
 * neither of which `spawnSync` runs uniformly without a shell).
 */
export const PINNED_CODEX_WRAPPER = path.join(
  "packages",
  "agent",
  "node_modules",
  "@openai",
  "codex",
  "bin",
  "codex.js",
);

/** Repo root: packages/cli/src/doctor-dev.ts -> four dirs up (the doctor.ts repoRoot pattern). */
export function repoRootFromHere(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

/**
 * Run one Codex command and return BOTH channels plus the exit code, or null when the binary could
 * not be invoked at all (ENOENT, a spawn error, or a hang past the budget).
 *
 * `spawnSync`, not `execFileSync`, for a load-bearing reason: {@link isChatGptManagedLogin} decides
 * on the two channels SEPARATELY — the npm-pinned Windows wrapper forwards the native binary's status
 * line on stderr while the direct binary emits it on stdout — and `execFileSync` throws away the
 * distinction (and the exit code) by throwing on non-zero. A probe that collapsed them would have to
 * re-implement the leaf's predicate loosely, which is the drift this reuse exists to prevent.
 *
 * The environment is the LEAF'S: `scrubMeteredCodexAuth` strips every metered auth variable first, so
 * the probe asks the question in the same environment the leaf will ask it in.
 */
export function codexCommand(file: string, args: readonly string[]): CodexCommandResult | null {
  const result = spawnSync(file, [...args], {
    encoding: "utf8",
    timeout: CODEX_PROBE_TIMEOUT_MS,
    env: scrubMeteredCodexAuth(process.env),
    // Stryker disable next-line BooleanLiteral: windowsHide suppresses a flashed console window on
    // Windows and has no effect at all on the Linux CI this rung runs on — and the Windows behaviour
    // it does change is not observable from any assertion a test can make. Not equivalent in the
    // strict sense; untestable from here, and recorded as such rather than left as a silent survivor.
    windowsHide: true,
  });
  // Both nullable shapes are returned as `null` HERE, which is what makes the two reads below
  // total: a spawn error or a timeout sets `error`, and a signal-killed child has a null `status`.
  // (There were `?? ""` fallbacks on the two channels. They were unreachable past this line — with
  // `encoding: "utf8"` both are strings — so they were mutants no test could ever kill. An
  // unreachable branch is removed, not excused.)
  if (result.error !== undefined || result.status === null) return null;
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The process seam {@link codexReading} runs through. Injected in tests; {@link codexCommand} live. */
export type CodexProbeRunner = (file: string, args: readonly string[]) => CodexCommandResult | null;

/** What one Codex sweep observed. Two states plus one datum, on the {@link BunReading} shape. */
export interface CodexReading {
  readonly cli: CodexCliState;
  /** The version string whichever binary answered reported, or null when none did. */
  readonly version: string | null;
  readonly login: CodexLoginState;
}

/**
 * PURE: the `codex-cli` verdict from the two invocation results.
 *
 * ORDER IS THE ARGUMENT, as in {@link classifyToolchainShell}. The PRODUCT on PATH is checked first
 * because it is the stronger reading: a box that has it can run BOTH journeys, so nothing further
 * needs asking. `workspace-only` is therefore literally "the product did not answer and the pinned
 * leaf wrapper did", which is what makes that WARN a precise statement rather than a hedge.
 *
 * A non-zero exit counts as no answer on both routes: `--version` is the universal liveness question,
 * and a binary that cannot answer it is not one any caller can use.
 */
export function classifyCodexCli(
  onPath: CodexCommandResult | null,
  inWorkspace: CodexCommandResult | null,
): CodexCliState {
  if (onPath !== null && onPath.code === 0) return "path";
  if (inWorkspace !== null && inWorkspace.code === 0) return "workspace-only";
  return "absent";
}

/**
 * PURE: the `codex-login` verdict from `codex login status`.
 *
 * THIS IS WHERE THE CLI'S RAW OUTPUT DIES (the D3 boundary): a bounded enum leaves, never text. The
 * PASS arm is the leaf's own {@link isChatGptManagedLogin}, imported rather than restated, so the
 * probe cannot pass over a state the leaf refuses. The two non-PASS arms are told apart by the EXIT
 * CODE alone rather than by matching status strings, because a string this module has not measured is
 * a guess, and a mis-parse would silently reclassify one honest state as the other.
 */
export function classifyCodexLogin(status: CodexCommandResult | null): CodexLoginState {
  if (status === null) return "undetermined";
  if (isChatGptManagedLogin(status)) return "chatgpt";
  return status.code === 0 ? "other" : "logged-out";
}

/**
 * Take the whole Codex reading: invoke the product on PATH, invoke the pinned leaf wrapper, then ask
 * whichever answered for the login status.
 *
 * The login is a property of `~/.codex/auth.json`, which BOTH binaries read, so either is a valid
 * witness; the product is preferred only because it is the one an operator would run by hand. When
 * neither answered, the login is `undetermined` rather than absent — the CLI is what is missing, and
 * `codex-cli` is the row that owns that finding.
 */
export function codexReading(run: CodexProbeRunner, wrapper: string | null): CodexReading {
  // ONE null-guard, not two. It used to be repeated on the login branch as
  // `cli === "workspace-only" && wrapper !== null` — which can never be false there, since `cli`
  // only reaches `workspace-only` because the wrapper answered. A condition that cannot go both
  // ways is a mutant no test can kill, so the guard lives here and nowhere else.
  const askWrapper = (verb: readonly string[]): CodexCommandResult | null =>
    wrapper === null ? null : run(process.execPath, [wrapper, ...verb]);

  const onPath = run("codex", ["--version"]);
  const inWorkspace = askWrapper(["--version"]);

  const cli = classifyCodexCli(onPath, inWorkspace);
  const answered = cli === "path" ? onPath : cli === "workspace-only" ? inWorkspace : null;
  const version =
    answered === null ? null : (answered.stdout.trim() || answered.stderr.trim() || null);

  const status =
    cli === "path"
      ? run("codex", ["login", "status"])
      : cli === "workspace-only"
        ? askWrapper(["login", "status"])
        : null;

  return { cli, version, login: classifyCodexLogin(status) };
}

/** The impure half: find the pinned wrapper on disk, then run the reading through the real seam. */
export function gatherCodexReading(repoRoot: string = repoRootFromHere()): CodexReading {
  const wrapper = path.join(repoRoot, PINNED_CODEX_WRAPPER);
  return codexReading(codexCommand, existsSync(wrapper) ? wrapper : null);
}

/**
 * PURE: the shell-shape verdict from two readings and the platform. Injectable so every state —
 * including the two `no-shell` producers — is reachable in a test without spawning anything.
 *
 * ORDER IS THE ARGUMENT. `plain` is checked FIRST because it is the strictest shape: sshd and the
 * SessionStart hook get exactly that shell, so a machine where it resolves needs no further question.
 * `login-only` is therefore literally "the strict shape failed and the loose one did not", which is
 * what makes the WARN honest rather than a hedge.
 */
export function classifyToolchainShell(
  platform: NodeJS.Platform,
  readings: ToolchainShellReadings,
): ToolchainShellState {
  if (platform === "win32") return "no-shell";
  if (readings.unavailable !== null || readings.login === null || readings.plain === null) {
    return "no-shell";
  }
  if (resolvesToolchain(readings.plain)) return "resolvable";
  if (resolvesToolchain(readings.login)) return "login-only";
  return "unresolvable";
}

/** Every command in {@link TOOLCHAIN_COMMANDS} was found — a partial answer is not a working shell. */
function resolvesToolchain(found: readonly string[]): boolean {
  return TOOLCHAIN_COMMANDS.every((command) => found.includes(command));
}

/**
 * The script each shape runs: print the name of every toolchain command it can resolve.
 *
 * `exit 0` is load-bearing. Without it the loop's status is the LAST `command -v`, so a shell that
 * resolved nothing — the very state being hunted — would exit non-zero, throw, and be misreported as
 * "bash could not be invoked". Found-nothing and no-bash are different verdicts with different hints.
 */
export const TOOLCHAIN_PROBE_SCRIPT =
  `for c in ${TOOLCHAIN_COMMANDS.join(" ")}; do command -v "$c" >/dev/null 2>&1 && echo "$c"; done; exit 0`;

/**
 * Ask both shell shapes, with a DELIBERATELY SCRUBBED environment.
 *
 * The scrub is the whole probe. Inheriting doctor's PATH would reintroduce exactly the blindness this
 * exists to remove — doctor was launched from a shell where the toolchain already resolved. What the
 * child gets instead is the system default PATH, which is what sshd and a hook actually hand a shell:
 * enough to find `bash` itself, and deliberately not enough to find node/pnpm/bun, all three of which
 * are user-local here (nvm, corepack, `~/.bun`). So anything they DO resolve came from a dotfile,
 * which is the thing being measured.
 *
 * HOME is passed because without it bash reads no dotfiles at all and both shapes would answer the
 * same empty answer — a probe that could never distinguish its own two states.
 */
function toolchainShellReadings(platform: NodeJS.Platform, home: string): ToolchainShellReadings {
  if (platform === "win32") return { login: null, plain: null, unavailable: "not-posix" };
  const login = askShell("-lc", home);
  const plain = askShell("-c", home);
  if (login === null || plain === null) return { login: null, plain: null, unavailable: "no-bash" };
  return { login, plain, unavailable: null };
}

/** One shell shape's answer, or null when bash could not be invoked at all. Budgeted like `bunState`. */
function askShell(shapeFlag: string, home: string): string[] | null {
  try {
    const out = execFileSync("bash", [shapeFlag, TOOLCHAIN_PROBE_SCRIPT], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      env: { HOME: home, PATH: "/usr/bin:/bin" },
    });
    return out.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  } catch {
    return null;
  }
}

/** Git's two dir readings for the cwd — equal means the primary checkout, differing means a worktree. */
interface GitDirs {
  /** `git rev-parse --git-dir`, absolute; `null` when git could not answer. */
  readonly gitDir: string | null;
  /** `git rev-parse --git-common-dir`, absolute; `null` when git could not answer. */
  readonly commonDir: string | null;
}

/** Git's two dir readings for the cwd, or nulls when git cannot answer (not a repo / no git). */
function gitDirs(): GitDirs {
  const read = (arg: string): string | null => {
    try {
      return execFileSync("git", ["rev-parse", "--path-format=absolute", arg], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000,
      }).trim();
    } catch {
      return null;
    }
  };
  return { gitDir: read("--git-dir"), commonDir: read("--git-common-dir") };
}

/** The write-authority state for the checkout this command protects. Never throws. */
function writeAuthorityState(): WriteAuthorityState {
  try {
    const root = protectedRoot(defaultWallInstallIo);
    return classifyWriteAuthority(
      readOrNull(userSettingsPath(defaultWallInstallIo.homeDir())),
      readOrNull(path.join(root, "repo-manifest.json")),
      root,
    );
  } catch {
    return "unknown";
  }
}

/**
 * Gather every dev-persona observation. The DB round trip is the expensive one — it runs the
 * canonical `probeLiveDbDetailed` at the canonical {@link DB_PROBE_TIMEOUT_MS} budget so this probe
 * and `pnpm db:probe` can never disagree, and it is short-circuited entirely when the connector's
 * credential is absent (which is both faster and more honest).
 *
 * READ-ONLY throughout, like the rest of doctor: file stats, file reads, `gh auth status`,
 * `bun --version`, `git rev-parse`, and one `SELECT 1`. Nothing here writes, installs, or repairs.
 */
export async function gatherDevObservations(): Promise<DevObservations> {
  const home = os.homedir();
  const adcPath = adcCredentialsPath(process.env, home, process.platform);
  const secretsFile = classifySecretsFile(
    readOrNull(presentEnv("STORYTREE_SECRETS_FILE") ?? path.join(home, ".storytree", "secrets.json")),
  );

  const dbUserPresent = presentEnv("STORYTREE_DB_USER") !== undefined;
  const dbResult = dbUserPresent ? await probeLiveDbDetailed(DB_PROBE_TIMEOUT_MS) : null;
  const db = classifyDbReachability(dbUserPresent, dbResult);

  const { gitDir, commonDir } = gitDirs();
  const bun = bunState();
  const codex = gatherCodexReading();
  const shellReadings = toolchainShellReadings(process.platform, home);

  return {
    gcloudAdc: existsSync(adcPath) ? "present" : "absent",
    dbReachable: db.state,
    dbElapsedMs: db.elapsedMs,
    secretsFile,
    ghAuth: ghAuthState(),
    bun: bun.state,
    bunVersion: bun.version,
    codexCli: codex.cli,
    codexVersion: codex.version,
    codexLogin: codex.login,
    toolchainShell: classifyToolchainShell(process.platform, shellReadings),
    toolchainShellReadings: shellReadings,
    writeAuthority: writeAuthorityState(),
    worktreeIdentity: classifyWorktreeIdentity(deriveIdentity() !== null, gitDir, commonDir),
  };
}
