(() => {
  if (globalThis.__jobApplicationDraftAssistantLoaded) {
    return;
  }
  globalThis.__jobApplicationDraftAssistantLoaded = true;

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return Array.from(new Set(values.map(clean).filter(Boolean)));
  }

  function firstText(selectors, root = document) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = clean(element?.textContent || "");
      if (text) return text;
    }
    return "";
  }

  function selectedText(element) {
    return clean(element?.textContent || "");
  }

  function firstElement(selectors, root = document) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function htmlToText(html) {
    const template = document.createElement("template");
    template.innerHTML = html || "";
    return clean(template.content.textContent || "");
  }

  function jsonLdObjects() {
    const values = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
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

  function jobPostingJsonLd() {
    return jsonLdObjects().find((item) => {
      const type = item["@type"];
      return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
    });
  }

  function orgName(value) {
    if (!value) return "";
    if (Array.isArray(value)) return orgName(value[0]);
    if (typeof value === "object") return clean(value.name || "");
    return clean(String(value));
  }

  function locationFromJsonLd(job) {
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

  function employmentTypeFromJsonLd(job) {
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

  function upworkSkills(root) {
    const domSkills = Array.from(
      root.querySelectorAll(
        '[data-qa-skill-key] span, [data-qa-skill-uid] span, [data-test="attr-item"], a[href*="ontology_skill_uid"], a[href*="/cat/"], a[href*="/freelance-jobs/"]'
      )
    )
      .map((node) => clean(node.textContent || ""))
      .filter(Boolean);
    return unique(domSkills);
  }

  function jsonLdStringList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(jsonLdStringList);
    if (typeof value === "object") {
      return [value.name, value.value, value.termCode].flatMap(jsonLdStringList);
    }
    return clean(String(value)).split(/[,;|]/).map(clean).filter(Boolean);
  }

  function diceJobSkills(job) {
    return unique([
      ...jsonLdStringList(job?.skills),
      ...jsonLdStringList(job?.occupationalCategory),
      ...diceVisibleSkillChips(),
    ]);
  }

  async function waitForDiceVisibleSkillChips(timeoutMs = 2500) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (diceVisibleSkillChips().length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  function diceVisibleSkillChips(root = document) {
    const jobDetailsHeading = Array.from(root.querySelectorAll('h2')).find((node) => clean(node.textContent) === "Job Details");
    const jobDetailsSection = jobDetailsHeading?.parentElement;
    if (!jobDetailsSection) return [];
    const skillsHeading = Array.from(jobDetailsSection.querySelectorAll('h3')).find((node) => clean(node.textContent) === "Skills");
    const skillsList = skillsHeading?.nextElementSibling;
    if (skillsList?.tagName !== "UL") return [];
    return unique(Array.from(skillsList.children).map((node) => clean(node.textContent || "")));
  }

  function absoluteUrl(href) {
    const value = clean(href);
    if (!value) return "";
    try {
      return new URL(value, location.origin).href;
    } catch (_error) {
      return "";
    }
  }

  function diceEasyApplyLink(root = document) {
    return Array.from(root.querySelectorAll('a')).find((link) => clean(link.textContent || link.getAttribute("aria-label") || "") === "Easy Apply") || null;
  }

  function diceSearchResultPostings(root = document) {
    if (!location.hostname.includes("dice.com") || location.pathname !== "/jobs") return [];
    const seenUrls = new Set();
    const postings = [];
    for (const card of root.querySelectorAll('[data-testid="job-card"]')) {
      const easyApply = diceEasyApplyLink(card);
      if (!easyApply) continue;
      const link = card.querySelector('[data-testid="job-search-job-detail-link"]');
      const title = clean(link?.textContent || "");
      const url = absoluteUrl(link?.getAttribute("href") || "");
      if (!title || !url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      postings.push({
        title,
        url,
        easy_apply_url: absoluteUrl(easyApply.getAttribute("href") || "") || url,
      });
    }
    return postings;
  }

  function diceDetailEasyApplyLink(root = document) {
    if (!location.hostname.includes("dice.com") || !location.pathname.startsWith("/job-detail/")) return null;
    const link = root.querySelector('[data-testid="apply-button"]');
    if (!link || clean(link.textContent || link.getAttribute("aria-label") || "") !== "Easy Apply") return null;
    return link;
  }

  async function waitForDiceDetailEasyApplyLink(timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const link = diceDetailEasyApplyLink();
      if (link) return link;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return null;
  }

  async function clickDiceDetailEasyApply() {
    const link = await waitForDiceDetailEasyApplyLink();
    if (!link) {
      return { clicked: false, error: "Dice Easy Apply control was not found on the detail page." };
    }
    const nextUrl = absoluteUrl(link.getAttribute("href") || "");
    setTimeout(() => link.click(), 0);
    return { clicked: true, next_url: nextUrl };
  }

  function opportunity(source, values) {
    const description = clean(values.description);
    const skills = unique(values.skills || []);
    return {
      source,
      source_url: values.source_url || location.href,
      captured_at: new Date().toISOString(),
      title: clean(values.title),
      company: clean(values.company),
      location: clean(values.location),
      employment_type: clean(values.employment_type),
      description,
      responsibilities: values.responsibilities || [],
      requirements: values.requirements || [],
      nice_to_haves: values.nice_to_haves || [],
      skills,
      application_questions: values.application_questions || [],
      company_context: clean(values.company_context),
      recruiter_or_client_context: clean(values.recruiter_or_client_context),
      extraction_warnings: values.extraction_warnings || [],
    };
  }

  function upworkDescription(root = document) {
    const selectors = ['[data-test="job-description"]', '[data-test="Description"]', '[data-test="description"]'];
    if (root.matches?.(selectors.join(", "))) return selectedText(root);
    return selectedText(firstElement(selectors, root));
  }

  function upworkApplyState() {
    const jobApply = globalThis.__NUXT__?.state?.["job-apply"];
    const job = jobApply?.jobDetails?.opening?.job;
    if (!job) return null;
    return { jobApply, job };
  }

  function upworkJobDetailsState() {
    const jobDetails = globalThis.__NUXT__?.vuex?.jobDetails;
    const job = jobDetails?.job;
    if (!job) return null;
    return { jobDetails, job };
  }

  function upworkStructuredSourceUrl(job) {
    const ciphertext = clean(job?.info?.ciphertext || "");
    if (ciphertext) return absoluteUrl(`/jobs/${ciphertext}`);
    const detailCiphertext = clean(job?.ciphertext || "");
    if (!detailCiphertext) return location.href;
    return absoluteUrl(`/jobs/${detailCiphertext}`);
  }

  function upworkApplySourceUrl(job) {
    const originalPosting = absoluteUrl(document.querySelector('a[data-test="open-original-posting"]')?.getAttribute("href") || "");
    if (originalPosting) return originalPosting;
    const ciphertext = clean(job?.info?.ciphertext || "");
    if (!ciphertext) return upworkStructuredSourceUrl(job);
    return absoluteUrl(`/jobs/${ciphertext}`);
  }

  function upworkSandsSkills(sandsData) {
    return unique((sandsData?.ontologySkills || []).flatMap((skill) => {
      const children = Array.isArray(skill?.children) ? skill.children.map((child) => clean(child?.prefLabel || child?.name || "")) : [];
      return children.length ? children : [clean(skill?.prefLabel || skill?.name || "")];
    }));
  }

  function upworkApplyLocation(jobApply) {
    const countries = jobApply?.jobDetails?.opening?.qualifications?.countries;
    return Array.isArray(countries) ? countries.map(clean).filter(Boolean).join(", ") : "";
  }

  function upworkApplyOpportunity() {
    const state = upworkApplyState();
    if (!state) return null;
    const { jobApply, job } = state;
    const title = clean(job?.info?.title || "");
    const description = clean(job?.description || "");
    return opportunity("upwork", {
      source_url: upworkApplySourceUrl(job),
      title,
      location: upworkApplyLocation(jobApply),
      description,
      skills: upworkSandsSkills(job?.sandsData),
      extraction_warnings: [
        ...(title ? [] : ["Upwork apply-page job title was not found in Nuxt job state."]),
        ...(description ? [] : ["Upwork apply-page job description was not found in Nuxt job state."]),
      ],
    });
  }

  function upworkJobDetailsOpportunity() {
    const state = upworkJobDetailsState();
    if (!state) return null;
    const { jobDetails, job } = state;
    const title = clean(job?.title || jobDetails?.seo?.title || "");
    const description = clean(job?.description || jobDetails?.seo?.description || "");
    return opportunity("upwork", {
      source_url: upworkStructuredSourceUrl(job),
      title,
      description,
      skills: upworkSandsSkills(jobDetails?.sands),
      extraction_warnings: [
        ...(title ? [] : ["Upwork job-detail title was not found in Nuxt job state."]),
        ...(description ? [] : ["Upwork job-detail description was not found in Nuxt job state."]),
      ],
    });
  }

  const upworkAdapter = {
    id: "upwork",
    matches: () => location.hostname.includes("upwork.com"),
    async extract() {
      const applyStateOpportunity = upworkApplyOpportunity();
      if (applyStateOpportunity) return applyStateOpportunity;

      const jobDetailsStateOpportunity = upworkJobDetailsOpportunity();
      if (jobDetailsStateOpportunity) return jobDetailsStateOpportunity;

      const proposalDetails = proposalJobDetailsRoot();
      if (proposalDetails) {
        await expandDetailsIfNeeded(proposalDetails);
        const description = upworkDescription(proposalDetails);
        return opportunity("upwork", {
          title: firstText(['[data-test="job-title"]', '[data-test="job-tile-title"]', '[data-test="Title"]'], proposalDetails),
          description,
          skills: extractProposalSkills(proposalDetails),
          recruiter_or_client_context: "",
          extraction_warnings: description ? [] : ["Upwork job description element was not found; review the snapshot before drafting."],
        });
      }

      const card = firstUpworkJobCard();
      const root = card || document;
      const description = upworkDescription(root);
      return opportunity("upwork", {
        title:
          firstText([
            '[data-test="job-title"]',
            '[data-test="job-tile-title"]',
            '[data-test="Title"]',
          ], root),
        description,
        skills: upworkSkills(root),
        recruiter_or_client_context: firstText([
          '[data-test="client-info"]',
          '[data-test="client-history"]',
          '[data-test="buyer-info"]',
        ]),
        extraction_warnings: card ? [] : ["Upwork job card was not found; review the snapshot before drafting."],
      });
    },
  };

  const diceAdapter = {
    id: "dice",
    matches: () => location.hostname.includes("dice.com"),
    async extract() {
      const job = jobPostingJsonLd();
      const description = htmlToText(job?.description);
      const company = orgName(job?.hiringOrganization) || firstText(['[data-testid="job-detail-header-card"] a']);
      await waitForDiceVisibleSkillChips();
      const skills = diceJobSkills(job);
      const extractionWarnings = [
        ...(description ? [] : ["Dice job description was not found; review the snapshot before drafting."]),
        ...(skills.length ? [] : ["Dice skills list was not found; review the snapshot before drafting."]),
      ];
      return opportunity("dice", {
        title: clean(job?.title),
        company,
        location: locationFromJsonLd(job) || firstText(['[data-testid="locationTypeBadge"]']),
        employment_type: employmentTypeFromJsonLd(job),
        description,
        skills,
        company_context: diceCompanyContext(company),
        extraction_warnings: extractionWarnings,
      });
    },
  };

  const indeedAdapter = {
    id: "indeed",
    matches: () => location.hostname.includes("indeed.com"),
    async extract() {
      const description = firstText(['#jobDescriptionText', '[data-testid="jobsearch-JobComponent-description"]']);
      const title = firstText(['[data-testid="jobsearch-JobInfoHeader-title"]']);
      const company = firstText(['[data-testid="inlineHeader-companyName"]', '[data-testid="company-name"]']);
      const location = firstText(['[data-testid="jobsearch-JobInfoHeader-companyLocation"]']);
      return opportunity("indeed", {
        title,
        company,
        location,
        employment_type: "",
        description,
        skills: [],
        extraction_warnings: description ? [] : ["Indeed job description element was not found; review the snapshot before drafting."],
      });
    },
  };

  const zipRecruiterAdapter = {
    id: "ziprecruiter",
    matches: () => location.hostname.includes("ziprecruiter.com"),
    async extract() {
      return zipRecruiterRightPaneOpportunity() || zipRecruiterReviewDialogOpportunity() || zipRecruiterEmptyOpportunity();
    },
  };

  const robertHalfAdapter = {
    id: "roberthalf",
    matches: () => location.hostname.includes("roberthalf.com"),
    async extract() {
      const details = robertHalfSelectedDetails();
      const description = robertHalfDescription(details);
      const requirementsText = firstText(['[data-testid="job-details-requirements"]'], details || document);
      const title = clean(details?.getAttribute("headline") || "");
      return opportunity("roberthalf", {
        source_url: robertHalfSourceUrl(details),
        title,
        company: "Robert Half",
        location: robertHalfLocation(details),
        employment_type: clean(details?.getAttribute("type") || ""),
        description,
        requirements: requirementsText ? [requirementsText] : [],
        skills: [],
        extraction_warnings: robertHalfWarnings({ details, title, description }),
      });
    },
  };

  function proposalJobDetailsRoot() {
    return document.querySelector('[data-test="job-details"], [data-test="job-description"], [data-test="Description"]');
  }

  function firstUpworkJobCard() {
    return document.querySelector('[data-test="job-tile"]');
  }

  function extractProposalSkills(root) {
    const skills = Array.from(root.querySelectorAll("[data-qa-skill-key] span, [data-qa-skill-uid] span"))
      .map((node) => clean(node.textContent || ""))
      .filter(Boolean);
    return unique(skills);
  }

  function diceCompanyContext(company) {
    const companyInfoHeading = Array.from(document.querySelectorAll('h2')).find((node) => clean(node.textContent) === "Company Info");
    const card = companyInfoHeading?.parentElement;
    if (!card) return "";
    const aboutHeading = Array.from(card.querySelectorAll('h3')).find((node) => clean(node.textContent) === `About ${company}`);
    if (!aboutHeading) return "";
    return selectedText(card.querySelector('[data-testid="richTextElement"]'));
  }

  function zipRecruiterRightPaneOpportunity() {
    const root = document.querySelector('[data-testid="right-pane"]');
    const details = root?.querySelector('[data-testid="job-details-scroll-container"]');
    if (!details) return null;
    const title = clean(details.querySelector('img[alt]')?.getAttribute("alt") || "") || firstText(['h2'], details);
    const company = firstText(['a[href^="/co/"]'], details);
    const locationText = zipRecruiterHeaderLocation(details);
    const description = zipRecruiterDescription(details);
    return opportunity("ziprecruiter", {
      source_url: zipRecruiterSourceUrl(),
      title,
      company,
      location: locationText,
      employment_type: "",
      description,
      skills: [],
      company_context: selectedText(details.querySelector('[data-testid="company-data"]')),
      extraction_warnings: zipRecruiterWarnings({ title, description }),
    });
  }

  function zipRecruiterHeaderLocation(details) {
    const companyLink = details.querySelector('a[href^="/co/"]');
    return selectedText(companyLink?.parentElement?.querySelector('p'));
  }

  function zipRecruiterDescription(details) {
    const heading = Array.from(details.querySelectorAll('h2')).find((node) => clean(node.textContent) === "Job description");
    return selectedText(heading?.nextElementSibling);
  }

  function zipRecruiterReviewDialogOpportunity() {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const headingText = firstText(['section h2'], dialog);
    const title = clean(headingText.replace(/^Applying to\s+/, ""));
    const companyLocation = zipRecruiterCompanyLocation(firstText(['section h3'], dialog));
    return opportunity("ziprecruiter", {
      source_url: zipRecruiterSourceUrl(),
      title,
      company: companyLocation.company,
      location: companyLocation.location,
      employment_type: "",
      description: "",
      skills: [],
      extraction_warnings: zipRecruiterWarnings({ title, description: "" }),
    });
  }

  function zipRecruiterCompanyLocation(value) {
    const parts = clean(value).split(" in ");
    if (parts.length < 2) return { company: clean(value), location: "" };
    const locationText = parts.pop() || "";
    return { company: clean(parts.join(" in ")), location: clean(locationText) };
  }

  function zipRecruiterWarnings({ title, description }) {
    return [
      ...(title ? [] : ["ZipRecruiter selected job title was not found; review the snapshot before drafting."]),
      ...(description ? [] : ["ZipRecruiter job description element was not found; review the snapshot before drafting."]),
    ];
  }

  function zipRecruiterSourceUrl() {
    try {
      const url = new URL(location.href);
      const listingKey = clean(url.searchParams.get("lk") || "");
      if (!listingKey) return location.href;
      const sourceUrl = new URL(url.pathname, url.origin);
      sourceUrl.searchParams.set("lk", listingKey);
      return sourceUrl.href;
    } catch (_error) {
      return location.href;
    }
  }

  function zipRecruiterEmptyOpportunity() {
    return opportunity("ziprecruiter", {
      source_url: zipRecruiterSourceUrl(),
      description: "",
      extraction_warnings: [
        "ZipRecruiter selected job detail region was not found; review the snapshot before drafting.",
        ...zipRecruiterWarnings({ title: "", description: "" }),
      ],
    });
  }

  function robertHalfSelectedDetails() {
    return document.querySelector('rhcl-job-card[data-testid="job-details"]') || document.querySelector('rhcl-job-card[selected="true"]');
  }

  function robertHalfDescription(details) {
    const body = firstText(['[data-testid="job-details-description"]'], details || document);
    if (body) return body;
    return htmlToText(details?.getAttribute("copy"));
  }

  function robertHalfSourceUrl(details) {
    const destination = clean(details?.getAttribute("destination") || "");
    if (!destination) return location.href;
    try {
      return new URL(destination, location.origin).href;
    } catch (_error) {
      return location.href;
    }
  }

  function robertHalfLocation(details) {
    const worksite = clean(details?.getAttribute("worksite") || "");
    const locationText = clean(details?.getAttribute("location") || "");
    return [robertHalfWorksiteLabel(worksite), locationText].filter(Boolean).join(", ");
  }

  function robertHalfWorksiteLabel(value) {
    return value.toLowerCase() === "remote" ? "Remote" : value;
  }

  function robertHalfWarnings({ details, title, description }) {
    return [
      ...(details ? [] : ["Robert Half selected job detail element was not found; review the snapshot before drafting."]),
      ...(title ? [] : ["Robert Half selected job title was not found; review the snapshot before drafting."]),
      ...(description ? [] : ["Robert Half job description element was not found; review the snapshot before drafting."]),
    ];
  }

  async function expandDetailsIfNeeded(detailsRoot) {
    const toggle = detailsRoot.querySelector('button[data-ev-label="truncation_toggle"][aria-expanded="false"]');
    if (!toggle) return;
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const adapters = [upworkAdapter, diceAdapter, indeedAdapter, zipRecruiterAdapter, robertHalfAdapter];

  async function extractOpportunity() {
    const adapter = adapters.find((candidate) => candidate.matches());
    if (!adapter) {
      return opportunity("generic", {
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
  globalThis.__applicationDraftAssistantListPostings = diceSearchResultPostings;

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "APPLICATION_DRAFT_LIST_POSTINGS") {
        Promise.resolve(diceSearchResultPostings())
          .then((postings) => sendResponse({ ok: true, postings }))
          .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
        return true;
      }
      if (message?.type === "APPLICATION_DRAFT_CLICK_DICE_EASY_APPLY") {
        clickDiceDetailEasyApply()
          .then((result) => sendResponse({ ok: true, ...result }))
          .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
        return true;
      }
      if (message?.type === "APPLICATION_DRAFT_EXTRACT") {
        extractOpportunity()
          .then((snapshot) => sendResponse({ ok: true, opportunity: snapshot }))
          .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
        return true;
      }
      return false;
    });
  }
})();
