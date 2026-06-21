(() => {
  if (globalThis.__diceCoverLetterAssistantLoaded) {
    return;
  }
  globalThis.__diceCoverLetterAssistantLoaded = true;

  const PANEL_ID = "job-application-dice-cover-letter-panel";
  const AUTO_STARTED_KEY = "jobApplicationDiceCoverLetterAutoStarted";
  const AUTO_NEXT_KEY = "jobApplicationDiceCoverLetterAutoNext";
  const AUTO_NEXT_MAX_ATTEMPTS = 3;
  const AUTO_SUBMIT_KEY = "jobApplicationDiceSubmitAutoClicked";
  const COVER_LETTER_SELECTOR = '[data-testid="cover-letter"]';

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function jobApplicationId() {
    return location.pathname.match(/^\/job-applications\/([^/]+)\/wizard/)?.[1] || "";
  }

  function isDiceWizard() {
    return location.hostname.includes("dice.com") && Boolean(jobApplicationId());
  }

  function isDiceWizardSuccessStep() {
    return location.hostname.includes("dice.com") && /^\/job-applications\/[^/]+\/wizard\/success\/?$/.test(location.pathname);
  }

  function removePanel() {
    document.getElementById(PANEL_ID)?.remove();
  }

  function coverLetterSection() {
    const declared = document.querySelector(COVER_LETTER_SELECTOR);
    if (declared) return declared;
    return Array.from(document.querySelectorAll("form > div")).find((section) => {
      const labels = Array.from(section.querySelectorAll("span")).map((label) => clean(label.textContent));
      return labels.includes("Cover letter") && !labels.some((label) => label === "Resume" || label.startsWith("Resume "));
    }) || null;
  }

  function isResumeCoverLetterStep() {
    if (!isDiceWizard()) return false;
    return Boolean(
      coverLetterSection() ||
        document.querySelector('input[type="file"][accept*="pdf"]') ||
        document.querySelector('input[type="file"]')
    );
  }

  function ensurePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) return existing;
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <style>
        #${PANEL_ID} {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483647;
          width: min(360px, calc(100vw - 36px));
          border: 1px solid #b8d8ca;
          border-radius: 8px;
          padding: 12px;
          background: #f4fbf8;
          box-shadow: 0 12px 30px rgba(23, 32, 28, 0.16);
          color: #17201c;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        #${PANEL_ID} strong {
          display: block;
          margin-bottom: 4px;
          color: #15533f;
          font-size: 13px;
          line-height: 1.25;
        }
        #${PANEL_ID} p {
          margin: 0 0 10px;
          color: #4d6259;
          font-size: 12px;
          line-height: 1.35;
        }
        #${PANEL_ID} [data-role="actions"] {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        #${PANEL_ID} a,
        #${PANEL_ID} button {
          border: 1px solid #1f6f55;
          border-radius: 7px;
          padding: 7px 10px;
          background: #1f6f55;
          color: #fff;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
          text-decoration: none;
        }
        #${PANEL_ID} a.secondary,
        #${PANEL_ID} button.secondary {
          background: #fff;
          color: #1f6f55;
        }
        #${PANEL_ID} button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
      </style>
      <strong>Cover letter assistant</strong>
      <p data-role="status">Ready to generate a cover letter PDF.</p>
      <div data-role="actions">
        <button type="button" data-role="primary">Generate PDF</button>
        <a class="secondary" data-role="open-pdf" target="_blank" rel="noreferrer" hidden>Open PDF</a>
        <button class="secondary" type="button" data-role="reveal-pdf" hidden>Show in Finder</button>
      </div>
    `;
    panel.querySelector('[data-role="primary"]')?.addEventListener("click", () => {
      startCoverLetterFlow({ force: true });
    });
    panel.querySelector('[data-role="reveal-pdf"]')?.addEventListener("click", () => {
      revealCurrentPdf().catch((error) => setPanelStatus(error.message || String(error), { label: "Generate PDF" }));
    });
    document.documentElement.appendChild(panel);
    return panel;
  }

  let panelStatus = "";
  let panelBusy = false;
  let panelLabel = "";

  function setPanelStatus(message, { busy = false, label = "" } = {}) {
    const resolvedLabel = label || (busy ? "Working..." : "Generate PDF");
    if (message === panelStatus && busy === panelBusy && resolvedLabel === panelLabel) {
      return;
    }
    panelStatus = message;
    panelBusy = busy;
    panelLabel = resolvedLabel;
    const panel = ensurePanel();
    const status = panel.querySelector('[data-role="status"]');
    const primary = panel.querySelector('[data-role="primary"]');
    if (status) status.textContent = message;
    if (primary instanceof HTMLButtonElement) {
      primary.disabled = busy;
      primary.textContent = resolvedLabel;
    }
  }

  let activeRun = null;
  let currentPdf = null;
  let currentDraftId = "";
  let autoStartedForJobId = "";
  let stepPollTimer = 0;
  let stepPollCount = 0;
  let lastKnownHref = location.href;
  let wizardAutomationTimer = 0;
  let wizardObserver = null;

  function startCoverLetterFlow(options = {}) {
    if (activeRun) return;
    activeRun = runCoverLetterFlow(options)
      .catch((error) => setPanelStatus(error.message || String(error), { label: "Try again" }))
      .finally(() => {
        activeRun = null;
      });
  }

  async function runCoverLetterFlow({ force = false } = {}) {
    if (!isResumeCoverLetterStep()) return;
    const jobId = jobApplicationId();
    const autoKey = `${AUTO_STARTED_KEY}:${jobId}`;
    if (!force && sessionStorage.getItem(autoKey)) return;
    sessionStorage.setItem(autoKey, new Date().toISOString());

    setPanelStatus("Reading Dice job details...", { busy: true });
    const opportunity = await diceDetailOpportunity(jobId);
    const request = {
      opportunity,
      draft_type: "cover_letter",
      user_notes: "",
      style: "concise",
    };

    const draft = await existingOrGeneratedDraft(opportunity.source_url, request);
    currentDraftId = draft.id;
    setPanelStatus("Generating PDF...", { busy: true });
    const pdf = await startPdfExport(draft.id);
    await showPdfActions(pdf, draft.id);
    setPanelStatus(`PDF ready: ${pdf.filename}. Use Dice's cover-letter upload box to attach it.`, { label: "Regenerate PDF" });
  }

  async function existingOrGeneratedDraft(sourceUrl, request) {
    const existing = await chrome.runtime.sendMessage({ type: "LOOKUP_DRAFT", source_url: sourceUrl });
    if (existing?.ok && existing.matched && existing.draft?.id) {
      setPanelStatus("Using existing draft...", { busy: true });
      return existing.draft;
    }
    if (existing && !existing.ok) {
      throw new Error(existing.error || "Could not check for an existing draft.");
    }

    setPanelStatus("Starting cover letter draft...", { busy: true });
    const started = await chrome.runtime.sendMessage({ type: "START_DRAFT_JOB", request });
    if (!started?.ok) {
      throw new Error(started?.error || "Could not start the cover letter draft.");
    }
    const jobId = started.state?.job_id;
    if (!jobId) throw new Error("Draft job did not return an id.");
    return pollDraftJob(jobId);
  }

  async function pollDraftJob(jobId) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 240000) {
      const response = await chrome.runtime.sendMessage({ type: "GET_DRAFT_JOB", job_id: jobId });
      if (!response?.ok) throw new Error(response?.error || "Could not check draft job status.");
      const job = response.job;
      setPanelStatus(`Drafting cover letter: ${job.stage || job.status}...`, { busy: true });
      if (job.status === "succeeded") {
        if (!job.result?.id) throw new Error("Draft job succeeded without a draft id.");
        return job.result;
      }
      if (job.status === "failed") {
        throw new Error(job.error || "Cover letter draft failed.");
      }
      await sleep(1200);
    }
    throw new Error("Cover letter draft timed out.");
  }

  async function startPdfExport(draftId) {
    const response = await chrome.runtime.sendMessage({ type: "START_PDF_EXPORT", draft_id: draftId });
    if (!response?.ok) throw new Error(response?.error || "Could not generate PDF.");
    if (!response.pdf?.download_url || !response.pdf?.filename) throw new Error("PDF export did not return a downloadable file.");
    return response.pdf;
  }

  async function showPdfActions(pdf, draftId) {
    currentPdf = pdf;
    currentDraftId = draftId;
    const apiBase = await backendUrl();
    const panel = ensurePanel();
    const openPdf = panel.querySelector('[data-role="open-pdf"]');
    const revealPdf = panel.querySelector('[data-role="reveal-pdf"]');
    if (openPdf instanceof HTMLAnchorElement) {
      openPdf.href = new URL(pdf.download_url, apiBase).href;
      openPdf.hidden = false;
    }
    if (revealPdf instanceof HTMLButtonElement) {
      revealPdf.hidden = false;
    }
  }

  async function backendUrl() {
    const response = await chrome.runtime.sendMessage({ type: "GET_BACKEND_URL" });
    if (!response?.ok) throw new Error(response?.error || "Could not read backend URL.");
    return response.api_base;
  }

  async function revealCurrentPdf() {
    if (!currentDraftId && !currentPdf?.draft_id) {
      throw new Error("Generate the PDF before opening Finder.");
    }
    setPanelStatus("Opening Finder...", { busy: true });
    const response = await chrome.runtime.sendMessage({ type: "REVEAL_PDF", draft_id: currentDraftId || currentPdf.draft_id });
    if (!response?.ok || !response.opened) throw new Error(response?.error || "Could not open the generated PDF in Finder.");
    setPanelStatus(`Finder opened. Select ${currentPdf?.filename || "the generated PDF"} in Dice's upload box.`, { label: "Regenerate PDF" });
  }

  async function diceDetailOpportunity(jobId) {
    const sourceUrl = new URL(`/job-detail/${jobId}`, location.origin).href;
    const response = await fetch(sourceUrl, { credentials: "include" });
    if (!response.ok) throw new Error(`Could not read Dice job details: ${response.status}`);
    const documentText = await response.text();
    const parsed = new DOMParser().parseFromString(documentText, "text/html");
    const job = jobPostingJsonLd(parsed);
    if (!job?.title) throw new Error("Dice structured job details were not found.");
    const company = orgName(job.hiringOrganization);
    return {
      source: "dice",
      source_url: clean(job.url) || sourceUrl,
      captured_at: new Date().toISOString(),
      title: clean(job.title),
      company,
      location: diceLocationFromJsonLd(job),
      employment_type: diceEmploymentTypeFromJsonLd(job),
      description: htmlToText(job.description),
      responsibilities: [],
      requirements: [],
      nice_to_haves: [],
      skills: unique([
        ...jsonLdStringList(job.skills),
        ...jsonLdStringList(job.occupationalCategory),
      ]),
      application_questions: [],
      company_context: "",
      recruiter_or_client_context: "",
      extraction_warnings: company ? [] : ["Dice structured job details did not include company."],
    };
  }

  function jobPostingJsonLd(root) {
    return jsonLdObjects(root).find((item) => {
      const type = item["@type"];
      return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
    });
  }

  function jsonLdObjects(root) {
    const values = [];
    for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || "null");
        values.push(...flattenJsonLd(parsed));
      } catch (_error) {
        // Ignore malformed structured data from third-party pages.
      }
    }
    return values;
  }

  function flattenJsonLd(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
    if (typeof value !== "object") return [];
    const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenJsonLd) : [];
    return [value, ...graph];
  }

  function jsonLdStringList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(jsonLdStringList);
    if (typeof value === "object") return [value.name, value.value, value.termCode].flatMap(jsonLdStringList);
    return clean(String(value)).split(/[,;|]/).map(clean).filter(Boolean);
  }

  function orgName(value) {
    if (!value) return "";
    if (Array.isArray(value)) return orgName(value[0]);
    if (typeof value === "object") return clean(value.name || "");
    return clean(String(value));
  }

  function diceLocationFromJsonLd(job) {
    const requirements = job?.applicantLocationRequirements;
    const jobLocation = Array.isArray(job?.jobLocation) ? job.jobLocation[0] : job?.jobLocation;
    const address = jobLocation?.address;
    return clean(
      [
        job?.jobLocationType === "TELECOMMUTE" ? "Remote" : "",
        orgName(requirements),
        address?.addressLocality,
        address?.addressRegion,
        address?.addressCountry,
      ]
        .filter(Boolean)
        .join(", ")
    );
  }

  function diceEmploymentTypeFromJsonLd(job) {
    const value = jsonLdStringList(job?.employmentType).join(" ");
    if (!value) return "";
    const normalized = value.toUpperCase().replace(/[_\s]+/g, "_");
    const labels = {
      CONTRACTOR: "Contract",
      TEMPORARY: "Contract",
      FULL_TIME: "Full-time",
      PART_TIME: "Part-time",
    };
    return labels[normalized] || clean(value);
  }

  function htmlToText(html) {
    const template = document.createElement("template");
    template.innerHTML = html || "";
    return clean(template.content.textContent || "");
  }

  function unique(values) {
    return Array.from(new Set(values.map(clean).filter(Boolean)));
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function jobScopedKey(prefix) {
    return `${prefix}:${jobApplicationId() || location.pathname}`;
  }

  function sessionCount(key) {
    const count = Number.parseInt(sessionStorage.getItem(key) || "0", 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  function usableButton(button) {
    return (
      button instanceof HTMLButtonElement &&
      !button.disabled &&
      button.getAttribute("aria-disabled") !== "true" &&
      button.offsetParent !== null
    );
  }

  function wizardButton(label) {
    return Array.from(document.querySelectorAll("button")).find((button) => {
      return usableButton(button) && clean(button.textContent || button.getAttribute("aria-label") || "") === label;
    }) || null;
  }

  function coverLetterAttachmentPresent() {
    const coverLetter = coverLetterSection();
    if (!coverLetter) return false;
    const text = clean(coverLetter.textContent || "");
    return /\.pdf/i.test(text) && /\bNew file\b/i.test(text);
  }

  function clickNextAfterCoverLetterIfReady() {
    if (!isResumeCoverLetterStep() || !coverLetterAttachmentPresent()) return false;
    const next = wizardButton("Next");
    if (!next) return false;

    const key = jobScopedKey(AUTO_NEXT_KEY);
    const attempts = sessionCount(key);
    if (attempts >= AUTO_NEXT_MAX_ATTEMPTS) return false;
    sessionStorage.setItem(key, String(attempts + 1));

    setPanelStatus("Cover letter attached. Continuing to review...", { busy: true, label: "Continuing..." });
    const hrefBeforeClick = location.href;
    window.setTimeout(() => {
      next.click();
      window.setTimeout(() => {
        if (location.href === hrefBeforeClick && wizardButton("Next") && coverLetterAttachmentPresent()) {
          scheduleWizardAutomation(0);
        }
      }, 1500);
    }, 0);
    return true;
  }

  function clickSubmitIfReady() {
    if (!isDiceWizard() || isDiceWizardSuccessStep()) return false;
    const submit = wizardButton("Submit");
    if (!submit) return false;

    const key = jobScopedKey(AUTO_SUBMIT_KEY);
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, new Date().toISOString());

    setPanelStatus("Submitting Dice application...", { busy: true, label: "Submitting..." });
    window.setTimeout(() => submit.click(), 0);
    return true;
  }

  function advanceWizardIfReady() {
    if (!isDiceWizard() || isDiceWizardSuccessStep()) return false;
    ensurePanel();
    return clickSubmitIfReady() || clickNextAfterCoverLetterIfReady();
  }

  function scheduleWizardAutomation(delay = 250) {
    window.clearTimeout(wizardAutomationTimer);
    wizardAutomationTimer = window.setTimeout(() => {
      advanceWizardIfReady();
    }, delay);
  }

  function installWizardAutomationWatcher() {
    if (wizardObserver) return;
    wizardObserver = new MutationObserver(() => scheduleWizardAutomation());
    wizardObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ["aria-disabled", "data-testid", "disabled"],
    });
    window.setInterval(() => scheduleWizardAutomation(0), 1200);
  }

  function maybeStart() {
    if (!isDiceWizard() || isDiceWizardSuccessStep()) {
      removePanel();
      return;
    }
    ensurePanel();
    if (advanceWizardIfReady()) return;
    if (!isResumeCoverLetterStep()) {
      setPanelStatus("Waiting for the Resume & Cover Letter step.");
      return;
    }
    const jobId = jobApplicationId();
    if (autoStartedForJobId === jobId) return;
    autoStartedForJobId = jobId;
    startCoverLetterFlow();
  }

  function startStepPolling() {
    window.clearInterval(stepPollTimer);
    stepPollCount = 0;
    pollForResumeStep();
    stepPollTimer = window.setInterval(pollForResumeStep, 1000);
  }

  function pollForResumeStep() {
    stepPollCount += 1;
    maybeStart();
    if (!isDiceWizard() || isDiceWizardSuccessStep() || autoStartedForJobId === jobApplicationId() || stepPollCount >= 120) {
      window.clearInterval(stepPollTimer);
    }
  }

  function handleRouteChange({ force = false } = {}) {
    if (!force && location.href === lastKnownHref) return;
    lastKnownHref = location.href;
    window.clearInterval(stepPollTimer);
    if (!isDiceWizard() || isDiceWizardSuccessStep()) {
      removePanel();
      return;
    }
    startStepPolling();
    scheduleWizardAutomation();
  }

  function installRouteWatcher() {
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        window.setTimeout(() => handleRouteChange(), 0);
        return result;
      };
    }
    window.addEventListener("popstate", () => handleRouteChange());
    window.setInterval(() => handleRouteChange(), 1000);
  }

  installRouteWatcher();
  installWizardAutomationWatcher();
  window.setTimeout(() => handleRouteChange({ force: true }), 600);
})();
