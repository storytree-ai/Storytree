#!/usr/bin/env python3
"""Make the fidelity mechanism FIRE, and prove it does not fire on anything honest.

    python verify.py            # every check, on the real committed corpus + planted fixtures

WHY BOTH HALVES ARE REQUIRED. A guard observed only PASSING is indistinguishable from a guard that
cannot fail — the sweep's own `verify_refusal.py` says so about the code-state rung, and the failure
this whole mechanism exists for produced no error and no visible cue either. So every refusal here is
exercised on a deliberately mixed fixture, and every legitimate shape the arc actually uses is
exercised on the REAL committed directories, because a guard that reds honest work is worse than the
gap it closes.

NOTHING REAL IS MUTATED. Every planted fixture is built under the system temp directory and removed
on the way out; the corpus is opened read-only. The fixtures deliberately live OUTSIDE the repo for a
second reason: a check whose own output is committed into the tree it then scans grows a field
geometrically, which happened on this track and was caught late.

IT FAILS LOUDLY ON ITS OWN ERRORS. Every file read goes through `load` and dies naming the file, so
this cannot report a pass by dying before it reaches a check. Prior harnesses here reported five
false passes exactly that way.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
HERO = os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01", "blender-hero-v1")
SWEEP = os.path.join(REPO, "docs", "research", "chapter2-camera-elevation-sweep-2026-08-15")
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
LADDER = os.path.join(REPO, "docs", "research", "chapter2-scale-ladder-2026-08-18")
DRESSING = os.path.join(REPO, "docs", "research", "chapter2-island-place-dressing-2026-08-16")
sys.path.insert(0, HERO)
import provenance as P                                          # noqa: E402
import scan_fidelity                                            # noqa: E402

PASSED, FAILED = [], []


def check(name, ok, detail=""):
    (PASSED if ok else FAILED).append(name)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"\n          {detail}" if detail else ""))


def load(path, why):
    """Read one JSON file or DIE naming it. Never a default, never a silent skip."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"VERIFY ABORTED: cannot read {path} ({why}): "
                         f"{exc.__class__.__name__}: {exc}")


def plant(tmp, name, source_meta, samples):
    """A render directory declaring `source_meta`'s code state at a chosen sample count.

    A directory's whole declaration is its `render-meta.json`, so a fixture carrying one IS a render
    directory as far as every function under test is concerned. No pixels are involved and none are
    needed: the mechanism reads declarations, and planting pixels would prove something else.
    """
    d = os.path.join(tmp, name)
    os.makedirs(d)
    meta = dict(source_meta)
    meta["samples"] = samples
    with open(os.path.join(d, "render-meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
    return d


def refuses(inputs):
    """(did it refuse, the message) for one guard call."""
    try:
        P.require_one_code_state(inputs)
    except SystemExit as exc:
        return True, str(exc)
    return False, ""


def main():
    report = load(os.path.join(HERE, scan_fidelity.REPORT),
                  "the committed scan this README quotes")
    scanned, attribution = report["scanned"], report["attribution"]

    print("\n== 1. the corpus inventory, asserted before anything is concluded from it ==")
    # A NEGATIVE CHECK NEEDS ITS INVENTORY SIZE ASSERTED TOO. Every "no conflict" below is a
    # difference that could be empty because nothing was compared, and this is what forbids that.
    check("the scan reached a non-trivial corpus",
          scanned["renderDirectories"] >= 40 and scanned["sidecars"] >= 60,
          f"{scanned['renderDirectories']} render directories, {scanned['sidecars']} sidecars, "
          f"{scanned['inputRecords']} input records, {scanned['distinctCodeStates']} code states")
    check("every committed render directory that declares a code state declares a fidelity too",
          not report["unrecoverableDirectories"],
          "so the sample count is recoverable from committed provenance for every pass that "
          "commits a render; the list of exceptions is empty and the inventory above is not")

    print("\n== 2. the number the increment set out to move ==")
    guessed = attribution.get("inferred-unique", 0) + attribution.get("inferred-ambiguous", 0)
    check("committed input records today force the reader to INFER the fidelity",
          guessed > 0,
          f"{guessed} of {scanned['inputRecords']} records carry no fidelity of their own, so a "
          f"reader must find another directory at the same code state and trust ITS number "
          f"({attribution})")
    # CORRECTING THE INCREMENT'S OWN PREMISE, which said the sweep's fidelity "is not committed at
    # all". It IS committed — `sweep-report.json` has carried `landSamples: 32` all along. The defect
    # is REACHABILITY, not absence: the artifact that describes the picture is its sidecar, and the
    # sidecar neither carries the number nor points at the file that does.
    sweep_report = load(os.path.join(SWEEP, "sweep-report.json"), "the sweep's committed report")
    check("the sweep's sample count WAS committed — the increment's premise is corrected here",
          str(sweep_report.get("landSamples")) == "32"
          and str((sweep_report.get("treeRender") or {}).get("samples")) == "72",
          f"sweep-report.json carries landSamples={sweep_report.get('landSamples')} and "
          f"treeRender.samples={(sweep_report.get('treeRender') or {}).get('samples')}; it was "
          f"never only a driver constant, so 'recoverable from no committed artifact' was too strong")
    sweep_sidecars = [row for row in report["sidecars"]
                      if row["pass"] == "chapter2-camera-elevation-sweep-2026-08-15"]
    check("but no sidecar of that pass carries it, and none points at the report that does",
          len(sweep_sidecars) >= 8
          and not any(row["carriesFidelity"] for row in sweep_sidecars)
          and all(rec["status"] != "carried"
                  for row in sweep_sidecars for rec in row["inputs"]),
          f"{len(sweep_sidecars)} sidecars describe those panels and not one states the fidelity — "
          f"a reader holding the picture has no path to the number from the record that describes it")
    # AND THE INFERENCE THEY ARE PUSHED INTO IS WRONG, which is the whole case for disclosure.
    land_states = [e for e in report["codeStates"]
                   if e["generator"] == "blender_land.py"
                   and e["codeState"].startswith("15927bf5")]
    corpus_says = sorted({k for e in land_states for k in e["byFidelity"]})
    check("so resolving the declared code state against the corpus lands on the WRONG number",
          corpus_says == ["samples=48"],
          f"those panels declare blender_land.py@15927bf5 and were rendered at 32; the only "
          f"committed directories at that digest declare {corpus_says}. This is PR #1379's phantom: "
          f"34,970 px against 34,968 on one source digest, with the explanation one unlinked file away")

    print("\n== 3. the refusal FIRES on a mixed measurement fidelity ==")
    tmp = tempfile.mkdtemp(prefix="fidelity-verify-")
    try:
        real_meta = load(os.path.join(FORK, "pieces", "render-meta.json"),
                         "a real committed render-meta to plant fixtures from")
        a = plant(tmp, "pieces-32", real_meta, 32)
        b = plant(tmp, "pieces-48", real_meta, 48)
        mixed = P.input_records([("pieces-32", a), ("pieces-48", b)], [])

        # SETUP VOID GUARD. Both cells must declare the SAME code state and BOTH declare a fidelity,
        # or the refusal below would prove nothing at all — it would be the code-state rung firing,
        # or an undeclared cell being correctly ignored.
        states = {r["codeState"]["sha256"] for r in mixed if r.get("codeState")}
        fids = {P.fidelity_key(r.get("fidelity")) for r in mixed}
        if len(states) != 1 or len(fids) != 2 or None in fids:
            raise SystemExit(f"SETUP VOID: need one code state and two declared fidelities, "
                             f"got states={len(states)} fidelities={sorted(fids, key=str)}")
        check("the fixture varies ONLY the fidelity",
              True, f"one code state {sorted(states)[0][:12]}, fidelities {sorted(fids)}")

        fired, message = refuses(mixed)
        check("two cells of ONE code state measured two ways are REFUSED", fired)
        check("and refused with the exact refusal text, never a warning",
              fired and P.REFUSAL_FIDELITY in message,
              (message.splitlines() or ["<no message>"])[0])
        check("the refusal names both fidelities and the cells carrying them",
              fired and "samples=32" in message and "samples=48" in message
              and "pieces-32" in message and "pieces-48" in message)

        # THE ABLATION, which is what makes the three checks above evidence rather than ceremony.
        # Remove ONLY the new rung and the identical fixture composes in silence — i.e. the refusal
        # is caused by this mechanism and not by the code-state rung firing for another reason. A
        # guard is proved by the world where it is absent, not only by the one where it passes.
        real_rung = P.require_one_fidelity
        try:
            P.require_one_fidelity = lambda inputs: None
            without, _ = refuses(P.input_records([("pieces-32", a), ("pieces-48", b)], []))
        finally:
            P.require_one_fidelity = real_rung
        check("ABLATION: with the rung removed the SAME fixture composes silently",
              not without,
              "which is exactly the world before this change — so the refusal above is this rung's, "
              "and the three checks are not passing for some other reason")

        print("\n== 4. and does NOT fire on the shapes the arc legitimately uses ==")
        # (a) a real flag FORK: three --normals settings, one generator, one code state, one fidelity.
        fork = P.input_records([(t, os.path.join(GRASS, f"pieces-{t}-blade"))
                                for t in ("m00", "m45", "m100")], [])
        declared = [r for r in fork if r.get("codeState")]
        check("the --normals fork fixture is real and non-vacuous",
              len(declared) == 3 and len({r["codeState"]["sha256"] for r in declared}) == 1
              and all(r.get("fidelity") for r in fork),
              f"{len(declared)} committed directories at "
              f"{declared[0]['codeState']['sha256'][:12] if declared else '?'}")
        fired, _ = refuses(fork)
        check("a legitimate --normals fork at ONE fidelity still composes",
              not fired,
              "the source digest stays blind to flags on purpose; only the fidelity is added")

        # (b) two GENERATORS: land + decor. Different subjects, free to differ — and they never
        #     reach the fidelity rung, because the code-state rung refuses them first, which is why
        #     the multi-generator composers call the guard once per generator group.
        cross = P.input_records([("pieces-land", os.path.join(DRESSING, "pieces-land")),
                                 ("pieces-decor", os.path.join(DRESSING, "pieces-decor"))], [])
        fired, message = refuses(cross)
        check("a two-generator set is still judged by the CODE STATE, not the fidelity",
              fired and P.REFUSAL in message and P.REFUSAL_FIDELITY not in message,
              "so the fidelity rung is scoped to one subject by construction, and the per-generator "
              "callers (compose_core.require_one_state_per_generator) are unaffected")
        for label, d in (("pieces-land", os.path.join(DRESSING, "pieces-land")),
                         ("pieces-decor", os.path.join(DRESSING, "pieces-decor"))):
            fired, _ = refuses(P.input_records([(label, d)], []))
            check(f"and each generator group alone composes cleanly ({label})", not fired)

        # (b2) THE SCALE LADDER, which is the real committed proof that the subject/fidelity line
        #      is drawn in the right place. `chapter2-scale-ladder-2026-08-18` composes ONE sheet
        #      from four rungs of blender_land.py@15927bf5 at supersample 3/6/12/24. With
        #      `supersample` briefly inside FIDELITY_KEYS this guard REFUSED that sheet — a pass
        #      whose entire subject is that lever. It is the case the increment predicted: a guard
        #      that refuses a fork its own variable is worse than the gap it closes.
        rungs = [(f"pieces-land-{t}", os.path.join(LADDER, "pieces", f"pieces-land-{t}"))
                 for t in ("x1", "x2", "x4", "x8")]
        rungs = [(label, d) for label, d in rungs if os.path.isdir(d)]
        if len(rungs) != 4:
            raise SystemExit("SETUP VOID: the scale ladder's four land rungs are not on disk, so "
                             "the check below would pass by comparing nothing "
                             f"(found {[label for label, _ in rungs]})")
        ladder = P.input_records(rungs, [])
        supersamples = {load(os.path.join(d, "render-meta.json"),
                             "a scale-ladder rung").get("supersample") for _, d in rungs}
        check("the scale-ladder fixture really does vary the supersample across one code state",
              len(supersamples) == 4
              and len({r["codeState"]["sha256"] for r in ladder}) == 1
              and len({P.fidelity_key(r.get("fidelity")) for r in ladder}) == 1,
              f"supersample {sorted(supersamples)} at one digest, one fidelity "
              f"{P.fidelity_key(ladder[0].get('fidelity'))}")
        fired, message = refuses(ladder)
        check("the scale ladder's own sheet composes — output SCALE is subject, not fidelity",
              not fired,
              "this is a committed pass on main, not a fixture; it red-lit while supersample was "
              "counted as a fidelity" if not fired else message.splitlines()[0])

        # (c) the past is not policed: an undeclared cell is unattributed, never a refusal.
        silent = os.path.join(tmp, "pieces-silent")
        os.makedirs(silent)
        with open(os.path.join(silent, "render-meta.json"), "w", encoding="utf-8") as fh:
            json.dump({k: v for k, v in real_meta.items() if k not in P.FIDELITY_KEYS}, fh)
        past = P.input_records([("pieces-32", a), ("pieces-silent", silent)], [])
        check("a directory declaring NO fidelity is unattributed, never a refusal",
              not refuses(past)[0] and any(r.get("fidelityUndeclared") for r in past),
              "every artifact rendered before this mechanism existed still composes")

        print("\n== 5. the number is RECOVERABLE from what gets committed ==")
        art = os.path.join(tmp, "picture.png")
        with open(art, "wb") as fh:
            fh.write(b"\x89PNG\r\n\x1a\n")
        one = P.input_records([("pieces-32", a)], [])
        side = P.write_sidecar(art, __file__, ["--demo"], one, one[0]["codeState"])
        doc = load(side, "the sidecar just written")
        check("write_sidecar stamps the fidelity at the TOP of the record",
              doc.get("fidelity", {}).get("byFidelity") == {"samples=32": ["pieces-32"]},
              json.dumps(doc.get("fidelity", {}).get("byFidelity")))
        check("and states plainly whether the picture mixed fidelities",
              doc["fidelity"]["mixed"] is False,
              "so 'was this measured one way?' is a key, not an inference over a list")
        two = P.input_records([("pieces-32", a), ("pieces-48", b)], [])
        check("a mixed set summarises as mixed",
              P.fidelity_summary(two)["mixed"] is True
              and len(P.fidelity_summary(two)["byFidelity"]) == 2)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n== 6. no committed picture is invalidated by the new rung ==")
    # Run the PRODUCTION guard over the real committed directories, grouped exactly as a composer
    # groups them: one call per (generator, code state). If any group held two fidelities this raises.
    groups, reds = 0, []
    for entry in report["codeStates"]:
        dirs = [d for fid_dirs in entry["byFidelity"].values() for d in fid_dirs]
        recs = P.input_records([(os.path.basename(d), os.path.join(REPO, d)) for d in dirs], [])
        groups += 1
        if refuses(recs)[0]:
            reds.append(f"{entry['generator']}@{entry['codeState'][:12]}")
    check("every committed code state re-composes without a fidelity refusal",
          not reds and groups >= 8,
          f"{groups} code-state groups re-run through the real guard, {len(reds)} refused")
    check("no committed code state was measured at two fidelities",
          not report["splits"],
          "a split is not a defect — it is what makes two passes' pixel counts incomparable — but "
          "there is none in the committed corpus, so nothing on disk needs re-rendering")

    print("\n== 7. the README quotes only numbers its own report holds ==")
    # PR #1412's rung, inherited: #1393 re-ran a verify and rewrote its report while leaving the
    # README table printing the pre-fix row, and every later quotation traced to that one table.
    readme = os.path.join(HERE, "README.md")
    try:
        with open(readme, "r", encoding="utf-8") as fh:
            rows = [ln for ln in fh.read().splitlines()
                    if ln.startswith("|") and ln.rstrip().endswith("|")]
    except OSError as exc:
        raise SystemExit(f"VERIFY ABORTED: cannot read README.md: {exc}")
    quoted = {}
    for ln in rows:
        cells = [c.strip() for c in ln.strip("|").split("|")]
        if len(cells) == 2 and cells[1].isdigit():
            quoted[cells[0]] = int(cells[1])
    truth = {
        "committed render directories scanned": scanned["renderDirectories"],
        "distinct code states across them": scanned["distinctCodeStates"],
        "committed sidecars": scanned["sidecars"],
        "input records across those sidecars": scanned["inputRecords"],
        "input records carrying their own fidelity": attribution.get("carried", 0),
        "input records whose fidelity the reader must INFER": guessed,
        "code states measured at more than one fidelity": len(report["splits"]),
    }
    missing = sorted(set(truth) - set(quoted))
    wrong = {k: (v, truth[k]) for k, v in quoted.items() if k in truth and truth[k] != v}
    check("the README table is non-empty and every row is a row the report holds",
          len(quoted) == len(truth) and not missing and not wrong,
          f"{len(quoted)} rows parsed against {len(truth)} report figures"
          + (f"; MISSING {missing}" if missing else "")
          + (f"; DISAGREE (readme, report) {wrong}" if wrong else "; all agree"))

    print("\n== 8. the harness cannot pass vacuously or scan itself ==")
    check("the scan does not read its own committed report",
          scan_fidelity.REPORT not in {os.path.basename(s["sidecar"])
                                       for s in report["sidecars"]}
          and not any(scan_fidelity.REPORT in d["dir"] for d in report["renderDirectories"]),
          "a check whose output is committed into the tree it greps grows a field geometrically")
    base = subprocess.run(["git", "-C", REPO, "merge-base", "origin/main", "HEAD"],
                          capture_output=True, text=True)
    if base.returncode != 0:
        raise SystemExit(f"VERIFY ABORTED: cannot resolve merge-base with origin/main: "
                         f"{base.stderr.strip()}")
    moved = subprocess.run(["git", "-C", REPO, "diff", "--name-only", base.stdout.strip(), "--",
                            "*.png"], capture_output=True, text=True, check=True).stdout.split()
    check("this branch moves no committed pixel",
          not moved,
          "the mechanism reads declarations that were already being written; nothing was re-rendered"
          if not moved else f"PNGs changed: {moved}")

    print(f"\n{len(PASSED)}/{len(PASSED) + len(FAILED)} checks passed")
    if FAILED:
        print("FAILED:\n  " + "\n  ".join(FAILED))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
