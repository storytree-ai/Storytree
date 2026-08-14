import type { Store, StoredDoc } from "@storytree/storage-protocol";

import type { Envelope } from "./envelope.js";

/**
 * `storytree increment check <id>` — the MECHANICAL freshness check consumption begins with (ADR-0183
 * D2): git-log the paths the increment names since its `anchor.sha`; drift past threshold means RE-PLAN,
 * not repair. This is the proof tier's anchor / source-drift move
 * (`packages/orchestrator/src/proof/source-drift.ts`) applied to intentions: staleness is checked
 * mechanically at consumption, never assumed absent. It promotes the "stale would-be spec — git-log
 * before building" trap from a private memory warning to an enforced rule.
 *
 * Increments are live-only (ADR-0183 D2), so the real check runs with --pg; the git side reads the local
 * checkout (the consuming session's working tree is exactly the surface the increment will be executed
 * against).
 */

/**
 * The body fields whose prose can NAME paths (the KIND_SPECS increment table's markdown fields).
 *
 * TWO since ADR-0305 D4, where there were five. That is not a narrowing of what gets checked: the
 * four dropped headings (`decomposition`/`lanes`/`budgets`/`traps`) were concatenated with these and
 * mined identically — they were never read AS lanes or budgets — and migration 4 folds their prose,
 * backticks intact, into `body`. The convention the check rests on is unchanged and now rests on
 * `body` alone: a path is a BACKTICK-quoted token, and an increment naming none is VACUOUS.
 */
const INCREMENT_BODY_FIELDS = ["objective", "body"] as const;

/**
 * PURE: the repo paths an increment names — every backtick-quoted token in its body that looks like a
 * path (contains `/`, no spaces, not a flag, not a URL). The increment template's own guidance puts the
 * per-lane file surface in backtick fence hints, so extraction from backticks IS "the paths the
 * increment names". Deduped, in first-appearance order.
 */
export function extractIncrementPaths(doc: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of INCREMENT_BODY_FIELDS) {
    const value = doc[field];
    if (typeof value !== "string") continue;
    for (const m of value.matchAll(/`([^`\n]+)`/g)) {
      const token = (m[1] ?? "").trim();
      if (token === "" || seen.has(token)) continue;
      if (!token.includes("/")) continue; // a path names at least one directory level
      if (/\s/.test(token)) continue; // commands and prose, not paths
      if (token.startsWith("-")) continue; // a flag
      if (token.startsWith("/")) continue; // an API route / absolute path — repo paths are relative
      if (token.startsWith("#")) continue; // a hash route (#/library)
      if (token.startsWith("@")) continue; // an npm scope (@storytree/cli)
      if (token.includes("<")) continue; // a placeholder (stories/<id>)
      if (token.includes("://")) continue; // a URL
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/**
 * PURE: does a CLOSED sibling increment record `id` as already delivered?
 *
 * `tool-signal-gaps-arc` (friction `drifted-increment-may-be-already-delivered`). Drift is
 * anchor-vs-HEAD and nothing else, so it cannot tell "never built" from "built, then the ground
 * moved elsewhere" — and the check then printed `next: storytree agents planner`, actively pointing
 * at the wrong verb. Measured on `explorer-onboarding-plan-1`: 89 commits, 7/7 paths drifted, every
 * unit landed three weeks earlier via PR #775, and the DELIVERING entry's own outcome prose already
 * said *"Plan explorer-onboarding-plan-1 consumed"*. Only the terminal `closed` flip was missed.
 *
 * That hand-check — "read the arc's increment log and look for an entry naming this one as landed"
 * — is what this makes mechanical. It is deliberately the SIBLING PROSE and not the capability
 * `status:` field: a spec's `status:` carries no builtness signal (it is an authoring stage, not a
 * delivery record), so mining it would trade one misleading signal for another.
 *
 * Conservative by construction: a hit is REPORTED as evidence to check, never treated as proof. The
 * cost of a false positive is a session reading one closed increment before re-planning; the cost of
 * the false negative this replaces was a whole session re-planning finished work.
 */
export function deliveredBySibling(
  id: string,
  siblings: readonly StoredDoc[],
): { by: string; where: string } | null {
  for (const sib of siblings) {
    if (sib.id === id) continue;
    const doc = sib.doc as Record<string, unknown>;
    if (doc["status"] !== "closed") continue;
    // The three places a closing leg writes prose: the one-sentence lead, the long body, and the
    // closure note a non-PR closure is REQUIRED to carry (ADR-0305 D5).
    const outcome = doc["outcome"] as Record<string, unknown> | undefined;
    const fields: [string, unknown][] = [
      ["objective", doc["objective"]],
      ["body", doc["body"]],
      ["outcome.note", outcome?.["note"]],
    ];
    for (const [where, value] of fields) {
      if (typeof value === "string" && value.includes(id)) return { by: sib.id, where };
    }
  }
  return null;
}

/** An increment's arc id, with the `asset:` scheme prefix stripped (`arcRef` stores `asset:<arc-id>`). */
export function arcIdOf(doc: Record<string, unknown>): string | null {
  const ref = doc["arcRef"];
  if (typeof ref !== "string" || ref === "") return null;
  const at = ref.indexOf(":");
  return at === -1 ? ref : ref.slice(at + 1);
}

/**
 * The git seam: commits touching `path` since `sha` (exclusive), i.e. `git rev-list --count
 * <sha>..HEAD -- <path>`. Injected so the check is provable offline; throws when the sha is
 * unresolvable in this checkout.
 */
export type CountCommitsSince = (sha: string, path: string) => number;

export interface IncrementCheckDeps {
  store: Store;
  countCommits: CountCommitsSince;
  /** True when the live store is attached (--pg) — used only for honest offline hints. */
  pg: boolean;
}

/** An increment's anchor/status read defensively off the untyped stored doc. */
function incrementMeta(stored: StoredDoc): { sha: string | null; date: string; status: string } {
  const doc = stored.doc as Record<string, unknown>;
  const anchor = doc["anchor"] as Record<string, unknown> | undefined;
  const sha = anchor && typeof anchor["sha"] === "string" ? (anchor["sha"] as string) : null;
  const date = anchor && typeof anchor["date"] === "string" ? (anchor["date"] as string) : "?";
  const status = typeof doc["status"] === "string" ? (doc["status"] as string) : "proposal";
  return { sha, date, status };
}

export async function incrementCheck(
  deps: IncrementCheckDeps,
  id: string | undefined,
  opts: { threshold?: string | undefined },
): Promise<Envelope> {
  if (id === undefined) {
    return {
      ok: false,
      body: "increment check needs an id:  storytree increment check <id> --pg",
      next: ["storytree arc list --pg"],
    };
  }
  const stored = await deps.store.getDoc(id);
  if (!stored || stored.kind !== "increment") {
    return {
      ok: false,
      body: stored
        ? `"${id}" is a ${stored.kind}, not an increment.`
        : `no increment "${id}"${deps.pg ? "" : " in the OFFLINE seed — increments are live-ONLY (ADR-0183 D2); run with --pg"}.`,
      next: ["storytree arc list --pg", `storytree increment check ${id} --pg`],
    };
  }

  const { sha, date, status } = incrementMeta(stored);
  if (sha === null) {
    return {
      ok: false,
      body: `increment "${id}" carries no anchor.sha — an unanchored increment cannot be freshness-checked; re-plan it.`,
      next: ["storytree agents planner"],
    };
  }

  // An increment is executed ONCE (ADR-0183 D2's write-lock, renamed by ADR-0305 D2): once it is
  // `active` (execution started) or `closed` (terminal), it is never re-consumed, fresh or not.
  const spent = status === "active" || status === "closed";

  const threshold = Number(opts.threshold ?? "0");
  const paths = extractIncrementPaths(stored.doc as Record<string, unknown>);
  if (paths.length === 0) {
    return {
      ok: true,
      body: [
        `increment ${id}  [${status}]  anchor ${sha.slice(0, 9)} (${date})`,
        "",
        "names NO paths — the mechanical check has nothing to git-log. The freshness verdict is",
        "VACUOUS, not green: review it by eye, and prefer increments whose body carries backtick",
        "fence hints (`packages/...`) so consumption starts with a real check.",
        ...(spent ? ["", `⚠️  status is ${status} — a ${status} increment is never re-executed; re-plan.`] : []),
      ].join("\n"),
      next: [`storytree library artifact ${id} --pg`],
    };
  }

  let rows: { path: string; commits: number }[];
  try {
    rows = paths.map((p) => ({ path: p, commits: deps.countCommits(sha, p) }));
  } catch (e) {
    return {
      ok: false,
      body:
        `couldn't git-log since anchor ${sha.slice(0, 9)}: ${(e as Error).message}\n` +
        "is the anchor commit in this checkout? fetch first (git fetch origin main) — or the increment is stale enough to re-plan.",
      next: ["git fetch origin main", `storytree increment check ${id} --pg`],
    };
  }

  const touched = rows.filter((r) => r.commits > 0);
  const totalCommits = touched.reduce((n, r) => n + r.commits, 0);
  const drifted = totalCommits > threshold;

  // THE COMPLETION PROBE (`tool-signal-gaps-arc`). Drift alone cannot tell "never built" from
  // "built, then the ground moved", and the two have OPPOSITE remedies — re-plan vs close the
  // record. So before recommending anything, ask the two questions drift is silent about: is this
  // increment already spent, and does a closed sibling record it as delivered?
  const delivered = drifted ? await probeDelivery(deps.store, id, stored) : null;
  const alreadyDone = spent || delivered !== null;

  const width = Math.max(1, ...rows.map((r) => r.path.length));
  const lines = [
    `increment ${id}  [${status}]  anchor ${sha.slice(0, 9)} (${date})   threshold ${threshold} commit(s)`,
    "",
    ...rows.map((r) => `  ${r.path.padEnd(width)}  ${r.commits} commit(s) since anchor`),
    "",
    drifted
      ? `DRIFTED — ${totalCommits} commit(s) touched ${touched.length} of ${rows.length} named path(s) since the anchor.`
      : `FRESH — no named path moved past the threshold since the anchor.`,
  ];

  if (drifted && alreadyDone) {
    // The measured defect, inverted. Drift is anchor-vs-HEAD ONLY and says NOTHING about
    // completion, so a DRIFTED verdict over already-delivered work used to read as "re-plan this"
    // — the recommendation that cost a whole session re-planning work landed three weeks earlier.
    lines.push(
      "",
      "⚠️  BUT THIS MAY HAVE NOTHING LEFT TO BUILD — drift is anchor-vs-HEAD only and carries no",
      "    completion signal. What the drift verdict above cannot see:",
    );
    if (spent) {
      lines.push(
        `    · status is ${status} — a ${status} increment is never re-executed (ADR-0305 D2's write-lock).`,
      );
    }
    if (delivered) {
      lines.push(
        `    · closed sibling "${delivered.by}" names this increment in its ${delivered.where} —`,
        `      i.e. the increment log already records it as delivered.`,
      );
    }
    lines.push(
      "",
      "    VERIFY the objective against the current tree, then CLOSE the record rather than",
      "    re-planning it. Re-planning delivered work supersedes a plan nobody would ever run.",
    );
  } else if (drifted) {
    lines.push(
      "re-plan, not repair (ADR-0183 D2): supersede this increment; re-planning is cheap by construction.",
      "",
      "(no completion evidence found: status is open and no closed sibling on this arc names it.)",
    );
  } else {
    lines.push(
      spent
        ? `⚠️  but status is ${status} — a ${status} increment is never re-executed; re-plan.`
        : "consume it: take lanes via the claim machinery, execute, append the arc increment at landing.",
    );
  }

  return {
    ok: true,
    body: lines.join("\n"),
    next:
      drifted && alreadyDone
        ? [
            // NOT the planner: pointing a session at `agents planner` here is the misdirection this
            // arc closes. Closing an already-delivered increment is the honest terminal move.
            `storytree arc increment close ${id} --note "<why>" --pg`,
            ...(delivered ? [`storytree library artifact ${delivered.by} --pg`] : []),
            `storytree library artifact ${id} --pg`,
          ]
        : drifted
          ? [
              "storytree agents planner   (author the superseding increment)",
              `storytree library artifact ${id} --pg`,
            ]
          : [`storytree library artifact ${id} --pg`],
  };
}

/**
 * Ask the store whether a closed sibling on the same arc records `id` as delivered.
 *
 * Store-shaped so {@link deliveredBySibling} stays pure and provable without one. An increment with
 * no `arcRef` has no siblings to consult, which is a silent `null` rather than an error: the probe
 * only ever ADDS evidence to a verdict, so its absence must never change one.
 */
async function probeDelivery(
  store: Store,
  id: string,
  stored: StoredDoc,
): Promise<{ by: string; where: string } | null> {
  const arcId = arcIdOf(stored.doc as Record<string, unknown>);
  if (arcId === null) return null;
  const all = await store.queryDocs({ kind: "increment" });
  const siblings = all.filter((d) => arcIdOf(d.doc as Record<string, unknown>) === arcId);
  return deliveredBySibling(id, siblings);
}

export function incrementHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree increment — the ephemeral choreography tier (ADR-0183 D2): live-only, git-anchored, disposable.",
      "",
      "  storytree increment check <id> [--threshold <n>] --pg   the consumption-time freshness check:",
      "      git-log the paths the increment names (backtick fence hints in its body) since anchor.sha;",
      "      more than <n> commits (default 0) touching them → DRIFTED → re-plan, not repair.",
      "",
      "authoring/reading increments is the normal artifact surface: storytree library artifact <id> --pg.",
      "increments are live-only — offline this area sees nothing.",
    ].join("\n"),
    next: ["storytree increment check <id> --pg", "storytree arc list --pg"],
  };
}

/** Dispatch the `increment` area: `check <id>` | help. */
export async function incrementCommand(
  sub: string | undefined,
  third: string | undefined,
  opts: { threshold?: string | undefined },
  deps: IncrementCheckDeps,
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return incrementHelp();
  if (sub === "check") return incrementCheck(deps, third, opts);
  return {
    ok: false,
    body: `unknown increment command "${sub}". try: storytree increment check <id> --pg`,
    next: ["storytree increment check <id> --pg"],
  };
}
