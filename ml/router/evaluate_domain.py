import json
import argparse
import numpy as np
import joblib
import os
from sklearn.metrics import classification_report, f1_score, confusion_matrix, accuracy_score

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--embeddings", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    # Load model
    print(f"Loading model from {args.model}")
    clf = joblib.load(args.model)
    
    # Load data
    data = np.load(args.embeddings)
    X = data["features"]
    y_true = data["labels"]
    
    # Evaluate
    y_pred = clf.predict(X)
    
    macro_f1 = f1_score(y_true, y_pred, average="macro", zero_division=0)
    accuracy = accuracy_score(y_true, y_pred)
    
    print("\nGold Validation Report:")
    print(classification_report(y_true, y_pred, zero_division=0))
    
    print(f"\nMacro-F1: {macro_f1:.4f}")
    
    # Extract high-risk misclassifications
    classes = clf.classes_
    high_risk_classes = ["security", "papers", "specs"]
    cm = confusion_matrix(y_true, y_pred, labels=classes)
    
    high_risk_errors = 0
    web_idx = np.where(classes == "web")[0]
    if len(web_idx) > 0:
        web_idx = web_idx[0]
        for hr_class in high_risk_classes:
            hr_idx = np.where(classes == hr_class)[0]
            if len(hr_idx) > 0:
                errors = cm[hr_idx[0], web_idx]
                if errors > 0:
                    print(f"HIGH RISK WARNING: {errors} '{hr_class}' queries routed to 'web'")
                    high_risk_errors += errors

    # Save artifacts
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    
    metrics = {
        "task": "domain",
        "eval_set_size": len(X),
        "macro_f1": macro_f1,
        "accuracy": accuracy,
        "high_risk_downgrades": int(high_risk_errors),
        "classes": classes.tolist()
    }
    with open(args.out, "w") as f:
        json.dump(metrics, f, indent=2)

if __name__ == "__main__":
    main()
