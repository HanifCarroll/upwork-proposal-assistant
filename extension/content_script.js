(() => {
  if (globalThis.__upworkProposalAssistantLoaded) {
    return;
  }
  globalThis.__upworkProposalAssistantLoaded = true;

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

  function salaryFromJsonLd(job) {
    const salary = job?.baseSalary;
    const value = salary?.value || salary;
    if (!value) return "";
    const min = value.minValue || value.value;
    const max = value.maxValue;
    const unit = value.unitText ? ` ${String(value.unitText).toLowerCase()}` : "";
    const currency = salary.currency || value.currency || "USD";
    if (min && max) return `${currency} ${min} - ${max}${unit}`;
    if (min) return `${currency} ${min}${unit}`;
    return "";
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
    const value = jsonLdTextList(job?.employmentType).join(" ");
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

  function remoteStatusFromJsonLd(job) {
    if (job?.jobLocationType === "TELECOMMUTE") return "Remote";
    return "";
  }

  function extractExplicitSkills(root = document) {
    const domSkills = Array.from(
      root.querySelectorAll(
        '[data-qa-skill-key] span, [data-qa-skill-uid] span, [data-test="attr-item"], a[href*="ontology_skill_uid"], a[href*="/cat/"], a[href*="/freelance-jobs/"]'
      )
    )
      .map((node) => clean(node.textContent || ""))
      .filter((value) => value.length > 1 && value.length < 45);
    return unique(domSkills).slice(0, 24);
  }

  function jsonLdTextList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(jsonLdTextList);
    if (typeof value === "object") {
      return [value.name, value.description, value.value].flatMap(jsonLdTextList);
    }
    return clean(String(value)).split(/[,;|]/).map(clean).filter(Boolean);
  }

  function diceJobSkills(job) {
    return unique([
      ...jsonLdTextList(job?.skills),
      ...jsonLdTextList(job?.occupationalCategory),
    ]).slice(0, 24);
  }

  function opportunity(source, values) {
    const raw = clean(values.raw_text || values.description);
    const description = clean(values.description);
    return {
      source,
      source_url: values.source_url || location.href,
      captured_at: new Date().toISOString(),
      title: clean(values.title),
      company: clean(values.company),
      location: clean(values.location),
      compensation: clean(values.compensation),
      employment_type: clean(values.employment_type),
      remote_status: clean(values.remote_status),
      description,
      responsibilities: values.responsibilities || [],
      requirements: values.requirements || [],
      nice_to_haves: values.nice_to_haves || [],
      skills: unique(values.skills || extractExplicitSkills()),
      application_questions: values.application_questions || [],
      recruiter_or_client_context: clean(values.recruiter_or_client_context),
      raw_text: raw.slice(0, 12000),
      extraction_confidence: values.extraction_confidence || "medium",
      extraction_warnings: values.extraction_warnings || [],
    };
  }

  const upworkAdapter = {
    id: "upwork",
    matches: () => location.hostname.includes("upwork.com"),
    async extract() {
      const proposalDetails = proposalJobDetailsRoot();
      if (proposalDetails) {
        await expandDetailsIfNeeded(proposalDetails);
        const detailsText = clean(proposalDetails.textContent || "");
        return opportunity("upwork", {
          title: firstText(["h1", "h2", "h3"], proposalDetails),
          description: detailsText,
          compensation: firstText(['[data-test="budget"]', '[data-test="amount"]'], proposalDetails),
          skills: extractProposalSkills(proposalDetails),
          recruiter_or_client_context: "",
          raw_text: detailsText,
          extraction_confidence: "high",
        });
      }

      const card = firstUpworkJobCard();
      const cardText = clean(card?.textContent || "");
      return opportunity("upwork", {
        title:
          firstText([
            'h1[data-test="job-title"]',
            '[data-test="job-title"]',
            '[data-test="job-tile-title"]',
            "h1",
            '[data-test="Title"]',
          ], card || document),
        description:
          firstText([
            '[data-test="Description"]',
            '[data-test="job-description"]',
            '[data-test="description"]',
            "article",
          ], card || document),
        compensation: firstText(['[data-test="budget"]', '[data-test="amount"]'], card || document),
        skills: extractExplicitSkills(card || document),
        recruiter_or_client_context: firstText([
          '[data-test="client-info"]',
          '[data-test="client-history"]',
          '[data-test="buyer-info"]',
          "aside",
        ]),
        raw_text: cardText,
        extraction_warnings: card ? [] : ["Upwork job card was not found; review the snapshot before drafting."],
      });
    },
  };

  const diceAdapter = {
    id: "dice",
    matches: () => location.hostname.includes("dice.com"),
    async extract() {
      const job = jobPostingJsonLd();
      const headerText = firstText(['[data-testid="job-detail-header-card"]']);
      const description = htmlToText(job?.description) || firstText(['[class*="jobDescription"]']);
      const rawText = clean([headerText, description].filter(Boolean).join(" "));
      const extractionWarnings = description ? [] : ["Dice job description was not found; review the snapshot before drafting."];
      return opportunity("dice", {
        title: clean(job?.title || firstText(["h1"])),
        company: orgName(job?.hiringOrganization) || firstText(['[data-testid="job-detail-header-card"] a']),
        location: locationFromJsonLd(job) || firstText(['[data-testid="locationTypeBadge"]']),
        compensation: salaryFromJsonLd(job),
        employment_type: employmentTypeFromJsonLd(job),
        remote_status: remoteStatusFromJsonLd(job),
        description,
        skills: diceJobSkills(job),
        raw_text: rawText || description || headerText,
        extraction_confidence: job && description ? "high" : "medium",
        extraction_warnings: extractionWarnings,
      });
    },
  };

  const indeedAdapter = {
    id: "indeed",
    matches: () => location.hostname.includes("indeed.com"),
    async extract() {
      const description = firstText(['#jobDescriptionText', '[data-testid="jobsearch-JobComponent-description"]']);
      const title = firstText(['[data-testid="jobsearch-JobInfoHeader-title"]', "h1"]);
      const company = firstText(['[data-testid="inlineHeader-companyName"]', '[data-testid="company-name"]']);
      const location = firstText(['[data-testid="jobsearch-JobInfoHeader-companyLocation"]']);
      const rawText = clean([title, company, location, description].filter(Boolean).join(" "));
      return opportunity("indeed", {
        title,
        company,
        location,
        compensation: firstText(['[data-testid="jobsearch-JobMetadataHeader-item"]']),
        employment_type: "",
        description,
        skills: extractExplicitSkills(),
        raw_text: rawText,
        extraction_confidence: description ? "medium" : "low",
        extraction_warnings: description ? [] : ["Indeed job description element was not found; review the snapshot before drafting."],
      });
    },
  };

  const zipRecruiterAdapter = {
    id: "ziprecruiter",
    matches: () => location.hostname.includes("ziprecruiter.com"),
    async extract() {
      const firstArticle = document.querySelector("article");
      const cardText = clean(firstArticle?.textContent || "");
      const title = firstText(["article h2", "article h3"]);
      const company = firstText(['[data-testid="job-card-company"]']);
      const locationText = firstText(['[data-testid="job-card-location"]']);
      const description = firstText(['[data-testid="jobDescriptionText"]', '[data-testid="job-description"]', '[class*="job_description"]']);
      const rawText = clean([cardText, description].filter(Boolean).join(" "));
      return opportunity("ziprecruiter", {
        title,
        company,
        location: locationText,
        compensation: firstText(['[data-testid="job-card-salary"]', '[data-testid="salary"]']),
        employment_type: "",
        remote_status: "",
        description,
        skills: extractExplicitSkills(),
        raw_text: rawText,
        extraction_confidence: description ? "medium" : "low",
        extraction_warnings: description ? [] : ["ZipRecruiter job description element was not found; review the snapshot before drafting."],
      });
    },
  };

  const robertHalfAdapter = {
    id: "roberthalf",
    matches: () => location.hostname.includes("roberthalf.com"),
    async extract() {
      const description = firstText(['[data-testid="job-details-description"]']);
      const requirementsText = firstText(['[data-testid="job-details-requirements"]']);
      const title = firstText(['a[href*="/us/en/job/"].rhcl-typography--display5', 'a[href*="/us/en/job/"]']);
      const location = firstText(['[data-testid="job-details-location"]']);
      const compensation = firstText(['[data-testid="job-details-salary"]', '[data-testid="job-details-pay"]']);
      return opportunity("roberthalf", {
        title,
        company: "Robert Half",
        location,
        compensation,
        employment_type: "",
        remote_status: "",
        description,
        requirements: requirementsText ? [requirementsText] : [],
        skills: extractExplicitSkills(),
        raw_text: clean([title, location, compensation, description, requirementsText].filter(Boolean).join(" ")),
        extraction_confidence: description ? "high" : "low",
        extraction_warnings: description ? [] : ["Robert Half job detail region was not found; review the snapshot before drafting."],
      });
    },
  };

  function proposalJobDetailsRoot() {
    return document.querySelector('[data-test="job-details"], [data-test="job-description"], [data-test="Description"]');
  }

  function firstUpworkJobCard() {
    return document.querySelector('[data-test="job-tile"], article');
  }

  function extractProposalSkills(root) {
    const skills = Array.from(root.querySelectorAll("[data-qa-skill-key] span, [data-qa-skill-uid] span"))
      .map((node) => clean(node.textContent || ""))
      .filter(Boolean);
    return unique(skills).slice(0, 20);
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
        title: firstText(["h1", "h2"]),
        description: "",
        raw_text: "",
        extraction_confidence: "low",
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

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "APPLICATION_DRAFT_EXTRACT") return false;
      extractOpportunity()
        .then((snapshot) => sendResponse({ ok: true, opportunity: snapshot }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    });
  }
})();
