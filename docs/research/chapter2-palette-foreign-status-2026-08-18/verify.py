#!/usr/bin/env python3
"""THE CHECKS. `python verify.py [--fast]` — `--fast` skips the determinism re-compose.

THIS HARNESS FAILS LOUDLY ON ITS OWN ERRORS, and that is not boilerplate on this track. Two prior
harnesses reported false passes for exactly this reason: #1382's reported five PASSes while dying on
`FileNotFoundError` before reaching the guard, and #1385's `exec`'d the composer in a way that left
`__file__` undefined so five composer guards reported "did not fire" having never reached the thing
under test. Every check below runs inside `check()`, which catches, prints, and counts an exception
as a FAILURE — never as a pass and never as a silent skip.
"""
import io
import json
import os
import re
import subprocess
import sys
import traceback

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import palette_read as PR  # noqa: E402

REPO = PR.REPO
REPORT_PATH = os.path.join(HERE, "foreign-status-report.json")
FAST = "--fast" in sys.argv[1:]

PASS, FAIL = [], []


def check(name, fn, detail=""):
    """Run one assertion. An EXCEPTION is a failure with its traceback, never a skip."""
    try:
        ok = bool(fn())
    except Exception:                                        # noqa: BLE001 — that is the point
        FAIL.append(name)
        print("FAIL  %s\n      harness error:\n%s" % (name, traceback.format_exc().rstrip()))
        return False
    (PASS if ok else FAIL).append(name)
    print("%s  %s%s" % ("PASS " if ok else "FAIL ", name, ("   [%s]" % detail) if detail else ""))
    return ok


if not os.path.isfile(REPORT_PATH):
    raise SystemExit("verify: no foreign-status-report.json — run `python measure_palette.py` first. "
                     "A missing report is a missing measurement, not a passing check.")
R = json.load(open(REPORT_PATH, encoding="utf-8"))


# == 1. the fence =====================================================================================
print("\n== 1. the fence ==")
try:
    base = subprocess.run(["git", "merge-base", "origin/main", "HEAD"], cwd=REPO,
                          capture_output=True, text=True, check=True).stdout.strip()
    diff = subprocess.run(["git", "diff", "--name-only", base, "--"], cwd=REPO,
                          capture_output=True, text=True, check=True).stdout.split()
    untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=REPO,
                               capture_output=True, text=True, check=True).stdout.split()
    touched = sorted(set(diff) | set(untracked))
except Exception:                                            # noqa: BLE001
    touched = None

check("every path this branch touches is under docs/research/**",
      lambda: touched is not None and all(p.startswith("docs/research/") for p in touched),
      "%d paths" % (len(touched) if touched else -1))
check("`substrate.ts` is READ and NOT edited — the diagnosed cause stays in the app (owner fence)",
      lambda: touched is not None
      and not any(p.startswith("packages/forest-world/") for p in touched)
      and "variant: hash(`cell:${key}:${i}`) % 3"
      in open(PR.APP_SUBSTRATE, encoding="utf-8").read())
check("`apps/studio/src/index.css` is READ and NOT edited",
      lambda: touched is not None and "apps/studio/src/index.css" not in touched)
check("LAND_CAMERA_ELEVATION_DEG is still 20 — no camera moved here",
      lambda: re.search(r"LAND_CAMERA_ELEVATION_DEG\s*=\s*20\b",
                        open(os.path.join(REPO, "packages", "forest-world", "src", "camera.ts"),
                             encoding="utf-8").read()) is not None)


# == 2. no vendored copy — stated as a PROMISE, not as a branch diff ==================================
# A branch-diff fence tests the branch, not the promise: a substring check like "scatter.py UNEDITED"
# stays GREEN while being false the moment the branch legitimately edits it. These assert the durable
# property instead — that this directory holds no second copy of anything it imports.
print("\n== 2. no vendored copy ==")
OWN = [f for f in sorted(os.listdir(HERE)) if f.endswith(".py")]
OWN_SRC = {f: open(os.path.join(HERE, f), encoding="utf-8").read() for f in OWN}

check("this pass declares NO token table of its own",
      lambda: not any(re.search(r"^\s*STATUS_TOKENS\s*=", s, re.M) for s in OWN_SRC.values()),
      ", ".join(OWN))
check("this pass declares NO palette builder, snap, or shade table of its own",
      lambda: not any(re.search(r"^\s*def (build_palette|snap|back_half|shade)\b", s, re.M)
                      or re.search(r"^\s*(KEY_SHADE|W_LUMA|COAST_SAND)\s*=", s, re.M)
                      for s in OWN_SRC.values()))
check("the tokens come from the interior fork's `compose.py` BY PATH, not by re-declaration",
      lambda: PR.C.__file__ and os.path.samefile(PR.C.__file__,
                                                 os.path.join(PR.FORK, "compose.py")))
check("the rendered vocabulary comes from `island_pass.py`, not from a local list",
      lambda: (tuple(PR.RENDERED) == tuple(PR.P.RENDERED_VOCABULARY)
               and not any(re.search(r'RENDERED\s*=\s*\(\s*"healthy"', s) for s in OWN_SRC.values())))
check("the ceiling comes from `shadow.safe_depth`, imported — not a second implementation",
      lambda: (callable(PR.SH.safe_depth)
               and not any(re.search(r"^\s*def safe_depth\b", s, re.M) for s in OWN_SRC.values())))
check("this pass adds NO compositor — it mounts `compose_healthy.py` whole",
      lambda: (not any(re.search(r"^\s*def compose_(land|panel)\b", s, re.M) for s in OWN_SRC.values())
               and "compose_healthy.py" in OWN_SRC["measure_palette.py"]))


# == 3. the reader, reproduced then varied ============================================================
print("\n== 3. the reader ==")
rows = R["theReaderVaried"]
rowA = [k for k in rows if k.startswith("A ")][0]
rowD = [k for k in rows if k.startswith("D ")][0]
check("row A REPRODUCES PR #1385's own count exactly (21 of 78) — same instrument, not a new one",
      lambda: rows[rowA]["crossReading"] == 21 and rows[rowA]["entries"] == 78,
      "%d of %d" % (rows[rowA]["crossReading"], rows[rowA]["entries"]))
check("the count SHRINKS as the reader is corrected, and every row is non-zero",
      lambda: all(rows[k]["crossReading"] > 0 for k in rows)
      and rows[rowA]["crossReading"] > rows[rowD]["crossReading"],
      " -> ".join(str(rows[k]["crossReading"]) for k in rows))
check("the FILL-ONLY rate is HIGHER than the all-faces rate — the narrower table is not the "
      "more forgiving one, correcting PR #1385's own wording",
      lambda: rows[[k for k in rows if k.startswith("B ")][0]]["pct"] > rows[rowA]["pct"],
      "%.1f%% vs %.1f%%" % (rows[[k for k in rows if k.startswith("B ")][0]]["pct"], rows[rowA]["pct"]))
check("a THIRD of the shipped count names a token pair the app can never draw",
      lambda: R["howMuchOfTheCountIsUnREACHABLE"]["unreachable"] == 9,
      "%d unreachable of %d" % (R["howMuchOfTheCountIsUnREACHABLE"]["unreachable"],
                                R["howMuchOfTheCountIsUnREACHABLE"]["shippedRowCrossReads"]))
check("`unhealthy` and `building` really are outside the rendered vocabulary (ADR-0296 / ADR-0038), "
      "re-read from worldStatus.ts rather than trusted",
      lambda: (re.search(r"status === 'unhealthy'\)\s*return 'mapped'", WS) is not None
               and re.search(r"status === 'building'\)\s*return 'proposed'", WS) is not None
               and "unhealthy" not in PR.RENDERED and "building" not in PR.RENDERED)
      if (WS := open(os.path.join(REPO, "apps", "studio", "src", "lib", "worldStatus.ts"),
                     encoding="utf-8").read()) else False)
check("the SYMMETRIC reader — a second, independent removal of the same objection — agrees "
      "the defect is real",
      lambda: R["symmetricReader"]["foldedFills"]["crossReading"] > 0,
      "%d of %d" % (R["symmetricReader"]["foldedFills"]["crossReading"],
                    R["symmetricReader"]["foldedFills"]["entries"]))


# == 4. the test this pass stands on ==================================================================
print("\n== 4. matched condition ==")
m = R["matchedCondition"]
check("the shipped fills FAIL the matched-condition rule",
      lambda: m["shippedFills"]["ok"] is False)
check("the failing pair is `healthy` beside `unknown`",
      lambda: {m["shippedFills"]["gap"]["a"]["status"],
               m["shippedFills"]["gap"]["b"]["status"]} == {"healthy", "unknown"},
      "%.2f dE" % m["shippedFills"]["gap"]["dE"])
check("the bar is DERIVED from the shade table, and re-derives to the same value now",
      lambda: PR.shallowest_shade_rung(PR.RENDERED)["dE"] == m["shippedFills"]["bar"]["dE"],
      "%.2f dE" % m["shippedFills"]["bar"]["dE"])
check("the gap is smaller than the bar by more than 4x — not a marginal call",
      lambda: m["shippedFills"]["bar"]["dE"] / m["shippedFills"]["gap"]["dE"] > 4.0,
      "%.1fx" % (m["shippedFills"]["bar"]["dE"] / m["shippedFills"]["gap"]["dE"]))
check("THE INVERSION: the meaningless texture step is LARGER than the meaningful status gap",
      lambda: R["theInversion"]["meaninglessStep"]["dE"] > R["theInversion"]["meaningfulGap"]["dE"],
      "%.2f vs %.2f dE" % (R["theInversion"]["meaninglessStep"]["dE"],
                           R["theInversion"]["meaningfulGap"]["dE"]))
check("EVERY other rendered pair clears the bar as shipped — the defect is ONE pair, not the palette",
      lambda: all(v["shipped"] >= m["shippedFills"]["bar"]["dE"]
                  for k, v in m["perPair"].items() if k != "healthy|unknown"),
      min("%s %.2f" % (k, v["shipped"]) for k, v in m["perPair"].items() if k != "healthy|unknown"))
check("the COLLAPSE clears the rule — one top token per status is admissible",
      lambda: m["collapsedFills"]["ok"] is True,
      "%.2f dE vs bar %.2f" % (m["collapsedFills"]["gap"]["dE"], m["collapsedFills"]["bar"]["dE"]))
check("the collapse improves EVERY pair, none regresses",
      lambda: all(v["collapsed"] >= v["shipped"] for v in m["perPair"].values()),
      " ".join("%s %.1f->%.1f" % (k.split("|")[0][:4], v["shipped"], v["collapsed"])
               for k, v in m["perPair"].items()))
check("the side ladder carries a degenerate pair (~2.3 dE), which is why the bar is the FILL ladder",
      lambda: len(R["sideLadderIsDegenerate"]["pairs"]) > 0
      and all(p["dE"] < 3.0 for p in R["sideLadderIsDegenerate"]["pairs"]),
      "%d pairs" % len(R["sideLadderIsDegenerate"]["pairs"]))


# == 5. the shipped app ===============================================================================
print("\n== 5. the shipped app ==")
CSS = open(PR.APP_CSS, encoding="utf-8").read()
app = R["theShippedApp"]
check("every token this pass measures is REALLY in the app's stylesheet",
      lambda: all(t.lower() in CSS.lower()
                  for st in PR.RENDERED
                  for t in list(PR.C.STATUS_TOKENS[st]["top"]) + [PR.C.STATUS_TOKENS[st]["side"]]))
check("the app path has NO shade ladder — 4 colours per status, not 13",
      lambda: app["appColoursPerStatus"] == 4 and len(PR.emitted(("healthy",), 3, "all")) == 13)
check("the app is NOT exempt: two statuses collide inside its own smaller set at FULL LIGHT",
      lambda: app["matchedGapFills"]["dE"] < app["bar"]["dE"],
      "%.2f dE vs bar %.2f" % (app["matchedGapFills"]["dE"], app["bar"]["dE"]))
check("`unknown` is NOT a schema status — it is the null-status fallback class",
      lambda: (app["whereUnknownComesFrom"]["unknownIsASchemaStatus"] is False
               and app["whereUnknownComesFrom"]["unknownHasItsOwnBlock"] is False
               and "st-${cap.status ?? 'unknown'}" in TV)
      if (TV := open(os.path.join(REPO, "apps", "studio", "src", "components", "TreeView.tsx"),
                     encoding="utf-8").read()) else False)
check("so the direction is the worst one available: absence of information reading as a signed pass",
      lambda: {app["matchedGapFills"]["a"]["status"],
               app["matchedGapFills"]["b"]["status"]} == {"healthy", "unknown"})
check("which pair the app DRAWS is a hash, and it collides 2 times in 9",
      lambda: app["variantCollisionRate"]["healthy|unknown"]["collidingVariantPairs"] == 2,
      "rate %.3f" % app["variantCollisionRate"]["healthy|unknown"]["rate"])


# == 6. corpus exposure — what is latent and what is drawn ============================================
print("\n== 6. corpus exposure ==")
ex = R["corpusExposure"]
check("read from the REAL corpus census (46 stories / 244 capabilities), not a fixture",
      lambda: ex["capabilities"] == 244 and ex["storiesRenderingOnMap"] > 0,
      "%d stories render on the map" % ex["storiesRenderingOnMap"])
check("NO capability in the live corpus renders `unknown` — the worst pair is LATENT, not drawn",
      lambda: ex["statusPresentOnNStories"].get("unknown", 0) == 0)
check("no island draws healthy beside unknown today",
      lambda: ex["coDrawnPairs"].get("healthy|unknown", 0) == 0,
      str(sorted(ex["coDrawnPairs"])))
check("but the closest pair that IS drawn today clears the bar by under 2%",
      lambda: 1.0 < m["perPair"]["mapped|proposed"]["shipped"] / m["shippedFills"]["bar"]["dE"] < 1.02,
      "mapped|proposed %.2f vs bar %.2f on %d stories"
      % (m["perPair"]["mapped|proposed"]["shipped"], m["shippedFills"]["bar"]["dE"],
         ex["coDrawnPairs"].get("mapped|proposed", 0)))


# == 7. the price and the ceilings ====================================================================
print("\n== 7. price and ceilings ==")
pr = R["thePrice"]
ce = R["theCeilings"]
check("the fix costs NEGATIVE palette entries — the first move on this arc that pays for itself",
      lambda: pr["collapsedPaletteEntries"] < pr["shippedPaletteEntries"],
      "%d -> %d (%+d)" % (pr["shippedPaletteEntries"], pr["collapsedPaletteEntries"],
                          pr["collapsedPaletteEntries"] - pr["shippedPaletteEntries"]))
check("the shipped palette this pass prices IS the one `compose.build_palette` delivers",
      lambda: pr["shippedPaletteEntries"] == pr["deliveredShippedPalette"] == len(PR.C.PALETTE))
check("the ceilings reproduce the arc's own 0.74 / 0.76 / 0.88 / 0.91 series",
      lambda: [ce["asPR1385Measured"][s]["ceiling"] for s in
               ("healthy", "mapped", "proposed", "unknown")] == [0.74, 0.76, 0.88, 0.91])
check("the binding ceiling is `unknown`'s, and the FOLD does not move it",
      lambda: ce["asPR1385Measured"]["_binding"] == ce["folded"]["_binding"] == 0.91)
check("THE COLLAPSE DOES NOT RAISE HEADROOM — it moves the binding ceiling the WRONG way, "
      "against the arc's stated expectation",
      lambda: ce["collapsed"]["_binding"] > ce["asPR1385Measured"]["_binding"],
      "0.91 -> %.2f" % ce["collapsed"]["_binding"])
check("so the 0.80 ladder stays INADMISSIBLE on a mixed island under every configuration measured",
      lambda: all(ce[k]["_binding"] > ce["deepestAuthoredRung"]
                  for k in ("asPR1385Measured", "folded", "collapsed")))


# == 8. the gate fires ================================================================================
print("\n== 8. the gate ==")
check("the gate REFUSES the shipped table",
      lambda: R["theGate"]["shippedTable"]["refused"] is True)
check("the refusal names both statuses, both colours and the bar — not just a boolean",
      lambda: all(s in R["theGate"]["shippedTable"]["message"]
                  for s in ("healthy", "unknown", "#", "dE")))
check("the gate ADMITS the collapsed table, so it is not refusing everything",
      lambda: R["theGate"]["collapsedTable"]["refused"] is False)


# == 9. the pictures ==================================================================================
print("\n== 9. the pictures ==")
PICS = ["matched-condition.png", "the-inversion.png"]
if not R["theIsland"].get("skipped"):
    PICS.append("island-read.png")
for pic in PICS:
    check("`%s` exists and decodes" % pic,
          lambda pic=pic: Image.open(os.path.join(HERE, pic)).size[0] > 0)
    check("`%s` carries a provenance sidecar naming ONE code state" % pic,
          lambda pic=pic: bool(json.load(open(os.path.join(HERE, pic + ".provenance.json"),
                                              encoding="utf-8")).get("codeState")))
check("no Blender frame was rendered by this pass",
      lambda: R["blenderFramesRendered"] == 0)

if not R["theIsland"].get("skipped"):
    isl = R["theIsland"]
    check("the island measurement ran on a TREE-LESS, PLANT-LESS canvas",
          lambda: "SURFACE_BARE" in isl["measuredOn"])
    check("the island's fill mask is EXACT (delivered colour is an emitted top token), not geometric",
          lambda: isl["distinctFillColours"] > 0 and isl["fillPx"] > 0,
          "%d px in %d colours" % (isl["fillPx"], isl["distinctFillColours"]))
    check("every capability on the research surface is `healthy`, so this island exercises ONE status",
          lambda: isl["statusesOnThisIsland"] == ["healthy"])
    check("NOT ONE strict fill pixel reads foreign, under ANY of the four readers — the delivered "
          "raster is clean",
          lambda: all(v == 0 for v in isl["foreignReadingFillPx"].values()),
          str(sorted(set(isl["foreignReadingFillPx"].values()))))
    check("the LOOSE mask on the SAME island reports a large non-zero — so the symptom is the MASK, "
          "measured rather than argued",
          lambda: all(v > 0 for v in isl["foreignReadingLoosePx"].values())
          and max(isl["foreignReadingLoosePct"].values()) > 10.0,
          "strict 0.0%% vs loose %s%% (shipped reader)"
          % isl["foreignReadingLoosePct"][[k for k in isl["foreignReadingLoosePct"]
                                           if k.startswith("A ")][0]])


# == 10. determinism, on the DECODED raster ===========================================================
print("\n== 10. determinism ==")
if FAST:
    print("SKIP  --fast: the determinism re-compose was not run (this is UNVERIFIED, not passed)")
else:
    import tempfile
    tmp = tempfile.mkdtemp(prefix="foreign-determinism-")
    env = dict(os.environ, STORYTREE_FOREIGN_OUT=tmp)
    run = subprocess.run([sys.executable, os.path.join(HERE, "measure_palette.py"), "--no-island"],
                         cwd=HERE, env=env, capture_output=True, text=True)
    check("the re-compose exited cleanly",
          lambda: run.returncode == 0, (run.stderr or "").strip()[-200:])
    for pic in ("matched-condition.png", "the-inversion.png"):
        check("`%s` re-composes PIXEL-IDENTICALLY (decoded raster, never a file hash)" % pic,
              lambda pic=pic: np.array_equal(
                  np.array(Image.open(os.path.join(HERE, pic)).convert("RGB")),
                  np.array(Image.open(os.path.join(tmp, pic)).convert("RGB"))))

print("\n%d/%d checks passed" % (len(PASS), len(PASS) + len(FAIL)))
json.dump({"passed": len(PASS), "of": len(PASS) + len(FAIL), "fast": FAST,
           "checks": [{"ok": True, "name": n} for n in PASS]
                     + [{"ok": False, "name": n} for n in FAIL]},
          open(os.path.join(HERE, "verify-report.json"), "w"), indent=1)
if FAIL:
    print("FAILED: " + "; ".join(FAIL))
    sys.exit(1)
