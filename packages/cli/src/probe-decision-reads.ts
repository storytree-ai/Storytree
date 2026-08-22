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
