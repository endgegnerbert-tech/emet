import json
import argparse
import time
import numpy as np
import joblib
import os

sys_path_added = False
if not sys_path_added:
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    sys_path_added = True
    
from features import load_embedding_model, extract_domain_features

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--examples", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    print(f"Loading Model2Vec...")
    emb_model = load_embedding_model()
    
    print(f"Loading Classifier...")
    clf = joblib.load(f"{args.model_dir}/model.joblib")

    # Load a few queries to test
    queries = []
    with open(args.examples, "r") as f:
        for line in f:
            if not line.strip(): continue
            ex = json.loads(line)
            queries.append(ex["query"])
            
    # Warmup
    print("Warming up...")
    for q in queries[:10]:
        feats = extract_domain_features([q], ["fast"], emb_model=emb_model, show_progress_bar=False)
        clf.predict(feats)
        
    # Benchmark
    print(f"Benchmarking {len(queries)} queries sequentially...")
    latencies = []
    
    for q in queries:
        t0 = time.perf_counter()
        
        feats = extract_domain_features([q], ["fast"], emb_model=emb_model, show_progress_bar=False)
        pred = clf.predict(feats)[0]
        
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000) # ms

    latencies = np.array(latencies)
    p50 = np.percentile(latencies, 50)
    p95 = np.percentile(latencies, 95)
    mean = np.mean(latencies)
    
    print(f"p50: {p50:.2f} ms")
    print(f"p95: {p95:.2f} ms")
    print(f"Mean: {mean:.2f} ms")
    
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    
    metrics = {
        "task": "domain",
        "latency_ms": {
            "p50": p50,
            "p95": p95,
            "mean": mean,
            "samples": len(latencies)
        }
    }
    
    with open(args.out, "w") as f:
        json.dump(metrics, f, indent=2)

if __name__ == "__main__":
    main()
