/**
 * PER-TEST REPORTS (ADR-0573 D2): what each proof runner says about every test it ran, read into the
 * one shape the review point judges (`per-test-review.ts`).
 *
 * WHY IT EXISTS. The spine used to observe one exit code per proof command, so "red" meant "the
 * command failed", and a cluster of hollow tests beside one genuine failure read exactly like a real
 * red. Measured 2026-09-14 (`docs/research/batched-red-attribution-probe-2026-09-14.md` §3): today's
 * gate advanced three real reds beside four hollow passes, and signed a green forged by one dummy
 * assertion followed by `process.exit(0)`. Every runner the corpus proves with reports each test by
 * name, outcome and error when the test file LOADS (§4). This module reads those reports. It decides
 * nothing: `per-test-review.ts` judges, and the judgement can only refuse (ADR-0573 D1).
 *
 * THREE CHANNELS, one per runner:
 *  - `node-test` — the spine's own reporter module (`per-test-reporter.mjs`), run BESIDE an explicitly
 *    named stdout reporter ({@link nodeTestReporterArgs}), because naming any reporter silences node's
 *    default stdout and that stdout is what a refused observation carries (PR #1910).
 *  - `bun-junit` — `bun test <file> --reporter=junit --reporter-outfile=<path>`.
 *  - `vitest-json` — `vitest run <file> --reporter=json --outputFile=<path>`, beside its default reporter.
 *
 * THE TRAPS, each measured and each handled here rather than by every consumer:
 *  - node's failing `todo` is a `test:fail` event that does not fail the run — read as `todo`, never
 *    as a red;
 *  - node reports `line: 1` for every test under tsx — never read;
 *  - node emits a test's children BEFORE the suite holding them, so the title path is rebuilt from
 *    event order;
 *  - a load failure or a `process.exit` leaves node ONE synthetic row named after the file, bun NO
 *    report at all, and vitest a file entry with no test rows — each lands as a refusal downstream
 *    (an undeclared row, or an absent report), never as a quiet pass;
 *  - duplicate titles come back as two rows — kept as two, so the review can refuse the ambiguity;
 *  - bun's console omits passing tests when redirected — the junit report is read, never the console.
 *
 * FRESHNESS (ADR-0249) is the rule the assert-oracle report lives by: the path is per build and
 * outside the worktree, it is CLEARED before every observation the spine trusts, and a report that
 * survives the clear refuses that observation rather than being read. After a successful clear, a
 * report can exist only because the proof run wrote it.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** The runner whose report an observation reads (ADR-0573 D2). */
export type PerTestChannel = "node-test" | "bun-junit" | "vitest-json";

/**
 * What a runner said happened to one test. Only `passed` and `failed` mean the test RAN to an
 * outcome; everything else is refused by the review's C3 as a declared test that did not run.
 */
export type ReportedOutcome = "passed" | "failed" | "skipped" | "todo" | "other";

/** One test as its runner reported it. */
export interface ReportedTest {
  /** The full title path, outermost suite first and the test's own title last. The join key. */
  readonly path: readonly string[];
  readonly outcome: ReportedOutcome;
  /** The failure's error name (`AssertionError`, `TypeError`), when the channel carries one. */
  readonly errorName?: string;
  /** The failure's error code (`ERR_ASSERTION`, `ERR_MODULE_NOT_FOUND`) — node's channel only. */
  readonly errorCode?: string;
  /** The first line of the failure message; `""` when there is none. */
  readonly message: string;
}

/** What one observation's per-test report yielded. */
export interface PerTestReport {
  readonly channel: PerTestChannel;
  /** Whether a report was written during THIS observation (the path was cleared before the spawn). */
  readonly present: boolean;
  /** Every reported test. Empty when the report is absent or unreadable. */
  readonly rows: readonly ReportedTest[];
  /** Set when a report exists but could not be read: refused like an absent one, with this reason. */
  readonly unreadable?: string;
}

/**
 * The seam a {@link import("../shell-test-executor.js").ShellTestExecutor} reads through: clear before
 * the spawn, read after it. Wired as a PAIR, exactly as the oracle report's reset and read are.
 */
export interface PerTestReportSource {
  readonly channel: PerTestChannel;
  /** Clear the report before an observation the spine will trust. A refusal means: do not spawn. */
  reset(): { ok: true } | { ok: false; reason: string };
  /** Read what the observation that just ran wrote. Never throws. */
  read(): PerTestReport;
}

// ---------------------------------------------------------------------------
// node:test — the spine's reporter module
// ---------------------------------------------------------------------------

/** The `--test-reporter` URL of the spine's own reporter module, resolved off this module. */
export function perTestReporterUrl(): string {
  return import.meta.resolve("./per-test-reporter.mjs");
}

/**
 * The node:test flags that write a per-test report to `reportPath` WITHOUT losing node's human-readable
 * stdout: the spine's reporter to the report file, and `spec` named explicitly to stdout beside it.
 * Dropping the `spec` pair empties stdout (measured 2026-09-15).
 */
export function nodeTestReporterArgs(reportPath: string): string[] {
  return [
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    `--test-reporter=${perTestReporterUrl()}`,
    `--test-reporter-destination=${reportPath}`,
  ];
}

/** A line the spine's reporter wrote. Every field is untrusted until checked. */
interface NodeReporterLine {
  readonly type?: unknown;
  readonly name?: unknown;
  readonly nesting?: unknown;
  readonly testType?: unknown;
  readonly skip?: unknown;
  readonly todo?: unknown;
  readonly causeName?: unknown;
  readonly causeCode?: unknown;
  readonly causeMessage?: unknown;
}

/** A row still waiting for the container events that name its ancestry. */
interface PendingRow {
  readonly ancestors: string[];
  readonly name: string;
  readonly outcome: ReportedOutcome;
  readonly errorName: string | undefined;
  readonly errorCode: string | undefined;
  readonly message: string;
}

/** A {@link ReportedTest} under construction, before it is handed out read-only. */
interface ReportedTestDraft {
  path: readonly string[];
  outcome: ReportedOutcome;
  errorName?: string;
  errorCode?: string;
  message: string;
}

/** Build a row, adding each error field only when the channel carried a non-empty one. */
function reportedTest(
  titlePath: readonly string[],
  outcome: ReportedOutcome,
  message: string,
  errorName: string | undefined,
  errorCode?: string,
): ReportedTest {
  const row: ReportedTestDraft = { path: titlePath, outcome, message };
  if (errorName !== undefined && errorName.length > 0) row.errorName = errorName;
  if (errorCode !== undefined && errorCode.length > 0) row.errorCode = errorCode;
  return row;
}

/** A node flag carries a value (`true`, or a reason string) when it is set; absent or `false` is unset. */
function flagSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * PURE: read the spine reporter's JSONL into one row per LEAF test. Throws on a malformed line — the
 * caller turns that into an unreadable report, never a partial one.
 *
 * node emits a test's children before the suite that holds them, so each row learns its ancestry when
 * its container's event arrives. A container — a suite, or a test holding subtests — is not itself
 * reported: the static read (`analyzeObservedTests`) counts only leaves, and the join must agree.
 */
export function readNodeTestReport(text: string): ReportedTest[] {
  const pending = new Map<number, PendingRow[]>();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const event = JSON.parse(line) as NodeReporterLine;
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const nesting = typeof event.nesting === "number" ? event.nesting : 0;
    const name = typeof event.name === "string" ? event.name : "";
    const children = pending.get(nesting + 1) ?? [];
    pending.delete(nesting + 1);
    for (const child of children) child.ancestors.unshift(name);
    const level = pending.get(nesting) ?? [];
    if (event.testType !== "suite" && children.length === 0) {
      const outcome: ReportedOutcome = flagSet(event.todo)
        ? "todo"
        : flagSet(event.skip)
          ? "skipped"
          : event.type === "test:pass"
            ? "passed"
            : "failed";
      level.push({
        ancestors: [],
        name,
        outcome,
        errorName: optionalString(event.causeName),
        errorCode: optionalString(event.causeCode),
        message: typeof event.causeMessage === "string" ? event.causeMessage : "",
      });
    }
    level.push(...children);
    pending.set(nesting, level);
  }
  return (pending.get(0) ?? []).map((p) =>
    reportedTest([...p.ancestors, p.name], p.outcome, p.message, p.errorName, p.errorCode),
  );
}

// ---------------------------------------------------------------------------
// bun — junit
// ---------------------------------------------------------------------------

function decodeXml(s: string): string {
  return s
    .replace(/&#10;/g, "\n")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlAttr(attrs: string, key: string): string | undefined {
  const match = new RegExp(`\\b${key}="([^"]*)"`).exec(attrs);
  return match?.[1] === undefined ? undefined : decodeXml(match[1]);
}

/** A junit row being assembled while its child elements are read. */
interface JunitRow {
  path: string[];
  outcome: ReportedOutcome;
  errorName: string | undefined;
  message: string;
}

/**
 * PURE: read bun's junit into one row per `<testcase>`. The title path comes from the nested
 * `<testsuite>`s BELOW bun's per-file wrapper (the first one); the outcome from `<failure>` (or
 * `<error>`), `<skipped/>` and `<skipped message="TODO"/>`. Bun's `assertions` attribute is never read:
 * it counts `expect()` calls, not `node:assert`.
 */
export function readBunJunitReport(text: string): ReportedTest[] {
  const rows: JunitRow[] = [];
  const suites: string[] = [];
  let current: JunitRow | null = null;
  const tag = /<(\/?)(testsuite|testcase|failure|error|skipped)\b([^>]*?)(\/?)>/g;
  for (let m = tag.exec(text); m !== null; m = tag.exec(text)) {
    const closing = m[1] === "/";
    const element = m[2];
    const attrs = m[3] ?? "";
    const selfClosing = m[4] === "/";
    if (element === "testsuite") {
      if (closing) suites.pop();
      else if (!selfClosing) suites.push(xmlAttr(attrs, "name") ?? "");
    } else if (element === "testcase") {
      if (closing) {
        current = null;
        continue;
      }
      current = {
        path: [...suites.slice(1), xmlAttr(attrs, "name") ?? ""],
        outcome: "passed",
        errorName: undefined,
        message: "",
      };
      rows.push(current);
      if (selfClosing) current = null;
    } else if ((element === "failure" || element === "error") && !closing && current !== null) {
      current.outcome = "failed";
      current.errorName = xmlAttr(attrs, "type");
      current.message = (xmlAttr(attrs, "message") ?? "").split("\n")[0] ?? "";
    } else if (element === "skipped" && !closing && current !== null) {
      current.outcome = xmlAttr(attrs, "message") === "TODO" ? "todo" : "skipped";
    }
  }
  return rows.map((r) => reportedTest(r.path, r.outcome, r.message, r.errorName));
}

// ---------------------------------------------------------------------------
// vitest — json
// ---------------------------------------------------------------------------

interface VitestAssertionResult {
  readonly ancestorTitles?: unknown;
  readonly title?: unknown;
  readonly status?: unknown;
  readonly failureMessages?: unknown;
}

interface VitestFileResult {
  readonly name?: unknown;
  readonly status?: unknown;
  readonly message?: unknown;
  readonly assertionResults?: unknown;
}

function vitestOutcome(status: unknown): ReportedOutcome {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
    case "pending":
      return "skipped";
    case "todo":
      return "todo";
    default:
      return "other";
  }
}

/** The error name leading a failure message's first line (`AssertionError: expected …`). */
function leadingErrorName(line: string): string | undefined {
  return /^([A-Za-z_$][\w$]*(?:Error|Exception))\b/.exec(line)?.[1];
}

/**
 * PURE: read vitest's json into one row per assertion result, the title path from `ancestorTitles` and
 * `title`. A file that failed with NO test rows — a load failure — becomes one row named after the
 * file, which no declared test matches, so the review refuses it as an undeclared row. Vitest's skip,
 * todo and exit shapes were not exercised by the probe, which is why every status this does not name
 * reads `other` and refuses rather than advancing (ADR-0573 D2).
 */
export function readVitestJsonReport(text: string): ReportedTest[] {
  const parsed = JSON.parse(text) as { testResults?: unknown };
  const files: readonly VitestFileResult[] = Array.isArray(parsed.testResults)
    ? (parsed.testResults as VitestFileResult[])
    : [];
  const rows: ReportedTest[] = [];
  for (const file of files) {
    const results: readonly VitestAssertionResult[] = Array.isArray(file.assertionResults)
      ? (file.assertionResults as VitestAssertionResult[])
      : [];
    if (results.length === 0 && file.status === "failed") {
      const fileName = typeof file.name === "string" ? path.basename(file.name) : "(unnamed test file)";
      const message = typeof file.message === "string" ? (file.message.split("\n")[0] ?? "") : "";
      rows.push(reportedTest([fileName], "failed", message, leadingErrorName(message)));
      continue;
    }
    for (const result of results) {
      const ancestors = Array.isArray(result.ancestorTitles)
        ? result.ancestorTitles.filter((t): t is string => typeof t === "string")
        : [];
      const failures = Array.isArray(result.failureMessages)
        ? result.failureMessages.filter((f): f is string => typeof f === "string")
        : [];
      const message = failures[0]?.split("\n")[0] ?? "";
      const title = typeof result.title === "string" ? result.title : "";
      rows.push(reportedTest([...ancestors, title], vitestOutcome(result.status), message, leadingErrorName(message)));
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The report file: allocate, clear, read
// ---------------------------------------------------------------------------

/** PURE: read a report's text through its channel's reader. Throws on malformed input. */
export function readPerTestReportText(channel: PerTestChannel, text: string): ReportedTest[] {
  switch (channel) {
    case "node-test":
      return readNodeTestReport(text);
    case "bun-junit":
      return readBunJunitReport(text);
    case "vitest-json":
      return readVitestJsonReport(text);
  }
}

/**
 * ALLOCATE a per-test report path for ONE build, in the OS temp dir so writing it never dirties the
 * tree the GATE proves clean. Unique per call, for the reason `allocateOracleReportPath` is: two
 * observers deriving the same path would each clear the other's evidence. Allocate once per build and
 * close over it.
 */
export function allocatePerTestReportPath(runId: string, unitId: string, channel: PerTestChannel): string {
  const safe = `${runId}-${unitId}`.replace(/[^A-Za-z0-9._-]/g, "_");
  const extension = channel === "bun-junit" ? "xml" : channel === "vitest-json" ? "json" : "jsonl";
  return path.join(os.tmpdir(), `storytree-per-test-${safe}-${process.pid}-${randomUUID()}.${extension}`);
}

/**
 * The file-backed {@link PerTestReportSource}. `reset` deletes the report and refuses when it survives
 * (ADR-0249: a report that could not be cleared cannot be attributed to the next run); `read` returns
 * an absent report as `present: false` and an unparseable one as `unreadable`, never a partial read.
 */
export function perTestReportFile(channel: PerTestChannel, reportPath: string): PerTestReportSource {
  return {
    channel,
    reset() {
      try {
        rmSync(reportPath, { force: true });
      } catch {
        // The survivor check below is the verdict.
      }
      if (existsSync(reportPath)) {
        return {
          ok: false,
          reason:
            `per-test report: the previous report at ${reportPath} could not be cleared before this ` +
            `observation, so a report read back afterwards could not be attributed to this run — ` +
            `refusing the observation rather than trusting a possibly stale report (ADR-0249)`,
        };
      }
      return { ok: true };
    },
    read() {
      if (!existsSync(reportPath)) return { channel, present: false, rows: [] };
      let text: string;
      try {
        text = readFileSync(reportPath, "utf8");
      } catch (error) {
        return { channel, present: true, rows: [], unreadable: `could not read ${reportPath}: ${String(error)}` };
      }
      try {
        return { channel, present: true, rows: readPerTestReportText(channel, text) };
      } catch (error) {
        return { channel, present: true, rows: [], unreadable: `could not parse ${reportPath}: ${String(error)}` };
      }
    },
  };
}
