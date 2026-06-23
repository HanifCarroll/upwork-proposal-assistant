from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
EXTENSION = REPO_ROOT / "extension"


def read(path: str) -> str:
    return (EXTENSION / path).read_text(encoding="utf-8")


def test_manifest_loads_extraction_modules_before_content_script() -> None:
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    scripts = manifest["content_scripts"][0]["js"]

    assert scripts[:10] == [
        "extractors/common.js",
        "platforms/dice_opportunity.js",
        "extractors/upwork.js",
        "extractors/dice.js",
        "extractors/indeed.js",
        "extractors/ziprecruiter.js",
        "extractors/roberthalf.js",
        "extractors/linkedin.js",
        "ui/dice_cover_letter_runs.js",
        "content_script.js",
    ]


def test_content_script_is_only_registry_and_message_bridge() -> None:
    content_script = read("content_script.js")

    assert "JobApplicationExtractors" in content_script
    assert "JobApplicationExtractorCommon" in content_script
    assert "JobApplicationDiceOpportunity" in content_script
    assert "globalThis.__applicationDraftAssistantExtract = extractOpportunity" in content_script
    assert "function listDicePostings" in content_script
    assert "globalThis.JobApplicationDiceOpportunity?.searchResultPostings?.() || []" in content_script
    assert "globalThis.__applicationDraftAssistantListPostings = listDicePostings" in content_script
    assert "Dice Easy Apply support is unavailable on this page." in content_script
    assert "APPLICATION_DRAFT_LIST_POSTINGS" in content_script
    assert "APPLICATION_DRAFT_CLICK_DICE_EASY_APPLY" in content_script
    assert "APPLICATION_DRAFT_EXTRACT" in content_script
    assert "data-testid" not in content_script
    assert "jobsearch-" not in content_script


def test_extraction_modules_keep_weak_inference_patterns_out() -> None:
    extraction_sources = "\n".join(
        [
            read("content_script.js"),
            read("extractors/common.js"),
            read("extractors/dice.js"),
            read("extractors/indeed.js"),
            read("extractors/upwork.js"),
            read("extractors/ziprecruiter.js"),
            read("extractors/roberthalf.js"),
            read("extractors/linkedin.js"),
            read("platforms/dice_opportunity.js"),
        ]
    )

    for forbidden in [
        "leg" + "acy",
        "JOB_APPLICATION_DRAFT_EXTRACT",
        "UPWORK" + "_PROPOSAL_EXTRACT",
        "TECH_SKILLS",
        "Just not interested",
        "extractTextSkills",
        "inferRemoteStatus",
        "inferEmploymentType",
        "extractExplicitSkills",
        "sectionSummary",
        "listAfterHeading",
        "visibleText",
        "extractCompensation",
        "selectedDetailText",
        "findHeading",
        "Job Post Details",
        "Showing results",
        "document.title",
        "raw_text",
        "source_text",
        "extraction_confidence",
        "remote_status",
        "salaryFromJsonLd",
        "value.description",
        '"article"',
        "article h",
        ".slice(",
        "[class*=",
    ]:
        assert forbidden not in extraction_sources


def test_dice_extractor_uses_shared_declared_contracts() -> None:
    dice_helper = read("platforms/dice_opportunity.js")
    dice_extractor = read("extractors/dice.js")

    assert "function jobPostingJsonLd" in dice_helper
    assert 'script[type="application/ld+json"]' in dice_helper
    assert 'type === "JobPosting"' in dice_helper
    assert "function detailOpportunity" in dice_helper
    assert "function searchResultPostings" in dice_helper
    assert "function isDiceApplicationWizardUrl" in dice_helper
    assert "^\\/job-applications\\/[^/]+\\/wizard" in dice_helper
    assert 'location.pathname !== "/jobs"' in dice_helper
    assert 'querySelectorAll(\'[data-testid="job-card"]\')' in dice_helper
    assert "card.querySelector('[data-testid=\"job-search-job-detail-link\"]')" in dice_helper
    assert "easy_apply_url: absoluteUrl(easyApply.getAttribute(\"href\") || \"\") || url" in dice_helper
    assert 'root.querySelector(\'[data-testid="apply-button"]\')' in dice_helper
    assert "isDiceApplicationWizardUrl(link.getAttribute(\"href\") || \"\")" in dice_helper
    assert "setTimeout(() => link.click()" not in dice_helper
    assert 'location.pathname.startsWith("/job-detail/")' in dice_helper
    assert "clickDetailEasyApply" in dice_helper
    assert 'clean(node.textContent) === "Job Details"' in dice_helper
    assert 'clean(node.textContent) === "Skills"' in dice_helper
    assert 'skillsList?.tagName !== "UL"' in dice_helper
    assert "Array.from(skillsList.children)" in dice_helper
    assert "companyContext" in dice_helper
    assert '"Company Info"' in dice_helper
    assert "`About ${company}`" in dice_helper
    assert '[data-testid="richTextElement"]' in dice_helper

    assert "JobApplicationDiceOpportunity" in dice_extractor
    assert "dice.jobPostingJsonLd()" in dice_extractor
    assert "dice.waitForVisibleSkillChips()" in dice_extractor
    assert "dice.jobSkills(job)" in dice_extractor
    assert "Dice job description was not found" in dice_extractor
    assert "Dice skills list was not found" in dice_extractor


def test_upwork_extractor_handles_apply_detail_and_submitted_proposal_pages() -> None:
    upwork = read("extractors/upwork.js")

    assert "function upworkApplyState" in upwork
    assert 'globalThis.__NUXT__?.state?.["job-apply"]' in upwork
    assert "jobApply?.jobDetails?.opening?.job" in upwork
    assert "jobApply?.originalOpening?.opening?.job" in upwork
    assert "jobApply?.openingsCache?.[ciphertext]" in upwork
    assert "function upworkJobDetailsState" in upwork
    assert "globalThis.__NUXT__?.state?.jobDetails" in upwork
    assert "globalThis.__NUXT__?.vuex?.jobDetails" in upwork
    assert "function upworkProposalDetailsState" in upwork
    assert 'globalThis.__NUXT__?.state?.["proposal-details"]?.proposalDetailsV3Response' in upwork
    assert "proposalDetails?.jobDetails?.opening?.job" in upwork
    assert "function upworkApplyVisibleOpportunity" in upwork
    assert 'upworkExactHeading("Job details")' in upwork
    assert "if (upworkViewPostingLink(node)) return node" in upwork
    assert "if (!viewPosting) return null" in upwork
    assert "function upworkProposalVisibleOpportunity" in upwork
    assert "document.querySelector('[data-test=\"proposal-details\"]')" in upwork
    assert 'clean(node.textContent) === "Job details"' in upwork
    assert 'button[data-ev-label="truncation_toggle"]' in upwork
    assert "upworkSandsSkills(job?.sandsData || job?.sands)" in upwork
    assert "proposalDetailsStateOpportunity?.title && proposalDetailsStateOpportunity?.description && proposalDetailsStateOpportunity.skills.length" in upwork
    assert "visibleProposalDetailsOpportunity" in upwork
    assert "Upwork apply-page job title was not found in Nuxt job state." in upwork
    assert "Upwork job-detail visible skills were not found." in upwork
    assert "Upwork proposal-details visible skills were not found." in upwork


def test_other_platform_extractors_use_declared_detail_contracts() -> None:
    ziprecruiter = read("extractors/ziprecruiter.js")
    roberthalf = read("extractors/roberthalf.js")

    assert '[data-testid="right-pane"]' in ziprecruiter
    assert '[data-testid="job-details-scroll-container"]' in ziprecruiter
    assert '[data-testid="company-data"]' in ziprecruiter
    assert 'a[href^="/co/"]' in ziprecruiter
    assert 'clean(node.textContent) === "Job description"' in ziprecruiter
    assert 'url.searchParams.get("lk")' in ziprecruiter
    assert 'sourceUrl.searchParams.set("lk", listingKey)' in ziprecruiter
    assert "job-card-title" not in ziprecruiter

    assert 'rhcl-job-card[data-testid="job-details"]' in roberthalf
    assert 'rhcl-job-card[selected="true"]' in roberthalf
    assert 'details?.getAttribute("headline")' in roberthalf
    assert 'details?.getAttribute("destination")' in roberthalf
    assert 'details?.getAttribute("worksite")' in roberthalf
    assert 'details?.getAttribute("location")' in roberthalf
    assert 'details?.getAttribute("type")' in roberthalf
    assert 'details?.getAttribute("copy")' in roberthalf
    assert '[data-testid="job-details-description"]' in roberthalf
    assert '[data-testid="job-details-requirements"]' in roberthalf


def test_linkedin_extractor_uses_job_ids_and_easy_apply_contracts() -> None:
    linkedin = read("extractors/linkedin.js")
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    scripts = manifest["content_scripts"][0]["js"]

    assert "https://www.linkedin.com/*" in manifest["host_permissions"]
    assert "https://*.linkedin.com/*" in manifest["host_permissions"]
    assert "https://www.linkedin.com/*" in manifest["content_scripts"][0]["matches"]
    assert scripts.index("extractors/linkedin.js") < scripts.index("content_script.js")
    assert 'id: "linkedin"' in linkedin
    assert 'location.hostname.includes("linkedin.com")' in linkedin
    assert 'searchParams.get("currentJobId")' in linkedin
    assert 'location.pathname.match(/^\\/jobs\\/view\\/(\\d+)\\/?/)' in linkedin
    assert 'button[data-live-test-job-apply-button][data-job-id]' in linkedin
    assert "`/jobs/view/${jobId}/`" in linkedin
    assert 'label.match(/^Easy Apply to (.+) at (.+)$/)' in linkedin
    assert "#jobs-apply-see-application-link" in linkedin
    assert ".job-details-jobs-unified-top-card" in linkedin
    assert ".job-details-jobs-unified-top-card__job-title" in linkedin
    assert ".job-details-jobs-unified-top-card__company-name" in linkedin
    assert ".jobs-description__content .jobs-box__html-content" in linkedin
    assert "LinkedIn job id was not found" in linkedin
