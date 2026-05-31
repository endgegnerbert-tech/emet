import argparse
import json
import os

import joblib

from preflight import (
    PREFLIGHT_TARGETS,
    metrics_summary,
    preflight_labels_from_row,
    train_preflight_bundle,
)
from query_understanding import load_embedding_model, load_jsonl


def filtered_review_rows(rows, min_confidence=0.85):
    return [
        row for row in rows
        if not row.get("needs_human_review") and float(row.get("confidence", 1.0) or 0.0) >= min_confidence
    ]


def domain_rows(rows):
    out = []
    for row in rows:
        task = row.get("task")
        if task and task != "domain":
            continue
        labels = preflight_labels_from_row(row)
        if labels.get("domain"):
            out.append(row)
    return out


def cap_domain_rows(rows, max_per_label=600):
    kept = []
    counts = {}
    for row in rows:
        label = preflight_labels_from_row(row).get("domain")
        if not label:
            continue
        if counts.get(label, 0) >= max_per_label:
            continue
        kept.append(row)
        counts[label] = counts.get(label, 0) + 1
    return kept


def query_rows(rows):
    out = []
    for row in rows:
        labels = preflight_labels_from_row(row)
        if any(target in labels for target in PREFLIGHT_TARGETS if target != "domain"):
            out.append(row)
    return out


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain-input", nargs="*", default=[])
    parser.add_argument("--multitask-input", nargs="*", default=[])
    parser.add_argument("--query-input", nargs="*", default=[])
    parser.add_argument("--domain-holdout", default=os.path.join("data", "router", "gold-domain.jsonl"))
    parser.add_argument("--query-holdout", default=os.path.join("data", "router", "query-understanding-holdout.jsonl"))
    parser.add_argument("--out-dir", default=os.path.join(".cache", "models", "emet-router", "preflight"))
    parser.add_argument("--metrics-out", default=os.path.join("metrics", "router", "preflight-superrouter.json"))
    parser.add_argument("--min-confidence", type=float, default=0.85)
    parser.add_argument("--max-domain-rows-per-label", type=int, default=600)
    parser.add_argument("--no-multitask-query-labels", action="store_true")
    parser.add_argument("--model-type", choices=["lr", "hybrid"], default="hybrid")
    return parser.parse_args()


def main():
    args = parse_args()
    raw_domain_rows = load_jsonl(args.domain_input) if args.domain_input else []
    raw_multitask_rows = load_jsonl(args.multitask_input) if args.multitask_input else []
    raw_query_rows = load_jsonl(args.query_input) if args.query_input else []

    reviewed_domain_rows = filtered_review_rows(raw_domain_rows, args.min_confidence)
    reviewed_multitask_rows = filtered_review_rows(raw_multitask_rows, args.min_confidence)

    capped_domain_rows = cap_domain_rows([
        *domain_rows(reviewed_domain_rows),
        *domain_rows(reviewed_multitask_rows),
    ], max_per_label=args.max_domain_rows_per_label)
    multitask_query_rows = [] if args.no_multitask_query_labels else query_rows(reviewed_multitask_rows)

    by_key = {}
    for row in [
        *capped_domain_rows,
        *multitask_query_rows,
        *query_rows(raw_query_rows),
    ]:
        by_key[f"{row.get('query', '')}\t{json.dumps(preflight_labels_from_row(row), sort_keys=True)}"] = row
    train_rows = list(by_key.values())

    domain_holdout = load_jsonl([args.domain_holdout])
    query_holdout = load_jsonl([args.query_holdout])
    holdouts = {"domain": domain_holdout}
    for target in PREFLIGHT_TARGETS:
        if target != "domain":
            holdouts[target] = query_holdout

    emb_model = load_embedding_model()
    bundle, target_metrics = train_preflight_bundle(train_rows, holdouts, model_type=args.model_type, emb_model=emb_model)

    os.makedirs(args.out_dir, exist_ok=True)
    os.makedirs(os.path.dirname(args.metrics_out), exist_ok=True)
    joblib.dump(bundle, os.path.join(args.out_dir, "model.joblib"))

    meta = {
        "task": "preflight",
        "modelType": args.model_type,
        "trainRows": len(train_rows),
        "rawDomainRows": len(raw_domain_rows),
        "reviewedDomainRows": len(reviewed_domain_rows),
        "rawMultitaskRows": len(raw_multitask_rows),
        "reviewedMultitaskRows": len(reviewed_multitask_rows),
        "queryRows": len(raw_query_rows),
        "multitaskQueryRows": len(multitask_query_rows),
        "cappedDomainRows": len(capped_domain_rows),
        "maxDomainRowsPerLabel": args.max_domain_rows_per_label,
        "domainHoldoutRows": len(domain_holdout),
        "queryHoldoutRows": len(query_holdout),
        "targets": {
            target: {
                "threshold": float(bundle["targets"][target]["threshold"]),
                "labels": target_metrics[target].get("labels", []),
            }
            for target in bundle.get("targets", {})
        },
    }
    metrics = {
        **meta,
        "summary": metrics_summary(target_metrics),
        "targetMetrics": target_metrics,
    }

    with open(os.path.join(args.out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    with open(os.path.join(args.out_dir, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    with open(args.metrics_out, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(json.dumps({
        "task": "preflight",
        "train_rows": len(train_rows),
        "targets": list(bundle.get("targets", {}).keys()),
        "summary": metrics["summary"],
        "metrics_out": args.metrics_out,
        "out_dir": args.out_dir,
    }, indent=2))


if __name__ == "__main__":
    main()
