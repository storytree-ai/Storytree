#!/usr/bin/env python3
"""The tie-break reading's validation and analysis. Standard library only.

  python analyse.py validate <runs-dir>   check every annotator run's FORMAT and blindness; keep each
                                          valid one as annotator-<slot>.json, the rest under rejected/
  python analyse.py analyse               the pairwise readings, the two pre-registered criteria, the tables
  python analyse.py crosscheck <dir>      compare every pairwise figure with `storytree resteer agreement`
                                          output saved as <dir>/<a>-<b>.txt

The statistic mirrors `cohensKappa` in packages/library/src/resteer-report.ts line for line, and
`crosscheck` is what holds it to that: the typechecked instrument is the authority, and a figure this
script computes that the instrument does not reproduce is not reported. The verdict logic is the one
`preregistration.md` fixed before any annotator ran.
"""

from __future__ import annotations

import itertools
import json
import math
import re
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
READING_2 = HERE.parent / "mast-agreement-extended-2026-09-05"

# The 19-label frame in `ResteerMode` order, each with its `MAST_CATEGORY` (packages/library/src/knowledge.ts).
CATEGORY = {
    "disobey-task-specification": "specification-and-design",
    "disobey-role-specification": "specification-and-design",
    "step-repetition": "specification-and-design",
    "loss-of-conversation-history": "specification-and-design",
    "unaware-of-termination-conditions": "specification-and-design",
    "conversation-reset": "inter-agent-misalignment",
    "fail-to-ask-for-clarification": "inter-agent-misalignment",
    "task-derailment": "inter-agent-misalignment",
    "information-withholding": "inter-agent-misalignment",
    "ignored-other-agents-input": "inter-agent-misalignment",
    "reasoning-action-mismatch": "inter-agent-misalignment",
    "premature-termination": "verification-and-termination",
    "no-or-incomplete-verification": "verification-and-termination",
    "incorrect-verification": "verification-and-termination",
    "tool-defect": "storytree-extension",
    "environment-defect": "storytree-extension",
    "missing-capability": "storytree-extension",
    "data-model-gap": "storytree-extension",
    "no-mast-home": "unhoused",
}
SEAM = frozenset({"incorrect-verification", "tool-defect"})
FC3_INTERNAL = frozenset({"incorrect-verification", "no-or-incomplete-verification"})
ARMS = {"C": "CONTROL", "R": "RULE"}
SLOTS = [f"{arm}{i}" for arm in ARMS for i in range(1, 5)]
TOLERANCE = Fraction(1, 40)  # criterion (A): at most one item of 40 below the control arm
REPO_ROOT = "c:\\code\\storytree"


def prompt_text() -> str:
    return (HERE / "prompt-control.txt").read_text(encoding="utf-8")


def sample_ids() -> list[str]:
    text = prompt_text()
    start = text.index("[", text.index("THE 40 RECORDS"))
    end = text.rindex("]")
    return [record["id"] for record in json.loads(text[start : end + 1])]


def assert_frame_matches_prompt() -> None:
    text = prompt_text()
    frame = text[: text.index("OUTPUT FORMAT")]
    in_prompt = set(re.findall(r"^- ([a-z-]+) — ", frame, flags=re.M))
    if in_prompt != set(CATEGORY):
        raise SystemExit(f"label list disagrees with the prompt: {sorted(in_prompt ^ set(CATEGORY))}")


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------------------------------
# validate
# ---------------------------------------------------------------------------------------------------


def check_format(parsed: object, ids: list[str], reasons: list[str]) -> None:
    if not isinstance(parsed, list):
        reasons.append("result is not a JSON array")
        return
    if len(parsed) != len(ids):
        reasons.append(f"{len(parsed)} objects, not {len(ids)}")
    seen: list[str] = []
    for index, row in enumerate(parsed):
        if not isinstance(row, dict):
            reasons.append(f"[{index}] is not an object")
            continue
        row_id, mode = row.get("id"), row.get("mode")
        if not isinstance(row_id, str):
            reasons.append(f"[{index}] has no string id")
            continue
        if not isinstance(mode, str) or mode not in CATEGORY:
            reasons.append(f"[{index}] {row_id}: mode {mode!r} is not one of the 19 labels")
        seen.append(row_id)
    if sorted(seen) != sorted(ids):
        counts = Counter(seen)
        reasons.append(
            "ids do not match the sample exactly once each: "
            f"missing {sorted(set(ids) - set(seen))}, extra {sorted(set(seen) - set(ids))}, "
            f"duplicated {sorted(i for i, c in counts.items() if c > 1)}"
        )


def validate(runs_dir: Path) -> None:
    assert_frame_matches_prompt()
    ids = sample_ids()
    manifest = []
    for run in sorted(p for p in runs_dir.iterdir() if p.is_dir()):
        match = re.fullmatch(r"([CR][1-4])-a(\d+)", run.name)
        if match is None:
            continue
        slot, attempt = match.group(1), int(match.group(2))
        record: dict[str, object] = {"slot": slot, "arm": ARMS[slot[0]], "attempt": attempt}
        for name in ("started", "ended", "exit"):
            marker = run / f"{name}.txt"
            record[name] = marker.read_text(encoding="utf-8").strip() if marker.exists() else None
        reasons: list[str] = []
        events: list[dict] = []
        stream = run / "stream.jsonl"
        if stream.exists():
            for number, line in enumerate(stream.read_text(encoding="utf-8").splitlines(), 1):
                if line.strip():
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        reasons.append(f"stream line {number} is not JSON")
        else:
            reasons.append("no stream.jsonl")

        init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), None)
        if init is None:
            reasons.append("no init event")
        else:
            cwd = str(init.get("cwd", ""))
            outside = not cwd.replace("/", "\\").lower().startswith(REPO_ROOT)
            record.update(
                {
                    "cwd": cwd,
                    "cwd_outside_repository": outside,
                    "model": init.get("model"),
                    "tools": init.get("tools"),
                    "mcp_servers": init.get("mcp_servers"),
                    "claude_code_version": init.get("claude_code_version"),
                    "api_key_source": init.get("apiKeySource"),
                }
            )
            if not outside:
                reasons.append("cwd inside the repository")
            if init.get("tools") != []:
                reasons.append("tools were available")
            if init.get("mcp_servers") != []:
                reasons.append("MCP servers were loaded")
            if init.get("model") != "claude-opus-5":
                reasons.append(f"model was {init.get('model')!r}")

        tool_uses = sum(
            1
            for e in events
            if e.get("type") == "assistant"
            for c in (e.get("message") or {}).get("content", [])
            if isinstance(c, dict) and c.get("type") == "tool_use"
        )
        record["tool_use_events"] = tool_uses
        if tool_uses:
            reasons.append("the run made tool calls")

        result = next((e for e in reversed(events) if e.get("type") == "result"), None)
        parsed: object = None
        if result is None:
            reasons.append("no result event")
        else:
            usage = result.get("usage") or {}
            record.update(
                {
                    "result_subtype": result.get("subtype"),
                    "is_error": result.get("is_error"),
                    "num_turns": result.get("num_turns"),
                    "duration_ms": result.get("duration_ms"),
                    "input_tokens": usage.get("input_tokens"),
                    "cache_read_input_tokens": usage.get("cache_read_input_tokens"),
                    "cache_creation_input_tokens": usage.get("cache_creation_input_tokens"),
                    "output_tokens": usage.get("output_tokens"),
                    "models_used": sorted((result.get("modelUsage") or {}).keys()),
                }
            )
            if result.get("is_error"):
                reasons.append("result is an error")
            text = str(result.get("result") or "").strip()
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                reasons.append("result does not parse as JSON")
            else:
                check_format(parsed, ids, reasons)

        target = HERE / f"annotator-{slot}.json"
        if not reasons and target.exists():
            reasons.append(f"slot {slot} already holds a valid annotation from an earlier attempt")
        record["valid"] = not reasons
        record["invalid_reasons"] = reasons
        if reasons:
            rejected = HERE / "rejected" / f"{slot}-a{attempt}.txt"
            rejected.parent.mkdir(parents=True, exist_ok=True)
            body = str(result.get("result")) if result is not None else (run / "stderr.txt").read_text(encoding="utf-8", errors="replace") if (run / "stderr.txt").exists() else ""
            with open(rejected, "w", encoding="utf-8", newline="\n") as handle:
                handle.write("REJECTED: " + "; ".join(reasons) + "\n\n" + body + "\n")
        else:
            write_json(target, parsed)
        manifest.append(record)
        print(f"{run.name:8} valid={record['valid']!s:5} {'; '.join(reasons)}")
    write_json(HERE / "runs.json", manifest)


# ---------------------------------------------------------------------------------------------------
# analyse
# ---------------------------------------------------------------------------------------------------


def load(path: Path) -> dict[str, dict]:
    return {row["id"]: row for row in json.loads(path.read_text(encoding="utf-8"))}


def labeller(grain: str):
    return (lambda mode: mode) if grain == "mode" else (lambda mode: CATEGORY.get(mode, "off-frame"))


def reading(a: dict[str, dict], b: dict[str, dict], grain: str) -> dict[str, object]:
    """Cohen's kappa over the items both annotators labelled, exactly as `cohensKappa` computes it."""
    label = labeller(grain)
    pairs = [(label(a[i]["mode"]), label(b[i]["mode"])) for i in a if i in b]
    n = len(pairs)
    categories = sorted({x for pair in pairs for x in pair})
    agreed = sum(1 for x, y in pairs if x == y)
    marginal_a = Counter(x for x, _ in pairs)
    marginal_b = Counter(y for _, y in pairs)
    expected = 0.0
    for category in categories:
        expected += (marginal_a[category] / n) * (marginal_b[category] / n)
    observed = agreed / n
    kappa = None if expected == 1 else (observed - expected) / (1 - expected)
    return {"n": n, "agreed": agreed, "observed": observed, "expected": expected, "kappa": kappa, "labels_in_play": len(categories)}


def boundary_splits(a: dict[str, dict], b: dict[str, dict], boundary: frozenset[str]) -> list[str]:
    return [i for i in a if i in b and {a[i]["mode"], b[i]["mode"]} == boundary]


def item_agreement_shares(annotators: list[dict[str, dict]], ids: list[str], grain: str) -> dict[str, Fraction]:
    label = labeller(grain)
    pairs = list(itertools.combinations(annotators, 2))
    return {
        i: Fraction(sum(1 for x, y in pairs if label(x[i]["mode"]) == label(y[i]["mode"])), len(pairs))
        for i in ids
    }


def paired_difference(rule: dict[str, Fraction], control: dict[str, Fraction], ids: list[str]) -> dict[str, float]:
    diffs = [float(rule[i] - control[i]) for i in ids]
    n = len(diffs)
    mean = sum(diffs) / n
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / (n - 1))
    half = 1.96 * sd / math.sqrt(n)
    return {"mean": mean, "sd": sd, "low": mean - half, "high": mean + half, "items_changed": sum(1 for d in diffs if d != 0)}


def modal(labels: list[str]) -> str:
    counts = Counter(labels).most_common()
    top = [label for label, count in counts if count == counts[0][1]]
    return top[0] if len(top) == 1 else "tie(" + "|".join(sorted(top)) + ")"


def fmt(value: float | None) -> str:
    return "undefined" if value is None else f"{value:.3f}"


def analyse() -> None:
    assert_frame_matches_prompt()
    ids = sample_ids()
    annotators = {slot: load(HERE / f"annotator-{slot}.json") for slot in SLOTS if (HERE / f"annotator-{slot}.json").exists()}
    reading_2 = {name: load(READING_2 / f"annotator-{name}.json") for name in ("A", "B")}
    results: dict[str, object] = {"sample_size": len(ids), "annotators": sorted(annotators)}

    arms: dict[str, dict[str, object]] = {}
    for key, arm in ARMS.items():
        slots = [s for s in SLOTS if s.startswith(key) and s in annotators]
        pairs = []
        for x, y in itertools.combinations(slots, 2):
            a, b = annotators[x], annotators[y]
            pairs.append(
                {
                    "pair": f"{x}-{y}",
                    "mode": reading(a, b, "mode"),
                    "category": reading(a, b, "category"),
                    "seam_splits": boundary_splits(a, b, SEAM),
                    "fc3_internal_splits": boundary_splits(a, b, FC3_INTERNAL),
                    "disagreements": [
                        {"id": i, x: a[i]["mode"], y: b[i]["mode"], f"{x}_reason": a[i].get("reason"), f"{y}_reason": b[i].get("reason")}
                        for i in ids
                        if a[i]["mode"] != b[i]["mode"]
                    ],
                }
            )
        mean_mode = Fraction(sum(p["mode"]["agreed"] for p in pairs), sum(p["mode"]["n"] for p in pairs))
        mean_category = Fraction(sum(p["category"]["agreed"] for p in pairs), sum(p["category"]["n"] for p in pairs))
        kappas_mode = [p["mode"]["kappa"] for p in pairs if p["mode"]["kappa"] is not None]
        kappas_category = [p["category"]["kappa"] for p in pairs if p["category"]["kappa"] is not None]
        label_totals = Counter(annotators[s][i]["mode"] for s in slots for i in ids)
        arms[arm] = {
            "slots": slots,
            "pairs": pairs,
            "mean_observed_mode": mean_mode,
            "mean_observed_category": mean_category,
            "mean_kappa_mode": sum(kappas_mode) / len(kappas_mode),
            "kappa_mode_range": [min(kappas_mode), max(kappas_mode)],
            "mean_kappa_category": sum(kappas_category) / len(kappas_category),
            "kappa_category_range": [min(kappas_category), max(kappas_category)],
            "seam_splits_total": sum(len(p["seam_splits"]) for p in pairs),
            "fc3_internal_splits_total": sum(len(p["fc3_internal_splits"]) for p in pairs),
            "label_totals": dict(label_totals.most_common()),
            "category_totals": dict(Counter(CATEGORY[label] for label in label_totals.elements()).most_common()),
            "modal_label": {i: modal([annotators[s][i]["mode"] for s in slots]) for i in ids},
            "shares_mode": item_agreement_shares([annotators[s] for s in slots], ids, "mode"),
            "shares_category": item_agreement_shares([annotators[s] for s in slots], ids, "category"),
        }

    control, rule = arms["CONTROL"], arms["RULE"]
    a_mode = rule["mean_observed_mode"] >= control["mean_observed_mode"] - TOLERANCE
    a_category = rule["mean_observed_category"] >= control["mean_observed_category"] - TOLERANCE
    seam_c, seam_r = control["seam_splits_total"], rule["seam_splits_total"]
    b_seam = seam_r < seam_c or (seam_c == 0 and seam_r == 0)
    verdict = "ADOPT" if (a_mode and a_category and b_seam) else "DECLINE"
    results["criteria"] = {
        "A_mode": {"rule": float(rule["mean_observed_mode"]), "control": float(control["mean_observed_mode"]), "floor": float(control["mean_observed_mode"] - TOLERANCE), "holds": a_mode},
        "A_category": {"rule": float(rule["mean_observed_category"]), "control": float(control["mean_observed_category"]), "floor": float(control["mean_observed_category"] - TOLERANCE), "holds": a_category},
        "B_seam": {"rule": seam_r, "control": seam_c, "vacuous": seam_c == 0 and seam_r == 0, "holds": b_seam},
        "verdict": verdict,
    }
    results["paired_difference"] = {
        "mode": paired_difference(rule["shares_mode"], control["shares_mode"], ids),
        "category": paired_difference(rule["shares_category"], control["shares_category"], ids),
    }
    results["reading_2"] = {
        "mode": reading(reading_2["A"], reading_2["B"], "mode"),
        "category": reading(reading_2["A"], reading_2["B"], "category"),
        "seam_splits": boundary_splits(reading_2["A"], reading_2["B"], SEAM),
        "fc3_internal_splits": boundary_splits(reading_2["A"], reading_2["B"], FC3_INTERNAL),
        "label_totals": dict(Counter(reading_2[n][i]["mode"] for n in ("A", "B") for i in ids).most_common()),
    }
    # Descriptive only, NOT pre-registered: each control annotator against each of the frozen pair.
    cross_day = [reading(annotators[s], reading_2[n], "mode") for s in control["slots"] for n in ("A", "B")]
    results["cross_day_control_vs_reading_2_mode"] = {
        "pairs": len(cross_day),
        "mean_observed": sum(r["observed"] for r in cross_day) / len(cross_day),
        "mean_kappa": sum(r["kappa"] for r in cross_day if r["kappa"] is not None) / len(cross_day),
    }
    moved = [
        {"id": i, "control": control["modal_label"][i], "rule": rule["modal_label"][i],
         "control_labels": dict(Counter(annotators[s][i]["mode"] for s in control["slots"])),
         "rule_labels": dict(Counter(annotators[s][i]["mode"] for s in rule["slots"]))}
        for i in ids
        if control["modal_label"][i] != rule["modal_label"][i]
    ]
    results["modal_label_changes"] = moved
    results["per_annotator_labels"] = {s: dict(Counter(annotators[s][i]["mode"] for i in ids).most_common()) for s in annotators}

    serialisable = json.loads(json.dumps({**results, "arms": {
        arm: {k: (float(v) if isinstance(v, Fraction) else ({i: float(f) for i, f in v.items()} if k.startswith("shares_") else v)) for k, v in data.items()}
        for arm, data in arms.items()
    }}, default=float))
    write_json(HERE / "results.json", serialisable)

    # ---- the printed readout --------------------------------------------------------------------
    print(f"n = {len(ids)} items; annotators present: {', '.join(sorted(annotators))}\n")
    for arm in ("CONTROL", "RULE"):
        data = arms[arm]
        print(f"== {arm} ({', '.join(data['slots'])})")
        print("   pair    mode obs   mode kappa   cat obs   cat kappa   seam  fc3-internal")
        for p in data["pairs"]:
            m, c = p["mode"], p["category"]
            print(f"   {p['pair']:6}  {m['agreed']:>2}/40 {m['observed']:.3f}  {fmt(m['kappa']):>9}   {c['agreed']:>2}/40 {c['observed']:.3f}  {fmt(c['kappa']):>7}   {len(p['seam_splits']):>3}  {len(p['fc3_internal_splits']):>4}")
        print(f"   mean observed: mode {float(data['mean_observed_mode']):.4f}  category {float(data['mean_observed_category']):.4f}")
        print(f"   mean kappa:    mode {data['mean_kappa_mode']:.3f} (range {data['kappa_mode_range'][0]:.3f}-{data['kappa_mode_range'][1]:.3f})  category {data['mean_kappa_category']:.3f} (range {data['kappa_category_range'][0]:.3f}-{data['kappa_category_range'][1]:.3f})")
        print(f"   seam splits {data['seam_splits_total']}  fc3-internal splits {data['fc3_internal_splits_total']}")
        print(f"   labels   {data['label_totals']}")
        print(f"   categories {data['category_totals']}\n")
    r2 = results["reading_2"]
    print(f"== READING 2 (A-B, frozen 2026-09-05): mode {r2['mode']['agreed']}/40 {r2['mode']['observed']:.3f} kappa {fmt(r2['mode']['kappa'])}; category {r2['category']['agreed']}/40 {r2['category']['observed']:.3f} kappa {fmt(r2['category']['kappa'])}; seam {len(r2['seam_splits'])} {r2['seam_splits']}; fc3-internal {len(r2['fc3_internal_splits'])} {r2['fc3_internal_splits']}")
    cd = results["cross_day_control_vs_reading_2_mode"]
    print(f"== cross-day (descriptive, not pre-registered): control annotators vs frozen A/B, {cd['pairs']} pairs, mean observed {cd['mean_observed']:.3f}, mean kappa {cd['mean_kappa']:.3f}\n")
    crit = results["criteria"]
    print("== CRITERIA")
    print(f"   (A) mode:     rule {crit['A_mode']['rule']:.4f} >= control {crit['A_mode']['control']:.4f} - 0.025 = {crit['A_mode']['floor']:.4f}  -> {crit['A_mode']['holds']}")
    print(f"   (A) category: rule {crit['A_category']['rule']:.4f} >= control {crit['A_category']['control']:.4f} - 0.025 = {crit['A_category']['floor']:.4f}  -> {crit['A_category']['holds']}")
    print(f"   (B) seam splits: rule {seam_r} vs control {seam_c} (vacuous: {crit['B_seam']['vacuous']})  -> {b_seam}")
    print(f"   VERDICT: {verdict}\n")
    for grain in ("mode", "category"):
        d = results["paired_difference"][grain]
        print(f"== paired per-item difference (rule - control), {grain}: mean {d['mean'] * 100:+.1f}pp, 95% [{d['low'] * 100:+.1f}, {d['high'] * 100:+.1f}]pp, items whose share changed {d['items_changed']}")
    print("\n== modal label changes between arms")
    for change in moved:
        print(f"   {change['id']}: control {change['control']} {change['control_labels']} -> rule {change['rule']} {change['rule_labels']}")
    for arm, primary in (("CONTROL", "C1-C2"), ("RULE", "R1-R2")):
        pair = next((p for p in arms[arm]["pairs"] if p["pair"] == primary), None)
        if pair is None:
            continue
        print(f"\n== primary pair {primary} disagreements ({len(pair['disagreements'])})")
        for row in pair["disagreements"]:
            x, y = primary.split("-")
            print(f"   {row['id']}: {x} {row[x]} | {y} {row[y]}")
            print(f"      {x}: {row[f'{x}_reason']}")
            print(f"      {y}: {row[f'{y}_reason']}")


# ---------------------------------------------------------------------------------------------------
# crosscheck
# ---------------------------------------------------------------------------------------------------


def crosscheck(directory: Path) -> None:
    results = json.loads((HERE / "results.json").read_text(encoding="utf-8"))
    computed = {p["pair"]: p for arm in results["arms"].values() for p in arm["pairs"]}
    computed["A-B"] = results["reading_2"]
    checked = disagreeing = 0
    for file in sorted(directory.glob("*.txt")):
        if file.stem not in computed:
            continue
        text = file.read_text(encoding="utf-8", errors="replace")
        mode_block, category_block = text.split("CATEGORY GRAIN", 1)
        for grain, block in (("mode", mode_block), ("category", category_block)):
            observed = float(re.search(r"observed agreement\s+(-?[0-9.]+)", block).group(1))
            kappa_text = re.search(r"Cohen's kappa\s+(-?[0-9.]+|undefined)", block).group(1)
            kappa = None if kappa_text == "undefined" else float(kappa_text)
            mine = computed[file.stem][grain]
            same_observed = abs(observed - mine["observed"]) <= 0.0005 + 1e-9
            same_kappa = (kappa is None and mine["kappa"] is None) or (
                kappa is not None and mine["kappa"] is not None and abs(kappa - mine["kappa"]) <= 0.0005 + 1e-9
            )
            checked += 1
            if not (same_observed and same_kappa):
                disagreeing += 1
                print(f"DISAGREES {file.stem} {grain}: instrument {observed} / {kappa}, script {mine['observed']} / {mine['kappa']}")
    print(f"{checked} readings cross-checked against `storytree resteer agreement`; {disagreeing} disagree")
    if checked == 0 or disagreeing:
        raise SystemExit(1)


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "validate" and len(sys.argv) == 3:
        validate(Path(sys.argv[2]))
    elif command == "analyse":
        analyse()
    elif command == "crosscheck" and len(sys.argv) == 3:
        crosscheck(Path(sys.argv[2]))
    else:
        raise SystemExit(__doc__)
