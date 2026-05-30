import sys
import json
import logging
import joblib
import numpy as np
import traceback
import os

# Add the directory containing features.py to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import load_embedding_model, extract_domain_features, extract_followup_features, extract_query_understanding_features
from query_understanding import predict_bundle

logging.basicConfig(level=logging.ERROR)


def load_model(path):
    return joblib.load(path) if os.path.exists(path) else None


def load_feature_names(path):
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def predict_proba_like(clf, features):
    if hasattr(clf, "predict_proba"):
        proba = clf.predict_proba(features)[0]
        max_idx = int(np.argmax(proba))
        return clf.classes_[max_idx], float(proba[max_idx])

    pred = clf.predict(features)[0]
    return pred, 1.0


def vectorize_structured_features(feature_names, features):
    row = [float(features.get(name, 0.0)) for name in feature_names]
    return np.array([row], dtype=np.float32)


def align_feature_count(clf, features):
    """Keep runtime backward-compatible with older promoted model snapshots."""
    expected = getattr(clf, "n_features_in_", None)
    if expected is None or features.shape[1] == expected:
        return features
    if features.shape[1] > expected:
        return features[:, :expected]
    pad = np.zeros((features.shape[0], expected - features.shape[1]), dtype=features.dtype)
    return np.hstack([features, pad])


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing model path"}))
        sys.exit(1)

    model_dir = sys.argv[1]

    try:
        emb_model = load_embedding_model()
        domain_clf = load_model(os.path.join(model_dir, "domain", "model.joblib"))
        followup_clf = load_model(os.path.join(model_dir, "followup", "model.joblib"))
        query_understanding_clf = load_model(os.path.join(model_dir, "query-understanding", "model.joblib"))
        conflict_clf = load_model(os.path.join(model_dir, "conflict-structured", "model.joblib"))
        sufficiency_clf = load_model(os.path.join(model_dir, "sufficiency-structured", "model.joblib"))
        conflict_feature_names = load_feature_names(os.path.join(model_dir, "conflict-structured", "feature-names.json"))
        sufficiency_feature_names = load_feature_names(os.path.join(model_dir, "sufficiency-structured", "feature-names.json"))
    except Exception as e:
        print(json.dumps({"error": f"Failed to load models: {str(e)}"}))
        sys.exit(1)

    print("READY", flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
            req_id = req.get("id")
            task = req.get("task", "domain")
            query = req.get("query", "")
            mode = req.get("mode", "fast")

            if task == "domain":
                if not domain_clf:
                    print(json.dumps({"id": req_id, "error": "Domain model not loaded"}), flush=True)
                    continue

                feats = extract_domain_features([query], [mode], emb_model=emb_model, show_progress_bar=False)
                pred, confidence = predict_proba_like(domain_clf, feats)

                print(json.dumps({
                    "id": req_id,
                    "domain": str(pred),
                    "confidence": confidence
                }), flush=True)

            elif task == "followup":
                if not followup_clf:
                    print(json.dumps({"id": req_id, "error": "Followup model not loaded"}), flush=True)
                    continue

                conflict = req.get("conflict", "none")
                sources = req.get("sources", {})

                feats = extract_followup_features([query], [mode], [conflict], [sources], emb_model=emb_model, show_progress_bar=False)
                feats = align_feature_count(followup_clf, feats)
                pred, confidence = predict_proba_like(followup_clf, feats)

                print(json.dumps({
                    "id": req_id,
                    "action": str(pred),
                    "confidence": confidence
                }), flush=True)

            elif task == "query_understanding":
                if not query_understanding_clf:
                    print(json.dumps({"id": req_id, "error": "Query-understanding model not loaded"}), flush=True)
                    continue

                feats = extract_query_understanding_features([query], [mode], emb_model=emb_model, show_progress_bar=False)
                prediction = predict_bundle(query_understanding_clf, feats)[0]
                print(json.dumps({
                    "id": req_id,
                    "query_shape": prediction.get("query_shape"),
                    "answer_shape": prediction.get("answer_shape"),
                    "source_family": prediction.get("source_family"),
                    "recency_need": prediction.get("recency_need"),
                    "ambiguity": prediction.get("ambiguity"),
                    "confidence": prediction.get("confidence", 0.0),
                    "abstainedLabels": prediction.get("abstainedLabels", []),
                    "confidences": prediction.get("confidences", {}),
                    "predictedLabels": prediction.get("predicted_labels", {}),
                }), flush=True)

            elif task == "conflict":
                if not conflict_clf or not conflict_feature_names:
                    print(json.dumps({"id": req_id, "error": "Conflict model not loaded"}), flush=True)
                    continue

                feats = vectorize_structured_features(conflict_feature_names, req.get("features", {}))
                pred, confidence = predict_proba_like(conflict_clf, feats)
                print(json.dumps({
                    "id": req_id,
                    "decision": str(pred),
                    "confidence": confidence
                }), flush=True)

            elif task == "sufficiency":
                if not sufficiency_clf or not sufficiency_feature_names:
                    print(json.dumps({"id": req_id, "error": "Sufficiency model not loaded"}), flush=True)
                    continue

                feats = vectorize_structured_features(sufficiency_feature_names, req.get("features", {}))
                pred, confidence = predict_proba_like(sufficiency_clf, feats)
                print(json.dumps({
                    "id": req_id,
                    "decision": str(pred),
                    "confidence": confidence
                }), flush=True)

            elif task == "source_authority":
                model_path = os.path.join(model_dir, "source_authority-structured", "model.joblib")
                feature_names_path = os.path.join(model_dir, "source_authority-structured", "feature-names.json")
                if not os.path.exists(model_path) or not os.path.exists(feature_names_path):
                    print(json.dumps({"id": req_id, "error": "Source authority model not loaded"}), flush=True)
                    continue

                clf = load_model(model_path)
                f_names = load_feature_names(feature_names_path)
                feats = vectorize_structured_features(f_names, req.get("features", {}))
                pred, confidence = predict_proba_like(clf, feats)
                print(json.dumps({
                    "id": req_id,
                    "decision": str(pred),
                    "confidence": confidence
                }), flush=True)

            elif task == "page_quality":
                model_path = os.path.join(model_dir, "page_quality-structured", "model.joblib")
                feature_names_path = os.path.join(model_dir, "page_quality-structured", "feature-names.json")
                if not os.path.exists(model_path) or not os.path.exists(feature_names_path):
                    print(json.dumps({"id": req_id, "error": "Page quality model not loaded"}), flush=True)
                    continue

                clf = load_model(model_path)
                f_names = load_feature_names(feature_names_path)
                feats = vectorize_structured_features(f_names, req.get("features", {}))
                pred, confidence = predict_proba_like(clf, feats)
                print(json.dumps({
                    "id": req_id,
                    "decision": str(pred),
                    "confidence": confidence
                }), flush=True)

            else:
                print(json.dumps({"id": req_id, "error": f"Unknown task: {task}"}), flush=True)

        except Exception as e:
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}), flush=True)


if __name__ == "__main__":
    main()
