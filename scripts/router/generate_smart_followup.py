import json
import os
import random

# Load real queries from cache to ground the text embeddings
queries = []
cache_path = os.path.join(".cache", "research-cache.json")
if os.path.exists(cache_path):
    with open(cache_path) as f:
        data = json.load(f)
        for entry in data.values():
            if entry.get("value", {}).get("query"):
                queries.append(entry["value"]["query"])

queries = list(set(queries))
if not queries:
    queries = ["latest react version", "docker compose tutorial", "is bun faster than node"]

examples = []

def add(q, mode, conflict, auth, forum, news, recent, count, label):
    examples.append({
        "query": q,
        "mode": mode,
        "conflict": conflict,
        "sources": {
            "has_authority": auth,
            "has_forum": forum,
            "has_news": news,
            "has_recent": recent,
            "source_count": count
        },
        "label": label
    })

for q in queries:
    is_academic = any(w in q.lower() for w in ["paper", "doi", "arxiv", "quantum", "research", "review"])
    is_recency = any(w in q.lower() for w in ["latest", "2024", "2025", "2026", "current", "release"])
    is_version = any(w in q.lower() for w in ["migration", "v1", "v2", "v3", "upgrade"])

    for mode in ["fast", "deep", "academic", "code"]:
        # 1. Severe conflict ALWAYS needs resolution
        add(q, mode, "severe", True, True, False, True, 5, "need_conflict_resolution")
        add(q, mode, "severe", False, True, True, True, 4, "need_conflict_resolution")
        
        # 2. Minor conflict resolution vs Authority
        add(q, mode, "minor", True, True, False, True, 4, "need_conflict_resolution")
        add(q, mode, "minor", False, True, False, True, 3, "need_authority")

        # 3. Academic mode
        if mode == "academic" or is_academic:
            add(q, mode, "none", True, False, False, True, 1, "need_more_sources")
            add(q, mode, "none", True, False, False, True, 4, "need_primary_source") # Needs DOI/Arxiv specifically
            add(q, mode, "none", False, True, False, True, 3, "need_primary_source")

        # 4. Deep mode requires depth (sources >= 3) and authority
        if mode == "deep":
            add(q, mode, "none", True, False, False, True, 1, "need_more_sources")
            add(q, mode, "none", True, False, False, True, 2, "need_more_sources")
            add(q, mode, "none", False, True, False, True, 4, "need_authority")
            add(q, mode, "none", True, True, False, True, 5, "stop")

        # 5. Fast mode is forgiving
        if mode == "fast" or mode == "code":
            add(q, mode, "none", True, False, False, True, 1, "stop")
            add(q, mode, "none", False, True, False, True, 2, "stop") # Fast mode accepts forum
            add(q, mode, "none", False, False, False, False, 0, "need_more_sources")

        # 6. Recency check
        if is_recency:
            add(q, mode, "none", True, False, False, False, 3, "need_recency")
            add(q, mode, "none", False, True, False, False, 3, "need_recency")
            add(q, mode, "none", True, False, False, True, 3, "stop")

        # 7. Version check
        if is_version:
            add(q, mode, "none", True, False, False, True, 2, "need_version_context")

os.makedirs("data/followup", exist_ok=True)
with open("data/followup/smart-train.jsonl", "w") as f:
    for ex in examples:
        f.write(json.dumps(ex) + "\n")

print(f"Generated {len(examples)} smart training examples from {len(queries)} base queries.")
