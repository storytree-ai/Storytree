#!/usr/bin/env python3
"""THE FLOOR for this pass: the attribution, the fourth compositor site, and the provenance digest.

    python verify.py                # every check + verify-report.json   (~4 min)

THIS HARNESS FAILS LOUDLY WHEN IT CANNOT READ ITS OWN EVIDENCE, and that is not decoration. Two prior
harnesses on this arc reported passes they had not earned: PR #1382's died on `FileNotFoundError`
before reaching its guard and printed FIVE false passes, and PR #1389's crashed inside `ok()` on a
list detail and mis-parsed a correlation as `None`, so a guard that had fired perfectly read as one
that had not. Everything below therefore runs inside one `main()` whose every exception is caught,
printed as a FAILED check, written into `verify-report.json` as `REFUSED`, and exited non-zero. A
harness that cannot parse its own evidence must never be able to look like a green one.

WHAT IS ASSERTED LIVE VERSUS FROM A REPORT, stated so a reader does not have to guess. The two
identity checks and the whole fourth-site measurement are re-run HERE against the real compositor, so
they cannot be stale. The 2x2 attribution is a twelve-minute measurement and is asserted from
`residual-report.json`, which `residual.py` writes; re-running it inside a floor check would price
the floor at twelve minutes for every reader. The report's internal arithmetic is re-derived rather
than trusted, so a hand-edited number fails.
"""
import hashlib
import json
import os
import shutil
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
DRESSING = os.path.join(RESEARCH, "chapter2-island-place-dressing-2026-08-16")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
ORDER = os.path.join(RESEARCH, "chapter2-compositor-order-and-caps-2026-08-17")
HERO = os.path.join(RESEARCH, "chapter2-code-only-art-2026-08-01", "blender-hero-v1")

CHECKS = []


def check(ok, name, detail=""):
    CHECKS.append({"check": name, "pass": bool(ok), "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail else ""), flush=True)
    return bool(ok)


def load(name, directory=HERE):
    """Read one JSON report, REFUSING loudly rather than letting a missing file read as a pass."""
    path = os.path.join(directory, name)
    if not os.path.isfile(path):
        raise SystemExit(f"REFUSED: {path} does not exist. Run the measurement that writes it "
                         "before running this floor; a floor with no evidence is not a floor.")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def run():
    report = {"fence": "docs/research/** only"}

    # ============================================================ 1. the attribution
    print("\n== 1. the 17.2% is attributed ==")
    R = load("residual-report.json")
    real = R["geometries"]["realCorpus"]
    fix = R["geometries"]["fixture"]
    lo = real["corners"]["legacy/old"]
    ls = real["corners"]["legacy/shipped"]
    ss = real["corners"]["spread/shipped"]
    fss = fix["corners"]["spread/shipped"]

    # The top-left corner is PR #1387's committed "before". Reproducing it exactly is what makes the
    # other three corners readings of the same instrument rather than of a new one.
    check(lo["placements"] == 180 and lo["deliveringNothing"] == 94,
          "the 2x2's top-left corner reproduces PR #1387's committed 'before' EXACTLY",
          f"{lo['deliveringNothing']} of {lo['placements']} = {lo['deliveringNothingPct']}% "
          "(published: 94 of 180 = 52.2%)")

    # ...and the top-right corner is the 17.2% the increment asked about. It is reproduced to within
    # ONE placement, and the reason is stated rather than smoothed: `scatter.LEGACY_AFFINE` restores
    # the MEADOW's affine draw, not the UAT flowers' spiral, which PR #1393 fixed unconditionally.
    check(abs(ls["deliveringNothing"] - 31) <= 1 and ls["placements"] == 180,
          "the top-right corner reproduces the published 17.2% to within one placement",
          f"{ls['deliveringNothing']} of {ls['placements']} = {ls['deliveringNothingPct']}% "
          "(published: 31 of 180 = 17.2%); the one-placement gap is the UAT flower spiral, which "
          "LEGACY_AFFINE does not restore")

    check(ss["TRULYdeliveringNothingPct"] <= fss["TRULYdeliveringNothingPct"],
          "TODAY the real-corpus island is at or BELOW the fixture — the 'more than twice the "
          "fixture' gap is absent, not merely explained",
          f"real {ss['TRULYdeliveringNothingPct']}% vs fixture "
          f"{fss['TRULYdeliveringNothingPct']}%")

    # the decomposition is arithmetic, re-derived here rather than trusted from the report
    b = real["whatEachFixBought"]
    total = round(b["painterOrder_ADR1387"] + b["dispersion_PR1393_total"] + b["residual"], 1)
    check(abs(total - lo["TRULYdeliveringNothingPct"]) < 0.15,
          "the decomposition adds up: painter order + dispersion + residual = the original loss",
          f"{b['painterOrder_ADR1387']} + {b['dispersion_PR1393_total']} + {b['residual']} "
          f"= {total} vs {lo['TRULYdeliveringNothingPct']}%")

    check(abs(b["ofWhich_theDiagonalAndAreaWeighting"] + b["ofWhich_bestCandidateBlueNoise"]
              - b["dispersion_PR1393_total"]) < 0.15,
          "and the dispersion fix is split rather than credited whole",
          f"diagonal+area {b['ofWhich_theDiagonalAndAreaWeighting']} + blue noise "
          f"{b['ofWhich_bestCandidateBlueNoise']} = {b['dispersion_PR1393_total']} points")

    # ============================================================ 2. the signed prediction
    print("\n== 2. the prediction has a SIGN — co-tenancy, a count with no pixel quantity in it ==")
    for gname in ("realCorpus", "fixture"):
        g = R["geometries"][gname]
        leg = g["theSignedPrediction"]["legacy"]
        spr = g["theSignedPrediction"]["spread"]
        alone_l = leg["0"]["pct"]
        crowd_l = max((leg[k]["pct"] for k in ("2", "3+") if leg[k]["n"] and leg[k]["pct"]
                       is not None), default=None)
        alone_s = spr["0"]["pct"]
        if crowd_l is None or alone_l is None:
            check(False, f"[{gname}] the co-tenancy table is populated",
                  "a bucket the prediction needs is empty, so the split cannot be read")
            continue
        check(crowd_l > alone_l,
              f"[{gname}] under LEGACY the loss concentrates on CROWDED cells",
              f"alone in its cell {alone_l}%  ->  two or more co-tenants {crowd_l}%")
        check(alone_l is not None and alone_s is not None and abs(alone_l - alone_s) <= 12.0,
              f"[{gname}] a plant ALONE in its cell loses about the same either way — the "
              "positioner is not the variable, the crowding is",
              f"legacy {alone_l}% vs spread {alone_s}%")
        crowd_s = max((spr[k]["pct"] for k in ("2", "3+") if spr[k]["n"] and spr[k]["pct"]
                       is not None), default=None)
        if crowd_s is not None:
            check((crowd_s - alone_s) < (crowd_l - alone_l),
                  f"[{gname}] and under SPREAD the gradient COLLAPSES",
                  f"legacy spread-of-rate {round(crowd_l - alone_l, 1)} points  ->  "
                  f"spread {round(crowd_s - alone_s, 1)} points")

    # --- the comparison is CONTROLLED, and that is asserted rather than hoped ------------------
    # The cross-island claim below is only worth making if the two geometries differ in plants per
    # cell and NOT in cell size. They happen to agree to 1%, which nobody arranged - so it is checked
    # here, cheaply and directly from the two island files, rather than left as a sentence. The
    # order-and-caps README's guess that the real island had "smaller cells" was wrong on exactly
    # this, and an unchecked shape claim is how it survived.
    def mean_cell_area(path):
        with open(path, encoding="utf-8") as fh:
            cells = json.load(fh)["variantB"]["cells"]
        out = []
        for c in cells:
            poly, a = c["poly"], 0.0
            for i in range(len(poly)):
                x1, y1 = poly[i]
                x2, y2 = poly[(i + 1) % len(poly)]
                a += x1 * y2 - x2 * y1
            out.append(abs(a) / 2.0)
        return sum(out) / len(out), len(out)

    fx_area, fx_cells = mean_cell_area(os.path.join(GRASS, "island.json"))
    rl_area, rl_cells = mean_cell_area(os.path.join(
        RESEARCH, "chapter2-healthy-island-2026-08-16", "island.json"))
    check(abs(fx_area - rl_area) / max(fx_area, rl_area) < 0.05,
          "the two geometries have essentially the SAME mean cell area, so plants-per-cell is the "
          "only relevant difference between them",
          f"fixture {fx_area:.1f} ground units^2 over {fx_cells} cells vs real {rl_area:.1f} over "
          f"{rl_cells} — {abs(fx_area - rl_area) / max(fx_area, rl_area) * 100:.1f}% apart. The "
          "order-and-caps README guessed the real island had SMALLER cells; it does not, it has "
          "FEWER")

    X = R["theCrossIslandClaim"]
    denser = "realCorpus" if X["realCorpus"]["plantsPerCell"] > X["fixture"]["plantsPerCell"] \
        else "fixture"
    bought_more = "realCorpus" if X["realCorpus"]["dispersionBought"] > \
        X["fixture"]["dispersionBought"] else "fixture"
    check(denser == bought_more,
          "THE CROSS-ISLAND CLAIM, which could have failed loudly: the island with more plants per "
          "cell is the one the dispersion fix bought more on",
          f"fixture {X['fixture']['plantsPerCell']}/cell bought "
          f"{X['fixture']['dispersionBought']} pts; real {X['realCorpus']['plantsPerCell']}/cell "
          f"bought {X['realCorpus']['dispersionBought']} pts")

    # --- what is LEFT, said as a threshold rather than as an adjective ------------------------
    for gname in ("realCorpus", "fixture"):
        T = R["geometries"][gname]["theOutVoteThreshold"]
        W = R["geometries"][gname]["whatTheResidualIS"]
        check(T["noOutVotedPlacementReachesTheThreshold"],
              f"[{gname}] no OUT-VOTED placement reaches the 3x3 majority's 5-of-9 threshold",
              f"their best blocks hold {T['outVotedMaxOwnedInABlock']} — the residual is the "
              "quantiser, not a third defect")
        check(T["everyPlacementReachingItDelivers"],
              f"[{gname}] and reaching it is SUFFICIENT, without exception",
              f"{T['ofWhichDeliverOrAreCoCredited']} of {T['placementsReachingTheThreshold']} "
              "placements owning 5+ of a block deliver or are co-credited")
        check(W["occluded"]["byWhat"]["ownCellsFill"] == 0,
              f"[{gname}] and NO surviving occlusion is a placement buried by its OWN cell",
              f"what remains: {W['occluded']['byWhat']} — a plant genuinely behind a nearer "
              "raised surface, which is correct 2.5D occlusion")

    report["attribution"] = {"headline": R["theHeadline"], "crossIsland": X,
                             "whatEachFixBought": {"realCorpus": b,
                                                   "fixture": fix["whatEachFixBought"]}}

    # ============================================================ 3. the fourth compositor site
    print("\n== 3. the fourth compositor site — re-measured LIVE, not read from a report ==")
    sys.path.insert(0, HERE)
    sys.path.insert(0, DRESSING)
    sys.path.insert(0, HERO)
    import dressed_fix as F                                   # noqa: E402
    DR, CORE, scatter = F.DR, F.CORE, F.scatter

    check(DR.CORE.decor_depth_key is CORE.decor_depth_key
          and DR.CORE.walls_under_caps is CORE.walls_under_caps,
          "compose_dressed VENDORS NO COPY of either rule — it calls compose_core's own functions",
          "identity, not equality: a copy that happened to agree today would pass an equality test")

    check(not hasattr(DR, "DECOR_SORTS_AFTER_ITS_CELL")
          and not hasattr(DR, "CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS"),
          "and it defines NEITHER switch of its own, so a guard cannot patch a name the callee "
          "never reads",
          "the PR #1393 trap turned into the mechanism: patch compose_core, or patch nothing")

    # The durable form of the fence: assert the rules are not RESTATED, never that a file is
    # UNEDITED. A branch-diff or substring fence tests the branch; this tests the promise, and stays
    # true for any future edit that keeps the import.
    src = open(os.path.join(DRESSING, "compose_dressed.py"), encoding="utf-8").read()
    body = src.split('"""', 2)[-1]          # skip the module docstring, which DESCRIBES both rules
    check("C.boundary_walls(" not in body,
          "compose_dressed's code calls no bare `C.boundary_walls` — the wall query goes through "
          "the shared rule",
          "durable form: a promise about what the file DOES, not a claim that it is unedited")
    check('draw.append((d["g"][1], 3,' not in body,
          "and it carries no bare own-ground-y depth key",
          "the exact expression the defect was")

    cells = DR.prepare(DR.ISLAND["variantB"]["cells"])
    items, _st = scatter.scatter_island(DR.ISLAND, DR.DECOR_META["tokenFamilies"],
                                        DR.dressing.SEED, DR.UAT_CRITERIA)
    print(f"  re-measuring {len(items)} placements on the dressing island ...", flush=True)
    before = F.occlusion(items, cells, sorts_after=False)
    after = F.occlusion(items, cells, sorts_after=True)
    check(after["ownZeroSupersampledPx"] < before["ownZeroSupersampledPx"] / 3.0,
          "THE GUARD FIRES: reintroducing the old key through compose_core's switch buries "
          "placements in the DRESSING compositor, and the shipped key does not",
          f"{before['ownZeroSupersampledPx']} of {before['placements']} own nothing with the old "
          f"key ({before['ownZeroPct']}%)  ->  {after['ownZeroSupersampledPx']} "
          f"({after['ownZeroPct']}%)")
    check(after["totalOwnedSupersampledPx"] > before["totalOwnedSupersampledPx"],
          "and the recovered paint is real, not a reshuffle",
          f"{before['totalOwnedSupersampledPx']} -> {after['totalOwnedSupersampledPx']} "
          f"supersampled px owned by decor "
          f"(+{after['totalOwnedSupersampledPx'] - before['totalOwnedSupersampledPx']}, "
          f"{round((after['totalOwnedSupersampledPx'] - before['totalOwnedSupersampledPx']) / 9.0)}"
          " delivered-equivalent)")

    print("  re-measuring the wall authority ...", flush=True)
    w_bad = F.wall_authority(items, cells, authoritative=False)
    w_ok = F.wall_authority(items, cells, authoritative=True)
    check(w_ok["identical"],
          "`caps=` is AUTHORITATIVE on the dressing compositor: driving the island all-healthy "
          "through the argument alone is byte-identical to driving it through both",
          "asserted on the raw supersampled canvas, before any palette snap could hide a "
          "difference by clamping it away")
    check(not w_bad["identical"] and w_bad["groundEquivalentPx"] > 100,
          "and THAT guard fires too — with the rule off, the walls keep the ORIGINAL statuses",
          f"{w_bad['groundEquivalentPx']} ground-equivalent px disagree across "
          f"{w_bad['distinctWrongWallColours']} wrong wall colours, of which "
          f"{w_bad['ofWhichUnhealthySideTokenGroundEquiv']} are the charcoal `unhealthy` side "
          "token PR #1381 counted (it counted ONE status; every status' walls were wrong)")

    check(DR.assert_land_unchanged() is not None,
          "and the BARE land is still byte-identical to the shipped compositor after the import",
          "so nothing above is measuring a second change that came in with the repair")

    report["fourthSite"] = {"occlusionOldKey": before, "occlusionShipped": after,
                            "wallsDefectReintroduced": w_bad, "wallsAsShipped": w_ok}

    # ============================================================ 4. determinism, on the RASTER
    print("\n== 4. determinism, asserted on the DECODED raster and never on file bytes ==")
    a1 = F.occlusion(items, cells, sorts_after=True)
    check(a1 == after,
          "re-composing reproduces the measurement exactly",
          "compared as values, never as PNG bytes — 0 of 22 files matched by bytes across two "
          "pixel-identical runs on this track (PR #1379)")

    # ============================================================ 5. the provenance digest
    print("\n== 5. an UNEDITED script is provably unedited ==")
    sys.path.insert(0, HERO)
    import provenance as P                                    # noqa: E402
    src_path = os.path.join(HERO, "provenance.py")
    raw = open(src_path, "rb").read()
    tmp = tempfile.mkdtemp()
    try:
        crlf = os.path.join(tmp, "provenance.py")
        with open(crlf, "wb") as fh:
            fh.write(raw.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
        lf_rec, crlf_rec = P.producer_record(src_path), P.producer_record(crlf)
        check(lf_rec["sha256"] == crlf_rec["sha256"],
              "the same source hashes IDENTICALLY from an LF checkout and a CRLF one",
              "this is the defect PR #1387 hit: re-running the untouched compose_shadow.py rewrote "
              "its sidecars because the committed value was the CRLF hash of a file stored LF")
        check(P.sha256_file(src_path) != P.sha256_file(crlf),
              "and the check is not vacuous — the RAW byte digests of the two files DO differ",
              f"{P.sha256_file(src_path)[:12]} vs {P.sha256_file(crlf)[:12]}")
        check(lf_rec.get("basis") == P.PRODUCER_DIGEST_BASIS,
              "every new record says which rule produced its digest, so a reader never has to date "
              "a sidecar by its commit",
              lf_rec.get("basis", "MISSING"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # A BINARY MUST STILL HASH RAW. Normalising a PNG would corrupt the digest of the very artifact
    # the record exists to identify, so `sha256_file` is asserted UNCHANGED against hashlib directly.
    png = os.path.join(DRESSING, "island-bare.png")
    with open(png, "rb") as fh:
        want = hashlib.sha256(fh.read()).hexdigest()
    check(P.sha256_file(png) == want,
          "binaries still hash RAW — the normalisation is source-only",
          f"island-bare.png {want[:12]}")
    check(b"\r\n" in open(png, "rb").read() and P.sha256_file(png) == want,
          "and that matters here: this PNG contains CRLF byte pairs a text rule would have folded",
          "a normalised binary digest would identify a file that does not exist")

    report["provenance"] = {"basis": P.PRODUCER_DIGEST_BASIS,
                            "sourceDigestStableAcrossLineEndings": True,
                            "binaryDigestUnchanged": True}

    # ============================================================ 6. the sibling README is honest
    print("\n== 6. a README that quotes its own report agrees with it ==")
    O = load("order-and-caps-report.json", ORDER)
    rd = open(os.path.join(ORDER, "README.md"), encoding="utf-8").read()
    table = rd.split("| geometry | placements |", 1)[1].split("\n\n", 1)[0]
    quoted = {t.strip("*%") for t in table.replace("|", " ").split()
              if t.strip("*").endswith("%")}
    have = set()
    for src_ in (O["fixtureGeometry"]["asAuthored"], O["fixtureGeometry"]["drivenAllHealthy"],
                 O["realCorpusIsland"]["rates"]):
        for w in ("withTheOldKey", "asShipped"):
            have.add(f"{src_[w]['deliveringNothingPct']}")
    missing = sorted(q for q in quoted if q not in have)
    check(not missing,
          "every rate the order-and-caps README quotes is a rate its own report holds",
          "this is the check that would have caught the stale table: PR #1393 regenerated that "
          "report and left the prose quoting the pre-dispersion numbers for a day"
          if not missing else f"quoted but not in the report: {missing}")

    # ============================================================ 7. the fence
    print("\n== 7. the fence ==")
    written = ["residual.py", "residual-report.json", "dressed_fix.py", "dressed-fix-report.json",
               "verify.py", "verify-report.json", "README.md"]
    check(all(os.path.abspath(os.path.join(HERE, f)).startswith(
        os.path.join(REPO, "docs", "research")) for f in written),
          "every path this pass writes is under docs/research/**",
          "the owner's 2026-08-16 isolate directive")
    cam = open(os.path.join(HERE, "residual.py"), encoding="utf-8").read()
    check("LAND_CAMERA_ELEVATION_DEG = " not in cam,
          "and no file here assigns LAND_CAMERA_ELEVATION_DEG",
          "it stays 20 in the app; this track composes at 50 as a named parameter")

    report["checks"] = CHECKS
    report["result"] = ("GREEN" if all(c["pass"] for c in CHECKS) else "RED")
    return report


def main():
    try:
        report = run()
    except BaseException as exc:                              # noqa: BLE001 - deliberate
        # A HARNESS THAT DIES BEFORE ITS GUARD MUST NOT LOOK GREEN. Both prior instances on this arc
        # died this way and printed passes; the exception is turned into a FAILED check rather than
        # a traceback nobody reads as a verdict.
        CHECKS.append({"check": "the harness completed", "pass": False,
                       "detail": f"{exc.__class__.__name__}: {exc}"})
        print(f"\nFAIL  the harness DIED before finishing: {exc.__class__.__name__}: {exc}",
              flush=True)
        with open(os.path.join(HERE, "verify-report.json"), "w", encoding="utf-8") as fh:
            json.dump({"result": "REFUSED", "checks": CHECKS}, fh, indent=1)
        raise SystemExit(1)
    with open(os.path.join(HERE, "verify-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
    n = sum(1 for c in CHECKS if c["pass"])
    print(f"\n{n}/{len(CHECKS)} checks green -> verify-report.json")
    if n != len(CHECKS):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
