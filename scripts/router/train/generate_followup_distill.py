import json
import os

CACHE_PATH = os.path.join('.cache', 'research-cache.json')
OUT_PATH = os.path.join('data', 'followup', 'distill-train.jsonl')


def classify(query, mode, conflict, sources):
    text = (query or '').lower()
    source_count = int(sources.get('source_count', 0) or 0)
    has_authority = bool(sources.get('has_authority', False))
    has_recent = bool(sources.get('has_recent', False))
    is_academic_query = any(term in text for term in ['paper', 'papers', 'arxiv', 'doi', 'publisher', 'survey', 'review', 'research'])
    is_recency_query = any(term in text for term in ['latest', 'current', 'today', 'release', 'changelog', 'new'])

    if conflict == 'severe':
        return 'need_conflict_resolution'
    if conflict == 'minor' and not (mode == 'fast' and has_authority and source_count >= 4):
        return 'need_conflict_resolution'

    if mode in ['fast', 'code']:
        if has_authority and source_count >= 3:
            return 'stop'
        if source_count >= 3 and conflict == 'none':
            return 'stop'
    if is_recency_query and not has_recent:
        return 'need_recency'

    if mode == 'academic' or is_academic_query:
        if is_academic_query:
            return 'need_primary_source'
        if not has_authority:
            return 'need_authority'
        if source_count < 4:
            return 'need_more_sources'
        return 'stop'

    if mode == 'deep':
        if not has_authority:
            return 'need_authority'
        if source_count <= 1:
            return 'need_more_sources'
        if source_count < 3:
            return 'need_more_sources'
        if source_count >= 4:
            return 'stop'
        return 'stop'

    if mode in ['fast', 'code']:
        if has_authority and source_count >= 1:
            return 'stop'
        if not has_authority and source_count == 0:
            return 'need_more_sources'
        if source_count >= 3:
            return 'stop'
        return 'stop'

    if not has_authority:
        return 'need_authority'
    if source_count == 0:
        return 'need_more_sources'
    return 'stop'


queries = []
if os.path.exists(CACHE_PATH):
    with open(CACHE_PATH) as f:
        data = json.load(f)
        for entry in data.values():
            q = entry.get('value', {}).get('query')
            if q:
                queries.append(q)
queries = sorted(set(queries))

examples = []
source_patterns = [
    {'has_authority': True, 'has_forum': False, 'has_news': False, 'has_recent': False, 'source_count': 1},
    {'has_authority': True, 'has_forum': False, 'has_news': False, 'has_recent': False, 'source_count': 2},
    {'has_authority': True, 'has_forum': False, 'has_news': False, 'has_recent': False, 'source_count': 3},
    {'has_authority': True, 'has_forum': False, 'has_news': False, 'has_recent': True, 'source_count': 4},
    {'has_authority': False, 'has_forum': True, 'has_news': False, 'has_recent': False, 'source_count': 0},
    {'has_authority': False, 'has_forum': True, 'has_news': False, 'has_recent': False, 'source_count': 2},
    {'has_authority': False, 'has_forum': False, 'has_news': True, 'has_recent': False, 'source_count': 3},
    {'has_authority': False, 'has_forum': False, 'has_news': True, 'has_recent': True, 'source_count': 3},
    {'has_authority': True, 'has_forum': False, 'has_news': True, 'has_recent': False, 'source_count': 4},
]
conflicts = ['none', 'minor', 'severe']

for query in queries:
    for mode in ['fast', 'deep', 'academic', 'code']:
        for conflict in conflicts:
            for sources in source_patterns:
                label = classify(query, mode, conflict, sources)
                examples.append({
                    'query': query,
                    'mode': mode,
                    'conflict': conflict,
                    'sources': sources,
                    'label': label,
                })

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with open(OUT_PATH, 'w') as f:
    for ex in examples:
        f.write(json.dumps(ex) + '\n')

print(f'Generated {len(examples)} distillation examples from {len(queries)} real queries.')
