/**
 * `storytree proposal` — the first-class authoring surface for the Library's `proposal` kind
 * (ADR-0287 D1).
 *
 * A `proposal` captures the INTENT of a change worth doing later: the decision is made, only the
 * EXECUTION is deferred (its own `KIND_SPECS` comment). ADR-0168 D2 put it in the Library's
 * LIFECYCLE tier alongside `open-question` and `friction` — transient-by-design kinds, each with a
 * mandatory drain — but the tier was never given an authoring verb, so it stayed empty: measured
 * 2026-08-02, zero proposals live and zero in the seed.
 *
 * ADR-0287 makes it the `tool` route's OUTPUT. Every other friction route names the artifact kind
 * its executor writes (`principle` → a principle, `process` → a process); `tool` named only a
 * destination, so a routed item archived while building nothing — 6 of 125 delivered. The remedy is
 * symmetry: routing to `tool` emits a proposal and cites it (`friction.ts` `routeFriction`), and the
 * adjudicator writes it here.
 *
 * That is why the verb exists at all rather than the doc being hand-authored through `library
 * artifact new --file`: hand-authoring means reading `KIND_SPECS` for the field set and stamping
 * `createdAt`/`updatedAt`/`schemaVersion` by hand — the exact cost `arc new` (ADR-0183 friction
 * `no-arc-new-scaffolder-verb`) and `adr new` (ADR-0050) already removed for their kinds. This is the
 * same scaffolder shape, and like `arc new` it has no number to reserve: a proposal id is a slug.
 *
 *   storytree proposal list [--pg]         the tier — every proposal, newest-authored last
 *   storytree proposal new [<id>] …  --pg  SCAFFOLD one (the six required fields; the CLI stamps the rest)
 *
 * `list` deliberately does NOT go through `library artifact list proposal`: that surface derives its
 * category list from kinds that HAVE instances, so an EMPTY tier answers `unknown category
 * "proposal"` — absence of rows rendered as absence of the kind (friction
 * `an-empty-artifact-kind-is-reported-as-a-kind-that-does-not-exist`). A tier whose whole purpose is
 * to carry a fail-closed delivery signal has to be listable at zero, because zero is a finding.
 */

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { upcastAndValidate } from "@storytree/library";

// The ADR scaffolder's kebab-caser, reused rather than copied — `arc new`'s precedent for exactly
// this (a second implementation would be a drift seam for no gain).
import { kebabSlug } from "./adr.js";
import { defaultCliActor } from "./cli-actor.js";
import type { Envelope } from "./envelope.js";

/** The read context: the doc store, plus the honest offline hint. */
export interface ProposalViewDeps {
  /** The doc store — the live store under --pg, the offline seed otherwise. */
  store: Store;
  /** True when --pg is attached; used only for honest offline hints. */
  pg: boolean;
}

/** The write context: the live store, the writable flag, an actor + a composition-root clock. */
export interface ProposalWriteDeps {
  store: Store;
  /** True when the store persists (the live --pg store). A write refuses when false. */
  writable: boolean;
  /**
   * Recorded as the event `actor` on writes; defaults to {@link defaultCliActor} (`cli@<branch>`),
   * the ADR-0290 attribution stamp every other CLI write path uses. The bare `"cli"` this once
   * hard-coded reads as UNATTRIBUTED to `branchOfActor`, so `check:corpus-content` labelled a
   * proposal "not yours" to the session that had just authored it — and its printed remedy for that
   * label is to leave the row alone, which strands the proposal live-only.
   */
  actor?: string;
  /** An ISO timestamp (composition-root clock): stamps createdAt/updatedAt. */
  now: string;
  /** True when --pg is attached — used only for the honest offline hint. */
  pg: boolean;
}

/**
 * The six REQUIRED body fields, in `KIND_SPECS.proposal` order, each with the flag that supplies it
 * and the one-line ask a refusal prints. Single source: the missing-field refusal, the help, and the
 * doc assembly all read this, so a field can never be asked for in one place and dropped in another.
 * `risks` is deliberately absent — `KIND_SPECS` marks it optional ("omit only if genuinely low-risk").
 */
const REQUIRED_FIELDS = [
  { field: "summary", flag: "--summary", ask: "the change being proposed, in one sentence" },
  { field: "motivation", flag: "--motivation", ask: "what prompts this — and the cost of NOT doing it" },
  { field: "change", flag: "--change", ask: "the before→after mapping, each old and new named exactly" },
  { field: "scope", flag: "--scope", ask: "the blast radius — and explicitly what it leaves UNCHANGED" },
  { field: "migration", flag: "--migration", ask: "the ordered steps to run when this is kicked off" },
  { field: "readiness", flag: "--readiness", ask: "the preconditions that say it is safe to start" },
] as const;

/** The authored body values `proposalNew` accepts — the six required, plus optional `risks`. */
export interface ProposalBody {
  summary?: string | undefined;
  motivation?: string | undefined;
  change?: string | undefined;
  scope?: string | undefined;
  migration?: string | undefined;
  readiness?: string | undefined;
  risks?: string | undefined;
}

const USAGE =
  'storytree proposal new [<id>] --title "..." --summary <text|@file> --motivation <text|@file> ' +
  "--change <text|@file> --scope <text|@file> --migration <text|@file> --readiness <text|@file> --pg";

/** Read a string field off an untyped stored doc body ("" when absent). */
function str(stored: StoredDoc, key: string): string {
  const doc = stored.doc as Record<string, unknown>;
  const v = doc[key];
  return typeof v === "string" ? v : "";
}

/** PURE: collapse prose to a single line (a `@path`-read value arrives with newlines). */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The cap on a DERIVED one-line description before it is cut at a word boundary. */
const DERIVED_DESCRIPTION_CAP = 160;

/**
 * PURE: the card one-liner derived from a proposal's `summary` when `--description` is omitted.
 *
 * `description` is a required common field and `summary` is already "the change being proposed, in
 * one sentence" (KIND_SPECS), so asking for both would re-introduce the redundancy the verb exists
 * to remove — `arcDescriptionFrom`'s reasoning, applied to this kind's lead field. Takes the first
 * sentence, whitespace-collapsed, cut at a word boundary past the cap; `--description` overrides, so
 * the derivation never has to be right, only reasonable.
 */
export function proposalDescriptionFrom(summary: string): string {
  const flat = oneLine(summary);
  const firstSentence = /^(.+?[.!?])(?:\s|$)/.exec(flat)?.[1] ?? flat;
  if (firstSentence.length <= DERIVED_DESCRIPTION_CAP) return firstSentence;
  const cut = firstSentence.slice(0, DERIVED_DESCRIPTION_CAP);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]+$/, "")}…`;
}

/**
 * PURE: the proposal id derived from a `--title` when the author passes no explicit id. Returns ""
 * when the title yields no slug at all (all punctuation) — the caller refuses rather than writing an
 * id-less doc.
 *
 * NO house suffix, unlike {@link import("./arc.js").arcIdFromTitle}'s `-arc`: the live arc ids carry
 * that convention (24 of 25), and this tier has no ids at all to carry one. Inventing a `-proposal`
 * suffix from zero observations would be a convention asserted rather than followed.
 */
export function proposalIdFromTitle(title: string): string {
  return kebabSlug(title);
}

/** Guidance when a proposal WRITE is attempted offline — the live store is the edit surface. */
function proposalNotWritable(verb: string): Envelope {
  return {
    ok: false,
    body: `proposal ${verb} writes to the shared store — run with --pg (and bring the DB up first: pnpm db:up).`,
    next: ["pnpm db:up", `storytree proposal ${verb} --pg`],
  };
}

/**
 * `storytree proposal new [<id>] --title "..." --summary … --motivation … --change … --scope …
 * --migration … --readiness … [--risks …] [--description …] --pg` — SCAFFOLD a proposal through the
 * validated write path (`arc new` / `adr new`, ADR-0050/0183).
 *
 * The author supplies the substance only: a title and the six required body fields. The CLI owns
 * `kind`; `id` (derived from the title unless one is passed); `description` (derived from the summary
 * unless passed); `references`; `schemaVersion` (via the upcaster); and both timestamps. Long prose
 * arrives already `@path`-resolved by the dispatch layer, so newlines survive the shell.
 *
 * Creation refuses an id that EXISTS (`library artifact new`'s edit-first guard) — a scaffolder must
 * never silently overwrite a parked proposal somebody is waiting to execute.
 */
export async function proposalNew(
  deps: ProposalWriteDeps,
  id: string | undefined,
  opts: ProposalBody & { title?: string | undefined; description?: string | undefined },
): Promise<Envelope> {
  if (!deps.writable) return proposalNotWritable("new");

  const title = opts.title?.trim() ?? "";
  const body: Record<string, string> = {};
  for (const { field } of REQUIRED_FIELDS) {
    const v = opts[field]?.trim() ?? "";
    if (v !== "") body[field] = v;
  }

  // ONE refusal naming EVERYTHING missing — learning six required fields through six round-trips is
  // the schema-spelunking cost this verb exists to remove, in a different costume (`arc new`).
  const missing = [
    ...(title === "" ? ['--title "<short name for the change>"'] : []),
    ...REQUIRED_FIELDS.filter(({ field }) => body[field] === undefined).map(({ flag, ask }) => `${flag} <${ask}>`),
  ];
  if (missing.length > 0) {
    return {
      ok: false,
      body: [
        `proposal new needs ${missing.length === 1 ? "one more field" : `${missing.length} more fields`}:`,
        ...missing.map((m) => `  ${m}`),
        "",
        "A proposal is a change whose DECISION is made and whose EXECUTION is deferred — parked in the",
        "library now, kicked off when ready. It is not a question. Long prose: @path reads the value",
        "from a file, so newlines survive the shell. (--risks is optional but rarely absent honestly.)",
      ].join("\n"),
      next: [USAGE, "storytree proposal list --pg   (search before you write)"],
    };
  }

  // An explicit positional id is taken as AUTHORED (normalised only, so a copy-pasted `asset:` ref or
  // stray capitals can't mint an id the ref regexes then reject); otherwise derive it from the title.
  const wanted = id?.trim().replace(/^asset:/, "") ?? "";
  const proposalId = wanted !== "" ? kebabSlug(wanted) : proposalIdFromTitle(title);
  if (proposalId === "") {
    return {
      ok: false,
      body: `could not derive a proposal id from ${wanted !== "" ? `"${wanted}"` : `the title "${title}"`} — use letters/numbers, or pass an explicit id: storytree proposal new <id> --title "..." --pg`,
      next: [USAGE],
    };
  }

  const clash = await deps.store.getDoc(proposalId);
  if (clash) {
    return {
      ok: false,
      body:
        clash.kind === "proposal"
          ? [
              `proposal ${proposalId} already exists — edit it, don't recreate it (a scaffold here would overwrite a parked remedy).`,
              wanted === ""
                ? `(that id was DERIVED from the title "${title}" — pass an explicit id to create a different proposal.)`
                : "",
            ]
              .filter((s) => s !== "")
              .join("\n")
          : `"${proposalId}" is already a ${clash.kind}, not a proposal — ids are shared across kinds, so pick another: storytree proposal new <id> --title "..." --pg`,
      next:
        clash.kind === "proposal"
          ? [`storytree library artifact ${proposalId} --pg`, `storytree library artifact edit ${proposalId} --set summary=@<file> --pg`]
          : [USAGE],
    };
  }

  const risks = opts.risks?.trim();
  const derivedDescription = opts.description === undefined;
  const summary = body["summary"] ?? "";
  const description = derivedDescription ? proposalDescriptionFrom(summary) : oneLine(opts.description ?? "");
  const doc: Record<string, unknown> = {
    kind: "proposal",
    id: proposalId,
    title,
    description,
    ...body,
    ...(risks !== undefined && risks !== "" ? { risks } : {}),
    references: [],
    createdAt: deps.now,
    updatedAt: deps.now,
  };

  let valid: unknown;
  try {
    valid = upcastAndValidate(doc);
  } catch (e) {
    return { ok: false, body: `that would not be a valid proposal:\n${(e as Error).message}`, next: [USAGE] };
  }
  const saved = await deps.store.upsertDoc({
    id: proposalId,
    kind: "proposal",
    doc: valid,
    actor: deps.actor ?? defaultCliActor(),
  });

  return {
    ok: true,
    body: [
      `created proposal ${saved.id}`,
      "",
      `# ${title}`,
      `**The proposal.** ${summary}`,
      ...(wanted === "" || derivedDescription
        ? [
            "",
            ...(wanted === "" ? [`id derived from the title: ${saved.id}   (pass an explicit id to override)`] : []),
            ...(derivedDescription ? [`description derived from the summary: ${description}`] : []),
          ]
        : []),
      "",
      // Pair the affordance with what it is FOR (ADR-0287 D1): a proposal nobody cites is the dead
      // tier this verb exists to end, and the citation is the friction item's, not this doc's.
      "A proposal is the `tool` route's OUTPUT — cite it from the friction item it remedies, or the",
      "routing does not complete (ADR-0287 D1). `proposal` is seed-scope, so export it in the same PR.",
    ].join("\n"),
    next: [
      `storytree library artifact ${saved.id} --pg`,
      `storytree friction route <friction-id> --route tool --reason "…" --proposal ${saved.id} --pg`,
      "storytree library export-corpus --pg   (dry run first — proposals are seed-scope, ADR-0120/0263)",
    ],
  };
}

/**
 * `storytree proposal list [--pg]` — the tier: every proposal, oldest first, with its card one-liner.
 *
 * Read-only, offline OK (against the seed) like every other read command. The EMPTY case is a
 * first-class answer here rather than an error, which is the whole reason this does not defer to
 * `library artifact list proposal` — see this module's header.
 */
export async function proposalList(deps: ProposalViewDeps): Promise<Envelope> {
  const docs = await deps.store.queryDocs({ kind: "proposal" });
  const sorted = [...docs].sort((a, b) => str(a, "createdAt").localeCompare(str(b, "createdAt")) || a.id.localeCompare(b.id));

  if (sorted.length === 0) {
    return {
      ok: true,
      body: [
        "storytree proposal — 0 proposal(s)",
        "",
        "  (none) — the tier is EMPTY, which is a finding rather than a missing kind: `proposal` is a",
        "  schema-defined, seed-scope Library kind, and under ADR-0287 D1 it is where every `tool`-routed",
        "  friction item's remedy lands. An empty tier means no routed remedy is parked and waiting.",
        ...(deps.pg ? [] : ["", "  (reading the OFFLINE seed — run with --pg for the live tier.)"]),
      ].join("\n"),
      next: [USAGE, "storytree friction list   (what is routed but unbuilt)"],
    };
  }

  const width = Math.max(1, ...sorted.map((d) => d.id.length));
  const rows = sorted.map((d) => {
    const created = str(d, "createdAt").slice(0, 10);
    return `  ${d.id.padEnd(width)}  ${created === "" ? "?" : created}  — ${str(d, "title")}`;
  });
  return {
    ok: true,
    body: [`storytree proposal — ${sorted.length} proposal(s)`, "", ...rows].join("\n"),
    next: [
      ...sorted.slice(0, 3).map((d) => `storytree library artifact ${d.id}${deps.pg ? " --pg" : ""}`),
      USAGE,
    ],
  };
}

export function proposalHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree proposal — the Library's parked-remedy tier (ADR-0287 D1): a change whose DECISION is",
      "made and whose EXECUTION is deferred. It is the `tool` friction route's OUTPUT — routing an item",
      "to `tool` emits one and cites it, exactly as every other route emits its artifact.",
      "",
      "  storytree proposal list [--pg]              every proposal, oldest first (read-only; offline OK)",
      "",
      "write a proposal (validated write path; long prose via @path reads from a file):",
      "  storytree proposal new [<id>] --title \"...\" --summary <text|@file> --motivation <text|@file>",
      "        --change <text|@file> --scope <text|@file> --migration <text|@file>",
      "        --readiness <text|@file> [--risks <text|@file>] [--description <text|@file>] --pg",
      "        SCAFFOLD a proposal — the `arc new` / `adr new` precedent. Supply the title and the six",
      "        required fields; the CLI stamps kind / id / description / references / timestamps, so",
      "        there is no doc JSON to hand-write and nothing goes through `library artifact new --file`.",
      "        The id is derived from the title unless you pass one; --description overrides the",
      "        one-liner derived from the summary. --change may be repeated to build paragraphs.",
      "",
      "The ADJUDICATOR writes it, not story-author (ADR-0287 D2): `asset:story-author` is fail-closed",
      "fenced to `stories/**` with no Library artifact write and no --pg, so it CANNOT — it CONSUMES the",
      "proposal when it authors the story. No fence is widened.",
      "`proposal` is SEED-SCOPE, so a new one lands in the committed knowledge.json: dry-run",
      "`storytree library export-corpus --pg` and commit the diff in the same PR (ADR-0120/0263).",
    ].join("\n"),
    next: [
      "storytree proposal list --pg",
      USAGE,
      "storytree friction route <id> --route tool --reason \"…\" --proposal <proposal-id> --pg",
    ],
  };
}
