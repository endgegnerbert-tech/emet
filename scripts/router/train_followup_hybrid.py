import json
import os
import sys
import joblib
import numpy as np
from collections import Counter
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import GroupKFold
from sklearn.svm import LinearSVC

sys.path.insert(0, os.path.join(os.getcwd(), "ml", "router"))
from features import load_embedding_model, extract_followup_features

INPUT_PATH = os.path.join("data", "followup", "gold-followup.jsonl")
MODEL_OUT = os.path.join(".cache", "models", "emet-router", "followup", "model.joblib")
METRICS_OUT = os.path.join("metrics", "router", "followup-hybrid-cv.json")
THRESHOLD_OUT = os.path.join(".cache", "models", "emet-router", "followup", "meta.json")


def is_academic_query(text: str) -> bool:
    text = (text or "").lower()
    return any(term in text for term in ["paper", "papers", "arxiv", "doi", "publisher", "survey", "review", "research"])


def strong_rule_action(query, mode, conflict, sources):
    text = (query or "").lower()
    source_count = int(sources.get("source_count", 0) or 0)
    has_authority = bool(sources.get("has_authority", False))
    has_recent = bool(sources.get("has_recent", False))
    is_recency = any(term in text for term in ["latest", "current", "today", "2024", "2025", "2026", "release", "changelog", "new"])

    if conflict == "severe":
        return "need_conflict_resolution"
    if conflict == "minor" and not (mode == "fast" and has_authority and source_count >= 5):
        return "need_conflict_resolution"
    if is_recency and not has_recent:
        return "need_recency"
    if not has_authority and source_count == 0:
        return "need_more_sources"
    return None


def fallback_heuristic(query, mode, conflict, sources):
    text = (query or "").lower()
    source_count = int(sources.get("source_count", 0) or 0)
    has_authority = bool(sources.get("has_authority", False))

    if mode == "academic" or is_academic_query(text):
        if is_academic_query(text):
            return "need_primary_source"
        if not has_authority:
            return "need_authority"
        if source_count < 4:
            return "need_more_sources"
        return "stop"

    if mode == "deep":
        if not has_authority:
            return "need_authority"
        if source_count <= 1:
            return "need_more_sources"
        if source_count < 3:
            return "need_more_sources"
        if source_count >= 4:
            return "stop"

    if mode in ["fast", "code"]:
        if has_authority and source_count >= 3:
            return "stop"
        if not has_authority and source_count == 0:
            return "need_more_sources"

    if not has_authority:
        return "need_authority"
    if source_count == 0:
        return "need_more_sources"
    return "stop"


def load_rows():
    rows = []
    with open(INPUT_PATH, "r") as f:
        for line in f:
            if not line.strip():
                continue
            rows.append(json.loads(line))
    return rows


def augment_rows(rows):
    augmented = []
    for row in rows:
        augmented.append({**row, "aug": "real"})
        query = row["query"]
        group = row["group"]
        mode = row["mode"]
        conflict = row["conflict"]
        sources = dict(row["sources"])

        # Query-anchored counterfactuals.
        if row["label"] == "stop":
            if sources.get("has_authority"):
                alt = dict(sources)
                alt["has_authority"] = False
                augmented.append({**row, "sources": alt, "label": "need_authority", "aug": "counterfactual:no_authority"})
            if mode == "academic" or is_academic_query(query):
                augmented.append({**row, "label": "need_primary_source", "aug": "counterfactual:primary_source"})
            if mode == "deep":
                alt = dict(sources)
                alt["source_count"] = max(1, min(2, int(alt.get("source_count", 1))))
                augmented.append({**row, "sources": alt, "label": "need_more_sources", "aug": "counterfactual:low_depth"})

        if row["label"] == "need_authority":
            alt = dict(sources)
            alt["has_authority"] = True
            alt["source_count"] = max(3, int(alt.get("source_count", 1)))
            stop_label = "need_primary_source" if (mode == "academic" or is_academic_query(query)) else "stop"
            augmented.append({**row, "sources": alt, "label": stop_label, "aug": "counterfactual:add_authority"})

        if row["label"] == "need_primary_source":
            if mode == "academic" or is_academic_query(query):
                alt = dict(sources)
                alt["source_count"] = max(4, int(alt.get("source_count", 3)))
                augmented.append({**row, "sources": alt, "label": "stop", "aug": "counterfactual:enough_primary"})

    return augmented


def build_xy(rows, emb_model):
    queries = [row["query"] for row in rows]
    modes = [row["mode"] for row in rows]
    conflicts = [row["conflict"] for row in rows]
    sources_list = [row["sources"] for row in rows]
    X = extract_followup_features(queries, modes, conflicts, sources_list, emb_model=emb_model, show_progress_bar=False)
    y = np.array([row["label"] for row in rows])
    groups = np.array([row["group"] for row in rows])
    return X, y, groups


def train_classifier(X, y):
    base = LinearSVC(class_weight="balanced", dual=False, max_iter=5000, C=0.5)
    clf = CalibratedClassifierCV(base, method="sigmoid", cv=3)
    clf.fit(X, y)
    return clf


def evaluate(real_rows, augmented_rows, emb_model, confidence_threshold=0.75):
    real_groups = np.array([row["group"] for row in real_rows])
    unique_groups = np.unique(real_groups)
    n_splits = min(5, len(unique_groups))
    splitter = GroupKFold(n_splits=n_splits)

    gold = []
    pred_model = []
    pred_hybrid = []
    fold_rows = []

    for fold, (train_idx, test_idx) in enumerate(splitter.split(real_rows, groups=real_groups), start=1):
        test_groups = set(real_groups[test_idx])
        train_rows = [row for row in augmented_rows if row["group"] not in test_groups]
        test_rows = [real_rows[i] for i in test_idx]

        X_train, y_train, _ = build_xy(train_rows, emb_model)
        clf = train_classifier(X_train, y_train)

        X_test, y_test, _ = build_xy(test_rows, emb_model)
        probas = clf.predict_proba(X_test)
        classes = clf.classes_
        model_preds = classes[np.argmax(probas, axis=1)]
        confidences = np.max(probas, axis=1)

        for row, gold_label, model_label, conf in zip(test_rows, y_test, model_preds, confidences):
            strong = strong_rule_action(row["query"], row["mode"], row["conflict"], row["sources"])
            if strong:
                hybrid = strong
            elif conf >= confidence_threshold:
                hybrid = str(model_label)
            else:
                hybrid = fallback_heuristic(row["query"], row["mode"], row["conflict"], row["sources"])

            gold.append(str(gold_label))
            pred_model.append(str(model_label))
            pred_hybrid.append(str(hybrid))
            fold_rows.append({
                "fold": fold,
                "query": row["query"],
                "mode": row["mode"],
                "gold": str(gold_label),
                "model": str(model_label),
                "hybrid": str(hybrid),
                "confidence": float(conf),
            })

    return {
        "model_accuracy": accuracy_score(gold, pred_model),
        "hybrid_accuracy": accuracy_score(gold, pred_hybrid),
        "gold": gold,
        "pred_model": pred_model,
        "pred_hybrid": pred_hybrid,
        "rows": fold_rows,
    }


def main():
    os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(METRICS_OUT), exist_ok=True)

    real_rows = load_rows()
    augmented_rows = augment_rows(real_rows)
    emb_model = load_embedding_model()

    metrics = evaluate(real_rows, augmented_rows, emb_model)

    X_train, y_train, _ = build_xy(augmented_rows, emb_model)
    clf = train_classifier(X_train, y_train)
    joblib.dump(clf, MODEL_OUT)
    with open(THRESHOLD_OUT, "w") as f:
        json.dump({"confidenceThreshold": 0.75}, f, indent=2)

    report = {
        "real_rows": len(real_rows),
        "augmented_rows": len(augmented_rows),
        "label_counts": Counter(row["label"] for row in real_rows),
        "aug_label_counts": Counter(row["label"] for row in augmented_rows),
        "model_accuracy": metrics["model_accuracy"],
        "hybrid_accuracy": metrics["hybrid_accuracy"],
        "classification_report_model": classification_report(metrics["gold"], metrics["pred_model"], output_dict=True),
        "classification_report_hybrid": classification_report(metrics["gold"], metrics["pred_hybrid"], output_dict=True),
        "rows": metrics["rows"],
    }

    with open(METRICS_OUT, "w") as f:
        json.dump(report, f, indent=2)

    print(json.dumps({
        "real_rows": report["real_rows"],
        "augmented_rows": report["augmented_rows"],
        "model_accuracy": report["model_accuracy"],
        "hybrid_accuracy": report["hybrid_accuracy"],
        "label_counts": report["label_counts"],
    }, indent=2))


if __name__ == "__main__":
    main()
