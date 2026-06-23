(() => {
  const common = globalThis.JobApplicationExtractorCommon;
  const { absoluteUrl, clean, firstElement, firstText, opportunity, selectedText } = common;

  function linkedinJobId() {
    const currentJobId = clean(new URL(location.href).searchParams.get("currentJobId") || "");
    if (/^\d+$/.test(currentJobId)) return currentJobId;

    const pathMatch = location.pathname.match(/^\/jobs\/view\/(\d+)\/?/);
    if (pathMatch) return pathMatch[1];

    return clean(document.querySelector("button[data-live-test-job-apply-button][data-job-id]")?.getAttribute("data-job-id") || "");
  }

  function linkedinSourceUrl(jobId) {
    if (!jobId) return location.href;
    return absoluteUrl(`/jobs/view/${jobId}/`) || location.href;
  }

  function linkedinApplyButton(jobId) {
    if (jobId) {
      const button = document.querySelector(`button[data-live-test-job-apply-button][data-job-id="${jobId}"]`);
      if (button) return button;
    }
    return document.querySelector("button[data-live-test-job-apply-button][data-job-id]");
  }

  function linkedinApplyLabel(button) {
    const label = clean(button?.getAttribute("aria-label") || "");
    const match = label.match(/^Easy Apply to (.+) at (.+)$/);
    if (!match) return { title: "", company: "" };
    return {
      title: clean(match[1]),
      company: clean(match[2]),
    };
  }

  function linkedinAppliedTitle() {
    const link = document.querySelector("#jobs-apply-see-application-link");
    const match = clean(link?.textContent || "").match(/\bfor (.+)$/);
    return clean(match?.[1] || "");
  }

  function linkedinTopCard() {
    return document.querySelector(".job-details-jobs-unified-top-card") || document.querySelector(".jobs-unified-top-card");
  }

  function linkedinDescription() {
    return selectedText(
      firstElement(
        [
          ".jobs-description__content .jobs-box__html-content",
          ".jobs-description-content__text",
          ".jobs-description__container",
        ],
        document
      )
    );
  }

  function linkedinLocation(root) {
    return firstText(
      [
        ".job-details-jobs-unified-top-card__primary-description-container span",
        ".jobs-unified-top-card__subtitle-primary-grouping span",
      ],
      root || document
    );
  }

  function linkedinWarnings({ jobId, title, description }) {
    return [
      ...(jobId ? [] : ["LinkedIn job id was not found in the selected job URL or Easy Apply button."]),
      ...(title ? [] : ["LinkedIn selected job title was not found in declared job detail controls."]),
      ...(description ? [] : ["LinkedIn job description element was not found; review the snapshot before drafting."]),
    ];
  }

  globalThis.JobApplicationExtractors.register({
    id: "linkedin",
    matches: () => location.hostname.includes("linkedin.com"),
    async extract() {
      const jobId = linkedinJobId();
      const applyLabel = linkedinApplyLabel(linkedinApplyButton(jobId));
      const root = linkedinTopCard();
      const title =
        applyLabel.title ||
        firstText(
          [
            ".job-details-jobs-unified-top-card__job-title a",
            ".job-details-jobs-unified-top-card__job-title",
            ".jobs-unified-top-card__job-title a",
            ".jobs-unified-top-card__job-title",
          ],
          root || document
        ) ||
        linkedinAppliedTitle();
      const company =
        applyLabel.company ||
        firstText(
          [
            ".job-details-jobs-unified-top-card__company-name a",
            ".job-details-jobs-unified-top-card__company-name",
            ".jobs-unified-top-card__company-name a",
            ".jobs-unified-top-card__company-name",
          ],
          root || document
        );
      const description = linkedinDescription();
      return opportunity("linkedin", {
        source_url: linkedinSourceUrl(jobId),
        title,
        company,
        location: linkedinLocation(root),
        description,
        skills: [],
        extraction_warnings: linkedinWarnings({ jobId, title, description }),
      });
    },
  });
})();
