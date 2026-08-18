#!/usr/bin/env python3
"""A derived picture's producer writes its own provenance, and a composer will not mix code states.

The track's method is deciding art-direction questions by LOOKING at committed pictures, so a
picture that has gone stale does not merely mislead — it decides wrongly. Three measured failures,
three different artifacts, one shape:

  1. NO PRODUCER. `frames/contact-sheet.png` sat labelled v6 for two increments. `grep -rn
     contact-sheet *.py` found nothing that writes it, and the invocation had to be back-solved from
     the image's own pixel dimensions (4984x298 -> 19 frames at zoom 2).
  2. A MOVED SUBJECT. `framing-fork.png` is the owner-facing evidence for an open fork. A later
     increment re-rendered every frame of the track and nothing flagged it; the fork's visible ANSWER
     had changed while the README still cited the old picture.
  3. INCOHERENCE INSIDE ONE PICTURE — the sharpest. `crown-normals-fork.png` was composed from five
     variant directories, four rendered BEFORE a canopy constant existed and one after. No error, no
     visible cue. A picture whose entire purpose was to isolate ONE lever varied two, and a table
     committed in `blender_tree.py`'s own source under the caption "with the funnel floor below in
     place" was false for four of its five rows. Detection depended on the author recalling the order
     of about twelve renders spread over an hour.

WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. It is a WRITER, not a check. There is no gate rung,
no drift report and no registry of declared evidence directories, and that is a decided fork rather
than an unfinished half: on 2026-08-12 the owner refused a cheap guard that would have refused a
suspicious write (the ADR-0352 concurrent-write fork) — *"i dislike A, feels like it may discourage
legitimate cleanup"* — and the rule drawn from it governs here. `docs/research/` holds 1,204
committed PNGs whose honest churn is constant, so a drift rung would fire on the COMMON case. Ask
what a defensive check costs the legitimate case first, and prefer fixing the WRITE.

NOTHING POLICES THE PAST. A directory that declares no code state is UNDECLARED, never suspect:
{@link require_one_code_state} refuses only when two cells BOTH declare a state and the declarations
DISAGREE. Every artifact made before this change therefore stays exactly as it is, and a tool not
yet taught to write a record still composes fine.

WHY THE CODE STATE IS A SOURCE HASH AND NOT THE FLAGS. A fork sheet varies its flags ON PURPOSE —
that is what a fork sheet is for. What it must never vary is the code underneath, which is precisely
observation 3. So the identity is the generator's own source digest, recorded by the generator at
render time and propagated into the delivered directory by the raster back half.

STANDARD LIBRARY ONLY, ON PURPOSE. `sheet.py` runs its guard before it imports numpy/Pillow, so the
refusal is reachable — and therefore testable — on a host with no imaging stack at all. Keep it that
way. `blender_tree.py` computes the same digest inline with `hashlib` rather than importing this
module, because Blender does not reliably put a `--python` script's own directory on `sys.path`.

  python provenance.py check <label>=<dir> [<label>=<dir> ...]
"""
import hashlib
import json
import os
import sys

SCHEMA = "storytree/derived-evidence-provenance/1"
SIDECAR_SUFFIX = ".provenance.json"
#: Asserted verbatim by the test, so a WARNING can never quietly take a refusal's place.
REFUSAL = "REFUSED: cells were not rendered at the same code state"


def sha256_file(path):
    """The content digest of one file, or None when it is not there to hash."""
    if not os.path.isfile(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


#: What `producer.sha256` is a digest OF. Written into every new sidecar so the rule is READABLE
#: rather than inferred: a sidecar carrying this key was hashed line-ending-normalised, and one
#: without it (every sidecar committed before 2026-08-18) was hashed raw and may therefore disagree
#: with a re-render on a checkout whose line endings differ.
PRODUCER_DIGEST_BASIS = "source-bytes-with-CRLF-and-CR-normalised-to-LF"


def sha256_source(path):
    """The digest of a TEXT source file, immune to the checkout's line endings.

    THE DEFECT THIS FIXES, measured while establishing PR #1387's invalidation list. Re-running the
    UNTOUCHED `compose_shadow.py` rewrote its sidecars with a different `producer.sha256`: the
    committed value was the CRLF hash of a file this repo stores LF (`.gitattributes` sets
    `* text=auto eol=lf`). So the digest recorded the WORKING-COPY LINE ENDINGS of whoever rendered,
    not the source — and the one mechanism this track relies on to prove a picture was made at one
    code state produced a false positive on a byte-identical file.

    That is worse than noise. The whole point of the record is that a reader can ask "is the picture
    on disk still the one this describes?"; a digest that moves when nothing moved trains a reader to
    dismiss the answer, which is exactly the state observation 2 above was in.

    NEWLINES ONLY, AND ONLY FOR SOURCE. A CRLF pair and a bare CR both fold to a bare LF; nothing else is
    touched, so two genuinely different sources still differ. {@link sha256_file} keeps hashing RAW
    bytes and is what every PNG, frame and output digest goes through — normalising a binary would
    corrupt the digest of the very thing this record exists to identify. A file that cannot be read
    as UTF-8 text falls back to its raw bytes rather than raising, because a producer this cannot
    parse is still a producer worth naming.
    """
    if not os.path.isfile(path):
        return None
    with open(path, "rb") as fh:
        raw = fh.read()
    return hashlib.sha256(raw.replace(b"\r\n", b"\n")
                          .replace(b"\r", b"\n")).hexdigest()


def producer_record(pyfile):
    """The tool whose `__file__` this is, plus its own source digest.

    A producer is part of the code state that made its output, so a record naming the tool without
    pinning its version answers half the question. Keyed `tool` rather than `generator` so a reader
    never confuses it with `codeState`, which names the tool that grew the TREE.

    The digest is {@link sha256_source}'s, so re-running an UNEDITED producer from a checkout with
    different line endings reproduces it exactly. `basis` says so in the record itself: the rule a
    sidecar was written under is readable from the sidecar rather than dated by its commit.
    """
    return {"tool": os.path.basename(pyfile),
            "sha256": sha256_source(os.path.abspath(pyfile)),
            "basis": PRODUCER_DIGEST_BASIS}


def sidecar_path(out):
    """`fork.png` -> `fork.png.provenance.json`. The extension is KEPT so the pair is unambiguous
    and sorts adjacent in a directory listing — the sidecar belongs to one exact file."""
    return out + SIDECAR_SUFFIX


def declared_code_state(directory):
    """The code state a variant directory DECLARES, or (None, why-not).

    Two shapes, because both are real: a delivered directory carries `registration.json` (written by
    `pixelise.py`, which propagates the field), and a raw render directory carries
    `render-meta.json` (written by `blender_tree.py`, where the field originates).

    Unreadable or absent is UNDECLARED, never a refusal — a malformed record is the past, and the
    past is not policed here. The reason is returned so the sidecar can say WHY a cell is
    unattributed instead of leaving a silent null.
    """
    for name, key in (("registration.json", "codeState"), ("render-meta.json", "code_state")):
        path = os.path.join(directory, name)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                doc = json.load(fh)
        except (OSError, ValueError) as exc:
            return None, f"{name} is unreadable ({exc.__class__.__name__})"
        state = doc.get(key) if isinstance(doc, dict) else None
        if isinstance(state, dict) and state.get("sha256"):
            return state, None
        return None, f"{name} declares no {key}"
    return None, "no registration.json or render-meta.json"


def input_records(tracks, frames):
    """One record per composed cell: which frames went in, and a content hash for each.

    `tracks` is `sheet.py`'s own `[(label, dir), ...]`; `frames` is the frame indices it will draw.
    Only the frames actually composed are hashed, so the record says what the picture is made of
    rather than what happened to be lying in the directory.
    """
    records = []
    for label, directory in tracks:
        state, why = declared_code_state(directory)
        composed = []
        for f in frames:
            name = "frame-%02d.png" % f
            path = os.path.join(directory, name)
            digest = sha256_file(path)
            entry = {"file": name, "sha256": digest}
            if digest is None:
                entry["missing"] = True
            else:
                entry["bytes"] = os.path.getsize(path)
            composed.append(entry)
        record = {
            "label": label,
            "dir": os.path.basename(os.path.normpath(directory)),
            "path": directory.replace("\\", "/"),
            "frames": composed,
            "codeState": state,
        }
        if state is None:
            record["codeStateUndeclared"] = why
        records.append(record)
    return records


def require_one_code_state(inputs):
    """The composer's refusal. Returns the one agreed code state, or None when none was declared.

    This is observation 3 made impossible rather than reported: a composer that will not silently mix
    states cannot produce the picture that varied two levers while claiming to isolate one. It exits
    rather than warning, because a warning printed into a scrolling render log is what the failure
    already looked like.
    """
    declared = [r for r in inputs if r.get("codeState")]
    by_sha = {}
    for r in declared:
        by_sha.setdefault(r["codeState"]["sha256"], []).append(r["label"])
    if len(by_sha) <= 1:
        return declared[0]["codeState"] if declared else None
    lines = [REFUSAL, ""]
    for sha, labels in sorted(by_sha.items(), key=lambda kv: kv[1]):
        lines.append(f"  {sha[:12]}  {', '.join(labels)}")
    undeclared = [r["label"] for r in inputs if not r.get("codeState")]
    if undeclared:
        lines.append(f"  (undeclared, not counted: {', '.join(undeclared)})")
    lines += [
        "",
        "A fork picture varies its FLAGS on purpose and must never vary the code underneath.",
        "Re-render the disagreeing variants from one checkout, then compose again.",
    ]
    raise SystemExit("\n".join(lines))


def write_sidecar(out, tool_file, argv, inputs, code_state, extra=None):
    """Write the provenance record beside `out` and return its path.

    Records the producer (name AND its own source digest — the tool is part of the code state that
    made the picture), the exact argv, one record per composed input with a hash per frame, and a
    digest of the artifact itself, so a later reader can tell whether the picture on disk is still
    the one this record describes.
    """
    # `producer` is the tool that WROTE this file; `codeState.generator` is the tool that grew the
    # tree its cells were rendered from. Two different pieces of code, so two different keys.
    doc = {
        "schema": SCHEMA,
        "artifact": os.path.basename(out),
        "producer": producer_record(tool_file),
        "command": {"tool": os.path.basename(tool_file), "argv": list(argv)},
        "inputs": inputs,
        "codeState": code_state,
    }
    digest = sha256_file(out)
    if digest is not None:
        doc["output"] = {"sha256": digest, "bytes": os.path.getsize(out)}
    if extra:
        doc.update(extra)
    path = sidecar_path(out)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1)
    return path


def _main(args):
    """`check <label>=<dir> ...` — the same verdict the composer takes, asked directly."""
    if not args or args[0] != "check":
        raise SystemExit(__doc__.strip().splitlines()[-1].strip())
    tracks = [a.split("=", 1) for a in args[1:] if "=" in a]
    if not tracks:
        raise SystemExit("check needs at least one <label>=<dir>")
    records = input_records(tracks, [])
    state = require_one_code_state(records)
    for r in records:
        sha = r["codeState"]["sha256"][:12] if r["codeState"] else "undeclared"
        print(f"{r['label']:>12}  {sha}  {r['dir']}/")
    print("agreed code state:", state["sha256"][:12] if state else "none declared")


if __name__ == "__main__":
    _main(sys.argv[1:])
