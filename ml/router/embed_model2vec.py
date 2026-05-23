import json
import argparse
import numpy as np
from features import load_embedding_model, extract_domain_features, extract_followup_features

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", default="minishlab/potion-base-8M")
    parser.add_argument("--task", default="domain")
    args = parser.parse_args()

    examples = []
    with open(args.input, "r") as f:
        for line in f:
            if not line.strip(): continue
            ex = json.loads(line)
            if "task" not in ex or ex["task"] == args.task:
                examples.append(ex)
    
    print(f"Loaded {len(examples)} examples for task '{args.task}'")
    
    print(f"Loading StaticModel: {args.model}")
    model = load_embedding_model()
    
    queries = [ex["query"] for ex in examples]
    modes = [ex.get("mode", ex.get("meta", {}).get("mode", "fast")) for ex in examples]
    
    if args.task == "domain":
        print(f"Encoding {len(queries)} queries for domain routing...")
        features = extract_domain_features(queries, modes, emb_model=model, show_progress_bar=True)
    elif args.task == "followup":
        print(f"Encoding {len(queries)} queries for followup action...")
        conflicts = [ex.get("conflict", "none") for ex in examples]
        sources_list = [ex.get("sources", {}) for ex in examples]
        features = extract_followup_features(queries, modes, conflicts, sources_list, emb_model=model, show_progress_bar=True)
    else:
        raise ValueError(f"Unknown task: {args.task}")
    
    ids = np.array([ex.get("id", str(i)) for i, ex in enumerate(examples)])
    labels = np.array([ex["label"] for ex in examples])
    
    print(f"Saving features shape {features.shape} to {args.out}")
    np.savez(args.out, features=features, ids=ids, labels=labels)

if __name__ == "__main__":
    main()
