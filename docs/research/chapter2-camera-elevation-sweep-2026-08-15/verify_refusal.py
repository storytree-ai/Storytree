#!/usr/bin/env python3
"""Make the composer's one-code-state refusal FIRE, on the actual directories this sweep composed.

    python verify_refusal.py

WHY THIS EXISTS. `compose_sweep.py` calls `provenance.require_one_code_state` before it draws a
pixel, and the sweep README cites that call as the mechanism which stops a panel set from varying
the renderer as well as the camera. But a guard that has only ever been observed PASSING is
indistinguishable from a guard that cannot fail — and that is not hypothetical here: the failure
this whole mechanism was built for (`crown-normals-fork.png`, four cells rendered before a canopy
constant existed and one after) produced no error and no visible cue either. A green composition
is exactly what the broken world looked like.

So this exercises the refusal rather than asserting it. It takes the REAL `pieces-45` directory,
makes a tampered copy of `pieces-50` declaring a different `blender_land.py` digest, and composes
the two. A passing run here means the refusal fired with the exact refusal text; a clean exit
would mean the sweep's central control is decorative.

NOTHING REAL IS MUTATED. The tamper is a copy under the system temp directory; the sweep's own
piece directories are opened read-only. The copy is removed on the way out.
"""
import importlib.util
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")

_spec = importlib.util.spec_from_file_location("fork_compose", os.path.join(FORK, "compose.py"))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)
sys.path.insert(0, os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                                "blender-hero-v1"))
import provenance  # noqa: E402

GOOD = os.path.join(HERE, "pieces-45")
SOURCE = os.path.join(HERE, "pieces-50")
for d in (GOOD, SOURCE):
    if not os.path.isdir(d):
        raise SystemExit(f"{os.path.basename(d)} is not rendered — run sweep_render.py first")

tmp = tempfile.mkdtemp(prefix="sweep-refusal-")
try:
    tampered = os.path.join(tmp, "pieces-50-tampered")
    shutil.copytree(SOURCE, tampered)

    meta_path = os.path.join(tampered, "render-meta.json")
    meta = json.load(open(meta_path))
    real = meta["code_state"]["sha256"]
    # a DIFFERENT declared generator state — i.e. "these pieces came out of another checkout"
    meta["code_state"]["sha256"] = "0" * 64
    json.dump(meta, open(meta_path, "w"), indent=1)

    inputs = C.piece_inputs([("pieces-45", GOOD), ("pieces-50-tampered", tampered)])
    declared = [r for r in inputs if r.get("codeState")]
    if len(declared) != 2:
        raise SystemExit(
            "SETUP VOID: both cells must DECLARE a state for a disagreement to be possible — "
            "an undeclared cell is unattributed, not a refusal, so this would have proved nothing.")

    try:
        provenance.require_one_code_state(inputs)
    except SystemExit as exc:
        message = str(exc)
        if provenance.REFUSAL not in message:
            raise SystemExit(f"REFUSED, but not with the refusal text.\n---\n{message}")
        print("the refusal FIRED, on the sweep's own piece directories:\n")
        print("\n".join("    " + line for line in message.splitlines()))
        print(f"\n  pieces-45 really declares  {real[:12]}")
        print(f"  the tampered copy declared {'0' * 12}")
        print("\nPASS  a mixed code state cannot be composed into a panel set.")
    else:
        raise SystemExit(
            "NOT REFUSED. Two cells declared different `blender_land.py` digests and the composer "
            "accepted them, so `compose_sweep.py`'s one-code-state guard is decorative and the "
            "sweep's panels are not held to one renderer.")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
