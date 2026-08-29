/**
 * The WRITE-FIDELITY predicates — what makes a durable write refuse itself when the value that
 * reached the CLI is not the value the caller authored (`guidance-write-path-integrity-arc`,
 * ADR-0361).
 *
 * The third sibling of `at-path.ts` and `set-value.ts`, and the same shape of decision: a flag value
 * passes through ONE place where it is judged. `at-path.ts` answers "where do the bytes come from",
 * `set-value.ts` answers "may those bytes be stored in THIS field", and this answers "are these the
 * bytes the caller actually sent".
 *
 * ## Why a write needs to answer that at all
 *
 * The generated harness projections (`CLAUDE.md`, root `AGENTS.md`, the five agent directories) are
 * read at session start by every session on every branch, and `check:guidance` / `check:agents`
 * defend them by comparing the projection against the live store. That defence sits DOWNSTREAM of
 * where corruption enters: when the STORE holds the damage, both sides of the comparison carry it
 * and the checks report in sync. Two measured incidents (both in the arc's intent):
 *
 *  - A `--raw` read redirected to a file captured the package manager's own run banner, and writing
 *    that file back with `--set field=@path` stored the banner inside the root operating guidance.
 *  - An inline `--set` of a long prose field persisted only a PREFIX of the intended value; the
 *    projections then regenerated faithfully from the truncated source, dropping workflow step 7,
 *    the blocked-mid-unit landing and the never-self-exempt fence from every harness.
 *
 * In both cases the write reported success at exit 0. Nothing downstream could have caught either.
 *
 * ## The channel split this module enforces
 *
 * INLINE is the UNTRUSTED channel and `@path` is the TRUSTED one, because a file's bytes reach the
 * process whole by construction while an inline value crosses a shell that may cut it. Measured on
 * Windows 11 / Node 24 on 2026-08-13: PowerShell cut a 65-character value to 30 at an inner double
 * quote, left the tail as two stray positionals, and exited 0 — no length ceiling involved. (The
 * ceiling itself is NOT a silent failure and is deliberately not guarded: Git Bash refuses at
 * ~32,767 with `Argument list too long` and PowerShell with `The filename or extension is too
 * long`. A length threshold would tax every honest inline edit for a failure mode that already
 * fails loudly — ADR-0361 D5.)
 *
 * So each refusal below fires ONLY on the inline channel, and each names `@path` as the way to say
 * the same thing on purpose. That is what keeps the honest case priced at one file write instead of
 * an override flag a session learns to pass by reflex.
 *
 * Pure: no I/O, no store. The caller supplies the bytes and the stored pre-image.
 */

/**
 * A package-manager run banner at the head of a captured value.
 *
 * `pnpm storytree …` — the invocation every guidance surface in the repo documents — prints its own
 * two-line echo to STDOUT ahead of the command's output:
 *
 * ```
 *
 * > storytree@0.0.0 storytree C:\code\storytree
 * > node packages/cli/launch.mjs "library" "artifact" "<id>" "--raw=workflow"
 *
 * ```
 *
 * so `pnpm storytree library artifact <id> --raw=workflow > field.txt` writes those lines into
 * `field.txt` as though they were the field's first bytes. The measured consequence: 175 bytes of
 * banner landed inside the live `session-orchestrator` workflow and `build:guidance` rendered
 * `**Workflow.** > storytree@0.0.0 storytree …` into CLAUDE.md and AGENTS.md.
 *
 * THE TRAP IS THE DISCIPLINE: the read-modify-write round trip is exactly what `library-edit-ceremony`
 * prescribes for a field too long to pass inline, and `pnpm storytree …` is exactly how every surface
 * spells the CLI. ADR-0361 D1 closes the read side (`--raw … --out <path>` never crosses stdout at
 * all); this is the write side's last-moment catch for a file captured the old way, including one
 * captured before that flag existed.
 *
 * Returns the offending banner line for the message, or `null` when the value is clean.
 */
export function runScriptBannerOf(value: string): string | null {
  // Only the HEAD matters: a banner is prepended, never interleaved, and scanning the first few
  // lines keeps this off the hot path of a multi-`--set` edit carrying tens of KB of prose.
  const head = value.slice(0, 512).split("\n");
  for (const line of head) {
    const trimmed = line.trim();
    if (trimmed === "") continue; // pnpm's banner opens with a blank line
    // npm / pnpm: `> <pkg>@<version> <script> <dir>`. yarn v1: `yarn run v1.22.x`.
    if (/^>\s+\S+@\S+\s+\S+/.test(trimmed)) return trimmed;
    if (/^yarn run v\d/.test(trimmed)) return trimmed;
    // The first real content line decides it: a banner cannot appear below one.
    return null;
  }
  return null;
}

/** The refusal body for a value that arrived carrying a run banner, or `null` when it is clean. */
export function bannerRefusal(input: {
  readonly what: string;
  readonly value: string;
}): string | null {
  const banner = runScriptBannerOf(input.value);
  if (banner === null) return null;
  return [
    `${input.what} begins with a package manager's own run banner, not with the value:`,
    "",
    `    ${banner}`,
    "",
    "That is what `pnpm storytree … --raw <field> > file.txt` captures: pnpm echoes the script it is",
    "about to run to STDOUT, ahead of the payload, so the redirect stores those lines as the field's",
    "first bytes. Stored as-is it validates perfectly — it is a valid string in a string field — and",
    "only a RENDER of the artifact would ever show it. 175 bytes of exactly this landed inside the",
    "live session-orchestrator workflow and were rendered into CLAUDE.md and AGENTS.md.",
    "",
    "Capture the field on a channel the banner cannot reach, then write that file back:",
    "",
    "    storytree library artifact <id> --raw <field> --out field.txt --pg",
    "    storytree library artifact edit <id> --set <field>=@field.txt --pg",
    "",
    "`--out` is written by the CLI itself, so nothing a wrapper prints to stdout can enter it.",
    "If the banner really is the value you meant to store, there is no escape today — say so rather",
    "than working around it.",
  ].join("\n");
}

/**
 * The smallest loss this module will call a truncation, in characters.
 *
 * A write that is an exact prefix of the stored value is either a cut or a deliberate deletion of
 * the tail, and nothing in the bytes distinguishes them — so the floor is set where the two stop
 * being equally likely. Below it live the ordinary short-field edits that legitimately shorten a
 * value from its own head (`--set description=` trimming a clause, a title losing its suffix); above
 * it lives prose, where a caller who genuinely means to drop a paragraph can say so through `@path`
 * at the cost of one file write. The measured losses were 35 characters of 65 and roughly 7,000 of
 * 17,026 — the second far above this floor, the first below it and caught by
 * {@link strayPositionalRefusal} instead, which is why ADR-0361 takes both guards rather than
 * tuning this number until one covers everything.
 */
export const TRUNCATION_FLOOR = 64;

/**
 * The refusal body for an INLINE write whose value is a proper prefix of what the store already
 * holds — the signature of a value cut in transit — or `null` when the write is honest.
 *
 * `inline` is the whole precondition. A `@path` value reached the process whole, so an exact prefix
 * from a file is a caller who meant it, and refusing that would be a guard the honest case has to
 * argue with. The remedy this prints is therefore never "pass a flag to override": it is "send the
 * same bytes on the channel that cannot cut them", which is a real fix for the corrupt case and a
 * one-step detour for the deliberate one.
 *
 * Deliberately NOT a shrink guard. A write that shortens a field WITHOUT being a prefix is ordinary
 * curation — shortening a guidance section is normal wanted work — and refusing that shape was put
 * to the owner on 2026-08-12 and REJECTED, because it taxes the legitimate case and trains sessions
 * to pass the override by reflex. The prefix relation is what carries the signal: a cut can only
 * ever produce a head, while an edit almost never leaves one byte-identical.
 */
export function truncationRefusal(input: {
  readonly field: string;
  readonly submitted: string;
  readonly stored: unknown;
  readonly inline: boolean;
}): string | null {
  const { field, submitted, stored, inline } = input;
  if (!inline) return null;
  if (typeof stored !== "string") return null;
  const lost = stored.length - submitted.length;
  if (lost < TRUNCATION_FLOOR) return null;
  if (!stored.startsWith(submitted)) return null;
  return [
    `this --set of "${field}" is an exact PREFIX of the value already stored, ${lost} characters short.`,
    "",
    `    stored:    ${stored.length} characters`,
    `    submitted: ${submitted.length} characters, byte-identical up to where it stops`,
    "",
    "That is the shape of a value CUT IN TRANSIT rather than one you edited. An inline value crosses",
    "a shell before it reaches this process, and a shell can end the argument early — measured on",
    "Windows, PowerShell cut a 65-character value to 30 at an inner double quote and exited 0. The",
    "drift checks cannot catch the result, because the truncation would be IN the store they compare",
    "the projections against.",
    "",
    "Send it from a file, which reaches this process whole:",
    "",
    `    storytree library artifact edit <id> --set ${field}=@field.txt --pg`,
    "",
    "If you did mean to delete the tail, the same command records it — the file is the channel, not",
    "a ceremony to get past this message.",
  ].join("\n");
}

/**
 * Areas whose verbs take FREE TEXT as trailing positionals, and are therefore exempt from the
 * stray-positional refusal below.
 *
 * Every other prose-carrying write reads at most four positionals (`area sub third fourth`), which
 * is what lets {@link strayPositionalRefusal} work from one number instead of a per-verb arity
 * table that would fall behind the register. These five read `positionals.slice(1)` as an intent
 * string or a subcommand tail — and none of them accepts a `--set` or a durable-prose flag, so
 * exempting them costs no coverage.
 */
const FREE_TEXT_AREAS: ReadonlySet<string> = new Set([
  "orchestrate",
  "onboarding",
  "doctor",
  "dispatch",
  "guide",
]);

/** The most positionals any prose-carrying write reads: `area sub third fourth`. */
const PROSE_WRITE_POSITIONALS = 4;

/**
 * The refusal body for a prose-carrying write that arrived with positionals no verb will read, or
 * `null` when the command is well-formed.
 *
 * THIS IS THE REPRODUCED FAILURE, and the reason it was invisible: when a shell ends a quoted value
 * early, the REST of that value does not vanish — it arrives as extra bare words. Measured on
 * Windows 11 / Node 24, 2026-08-13:
 *
 * ```
 *   value:  START of prose. Then a quote: "quoted" and more prose after it. END   (65 chars)
 *   argv:   … --set workflow=START of prose. Then a quote:   quoted   and more prose after it. END
 *   result: argc=4, the flag's value 30 characters long, exit 0
 * ```
 *
 * The dispatch destructures `[area, sub, third, fourth]` and every positional past the fourth was
 * silently dropped, so the fragments of the caller's own prose were discarded and the truncated head
 * was stored as the durable record. Refusing them turns the one deterministic artefact of a cut
 * value into a loud failure, and it taxes nothing: nobody passes stray positionals on purpose.
 */
export function strayPositionalRefusal(input: {
  readonly positionals: readonly string[];
  readonly hasProseValue: boolean;
}): string | null {
  const { positionals, hasProseValue } = input;
  if (!hasProseValue) return null;
  const area = positionals[0];
  if (area !== undefined && FREE_TEXT_AREAS.has(area)) return null;
  if (positionals.length <= PROSE_WRITE_POSITIONALS) return null;
  const stray = positionals.slice(PROSE_WRITE_POSITIONALS);
  return [
    `this write carries ${stray.length} argument(s) no verb here reads:`,
    "",
    ...stray.map((s) => `    ${JSON.stringify(s)}`),
    "",
    "and it carries a prose value, which is the combination that means a shell ENDED THAT VALUE EARLY",
    "and handed the rest over as bare words. The stray fragments above are the tail of the value you",
    "meant to store; keeping them out of the record while storing the head is how a truncated write",
    "reports success (measured: a 65-character value stored as 30, exit 0).",
    "",
    "They are refused rather than ignored, because ignoring them is the whole defect.",
    "",
    "Send the value from a file, which no shell can split:",
    "",
    "    storytree library artifact edit <id> --set <field>=@field.txt --pg",
    "",
    "If the extra words are a typo'd command rather than a cut value, the fix is the same shape —",
    "check the verb's own --help for the arguments it takes.",
  ].join("\n");
}

/**
 * Every `<area> <sub> <verb>` that READS `--set` and writes the fields it names.
 *
 * THIS LIST EXISTS BECAUSE THE FLAG USED TO BE DROPPED IN SILENCE, and it is the exact twin of
 * `RAW_READ_VERBS` in `commands.ts` — same fault, opposite direction. `--set` is parsed once for the
 * whole CLI, but only `library artifact edit` ever consulted it. Every other command carrying it —
 * `library artifact <id> --set …` above all — parsed the flag, ignored it, and ran as the READ it
 * always was: exit 0, and the artifact's full render on stdout, which is byte-for-byte what a
 * SUCCESSFUL write prints. Exit code and output both said the write landed.
 *
 * Two measured incidents, both silent:
 *
 *  - A scripted batch of six field writes no-op'd in full while the script printed its own `WROTE`
 *    line six times, because it keyed on exit 0.
 *  - 2026-08-29 (`seeded-defect-qualification-arc`): a measurement seeded a `dependsOn` cycle into
 *    the live store to test whether `check:library-dag-acyclic` catches one. The write was verbless,
 *    so nothing was seeded, and the rung then reported `PASS — no dependsOn cycle across 2631
 *    artifacts` — a correct verdict about a state that was never created. The error points the
 *    FLATTERING way: the instrument under test appears not to fire, so a rung would have shipped
 *    UNQUALIFIED had a read-back not caught it.
 *
 * The aggravating factor was that the CLI emitted the broken form itself: the `--raw … --out <path>`
 * footer closed by telling the caller to write the file back with a verbless `--set`, so the
 * documented round trip for the LONGEST prose edits was the one that dropped on the floor. That is
 * how the second incident happened — the command was copied from the tool's own footer.
 *
 * So the fix is not only "route the id-addressed read too". A verb that does not read `--set`
 * REFUSES it, which is what stops the next write-shaped verb from re-acquiring the bug by simply not
 * thinking about the flag. Add the triple here when you add such a verb; the refusal is what will
 * tell you that you have to.
 */
export const SET_WRITE_VERBS: ReadonlyArray<readonly [area: string, sub: string, verb: string]> = [
  ["library", "artifact", "edit"],
];

/**
 * The `library artifact` subcommands that are VERBS rather than an artifact id.
 *
 * The distinction is what lets the refusal print the caller's own corrected command: with a verb in
 * the third slot the command names no artifact (`artifact list --set …`), while anything else there
 * IS the id, and splicing `edit` before it produces the line the caller meant to run.
 *
 * `edit` IS ABSENT ON PURPOSE, and adding it back is dead code: {@link SET_WRITE_VERBS} matches
 * `library artifact edit` and returns before this set is ever consulted, so no input can reach it
 * with `edit` in the third slot. The mutation rung is what proved that — the entry survived every
 * test because nothing could observe it.
 */
const ARTIFACT_VERBS: ReadonlySet<string> = new Set([
  "list",
  "new",
  "retire",
  "comment",
  "history",
]);

/**
 * Characters a POSIX shell and PowerShell both pass through untouched, so a `--set` argument made
 * only of these can be echoed into a pasteable corrected command with no quoting at all.
 *
 * Deliberately narrow. An argument outside it is elided rather than re-quoted, because the two
 * shells this repo runs on disagree about escaping inside double quotes — emitting a line that is
 * correct for one and cuts the value on the other would re-create ADR-0361 D4's truncation on the
 * very message that exists to prevent a silent write failure.
 */
const SHELL_SAFE = /^[A-Za-z0-9_@./:=,+-]+$/;

/** One `--set` argument as it can be re-typed, or `null` when quoting it is not portable. */
function pasteable(arg: string): string | null {
  return SHELL_SAFE.test(arg) ? arg : null;
}

/** `<field>=<value>` -> `<field>`, for the elided form; `null` when the argument names no field. */
function fieldOfSet(arg: string): string | null {
  const eq = arg.indexOf("=");
  return eq === -1 ? null : arg.slice(0, eq);
}

/**
 * `--set` on a command that will not write it — refused by name, never dropped.
 *
 * Fires BEFORE the `@path` expansion in `run`, which is deliberate on both counts: a doomed command
 * reads no files, and `values.set` still holds the literal `@path` the caller typed, so the
 * corrected command below echoes what they wrote rather than the file's contents.
 */
export function setVerbRefusal(input: {
  readonly positionals: readonly string[];
  readonly sets: readonly string[];
}): string | null {
  const { positionals, sets } = input;
  if (sets.length === 0) return null;
  const [area, sub, third] = positionals;
  // Stryker disable next-line MethodExpression: EQUIVALENT — SET_WRITE_VERBS holds exactly one
  // triple today, and over a one-element list `some` and `every` agree on every input. The mutant
  // becomes killable the moment a second write verb is added, which is the point at which the
  // difference starts to matter; until then no test can observe it.
  if (SET_WRITE_VERBS.some(([a, s, v]) => a === area && s === sub && v === third)) return null;

  const honoured = SET_WRITE_VERBS.map(
    ([a, s, v]) => `    storytree ${a} ${s} ${v} <id> --set <field>=<value> --pg`,
  );
  // The id-addressed READ (`library artifact <id> --set …`) — the shape both incidents took, and the
  // only one where the corrected command can be printed in full, because the id is right there.
  const isIdRead =
    area === "library" && sub === "artifact" && third !== undefined && !ARTIFACT_VERBS.has(third);
  if (!isIdRead) {
    const spelled = [area, sub].filter((p) => p !== undefined).join(" ");
    return [
      `\`--set <field>=<value>\` WRITES an artifact's fields, and \`${spelled}\` is not that write.`,
      "",
      "Nothing was written. It is refused rather than ignored because an ignored `--set` runs the",
      "command it was attached to and exits 0, which is indistinguishable from the write landing.",
      "",
      "the verbs that honour it:",
      "",
      ...honoured,
    ].join("\n");
  }

  const args = sets.map(pasteable);
  const elided = args.some((a) => a === null);
  const rendered = sets
    .map((s, i) => `--set ${args[i] ?? `${fieldOfSet(s) ?? "<field>"}=<value>`}`)
    .join(" ");
  return [
    `\`--set <field>=<value>\` WRITES, and \`storytree library artifact <id>\` is a READ.`,
    "",
    "NOTHING WAS WRITTEN. This is refused rather than ignored because ignoring it is the whole",
    "defect: the read exits 0 and prints the artifact's full render, which is also what a successful",
    "write prints, so a dropped `--set` is indistinguishable from a landed one. Measured twice — a",
    "six-field batch that wrote nothing while its script logged WROTE six times, and a seeded",
    "`dependsOn` cycle that never entered the store, after which the rung under test reported PASS",
    "over a state nobody had created.",
    "",
    "THE FIX IS ONE WORD — the `edit` verb, between `artifact` and the id:",
    "",
    `    storytree library artifact edit ${third} ${rendered} --pg`,
    ...(elided
      ? [
          "",
          "(a value above is shown as `<value>`: it needs shell quoting, and the quoting differs",
          "between the shells this repo runs on. Re-run YOUR command with `edit` added — or send the",
          "value from a file, which no shell can cut: `--set <field>=@field.txt`.)",
        ]
      : []),
  ].join("\n");
}
