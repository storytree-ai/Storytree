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
  collectDecisionReadCoverage,
  ingestDecisionReads,
  renderDecisionReadCoverage,
  renderDecisionReadIngest,
  resolveTranscriptDir,
} from "@storytree/context-traversal-transcript";

const TAG = "probe:decision-reads";

function main(): void {
  const dryRun = process.argv.slice(2).includes("--dry-run");

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
  // reason and not by taste: run before it, it would report the record as it was one sweep ago and a
  // reader would take a stale join for the current one.
  //
  // On a DRY RUN it still reports, and honestly — the ingest wrote nothing, so what it describes is
  // the record as it stands WITHOUT this sweep's reads. That is a real state to be able to inspect
  // (it is what every consumer sees until the sweep is run for real), so the render says which mode
  // produced it rather than being suppressed.
  console.log("");
  console.log(renderDecisionReadCoverage(collectDecisionReadCoverage({ traceDir })));
  if (dryRun) {
    console.log("");
    console.log(
      `${TAG} — the section above describes the record WITHOUT this sweep's ${result.extracted} ` +
        "read(s): a dry run appended nothing. Re-run without --dry-run to fold them in.",
    );
  }

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
