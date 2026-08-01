"""Submit a create_map_object job and poll it to completion, saving raw output.

usage: python run.py <label> <args.json>
Prints:  JOB <id>  /  OK <path>  /  FAIL <reason>
"""
import json, os, re, subprocess, sys, time

CLI = r"C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"
RAW = r"C:\code\storytree\docs\research\chapter2-organic-round3-2026-08-01\exp-11-in-context-inpaint\raw"


def cli(*a):
    p = subprocess.run(["node", CLI, *a], capture_output=True, text=True)
    return p.stdout + p.stderr


def submit(argsjson, tries=8):
    for i in range(tries):
        out = cli("call", "create_map_object", argsjson)
        m = re.search(r"^id: ([0-9a-f-]{36})", out, re.M)
        if m:
            return m.group(1)
        if "rate limit" in out:
            time.sleep(25)
            continue
        raise SystemExit("SUBMIT FAIL\n" + out)
    raise SystemExit("SUBMIT rate-limited out")


def poll(job, label, timeout=420):
    getf = os.path.join(os.path.dirname(os.path.abspath(argsjson)), f"get-{label}.json")
    with open(getf, "w") as f:
        json.dump({"object_id": job}, f)
    t0 = time.time()
    while time.time() - t0 < timeout:
        out = cli("call", "get_map_object", getf, "--out", RAW, "--label", f"{label}-{job[:8]}")
        if "status: completed" in out:
            m = re.search(r"^SAVED (.+)$", out, re.M)
            return ("OK", m.group(1) if m else None, out)
        if "status: failed" in out or "error:" in out:
            return ("FAIL", None, out)
        time.sleep(9)
    return ("TIMEOUT", None, "")


if __name__ == "__main__":
    label, argsjson = sys.argv[1], sys.argv[2]
    job = submit(argsjson)
    print("JOB", job, flush=True)
    st, path, out = poll(job, label)
    print(st, path or "")
    if st != "OK":
        print(out)
