(() => {
  const CONTENT_SCRIPT_FILES = [
    "extractors/common.js",
    "platforms/dice_opportunity.js",
    "extractors/upwork.js",
    "extractors/dice.js",
    "extractors/indeed.js",
    "extractors/ziprecruiter.js",
    "extractors/roberthalf.js",
    "extractors/linkedin.js",
    "content_script.js",
  ];

  async function inject(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
  }

  globalThis.JobApplicationContentScripts = {
    files: CONTENT_SCRIPT_FILES,
    inject,
  };
})();
