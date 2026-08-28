/**
 * `pnpm probe:decision-reads` — recover the decision-record read history the host harness has been
 * writing all along into the traversal record (`adrs-into-the-dag-arc-inc-07`, ADR-0403).
 *
 * **A BATCH INGEST AND A REPORT, NOT A GATE RUNG, and deliberately so.** It is deliberately named
 * `probe:` rather than `check:`: it reads THIS MACHINE's `~/.claude/projects` transcripts, so its
 * numbers are a property of one laptop's history and nothing about them is a repo invariant a gate
 * could hold anyone to. Wiring it into `pnpm gate` would turn "this box has a short history" into a
 * red, and would also trip the gate plan's unplanned-check guard on the way.
 *
 * ## WHAT IT IS FOR
 *
 * `observeCliInvocation` is an allowlist over `storytree` argv and there is no read verb for a
 * decision record, so ZERO decision reads had ever reached a trace — while roughly a third of the
 * pointers the corpus offers an agent lead into the decision log. This sweeps the transcripts the
 * harness already wrote, mints `doc:decisions/NNNN-slug.md` visits (the corpus's own pointer form,
 * so the reads JOIN to the offers), and appends them idempotently through the same sink the CLI
 * recorder writes to. Re-running it is safe and appends nothing new.
 *
 * ## READ THE OUTPUT AS A FLOOR
 *
 * Every figure it prints is a lower bound — shell reads survive only as much of an opaque command
 * string as a conservative scraper can prove — and the report says so itself, alongside the sized
 * list of what it reached and did not record and the unsized list of what it cannot see at all.
 * The one conclusion it does NOT support is that agents are reading the decision log and getting on
 * fine: a read is not comprehension, and a model given insufficient context answers confidently
 * rather than abstaining.
 *
 * ## TWO WAYS TO EXIT 1, AND THE SECOND ONE IS THE POINT
 *
 * Usage: `pnpm probe:decision-reads [--dry-run]`. It fails when the transcript root could not be
 * walked at all, and — since `decision-log-readers-arc-inc-04` — when the walk SUCCEEDED and
 * recovered zero reads from transcripts that name decisions constantly. That second case is what
 * this probe reported as a clean zero for the whole `docs/decisions/` migration: the extractor
 * matched a file path, the files were deleted, and nothing in the output distinguished "nobody read
 * a decision" from "this instrument can no longer see one being read".
 *
 * A sweep that finds nothing AND sees nothing named is still a real answer, not a failure — this box
 * may simply have no decision traffic.
 *
 * ## AND SINCE ADR-0419 IT ALSO READS THE RECORD BACK — the coverage section
 *
 * `decision-read-measurement-arc-inc-01` added a second half, printed beneath the ingest and NOT a
 * second instrument: it reads the traversal record and reports what a baseline consumer would
 * actually find there — which recorder saw each read, under which id form, and whether the offers
 * and the reads can be JOINED at all.
 *
 * That last one is the reason it exists. Offers record a decision as `doc:decisions/NNNN-slug.md`
 * and a live CLI read records it as `adr-NNNN`, so a join on the raw id string drops the pairs that
 * span the two spellings — silently, computing a plausible wrong ratio rather than failing. The
 * section reports the join twice, raw and resolved, so the gap is visible instead of inferred, and
 * separately against the LIVE reads alone because the whole-record figure is flattered by a
 * historical population that can never grow again.
 *
 * It changes no verdict: the two exit-1 branches below are the ingest's and stay the ingest's. A
 * coverage report is a description of an instrument, not a repo invariant, and reddening on one
 * would be exactly the "this box has a short history" failure the `probe:` naming already refuses.
 */

import { resolveTraversalDir } from "@storytree/context-traversal-capture";
import {
  ingestDecisionReads,
  renderDecisionReadIngest,
  resolveTranscriptDir,
} from "@storytree/context-traversal-transcript";

const TAG = "probe:decision-reads";

function main(): void {
  const dryRun = process.argv.slice(2).includes("--dry-run");

  // `traceDir` is the ingest's WRITE target — the sweep folds each extracted read into that
  // session's trace — so it survives ADR-0464 D1 untouched. Only the coverage READ of the same
  // directory went (see below).
  const traceDir = resolveTraversalDir();
  const transcriptDir = resolveTranscriptDir();

  console.log(`${TAG} — transcripts: ${transcriptDir}`);
  console.log(`${TAG} — traces:      ${traceDir}`);
  console.log("");

  const result = ingestDecisionReads({ traceDir, transcriptDir, dryRun });
  console.log(renderDecisionReadIngest(result));

  if (result.scannedFiles === 0) {
    console.error("");
    console.error(
      `${TAG} FAIL — no transcript files were found under ${transcriptDir}. That is a walk that ` +
        "read nothing, not a machine with no history; set STORYTREE_TRANSCRIPT_DIR if the host " +
        "writes them elsewhere.",
    );
    process.exitCode = 1;
    return;
  }

  // THE SECOND WAY THIS SWEEP CAN LIE, and the one it actually did. A walk that reads every file and
  // recovers nothing looks identical, on exit code alone, to a machine that simply consulted no
  // decision — which is how a path matcher went on reporting a clean zero for the whole
  // `docs/decisions/` migration. A corpus that names decisions and yields no read is an instrument
  // out of date with its subject, so it fails here rather than printing an empty table under a
  // success banner. The narrow zero — nothing read, nothing named — stays a pass, because that one
  // really is an answer.
  if (result.blind) {
    console.error("");
    console.error(
      `${TAG} FAIL — swept ${result.scannedFiles} file(s) and recovered ZERO decision reads, while ` +
        `${result.decisionMentions} tool call(s) named a decision. This is reported as a FAILURE rather ` +
        "than an empty result because those two facts together describe an extractor whose subject " +
        "moved, not a quiet machine. Check how a decision is reached today and re-point the read " +
        "shapes in decision-reads.ts before trusting any zero from this probe.",
    );
    process.exitCode = 1;
    return;
  }

  // THE COVERAGE SECTION (ADR-0419, `decision-read-measurement-arc-inc-01`) — an extension to this
  // probe, never a second instrument.
  //
  // It reads the traversal record BACK, after the ingest above has written into it, so the picture
  // it prints is the one a baseline consumer would actually query. Ordered after the ingest for that
  // THE COVERAGE SECTION WAS DELETED HERE BY ADR-0464 D1. It rendered
  // `collectDecisionReadCoverage`, whose whole subject was the offer/read JOIN — how many decision
  // pointers a render OFFERED, in which spelling, how many of those offers a follow could ever have
  // been observed on, and how many were answered. Nothing records an offer any more, so the section
  // could only ever have printed zeroes, and a zero there reads as "agents follow nothing" rather
  // than "there is nothing left to count". The module behind it went with it.
  //
  // What this probe still does is unchanged and is its main job: sweep the host transcripts and fold
  // the decision READS into the trace. That population is untouched by the retirement — it is read
  // from the harness's own transcripts, never from the traversal record's offers — and it is what
  // ADR-0464 D7 preserves when it says chain depth stands.
  console.log("");
  console.log(
    `${TAG} — swept ${result.scannedFiles} file(s); ${result.extracted} read(s) extracted, ` +
      `${result.appended} appended${dryRun ? " (dry run: none)" : ""}.`,
  );
}

try {
  main();
} catch (err: unknown) {
  // Fail-closed: a recovery claim made over a sweep that threw is not a claim anyone should read.
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
