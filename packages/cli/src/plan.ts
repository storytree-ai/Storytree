import type { Store, StoredDoc } from "@storytree/storage-protocol";

import type { Envelope } from "./envelope.js";

/**
 * `storytree plan check <id>` — the MECHANICAL freshness check consumption begins with (ADR-0183
 * D2): git-log the paths the plan names since its `anchor.sha`; drift past threshold means RE-PLAN,
 * not repair. This is the proof tier's anchor / source-drift move
 * (`packages/orchestrator/src/proof/source-drift.ts`) applied to intentions: staleness is checked
 * mechanically at consumption, never assumed absent. It promotes the "stale would-be spec — git-log
 * before building" trap from a private memory warning to an enforced rule.
 *
 * Plans are live-only (ADR-0183 D2), so the real check runs with --pg; the git side reads the local
 * checkout (the consuming session's working tree is exactly the surface the plan will be executed
 * against).
 */

/** The body fields whose prose can NAME paths (the KIND_SPECS plan table's markdown fields). */
const PLAN_BODY_FIELDS = ["objective", "decomposition", "lanes", "budgets", "traps"] as const;

/**
 * PURE: the repo paths a plan names — every backtick-quoted token in its body that looks like a
 * path (contains `/`, no spaces, not a flag, not a URL). The plan template's own guidance puts the
 * per-lane file surface in backtick fence hints, so extraction from backticks IS "the paths the
 * plan names". Deduped, in first-appearance order.
 */
export function extractPlanPaths(doc: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of PLAN_BODY_FIELDS) {
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
 * The git seam: commits touching `path` since `sha` (exclusive), i.e. `git rev-list --count
 * <sha>..HEAD -- <path>`. Injected so the check is provable offline; throws when the sha is
 * unresolvable in this checkout.
 */
export type CountCommitsSince = (sha: string, path: string) => number;

export interface PlanCheckDeps {
  store: Store;
  countCommits: CountCommitsSince;
  /** True when the live store is attached (--pg) — used only for honest offline hints. */
  pg: boolean;
}

/** A plan's anchor/status read defensively off the untyped stored doc. */
function planMeta(stored: StoredDoc): { sha: string | null; date: string; status: string } {
  const doc = stored.doc as Record<string, unknown>;
  const anchor = doc["anchor"] as Record<string, unknown> | undefined;
  const sha = anchor && typeof anchor["sha"] === "string" ? (anchor["sha"] as string) : null;
  const date = anchor && typeof anchor["date"] === "string" ? (anchor["date"] as string) : "?";
  const status = typeof doc["status"] === "string" ? (doc["status"] as string) : "draft";
  return { sha, date, status };
}

export async function planCheck(
  deps: PlanCheckDeps,
  id: string | undefined,
  opts: { threshold?: string | undefined },
): Promise<Envelope> {
  if (id === undefined) {
    return {
      ok: false,
      body: "plan check needs an id:  storytree plan check <id> --pg",
      next: ["storytree arc list --pg"],
    };
  }
  const stored = await deps.store.getDoc(id);
  if (!stored || stored.kind !== "plan") {
    return {
      ok: false,
      body: stored
        ? `"${id}" is a ${stored.kind}, not a plan.`
        : `no plan "${id}"${deps.pg ? "" : " in the OFFLINE seed — plans are live-ONLY (ADR-0183 D2); run with --pg"}.`,
      next: ["storytree arc list --pg", `storytree plan check ${id} --pg`],
    };
  }

  const { sha, date, status } = planMeta(stored);
  if (sha === null) {
    return {
      ok: false,
      body: `plan "${id}" carries no anchor.sha — an unanchored plan cannot be freshness-checked; re-plan it.`,
      next: ["storytree agents planner"],
    };
  }

  // A plan is consumed ONCE (ADR-0183 D2): a past-lifecycle plan is never re-consumed, fresh or not.
  const spent = status === "consumed" || status === "superseded" || status === "retired";

  const threshold = Number(opts.threshold ?? "0");
  const paths = extractPlanPaths(stored.doc as Record<string, unknown>);
  if (paths.length === 0) {
    return {
      ok: true,
      body: [
        `plan ${id}  [${status}]  anchor ${sha.slice(0, 9)} (${date})`,
        "",
        "names NO paths — the mechanical check has nothing to git-log. The freshness verdict is",
        "VACUOUS, not green: review the plan by eye, and prefer plans whose lanes carry backtick",
        "fence hints (`packages/...`) so consumption starts with a real check.",
        ...(spent ? ["", `⚠️  status is ${status} — a ${status} plan is never (re-)consumed; re-plan.`] : []),
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
        "is the anchor commit in this checkout? fetch first (git fetch origin main) — or the plan is stale enough to re-plan.",
      next: ["git fetch origin main", `storytree plan check ${id} --pg`],
    };
  }

  const touched = rows.filter((r) => r.commits > 0);
  const totalCommits = touched.reduce((n, r) => n + r.commits, 0);
  const drifted = totalCommits > threshold;
  const width = Math.max(1, ...rows.map((r) => r.path.length));
  const lines = [
    `plan ${id}  [${status}]  anchor ${sha.slice(0, 9)} (${date})   threshold ${threshold} commit(s)`,
    "",
    ...rows.map((r) => `  ${r.path.padEnd(width)}  ${r.commits} commit(s) since anchor`),
    "",
    drifted
      ? `DRIFTED — ${totalCommits} commit(s) touched ${touched.length} of ${rows.length} named path(s) since the anchor.`
      : `FRESH — no named path moved past the threshold since the anchor.`,
    drifted
      ? "re-plan, not repair (ADR-0183 D2): supersede this plan; re-planning is cheap by construction."
      : spent
        ? `⚠️  but status is ${status} — a ${status} plan is never (re-)consumed; re-plan.`
        : "consume it: take lanes via the claim machinery, execute, append the arc increment at landing.",
  ];
  return {
    ok: true,
    body: lines.join("\n"),
    next: drifted
      ? ["storytree agents planner   (author the superseding plan)", `storytree library artifact ${id} --pg`]
      : [`storytree library artifact ${id} --pg`],
  };
}

export function planHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree plan — the ephemeral choreography tier (ADR-0183 D2): live-only, git-anchored, disposable.",
      "",
      "  storytree plan check <id> [--threshold <n>] --pg   the consumption-time freshness check:",
      "      git-log the paths the plan names (backtick fence hints in its body) since anchor.sha;",
      "      more than <n> commits (default 0) touching them → DRIFTED → re-plan, not repair.",
      "",
      "authoring/reading plans is the normal artifact surface: storytree library artifact <id> --pg.",
      "plans never appear in the seed — offline this area sees nothing.",
    ].join("\n"),
    next: ["storytree plan check <id> --pg", "storytree arc list --pg"],
  };
}

/** Dispatch the `plan` area: `check <id>` | help. */
export async function planCommand(
  sub: string | undefined,
  third: string | undefined,
  opts: { threshold?: string | undefined },
  deps: PlanCheckDeps,
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return planHelp();
  if (sub === "check") return planCheck(deps, third, opts);
  return {
    ok: false,
    body: `unknown plan command "${sub}". try: storytree plan check <id> --pg`,
    next: ["storytree plan check <id> --pg"],
  };
}
