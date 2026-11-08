"""Benchmark the HarvestOps document pipeline against the synthetic ground truth.

    python scripts/generate_demo_documents.py
    python scripts/benchmark_documents.py            # rules only (deterministic)
    python scripts/benchmark_documents.py --llm      # rules + grounded Groq fill for missing fields

Scores: document handling (extract / abstain / reject), classification accuracy, per-field precision/recall/F1 on normalised
values, and per-rule precision/recall/F1 over packets. Writes data/derived/document_benchmark.json.

Caveat printed with every result: the generator and the extractor were written by the same team, so these numbers measure
robustness to the variants we built (page order, units, date formats, French labels, scans, corruption), not field accuracy
on real-world paperwork.
"""
import json
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.ethnoharvest.ops import documents as D  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures" / "harvestops"


def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else None
    r = tp / (tp + fn) if tp + fn else None
    f = 2 * p * r / (p + r) if p and r else (0.0 if p is not None and r is not None else None)
    return {"tp": tp, "fp": fp, "fn": fn, "precision": p, "recall": r, "f1": f}


def run(use_llm=False):
    gt = json.loads((FIX / "ground_truth.json").read_text(encoding="utf-8"))
    handling = Counter()
    cls_ok = cls_n = 0
    field_counts = defaultdict(lambda: [0, 0, 0])
    rule_counts = defaultdict(lambda: [0, 0, 0])
    latencies = []
    packets_out = []
    field_errors = []
    for pk in gt["packets"]:
        docs = []
        for doc in pk["documents"]:
            data = (FIX / "pdfs" / pk["id"] / doc["file"]).read_bytes()
            t0 = time.time()
            try:
                D.validate(data, doc["file"])
                a = D.analyse(data, use_llm=use_llm)
            except D.OpsError as e:
                a = {"status": "rejected", "reason": e.msg if hasattr(e, "msg") else str(e), "kind": "unknown", "fields": []}
            latencies.append((time.time() - t0) * 1000)
            handling[(doc["expect"], a["status"] if a["status"] in ("rejected", "needs-ocr") else "extracted")] += 1
            if doc["kind"] and doc["expect"] == "extracted":
                cls_n += 1
                cls_ok += a["kind"] == doc["kind"]
            got = {f["name"]: f for f in a["fields"]}
            if doc["expect"] == "extracted":
                for name, val in doc["fields"].items():
                    want = D.normalise(name, val)
                    f = got.get(name)
                    c = field_counts[name]
                    if f is None:
                        c[2] += 1
                        field_errors.append({"packet": pk["id"], "doc": doc["file"], "field": name, "want": want, "got": None})
                    elif f["normalised"] == want:
                        c[0] += 1
                    else:
                        c[1] += 1
                        c[2] += 1
                        field_errors.append({"packet": pk["id"], "doc": doc["file"], "field": name, "want": want, "got": f["normalised"]})
                for name in got:
                    if name not in doc["fields"]:
                        field_counts[name][1] += 1
                        field_errors.append({"packet": pk["id"], "doc": doc["file"], "field": name, "want": None, "got": got[name]["normalised"]})
            import hashlib
            docs.append({"filename": doc["file"], "kind": a["kind"], "status": a["status"], "reason": a.get("reason"),
                         "sha256": hashlib.sha256(data).hexdigest(), "fields": got})
        issues = D.cross_check(pk["passport"], docs, set(), pk["cites_listed"])
        abstained = any(i["rule"] == "fields_not_found" for i in issues)
        fired = {i["rule"] for i in issues} - {"fields_not_found"}  # abstention is reported separately, not scored as a finding
        want = set(pk["expected_rules"])
        for r in fired | want:
            c = rule_counts[r]
            if r in fired and r in want:
                c[0] += 1
            elif r in fired:
                c[1] += 1
            else:
                c[2] += 1
        packets_out.append({"packet": pk["id"], "expected": sorted(want), "fired": sorted(fired),
                            "false_positive": sorted(fired - want), "missed": sorted(want - fired), "pass": fired == want,
                            "abstained_on_missing_fields": abstained})
    ft = [sum(v[i] for v in field_counts.values()) for i in range(3)]
    rt = [sum(v[i] for v in rule_counts.values()) for i in range(3)]
    n_docs = sum(handling.values())
    res = {
        "mode": "rules + grounded LLM fill" if use_llm else "rules only",
        "extractor": D.EXTRACTOR, "ocr_engine_installed": D.ocr_available(),
        "documents": n_docs, "packets": len(gt["packets"]),
        "handling": {f"expected {a} → got {b}": n for (a, b), n in sorted(handling.items())},
        "classification": {"correct": cls_ok, "total": cls_n, "accuracy": cls_ok / cls_n if cls_n else None},
        "fields_micro": prf(*ft), "fields": {k: prf(*v) for k, v in sorted(field_counts.items())},
        "rules_micro": prf(*rt), "rules": {k: prf(*v) for k, v in sorted(rule_counts.items())},
        "packets_passed": sum(p["pass"] for p in packets_out),
        "missed_findings_with_abstention": sum(1 for p in packets_out if p["missed"] and p["abstained_on_missing_fields"]),
        "missed_findings_silent": sum(1 for p in packets_out if p["missed"] and not p["abstained_on_missing_fields"]), "packet_results": packets_out,
        "latency_ms": {"median": round(statistics.median(latencies), 1), "max": round(max(latencies), 1)},
        "field_errors": field_errors[:60],
        "caveat": "Synthetic documents generated by the same team that wrote the extractor. Measures robustness to the built variants, "
                  "not real-world accuracy. No real permits, certificates or lab reports were used.",
    }
    return res


if __name__ == "__main__":
    use_llm = "--llm" in sys.argv
    r = run(use_llm)
    out = ROOT / "data" / "derived" / f"document_benchmark{'_llm' if use_llm else ''}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(r, indent=2, ensure_ascii=False), encoding="utf-8")
    fm, rm = r["fields_micro"], r["rules_micro"]
    print(f"mode: {r['mode']} | docs {r['documents']} | packets {r['packets']}")
    print("handling:", json.dumps(r["handling"], ensure_ascii=True))
    print(f"classification {r['classification']['correct']}/{r['classification']['total']}")
    print(f"fields  P={fm['precision']:.3f} R={fm['recall']:.3f} F1={fm['f1']:.3f} (tp {fm['tp']} fp {fm['fp']} fn {fm['fn']})")
    print(f"rules   P={rm['precision']:.3f} R={rm['recall']:.3f} F1={rm['f1']:.3f} (tp {rm['tp']} fp {rm['fp']} fn {rm['fn']})")
    print(f"packets passed {r['packets_passed']}/{r['packets']}; latency median {r['latency_ms']['median']} ms")
    for p in r["packet_results"]:
        if not p["pass"]:
            print("  FAIL", p["packet"], "fp", p["false_positive"], "missed", p["missed"], "abstained" if p["abstained_on_missing_fields"] else "SILENT")
    for e in r["field_errors"][:25]:
        print("  field", e)
