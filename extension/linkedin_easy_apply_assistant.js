(() => {
  if (globalThis.__linkedinEasyApplyAssistantLoaded) {
    return;
  }
  globalThis.__linkedinEasyApplyAssistantLoaded = true;

  const linkedinOpportunity = globalThis.JobApplicationLinkedInOpportunity;
  const AUTO_RUN_KEY = linkedinOpportunity?.autoRunKey || "jobApplicationLinkedInEasyApplyAutoRun";
  const AUTO_RUN_STARTED_AT_KEY = `${AUTO_RUN_KEY}StartedAt`;
  const AUTO_RUN_TIMEOUT_MS = 5 * 60 * 1000;
  const AUTO_CLICK_KEY = "jobApplicationLinkedInEasyApplyAutoClicked";
  const KNOWN_STEP_HEADINGS = new Set([
    "Contact info",
    "Resume",
    "Mark this job as a top choice (Optional)",
    "Mark this job as a top choice",
    "Work experience",
    "Education",
    "Review your application",
  ]);

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function buttonText(button) {
    return clean(button?.textContent || button?.getAttribute("aria-label") || "");
  }

  function autoRunEnabled() {
    if (sessionStorage.getItem(AUTO_RUN_KEY) !== "true") return false;
    const startedAt = Number(sessionStorage.getItem(AUTO_RUN_STARTED_AT_KEY) || "0");
    if (!startedAt) {
      sessionStorage.setItem(AUTO_RUN_STARTED_AT_KEY, String(Date.now()));
      return true;
    }
    if (Date.now() - startedAt > AUTO_RUN_TIMEOUT_MS) {
      clearAutoRun();
      return false;
    }
    return true;
  }

  function clearAutoRun() {
    sessionStorage.removeItem(AUTO_RUN_KEY);
    sessionStorage.removeItem(AUTO_RUN_STARTED_AT_KEY);
  }

  function modalRoot() {
    const root = document.querySelector(".jobs-easy-apply-modal");
    if (root) return root;
    const dataTestModal = document.querySelector('[data-test-modal-id="easy-apply-modal"] [role="dialog"], [data-test-modal-id="easy-apply-modal"]');
    if (dataTestModal) return dataTestModal;
    return Array.from(document.querySelectorAll(".artdeco-modal")).find((modal) => {
      return clean(modal.textContent || "").includes("Apply to ");
    }) || null;
  }

  function exactDescendantText(root, value) {
    return Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6, legend, div, span, label, p")).some((node) => clean(node.textContent || "") === value);
  }

  function knownStepHeading(root) {
    return Array.from(KNOWN_STEP_HEADINGS).find((heading) => exactDescendantText(root, heading)) || "";
  }

  function stepSignature(root) {
    const progressText = clean(root.querySelector('[role="note"]')?.textContent || "");
    return `${knownStepHeading(root)}:${progressText}`;
  }

  function isKnownStep(root) {
    return Boolean(knownStepHeading(root));
  }

  function activeButton(root, selector, textValues = []) {
    const buttons = Array.from(root.querySelectorAll(selector));
    return buttons.find((button) => {
      return !button.disabled && (!textValues.length || textValues.includes(buttonText(button)));
    }) || null;
  }

  function nextButton(root) {
    return activeButton(root, "button[data-live-test-easy-apply-next-button], button[data-easy-apply-next-button]", ["Next"]);
  }

  function reviewButton(root) {
    return activeButton(root, "button[data-live-test-easy-apply-review-button], button[data-easy-apply-review-button], button", ["Review"]);
  }

  function submitButton(root) {
    return activeButton(root, "button[data-live-test-easy-apply-submit-button], button[data-live-test-job-apply-submit-button], button", ["Submit application"]);
  }

  function postSubmitButton(root) {
    return activeButton(root, "button", ["Done", "Not now"]);
  }

  function checkedFollowLabel(root) {
    const checkbox = root.querySelector("#follow-company-checkbox");
    if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox" || !checkbox.checked) return null;
    return checkbox.labels?.[0] || checkbox;
  }

  function clickOnce(button, key = AUTO_CLICK_KEY, scope = "true") {
    if (!button || button.disabled || button.dataset[key] === scope) return false;
    button.dataset[key] = scope;
    window.setTimeout(() => {
      if (button.isConnected && !button.disabled) button.click();
    }, 500);
    return true;
  }

  function knownContinueButton(root) {
    return nextButton(root) || reviewButton(root);
  }

  function markManualIfNeeded(root) {
    if (isKnownStep(root)) return false;
    const hasFormControls = Boolean(root.querySelector("input, select, textarea"));
    if (!hasFormControls) return false;
    root.dataset.jobApplicationLinkedInManualAttention = "true";
    return true;
  }

  function continueEasyApplyAutomation() {
    if (!autoRunEnabled()) return false;
    const root = modalRoot();
    if (!root) {
      return false;
    }

    const closeButton = postSubmitButton(root);
    if (closeButton) {
      if (clickOnce(closeButton, "jobApplicationLinkedInPostSubmitClicked")) {
        clearAutoRun();
      }
      return true;
    }

    const submit = submitButton(root);
    if (submit) {
      const followLabel = checkedFollowLabel(root);
      if (followLabel) followLabel.click();
      return clickOnce(submit, "jobApplicationLinkedInSubmitClicked");
    }

    if (markManualIfNeeded(root)) return false;
    const continueButton = knownContinueButton(root);
    if (continueButton && isKnownStep(root)) {
      return clickOnce(continueButton, "jobApplicationLinkedInContinueClicked", stepSignature(root));
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    continueEasyApplyAutomation();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["aria-label", "disabled", "data-live-test-easy-apply-next-button", "data-live-test-easy-apply-review-button", "data-live-test-easy-apply-submit-button"],
    childList: true,
    subtree: true,
  });

  continueEasyApplyAutomation();
  window.setInterval(continueEasyApplyAutomation, 1000);
})();
