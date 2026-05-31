import json
import random

# We generate synthetic examples mapping (query, conflictState, sourceTypes, mode) -> Action

classes = [
    "stop",
    "need_authority",
    "need_conflict_resolution",
    "need_recency",
    "need_version_context",
    "need_primary_source",
    "need_more_sources"
]

examples = []

def add_ex(query, conflict, sources, mode, label, rationale=""):
    examples.append({
        "query": query,
        "conflict": conflict, # "none", "minor", "severe"
        "sources": sources, # dict of booleans like {"has_authority": True, "has_forum": False, "has_news": False}
        "mode": mode,
        "label": label,
        "rationale": rationale
    })

# 1. STOP - Everything is perfect
for q in ["how to run docker", "git checkout remote branch", "react hooks tutorial"]:
    add_ex(q, "none", {"has_authority": True, "has_forum": True}, "fast", "stop", "Has authority and no conflict")
    add_ex(q, "none", {"has_authority": True, "has_forum": False}, "deep", "stop", "Has authority and no conflict")

for q in ["what is the capital of france", "python list append"]:
    add_ex(q, "none", {"has_authority": False, "has_forum": True}, "fast", "stop", "Simple query, forum is enough")

# 2. NEED_AUTHORITY - Missing official docs for tech/factual
for q in ["kubernetes latest version", "docker network isolate container", "aws s3 bucket policy public"]:
    add_ex(q, "none", {"has_authority": False, "has_forum": True, "has_news": False}, "deep", "need_authority", "Deep mode needs official docs")
    add_ex(q, "minor", {"has_authority": False, "has_forum": True, "has_news": False}, "fast", "need_authority", "Minor conflict, need official docs to resolve")

# 3. NEED_CONFLICT_RESOLUTION - Severe conflict
for q in ["is bun faster than node", "best state management for react", "does diet coke cause cancer"]:
    add_ex(q, "severe", {"has_authority": True, "has_forum": True, "has_news": True}, "deep", "need_conflict_resolution", "Severe conflict needs resolution")
    add_ex(q, "severe", {"has_authority": False, "has_forum": True, "has_news": True}, "fast", "need_conflict_resolution", "Severe conflict needs resolution")

# 4. NEED_RECENCY - Dates or "latest" queries with old sources
for q in ["latest openai model release", "react 19 features", "who won the super bowl 2024"]:
    add_ex(q, "none", {"has_authority": True, "has_news": False, "is_outdated": True}, "deep", "need_recency", "Sources are outdated")
    add_ex(q, "none", {"has_authority": False, "has_news": True, "is_outdated": True}, "fast", "need_recency", "Sources are outdated")

# 5. NEED_VERSION_CONTEXT - Specific version but sources are generic
for q in ["webpack 4 to 5 migration", "python 2 to 3 diff", "angular 14 standalone components"]:
    add_ex(q, "none", {"has_authority": True, "missing_version": True}, "deep", "need_version_context", "Has docs but missing version")
    add_ex(q, "minor", {"has_authority": False, "missing_version": True}, "fast", "need_version_context", "Missing version context")

# 6. NEED_PRIMARY_SOURCE - Claims are made but no primary evidence
for q in ["openai board fires sam altman", "lk-99 superconductor truth", "apple vision pro reviews"]:
    add_ex(q, "minor", {"has_news": True, "has_authority": False, "has_primary": False}, "deep", "need_primary_source", "News is conflicting, need primary")
    add_ex(q, "none", {"has_forum": True, "has_authority": False, "has_primary": False}, "academic", "need_primary_source", "Academic mode needs primary source")

# 7. NEED_MORE_SOURCES - Too few sources
for q in ["how to build a nuclear reactor", "history of the roman empire", "complex system design patterns"]:
    add_ex(q, "none", {"has_authority": False, "source_count": 1}, "deep", "need_more_sources", "Deep mode with only 1 source")
    add_ex(q, "none", {"has_authority": False, "source_count": 0}, "fast", "need_more_sources", "No sources found")

# Let's generate a bunch more variations randomly to balance the classes
base_queries = {
    "tech_simple": ["install npm", "vim exit", "ubuntu update"],
    "tech_complex": ["k8s cluster config", "oauth2 PKCE flow", "rust lifetime elision"],
    "news": ["election results", "new apple event", "stock market crash"],
    "academic": ["transformer attention", "quantum computing", "climate change effects"],
    "opinion": ["best IDE for python", "mac vs pc", "is OOP dead"]
}

for i in range(100):
    for label in classes:
        q_type = random.choice(list(base_queries.keys()))
        q = random.choice(base_queries[q_type])

        mode = random.choice(["fast", "deep", "academic", "code"])

        if label == "stop":
            add_ex(q, "none", {"has_authority": True, "source_count": 3}, mode, label)
        elif label == "need_authority":
            add_ex(q, random.choice(["none", "minor"]), {"has_authority": False, "has_forum": True}, mode, label)
        elif label == "need_conflict_resolution":
            add_ex(q, "severe", {"has_authority": random.choice([True, False])}, mode, label)
        elif label == "need_recency":
            add_ex(q + " 2024", "none", {"is_outdated": True}, mode, label)
        elif label == "need_version_context":
            add_ex(q + " v15", "none", {"missing_version": True}, mode, label)
        elif label == "need_primary_source":
            add_ex(q, "minor", {"has_news": True, "has_primary": False}, "deep", label)
        elif label == "need_more_sources":
            add_ex(q, "none", {"source_count": 1}, "deep", label)

with open("data/followup/synthetic-train.jsonl", "w") as f:
    for ex in examples:
        f.write(json.dumps(ex) + "\n")

print(f"Generated {len(examples)} synthetic followup training examples.")
