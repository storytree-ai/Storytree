/**
 * `pnpm probe:amends-drain` — the ADR-0419 Decision 3 drain harness: the burndown, the two worklists,
 * and the evidence one batch needs.
 *
 * `decision-read-measurement-arc` increment 07.
 *
 * **A DIAGNOSTIC, NOT A GATE RUNG, and deliberately so.** The `probe:adr-graph` / `probe:depth-from-work`
 * precedent exactly: a `check:` name would be picked up by the gate plan's unplanned-check guard, and
 * ADR-0419's Consequences already rule that the mechanical rung *"will red the gate on 174 edges the
 * day it is enabled, so it lands disabled or scoped and is turned on as the drain completes."* The
 * rung's pure judge (`evaluateAmendsAnnotation`) has existed since increment 05 and stays UNWIRED.
 * This verb is what a draining session runs; nothing here enforces a result and nothing here writes.
 *
 * ## WHAT THE DRAIN IS
 *
 * Of 446 accepted `amends` edges measured on 2026-08-23, 174 have a target whose body does not so
 * much as mention the amender. Each edge gets one of two verdicts:
 *
 *   - REAL AMENDMENT — something in the target is narrowed, retired or extended, so reading the
 *     target ALONE is now insufficient. The target owes an in-place annotation naming the CLAUSE that
 *     moved (ADR-0139 D4). A bare "amended by NNNN" does not discharge it: `adr list` already derives
 *     and prints the edge, so a bare number is the double entry ADR-0037 §1 forbids.
 *   - PLAIN SUPPORT — the source rests on the target and changed nothing in it. The edge is rehomed
 *     from the source's `amends` to its `dependsOn` (ADR-0419 D1/D2).
 *
 * ## ⚠ THE TWO WRITE PARTITIONS INVERT
 *
 * Printed on every run, because ADR-0419 states it as the hazard that loses data at exit code 0:
 * ANNOTATION is partitioned by TARGET (one pass per amended decision, since concurrent writes to the
 * same `body` are last-write-wins with no detector — ADR-0352 protects DIFFERENT fields, not the
 * same one); REHOMING is partitioned by SOURCE (an amender may amend several targets, so a
 * target-partitioned rehome puts two writers in one `amends` array).
 *
 * ## ⚠ THE ANNOTATED COUNT IS A CEILING, AND IS PRINTED AS ONE
 *
 * `bodyReferencesDecision` catches ABSENCE, never THINNESS. Any mention counts — including one in a
 * `## References` list or a fenced frontmatter block — and even a genuine mention may be the bare
 * number rather than the clause-level detail D4 asks for. So the burndown's optimistic end is
 * labelled where it is printed, and a reader who quotes `edgesAnnotated` as "the obligation is met"
 * has quoted the wrong instrument.
 *
 * Exit 0 when the decision log was READ and the census completed; 1 when the store could not be
 * opened, the log came back empty, or the read was vacuous. An instrument that cannot see its subject
 * must not report success — `isVacuousAmendsAnnotationRead` is the rule, not a printed number.
 */

import {
  evaluateAmendsAnnotation,
  isVacuousAmendsAnnotationRead,
  rehomeWorklistBySource,
  type AmendsAnnotationDecision,
  type AmendsEdgeEvidence,
  type RehomeSourceRow,
} from "@storytree/library";
import { adrDocumentFieldsOf } from "@storytree/library/adr-doc";
import { closePool, createPool, PgLibraryStore } from "@storytree/library/store";

/** Exit code for a read that could not be trusted. Never used for "the backlog is non-empty". */
const EXIT_UNREADABLE = 1;

/** How many worklist rows a bare `--targets` / `--sources` prints before it truncates. */
const DEFAULT_ROWS = 20;

/** A decision number as its four-digit display form, the spelling `adr list` prints. */
const pad = (n: number): string => String(n).padStart(4, "0");

const out = (line = ""): void => {
  process.stdout.write(`${line}\n`);
};

/**
 * Indent a source paragraph for printing, and cap its width.
 *
 * Byte-exact prose is what a verdict is made on, so this only ever adds a prefix and elides a TAIL —
 * it never reflows or paraphrases. The elision is marked, so a reader can tell a truncated paragraph
 * from a short one.
 */
const quote = (paragraph: string, limit = 600): string => {
  const flat = paragraph.replace(/\s+/g, " ").trim();
  const shown = flat.length > limit ? `${flat.slice(0, limit)} […]` : flat;
  return `      │ ${shown}`;
};

/** Read every decision row as the shape both pure judges accept. */
async function loadDecisionRows(store: PgLibraryStore): Promise<AmendsAnnotationDecision[]> {
  const rows: AmendsAnnotationDecision[] = [];
  for (const stored of await store.queryDocs({ kind: "adr" })) {
    const fields = adrDocumentFieldsOf(stored.doc as Record<string, unknown>);
    // `adrDocumentFieldsOf` degrades a missing `number` to 0; the id is the primary key and is what
    // the allocator actually reserved (`adr-number-identity`), so it is the more trustworthy of the
    // two. Prefer it, and fall back to the field only when the id does not parse.
    const fromId = Number(String(stored.id).replace(/^adr-/, ""));
    const number = Number.isInteger(fromId) && fromId > 0 ? fromId : fields.number;
    rows.push({ number, status: fields.status, amends: fields.amends, body: fields.body });
  }
  return rows;
}

/**
 * PURE: a `--target` / `--source` value as the list of decision numbers it names.
 *
 * Comma-separated, so one store read serves a whole batch. Non-numeric and non-positive entries are
 * DROPPED rather than throwing or silently becoming 0 — a typo'd id must not turn into a request for
 * decision zero, which would print an empty section that reads exactly like "this target owes
 * nothing". Deduped and returned in the order given, so a session's batch prints in the order it
 * asked for.
 */
function decisionList(raw: string | undefined, label: string): number[] {
  if (raw === undefined) return [];
  const seen = new Set<number>();
  const dropped: string[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) seen.add(n);
    else if (part.trim() !== "") dropped.push(part.trim());
  }
  // SAID OUT LOUD, never silently. A dropped entry prints NO section at all, which reads exactly
  // like a decision that owes nothing — the "green check that verified nothing" shape, one altitude
  // down. Naming what was dropped is what separates "I did not ask about it" from "it is clean".
  if (dropped.length > 0) {
    out(`⚠ ${label}: ignored ${String(dropped.length)} unusable id(s): ${dropped.join(", ")} — nothing was printed for them.`);
  }
  return [...seen];
}

/** The evidence block for one edge — the same rendering wherever an edge is printed. */
function printEdge(edge: AmendsEdgeEvidence, label: string): void {
  const mark = edge.targetResolved ? (edge.targetMentionsSource ? "mentions" : "SILENT") : "DANGLING";
  out(`    ${label}  [${mark}${edge.targetResolved ? `, target ${edge.targetStatus}` : ""}]`);
  if (edge.sourceParagraphs.length === 0) {
    out("      │ (the source's body says nothing about this target — the strongest available hint");
    out("      │  of PLAIN SUPPORT, but not a verdict: read both decisions before rehoming.)");
    return;
  }
  for (const paragraph of edge.sourceParagraphs) out(quote(paragraph));
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flagValue = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    return argv[i + 1];
  };
  const has = (name: string): boolean => argv.includes(name);
  const rowsWanted = (name: string): number => {
    const raw = flagValue(name);
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_ROWS;
  };

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
  } catch (err) {
    out("✗ probe:amends-drain — the decision log is in the store since ADR-0403 and it could not be opened:");
    out(`  ${err instanceof Error ? err.message : String(err)}`);
    out("");
    out("  This is a FAILURE, not a skip: no decision was read, so nothing was judged.");
    out("  Bring the DB up (pnpm db:up) and re-run.");
    return EXIT_UNREADABLE;
  }

  try {
    const store = new PgLibraryStore(handle.pool);
    const rows = await loadDecisionRows(store);
    const verdict = evaluateAmendsAnnotation(rows);
    const worklist = rehomeWorklistBySource(rows);

    if (verdict.decisionsScanned === 0) {
      out("✗ probe:amends-drain — the store holds NO decisions.");
      out("  Zero is never the real decision log; it means an unmigrated or wrong store.");
      return EXIT_UNREADABLE;
    }
    if (isVacuousAmendsAnnotationRead(verdict)) {
      out(
        `✗ probe:amends-drain — VACUOUS read: ${String(verdict.decisionsScanned)} decisions and ` +
          "not one accepted `amends` edge.",
      );
      out("  A log this size cannot honestly carry none, so the READER is blind. Nothing is judged.");
      return EXIT_UNREADABLE;
    }

    out("ADR-0419 D3 — amends drain burndown (live store)");
    out("");
    out(`  decisions read ............. ${String(verdict.decisionsScanned)}`);
    out(`  accepted amends edges ...... ${String(verdict.edgesScanned)}   (deduped per source)`);
    out(`  ├─ resolvable .............. ${String(verdict.edgesJudged)}`);
    out(`  └─ dangling ................ ${String(verdict.danglingEdges)}${
      verdict.danglingTargets.length > 0 ? `   → ${verdict.danglingTargets.map(pad).join(", ")}` : ""
    }`);
    out(`  targets pointed at ......... ${String(verdict.targetsScanned)}`);
    out(`  ├─ fully annotated ......... ${String(verdict.targetsAnnotated)}   (CEILING — see below)`);
    out(`  └─ still owed ≥1 ........... ${String(verdict.unannotatedTargets.length)}`);
    out("");
    out(`  ▸ SILENT EDGES (the burndown): ${String(verdict.edgesUnannotated)}`);
    out(`    annotated: ${String(verdict.edgesAnnotated)} / ${String(verdict.edgesJudged)} judged`);
    if (verdict.malformedTargets > 0) {
      out(`    malformed amends entries dropped: ${String(verdict.malformedTargets)}`);
    }
    out("");
    out("  ⚠ `annotated` is a CEILING TWICE OVER: any mention of the number counts (including one in");
    out("    a References list or a fenced code block), and even a genuine mention may be the bare");
    out("    number rather than the clause that moved. It catches ABSENCE, never THINNESS — a green");
    out("    edge here is NOT compliance with ADR-0139 D4.");
    out("");
    out("  ⚠ THE TWO WRITE PARTITIONS INVERT (ADR-0419, Consequences):");
    out("      ANNOTATION → partitioned by TARGET (--targets). One coherent pass per amended");
    out("        decision; concurrent writes to the same `body` are last-write-wins, no detector.");
    out("      REHOMING   → partitioned by SOURCE (--sources). An amender may amend several targets,");
    out("        so a target-partitioned rehome puts two writers in one `amends` array.");
    out("    Taking a batch from one view and writing through the other loses data at exit code 0.");

    if (has("--targets") || (!has("--sources") && !has("--target") && !has("--source"))) {
      const limit = rowsWanted("--targets");
      out("");
      out("── ANNOTATION WORKLIST (partition by TARGET — write the target's `body`) ──");
      out("");
      const shown = verdict.unannotatedTargets.slice(0, limit);
      for (const target of shown) {
        out(
          `  ADR-${pad(target.number)}  [${target.status}]  owes ${String(target.missingAmenders.length)}` +
            ` of ${String(target.acceptedAmenders)} amender(s): ${target.missingAmenders.map(pad).join(", ")}`,
        );
        out(`    storytree probe:amends-drain --target ${String(target.number)}`);
      }
      if (verdict.unannotatedTargets.length > shown.length) {
        out("");
        out(
          `  … ${String(verdict.unannotatedTargets.length - shown.length)} more target(s) not shown` +
            ` — pass --targets <n>. TRUNCATED DISPLAY, not a narrowed backlog.`,
        );
      }
    }

    if (has("--sources")) {
      const limit = rowsWanted("--sources");
      // `--plain-support` narrows to the sources carrying at least one never-discussed edge. A
      // NARROWING, announced as one: the unfiltered list is still the whole backlog.
      const plainSupportOnly = has("--plain-support");
      out("");
      out(
        "── REHOMING WORKLIST (partition by SOURCE — write the source's `amends`/`depends_on`) ──" +
          (plainSupportOnly ? "  [--plain-support: NARROWED]" : ""),
      );
      out("");
      // ORDERED BY THE PLAIN-SUPPORT HINT, because that is the only thing this view is FOR.
      // Ordering by decision number instead was measured useless on 2026-08-23: the first six
      // sources it offered were all REAL amendments whose bodies said exactly which clause they
      // moved, so the list cost six reads and produced no rehome. An edge whose SOURCE never
      // discusses its target is the one worth opening first — it is still a hint and never a
      // verdict, but it is the hint the whole module exists to surface.
      const hintOf = (row: RehomeSourceRow): number =>
        row.edges.filter((e) => !e.targetMentionsSource && e.sourceParagraphs.length === 0).length;
      const candidates = worklist.sources
        .filter((s) => (plainSupportOnly ? hintOf(s) > 0 : s.edges.some((e) => !e.targetMentionsSource)))
        .sort((a, b) => hintOf(b) - hintOf(a) || a.number - b.number);
      const shown = candidates.slice(0, limit);
      for (const source of shown) {
        const silent = source.edges.filter((e) => !e.targetMentionsSource).map((e) => pad(e.target));
        const mute = source.edges
          .filter((e) => !e.targetMentionsSource && e.sourceParagraphs.length === 0)
          .map((e) => pad(e.target));
        out(
          `  ADR-${pad(source.number)}  amends ${String(source.edges.length)} target(s), ` +
            `${String(silent.length)} silent: ${silent.join(", ")}`,
        );
        if (mute.length > 0) {
          out(`    ▸ says NOTHING about ${mute.join(", ")} — open these first (plain-support hint)`);
        }
        out(`    storytree probe:amends-drain --source ${String(source.number)}`);
      }
      if (candidates.length === 0 && plainSupportOnly) {
        out("  (no source has an edge it never discusses — every silent edge names its target");
        out("   somewhere in the amender's own body, so each needs an editorial read.)");
      }
      if (candidates.length > shown.length) {
        out("");
        out(`  … ${String(candidates.length - shown.length)} more source(s) not shown — pass --sources <n>.`);
      }
    }

    // A BATCH, not one target. Every invocation pays a Cloud SQL connector handshake, so a session
    // working ten targets should not pay it ten times — and the ten dumps then describe ONE read of
    // the store rather than ten reads taken minutes apart, which is what makes them comparable.
    const targetArgs = decisionList(flagValue("--target"), "--target");
    for (const targetArg of targetArgs) {
      out("");
      out(`── ADR-${pad(targetArg)} — every accepted amender, with the source's own words ──`);
      out("");
      out("  Write ONE coherent pass over this decision's body. For each amender below, decide:");
      out("    REAL AMENDMENT → annotate IN PLACE, naming the clause this decision narrows/retires/extends.");
      out("    PLAIN SUPPORT  → do NOT annotate; rehome the edge on the SOURCE (--source <n>) instead.");
      out("");
      const amenders = worklist.sources
        .flatMap((s) => s.edges)
        .filter((e) => e.target === targetArg)
        .sort((a, b) => a.source - b.source);
      if (amenders.length === 0) {
        out(`  (no accepted amends edge points at ADR-${pad(targetArg)})`);
      }
      for (const edge of amenders) printEdge(edge, `ADR-${pad(edge.source)} amends this`);
      out("");
      out(`  storytree adr pull ${String(targetArg)} --out adr-${pad(targetArg)}.md`);
      out(`  storytree adr push ${String(targetArg)} --file adr-${pad(targetArg)}.md --pg`);
    }

    for (const sourceArg of decisionList(flagValue("--source"), "--source")) {
      out("");
      out(`── ADR-${pad(sourceArg)} — every edge it owns, with its own words on each ──`);
      out("");
      out("  Rehoming writes THIS decision's arrays: remove the plain-support target from `amends`");
      out("  and add `asset:adr-NNNN` to `depends_on`. One pass over this source, never per target.");
      out("");
      const source = worklist.sources.find((s) => s.number === sourceArg);
      if (source === undefined) {
        out(`  (ADR-${pad(sourceArg)} owns no accepted amends edge)`);
      } else {
        for (const edge of source.edges) printEdge(edge, `amends ADR-${pad(edge.target)}`);
      }
      out("");
      out(`  storytree adr pull ${String(sourceArg)} --out adr-${pad(sourceArg)}.md`);
      out(`  storytree adr push ${String(sourceArg)} --file adr-${pad(sourceArg)}.md --pg`);
    }

    out("");
    out(
      `${String(verdict.edgesUnannotated)} silent edge(s) over ` +
        `${String(verdict.unannotatedTargets.length)} target(s) remain. The rung ` +
        `(ADR-0419 D4) is enabled when this reaches 0.`,
    );
    return 0;
  } finally {
    await closePool(handle.pool, handle.connector);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    out(`✗ probe:amends-drain — ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = EXIT_UNREADABLE;
  });
