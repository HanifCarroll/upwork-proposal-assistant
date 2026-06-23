const els = {
  status: document.querySelector("#status"),
  refresh: document.querySelector("#refresh"),
  dicePostingPicker: document.querySelector("#dice-posting-picker"),
  dicePostingSummary: document.querySelector("#dice-posting-summary"),
  dicePostingNextPage: document.querySelector("#dice-posting-next-page"),
  dicePostingSelectAll: document.querySelector("#dice-posting-select-all"),
  dicePostingList: document.querySelector("#dice-posting-list"),
  dicePostingOpenSelected: document.querySelector("#dice-posting-open-selected"),
  dicePostingStatus: document.querySelector("#dice-posting-status"),
  diceCoverLetterRuns: document.querySelector("#dice-cover-letter-runs"),
  diceCoverLetterSummary: document.querySelector("#dice-cover-letter-summary"),
  diceCoverLetterList: document.querySelector("#dice-cover-letter-list"),
};

let diceResultsTabId = null;
let apiBase = "";

const coverLetterRuns = globalThis.JobApplicationDiceCoverLetterRuns;
const BUSY_RUN_STATUSES = new Set(["reading", "drafting", "pdf_generating", "attaching", "continuing", "submitting", "opening_finder"]);
const DICE_WIZARD_SCRIPT_FILES = [
  "extractors/common.js",
  "platforms/dice_opportunity.js",
  "ui/dice_cover_letter_runs.js",
  "dice_wizard_assistant.js",
];

function setStatus(text, state = "idle") {
  els.status.textContent = text;
  els.status.dataset.state = state;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isDiceResultsUrl(value) {
  try {
    const url = new URL(value || "");
    return url.hostname.includes("dice.com") && url.pathname === "/jobs";
  } catch (_error) {
    return false;
  }
}

function isDiceWizardUrl(value, jobId = "") {
  try {
    const url = new URL(value || "");
    if (!url.hostname.includes("dice.com")) return false;
    const pattern = jobId
      ? new RegExp(`^/job-applications/${jobId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/wizard(?:/|$)`)
      : /^\/job-applications\/[^/]+\/wizard(?:\/|$)/;
    return pattern.test(url.pathname);
  } catch (_error) {
    return false;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return tab;
}

async function diceResultsTab() {
  if (diceResultsTabId) {
    try {
      const tab = await chrome.tabs.get(diceResultsTabId);
      if (tab?.id && isDiceResultsUrl(tab.url || "")) return tab;
    } catch (_error) {
      diceResultsTabId = null;
    }
  }

  const tab = await activeTab();
  if (!isDiceResultsUrl(tab.url || "")) {
    throw new Error("Open a Dice results page to use this panel.");
  }
  diceResultsTabId = tab.id;
  return tab;
}

async function injectContentScripts(tabId) {
  await globalThis.JobApplicationContentScripts.inject(tabId);
}

async function backendUrl() {
  if (apiBase) return apiBase;
  const response = await chrome.runtime.sendMessage({ type: "GET_BACKEND_URL" });
  if (!response?.ok) throw new Error(response?.error || "Could not read backend URL.");
  apiBase = response.api_base;
  return apiBase;
}

function runIsBusy(run) {
  return Boolean(run?.busy) || BUSY_RUN_STATUSES.has(run?.status || "");
}

function runLabel(run) {
  return run?.title || "Dice application";
}

function runMeta(run) {
  return [run?.company, run?.job_id].filter(Boolean).join(" • ");
}

function pdfUrl(pdf, baseUrl) {
  if (!pdf?.download_url || !baseUrl) return "";
  try {
    return new URL(pdf.download_url, baseUrl).href;
  } catch (_error) {
    return "";
  }
}

function runWizardTab(tabs, run) {
  return tabs.find((tab) => tab?.id && isDiceWizardUrl(tab.url || "", run?.job_id || "")) || null;
}

async function lookupApplicationForRun(run) {
  if (!run?.source_url) return null;
  const response = await chrome.runtime.sendMessage({ type: "LOOKUP_APPLICATION", source_url: run.source_url });
  if (!response?.ok || !response.matched) return null;
  return response.application || null;
}

async function ensureWizardAssistant(tab) {
  if (!tab?.id) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: DICE_WIZARD_SCRIPT_FILES }).catch(() => {});
}

async function reconcileCoverLetterRun(run, tabs) {
  if (!runIsBusy(run)) return false;

  const application = await lookupApplicationForRun(run).catch(() => null);
  if (application) {
    await coverLetterRuns.upsert(run.job_id, {
      application_id: application.id || "",
      busy: false,
      message: "Application submitted.",
      primary_label: "Regenerate PDF",
      status: "submitted",
      submitted_at: application.applied_at || new Date().toISOString(),
    });
    return true;
  }

  const tab = runWizardTab(tabs, run);
  if (tab) {
    await ensureWizardAssistant(tab);
    return false;
  }

  await coverLetterRuns.upsert(run.job_id, {
    busy: false,
    message: "Dice tab closed before this run finished.",
    primary_label: "Try again",
    status: "needs_attention",
  });
  return true;
}

async function reconcileCoverLetterRuns(runs) {
  const busyRuns = runs.filter(runIsBusy);
  if (!busyRuns.length) return runs;
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const changed = await Promise.all(busyRuns.map((run) => reconcileCoverLetterRun(run, tabs)));
  return changed.some(Boolean) ? coverLetterRuns.list() : runs;
}

async function renderCoverLetterRuns({ reconcile = false } = {}) {
  let runs = await coverLetterRuns.list();
  if (reconcile) runs = await reconcileCoverLetterRuns(runs);
  els.diceCoverLetterRuns.hidden = runs.length === 0;
  els.diceCoverLetterList.textContent = "";
  if (!runs.length) return runs;

  const activeCount = runs.filter(runIsBusy).length;
  els.diceCoverLetterSummary.textContent = activeCount
    ? `${activeCount} running, ${runs.length} total`
    : `${runs.length} recent PDF ${runs.length === 1 ? "run" : "runs"}`;

  const baseUrl = await backendUrl().catch(() => "");
  runs.forEach((run) => {
    const row = document.createElement("div");
    row.className = "cover-letter-run";
    row.dataset.status = run.status || "";

    const title = document.createElement("div");
    title.className = "cover-letter-run-title";
    const strong = document.createElement("strong");
    strong.textContent = runLabel(run);
    const meta = document.createElement("span");
    meta.textContent = runMeta(run);
    title.append(strong, meta);

    const status = document.createElement("p");
    status.className = "cover-letter-run-status";
    status.textContent = run.message || "Waiting for the Dice wizard.";

    const progress = document.createElement("div");
    progress.className = "cover-letter-run-progress";
    progress.setAttribute("aria-hidden", "true");
    progress.append(document.createElement("span"));

    const actions = document.createElement("div");
    actions.className = "cover-letter-run-actions";

    const openUrl = pdfUrl(run.pdf, baseUrl);
    if (openUrl) {
      const openPdf = document.createElement("a");
      openPdf.href = openUrl;
      openPdf.target = "_blank";
      openPdf.rel = "noreferrer";
      openPdf.textContent = "Open PDF";
      actions.append(openPdf);
    }

    const draftId = run.draft_id || run.pdf?.draft_id || "";
    if (draftId) {
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.dataset.action = "reveal-pdf";
      reveal.dataset.draftId = draftId;
      reveal.dataset.jobId = run.job_id || "";
      reveal.textContent = "Finder";
      actions.append(reveal);
    }

    if (!runIsBusy(run)) {
      const start = document.createElement("button");
      start.type = "button";
      start.dataset.action = "start-cover-letter";
      start.dataset.jobId = run.job_id || "";
      start.textContent = run.primary_label || (run.status === "failed" ? "Try again" : "Regenerate PDF");
      actions.append(start);
    }

    row.append(title, status, progress, actions);
    els.diceCoverLetterList.append(row);
  });
  return runs;
}

async function findDiceWizardTab(jobId) {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => tab?.id && isDiceWizardUrl(tab.url || "", jobId)) || null;
}

async function sendStartCoverLetterMessage(tabId, force) {
  const response = await chrome.tabs.sendMessage(tabId, { type: "DICE_COVER_LETTER_START", force });
  if (!response?.ok) throw new Error(response?.error || "Could not start the cover letter PDF.");
  return response;
}

async function startCoverLetterFromSidebar(jobId) {
  const tab = await findDiceWizardTab(jobId);
  if (!tab?.id) throw new Error("Open the Dice wizard tab to regenerate this PDF.");
  try {
    return await sendStartCoverLetterMessage(tab.id, true);
  } catch (_error) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: DICE_WIZARD_SCRIPT_FILES });
    return await sendStartCoverLetterMessage(tab.id, true);
  }
}

async function revealPdfFromSidebar({ jobId, draftId }) {
  await coverLetterRuns.upsert(jobId, {
    busy: true,
    message: "Opening Finder...",
    status: "opening_finder",
  });
  const response = await chrome.runtime.sendMessage({ type: "REVEAL_PDF", draft_id: draftId });
  if (!response?.ok || !response.opened) throw new Error(response?.error || "Could not open the generated PDF in Finder.");
  await coverLetterRuns.upsert(jobId, {
    busy: false,
    message: "Finder opened. Select the generated PDF in Dice's upload box.",
    primary_label: "Regenerate PDF",
    status: "ready",
  });
}

const postingPicker = globalThis.JobApplicationDicePostingPicker.create({
  els,
  activeTab: diceResultsTab,
  injectContentScripts,
  setStatus,
  sleep,
});

function setBusy(isBusy) {
  els.refresh.disabled = isBusy;
  if (isBusy) {
    els.dicePostingNextPage.disabled = true;
    els.dicePostingOpenSelected.disabled = true;
    els.dicePostingSelectAll.disabled = true;
  }
}

postingPicker.attachEvents();

els.diceCoverLetterList.addEventListener("click", async (event) => {
  const button = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
  if (!(button instanceof HTMLButtonElement)) return;
  const action = button.dataset.action || "";
  const jobId = button.dataset.jobId || "";
  try {
    button.disabled = true;
    if (action === "start-cover-letter") {
      await coverLetterRuns.upsert(jobId, {
        busy: true,
        message: "Starting cover letter PDF...",
        status: "reading",
      });
      await startCoverLetterFromSidebar(jobId);
    } else if (action === "reveal-pdf") {
      await revealPdfFromSidebar({ jobId, draftId: button.dataset.draftId || "" });
    }
    await renderCoverLetterRuns({ reconcile: true });
  } catch (error) {
    await coverLetterRuns.upsert(jobId, {
      busy: false,
      error: error.message || String(error),
      message: error.message || String(error),
      primary_label: "Try again",
      status: "failed",
    });
    setStatus(error.message, "error");
    await renderCoverLetterRuns();
  } finally {
    button.disabled = false;
  }
});

els.refresh.addEventListener("click", async () => {
  try {
    setBusy(true);
    await renderCoverLetterRuns();
    const tab = await activeTab();
    if (!isDiceResultsUrl(tab.url || "")) {
      postingPicker.clear();
      setStatus("Dice cover letter PDFs ready.");
      return;
    }
    els.dicePostingStatus.textContent = "Refreshing...";
    await postingPicker.refresh();
    els.dicePostingStatus.textContent = `${postingPicker.count()} Easy Apply on this page.`;
    setStatus("Dice results ready.");
  } catch (error) {
    els.dicePostingStatus.textContent = error.message || "Could not refresh Dice postings.";
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

async function initializeSidePanel() {
  try {
    setBusy(true);
    const runs = await renderCoverLetterRuns({ reconcile: true });
    const tab = await activeTab();
    if (!isDiceResultsUrl(tab.url || "")) {
      postingPicker.clear();
      setStatus(runs.length ? "Dice cover letter PDFs ready." : "Open a Dice results page to list postings.");
      return;
    }
    await postingPicker.refresh();
    els.dicePostingStatus.textContent = `${postingPicker.count()} Easy Apply on this page.`;
    setStatus("Dice results ready.");
  } catch (error) {
    postingPicker.clear();
    els.dicePostingStatus.textContent = error.message || "Could not read Dice postings.";
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

initializeSidePanel();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[coverLetterRuns.key]) {
    renderCoverLetterRuns().catch((error) => setStatus(error.message, "error"));
  }
});

window.setInterval(() => {
  renderCoverLetterRuns().catch(() => {});
}, 2000);

window.setInterval(() => {
  renderCoverLetterRuns({ reconcile: true }).catch(() => {});
}, 10000);
