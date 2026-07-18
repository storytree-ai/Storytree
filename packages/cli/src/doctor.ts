/**
 * `storytree doctor` — the explorer-onboarding setup checker (ADR-0207 D6, the bottom layer).
 *
 * A deterministic, READ-ONLY, OFFLINE-CAPABLE CLI that probes each setup invariant a fresh explorer
 * environment must satisfy — git/Node present, the checkout provisioned, the repo fetchable, the seed
 * readable, the Claude CLI present + logged in, the checkout current, the D4 hosted live read
 * reachable — and emits machine-readable
 * results plus a fix hint per failing probe. It is the keystone of D6: D1's installer VERIFIES with it,
 * and D6's conversational guide WRAPS it (run doctor → explain a failure → propose the fix → dev
 * confirms → re-run the idempotent installer step → re-doctor).
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
 * real observations (command presence, file existence, the seed parse) and shapes the {@link Envelope}
 * — mirroring the offline onboarding/drift/coverage commands. The guide (D6 top layer) imports
 * {@link runDoctor} directly and reads the structured {@link DoctorReport}; it never scrapes the text.
 *
 * OFFLINE-CAPABLE: doctor itself must run with no network and no DB (it is part of the zero-credential
 * path, ADR-0207 §Consequences). A probe it cannot determine offline (the remote reachability, the
 * checkout-behind count, the D4 hosted read) resolves to WARN, never FAIL — doctor never reports a
 * broken environment merely because doctor ran offline. The hosted-read probe is WARN-only for a
 * second reason too: D4 makes the offline checkout + in-memory seed the zero-credential FALLBACK, so
 * an unreachable live read DEGRADES exploring rather than breaking it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type { Envelope } from "./envelope.js";

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
  /** The read-only remote answers (`git ls-remote`): true reachable, false refused, null undetermined (offline). */
  readonly remoteReachable: boolean | null;
  /** The offline seed corpus (`apps/studio/data/knowledge.json`) reads and parses. */
  readonly seedReadable: boolean;
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
}

/** The four distinguishable outcomes of the D4 hosted-live-read probe. */
export type HostedReadState = "ok" | "refused" | "unconfigured" | "unreachable";

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
  probes.push(
    obs.provisioned
      ? { name: "checkout-provisioned", level: "PASS", detail: "workspace dependencies are installed" }
      : {
          name: "checkout-provisioned",
          level: "FAIL",
          detail: "node_modules/.modules.yaml missing (workspace not provisioned)",
          fixStep: "provision",
          fixHint: "re-run the installer's provision step (install.ps1 @step:provision) — `pnpm install` in the checkout.",
        },
  );

  // 4. repo-fetchable — the read-only remote answers. Undetermined offline => WARN (offline-capable).
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

  // 5. seed-readable — the offline corpus parses (the zero-credential read path). Fix: re-provision/clone.
  probes.push(
    obs.seedReadable
      ? { name: "seed-readable", level: "PASS", detail: "the offline seed corpus reads and parses" }
      : {
          name: "seed-readable",
          level: "FAIL",
          detail: "the seed corpus (apps/studio/data/knowledge.json) is missing or unparseable",
          fixStep: "clone",
          fixHint: "re-run the installer's clone step (install.ps1 @step:clone) to restore the checkout.",
        },
  );

  // 6. claude-cli — the dev's own agent CLI is installed. Installer @step:claude-cli.
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

  // 7. claude-login — a logged-in CLI is DETECTED (existence only, D3). The fix is a DEV ACTION, never
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

  // 8. checkout-current — HEAD vs origin/main freshness. Undetermined offline => WARN; behind => WARN
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

  // 9. hosted-read — the D4 live read through the IAP-gated hosted studio. NEVER a FAIL: D4 makes the
  // offline checkout + in-memory seed the zero-credential FALLBACK, so an unreachable hosted read
  // DEGRADES exploring rather than breaking it (and doctor itself must stay offline-capable). Only the
  // concrete `refused` is owner-escalatable — the same "can't conclude access is gone offline" rule
  // repo-fetchable follows. No fixStep: none of these is repaired by re-running an installer step.
  if (obs.hostedRead === "ok") {
    probes.push({ name: "hosted-read", level: "PASS", detail: "the hosted live read is reachable" });
  } else if (obs.hostedRead === "refused") {
    probes.push({
      name: "hosted-read",
      level: "WARN",
      detail: HOSTED_READ_REFUSED_DETAIL,
      fixHint:
        "ask the owner to grant your Google identity access to the hosted studio (the D2 invite ceremony's IAP grant). Exploring still works offline from the checkout in the meantime.",
    });
  } else if (obs.hostedRead === "unconfigured") {
    probes.push({
      name: "hosted-read",
      level: "WARN",
      detail: "no hosted studio URL configured (STORYTREE_STUDIO_URL unset)",
      fixHint:
        "set STORYTREE_STUDIO_URL to the hosted studio URL the owner sent you to read live tree state; without it you still get the offline seed.",
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

/** The seed corpus reads and parses (a real array). Never throws. */
function seedReadable(checkoutDir: string): boolean {
  try {
    const seedPath = path.join(checkoutDir, "apps", "studio", "data", "knowledge.json");
    const parsed = JSON.parse(readFileSync(seedPath, "utf8")) as unknown;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
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
  return {
    gitPresent: commandPresent("git"),
    nodeMajor: nodeMajor(),
    provisioned: existsSync(path.join(checkoutDir, "node_modules", ".modules.yaml")),
    remoteReachable: remoteReachable(checkoutDir),
    seedReadable: seedReadable(checkoutDir),
    claudeCliPresent: commandPresent("claude"),
    // D3: DETECT a logged-in CLI by the credentials file's EXISTENCE only — never read its contents.
    claudeLoggedIn: existsSync(path.join(os.homedir(), ".claude", ".credentials.json")),
    checkoutBehind: checkoutBehind(checkoutDir),
  };
}

export function doctorHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree doctor — the explorer-onboarding setup check (ADR-0207 D6).",
      "",
      "  storytree doctor",
      "      probe each setup invariant (git/Node, checkout provisioned, repo fetchable, seed",
      "      readable, Claude CLI present + logged in, checkout current) and print a fix hint per",
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
