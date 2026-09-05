/**
 * The `storytree resteer` capture surface (ADR-0515; `follow-the-research-arc` inc 1) — the owner's
 * interventions, recorded as they happen.
 *
 * WHY THIS IS NOT A FLAVOUR OF `friction`, given that both are filed by the same retro step. Two
 * reasons, and each alone is sufficient:
 *
 *   1. THE CAP. `friction new` refuses a fourth item per branch/date (the ReasoningBank cap-3), and
 *      that cap is right for friction — it forces distillation. It is FATAL here: a re-steer log's
 *      whole value is the COUNT, so silently dropping the fourth intervention of a session would
 *      destroy the only figure the tier exists to produce, in the flattering direction, with nothing
 *      to catch it. There is deliberately no cap below.
 *   2. THE SUBJECT. A friction item's subject is what fought the SESSION. A re-steer's subject is what
 *      the OWNER redirected. Blending them puts an agent's account of its obstacles in the same
 *      column as observed human behaviour, which is exactly the blend ADR-0513 D4 forbids.
 *
 * WHAT IS SHARED, so this is an extension of the retro rather than a parallel capture path: the same
 * ceremony (session-orchestrator workflow step 4), the same `CaptureProvenance` stamp, the same
 * branch/clock seams, and the same structural evidence floor (`hasConcreteEvidence`, imported rather
 * than re-implemented — one floor, one definition of "concrete").
 *
 * FLAGS, NOT A JSON DOC. `friction new` takes `--file <doc.json>`, and this repo's own friction tier
 * records that surface as a defect (`friction-capture-surface-is-itself-high-friction`). Capture here
 * has to cost no extra authoring or it will not happen, so every field is a flag with the house
 * `@path` convention available for prose.
 *
 * LIVE STORE ONLY — no `docs/*-inbox/` fallback, and that is a decision. `friction` has one because a
 * remote 443-only session can still stage a file for the PR. A re-steer is filed in the SAME retro
 * that immediately precedes the merge ceremony, and that ceremony already needs the live store
 * (`arc increment close --pg`), so a second staging directory, a second migrate verb and a second
 * gate rung would buy a case that does not arise. `new` refuses without `--pg` and says so.
 */

import { readFileSync } from "node:fs";

import type { Store } from "@storytree/storage-protocol";
import {
  assertResteerInvariants,
  cohensKappa,
  explainDocValidationError,
  MAST_CATEGORY,
  partitionResteers,
  resteerReport,
  ResteerDisposition,
  ResteerDispositionBy,
  ResteerMode,
  Resteer,
  upcastAndValidate,
  type Annotation,
} from "@storytree/library";

import { defaultCliActor } from "./cli-actor.js";
import type { Envelope } from "./envelope.js";
import { hasConcreteEvidence } from "./friction.js";

/** The narrowed write surface the re-steer verbs need. */
export interface ResteerDeps {
  readonly store: Store;
  /** True for the live `--pg` store. Capture REFUSES without it — see the header. */
  readonly writable?: boolean;
  readonly actor?: string;
}

/** The injected capture context — every non-deterministic input, so the surface is offline-testable. */
export interface ResteerContext {
  /** The session branch — the `provenance.branch` stamp and the per-session grouping key. */
  readonly branch: string;
  /** An ISO timestamp: stamps createdAt/updatedAt; `provenance.date` is its date part. */
  readonly now: string;
}

/** The fields the CLI stamps on the author's behalf, named in the validation refusal. */
const STAMPED_FIELDS = ["kind", "id", "provenance", "createdAt", "updatedAt", "schemaVersion"] as const;

/** `A Title Like This` → `a-title-like-this`, prefixed so a re-steer id is recognisable on sight. */
export function resteerIdFromTitle(title: string): string {
  // The two edge strips are `-` and NOT `-+`, deliberately: the replace above is greedy, so every run
  // of non-alphanumerics has already collapsed to a SINGLE hyphen and no two adjacent ones can exist.
  // A `+` here would be a quantifier no input could exercise — an untestable branch rather than a
  // safety margin. The SECOND strip is still load-bearing: `.slice(0, 60)` can cut immediately after
  // a hyphen, which the first strip ran too early to see.
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/g, "");
  return slug === "" ? "" : `resteer-${slug}`;
}

/**
 * The doc `resteer new` ASSEMBLES, before it is validated against the schema.
 *
 * A named contract rather than an inline literal or an open dictionary: anti-slop
 * `no-known-value-widening` refuses the `Record<string, unknown>` that would discard these keys, and
 * `no-conditional-empty-object-spread` refuses building the two optionals with a conditional spread —
 * both point at exactly this shape. It deliberately mirrors the `Resteer` schema and is NOT a second
 * source of truth: `upcastAndValidate` is still what decides whether the doc is well-formed, and this
 * type only has to be right enough to hand it over.
 */
interface ResteerDraft {
  kind: "resteer";
  id: string;
  title: string;
  description: string;
  doing: string;
  redirect: string;
  evidence: string;
  disposition: ResteerDisposition;
  dispositionBy: ResteerDispositionBy;
  provenance: { branch: string; date: string; source: "retro" };
  createdAt: string;
  updatedAt: string;
  selfReport?: string;
  mode?: ResteerMode;
}

export interface NewResteerOpts {
  readonly title?: string | undefined;
  readonly doing?: string | undefined;
  readonly redirect?: string | undefined;
  readonly evidence?: string | undefined;
  readonly selfReport?: string | undefined;
  readonly disposition?: string | undefined;
  readonly by?: string | undefined;
  readonly mode?: string | undefined;
  readonly description?: string | undefined;
}

/**
 * `storytree resteer new --title … --doing … --redirect … --evidence … --disposition … --by … [--mode …] --pg`
 *
 * NO CAP, and no `--source`: every intervention is a datum, and the only producer is the retro.
 */
export async function newResteer(
  deps: ResteerDeps,
  opts: NewResteerOpts,
  ctx: ResteerContext,
): Promise<Envelope> {
  if (deps.writable !== true) {
    return {
      ok: false,
      body: [
        "`resteer new` is a live-store write and needs --pg (bring the DB up first: `pnpm db:up`).",
        "There is no offline inbox for this tier, deliberately: a re-steer is filed in the retro that",
        "immediately precedes the merge ceremony, and that ceremony already requires the live store.",
      ].join("\n"),
      next: ["pnpm db:up", "storytree resteer --help"],
    };
  }

  // Trimmed HERE rather than at the draft, so the refusal below is also the narrowing: past this
  // block all four are `string`, and the draft needs no non-null assertion to say so. (Trimming also
  // strips the trailing newline an `@path` value carries, which would otherwise be stored.)
  const title = (opts.title ?? "").trim();
  const doing = (opts.doing ?? "").trim();
  const redirect = (opts.redirect ?? "").trim();
  const evidence = (opts.evidence ?? "").trim();
  const missing = (
    [
      ["title", title],
      ["doing", doing],
      ["redirect", redirect],
      ["evidence", evidence],
    ] as const
  ).flatMap(([name, value]) => (value === "" ? [name] : []));
  if (missing.length > 0) {
    return {
      ok: false,
      body:
        `resteer new needs ${missing.map((m) => `--${m}`).join(", ")}.\n` +
        "  --doing     what the session was doing when he intervened\n" +
        "  --redirect  what he asked for instead\n" +
        "  --evidence  HIS OWN WORDS, quoted — the observed datum this tier exists for",
      next: ["storytree resteer --help"],
    };
  }

  // THE DISPOSITION FORK (ADR-0513 D4). Both halves are required, and neither is defaulted: a
  // defaulted `disposition` would silently become the commonest value in the log, and a defaulted
  // `dispositionBy` would let every agent self-characterisation read as the owner's own call — which
  // is precisely the judgement the field exists to keep separable.
  const disposition = ResteerDisposition.safeParse(opts.disposition);
  if (!disposition.success) {
    return {
      ok: false,
      body:
        `--disposition must be ${ResteerDisposition.options.join(" | ")} (got ${JSON.stringify(opts.disposition ?? null)}).\n` +
        "  defect  the system should not have produced this; it counts toward the error figure\n" +
        "  taste   the owner's preference — excluded from every error figure by construction",
      next: ["storytree resteer --help"],
    };
  }
  const by = ResteerDispositionBy.safeParse(opts.by);
  if (!by.success) {
    return {
      ok: false,
      body:
        `--by must be ${ResteerDispositionBy.options.join(" | ")} (got ${JSON.stringify(opts.by ?? null)}) — WHO called it that.\n` +
        "  owner   he said so, in words you can quote in --evidence\n" +
        "  agent   this is your reading of it, and it is recorded as such (ADR-0515 D3)\n" +
        "Do not claim `owner` for an inference: the gap between the two is a measurement, and\n" +
        "mislabelling it is the one way to make that measurement lie.",
      next: ["storytree resteer --help"],
    };
  }

  let mode: ResteerMode | undefined;
  if (opts.mode !== undefined) {
    const parsed = ResteerMode.safeParse(opts.mode);
    if (!parsed.success) {
      return {
        ok: false,
        body:
          `unknown --mode "${opts.mode}". The frame is MAST (arXiv 2503.13657) — 14 modes, the four storytree extension modes, plus one escape hatch:\n` +
          ResteerMode.options.map((m) => `  ${m}  (${MAST_CATEGORY[m]})`).join("\n") +
          "\nWhen none genuinely describes it, `no-mast-home` is the honest answer and a finding in its\nown right. Never stretch a mode to fit.",
        next: ["storytree resteer --help", "storytree library artifact mast-failure-frame"],
      };
    }
    mode = parsed.data;
  }

  const id = resteerIdFromTitle(title);
  if (id === "") {
    return { ok: false, body: "--title must contain at least one letter or digit (the id derives from it).", next: ["storytree resteer --help"] };
  }

  const date = ctx.now.slice(0, 10);
  // A NAMED contract, then the two optionals added as separate statements — the remedy BOTH anti-slop
  // rules that fired here name (`no-known-value-widening` refuses an open `Record<string, unknown>`
  // that would discard the keys it had just written; `no-conditional-empty-object-spread` refuses
  // `...(cond ? {x} : {})`, which hides an omission inside an expression). Assigning only when present
  // also keeps an absent field ABSENT rather than an explicit `undefined`, which
  // `exactOptionalPropertyTypes` and the `.strict()` schema treat differently.
  const doc: ResteerDraft = {
    kind: "resteer",
    id,
    title,
    description: (opts.description ?? redirect).trim(),
    doing,
    redirect,
    evidence,
    disposition: disposition.data,
    dispositionBy: by.data,
    provenance: { branch: ctx.branch, date, source: "retro" },
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const selfReport = (opts.selfReport ?? "").trim();
  if (selfReport !== "") doc.selfReport = selfReport;
  if (mode !== undefined) doc.mode = mode;

  // ONE parse, ONE refusal. `upcastAndValidate` checks the doc against the whole `LibraryDoc` union
  // and `Resteer.parse` narrows it to this kind — the narrowing is a PARSE, never an
  // `as unknown as Resteer` (anti-slop `no-chained-type-assertions`), because an assertion chain
  // would let a doc that validated as some OTHER kind reach an invariant written for this one.
  //
  // They share a `catch` because separating them produced a branch NO INPUT COULD REACH: this
  // function writes `kind: "resteer"` itself, so the union parse can only ever return that arm, and a
  // standalone kind-mismatch refusal was dead code. `check:mutation-diff` surfaced it, and deleting a
  // clause nothing can make load-bearing is the right answer — not writing a test that cannot reach it.
  //
  // ⚠ THE CATCH IS UNREACHABLE TODAY, AND IS KEPT ANYWAY. Every field above is a literal, a parsed
  // enum, or a string the `missing` check already proved non-empty, so no CLI input can make this
  // parse throw — `check:mutation-diff` reports its body uncovered and is right to. (I first assumed
  // `--description "   "` would reach it; the common shape's `description` is a bare `z.string()`, so
  // an empty one validates. The assumption was wrong and the test written on it is deleted.)
  //
  // It is kept rather than deleted because what makes it unreachable is the GUARDS, not the
  // validator: the day a field stops being pre-checked — a new optional flag, a loosened schema — the
  // difference is a clean refusal naming the field versus an unhandled ZodError reaching the operator
  // as a stack trace.
  //
  // Stryker disable BlockStatement,ObjectLiteral,BooleanLiteral,ArrayDeclaration,StringLiteral: UNREACHABLE by construction — no CLI input reaches this catch, so no test can kill these mutants and they are not evidence of a weak suite.
  let narrowed: Resteer;
  try {
    narrowed = Resteer.parse(upcastAndValidate(doc));
  } catch (e) {
    return {
      ok: false,
      body: [
        `re-steer failed validation:\n${explainDocValidationError(doc, e)}`,
        "",
        `(the CLI stamps ${STAMPED_FIELDS.join(", ")} for you.)`,
      ].join("\n"),
      next: ["storytree resteer --help"],
    };
  }
  // Stryker restore BlockStatement,ObjectLiteral,BooleanLiteral,ArrayDeclaration,StringLiteral

  // The defect-carries-a-mode invariant (ADR-0515 D4). It cannot live in the schema — see
  // `assertResteerInvariants` — so it is enforced here, at the only door that writes the tier.
  try {
    assertResteerInvariants(narrowed);
  } catch (e) {
    return { ok: false, body: (e as Error).message, next: ["storytree resteer --help"] };
  }

  // The evidence floor, SHARED with friction (ADR-0168 D3): present (schema) AND concrete
  // (structural). Here the intended content is narrower than the floor can check — the owner's own
  // words — so the message says so rather than leaving a paraphrase looking acceptable.
  if (!hasConcreteEvidence(evidence)) {
    return {
      ok: false,
      body:
        "--evidence must be CONCRETE — quote what he actually said. A paraphrase is your account of\n" +
        "his words, which puts generated text in the one column that is supposed to hold observed\n" +
        "behaviour (ADR-0513 D4). What you filed:\n" +
        `  evidence: ${evidence}`,
      next: ["storytree resteer --help"],
    };
  }

  if (await deps.store.getDoc(id)) {
    return {
      ok: false,
      body: `"${id}" already exists — a re-steer is one intervention, so give this one its own --title.`,
      next: [`storytree library artifact ${id} --pg`, "storytree resteer list --pg"],
    };
  }

  const saved = await deps.store.upsertDoc({
    id,
    kind: "resteer",
    doc: narrowed,
    actor: deps.actor ?? defaultCliActor(),
  });
  return {
    ok: true,
    body:
      `recorded re-steer ${saved.id} on "${ctx.branch}" (${date}) — ${disposition.data}` +
      (mode === undefined ? "" : `, ${mode}`) +
      ` (called by: ${by.data}).` +
      (disposition.data === "taste"
        ? "\nMarked TASTE: excluded from every error figure by construction (ADR-0513 D4)."
        : ""),
    next: ["storytree resteer list --pg", `storytree library artifact ${saved.id} --pg`],
  };
}

/** Read the tier and render the report. A read: no `--pg` needed. */
export async function listResteer(store: Store): Promise<Envelope> {
  const docs = await store.queryDocs({ kind: "resteer" });
  // PARSED, not asserted. An `as unknown as Resteer` over `doc: unknown` would type a malformed row
  // as valid and let it into the figures — the exact shape that produces a number nothing can catch.
  // A row that does not validate is COUNTED AND REPORTED below rather than silently dropped, because
  // a report that quietly omits rows is worse than one that says how many it could not read.
  const parsed = docs.map((d) => Resteer.safeParse(d.doc));
  const rows = parsed.flatMap((p) => (p.success ? [p.data] : []));
  const unreadable = parsed.length - rows.length;
  if (rows.length === 0) {
    return {
      ok: true,
      body: [
        "no re-steers recorded.",
        "",
        "That is a first-class, FREE outcome and it is not a marker of a skipped retro: a session the",
        "owner never redirected files nothing (ADR-0513). It also means this tier can never report an",
        "intervention RATE — see the caveats under a populated read.",
      ].join("\n"),
      // An explicit EMPTY list, not an omission — this branch is the one that must say "found
      // nothing" rather than "never plumbed", which is the whole distinction the capture records.
      observedResultIds: [],
      next: ["storytree resteer --help"],
    };
  }

  const report = resteerReport(rows);
  const { defects } = partitionResteers(rows);
  const first = defects[0];
  // Stryker disable next-line ConditionalExpression,StringLiteral: EQUIVALENT — the `undefined` arm is
  // unreachable HERE. `defectShare` is undefined only when `total === 0`, and the empty-tier branch
  // above has already returned by then, so no input to `listResteer` can reach it. The arm is kept
  // because `resteerReport`'s type genuinely admits undefined and a caller with no early return would
  // need it; `resteer-report.test.ts` covers that case on the report itself.
  const pct = (v: number | undefined): string => (v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

  const lines: string[] = [
    `${report.total} re-steers recorded — ${report.defects} defect, ${report.taste} taste.`,
    "",
    `  defect share (all taste excluded):        ${pct(report.defectShare)}`,
    `  defect share (only OWNER-marked taste):   ${pct(report.defectShareOwnerTasteOnly)}`,
    `  taste called by owner / by agent:         ${report.tasteByOwner} / ${report.tasteByAgent}`,
  ];
  if (report.tasteByAgent > 0) {
    lines.push(
      "",
      "  ⚠ the two shares differ because some taste was called by the AGENT, not the owner. The gap",
      "    between them bounds how far the system's own account is moving the headline figure.",
    );
  }

  if (report.modeDistribution.size > 0) {
    lines.push("", "FAILURE MODES (defects only)");
    for (const [mode, count] of [...report.modeDistribution.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${String(count).padStart(3)}  ${mode}  (${MAST_CATEGORY[mode]})`);
    }
  }

  lines.push("", "PER SESSION");
  for (const session of report.perSession.slice(0, 20)) {
    lines.push(`  ${String(session.defects).padStart(3)} defect  ${String(session.taste).padStart(3)} taste   ${session.branch}`);
  }

  if (unreadable > 0) {
    lines.push(
      "",
      `  ⚠ ${unreadable} stored row(s) did not validate as a re-steer and are in NO figure above.`,
      "    Every figure here is over the rows that parsed — say so if you quote one.",
    );
  }

  lines.push("", "NOT COMPUTABLE FROM THIS TIER");
  for (const caveat of report.notComputable) lines.push(`  · ${caveat}`);

  return {
    ok: true,
    body: lines.join("\n"),
    // `resteer list` is SEARCH-classified in `CLI_READ_VERBS`, so it must carry the ids it surfaced:
    // without them the traversal capture records `resultNodeIds: []` on every invocation, which is
    // unreadable as either "found nothing" or "never plumbed" (`cli-read-verbs.test.ts`).
    observedResultIds: rows.map((r) => r.id),
    next: [
      // Bound ONCE rather than indexed behind `defects.length > 0`: the length check and a `?.` on the
      // same access are two guards for one question, and the second is unfalsifiable — nothing can
      // make it fire. Narrowing a named value settles it with one.
      first === undefined ? "storytree resteer --help" : `storytree library artifact ${first.id} --pg`,
      "storytree library artifact mast-failure-frame",
    ],
  };
}

/**
 * `storytree resteer agreement --a <file> --b <file>` — the frame-validation instrument.
 *
 * Two annotators' label files (JSON arrays of `{id, mode}`) in, one {@link cohensKappa} reading out.
 * It exists as a VERB rather than a one-shot script because the number is meant to be re-derived: a
 * frame whose reliability was measured once by a script nobody can re-run is a frame whose figure
 * ages silently. Read `observed` beside `kappa` — see the reading's own doc for why.
 */
export function resteerAgreement(a: readonly Annotation[], b: readonly Annotation[]): Envelope {
  const modeReading = cohensKappa(a, b);
  const cat = (rows: readonly Annotation[]): Annotation[] =>
    rows.map((r) => ({
      id: r.id,
      label: MAST_CATEGORY[r.label as keyof typeof MAST_CATEGORY] ?? "off-frame",
    }));
  const categoryReading = cohensKappa(cat(a), cat(b));
  const named = (labels: readonly string[]): string => labels.join(", ");
  const fmt = (v: number | undefined): string => (v === undefined ? "undefined (see below)" : v.toFixed(3));
  return {
    ok: true,
    body: [
      `n = ${modeReading.n} items both annotators labelled.`,
      "",
      `MODE GRAIN     (${modeReading.categories.length} labels in play: ${named(modeReading.categories)})`,
      `  observed agreement  ${fmt(modeReading.observed)}`,
      `  expected by chance  ${fmt(modeReading.expected)}`,
      `  Cohen's kappa       ${fmt(modeReading.kappa)}`,
      "",
      `CATEGORY GRAIN (${categoryReading.categories.length} labels in play: ${named(categoryReading.categories)})`,
      `  observed agreement  ${fmt(categoryReading.observed)}`,
      `  expected by chance  ${fmt(categoryReading.expected)}`,
      `  Cohen's kappa       ${fmt(categoryReading.kappa)}`,
      "",
      "An `undefined` kappa means chance agreement was total (one label used for everything), so the",
      "statistic is 0/0. Read it as 'no reading', never as 0 or 1.",
    ].join("\n"),
    next: ["storytree library artifact mast-failure-frame"],
  };
}

/**
 * `storytree resteer agreement <fileA> <fileB>` — the I/O shell over {@link resteerAgreement}.
 *
 * Each file is a JSON array of `{id, mode}` (extra keys are ignored, so an annotator's `reason`
 * column rides along). Offline, read-only, no store.
 */
export function resteerAgreementFromFiles(
  fileA: string | undefined,
  fileB: string | undefined,
): Envelope {
  // ONE clause, not two. Positionals fill left to right, so `fileB` is undefined whenever fewer than
  // two were given — a `fileA === undefined ||` in front of it can never be the reason this fires.
  if (fileB === undefined || fileA === undefined) {
    return {
      ok: false,
      body:
        "resteer agreement needs TWO annotation files:\n" +
        "  storytree resteer agreement <annotator-a.json> <annotator-b.json>\n\n" +
        "Each is a JSON array of {id, mode} — one entry per item, from annotators who did NOT see\n" +
        "each other's answers. Independence is the whole measurement; two passes by one reader\n" +
        "measure consistency, not agreement.",
      next: ["storytree resteer --help", "storytree library artifact mast-failure-frame"],
    };
  }
  const read = (file: string): Annotation[] | string => {
    let raw: string;
    try {
      // Stryker disable next-line StringLiteral: EQUIVALENT — the only consumer is `JSON.parse`, which
      // accepts a Buffer and a string alike, so no encoding change is observable through this function.
      raw = readFileSync(file, "utf8");
    } catch (e) {
      return `could not read ${file}: ${(e as Error).message}`;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return `${file} is not valid JSON: ${(e as Error).message}`;
    }
    if (!Array.isArray(parsed)) return `${file} must be a JSON ARRAY of {id, mode} objects.`;
    const rows: Annotation[] = [];
    for (const [i, entry] of parsed.entries()) {
      if (entry === null || typeof entry !== "object") return `${file}[${i}] is not an object.`;
      // Read through an index on the parsed value rather than annotating a local as an open
      // dictionary (anti-slop `no-known-value-widening`): the annotation would discard the shape
      // `Array.isArray` just established, and `entry` is untrusted JSON either way.
      const record = entry as Readonly<Record<string, unknown>>;
      const id = record["id"];
      const mode = record["mode"];
      // Fail-closed on the shape rather than coercing: a missing `mode` silently read as "undefined"
      // would become its own agreement CATEGORY and quietly inflate the statistic.
      if (typeof id !== "string" || id === "") return `${file}[${i}] has no string "id".`;
      if (typeof mode !== "string" || mode === "") return `${file}[${i}] has no string "mode".`;
      rows.push({ id, label: mode });
    }
    return rows;
  };
  const a = read(fileA);
  if (typeof a === "string") return { ok: false, body: a, next: ["storytree resteer --help"] };
  const b = read(fileB);
  if (typeof b === "string") return { ok: false, body: b, next: ["storytree resteer --help"] };
  return resteerAgreement(a, b);
}

export function resteerHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree resteer — the owner's interventions, recorded as they happen (ADR-0515).",
      "",
      "  new         record ONE intervention (live store, --pg)",
      "  list        the report: defect/taste split, failure modes, per-session load",
      "  agreement   inter-annotator kappa for the classification frame (two JSON label files)",
      "",
      "FILE ONE:",
      "  storytree resteer new --pg \\",
      "    --title \"<short name>\" \\",
      "    --doing \"<what you were doing>\" --redirect \"<what he asked for instead>\" \\",
      "    --evidence \"<HIS OWN WORDS, quoted>\" \\",
      "    --disposition defect|taste --by owner|agent [--mode <mast-mode>] \\",
      "    [--self-report \"<what you said about it — UNVALIDATED, nothing scores it>\"]",
      "",
      "Every prose flag takes the house `@path` convention for multi-line text.",
      "",
      "THE TWO RULES THAT MATTER:",
      "  · TASTE IS NOT AN ERROR. A re-steer the owner marks as preference is excluded from every",
      "    error figure by construction — the type system refuses to count it, not a filter you have",
      "    to remember. Mark it honestly.",
      "  · YOUR OWN ACCOUNT IS THE WEAK HALF. --evidence is what HE said; --self-report is what you",
      "    said, stored in a field nothing scores. HANDBOOK.md (arXiv 2607.25398) found the agent's",
      "    self-report the least reliable artifact in the trajectory — nearly every failed run ended",
      "    claiming compliance while citing the sections it had violated.",
      "",
      "NO CAP, and NO OBLIGATION. Unlike `friction`, there is no cap-3: every intervention is a datum,",
      "and dropping the fourth would destroy the count. And 'no re-steers this session' is a",
      "first-class, FREE, unmarked outcome — capture is DISCIPLINE, never a gate rung.",
    ].join("\n"),
    next: ["storytree resteer list --pg", "storytree library artifact mast-failure-frame"],
  };
}
