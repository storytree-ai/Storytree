/**
 * THE MANIFEST SEAM'S BOUNDARY (ADR-0556 D3, `repo-manifest-remaining-domains-compose`): the pure judge
 * `check:boundaries` holds every JavaScript and TypeScript module to — nothing reads `repo-manifest.json`
 * except through the manifest's composition seam.
 *
 * ## Why it exists
 *
 * Every section of the repo manifest is authored as fragments under `repo-manifest/`, and every reader
 * gets the one semantic view from `readRepoManifest` (`@storytree/drive`), which composes those fragments
 * with the aggregate beside them and refuses what it cannot read. The aggregate is kept as an empty object
 * until `repo-manifest-aggregate-leaves-git` removes it. A module that opens it directly reads `{}` today
 * and nothing once it is gone — and it reads it without complaint, so every section it looks for is simply
 * absent. This judge refuses that read when it is written, not when a check built on it quietly goes blind.
 *
 * ## It detects READS, not mentions
 *
 * The file name is spelled in comments, messages and fixtures all over the repository, and a seam caller
 * rightly hands the path to `readRepoManifest`, so a mention proves nothing. What is refused is a read whose
 * argument CARRIES the path:
 *
 *  - a call to a reader ({@link READERS}) with an argument that carries it;
 *  - a command runner ({@link SPAWNERS}) handed the path together with the word `show` — a
 *    `git show <ref>:<path>`, however it is spawned; and
 *  - a static `import` or `export … from` of it.
 *
 * An expression carries the path when it spells it in a string or template, names a binding that carries
 * it, or builds a path from one: `join`, `resolve`, `fileURLToPath`, `new URL`, any binary operator, `?:`,
 * template spans, parentheses, `as`, `satisfies` and `!` all pass it through. Nothing else does — a CALL in
 * particular does not, so a value computed by `readRepoManifest(path)` is a composition rather than a path,
 * and reading from it is no monolith read.
 *
 * Bindings are followed transitively, in any declaration order: a variable whose initializer carries the
 * path carries it too, so `MANIFEST` → `manifestPath` → `readFileSync(manifestPath)` is one read. Across
 * modules, an EXPORTED binding that carries it — today only `REPO_MANIFEST` in `@storytree/drive` — carries
 * it into every module that imports it, under its own name or another, or reaches it through a namespace.
 *
 * ## The aperture, stated
 *
 * It does not follow a path held in an object property, a parameter default, a destructuring pattern or an
 * array element; a path assembled from parts that do not themselves spell `repo-manifest.json`; an
 * identifier re-exported under a new name; a command run by anything but a known runner; or anything outside
 * JavaScript and TypeScript (a shell script, a workflow). Each is somewhere a read could hide, and none is a
 * shape the repository uses. The runners are named rather than inferred for the opposite reason: a message
 * or a test fixture may well spell `git show …repo-manifest.json` without running anything.
 *
 * ## The seam needs no exemption; the allowances are exact
 *
 * `readRepoManifest` reads the path it is HANDED, as a parameter, which carries nothing a scan of its module
 * can see — so the seam is judged like everything else and passes. What remains is
 * {@link MONOLITH_READ_ALLOWANCES}: a module permitted an exact NUMBER of direct reads, each with its reason.
 * More reads than allowed is a violation, and so is FEWER, because an allowance the code no longer uses is
 * stale. That second rule also keeps the judge honest against the real tree: a scan that stopped seeing
 * reads would find the allowed one missing and say so, rather than passing over nothing.
 */

import ts from "typescript5";

/** The aggregate's file name — the path this boundary is about. */
export const MONOLITH = "repo-manifest.json";

/** One module, as the gatherer read it off the disk. */
export interface SourceModule {
  /** Repo-relative, `/`-separated. */
  readonly path: string;
  readonly text: string;
}

/** A direct read of the aggregate. */
export interface MonolithRead {
  readonly path: string;
  /** 1-based. */
  readonly line: number;
  /** The call it reads through — `readFileSync`, `show`, `import`, … */
  readonly call: string;
}

export interface MonolithReadScan {
  /** Every read, in module order and then source order. */
  readonly reads: readonly MonolithRead[];
  /** How many modules name the path or a binding of it — the only ones a read can be in, and the ones parsed. */
  readonly examined: number;
}

/** A module permitted an exact number of direct reads, and why. */
export interface MonolithReadAllowance {
  readonly path: string;
  readonly reads: number;
  readonly why: string;
}

export const MONOLITH_READ_ALLOWANCES: readonly MonolithReadAllowance[] = [
  {
    path: "packages/drive/src/source-ownership-map.ts",
    reads: 1,
    why:
      "readSourceOwnershipMapAt reads the aggregate at a merge-base commit from before the fragment tree existed — " +
      "the seam's one compatibility path, deleted with the aggregate by repo-manifest-aggregate-leaves-git",
  },
];

/** The calls that read the path they are handed. */
const READERS: ReadonlySet<string> = new Set(["readFileSync", "readFile", "readJson", "readOrNull", "show", "require", "import"]);

/** The calls that run a command — the only ones a `git show` can read the aggregate through. */
const SPAWNERS: ReadonlySet<string> = new Set(["execFileSync", "execSync", "spawnSync", "execFile", "exec", "spawn", "git"]);

/** The calls that turn a path into another path to the same file. */
const PATH_BUILDERS: ReadonlySet<string> = new Set(["join", "resolve", "fileURLToPath", "URL"]);

/** One module parsed once: its syntax tree, its variables, and what it imports under which local name. */
interface Analysis {
  readonly source: ts.SourceFile;
  readonly declarations: readonly Declaration[];
  /** Local name → the name it was imported as. */
  readonly imports: ReadonlyMap<string, string>;
}

interface Declaration {
  readonly name: string;
  readonly initializer: ts.Expression;
  readonly exported: boolean;
}

/** The bindings that carry the path: this module's own, and those exported by any module. */
interface Carriers {
  readonly local: ReadonlySet<string>;
  readonly shared: ReadonlySet<string>;
}

/** Every direct read of the aggregate in `modules`. */
export function findMonolithReads(modules: readonly SourceModule[]): MonolithReadScan {
  const analyses = new Map<SourceModule, Analysis>();
  const analysisOf = (module: SourceModule): Analysis => analyses.get(module) ?? analyse(module, analyses);
  const shared = sharedCarriers(modules, analysisOf, new Set());
  const examined = examinable(modules, shared);
  return { reads: examined.flatMap((module) => readsIn(module, analysisOf(module), shared)), examined: examined.length };
}

/**
 * The refusals: a module reading the aggregate more often than it is allowed, and an allowance its module no
 * longer uses. In the order the reads were found, then the allowances.
 */
export function judgeMonolithReads(reads: readonly MonolithRead[], allowances: readonly MonolithReadAllowance[]): string[] {
  const paths = [...new Set([...reads.map((read) => read.path), ...allowances.map((allowance) => allowance.path)])];
  return paths.flatMap((path) => {
    const found = reads.filter((read) => read.path === path);
    const allowed = allowances.find((allowance) => allowance.path === path)?.reads ?? 0;
    if (found.length > allowed) {
      return [
        `${path} reads ${MONOLITH} directly ${found.length} time(s) and is allowed ${allowed}: ` +
          `${found.map((read) => `line ${read.line} (${read.call})`).join(", ")}. Read the manifest through its ` +
          "composition seam instead — readRepoManifest (@storytree/drive) composes the fragments under " +
          "repo-manifest/ and refuses what it cannot read (ADR-0556 D3).",
      ];
    }
    if (found.length < allowed) {
      return [
        `${path} is allowed ${allowed} direct read(s) of ${MONOLITH} and makes ${found.length} — the allowance is ` +
          "stale: lower it in MONOLITH_READ_ALLOWANCES (packages/cli/src/manifest-boundaries.ts), or delete it at zero.",
      ];
    }
    return [];
  });
}

/** The modules that spell the path or a carrying binding — a module spelling neither cannot read it. */
function examinable(modules: readonly SourceModule[], shared: ReadonlySet<string>): readonly SourceModule[] {
  return modules.filter((module) => [MONOLITH, ...shared].some((name) => module.text.includes(name)));
}

/** Parse `module` once and remember it, so every pass over it after the first costs no parse. */
function analyse(module: SourceModule, analyses: Map<SourceModule, Analysis>): Analysis {
  const source = ts.createSourceFile(module.path, module.text, ts.ScriptTarget.Latest, true);
  const imports = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node)) imports.set(node.name.text, (node.propertyName ?? node.name).text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  const analysis: Analysis = { source, declarations: declarationsIn(source), imports };
  analyses.set(module, analysis);
  return analysis;
}

/**
 * Every exported carrying binding, found until a pass finds no more.
 *
 * Neither this recursion nor {@link grow}'s is a tail call, and that is deliberate. JavaScriptCore — Bun's
 * engine — eliminates tail calls, so a pass that stopped converging would spin forever instead of overflowing
 * the stack: a mutation breaking convergence would then time out, which proves nothing, rather than fail.
 */
function sharedCarriers(
  modules: readonly SourceModule[],
  analysisOf: (module: SourceModule) => Analysis,
  shared: ReadonlySet<string>,
): ReadonlySet<string> {
  const found = examinable(modules, shared)
    .flatMap((module) => exportedCarriers(analysisOf(module), shared))
    .filter((name) => !shared.has(name));
  return found.length === 0 ? shared : new Set(sharedCarriers(modules, analysisOf, new Set([...shared, ...found])));
}

function exportedCarriers(analysis: Analysis, shared: ReadonlySet<string>): string[] {
  const local = localCarriers(analysis, shared);
  return analysis.declarations
    .filter((declaration) => declaration.exported && local.has(declaration.name))
    .map((declaration) => declaration.name);
}

/** The module's carrying bindings: what it imports that carries the path, and what it binds to one. */
function localCarriers(analysis: Analysis, shared: ReadonlySet<string>): ReadonlySet<string> {
  const imported = [...analysis.imports].filter(([, name]) => shared.has(name)).map(([local]) => local);
  return grow(analysis.declarations, new Set(imported), shared);
}

/** `local`, plus every binding whose initializer carries the path — until a pass binds nothing new. */
function grow(declarations: readonly Declaration[], local: ReadonlySet<string>, shared: ReadonlySet<string>): ReadonlySet<string> {
  const added = declarations
    .filter((declaration) => !local.has(declaration.name) && carries(declaration.initializer, { local, shared }))
    .map((declaration) => declaration.name);
  return added.length === 0 ? local : new Set(grow(declarations, new Set([...local, ...added]), shared));
}

/** Every variable declared with an initializer, at any depth. A destructuring pattern's name is its text. */
function declarationsIn(source: ts.SourceFile): Declaration[] {
  const found: Declaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      found.push({
        name: node.name.getText(source),
        initializer: node.initializer,
        exported: (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function readsIn(module: SourceModule, analysis: Analysis, shared: ReadonlySet<string>): MonolithRead[] {
  const { source } = analysis;
  const carriers: Carriers = { local: localCarriers(analysis, shared), shared };
  const reads: MonolithRead[] = [];
  const visit = (node: ts.Node): void => {
    const call = readerOf(node, carriers);
    if (call !== undefined) {
      reads.push({ path: module.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, call });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return reads;
}

/** The call `node` reads the aggregate through — `undefined` when it does not read it. */
function readerOf(node: ts.Node, carriers: Carriers): string | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier !== undefined && carries(node.moduleSpecifier, carriers) ? "import" : undefined;
  }
  if (!ts.isCallExpression(node)) return undefined;
  const name = calleeName(node);
  if (READERS.has(name)) return node.arguments.some((argument) => carries(argument, carriers)) ? name : undefined;
  return SPAWNERS.has(name) && handsGitShow(node, carriers) ? name : undefined;
}

/** A command handed the path and the word `show` together — `git show <ref>:<path>`, as a list or a line. */
function handsGitShow(call: ts.CallExpression, carriers: Carriers): boolean {
  const handed = call.arguments.flatMap((argument) => (ts.isArrayLiteralExpression(argument) ? argument.elements : [argument]));
  return (
    handed.some((node) => carries(node, carriers)) &&
    handed.flatMap(literalParts).some((part) => part.text.split(" ").includes("show"))
  );
}

function carries(node: ts.Node, carriers: Carriers): boolean {
  if (literalParts(node).some((part) => part.text.includes(MONOLITH))) return true;
  if (ts.isTemplateExpression(node)) return node.templateSpans.some((span) => carries(span.expression, carriers));
  if (ts.isIdentifier(node)) return carriers.local.has(node.text);
  if (ts.isPropertyAccessExpression(node)) return carriers.shared.has(node.name.text);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
    return carries(node.expression, carriers);
  }
  if (ts.isBinaryExpression(node)) return carries(node.left, carriers) || carries(node.right, carriers);
  if (ts.isConditionalExpression(node)) return carries(node.whenTrue, carriers) || carries(node.whenFalse, carriers);
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    return (
      PATH_BUILDERS.has(calleeName(node)) &&
      node.arguments !== undefined &&
      node.arguments.some((argument) => carries(argument, carriers))
    );
  }
  return false;
}

/** The literal pieces of a string or template, each with its text — none for anything else. */
function literalParts(node: ts.Node): readonly { readonly text: string }[] {
  if (ts.isTemplateExpression(node)) return [node.head, ...node.templateSpans.map((span) => span.literal)];
  return ts.isStringLiteralLike(node) ? [node] : [];
}

/** A call's name: the property it calls, or the callee as written — `import` for a dynamic import. */
function calleeName(call: ts.CallExpression | ts.NewExpression): string {
  return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : call.expression.getText();
}
