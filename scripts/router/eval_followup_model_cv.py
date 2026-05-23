import json
import os
import re
import sys
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import GroupKFold
from sklearn.svm import LinearSVC

sys.path.insert(0, os.path.join(os.getcwd(), 'ml', 'router'))
from features import load_embedding_model, extract_followup_features

GOLD_PATH = os.path.join('data', 'followup', 'gold-followup.jsonl')
DISTILL_PATH = os.path.join('data', 'followup', 'distill-train.jsonl')
OUT_PATH = os.path.join('metrics', 'router', 'followup-model-cv.json')


def normalize_query_group(query: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9\s]+', ' ', (query or '').lower())).strip()


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def build_xy(rows, emb_model):
    queries = [row['query'] for row in rows]
    modes = [row['mode'] for row in rows]
    conflicts = [row['conflict'] for row in rows]
    sources = [row['sources'] for row in rows]
    X = extract_followup_features(queries, modes, conflicts, sources, emb_model=emb_model, show_progress_bar=False)
    y = np.array([row['label'] for row in rows])
    groups = np.array([row.get('group') or normalize_query_group(row['query']) for row in rows])
    return X, y, groups


def train_classifier(X, y):
    base = LinearSVC(class_weight='balanced', dual=False, max_iter=5000, C=0.5)
    clf = CalibratedClassifierCV(base, method='sigmoid', cv=3)
    clf.fit(X, y)
    return clf


def main():
    gold = load_jsonl(GOLD_PATH)
    distill = load_jsonl(DISTILL_PATH)
    emb_model = load_embedding_model()
    X_gold, y_gold, groups = build_xy(gold, emb_model)

    splitter = GroupKFold(n_splits=min(5, len(set(groups))))
    gold_all, pred_all = [], []
    rows = []

    for fold, (train_idx, test_idx) in enumerate(splitter.split(X_gold, y_gold, groups), start=1):
        holdout_groups = set(groups[test_idx])
        train_rows = [row for row in distill if normalize_query_group(row['query']) not in holdout_groups]
        X_train, y_train, _ = build_xy(train_rows, emb_model)
        clf = train_classifier(X_train, y_train)
        probas = clf.predict_proba(X_gold[test_idx])
        preds = clf.classes_[np.argmax(probas, axis=1)]
        confs = np.max(probas, axis=1)

        for idx, pred, conf in zip(test_idx, preds, confs):
            gold_all.append(str(y_gold[idx]))
            pred_all.append(str(pred))
            rows.append({
                'fold': fold,
                'query': gold[idx]['query'],
                'group': groups[idx],
                'gold': str(y_gold[idx]),
                'pred': str(pred),
                'confidence': float(conf),
            })

    report = {
        'accuracy': accuracy_score(gold_all, pred_all),
        'classification_report': classification_report(gold_all, pred_all, output_dict=True),
        'rows': rows,
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w') as f:
        json.dump(report, f, indent=2)
    print(json.dumps({'accuracy': report['accuracy']}, indent=2))


if __name__ == '__main__':
    main()
