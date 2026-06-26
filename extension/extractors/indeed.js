(() => {
  const common = globalThis.JobApplicationExtractorCommon;
  const { firstText, opportunity } = common;
  const indeed = globalThis.JobApplicationIndeedOpportunity;

  globalThis.JobApplicationExtractors.register({
    id: "indeed",
    matches: () => location.hostname.includes("indeed.com"),
    async extract() {
      const smartApply = indeed?.smartApplyOpportunity?.();
      if (smartApply) return smartApply;
      const description = firstText(['#jobDescriptionText', '[data-testid="jobsearch-JobComponent-description"]']);
      const title = firstText(['[data-testid="jobsearch-JobInfoHeader-title"]']);
      const company = firstText(['[data-testid="inlineHeader-companyName"]', '[data-testid="company-name"]']);
      const locationText = firstText(['[data-testid="jobsearch-JobInfoHeader-companyLocation"]']);
      return opportunity("indeed", {
        title,
        company,
        location: locationText,
        employment_type: "",
        description,
        skills: [],
        extraction_warnings: description ? [] : ["Indeed job description element was not found; review the snapshot before drafting."],
      });
    },
  });
})();
