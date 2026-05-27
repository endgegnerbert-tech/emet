import argparse
import json
import os
from collections import Counter

import joblib
import numpy as np
from imblearn.over_sampling import RandomOverSampler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.svm import LinearSVC

HIGH_RISK_CLASSES = {"security", "papers", "specs", "changelog", "medical", "legal", "finance", "trading", "standards"}
PRECISION_TARGETS = (0.95, 0.90, 0.85)
MIN_DEFAULT_THRESHOLD = 0.35
MIN_HIGH_RISK_THRESHOLD = 0.55


def load_embeddings(paths):
    features, labels = [], []
    for path in paths:
        data = np.load(path)
        features.append(data["features"])
        labels.append(data["labels"])
    return np.vstack(features), np.hstack(labels)


def build_classifier(model_type):
    if model_type == "svc":
        base = LinearSVC(class_weight="balanced", dual=False, max_iter=5000, C=0.5)
        return CalibratedClassifierCV(base, method="sigmoid", cv=5)
    if model_type == "lr":
        return LogisticRegression(class_weight="balanced", max_iter=5000)
    raise ValueError(f"Unsupported model_type: {model_type}")


def train_classifier(model_type, X_train, y_train):
    ros = RandomOverSampler(random_state=42)
    X_resampled, y_resampled = ros.fit_resample(X_train, y_train)
    clf = build_classifier(model_type)
    clf.fit(X_resampled, y_resampled)
    return clf, len(X_resampled)


def evaluate_classifier(clf, X_eval, y_eval):
    probs = clf.predict_proba(X_eval)
    pred_idx = np.argmax(probs, axis=1)
    preds = clf.classes_[pred_idx]
    confs = np.max(probs, axis=1)
    accuracy = accuracy_score(y_eval, preds)
    macro_f1 = f1_score(y_eval, preds, average="macro", zero_division=0)

    high_risk_downgrades = 0
    for gold, pred in zip(y_eval, preds):
        if gold in HIGH_RISK_CLASSES and pred == "web":
            high_risk_downgrades += 1

    return {
        "accuracy": float(accuracy),
        "macro_f1": float(macro_f1),
        "high_risk_downgrades": int(high_risk_downgrades),
        "preds": preds,
        "confs": confs,
    }


def derive_threshold_for_label(label, y_true, preds, confs):
    candidate_thresholds = sorted({0.0, *[float(conf) for pred, conf in zip(preds, confs) if pred == label]})
    best = None
    floor = MIN_HIGH_RISK_THRESHOLD if label in HIGH_RISK_CLASSES else MIN_DEFAULT_THRESHOLD

    gold_support = sum(1 for gold in y_true if gold == label)
    for target_precision in PRECISION_TARGETS:
        for threshold in candidate_thresholds:
            accepted = [i for i, (pred, conf) in enumerate(zip(preds, confs)) if pred == label and conf >= threshold]
            if not accepted:
                continue
            tp = sum(1 for i in accepted if y_true[i] == label)
            fp = len(accepted) - tp
            precision = tp / len(accepted)
            recall = tp / gold_support if gold_support else 0.0
            score = (precision >= target_precision, recall, precision, -threshold)
            if best is None or score > best[0]:
                best = (score, {
                    "threshold": float(threshold),
                    "precision": float(precision),
                    "recall": float(recall),
                    "accepted": len(accepted),
                    "tp": int(tp),
                    "fp": int(fp),
                    "target_precision": float(target_precision),
                })
        if best and best[0][0]:
            best[1]["threshold"] = max(float(best[1]["threshold"]), floor)
            return best[1]

    if best:
        best[1]["threshold"] = max(float(best[1]["threshold"]), floor)
        return best[1]
    return {
        "threshold": 0.75 if label in HIGH_RISK_CLASSES else 0.80,
        "precision": 0.0,
        "recall": 0.0,
        "accepted": 0,
        "tp": 0,
        "fp": 0,
        "target_precision": PRECISION_TARGETS[-1],
    }


def derive_calibration(clf, X_eval, y_eval):
    evaluation = evaluate_classifier(clf, X_eval, y_eval)
    preds = evaluation["preds"]
    confs = evaluation["confs"]
    thresholds = {}
    diagnostics = {}

    for label in clf.classes_:
        diag = derive_threshold_for_label(label, y_eval, preds, confs)
        thresholds[str(label)] = float(diag["threshold"])
        diagnostics[str(label)] = diag

    return {
        "defaultThreshold": 0.80,
        "highRiskThreshold": 0.75,
        "domainThresholds": thresholds,
        "diagnostics": diagnostics,
    }


def choose_best_report(reports):
    return max(
        reports,
        key=lambda item: (-item["metrics"]["high_risk_downgrades"], item["metrics"]["accuracy"], item["metrics"]["macro_f1"], item["model_type"]),
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--embeddings", required=True, nargs="+")
    parser.add_argument("--gold-embeddings")
    parser.add_argument("--out", required=True)
    parser.add_argument("--model-type", choices=["svc", "lr", "auto"], default="auto")
    args = parser.parse_args()

    X_train, y_train = load_embeddings(args.embeddings)
    print(f"Combined Train size: {len(X_train)}")
    print(f"Train label distribution: {dict(Counter(y_train))}")

    candidate_model_types = [args.model_type] if args.model_type != "auto" else ["svc", "lr"]
    gold_data = load_embeddings([args.gold_embeddings]) if args.gold_embeddings else None

    reports = []
    for model_type in candidate_model_types:
        print(f"Training {model_type} with class_weight='balanced'...")
        clf, resampled_size = train_classifier(model_type, X_train, y_train)
        report = {
            "model_type": model_type,
            "clf": clf,
            "resampled_size": resampled_size,
        }
        if gold_data:
            X_gold, y_gold = gold_data
            report["metrics"] = evaluate_classifier(clf, X_gold, y_gold)
            report["calibration"] = derive_calibration(clf, X_gold, y_gold)
            print(json.dumps({
                "model_type": model_type,
                "accuracy": report["metrics"]["accuracy"],
                "macro_f1": report["metrics"]["macro_f1"],
                "high_risk_downgrades": report["metrics"]["high_risk_downgrades"],
            }, indent=2))
        reports.append(report)

    best = reports[0] if len(reports) == 1 or not gold_data else choose_best_report(reports)
    print(f"Selected model: {best['model_type']}")

    os.makedirs(args.out, exist_ok=True)
    model_path = os.path.join(args.out, "model.joblib")
    joblib.dump(best["clf"], model_path)
    print(f"Model saved to {model_path}")

    meta = {
        "modelType": best["model_type"],
        "trainSize": int(len(X_train)),
        "resampledTrainSize": int(best["resampled_size"]),
    }
    with open(os.path.join(args.out, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    if best.get("calibration"):
        with open(os.path.join(args.out, "calibration.json"), "w") as f:
            json.dump(best["calibration"], f, indent=2)

    if best.get("metrics"):
        metrics = {
            "task": "domain",
            "modelType": best["model_type"],
            "accuracy": best["metrics"]["accuracy"],
            "macro_f1": best["metrics"]["macro_f1"],
            "high_risk_downgrades": best["metrics"]["high_risk_downgrades"],
            "classes": [str(label) for label in best["clf"].classes_],
        }
        with open(os.path.join(args.out, "metrics.json"), "w") as f:
            json.dump(metrics, f, indent=2)


if __name__ == "__main__":
    main()
