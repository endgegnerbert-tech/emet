import {
  ANNOTATION_LABELS,
  buildAnnotationItems,
  deriveAnnotationId,
  exportReviewedJsonl,
  parseJsonl,
  summarizeAnnotationProgress,
  upsertAnnotationReview,
} from "/lib/router-annotation.js";

const state = {
  task: "conflict",
  items: [],
  filteredItems: [],
  currentIndex: 0,
  datasetKey: null,
};

const RUBRICS = {
  conflict: [
    "no_conflict: kein echter Widerspruch zur selben Faktenfrage.",
    "resolved_by_authority: offizielle/primäre Quelle schlägt Blog/Forum/Aggregator.",
    "resolved_by_recency: aktuelle Quelle gewinnt bei status/latest/LTS/support Fragen.",
    "needs_review: kein klarer Sieger oder Snippets zu dünn.",
  ],
  sufficiency: [
    "sufficient: du könntest die Nutzerfrage jetzt belastbar beantworten.",
    "need_authority: keine klare offizielle/primäre Quelle.",
    "need_recency: zeitabhängige Frage ohne aktuelle Absicherung.",
    "need_version_context: Antwort hängt von Version/Release/Build-Flag ab.",
    "need_more_sources: etwas Evidenz da, aber noch nicht robust genug.",
  ],
};

const el = {
  taskSelect: document.querySelector("#taskSelect"),
  pendingOnly: document.querySelector("#pendingOnly"),
  draftFile: document.querySelector("#draftFile"),
  reviewedFile: document.querySelector("#reviewedFile"),
  loadButton: document.querySelector("#loadButton"),
  loadSampleConflict: document.querySelector("#loadSampleConflict"),
  loadSampleSufficiency: document.querySelector("#loadSampleSufficiency"),
  exportButton: document.querySelector("#exportButton"),
  clearStorageButton: document.querySelector("#clearStorageButton"),
  loadStatus: document.querySelector("#loadStatus"),
  workspace: document.querySelector("#workspace"),
  progressTitle: document.querySelector("#progressTitle"),
  progressSummary: document.querySelector("#progressSummary"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  markPendingButton: document.querySelector("#markPendingButton"),
  queryTitle: document.querySelector("#queryTitle"),
  metaPills: document.querySelector("#metaPills"),
  itemStatus: document.querySelector("#itemStatus"),
  candidateLabel: document.querySelector("#candidateLabel"),
  suggestedLabel: document.querySelector("#suggestedLabel"),
  finalLabelText: document.querySelector("#finalLabelText"),
  labelButtons: document.querySelector("#labelButtons"),
  rationaleInput: document.querySelector("#rationaleInput"),
  suggestedRationale: document.querySelector("#suggestedRationale"),
  inputText: document.querySelector("#inputText"),
  rubricText: document.querySelector("#rubricText"),
  acceptSuggestionButton: document.querySelector("#acceptSuggestionButton"),
};

function storageKey(task, datasetKey) {
  return `router-annotator:${task}:${datasetKey}`;
}

function safeParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Datei konnte nicht gelesen werden"));
    reader.readAsText(file);
  });
}

function computeDatasetKey(task, text) {
  return deriveAnnotationId(task, { query: "dataset", inputText: text });
}

function getCurrentItem() {
  return state.filteredItems[state.currentIndex] || null;
}

function setStatus(message) {
  el.loadStatus.textContent = message;
}

function refreshFilteredItems() {
  const pendingOnly = el.pendingOnly.checked;
  state.filteredItems = pendingOnly
    ? state.items.filter((item) => item.status !== "reviewed")
    : [...state.items];

  if (!state.filteredItems.length) {
    state.currentIndex = 0;
    render();
    return;
  }

  const current = getCurrentItem();
  if (!current) state.currentIndex = Math.min(state.currentIndex, state.filteredItems.length - 1);
  render();
}

function saveProgress() {
  if (!state.datasetKey) return;
  localStorage.setItem(storageKey(state.task, state.datasetKey), JSON.stringify({
    task: state.task,
    items: state.items,
  }));
}

function loadSavedProgress(task, datasetKey) {
  return safeParse(localStorage.getItem(storageKey(task, datasetKey)), null);
}

function renderRubric() {
  el.rubricText.innerHTML = (RUBRICS[state.task] || []).map((line) => `<div>• ${line}</div>`).join("");
}

function renderProgress() {
  const summary = summarizeAnnotationProgress(state.items);
  const labelBits = Object.entries(summary.byLabel)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => `${label}: ${count}`)
    .join(" · ");

  el.progressTitle.textContent = `Fortschritt (${state.task})`;
  el.progressSummary.textContent = `${summary.reviewed}/${summary.total} reviewed · ${summary.pending} offen${labelBits ? ` · ${labelBits}` : ""}`;
}

function renderLabels(item) {
  el.labelButtons.innerHTML = "";
  for (const label of ANNOTATION_LABELS[state.task] || []) {
    const button = document.createElement("button");
    button.textContent = label;
    button.className = item?.finalLabel === label ? "active" : "";
    button.addEventListener("click", () => {
      applyReview({ finalLabel: label });
      moveToNextPendingIfEnabled();
    });
    el.labelButtons.appendChild(button);
  }
}

function renderMeta(item) {
  el.metaPills.innerHTML = "";
  const metaEntries = {
    mode: item.meta?.mode || "",
    sourceCount: item.meta?.sourceCount ?? "",
    authoritative: item.meta?.authoritativeSourcesFound,
    proposal: item.candidateLabel || "",
  };
  for (const [key, value] of Object.entries(metaEntries)) {
    if (value === "" || value === undefined || value === null) continue;
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = `${key}: ${value}`;
    el.metaPills.appendChild(pill);
  }
}

function render() {
  el.workspace.classList.toggle("hidden", state.items.length === 0);
  renderProgress();
  renderRubric();

  const item = getCurrentItem();
  if (!item) {
    el.queryTitle.textContent = "Keine Einträge im aktuellen Filter.";
    el.metaPills.innerHTML = "";
    el.itemStatus.textContent = "-";
    el.candidateLabel.textContent = "-";
    el.suggestedLabel.textContent = "-";
    el.finalLabelText.textContent = "-";
    el.suggestedRationale.textContent = "";
    el.inputText.textContent = "";
    el.rationaleInput.value = "";
    el.labelButtons.innerHTML = "";
    return;
  }

  el.queryTitle.textContent = `${state.currentIndex + 1}/${state.filteredItems.length}: ${item.query}`;
  renderMeta(item);
  el.itemStatus.textContent = item.status;
  el.itemStatus.className = item.status === "reviewed" ? "status-reviewed" : "status-pending";
  el.candidateLabel.textContent = item.candidateLabel || "-";
  el.suggestedLabel.textContent = item.suggestedLabel || "-";
  el.finalLabelText.textContent = item.finalLabel || "-";
  el.rationaleInput.value = item.rationale || "";
  el.suggestedRationale.textContent = item.suggestedRationale ? `Vorschlags-Begründung: ${item.suggestedRationale}` : "";
  el.inputText.textContent = item.inputText || "";
  renderLabels(item);
}

function move(delta) {
  if (!state.filteredItems.length) return;
  state.currentIndex = Math.max(0, Math.min(state.currentIndex + delta, state.filteredItems.length - 1));
  render();
}

function moveToNextPendingIfEnabled() {
  if (!el.pendingOnly.checked) return;
  refreshFilteredItems();
}

function applyReview(patch) {
  const current = getCurrentItem();
  if (!current) return;
  state.items = upsertAnnotationReview(state.items, current.id, patch);
  saveProgress();
  refreshFilteredItems();
}

function acceptSuggestion() {
  const current = getCurrentItem();
  if (!current?.suggestedLabel) return;
  applyReview({ finalLabel: current.suggestedLabel, rationale: current.rationale || current.suggestedRationale || "" });
  moveToNextPendingIfEnabled();
}

function clearCurrentLabel() {
  const current = getCurrentItem();
  if (!current) return;
  state.items = upsertAnnotationReview(state.items, current.id, { finalLabel: "" });
  saveProgress();
  refreshFilteredItems();
}

function download(filename, text) {
  const blob = new Blob([text], { type: "application/x-ndjson;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function loadFromTexts(task, draftText, reviewedText = "") {
  const draftRows = parseJsonl(draftText);
  const reviewedRows = reviewedText ? parseJsonl(reviewedText) : [];
  const datasetKey = computeDatasetKey(task, draftText);
  const saved = loadSavedProgress(task, datasetKey);

  state.task = task;
  state.datasetKey = datasetKey;
  state.items = saved?.items?.length
    ? saved.items
    : buildAnnotationItems(task, draftRows, reviewedRows);
  state.currentIndex = 0;
  refreshFilteredItems();
  setStatus(`Geladen: ${draftRows.length} Draft-Einträge${saved?.items?.length ? " · lokaler Fortschritt wiederhergestellt" : ""}`);
}

function inferSampleName(task) {
  return task === "conflict" ? "gold-conflict-draft.jsonl" : "gold-sufficiency-draft.jsonl";
}

async function loadRepoSample(task) {
  const samplePath = `/data/router/${inferSampleName(task)}`;
  const response = await fetch(samplePath);
  if (!response.ok) throw new Error(`Konnte ${samplePath} nicht laden`);
  const draftText = await response.text();
  el.taskSelect.value = task;
  await loadFromTexts(task, draftText, "");
}

el.loadButton.addEventListener("click", async () => {
  const draftFile = el.draftFile.files?.[0];
  if (!draftFile) {
    setStatus("Bitte zuerst eine Draft-Datei auswählen.");
    return;
  }

  try {
    const task = el.taskSelect.value;
    const [draftText, reviewedText] = await Promise.all([
      readFileAsText(draftFile),
      el.reviewedFile.files?.[0] ? readFileAsText(el.reviewedFile.files[0]) : Promise.resolve(""),
    ]);
    await loadFromTexts(task, draftText, reviewedText);
  } catch (error) {
    setStatus(`Fehler: ${error?.message || error}`);
  }
});

el.loadSampleConflict.addEventListener("click", () => loadRepoSample("conflict").catch((error) => setStatus(`Fehler: ${error?.message || error}`)));
el.loadSampleSufficiency.addEventListener("click", () => loadRepoSample("sufficiency").catch((error) => setStatus(`Fehler: ${error?.message || error}`)));

el.exportButton.addEventListener("click", () => {
  const jsonl = exportReviewedJsonl(state.items);
  if (!jsonl.trim()) {
    setStatus("Noch nichts reviewed.");
    return;
  }
  download(`${state.task}-reviewed.jsonl`, `${jsonl}\n`);
  setStatus("Reviewed JSONL exportiert.");
});

el.clearStorageButton.addEventListener("click", () => {
  if (!state.datasetKey) {
    setStatus("Noch kein Datensatz geladen.");
    return;
  }
  localStorage.removeItem(storageKey(state.task, state.datasetKey));
  setStatus("Lokaler Fortschritt gelöscht. Lade den Datensatz neu.");
});

el.prevButton.addEventListener("click", () => move(-1));
el.nextButton.addEventListener("click", () => move(1));
el.markPendingButton.addEventListener("click", clearCurrentLabel);
el.pendingOnly.addEventListener("change", refreshFilteredItems);
el.acceptSuggestionButton.addEventListener("click", acceptSuggestion);

el.rationaleInput.addEventListener("input", () => {
  applyReview({ rationale: el.rationaleInput.value });
});

document.addEventListener("keydown", (event) => {
  if (event.target === el.rationaleInput) return;
  if (event.key === "ArrowLeft") move(-1);
  if (event.key === "ArrowRight") move(1);
  if (event.key.toLowerCase() === "a") acceptSuggestion();
});

render();
