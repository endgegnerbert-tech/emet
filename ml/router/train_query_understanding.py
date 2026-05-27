import argparse
import json
import os

import joblib
from sklearn.metrics import accuracy_score, f1_score

from query_understanding import (
    TARGETS,
    evaluate_bundle,
    load_embedding_model,
    load_jsonl,
    normalize_whitespace,
    normalized_labels_from_row,
    predict_bundle,
    train_bundle,
)


def choose_best_model(reports):
    return max(reports, key=lambda item: (
        item["evaluation"]["merged"]["macro_f1"],
        item["evaluation"]["baseline"]["macro_f1"],
        item["model_type"] == "svc",
    ))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", nargs="+", required=True)
    parser.add_argument("--holdout", required=True)
    parser.add_argument("--out-dir", default=os.path.join(".cache", "models", "emet-router", "query-understanding"))
    parser.add_argument("--metrics-out", default=os.path.join("metrics", "router", "query-understanding-models.json"))
    parser.add_argument("--model-type", choices=["svc", "lr", "auto"], default="auto")
    args = parser.parse_args()

    train_rows = load_jsonl(args.input)
    holdout_rows = load_jsonl([args.holdout])
    model_types = [args.model_type] if args.model_type != "auto" else ["svc", "lr"]

    emb_model = load_embedding_model()
    reports = []
    for model_type in model_types:
        bundle, target_metrics, holdout_features = train_bundle(model_type, train_rows, holdout_rows, emb_model=emb_model)
        evaluation = evaluate_bundle(bundle, holdout_rows, holdout_features)
        reports.append({
            "model_type": model_type,
            "bundle": bundle,
            "target_metrics": target_metrics,
            "evaluation": evaluation,
        })

    best = choose_best_model(reports)

    os.makedirs(args.out_dir, exist_ok=True)
    os.makedirs(os.path.dirname(args.metrics_out), exist_ok=True)
    joblib.dump(best["bundle"], os.path.join(args.out_dir, "model.joblib"))

    meta = {
        "task": "query_understanding",
        "modelType": best["model_type"],
        "trainRows": len(train_rows),
        "holdoutRows": len(holdout_rows),
        "targets": {
            target: {
                "threshold": float(best["bundle"]["targets"][target]["threshold"]),
                "labels": best["target_metrics"][target]["labels"],
            }
            for target in TARGETS
        },
    }
    with open(os.path.join(args.out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    metrics = {
        "task": "query_understanding",
        "train_rows": len(train_rows),
        "holdout_rows": len(holdout_rows),
        "best_model": best["model_type"],
        "baseline": best["evaluation"]["baseline"],
        "merged": best["evaluation"]["merged"],
        "raw": best["evaluation"]["raw"],
        "target_metrics": best["target_metrics"],
        "candidate_models": {
            report["model_type"]: {
                "baseline_macro_f1": report["evaluation"]["baseline"]["macro_f1"],
                "merged_macro_f1": report["evaluation"]["merged"]["macro_f1"],
                "raw_macro_f1": report["evaluation"]["raw"]["macro_f1"],
            }
            for report in reports
        },
    }
    with open(args.metrics_out, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    with open(os.path.join(args.out_dir, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(json.dumps({
        "task": "query_understanding",
        "train_rows": len(train_rows),
        "holdout_rows": len(holdout_rows),
        "best_model": best["model_type"],
        "baseline_macro_f1": best["evaluation"]["baseline"]["macro_f1"],
        "merged_macro_f1": best["evaluation"]["merged"]["macro_f1"],
        "raw_macro_f1": best["evaluation"]["raw"]["macro_f1"],
    }, indent=2))


if __name__ == "__main__":
    main()
