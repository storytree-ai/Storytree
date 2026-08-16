#!/usr/bin/env python3
"""THE MACHINE-CHECKABLE HALF. The look is the owner's attestation (ADR-0070 stage 2); these are the
claims a session may assert for itself.

    python verify.py            # every check
    python verify.py --fast     # skip the re-compose (checks 4-6)

THE CHECK THAT IS THE INCREMENT. Check 1 is not a hygiene check — it IS the increment's proof
obligation. "A healthy island was rendered" is not the claim; "nothing on this island was made up"
is, and the difference is the entire point of replacing `fork-spike-island`.
"""
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
LINES = os.path.join(REPO, "docs", "research", "chapter2-hex-lines-and-flat-green-2026-08-16")
FAST = "--fast" in sys.argv

sys.path.insert(0, HERE)
import island_pass as P                                   # noqa: E402

ISLAND = json.load(open(os.path.join(HERE, "island.json")))
PROOF = json.load(open(os.path.join(HERE, "proof.json")))
CENSUS = json.load(open(os.path.join(HERE, "census.json")))
REPORT = json.load(open(os.path.join(HERE, "island-report.json")))

RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('   ' + detail) if detail else ''}", flush=True)
    return bool(ok)


# ================================================================= 1. NOTHING HERE IS INVENTED
print("\n== 1. nothing on this island is invented ==")

STORY_DIR = os.path.join(REPO, "stories", ISLAND["storyId"])
check("the island names a story that EXISTS on disk", os.path.isdir(STORY_DIR),
      f"stories/{ISLAND['storyId']}")


def frontmatter(path):
    txt = open(path, encoding="utf-8").read()
    m = re.match(r"---\r?\n(.*?)\r?\n---", txt, re.S)
    return (m.group(1) if m else ""), txt[m.end():] if m else txt


def fm_value(fm, key):
    """One scalar frontmatter value, quotes stripped.

    The corpus quotes some scalars and not others (`id: "traversal-trace-sink"` beside
    `tier: capability`), and a regex that keeps the quotes silently fails every comparison against a
    parsed value. This check exists to be INDEPENDENT of `loadNodeSpec`, so it does its own parsing —
    which means it also owns this wart.
    """
    m = re.search(rf"^{key}:\s*(.+?)\s*$", fm, re.M)
    return m.group(1).strip("\"'") if m else None


# --- 1a. the capability list, statuses and test counts come from disk + store ----------------------
disk_caps = {}
for f in sorted(os.listdir(STORY_DIR)):
    if not f.endswith(".md"):
        continue
    fm, body = frontmatter(os.path.join(STORY_DIR, f))
    tier, cid, st = fm_value(fm, "tier"), fm_value(fm, "id"), fm_value(fm, "status")
    if not (tier and cid):
        continue
    if tier == "capability":
        # `## Contracts` items, counted at the section level: this is a deliberately INDEPENDENT
        # count. Asking `loadNodeSpec` again would only prove the emitter called the same function
        # twice, which is not evidence that the number describes the file.
        sec = re.split(r"\n##\s+", body)
        contracts = [s for s in sec if s.lower().startswith("contracts")]
        # The corpus writes contracts as a NUMBERED list whose item is a bolded id
        # (``1. **`the-contract-id`**``), and each item then carries `- **asserts -**` /
        # `- **why -**` BULLETS underneath. Counting bullets as well double-counted every
        # capability (7 -> 14). Both mistakes made this check fail against a CORRECT emitter, which
        # is the right way round: an independent count that agreed by construction would be worth
        # nothing, and the two ways it was wrong here are exactly why it is worth writing.
        n = len(re.findall(r"^\s*\d+\.\s+\*\*", contracts[0], re.M)) if contracts else 0
        disk_caps[cid] = (st, n)

emitted = {c["id"]: c for c in ISLAND["capabilities"]}
check("every emitted capability exists on disk",
      set(emitted) <= set(disk_caps), f"{len(emitted)} emitted, {len(disk_caps)} on disk")
check("every emitted AUTHORED status matches the spec frontmatter",
      all(emitted[i]["authoredStatus"] == disk_caps[i][0] for i in emitted),
      f"authored: {sorted({c['authoredStatus'] for c in emitted.values()})}")
check("every emitted TEST COUNT matches an independent `## Contracts` count",
      all(emitted[i]["tests"] == disk_caps[i][1] for i in emitted),
      f"tests: {[c['tests'] for c in ISLAND['capabilities']]}")

# --- 1b. THE HEADLINE: no invented status reaches the island --------------------------------------
statuses = list(ISLAND["capStatuses"])
check("NO status on this island is outside the RENDERED vocabulary",
      all(s in P.RENDERED_VOCABULARY for s in statuses),
      f"{sorted(set(statuses))} within {list(P.RENDERED_VOCABULARY)}")
check("every `healthy` cell is backed by a SIGNED PASS, never authored paint (ADR-0040)",
      all(c["verdictGlyph"] == "✓" for c in ISLAND["capabilities"] if c["status"] == "healthy"),
      f"{sum(1 for c in ISLAND['capabilities'] if c['verdictGlyph'] == chr(0x2713))} signed passes")
check("NOT ONE capability in the whole corpus is AUTHORED healthy (so authored green is not a route)",
      CENSUS["totals"]["authoredHealthy"] == 0,
      f"authored healthy {CENSUS['totals']['authoredHealthy']} of {CENSUS['totals']['capabilities']}")

# --- 1c. the UAT criteria are the story's own -----------------------------------------------------
story_fm, story_body = None, None
for f in sorted(os.listdir(STORY_DIR)):
    if not f.endswith(".md"):
        continue
    fm, body = frontmatter(os.path.join(STORY_DIR, f))
    if fm_value(fm, "tier") == "story":
        story_fm, story_body = fm, body
        break
crit_ids = set(re.findall(r"\(criterion-id:\s*(uatc_[0-9a-f]+)\)", story_body or ""))
emitted_crit = {c["id"] for c in ISLAND["uatCriteria"]}
check("every emitted UAT criterion id appears in the story spec",
      emitted_crit <= crit_ids, f"{len(emitted_crit)} emitted, {len(crit_ids)} authored")
check("the UAT criteria carry a rolled-up state, not a default",
      all(c["state"] in ("proven", "pending", "failing") for c in ISLAND["uatCriteria"]),
      f"{[c['state'] for c in ISLAND['uatCriteria']].count('proven')} proven of "
      f"{len(ISLAND['uatCriteria'])}")

# --- 1d. the tile quota is the app's rule ---------------------------------------------------------
check("the tile quota is the app's own max(3, caps+2)",
      len(ISLAND["tiles"]) == max(3, len(ISLAND["capabilities"]) + 2),
      f"{len(ISLAND['capabilities'])} caps -> {len(ISLAND['tiles'])} tiles")


# ================================================================= 2. THE FOLD IS THE APP'S
print("\n== 2. the presentation fold is the app's, not a convenient restatement ==")

WORLD_STATUS = os.path.join(REPO, "apps", "studio", "src", "lib", "worldStatus.ts")
src = open(WORLD_STATUS, encoding="utf-8").read()
check("`building` folds to `proposed` in the app (ADR-0038)",
      re.search(r"status === 'building'\)\s*return 'proposed'", src) is not None)
check("`unhealthy` folds to `mapped` in the app (ADR-0296 - the world draws NO withered form)",
      re.search(r"status === 'unhealthy'\)\s*return 'mapped'", src) is not None)
check("a signed pass is the ONLY source of green in the app (ADR-0040)",
      re.search(r"verdict\?\.outcome === 'pass'\)\s*return 'healthy'", src) is not None)
check("authored `healthy` without a signed pass UNDER-claims to `mapped`",
      re.search(r"status === 'healthy'\)\s*return 'mapped'", src) is not None)
check("the pass's declared RENDERED vocabulary excludes both folded-away tokens",
      "building" not in P.RENDERED_VOCABULARY and "unhealthy" not in P.RENDERED_VOCABULARY,
      f"{list(P.RENDERED_VOCABULARY)}")

# THE SCOPE OF THE CLAIM, asserted rather than trusted. "The map cannot draw charcoal" is true of the
# STUDIO's world fold and NOT of the render core, whose withered machinery `worldStatus.ts` says is
# left in place "unreachable rather than deleted". Both halves are checked, because a claim this
# pass's headline rests on must not be one a reader has to take on trust — and the over-broad version
# ("the app cannot draw it") was in this README until this check was written.
STUDIO_SRC = os.path.join(REPO, "apps", "studio", "src")
callers = []
for root, _dirs, files in os.walk(STUDIO_SRC):
    for f in files:
        if not f.endswith((".ts", ".tsx")) or ".test." in f:
            continue
        body = open(os.path.join(root, f), encoding="utf-8").read()
        if re.search(r"\bpresentStories\s*\(", body):
            callers.append(os.path.relpath(os.path.join(root, f), REPO).replace(os.sep, "/"))
check("`presentStories` is the ONE fold the studio's world sits behind",
      sorted(set(callers)) == ["apps/studio/src/components/TreeView.tsx",
                               "apps/studio/src/lib/worldStatus.ts"],
      f"{sorted(set(callers))}")
legend = open(os.path.join(STUDIO_SRC, "components", "WorldLegend.tsx"), encoding="utf-8").read()
check("...and the app's own legend states the consequence: every rendered status is an ALIVE one",
      "every rendered status is an alive one" in " ".join(legend.split()).lower())
core = open(os.path.join(REPO, "packages", "forest-world", "src", "scene.ts"), encoding="utf-8").read()
check("SCOPE: the withered machinery still EXISTS in the render core - unreachable, not deleted",
      "'unhealthy'" in core and "withered" in core,
      "so the claim is about the studio's fold, never about the code not containing the colour")

# --- the claim about the fixture, asserted rather than asserted-in-prose ---------------------------
fixture = json.load(open(os.path.join(GRASS, "island.json")))
outside = sorted({s for s in fixture["capStatuses"] if s not in P.RENDERED_VOCABULARY})
check("the FIXTURE painted tokens the map cannot produce", outside == ["building", "unhealthy"],
      f"{outside} of {sorted(set(fixture['capStatuses']))}")
check("...including the charcoal the owner circled (`unhealthy` -> `mapped`)",
      "unhealthy" in fixture["capStatuses"] and "unhealthy" in outside,
      f"{list(fixture['capStatuses']).count('unhealthy')} unhealthy capability on the fixture")


# ================================================================= 3. THE SURFACE IS THE PICK
print("\n== 3. the story was CHOSEN by census, not by preference ==")

rows = {r["story"]: r for r in CENSUS["rows"]}
me = rows.get(ISLAND["storyId"])
check("the chosen story is a census CANDIDATE (fully green AND not retired)",
      me is not None and me["candidate"], f"{len(CENSUS['totals']['candidates'])} candidates")
check("it is green at the CAPABILITY tier", me and me["renderedHealthy"] == me["caps"],
      f"{me['renderedHealthy']}/{me['caps']}" if me else "")
check("it is green at the UAT tier too - the property that selected it over the larger candidate",
      all(c["state"] == "proven" for c in ISLAND["uatCriteria"]) and len(ISLAND["uatCriteria"]) > 0,
      f"{len(ISLAND['uatCriteria'])} criteria, all proven")
check("no capability leans on ADR-0097 gate coverage - each carries its OWN signed pass",
      all(not c.get("coveredByGate") for c in PROOF["capabilities"]))
check("the census used the app's own per-cap fold (coverage included), not a hand reduction",
      "rollupCapStatus" in open(os.path.join(HERE, "census_healthy.ts"), encoding="utf-8").read())


# ================================================================= 4. NO SECOND COPY
print("\n== 4. the prior passes are IMPORTED, never vendored ==")

mine = {f for f in os.listdir(HERE) if f.endswith(".py")}
check("this directory adds no second compositor / scatter / seam control",
      not (mine & {"compose_core.py", "compose_dressed.py", "compose.py", "scatter.py",
                   "seams.py", "grass.py", "provenance.py"}),
      f"own .py: {sorted(mine)}")
comp = open(os.path.join(HERE, "compose_healthy.py"), encoding="utf-8").read()
check("it imports the grass pass's compositor and scatter",
      "import compose_core as D" in comp and "import scatter" in comp)
check("it imports the hex-lines pass's seam control",
      "import seams as S" in comp)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()[:12]


# The drift this pass INHERITED and did not create, reported because a reader deserves to know the
# machinery has forked before. `compose_core.py` is the grass pass's copy of the dressing pass's
# `compose_dressed.py`, and `scatter.py` exists in both directories. Neither is this pass's to fix
# (both are committed evidence of landed work), but nothing detects the fork, so this names it.
dressed = os.path.join(REPO, "docs", "research", "chapter2-island-place-dressing-2026-08-16")
scatter_copies = [os.path.join(d, "scatter.py") for d in (GRASS, dressed)
                  if os.path.exists(os.path.join(d, "scatter.py"))]
check("REPORTED, not fixed: the two committed `scatter.py` copies are still identical",
      len({sha(p) for p in scatter_copies}) == 1,
      f"{len(scatter_copies)} copies, sha {sorted({sha(p) for p in scatter_copies})} - "
      f"nothing detects a divergence but this line")


# ================================================================= 5. THE FENCE
print("\n== 5. the fence ==")

cam = open(os.path.join(REPO, "packages", "forest-world", "src", "camera.ts"), encoding="utf-8").read()
m = re.search(r"LAND_CAMERA_ELEVATION_DEG\s*=\s*([0-9.]+)", cam)
check("LAND_CAMERA_ELEVATION_DEG is STILL 20 and was not touched",
      m is not None and float(m.group(1)) == 20.0, f"= {m.group(1) if m else '?'}")
check("the pass composes at its own declared angle, as a named parameter",
      abs(float(ISLAND["camera"]["elevationDeg"]) - P.PASS_ELEVATION_DEG) < 1e-9,
      f"{ISLAND['camera']['elevationDeg']} deg")

try:
    diff = subprocess.run(["git", "diff", "--name-only", "HEAD"], cwd=REPO,
                          capture_output=True, text=True, timeout=120).stdout.split()
    untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=REPO,
                               capture_output=True, text=True, timeout=120).stdout.split()
    stray = [p for p in diff + untracked if not p.startswith("docs/research/")]
    check("the working tree's changes are confined to docs/research/**",
          not stray, f"{len(stray)} stray" + (f": {stray[:5]}" if stray else ""))
except Exception as exc:                                   # noqa: BLE001
    check("the working tree's changes are confined to docs/research/**", False, f"git failed: {exc}")


# ================================================================= 6. THE PICTURES
print("\n== 6. the delivered pictures ==")

PICTURES = ("healthy-island.png", "fixture-vs-real.png", "seam-fork.png", "island-detail-6x.png",
            "green-consistency.png")
check("every picture has a provenance sidecar",
      all(os.path.exists(os.path.join(HERE, f"{p}.provenance.json")) for p in PICTURES),
      f"{len(PICTURES)} pictures")
sidecars = [json.load(open(os.path.join(HERE, f"{p}.provenance.json"), encoding="utf-8"))
            for p in PICTURES]
check("every sidecar records ONE code state, and the same one",
      len({json.dumps(s.get("codeState"), sort_keys=True) for s in sidecars}) == 1)
# `provenance.write_sidecar` merges its `extra` map at the TOP level of the document rather than
# nesting it under an `extra` key - read the sidecar, do not assume the shape.
check("every sidecar records the island digest it was composed from",
      all(s.get("island", {}).get("sha256") for s in sidecars))
check("every sidecar names the story",
      all(s.get("storyId") == P.STORY_ID for s in sidecars))
check("every sidecar records the seam classes actually drawn",
      all(s.get("seamsDrawn") == sorted(P.SEAMS_DRAWN) for s in sidecars),
      f"{sorted(P.SEAMS_DRAWN)}")
check("no Blender frame was rendered by this pass",
      REPORT["blenderFramesRendered"] == 0)
check("the committed land piece set was PROVED valid for this island's geometry",
      REPORT["landPieceSetValidForThisIsland"]["equalToRenderedSet"])
check("the seam accounting is TOTAL (an unclassified stroke would be a refusal)",
      REPORT["strokeInventory"]["asIs"]["other"] == 0
      and REPORT["strokeInventory"]["delivered"]["other"] == 0,
      f"as-is {REPORT['strokeInventory']['asIs']}")
check("removing the seams moved NO cell fill - the fork is ONE variable",
      REPORT["whatRemovalCosts"]["cellFillsMoved"] == 0,
      f"0 of {REPORT['whatRemovalCosts']['cellsSampled']}")
check("removing the seams does NOT widen the palette",
      REPORT["whatRemovalCosts"]["paletteWidened"] is False)
check("the per-cell measurements exclude the hero tree",
      REPORT["whatRemovalCosts"]["measuredWithoutTheHeroTree"] is True)
check("the real island is greener than the fixture on the SAME instrument",
      REPORT["greenReading"]["realIslandGreenPct"] > REPORT["greenReading"]["fixtureGreenPct"],
      f"{REPORT['greenReading']['realIslandGreenPct']}% vs "
      f"{REPORT['greenReading']['fixtureGreenPct']}%")
check("the decor counts are the story's REAL contract counts, not a hash",
      sum(p["tests"] for p in REPORT["decorAtRealTestCounts"]["perCapability"])
      == sum(c["tests"] for c in ISLAND["capabilities"]),
      f"{sum(c['tests'] for c in ISLAND['capabilities'])} contracts")
check("exactly one UAT flower per criterion (ADR-0226 D4)",
      REPORT["decorAtRealTestCounts"]["flowers"] == len(ISLAND["uatCriteria"]),
      f"{REPORT['decorAtRealTestCounts']['flowers']} flowers, "
      f"{len(ISLAND['uatCriteria'])} criteria")


# ================================================================= 7. DETERMINISM
if not FAST:
    print("\n== 7. determinism, on the DECODED RASTER ==")
    # ASSERTED ON PIXELS, NEVER ON A FILE HASH - the house rule. A PNG carries container bytes that
    # differ on every write, so a naive file hash reports non-determinism that does not exist.
    before = {p: np.array(Image.open(os.path.join(HERE, p)).convert("RGB")) for p in PICTURES}
    spec = importlib.util.spec_from_file_location(
        "compose_healthy_rerun", os.path.join(HERE, "compose_healthy.py"))
    mod = importlib.util.module_from_spec(spec)
    cwd = os.getcwd()
    try:
        os.chdir(HERE)
        spec.loader.exec_module(mod)
    finally:
        os.chdir(cwd)
    after = {p: np.array(Image.open(os.path.join(HERE, p)).convert("RGB")) for p in PICTURES}
    same = [p for p in PICTURES if np.array_equal(before[p], after[p])]
    check("re-composing reproduces every picture PIXEL-IDENTICALLY",
          len(same) == len(PICTURES), f"{len(same)}/{len(PICTURES)}")
else:
    print("\n== 7. determinism ==  SKIPPED (--fast)")


# ================================================================= summary
ok = sum(1 for _n, o, _d in RESULTS if o)
print(f"\n{ok}/{len(RESULTS)} checks green")
sys.exit(0 if ok == len(RESULTS) else 1)
