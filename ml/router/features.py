import re

import numpy as np
from model2vec import StaticModel

EMBEDDING_MODEL_NAME = "minishlab/potion-base-8M"

def load_embedding_model() -> StaticModel:
    """Loads the base static model for feature extraction."""
    return StaticModel.from_pretrained(EMBEDDING_MODEL_NAME)

def encode_modes(modes: list) -> np.ndarray:
    """Encodes a list of mode strings into a one-hot float32 numpy array."""
    encoded = []
    for mode in modes:
        encoded.append([
            1.0 if mode == "fast" else 0.0,
            1.0 if mode == "deep" else 0.0,
            1.0 if mode == "academic" else 0.0,
            1.0 if mode == "code" else 0.0,
        ])
    return np.array(encoded, dtype=np.float32)

def extract_domain_features(queries: list, modes: list, emb_model: StaticModel = None, show_progress_bar: bool = False) -> np.ndarray:
    """Extracts the combined feature vector (text embeddings + one-hot mode) for domain routing."""
    if emb_model is None:
        emb_model = load_embedding_model()
        
    emb = emb_model.encode(queries, show_progress_bar=show_progress_bar)
    modes_np = encode_modes(modes)
    return np.hstack([emb, modes_np])

def encode_followup_meta(conflicts: list, sources_list: list) -> np.ndarray:
    """Encodes conflict and source metadata into a feature array for followup classification."""
    encoded = []
    for conflict, sources in zip(conflicts, sources_list):
        row = [
            1.0 if conflict == "severe" else 0.0,
            1.0 if conflict == "minor" else 0.0,
            1.0 if conflict == "none" else 0.0,
            
            1.0 if sources.get("has_authority", False) else 0.0,
            1.0 if sources.get("has_forum", False) else 0.0,
            1.0 if sources.get("has_news", False) else 0.0,
            1.0 if sources.get("has_recent", False) else 0.0,
            
            # Normalize source count (cap at 10)
            min(float(sources.get("source_count", 3)) / 10.0, 1.0)
        ]
        encoded.append(row)
    return np.array(encoded, dtype=np.float32)

def extract_followup_features(queries: list, modes: list, conflicts: list, sources_list: list, emb_model: StaticModel = None, show_progress_bar: bool = False) -> np.ndarray:
    """Extracts features for the followup action classifier."""
    if emb_model is None:
        emb_model = load_embedding_model()
        
    emb = emb_model.encode(queries, show_progress_bar=show_progress_bar)
    modes_np = encode_modes(modes)
    meta_np = encode_followup_meta(conflicts, sources_list)
    
    return np.hstack([emb, modes_np, meta_np])


def encode_query_understanding_meta(queries: list) -> np.ndarray:
    """Encodes lightweight lexical/rule features for query-understanding heads."""
    encoded = []
    for query in queries:
        q = str(query or "").strip().lower()
        tokens = [token for token in re.split(r"[^a-z0-9]+", q) if token]
        token_count = float(len(tokens))
        row = [
            1.0 if re.search(r"\b(vs\.?|versus|compare|comparison|better than|difference between)\b", q) else 0.0,
            1.0 if re.search(r"\b(how to|how do i|guide|tutorial|walkthrough|setup|install|configure|migrate|upgrade)\b", q) else 0.0,
            1.0 if re.search(r"\b(error|fix|debug|issue|problem|broken|fails?|failing|not working|exception)\b", q) else 0.0,
            1.0 if re.search(r"\b(paper|papers|study|studies|survey|literature review|arxiv|doi|research|benchmark)\b", q) else 0.0,
            1.0 if re.search(r"\b(current|latest|today|right now|currently|status|outage|incident|release|changelog|pricing|202[4-9])\b", q) else 0.0,
            1.0 if re.search(r"\b(symptom|diagnosis|dosage|side effects?|treatment|medical|drug|medicine|disease|therapy|legal|law|regulation|gdpr|tax|contract|visa|immigration|compliance|policy|finance|financial|invest(?:ing|ment)?|loan|mortgage|insurance|retirement|credit score)\b", q) else 0.0,
            1.0 if re.search(r"\b(buy|price|pricing|cost|cheap|cheapest|deal|shop|review|under \$?\d+|under \d+)\b", q) else 0.0,
            1.0 if re.search(r"\b(github|readme|docs|documentation|api|reference|release notes?|npm|pypi|cargo)\b", q) else 0.0,
            1.0 if re.search(r"\b(reddit|forum|stackoverflow|community|discourse)\b", q) else 0.0,
            1.0 if re.search(r"\b(news|headline|announced|launch|earnings)\b", q) else 0.0,
            1.0 if re.search(r"^(who|what|when|where|why|how|which)\b", q) else 0.0,
            1.0 if re.search(r"\b(it|they|them|this|that|these|those|he|she)\b", q) else 0.0,
            min(token_count / 20.0, 1.0),
            min(float(sum(ch.isdigit() for ch in q)) / 8.0, 1.0),
        ]
        encoded.append(row)
    return np.array(encoded, dtype=np.float32)


def extract_query_understanding_features(queries: list, modes: list, emb_model: StaticModel = None, show_progress_bar: bool = False) -> np.ndarray:
    """Extracts features for query-understanding heads."""
    if emb_model is None:
        emb_model = load_embedding_model()

    emb = emb_model.encode(queries, show_progress_bar=show_progress_bar)
    modes_np = encode_modes(modes)
    meta_np = encode_query_understanding_meta(queries)
    return np.hstack([emb, modes_np, meta_np])
