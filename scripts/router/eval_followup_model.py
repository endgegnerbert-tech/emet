import json
import os
import sys
import joblib
import numpy as np
from sklearn.metrics import accuracy_score, classification_report

sys.path.insert(0, os.path.join(os.getcwd(), 'ml', 'router'))
from features import load_embedding_model, extract_followup_features

DATA_PATH = os.path.join('data', 'followup', 'gold-followup.jsonl')
MODEL_PATH = os.path.join('.cache', 'models', 'pi-research-router', 'followup', 'model.joblib')
OUT_PATH = os.path.join('metrics', 'router', 'followup-model-gold.json')

rows = [json.loads(line) for line in open(DATA_PATH) if line.strip()]
emb = load_embedding_model()
clf = joblib.load(MODEL_PATH)
queries = [row['query'] for row in rows]
modes = [row['mode'] for row in rows]
conflicts = [row['conflict'] for row in rows]
sources = [row['sources'] for row in rows]
y = [row['label'] for row in rows]
X = extract_followup_features(queries, modes, conflicts, sources, emb_model=emb, show_progress_bar=False)
proba = clf.predict_proba(X)
classes = clf.classes_
preds = [str(classes[idx]) for idx in np.argmax(proba, axis=1)]
conf = [float(np.max(p)) for p in proba]
acc = accuracy_score(y, preds)
report = {
    'accuracy': acc,
    'classification_report': classification_report(y, preds, output_dict=True),
    'rows': [
        {
            'query': row['query'],
            'mode': row['mode'],
            'gold': gold,
            'pred': pred,
            'confidence': c,
        }
        for row, gold, pred, c in zip(rows, y, preds, conf)
    ]
}
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with open(OUT_PATH, 'w') as f:
    json.dump(report, f, indent=2)
print(json.dumps({'accuracy': acc}, indent=2))
