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

  function remoteStatusFromJsonLd(job) {
    if (job?.jobLocationType === "TELECOMMUTE") return "Remote";
    return "";
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
    ]);
  }

  function sourceTextFrom(values) {
    return clean(
      [
        values.title,
        values.company,
        values.location,
        values.compensation,
        values.employment_type,
        values.remote_status,
        values.description,
        ...(values.responsibilities || []),
        ...(values.requirements || []),
        ...(values.nice_to_haves || []),
        ...(values.skills || []),
        ...(values.application_questions || []),
        values.company_context,
        values.recruiter_or_client_context,
      ]
        .filter(Boolean)
        .join(" ")
    );
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
      compensation: clean(values.compensation),
      employment_type: clean(values.employment_type),
      remote_status: clean(values.remote_status),
      description,
      responsibilities: values.responsibilities || [],
      requirements: values.requirements || [],
      nice_to_haves: values.nice_to_haves || [],
      skills,
      application_questions: values.application_questions || [],
      company_context: clean(values.company_context),
      recruiter_or_client_context: clean(values.recruiter_or_client_context),
      source_text: sourceTextFrom({ ...values, description, skills }),
      extraction_confidence: values.extraction_confidence || "medium",
      extraction_warnings: values.extraction_warnings || [],
    };
  }

  function upworkDescription(root = document) {
    const selectors = ['[data-test="job-description"]', '[data-test="Description"]', '[data-test="description"]'];
    if (root.matches?.(selectors.join(", "))) return selectedText(root);
    return selectedText(firstElement(selectors, root));
  }

  const upworkAdapter = {
    id: "upwork",
    matches: () => location.hostname.includes("upwork.com"),
    async extract() {
      const proposalDetails = proposalJobDetailsRoot();
      if (proposalDetails) {
        await expandDetailsIfNeeded(proposalDetails);
        const description = upworkDescription(proposalDetails);
        return opportunity("upwork", {
          title: firstText(['[data-test="job-title"]', '[data-test="job-tile-title"]', '[data-test="Title"]'], proposalDetails),
          description,
          compensation: firstText(['[data-test="budget"]', '[data-test="amount"]'], proposalDetails),
          skills: extractProposalSkills(proposalDetails),
          recruiter_or_client_context: "",
          extraction_confidence: description ? "high" : "low",
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
        compensation: firstText(['[data-test="budget"]', '[data-test="amount"]'], root),
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
      const extractionWarnings = description ? [] : ["Dice job description was not found; review the snapshot before drafting."];
      return opportunity("dice", {
        title: clean(job?.title),
        company,
        location: locationFromJsonLd(job) || firstText(['[data-testid="locationTypeBadge"]']),
        compensation: salaryFromJsonLd(job),
        employment_type: employmentTypeFromJsonLd(job),
        remote_status: remoteStatusFromJsonLd(job),
        description,
        skills: diceJobSkills(job),
        company_context: diceCompanyContext(company),
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
      const title = firstText(['[data-testid="jobsearch-JobInfoHeader-title"]']);
      const company = firstText(['[data-testid="inlineHeader-companyName"]', '[data-testid="company-name"]']);
      const location = firstText(['[data-testid="jobsearch-JobInfoHeader-companyLocation"]']);
      return opportunity("indeed", {
        title,
        company,
        location,
        compensation: firstText(['[data-testid="jobsearch-JobMetadataHeader-item"]']),
        employment_type: "",
        description,
        skills: [],
        extraction_confidence: description ? "medium" : "low",
        extraction_warnings: description ? [] : ["Indeed job description element was not found; review the snapshot before drafting."],
      });
    },
  };

  const zipRecruiterAdapter = {
    id: "ziprecruiter",
    matches: () => location.hostname.includes("ziprecruiter.com"),
    async extract() {
      const title = firstText(['[data-testid="job-card-title"]', '[data-testid="job-title"]']);
      const company = firstText(['[data-testid="job-card-company"]']);
      const locationText = firstText(['[data-testid="job-card-location"]']);
      const description = firstText(['[data-testid="jobDescriptionText"]', '[data-testid="job-description"]']);
      return opportunity("ziprecruiter", {
        title,
        company,
        location: locationText,
        compensation: firstText(['[data-testid="job-card-salary"]', '[data-testid="salary"]']),
        employment_type: "",
        remote_status: "",
        description,
        skills: [],
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
        skills: [],
        extraction_confidence: description ? "high" : "low",
        extraction_warnings: description ? [] : ["Robert Half job detail region was not found; review the snapshot before drafting."],
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
