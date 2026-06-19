(() => {
  if (globalThis.__upworkProposalAssistantLoaded) {
    return;
  }
  globalThis.__upworkProposalAssistantLoaded = true;

  const TECH_SKILLS = [
    "AWS",
    "Azure",
    "Cybersecurity",
    "Docker",
    "FastAPI",
    "FireMon",
    "GitHub Actions",
    "Java",
    "JavaScript",
    "Kafka",
    "Kubernetes",
    "Node.js",
    "OpenShift",
    "Palo Alto",
    "Playwright",
    "PostgreSQL",
    "Python",
    "React",
    "REST API",
    "Spring Boot",
    "Supabase",
    "Tailwind CSS",
    "TypeScript",
  ];

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return Array.from(new Set(values.map(clean).filter(Boolean)));
  }

  function visibleText(root = document.body) {
    return clean(root?.innerText || root?.textContent || "");
  }

  function firstText(selectors, root = document) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = clean(element?.textContent || "");
      if (text) return text;
    }
    return "";
  }

  function findHeading(text) {
    return Array.from(document.querySelectorAll("h1, h2, h3, h4")).find((node) => clean(node.textContent || "").toLowerCase() === text.toLowerCase()) || null;
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

  function extractCompensation(text) {
    const patterns = [
      /\$[\d,.]+\s*-\s*\$[\d,.]+\s*(?:\/?\s*(?:hr|hour|yr|year))?/i,
      /\$[\d,.]+\s*(?:\/?\s*(?:hr|hour|yr|year))/i,
      /\$[\d,.]+(?:\.\d+)?\s*(?:an hour|per hour|a year|per year)/i,
      /DOE/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return clean(match[0]).replace(/^doe$/i, "DOE");
    }
    return "";
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

  function inferRemoteStatus(text) {
    if (/hybrid/i.test(text)) return "Hybrid";
    if (/remote/i.test(text)) return "Remote";
    if (/on-site|onsite/i.test(text)) return "On-site";
    return "";
  }

  function inferEmploymentType(text) {
    if (/contract|contractor|temporary|temp/i.test(text)) return "Contract";
    if (/full[- ]time/i.test(text)) return "Full-time";
    if (/part[- ]time/i.test(text)) return "Part-time";
    return "";
  }

  function extractSkills(text, root = document) {
    const blocked = new Set([
      "Just not interested",
      "Vague Description",
      "Unrealistic Expectations",
      "Too Many Applicants",
      "Doesn't Match Skills",
      "I am overqualified",
      "Budget too low",
      "Not in my preferred location",
      "Skip skills",
    ]);
    const domSkills = Array.from(
      root.querySelectorAll(
        '[data-test*="skill" i], [data-testid*="skill" i], [data-test="attr-item"], a[href*="ontology_skill_uid"], a[href*="/cat/"], a[href*="/freelance-jobs/"]'
      )
    )
      .map((node) => clean(node.textContent || ""))
      .filter((value) => value.length > 1 && value.length < 45 && !blocked.has(value));
    const textSkills = TECH_SKILLS.filter((skill) => new RegExp(`\\b${escapeRegExp(skill)}\\b`, "i").test(text));
    return unique([...domSkills, ...textSkills]).slice(0, 24);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function listAfterHeading(text, headingPattern, stopPattern) {
    const heading = text.search(headingPattern);
    if (heading === -1) return [];
    const after = text.slice(heading).replace(headingPattern, "");
    const stop = after.search(stopPattern);
    const section = stop === -1 ? after : after.slice(0, stop);
    return unique(section.split(/(?:•|\n|\. (?=[A-Z]))/).map((item) => item.replace(/^[-:;\s]+/, ""))).filter((item) => item.length > 20).slice(0, 12);
  }

  function sectionSummary(text) {
    return {
      responsibilities: listAfterHeading(text, /(?:Key Responsibilities|Responsibilities|What you(?:'|’)ll do):?/i, /(?:Required Qualifications|Requirements|Qualifications|Preferred|Benefits|Company|About|Technology Does)/i),
      requirements: listAfterHeading(text, /(?:Required Qualifications|Requirements|Qualifications|Skills):?/i, /(?:Preferred|Benefits|Company|About|Technology Does|Equal Opportunity)/i),
      nice_to_haves: listAfterHeading(text, /(?:Preferred Qualifications|Nice to Have|Bonus):?/i, /(?:Benefits|Company|About|Equal Opportunity)/i),
    };
  }

  function selectedDetailText(markers) {
    const text = visibleText();
    for (const marker of markers) {
      const index = text.indexOf(marker);
      if (index !== -1) return clean(text.slice(index + marker.length));
    }
    return text;
  }

  function opportunity(source, values) {
    const raw = clean(values.raw_text || values.description || visibleText());
    const description = clean(values.description || raw.slice(0, 8000));
    return {
      source,
      source_url: values.source_url || location.href,
      captured_at: new Date().toISOString(),
      title: clean(values.title),
      company: clean(values.company),
      location: clean(values.location),
      compensation: clean(values.compensation),
      employment_type: clean(values.employment_type),
      remote_status: clean(values.remote_status || inferRemoteStatus(`${values.location || ""} ${description} ${raw}`)),
      description,
      responsibilities: values.responsibilities || [],
      requirements: values.requirements || [],
      nice_to_haves: values.nice_to_haves || [],
      skills: unique(values.skills || extractSkills(`${description} ${raw}`)),
      application_questions: values.application_questions || [],
      recruiter_or_client_context: clean(values.recruiter_or_client_context),
      raw_text: raw.slice(0, 12000),
      extraction_confidence: values.extraction_confidence || "medium",
      extraction_warnings: values.extraction_warnings || [],
    };
  }

  function legacyProject(snapshot) {
    return {
      title: snapshot.title,
      description: snapshot.description,
      budget: snapshot.compensation,
      skills: snapshot.skills,
      client_context: snapshot.recruiter_or_client_context || [snapshot.company, snapshot.location, snapshot.employment_type, snapshot.remote_status].filter(Boolean).join(" | "),
      url: snapshot.source_url,
      captured_at: snapshot.captured_at,
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
          title: clean(proposalDetails.querySelector("h3")?.textContent || ""),
          description: detailsText,
          compensation: extractCompensation(detailsText || visibleText()),
          skills: extractProposalSkills(proposalDetails),
          recruiter_or_client_context: "",
          raw_text: detailsText,
          extraction_confidence: "high",
        });
      }

      const { link, card } = firstUpworkJobCard();
      const cardText = clean(card?.textContent || "");
      const text = visibleText();
      return opportunity("upwork", {
        title:
          firstText([
            'h1[data-test="job-title"]',
            '[data-test="job-title"]',
            "h1",
            '[data-test="Title"]',
          ]) || clean(link?.textContent || ""),
        description:
          firstText([
            '[data-test="Description"]',
            '[data-test="job-description"]',
            '[data-test="description"]',
            "article",
          ]) || cardText,
        compensation: extractCompensation(cardText || text),
        skills: extractSkills(cardText || text, card || document),
        recruiter_or_client_context: firstText([
          '[data-test="client-info"]',
          '[data-test="client-history"]',
          '[data-test="buyer-info"]',
          "aside",
        ]),
        raw_text: cardText || text,
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
      const fullText = clean(`${headerText} ${description} ${visibleText()}`);
      const sections = sectionSummary(description || fullText);
      return opportunity("dice", {
        title: clean(job?.title || firstText(["h1"])),
        company: orgName(job?.hiringOrganization) || firstText(['[data-testid="job-detail-header-card"] a']),
        location: locationFromJsonLd(job) || firstText(['[data-testid="locationTypeBadge"]']),
        compensation: salaryFromJsonLd(job) || extractCompensation(fullText),
        employment_type: inferEmploymentType(fullText),
        remote_status: job?.jobLocationType === "TELECOMMUTE" ? "Remote" : inferRemoteStatus(fullText),
        description,
        skills: extractSkills(fullText),
        ...sections,
        raw_text: fullText,
        extraction_confidence: job ? "high" : "medium",
      });
    },
  };

  const indeedAdapter = {
    id: "indeed",
    matches: () => location.hostname.includes("indeed.com"),
    async extract() {
      const detailText = selectedDetailText(["Return to Search Result", "Job Post Details"]);
      const description = detailText.includes("Full job description") ? clean(detailText.split("Full job description").slice(1).join("Full job description")) : detailText;
      const title =
        firstText(['[data-testid="jobsearch-JobInfoHeader-title"]', "h1"]) ||
        clean((detailText.match(/Job Post Details\s+(.+?)\s+-\s+job post/i) || [])[1] || "") ||
        clean((detailText.match(/^(.+?)\s+-\s+job post/i) || [])[1] || "");
      const company = firstText(['[data-testid="inlineHeader-companyName"]', '[data-testid="company-name"]']) || clean((detailText.match(/job post\s+(.+?)\s+(?:Remote|Hybrid|[A-Z][a-z]+,\s+[A-Z]{2})/i) || [])[1] || "");
      const companyIndex = company ? detailText.indexOf(company) : -1;
      const afterCompany = companyIndex === -1 ? detailText : detailText.slice(companyIndex + company.length, companyIndex + company.length + 180);
      const sections = sectionSummary(description);
      return opportunity("indeed", {
        title: title.replace(/\s+-\s+job post$/i, ""),
        company,
        location: firstText(['[data-testid="jobsearch-JobInfoHeader-companyLocation"]']) || clean((afterCompany.match(/(?:Remote|Hybrid work in [^$]+?|[A-Z][a-zA-Z .-]+,\s+[A-Z]{2}\s*\d*)/) || [])[0] || ""),
        compensation: extractCompensation(detailText),
        employment_type: inferEmploymentType(detailText),
        description,
        skills: extractSkills(detailText),
        ...sections,
        raw_text: detailText,
        extraction_confidence: description.length > 500 ? "medium" : "low",
        extraction_warnings: description.length > 500 ? [] : ["Indeed detail panel text was short; review the snapshot before drafting."],
      });
    },
  };

  const zipRecruiterAdapter = {
    id: "ziprecruiter",
    matches: () => location.hostname.includes("ziprecruiter.com"),
    async extract() {
      const text = visibleText();
      const detailText = selectedDetailText(["Showing results 1-20", "Showing results"]);
      const firstArticle = document.querySelector("article");
      const cardText = clean(firstArticle?.textContent || "");
      const title = firstText(["article h2", "article h3"]) || clean((detailText.match(/^(.+?)\s+[A-Z][A-Za-z0-9 .,&-]+\s+(?:[A-Z][a-z]+|Remote)/) || [])[1] || "");
      const company = firstText(['[data-testid="job-card-company"]']);
      const locationText = firstText(['[data-testid="job-card-location"]']);
      const description = detailText.includes("Job description") ? clean(detailText.split("Job description").slice(1).join("Job description")) : detailText;
      const sections = sectionSummary(description);
      return opportunity("ziprecruiter", {
        title,
        company,
        location: clean([locationText, /Remote/i.test(cardText) ? "Remote" : ""].filter(Boolean).join(" | ")),
        compensation: extractCompensation(`${cardText} ${detailText}`),
        employment_type: inferEmploymentType(detailText),
        remote_status: inferRemoteStatus(`${cardText} ${detailText}`),
        description,
        skills: extractSkills(detailText),
        ...sections,
        raw_text: clean(`${cardText} ${detailText || text}`),
        extraction_confidence: description.length > 500 ? "medium" : "low",
        extraction_warnings: description.length > 500 ? [] : ["ZipRecruiter selected-job detail text was short; review the snapshot before drafting."],
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
      const text = visibleText();
      return opportunity("roberthalf", {
        title,
        company: "Robert Half",
        location: clean((text.match(/[A-Z][A-Z ]+,\s+[A-Z]{2}/) || [])[0] || ""),
        compensation: extractCompensation(text),
        employment_type: inferEmploymentType(text),
        remote_status: inferRemoteStatus(text),
        description,
        requirements: unique(requirementsText.split("•")).filter((item) => item.length > 20).slice(0, 12),
        skills: extractSkills(`${description} ${requirementsText}`),
        raw_text: clean(`${title} ${description} ${requirementsText} ${text.slice(0, 3000)}`),
        extraction_confidence: description ? "high" : "low",
        extraction_warnings: description ? [] : ["Robert Half job detail region was not found; review the snapshot before drafting."],
      });
    },
  };

  function proposalJobDetailsRoot() {
    const heading = findHeading("Job details");
    if (!heading) return null;

    let node = heading.parentElement;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = clean(node.textContent || "");
      if (text.includes("Skills and expertise") || text.includes("View job posting")) {
        return node;
      }
      node = node.parentElement;
    }

    const container = heading.closest("div");
    const next = container?.parentElement?.querySelector("section");
    return next || container;
  }

  function firstUpworkJobCard() {
    const links = Array.from(document.querySelectorAll('a[href*="/jobs/"], a[href*="/freelance-jobs/"]')).filter((node) => clean(node.textContent || "").length > 20);
    const link = links[0];
    if (!link) return { link: null, card: null };

    let card = link;
    let best = link.parentElement;
    for (let depth = 0; depth < 8 && card?.parentElement; depth += 1) {
      card = card.parentElement;
      const text = clean(card.textContent || "");
      if (text.includes("Proposals:")) best = card;
      if (text.includes("Hourly:") || text.includes("Fixed-price") || text.length > 1000) {
        return { link, card };
      }
    }
    return { link, card: best };
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
        title: firstText(["h1", "h2"]) || document.title,
        description: visibleText().slice(0, 8000),
        raw_text: visibleText(),
        extraction_confidence: "low",
        extraction_warnings: ["No site adapter matched this page; extracted generic visible text."],
      });
    }
    const snapshot = await adapter.extract();
    return {
      ...snapshot,
      source: adapter.id,
      source_url: snapshot.source_url || location.href,
    };
  }

  globalThis.__upworkProposalAssistantExtract = async () => {
    const snapshot = await extractOpportunity();
    return legacyProject(snapshot);
  };
  globalThis.__applicationDraftAssistantExtract = extractOpportunity;

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "UPWORK_PROPOSAL_EXTRACT" && message?.type !== "APPLICATION_DRAFT_EXTRACT") return false;
      extractOpportunity()
        .then((snapshot) => sendResponse({ ok: true, opportunity: snapshot, project: legacyProject(snapshot) }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    });
  }
})();
