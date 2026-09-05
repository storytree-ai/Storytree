import {
  DecisionAuthority,
  AuthorityBasis,
  explainDocValidationError,
  hasQuotedOwnerDirective,
  isOwnerBasis,
  upcastAndValidate,
} from "@storytree/library";
import { adrDocId } from "@storytree/library/adr-doc";
import type { Store, StoredDoc } from "@storytree/storage-protocol";

import { parseDecisionArg } from "./adr-round-trip.js";
import { defaultCliActor } from "./cli-actor.js";
import type { Envelope } from "./envelope.js";

/**
 * `storytree adr attest` — the ONLY way to stamp a decision that already exists (ADR-0519 D2/D5).
 *
 * ## The gap this closes
 *
 * ADR-0519 put the authority stamp on the row and gave it exactly one writer, `scaffoldRow`, which
 * runs at CREATION. That is what keeps the stamp out of reach of the standing instruction to correct
 * accepted prose in place (ADR-0139) — but it also left NO path at all to stamp the ~500 decisions
 * that already existed, including ADR-0519 itself. `library artifact edit --set` cannot fill the
 * gap: `--set` coerces its value to a string or parses it as a JSON ARRAY, and `authority` is an
 * OBJECT, so the write could never validate.
 *
 * So this is a second writer, on the `adr compose` (ADR-0428) / `adr rebind` (ADR-0438) precedent —
 * both of which write row-only fields after creation through their own verb. The row-only property
 * is unchanged: what ADR-0519 D2 forbids is the stamp travelling through the DOCUMENT, where a
 * prose correction round-trips it. A dedicated verb is the opposite of that — it cannot be reached
 * by editing prose, and it says out loud what it is doing.
 *
 * ⚠ THE `authority` FIELD DOCSTRING'S "Do not wire the other three" IS NOT ABOUT THIS VERB, and the
 * misreading is natural enough to be worth settling here once. The "four writers" a decision field
 * owes are the DOCUMENT-PATH ones — `AdrMeta`, `FRONTMATTER_ORDER`/`renderAdrDocument`, `adrPush`'s
 * named spread, and the row writer — and the instruction is to keep `authority` out of the first
 * three. `sources` is the proof that this says nothing about a verb: it carries the SAME
 * three-writer prohibition (`adr-sources.test.ts`) AND has `adr rebind` writing it after creation.
 * A post-creation verb and the document fence are orthogonal, and this verb honours the fence.
 *
 * ## Three fences, and each is load-bearing
 *
 * 1. **`scribedBy` is never a flag.** It is always the CURRENT session. The field's whole claim is
 *    that it is "the only field here nobody has to be trusted about, since the store observes it
 *    independently in `events.library_event.actor`" — and that property holds ONLY while it names
 *    the writer of the stamp. A `--scribed-by` flag would let a caller fake the one corroborated
 *    field on the record, so there is none.
 * 2. **An existing stamp is not overwritten.** Re-stamping needs the explicit `--restamp`, the
 *    `--allow-control-arm` shape: evidence a later pass can quietly rewrite is not evidence, and a
 *    verb that silently upserted would put the stamp straight back inside the reach of the routine
 *    correction ADR-0519 D2 exists to keep it out of.
 * 3. **The backfill TRANSCRIBES; it never verifies.** {@link classifyFromProse} matches the two
 *    EXACT phrases ADR-0519 D5 names and nothing else. Widening it toward the ~200 rows that phrase
 *    their authority freely is the reconstruction D5 forbids, and an unstamped row is an honest
 *    absence rather than a hole to be filled.
 */

/** `ADR-0519` from `519` — the label every message here uses. */
const label = (n: number): string => `ADR-${String(n).padStart(4, "0")}`;

/**
 * ADR-0519 D5's first exact phrase: the stock sentence `adr new --decided` has always scaffolded.
 *
 * It is a fixed string the CLI writes, never something an author typed — which is what makes it
 * mechanically classifiable at all, and what bounds the backfill to rows whose claim was made by a
 * known writer in a known form.
 */
const STOCK_OWNER_PHRASE = /decided\/directed by the owner in conversation/;

/**
 * ADR-0519 D5's second exact phrase: an ADR-0084 green flip, as the flipping session recorded it.
 *
 * The gap between the two anchors is bounded rather than open (`[\s\S]{0,80}?`) so this cannot span
 * from a "flipped from proposed" in one paragraph to an unrelated "ADR-0084" several paragraphs
 * later — a match that reached across a section break would be exactly the loose read D5 refuses.
 */
const AGENT_FLIP_PHRASE = /flipped from proposed[\s\S]{0,80}?under ADR-0084/i;

/**
 * PURE: the text of a decision's `## Status` section, or `""` when it has none.
 *
 * Fenced code is stripped FIRST, the discipline `extractAdrTitle` keeps for the same reason: a
 * decision quoting another decision's `## Status` heading inside a ``` block would otherwise have
 * the quoted section read as its own — and here that would mean classifying a record by prose
 * describing a DIFFERENT record's authority.
 */
export function statusSectionOf(body: string): string {
  const stripped = body.replace(/```[\s\S]*?```/g, "");
  const m = /^##[ \t]+Status\b([\s\S]*?)(?=^##[ \t]|$(?![\s\S]))/m.exec(stripped);
  return m?.[1] ?? "";
}

/** What a mechanically-classifiable row yields: the stamp minus the two fields only a writer knows. */
export interface ProseClassification {
  readonly basis: AuthorityBasis;
  /** ADR-0519 D5's marker. Set on the owner phrase; ABSENT on the flip — see {@link classifyFromProse}. */
  readonly transcribedFromProse?: true;
}

/**
 * PURE: classify one decision's authority from its `## Status` prose, or `null` for "leave it alone".
 *
 * ⚠ THE FLIP PHRASE CARRIES NO `transcribedFromProse`, AND THAT IS THE SCHEMA'S CALL RATHER THAN A
 * CHOICE MADE HERE. The increment that ordered this backfill said to mark every stamped row
 * transcribed; `DecisionAuthority` refuses that outright — its last refinement makes the marker
 * meaningless on a non-owner basis, because the marker's job is to let a reader DISCOUNT a
 * backfilled claim of the OWNER's authority, and `agent-flipped` claims none. The premise was
 * refuted at its own source, so the classifier follows the schema.
 *
 * ⚠ A ROW MATCHING BOTH PHRASES IS LEFT UNSTAMPED, not resolved to the weaker one. No row in the
 * live log does today (measured 2026-09-05: 291 stock, 15 flip, 0 both), so this is a fence on a
 * future record rather than a live branch. A record whose prose claims BOTH that the owner directed
 * it AND that an agent flipped it is genuinely ambiguous about whose call it was, which is the exact
 * shape D5 says to leave alone rather than guess: picking either would record a certainty the prose
 * does not support.
 */
export function classifyFromProse(body: string): ProseClassification | null {
  const status = statusSectionOf(body);
  const stock = STOCK_OWNER_PHRASE.test(status);
  const flip = AGENT_FLIP_PHRASE.test(status);
  if (stock && flip) return null;
  if (stock) return { basis: "owner-directed", transcribedFromProse: true };
  if (flip) return { basis: "agent-flipped" };
  return null;
}

/** What the verb needs. `today` is injected for the reason `adr compose`'s is: a module that stamps its own date cannot be tested for what it stamps. */
export interface AdrAttestDeps {
  readonly store: Store;
  /** `--pg` + a real connection. Every WRITE refuses without it; every read shape works regardless. */
  readonly writable: boolean;
  readonly actor?: string | undefined;
  /** Today as `YYYY-MM-DD` — what a fresh stamp records as `at`. */
  readonly today: string;
}

export interface AdrAttestOpts {
  /** `--basis <b>` — supplying it makes this a WRITE. Absent, a numbered call READS the stamp. */
  readonly basis?: string | undefined;
  /** `--owner-said <text|@file>` — the owner's verbatim directive. Owed by an owner basis, refused on an agent one. */
  readonly ownerSaid?: string | undefined;
  /** `--transcribed-from-prose` — ADR-0519 D5's marker, for a stamp read off the record's own prose. */
  readonly transcribedFromProse?: boolean | undefined;
  /** `--backfill` — classify every unstamped row by D5's two exact phrases. A DRY RUN without `--pg`. */
  readonly backfill?: boolean | undefined;
  /** `--restamp` — the explicit escape from fence 2. Never implied by anything else. */
  readonly restamp?: boolean | undefined;
}

/** One decision row, narrowed to what every shape here reads. */
interface AttestRow {
  readonly id: string;
  readonly number: number;
  readonly bag: Record<string, unknown>;
  readonly authority: DecisionAuthority | undefined;
  readonly status: string;
  readonly body: string;
}

/**
 * Read the stored `authority` back as a TYPED stamp, or `undefined`.
 *
 * `safeParse` rather than a cast: a row whose stamp does not satisfy today's schema reads as
 * UNSTAMPED here, which is the fail-closed direction — the alternative is a filter and a health rung
 * both trusting a shape neither has checked.
 */
function authorityOf(bag: Record<string, unknown>): DecisionAuthority | undefined {
  if (bag["authority"] === undefined) return undefined;
  const parsed = DecisionAuthority.safeParse(bag["authority"]);
  return parsed.success ? parsed.data : undefined;
}

function attestRowsOf(docs: readonly StoredDoc[]): AttestRow[] {
  const rows: AttestRow[] = [];
  for (const doc of docs) {
    const bag = (typeof doc.doc === "object" && doc.doc !== null ? doc.doc : {}) as Record<string, unknown>;
    const number = typeof bag["number"] === "number" ? bag["number"] : Number.NaN;
    if (!Number.isFinite(number)) continue;
    rows.push({
      id: doc.id,
      number,
      bag,
      authority: authorityOf(bag),
      status: typeof bag["status"] === "string" ? bag["status"] : "",
      body: typeof bag["body"] === "string" ? bag["body"] : "",
    });
  }
  return rows.sort((a, b) => a.number - b.number);
}

/** One line describing a stamp, in the three-state form {@link hasQuotedOwnerDirective} exists to keep separable. */
export function describeAuthority(authority: DecisionAuthority | undefined): string {
  if (authority === undefined) return "unstamped — nobody has recorded whose call this was";
  const provenance = hasQuotedOwnerDirective(authority)
    ? "quoted owner directive"
    : authority.transcribedFromProse === true
      ? "transcribed from the record's own prose — no owner words were ever captured"
      : "declared, no quote";
  return `${authority.basis} (${provenance}) · scribed by ${authority.scribedBy} on ${authority.at}`;
}

/**
 * `storytree adr attest [<n>] [--basis <b>] [--owner-said <t>] [--transcribed-from-prose] [--backfill] [--restamp] [--pg]`
 *
 * FOUR SHAPES, chosen by what the caller supplied rather than by a mode flag — the `adr compose`
 * shape, for the same reason: a READ is what a caller gets by naming less.
 *
 *   - nothing            → the coverage index: how much of the log declares a basis, and of what.
 *   - `--backfill`       → D5's mechanical pass. A DRY RUN without `--pg`; applies with it.
 *   - a number           → read one record's stamp.
 *   - a number + `--basis` → stamp it.
 */
export async function adrAttest(
  numberArg: string | undefined,
  opts: AdrAttestOpts,
  deps: AdrAttestDeps,
): Promise<Envelope> {
  const rows = attestRowsOf(await deps.store.queryDocs({ kind: "adr" }));
  if (rows.length === 0) {
    return {
      ok: false,
      body: "no decisions in the store. (they live there since ADR-0403 — is the DB up?)",
      next: ["pnpm db:up", "storytree adr list --current"],
    };
  }

  if (opts.backfill === true) {
    if (numberArg !== undefined) {
      return {
        ok: false,
        body: `--backfill stamps the whole log by ADR-0519 D5's two exact phrases; it takes no decision number (got ${JSON.stringify(numberArg)}).`,
        next: ["storytree adr attest --backfill", `storytree adr attest ${numberArg} --basis agent-derived --pg`],
      };
    }
    return await backfill(rows, opts, deps);
  }

  if (numberArg === undefined) return coverageIndex(rows);

  const number = parseDecisionArg(numberArg);
  if (number === null) {
    return {
      ok: false,
      body: `expected a decision NUMBER (got ${JSON.stringify(numberArg)}).`,
      next: ["storytree adr attest 519", "storytree adr attest"],
    };
  }
  const id = adrDocId(number);
  const row = rows.find((r) => r.id === id);
  if (row === undefined) {
    return {
      ok: false,
      body: `no decision row "${id}" in the store.`,
      next: ["storytree adr list --current", "storytree adr attest"],
    };
  }

  if (opts.basis === undefined) return attestRead(row, opts);
  return await attestOne(row, opts, deps);
}

/** `storytree adr attest <n>` — read one record's stamp. */
function attestRead(row: AttestRow, opts: AdrAttestOpts): Envelope {
  const lines = [`${label(row.number)} — ${describeAuthority(row.authority)}`];
  if (row.authority?.ownerSaid !== undefined) {
    lines.push("", "The owner's words, verbatim:", ...row.authority.ownerSaid.split("\n").map((l) => `  > ${l}`));
  }
  if (row.authority === undefined) {
    const classified = classifyFromProse(row.body);
    lines.push(
      "",
      classified === null
        ? "Its `## Status` prose carries neither phrase ADR-0519 D5 classifies mechanically, so the\n" +
          "backfill leaves it alone. That is an honest absence — stamp it by hand only if you KNOW\n" +
          "whose call it was; do not read a basis out of prose the classifier declined."
        : `The backfill would read it as \`${classified.basis}\` from its own prose ` +
          `(\`storytree adr attest --backfill\` to see the whole pass).`,
    );
  }
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      `storytree library artifact ${row.id}`,
      opts.basis === undefined && row.authority === undefined
        ? `storytree adr attest ${String(row.number)} --basis agent-derived --pg`
        : "storytree adr attest",
    ],
  };
}

/** `storytree adr attest <n> --basis <b> …` — stamp one record. */
async function attestOne(row: AttestRow, opts: AdrAttestOpts, deps: AdrAttestDeps): Promise<Envelope> {
  const parsedBasis = AuthorityBasis.safeParse(opts.basis);
  if (!parsedBasis.success) {
    return {
      ok: false,
      body: `--basis must be one of ${AuthorityBasis.options.join(" | ")} (got ${JSON.stringify(opts.basis)}).`,
      next: [`storytree adr attest ${String(row.number)}`],
    };
  }
  // FENCE 2. Refused BEFORE the write gate, so a caller without `--pg` still learns the stamp exists
  // rather than being told to re-run with a flag that would then be refused for a different reason.
  if (row.authority !== undefined && opts.restamp !== true) {
    return {
      ok: false,
      body: [
        `${label(row.number)} is ALREADY stamped and was not overwritten:`,
        `  ${describeAuthority(row.authority)}`,
        "",
        "A stamp is EVIDENCE (ADR-0519 D2), and evidence a later pass can quietly rewrite is not",
        "evidence. Re-stamping is therefore explicit rather than implied: --restamp.",
        "",
        "If this stamp is WRONG, say so out loud — re-stamp it and record why in the decision's own",
        "prose. If you are merely correcting the record's text, you do not need this verb at all: the",
        "stamp is deliberately out of `adr push`'s reach, which is what it is for.",
      ].join("\n"),
      next: [`storytree adr attest ${String(row.number)}`, `storytree library artifact ${row.id}`],
    };
  }
  if (!deps.writable) {
    return {
      ok: false,
      body: "attesting writes to the shared store — run with --pg (and bring the DB up first: pnpm db:up).",
      next: ["pnpm db:up", `storytree adr attest ${String(row.number)} --basis ${parsedBasis.data} --pg`],
    };
  }

  const draft: DecisionAuthority = {
    basis: parsedBasis.data,
    // FENCE 1: the CURRENT session, never a flag. See the module header.
    scribedBy: deps.actor ?? defaultCliActor(),
    at: deps.today,
  };
  const said = opts.ownerSaid?.trim() ?? "";
  if (said !== "") draft.ownerSaid = said;
  if (opts.transcribedFromProse === true) draft.transcribedFromProse = true;
  const parsed = DecisionAuthority.safeParse(draft);
  if (!parsed.success) {
    // The schema's own messages carry the rules (D3's "quote him or use agent-derived", D5's
    // fences), so surface them rather than restating them here and letting the two drift.
    return {
      ok: false,
      body: parsed.error.issues.map((i) => i.message).join("\n"),
      next: [`storytree adr attest ${String(row.number)}`],
    };
  }

  const written = await writeStamp(row, parsed.data, deps);
  if (!written.ok) return written.envelope;
  return {
    ok: true,
    body: [
      `${row.authority === undefined ? "stamped" : "RE-STAMPED"} ${row.id}:`,
      `  ${describeAuthority(parsed.data)}`,
      ...(parsed.data.ownerSaid === undefined
        ? []
        : ["", "The owner's words, verbatim:", ...parsed.data.ownerSaid.split("\n").map((l) => `  > ${l}`)]),
    ].join("\n"),
    next: [`storytree library artifact ${row.id}`, "storytree adr attest"],
  };
}

/** The one write, shared by the single stamp and the backfill so both validate identically. */
async function writeStamp(
  row: AttestRow,
  authority: DecisionAuthority,
  deps: AdrAttestDeps,
): Promise<{ ok: true } | { ok: false; envelope: Envelope }> {
  const updated = { ...row.bag, authority, updatedAt: new Date().toISOString() };
  let doc: ReturnType<typeof upcastAndValidate>;
  try {
    doc = upcastAndValidate(updated);
  } catch (e) {
    return {
      ok: false,
      envelope: {
        ok: false,
        body: [
          `${row.id} was NOT written — the updated row does not satisfy the \`adr\` schema:`,
          "",
          explainDocValidationError(updated, e, { storedKeys: Object.keys(row.bag) }),
        ].join("\n"),
        next: [`storytree library artifact ${row.id}`],
      },
    };
  }
  await deps.store.upsertDoc({ id: row.id, kind: "adr", doc, actor: deps.actor ?? defaultCliActor() });
  return { ok: true };
}

/**
 * `storytree adr attest --backfill [--pg]` — ADR-0519 D5's mechanical pass.
 *
 * A DRY RUN without `--pg`, which is the useful default rather than a safety afterthought: the pass
 * is only ever worth running once, and what a reader wants first is to see WHICH rows it would touch
 * and on what evidence.
 *
 * It never touches a row that already carries a stamp, `--restamp` or not: a backfill that could
 * overwrite an authored stamp would let a bulk pass silently replace a quoted owner directive with a
 * phrase-matched transcription — the exact inversion of what D5 is for.
 */
async function backfill(
  rows: readonly AttestRow[],
  opts: AdrAttestOpts,
  deps: AdrAttestDeps,
): Promise<Envelope> {
  if (opts.restamp === true) {
    return {
      ok: false,
      body: [
        "--restamp is refused on --backfill, and not merely unimplemented.",
        "",
        "A bulk pass that could overwrite would replace an AUTHORED stamp — a quoted owner directive,",
        "given in a session where he actually spoke — with a phrase match read off prose. That is the",
        "inversion of ADR-0519 D5, which exists to TRANSCRIBE what nobody captured, never to overwrite",
        "what somebody did. Re-stamp records one at a time, where the choice is visible.",
      ].join("\n"),
      next: ["storytree adr attest --backfill"],
    };
  }
  const unstamped = rows.filter((r) => r.authority === undefined);
  const planned: { row: AttestRow; authority: DecisionAuthority }[] = [];
  const scribedBy = deps.actor ?? defaultCliActor();
  for (const row of unstamped) {
    const classified = classifyFromProse(row.body);
    if (classified === null) continue;
    const draft: DecisionAuthority = { basis: classified.basis, scribedBy, at: deps.today };
    if (classified.transcribedFromProse === true) draft.transcribedFromProse = true;
    const parsed = DecisionAuthority.safeParse(draft);
    // Unreachable through {@link classifyFromProse}'s two outputs, and checked anyway: this is the
    // one place a classifier change could start minting stamps the schema refuses, and finding that
    // out per row beats finding it out on the 200th write of a partially-applied pass.
    if (!parsed.success) continue;
    planned.push({ row, authority: parsed.data });
  }

  const byBasis = new Map<string, number>();
  for (const p of planned) byBasis.set(p.authority.basis, (byBasis.get(p.authority.basis) ?? 0) + 1);
  const breakdown = [...byBasis].sort().map(([b, n]) => `  ${String(n).padStart(4)}  ${b}`);
  const leftAlone = unstamped.length - planned.length;

  if (!deps.writable) {
    return {
      ok: true,
      body: [
        `DRY RUN — ${String(planned.length)} of ${String(unstamped.length)} unstamped decisions are mechanically classifiable.`,
        "",
        ...breakdown,
        "",
        `  ${String(leftAlone).padStart(4)}  left UNSTAMPED — their \`## Status\` carries neither exact phrase`,
        `  ${String(rows.length - unstamped.length).padStart(4)}  already stamped, untouched by this pass`,
        "",
        "Every stamp this would write is a TRANSCRIPTION of a claim an agent already made in prose,",
        "never a verification of one, and none carries `ownerSaid` — those words were never captured,",
        "and reconstructing them from a summary would forge the evidence the field exists to make",
        "trustworthy (ADR-0519 D5).",
        "",
        "Re-run with --pg to apply.",
      ].join("\n"),
      next: ["pnpm db:up", "storytree adr attest --backfill --pg", "storytree adr attest"],
    };
  }

  const failures: string[] = [];
  let written = 0;
  for (const { row, authority } of planned) {
    const result = await writeStamp(row, authority, deps);
    if (result.ok) written += 1;
    // A partial pass is REPORTED, never rolled back and never retried in a loop: each stamp is an
    // independent row, re-running the backfill simply skips the ones that landed, and a pass that
    // hid its failures behind a retry would report a coverage it had not achieved.
    else failures.push(`${row.id}: ${result.envelope.body}`);
  }
  return {
    ok: failures.length === 0,
    body: [
      `stamped ${String(written)} of ${String(planned.length)} classifiable decisions.`,
      "",
      ...breakdown,
      "",
      `  ${String(leftAlone).padStart(4)}  left UNSTAMPED — an honest absence, not a hole to fill (ADR-0519 D5)`,
      ...(failures.length === 0 ? [] : ["", `⚠ ${String(failures.length)} row(s) FAILED:`, ...failures]),
    ].join("\n"),
    next: ["storytree adr attest", "storytree adr list --current"],
  };
}

/**
 * `storytree adr attest` — how much of the log declares a basis.
 *
 * ⚠ EVERY FIGURE HERE NAMES ITS DENOMINATOR, and that is a correctness requirement rather than
 * politeness. ADR-0519 D5 leaves ~41% of the log permanently unstamped by design, so a percentage
 * printed over the stamped rows alone would read as a coverage claim about the whole decision log —
 * the shape a reader cannot detect FROM the view.
 */
function coverageIndex(rows: readonly AttestRow[]): Envelope {
  const stamped = rows.filter((r) => r.authority !== undefined);
  const byBasis = new Map<string, number>();
  let quoted = 0;
  let transcribed = 0;
  for (const r of stamped) {
    const a = r.authority as DecisionAuthority;
    byBasis.set(a.basis, (byBasis.get(a.basis) ?? 0) + 1);
    if (hasQuotedOwnerDirective(a)) quoted += 1;
    if (a.transcribedFromProse === true) transcribed += 1;
  }
  const ownerClaims = stamped.filter((r) => isOwnerBasis((r.authority as DecisionAuthority).basis)).length;
  const pct = (n: number, d: number): string => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);
  return {
    ok: true,
    body: [
      `storytree adr attest — ${String(stamped.length)} of ${String(rows.length)} decision rows declare a basis ` +
        `(${pct(stamped.length, rows.length)} of the WHOLE log).`,
      "",
      ...[...byBasis].sort().map(([b, n]) => `  ${String(n).padStart(4)}  ${b}`),
      "",
      `  of the ${String(ownerClaims)} stamps CLAIMING the owner's authority:`,
      `    ${String(quoted).padStart(4)}  carry his verbatim words (${pct(quoted, ownerClaims)} of owner claims)`,
      `    ${String(transcribed).padStart(4)}  transcribed from the record's own prose — no words were ever captured`,
      "",
      `  ${String(rows.length - stamped.length).padStart(4)}  unstamped (${pct(rows.length - stamped.length, rows.length)} of the whole log)`,
      "",
      "A transcribed stamp is an agent's earlier claim carried forward, not a verification of it",
      "(ADR-0519 D5). Read the two owner rows as different strengths of evidence — that separation is",
      "the reason the marker exists, and flattening them would promote every backfilled row into the",
      "class of a record authored with the owner in the room.",
    ].join("\n"),
    next: ["storytree adr attest --backfill", "storytree adr list --current", "storytree adr attest 519"],
  };
}
