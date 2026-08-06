import type { Store } from "@storytree/storage-protocol";
import { upcastAndValidate } from "@storytree/library";

import { defaultCliActor } from "./cli-actor.js";
import { kebabSlug } from "./adr.js";
import type { Envelope } from "./envelope.js";

/**
 * `storytree question` — the OPEN-QUESTION authoring surface: the verb an escalating session uses to
 * put a decision in front of the owner (ADR-0314 D5).
 *
 * ## Why this verb exists
 *
 * ADR-0314 D5 makes authoring an `open-question` artifact MANDATORY when a session escalates to the
 * owner: "escalating in chat alone is no longer sufficient". That discipline was unfollowable at the
 * price the CLI charged for it. Every other tier had grown a scaffolder — `adr new` (ADR-0050),
 * `arc new` (the `no-arc-new-scaffolder-verb` friction), `arc increment new` (ADR-0305 D1) — while
 * raising a question still meant reading `KIND_SPECS` to learn the field set, hand-writing the whole
 * doc JSON with both timestamps stamped by hand, and filing it through `library artifact new --file`.
 *
 * The tier's measured trajectory is what makes this the load-bearing half rather than an ergonomic
 * nicety. At ADR-0314's mock round (2026-08-02) the tier held exactly ONE question and it was
 * *unhomed* — authored with no `arcRef`, so under ADR-0267 D4's derived view no arc surfaced it. Three
 * days later the tier held **zero** and all 20 active arcs reported `waiting: false`. The briefing
 * panel D3 spends the surface's whole right-hand side on renders nothing at all until questions
 * start arriving, and they will not arrive while arriving costs a hand-authored document.
 *
 * ## The two fences, both of which the schema deliberately does not hold
 *
 * `OpenQuestion.arcRef` is OPTIONAL on the schema, and that is correct there: ADR-0267's Consequences
 * chose it so every EXISTING question doc still validates and so a question can be raised before any
 * arc owns it — no `CURRENT_SCHEMA_VERSION` bump, zero migration. A permissive SCHEMA and a
 * fail-closed AUTHORING PATH are not in tension; they are the two halves of how this corpus keeps old
 * rows readable while refusing to mint new bad ones.
 *
 * So this verb holds what the schema will not:
 *
 *   1. **`--arc` is REQUIRED.** An unhomed question is not a lesser question, it is an INVISIBLE one:
 *      the arc surface derives its waiting set by querying `arcRef`, so a question without one is
 *      authored into a tier nothing reads. That is not a hypothetical — it is what the single
 *      pre-existing question did.
 *   2. **The arc must RESOLVE, to a doc that is really an arc.** A dangling `asset:` pointer is the
 *      same invisibility wearing a different costume: it passes the ref REGEX, so nothing else in the
 *      pipeline objects, and the question still surfaces on no arc. One `getDoc` before the write is
 *      the whole cost of never producing one.
 *
 * The remaining required fields are `KIND_SPECS`' own (`stakes` / `statement` / `context` / `options`)
 * — this verb adds no requirement of its own beyond the arc. `stakes` leads for the reason ADR-0267
 * gives: a question the owner must re-onboard to understand "has not moved the problem", so what
 * BREAKS if this stays unsettled is the first thing they read.
 *
 *   storytree question new [<id>] --arc <arc-id> --title "…" --stakes <text|@file>
 *     --statement <text|@file> --context <text|@file> --options <text|@file>
 *     [--diagram <text|@file>] [--recommendation <text|@file>] [--description <text|@file>] --pg
 *
 * Reading stays where it already is (`library artifact list open-question --pg`), and answering is
 * out of scope by decision, not omission: ADR-0267 D6 / ADR-0314 D9 keep this round READ-ONLY, so the
 * owner answers by prompting an agent, and this verb only ever opens a question.
 */

/** The `oq-` prefix the open-question ids carry (`oq-diff-view-altitude`, `oq-studio-store-default`). */
const QUESTION_ID_PREFIX = "oq-";

/** The id cap `kebabSlug` enforces by truncation for a derived id; enforced by REFUSAL for an authored one. */
const QUESTION_ID_CAP = 60;

/** The cap on a DERIVED one-line description before it is cut at a word boundary. */
const DERIVED_DESCRIPTION_CAP = 160;

export interface QuestionWriteDeps {
  /** The doc store — the live store under --pg (questions are live-canonical). */
  store: Store;
  /** True when the store persists (the live --pg store). A write refuses when false. */
  writable: boolean;
  /** Recorded as the event `actor` on writes; defaults to "cli". */
  actor?: string;
  /** An ISO timestamp (composition-root clock): stamps both `createdAt` and `updatedAt`. */
  now: string;
  /** True when --pg is attached — used only for the honest offline hint on a miss. */
  pg: boolean;
}

/** The body fields `question new` takes, all `@path`-expandable prose. */
export interface QuestionNewOpts {
  arc?: string | undefined;
  title?: string | undefined;
  stakes?: string | undefined;
  statement?: string | undefined;
  context?: string | undefined;
  options?: string | undefined;
  diagram?: string | undefined;
  recommendation?: string | undefined;
  description?: string | undefined;
}

/**
 * PURE: the question id `question new` derives from a `--title` when the author passes no explicit
 * id. Returns "" when the title yields no slug at all (all punctuation) — the caller refuses rather
 * than writing an id-less doc. A title that already reads as an `oq-` id is not double-prefixed.
 */
export function questionIdFromTitle(title: string): string {
  const slug = kebabSlug(title);
  if (slug === "") return "";
  return slug.startsWith(QUESTION_ID_PREFIX) ? slug : kebabSlug(`${QUESTION_ID_PREFIX}${slug}`);
}

/**
 * PURE: the SAME normalisation `kebabSlug` applies, minus its truncation — so a too-long AUTHORED id
 * is refused rather than silently shortened into a different id than the one that was typed
 * (`arc-explicit-id-fidelity`, ADR-0298 D7).
 */
function normalizeExplicitId(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** PURE: collapse prose to a single line (the Library card `description` is a one-liner). */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * PURE: the card one-liner derived from the question's `statement` when `--description` is omitted.
 *
 * `description` is a required common field and `statement` is already "the decision to settle, in one
 * sentence" (KIND_SPECS), so asking for both would re-introduce the redundancy the scaffolder exists
 * to remove. `--description` overrides, so the derivation never has to be right, only reasonable.
 */
export function questionDescriptionFrom(statement: string): string {
  const flat = oneLine(statement);
  const firstSentence = /^(.+?[.!?])(?:\s|$)/.exec(flat)?.[1] ?? flat;
  if (firstSentence.length <= DERIVED_DESCRIPTION_CAP) return firstSentence;
  const cut = firstSentence.slice(0, DERIVED_DESCRIPTION_CAP);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]+$/, "")}…`;
}

/** Guidance when a question WRITE is attempted offline — questions live only in the shared store. */
function questionNotWritable(verb: string): Envelope {
  return {
    ok: false,
    body: `question ${verb} writes to the shared store — run with --pg (and bring the DB up first: pnpm db:up).`,
    next: ["pnpm db:up", `storytree question ${verb} --arc <arc-id> --title "…" --pg`],
  };
}

const USAGE =
  'storytree question new [<id>] --arc <arc-id> --title "…" --stakes <text|@file> --statement <text|@file> --context <text|@file> --options <text|@file> --pg';

/**
 * `storytree question new` — SCAFFOLD an open question through the validated write path.
 *
 * The author supplies the arc, the title, and the four required body fields. The CLI owns `kind`;
 * `id` (derived from the title unless one is passed); `description` (derived from the statement
 * unless passed); `arcRef` (the `asset:` pointer, from the resolved `--arc`); `references`;
 * `schemaVersion` (via the upcaster); and both timestamps.
 *
 * Nothing here authors an edge on the ARC. ADR-0183 D3's containment rule puts it on the child, so
 * the arc's waiting view assembles itself by query the moment this row exists.
 */
export async function questionNew(
  deps: QuestionWriteDeps,
  id: string | undefined,
  opts: QuestionNewOpts,
): Promise<Envelope> {
  if (!deps.writable) return questionNotWritable("new");

  const arc = opts.arc?.trim().replace(/^asset:/, "") ?? "";
  const title = opts.title?.trim() ?? "";
  const stakes = opts.stakes?.trim() ?? "";
  const statement = opts.statement?.trim() ?? "";
  const context = opts.context?.trim() ?? "";
  const options = opts.options?.trim() ?? "";

  // One refusal naming EVERYTHING missing — learning five required fields through five round-trips is
  // the schema-spelunking cost this verb exists to remove, in a different costume (the `arc new`
  // precedent).
  const missing = [
    arc === "" ? "--arc <arc-id>            the arc this question is waiting on" : null,
    title === "" ? '--title "<the question, short>"' : null,
    stakes === "" ? "--stakes <what breaks, or what job is blocked, if this stays unsettled>" : null,
    statement === "" ? "--statement <the decision to settle, in one sentence>" : null,
    context === "" ? "--context <why it is open now — forces, constraints, what is blocked; gloss every term>" : null,
    options === "" ? "--options <the candidate answers, each with its trade-off — name both sides>" : null,
  ].filter((s): s is string => s !== null);
  if (missing.length > 0) {
    return {
      ok: false,
      body: [
        `question new needs ${missing.length === 1 ? "one more field" : `${missing.length} more fields`}:`,
        ...missing.map((m) => `  ${m}`),
        "",
        "The bar is a briefing the owner can answer COLD (ADR-0267): enough context attached to answer",
        "the question rather than merely find it. Long prose: @path reads the value from a file, so",
        "newlines survive the shell.",
      ].join("\n"),
      next: [USAGE, "storytree arc list --pg   (which arc is this waiting on?)"],
    };
  }

  // An explicit positional id is taken as AUTHORED (normalised only); otherwise derive from the title.
  const wanted = id?.trim().replace(/^asset:/, "") ?? "";
  if (wanted !== "") {
    const normalized = normalizeExplicitId(wanted);
    if (normalized.length > QUESTION_ID_CAP) {
      return {
        ok: false,
        body: `the explicit id "${wanted}" normalises to ${normalized.length} characters, past the ${QUESTION_ID_CAP}-character id cap — creating it would silently truncate to a DIFFERENT id than the one you typed. Shorten it and try again.`,
        next: [USAGE],
      };
    }
  }

  const questionId = wanted !== "" ? kebabSlug(wanted) : questionIdFromTitle(title);
  if (questionId === "") {
    return {
      ok: false,
      body: `could not derive a question id from the title "${title}" — use letters/numbers, or pass an explicit id: storytree question new <id> --arc ${arc} --pg`,
      next: [USAGE],
    };
  }

  // FENCE 1+2 (see the module header): the arc must exist AND be an arc. A question whose `arcRef`
  // resolves to nothing surfaces on no arc — the same invisibility as authoring none, which is the
  // one failure this tier has actually produced.
  const arcDoc = await deps.store.getDoc(arc);
  if (!arcDoc || arcDoc.kind !== "arc") {
    return {
      ok: false,
      body: arcDoc
        ? `"${arc}" is a ${arcDoc.kind}, not an arc — a question waits on the INITIATIVE, so --arc must name one.`
        : `no arc "${arc}"${deps.pg ? "" : " in the OFFLINE seed — arcs are live-canonical; try --pg"}. A question with a dangling arc ref surfaces on no arc at all, so this refuses rather than writing one.`,
      next: ["storytree arc list --pg", 'storytree arc new --title "…" --intent <text|@file> --end-state <text|@file> --pg'],
    };
  }

  // Creation refuses an id that EXISTS — `library artifact new`'s edit-first guard, kept here so a
  // scaffolder can never silently overwrite a live artifact.
  const clash = await deps.store.getDoc(questionId);
  if (clash) {
    return {
      ok: false,
      body:
        clash.kind === "open-question"
          ? [
              `question ${questionId} already exists — edit it, don't recreate it (a scaffold here would overwrite a live question).`,
              wanted === "" ? `(that id was DERIVED from the title "${title}" — pass an explicit id to raise a different question.)` : "",
            ]
              .filter((s) => s !== "")
              .join("\n")
          : `"${questionId}" is already a ${clash.kind}, not a question — ids are shared across kinds, so pick another: storytree question new <id> --arc ${arc} --pg`,
      next:
        clash.kind === "open-question"
          ? [`storytree library artifact ${questionId} --pg`, `storytree library artifact edit ${questionId} --pg`]
          : [USAGE],
    };
  }

  const derivedDescription = opts.description === undefined;
  const description = derivedDescription ? questionDescriptionFrom(statement) : oneLine(opts.description ?? "");
  const diagram = opts.diagram?.trim() ?? "";
  const recommendation = opts.recommendation?.trim() ?? "";
  const doc: Record<string, unknown> = {
    kind: "open-question",
    id: questionId,
    title,
    description,
    stakes,
    statement,
    context,
    options,
    ...(diagram !== "" ? { diagram } : {}),
    ...(recommendation !== "" ? { recommendation } : {}),
    arcRef: `asset:${arc}`,
    references: [],
    createdAt: deps.now,
    updatedAt: deps.now,
  };

  let valid: unknown;
  try {
    valid = upcastAndValidate(doc);
  } catch (e) {
    return {
      ok: false,
      body: `that would not be a valid open question:\n${(e as Error).message}`,
      next: [USAGE],
    };
  }
  const saved = await deps.store.upsertDoc({
    id: questionId,
    kind: "open-question",
    doc: valid,
    actor: deps.actor ?? defaultCliActor(),
  });

  return {
    ok: true,
    body: [
      `raised question ${saved.id} on arc ${arc}`,
      "",
      `# ${title}`,
      `**Why this matters.** ${stakes}`,
      "",
      "## The question",
      statement,
      ...(recommendation !== "" ? ["", "## Recommendation", `${recommendation}`, "(non-binding until the owner decides.)"] : []),
      ...(wanted === "" || derivedDescription
        ? [
            "",
            ...(wanted === "" ? [`id derived from the title: ${saved.id}   (pass an explicit id to override)`] : []),
            ...(derivedDescription ? [`description derived from the statement: ${description}`] : []),
          ]
        : []),
      "",
      // Where the arc's waiting state comes from, said where it is earned rather than left to memory.
      `${arc} now reads as WAITING — the arc's question view is derived from this row's arcRef`,
      "(ADR-0183 D3), so nothing is authored on the arc itself. Escalating is a LANDING, not a wait",
      "(ADR-0303): write the arc's residue, release your claims, and end.",
    ].join("\n"),
    next: [
      `storytree arc show ${arc} --pg`,
      `storytree library artifact ${saved.id} --pg`,
      `storytree library artifact edit ${saved.id} --pg   (correct it in place)`,
    ],
  };
}

/** The `storytree question` guidance page (ADR-0023 envelope). */
export function questionHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree question — put a decision in front of the owner (ADR-0314 D5).",
      "",
      "  " + USAGE,
      "         optional: [--diagram <text|@file>] [--recommendation <text|@file>] [--description <text|@file>]",
      "",
      "An orchestrator that escalates MUST author one of these: escalating in chat alone is not",
      "sufficient, because the arc surface derives what is WAITING ON THE OWNER by querying these",
      "rows — a decision that lives only in a chat transcript reaches no surface at all.",
      "",
      "The bar is COLD-ANSWERABLE: stakes first (what breaks if this stays unsettled), then the",
      "question, the context with every term glossed, the options with both sides of each trade-off,",
      "and — optionally — a diagram and an explicitly non-binding recommendation.",
      "",
      "--arc is REQUIRED even though the schema leaves arcRef optional: an unhomed question is an",
      "invisible one. Answering stays out of band this round (ADR-0314 D9) — the owner answers by",
      "prompting an agent, and this surface only ever opens the question.",
      "",
      "read them:  storytree library artifact list open-question --pg",
      "            storytree arc show <arc-id> --pg   (the questions derived onto one arc)",
    ].join("\n"),
    next: [USAGE, "storytree library artifact list open-question --pg"],
  };
}

/** Dispatch for the `question` area. */
export async function questionCommand(
  sub: string | undefined,
  third: string | undefined,
  deps: QuestionWriteDeps,
  opts: QuestionNewOpts,
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return questionHelp();
  if (sub === "new") return questionNew(deps, third, opts);
  return {
    ok: false,
    body: `unknown question command "${sub}". The authoring verb is \`new\`; reading is \`storytree library artifact list open-question --pg\`.`,
    next: [USAGE, "storytree library artifact list open-question --pg"],
  };
}
