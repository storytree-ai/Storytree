import { execFile } from "node:child_process";
import * as path from "node:path";

import ts from "typescript5";
import type { Anchor } from "@storytree/proof-protocol";

import { hashSpan } from "./anchor-compute.js";
import type { ProvenBinding } from "../prove-it-gate.js";

/**
 * The PROVED-SPAN compute (ADR-0534): what a `--real` verdict binds, derived from what the spine
 * itself observed rather than from anything the leaf reports.
 *
 * A unit's `real:` arm declares a whole FILE, not a span, so the first caller of the gate's
 * ADR-0016 binding seam had to choose what `hashSpan` runs over. ADR-0534 settles it: **the
 * top-level declarations the leaf's authored commit changed**, one {@link Anchor} per declaration at
 * `symbol` grain, falling back to the whole file (`file` grain, no `symbol`) only where a change
 * cannot be named. Both inputs are the spine's own: the scoped commit it made at GATE (the exact set
 * of in-scope paths that were dirty) and the commit the build worktree was cut from. Nothing here
 * asks the leaf which symbols it wrote — the diff already says.
 *
 * Why declarations rather than the file: increment 2 of `verdict-accuracy-arc` measured that a
 * later commit touched a proved source FILE on the large majority of units, so a file-grain hash
 * reads "drifted" almost always and is not an instrument. Why declarations rather than raw hunks: a
 * repair inside the same function but outside the changed lines must still read as drift (the
 * false-NEGATIVE is the dangerous direction, ADR-0016 Fork D), and a declaration is the grain the
 * existing symbol locator re-finds by name.
 *
 * What is deliberately NOT bound: import/export-only statements (a re-export or an import line is
 * wiring, and no locator can name it), comment/whitespace-only edits (a declaration's text excludes
 * leading trivia, so they overlap no declaration and bind nothing), and the TEST file (the verdict
 * attests it via `commitSha`; the binding records the code the proof exercised). Absence is the
 * honest reading in each case: an unbound verdict is exactly what every pre-ADR-0534 verdict is, and
 * it can never be read as "fresh".
 *
 * Two structural limits, stated rather than glossed: the locator semantics are FIRST DECLARATION OF
 * THAT NAME in source order (the same rule the CLI's symbol locator applies), so a change to a
 * later overload of a name binds the first overload's text; and only TypeScript sources are parsed —
 * any other extension binds at file grain.
 */

/** A 1-based, inclusive range of NEW-side lines a diff hunk touched. */
export interface LineRange {
  start: number;
  end: number;
}

/**
 * PURE: parse `git diff --unified=0` output into the NEW-side line ranges each file's hunks touched.
 * Deleted files (`+++ /dev/null`) carry no new side and are omitted. A pure-deletion hunk
 * (`+c,0` — lines removed after new-side line c) is recorded as touching the neighbourhood `c..c+1`,
 * so the declaration a deletion happened inside still overlaps it.
 */
export function changedRangesByFile(diff: string): Map<string, LineRange[]> {
  const byFile = new Map<string, LineRange[]>();
  let current: string | undefined;
  for (const raw of diff.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      if (target === "/dev/null") {
        current = undefined;
        continue;
      }
      current = unquoteDiffPath(target.startsWith("b/") ? target.slice(2) : target);
      if (!byFile.has(current)) byFile.set(current, []);
      continue;
    }
    if (current === undefined || !line.startsWith("@@")) continue;
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m === null) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    const range: LineRange =
      count === 0 ? { start: Math.max(1, start), end: start + 1 } : { start, end: start + count - 1 };
    byFile.get(current)?.push(range);
  }
  return byFile;
}

/** git quotes a path containing unusual bytes as `"…"`; strip the quotes (and the common escapes). */
function unquoteDiffPath(p: string): string {
  if (!p.startsWith('"') || !p.endsWith('"')) return p;
  return p
    .slice(1, -1)
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/** How a top-level statement can be bound. */
export type StatementBinding = "named" | "unnamed" | "ignorable";

/** One top-level statement of a TypeScript source, with its 1-based line span (leading trivia excluded). */
export interface TopLevelStatement {
  /** The declared name, when the statement declares exactly one nameable thing. */
  name: string | undefined;
  binding: StatementBinding;
  startLine: number;
  endLine: number;
  /** `node.getText(sf)` — the same text the CLI's symbol locator hashes, so bind and re-locate agree. */
  text: string;
}

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

/** Is this a source the parser can name declarations in? */
export function isTypeScriptSource(file: string): boolean {
  return TS_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/**
 * PURE: every top-level statement of a TypeScript source, classified. `named` statements are the
 * ones a symbol anchor can re-locate; `ignorable` ones are import/export wiring no anchor names;
 * everything else is `unnamed` and forces file grain if it changed.
 */
export function topLevelStatements(text: string, fileName: string): TopLevelStatement[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const out: TopLevelStatement[] = [];
  for (const stmt of sf.statements) {
    const start = stmt.getStart(sf);
    const end = stmt.getEnd();
    const startLine = sf.getLineAndCharacterOfPosition(start).line + 1;
    const endLine = sf.getLineAndCharacterOfPosition(Math.max(start, end - 1)).line + 1;
    const classified = classifyStatement(stmt);
    out.push({
      name: classified.name,
      binding: classified.binding,
      startLine,
      endLine,
      text: stmt.getText(sf),
    });
  }
  return out;
}

/** The naming half of a {@link TopLevelStatement}: what a statement declares and how it can be bound. */
type StatementClass = Pick<TopLevelStatement, "name" | "binding">;

function classifyStatement(stmt: ts.Statement): StatementClass {
  if (
    ts.isImportDeclaration(stmt) ||
    ts.isImportEqualsDeclaration(stmt) ||
    ts.isExportDeclaration(stmt)
  ) {
    return { name: undefined, binding: "ignorable" };
  }
  if (ts.isVariableStatement(stmt)) {
    const first = stmt.declarationList.declarations[0];
    if (first !== undefined && ts.isIdentifier(first.name)) {
      return { name: first.name.text, binding: "named" };
    }
    return { name: undefined, binding: "unnamed" };
  }
  if (
    ts.isFunctionDeclaration(stmt) ||
    ts.isClassDeclaration(stmt) ||
    ts.isInterfaceDeclaration(stmt) ||
    ts.isTypeAliasDeclaration(stmt) ||
    ts.isEnumDeclaration(stmt) ||
    ts.isModuleDeclaration(stmt)
  ) {
    const name = stmt.name;
    if (name !== undefined && ts.isIdentifier(name)) return { name: name.text, binding: "named" };
    return { name: undefined, binding: "unnamed" };
  }
  return { name: undefined, binding: "unnamed" };
}

/** One changed file as the compute sees it: repo-relative path, its text AT the attested commit, the ranges its hunks touched. */
export interface ChangedFile {
  path: string;
  text: string;
  ranges: readonly LineRange[];
}

/** The anchors a proof binds, plus the unit-level hash the gate stamps as `verdict.boundHash`. */
export interface ProvedSpans {
  anchors: Anchor[];
  boundHash: string;
}

function overlaps(stmt: TopLevelStatement, ranges: readonly LineRange[]): boolean {
  return ranges.some((r) => r.start <= stmt.endLine && r.end >= stmt.startLine);
}

/**
 * PURE: the anchors a set of changed files binds (ADR-0534). Per file, in this order:
 *  - not a TypeScript source → ONE `file`-grain anchor over the whole text;
 *  - any changed `unnamed` statement → ONE `file`-grain anchor (a change nothing can name widens
 *    that file to file grain rather than being dropped — the conservative direction);
 *  - otherwise one `symbol`-grain anchor per DISTINCT changed name, whose span is the first
 *    top-level statement of that name (the locator's own rule), in source order;
 *  - a file whose hunks touched only `ignorable` statements, or no statement at all, binds nothing.
 * Anchors are ordered by path then position, and the unit hash is `hashSpan` over their spans
 * joined by a newline — deterministic, so an identical proof binds identically.
 * Returns `undefined` when nothing at all is bindable.
 */
export function provedSpans(files: readonly ChangedFile[], boundCommit: string): ProvedSpans | undefined {
  const anchors: Anchor[] = [];
  const spans: string[] = [];
  const ordered = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of ordered) {
    if (file.ranges.length === 0) continue;
    if (!isTypeScriptSource(file.path)) {
      anchors.push({ file: file.path, boundHash: hashSpan(file.text), boundCommit });
      spans.push(file.text);
      continue;
    }
    const statements = topLevelStatements(file.text, file.path);
    const changed = statements.filter((s) => overlaps(s, file.ranges));
    if (changed.some((s) => s.binding === "unnamed")) {
      anchors.push({ file: file.path, boundHash: hashSpan(file.text), boundCommit });
      spans.push(file.text);
      continue;
    }
    const names = new Set<string>();
    for (const s of changed) if (s.binding === "named" && s.name !== undefined) names.add(s.name);
    for (const s of statements) {
      if (s.name === undefined || !names.has(s.name)) continue;
      names.delete(s.name); // first declaration of that name wins — the locator's rule
      anchors.push({ file: file.path, symbol: s.name, boundHash: hashSpan(s.text), boundCommit });
      spans.push(s.text);
    }
  }
  if (anchors.length === 0) return undefined;
  return { anchors, boundHash: hashSpan(spans.join("\n")) };
}

/** The git-facing inputs {@link computeProvedBinding} needs — all of them the spine's own observations. */
export interface ProvedBindingArgs {
  /** The build worktree (clean at the attested commit by the time this runs). */
  workspace: string;
  /** The commit the worktree was cut from — what the leaf's work is diffed AGAINST. */
  baseSha: string;
  /** The commit the verdict attests — the spine's scoped commit (or the unchanged base). */
  headSha: string;
  /** The IMPLEMENT-scope paths the scoped commit staged, repo-relative. Test paths are the caller's to exclude. */
  files: readonly string[];
  /** Injected for tests; defaults to spawning `git` in `workspace`. */
  git?: (args: string[], cwd: string) => Promise<string>;
}

/**
 * The GATE-time caller of the gate's ADR-0016 binding seam (ADR-0534): diff the spine's own commit
 * against the worktree's base, read each changed file AT the attested commit, and bind the
 * declarations that changed. Returns `undefined` — the gate then signs exactly as it did before —
 * when nothing was staged, nothing bindable changed, or git could not answer; that last case is
 * reported on stderr rather than swallowed, and never turned into a refusal: a binding is provenance
 * on a verdict that is already true, and an ABSENT binding can never read as fresh.
 */
export async function computeProvedBinding(args: ProvedBindingArgs): Promise<ProvenBinding | undefined> {
  if (args.files.length === 0 || args.baseSha === args.headSha) return undefined;
  const git = args.git ?? runGit;
  try {
    const diff = await git(
      [
        "diff",
        "--unified=0",
        "--no-color",
        "--no-ext-diff",
        "--no-renames",
        args.baseSha,
        args.headSha,
        "--",
        ...args.files.map((f) => `:(literal)${f}`),
      ],
      args.workspace,
    );
    const ranges = changedRangesByFile(diff);
    const changed: ChangedFile[] = [];
    for (const file of args.files) {
      const fileRanges = ranges.get(file);
      if (fileRanges === undefined || fileRanges.length === 0) continue;
      const text = await git(["show", `${args.headSha}:${file}`], args.workspace);
      changed.push({ path: file, text, ranges: fileRanges });
    }
    const spans = provedSpans(changed, args.headSha);
    if (spans === undefined) return undefined;
    return { boundHash: spans.boundHash, anchors: spans.anchors };
  } catch (err) {
    console.error(
      `[spine] proved-span binding skipped — the verdict signs UNBOUND (as every pre-ADR-0534 ` +
        `verdict did): ${(err as Error).message}`,
    );
    return undefined;
  }
}

/** Run a git command in `cwd`, resolving stdout; rejects (loud) on a non-zero exit. */
function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout);
        return;
      }
      reject(new Error(`git ${args.join(" ")} failed in ${cwd}: ${error.message}\n${stderr}`, { cause: error }));
    });
  });
}
