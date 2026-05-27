import json
import re
from collections import Counter

import numpy as np
from imblearn.over_sampling import RandomOverSampler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.svm import LinearSVC

from features import extract_query_understanding_features, load_embedding_model

TARGETS = ["query_shape", "answer_shape", "source_family", "recency_need", "ambiguity"]

CANONICAL_QUERY_SHAPES = {
    "short_fact",
    "explanation",
    "comparison",
    "howto",
    "troubleshooting",
    "ambiguous_factoid",
    "current_or_version_sensitive",
    "academic_review",
    "shopping_or_ecommerce",
    "legal_medical_finance_sensitive",
}

QUESTION_WORDS = {"who", "what", "when", "where", "why", "how", "which", "whose"}


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def query_shape_from_query(query: str) -> str:
    q = normalize_whitespace(query).lower()
    first = q.split(" ", 1)[0] if q else ""
    if re.search(r"\b(symptom|diagnosis|dosage|side effects?|treatment|medical|drug|medicine|disease|therapy|legal|law|regulation|gdpr|tax|contract|visa|immigration|compliance|policy|finance|financial|invest(?:ing|ment)?|loan|mortgage|insurance|retirement|credit score)\b", q):
        return "legal_medical_finance_sensitive"
    if re.search(r"\b(buy|price|pricing|cost|cheap|cheapest|deal|shop|under \$?\d+|under \d+|product review)\b", q):
        return "shopping_or_ecommerce"
    if re.search(r"\b(paper|papers|study|studies|survey|literature review|arxiv|doi|research|benchmark)\b", q):
        return "academic_review"
    if re.search(r"\b(error|errors|fix|debug|issue|issues|problem|problems|broken|fails?|failing|not working|stack trace|exception|why does)\b", q):
        return "troubleshooting"
    if re.search(r"\b(how to|how do i|guide|tutorial|walkthrough|setup|install|configure|migrate|upgrade)\b", q):
        return "howto"
    if re.search(r"\b(vs\.?|versus|compare|comparison|better than|difference between|pros and cons)\b", q):
        return "comparison"
    if re.search(r"\b(current|latest|today|right now|currently|status|outage|incident|release|changelog|pricing|202[4-9])\b", q):
        return "current_or_version_sensitive"
    if re.search(r"\b(it|they|them|this|that|these|those|he|she)\b", q) or (re.match(r"^(who|what|when|where)\b", q) and len(q.split()) <= 4):
        return "ambiguous_factoid"
    if first in {"who", "when", "where", "which"}:
        return "short_fact"
    if first in QUESTION_WORDS:
        return "short_fact"
    return "explanation"


def answer_shape_from_query_shape(query_shape: str) -> str:
    if query_shape == "comparison":
        return "comparison_table"
    if query_shape in {"howto", "troubleshooting"}:
        return "step_by_step"
    if query_shape in {"shopping_or_ecommerce", "ambiguous_factoid"}:
        return "list"
    if query_shape in {"academic_review", "legal_medical_finance_sensitive"}:
        return "citation_heavy"
    if query_shape in {"short_fact", "current_or_version_sensitive"}:
        return "short_answer"
    return "long_explanation"


def ambiguity_from_query_shape(query_shape: str, query: str) -> str:
    q = normalize_whitespace(query).lower()
    if query_shape == "ambiguous_factoid":
        return "high"
    if re.search(r"\b(vs\.?|versus|compare|comparison|or|either|which one|which is better|best)\b", q):
        return "medium"
    if len(q.split()) <= 3:
        return "medium"
    return "low"


def recency_need_from_query(query: str) -> str:
    q = normalize_whitespace(query).lower()
    if re.search(r"\b(today|right now|currently|current|latest|newest|this week|this month|status|outage|incident|price|pricing|release notes?|changelog|202[4-9])\b", q):
        return "required"
    if re.search(r"\b(best practices?|recommended|compatib(?:le|ility)|support(?:ed)?|migration|deprecat(?:ed|ion)|roadmap|benchmark|version)\b", q):
        return "helpful"
    return "none"


def source_family_from_query(query: str) -> str:
    q = normalize_whitespace(query).lower()
    if re.search(r"\b(paper|papers|study|studies|survey|literature review|arxiv|doi|research|benchmark)\b", q):
        return "academic"
    if re.search(r"\b(legal|law|regulation|gdpr|tax|policy|visa|immigration|government)\b", q):
        return "government_or_legal"
    if re.search(r"\b(symptom|diagnosis|dosage|side effects?|treatment|medical|drug|medicine|disease|therapy|security|cve|advisory|rfc|spec|standard)\b", q):
        return "primary_source"
    if re.search(r"\b(buy|price|pricing|cost|cheap|cheapest|deal|shop|product review|product)\b", q):
        return "product_or_ecommerce"
    if re.search(r"\b(github|readme|docs|documentation|api|reference|release notes?|changelog|version|npm|pypi|cargo)\b", q):
        return "official_docs"
    if re.search(r"\b(reddit|forum|stackoverflow|community|discourse)\b", q):
        return "community"
    if re.search(r"\b(news|headline|announced|launch|earnings)\b", q):
        return "recent_news"
    if re.match(r"^(who|what|when|where|which)\b", q):
        return "encyclopedia"
    return "general_web"


def simple_keyword_baseline(query: str):
    query_shape = "explanation"
    q = normalize_whitespace(query).lower()
    if re.search(r"\b(vs\.?|versus|compare|comparison)\b", q):
        query_shape = "comparison"
    elif re.search(r"\b(how to|guide|tutorial|steps?)\b", q):
        query_shape = "howto"
    elif re.search(r"\b(current|latest|today|status|release|changelog|202[4-9])\b", q):
        query_shape = "current_or_version_sensitive"
    elif re.search(r"\b(paper|research|arxiv|doi)\b", q):
        query_shape = "academic_review"
    elif re.match(r"^(who|when|where|which)\b", q):
        query_shape = "short_fact"

    return {
        "query_shape": query_shape,
        "answer_shape": answer_shape_from_query_shape(query_shape),
        "source_family": "academic" if query_shape == "academic_review" else ("official_docs" if re.search(r"\b(official|docs|documentation|api|reference)\b", q) else "general_web"),
        "recency_need": recency_need_from_query(query),
        "ambiguity": "high" if re.search(r"\b(or|it|they|them)\b", q) else "low",
    }


def normalized_labels_from_row(row: dict) -> dict:
    query = normalize_whitespace(row.get("query", ""))
    labels = dict(row.get("labels") or {})
    aux = dict(row.get("auxLabels") or {})

    query_shape = labels.get("query_shape") or aux.get("query_shape") or query_shape_from_query(query)
    if query_shape == "factoid":
        query_shape = "short_fact"
    elif query_shape == "keyword_or_topic":
        query_shape = query_shape_from_query(query)
    elif query_shape not in CANONICAL_QUERY_SHAPES:
        query_shape = query_shape_from_query(query)

    answer_shape = labels.get("answer_shape") or aux.get("answer_shape")
    if answer_shape == "long_answer_with_multiple_qa_pairs":
        answer_shape = "list"
    elif answer_shape in {"long_answer", "no_short_answer"}:
        answer_shape = "long_explanation"
    elif answer_shape not in {"short_answer", "list", "long_explanation", "step_by_step", "comparison_table", "citation_heavy"}:
        answer_shape = answer_shape_from_query_shape(query_shape)

    source_family = labels.get("source_family") or aux.get("source_family") or aux.get("expected_source_family")
    if source_family is None:
        source_family = source_family_from_query(query)
    elif source_family == "encyclopedia":
        source_family = "encyclopedia"
    elif source_family not in {"encyclopedia", "official_docs", "academic", "primary_source", "recent_news", "government_or_legal", "community", "product_or_ecommerce", "general_web"}:
        source_family = source_family_from_query(query)

    recency_need = labels.get("recency_need") or aux.get("recency_need") or recency_need_from_query(query)
    if recency_need not in {"none", "helpful", "required"}:
        recency_need = recency_need_from_query(query)

    ambiguity = labels.get("ambiguity") or aux.get("ambiguity")
    if ambiguity is None:
        if row.get("dataset") == "asqa":
            ambiguity = "high"
        else:
            ambiguity = ambiguity_from_query_shape(query_shape, query)
    if ambiguity not in {"low", "medium", "high"}:
        ambiguity = ambiguity_from_query_shape(query_shape, query)

    return {
        "query_shape": query_shape,
        "answer_shape": answer_shape,
        "source_family": source_family,
        "recency_need": recency_need,
        "ambiguity": ambiguity,
    }


def load_jsonl(paths):
    rows = []
    for path in paths:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                rows.append(json.loads(line))
    return rows


def build_feature_matrix(queries, modes, emb_model=None, show_progress_bar=False):
    if emb_model is None:
        emb_model = load_embedding_model()
    return extract_query_understanding_features(queries, modes, emb_model=emb_model, show_progress_bar=show_progress_bar)


def build_classifier(model_type: str):
    if model_type == "svc":
        base = LinearSVC(class_weight="balanced", dual=False, max_iter=5000, C=0.5)
        return CalibratedClassifierCV(base, method="sigmoid", cv=5)
    if model_type == "lr":
        return LogisticRegression(class_weight="balanced", max_iter=5000)
    raise ValueError(f"Unsupported model type: {model_type}")


def choose_threshold(y_true, pred_labels, confidences):
    thresholds = sorted({0.0, *[float(conf) for conf in confidences]})
    best = None
    for threshold in thresholds:
        accepted = [idx for idx, conf in enumerate(confidences) if float(conf) >= threshold]
        if not accepted:
            continue
        acc = accuracy_score([y_true[idx] for idx in accepted], [pred_labels[idx] for idx in accepted])
        coverage = len(accepted) / len(y_true)
        score = (coverage >= 0.70, acc, coverage, -threshold)
        if best is None or score > best[0]:
            best = (score, {
                "threshold": float(threshold),
                "coverage": float(coverage),
                "accuracy": float(acc),
            })
    return best[1] if best else {"threshold": 0.60, "coverage": 0.0, "accuracy": 0.0}


def fit_target(model_type: str, X_train, y_train):
    ros = RandomOverSampler(random_state=42)
    X_resampled, y_resampled = ros.fit_resample(X_train, y_train)
    clf = build_classifier(model_type)
    clf.fit(X_resampled, y_resampled)
    return clf, len(X_resampled)


def top_predictions(clf, X_eval):
    probs = clf.predict_proba(X_eval)
    idx = np.argmax(probs, axis=1)
    labels = clf.classes_[idx]
    confidences = probs[np.arange(len(idx)), idx]
    return labels, confidences, probs


def evaluate_predictions(y_true, y_pred):
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "support": int(len(y_true)),
    }


def evaluate_bundle(bundle: dict, rows: list, X_eval):
    merged_predictions = []
    raw_predictions = []
    baseline_predictions = []

    gold_by_target = {target: [] for target in TARGETS}
    merged_by_target = {target: [] for target in TARGETS}
    raw_by_target = {target: [] for target in TARGETS}
    baseline_by_target = {target: [] for target in TARGETS}

    for idx, row in enumerate(rows):
        query = normalize_whitespace(row.get("query", ""))
        labels = normalized_labels_from_row(row)
        baseline = simple_keyword_baseline(query)
        predicted = predict_bundle(bundle, X_eval[idx:idx + 1])[0]
        merged = {target: predicted.get(target) or labels_from_query(query).get(target) for target in TARGETS}
        raw = {target: predicted.get(target) for target in TARGETS}

        merged_predictions.append(merged)
        raw_predictions.append(raw)
        baseline_predictions.append(baseline)

        for target in TARGETS:
            gold_by_target[target].append(labels[target])
            merged_by_target[target].append(merged[target])
            raw_by_target[target].append(raw[target] or "<abstain>")
            baseline_by_target[target].append(baseline[target])

    def summarize(pred_map):
        per_target = {}
        macro = []
        for target in TARGETS:
            report = evaluate_predictions(gold_by_target[target], pred_map[target])
            per_target[target] = report
            macro.append(report["macro_f1"])
        return {
            "macro_f1": float(sum(macro) / len(macro)),
            "per_target": per_target,
        }

    return {
        "baseline": summarize(baseline_by_target),
        "merged": summarize(merged_by_target),
        "raw": summarize(raw_by_target),
    }


def labels_from_query(query: str) -> dict:
    query_shape = query_shape_from_query(query)
    return {
        "query_shape": query_shape,
        "answer_shape": answer_shape_from_query_shape(query_shape),
        "source_family": source_family_from_query(query),
        "recency_need": recency_need_from_query(query),
        "ambiguity": ambiguity_from_query_shape(query_shape, query),
    }


def train_bundle(model_type: str, train_rows: list, eval_rows: list, emb_model=None):
    queries_train = [normalize_whitespace(row.get("query", "")) for row in train_rows]
    modes_train = [row.get("mode", row.get("meta", {}).get("mode", "fast")) for row in train_rows]
    queries_eval = [normalize_whitespace(row.get("query", "")) for row in eval_rows]
    modes_eval = [row.get("mode", row.get("meta", {}).get("mode", "fast")) for row in eval_rows]

    X_train = build_feature_matrix(queries_train, modes_train, emb_model=emb_model, show_progress_bar=False)
    X_eval = build_feature_matrix(queries_eval, modes_eval, emb_model=emb_model, show_progress_bar=False)

    targets = {}
    metrics = {}

    for target in TARGETS:
        y_train = np.array([normalized_labels_from_row(row)[target] for row in train_rows])
        y_eval = np.array([normalized_labels_from_row(row)[target] for row in eval_rows])
        clf, resampled_size = fit_target(model_type, X_train, y_train)
        pred_labels, confidences, _ = top_predictions(clf, X_eval)
        threshold = choose_threshold(y_eval, pred_labels, confidences)
        accepted = [label if conf >= threshold["threshold"] else "<abstain>" for label, conf in zip(pred_labels, confidences)]
        metrics[target] = {
            "raw": evaluate_predictions(y_eval, pred_labels),
            "accepted": evaluate_predictions(y_eval, accepted),
            "threshold": threshold,
            "labels": [str(label) for label in clf.classes_],
            "train_support": dict(Counter(y_train)),
            "resampled_train_size": int(resampled_size),
        }
        targets[target] = {
            "model": clf,
            "threshold": float(threshold["threshold"]),
        }

    bundle = {
        "task": "query_understanding",
        "model_type": model_type,
        "targets": targets,
    }
    return bundle, metrics, X_eval


def predict_bundle(bundle: dict, features: np.ndarray):
    rows = []
    for row_idx in range(features.shape[0]):
        prediction = {}
        abstained = []
        confidence_values = []
        for target in TARGETS:
            target_bundle = bundle["targets"][target]
            labels, confidences, _ = top_predictions(target_bundle["model"], features[row_idx:row_idx + 1])
            label = str(labels[0])
            confidence = float(confidences[0])
            confidence_values.append(confidence)
            if confidence >= float(target_bundle.get("threshold", 0.60)):
                prediction[target] = label
            else:
                prediction[target] = None
                abstained.append(target)
            prediction.setdefault("confidences", {})[target] = confidence
            prediction.setdefault("predicted_labels", {})[target] = label
        prediction["acceptedAny"] = len(abstained) < len(TARGETS)
        prediction["abstainedLabels"] = abstained
        prediction["confidence"] = float(sum(confidence_values) / len(confidence_values)) if confidence_values else 0.0
        rows.append(prediction)
    return rows
