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
