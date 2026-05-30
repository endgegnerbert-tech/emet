import argparse
import json
import os
import re
from collections import Counter

import joblib
import numpy as np
from imblearn.over_sampling import RandomOverSampler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import GroupKFold
from sklearn.calibration import CalibratedClassifierCV
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC

TASK_INPUTS = {
    "conflict": os.path.join("data", "router", "gold-conflict-structured.jsonl"),
    "sufficiency": os.path.join("data", "router", "gold-sufficiency-structured.jsonl"),
    "source_authority": os.path.join("data", "router", "gold-source-authority-structured.jsonl"),
    "page_quality": os.path.join("data", "router", "gold-page-quality-structured.jsonl"),
}

TASK_BASELINES = {
    "conflict": os.path.join("metrics", "router", "conflict-baseline-provisional.json"),
    "sufficiency": os.path.join("metrics", "router", "sufficiency-baseline-provisional.json"),
    "source_authority": os.path.join("metrics", "router", "source-authority-baseline.json"),
    "page_quality": os.path.join("metrics", "router", "page-quality-baseline.json"),
}

MODEL_BUILDERS = {
    "lr": lambda: Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=5000, class_weight="balanced")),
    ]),
    "svc": lambda: Pipeline([
        ("scaler", StandardScaler()),
        ("clf", CalibratedClassifierCV(LinearSVC(class_weight="balanced", dual=False, max_iter=5000, C=0.5), method="sigmoid", cv=3)),
    ]),
    "mlp": lambda: Pipeline([
        ("scaler", StandardScaler()),
        ("clf", MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=2000, random_state=42, early_stopping=False)),
    ]),
}


def normalize_query_group(query: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]+", " ", (query or "").lower())).strip()


def load_jsonl(path: str):
    with open(path, "r") as f:
        return [json.loads(line) for line in f if line.strip()]


def build_xy(rows):
    feature_names = sorted(rows[0]["features"].keys())
    X = np.array([[row["features"][name] for name in feature_names] for row in rows], dtype=np.float32)
    y = np.array([row["label"] for row in rows])
    groups = np.array([normalize_query_group(row["query"]) for row in rows])
    return X, y, groups, feature_names


def is_high_risk_features(features):
    return bool(
        features.get("high_risk_family", 0)
        or features.get("requires_authority", 0)
        or features.get("requires_primary_source", 0)
    )


def selective_threshold(task, pred_label, high_risk):
    if task == "sufficiency":
        if pred_label == "sufficient":
            return 0.90 if high_risk else 0.75
        return 0.65 if high_risk else 0.55
    if task == "conflict":
        if pred_label in {"needs_review", "open_conflict"}:
            return 0.60 if high_risk else 0.55
        return 0.85 if high_risk else 0.60
    return 0.75


def choose_n_splits(y, groups):
    min_class = min(Counter(y).values())
    return max(2, min(5, len(set(groups)), min_class))


def evaluate_model(model_name, rows, task):
    X, y, groups, feature_names = build_xy(rows)
    splitter = GroupKFold(n_splits=choose_n_splits(y, groups))
    gold, pred = [], []
    selective_gold, selective_pred = [], []
    abstained = 0
    false_sufficient = 0
    high_risk_false_sufficient = 0
    fold_rows = []

    for fold, (train_idx, test_idx) in enumerate(splitter.split(X, y, groups), start=1):
        ros = RandomOverSampler(random_state=42)
        X_train, y_train = ros.fit_resample(X[train_idx], y[train_idx])
        clf = MODEL_BUILDERS[model_name]()
        clf.fit(X_train, y_train)
        probs = clf.predict_proba(X[test_idx]) if hasattr(clf, "predict_proba") else None
        preds = clf.predict(X[test_idx])

        for local_idx, pred_label in enumerate(preds):
            idx = test_idx[local_idx]
            confidence = None
            if probs is not None:
                confidence = float(np.max(probs[local_idx]))
            gold_label = str(y[idx])
            pred_label = str(pred_label)
            high_risk = is_high_risk_features(rows[idx].get("features", {}))
            accepted = confidence is None or confidence >= selective_threshold(task, pred_label, high_risk)
            if pred_label == "sufficient" and gold_label != "sufficient":
                false_sufficient += 1
                if high_risk:
                    high_risk_false_sufficient += 1
            if accepted:
                selective_gold.append(gold_label)
                selective_pred.append(pred_label)
            else:
                abstained += 1
            gold.append(gold_label)
            pred.append(pred_label)
            fold_rows.append({
                "fold": fold,
                "query": rows[idx]["query"],
                "gold": gold_label,
                "pred": pred_label,
                "confidence": confidence,
                "accepted": accepted,
                "highRisk": high_risk,
            })

    return {
        "model": model_name,
        "accuracy": accuracy_score(gold, pred),
        "macro_f1": f1_score(gold, pred, average="macro"),
        "classification_report": classification_report(gold, pred, output_dict=True),
        "selective": {
            "coverage": len(selective_gold) / len(gold) if gold else 0,
            "abstained": abstained,
            "accuracy": accuracy_score(selective_gold, selective_pred) if selective_gold else None,
            "false_sufficient": false_sufficient,
            "high_risk_false_sufficient": high_risk_false_sufficient,
        },
        "rows": fold_rows,
        "feature_names": feature_names,
    }


def train_full_model(model_name, rows):
    X, y, _, feature_names = build_xy(rows)
    ros = RandomOverSampler(random_state=42)
    X_train, y_train = ros.fit_resample(X, y)
    clf = MODEL_BUILDERS[model_name]()
    clf.fit(X_train, y_train)
    return clf, feature_names


def load_baseline_metrics(task: str):
    path = TASK_BASELINES[task]
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        data = json.load(f)
    return {
        "accuracy": data.get("accuracy"),
        "macroF1": data.get("macroF1"),
        "falseSufficient": data.get("falseSufficient"),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", choices=["conflict", "sufficiency", "source_authority", "page_quality"], required=True)
    parser.add_argument("--input")
    parser.add_argument("--out-dir")
    args = parser.parse_args()

    input_path = args.input or TASK_INPUTS[args.task]
    out_dir = args.out_dir or os.path.join(".cache", "models", "emet-router", f"{args.task}-structured")
    metrics_path = os.path.join("metrics", "router", f"{args.task}-structured-models.json")

    rows = load_jsonl(input_path)
    baseline = load_baseline_metrics(args.task)

    reports = {
        model_name: evaluate_model(model_name, rows, args.task)
        for model_name in ["lr", "svc", "mlp"]
    }
    best_name = max(reports.keys(), key=lambda name: (reports[name]["macro_f1"], reports[name]["accuracy"]))
    best_model, feature_names = train_full_model(best_name, rows)

    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.dirname(metrics_path), exist_ok=True)
    joblib.dump(best_model, os.path.join(out_dir, "model.joblib"))
    with open(os.path.join(out_dir, "feature-names.json"), "w") as f:
        json.dump(feature_names, f, indent=2)
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump({"task": args.task, "bestModel": best_name, "rows": len(rows)}, f, indent=2)

    summary = {
        "task": args.task,
        "rows": len(rows),
        "baseline": baseline,
        "best_model": best_name,
        "promotion_gate": {
            "beats_baseline_macro_f1": baseline is None or reports[best_name]["macro_f1"] > (baseline.get("macroF1") or 0),
            "beats_baseline_accuracy": baseline is None or reports[best_name]["accuracy"] > (baseline.get("accuracy") or 0),
            "high_risk_false_sufficient_zero": reports[best_name]["selective"].get("high_risk_false_sufficient", 0) == 0,
        },
        "models": reports,
    }
    with open(metrics_path, "w") as f:
        json.dump(summary, f, indent=2)

    print(json.dumps({
        "task": args.task,
        "rows": len(rows),
        "baseline": baseline,
        "best_model": best_name,
        "best_accuracy": reports[best_name]["accuracy"],
        "best_macro_f1": reports[best_name]["macro_f1"],
        "lr_macro_f1": reports["lr"]["macro_f1"],
        "svc_macro_f1": reports["svc"]["macro_f1"],
        "mlp_macro_f1": reports["mlp"]["macro_f1"],
    }, indent=2))


if __name__ == "__main__":
    main()
