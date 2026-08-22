import { readFile, writeFile } from "node:fs/promises";

import {
  adrDescriptionOf,
  adrDocId,
  adrDocumentFieldsOf,
  parseAdrDocument,
  renderAdrDocument,
} from "@storytree/library/adr-doc";
import { upcastAndValidate } from "@storytree/library";
import type { Store } from "@storytree/storage-protocol";

import { defaultCliActor } from "./cli-actor.js";
import type { Envelope } from "./envelope.js";

/**
 * THE ROUND-TRIP EDIT VERB (ADR-0403 dec 9) — `storytree adr pull` / `storytree adr push`.
 *
 * `decision-log-home-arc` increment 04.
 *
 * ## WHY THIS IS NOT A POLISH ITEM
 *
 * Decisions are the longest prose this corpus holds and the most-written tier. As FILES they are
 * edited with ordinary tools. As ROWS, the only write path is `library artifact edit --set
 * <field>=@path`, which for a long field means the documented `--out` capture / edit / write-back
 * dance (ADR-0361) — a correct path, and an unacceptable PRIMARY authoring path for the tier we touch
 * most. Landing the migration without this makes the daily job worse than it was, which is the one
 * outcome that would get the move reverted. So this ships WITH the migration, not after it.
 *
 * ## BOTH LEGS ARE CLI-OWNED WRITES, AND THAT IS THE POINT
 *
 * `--out` on the pull and `--file` on the push, never a shell `>` redirect in either direction. A
 * redirect under `pnpm storytree …` captures pnpm's two-line run banner as the value's first bytes,
 * and 175 bytes of exactly that once reached `CLAUDE.md` and `AGENTS.md` through a live artifact
 * (ADR-0361). Here the damage would be worse and quieter, because the banner would land at the top of
 * a decision's frontmatter block.
 *
 * The push needs no separate banner detector: a captured banner pushes the `---` fence off the first
 * line, and `parseAdrDocument` refuses a document that does not open with one. The refusal names the
 * cause rather than leaving it to be inferred.
 *
 * ## WHAT THE FILE FORMAT PRESERVES THAT A FIELD EDITOR CANNOT
 *
 * The whole document is edited as ONE text, so the `## Status` prose and the `status` field cannot
 * drift apart inside a single edit — which is what ADR-0139 needs, since the field is a PROJECTION of
 * that prose and never an independent write. Section structure survives a no-op round trip
 * byte-for-byte; `adr-doc.test.ts` proves it, and that test is what makes the verb trustworthy.
 *
 * ## CONCURRENCY, STATED RATHER THAN DISCOVERED
 *
 * A whole-document write is a REPLACE. Two sessions round-tripping the SAME decision are
 * last-write-wins with no detector, exactly as `library artifact edit --json` / `--file` are today.
 * Field-scoped `--set` (ADR-0352) stays the safe path for a targeted change and the recommended one
 * for small edits; this verb is for genuinely rewriting the prose. The help text says so, so it is
 * not left to be found out.
 */

export interface AdrRoundTripDeps {
  /** The live store. Reads dial it by default; writes need `--pg` (see `writable`). */
  readonly store: Store;
  /** `--pg` + a real connection — the push refuses without it. */
  readonly writable: boolean;
  /**
   * Recorded as the write's actor. OPTIONAL and resolved through `defaultCliActor()` at the call
   * site, which is what `branchOfActor` needs: an actor that does not carry the branch reads as
   * UNATTRIBUTED, and an unattributed write succeeds and typechecks, so nothing else would say so.
   */
  readonly actor?: string | undefined;
}

function noSuchDecision(id: string, number: number): Envelope {
  return {
    ok: false,
    body: [
      `no decision row "${id}" in the store.`,
      "",
      "the store IS the decision log (ADR-0403 dec 1) — there is no second source to fall back to,",
      "so this is not a checkout that needs reconciling. Either the number is wrong, or this",
      `connection is pointed at a database that does not hold ADR-${String(number).padStart(4, "0")}.`,
      "`storytree adr list --current` reads the same store and shows what it actually has.",
    ].join("\n"),
    next: ["storytree adr list --current", 'storytree adr new --title "..." --pg'],
  };
}

function badNumber(raw: string | undefined): Envelope {
  return {
    ok: false,
    body: `expected a decision NUMBER (got ${raw === undefined ? "nothing" : JSON.stringify(raw)}).`,
    next: ["storytree adr pull 403 --out adr-0403.md", "storytree adr push 403 --file adr-0403.md --pg"],
  };
}

/** PURE: the decision number a positional argument names, or null. Accepts `403` and `adr-0403`. */
export function parseDecisionArg(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const bare = raw.startsWith("adr-") ? raw.slice("adr-".length) : raw;
  if (!/^\d{1,4}$/.test(bare)) return null;
  const n = Number(bare);
  return n > 0 ? n : null;
}

/**
 * `storytree adr pull <n> --out <path>` — write the decision out as an ordinary markdown document.
 *
 * A READ, so it needs no `--pg`: a bare library read already dials the live store (ADR-0302 D1).
 * `--out` is REQUIRED rather than defaulting to stdout, which is the whole ADR-0361 lesson: offering
 * a stdout form invites the `>` redirect that corrupts the value, and there is no use for the text
 * except to edit it in a file.
 */
export async function adrPull(
  numberArg: string | undefined,
  out: string | undefined,
  deps: AdrRoundTripDeps,
): Promise<Envelope> {
  const number = parseDecisionArg(numberArg);
  if (number === null) return badNumber(numberArg);
  if (out === undefined || out === "") {
    return {
      ok: false,
      body: [
        "adr pull needs --out <path> — it writes the file itself.",
        "",
        "there is deliberately no stdout form. a `>` redirect under `pnpm storytree …` captures",
        "pnpm's two-line run banner as the document's first bytes, which would push the frontmatter",
        "fence off line 1 and make the push refuse (ADR-0361).",
      ].join("\n"),
      next: [`storytree adr pull ${String(number)} --out ${adrDocId(number)}.md`],
    };
  }

  const id = adrDocId(number);
  const stored = await deps.store.getDoc(id);
  if (!stored) return noSuchDecision(id, number);

  const text = renderAdrDocument(adrDocumentFieldsOf(stored.doc as Record<string, unknown>));
  try {
    await writeFile(out, text, "utf8");
  } catch (e) {
    return {
      ok: false,
      body: `could not write --out ${out}: ${(e as Error).message}`,
      next: [`storytree adr pull ${String(number)} --out <a-writable-path>`],
    };
  }

  return {
    ok: true,
    body: [
      `wrote ${text.length.toLocaleString("en-US")} characters of ${id} to ${out}`,
      "",
      "edit it with ordinary tools — the whole document is one text, so the `## Status` prose and the",
      "`status` field cannot drift apart inside one edit. then write it back with:",
      `  storytree adr push ${String(number)} --file ${out} --pg`,
    ].join("\n"),
    next: [`storytree adr push ${String(number)} --file ${out} --pg`],
  };
}

/** One human-readable line per field the push is about to change. Empty when nothing moved. */
function changedFields(
  before: ReturnType<typeof adrDocumentFieldsOf>,
  after: ReturnType<typeof adrDocumentFieldsOf>,
): string[] {
  const lines: string[] = [];
  const list = (ns: readonly number[]) => (ns.length === 0 ? "(none)" : ns.join(", "));
  if (before.status !== after.status) lines.push(`  status: ${before.status} -> ${after.status}`);
  if (before.decided !== after.decided) {
    lines.push(`  decided: ${before.decided ?? "(none)"} -> ${after.decided ?? "(none)"}`);
  }
  if (before.arc !== after.arc) lines.push(`  arc: ${before.arc ?? "(none)"} -> ${after.arc ?? "(none)"}`);
  if (before.loadBearing !== after.loadBearing) {
    lines.push(`  load_bearing: ${String(before.loadBearing)} -> ${String(after.loadBearing)}`);
  }
  if (list(before.amends) !== list(after.amends)) {
    lines.push(`  amends: ${list(before.amends)} -> ${list(after.amends)}`);
  }
  if (list(before.supersedes) !== list(after.supersedes)) {
    lines.push(`  supersedes: ${list(before.supersedes)} -> ${list(after.supersedes)}`);
  }
  if (before.body !== after.body) {
    const delta = after.body.length - before.body.length;
    lines.push(
      `  body: ${before.body.length.toLocaleString("en-US")} -> ` +
        `${after.body.length.toLocaleString("en-US")} characters (${delta >= 0 ? "+" : ""}${delta.toLocaleString("en-US")})`,
    );
  }
  return lines;
}

/**
 * `storytree adr push <n> --file <path> --pg` — read the edited document back into the row.
 *
 * A REPLACE of the whole document, so it is last-write-wins with no detector; see the module header.
 * It refuses on a row that does not exist rather than creating one: minting a decision is
 * `storytree adr new`'s job, which reserves the number transactionally (ADR-0050), and a push that
 * could create would be a second, un-reserving mint.
 */
export async function adrPush(
  numberArg: string | undefined,
  file: string | undefined,
  deps: AdrRoundTripDeps,
): Promise<Envelope> {
  const number = parseDecisionArg(numberArg);
  if (number === null) return badNumber(numberArg);
  if (file === undefined || file === "") {
    return {
      ok: false,
      body: "adr push needs --file <path> — the document to write back, as `adr pull --out` wrote it.",
      next: [`storytree adr pull ${String(number)} --out ${adrDocId(number)}.md`],
    };
  }
  if (!deps.writable) {
    return {
      ok: false,
      body: "writes go to the shared store — run with --pg (and bring the DB up first: pnpm db:up).",
      next: ["pnpm db:up", `storytree adr push ${String(number)} --file ${file} --pg`],
    };
  }

  const id = adrDocId(number);
  const stored = await deps.store.getDoc(id);
  if (!stored) return noSuchDecision(id, number);
  const row = stored.doc as Record<string, unknown>;

  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    return {
      ok: false,
      body: `could not read --file ${file}: ${(e as Error).message}`,
      next: [`storytree adr pull ${String(number)} --out ${file}`],
    };
  }

  let fields: ReturnType<typeof adrDocumentFieldsOf>;
  try {
    fields = parseAdrDocument(number, text);
  } catch (e) {
    const message = (e as Error).message;
    return {
      ok: false,
      body: [
        `${file} is not a decision document: ${message}`,
        "",
        // The commonest cause by far, and the one a bare parse error would not name.
        ...(message.includes("no frontmatter block")
          ? [
              "the usual cause is a `>` redirect: `pnpm storytree … > file` captures pnpm's two-line",
              "run banner ahead of the document, pushing the `---` fence off line 1. re-capture it with",
              "`adr pull --out`, which the CLI writes itself (ADR-0361).",
            ]
          : []),
      ].join("\n"),
      next: [`storytree adr pull ${String(number)} --out ${file}`],
    };
  }

  const before = adrDocumentFieldsOf(row);
  const changes = changedFields(before, fields);
  if (changes.length === 0) {
    return {
      ok: true,
      body: `${id} is unchanged — nothing written. (the round trip is byte-identical by design, ADR-0403 dec 9)`,
      next: [`storytree library artifact ${id}`],
    };
  }

  const doc = upcastAndValidate({
    ...row,
    title: fields.title === "" ? id : fields.title,
    description: adrDescriptionOf(number, fields.title),
    body: fields.body,
    number: fields.number,
    status: fields.status,
    amends: [...fields.amends],
    supersedes: [...fields.supersedes],
    loadBearing: fields.loadBearing,
    updatedAt: new Date().toISOString(),
    // Absent keys are DELETED rather than left standing: the document is the whole truth of the row,
    // so a `decided:` or `arc:` line the author removed must come off the row too. A merge that kept
    // them would make the file a partial view and the round trip a lie.
    ...(fields.decided === undefined ? { decided: undefined } : { decided: fields.decided }),
    ...(fields.arc === undefined ? { arcRef: undefined } : { arcRef: `asset:${fields.arc}` }),
  });
  const cleaned = Object.fromEntries(
    Object.entries(doc as Record<string, unknown>).filter(([, v]) => v !== undefined),
  );

  await deps.store.upsertDoc({ id, kind: "adr", doc: cleaned, actor: deps.actor ?? defaultCliActor() });

  return {
    ok: true,
    body: [`updated ${id} from ${file}:`, ...changes].join("\n"),
    next: [`storytree library artifact ${id}`, `storytree library artifact history ${id} --pg`],
  };
}
