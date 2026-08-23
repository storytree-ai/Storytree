import type { Store } from "@storytree/storage-protocol";
import { kebabSlug, upcastAndValidate } from "@storytree/library";
import { defaultCliActor, type Envelope } from "@storytree/drive";

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
 * What goes INSIDE those fields carries one further discipline this verb does not enforce and could
 * not: `asset:a-measured-claim-carries-its-method` (ADR-0358's Option 2E). Any live numeric or
 * measured claim written into `stakes` / `statement` / `context` names the METHOD that produced it —
 * the instrument, the sample, the moment ("self-measured, n=1" vs. "counted via `storytree
 * session-cost`, n=43") — never the bare figure. It is discipline rather than a fence because no
 * checker can read a prose field and tell a live measurement from a constant; the cost of skipping it
 * lands on the re-verifier, who is told what to re-run only if the author wrote it down. That is the
 * `verifiedAt` lease's routing input: an annotation naming no instrument is what escalates an expiry
 * from a sonnet read of a cited source to a live re-query.
 *
 *   storytree question new [<id>] --arc <arc-id> --title "…" --stakes <text|@file>
 *     --statement <text|@file> --context <text|@file> --options <text|@file>
 *     [--analogy <text|@file>] [--diagram <text|@file>] [--recommendation <text|@file>]
 *     [--description <text|@file>] --pg
 *
 *   storytree question settle <id> --answer <text|@file> [--adr <n>] --pg
 *
 * Reading stays where it already is (`library artifact list open-question --pg`).
 *
 * ADR-0434 ADDED THE TERMINAL VERB, AND IT DOES NOT DISTURB ADR-0314 D9. That decision keeps the
 * STUDIO ARC SURFACE read-only — "no comment affordance, no answering in place, no write path" — and
 * says the owner answers by prompting an agent. `settle` is the agent writing that answer down, which
 * is the flow D9 describes rather than an exception to it: the owner still does not answer through a
 * surface. What is no longer true is the sentence this header used to carry, that the verb "only ever
 * opens a question" — it now also closes one, because leaving no way to close one is what made every
 * answered question either a permanent false wait or a delete that destroyed its own answer.
 */

/** The `oq-` prefix the open-question ids carry (`oq-diff-view-altitude`, `oq-studio-store-default`). */
const QUESTION_ID_PREFIX = "oq-";

/** The id cap `kebabSlug` enforces by truncation for a derived id; enforced by REFUSAL for an authored one. */
const QUESTION_ID_CAP = 60;

/** The cap on a DERIVED one-line description before it is cut at a word boundary. */
const DERIVED_DESCRIPTION_CAP = 160;

/**
 * The default lease length (days) an open-question's `verifiedAt` stamp is trusted for before
 * `question check`/the librarian-curator sweep treats it as lease-expired (ADR-0358 Option 2B,
 * adapted from ADR-0202's park-lease). Deliberately far shorter than agent-memory's 60-day default
 * (`DEFAULT_LEASE_DAYS`, `packages/library/src/graduation/park.ts`) — the ADR-0358 incident moved a
 * live count within 3 days, and 7 is the owner-picked starting point closer to that observed decay.
 */
export const DEFAULT_QUESTION_LEASE_DAYS = 7;

/** Whole-day age of `fromIso` relative to `currentIso`; `null` if either is absent/unparseable. */
function daysSince(fromIso: string | undefined, currentIso: string): number | null {
  if (fromIso === undefined) return null;
  const from = Date.parse(fromIso);
  const now = Date.parse(currentIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return null;
  const days = Math.floor((now - from) / 86_400_000);
  return days < 0 ? 0 : days;
}

/**
 * PURE: the on-read staleness line ADR-0358 Option 2D renders — "verified N days ago", an overdue
 * variant once the lease has expired, or "UNVERIFIED" when the question predates ADR-0358 and carries
 * no `verifiedAt` at all. Shared by `arc show`'s open-questions block and `question check` so the two
 * surfaces never drift apart on wording.
 */
export function questionStalenessLine(q: { verifiedAt?: string; leaseDays?: number }, nowIso: string): string {
  const age = daysSince(q.verifiedAt, nowIso);
  if (age === null) return "UNVERIFIED — authored before ADR-0358, or verifiedAt is unparseable";
  const lease = q.leaseDays ?? DEFAULT_QUESTION_LEASE_DAYS;
  const overdue = age - lease;
  return overdue > 0
    ? `verified ${age} day${age === 1 ? "" : "s"} ago — LEASE EXPIRED ${overdue} day${overdue === 1 ? "" : "s"} ago (lease ${lease}d)`
    : `verified ${age} day${age === 1 ? "" : "s"} ago (lease ${lease}d, ${lease - age} day${lease - age === 1 ? "" : "s"} left)`;
}

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
  analogy?: string | undefined;
  diagram?: string | undefined;
  recommendation?: string | undefined;
  description?: string | undefined;
  /** ADR-0358 Option 2B — overrides {@link DEFAULT_QUESTION_LEASE_DAYS} when set; parsed as a positive integer. */
  leaseDays?: string | undefined;
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
 * The `open-question` document {@link questionNew} assembles, before `upcastAndValidate` stamps the
 * schema version. Named rather than inferred so the three OPTIONAL body halves — `analogy`,
 * `diagram`, `recommendation` — can be attached only when the author supplied them: each is ABSENT
 * from the stored row when omitted, never present-and-undefined, which is the distinction
 * `renderBody` and the `.strict()` schema both read.
 */
interface AuthoredQuestionDoc {
  kind: "open-question";
  id: string;
  title: string;
  description: string;
  stakes: string;
  statement: string;
  context: string;
  options: string;
  analogy?: string;
  diagram?: string;
  recommendation?: string;
  arcRef: string;
  references: string[];
  createdAt: string;
  updatedAt: string;
  verifiedAt: string;
  leaseDays: number;
}

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

  // ADR-0358 Option 2B — a positive integer or refuse; empty/absent defaults to DEFAULT_QUESTION_LEASE_DAYS.
  const leaseDaysRaw = opts.leaseDays?.trim() ?? "";
  let leaseDays = DEFAULT_QUESTION_LEASE_DAYS;
  if (leaseDaysRaw !== "") {
    const parsed = Number.parseInt(leaseDaysRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== leaseDaysRaw) {
      return {
        ok: false,
        body: `--lease-days must be a positive whole number of days; got "${leaseDaysRaw}".`,
        next: [USAGE],
      };
    }
    leaseDays = parsed;
  }

  const derivedDescription = opts.description === undefined;
  const description = derivedDescription ? questionDescriptionFrom(statement) : oneLine(opts.description ?? "");
  const analogy = opts.analogy?.trim() ?? "";
  const diagram = opts.diagram?.trim() ?? "";
  const recommendation = opts.recommendation?.trim() ?? "";
  const doc: AuthoredQuestionDoc = {
    kind: "open-question",
    id: questionId,
    title,
    description,
    stakes,
    statement,
    context,
    options,
    arcRef: `asset:${arc}`,
    references: [],
    createdAt: deps.now,
    updatedAt: deps.now,
    // ADR-0358 Option 2B — first authoring counts as first verification; leaseDays always stamped
    // explicitly (never left to the schema default) so `question check`/2D's render never has to
    // guess which default a given row was authored under.
    verifiedAt: deps.now,
    leaseDays,
  };
  if (analogy !== "") doc.analogy = analogy;
  if (diagram !== "") doc.diagram = diagram;
  if (recommendation !== "") doc.recommendation = recommendation;

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

/**
 * `storytree question check <id>` — ADR-0358 Option 2B's mechanical LOCATE half: reads `verifiedAt`/
 * `leaseDays` off one open-question and reports fresh vs. lease-expired, mirroring `increment check`'s
 * shape. Read-only — it never writes. Re-verifying (re-leasing, correcting in place, or retiring) goes
 * through the existing generic surfaces (`library artifact edit --set verifiedAt=<iso> --pg` /
 * `library artifact retire --pg`) exactly as ADR-0358's Context notes: the write mechanism already
 * exists, the entire gap was "who looks, and when."
 */
export async function questionCheck(deps: QuestionWriteDeps, id: string | undefined): Promise<Envelope> {
  const questionId = id?.trim().replace(/^asset:/, "") ?? "";
  if (questionId === "") {
    return { ok: false, body: "storytree question check <id> --pg — which question?", next: ["storytree library artifact list open-question --pg"] };
  }
  const doc = await deps.store.getDoc(questionId);
  if (!doc || doc.kind !== "open-question") {
    return {
      ok: false,
      body: doc
        ? `"${questionId}" is a ${doc.kind}, not an open-question.`
        : `no open-question "${questionId}"${deps.pg ? "" : " in the OFFLINE seed — questions are live-canonical; try --pg"}.`,
      next: ["storytree library artifact list open-question --pg"],
    };
  }
  const q = doc.doc as { verifiedAt?: string; leaseDays?: number };
  const line = questionStalenessLine(q, deps.now);
  const expired = q.verifiedAt !== undefined && line.includes("LEASE EXPIRED");
  return {
    ok: true,
    body: [`${questionId} — ${line}`, "", expired ? "Re-verify, then re-lease, correct-in-place, or retire:" : "No action needed."]
      .filter((s) => s !== "")
      .join("\n"),
    next: expired
      ? [
          `storytree library artifact ${questionId} --pg   (read the claim, re-check it)`,
          `storytree library artifact edit ${questionId} --set verifiedAt=<iso-now> --pg   (re-lease, unchanged)`,
          `storytree library artifact edit ${questionId} --set <field>=<value> --pg   (correct in place, drifted)`,
          // ADR-0434 D5 split what used to be one offer reading "(moot / answered)". Those are
          // different acts with different terminal verbs, and collapsing them is how an answered
          // question ended up being disposed of by a delete that took its answer with it.
          `storytree question settle ${questionId} --answer <text|@file> --pg   (ANSWERED — record what it decided)`,
          `storytree library artifact retire ${questionId} --reason "<why>" --pg   (MOOT — no answer to record)`,
        ]
      : [`storytree library artifact ${questionId} --pg`],
  };
}

/** The fields `question settle` takes (ADR-0434 D2). */
export interface QuestionSettleOpts {
  /** What the settlement RECORDS. `@path`-expandable; the verb refuses without it. */
  answer?: string | undefined;
  /** The decision that carries the answer, as a bare number — `--adr 434`. */
  adr?: string | undefined;
}

const SETTLE_USAGE = "storytree question settle <id> --answer <text|@file> [--adr <n>] --pg";

/** `adr-0434` from `434` — the id shape the decision rows carry. */
function adrIdFromNumber(n: number): string {
  return `adr-${String(n).padStart(4, "0")}`;
}

/**
 * `storytree question settle <id> --answer <text|@file> [--adr <n>]` — ADR-0434's terminal verb: the
 * one that ENDS a question by recording what it was answered with.
 *
 * ## Why this exists at all
 *
 * Before it, a question had exactly one ending — deletion — and both available outcomes were wrong.
 * Leaving the row standing meant the owning arc reported `waiting` forever, because that flag was a
 * presence count (`questions.length > 0`) that structurally could not tell an answered question from
 * an unanswered one. Retiring the row cleared the wait by destroying the answer with it: measured in
 * `retiring-an-answered-question-orphans-the-prose-that-raised-it`, the arc afterwards showed no
 * trace of either the question or what it decided, while prose elsewhere still pointed at the deleted
 * id. On 2026-08-24 `oq-retire-the-amends-edge` had been answered and executed for a day, could not
 * be retired (a friction item holds an `asset:` edge to it, and the retire gate rightly refuses over
 * live dependents), and so sat reporting a false wait with "ANSWERED AND EXECUTED" as the first line
 * of its own stakes field. That is the incident this verb closes.
 *
 * ## The one fence, and why it is not negotiable
 *
 * **`--answer` is REQUIRED.** A bare state flip would stop the arc lying about who it is waiting on
 * while still losing WHY — the same loss retirement already caused, arrived at more politely. The
 * answer is the entire content of the settlement; the lifecycle bit is just what makes it queryable.
 * `arc increment close` holds the identical line for the identical reason (ADR-0305 D2: a closure
 * that is not a landing must not be able to read as one).
 *
 * `--adr` is optional and resolved before the write, on `question new`'s fence-2 discipline: a
 * dangling `asset:` pointer passes the ref regex and satisfies nothing, so a decision that does not
 * exist is refused rather than recorded. It is appended to `references` INSIDE the patch's validate
 * callback, against the merged doc — so a reference some other session added between this read and
 * this write survives, which computing the array out here would silently drop.
 *
 * FORWARD-ONLY: a settled question refuses to be re-settled. Correcting an answer is an ordinary
 * field edit (`library artifact edit <id> --set answer=@path --pg`), which leaves the append-only
 * history a reader can follow; letting this verb overwrite would make a correction and a fresh
 * settlement indistinguishable in the log.
 *
 * DELETION SURVIVES, narrowed (ADR-0434 D5): `library artifact retire` remains right for a question
 * that was WRONG, misconceived or withdrawn — the case with no answer to record. It is no longer the
 * way to dispose of one that was answered.
 */
export async function questionSettle(
  deps: QuestionWriteDeps,
  id: string | undefined,
  opts: QuestionSettleOpts,
): Promise<Envelope> {
  if (!deps.writable) return questionNotWritable("settle");

  const questionId = id?.trim().replace(/^asset:/, "") ?? "";
  if (questionId === "") {
    return {
      ok: false,
      body: "storytree question settle <id> --answer <text|@file> --pg — which question?",
      next: [SETTLE_USAGE, "storytree library artifact list open-question --pg"],
    };
  }

  const doc = await deps.store.getDoc(questionId);
  if (!doc || doc.kind !== "open-question") {
    return {
      ok: false,
      body: doc
        ? `"${questionId}" is a ${doc.kind}, not an open-question.`
        : `no open-question "${questionId}"${deps.pg ? "" : " in the OFFLINE seed — questions are live-canonical; try --pg"}.`,
      next: ["storytree library artifact list open-question --pg"],
    };
  }

  const current = doc.doc as { lifecycle?: string; settledAt?: string; arcRef?: string };
  if (current.lifecycle === "settled") {
    const when = current.settledAt !== undefined ? ` on ${current.settledAt.slice(0, 10)}` : "";
    return {
      ok: false,
      body: [
        `${questionId} is already settled${when} — settling is forward-only, so this refuses rather than overwriting the answer on record.`,
        "",
        "Correcting what it recorded is an ordinary field edit, which leaves the change in the",
        "append-only history where a later reader can follow it.",
      ].join("\n"),
      next: [
        `storytree library artifact ${questionId} --pg   (read the answer on record)`,
        `storytree library artifact edit ${questionId} --set answer=@answer.txt --pg   (correct it in place)`,
        `storytree library artifact history ${questionId} --pg`,
      ],
    };
  }

  const answer = opts.answer?.trim() ?? "";
  if (answer === "") {
    return {
      ok: false,
      body: [
        "question settle needs the answer it is recording:",
        "  --answer <what was decided, and why>",
        "",
        "This is the whole point of the verb, not a formality. Flipping the state without recording",
        "the answer would stop the arc reporting a false wait and still lose WHY — which is the loss",
        "that retiring an answered question already caused. Long prose: @path reads the value from a",
        "file, so newlines survive the shell.",
      ].join("\n"),
      next: [SETTLE_USAGE, `storytree library artifact ${questionId} --pg   (read what was asked)`],
    };
  }

  // Resolve `--adr` BEFORE the write (the `question new` fence): a dangling decision pointer passes
  // the ref regex and surfaces nothing, so refuse rather than record one.
  let adrRef: string | undefined;
  const adrRaw = opts.adr?.trim().replace(/^adr-?/i, "") ?? "";
  if (adrRaw !== "") {
    const parsed = Number.parseInt(adrRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return {
        ok: false,
        body: `--adr takes a decision NUMBER (e.g. --adr 434); got "${opts.adr ?? ""}".`,
        next: [SETTLE_USAGE],
      };
    }
    const adrId = adrIdFromNumber(parsed);
    const adrDoc = await deps.store.getDoc(adrId);
    if (!adrDoc || adrDoc.kind !== "adr") {
      return {
        ok: false,
        body: adrDoc
          ? `"${adrId}" is a ${adrDoc.kind}, not a decision.`
          : `no decision ${adrId}${deps.pg ? "" : " in the OFFLINE seed — decisions are live-canonical; try --pg"}. A settlement pointing at a decision that does not exist records nothing, so this refuses.`,
        next: ["storytree adr list --current --pg", SETTLE_USAGE],
      };
    }
    adrRef = `asset:${adrId}`;
  }

  let saved: Awaited<ReturnType<typeof deps.store.patchDoc>>;
  try {
    saved = await deps.store.patchDoc({
      id: questionId,
      kind: "open-question",
      fields: {
        lifecycle: "settled",
        settledAt: deps.now,
        answer,
        updatedAt: deps.now,
      },
      actor: deps.actor ?? defaultCliActor(),
      // The reference is appended against the MERGED doc, inside the write — see the header. Reading
      // `references` from our own copy above and passing the whole array as a field would revert any
      // reference landed in between, which is the lost update `patchDoc` exists to prevent.
      validate: (merged) => {
        if (adrRef === undefined) return upcastAndValidate(merged);
        const bag = merged as Record<string, unknown>;
        const existing = Array.isArray(bag.references)
          ? bag.references.filter((r): r is string => typeof r === "string")
          : [];
        if (existing.includes(adrRef)) return upcastAndValidate(merged);
        return upcastAndValidate({ ...bag, references: [...existing, adrRef] });
      },
    });
  } catch (e) {
    return {
      ok: false,
      body: `that would not be a valid settled question:\n${(e as Error).message}`,
      next: [SETTLE_USAGE],
    };
  }
  if (saved === null) {
    return {
      ok: false,
      body: `open-question "${questionId}" was retired while it was being settled — nothing was written.`,
      next: ["storytree library artifact list open-question --pg"],
    };
  }

  const arc = current.arcRef?.replace(/^asset:/, "") ?? "";
  return {
    ok: true,
    body: [
      `settled ${questionId}${adrRef !== undefined ? ` (recorded by ${adrRef.replace(/^asset:/, "")})` : ""}`,
      "",
      "## The answer",
      answer,
      "",
      arc === ""
        ? "This question is homed on no arc, so no arc's waiting state changes — which is its own"
        : `${arc} no longer counts this question as waiting on the owner. The question STAYS on the`,
      arc === ""
        ? "problem (ADR-0314 D5): an unhomed question surfaces nowhere."
        : "arc, rendered under the answer above — settling records a decision, it does not erase one.",
    ].join("\n"),
    next: [
      ...(arc === "" ? [] : [`storytree arc show ${arc} --pg`]),
      `storytree library artifact ${questionId} --pg`,
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
      "         optional: [--analogy <text|@file>] [--diagram <text|@file>]",
      "                   [--recommendation <text|@file>] [--description <text|@file>]",
      `         [--lease-days <n>]   how long the claim is trusted before it needs re-verifying (default ${DEFAULT_QUESTION_LEASE_DAYS})`,
      "",
      "  storytree question check <id> --pg   — ADR-0358: is this question's claim still fresh, or",
      "         has its lease expired? Read-only; re-verify via `library artifact edit --set` / `retire`.",
      "",
      "  " + SETTLE_USAGE,
      "         — ADR-0434: END a question by RECORDING what it was answered with. The arc stops",
      "         counting it as waiting, and the question STAYS on the arc under its answer.",
      "         --answer is REQUIRED: a bare state flip would stop the arc lying about who it waits",
      "         on and still lose why, which is what deleting an answered question already did.",
      "         Forward-only — correct a recorded answer with `library artifact edit --set answer=`.",
      "",
      "  Answered vs. WRONG. `settle` is for a question that got an answer; `library artifact retire",
      "  <id> --reason \"…\" --pg` remains right for one that was misconceived or withdrawn, where",
      "  there is no answer to record. Retiring an ANSWERED question destroys the answer with it.",
      "",
      "An orchestrator that escalates MUST author one of these: escalating in chat alone is not",
      "sufficient, because the arc surface derives what is WAITING ON THE OWNER by querying these",
      "rows — a decision that lives only in a chat transcript reaches no surface at all.",
      "",
      "The bar is COLD-ANSWERABLE: stakes first (what breaks if this stays unsettled), then the",
      "question, the context with every term glossed, the options with both sides of each trade-off,",
      "and an explicitly non-binding recommendation.",
      "",
      "EXPECT TO WRITE AN --analogy AND A --diagram, not to skip them (ADR-0359 D5). They are",
      "schema-OPTIONAL because a narrow value choice needs neither — not because they are exotic.",
      "Anything structural owes both: an --analogy maps the unfamiliar onto something the reader",
      "already runs (this house thinks in organisational terms — agents are employees, the",
      "orchestrator is a manager) and says where the mapping breaks; a --diagram is a ```mermaid",
      "fence, which the studio renders as an SVG (ADR-0096).",
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
  opts: QuestionNewOpts & QuestionSettleOpts,
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return questionHelp();
  if (sub === "new") return questionNew(deps, third, opts);
  if (sub === "check") return questionCheck(deps, third);
  if (sub === "settle") return questionSettle(deps, third, opts);
  return {
    ok: false,
    body: `unknown question command "${sub}". Verbs: \`new\`, \`check <id>\`, \`settle <id>\`; reading is \`storytree library artifact list open-question --pg\`.`,
    next: [USAGE, SETTLE_USAGE, "storytree library artifact list open-question --pg"],
  };
}
