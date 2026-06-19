const DEFAULT_API_BASE = "http://127.0.0.1:8787";
const API_BASE_KEY = "upworkProposalBackendUrl";
const DRAFT_STATE_KEY = "upworkProposalDraftState";

const els = {
  status: document.querySelector("#status"),
  settings: document.querySelector("#settings"),
  extract: document.querySelector("#extract"),
  draft: document.querySelector("#draft"),
  copy: document.querySelector("#copy"),
  source: document.querySelector("#source"),
  title: document.querySelector("#title"),
  company: document.querySelector("#company"),
  location: document.querySelector("#location"),
  description: document.querySelector("#description"),
  budget: document.querySelector("#budget"),
  skills: document.querySelector("#skills"),
  draftType: document.querySelector("#draft-type"),
  notes: document.querySelector("#notes"),
  proposal: document.querySelector("#proposal"),
  audit: document.querySelector("#audit"),
  progress: document.querySelector("#progress"),
  progressBar: document.querySelector("#progress-bar"),
  stage: document.querySelector("#stage"),
  elapsed: document.querySelector("#elapsed"),
};

let currentState = null;
let pollToken = 0;
let saveTimer = 0;

const STAGE_LABELS = {
  queued: "Queued",
  selecting_context: "Selecting context",
  codex_draft: "Writing draft",
  humanizer: "Humanizer pass",
  saving: "Saving audit trail",
  done: "Done",
  failed: "Failed",
};

const STAGE_STATUS = {
  queued: "Draft queued.",
  selecting_context: "Selecting portfolio evidence...",
  codex_draft: "Codex is writing the first draft...",
  humanizer: "Running the humanizer pass...",
  saving: "Saving the proposal and audit trail...",
  done: "Draft ready.",
  failed: "Draft failed.",
};

const STAGE_PROGRESS = {
  queued: 8,
  selecting_context: 18,
  codex_draft: 48,
  humanizer: 78,
  saving: 92,
  done: 100,
  failed: 100,
};

function setStatus(text, state = "idle") {
  els.status.textContent = text;
  els.status.dataset.state = state;
}

function nowIso() {
  return new Date().toISOString();
}

async function loadDraftState() {
  const stored = await chrome.storage.local.get(DRAFT_STATE_KEY);
  return stored[DRAFT_STATE_KEY] || null;
}

async function backendUrl() {
  const stored = await chrome.storage.local.get(API_BASE_KEY);
  return (stored[API_BASE_KEY] || DEFAULT_API_BASE).replace(/\/+$/, "");
}

async function writeDraftState(state) {
  currentState = {
    ...state,
    updated_at: nowIso(),
  };
  await chrome.storage.local.set({ [DRAFT_STATE_KEY]: currentState });
}

async function patchDraftState(patch) {
  const existing = (await loadDraftState()) || {};
  await writeDraftState({ ...existing, ...patch });
}

function setProgress(job) {
  const stage = job.stage || "queued";
  els.progress.hidden = false;
  els.stage.textContent = STAGE_LABELS[stage] || stage;
  els.elapsed.textContent = `${Math.max(0, Math.round(job.elapsed_seconds || 0))}s`;
  els.progressBar.style.width = `${STAGE_PROGRESS[stage] || 8}%`;
  setStatus(STAGE_STATUS[stage] || "Drafting through local Codex...");
}

function clearProgress() {
  els.progress.hidden = true;
  els.progressBar.style.width = "8%";
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setBusy(isBusy) {
  els.draft.disabled = isBusy;
  els.extract.disabled = isBusy;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return tab;
}

async function extractProject() {
  const tab = await activeTab();
  try {
    return await sendExtractMessage(tab.id);
  } catch (_err) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content_script.js"] });
    return await sendExtractMessage(tab.id);
  }
}

async function sendExtractMessage(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { type: "APPLICATION_DRAFT_EXTRACT" });
  if (!response?.ok) throw new Error("Could not extract job details.");
  return response.opportunity || response.project;
}

function fillOpportunity(opportunity) {
  els.source.value = opportunity.source || "";
  els.title.value = opportunity.title || "";
  els.company.value = opportunity.company || "";
  els.location.value = opportunity.location || "";
  els.description.value = opportunity.description || "";
  els.budget.value = opportunity.compensation || opportunity.budget || "";
  els.skills.value = (opportunity.skills || []).join(", ");
  els.title.dataset.url = opportunity.source_url || opportunity.url || "";
  els.title.dataset.remoteStatus = opportunity.remote_status || "";
  els.title.dataset.employmentType = opportunity.employment_type || "";
  els.title.dataset.rawText = opportunity.raw_text || "";
  els.title.dataset.questions = JSON.stringify(opportunity.application_questions || []);
  els.title.dataset.warnings = JSON.stringify(opportunity.extraction_warnings || []);
  if (opportunity.source === "upwork") {
    els.draftType.value = "upwork_proposal";
  } else if ((opportunity.application_questions || []).length > 0) {
    els.draftType.value = "question_answers";
  } else {
    els.draftType.value = "cover_letter";
  }
}

function fillRequest(request) {
  fillOpportunity(request.opportunity || request.project || {});
  els.draftType.value = request.draft_type || "cover_letter";
  els.notes.value = request.user_notes || "";
}

function readRequest() {
  const skills = els.skills.value.split(",").map((skill) => skill.trim()).filter(Boolean);
  const questions = JSON.parse(els.title.dataset.questions || "[]");
  const warnings = JSON.parse(els.title.dataset.warnings || "[]");
  const opportunity = {
    source: els.source.value.trim() || "manual",
    source_url: els.title.dataset.url || "",
    captured_at: new Date().toISOString(),
    title: els.title.value.trim(),
    company: els.company.value.trim(),
    location: els.location.value.trim(),
    compensation: els.budget.value.trim(),
    employment_type: els.title.dataset.employmentType || "",
    remote_status: els.title.dataset.remoteStatus || "",
    description: els.description.value.trim(),
    skills,
    application_questions: questions,
    recruiter_or_client_context: [els.company.value.trim(), els.location.value.trim()].filter(Boolean).join(" | "),
    raw_text: els.title.dataset.rawText || els.description.value.trim(),
    extraction_confidence: warnings.length ? "medium" : "high",
    extraction_warnings: warnings,
  };
  return {
    opportunity,
    project: {
      title: opportunity.title,
      description: opportunity.description,
      budget: opportunity.compensation,
      skills,
      client_context: opportunity.recruiter_or_client_context,
      url: opportunity.source_url,
      captured_at: opportunity.captured_at,
    },
    draft_type: els.draftType.value,
    user_notes: els.notes.value.trim(),
    proposal_style: "concise",
    style: "concise",
  };
}

function buildAuditPayload(job, draft) {
  return {
    job_id: job.id,
    draft_id: draft.id,
    draft_type: draft.draft_type,
    angle: draft.angle,
    selected_projects: draft.selected_projects,
    decisions: draft.decisions,
    claims: draft.claims,
    warnings: draft.warnings,
    timings: job.timings,
  };
}

function renderDraft(job, draft) {
  const audit = JSON.stringify(buildAuditPayload(job, draft), null, 2);
  const text = draft.primary_text || draft.proposal || draft.short_message || "";
  els.proposal.value = text;
  els.audit.textContent = audit;
  els.copy.disabled = !text;
  return audit;
}

async function persistEditableSnapshot() {
  if (currentState?.phase === "starting" || currentState?.phase === "active") return;
  await writeDraftState({
    phase: "editing",
    request: readRequest(),
    proposal: els.proposal.value,
    audit: els.audit.textContent,
    error: null,
  });
}

function scheduleEditableSnapshot() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    persistEditableSnapshot().catch(() => {});
  }, 250);
}

async function createDraftJob() {
  const response = await chrome.runtime.sendMessage({ type: "START_DRAFT_JOB", request: readRequest() });
  if (!response?.ok) throw new Error(response?.error || "Could not start draft job.");
  return response.state;
}

async function getDraftJob(jobId) {
  const apiBase = await backendUrl();
  const response = await fetch(`${apiBase}/draft-jobs/${jobId}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Backend returned ${response.status}`);
  }
  return response.json();
}

async function pollDraftJob(jobId) {
  const token = ++pollToken;
  while (true) {
    if (token !== pollToken) throw new Error("Draft polling was cancelled.");
    const job = await getDraftJob(jobId);
    await patchDraftState({
      phase: "active",
      job_id: job.id,
      job,
      request: currentState?.request || readRequest(),
      error: null,
    });
    setProgress(job);
    if (job.status === "succeeded") {
      if (!job.result) throw new Error("Draft job finished without a stored result.");
      return { job, draft: job.result };
    }
    if (job.status === "failed") {
      throw new Error(job.error || "Draft job failed.");
    }
    await sleep(1000);
  }
}

async function waitForStartedJob() {
  const startedAt = Date.parse(currentState?.started_at || currentState?.updated_at || nowIso());
  while (true) {
    const state = await loadDraftState();
    currentState = state;
    if (state?.phase === "active" && state.job_id) return state.job_id;
    if (state?.phase === "failed") throw new Error(state.error || "Could not start draft job.");
    if (Date.now() - startedAt > 30000) throw new Error("Draft job did not start. Check that the backend is running.");
    setProgress({ stage: "queued", elapsed_seconds: Math.max(0, (Date.now() - startedAt) / 1000) });
    await sleep(500);
  }
}

async function finishDraftJob(jobId) {
  setBusy(true);
  const { job, draft } = await pollDraftJob(jobId);
  const audit = renderDraft(job, draft);
  const outputText = draft.primary_text || draft.proposal || draft.short_message || "";
  await writeDraftState({
    phase: "succeeded",
    request: currentState?.request || readRequest(),
    job_id: job.id,
    job,
    result: draft,
    proposal: outputText,
    audit,
    error: null,
    started_at: currentState?.started_at,
  });
  setStatus("Draft ready.");
  clearProgress();
}

async function restoreDraftState() {
  const state = await loadDraftState();
  if (!state) return false;

  currentState = state;
  if (state.request) fillRequest(state.request);
  if (state.proposal) els.proposal.value = state.proposal;
  if (state.audit) els.audit.textContent = state.audit;
  els.copy.disabled = !els.proposal.value;

  if (state.phase === "succeeded" && state.result && state.job) {
    renderDraft(state.job, state.result);
    setStatus("Draft ready.");
    clearProgress();
    return true;
  }

  if (state.phase === "failed") {
    clearProgress();
    setStatus(state.error || "Draft failed.", "error");
    return true;
  }

  if (state.phase === "active" && state.job_id) {
    setStatus("Resuming draft job...");
    try {
      await finishDraftJob(state.job_id);
    } finally {
      setBusy(false);
    }
    return true;
  }

  if (state.phase === "starting") {
    setBusy(true);
    setProgress({ stage: "queued", elapsed_seconds: 0 });
    try {
      const jobId = await waitForStartedJob();
      await finishDraftJob(jobId);
    } finally {
      setBusy(false);
    }
    return true;
  }

  if (state.phase === "editing") {
    setStatus("Review the snapshot before drafting.");
    return true;
  }

  return false;
}

els.extract.addEventListener("click", async () => {
  try {
    pollToken += 1;
    currentState = null;
    setBusy(false);
    clearProgress();
    setStatus("Extracting job details...");
    els.proposal.value = "";
    els.audit.textContent = "";
    els.copy.disabled = true;
    fillOpportunity(await extractProject());
    await persistEditableSnapshot();
    setStatus("Review the snapshot before drafting.");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

els.draft.addEventListener("click", async () => {
  try {
    setBusy(true);
    els.copy.disabled = true;
    els.proposal.value = "";
    els.audit.textContent = "";
    await writeDraftState({
      phase: "starting",
      request: readRequest(),
      proposal: "",
      audit: "",
      started_at: nowIso(),
      error: null,
    });
    setProgress({ stage: "queued", elapsed_seconds: 0 });
    const state = await createDraftJob();
    currentState = state;
    setProgress({ ...(state.job || {}), stage: state.job?.stage || "queued", elapsed_seconds: 0 });
    await finishDraftJob(state.job_id);
  } catch (error) {
    await patchDraftState({ phase: "failed", error: error.message }).catch(() => {});
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

els.copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.proposal.value);
  setStatus("Copied proposal.");
});

els.settings.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

[els.source, els.title, els.company, els.location, els.description, els.budget, els.skills, els.draftType, els.notes].forEach((element) => {
  element.addEventListener("input", scheduleEditableSnapshot);
  element.addEventListener("change", scheduleEditableSnapshot);
});

restoreDraftState()
  .then((restored) => {
    if (restored) return null;
    return extractProject().then(async (project) => {
      fillOpportunity(project);
      await persistEditableSnapshot();
      setStatus("Review the snapshot before drafting.");
      return null;
    });
  })
  .catch((error) => setStatus(error.message || "Open a supported job page, then click Extract.", "error"));
