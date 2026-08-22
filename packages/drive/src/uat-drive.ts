/**
 * The model-driven UAT executor's PURE core (ADR-0295 D1, ordered and shaped by ADR-0348 D5).
 *
 * ADR-0295 D1 has said since 2026-08-03 that *"a model driving [a journey] headlessly or through a
 * browser is such a run, and its reported outcome is admissible as the verdict"* — and until now
 * nothing executed that sentence. ADR-0348 D5 both named the gap and fixed its shape: the executor is
 * the existing two-file house pattern (`dogfood-probe.run.ts` / `dogfood-witness.check.ts`), so that
 * `observeAndSign` and the whole signing path are reused **unchanged**.
 *
 * The three files, and the wall between them:
 *  - THIS module — the pure, offline-testable heart: the drive prompt, the report contract the model
 *    must answer in, and the witness selector. No store, no clock, no subprocess, no git.
 *  - `uat-drive.run.ts` — the deliberate, out-of-band, subscription-funded RUN. It spawns a fresh
 *    model session per criterion, and persists a {@link UatDriveRecord} to `events.uat_drive`. Never
 *    a `*.test.ts`, never on a gate pass (ADR-0010 §5).
 *  - `uat-drive-witness.check.ts` — the cheap, free `observe` command a flipped `machine` leg binds
 *    as its `(proof-gate:)`. It only WITNESSES the persisted record.
 *
 * **No model signs its own verdict, and this module is where that stays true.** A drive record is an
 * ARTIFACT, not proof: the record says what a model reported, and the only thing that ever mints a
 * {@link Verdict} is `observeAndSign`, over an exit code the SPINE watched out-of-band — exactly as
 * for a Playwright suite. ADR-0295 D2's prohibition holds in full: no `model` witness kind, no
 * eligibility tier, no rubric judge (`packages/model-uat*` stays retired).
 *
 * **What a flipped leg declares.** For the sibling flip increment, the binding shape is:
 *
 *   in `## UAT Test Criteria`  — the leg carries `_(witness: machine)_ _(proof-gate: <story>#gate-<n>)_`
 *   in `## Reliability Gates`  — a new numbered item tagged `_(gate: observe)_` whose first
 *                                backticked span after the tag is
 *                                `pnpm --filter @storytree/drive exec node --import tsx
 *                                src/uat-drive-witness.check.ts <story-id> <criterion-id>`
 *                                (a span wrapped across prose lines is collapsed by the parser).
 *
 * Two mechanics that bite. The gate id is POSITIONAL (`parseReliabilityGates`), so a gate is
 * APPENDED, never inserted — the `drive-machinery#gate-4` tombstone records what renumbering costs.
 * And the `(witness: …)` tag is inside the hashed canonical content, so flipping it without
 * recomputing the leg's `revision-id` makes `parseUatTestCriteria` THROW for that whole story.
 */

import type { ReliabilityGate, UatTestCriterionSource } from "@storytree/library";
import stripAnsi from "strip-ansi";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Which legs this driver is responsible for
// ---------------------------------------------------------------------------

/**
 * The witness entry filename. A `machine` leg is MODEL-DRIVEN exactly when the observe gate it binds
 * runs this — the binding is self-describing, so nothing needs a second registry saying which legs a
 * model drives and which Playwright does, and the two can never disagree.
 */
export const UAT_DRIVE_WITNESS_ENTRY = "uat-drive-witness.check.ts";

/** The only live UAT runtime: the owner's ChatGPT-authenticated Codex subscription. */
export const CODEX_CHATGPT_SUBSCRIPTION_DRIVER = "codex-chatgpt-subscription";

/** An explicit local executable is useful where the Desktop app keeps its CLI outside PATH. */
export const STORYTREE_CODEX_EXECUTABLE_ENV = "STORYTREE_CODEX_EXECUTABLE";

/** UAT drives default to Codex, while a member may explicitly select their Claude subscription. */
export const STORYTREE_UAT_DRIVE_PROVIDER_ENV = "STORYTREE_UAT_DRIVE_PROVIDER";
export const UAT_DRIVE_PROVIDERS = ["codex", "claude"] as const;
export type UatDriveProvider = (typeof UAT_DRIVE_PROVIDERS)[number];

/** A blank setting is the default; any other typo refuses before either subscription is used. */
export function resolveUatDriveProvider(raw: string | undefined):
  | { ok: true; provider: UatDriveProvider }
  | { ok: false; reason: string } {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === undefined || normalized === "") return { ok: true, provider: "codex" };
  if (normalized === "codex" || normalized === "claude") return { ok: true, provider: normalized };
  return {
    ok: false,
    reason: `${STORYTREE_UAT_DRIVE_PROVIDER_ENV} must be "codex" or "claude", not ${JSON.stringify(raw)}`,
  };
}

/** The Codex final message is the report contract, not a provider-specific event stream. */
export function codexExecArguments(finalMessagePath: string): string[] {
  return [
    "--sandbox",
    "danger-full-access",
    "--ask-for-approval",
    "never",
    "exec",
    "--output-last-message",
    finalMessagePath,
    "-",
  ];
}

/**
 * Give a drive its usual Storytree isolation, but never pass another provider's credential or an
 * API key through its process boundary. Codex must establish its own ChatGPT-authenticated session.
 */
export function codexSubscriptionChildEnv(
  parent: NodeJS.ProcessEnv,
  isolation: DriveIsolation,
): NodeJS.ProcessEnv {
  const child = driveChildEnv(parent, isolation);
  for (const key of Object.keys(child)) {
    if (
      key === "OPENAI_API_KEY" ||
      key === "OPENAI_BASE_URL" ||
      key === "OPENAI_ORG_ID" ||
      key.startsWith("ANTHROPIC_") ||
      key.startsWith("CLAUDE_")
    ) {
      delete child[key];
    }
  }
  return child;
}

/** Claude's subscription route receives only its OAuth token, never either provider's metered key. */
export function claudeSubscriptionChildEnv(
  parent: NodeJS.ProcessEnv,
  isolation: DriveIsolation,
): NodeJS.ProcessEnv {
  const child = driveChildEnv(parent, isolation);
  for (const key of Object.keys(child)) {
    if (
      key === "OPENAI_API_KEY" ||
      key === "OPENAI_BASE_URL" ||
      key === "OPENAI_ORG_ID" ||
      key === "ANTHROPIC_API_KEY"
    ) {
      delete child[key];
    }
  }
  return child;
}

export interface CodexSubscriptionAuth {
  readonly ok: boolean;
  readonly detail: string;
}

/** Parse local CLI status without accepting an API-key or anonymous session. */
export function verifyCodexSubscriptionAuth(status: string, env: NodeJS.ProcessEnv): CodexSubscriptionAuth {
  if (env["OPENAI_API_KEY"] !== undefined) {
    return { ok: false, detail: "the child environment still carries OPENAI_API_KEY" };
  }
  if (/logged in using chatgpt/i.test(status)) {
    return { ok: true, detail: "Codex is logged in using ChatGPT" };
  }
  const received = status.trim().replace(/\s+/g, " ");
  return {
    ok: false,
    detail: received.length > 0 ? `Codex login status was not ChatGPT: ${received}` : "Codex produced no login status",
  };
}

/** The gate fields the target selector reads. */
export type DriveGate = Pick<ReliabilityGate, "id" | "kind" | "proofCommand">;

/** PURE: is this a command-bearing observe gate whose command is the UAT-drive witness? */
export function isModelDrivenGate(gate: DriveGate): boolean {
  return gate.kind === "observe" && (gate.proofCommand ?? "").includes(UAT_DRIVE_WITNESS_ENTRY);
}

/** The two platform contracts the prompt can carry. The authored criterion prose is the source. */
export type UatDrivePlatform = "web-or-cli" | "electron-native-shell";

/**
 * PURE: derive the drive platform from explicit tooling words in the authored criterion.
 *
 * UAT criteria do not carry a separate platform field today. Native criteria do, however, name
 * either the harness directly (`_electron` / `native shell`) or the product boundary explicitly: a
 * running/installed Electron app plus the real preload/contextBridge seam, the real Electron main,
 * an affirmative assertion that the actual Electron launch is exercised, or a running real desktop
 * main whose spawned sidecar / explicit non-e2e mode makes the native launch boundary unambiguous.
 * Keeping the derivation here avoids a story-id registry (which would drift as criteria move) while
 * making that already-authored platform instruction executable by the driver.
 */
export function classifyUatDrivePlatform(journey: string): UatDrivePlatform {
  const namesNativeHarness = /(?:`?_electron`?|\bnative[ -]shell\b)/i.test(journey);
  const namesRealElectronMain = /\b(?:real|actual)\s+Electron\s+main\b/i.test(journey);
  const namesRunningElectronApp =
    /\b(?:running|installed|packaged|real)\s+Electron\s+app(?:lication)?\b/i.test(journey);
  const namesRealPreloadBoundary =
    /\b(?:real|actual)\s+(?:preload(?:\s+(?:bridge|boundary))?|`?contextBridge`?|context\s+bridge|IPC\s+bridge)\b/i.test(
      journey,
    );
  const namesRunningDesktopMain =
    /\b(?:real|actual)\s+desktop\s+main(?:\s+process)?\b/i.test(journey) ||
    /\bdesktop\s+main(?:\s+process)?\s+(?:is\s+|was\s+)?(?:running|launched|started)\b/i.test(journey) ||
    /\b(?:running|launched|started)\s+(?:the\s+)?desktop\s+main(?:\s+process)?\b/i.test(journey);
  const namesSpawnedSidecar =
    !/\bweb\s+sidecar\b/i.test(journey) &&
    /\b(?:spawn(?:ed|s|ing)\s+(?:the\s+)?(?:(?:local|desktop|backend)\s+)?sidecar|(?:(?:local|desktop|backend)\s+)?sidecar\s+(?:(?:was|is)\s+)?spawned)\b/i.test(
      journey,
    );
  const namesNonE2eLaunch =
    /\b(?:not|without)\b[^.!?\n]{0,48}\b(?:the\s+)?(?:harness(?:'s)?\s+)?e2e\s+mode\b/i.test(journey) ||
    /\bwithout\s+`?STORYTREE_DESKTOP_E2E`?\b/i.test(journey);
  const namesActualElectronLaunch = journey.split(/\r?\n|[.!?]+\s+/).some((clause) => {
    const assertsActualLaunch =
      /\b(?:the\s+)?(?:real|actual)\s+Electron\s+launch\s+(?:(?:must|does|did|will|should|actually)\s+)?(?:honou?rs?|refuses?|wires?|runs?|uses?|opens?|starts?|serves?|loads?|reaches?|proceeds?|enforces?|observes?)\b/i.test(
        clause,
      ) ||
      /\b(?:real|actual)\s+(?:running|launched|started)\s+Electron\s+app(?:lication)?\b/i.test(clause) ||
      /\b(?:launch|start|run)\s+(?:the\s+)?(?:real|actual)\s+Electron\s+app(?:lication)?\b/i.test(clause);
    const negatesActualLaunch =
      /\b(?:no|without)\s+(?:the\s+)?(?:real|actual)\s+Electron\s+(?:launch|app(?:lication)?)\b/i.test(
        clause,
      ) ||
      /\b(?:do\s+not|never|avoid|skip)\s+(?:launch|start|run)\s+(?:the\s+)?(?:real|actual)\s+Electron\s+app(?:lication)?\b/i.test(
        clause,
      );
    const describesLaunchOnly =
      /\b(?:architecture|documentation|docs?|documented|planned|proposal)\b/i.test(clause);
    return assertsActualLaunch && !negatesActualLaunch && !describesLaunchOnly;
  });
  return namesNativeHarness ||
    namesRealElectronMain ||
    namesActualElectronLaunch ||
    (namesRunningElectronApp && namesRealPreloadBoundary) ||
    (namesRunningDesktopMain && (namesSpawnedSidecar || namesNonE2eLaunch))
    ? "electron-native-shell"
    : "web-or-cli";
}

/** One criterion the run will drive, with the journey text and the gate (if any) that will witness it. */
export interface DriveTarget {
  readonly criterionId: string;
  readonly revisionId: string;
  readonly title: string;
  readonly journey: string;
  /** Derived from the criterion's authored prose; never from the story id. */
  readonly platform: UatDrivePlatform;
  /** The observe gate that will witness this drive, or `undefined` when the leg is not yet bound. */
  readonly gateId: string | undefined;
}

export interface DriveTargetSelection {
  readonly targets: DriveTarget[];
  /** Criterion ids named explicitly that the story does not declare. */
  readonly unknown: string[];
}

/**
 * PURE: which criteria this run drives.
 *
 * Two modes, and the difference is deliberate ordering support for ADR-0348 D5.
 *
 *  - **Named explicitly** (`only`) — drive exactly those, WHATEVER their current witness or binding.
 *    This is how the flip is bootstrapped without ever violating D5: a leg is driven first, its
 *    record lands, and only then is it flipped to `machine` in the same change that binds its gate.
 *    Flipping first would leave the story holding an unbound machine leg, which refuses signing for
 *    every sibling ("no partial verdict").
 *  - **Nothing named** — drive every `machine` leg already bound to a UAT-drive witness gate. This is
 *    the standing re-run, e.g. after a journey is re-authored and its old drive stops witnessing.
 */
export function selectDriveTargets(
  sources: readonly UatTestCriterionSource[],
  gates: readonly DriveGate[],
  only?: readonly string[],
): DriveTargetSelection {
  const target = (s: UatTestCriterionSource): DriveTarget => ({
    criterionId: s.criterion.criterionId,
    revisionId: s.criterion.revisionId,
    title: s.criterion.title,
    journey: s.source,
    platform: classifyUatDrivePlatform(s.source),
    gateId: s.criterion.proofGateId,
  });

  if (only !== undefined && only.length > 0) {
    const wanted = new Set(only);
    const targets = sources.filter((s) => wanted.has(s.criterion.criterionId)).map(target);
    const found = new Set(targets.map((t) => t.criterionId));
    return { targets, unknown: only.filter((id) => !found.has(id)) };
  }

  const driveGates = new Set(gates.filter(isModelDrivenGate).map((g) => g.id));
  const targets = sources
    .filter(
      (s) =>
        s.criterion.witness === "machine" &&
        s.criterion.proofGateId !== undefined &&
        driveGates.has(s.criterion.proofGateId),
    )
    .map(target);
  return { targets, unknown: [] };
}

// ---------------------------------------------------------------------------
// The persisted artifact
// ---------------------------------------------------------------------------

/** How one authored step of the journey came out, as the driver reports it. */
export const UAT_DRIVE_STEP_OUTCOMES = ["pass", "fail", "skipped"] as const;
export const UatDriveStepOutcome = z.enum(UAT_DRIVE_STEP_OUTCOMES);
export type UatDriveStepOutcome = z.infer<typeof UatDriveStepOutcome>;

/** A typed cause for every model-reported fail; prose is never used to infer harness timing. */
export const UAT_DRIVE_FAILURE_CAUSES = ["journey-failed", "report-by-reached"] as const;
export const UatDriveFailureCause = z.enum(UAT_DRIVE_FAILURE_CAUSES);
export type UatDriveFailureCause = z.infer<typeof UatDriveFailureCause>;

/**
 * One step of the driven journey. The per-step log is ADR-0295 D4's "available, not required"
 * evidence retention taken at its cheapest: it costs the driver nothing to enumerate what it did,
 * and it is the only thing that distinguishes a run that performed the journey from one that
 * summarised it — the exact indistinguishability ADR-0295's Context names as the accepted risk.
 */
export const UatDriveStep = z
  .object({
    step: z.string().min(1),
    outcome: UatDriveStepOutcome,
    note: z.string().optional(),
  })
  .strict();
export type UatDriveStep = z.infer<typeof UatDriveStep>;

/**
 * What the MODEL authors at the end of a drive — the report contract, and the whole of what it is
 * trusted to say. Everything else on a {@link UatDriveRecord} (the identity, the pinned commit, the
 * clock) is stamped by the harness, never by the model.
 */
export const UatDriveReport = z
  .object({
    outcome: z.enum(["pass", "fail"]),
    /** Required on a fail so runner-owned timing can audit deadline exhaustion without prose matching. */
    failureCause: UatDriveFailureCause.optional(),
    summary: z.string().min(1),
    steps: z.array(UatDriveStep).default([]),
    /** ADR-0348 D4: the driver was itself unsure and raised an `open-question` rather than deciding. */
    escalated: z.boolean().default(false),
    /** The `open-question` artifact id, when `escalated`. */
    openQuestionId: z.string().min(1).optional(),
    /**
     * The HTTP surface this walk observed — the reserved URL, or `null` for a pure-CLI journey that
     * observed none. {@link requireOwnSurface} is what enforces it.
     *
     * OPTIONAL in the schema and REQUIRED by the runner, deliberately. Optional keeps every
     * already-persisted record parsing (the four green Electron legs among them), so closing this
     * hole cannot un-green landed proof. Required at drive time is where the rule belongs anyway:
     * a refusal there can name the reserved URL and say what to do, which a schema error cannot.
     */
    surface: z.string().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((report, ctx) => {
    if (report.outcome === "fail" && report.failureCause === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failureCause"],
        message: "a fail must classify its cause",
      });
    }
    if (report.outcome === "pass" && report.failureCause !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failureCause"],
        message: "a pass must not carry a failure cause",
      });
    }
  });
export type UatDriveReport = z.infer<typeof UatDriveReport>;

/**
 * One persisted drive record — the artifact `uat-drive-witness.check.ts` witnesses.
 *
 * `revisionId` is the load-bearing field. It binds the record to the EXACT criterion content that
 * was driven (ADR-0253's content-bound revisions), so re-authoring the journey prose invalidates
 * every prior drive instead of silently carrying its green onto a different claim.
 */
export const UatDriveRecord = z
  .object({
    storyId: z.string().min(1),
    criterionId: z.string().min(1),
    revisionId: z.string().min(1),
    outcome: z.enum(["pass", "fail"]),
    /** Optional for compatibility with records persisted before typed fail causes were introduced. */
    failureCause: UatDriveFailureCause.optional(),
    /** The clean, committed HEAD the journey was driven against. */
    commitSha: z.string().min(1),
    runId: z.string().min(1),
    /** The runtime that drove it (e.g. `claude-code`) — provenance, never authority. */
    driver: z.string().min(1),
    summary: z.string().min(1),
    steps: z.array(UatDriveStep).default([]),
    escalated: z.boolean().default(false),
    openQuestionId: z.string().min(1).optional(),
    /**
     * The surface the walk observed, carried onto the record so a later reader can see WHICH server
     * a green was earned against. Optional so records written before surface ownership was enforced
     * still parse — the witness gate reads this schema, and a required field here would refuse the
     * drives that are already green.
     */
    surface: z.string().min(1).nullable().optional(),
    /** Runner-stamped timing evidence; optional so historical records remain readable. */
    reportBy: z.string().min(1).optional(),
    reportObservedAt: z.string().min(1).optional(),
    at: z.string().min(1),
  })
  .strict();
export type UatDriveRecord = z.infer<typeof UatDriveRecord>;

// ---------------------------------------------------------------------------
// The drive prompt
// ---------------------------------------------------------------------------

/** The fence tag the driver's machine-readable report must be wrapped in. */
export const UAT_DRIVE_REPORT_FENCE = "storytree-uat-drive";

/**
 * The honesty clause, verbatim. Pulled out as a constant so {@link auditDrivePrompt} can hold the
 * real prompt to it: this sentence is the only thing standing between "the journey ran" and "the
 * journey was summarised", and a prompt edit that drops it must red the suite rather than quietly
 * weaken every future green.
 */
export const UAT_DRIVE_HONESTY_CLAUSE =
  "A step you could not actually perform is a FAIL, never a pass. Do not report a pass for anything " +
  "you skipped, simulated, inferred, or assumed would work — report what happened.";

/**
 * A deadline is an absolute UTC instant, not a date-shaped string for the model to eyeball. The
 * runner later checks the typed failure cause against its own observation clock; this clause keeps
 * the child from stopping before that mechanical refusal has to discard the whole run.
 */
export const UAT_DRIVE_REPORT_BY_CLOCK_CLAUSE = [
  "Deadline comparison — the runner's UTC clock is authoritative:",
  "",
  '  - Before stopping because `reportBy` was reached, run `node -p "new Date().toISOString()"` to',
  "    read the current system UTC instant. Parse that result and reportBy as UTC instants and compare",
  "    their epoch values; do not infer from the displayed date, local timezone, or elapsed intuition.",
  "  - If current UTC is earlier than reportBy, the lease is still live: continue the journey. Only",
  "    use failureCause `report-by-reached` when current UTC is equal to or later than reportBy.",
  "  - The runner compares that typed cause with the host-clock time at which it observed your report.",
  "    A premature deadline claim is refused as a harness end and is never persisted as a product fail.",
].join("\n");

/**
 * ADR-0348 D4, verbatim in the prompt: the driver proceeds on its own judgment through spend and
 * outward-facing steps, and escalates only when IT is unsure. Deliberately looser than an approval
 * gate, and deliberately SCOPED — `asset:attempt-privileged-actions-approve-inline` continues to
 * govern privileged actions taken outside a UAT drive, which is why this text lives in the drive
 * prompt and nowhere else.
 */
export const UAT_DRIVE_AUTONOMY_CLAUSE =
  "Proceed on your own judgment. If a step of this journey spends subscription-funded model time, " +
  "opens a pull request, merges to main, or grants an in-app privilege, DO IT — do not stop to ask " +
  "for authorization step by step. Escalate only when YOU are genuinely unsure whether to continue: " +
  "in that case stop, raise an open-question against the owning arc " +
  "(`storytree question new --arc <arc-id> --title \"…\" --stakes … --statement … --pg`), and report " +
  "`escalated: true` with its id.";

/**
 * The TOOLING clause — name the installed automation rather than leaving the driver to invent one.
 *
 * Written against three failures measured across the first seven live drives (2026-08-12), not
 * against a guess. The original prompt said only *"use whatever this repository actually offers …
 * headless or browser control of a running surface"*, and each of the three is that vagueness
 * cashing out:
 *
 *  1. `studio-build` leg 10's driver hand-rolled a Playwright harness that POLLED UP TO 40 MINUTES.
 *     Its own session ended at 11.3 min, so no report was ever emitted (a MISS — a harness red, not
 *     a finding), and the orphan later wrote a PNG into the working tree, whose dirtiness then
 *     REFUSED the next drive. One invented harness cost three drives and produced nothing.
 *  2. That same driver attached to `localhost:5180` — a *sibling worktree's* JSON-backed studio,
 *     not a live-store one from its own checkout — because it discovered a server rather than
 *     starting one. Ports 5173–5178/5190/5199 were all held by other worktrees.
 *  3. Artifacts landed in the working tree instead of an ignored path.
 *
 * The web-platform clause below points at `apps/studio`'s existing Playwright config, while the
 * native-shell clause points at the installed Desktop Electron harness. Both share the isolation,
 * lifetime and residue rules in this common clause.
 *
 * `apps/studio` already carries `@playwright/test` with a config that solves all three by
 * construction: a `webServer` block that starts its OWN vite on a `--strictPort` port, a 60s default
 * timeout, and `trace: 'retain-on-failure'` — which is precisely the retention ADR-0295 D4 calls
 * "available, not required … recommended where it is cheap". It is cheap here because it already
 * exists.
 *
 * The combined clauses do NOT mandate browser Playwright for every journey: plenty of journeys are
 * pure CLI, and a driver that needs
 * something else may reach for it. What it forbids is the specific shape that failed — an unbounded
 * wait, an inherited server, and output in the tree.
 */
export const UAT_DRIVE_TOOLING_CLAUSE = [
  "Tooling — use what is installed; do not invent a harness:",
  "",
  "  - START the surface you are testing; do NOT attach to whatever is already listening. Other",
  "    worktrees run their own studios on neighbouring ports, and a drive that talks to a sibling's",
  "    server is measuring somebody else's checkout. Use a `webServer` block with `--strictPort`, or",
  "    pick a port and verify it is yours (`/api/health` reports the store AND the git HEAD).",
  "  - BOUND every wait. This run has a hard wall-clock ceiling and is killed at it. A poll longer",
  "    than the walk itself does not produce a slow pass — it produces NO report, which is recorded",
  "    as a MISS: a harness failure that tells nobody anything about the product. If a step genuinely",
  "    needs longer than you have, stop and report `fail` naming the ceiling as the reason.",
  "  - Write screenshots, traces, logs and scratch files OUTSIDE the repository, or under an",
  "    already-ignored path. A drive refuses to run against a dirty tree, so anything you leave",
  "    behind blocks the NEXT drive.",
  "  - The runner already established this checkout was clean immediately before this session. Do not",
  "    treat a later untracked path as a preflight failure or delete it yourself: keep your own",
  "    artifacts out of the repository and let the runner attribute and sweep residue after your report.",
].join("\n");

/** Browser tooling, used only when the authored criterion does not require the native shell. */
export const UAT_DRIVE_WEB_TOOLING_CLAUSE = [
  "Web-platform tooling:",
  "",
  "  - For a journey through a WEB UI, drive it with Playwright. `@playwright/test` is already a",
  "    dependency of `apps/studio`, configured at `apps/studio/playwright.config.ts` with a real",
  "    Chromium, and `pnpm --filter studio uat` runs the existing suite in `apps/studio/uat/`. Read",
  "    that config and that suite before writing anything — reuse its shape. It already sets",
  "    `trace: 'retain-on-failure'`, which is how a failed drive leaves something auditable instead",
  "    of a paragraph. (`pnpm exec playwright install chromium` once, if the browser is missing.)",
].join("\n");

/**
 * Native-shell tooling, written from the existing Desktop Electron regression harness.
 *
 * The forest pointer path is not equivalent to a renderer locator click: Electron retargets a
 * pointer-captured click, which is why the standing regression suite calculates screen coordinates
 * and drives `win.mouse`. A plain Chromium page cannot exercise the Electron main/preload/PTY seams.
 */
export const UAT_DRIVE_NATIVE_SHELL_TOOLING_CLAUSE = [
  "Native-shell platform — use the installed Electron harness, never a browser substitute:",
  "",
  "  - Launch `apps/desktop` with Playwright's `_electron`; read and reuse",
  "    `apps/desktop/e2e/harness.mjs` and `apps/desktop/e2e/node-click.e2e.mjs`. Plain Chromium",
  "    is NOT this product surface: it omits the Electron main process, preload bridges and native",
  "    terminal. Do not fall back to a browser page if Electron cannot launch.",
  "  - For forest/map pointer selection, calculate a point with the existing harness helpers and use",
  "    real window input through `win.mouse`. Never use `locator.click()`, `scrollIntoViewIfNeeded()`,",
  "    DOM `dispatchEvent`, or another renderer-synthetic click for that path: Electron pointer capture",
  "    retargets it, and the existing regression wall is explicitly real-input-only.",
  "  - If the installed Electron harness or real window input cannot perform the step, stop and report",
  "    a HARNESS failure. Do not substitute Chromium/locator input and report a product finding.",
].join("\n");

/** The exact platform-specific tooling clause this drive must carry. */
export function uatDrivePlatformToolingClause(platform: UatDrivePlatform): string {
  return platform === "electron-native-shell"
    ? UAT_DRIVE_NATIVE_SHELL_TOOLING_CLAUSE
    : UAT_DRIVE_WEB_TOOLING_CLAUSE;
}

/**
 * A background tool can finish the product work and then deliberately close the app/control channel
 * it used. A later CDP probe will see a refused connection in that case, but that is teardown after a
 * terminal result, not evidence that the execution host killed the tool.
 *
 * This clause makes the evidence precedence explicit in the live driver's contract. It is separate
 * from {@link UAT_DRIVE_TOOLING_CLAUSE} so {@link auditDrivePrompt} can name this recurrence precisely
 * if a later prompt edit drops it.
 */
export const UAT_DRIVE_BACKGROUND_RESULT_RECONCILIATION_CLAUSE = [
  "Background-tool result reconciliation - finish reading the tool you started:",
  "",
  "  - If you start or resume a background tool, keep its exact tool/process identity. Before claiming",
  "    that the execution host terminated it, reconcile that exact tool's terminal result, its",
  "    persisted result artifact (when it wrote one), and its process outcome/exit status.",
  "  - A complete terminal result or persisted result artifact is the product end. Read and report it.",
  "    A later lost CDP or control channel - including ECONNREFUSED after the tool deliberately closes",
  "    the app in cleanup - cannot override an already-complete product end.",
  "  - Claim host termination only when the exact tool has no complete terminal result, has no complete",
  "    persisted result artifact, AND its own process outcome says the host terminated it. Turn-budget",
  "    exhaustion, an inner build HALT, an ordinary non-zero exit, and expected app teardown are terminal",
  "    tool/product outcomes, not host termination. If the three sources do not reconcile, report that",
  "    the tool outcome is unresolved rather than inventing a cutoff.",
].join("\n");

/**
 * Terminal display churn is not execution evidence. A seeded command can be echoed while cursor and
 * control sequences change around it without any process ever starting; the Map Terminal trace that
 * prompted this rule contained 43 such snapshots. Keep the rule separately auditable so a prompt
 * cannot silently regress to treating raw text inequality as progress.
 */
export const UAT_DRIVE_PROGRESS_EVIDENCE_CLAUSE = [
  "Execution-progress evidence - a changed terminal picture is not a started process:",
  "",
  "  - Input echo, cursor movement, selection, focus, and terminal control-sequence changes are",
  "    diagnostics only. Even repeated changed snapshots do NOT prove execution began.",
  "  - Say execution began only after durable semantic terminal output appears, or after evidence",
  "    naming the exact process/tool identity shows it running or ended, or its exact result artifact",
  "    is complete. Evidence about a later probe or another process does not count.",
  "  - When none of those exists, report the start as unresolved/not-started. Do not convert display",
  "    churn into a product duration, hang, host termination, pass, or fail.",
].join("\n");

/**
 * The desktop's terminal snapshot is an xterm screen serialization, not a plain-text transcript.
 * Keeping its colour and cursor state is a product contract. A UAT walker asserting what a user can
 * read needs a separate printable projection, otherwise PSReadLine's SGR between command tokens turns
 * an exact seeded command into a false negative under raw `String.includes`.
 */
export const UAT_DRIVE_TERMINAL_VISIBLE_TEXT_CLAUSE = [
  "Terminal visible-text evidence - compare what the user can read, not colour-preserving bytes:",
  "",
  "  - A terminal snapshot is an xterm screen serialization. It deliberately retains ANSI colour,",
  "    cursor, title, and other control sequences, including controls inserted between command tokens.",
  "  - Before asserting that printable text such as an exact seeded command appears, project the raw",
  "    snapshot with `projectTerminalVisibleText` from `packages/drive/src/uat-drive.ts`. Never compare",
  "    the colour-preserving raw snapshot with `.includes(exactCommand)`; that is diagnostic bytes, not",
  "    the visible text a user reads.",
  "  - Keep the raw snapshot as diagnostic evidence. Apply this projection only to visible-text",
  "    comparisons: do not erase semantic output, and do not replace exact process/tool/result identity",
  "    with a text inference. The execution-progress rule still decides whether a process started.",
].join("\n");

/**
 * PURE: project an xterm serialization to the printable text a UAT observer can compare.
 *
 * ANSI/OSC controls express colour, cursor and title state, not user-readable characters. Remaining
 * C0 controls are likewise non-printing; line breaks and tabs survive because they carry text layout.
 * The caller retains the original snapshot separately, so product serialization and diagnostics stay
 * byte-for-byte untouched.
 */
export function projectTerminalVisibleText(serializedScreen: string): string {
  return stripAnsi(serializedScreen)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

export interface DriveExecutionProgressEvidence {
  /** The process/tool identity whose start is being classified. */
  readonly expectedProcessId: string;
  /** Raw display inequality is diagnostic only: input/cursor/control churn commonly sets this. */
  readonly rawTerminalChanged: boolean;
  /** Durable semantic output, with input echo and terminal control sequences already excluded. */
  readonly semanticTerminalOutput: string;
  /** Exact process evidence, when the runtime exposes it. */
  readonly process?: {
    readonly processId: string;
    readonly outcome: "running" | "completed" | "failed" | "host-terminated" | "unknown";
  };
  /** Exact persisted result evidence, when the tool authors one. */
  readonly result?: { readonly processId: string; readonly complete: boolean };
}

export type DriveExecutionProgress =
  | { readonly kind: "started"; readonly executionBegan: true; readonly reason: string }
  | { readonly kind: "unresolved" | "not-started"; readonly executionBegan: false; readonly reason: string };

/** PURE: only semantic output or exact process/result identity can prove that execution began. */
export function classifyDriveExecutionProgress(
  evidence: DriveExecutionProgressEvidence,
): DriveExecutionProgress {
  if (evidence.semanticTerminalOutput.trim().length > 0) {
    return {
      kind: "started",
      executionBegan: true,
      reason: "durable semantic terminal output proves execution began",
    };
  }
  if (
    evidence.process?.processId === evidence.expectedProcessId &&
    evidence.process.outcome !== "unknown"
  ) {
    return {
      kind: "started",
      executionBegan: true,
      reason: "exact process identity evidence proves execution began",
    };
  }
  if (evidence.result?.processId === evidence.expectedProcessId && evidence.result.complete) {
    return {
      kind: "started",
      executionBegan: true,
      reason: "an exact completed result artifact proves execution began",
    };
  }
  if (evidence.rawTerminalChanged) {
    return {
      kind: "unresolved",
      executionBegan: false,
      reason: "input, cursor, or control-only terminal change does not prove execution began",
    };
  }
  return {
    kind: "not-started",
    executionBegan: false,
    reason: "no semantic terminal output or exact process/result evidence proves execution began",
  };
}

export type BackgroundToolResultState = "absent" | "complete";
export type BackgroundToolProcessOutcome = "completed" | "failed" | "host-terminated" | "unknown";

/** Evidence about one background tool after the driver reconciled all three result sources. */
export interface BackgroundToolEndEvidence {
  /** The exact identity returned when the tool was started or resumed. */
  readonly toolId: string;
  readonly terminalResult: BackgroundToolResultState;
  readonly persistedResultArtifact: BackgroundToolResultState;
  readonly processOutcome: BackgroundToolProcessOutcome;
  /** Diagnostic only: losing control is not itself an execution outcome. */
  readonly controlChannel: "available" | "lost";
}

export type BackgroundToolEndClassification =
  | {
      readonly kind: "tool-ended";
      readonly mayClaimHostTermination: false;
      readonly reason: "the exact background tool reached a terminal product end";
    }
  | {
      readonly kind: "host-terminated";
      readonly mayClaimHostTermination: true;
      readonly reason: "the exact background tool has no completed result and its process was host-terminated";
    }
  | {
      readonly kind: "unresolved";
      readonly mayClaimHostTermination: false;
      readonly reason: "the evidence does not establish what ended the exact background tool";
    };

/**
 * PURE: apply the prompt contract's precedence to reconciled background-tool evidence.
 *
 * A complete result wins even if the tool process later reports failure or its control channel is
 * gone: those signals commonly describe cleanup after the product end. Conversely, host termination
 * is a positive classification, never an inference from silence or from evidence about a later probe.
 */
export function classifyBackgroundToolEnd(
  startedToolId: string,
  evidence: BackgroundToolEndEvidence,
): BackgroundToolEndClassification {
  if (evidence.toolId !== startedToolId) {
    return {
      kind: "unresolved",
      mayClaimHostTermination: false,
      reason: "the evidence does not establish what ended the exact background tool",
    };
  }

  if (
    evidence.terminalResult === "complete" ||
    evidence.persistedResultArtifact === "complete" ||
    evidence.processOutcome === "completed" ||
    evidence.processOutcome === "failed"
  ) {
    return {
      kind: "tool-ended",
      mayClaimHostTermination: false,
      reason: "the exact background tool reached a terminal product end",
    };
  }

  if (evidence.processOutcome === "host-terminated") {
    return {
      kind: "host-terminated",
      mayClaimHostTermination: true,
      reason: "the exact background tool has no completed result and its process was host-terminated",
    };
  }

  return {
    kind: "unresolved",
    mayClaimHostTermination: false,
    reason: "the evidence does not establish what ended the exact background tool",
  };
}

/** Everything the prompt builder needs about the criterion being driven. */
export interface UatDriveSpec {
  readonly storyId: string;
  readonly storyTitle: string;
  /** The story's stated outcome — the goal the journey is a walkthrough of. */
  readonly storyOutcome: string;
  readonly criterionId: string;
  /**
   * The criterion's authored prose item, VERBATIM (`parseUatTestCriterionSources().source`). It is
   * handed to the model unedited: ADR-0295's own mitigation for a driver that would otherwise author
   * and judge its own assertions is that the claim being tested stays human-authored.
   */
  readonly journey: string;
  /** Platform derived from that authored journey by {@link classifyUatDrivePlatform}. */
  readonly platform: UatDrivePlatform;
  /**
   * How this drive is separated from the session that launched it. REQUIRED, so that a prompt
   * carrying no isolation is not a shape this builder can produce: the three measured failures were
   * all a drive inheriting its parent's identity, ports and tree, and a drive that does not KNOW it
   * has its own reproduces failure 2 by discovering a sibling's server.
   */
  readonly isolation: DriveIsolation;
}

/**
 * The drive task, parameterized by the criterion. It states the GOAL and hands over the authored
 * journey verbatim; it never restates, paraphrases, or decomposes the journey, because a paraphrase
 * is the driver quietly authoring its own acceptance claim.
 */
export function uatDriveTaskPrompt(spec: UatDriveSpec): string {
  return [
    `You are driving a user-acceptance journey for the storytree story "${spec.storyId}" — ${spec.storyTitle}.`,
    "",
    `The story's outcome: ${spec.storyOutcome}`,
    "",
    "Below is ONE acceptance criterion, exactly as a human authored it. It is a journey through a real",
    "surface, not a specification. Your job is to WALK IT, for real, end to end, against the real",
    spec.platform === "electron-native-shell"
      ? "system — the real CLI, the real store, the real UI in the real Electron native shell — and then report what"
      : "system — the real CLI, the real store, the real UI in a real browser — and then report what",
    "actually happened.",
    "",
    "--- THE JOURNEY (authored; do not reinterpret its claim) ---",
    spec.journey.trim(),
    "--- END OF JOURNEY ---",
    "",
    "How to drive it:",
    "",
    "  - Read CLAUDE.md first; it is the authoritative orientation for this repository.",
    "  - Bring up what the journey needs — the dev server, the database — and drive the real thing.",
    `  - The annotations in the journey — (witness: …), (proof-gate: …), (criterion-id: …),`,
    "    (revision-id: …) — are bookkeeping for the proof machinery. They are not steps. Ignore them.",
    "  - Do not edit repository source to make the journey pass. You are testing what is here, not",
    "    building what is missing. If the surface is broken, that is a FAIL and it is the finding.",
    "",
    UAT_DRIVE_TOOLING_CLAUSE,
    "",
    uatDrivePlatformToolingClause(spec.platform),
    "",
    UAT_DRIVE_BACKGROUND_RESULT_RECONCILIATION_CLAUSE,
    "",
    UAT_DRIVE_PROGRESS_EVIDENCE_CLAUSE,
    "",
    UAT_DRIVE_TERMINAL_VISIBLE_TEXT_CLAUSE,
    "",
    UAT_DRIVE_REPORT_BY_CLOCK_CLAUSE,
    "",
    uatDriveIsolationClause(spec.isolation),
    "",
    UAT_DRIVE_AUTONOMY_CLAUSE,
    "",
    UAT_DRIVE_HONESTY_CLAUSE,
    "",
    "When you are done — whichever way it went — end your final message with EXACTLY one fenced block",
    "in this form and nothing after it:",
    "",
    "```" + UAT_DRIVE_REPORT_FENCE,
    "{",
    '  "outcome": "pass" | "fail",',
    '  "failureCause": "journey-failed" | "report-by-reached",',
    '  "summary": "one paragraph: what you did and what you observed",',
    '  "steps": [',
    '    { "step": "what you attempted", "outcome": "pass" | "fail" | "skipped", "note": "what you saw" }',
    "  ],",
    '  "escalated": false,',
    `  "surface": "${driveSurfaceUrl(spec.isolation.surfacePort)}" | null`,
    "}",
    "```",
    "",
    "`outcome` is `pass` only when every step of the authored journey above actually happened and the",
    "success condition it states was observed. Anything else — a step you skipped, a surface that did",
    "not come up, an assertion you could not check — is `fail`. There is no partial pass.",
    "",
    "`failureCause` is REQUIRED when outcome is `fail` and MUST be omitted when outcome is `pass`.",
    "Use `journey-failed` for an ordinary early product/journey failure. Use `report-by-reached` only",
    "after the exact system-UTC comparison above proves current UTC is not earlier than reportBy.",
    "The runner checks that timing mechanically; a premature deadline claim persists nothing.",
    "",
    `\`surface\` is REQUIRED. It is ${driveSurfaceUrl(spec.isolation.surfacePort)} if this walk observed an`,
    "HTTP surface at all, and `null` if it was a pure-CLI journey that observed none. Those are the only",
    "two answers: reporting any other URL is refused, because another port is another checkout's studio.",
    "Omitting the field is refused too — a report that does not say what it drove cannot be believed",
    "about what it saw.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The prompt integrity audit
// ---------------------------------------------------------------------------

/** The outcome of {@link auditDrivePrompt} — `missing` names each property the prompt lost. */
export interface DrivePromptAudit {
  readonly ok: boolean;
  readonly missing: string[];
}

/**
 * PURE: does `prompt` still carry every property it was built to carry?
 *
 * This is the analogue of gate-7's `auditUncoached`, and it exists for the same reason: the prompt is
 * the whole harness, an authoring property is easy to lose in an edit, and losing it is SILENT — a
 * weakened prompt still runs, still returns a report, and still greens legs.
 *
 * THREE ARE HONESTY properties — without them a green can be untrue:
 *  1. the authored journey appears VERBATIM (a paraphrase is the driver authoring its own claim,
 *     which is precisely the failure mode ADR-0295's Consequences names);
 *  2. the honesty clause is present (without it a summarised run and a driven run are the same text);
 *  3. the report contract is named, so an absent report is a MISS rather than an implied pass.
 *
 * THREE ARE CAPABILITY properties, and the distinction is worth keeping. Losing
 * {@link UAT_DRIVE_TOOLING_CLAUSE}, the background-result reconciliation clause, or the isolation
 * clause cannot make a green untrue — it makes a MISS or a false harness red likelier rather than a
 * finding about the product. They are guarded here because each was learned through live-drive
 * failure, and because each failure looks identical to a slow, unlucky, or killed journey. A reader
 * deciding what a refusal MEANS should read the class: the first three mean *this drive could lie*;
 * the last three mean *this drive will probably waste its spend, invent a harness red, or damage the
 * session that launched it*.
 *
 * It takes the whole {@link UatDriveSpec} rather than the journey alone, because the isolation clause
 * is PARAMETERIZED by the drive: there is no constant to compare against, only the clause this exact
 * drive should be carrying. Asking the audit to rebuild it from the spec is what keeps a prompt built
 * for one drive from being audited as though it were built for another.
 *
 * The drive suite runs it against the real {@link uatDriveTaskPrompt}, so an edit that drops one
 * reds `pnpm -r test` instead of quietly degrading every later drive.
 */
export function auditDrivePrompt(prompt: string, spec: UatDriveSpec): DrivePromptAudit {
  const missing: string[] = [];
  if (spec.platform !== classifyUatDrivePlatform(spec.journey)) {
    missing.push("the criterion-derived platform binding");
  }
  if (!prompt.includes(spec.journey.trim())) missing.push("the authored journey prose, verbatim");
  if (!prompt.includes(UAT_DRIVE_HONESTY_CLAUSE)) missing.push("the honesty clause");
  // The OPENER, not the bare token. The token alone is a substring an unrelated line can satisfy by
  // accident — the drive's own scratch directory is named `storytree-uat-drive/<run>` and did exactly
  // that, which would have let a prompt that lost its report contract still pass this audit. What the
  // contract actually requires is the fenced block, so that is what is checked.
  if (!prompt.includes("```" + UAT_DRIVE_REPORT_FENCE)) missing.push("the report contract fence");
  if (!prompt.includes(UAT_DRIVE_TOOLING_CLAUSE)) missing.push("the tooling clause");
  const platformClause = uatDrivePlatformToolingClause(spec.platform);
  if (!prompt.includes(platformClause)) {
    missing.push(
      spec.platform === "electron-native-shell"
        ? "the native-shell Electron tooling clause"
        : "the web-platform tooling clause",
    );
  }
  if (spec.platform === "electron-native-shell" && prompt.includes(UAT_DRIVE_WEB_TOOLING_CLAUSE)) {
    missing.push("the native-shell platform boundary (Chromium substitution)");
  }
  if (!prompt.includes(UAT_DRIVE_BACKGROUND_RESULT_RECONCILIATION_CLAUSE)) {
    missing.push("the background-tool result reconciliation clause");
  }
  if (!prompt.includes(UAT_DRIVE_PROGRESS_EVIDENCE_CLAUSE)) {
    missing.push("the execution-progress evidence clause");
  }
  if (!prompt.includes(UAT_DRIVE_TERMINAL_VISIBLE_TEXT_CLAUSE)) {
    missing.push("the terminal visible-text evidence clause");
  }
  if (!prompt.includes(UAT_DRIVE_REPORT_BY_CLOCK_CLAUSE)) {
    missing.push("the runner-authoritative UTC reportBy comparison clause");
  }
  if (!prompt.includes(uatDriveIsolationClause(spec.isolation))) missing.push("the isolation clause");
  // The `surface` field lives in the REPORT CONTRACT, not the isolation clause, so the clause check
  // above does not reach it. Guarded separately because losing it is the quiet half of the failure:
  // `requireOwnSurface` refuses a report with no `surface`, so a prompt that stopped ASKING for one
  // would turn every drive into a harness refusal — a whole population of spend, wasted, for a
  // reason that looks like the driver's fault. It is a CAPABILITY property in the sense above.
  if (!prompt.includes(`"surface": "${driveSurfaceUrl(spec.isolation.surfacePort)}" | null`)) {
    missing.push("the report contract's `surface` field, naming this drive's reserved URL");
  }
  if (!prompt.includes('"failureCause": "journey-failed" | "report-by-reached"')) {
    missing.push("the report contract's typed failure cause");
  }
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Reading the model's report
// ---------------------------------------------------------------------------

export type DriveReportParse =
  | { ok: true; report: UatDriveReport }
  | { ok: false; reason: string };

const FENCE = new RegExp("```" + UAT_DRIVE_REPORT_FENCE + "\\s*\\n([\\s\\S]*?)```", "g");

/**
 * PURE + FAIL-CLOSED: read the driver's machine-readable report out of its final text.
 *
 * Takes the LAST fenced block (a driver that corrects itself mid-run leaves earlier drafts behind).
 * Every failure path — no block, unparseable JSON, a shape that does not satisfy the contract —
 * returns a refusal, never a default. That asymmetry is the point: a run whose report cannot be read
 * did not pass, and the caller exits non-zero. An implied pass is the one outcome this parser can
 * never produce.
 */
export function parseDriveReport(text: string): DriveReportParse {
  const blocks = [...text.matchAll(FENCE)].map((m) => m[1] ?? "");
  const last = blocks.at(-1);
  if (last === undefined) {
    return {
      ok: false,
      reason: `the driver emitted no \`\`\`${UAT_DRIVE_REPORT_FENCE} report block — the run reported nothing readable, which is a MISS, not a pass`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(last);
  } catch (e) {
    return { ok: false, reason: `the driver's report block is not valid JSON: ${(e as Error).message}` };
  }
  const parsed = UatDriveReport.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `the driver's report does not satisfy the contract: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "invalid"}`,
    };
  }
  return { ok: true, report: parsed.data };
}

export type DriveReportTimingAudit = { ok: true } | { ok: false; reason: string };

/**
 * PURE + FAIL-CLOSED: a model may classify a fail as deadline exhaustion, but only the runner's UTC
 * clock decides whether that boundary had actually arrived. Other fails are deliberately untouched.
 */
export function auditDriveReportTiming(
  report: UatDriveReport,
  evidence: { readonly reportBy: string; readonly reportObservedAt: string },
): DriveReportTimingAudit {
  if (report.failureCause !== "report-by-reached") return { ok: true };

  const reportByMs = Date.parse(evidence.reportBy);
  const observedAtMs = Date.parse(evidence.reportObservedAt);
  if (!Number.isFinite(reportByMs) || !Number.isFinite(observedAtMs)) {
    return {
      ok: false,
      reason: `deadline timing is unreadable (reportBy ${JSON.stringify(evidence.reportBy)}, report observed ${JSON.stringify(evidence.reportObservedAt)})`,
    };
  }
  if (observedAtMs < reportByMs) {
    return {
      ok: false,
      reason:
        `the driver classified its fail as reportBy exhaustion, but the runner observed the report at ` +
        `${evidence.reportObservedAt}, before reportBy ${evidence.reportBy}`,
    };
  }
  return { ok: true };
}

/**
 * PURE: prefer the Codex final-message file's host-clock mtime over provider-process return time.
 * Codex can leave a completed final message behind while its wrapper remains alive; using that later
 * return would make a premature report look timely. Other providers use the runner receipt instant.
 */
export function driveReportObservedAt(receivedAtMs: number, finalMessageMtimeMs?: number): string {
  if (!Number.isFinite(receivedAtMs)) throw new Error("report receipt time must be finite");
  const observedAtMs =
    finalMessageMtimeMs !== undefined && Number.isFinite(finalMessageMtimeMs) && finalMessageMtimeMs <= receivedAtMs
      ? finalMessageMtimeMs
      : receivedAtMs;
  return new Date(observedAtMs).toISOString();
}

// ---------------------------------------------------------------------------
// The witness selector
// ---------------------------------------------------------------------------

/** One `events.uat_drive` row, as the witness check reads it. */
export interface DriveRow {
  readonly criterionId: string;
  readonly revisionId: string;
  readonly outcome: string;
  readonly commitSha: string;
  readonly runId: string;
  readonly driver: string;
  /** ISO-8601. */
  readonly at: string;
}

export interface DriveWitnessPolicy {
  /** The criterion the bound leg names. */
  readonly criterionId: string;
  /** The criterion's CURRENT content-bound revision, read from the story prose at check time. */
  readonly revisionId: string;
  /** Freshness floor in days (ADR-0016 ageing). */
  readonly freshnessDays: number;
}

export interface DriveWitnessDeps {
  /** True when `sha` is an ancestor of HEAD. Injected → the selector stays pure and shallow-safe. */
  ancestorOfHead(sha: string): boolean;
  now(): Date;
}

export type DriveWitnessResult =
  | { ok: true; drive: DriveRow }
  | { ok: false; reasons: string[] };

const MS_PER_DAY = 86_400_000;

function disqualify(
  row: DriveRow,
  policy: DriveWitnessPolicy,
  deps: DriveWitnessDeps,
): string | null {
  if (row.criterionId !== policy.criterionId) {
    return `drive ${row.runId} is for criterion ${row.criterionId}, not ${policy.criterionId}`;
  }
  if (row.revisionId !== policy.revisionId) {
    return (
      `drive ${row.runId} drove revision ${row.revisionId}, but the criterion now reads ` +
      `${policy.revisionId} — the journey prose changed since it was driven, so the drive witnesses a claim that no longer exists (re-run the driver)`
    );
  }
  if (row.outcome !== "pass") {
    return `drive ${row.runId} reported outcome "${row.outcome}", not "pass"`;
  }
  const atMs = Date.parse(row.at);
  if (Number.isNaN(atMs)) return `drive ${row.runId} has an unparseable "at" timestamp: "${row.at}"`;
  const ageDays = (deps.now().getTime() - atMs) / MS_PER_DAY;
  if (ageDays > policy.freshnessDays) {
    return `drive ${row.runId} is stale: ${ageDays.toFixed(2)} days old, exceeds freshnessDays ${policy.freshnessDays}`;
  }
  if (!deps.ancestorOfHead(row.commitSha)) {
    return `drive ${row.runId} at commit ${row.commitSha.slice(0, 10)} is not an ancestor of HEAD`;
  }
  return null;
}

/**
 * PURE: the most recent drive record that honestly witnesses this criterion — a `pass`, over the
 * criterion's CURRENT revision, recent, at a commit in HEAD's ancestry. Mirrors
 * `selectWitnessableVerdict` (gate-6/gate-7's core) so the two witness checks cannot drift apart on
 * what "still counts" means.
 *
 * Total and fail-closed: with nothing qualifying it returns every disqualification reason, so the
 * check can tell an operator WHY it is red — a stale drive, a changed journey and an unlanded commit
 * are three different repairs.
 */
export function selectWitnessableDrive(
  rows: readonly DriveRow[],
  policy: DriveWitnessPolicy,
  deps: DriveWitnessDeps,
): DriveWitnessResult {
  if (rows.length === 0) {
    return {
      ok: false,
      reasons: [`no drive records for criterion ${policy.criterionId} — run the driver (uat-drive.run.ts)`],
    };
  }
  const reasons: string[] = [];
  let best: { row: DriveRow; atMs: number } | null = null;
  for (const row of rows) {
    const reason = disqualify(row, policy, deps);
    if (reason !== null) {
      reasons.push(reason);
      continue;
    }
    const atMs = Date.parse(row.at);
    if (best === null || atMs > best.atMs) best = { row, atMs };
  }
  return best !== null ? { ok: true, drive: best.row } : { ok: false, reasons };
}

// ---------------------------------------------------------------------------
// ISOLATION FROM THE LAUNCHING SESSION
// ---------------------------------------------------------------------------

/**
 * Everything below closes ONE defect with three faces, measured across four production drives:
 * **the spawned drive is indistinguishable from the session that launched it.**
 *
 * `uat-drive.run.ts` spawns a fresh Claude Code session with `bypassPermissions` in the SAME
 * worktree, on the SAME branch, sharing the SAME env, ports and process tree. Everything that keys
 * on "which session is this?" therefore answers with the PARENT, and three separate harms follow:
 *
 *  1. CLAIMS. `events.node_claim` is keyed `(unit_id, session_id)`, and `deriveIdentity()` reads the
 *     session id off the WORKTREE — so parent and child resolve to one identity. A drive that tidies
 *     up with `noticeboard done` calls `releaseClaimsBySession(<the parent's id>)` and deletes the
 *     LAUNCHING session's claims. Under ADR-0346 D1 a work claim BINDS, so a sibling attempting the
 *     same capability in that gap is ADMITTED rather than queued — the exact contention the ledger
 *     exists to prevent. It is silent: `done` reports success, because from the ledger's point of
 *     view the session that held those claims is the one asking to release them. Observed after all
 *     four drives.
 *  2. SURFACE. The drive discovers a studio rather than owning one, and the well-known ports are
 *     held by OTHER worktrees' servers. One drive walked `localhost:5180` — a sibling's JSON-backed
 *     studio — and reported on the criterion as though it had driven its own checkout. That is worse
 *     than failing to reach a surface, which the drive contract already handles honestly as a FAIL
 *     naming the reason.
 *  3. LIFETIME. The runner waits for the SESSION to end, not for the WALK to finish, so a journey
 *     still progressing when its session's turn budget runs out emits no report and is recorded as a
 *     MISS — a harness red wearing a product red's clothes — while the orphan it leaves writes into
 *     the shared tree, whose dirtiness then REFUSES the next drive. Cost when filed: two extra
 *     subscription-funded drives, ~41 minutes, learning nothing about the product.
 *
 * The correction is one idea applied three times: **a drive is a GUEST, never the host.** It gets its
 * own notice-board identity ({@link mintDriveSessionId}), its own reserved surface
 * ({@link driveSurfacePorts} + {@link judgeDriveSurface}), and its own out-of-tree scratch
 * ({@link driveScratchDir}) — and what it leaves behind is attributed and swept
 * ({@link classifyDriveResidue}) rather than inherited by whoever drives next.
 *
 * All of it is PURE and decided here; `uat-drive.run.ts` stays the thin wiring that a `*.run.ts`
 * is allowed to be, and {@link driveChildEnv} is the single seam through which the isolation
 * actually reaches the child — so a test can prove the runner hands it over, rather than trusting
 * that it does.
 */

// -- 1. CLAIMS: the drive's own notice-board identity -------------------------

/**
 * The env var carrying a spawned drive's OWN notice-board session id.
 *
 * Deliberately NOT `STORYTREE_SESSION_ID`, which already means the opposite: `spawn-record.mjs`
 * documents it as the override by which *"a spawned runtime INHERITS its parent session"*, and
 * several runtimes set it for exactly that. Reusing it here would express "be your parent" in the
 * one place that must express "be someone else".
 */
export const UAT_DRIVE_SESSION_ENV = "STORYTREE_DRIVE_SESSION_ID";

/**
 * The reserved prefix every drive session id carries.
 *
 * It is what makes {@link isDriveSessionId} total, and what makes a collision with a real session
 * impossible: a worktree-derived id is a git admin-dir BASENAME (`deriveIdentity` rules 1 and 2),
 * and this prefix is not a legal shape for one. The board therefore renders a drive as visibly a
 * drive, so a human reading the ledger can tell a walk from a worker without consulting anything.
 */
export const UAT_DRIVE_SESSION_PREFIX = "uat-drive~";

/** Characters that must never reach a session id — it keys spawn-record FILES as well as ledger rows. */
const UNSAFE_IN_SESSION_ID = /[/\\:*?"<>|\s]/;

/**
 * PURE: mint the session id for one criterion's drive.
 *
 * Deterministic in its inputs and unique per run: the criterion says WHAT is being walked and the pid
 * says WHICH walk, so two concurrent drives of the same criterion are two rows rather than one, and a
 * ledger reader can trace a row back to a process. Characters outside `[A-Za-z0-9_-]` in the criterion
 * id are folded to `-` because this string keys spawn-record files as well as ledger rows
 * (`spawn-registry.test.ts` pins that a separator in a session id writes the record into somebody
 * else's path).
 */
export function mintDriveSessionId(spec: { criterionId: string; pid: number }): string {
  const safe = spec.criterionId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${UAT_DRIVE_SESSION_PREFIX}${safe.length > 0 ? safe : "unnamed"}~${spec.pid}`;
}

/** PURE + total: is this id one a drive minted for itself, rather than a real session's? */
export function isDriveSessionId(sessionId: string): boolean {
  return sessionId.startsWith(UAT_DRIVE_SESSION_PREFIX);
}

/**
 * PURE: the session id a process should adopt because it was spawned AS a drive, or null.
 *
 * `deriveIdentity()` consults this FIRST (its rule 0). Validated rather than trusted, because it is
 * unvalidated env on a path that keys ledger rows and spawn-record files: an id without the reserved
 * prefix, or carrying a path separator, is IGNORED — falling back to the ordinary worktree
 * derivation, which is the pre-existing behaviour. Failing open here is right: the worst case of
 * ignoring it is the defect this closes, while a bad value HONOURED could re-key a real session's
 * claims onto a string nobody can find.
 */
export function driveIdentityOverride(env: Readonly<Record<string, string | undefined>>): string | null {
  const raw = env[UAT_DRIVE_SESSION_ENV];
  if (raw === undefined) return null;
  const id = raw.trim();
  if (id.length === 0) return null;
  if (!isDriveSessionId(id)) return null;
  if (UNSAFE_IN_SESSION_ID.test(id)) return null;
  return id;
}

/**
 * PURE: the refusal a runner must print rather than spawn, or null when the spawn is isolated.
 *
 * The property being enforced is the one the increment states: **a drive cannot release the launching
 * session's claims.** It holds exactly when the two identities differ, so this is that sentence as an
 * assertion rather than as a comment — checked BEFORE any subscription-funded spend, so a regression
 * that re-collapses the two identities costs a refusal instead of a silently-cleared ledger.
 *
 * A launching session with NO identity (the primary checkout) is not a hazard: it holds no claims to
 * release. The drive still takes its own id, so it stays distinguishable on the board.
 */
export function assertDriveIsolated(
  launching: { sessionId: string } | null,
  driveSessionId: string,
): string | null {
  if (!isDriveSessionId(driveSessionId)) {
    return (
      `REFUSED: the drive session id "${driveSessionId}" does not carry the reserved ` +
      `"${UAT_DRIVE_SESSION_PREFIX}" prefix, so ${UAT_DRIVE_SESSION_ENV} would be ignored and the ` +
      "drive would run under the launching session's identity — where its tidy-up releases the " +
      "launching session's claims (ADR-0346 D1: a released work claim ADMITS a sibling that should queue)."
    );
  }
  if (launching !== null && launching.sessionId === driveSessionId) {
    return (
      "REFUSED: the drive would run under the launching session's own identity " +
      `("${launching.sessionId}"). A drive that shares its parent's session id releases its parent's ` +
      "claims when it tidies up, silently and with a success message."
    );
  }
  return null;
}

// -- 2. SURFACE: a reserved port, and an OWNERSHIP check that fails closed -----

/** The env var naming the exclusive localhost port reserved for this drive's own studio. */
export const UAT_DRIVE_SURFACE_PORT_ENV = "STORYTREE_DRIVE_SURFACE_PORT";

/**
 * The port band reserved for drives, chosen to sit clear of every studio port this box was measured
 * holding: vite's 5173 and its neighbours 5174-5178, plus 5180, 5190 and 5199. A drive never competes
 * for a well-known port, so "something is already listening" stops being the normal case.
 */
export const UAT_DRIVE_PORT_BASE = 5310;
export const UAT_DRIVE_PORT_SPAN = 40;

/**
 * PURE: the ordered candidate ports for one drive — a seed-derived starting offset, then the whole
 * band exactly once.
 *
 * Seeded (by pid) rather than fixed so two concurrent drives start at different candidates instead of
 * racing for one; exhaustive so the runner's answer is "the whole reserved band is busy", never a
 * silent fallback onto a port somebody else owns. Choosing a free port is the runner's job (it is the
 * only one that can bind); choosing WHICH to try, and in what order, is decidable here.
 */
export function driveSurfacePorts(seed: number): number[] {
  const start = Math.abs(Math.trunc(seed)) % UAT_DRIVE_PORT_SPAN;
  return Array.from(
    { length: UAT_DRIVE_PORT_SPAN },
    (_, i) => UAT_DRIVE_PORT_BASE + ((start + i) % UAT_DRIVE_PORT_SPAN),
  );
}

/** What a drive requires of the surface it is about to measure. */
export interface SurfaceExpectation {
  /** The clean commit this drive is pinned to — the code the surface must actually be serving. */
  readonly commitSha: string;
  /** ADR-0302: a drive measures the LIVE store; a JSON-backed studio is a different product. */
  readonly requireLiveStore: boolean;
}

export type SurfaceJudgement = { ok: true; note: string } | { ok: false; reason: string };

/**
 * PURE + FAIL-CLOSED: may this drive treat the thing answering `/api/health` as ITS OWN surface?
 *
 * The measured failure is not "the drive could not find a studio" — that outcome is already honest,
 * and the drive contract records it as a FAIL naming the reason. It is that the drive FOUND one and
 * it belonged to somebody else: a sibling worktree's JSON-backed server on 5180, reported on as
 * though it were this checkout's live-store studio.
 *
 * `/api/health` already carries everything needed to tell them apart, for reasons that predate this:
 * `store` says which backend answers, and `code.startedAt` is the git HEAD the SERVER PROCESS LOADED
 * (`apps/studio/server/codeStamp.ts`, built for the "the checkout moved under a running server"
 * incident). A server whose `startedAt` is this drive's pinned commit is serving this drive's code.
 *
 * Every unknown is a REFUSAL, and that asymmetry is the whole point: an unparseable payload, an
 * absent `code` stamp, an absent `store` — none of them PROVE the surface is foreign, and none prove
 * it is ours either. The failure being closed is a drive BELIEVING an unproven surface, so "cannot
 * tell" must land on the same side as "not mine". `code.stale` is deliberately NOT a refusal: it says
 * the checkout moved on disk since the server started, which leaves what the server is SERVING — the
 * pinned commit — exactly right.
 */
export function judgeDriveSurface(health: unknown, expect: SurfaceExpectation): SurfaceJudgement {
  if (typeof health !== "object" || health === null) {
    return {
      ok: false,
      reason:
        "nothing readable answered /api/health — this is not a studio, or it is not up. A surface that " +
        "cannot be identified is NOT this drive's surface (report a fail naming the unreachable surface).",
    };
  }
  const h = health as { store?: unknown; code?: unknown };

  if (expect.requireLiveStore) {
    if (typeof h.store !== "string") {
      return {
        ok: false,
        reason: "/api/health named no `store`, so the backend behind this surface is unknown — refused.",
      };
    }
    if (h.store !== "pg") {
      return {
        ok: false,
        reason:
          `this surface is backed by the "${h.store}" store, not the live "pg" store. A JSON-backed ` +
          "studio is a DIFFERENT product from the one under test (it does not reflect CLI writes), and " +
          "it is the signature of a sibling worktree's server — the measured localhost:5180 failure.",
      };
    }
  }

  const code = h.code as { startedAt?: unknown; stale?: unknown } | undefined;
  if (typeof code !== "object" || code === null || typeof code.startedAt !== "string") {
    return {
      ok: false,
      reason:
        "/api/health carried no `code` stamp, so which checkout this server loaded cannot be proven. " +
        "Refused: an unproven surface is not this drive's surface. Start your OWN studio on the port " +
        "this drive reserved for you.",
    };
  }
  if (code.startedAt !== expect.commitSha) {
    return {
      ok: false,
      reason:
        `this server started on commit ${code.startedAt.slice(0, 10)}, but this drive is pinned to ` +
        `${expect.commitSha.slice(0, 10)} — it is serving a DIFFERENT checkout (another worktree's ` +
        "studio). Anything observed here is a finding about somebody else's tree.",
    };
  }
  const stale =
    code.stale === true ? " (its checkout has since moved on disk, which does not change what it serves)" : "";
  return {
    ok: true,
    note: `the surface is this drive's own: store "pg", started on ${expect.commitSha.slice(0, 10)}${stale}.`,
  };
}

// -- 2b. SURFACE OWNERSHIP, ENFORCED: the judgement above has to actually RUN --

/**
 * The file, inside the drive's scratch directory, that `uat-drive-surface.check.ts` appends its
 * judgements to and the runner reads back.
 *
 * The scratch directory is the only channel that survives the child, and it has to be: the runner
 * spawns the driver with `spawnSync`, so it is BLOCKED for the whole walk and cannot observe the
 * surface while a surface exists. By the time the runner reads the report, the studio the child
 * started has died with it. So the proof has to be left behind rather than taken.
 */
export const UAT_DRIVE_SURFACE_ATTESTATION_FILE = "surface-attestations.jsonl";

/** One recorded answer to "was the thing at `url` this drive's own surface?", written by the child. */
export const DriveSurfaceAttestation = z
  .object({
    /** The base URL that was probed, exactly as the driver named it. */
    url: z.string().min(1),
    /** The verdict {@link judgeDriveSurface} returned for it. */
    ok: z.boolean(),
    /** Its note (ok) or refusal reason (not ok) — carried so the runner can quote it. */
    detail: z.string().min(1),
    at: z.string().min(1),
  })
  .strict();
export type DriveSurfaceAttestation = z.infer<typeof DriveSurfaceAttestation>;

/**
 * PURE: read the attestation log the child left behind, discarding lines that do not parse.
 *
 * Lenient about MALFORMED lines and strict about MISSING ones, which is the right way round: a
 * corrupt line proves nothing and is dropped, but {@link requireOwnSurface} then finds no matching
 * attestation and refuses. A drive is never passed on the strength of a line nobody could read.
 */
export function parseSurfaceAttestations(raw: string): DriveSurfaceAttestation[] {
  const out: DriveSurfaceAttestation[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = DriveSurfaceAttestation.safeParse(JSON.parse(trimmed));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // a half-written line from a killed child is not evidence, and is not an error either
    }
  }
  return out;
}

/** PURE: the loopback URL the runner reserved for this drive — the ONLY surface it may report. */
export function driveSurfaceUrl(port: number): string {
  return `http://localhost:${port}`;
}

/** Trailing slashes and case in the host half are noise; comparing them would refuse honest drives. */
function normaliseSurfaceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export interface OwnSurfaceInput {
  /** What the driver's report says it drove: a URL, `null` for "no HTTP surface", or absent. */
  readonly reportedSurface: string | null | undefined;
  /** The URL the runner reserved and told the child about. */
  readonly reservedUrl: string;
  /** Every attestation the child left in its scratch directory. */
  readonly attestations: readonly DriveSurfaceAttestation[];
}

export type OwnSurfaceVerdict = { ok: true; note: string } | { ok: false; reason: string };

/**
 * PURE + FAIL-CLOSED: may this drive's report be believed about the surface it says it walked?
 *
 * {@link judgeDriveSurface} was landed, tested against the measured `localhost:5180` failure, and
 * then called by NOTHING. The ownership rule lived only as a sentence in the drive prompt, audited
 * for PRESENCE and never for EXECUTION — so a driver that simply did not do it walked a sibling
 * worktree's studio and reported on the criterion as though it were its own, which is the original
 * failure this closes. An audited prompt clause is the same class of assurance that already failed.
 *
 * The rule has two halves, and BOTH are mechanical:
 *
 *  1. **The reported surface must be the RESERVED one.** The runner probes a port free and hands the
 *     child that exact URL, so there is a single right answer and comparing against it needs no
 *     cooperation. A driver that walks somebody else's studio must either report that URL — and be
 *     refused here — or lie outright, which is a different class this cannot and does not claim to
 *     stop (a lying driver can misreport anything, including the outcome).
 *  2. **An `ok` attestation for it must exist**, written by `uat-drive-surface.check.ts` while the
 *     surface was still up. That is what makes the check RUN rather than be instructed.
 *
 * `reportedSurface: null` is the honest "this journey observed no HTTP surface" — several criteria
 * are pure CLI walks, and demanding an attestation from them would refuse correct drives. It is a
 * DECLARATION, not a loophole: it is the driver stating on the record that it observed no surface,
 * so a green that later turns out to have walked one is a lie in the report rather than a silence.
 *
 * `undefined` — the field absent altogether — REFUSES. That is the old report shape, and accepting
 * it would let every pre-existing driver skip the whole rule by omission, which is exactly the
 * silence being closed. The schema keeps the field optional so already-persisted records still
 * parse; the requirement is enforced HERE, at drive time, where the refusal can explain itself.
 */
export function requireOwnSurface(input: OwnSurfaceInput): OwnSurfaceVerdict {
  const { reportedSurface, reservedUrl, attestations } = input;

  if (reportedSurface === undefined) {
    return {
      ok: false,
      reason:
        'the report named no `surface` field, so it does not say what it drove. Report the reserved URL, ' +
        'or `null` if the journey observed no HTTP surface — an omission is refused because it is ' +
        "indistinguishable from a driver that walked somebody else's studio and did not mention it.",
    };
  }

  if (reportedSurface === null) {
    return {
      ok: true,
      note: "the report declares it observed no HTTP surface, so there is no ownership to prove.",
    };
  }

  const reported = normaliseSurfaceUrl(reportedSurface);
  const reserved = normaliseSurfaceUrl(reservedUrl);
  if (reported !== reserved) {
    return {
      ok: false,
      reason:
        `the report says it drove ${reportedSurface}, but this drive reserved ${reservedUrl}. A drive ` +
        "may only report on the surface it was given: another port is another checkout's studio, and " +
        "anything observed there is a finding about somebody else's tree.",
    };
  }

  const matching = attestations.filter((a) => normaliseSurfaceUrl(a.url) === reserved);
  if (matching.length === 0) {
    return {
      ok: false,
      reason:
        `the report claims ${reportedSurface} but no surface attestation for it was left in the scratch ` +
        "directory, so the ownership check never RAN. Run `uat-drive-surface.check.ts <url>` against the " +
        "surface before observing it — the check is what turns the prompt's instruction into evidence.",
    };
  }
  const refused = matching.find((a) => !a.ok);
  if (refused !== undefined) {
    return {
      ok: false,
      reason: `the surface at ${refused.url} was REFUSED by the ownership check: ${refused.detail}`,
    };
  }
  return {
    ok: true,
    note: `surface ownership proven by ${matching.length} attestation(s) against ${reservedUrl}.`,
  };
}

// -- 3. LIFETIME: a cut-off walk is not a MISS, and its residue is attributed --

/** The env var naming the out-of-tree directory a drive writes screenshots, traces and scratch into. */
export const UAT_DRIVE_SCRATCH_ENV = "STORYTREE_DRIVE_SCRATCH";

/** The env var carrying the commit this drive is pinned to — the standard the surface check holds to. */
export const UAT_DRIVE_COMMIT_ENV = "STORYTREE_DRIVE_COMMIT";

/** Absolute runner-owned drive timing, exported so child tools cannot invent a smaller budget. */
export const UAT_DRIVE_START_AT_ENV = "STORYTREE_DRIVE_START_AT";
export const UAT_DRIVE_REPORT_BY_ENV = "STORYTREE_DRIVE_REPORT_BY";
export const UAT_DRIVE_DEADLINE_AT_ENV = "STORYTREE_DRIVE_DEADLINE_AT";

/** The normal combined report/cleanup reserve; short custom ceilings reserve 20% instead. */
export const UAT_DRIVE_REPORT_CLEANUP_BUFFER_MINUTES = 2;

export interface DriveTiming {
  readonly startAt: string;
  readonly reportBy: string;
  readonly deadlineAt: string;
  readonly reportCleanupBufferMinutes: number;
}

/** PURE: stamp one authoritative absolute timeline from the runner's clock. */
export function createDriveTiming(startMs: number, ceilingMinutes: number): DriveTiming {
  if (!Number.isFinite(startMs) || !Number.isFinite(ceilingMinutes) || ceilingMinutes <= 0) {
    throw new Error("drive timing requires a finite start and a positive wall-clock ceiling");
  }
  const reportCleanupBufferMinutes = Math.min(
    UAT_DRIVE_REPORT_CLEANUP_BUFFER_MINUTES,
    ceilingMinutes * 0.2,
  );
  const deadlineMs = startMs + ceilingMinutes * 60_000;
  const reportByMs = deadlineMs - reportCleanupBufferMinutes * 60_000;
  return {
    startAt: new Date(startMs).toISOString(),
    reportBy: new Date(reportByMs).toISOString(),
    deadlineAt: new Date(deadlineMs).toISOString(),
    reportCleanupBufferMinutes,
  };
}

/**
 * PURE: the out-of-tree scratch directory for one run.
 *
 * OUT of the repository by construction, because the drive refuses to run against a dirty tree: a
 * screenshot written into the checkout does not merely litter, it REFUSES THE NEXT DRIVE, which is
 * how one invented Playwright harness cost three drives. `runId` already carries the story, the
 * commit and the pid, so two drives never share a directory.
 */
export function driveScratchDir(tmpRoot: string, runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9_.-]+/g, "-");
  return `${tmpRoot.replace(/[/\\]+$/, "")}/storytree-uat-drive/${safe}`;
}

/**
 * How one drive ENDED, before anything is said about the product.
 *
 * The distinction is the point. `reported` is the only end that carries a claim about the system.
 * `cut-off` and `no-report` are both non-passes, and neither is a MISS in the sense that matters: a
 * MISS is currently reported as though the journey had been walked and found wanting, when in fact
 * the harness stopped the walk (`cut-off`) or the session's own budget ran out mid-walk
 * (`no-report`). Both are HARNESS outcomes — a red that tells nobody anything about the product —
 * and ADR-0348's flip increment says to keep those distinct from a real red.
 */
export type DriveEndKind = "reported" | "cut-off" | "no-report";

export interface DriveEnd {
  readonly kind: DriveEndKind;
  /** True when this end says nothing about the product — a harness outcome, never a finding. */
  readonly harness: boolean;
  readonly reason: string;
}

/**
 * PURE: classify how a drive ended, from what the harness OBSERVED rather than from what it hoped.
 *
 * `timedOut` is the runner's own ETIMEDOUT — the harness killed the walk, so whatever the journey
 * would have concluded is unknown and unknowable from here. Everything else with no readable report
 * is a session that ENDED without saying anything: the measured shape is a driver that started a
 * 40-minute poll inside an 11-minute session, so the WALK outlived its own driver.
 *
 * Neither is ever a pass. What changes is that neither is reported as a product FAIL either, so the
 * repair a reader reaches for ("raise the ceiling" / "bound the wait" / "split the journey") is the
 * one that actually fixes it.
 */
export function classifyDriveEnd(args: {
  readonly timedOut: boolean;
  readonly reportReadable: boolean;
  readonly ceilingMinutes: number;
  readonly elapsedMinutes: number;
}): DriveEnd {
  if (args.reportReadable) {
    return { kind: "reported", harness: false, reason: "the driver reported on the journey" };
  }
  if (args.timedOut) {
    return {
      kind: "cut-off",
      harness: true,
      reason:
        `the HARNESS stopped the walk at its ${args.ceilingMinutes}-min ceiling — the journey was still ` +
        "running and never got to report. This is NOT a finding about the product: nothing was observed " +
        `to be wrong. Re-run with STORYTREE_UAT_DRIVE_TIMEOUT_MIN=${Math.ceil(args.ceilingMinutes * 2)} ` +
        "if the journey is genuinely this long, or bound the step that is eating the clock.",
    };
  }
  return {
    kind: "no-report",
    harness: true,
    reason:
      `the drive session ENDED after ${args.elapsedMinutes.toFixed(1)}m without a readable report, inside ` +
      `a ${args.ceilingMinutes}-min ceiling it never reached — so the SESSION ran out before the WALK did ` +
      "(the measured shape: a 40-min poll started inside an 11-min session). This is NOT a finding about " +
      "the product. Shorten the walk, or split the journey.",
  };
}

/** One `git status --porcelain` entry. */
export interface TreeEntry {
  /** The two-character status code, e.g. `??` (untracked), ` M` (modified), `A ` (added). */
  readonly code: string;
  readonly path: string;
}

/** PURE: parse `git status --porcelain` output. Rename entries keep their destination path. */
export function parsePorcelain(text: string): TreeEntry[] {
  const out: TreeEntry[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if (raw.trim().length === 0) continue;
    const code = raw.slice(0, 2);
    let p = raw.slice(2).trim();
    const arrow = p.indexOf(" -> ");
    if (arrow >= 0) p = p.slice(arrow + 4);
    if (p.startsWith('"') && p.endsWith('"') && p.length > 1) p = p.slice(1, -1);
    if (p.length > 0) out.push({ code, path: p });
  }
  return out;
}

/** What a drive left behind, split by what may be swept and what must never be. */
export interface DriveResidue {
  /** UNTRACKED paths that appeared during the drive — safe to remove: they did not exist before it. */
  readonly sweep: string[];
  /** Changes to TRACKED files that appeared during the drive. Never auto-removed; a real finding. */
  readonly blocking: string[];
}

/**
 * PURE: what did this drive leave in the tree?
 *
 * The drive already refuses to start against a dirty tree, so `before` is empty in practice — which
 * is exactly what makes the sweep safe rather than merely convenient: every path in `after` came into
 * existence DURING the drive, so removing the untracked ones destroys nothing that existed before the
 * run, and restores precisely the state the next drive's cleanliness check demands. `before` is a
 * parameter anyway, so the attribution is real rather than assumed.
 *
 * The split is load-bearing and the asymmetry is deliberate. An untracked screenshot is litter and is
 * swept. A modified TRACKED file is a drive that edited repository source, which the prompt forbids
 * outright — deleting that would destroy work AND hide a violation, so it is reported instead and the
 * run says so out loud.
 */
export function classifyDriveResidue(
  before: readonly TreeEntry[],
  after: readonly TreeEntry[],
): DriveResidue {
  const seen = new Set(before.map((e) => `${e.code} ${e.path}`));
  const priorPaths = new Set(before.map((e) => e.path));
  const sweep: string[] = [];
  const blocking: string[] = [];
  for (const e of after) {
    if (seen.has(`${e.code} ${e.path}`)) continue;
    if (e.code === "??" && !priorPaths.has(e.path)) sweep.push(e.path);
    else blocking.push(e.path);
  }
  return { sweep, blocking };
}

// -- The seam the isolation actually travels through --------------------------

/** Everything one drive needs in order to be a guest rather than the host. */
export interface DriveIsolation {
  /** The drive's OWN notice-board session id — never the launching session's. */
  readonly sessionId: string;
  /** The exclusive localhost port the runner reserved for this drive's own studio. */
  readonly surfacePort: number;
  /** The clean commit the drive is pinned to, and which its surface must be serving. */
  readonly commitSha: string;
  /** The out-of-tree directory for screenshots, traces and scratch. */
  readonly scratchDir: string;
  /** The wall-clock ceiling, in minutes, after which the harness kills the walk. */
  readonly ceilingMinutes: number;
  /** Absolute runner clock: product work and child waits are bounded by reportBy, not a guessed timer. */
  readonly startAt: string;
  readonly reportBy: string;
  readonly deadlineAt: string;
  /** Time reserved after reportBy for authoring the report and cleaning up child resources. */
  readonly reportCleanupBufferMinutes: number;
}

/**
 * PURE: the environment the drive child is spawned with.
 *
 * This is the ONLY route by which the isolation reaches the spawned session, which is why it is a
 * function rather than an object literal inside the runner: an in-process test cannot answer a
 * `spawnSync` child, so proving the runner ISOLATES the child means proving the ENV it hands over.
 * Here that is a pure assertion; in the runner it is one line that cannot drift.
 *
 * `STORYTREE_SESSION_ID` is explicitly DELETED, not merely overridden. It means "inherit the parent
 * session" wherever it is honoured, so a drive inheriting it from its launcher's env would re-collapse
 * the two identities through the other door while {@link UAT_DRIVE_SESSION_ENV} said they were apart.
 */
export function driveChildEnv(
  parentEnv: Readonly<Record<string, string | undefined>>,
  iso: DriveIsolation,
) {
  const env = { ...parentEnv } satisfies Record<string, string | undefined>;
  delete env["STORYTREE_SESSION_ID"];
  env[UAT_DRIVE_SESSION_ENV] = iso.sessionId;
  env[UAT_DRIVE_SURFACE_PORT_ENV] = String(iso.surfacePort);
  env[UAT_DRIVE_SCRATCH_ENV] = iso.scratchDir;
  // The pinned commit, so `uat-drive-surface.check.ts` knows what `code.startedAt` must equal without
  // being TOLD it on the command line. Passing it through the env rather than as an argument is what
  // keeps the driver from choosing its own expectation: a check whose standard the caller supplies
  // proves whatever the caller wanted, which is the instructed-not-enforced shape being closed here.
  env[UAT_DRIVE_COMMIT_ENV] = iso.commitSha;
  env[UAT_DRIVE_START_AT_ENV] = iso.startAt;
  env[UAT_DRIVE_REPORT_BY_ENV] = iso.reportBy;
  env[UAT_DRIVE_DEADLINE_AT_ENV] = iso.deadlineAt;
  return env satisfies Record<string, string | undefined>;
}

/**
 * The isolation clause, built per drive — the driver's half of what the harness has already done.
 *
 * The mechanical half stands whatever the model does: the identity is env-carried and the ledger
 * honours it, the port was probed free before the spawn, the scratch directory exists. This clause
 * exists so the driver does not fight the isolation out of ignorance — a driver that does not know it
 * has a reserved port discovers a sibling's server, which is failure 2 in full.
 */
export function uatDriveIsolationClause(iso: DriveIsolation): string {
  return [
    "Isolation — you are a GUEST in this checkout, not the session that owns it:",
    "",
    `  - Your notice-board session is "${iso.sessionId}", which is NOT the session that launched you.`,
    "    Never run `storytree noticeboard done` on this checkout's behalf, and never release, reclaim or",
    "    tidy a claim you did not take: the launching session is still working, and its claims are what",
    "    stop a sibling from writing the same capability underneath it.",
    `  - Your surface is http://localhost:${iso.surfacePort} and NOTHING is listening there yet — the port`,
    "    was probed free for you. START your own live-store Studio with EXACTLY this PowerShell command:",
    "",
    `      ${uatDriveStudioLaunchCommand(iso)}`,
    "",
    "    This supported package script preloads Studio's TypeScript runtime. Do not replace it with bare",
    "    `pnpm exec vite`: that bypasses the preload and is not the product launcher. Other worktrees run",
    "    their own studios on the well-known ports; those are not yours.",
    "  - Before you observe ANY surface, prove it is yours by RUNNING the ownership check — do not do",
    "    this by eye:",
    "",
    `      pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-surface.check.ts ${driveSurfaceUrl(iso.surfacePort)}`,
    "",
    "    It GETs /api/health for you, requires `store` to be \"pg\" and `code.startedAt` to be",
    `    ${iso.commitSha.slice(0, 10)} — the commit this drive is pinned to — and writes the result where the`,
    "    harness reads it. It exits non-zero if the surface is not yours. THE HARNESS REQUIRES THIS",
    "    EVIDENCE: a report claiming a surface with no passing attestation for it is refused, so skipping",
    "    the check does not save you time, it throws the whole drive away. Run it after your studio comes",
    "    up and BEFORE you observe anything, while the surface is still live — it cannot be run afterwards.",
    "    If it refuses, do not walk that surface: report `fail` naming what you found. A drive that reaches",
    "    no surface is honest; a drive that walks somebody else's is not.",
    `  - Write every screenshot, trace, log and scratch file under ${iso.scratchDir} — it is outside the`,
    "    repository and already exists. Anything you leave in the tree REFUSES the next drive.",
    "  - The runner owns this absolute timeline; do not replace it with a self-chosen duration:",
    `    - startAt: ${iso.startAt}`,
    `    - reportBy: ${iso.reportBy} - stop product work here; every wait and tool timeout must end by reportBy.`,
    `    - deadlineAt: ${iso.deadlineAt} - the harness kills the whole drive here.`,
    `  - The ${iso.ceilingMinutes}-minute ceiling reserves ${iso.reportCleanupBufferMinutes} minutes for report and cleanup`,
    "    after reportBy. At reportBy, stop waiting, reconcile exact process/result evidence, clean up",
    "    child resources, and emit the report. A walk that reaches deadlineAt reports nothing at all,",
    "    which is a harness failure that teaches nobody anything. If the journey cannot fit before",
    "    reportBy, stop early and report `fail` naming the authoritative boundary.",
  ].join("\n");
}

/** The one supported Studio launch command for this drive's reserved, live-store surface. */
function uatDriveStudioLaunchCommand(iso: DriveIsolation): string {
  return (
    "$env:STORYTREE_STUDIO_STORE='pg'; pnpm --filter studio dev --port " +
    `${iso.surfacePort} --strictPort --host 127.0.0.1`
  );
}
