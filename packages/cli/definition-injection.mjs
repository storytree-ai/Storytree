#!/usr/bin/env node
// Prompt-keyed definition injector — the `UserPromptSubmit` hook entry.
//
// When a prompt is submitted in an interactive session, scan it for Library `definition` terms
// and prepend the matched definitions' `oneLine` summaries (plus one pull pointer to the full
// body) to the model's context — so the agent doesn't spend a full tool round-trip (~52k fixed
// overhead + the whole context re-billed as cache-read, ~180–210k tokens in a mature session)
// looking a term up mid-work.
//
// This is term DISAMBIGUATION at the moment of use, not a glossary preload: only prompt-matched
// terms, `oneLine` only (never the whatItIs/whatItIsNot body — ADR-0156), capped at MAX_MATCHES
// so a term-dense prompt cannot front-load the corpus (the ADR-0135-retired glossary stays
// retired; the full body stays pull-based behind `storytree library artifact <id>`, ADR-0023).
//
// Constraints that shape it (mirrors provision-worktree.mjs):
//   - BARE NODE, ZERO non-builtin deps — the hook runs on EVERY prompt submit and blocks the
//     model's response, so startup latency matters: plain `node` + the seed-corpus JSON parse is
//     ~150 ms on this box where a tsx boot is ~1 s. It also keeps working in a fresh worktree
//     that has no node_modules yet.
//   - OFFLINE — reads the seed corpus `apps/studio/data/knowledge.json`, never the live DB. The
//     seed can lag a live CLI edit; a slightly stale oneLine still beats a 200k-token lookup,
//     and the pointer always pulls the live/full body.
//   - FAIL-SAFE as a hook — ALWAYS exit 0, silent on every failure path (the presence-hook.sh
//     contract): a definition-injection failure must never surface into the session.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

/** Cap on injected definitions per prompt — selectivity is the design, not a tuning knob. */
export const MAX_MATCHES = 5;

/** Lowercase and collapse hyphen/underscore to space, so `proof-mode` == `Proof mode`. */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The surface strings one definition can be recognised by: its id, its title, and each
 * slash-separated title part ("leaf step / leaf judgment" matches on either part).
 */
function surfacesFor(doc) {
  const out = new Set();
  const add = (s) => {
    const n = normalize(s ?? "").trim();
    if (n.length >= 3) out.add(n);
  };
  add(doc.id);
  add(doc.title);
  for (const part of String(doc.title ?? "").split("/")) add(part);
  return [...out];
}

/** Word-boundary, plural-tolerant regex for one normalized surface string. */
function surfacePattern(surface) {
  const words = surface.split(" ").map(escapeRegExp);
  const last = words.length - 1;
  // plural tolerance on the final word: verdict(s), stor(y|ies)
  const tail = words[last];
  words[last] = tail.endsWith("y")
    ? `(?:${tail}|${tail.slice(0, -1)}ies)`
    : `${tail}(?:s|es)?`;
  return new RegExp(`\\b${words.join(" ")}\\b`);
}

/**
 * Match `prompt` against the definitions' surfaces. Returns at most `max` docs, most-specific
 * (longest matched surface) first, ties in corpus order; one entry per definition.
 */
export function matchDefinitions(prompt, docs, opts = {}) {
  const max = opts.max ?? MAX_MATCHES;
  const haystack = normalize(prompt);
  const ranked = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    let best = null;
    for (const surface of surfacesFor(doc)) {
      if (!surfacePattern(surface).test(haystack)) continue;
      if (best === null || surface.length > best) best = surface.length;
    }
    if (best !== null) ranked.push({ doc, best, i });
  }
  ranked.sort((a, b) => b.best - a.best || a.i - b.i);
  return ranked.slice(0, max).map((r) => r.doc);
}

/** Render the injection block: one oneLine per match + one shared pull-pointer line. */
export function renderInjection(matches) {
  if (matches.length === 0) return "";
  const lines = matches.map((d) => `- ${d.id}: ${d.oneLine}`);
  return [
    "[storytree] Library definitions for terms in this prompt (full body: `storytree library artifact <id>`):",
    ...lines,
    "",
  ].join("\n");
}

/** prompt + corpus docs in → injection text out ("" when nothing matches). */
export function buildInjection(prompt, docs, opts = {}) {
  const defs = docs.filter(
    (d) => d?.kind === "definition" && typeof d.id === "string" && typeof d.oneLine === "string" && d.oneLine.length > 0,
  );
  return renderInjection(matchDefinitions(prompt, defs, opts));
}

/** The checkout that physically contains this file (`../` from packages/cli/). */
function thisRoot() {
  return resolve(fileURLToPath(new URL("../../", import.meta.url)));
}

function main() {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const prompt = typeof input?.prompt === "string" ? input.prompt : "";
    if (prompt === "") return;
    const seed = join(thisRoot(), "apps", "studio", "data", "knowledge.json");
    const docs = JSON.parse(readFileSync(seed, "utf8"));
    if (!Array.isArray(docs)) return;
    const out = buildInjection(prompt, docs);
    if (out !== "") process.stdout.write(out);
  } catch {
    // fail-safe hook contract: silent, exit 0
  }
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
  process.exit(0);
}
