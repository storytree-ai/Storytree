/**
 * HOW OFTEN AN ARTIFACT WAS ACTUALLY OPENED — the read record behind `unlinked-corpus-half-arc`'s
 * end-state clause 2.
 *
 * An artifact nothing links to but that agents read constantly is not legacy; one nothing links to
 * and nobody has opened since June probably is. That distinction is the whole reason this arc
 * measures before it proposes, and it cannot be made from the graph alone.
 *
 * ## EVERY NUMBER HERE IS A FLOOR, AND SAYING SO IS NOT A DISCLAIMER
 *
 * "Never read" and "unobservable" are different findings and only one of them argues for
 * retirement, so the floors are enumerated rather than gestured at:
 *
 *   • THE LIVE CLI CAPTURE IS ALLOWLISTED. `observeCliInvocation` records a bounded set of command
 *     shapes; anything else an agent does with an artifact is invisible to it.
 *   • `deriveIdentity()` RETURNS NULL IN THE PRIMARY CHECKOUT (`noticeboard.ts` rule 3), so work run
 *     in the shared lobby records nothing at all.
 *   • CODEX RUNS ARE OUTSIDE THE CLAUDE HARNESS, so they leave no host transcript.
 *   • AN AGENT MANIFEST INJECTS WITHOUT READING. A `principle` named in an agent's `rules` field is
 *     assembled into that agent's system prompt every time it runs and no read event is minted for
 *     it — the strongest possible consumption evidence produces a ZERO here. {@link readFloorNotes}
 *     names this one because it is the floor that bites hardest on exactly the tiers this arc is
 *     adjudicating.
 *
 * ## WHY THE SCRAPER IS THE GENERAL FORM OF ONE THAT EXISTS, RATHER THAN A SECOND SWEEPER
 *
 * `scrapeCliDecisionReads` (`@storytree/context-traversal-transcript`) already reads this exact argv
 * shape out of a transcript, and it is the instrument this rule is inherited FROM — including the
 * measurement that justifies it: matching an id token loosely rather than by argv shape was 66:1
 * wrong on this disk. It cannot be reused directly because it bails on any id that is not a
 * decision (its line 521), which is the entire population this arc is about. So the RULE is
 * mirrored and the reason is cited, and the two must not be allowed to drift: if one learns a new
 * read shape, so must the other.
 */

/** One artifact read recovered from a shell command. */
export interface ScrapedRead {
  readonly id: string;
  /** `--raw <field>` hands back one field; anything else hands back the document. */
  readonly strength: "front_matter_read" | "full_payload_read";
}

/** What one command yielded, plus what it deliberately declined — an omission carries its size. */
export interface ReadScrape {
  readonly reads: readonly ScrapedRead[];
  /** Verbs recognised as NOT reads (a write wearing a read's shape, a search, a change log). */
  readonly declinedVerbs: readonly string[];
}

const EMPTY: ReadScrape = { reads: [], declinedVerbs: [] };

/** A shell command that cannot contain the read shape at all — the cheap prefilter. */
const READ_HINT = /library\s+artifact/;

/**
 * Split a command into segments a single argv could occupy.
 *
 * Mirrors `shellSegments`. Heredoc bodies are NOT stripped here, and the omission is deliberate
 * rather than overlooked: a heredoc body carrying `storytree library artifact <id>` is a script
 * being WRITTEN, not run, and would mint a read for a command that never executed. Because that
 * text is indistinguishable from a real command once split, the prefilter above plus the write-flag
 * declines below are what keep it out, and any leak lands in the FLOOR's safe direction —
 * over-counting a read makes an artifact look MORE used, which argues against retirement, never for
 * it. A floor that errs toward retiring something is the one this arc must not have.
 */
function segmentsOf(command: string): string[] {
  return command.split(/\|\||&&|;|\||\r?\n/);
}

/** Mirrors `isStorytreeLauncher` — the three ways this CLI is invoked. */
function isStorytreeLauncher(token: string): boolean {
  const normalised = token.replace(/\\/g, "/").toLowerCase();
  const base = normalised.split("/").pop() ?? "";
  return base === "storytree" || normalised.endsWith("cli/src/main.ts") || normalised.endsWith("cli/launch.mjs");
}

/** A flag token's NAME, so `--raw body` and `--raw=body` classify identically. */
function flagName(token: string): string {
  const equals = token.indexOf("=");
  return equals === -1 ? token : token.slice(0, equals);
}

/**
 * Sub-verbs of `library artifact` that are not a read of the document.
 *
 * `history` reads the CHANGE LOG, `edit` / `new` / `retire` write, and `list` is a search naming no
 * single artifact — minting a read for one would manufacture a read per invocation, the phantom
 * `adr list` was measured to produce.
 */
const NON_READ_SUBVERBS: ReadonlySet<string> = new Set([
  "history",
  "edit",
  "new",
  "list",
  "retire",
  "rename",
]);

/**
 * PURE and TOTAL: the artifacts a shell command read through the store.
 *
 * A read is minted ONLY for the argv shape `storytree library artifact <id>`. An id appearing
 * anywhere else — a commit message, an `echo`, a `--note` — is a MENTION and is never a read; see
 * the header for the 66:1 measurement that settles this.
 */
export function scrapeArtifactReads(command: string): ReadScrape {
  if (!READ_HINT.test(command)) return EMPTY;

  const byId = new Map<string, ScrapedRead["strength"]>();
  const declinedVerbs: string[] = [];

  for (const segment of segmentsOf(command)) {
    const tokens = segment.split(/\s+/).filter((token) => token.length > 0);
    const launcher = tokens.findIndex(isStorytreeLauncher);
    if (launcher === -1) continue;
    const argv = tokens.slice(launcher + 1);
    const [area, sub, third] = argv;
    if (area !== "library" || sub !== "artifact" || third === undefined) continue;

    if (NON_READ_SUBVERBS.has(third)) {
      declinedVerbs.push(`library artifact ${third}`);
      continue;
    }
    // NOT AN ID SHAPE — declined, never minted. Two distinct things land here and both were
    // measured on this disk before the guard existed:
    //
    //   • A FLAG. `library artifact --help` names no artifact, and the LIVE OBSERVER records that
    //     token as a nodeId today — 37 reads of a node called `--help`.
    //   • A SHELL VARIABLE. `for id in …; do storytree library artifact "$id"; done` is how a sweep
    //     is written, and a naive scrape mints reads of artifacts named `$id`, `"$id"` and `$a`
    //     (108 of them here) — phantom rows that then read as a well-used artifact.
    //
    // The shape is `AssetRef`'s, plus `#` for the `<story>#uat-N` criterion ids. A real id that this
    // rejects would be a floor in the safe direction; a variable it admitted would not.
    if (!/^[A-Za-z0-9][A-Za-z0-9_#-]*$/.test(third)) {
      declinedVerbs.push(third.startsWith("-") ? "library artifact (a flag, no id)" : "library artifact (not an id shape)");
      continue;
    }
    const rest = argv.slice(3).map(flagName);
    if (rest.includes("--set") || rest.includes("--file") || rest.includes("--json")) {
      declinedVerbs.push("library artifact --set/--file/--json (a write)");
      continue;
    }
    // Weakest strength wins, matching the live observer: `--raw <field>` hands back one field.
    const strength: ScrapedRead["strength"] = rest.includes("--raw")
      ? "front_matter_read"
      : "full_payload_read";
    const existing = byId.get(third);
    if (existing === undefined || existing === "full_payload_read") byId.set(third, strength);
  }

  return { reads: [...byId].map(([id, strength]) => ({ id, strength })), declinedVerbs };
}

/** One artifact's aggregated read record. */
export interface ReadRecord {
  readonly reads: number;
  /**
   * The DISTINCT sessions (or host context windows) that read it — the SET, not a count.
   *
   * The set rather than its size, because a caller aggregating several artifacts into a cohort must
   * UNION these: one session that read four members of a cohort is one session, and summing four
   * per-artifact counts would report four. That is the difference between "eleven sessions consult
   * this cohort" and "eleven consultations happened", and only the first argues anything.
   */
  readonly sessions: ReadonlySet<string>;
  readonly firstAt: string;
  readonly lastAt: string;
}

/** One observation of a read, from either record. */
export interface ReadObservation {
  readonly id: string;
  readonly at: string;
  readonly sessionId: string;
}

/**
 * PURE: fold read observations into a per-artifact record.
 *
 * The two sources OVERLAP by construction — the live observer mints an event for
 * `library artifact <id>` as it runs, and the same invocation is also in the transcript — so a
 * caller merging them must dedupe. This folds whatever it is given and counts DISTINCT sessions
 * beside raw reads precisely so an over-counted source inflates one figure and not the other.
 */
export function foldReadObservations(
  observations: readonly ReadObservation[],
): ReadonlyMap<string, ReadRecord> {
  const draft = new Map<string, { reads: number; sessions: Set<string>; firstAt: string; lastAt: string }>();
  for (const observation of observations) {
    let record = draft.get(observation.id);
    if (record === undefined) {
      record = { reads: 0, sessions: new Set(), firstAt: observation.at, lastAt: observation.at };
      draft.set(observation.id, record);
    }
    record.reads += 1;
    record.sessions.add(observation.sessionId);
    if (observation.at < record.firstAt) record.firstAt = observation.at;
    if (observation.at > record.lastAt) record.lastAt = observation.at;
  }
  return new Map(
    [...draft].map(([id, record]) => [
      id,
      {
        reads: record.reads,
        sessions: record.sessions as ReadonlySet<string>,
        firstAt: record.firstAt,
        lastAt: record.lastAt,
      },
    ]),
  );
}

/**
 * The floors every zero in this record sits on, as prose a report must print beside it.
 *
 * A list rather than a paragraph so a caller cannot print the number and drop the caveat: the whole
 * failure this guards against is a zero read as "nobody wants this".
 */
export function readFloorNotes(): readonly string[] {
  return [
    "the live CLI capture is ALLOWLISTED to a bounded set of command shapes",
    "`deriveIdentity()` returns null in the PRIMARY CHECKOUT, so lobby work records nothing",
    "CODEX runs leave no host transcript at all",
    "an AGENT MANIFEST injects an artifact into a prompt without minting any read — the strongest " +
      "consumption evidence there is produces a zero here",
  ];
}
