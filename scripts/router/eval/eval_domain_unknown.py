import argparse
import json
import os
import sys

import joblib
import numpy as np

sys.path.insert(0, os.getcwd())
from ml.router.features import load_embedding_model, extract_domain_features


def load_jsonl(path):
    with open(path, "r") as f:
        return [json.loads(line) for line in f if line.strip()]


def load_calibration(model_dir):
    path = f"{model_dir}/calibration.json"
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"defaultThreshold": 0.80, "highRiskThreshold": 0.75, "domainThresholds": {}}


def threshold_for(label, calibration):
    if label in calibration.get("domainThresholds", {}):
        return float(calibration["domainThresholds"][label])
    if label in {"security", "papers", "specs"}:
        return float(calibration.get("highRiskThreshold", 0.75))
    return float(calibration.get("defaultThreshold", 0.80))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--out")
    args = parser.parse_args()

    rows = load_jsonl(args.input)
    model = joblib.load(f"{args.model_dir}/model.joblib")
    calibration = load_calibration(args.model_dir)
    emb = load_embedding_model()

    queries = [row["query"] for row in rows]
    modes = [row.get("mode", "fast") for row in rows]
    X = extract_domain_features(queries, modes, emb_model=emb, show_progress_bar=False)
    probs = model.predict_proba(X)

    results = []
    accepted = 0
    correct = 0
    accepted_correct = 0
    for row, prob in zip(rows, probs):
        idx = int(np.argmax(prob))
        predicted = str(model.classes_[idx])
        confidence = float(prob[idx])
        expected = row.get("label")
        threshold = threshold_for(predicted, calibration)
        accepted_flag = confidence >= threshold
        if accepted_flag:
            accepted += 1
        if expected and predicted == expected:
            correct += 1
            if accepted_flag:
                accepted_correct += 1
        results.append({
            "query": row["query"],
            "expected": expected,
            "predicted": predicted,
            "confidence": confidence,
            "threshold": threshold,
            "accepted": accepted_flag,
            "correct": None if expected is None else predicted == expected,
        })

    summary = {
        "rows": len(results),
        "accuracy": None if not any(row.get("label") for row in rows) else correct / len(results),
        "accepted": accepted,
        "accepted_rate": accepted / len(results) if results else 0,
        "accepted_correct": accepted_correct,
        "calibration": calibration,
        "results": results,
    }

    print(json.dumps(summary, indent=2))
    if args.out:
        with open(args.out, "w") as f:
            json.dump(summary, f, indent=2)


if __name__ == "__main__":
    main()
