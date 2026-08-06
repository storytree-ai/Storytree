/**
 * THE SUBTREE MATCHER — does this source file fall under this declared subtree? (ADR-0317 D2.)
 *
 * PURE: no I/O, no `fs`, no `process`, no clock, and no imports. Lives HERE, in `drive`, rather than
 * beside the ownership judge in `cli`, because two surfaces now ask the same question and must get
 * the same answer:
 *
 *  - `storytree ownership` (`packages/cli/src/source-ownership.ts`, which re-exports this) reports
 *    which files fall under no declaration — the totality check.
 *  - the CLAIM NAMESPACE (`claim-namespace.ts`) answers "you named a FILE; the declared subtree over
 *    it is X" when a session claims a path instead of a subtree id (ADR-0317 D3).
 *
 * A second copy would let "who owns this file" diverge between the report and the claim resolver —
 * silently, and in exactly the direction this arc exists to close. So the semantics are defined once.
 *
 * THE COST, STATED. `source-ownership.ts` previously carried this and advertised itself as having no
 * imports at all "so the suite proves offline in a bare worktree". Importing this module by package
 * name costs that (module resolution wants `node_modules`). The invariant that carries the weight —
 * no I/O, no `fs`, no `process`, no clock — is untouched on both sides, and one shared matcher was
 * judged worth more than a bare-worktree property no test asserts and `pnpm -r test` cannot exercise.
 */

/** Regex metacharacters to escape when compiling a subtree pattern — `*` is handled separately. */
const REGEX_SPECIALS = /[.+^${}()|[\]\\?]/g;

/**
 * Compile one subtree pattern to an anchored matcher.
 *
 * `**` spans path segments, `*` stays within one, and `/**​/` collapses to "zero or more directories"
 * so `packages/cli/src/**​/*.ts` matches `packages/cli/src/a.ts` as well as `packages/cli/src/x/a.ts`.
 * A pattern with no `*` at all is NOT compiled here — {@link matchesSubtree} handles it as an exact
 * file or a directory prefix, which is the form a hand-written map reaches for most.
 */
function compile(pattern: string): RegExp {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] ?? "";
    if (ch !== "*") {
      out += ch.replace(REGEX_SPECIALS, "\\$&");
      i += 1;
      continue;
    }
    const doubled = pattern[i + 1] === "*";
    if (!doubled) {
      out += "[^/]*";
      i += 1;
      continue;
    }
    // `/**/` — zero or more whole directories, so the glob also matches the flat case.
    if (pattern[i + 2] === "/" && out.endsWith("/")) {
      out += "(?:[^/]+/)*";
      i += 3;
      continue;
    }
    out += ".*";
    i += 2;
  }
  return new RegExp(`^${out}$`);
}

/**
 * Does `file` fall under `pattern`?
 *
 * Three accepted forms, chosen so a hand-authored map needs no glob syntax to say the common things:
 * an exact file (`packages/cli/src/boundaries.ts`), a bare directory claiming everything beneath it
 * (`packages/library/src/store`), and a glob (`packages/cli/src/adr*.ts`).
 */
export function matchesSubtree(pattern: string, file: string): boolean {
  if (!pattern.includes("*")) return file === pattern || file.startsWith(`${pattern}/`);
  return compile(pattern).test(file);
}
