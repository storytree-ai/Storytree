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
 * THE REPAIR VOCABULARY. ADR-0207 D6's rule is that a probe never invents machinery — it points at
 * the ONE idempotent step that repairs it. Two of these probes repair through a real `install.ps1`
 * `# @step:` marker and carry a {@link Probe.fixStep} accordingly; the rest repair through a step of
 * `docs/machine-onboarding.md`, whose anchors are frozen in {@link GUIDE_ANCHORS} by agreement with
 * the session writing that guide in parallel. The hints name those anchors; the test asserts every
 * hint names one, so a renamed anchor cannot silently rot into a dead pointer.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

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
  readonly writeAuthority: WriteAuthorityState;
  readonly worktreeIdentity: WorktreeIdentityState;
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
export function classifyDbReachability(
  dbUserPresent: boolean,
  result: { reachable: boolean; elapsedMs: number } | null,
): { state: DbReachability; elapsedMs: number | null } {
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

/** Git's two dir readings for the cwd, or nulls when git cannot answer (not a repo / no git). */
function gitDirs(): { gitDir: string | null; commonDir: string | null } {
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
 * `git rev-parse`, and one `SELECT 1`. Nothing here writes, installs, or repairs.
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

  return {
    gcloudAdc: existsSync(adcPath) ? "present" : "absent",
    dbReachable: db.state,
    dbElapsedMs: db.elapsedMs,
    secretsFile,
    ghAuth: ghAuthState(),
    writeAuthority: writeAuthorityState(),
    worktreeIdentity: classifyWorktreeIdentity(deriveIdentity() !== null, gitDir, commonDir),
  };
}
