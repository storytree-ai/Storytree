#!/usr/bin/env python3
"""Ask the COMMITTED corpus one question: at what fidelity was each render measured?

    python scan_fidelity.py            # writes fidelity-report.json
    python scan_fidelity.py --print    # and prints the table

WHAT THIS IS FOR, AND WHY A COMPOSER'S REFUSAL COULD NOT DO IT. `provenance.require_one_fidelity`
refuses two cells of one code state measured two ways, and it is scoped to ONE PICTURE because that
is the only scope a composer has. But the failure that motivated this pass was not inside a picture.
PR #1379 compared 34,970 delivered land px against 34,968 across TWO PASSES composed a day apart —
`chapter2-camera-elevation-sweep` at 32 Cycles samples against `chapter2-island-place-dressing` at
48, on the SAME `blender_land.py` digest `15927bf5`. No composer ever saw both, so no composer could
ever have refused it, and a lane was spent proving a deterministic renderer deterministic.

The cross-pass case is also LEGITIMATE: two passes may choose different sample counts for their own
reasons and each is internally consistent. What is not legitimate is comparing their pixel counts,
and what was missing was never a veto — it was the number, written down where a reader trips over it.
So this DISCLOSES: it groups every committed render directory by the code state it declares and
names every digest that was measured at more than one fidelity.

STANDARD LIBRARY ONLY, like `provenance.py` itself, so it runs on a host with no imaging stack.

IT READS ONLY COMMITTED FILES (`git ls-files`), because "recoverable from committed provenance" is
the exact claim being tested. A number sitting in an un-committed working copy is not recoverable by
the reader this exists for. That is also why `pieces-*/` directories excluded by a pass's own
`.gitignore` show up as UNRECOVERABLE rather than being quietly skipped.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
HERO = os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01", "blender-hero-v1")
sys.path.insert(0, HERO)
import provenance  # noqa: E402

REPORT = "fidelity-report.json"


def committed(pattern):
    """The committed paths matching one pathspec, repo-relative with forward slashes.

    `git ls-files` rather than a filesystem walk, so an un-committed working copy can never make the
    corpus look better attributed than a fresh clone would find it.
    """
    out = subprocess.run(["git", "-C", REPO, "ls-files", pattern],
                         capture_output=True, text=True, check=True).stdout
    return [line.strip().replace("\\", "/") for line in out.splitlines() if line.strip()]


def load_json(path, why):
    """Read one JSON file, or DIE saying which file and why it was being read.

    Loudly, and never with a default. A harness on this track once reported five false passes by
    dying on `FileNotFoundError` before it reached the guard it existed to exercise, and another
    reported `None` because its parser split on a comma. A scan that silently skips what it cannot
    parse reports a cleaner corpus than the one on disk.
    """
    full = os.path.join(REPO, path) if not os.path.isabs(path) else path
    try:
        with open(full, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"SCAN ABORTED: cannot read {path} ({why}): "
                         f"{exc.__class__.__name__}: {exc}")


def render_directories():
    """Every committed directory that declares a code state, with the fidelity it declares.

    The two shapes `provenance.declared_code_state` already knows: a raw render directory's
    `render-meta.json` and a delivered directory's `registration.json`. Read through the shared
    module rather than by hand, so this scan and the composer's refusal can never disagree about
    what a directory declares.
    """
    dirs = {}
    for name in ("render-meta.json", "registration.json"):
        for path in committed(f"docs/research/**/{name}"):
            rel = os.path.dirname(path)
            load_json(path, f"a {name} the scan must classify")   # loud parse, before the module
            state, state_why = provenance.declared_code_state(os.path.join(REPO, rel))
            fid, fid_why = provenance.declared_fidelity(os.path.join(REPO, rel))
            dirs[rel] = {
                "dir": rel,
                "declaredBy": name,
                "generator": (state or {}).get("generator"),
                "codeState": (state or {}).get("sha256"),
                "codeStateUndeclared": None if state else state_why,
                "fidelity": fid,
                "fidelityKey": provenance.fidelity_key(fid),
                "fidelityUndeclared": None if fid else fid_why,
            }
    return [dirs[k] for k in sorted(dirs)]


def sidecar_coverage(by_state):
    """Which committed pictures carry a fidelity in their own sidecar, and which do not.

    The DISCLOSURE half of this increment lands here: a sidecar written after the change carries a
    top-level `fidelity` block, and one written before does not. Reported as a plain count rather
    than a pass/fail, because a sidecar written before the mechanism existed is UNDECLARED and never
    suspect — `provenance.py`'s standing rule that nothing polices the past.
    """
    rows = []
    for path in committed("docs/research/**/*.provenance.json"):
        doc = load_json(path, "a committed sidecar")
        summary = doc.get("fidelity") if isinstance(doc, dict) else None
        inputs = (doc.get("inputs") or []) if isinstance(doc, dict) else []
        rows.append({
            "sidecar": path,
            "pass": path.split("/")[2],
            "carriesFidelity": isinstance(summary, dict) and bool(summary.get("byFidelity")),
            "mixed": bool(summary.get("mixed")) if isinstance(summary, dict) else None,
            "inputRecords": len(inputs),
            "inputsCarryingFidelity": sum(1 for r in inputs if r.get("fidelity")),
            "inputs": [_attribute(r, by_state) for r in inputs],
        })
    return rows


def _attribute(record, by_state):
    """How a reader of THIS input record would recover the fidelity it was rendered at.

    THE FOUR ANSWERS, and the reason the middle two are the finding. `carried` means the sidecar
    states it and the reader is done. `inferred-unique` means the sidecar does not, so the reader
    must go looking for another directory declaring the same code state and take ITS number on
    trust — which is an inference, not a record, and it is WRONG for the sweep: `sweep_render.py`
    pins `LAND_SAMPLES = "32"`, while the only committed directory at `blender_land.py@15927bf5` is
    a 48-sample one from another pass. A reader doing the obvious thing lands on 48 and is confident.
    `inferred-ambiguous` means two candidates and no way to choose. `unknown` means no candidate.

    Nothing here is a refusal. This is the disclosure surface: it counts how many committed input
    records still require a reader to GUESS.
    """
    state = record.get("codeState") or {}
    sha, gen = state.get("sha256"), state.get("generator")
    out = {"label": record.get("label"), "generator": gen,
           "codeState": sha[:12] if sha else None}
    carried = provenance.fidelity_key(record.get("fidelity"))
    if carried:
        out["status"], out["fidelity"] = "carried", carried
        return out
    if not sha:
        out["status"] = "unknown"
        out["why"] = record.get("fidelityUndeclared") or "the record declares no code state"
        return out
    entry = by_state.get(f"{gen}@{sha}")
    candidates = sorted(k for k in (entry or {}).get("byFidelity", {}) if k != "UNDECLARED")
    out["candidatesFromCorpus"] = candidates
    if len(candidates) == 1:
        out["status"] = "inferred-unique"
    elif len(candidates) > 1:
        out["status"] = "inferred-ambiguous"
    else:
        out["status"] = "unknown"
    return out


def _tally(sidecars):
    counts = {}
    for row in sidecars:
        for rec in row["inputs"]:
            counts[rec["status"]] = counts.get(rec["status"], 0) + 1
    return dict(sorted(counts.items()))


def build():
    dirs = render_directories()
    by_state = {}
    for d in dirs:
        if not d["codeState"]:
            continue
        key = f"{d['generator']}@{d['codeState']}"
        entry = by_state.setdefault(key, {"generator": d["generator"],
                                          "codeState": d["codeState"],
                                          "byFidelity": {}})
        entry["byFidelity"].setdefault(d["fidelityKey"] or "UNDECLARED", []).append(d["dir"])

    states = []
    for key in sorted(by_state):
        e = by_state[key]
        measured = [k for k in e["byFidelity"] if k != "UNDECLARED"]
        e["distinctFidelities"] = len(measured)
        # A SPLIT is one code state measured at two fidelities. Never a defect on its own — it is
        # exactly what makes a delivered-pixel count from one pass incomparable with another's.
        e["split"] = len(measured) > 1
        states.append(e)

    sidecars = sidecar_coverage(by_state)
    unrecoverable = sorted({d["dir"] for d in dirs
                            if d["codeState"] and not d["fidelity"]})

    return {
        "generatedBy": os.path.basename(__file__),
        "producer": provenance.producer_record(__file__),
        "reads": "committed files only (git ls-files)",
        "fidelityKeys": list(provenance.FIDELITY_KEYS),
        "scanned": {
            "renderDirectories": len(dirs),
            "renderDirectoriesDeclaringACodeState": sum(1 for d in dirs if d["codeState"]),
            "renderDirectoriesDeclaringAFidelity": sum(1 for d in dirs if d["fidelity"]),
            "distinctCodeStates": len(states),
            "sidecars": len(sidecars),
            "sidecarsCarryingFidelity": sum(1 for s in sidecars if s["carriesFidelity"]),
            "inputRecords": sum(s["inputRecords"] for s in sidecars),
        },
        # How every committed input record answers "at what fidelity?" — `carried` is a record and
        # everything else is a reader guessing. This is the number the increment set out to move.
        "attribution": _tally(sidecars),
        "codeStates": states,
        "splits": [e for e in states if e["split"]],
        "unrecoverableDirectories": unrecoverable,
        "renderDirectories": dirs,
        "sidecars": sidecars,
    }


def main(argv):
    report = build()
    out = os.path.join(HERE, REPORT)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
        fh.write("\n")
    s = report["scanned"]
    print(f"{REPORT}: {s['renderDirectories']} render directories, "
          f"{s['distinctCodeStates']} distinct code states, "
          f"{len(report['splits'])} measured at more than one fidelity")
    if "--print" in argv:
        for e in report["codeStates"]:
            mark = "SPLIT" if e["split"] else "     "
            print(f"\n  {mark}  {e['generator']}  {e['codeState'][:12]}")
            for fid, ds in sorted(e["byFidelity"].items()):
                print(f"           {fid:>34}  {len(ds)} dir(s)")
                for d in ds:
                    print(f"           {'':>34}    {d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
