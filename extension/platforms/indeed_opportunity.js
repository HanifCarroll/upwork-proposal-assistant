(() => {
  if (globalThis.JobApplicationIndeedOpportunity) {
    return;
  }

  const common = globalThis.JobApplicationExtractorCommon;
  const { absoluteUrl, clean, opportunity, selectedText, unique } = common;

  function isIndeedResultsUrl(value = location.href) {
    try {
      const url = new URL(value || "");
      return url.hostname.includes("indeed.com") && url.pathname === "/jobs";
    } catch (_error) {
      return false;
    }
  }

  function isIndeedSmartApplyUrl(value = location.href) {
    try {
      const url = new URL(value || "");
      return url.hostname === "smartapply.indeed.com" && url.pathname.includes("/indeedapply/form/");
    } catch (_error) {
      return false;
    }
  }

  function providerData() {
    return globalThis.mosaic?.providerData || {};
  }

  function smartApplyJobKey() {
    const resumeMismatch = providerData()["mosaic-provider-resume-fields-mismatch"] || {};
    return clean(resumeMismatch.metaData?.jk || resumeMismatch.seenData?.jobKey || "");
  }

  function sourceUrlFromJobKey(jobKey) {
    if (!jobKey) return "";
    const url = new URL("/viewjob", "https://www.indeed.com");
    url.searchParams.set("jk", jobKey);
    return url.href;
  }

  function exactDescendantText(root, value) {
    return Array.from(root.querySelectorAll("div, span")).some((node) => clean(node.textContent || "") === value);
  }

  function searchResultTitle(link) {
    return clean(
      link.querySelector("[title]")?.getAttribute("title") ||
        (link.getAttribute("aria-label") || "").replace(/^full details of\s+/i, "") ||
        link.textContent ||
        ""
    );
  }

  function searchResultPostings(root = document) {
    if (!isIndeedResultsUrl()) return [];
    const seenUrls = new Set();
    const postings = [];
    const links = root.querySelectorAll('#mosaic-provider-jobcards a[data-jk][aria-label^="full details of "]');
    for (const link of links) {
      const card = link.closest('[data-testid="fade-in-wrapper"], [data-testid="slider_item"]');
      if (!card || !exactDescendantText(card, "Easily apply")) continue;
      const jobKey = clean(link.getAttribute("data-jk") || "");
      const url = absoluteUrl(link.getAttribute("href") || "") || sourceUrlFromJobKey(jobKey);
      const title = searchResultTitle(link);
      if (!title || !url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      postings.push({
        source: "indeed",
        title,
        url,
        easy_apply_url: url,
        job_key: jobKey,
        company: selectedText(card.querySelector('[data-testid="company-name"]')),
        location: selectedText(card.querySelector('[data-testid="text-location"]')),
      });
    }
    return postings;
  }

  function applyWithIndeedButton(root = document) {
    return Array.from(root.querySelectorAll('button[aria-label^="Apply with Indeed"]')).find((button) => {
      return clean(button.textContent || button.getAttribute("aria-label") || "").startsWith("Apply with Indeed");
    }) || null;
  }

  async function waitForApplyWithIndeedButton(timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const button = applyWithIndeedButton();
      if (button) return button;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return null;
  }

  async function clickApplyWithIndeed() {
    const button = await waitForApplyWithIndeedButton();
    if (!button) {
      return { clicked: false, error: "Indeed Apply with Indeed control was not found on the detail page." };
    }
    button.click();
    return { clicked: true };
  }

  function smartApplyHeaderParts(root = document) {
    const header = root.querySelector('[data-testid="ia-JobHeader-headerContainer"]');
    const blocks = [];
    const pending = header ? [header] : [];
    while (pending.length) {
      const node = pending.shift();
      const children = Array.from(node.children || []).filter((child) => clean(child.textContent || ""));
      if (!children.length) {
        const text = clean(node.textContent || "");
        if (text) blocks.push(text);
        continue;
      }
      pending.push(...children);
    }
    const title = clean(blocks[0] || "");
    const subtitle = clean(blocks[1] || "");
    return { title, subtitle };
  }

  function smartApplyCompany() {
    const resumeMismatch = providerData()["mosaic-provider-resume-fields-mismatch"] || {};
    return clean(resumeMismatch.metaData?.jobCompany || "");
  }

  function smartApplyLocation(company, subtitle) {
    const prefix = company ? `${company} - ` : "";
    if (prefix && subtitle.startsWith(prefix)) return clean(subtitle.replace(prefix, ""));
    return clean(subtitle);
  }

  function smartApplyOpportunity(root = document) {
    if (!isIndeedSmartApplyUrl()) return null;
    const jobKey = smartApplyJobKey();
    const { title, subtitle } = smartApplyHeaderParts(root);
    const company = smartApplyCompany();
    const details = root.querySelector('[data-testid="JobInfoCard-wrapper"]');
    const description = selectedText(details);
    return opportunity("indeed", {
      source_url: sourceUrlFromJobKey(jobKey) || location.href,
      title,
      company,
      location: smartApplyLocation(company, subtitle),
      employment_type: "",
      description,
      skills: unique([]),
      extraction_warnings: [
        ...(jobKey ? [] : ["Indeed smartapply job key was not found; application logging will use the current apply URL."]),
        ...(description ? [] : ["Indeed smartapply job summary was not found; review the snapshot before drafting."]),
      ],
    });
  }

  globalThis.JobApplicationIndeedOpportunity = {
    applyWithIndeedButton,
    clickApplyWithIndeed,
    isIndeedResultsUrl,
    isIndeedSmartApplyUrl,
    searchResultPostings,
    smartApplyJobKey,
    smartApplyOpportunity,
    sourceUrlFromJobKey,
  };
})();
