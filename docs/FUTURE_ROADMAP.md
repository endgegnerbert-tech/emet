# Future Vision & Next Steps

This document outlines the strategic roadmap for taking `emet` to the next level. After migrating away from the heavyweight BitNet JSON-planner toward the blazing-fast Hybrid Architecture (Tiny-Router with Model2Vec and Structured ML), the foundation is now solid.

The next evolutionary leaps involve **Scaling Data** and **Deep Semantic Reasoning**.

## 1. LLM Data Augmentation (Weak Supervision)
**The Problem:** The current Domain-Router (Model2Vec + SVC) is slightly underconfident on specific domains like `papers` and `package-registry`, often falling back to the heuristic `null`. This is a feature (Fail-Safe), but it highlights a lack of training data (~90 hand-labeled gold samples).
**The Solution:**
- Use a strong LLM (e.g., GPT-4o) offline to generate 5,000 highly diverse synthetic search queries for every specific domain.
- Example: Generate hundreds of ways users ask for GitHub issues, NPM package bugs, or NeurIPS papers.
- Feed these into `data/router/gold-domain.jsonl` and retrain the classifier.
- **Expected Outcome:** Domain Router accuracy will jump from ~83% to >95% instantly, minimizing heuristic fallbacks.

## 2. Active Learning Telemetry Loop (Self-Healing System)
**The Problem:** Edge cases will always exist in the wild that the training data didn't capture.
**The Solution:**
- We currently log low-confidence fallback events (`tiny_router_fallback`).
- Build an offline clustering script that periodically scans the telemetry logs/caches, groups similar failed queries, and outputs the top 50 missing patterns.
- Label these either manually or via Weak Supervision and append them to the gold dataset.
- **Expected Outcome:** The system continuously learns from its own failures in production and updates itself week by week.

## 3. Cross-Encoder (NLI) for True Conflict Detection
**The Problem:** A simple Logistic Regression model operating on structured features struggles to recognize true semantic contradiction (e.g., "Node 20 is completely stable" vs. "Node 20 is completely broken and unsupported").
**The Solution:**
- Migrate the `Conflict` task away from standard structured Logistic Regression.
- Implement a tiny, fine-tuned Cross-Encoder model (e.g., MiniLM with Natural Language Inference / NLI fine-tuning).
- A Cross-Encoder processes both texts together, allowing the attention heads to compare tokens directly across sentences (Entailment vs. Contradiction).
- **Expected Outcome:** The agent will reliably detect when two authoritative sources fundamentally disagree on facts, safely triggering the `needs_review` loop without false positives.

## 4. Contrastive Fine-Tuning for Model2Vec
**The Problem:** We use generic embeddings (`minishlab/potion-base-8M`), which are good but not perfectly aligned with how agents query data.
**The Solution:**
- Apply SimCSE (Simple Contrastive Learning of Sentence Embeddings) directly on the agent's historical research queries.
- Pull queries closer together in the vector space if they share the same intent (e.g., "CVE" and "security advisory" become neighbors, while pushing "NPM issue" far away).
- **Expected Outcome:** Even better Zero-Shot generalizability for the Domain Router with the exact same latency budget.
