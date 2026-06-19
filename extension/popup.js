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
  sourceUrl: document.querySelector("#source-url"),
  title: document.querySelector("#title"),
  company: document.querySelector("#company"),
  location: document.querySelector("#location"),
  description: document.querySelector("#description"),
  skills: document.querySelector("#skills"),
  employmentType: document.querySelector("#employment-type"),
  remoteStatus: document.querySelector("#remote-status"),
  companyContext: document.querySelector("#company-context"),
  recruiterContext: document.querySelector("#recruiter-context"),
  responsibilities: document.querySelector("#responsibilities"),
  requirements: document.querySelector("#requirements"),
  niceToHaves: document.querySelector("#nice-to-haves"),
  questions: document.querySelector("#questions"),
  warnings: document.querySelector("#warnings"),
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
  codex_draft: "Drafting",
  saving: "Saving audit trail",
  done: "Done",
  failed: "Failed",
};

const STAGE_STATUS = {
  queued: "Draft queued.",
  codex_draft: "Drafting with portfolio context...",
  saving: "Saving the draft and audit trail...",
  done: "Draft ready.",
  failed: "Draft failed.",
};

const STAGE_PROGRESS = {
  queued: 8,
  codex_draft: 55,
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

function normalizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (_error) {
    return String(value).trim().replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function samePageUrl(left, right) {
  const normalizedLeft = normalizeUrl(left);
  const normalizedRight = normalizeUrl(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function requestSourceUrl(request) {
  return request?.opportunity?.source_url || request?.project?.url || "";
}

function stateSourceUrl(state) {
  return requestSourceUrl(state?.request);
}

function opportunitySourceUrl(opportunity) {
  return opportunity?.source_url || opportunity?.url || "";
}

function listToText(values) {
  return (values || []).join("\n");
}

function textToList(value) {
  return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function clearDraftOutput() {
  els.proposal.value = "";
  els.audit.textContent = "";
  els.copy.disabled = true;
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
  if (!response.opportunity) throw new Error("The page extractor did not return an opportunity snapshot.");
  return response.opportunity;
}

async function captureActivePage({ statusText = "Review the current page snapshot before drafting." } = {}) {
  const opportunity = await extractProject();
  currentState = null;
  clearProgress();
  clearDraftOutput();
  fillOpportunity(opportunity);
  await persistEditableSnapshot();
  setStatus(statusText);
  return opportunity;
}

function fillOpportunity(opportunity) {
  els.source.value = opportunity.source || "";
  els.sourceUrl.value = opportunity.source_url || opportunity.url || "";
  els.title.value = opportunity.title || "";
  els.company.value = opportunity.company || "";
  els.location.value = opportunity.location || "";
  els.description.value = opportunity.description || "";
  els.skills.value = (opportunity.skills || []).join(", ");
  els.employmentType.value = opportunity.employment_type || "";
  els.remoteStatus.value = opportunity.remote_status || "";
  els.companyContext.value = opportunity.company_context || "";
  els.recruiterContext.value = opportunity.recruiter_or_client_context || opportunity.client_context || "";
  els.responsibilities.value = listToText(opportunity.responsibilities);
  els.requirements.value = listToText(opportunity.requirements);
  els.niceToHaves.value = listToText(opportunity.nice_to_haves);
  els.questions.value = listToText(opportunity.application_questions);
  els.warnings.value = listToText(opportunity.extraction_warnings);
  syncSourceFields();
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
  const responsibilities = textToList(els.responsibilities.value);
  const requirements = textToList(els.requirements.value);
  const niceToHaves = textToList(els.niceToHaves.value);
  const questions = textToList(els.questions.value);
  const warnings = textToList(els.warnings.value);
  const companyContext = els.companyContext.value.trim();
  const recruiterContext = els.recruiterContext.value.trim();
  const opportunity = {
    source: els.source.value.trim() || "manual",
    source_url: els.sourceUrl.value.trim(),
    captured_at: new Date().toISOString(),
    title: els.title.value.trim(),
    company: els.company.value.trim(),
    location: els.location.value.trim(),
    employment_type: els.employmentType.value.trim(),
    remote_status: els.remoteStatus.value.trim(),
    description: els.description.value.trim(),
    responsibilities,
    requirements,
    nice_to_haves: niceToHaves,
    skills,
    application_questions: questions,
    company_context: companyContext,
    recruiter_or_client_context: recruiterContext,
    extraction_warnings: warnings,
  };
  return {
    opportunity,
    draft_type: els.draftType.value,
    user_notes: els.notes.value.trim(),
    style: "concise",
  };
}

function syncSourceFields() {
  document.querySelectorAll("[data-show-when-filled]").forEach((element) => {
    const input = document.querySelector(element.dataset.showWhenFilled || "");
    element.classList.toggle("is-hidden", !input?.value.trim());
  });
}

async function currentPageRequest() {
  const existingRequest = readRequest();
  const opportunity = await extractProject();
  const activeUrl = opportunitySourceUrl(opportunity);
  const existingUrl = requestSourceUrl(existingRequest);
  const activeSource = opportunity.source || "";
  const existingSource = existingRequest.opportunity?.source || "";

  if (!samePageUrl(existingUrl, activeUrl) || (activeSource && existingSource !== activeSource)) {
    fillOpportunity(opportunity);
    await persistEditableSnapshot();
    setStatus("Updated snapshot from the active page.");
    return readRequest();
  }

  return existingRequest;
}

function buildAuditPayload(job, draft) {
  return {
    job_id: job.id,
    draft_id: draft.id,
    draft_type: draft.draft_type,
    selected_angle: draft.selected_angle,
    role_classification: draft.role_classification,
    application_strategy: draft.application_strategy,
    selected_projects: draft.selected_projects,
    rejected_projects: draft.rejected_projects,
    decisions: draft.decisions,
    claims: draft.claims,
    warnings: draft.warnings,
    timings: job.timings,
  };
}

function renderDraft(job, draft) {
  const audit = JSON.stringify(buildAuditPayload(job, draft), null, 2);
  const text = draft.draft_text || "";
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
    draft_text: els.proposal.value,
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

async function createDraftJob(request = readRequest()) {
  const response = await chrome.runtime.sendMessage({ type: "START_DRAFT_JOB", request });
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
  const outputText = draft.draft_text || "";
  await writeDraftState({
    phase: "succeeded",
    request: currentState?.request || readRequest(),
    job_id: job.id,
    job,
    result: draft,
    draft_text: outputText,
    audit,
    error: null,
    started_at: currentState?.started_at,
  });
  setStatus("Draft ready.");
  clearProgress();
}

async function restoreDraftState(stateToRestore = null) {
  const state = stateToRestore || (await loadDraftState());
  if (!state) return false;

  currentState = state;
  if (state.request) fillRequest(state.request);
  if (state.draft_text) els.proposal.value = state.draft_text;
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
    setBusy(false);
    setStatus("Extracting job details...");
    await captureActivePage({ statusText: "Review the current page snapshot before drafting." });
  } catch (error) {
    setStatus(error.message, "error");
  }
});

els.draft.addEventListener("click", async () => {
  let wroteStartingState = false;
  try {
    setBusy(true);
    setStatus("Checking active page...");
    const request = await currentPageRequest();
    clearDraftOutput();
    await writeDraftState({
      phase: "starting",
      request,
      draft_text: "",
      audit: "",
      started_at: nowIso(),
      error: null,
    });
    wroteStartingState = true;
    setProgress({ stage: "queued", elapsed_seconds: 0 });
    const state = await createDraftJob(request);
    currentState = state;
    setProgress({ ...(state.job || {}), stage: state.job?.stage || "queued", elapsed_seconds: 0 });
    await finishDraftJob(state.job_id);
  } catch (error) {
    if (wroteStartingState) {
      await patchDraftState({ phase: "failed", error: error.message }).catch(() => {});
    }
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

els.copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.proposal.value);
  setStatus("Copied draft.");
});

els.settings.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

[els.source, els.sourceUrl, els.title, els.company, els.location, els.description, els.skills, els.employmentType, els.remoteStatus, els.companyContext, els.recruiterContext, els.responsibilities, els.requirements, els.niceToHaves, els.questions, els.draftType, els.notes].forEach((element) => {
  element.addEventListener("input", scheduleEditableSnapshot);
  element.addEventListener("input", syncSourceFields);
  element.addEventListener("change", scheduleEditableSnapshot);
  element.addEventListener("change", syncSourceFields);
});

async function initializePopup() {
  try {
    setStatus("Reading active page...");
    const opportunity = await extractProject();
    const state = await loadDraftState();
    if (state && samePageUrl(stateSourceUrl(state), opportunitySourceUrl(opportunity))) {
      await restoreDraftState(state);
      return;
    }
    currentState = null;
    clearProgress();
    clearDraftOutput();
    fillOpportunity(opportunity);
    await persistEditableSnapshot();
    setStatus("Review the current page snapshot before drafting.");
  } catch (error) {
    const restored = await restoreDraftState();
    if (restored) {
      setStatus(`Showing saved snapshot. ${error.message || "Active page could not be read."}`, "error");
      return;
    }
    setStatus(error.message || "Open a supported job page, then click Extract.", "error");
  }
}

initializePopup();
