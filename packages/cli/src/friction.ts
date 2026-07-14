/**
 * The `storytree friction` capture surface (ADR-0168 inc 2) — the employees' upward voice channel.
 *
 * A session files WHAT FOUGHT IT as a `friction` Library artifact (the 10th kind, landed inc 1); a
 * dedicated adjudicator (the un-parked `graduation-synthesist`; the librarian-curator holds the chair
 * until it is built) later routes each item through the justification gate. This module owns the four
 * capture/adjudication verbs and the offline inbox fallback:
 *
 *   - `new`        file a friction item, fail-closed (ADR-0168 D3): evidence present AND concrete, ≤3
 *                  per branch/date (the ReasoningBank cap-3 fence), `references` resolve, NO route at
 *                  capture (capture never classifies — route is set only at adjudication).
 *   - `migrate`    the D2 migrate step — TRANSPORT, not capture: file the `docs/friction-inbox/`
 *                  staged items live with their ORIGINAL provenance (attribution and worklist age
 *                  survive), no cap-3 (the cap was paid at capture, on the item's own branch/date),
 *                  migrate-only (never overwrites a live item); deletes each staging file it migrates.
 *   - `reinforce`  append a `reinforcedBy` entry (own evidence, required) to an EXISTING item —
 *                  recurrence reinforces, never duplicates (`edit-first-curation` applied to friction).
 *   - `route`      the adjudication write: set `route` (the closed enum) + `routeReason`.
 *   - `list`       the worklist view: derived lifecycle (open → archived, ADR-0196), age, reinforcements.
 *
 * OFFLINE/REMOTE FALLBACK (ADR-0168 D2, the shelf's surviving role): a session that cannot reach the
 * live store (remote 443-only, offline docs session) files `new` to a `docs/friction-inbox/` staging
 * file instead — the SAME validated doc JSON, so the adjudicator/librarian files it live later via
 * `friction migrate` (migrate-only, mirroring `sync-corpus`). The staging dir is schema-validated in
 * `pnpm gate` / `pnpm -r test` (offline-checkable) by {@link validateInboxDir}, fail-closed on a
 * malformed file.
 *
 * Every seam (branch, clock, the inbox + docs dirs) is injected via {@link FrictionContext} so the
 * whole surface is offline-testable without git, a real clock, or the real repo tree.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { upcastAndValidate, Friction, FrictionRoute } from "@storytree/library";

import type { Envelope } from "./envelope.js";
import { lifecycleOf, type FrictionLifecycle } from "./friction-lifecycle.js";

/** The narrowed write surface the friction verbs need (a structural subset of `RunDeps`). */
export interface FrictionDeps {
  readonly store: Store;
  /** True for the live --pg store; capture falls back to the inbox when false (ADR-0168 D2). */
  readonly writable?: boolean;
  /** Recorded as the event `actor` on writes; defaults to "cli". */
  readonly actor?: string;
}

/** The injected capture context — every non-deterministic input, so the surface is offline-testable. */
export interface FrictionContext {
  /** The session branch — the `provenance.branch` stamp AND the cap-3 key. */
  readonly branch: string;
  /** An ISO timestamp: stamps createdAt/updatedAt; `provenance.date` is its date part (YYYY-MM-DD). */
  readonly now: string;
  /** The `docs/friction-inbox/` staging dir (offline capture + the cap-3 count offline). */
  readonly inboxDir: string;
  /** The `docs/` dir, for resolving `doc:` references. */
  readonly docsDir: string;
}

/** The cap on friction items one branch may file on one date (ADR-0168: ReasoningBank cap-3). */
const CAP_PER_BRANCH_DATE = 3;

/**
 * The structural evidence floor (ADR-0168 D3): does the text carry at least one CONCRETE citation
 * marker — a path, a PR/issue number, a commit SHA, an error/exit token, a quoted excerpt, a command,
 * or a backtick span? Deliberately DUMB about truth: it refuses vague prose ("it was slow and
 * annoying") but waves through anything that *looks* like a real citation. The adjudicator's question
 * 1 ("does the evidence SUPPORT the claim?") is the semantic check; this is only the floor.
 */
const CONCRETE_EVIDENCE_PATTERNS: readonly RegExp[] = [
  /`[^`]+`/, // a backtick code / command / output span
  /\b[\w-]+\.(ts|tsx|js|mjs|cjs|json|md|sql|sh|yml|yaml|css|txt|tf|mts|cts)\b/, // a file with a known extension
  /\b(packages|apps|docs|scripts|infra|stories|legacy|web)\/[\w./-]+/, // a repo path segment
  /#\d+/, // a PR / issue number
  /\b[0-9a-f]{7,40}\b/, // a commit SHA (lowercase hex, 7–40)
  /\b(Error|Exception|Traceback|TS\d{2,}|ERR_[A-Z][A-Z_]+|exit code|non-zero|refused|assert(?:ion)?|FAIL(?:ED)?|throws?)\b/,
  /["'][^"']{3,}["']/, // a quoted excerpt
  /\b(pnpm|npx|node|git|storytree|tsx|gh)\s+[\w-]/, // a command invocation
];

/** True when `text` clears the structural evidence floor (ADR-0168 D3). Exported for direct testing. */
export function hasConcreteEvidence(text: string): boolean {
  return CONCRETE_EVIDENCE_PATTERNS.some((re) => re.test(text));
}

// The lifecycle projection is shared with the drain-ceiling gate (`friction-drain.ts`) so the two
// cannot drift — see `./friction-lifecycle.ts`. Re-exported here so existing consumers keep importing
// it from `./friction.js`.
export { lifecycleOf, type FrictionLifecycle };

/** Read the `route` string off a stored friction doc, or undefined. */
function routeOf(doc: Record<string, unknown>): string | undefined {
  return typeof doc["route"] === "string" ? (doc["route"] as string) : undefined;
}

/** Read `provenance {branch, date}` off a (possibly raw) friction doc; missing parts are undefined. */
function provenanceOf(doc: Record<string, unknown>): { branch?: string; date?: string } {
  const p = doc["provenance"];
  if (p !== null && typeof p === "object") {
    const o = p as Record<string, unknown>;
    return {
      ...(typeof o["branch"] === "string" ? { branch: o["branch"] } : {}),
      ...(typeof o["date"] === "string" ? { date: o["date"] } : {}),
    };
  }
  return {};
}

/** Count of `reinforcedBy` entries on a friction doc (0 when absent). */
function reinforcementCount(doc: Record<string, unknown>): number {
  const r = doc["reinforcedBy"];
  return Array.isArray(r) ? r.length : 0;
}

/** Read a top-level string field off a doc, or "". */
function strField(doc: Record<string, unknown>, key: string): string {
  const v = doc[key];
  return typeof v === "string" ? v : "";
}

/** The raw JSON docs staged in the inbox dir (tolerant parse — unparseable files are the gate's job). */
function readInboxDocs(dir: string): Array<Record<string, unknown>> {
  if (!existsSync(dir)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
      if (parsed !== null && typeof parsed === "object") out.push(parsed as Record<string, unknown>);
    } catch {
      // An unparseable staging file is caught (fail-closed) by validateInboxDir, not counted here.
    }
  }
  return out;
}

/**
 * Validate every `*.json` in a `docs/friction-inbox/` staging dir against the {@link Friction} schema
 * (ADR-0168 D3, the offline-checkable gate). Returns one `{ file, error }` per OFFENDING file (bad
 * JSON, fails the schema, or not `kind: friction`); an empty array means the dir is clean (or absent).
 * Fail-CLOSED: the gate test asserts this is empty for the committed dir, so a malformed staging file
 * blocks the merge. Pure over a directory path — the same function backs the gate test and the
 * malformed-file unit test.
 */
export function validateInboxDir(dir: string): Array<{ file: string; error: string }> {
  if (!existsSync(dir)) return [];
  const offenders: Array<{ file: string; error: string }> = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(dir, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(full, "utf8"));
    } catch (e) {
      offenders.push({ file: name, error: `invalid JSON: ${(e as Error).message}` });
      continue;
    }
    let valid: unknown;
    try {
      valid = upcastAndValidate(parsed);
    } catch (e) {
      offenders.push({ file: name, error: `fails the schema: ${(e as Error).message}` });
      continue;
    }
    if ((valid as Record<string, unknown>)["kind"] !== "friction") {
      offenders.push({ file: name, error: `not a friction item (kind: ${String((valid as Record<string, unknown>)["kind"])})` });
    }
  }
  return offenders;
}

// ---------------------------------------------------------------------------
// friction new — the capture write (live store, or the inbox fallback offline)
// ---------------------------------------------------------------------------

/**
 * `storytree friction new --file <doc.json> [--pg] [--source retro|run-analysis]` — file a friction
 * item. Same doc-in write path as `library artifact new`, plus the ADR-0168 D3 fail-closed fences and
 * the D2 offline inbox fallback. The CLI STAMPS the capture fields (`kind`, `provenance`,
 * createdAt/updatedAt) so the author supplies only the substance (id/title/description + statement/
 * evidence/impact + optional references). A supplied `route` is REFUSED — capture never classifies.
 */
export async function newFriction(
  deps: FrictionDeps,
  opts: { json?: string | undefined; file?: string | undefined; source?: string | undefined },
  ctx: FrictionContext,
): Promise<Envelope> {
  // 0) A --file under docs/friction-inbox/ is a STAGED capture, not a new one — filing it through
  //    `new` would RE-STAMP provenance (mis-attributing it to this session, resetting its worklist
  //    age) and charge this session's cap-3. Transport is `friction migrate` (ADR-0168 D2).
  if (opts.file !== undefined && isInsideDir(opts.file, ctx.inboxDir)) {
    return {
      ok: false,
      body: [
        `${opts.file} is a staged inbox item — \`friction new\` is CAPTURE: it would re-stamp the item's`,
        "provenance with THIS session's branch/date (mis-attributing it, resetting its worklist age) and",
        "count it against this session's cap-3. Migrate it instead (provenance preserved, no cap):",
      ].join("\n"),
      next: ["storytree friction migrate --pg   (sweep the whole inbox)", `storytree friction migrate --file ${opts.file} --pg`],
    };
  }

  // 1) Read the doc (--json inline or --file path), mirroring newArtifact.
  let raw = opts.json;
  if (raw === undefined && opts.file !== undefined) {
    try {
      raw = await readFile(opts.file, "utf8");
    } catch (e) {
      return { ok: false, body: `could not read --file ${opts.file}: ${(e as Error).message}`, next: ["storytree friction --help"] };
    }
  }
  if (raw === undefined) {
    return {
      ok: false,
      body: "friction new needs the item as JSON: --file <doc.json> (or --json '<doc>').\nSupply id/title/description + statement/evidence/impact (+ optional references); the CLI stamps provenance.",
      next: ["storytree friction --help", "storytree library artifact template-friction   (the shape)"],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, body: `invalid JSON: ${(e as Error).message}`, next: ["storytree friction --help"] };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { ok: false, body: "the friction doc must be a JSON object.", next: ["storytree friction --help"] };
  }
  const doc = { ...(parsed as Record<string, unknown>) };

  // 2) Capture never classifies (ADR-0168 D2/D3): a route/routeReason at capture is refused; a
  //    reinforcedBy at capture is the `reinforce` verb's job (recurrence reinforces, never mints).
  if (doc["route"] !== undefined || doc["routeReason"] !== undefined) {
    return {
      ok: false,
      body: "capture never classifies — `route`/`routeReason` are set only at adjudication (ADR-0168 D2).\nFile the item WITHOUT a route; the adjudicator routes it later via `storytree friction route`.",
      next: ["storytree friction new --file <doc.json> --pg"],
    };
  }
  if (doc["reinforcedBy"] !== undefined) {
    return {
      ok: false,
      body: "a new item carries no reinforcements — recurrence reinforces an EXISTING item (ADR-0168 D2).\nIf this re-hits a filed trap, use `storytree friction reinforce <id> --evidence ...` instead.",
      next: ["storytree friction list"],
    };
  }

  // 3) Stamp the capture fields the CLI owns: kind, provenance {branch, date, source}, timestamps.
  const source = opts.source ?? "retro";
  if (source !== "retro" && source !== "run-analysis") {
    return { ok: false, body: `bad --source "${source}" — use retro (the session retro) or run-analysis (friction-analyst).`, next: ["storytree friction --help"] };
  }
  const date = ctx.now.slice(0, 10);
  doc["kind"] = "friction";
  doc["provenance"] = { branch: ctx.branch, date, source };
  doc["createdAt"] = typeof doc["createdAt"] === "string" ? doc["createdAt"] : ctx.now;
  doc["updatedAt"] = ctx.now;

  // 4) Validate the shape (Friction schema: required statement/evidence/impact, .strict()). This
  //    catches an evidence-FREE item (Markdown is .min(1)) before the concreteness floor below.
  let valid: Record<string, unknown>;
  try {
    valid = upcastAndValidate(doc) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, body: `friction item failed validation:\n${(e as Error).message}`, next: ["storytree library artifact template-friction"] };
  }
  if (valid["kind"] !== "friction") {
    return { ok: false, body: `this is the friction surface — the doc validated as "${String(valid["kind"])}". File a friction item (kind: friction).`, next: ["storytree friction --help"] };
  }
  const id = strField(valid, "id");
  if (id === "") return { ok: false, body: "the friction doc has no id.", next: ["storytree friction --help"] };

  // 5) The evidence floor (ADR-0168 D3): present (schema) AND concrete (structural). Vague prose refused.
  if (!hasConcreteEvidence(strField(valid, "evidence"))) {
    return {
      ok: false,
      body: "evidence must be CONCRETE (ADR-0168 D3) — a path, a PR#, a commit SHA, a command + output,\nan error/exit token, or a quoted excerpt. Vague prose is refused fail-closed. What you filed:\n" +
        `  evidence: ${strField(valid, "evidence")}`,
      next: ["storytree library artifact template-friction   (an example)"],
    };
  }

  // 6) The cap-3 fence (ADR-0168 D3): >3 items per branch/date refused. Counted in whichever store
  //    the write targets — live when --pg, the inbox otherwise.
  const priorForBranchDate = deps.writable === true
    ? (await deps.store.queryDocs({ kind: "friction" }))
        .map((d) => (typeof d.doc === "object" && d.doc !== null ? (d.doc as Record<string, unknown>) : {}))
        .filter((d) => { const p = provenanceOf(d); return p.branch === ctx.branch && p.date === date; })
    : readInboxDocs(ctx.inboxDir).filter((d) => { const p = provenanceOf(d); return p.branch === ctx.branch && p.date === date; });
  if (priorForBranchDate.length >= CAP_PER_BRANCH_DATE) {
    return {
      ok: false,
      body: `cap reached — ${CAP_PER_BRANCH_DATE} friction items already filed on "${ctx.branch}" for ${date} (ADR-0168 D3: the retro cap).\nDistil to the ${CAP_PER_BRANCH_DATE} that fought you hardest, or reinforce an existing item instead of filing a fourth.`,
      next: ["storytree friction list", "storytree friction reinforce <id> --evidence ... --pg"],
    };
  }

  // 7) References must resolve (ADR-0168 D3): asset:<id> against the corpus, doc:<path> against docs/.
  const unresolved = await unresolvedReferences(valid, deps.store, ctx.docsDir);
  if (unresolved.length > 0) {
    return {
      ok: false,
      body: `these references do not resolve (ADR-0168 D3 — every implicated artifact must exist):\n${unresolved.map((r) => `  ✗ ${r}`).join("\n")}`,
      next: ["storytree library artifact list <category>   (find the real id)"],
    };
  }

  // 8) Write — live store when --pg, else the inbox staging file (ADR-0168 D2 offline fallback).
  if (deps.writable === true) {
    if (await deps.store.getDoc(id)) {
      return {
        ok: false,
        body: `"${id}" already exists — reinforce it, don't re-file it (recurrence reinforces, ADR-0168 D2).`,
        next: [`storytree friction reinforce ${id} --evidence "<what happened this time>" --pg`],
      };
    }
    const saved = await deps.store.upsertDoc({ id, kind: "friction", doc: valid, actor: deps.actor ?? "cli" });
    return {
      ok: true,
      body: `filed friction ${saved.id} on "${ctx.branch}" (${date}). It becomes routable one session after filing (the session that files it never adjudicates it, ADR-0168 D4).`,
      next: [`storytree friction list`, `storytree library artifact ${saved.id} --pg`],
    };
  }

  // Offline: stage the SAME validated doc JSON for the PR; the adjudicator files it live (migrate-only).
  mkdirSync(ctx.inboxDir, { recursive: true });
  const stagePath = path.join(ctx.inboxDir, `${id}.json`);
  if (existsSync(stagePath)) {
    return { ok: false, body: `"${id}" is already staged in docs/friction-inbox/ — pick a fresh id or reinforce it once filed live.`, next: ["storytree friction list"] };
  }
  writeFileSync(stagePath, JSON.stringify(valid, null, 2) + "\n", "utf8");
  return {
    ok: true,
    body: [
      `no live store (offline / remote 443-only) — staged friction ${id} to docs/friction-inbox/${id}.json for the PR (ADR-0168 D2).`,
      "The adjudicator (or the next live session's librarian pass) files it live via `storytree friction migrate --pg` — migrate-only, like sync-corpus; provenance survives.",
    ].join("\n"),
    next: ["git add docs/friction-inbox/   (commit the staged item with your PR)", "storytree friction list"],
  };
}

/** The subset of `references` that fail to resolve (asset:<id> → corpus, doc:<path> → docs/, else bad). */
async function unresolvedReferences(
  doc: Record<string, unknown>,
  store: Store,
  docsDir: string,
): Promise<string[]> {
  const refs = Array.isArray(doc["references"]) ? (doc["references"] as unknown[]).filter((r): r is string => typeof r === "string") : [];
  const bad: string[] = [];
  for (const ref of refs) {
    if (ref.startsWith("asset:")) {
      const target = ref.slice("asset:".length);
      if (!(await store.getDoc(target))) bad.push(`${ref} (no such artifact)`);
    } else if (ref.startsWith("doc:")) {
      const rel = ref.slice("doc:".length);
      if (!existsSync(path.join(docsDir, rel))) bad.push(`${ref} (no such doc)`);
    } else {
      bad.push(`${ref} (not an asset:<id> or doc:<path> pointer)`);
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// friction migrate — the D2 migrate step: staged inbox items → the live store
// ---------------------------------------------------------------------------

/** True when `file` resolves to a path INSIDE `dir` (never `dir` itself). Pure path math. */
function isInsideDir(file: string, dir: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * `storytree friction migrate [--file docs/friction-inbox/<id>.json] --pg` — the ADR-0168 D2 migrate
 * step: file the staged inbox items into the live store. TRANSPORT, not capture — the staged doc
 * lands VERBATIM: `provenance` (branch/date/source) and createdAt/updatedAt are preserved, so the
 * item keeps its original attribution and its worklist age (which `friction list` derives from
 * `provenance.date`, and which the D4 "aged ≥1 session" routability rule reads). NO cap-3 here: the
 * cap was already paid at the original capture, on the item's OWN branch/date — charging it again
 * against the migrating session strands a full inbox behind the migrator's own retro items. The
 * migrate-only policy mirrors `sync-corpus`: an id already live is NEVER overwritten. The D3 floors
 * still hold fail-closed per file (schema, kind, no smuggled route, concrete evidence, references —
 * re-checked against the LIVE corpus at the door). Each successfully migrated staging file is
 * DELETED (it has served its purpose — commit the deletions with the PR); a refused or already-live
 * file is left in place and reported.
 */
export async function migrateFriction(
  deps: FrictionDeps,
  opts: { file?: string | undefined },
  ctx: FrictionContext,
): Promise<Envelope> {
  if (deps.writable !== true) {
    return {
      ok: false,
      body: "friction migrate files staged inbox items into the live store — run with --pg (and bring the DB up first: pnpm db:up).",
      next: ["pnpm db:up", "storytree friction migrate --pg"],
    };
  }

  // The staging files to process: one named --file, or the whole-inbox sweep (sorted, deterministic).
  let names: string[];
  if (opts.file !== undefined) {
    if (!isInsideDir(opts.file, ctx.inboxDir)) {
      return {
        ok: false,
        body: "--file must point at a staged item under docs/friction-inbox/ — migrate is transport for STAGED captures.\nFor a new item, capture it instead: storytree friction new --file <doc.json> --pg",
        next: ["storytree friction migrate --pg   (sweep the whole inbox)"],
      };
    }
    if (!existsSync(opts.file)) {
      return { ok: false, body: `no such staged file: ${opts.file}`, next: ["storytree friction migrate --pg   (sweep the whole inbox)"] };
    }
    names = [path.basename(opts.file)];
  } else {
    names = existsSync(ctx.inboxDir)
      ? readdirSync(ctx.inboxDir).filter((n) => n.endsWith(".json")).sort()
      : [];
  }
  if (names.length === 0) {
    return { ok: true, body: "docs/friction-inbox/ is empty — nothing to migrate.", next: ["storytree friction list"] };
  }

  const migrated: string[] = [];
  const alreadyLive: string[] = [];
  const refused: Array<{ file: string; reason: string }> = [];

  for (const name of names) {
    const full = path.join(ctx.inboxDir, name);
    // Schema fail-closed — the same standard the gate's validateInboxDir holds the committed dir to.
    let valid: Record<string, unknown>;
    try {
      valid = upcastAndValidate(JSON.parse(readFileSync(full, "utf8"))) as Record<string, unknown>;
    } catch (e) {
      refused.push({ file: name, reason: `invalid staged doc: ${(e as Error).message}` });
      continue;
    }
    if (valid["kind"] !== "friction") {
      refused.push({ file: name, reason: `not a friction item (kind: ${String(valid["kind"])})` });
      continue;
    }
    const id = strField(valid, "id");
    if (id === "") {
      refused.push({ file: name, reason: "the staged doc has no id" });
      continue;
    }
    // Migration is not adjudication: a staged route would smuggle a classification past the live
    // adjudicator (capture never classifies, ADR-0168 D2/D5).
    if (valid["route"] !== undefined || valid["routeReason"] !== undefined) {
      refused.push({ file: name, reason: "carries a route — capture never classifies; strip it and let adjudication route it live (ADR-0168 D2)" });
      continue;
    }
    // The provenance to preserve IS the point of migrate; a hand-crafted staged doc without one has
    // no attribution/age to keep — re-stage it through `friction new` (offline) so it gets stamped.
    const prov = provenanceOf(valid);
    if (valid["provenance"] === undefined || prov.branch === undefined || prov.date === undefined) {
      refused.push({ file: name, reason: "no capture provenance — re-stage it via `storytree friction new` (offline) so provenance is stamped" });
      continue;
    }
    // The D3 floors, re-checked at the door (evidence concrete; references resolve — now against LIVE).
    if (!hasConcreteEvidence(strField(valid, "evidence"))) {
      refused.push({ file: name, reason: "evidence is not concrete (ADR-0168 D3) — fix the staged doc before migrating" });
      continue;
    }
    const unresolved = await unresolvedReferences(valid, deps.store, ctx.docsDir);
    if (unresolved.length > 0) {
      refused.push({ file: name, reason: `references do not resolve live: ${unresolved.join(", ")}` });
      continue;
    }
    // Migrate-only (the sync-corpus policy): an id already live is NEVER overwritten.
    const existing = await deps.store.getDoc(id);
    if (existing) {
      if (existing.kind !== "friction") {
        refused.push({ file: name, reason: `id "${id}" collides with a live ${existing.kind} — rename the staged item` });
      } else {
        alreadyLive.push(id);
      }
      continue;
    }
    await deps.store.upsertDoc({ id, kind: "friction", doc: valid, actor: deps.actor ?? "cli" });
    unlinkSync(full); // served its purpose (the README lifecycle) — the deletion rides the session's PR
    migrated.push(id);
  }

  const lines = [
    `friction migrate — ${names.length} staged item(s): ${migrated.length} migrated · ${alreadyLive.length} already live · ${refused.length} refused`,
  ];
  for (const id of migrated) lines.push(`  ✓ ${id} — filed live with its ORIGINAL provenance; staging file deleted`);
  for (const id of alreadyLive) lines.push(`  ● ${id} — already live (migrate-only never overwrites); verify it matches, then delete the staging file`);
  for (const r of refused) lines.push(`  ✗ ${r.file} — ${r.reason}`);
  return {
    ok: refused.length === 0,
    body: lines.join("\n"),
    next: [
      "storytree friction list",
      ...(migrated.length > 0 ? ["git add docs/friction-inbox/   (commit the staging-file deletions with your PR)"] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// friction reinforce — recurrence reinforces, never duplicates (ADR-0168 D2)
// ---------------------------------------------------------------------------

/**
 * `storytree friction reinforce <id> --evidence "<what happened this time>" --pg` — append a
 * `reinforcedBy` entry (branch/date/evidence, evidence REQUIRED and concrete) to an EXISTING friction
 * item. Never mints a twin. Works on an ARCHIVED item too — reinforce just RECORDS the recurrence with
 * stronger evidence; the tombstone re-open is adjudication's call (ADR-0168 D2). Live-store only.
 */
export async function reinforceFriction(
  deps: FrictionDeps,
  id: string | undefined,
  opts: { evidence?: string | undefined },
  ctx: FrictionContext,
): Promise<Envelope> {
  if (deps.writable !== true) return notWritable("reinforce");
  if (id === undefined) return { ok: false, body: "reinforce needs an id: storytree friction reinforce <id> --evidence ... --pg", next: ["storytree friction list"] };
  const evidence = opts.evidence?.trim();
  if (evidence === undefined || evidence === "") {
    return { ok: false, body: "reinforce needs --evidence — an evidence-free \"me too\" is exactly the slop the fence refuses (ADR-0168 D2/D3).", next: [`storytree friction reinforce ${id} --evidence "<what happened>" --pg`] };
  }
  if (!hasConcreteEvidence(evidence)) {
    return { ok: false, body: `--evidence must be CONCRETE (ADR-0168 D3) — a path/PR#/SHA/command/error/quote. Vague prose is refused. You gave:\n  ${evidence}`, next: [] };
  }
  const existing = await deps.store.getDoc(id);
  if (!existing) return { ok: false, body: `no friction item "${id}" to reinforce.`, next: ["storytree friction list"] };
  if (existing.kind !== "friction") return { ok: false, body: `"${id}" is a ${existing.kind}, not a friction item.`, next: [`storytree library artifact ${id}`] };

  const base = typeof existing.doc === "object" && existing.doc !== null ? { ...(existing.doc as Record<string, unknown>) } : {};
  const priorReinforcements = Array.isArray(base["reinforcedBy"]) ? [...(base["reinforcedBy"] as unknown[])] : [];
  const date = ctx.now.slice(0, 10);
  base["reinforcedBy"] = [...priorReinforcements, { branch: ctx.branch, date, evidence }];
  base["updatedAt"] = ctx.now;

  let valid: Record<string, unknown>;
  try {
    valid = upcastAndValidate(base) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, body: `reinforcement would make "${id}" invalid:\n${(e as Error).message}`, next: [`storytree library artifact ${id}`] };
  }
  const saved = await deps.store.upsertDoc({ id, kind: "friction", doc: valid, actor: deps.actor ?? "cli" });
  // The tombstone nudge keys on the ROUTE detail, not the (ADR-0196-collapsed) lifecycle: every
  // routed item is lifecycle-archived now, but only `route: nothing` is the re-openable tombstone.
  const tombstoned = routeOf(valid) === "nothing";
  return {
    ok: true,
    body: [
      `reinforced ${saved.id} — ${reinforcementCount(valid)} reinforcement(s) now (ADR-0168 D2: testimony the adjudicator weighs, never a threshold).`,
      ...(tombstoned ? ["this item is ARCHIVED (route: nothing) — the recurrence is recorded; re-opening the tombstone is the adjudicator's call (ADR-0168 D2)."] : []),
    ].join("\n"),
    next: ["storytree friction list", `storytree library artifact ${saved.id} --pg`],
  };
}

// ---------------------------------------------------------------------------
// friction route — the adjudication write (ADR-0168 D5)
// ---------------------------------------------------------------------------

/**
 * `storytree friction route <id> --route <enum> --reason "<justification>" --pg` — the adjudication
 * write (ADR-0168 D5): set `route` (the closed FrictionRoute enum, schema-fenced) + `routeReason` (the
 * justification-gate answers, or the archive reason for `nothing`). The surface the adjudicator (the
 * librarian-curator until the graduation-synthesist is built, inc 5) drives. Live-store only.
 */
export async function routeFriction(
  deps: FrictionDeps,
  id: string | undefined,
  opts: { route?: string | undefined; reason?: string | undefined },
  ctx: FrictionContext,
): Promise<Envelope> {
  if (deps.writable !== true) return notWritable("route");
  if (id === undefined) return { ok: false, body: "route needs an id: storytree friction route <id> --route <enum> --reason ... --pg", next: ["storytree friction list"] };
  const route = opts.route;
  if (route === undefined || !FrictionRoute.options.includes(route as (typeof FrictionRoute.options)[number])) {
    return { ok: false, body: `--route must be one of: ${FrictionRoute.options.join(" | ")} (ADR-0168 D5). \`nothing\` is the archive-with-reason tombstone.`, next: [`storytree library artifact ${id ?? "<id>"}`] };
  }
  const reason = opts.reason?.trim();
  if (reason === undefined || reason === "") {
    return { ok: false, body: "route needs --reason — the justification-gate answers (or the archive reason for `nothing`) go in routeReason (ADR-0168 D5).", next: [`storytree friction route ${id} --route ${route} --reason "<why>" --pg`] };
  }
  const existing = await deps.store.getDoc(id);
  if (!existing) return { ok: false, body: `no friction item "${id}" to route.`, next: ["storytree friction list"] };
  if (existing.kind !== "friction") return { ok: false, body: `"${id}" is a ${existing.kind}, not a friction item.`, next: [`storytree library artifact ${id}`] };

  const base = typeof existing.doc === "object" && existing.doc !== null ? { ...(existing.doc as Record<string, unknown>) } : {};
  base["route"] = route;
  base["routeReason"] = reason;
  base["updatedAt"] = ctx.now;

  let valid: Record<string, unknown>;
  try {
    valid = upcastAndValidate(base) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, body: `routing would make "${id}" invalid:\n${(e as Error).message}`, next: [`storytree library artifact ${id}`] };
  }
  const saved = await deps.store.upsertDoc({ id, kind: "friction", doc: valid, actor: deps.actor ?? "cli" });
  return {
    ok: true,
    body: `routed ${saved.id} → ${route} (${lifecycleOf(route)}).\nreason: ${reason}`,
    next: ["storytree friction list", `storytree library artifact ${saved.id} --pg`],
  };
}

// ---------------------------------------------------------------------------
// friction list — the worklist view (ADR-0168 D2). Read path; offline OK.
// ---------------------------------------------------------------------------

/** Whole days between an ISO date (YYYY-MM-DD) and `now`; undefined when the date is missing/odd. */
function ageDays(date: string | undefined, now: string): number | undefined {
  if (date === undefined) return undefined;
  const then = Date.parse(`${date}T00:00:00.000Z`);
  const at = Date.parse(now);
  if (Number.isNaN(then) || Number.isNaN(at)) return undefined;
  return Math.max(0, Math.floor((at - then) / 86_400_000));
}

/**
 * `storytree friction list` — the worklist view (ADR-0168 D2, lifecycle per ADR-0196): every
 * friction item grouped by derived lifecycle (open → archived, with `route` as the per-row
 * where-it-went detail), with age and reinforcement count. Read-only; runs offline
 * (against the seed) like every other read command — with --pg it reads the live worklist. When
 * staged items sit in the inbox it appends a nudge (they await live filing).
 */
export async function listFriction(
  store: Store,
  opts: { now: string; inboxDir?: string | undefined },
): Promise<Envelope> {
  const docs = (await store.queryDocs({ kind: "friction" })).map((d) => ({
    id: d.id,
    doc: typeof d.doc === "object" && d.doc !== null ? (d.doc as Record<string, unknown>) : {},
  }));

  const order: Record<FrictionLifecycle, number> = { open: 0, archived: 1 };
  const rows = docs
    .map(({ id, doc }) => {
      const route = routeOf(doc);
      const life = lifecycleOf(route);
      const age = ageDays(provenanceOf(doc).date, opts.now);
      return {
        id,
        life,
        title: strField(doc, "title"),
        route,
        age,
        reinforcements: reinforcementCount(doc),
      };
    })
    .sort((a, b) => order[a.life] - order[b.life] || a.id.localeCompare(b.id));

  const counts = { open: 0, archived: 0 } as Record<FrictionLifecycle, number>;
  for (const r of rows) counts[r.life] += 1;

  const width = Math.max(1, ...rows.map((r) => r.id.length));
  const lines: string[] = [
    `friction worklist — ${rows.length} item(s): ${counts.open} open · ${counts.archived} archived (route says where each went, ADR-0196 D2)`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("  (none) — nothing to report is a first-class, free outcome (ADR-0168 D1).");
  } else {
    for (const r of rows) {
      const meta = [
        r.age !== undefined ? `age ${r.age}d` : "age ?",
        r.reinforcements > 0 ? `×${r.reinforcements + 1}` : null,
        r.route !== undefined ? `→ ${r.route}` : null,
      ]
        .filter((x): x is string => x !== null)
        .join("  ");
      lines.push(`  [${r.life.padEnd(8)}] ${r.id.padEnd(width)}  ${r.title}   (${meta})`);
    }
  }

  // Offline nudge: staged items in the inbox await live filing (the adjudicator's migrate-only job).
  const staged = opts.inboxDir !== undefined ? readInboxDocs(opts.inboxDir).length : 0;
  if (staged > 0) {
    lines.push("", `note: ${staged} item(s) staged in docs/friction-inbox/ await live filing — storytree friction migrate --pg (ADR-0168 D2, migrate-only, provenance preserved).`);
  }

  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      ...(counts.open > 0 ? ["storytree friction route <id> --route <enum> --reason ... --pg   (adjudicate an open item)"] : []),
      ...(staged > 0 ? ["storytree friction migrate --pg   (file the staged inbox items live)"] : []),
      "storytree friction new --file <doc.json> --pg   (file one)",
    ],
  };
}

/** Guidance when a friction WRITE (reinforce/route) is attempted offline — those need the live store. */
function notWritable(verb: string): Envelope {
  return {
    ok: false,
    body: `friction ${verb} writes to the shared store — run with --pg (and bring the DB up first: pnpm db:up).\n(Only \`friction new\` falls back to the docs/friction-inbox/ staging file offline, ADR-0168 D2.)`,
    next: ["pnpm db:up", `storytree friction ${verb} <id> --pg`],
  };
}

/** `storytree friction --help` — the capture surface's map. */
export function frictionHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree friction — the employees' upward voice channel (ADR-0168): file what fought you.",
      "",
      "  storytree friction new --file <doc.json> [--pg] [--source retro|run-analysis]",
      "        file a friction item, fail-closed: evidence must be CONCRETE, ≤3 per branch/date,",
      "        references must resolve, NO route at capture. With --pg it writes live; offline it",
      "        stages the same JSON to docs/friction-inbox/ for the PR (remote 443-only fallback).",
      "  storytree friction migrate [--file docs/friction-inbox/<id>.json] --pg",
      "        the D2 migrate step (transport, not capture): file the staged inbox items live with",
      "        their ORIGINAL provenance (attribution + worklist age survive), no cap-3 (paid at",
      "        capture), migrate-only (never overwrites live); deletes each staging file it migrates.",
      "  storytree friction reinforce <id> --evidence \"<what happened>\" --pg",
      "        recurrence reinforces an EXISTING item (own evidence, required) — never a twin.",
      "  storytree friction route <id> --route <enum> --reason \"<why>\" --pg",
      "        adjudication: set the route (adr|tool|principle|guardrail|process|definition|",
      "        edit-existing|nothing) + the justification. `nothing` archives with a reason.",
      "  storytree friction list",
      "        the worklist: open → archived (route says where, ADR-0196), with age + reinforcement count (read-only).",
      "",
      "capture never classifies — the adjudicator (graduation-synthesist; librarian-curator until",
      "it is built) routes items through the ADR-0168 D5 justification gate.",
    ].join("\n"),
    next: ["storytree friction list", "storytree library artifact template-friction"],
  };
}
