(() => {
  if (globalThis.JobApplicationLinkedInOpportunity) {
    return;
  }

  const common = globalThis.JobApplicationExtractorCommon;
  const { absoluteUrl, clean, selectedText } = common;

  const AUTO_RUN_KEY = "jobApplicationLinkedInEasyApplyAutoRun";
  const EASY_APPLY_CONTROL_SELECTOR = [
    "button[data-live-test-job-apply-button][data-job-id]",
    'a[href*="/jobs/view/"][href*="/apply/"][href*="openSDUIApplyFlow=true"]',
    'a[aria-label="Easy Apply to this job"]',
  ].join(", ");

  function isLinkedInResultsUrl(value = location.href) {
    try {
      const url = new URL(value || "");
      return url.hostname.includes("linkedin.com") && url.pathname === "/jobs/search/";
    } catch (_error) {
      return false;
    }
  }

  function isLinkedInJobUrl(value = location.href) {
    try {
      const url = new URL(value || "");
      return url.hostname.includes("linkedin.com") && /^\/jobs\/view\/\d+\/?/.test(url.pathname);
    } catch (_error) {
      return false;
    }
  }

  function linkedinJobId(value = location.href) {
    try {
      const url = new URL(value || "");
      const currentJobId = clean(url.searchParams.get("currentJobId") || "");
      if (/^\d+$/.test(currentJobId)) return currentJobId;
      const pathMatch = url.pathname.match(/^\/jobs\/view\/(\d+)\/?/);
      if (pathMatch) return pathMatch[1];
    } catch (_error) {
      return "";
    }
    return clean(document.querySelector("button[data-live-test-job-apply-button][data-job-id]")?.getAttribute("data-job-id") || "");
  }

  function sourceUrlFromJobId(jobId) {
    if (!jobId) return "";
    return absoluteUrl(`/jobs/view/${jobId}/`) || `https://www.linkedin.com/jobs/view/${jobId}/`;
  }

  function exactDescendantText(root, value) {
    return Array.from(root.querySelectorAll("li, span")).some((node) => clean(node.textContent || "") === value);
  }

  function normalizeTitle(value) {
    return clean(value).replace(/\s+with verification$/i, "");
  }

  function searchResultTitle(card) {
    const link = card.querySelector('a[href*="/jobs/view/"]');
    return normalizeTitle(link?.getAttribute("aria-label") || link?.textContent || "");
  }

  function searchResultPostings(root = document) {
    if (!isLinkedInResultsUrl()) return [];
    const seenUrls = new Set();
    const postings = [];
    const cards = root.querySelectorAll('li[data-occludable-job-id] [data-job-id]');
    for (const card of cards) {
      if (!exactDescendantText(card, "Easy Apply")) continue;
      const jobId = clean(card.getAttribute("data-job-id") || card.closest("li[data-occludable-job-id]")?.getAttribute("data-occludable-job-id") || "");
      const url = sourceUrlFromJobId(jobId);
      const title = searchResultTitle(card);
      if (!jobId || !title || !url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      postings.push({
        source: "linkedin",
        title,
        url,
        easy_apply_url: url,
        job_key: jobId,
        company: selectedText(card.querySelector(".artdeco-entity-lockup__subtitle span")),
        location: selectedText(card.querySelector(".artdeco-entity-lockup__caption span")),
      });
    }
    return postings;
  }

  function searchResultsList() {
    return document.querySelector("li[data-occludable-job-id]")?.closest("ul") || null;
  }

  function searchResultsScroller() {
    let node = searchResultsList();
    while (node && node !== document.body) {
      if (node.scrollHeight > node.clientHeight + 20) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function mergePostings(target, nextPostings) {
    nextPostings.forEach((posting) => {
      if (posting?.url && !target.has(posting.url)) target.set(posting.url, posting);
    });
  }

  async function listSearchResultPostings() {
    if (!isLinkedInResultsUrl()) return [];
    const scroller = searchResultsScroller();
    if (!scroller) return searchResultPostings();

    const originalTop = scroller.scrollTop;
    const postings = new Map();
    let previousHeight = -1;
    let stableBottomCount = 0;

    for (let step = 0; step < 30; step += 1) {
      mergePostings(postings, searchResultPostings());

      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const atBottom = scroller.scrollTop >= maxTop - 4;
      if (atBottom && previousHeight === scroller.scrollHeight) {
        stableBottomCount += 1;
      } else {
        stableBottomCount = 0;
      }
      if (stableBottomCount >= 2) break;

      previousHeight = scroller.scrollHeight;
      scroller.scrollTop = atBottom ? maxTop : Math.min(maxTop, scroller.scrollTop + Math.max(400, scroller.clientHeight * 0.85));
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    mergePostings(postings, searchResultPostings());
    scroller.scrollTop = originalTop;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    return Array.from(postings.values());
  }

  function easyApplyLabel(control) {
    return clean(control?.getAttribute("aria-label") || control?.textContent || "");
  }

  function easyApplyHref(control) {
    return control instanceof HTMLAnchorElement ? control.href : "";
  }

  function isEasyApplyControl(control) {
    if (!(control instanceof HTMLElement)) return false;
    const href = easyApplyHref(control);
    const label = easyApplyLabel(control);
    return label === "Easy Apply to this job" || /^Easy Apply to .+ at .+$/.test(label) || clean(control.textContent || "") === "Easy Apply" || href.includes("/apply/?openSDUIApplyFlow=true");
  }

  function easyApplyControl(jobId = linkedinJobId()) {
    if (jobId) {
      const button = document.querySelector(`button[data-live-test-job-apply-button][data-job-id="${jobId}"]`);
      if (button) return button;
      const link = document.querySelector(`a[href*="/jobs/view/${jobId}/"][href*="/apply/"][href*="openSDUIApplyFlow=true"]`);
      if (link) return link;
    }
    return Array.from(document.querySelectorAll(EASY_APPLY_CONTROL_SELECTOR)).find(isEasyApplyControl) || null;
  }

  function easyApplyButton(jobId = linkedinJobId()) {
    return easyApplyControl(jobId);
  }

  async function waitForEasyApplyControl(timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const control = easyApplyControl();
      if (control) return control;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return null;
  }

  function enableAutoRunForEasyApplyClicks() {
    document.addEventListener("click", (event) => {
      const control = event.target instanceof Element ? event.target.closest(EASY_APPLY_CONTROL_SELECTOR) : null;
      if (isEasyApplyControl(control)) sessionStorage.setItem(AUTO_RUN_KEY, "true");
    }, true);
  }

  async function clickEasyApply() {
    const response = {
      source: "linkedin",
      auto_run_key: AUTO_RUN_KEY,
      activate_after_navigation: true,
    };
    const control = await waitForEasyApplyControl();
    if (!control) {
      return { clicked: false, error: "LinkedIn Easy Apply control was not found on the job page." };
    }
    sessionStorage.setItem(AUTO_RUN_KEY, "true");
    const nextUrl = easyApplyHref(control);
    if (nextUrl) {
      return { ...response, clicked: true, next_url: nextUrl, reload_after_navigation: false };
    }
    control.click();
    return { ...response, clicked: true };
  }

  enableAutoRunForEasyApplyClicks();

  globalThis.JobApplicationLinkedInOpportunity = {
    autoRunKey: AUTO_RUN_KEY,
    clickEasyApply,
    easyApplyButton,
    easyApplyControl,
    isLinkedInJobUrl,
    isLinkedInResultsUrl,
    linkedinJobId,
    listSearchResultPostings,
    searchResultPostings,
    sourceUrlFromJobId,
  };
})();
