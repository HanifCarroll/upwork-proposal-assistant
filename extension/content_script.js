(() => {
  globalThis.__jobApplicationDraftAssistantLoaded = true;

  const common = globalThis.JobApplicationExtractorCommon;
  const registry = globalThis.JobApplicationExtractors;

  async function platformPostings(adapter) {
    const list = adapter?.listSearchResultPostings || adapter?.searchResultPostings;
    if (typeof list !== "function") return [];
    const postings = await list.call(adapter);
    return Array.isArray(postings) ? postings : [];
  }

  async function listPlatformPostings() {
    return [
      ...(await platformPostings(globalThis.JobApplicationDiceOpportunity)),
      ...(await platformPostings(globalThis.JobApplicationIndeedOpportunity)),
      ...(await platformPostings(globalThis.JobApplicationLinkedInOpportunity)),
    ];
  }

  async function clickDiceApplyControl() {
    const dice = globalThis.JobApplicationDiceOpportunity;
    if (typeof dice?.clickDetailEasyApply !== "function") {
      throw new Error("Dice Easy Apply support is unavailable on this page.");
    }
    return dice.clickDetailEasyApply();
  }

  async function clickPlatformApplyControl() {
    if (location.hostname.includes("dice.com")) return clickDiceApplyControl();
    if (location.hostname.includes("indeed.com")) {
      const indeed = globalThis.JobApplicationIndeedOpportunity;
      if (typeof indeed?.clickApplyWithIndeed !== "function") {
        throw new Error("Indeed Apply with Indeed support is unavailable on this page.");
      }
      return indeed.clickApplyWithIndeed();
    }
    if (location.hostname.includes("linkedin.com")) {
      const linkedin = globalThis.JobApplicationLinkedInOpportunity;
      if (typeof linkedin?.clickEasyApply !== "function") {
        throw new Error("LinkedIn Easy Apply support is unavailable on this page.");
      }
      return linkedin.clickEasyApply();
    }
    throw new Error("Platform apply support is unavailable on this page.");
  }

  async function extractOpportunity() {
    const adapter = registry.adapters.find((candidate) => candidate.matches());
    if (!adapter) {
      return common.opportunity("generic", {
        description: "",
        extraction_warnings: ["No site adapter matched this page; no generic page text was extracted."],
      });
    }
    const snapshot = await adapter.extract();
    return {
      ...snapshot,
      source: adapter.id,
      source_url: snapshot.source_url || location.href,
    };
  }

  globalThis.__applicationDraftAssistantExtract = extractOpportunity;
  globalThis.__applicationDraftAssistantListPostings = listPlatformPostings;

  if (globalThis.chrome?.runtime?.onMessage && !globalThis.__applicationDraftAssistantMessageListenerInstalled) {
    globalThis.__applicationDraftAssistantMessageListenerInstalled = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "APPLICATION_DRAFT_LIST_POSTINGS") {
        Promise.resolve(globalThis.__applicationDraftAssistantListPostings())
          .then((postings) => sendResponse({ ok: true, postings }))
          .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
        return true;
      }
      if (message?.type === "APPLICATION_DRAFT_CLICK_APPLY_CONTROL") {
        clickPlatformApplyControl()
          .then((result) => sendResponse({ ok: true, ...result }))
          .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
        return true;
      }
      if (message?.type === "APPLICATION_DRAFT_EXTRACT") {
        globalThis.__applicationDraftAssistantExtract()
          .then((snapshot) => sendResponse({ ok: true, opportunity: snapshot }))
          .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
        return true;
      }
      return false;
    });
  }
})();
