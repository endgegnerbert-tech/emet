import json
from collections import Counter

import numpy as np
from imblearn.over_sampling import RandomOverSampler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.svm import LinearSVC

from features import extract_query_understanding_features, load_embedding_model
from query_understanding import (
    TARGETS as QUERY_UNDERSTANDING_TARGETS,
    labels_from_query,
    normalize_whitespace,
    normalized_labels_from_row,
)

PREFLIGHT_TARGETS = ["domain", *QUERY_UNDERSTANDING_TARGETS]


def preflight_labels_from_row(row: dict) -> dict:
    labels = dict(row.get("labels") or {})
    out = {}
    domain = labels.get("domain") or row.get("label")
    if domain:
        out["domain"] = str(domain)

    query_labels = normalized_labels_from_row(row)
    for target in QUERY_UNDERSTANDING_TARGETS:
        if labels.get(target) or row.get("auxLabels") or target in labels:
            out[target] = query_labels[target]
        elif row.get("labels") and target in query_labels:
            out[target] = query_labels[target]
    return out


def has_target_label(row: dict, target: str) -> bool:
    return target in preflight_labels_from_row(row)


def build_feature_matrix(rows: list, emb_model=None, show_progress_bar=False):
    queries = [normalize_whitespace(row.get("query", "")) for row in rows]
    modes = [row.get("mode", row.get("meta", {}).get("mode", "fast")) for row in rows]
    return extract_query_understanding_features(queries, modes, emb_model=emb_model, show_progress_bar=show_progress_bar)


def build_classifier(model_type: str, target: str, min_class_count: int):
    if model_type == "hybrid" and target != "domain" and min_class_count >= 3:
        base = LinearSVC(class_weight="balanced", dual=False, max_iter=5000, C=0.5)
        return CalibratedClassifierCV(base, method="sigmoid", cv=min(3, min_class_count))
    if model_type in {"lr", "hybrid"}:
        return LogisticRegression(class_weight="balanced", max_iter=3000, solver="lbfgs")
    raise ValueError(f"Unsupported preflight model type: {model_type}")


def top_predictions(clf, X_eval):
    probs = clf.predict_proba(X_eval)
    idx = np.argmax(probs, axis=1)
    labels = clf.classes_[idx]
    confidences = probs[np.arange(len(idx)), idx]
    return labels, confidences


def choose_threshold(y_true, pred_labels, confidences, floor=0.35):
    thresholds = sorted({float(floor), *[float(conf) for conf in confidences]})
    best = None
    for threshold in thresholds:
        accepted = [idx for idx, conf in enumerate(confidences) if float(conf) >= threshold]
        if not accepted:
            continue
        acc = accuracy_score([y_true[idx] for idx in accepted], [pred_labels[idx] for idx in accepted])
        coverage = len(accepted) / len(y_true)
        score = (acc >= 0.80, coverage >= 0.50, acc, coverage, -threshold)
        if best is None or score > best[0]:
            best = (score, {
                "threshold": float(max(threshold, floor)),
                "coverage": float(coverage),
                "accuracy": float(acc),
            })
    return best[1] if best else {"threshold": float(floor), "coverage": 0.0, "accuracy": 0.0}


def evaluate_predictions(y_true, y_pred):
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)) if len(y_true) else 0.0,
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)) if len(y_true) else 0.0,
        "support": int(len(y_true)),
    }


def train_preflight_bundle(train_rows: list, holdout_rows_by_target: dict, model_type="lr", emb_model=None):
    if emb_model is None:
        emb_model = load_embedding_model()

    all_rows = list(train_rows)
    X_all = build_feature_matrix(all_rows, emb_model=emb_model, show_progress_bar=False)
    bundle_targets = {}
    target_metrics = {}

    for target in PREFLIGHT_TARGETS:
        train_indices = [idx for idx, row in enumerate(all_rows) if has_target_label(row, target)]
        if not train_indices:
            continue
        y_train = np.array([preflight_labels_from_row(all_rows[idx])[target] for idx in train_indices])
        support = Counter(y_train)
        if len(support) < 2:
            continue

        ros = RandomOverSampler(random_state=42)
        X_train, y_train_resampled = ros.fit_resample(X_all[train_indices], y_train)
        clf = build_classifier(model_type, target, min(support.values()))
        clf.fit(X_train, y_train_resampled)

        eval_rows = list(holdout_rows_by_target.get(target, []))
        metrics = {
            "train_support": dict(support),
            "train_rows": int(len(train_indices)),
            "resampled_train_rows": int(len(y_train_resampled)),
            "labels": [str(label) for label in clf.classes_],
        }
        threshold = {"threshold": 0.80 if target == "domain" else 0.60, "coverage": 0.0, "accuracy": 0.0}
        if eval_rows:
            X_eval = build_feature_matrix(eval_rows, emb_model=emb_model, show_progress_bar=False)
            y_eval = np.array([preflight_labels_from_row(row).get(target) for row in eval_rows])
            keep = np.array([label is not None for label in y_eval])
            X_eval = X_eval[keep]
            y_eval = y_eval[keep]
            if len(y_eval):
                pred_labels, confidences = top_predictions(clf, X_eval)
                threshold = choose_threshold(y_eval, pred_labels, confidences, floor=0.55 if target == "domain" else 0.45)
                accepted = [str(label) if float(conf) >= threshold["threshold"] else "<abstain>" for label, conf in zip(pred_labels, confidences)]
                metrics.update({
                    "raw": evaluate_predictions(y_eval, pred_labels),
                    "accepted": evaluate_predictions(y_eval, accepted),
                    "threshold": threshold,
                    "holdout_support": dict(Counter(y_eval)),
                })

        bundle_targets[target] = {
            "model": clf,
            "threshold": float(threshold["threshold"]),
        }
        target_metrics[target] = metrics

    return {
        "task": "preflight",
        "model_type": model_type,
        "targets": bundle_targets,
    }, target_metrics


def fallback_label(target: str, query: str):
    if target == "domain":
        return None
    return labels_from_query(query).get(target)


def predict_preflight_bundle(bundle: dict, features: np.ndarray, queries=None):
    queries = queries or [""] * features.shape[0]
    rows = []
    for row_idx in range(features.shape[0]):
        prediction = {"confidences": {}, "predictedLabels": {}, "abstainedLabels": []}
        confidence_values = []
        for target, target_bundle in bundle.get("targets", {}).items():
            labels, confidences = top_predictions(target_bundle["model"], features[row_idx:row_idx + 1])
            label = str(labels[0])
            confidence = float(confidences[0])
            threshold = float(target_bundle.get("threshold", 0.60))
            prediction["confidences"][target] = confidence
            prediction["predictedLabels"][target] = label
            confidence_values.append(confidence)
            if confidence >= threshold:
                prediction[target] = label
            else:
                prediction[target] = fallback_label(target, queries[row_idx])
                prediction["abstainedLabels"].append(target)
        prediction["acceptedAny"] = len(prediction["abstainedLabels"]) < len(bundle.get("targets", {}))
        prediction["confidence"] = float(sum(confidence_values) / len(confidence_values)) if confidence_values else 0.0
        rows.append(prediction)
    return rows


def metrics_summary(target_metrics: dict) -> dict:
    query_scores = []
    for target in QUERY_UNDERSTANDING_TARGETS:
        raw = target_metrics.get(target, {}).get("raw")
        if raw:
            query_scores.append(raw["macro_f1"])
    return {
        "domain_macro_f1": target_metrics.get("domain", {}).get("raw", {}).get("macro_f1"),
        "query_understanding_macro_f1": float(sum(query_scores) / len(query_scores)) if query_scores else None,
    }


def dumps_metrics(metrics: dict) -> str:
    return json.dumps(metrics, indent=2, sort_keys=True)
