const DEFAULT_API_BASE = "http://127.0.0.1:8787";
const API_BASE_KEY = "upworkProposalBackendUrl";
const DRAFT_STATE_KEY = "upworkProposalDraftState";

function nowIso() {
  return new Date().toISOString();
}

async function saveDraftState(state) {
  await chrome.storage.local.set({
    [DRAFT_STATE_KEY]: {
      ...state,
      updated_at: nowIso(),
    },
  });
}

async function backendUrl() {
  const stored = await chrome.storage.local.get(API_BASE_KEY);
  return (stored[API_BASE_KEY] || DEFAULT_API_BASE).replace(/\/+$/, "");
}

async function startDraftJob(request) {
  const startedAt = nowIso();
  await saveDraftState({
    phase: "starting",
    request,
    started_at: startedAt,
    draft_text: "",
    audit: "",
    error: null,
  });

  try {
    const apiBase = await backendUrl();
    const response = await fetch(`${apiBase}/draft-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Backend returned ${response.status}`);
    }

    const job = await response.json();
    const state = {
      phase: "active",
      request,
      job_id: job.id,
      job,
      started_at: startedAt,
      draft_text: "",
      audit: "",
      error: null,
    };
    await saveDraftState(state);
    return { ok: true, state };
  } catch (error) {
    const message = error?.message || String(error);
    await saveDraftState({
      phase: "failed",
      request,
      started_at: startedAt,
      draft_text: "",
      audit: "",
      error: message,
    });
    return { ok: false, error: message };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "START_DRAFT_JOB") return false;

  startDraftJob(message.request)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
