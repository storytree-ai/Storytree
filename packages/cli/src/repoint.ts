/**
 * `storytree library repoint <from> --to <to>` — move every inbound reference from one artifact to a
 * successor, as ONE operation (ADR-0498 D3/D4).
 *
 * ⚠⚠ THE DRY RUN IS THE WHOLE SAFETY STORY, AND THERE IS NO SECOND GUARD BEHIND IT. A verb that
 * silently rewrites edges across 20 stories is a worse instrument than the under-reporting reader it
 * replaces. So: the plan is printed in full — artifact, field, old value, new value — and NOTHING is
 * written until a confirmation naming THAT plan's digest comes back. The digest is computed from the
 * edit set itself, so a confirmation cannot be carried across a corpus that moved underneath it: a
 * sibling's write between the dry run and the confirm changes the digest and the confirm is refused,
 * rather than applying a plan nobody read.
 *
 * ⚠ IT SPANS TWO SUBSTRATES AND MUST SAY WHICH IT IS TOUCHING. They are not two spellings of one
 * thing, and blurring them is not a dry run:
 *
 *   - THE LIVE STORE. A library artifact's `asset:<id>` ref sites. These land the moment you
 *     confirm — there is no PR and no review between the confirmation and the corpus.
 *   - THE WORKING TREE. A story's `decisions:` list is inline YAML in `stories/<id>/story.md`
 *     frontmatter, and it holds ADR NUMBERS rather than `asset:` refs, so the store walk cannot see
 *     it at all — `story` is not even a library kind. These land as file edits that still have to go
 *     through the gate and a PR.
 *
 * ⚠ WHAT COUNTS AS AN EDGE IS NOT DECIDED HERE. The store side is `findInboundRefs` from
 * `retire.ts` — the same walk the retire wall enforces and `library inbound` reports — so this verb
 * cannot move a set the reader would not have shown you. Three implementations of "what counts as an
 * edge" is two too many.
 *
 * ⚠ AND A SITE THE WALK FINDS IS NOT ALWAYS ONE THE WRITE CAN MOVE. Measured 2026-09-01: the edge
 * that blocks retiring adr-0028 sits in `adr-0018.references[10]` — residue of the field ADR-0477
 * retired. `references` is out of the schema, so the migrate-on-write upcast DROPS the whole array
 * at the next validated write: the site does not move, it EVAPORATES, taking that row's other
 * citations with it. Reporting such a site as "would repoint" would be a lie about what the write
 * does. So repointability is DERIVED rather than declared — each doc is run through `upcast`, the
 * very transformation the write path applies, and a site that does not survive it is reported as
 * blocked with its reason. That is a hand-kept list of retired fields avoided: this one cannot go
 * stale, because it asks the write path instead of describing it.
 *
 * ⚠ THE ADR-0477 NARROWING BINDS HERE TOO. Only a value that is WHOLLY a ref is a site, so an
 * `asset:` token inside prose is never rewritten — that is a sentence, not an edge, and rewriting it
 * would silently edit somebody's argument.
 */

import { createHash } from "node:crypto";

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { upcast, upcastAndValidate } from "@storytree/library";
import type { Envelope } from "@storytree/drive";

import { defaultCliActor } from "./cli-actor.js";
import { referencedAssetSites } from "./retire.js";

/** One live-store edit: an artifact's ref site moving from one target to another. */
export interface StoreRepointEdit {
  readonly id: string;
  readonly kind: string;
  /** The field path, e.g. `dependsOn[0]` or `arcRef`. */
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

/** One working-tree edit: a unit's whole `decisions:` frontmatter line, before and after. */
export interface FileRepointEdit {
  /** Repo-relative, forward-slashed. */
  readonly file: string;
  readonly storyId: string;
  readonly before: string;
  readonly after: string;
  /**
   * The two decision NUMBERS the rewrite moves between. Carried on the edit rather than re-derived
   * at apply time: an edit only exists when both ends are decisions, so holding them here is what
   * lets the apply loop run with no `is this a decision` guard of its own — a guard that could never
   * fire, because a plan that failed it produces no edits to loop over.
   */
  readonly fromNumber: number;
  readonly toNumber: number;
}

/** A site the walk found that the write path CANNOT move, and why. */
export interface BlockedSite {
  readonly id: string;
  readonly path: string;
  readonly reason: string;
}

/** A story's `decisions:` list as read off disk. */
export interface StoryDecisionsFile {
  /** Repo-relative, forward-slashed. */
  readonly file: string;
  readonly storyId: string;
  readonly decisions: readonly number[];
  /** The file's raw bytes — the rewrite is byte-preserving and works from these. */
  readonly raw: string;
}

export interface RepointPlan {
  readonly from: string;
  readonly to: string;
  readonly storeEdits: readonly StoreRepointEdit[];
  readonly fileEdits: readonly FileRepointEdit[];
  readonly blocked: readonly BlockedSite[];
  /**
   * The end of the move that is not a decision, when one of them is not — the reason the working-
   * tree half is inapplicable rather than merely empty. `null` when both ends are decisions.
   */
  readonly notADecision: string | null;
  /** Binds a confirmation to THIS edit set; recomputed at confirm time and refused if it moved. */
  readonly digest: string;
}

/** The `adr-NNNN` id shape, and the number inside it. Anchored. */
const ADR_ID = /^adr-(\d{4})$/;

/** The decision NUMBER an `adr-NNNN` id carries, or null for any other artifact id. */
export function adrNumberOf(id: string): number | null {
  const m = ADR_ID.exec(id);
  return m?.[1] === undefined ? null : Number(m[1]);
}

/**
 * The two decision NUMBERS a move runs between, or the END that is not a decision.
 *
 * One value rather than two nullable ones, because the whole working-tree half turns on the SAME
 * question — can this move be spelled in a `decisions:` list at all — and two independent nulls let
 * that question be asked twice, in two places, with nothing tying the answers together.
 */
export function decisionPair(
  from: string,
  to: string,
): { from: number; to: number } | { notADecision: string } {
  const fromNumber = adrNumberOf(from);
  if (fromNumber === null) return { notADecision: from };
  const toNumber = adrNumberOf(to);
  if (toNumber === null) return { notADecision: to };
  return { from: fromNumber, to: toNumber };
}

/**
 * PURE: rewrite a story.md's frontmatter `decisions:` list, moving `from` to `to`.
 *
 * Byte-preserving everywhere else, and fail-closed: a missing frontmatter block, an unterminated
 * one, or no `decisions:` line REFUSES rather than guessing. Only maximal digit runs are compared,
 * so repointing 28 never touches 280 or 128 — the trap a naive substring replace walks into.
 *
 * If the target is ALREADY in the list, the move collapses to a removal of the source rather than
 * leaving a duplicate: `[4, 28, 500]` repointed 28 → 500 is `[4, 500]`, not `[4, 500, 500]`.
 */
export function repointDecisions(
  raw: string,
  from: number,
  to: number,
): { ok: true; changed: boolean; content: string } | { ok: false; reason: string } {
  if (!raw.startsWith("---\n")) return { ok: false, reason: "no frontmatter block (missing leading '---')" };
  // `=== -1` rather than `< 0`: `indexOf` from offset 4 returns -1 or an index of at least 4, so
  // `< 0` and `<= 0` agree on every possible input and nothing could tell them apart.
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { ok: false, reason: "unterminated frontmatter block (no closing '---')" };
  const block = raw.slice(0, end);
  // A `replace` with a callback rather than exec-plus-index arithmetic: it is byte-preserving by
  // construction (only the matched line is rebuilt), and it needs ONE condition per question —
  // "was there a list", "was the source in it" — instead of a null check paired with a group check
  // that could never answer differently.
  let seen = false;
  let changed = false;
  const newBlock = block.replace(/^decisions:[ \t]*\[([^\]]*)\][ \t]*$/m, (whole, inner: string) => {
    seen = true;
    const numbers = [...inner.matchAll(/\d+/g)].map((d) => Number(d[0]));
    if (!numbers.includes(from)) return whole;
    changed = true;
    const moved: number[] = [];
    for (const n of numbers) {
      const next = n === from ? to : n;
      if (!moved.includes(next)) moved.push(next);
    }
    return `decisions: [${moved.join(", ")}]`;
  });
  if (!seen) return { ok: false, reason: "no inline `decisions:` list in the frontmatter" };
  if (!changed) return { ok: true, changed: false, content: raw };
  return { ok: true, changed: true, content: newBlock + raw.slice(end) };
}

/** The `decisions:` line as it stands / would stand, for the dry run's before-and-after columns. */
function decisionsLine(decisions: readonly number[]): string {
  return `decisions: [${decisions.join(", ")}]`;
}

/** Every unit whose `decisions:` list names `fromNumber`, with the line it would become. */
function planFileEdits(
  stories: readonly StoryDecisionsFile[],
  fromNumber: number,
  toNumber: number,
): FileRepointEdit[] {
  const edits: FileRepointEdit[] = [];
  for (const s of stories) {
    if (!s.decisions.includes(fromNumber)) continue;
    const moved: number[] = [];
    for (const n of s.decisions) {
      const next = n === fromNumber ? toNumber : n;
      // The move COLLAPSES onto a target already listed rather than leaving it twice — a unit that
      // named both ends names the survivor once.
      if (!moved.includes(next)) moved.push(next);
    }
    edits.push({
      file: s.file,
      storyId: s.storyId,
      before: decisionsLine(s.decisions),
      after: decisionsLine(moved),
      fromNumber,
      toNumber,
    });
  }
  return edits.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Every field path in `doc` that still carries an `asset:<targetId>` edge AFTER the write path's own
 * migrate-on-write upcast — i.e. the sites a validated write could actually move.
 */
function survivingPaths(doc: unknown): Set<string> {
  // No `typeof doc === "object"` guard: `upcast` opens with `isStructuredKnowledge`, so a body that
  // is not a structured doc comes straight back out. Repeating that check here would be a second
  // spelling of it — and one no fixture could tell from the first.
  //
  // And no filter by target id either: the question is whether THIS SITE's field survives the write,
  // which is a property of the path. Filtering by id as well would narrow the set by a condition
  // that cannot change the answer, so nothing could ever distinguish it from not filtering.
  return new Set(referencedAssetSites(upcast(doc as Record<string, unknown>)).map((s) => s.path));
}

/** The root field a path sits in — `dependsOn[0]` → `dependsOn`, `stepRefs[2].refs[0]` → `stepRefs`. */
function rootFieldOf(path: string): string {
  const cut = path.search(/[[.]/);
  // `=== -1` rather than `< 0`: `search` returns -1 or an index, and a real path never starts with a
  // separator, so `< 0` and `<= 0` agree on every input a caller can produce.
  return cut === -1 ? path : path.slice(0, cut);
}

/**
 * Build the repoint plan: what would move, what cannot, and the digest that binds a confirmation to
 * exactly this set. PURE — every input is supplied, nothing is read and nothing is written.
 */
export function planRepoint(input: {
  readonly from: string;
  readonly to: string;
  readonly docs: readonly StoredDoc[];
  readonly stories: readonly StoryDecisionsFile[];
}): RepointPlan {
  const { from, to, docs, stories } = input;
  const beforeRef = `asset:${from}`;
  const afterRef = `asset:${to}`;

  const storeEdits: StoreRepointEdit[] = [];
  const blocked: BlockedSite[] = [];

  for (const d of docs) {
    if (d.id === from) continue;
    const sites = referencedAssetSites(d.doc).filter((s) => s.id === from);
    // Computed on FIRST use rather than behind a `sites.length === 0` guard: the guard existed only
    // to skip the upcast for the overwhelming majority of docs, and a loop that does not run skips
    // it just as well — with nothing left that behaves identically whether the guard fires or not.
    let survives: Set<string> | null = null;
    for (const s of sites) {
      survives ??= survivingPaths(d.doc);
      if (survives.has(s.path)) {
        storeEdits.push({ id: d.id, kind: d.kind, path: s.path, before: beforeRef, after: afterRef });
      } else {
        blocked.push({
          id: d.id,
          path: s.path,
          reason:
            `\`${rootFieldOf(s.path)}\` is not in the current schema, so the migrate-on-write upcast ` +
            "DROPS it at the next validated write. The site does not move, it evaporates — and every " +
            "other entry in that field goes with it. Nothing here can repoint it.",
        });
      }
    }
  }
  storeEdits.sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path));
  blocked.sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path));

  // The working-tree half. Stories name deciding decisions by NUMBER, so the move is only
  // expressible there when BOTH ends have one — a principle has no number to write into a
  // `decisions:` list. That is reported rather than silently yielding an empty half: an empty
  // section and an inapplicable one read the same and mean very different things.
  // ONE branch decides both halves of the working-tree answer. Asking "is this a decision move" in
  // two separate expressions let one of them be wrong while the other stayed right — and since the
  // edits are empty either way, only the REASON would have changed, silently.
  const pair = decisionPair(from, to);
  const filePlan =
    "notADecision" in pair
      ? { notADecision: pair.notADecision, fileEdits: [] as FileRepointEdit[] }
      : { notADecision: null, fileEdits: planFileEdits(stories, pair.from, pair.to) };
  const { notADecision, fileEdits } = filePlan;

  return {
    from,
    to,
    storeEdits,
    fileEdits,
    blocked,
    notADecision,
    digest: digestOf(from, to, storeEdits, fileEdits),
  };
}

/**
 * The confirmation token: a short digest over the EDIT SET, not over the corpus.
 *
 * It is what makes `--confirm` bind to a plan somebody read. Blocked sites are deliberately NOT in
 * it — they describe what will not happen, so a change there must not invalidate a confirmation for
 * edits that are otherwise identical.
 */
function digestOf(
  from: string,
  to: string,
  storeEdits: readonly StoreRepointEdit[],
  fileEdits: readonly FileRepointEdit[],
): string {
  const h = createHash("sha256");
  h.update(`${from}>${to}\n`);
  for (const e of storeEdits) h.update(`S ${e.id} ${e.path} ${e.before} ${e.after}\n`);
  for (const e of fileEdits) h.update(`F ${e.file} ${e.before} ${e.after}\n`);
  return h.digest("hex").slice(0, 8);
}

/** Does this plan change anything at all? A plan with no edits is never worth confirming. */
export function planIsEmpty(plan: RepointPlan): boolean {
  return plan.storeEdits.length === 0 && plan.fileEdits.length === 0;
}

/**
 * Apply one store edit to a doc body, returning the new body. PURE.
 *
 * Walks to the site by the SAME path grammar `referencedAssetSites` emits, and rewrites only that
 * one leaf — never a whole field, and never a value it did not find the ref at.
 */
export function applyStoreEdit(
  doc: Record<string, unknown>,
  before: string,
  after: string,
  allowedPaths: ReadonlySet<string>,
): Record<string, unknown> {
  return rewrite(doc, before, after, allowedPaths, "") as Record<string, unknown>;
}

/**
 * The rewrite itself: the SAME structural walk `referencedAssetSites` performs, rebuilding as it
 * goes rather than mutating in place.
 *
 * It walks the DOCUMENT, not a path string. An earlier version parsed `dependsOn[0]` back into steps
 * and navigated to the leaf, which meant a second implementation of the path grammar plus a row of
 * guards for shapes no caller could produce — guards nothing could tell were doing anything. Walking
 * the structure keeps one grammar and gives every branch here a document that exercises it.
 *
 * Two conditions must BOTH hold for a value to move, and they are different questions: the value has
 * to be the ref being moved (never a prose sentence that merely contains it — ADR-0477), and its
 * path has to be one the plan listed (never a site the plan reported as unmovable).
 */
function rewrite(
  value: unknown,
  before: string,
  after: string,
  allowed: ReadonlySet<string>,
  path: string,
): unknown {
  if (typeof value === "string") return value.trim() === before && allowed.has(path) ? after : value;
  if (Array.isArray(value)) return value.map((v, i) => rewrite(v, before, after, allowed, `${path}[${i}]`));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        rewrite(v, before, after, allowed, path === "" ? k : `${path}.${k}`),
      ]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// the verb
// ---------------------------------------------------------------------------

/** Every seam the verb touches, injected so the whole command is testable with no filesystem. */
export interface RepointDeps {
  readonly store: Store;
  /**
   * True only for the live `--pg` store. A confirmation without it is refused.
   *
   * `| undefined` rather than a bare optional: the caller forwards `RunDeps`' own optionals
   * straight through, and under `exactOptionalPropertyTypes` a bare `?` would force a conditional
   * empty-object spread at the call site — the shape `no-conditional-empty-object-spread` refuses.
   */
  readonly writable?: boolean | undefined;
  readonly actor?: string | undefined;
  /** Every story's `decisions:` list plus its raw bytes. */
  readonly readStories: () => readonly StoryDecisionsFile[];
  /** Write one story file back, repo-relative path in. */
  readonly writeStory: (file: string, content: string) => void;
}

const rule = (label: string): string => `${label}\n${"-".repeat(label.length)}`;

function renderPlan(plan: RepointPlan): string[] {
  const out: string[] = [`repoint  ${plan.from}  →  ${plan.to}`, ""];

  out.push(rule(`LIVE STORE — ${plan.storeEdits.length} edit(s), applied the moment you confirm`));
  if (plan.storeEdits.length === 0) out.push("  (none)");
  for (const e of plan.storeEdits) {
    out.push(`  ${e.id}  [${e.kind}]`);
    out.push(`      ${e.path}:  ${e.before}  →  ${e.after}`);
  }
  out.push("");

  if (plan.notADecision !== null) {
    out.push(rule("WORKING TREE — not applicable to this move"));
    out.push(
      `  A story names its deciding decisions by NUMBER, and ${plan.notADecision} is not a decision,`,
    );
    out.push("  so there is no number to write into a `decisions:` list. No file is involved.");
  } else {
    out.push(rule(`WORKING TREE — ${plan.fileEdits.length} file(s), still have to pass the gate and a PR`));
    if (plan.fileEdits.length === 0) out.push("  (none)");
    for (const e of plan.fileEdits) {
      out.push(`  ${e.file}`);
      out.push(`      before:  ${e.before}`);
      out.push(`      after:   ${e.after}`);
    }
  }

  if (plan.blocked.length > 0) {
    out.push("");
    out.push(rule(`CANNOT BE REPOINTED — ${plan.blocked.length} site(s), reported and left alone`));
    for (const b of plan.blocked) {
      out.push(`  ${b.id}  ${b.path}`);
      out.push(`      ${b.reason}`);
    }
  }
  return out;
}

/**
 * `storytree library repoint <from> --to <to> [--confirm <digest>] --pg`.
 *
 * Without `--confirm` this is a DRY RUN and writes nothing — it prints the whole plan and the exact
 * command that would apply it. With `--confirm` it re-derives the plan and refuses unless the digest
 * still matches, so a confirmation can only ever land the edit set somebody actually read.
 */
export async function libraryRepoint(
  deps: RepointDeps,
  from: string | undefined,
  opts: { readonly to?: string | undefined; readonly confirm?: string | undefined },
): Promise<Envelope> {
  if (from === undefined || from === "" || opts.to === undefined || opts.to === "") {
    return libraryRepointHelp();
  }
  if (from === opts.to) {
    return {
      ok: false,
      body: `"${from}" and --to are the same artifact — nothing to move.`,
      next: ["storytree library repoint <from> --to <to>"],
    };
  }

  const source = await deps.store.getDoc(from);
  if (!source) {
    return {
      ok: false,
      body: `no artifact "${from}" in the corpus. ids are exact and case-sensitive.`,
      next: [`storytree library search "${from}"`],
    };
  }
  // The TARGET must exist too. Repointing onto a missing id would replace every live edge with a
  // dangling one in a single confirmed operation — the exact damage the dry run exists to prevent,
  // and the one shape a reader of the plan would not catch, since the plan looks identical either way.
  if (!(await deps.store.getDoc(opts.to))) {
    return {
      ok: false,
      body: [
        `no artifact "${opts.to}" to repoint onto — refusing.`,
        "",
        "Every edge would be moved onto an id nothing resolves, and a dangling declared ref is a",
        "broken pull rather than a tidy one. Create the successor first, then repoint.",
      ].join("\n"),
      next: [`storytree library search "${opts.to}"`],
    };
  }

  // Read the units ONCE and reuse the same snapshot for the plan and the write. Two sweeps could
  // disagree, and the second would be the one that silently decided what landed.
  const stories = deps.readStories();
  const plan = planRepoint({ from, to: opts.to, docs: await deps.store.queryDocs(), stories });

  if (planIsEmpty(plan)) {
    return {
      ok: true,
      body: [
        `nothing references ${from} that this verb can move.`,
        ...(plan.blocked.length > 0 ? ["", ...renderPlan(plan).slice(2)] : []),
      ].join("\n"),
      next: [`storytree library inbound ${from}`],
    };
  }

  if (opts.confirm === undefined) {
    return {
      ok: true,
      body: [
        ...renderPlan(plan),
        "",
        "NOTHING HAS BEEN WRITTEN — this is a dry run. To apply exactly the plan above:",
        "",
        `  storytree library repoint ${from} --to ${plan.to} --confirm ${plan.digest} --pg`,
        "",
        "The token names THIS edit set. If the corpus moves before you confirm — a sibling session's",
        "write, an edited story — it changes, and the confirmation is refused rather than applying a",
        "plan nobody read.",
      ].join("\n"),
      next: [`storytree library repoint ${from} --to ${plan.to} --confirm ${plan.digest} --pg`],
    };
  }

  if (opts.confirm !== plan.digest) {
    return {
      ok: false,
      body: [
        `REFUSED — the plan moved. You confirmed ${opts.confirm}; the plan is now ${plan.digest}.`,
        "",
        "Something changed between the dry run and this confirmation, so the edit set you read is not",
        "the one that would land. Nothing has been written. Re-run the dry run, read the new plan,",
        "and confirm that one:",
        "",
        `  storytree library repoint ${from} --to ${plan.to}`,
      ].join("\n"),
      next: [`storytree library repoint ${from} --to ${plan.to}`],
    };
  }

  if (deps.writable !== true) {
    return {
      ok: false,
      body: "a confirmed repoint writes to the shared store — run with --pg (and bring the DB up first: pnpm db:up).",
      next: [`storytree library repoint ${from} --to ${plan.to} --confirm ${plan.digest} --pg`],
    };
  }

  // --- apply: the live store first ---------------------------------------------------------------
  const byDoc = new Map<string, StoreRepointEdit[]>();
  for (const e of plan.storeEdits) {
    const list = byDoc.get(e.id);
    if (list) list.push(e);
    else byDoc.set(e.id, [e]);
  }
  const wrote: string[] = [];
  const failed: string[] = [];
  for (const [id, edits] of byDoc) {
    const stored = await deps.store.getDoc(id);
    // Only the existence check. The body's SHAPE needs no guard of its own: `applyStoreEdit` walks
    // whatever it is given and returns a non-object unchanged, and `upcastAndValidate` then refuses
    // it into the failure arm below — so a second shape check here could never be the one that
    // caught anything.
    if (!stored) {
      failed.push(`${id} — vanished between the plan and the write`);
      continue;
    }
    // Every edit on this doc moves the same ref — the plan is one from/to — so the per-doc work is
    // "rewrite these PATHS", and the set is what stops a site the plan called unmovable being moved.
    const body = applyStoreEdit(
      stored.doc as Record<string, unknown>,
      `asset:${plan.from}`,
      `asset:${plan.to}`,
      new Set(edits.map((e) => e.path)),
    );
    try {
      const valid = upcastAndValidate(body);
      await deps.store.upsertDoc({ id, kind: stored.kind, doc: valid, actor: deps.actor ?? defaultCliActor() });
      wrote.push(`${id} (${edits.map((e) => e.path).join(", ")})`);
    } catch (err) {
      failed.push(`${id} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- then the working tree ---------------------------------------------------------------------
  // No decision-shape guard here: `plan.fileEdits` is empty unless both ends are decisions, and each
  // edit carries the two numbers, so the loop is the guard.
  // Walk the UNITS and look each one up in the plan, rather than walking the plan and looking each
  // edit's bytes up in a map. Same pairs either way, but this direction has no unreachable arm: a
  // unit the plan did not name is the ordinary case (most units), where the other direction's
  // "bytes missing for a planned file" could not happen at all — both sides come from the one
  // snapshot read above — leaving a guard nothing could ever ask a question of.
  const files: string[] = [];
  const planned = new Map(plan.fileEdits.map((e) => [e.file, e] as const));
  for (const s of stories) {
    const e = planned.get(s.file);
    if (e === undefined) continue;
    const next = repointDecisions(s.raw, e.fromNumber, e.toNumber);
    if (!next.ok) failed.push(`${e.file} — ${next.reason}`);
    else if (next.changed) {
      deps.writeStory(e.file, next.content);
      files.push(e.file);
    }
  }

  return {
    ok: failed.length === 0,
    body: [
      `repointed ${plan.from} → ${plan.to}`,
      "",
      `  live store:   ${wrote.length} artifact(s) written`,
      ...wrote.map((w) => `    - ${w}`),
      `  working tree: ${files.length} file(s) edited`,
      ...files.map((f) => `    - ${f}`),
      ...(files.length > 0
        ? ["", "The file edits are UNCOMMITTED — they still have to pass the gate and land through a PR."]
        : []),
      ...(failed.length > 0 ? ["", `${failed.length} FAILED:`, ...failed.map((f) => `    - ${f}`)] : []),
    ].join("\n"),
    next: [`storytree library inbound ${plan.to}`, `storytree library inbound ${plan.from}`],
  };
}

/** `storytree library repoint --help`. */
export function libraryRepointHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library repoint <from> --to <to> [--confirm <token>] --pg",
      "",
      "  Move every inbound reference from one artifact to a successor, as one operation.",
      "",
      "  IT IS A DRY RUN BY DEFAULT, and there is no second guard behind that. It prints every edit",
      "  it would make — artifact, field, old value, new value — and writes nothing. Applying takes",
      "  --confirm with the token the dry run printed, which names THAT edit set: if the corpus moves",
      "  first the token changes, and the confirmation is refused rather than landing a plan nobody",
      "  read.",
      "",
      "  IT SPANS TWO SUBSTRATES and says which it is touching, because they land differently:",
      "    LIVE STORE     an artifact's `asset:` ref sites — applied the moment you confirm.",
      "    WORKING TREE   a story's `decisions:` frontmatter, which holds ADR NUMBERS in a markdown",
      "                   file — edited on disk, and still has to pass the gate and a PR.",
      "",
      "  A site the walk finds is not always one the write can move. A field that is no longer in the",
      "  schema is DROPPED by the migrate-on-write upcast, so its refs evaporate rather than move —",
      "  those are reported under CANNOT BE REPOINTED and left alone.",
      "",
      "  A name that appears only inside PROSE is never rewritten (ADR-0477): that is a sentence, not",
      "  an edge.",
      "",
      "  For a DECISION, prefer a consolidating supersession (ADR-0497 D1) — it keeps the row, so no",
      "  edge needs moving at all. Repointing is for the narrower case of actually removing one.",
      "",
      "examples",
      "  storytree library repoint adr-0028 --to adr-0500",
      "  storytree library repoint adr-0028 --to adr-0500 --confirm a1b2c3d4 --pg",
    ].join("\n"),
    next: ["storytree library repoint <from> --to <to>"],
  };
}
