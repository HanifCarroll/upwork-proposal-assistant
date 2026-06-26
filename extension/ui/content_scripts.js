(() => {
  const CONTENT_SCRIPT_FILES = [
    "extractors/common.js",
    "platforms/dice_opportunity.js",
    "platforms/indeed_opportunity.js",
    "platforms/linkedin_opportunity.js",
    "extractors/upwork.js",
    "extractors/dice.js",
    "extractors/indeed.js",
    "extractors/ziprecruiter.js",
    "extractors/roberthalf.js",
    "extractors/linkedin.js",
    "content_script.js",
  ];
  const LINKEDIN_EASY_APPLY_SCRIPT_FILES = [
    "extractors/common.js",
    "platforms/linkedin_opportunity.js",
    "extractors/linkedin.js",
    "ui/cover_letter_runs.js",
    "content_script.js",
    "application/ledger_badge.js",
    "application_logger.js",
    "linkedin_easy_apply_assistant.js",
  ];

  async function inject(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
  }

  async function injectLinkedInEasyApply(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: LINKEDIN_EASY_APPLY_SCRIPT_FILES });
  }

  async function setSessionStorage(tabId, key, value) {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [key, value],
      func: (storageKey, storageValue) => {
        sessionStorage.setItem(storageKey, storageValue);
      },
    });
  }

  globalThis.JobApplicationContentScripts = {
    files: CONTENT_SCRIPT_FILES,
    inject,
    injectLinkedInEasyApply,
    setSessionStorage,
  };
})();
