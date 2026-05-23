import json
import argparse
import numpy as np
import joblib
from sklearn.svm import LinearSVC
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import classification_report, f1_score, confusion_matrix
import os

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--embeddings", required=True, nargs="+")
    parser.add_argument("--out", required=True)
    parser.add_argument("--model-type", choices=["svc", "lr"], default="svc")
    args = parser.parse_args()

    # Load all data files and combine
    X_list, y_list = [], []
    for emb_file in args.embeddings:
        data = np.load(emb_file)
        X_list.append(data["features"])
        y_list.append(data["labels"])
        
    X_train = np.vstack(X_list)
    y_train = np.hstack(y_list)

    print(f"Combined Train size: {len(X_train)}")
    
    from imblearn.over_sampling import RandomOverSampler
    ros = RandomOverSampler(random_state=42)
    X_res, y_res = ros.fit_resample(X_train, y_train)
    print(f"Size after OverSampling: {len(X_res)}")

    # Train model
    print(f"Training {args.model_type} with class_weight='balanced'...")
    if args.model_type == "svc":
        base_clf = LinearSVC(class_weight="balanced", dual=False, max_iter=5000, C=0.5)
        clf = CalibratedClassifierCV(base_clf, method="sigmoid", cv=5)
    else:
        clf = LogisticRegression(class_weight="balanced", max_iter=5000)
        
    clf.fit(X_res, y_res)

    # Save artifacts
    os.makedirs(args.out, exist_ok=True)
    model_path = os.path.join(args.out, "model.joblib")
    joblib.dump(clf, model_path)
    print(f"Model saved to {model_path}")
    
    # Save a small report to standard out
    preds = clf.predict(X_res)
    print("Train Report:")
    print(classification_report(y_res, preds))

if __name__ == "__main__":
    main()
