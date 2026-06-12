# Conflict Model auf Abstellgleis

**Datum:** 2026-06-12
**Status:** ⬜ Open

## Problem

Das Conflict Model (Feature-basiertes SVC/LR für Konflikt-Erkennung) wurde auf Abstellgleis gestellt.

### Warum?

1. **Feature-Leakage**: Das ursprüngliche Modell (F1=1.0) verwendete `conflicting_pairs` als Feature, das perfekt mit dem Label korreliert. Das Modell war eine Lookup-Table, kein ML.
2. **Sauberes Modell zu schwach**: Nach Entfernung der Leakage-Features erreicht das Modell nur F1=0.523 (GroupKFold, query-only Features). Das ist nur knapp über der Heuristic-Baseline (F1=0.404, immer "no_conflict").
3. **Runtime-Signal ist ausreichend**: Der Runtime (`research.js`) erkennt Konflikte bereits zuverlässig über `conflictDetected` + `conflictingSourcePairs`. Ein ML-Modell dafür ist overengineering.

### Erforderlich für Reaktivierung

- [ ] Neue Features identifizieren, die Konflikte VOR der Search vorhersagen können
- [ ] >500 handgelabelte Trainingsdaten mit Konflikt/Nicht-Konflikt
- [ ] Saubere GroupKFold-Evaluation mit F1 > 0.7

### Betroffene Dateien

- `ml/models/conflict-structured/` — gelöscht aus Production
- `.gitignore` — Pfad ausgeschlossen
- `lib/tiny-router.js` — Zeile 96 (Env-Flag `EMET_TINY_ROUTER_CONFLICT`)

### Verwandte Diskussion

Siehe PR # / Commit: (wird nachgereicht)
