import type { Store } from "@storytree/storage-protocol";
import {
  computeBottlenecks,
  computeRecurrence,
  couplingChurn,
  DECOUPLING_REFERENCE,
  floorHealthReading,
  gitAbsorbed,
  gitCommits,
  type BottleneckReport,
  type ChurnReport,
  type CommitRec,
  type RecurrenceReport,
  type ReferenceRate,
} from "@storytree/drive";

import type { Envelope } from "./envelope.js";

/**
 * `storytree factory health` — the report-only factory-floor health instrument (ADR-0316,
 * `factory-floor-health-arc`).
 *
 * The RENDER only. Every figure is computed in `@storytree/drive`
 * (`factory-health.ts` / `coupling-churn.ts`) so the studio can serve the same numbers this prints
 * without importing the CLI (the `arc-rollup` precedent — `drive` never imports `cli`, so the arrow
 * only points one way, and two surfaces can never disagree about the floor).
 *
 * REPORT-ONLY (ADR-0316 D1). This is not a gate rung, it blocks no merge, and it has no threshold
 * that reds anything. ADR-0311 retired sixteen rungs for lack of evidence on 2026-08-06 and
 * `gate-machinery-audit-arc` closed on that finding the same day; a health trend by construction
 * reports a DIRECTION rather than a defect, so there is no threshold whose breach names a specific
 * wrong thing to fix — it could not clear that bar even in principle.
 *
 * REFUSAL IS A FIRST-CLASS OUTPUT (D2). Every figure prints the window and sample it was computed
 * over, and where a rate-sensitive figure's window is not comparable to its reference the report
 * names the condition that failed instead of printing a number that reads as progress.
 *
 * NEVER A VOLUME FIGURE (D3). Filing counts appear only under an explicit `context:` label. The
 * health figures are distinct causes and post-route recurrence.
 *
 * IT MEASURES, IT DOES NOT ADJUDICATE (D4). Nothing here writes, re-routes, discharges or closes
 * anything.
 */

const HEALTH_SUBS = ["recurrence", "bottlenecks", "churn"] as const;
type HealthSub = (typeof HEALTH_SUBS)[number];

export interface FactoryHealthOpts {
  /** Which question to answer; omitted answers all three. */
  question?: string | undefined;
  /** Window bounds (ISO date or datetime). */
  from?: string | undefined;
  to?: string | undefined;
  /** Override the dispatch-rate reference a rate-sensitive ratio is read against. */
  landingsPerDay?: string | undefined;
  /** The trunk ref the churn walk reads. */
  ref?: string | undefined;
  /** Repo root for the git walk. */
  repoRoot: string;
  /** Injected for tests — the real reader is `gitCommits`. */
  commits?: ((ref: string) => CommitRec[]) | undefined;
  absorbed?: ((commit: CommitRec) => string[]) | undefined;
  /** ISO now, for the default churn window. */
  now: string;
}

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** Wrap a long stated rule to a readable width — the rule must be READ, not merely present. */
function wrap(text: string, width = 96, indent = "  "): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length > 0 && line.length + 1 + word.length > width) {
      lines.push(indent + line);
      line = word;
    } else line = line.length === 0 ? word : `${line} ${word}`;
  }
  if (line.length > 0) lines.push(indent + line);
  return lines;
}

function windowLine(window: { from?: string | undefined; to?: string | undefined }): string {
  const from = window.from ?? "(all history)";
  const to = window.to ?? "(now)";
  return `window: ${from} -> ${to}`;
}

// ---------------------------------------------------------------------------
// Question 1 — recurrence since route
// ---------------------------------------------------------------------------

/**
 * How to READ a post-route reinforcement on this route. The split is the entry's own design
 * constraint — "an instrument that reports one blended rate has not answered the question" — and the
 * two non-tripwire routes mean DIFFERENT things, so they do not share a line.
 */
function routeReading(route: string, tripwire: boolean): { mark: string; note?: string } {
  if (tripwire) {
    return {
      mark: "TRIPWIRE",
      note: "guidance that renders into every session landed, and the behaviour recurred anyway (ADR-0168's named tripwire).",
    };
  }
  if (route === "tool") {
    return {
      mark: "expected",
      note: "the routed capability is UNBUILT, so the trap keeps firing until it is built — expected, not a failed route.",
    };
  }
  if (route === "nothing") {
    return {
      mark: "archived",
      note: "the adjudicator recorded NO ACTION; a later reinforcement is testimony the archive may be worth revisiting, not a failed remedy.",
    };
  }
  return { mark: "unclassified" };
}

function renderRecurrence(report: RecurrenceReport): string[] {
  const lines: string[] = [
    "## 1. IS RECURRENCE BEING EXTINGUISHED?  (reinforcements since route, split BY ROUTE)",
    "",
    `  ${windowLine(report.window)}`,
    `  sample: ${report.sample.items} friction item(s), ${report.sample.routed} routed, over ${report.sample.events} library event(s)`,
    "",
  ];
  if (report.byRoute.length === 0) {
    lines.push("  (no routed item in this window — nothing to report is a first-class outcome)", "");
    return lines;
  }
  for (const row of report.byRoute) {
    const { mark, note } = routeReading(row.route, row.tripwire);
    lines.push(
      `  ${row.route.padEnd(14)} [${mark}]  ${row.postRoute} post-route reinforcement(s) across ${row.itemsRecurring} of ${row.itemsRouted} item(s)`,
    );
    if (note !== undefined && row.postRoute > 0) lines.push(`                   ${note}`);
    for (const offender of row.offenders.slice(0, 8)) {
      lines.push(`      ×${String(offender.postRoute).padStart(2)}  ${offender.id}  (routed ${offender.routedAt.slice(0, 10)})`);
    }
    if (row.offenders.length > 8) lines.push(`      … ${row.offenders.length - 8} more`);
    lines.push("");
  }
  if (report.multiSpan.length > 0) {
    lines.push(
      `  ${report.multiSpan.length} item(s) were RE-ROUTED; their reinforcements are attributed to the route standing at the time:`,
      `    ${report.multiSpan.slice(0, 6).join(", ")}${report.multiSpan.length > 6 ? ", …" : ""}`,
      "",
    );
  }
  lines.push("  attribution rule:", ...wrap(report.attributionRule, 96, "    "), "");
  return lines;
}

// ---------------------------------------------------------------------------
// Question 3 — distinct bottlenecks
// ---------------------------------------------------------------------------

function renderBottlenecks(report: BottleneckReport): string[] {
  const lines: string[] = [
    "## 2. HOW MANY DISTINCT BOTTLENECKS ARE LIVE?  (distinct causes, NEVER filing volume)",
    "",
    `  ${report.sample.causes} distinct live cause(s) — a CEILING, from ${report.sample.filings} filing(s);`,
    `  ${report.sample.collapsed} filing(s) absorbed by an authored join edge, ${report.sample.unjoined} carry none.`,
    "",
    "  population:",
    ...wrap(report.population, 96, "    "),
    "",
    "  collapsing rule:",
    ...wrap(report.rule, 96, "    "),
    "",
  ];
  const joined = report.causes.filter((c) => c.members.length > 1);
  if (joined.length > 0) {
    lines.push("  causes spanning more than one filing (the collapse, made auditable):");
    for (const cause of joined) {
      lines.push(`    ${cause.key}  [${cause.routes.join(", ")}]  ${cause.members.length} filings`);
      for (const member of cause.members.filter((m) => m !== cause.key)) lines.push(`      + ${member}`);
      lines.push(`      joined by: ${cause.joinedBy.join(", ")}`);
    }
    lines.push("");
  }
  const recurring = report.causes.filter((c) => c.tripwireRecurrences > 0);
  if (recurring.length > 0) {
    lines.push("  live causes that RECURRED after their remedy's guidance landed (the tripwire):");
    for (const cause of recurring.slice(0, 8)) {
      lines.push(`    ×${String(cause.tripwireRecurrences).padStart(2)}  ${cause.key}  [${cause.routes.join(", ")}]`);
    }
    lines.push("");
  }
  lines.push(
    `  context (NOT a health figure — ADR-0316 D3): ${report.context.allFilings} filings all-time, ` +
      `${report.context.archived} archived, ${report.context.discharged} discharged.`,
    "",
  );
  return lines;
}

// ---------------------------------------------------------------------------
// Question 2 — coupling churn
// ---------------------------------------------------------------------------

function renderChurn(report: ChurnReport): string[] {
  const lines: string[] = [
    "## 3. IS COUPLING CHURN FALLING?  (re-sync churn per landing, beside its dispatch rate)",
    "",
    `  ${windowLine(report.window)}`,
    `  sample: ${report.sample.resyncs} re-sync(s), ${report.sample.landings} landing(s), ` +
      `${report.sample.absorbedChanges} absorbed file-change(s) ` +
      `(${report.sample.classified} in a named channel, ${report.sample.unclassified} outside one, ${report.sample.excluded} excluded)`,
    `  dispatch rate: ${report.dispatch.landingsPerDay.toFixed(1)} landings/day · ` +
      `${report.dispatch.branchesPerDay.toFixed(1)} branches/day over ${report.dispatch.days.toFixed(2)} day(s)`,
    "",
    `  per-landing absorbed churn: ${report.perLandingAbsorbedChurn.toFixed(1)}   (rate-normalised by construction)`,
    "",
  ];

  if (report.resyncsPerLanding !== undefined) {
    lines.push(
      `  re-syncs per landing: ${report.resyncsPerLanding.toFixed(2)}   ` +
        `(window is ${pct(report.comparability.ratioToReference)} of the reference — comparable)`,
      `    reference: ${report.comparability.reference.label}`,
      "",
    );
  } else if (report.comparability.comparable === false) {
    lines.push(
      "  re-syncs per landing: REFUSED",
      `    failed: ${report.comparability.failed}`,
      ...wrap(report.comparability.refusal, 96, "    "),
      `    reference: ${report.comparability.reference.label}`,
      "",
    );
  }

  if (report.channels.length > 0) {
    lines.push("  channel composition of absorbed churn (share of the CLASSIFIED files above):");
    for (const channel of report.channels) {
      lines.push(`    ${channel.channel.padEnd(18)} ${pct(channel.share).padStart(6)}  (${channel.changes})`);
    }
    lines.push("");
  }
  if (report.hottest.length > 0) {
    lines.push("  hottest individual objects (re-syncs that absorbed each):");
    for (const hot of report.hottest.slice(0, 6)) {
      lines.push(`    ${String(hot.resyncs).padStart(3)}/${report.sample.resyncs}  ${pct(hot.share).padStart(6)}  ${hot.path}`);
    }
    lines.push("");
  }
  for (const exclusion of report.exclusions) {
    lines.push(`  excluded: ${exclusion.prefix} — ${exclusion.why}`);
  }
  lines.push(
    "  BLIND SPOT, stated: claim-queue delay is invisible here — a session queued behind a sibling's",
    "  claim runs no extra re-sync, so it costs an hour and moves nothing above. Read it with",
    "  `storytree noticeboard history`.",
    "",
  );
  return lines;
}

// ---------------------------------------------------------------------------
// The verb
// ---------------------------------------------------------------------------

/** Default churn window: the last 7 days, so a bare invocation reports something honest. */
function defaultChurnWindow(now: string): { from: string; to: string } {
  const to = new Date(now);
  const from = new Date(to.getTime() - 7 * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function factoryHealth(store: Store, opts: FactoryHealthOpts): Promise<Envelope> {
  const question = opts.question;
  if (question !== undefined && !HEALTH_SUBS.includes(question as HealthSub)) {
    return {
      ok: false,
      body: `unknown factory health question "${question}". try: ${HEALTH_SUBS.join(" | ")} (or omit it for all three).`,
      next: ["storytree factory health", "storytree factory --help"],
    };
  }

  const wantRecurrence = question === undefined || question === "recurrence";
  const wantBottlenecks = question === undefined || question === "bottlenecks";
  const wantChurn = question === undefined || question === "churn";

  const lines: string[] = [
    "FACTORY-FLOOR HEALTH — report-only (ADR-0316 D1: not a gate rung, blocks no merge).",
    "Every figure carries the window and sample it was computed over; where a window cannot support a",
    "figure the instrument names the condition that failed instead of printing a number (D2).",
    "",
  ];

  // Questions 1 and 3 share one read of the corpus — two figures on one screen that disagreed about
  // the same items would be worse than one.
  let recurrence: RecurrenceReport | undefined;
  let bottlenecks: BottleneckReport | undefined;
  if (wantRecurrence || wantBottlenecks) {
    const docs = await store.queryDocs({ kind: "friction" });
    // The Store seam's `readEvents` filters by id only, so this reads the whole log and narrows in
    // memory. One query for a report verb; a kind filter belongs on the seam, not in a second reader.
    const events = await store.readEvents();
    recurrence = computeRecurrence({
      docs,
      events,
      ...(opts.from !== undefined || opts.to !== undefined
        ? { window: { from: opts.from, to: opts.to } }
        : {}),
    });
    if (wantBottlenecks) {
      const increments = await store.queryDocs({ kind: "increment" });
      bottlenecks = computeBottlenecks({ docs, increments, recurrence });
    }
  }

  if (wantRecurrence && recurrence !== undefined) lines.push(...renderRecurrence(recurrence));
  if (wantBottlenecks && bottlenecks !== undefined) lines.push(...renderBottlenecks(bottlenecks));

  if (wantChurn) {
    const window =
      opts.from !== undefined && opts.to !== undefined
        ? { from: new Date(opts.from).toISOString(), to: new Date(opts.to).toISOString() }
        : defaultChurnWindow(opts.now);
    const ref = opts.ref ?? "origin/main";
    const reference: ReferenceRate | undefined =
      opts.landingsPerDay === undefined
        ? undefined
        : { label: `caller-supplied (${opts.landingsPerDay} landings/day)`, landingsPerDay: Number(opts.landingsPerDay) };
    try {
      const commits = (opts.commits ?? ((r) => gitCommits(opts.repoRoot, r)))(ref);
      const report = couplingChurn({
        commits,
        absorbedFor: opts.absorbed ?? ((commit) => gitAbsorbed(opts.repoRoot, commit)),
        window,
        ...(reference !== undefined ? { reference } : {}),
      });
      lines.push(...renderChurn(report));
    } catch (err) {
      // A missing ref is the honest answer "I cannot read this history", not a zeroed report — a
      // shallow clone (CI checks out at fetch-depth 2) has no `origin/main` history at all.
      lines.push(
        "## 3. IS COUPLING CHURN FALLING?",
        "",
        `  REFUSED: cannot read the trunk history at \`${ref}\` — ${(err as Error).message.split("\n")[0]}`,
        "  A shallow clone carries no trunk history; run this in a full checkout, or pass --ref <ref>.",
        "",
      );
    }
  }

  if (recurrence !== undefined && bottlenecks !== undefined) {
    const reading = floorHealthReading({ recurrence, bottlenecks });
    lines.push(
      "## THE READING  (what ADR-0314 D7's floor-health strip consumes — ADR-0316 D5)",
      "",
      reading.loudest === undefined
        ? "  loudest live cause: NONE — no live distinct cause has recurred after its remedy's guidance landed."
        : `  loudest live cause: ${reading.loudest.cause} — recurred ×${reading.loudest.recurrences} after its \`${reading.loudest.route}\` route` +
          (reading.loudest.members.length > 1 ? ` (${reading.loudest.members.length} filings, one cause)` : ""),
      `  ${reading.distinctCauses} distinct live cause(s) (ceiling; ${reading.unjoined} unjoined).`,
      "",
      "  The loud/quiet THRESHOLD is not set here. ADR-0314 D7 says the strip goes loud when a shared",
      "  bottleneck recurs but leaves the number unstated, and ADR-0316 D4 keeps this instrument to",
      "  measuring — so the figure above is reported and the band that reads it decides.",
      "",
    );
  }

  return {
    ok: true,
    body: lines.join("\n").trimEnd(),
    next: [
      "storytree factory health recurrence   (question 1 alone)",
      "storytree factory health bottlenecks  (question 2 alone)",
      "storytree factory health churn --from <date> --to <date>   (question 3 over a chosen window)",
      "storytree arc show factory-floor-health-arc --pg   (what this instrument is for)",
    ],
  };
}

/** `storytree factory --help`. */
export function factoryHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree factory — is the factory getting better, and can a command say so? (ADR-0316)",
      "",
      "  storytree factory health [recurrence|bottlenecks|churn]",
      "        [--from <date>] [--to <date>] [--landings-per-day <n>] [--ref <git-ref>]",
      "",
      "        1. recurrence   reinforcements SINCE ROUTE, split by route — ADR-0168's own success",
      "                        signal. A post-route reinforcement on a `guardrail` is the tripwire;",
      "                        the same shape on an unbuilt `tool` item is expected and means nothing,",
      "                        so the two are never pooled.",
      "        2. bottlenecks  un-discharged routed friction counted as DISTINCT CAUSES, with the",
      "                        collapsing rule stated in the output. Filing volume is never a health",
      "                        figure — that is the error that closed the ancestor arc.",
      "        3. churn        re-syncs per landing, absorbed churn per re-sync and its channel",
      "                        composition, walked from git. ALWAYS reported beside the window's",
      "                        dispatch rate, and the rate-sensitive ratio is REFUSED where the window",
      "                        is not comparable to its reference — a quiet week must not look like a win.",
      "",
      "        --from/--to     the window (ISO date or datetime). Questions 1 and 2 bound reinforcements",
      "                        by date; question 3 defaults to the last 7 days.",
      "        --landings-per-day  override the dispatch-rate reference the ratio is read against",
      `                        (default: ${DECOUPLING_REFERENCE.landingsPerDay}/day — ${DECOUPLING_REFERENCE.label}).`,
      "        --ref           the trunk ref the churn walk reads (default origin/main).",
      "",
      "REPORT-ONLY (ADR-0316 D1): not a gate rung, blocks no merge, no threshold reds anything.",
      "It MEASURES and does not ADJUDICATE (D4) — what a signal MEANS stays with the",
      "graduation-synthesist, each arc's close condition, and the owner.",
    ].join("\n"),
    next: [
      "storytree factory health",
      "storytree arc show factory-floor-health-arc --pg",
      "storytree library artifact recurrence-extinction-instrument",
    ],
  };
}
