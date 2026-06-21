from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_extension_has_no_stale_compatibility_path() -> None:
    content_script = (REPO_ROOT / "extension" / "content_script.js").read_text(encoding="utf-8")
    popup = (REPO_ROOT / "extension" / "popup.js").read_text(encoding="utf-8")

    assert "leg" + "acy" not in content_script.lower()
    assert "JOB_APPLICATION_DRAFT_EXTRACT" not in content_script
    assert "UPWORK" + "_PROPOSAL_EXTRACT" not in content_script
    assert "response.project" not in popup
    assert "TECH_SKILLS" not in content_script
    assert "Just not interested" not in content_script
    assert "extractTextSkills" not in content_script
    assert "inferRemoteStatus" not in content_script
    assert "inferEmploymentType" not in content_script
    assert "extractExplicitSkills" not in content_script
    assert "sectionSummary" not in content_script
    assert "listAfterHeading" not in content_script
    assert "visibleText" not in content_script
    assert "extractCompensation" not in content_script
    assert "selectedDetailText" not in content_script
    assert "findHeading" not in content_script
    assert ".match(" not in content_script
    assert "Job Post Details" not in content_script
    assert "Showing results" not in content_script
    assert "document.title" not in content_script
    assert "raw_text" not in content_script
    assert "raw_text" not in popup
    assert "source_text" not in content_script
    assert "source_text" not in popup
    assert "sourceText" not in popup
    assert "source-text" not in popup
    assert "extraction_confidence" not in content_script
    assert "extraction_confidence" not in popup
    assert "remote_status" not in content_script
    assert "remote-status" not in popup
    assert "Compensation" not in popup
    assert 'id="budget"' not in popup
    assert "salaryFromJsonLd" not in content_script
    assert "value.description" not in content_script
    assert '"h1"' not in content_script
    assert '"h2"' not in content_script
    assert '"h3"' not in content_script
    assert '"article"' not in content_script
    assert "article h" not in content_script
    assert ".slice(" not in content_script
    assert "[class*=" not in content_script


def test_dice_extraction_does_not_send_page_wide_text() -> None:
    content_script = (REPO_ROOT / "extension" / "content_script.js").read_text(encoding="utf-8")
    dice_block = content_script.split("const diceAdapter = {", 1)[1].split("const indeedAdapter = {", 1)[0]

    assert "visibleText()" not in dice_block
    assert "fullText" not in dice_block
    assert "headerText" not in dice_block
    assert "rawText" not in dice_block
    assert "raw_text" not in dice_block
    assert "job?.description" in dice_block
    assert "title: clean(job?.title)" in dice_block
    assert "...diceVisibleSkillChips()" in content_script
    assert "waitForDiceVisibleSkillChips" in content_script
    assert 'clean(node.textContent) === "Job Details"' in content_script
    assert 'clean(node.textContent) === "Skills"' in content_script
    assert 'skillsList?.tagName !== "UL"' in content_script
    assert "Array.from(skillsList.children)" in content_script
    assert "Dice skills list was not found" in dice_block
    assert "company_context: diceCompanyContext(company)" in dice_block
    assert '"Company Info"' in content_script
    assert "`About ${company}`" in content_script
    assert '[data-testid="richTextElement"]' in content_script
    assert 'firstText(["h1"])' not in dice_block
    assert ".rounded-3xl" not in dice_block
    assert "Python" not in dice_block
    assert "Mapbox or ESRI" not in dice_block


def test_dice_search_posting_picker_uses_declared_link_contract() -> None:
    content_script = (REPO_ROOT / "extension" / "content_script.js").read_text(encoding="utf-8")
    popup_html = (REPO_ROOT / "extension" / "popup.html").read_text(encoding="utf-8")
    popup_js = (REPO_ROOT / "extension" / "popup.js").read_text(encoding="utf-8")
    dice_listing_block = content_script.split("function diceSearchResultPostings", 1)[1].split("function opportunity", 1)[0]

    assert "APPLICATION_DRAFT_LIST_POSTINGS" in content_script
    assert "APPLICATION_DRAFT_CLICK_DICE_EASY_APPLY" in content_script
    assert "globalThis.__applicationDraftAssistantListPostings = diceSearchResultPostings" in content_script
    assert 'location.pathname !== "/jobs"' in dice_listing_block
    assert 'querySelectorAll(\'[data-testid="job-card"]\')' in dice_listing_block
    assert "diceEasyApplyLink(card)" in dice_listing_block
    assert "card.querySelector('[data-testid=\"job-search-job-detail-link\"]')" in dice_listing_block
    assert "clean(link?.textContent || \"\")" in dice_listing_block
    assert "absoluteUrl(link?.getAttribute(\"href\") || \"\")" in dice_listing_block
    assert "seenUrls.has(url)" in dice_listing_block
    assert "easy_apply_url: absoluteUrl(easyApply.getAttribute(\"href\") || \"\") || url" in dice_listing_block
    assert 'root.querySelector(\'[data-testid="apply-button"]\')' in content_script
    assert 'location.pathname.startsWith("/job-detail/")' in content_script
    assert "clean(link.textContent || link.getAttribute(\"aria-label\") || \"\") !== \"Easy Apply\"" in content_script
    assert "setTimeout(() => link.click(), 0)" in content_script
    assert "innerText" not in dice_listing_block
    assert "document.title" not in dice_listing_block
    assert "[class*=" not in dice_listing_block

    for field_id in [
        "dice-posting-picker",
        "dice-posting-summary",
        "dice-posting-select-all",
        "dice-posting-list",
        "dice-posting-open-selected",
        "dice-posting-status",
    ]:
        assert f'id="{field_id}"' in popup_html

    assert "listActivePagePostings" in popup_js
    assert "APPLICATION_DRAFT_LIST_POSTINGS" in popup_js
    assert "APPLICATION_DRAFT_CLICK_DICE_EASY_APPLY" in popup_js
    assert "renderDicePostingPicker" in popup_js
    assert "waitForTabComplete" in popup_js
    assert "nextDiceResultsUrl" in popup_js
    assert 'url.pathname !== "/jobs"' in popup_js
    assert 'url.searchParams.set("page"' in popup_js
    assert "advanceActiveDiceResultsPage" in popup_js
    assert "chrome.tabs.update(tab.id, { url: nextUrl })" in popup_js
    assert "openPostingAndClickEasyApply" in popup_js
    assert "chrome.tabs.create({ url: posting.url, active: false })" in popup_js
    assert "await advanceActiveDiceResultsPage()" in popup_js
    assert "Next page loaded." in popup_js
    assert "Open Easy Apply" in popup_html


def test_ziprecruiter_extraction_uses_selected_right_pane_contract() -> None:
    content_script = (REPO_ROOT / "extension" / "content_script.js").read_text(encoding="utf-8")
    zip_block = content_script.split("const zipRecruiterAdapter = {", 1)[1].split("const robertHalfAdapter = {", 1)[0]

    assert "zipRecruiterRightPaneOpportunity()" in zip_block
    assert "zipRecruiterReviewDialogOpportunity()" in zip_block
    assert "zipRecruiterEmptyOpportunity()" in zip_block
    assert '[data-testid="right-pane"]' in content_script
    assert '[data-testid="job-details-scroll-container"]' in content_script
    assert '[data-testid="company-data"]' in content_script
    assert 'a[href^="/co/"]' in content_script
    assert 'clean(node.textContent) === "Job description"' in content_script
    assert 'url.searchParams.get("lk")' in content_script
    assert 'sourceUrl.searchParams.set("lk", listingKey)' in content_script
    assert "job-card-title" not in zip_block
    assert "job-card-company" not in zip_block
    assert "job-card-location" not in zip_block


def test_roberthalf_extraction_uses_selected_detail_card_contract() -> None:
    content_script = (REPO_ROOT / "extension" / "content_script.js").read_text(encoding="utf-8")
    roberthalf_block = content_script.split("const robertHalfAdapter = {", 1)[1].split("function proposalJobDetailsRoot", 1)[0]

    assert "robertHalfSelectedDetails()" in roberthalf_block
    assert 'rhcl-job-card[data-testid="job-details"]' in content_script
    assert 'rhcl-job-card[selected="true"]' in content_script
    assert 'details?.getAttribute("headline")' in roberthalf_block
    assert 'details?.getAttribute("destination")' in content_script
    assert 'details?.getAttribute("worksite")' in content_script
    assert 'details?.getAttribute("location")' in content_script
    assert 'details?.getAttribute("type")' in roberthalf_block
    assert 'details?.getAttribute("copy")' in content_script
    assert '[data-testid="job-details-description"]' in content_script
    assert '[data-testid="job-details-requirements"]' in roberthalf_block
    assert 'a[href*="/us/en/job/"].rhcl-typography--display5' not in roberthalf_block
    assert '[data-testid="job-details-location"]' not in roberthalf_block


def test_popup_uses_unified_source_aware_snapshot_form() -> None:
    popup_html = (REPO_ROOT / "extension" / "popup.html").read_text(encoding="utf-8")
    popup_js = (REPO_ROOT / "extension" / "popup.js").read_text(encoding="utf-8")

    for field_id in [
        "applied-indicator",
        "applied-summary",
        "applications-dashboard-link",
        "source-url",
        "employment-type",
        "company-context",
        "recruiter-context",
        "responsibilities",
        "requirements",
        "nice-to-haves",
        "questions",
        "warnings",
    ]:
        assert f'id="{field_id}"' in popup_html

    assert "Page context sent to model" not in popup_html
    assert "context-panel" not in popup_html
    assert "Dice context" not in popup_html
    assert "Extraction confidence" not in popup_html
    assert 'id="extraction-confidence"' not in popup_html
    assert "Compensation" not in popup_html
    assert 'id="budget"' not in popup_html
    assert "syncSourceFields" in popup_js
    assert "company_context: companyContext" in popup_js
    assert 'codex_draft: "Drafting"' in popup_js
    assert 'codex_draft: "Drafting with portfolio context..."' in popup_js
    assert "draft.draft_text" in popup_js
    assert "draft.primary_text" not in popup_js
    assert "draft.proposal" not in popup_js
    assert "short_application_message" not in popup_html
    assert "short_application_message" not in popup_js
    assert "question_answers" not in popup_html
    assert "question_answers" not in popup_js
    assert "selecting_context" not in popup_js
    assert "humanizer" not in popup_js
    assert "extractionConfidence" not in popup_js
    assert "extraction_confidence" not in popup_js
    assert "source_text" not in popup_js
    assert "compensation:" not in popup_js
    assert "remote_status" not in popup_js
    assert "remote-status" not in popup_html
    assert "LOOKUP_APPLICATION" in popup_js
    assert "refreshApplicationLookup" in popup_js
    assert "Already in application ledger." in popup_js


def test_popup_wires_cover_letter_pdf_controls() -> None:
    popup_html = (REPO_ROOT / "extension" / "popup.html").read_text(encoding="utf-8")
    popup_js = (REPO_ROOT / "extension" / "popup.js").read_text(encoding="utf-8")
    background_js = (REPO_ROOT / "extension" / "background.js").read_text(encoding="utf-8")

    for field_id in ["generate-pdf", "open-pdf-folder", "pdf-status"]:
        assert f'id="{field_id}"' in popup_html

    assert "START_PDF_EXPORT" in popup_js
    assert "START_PDF_EXPORT" in background_js
    assert "pdf_status" in popup_js
    assert "pdf_status" in background_js
    assert "chrome.storage.onChanged" in popup_js
    assert "/pdf`" in background_js
    assert "/pdf/reveal`" in popup_js
    assert "draftType.value === \"cover_letter\"" in popup_js
    assert "setPdfControls" in popup_js


def test_extension_wires_application_logging() -> None:
    manifest = json.loads((REPO_ROOT / "extension" / "manifest.json").read_text(encoding="utf-8"))
    popup_html = (REPO_ROOT / "extension" / "popup.html").read_text(encoding="utf-8")
    popup_js = (REPO_ROOT / "extension" / "popup.js").read_text(encoding="utf-8")
    background_js = (REPO_ROOT / "extension" / "background.js").read_text(encoding="utf-8")
    application_logger_js = (REPO_ROOT / "extension" / "application_logger.js").read_text(encoding="utf-8")
    dice_wizard_assistant_js = (REPO_ROOT / "extension" / "dice_wizard_assistant.js").read_text(encoding="utf-8")

    scripts = manifest["content_scripts"][0]["js"]
    assert scripts == ["content_script.js", "application_logger.js", "dice_wizard_assistant.js"]
    assert "https://*.indeed.com/*" in manifest["host_permissions"]
    assert 'id="mark-applied"' in popup_html
    assert "LOG_APPLICATION" in popup_js
    assert 'detected_by: "manual"' in popup_js
    assert "APPLICATION_CAPTURE_PENDING" in background_js
    assert "APPLICATION_CONFIRMED" in background_js
    assert "LOOKUP_APPLICATION" in background_js
    assert "Backend offline. Start it with: uv --no-config run jada serve" in background_js
    assert "userErrorMessage" in background_js
    assert "LOOKUP_DRAFT" in background_js
    assert "GET_DRAFT_JOB" in background_js
    assert "REVEAL_PDF" in background_js
    assert "DOWNLOAD_PDF" not in background_js
    assert "APPLICATION_QUEUE_KEY" in background_js
    assert "/applications" in background_js
    assert "/applications/lookup" in background_js
    assert "job-application-ledger-badge" in application_logger_js
    assert "LOOKUP_APPLICATION" in application_logger_js
    assert "Already applied" in application_logger_js
    assert "Application recorded" in application_logger_js
    assert "visibleBadgeSourceUrl === sourceUrl" in application_logger_js
    assert "badge.dataset.sourceUrl = badgeSourceUrl" in application_logger_js
    assert 'setLedgerBadge(await lookupApplication(sourceUrl), { sourceUrl })' in application_logger_js
    assert "recordedBadge" not in application_logger_js
    assert "remote_status" not in application_logger_js
    assert "submitSelectors" in application_logger_js
    assert "confirmationSelectors" in application_logger_js
    assert "submitButtons" in application_logger_js
    assert "event.composedPath" in application_logger_js
    assert "matchesSubmitElement" in application_logger_js
    assert "scheduleLedgerBadgeRefresh(300, { force: true })" in application_logger_js
    assert "attributeFilter" in application_logger_js
    for attribute_name in ["applied", "selected", "destination", "headline", "cta-type"]:
        assert f'"{attribute_name}"' in application_logger_js
    assert "(rule.confirmationSelectors || []).some" in application_logger_js
    assert "(rule.confirmationPathPatterns || []).some" in application_logger_js
    assert 'button[aria-label="1-Click Apply"]' in application_logger_js
    assert 'button[aria-label="Quick Apply"]' in application_logger_js
    assert '{ selector: \'button[type="button"]\', text: "Submit" }' in application_logger_js
    assert "Your application was submitted!" in application_logger_js
    assert 'button[aria-label="Applied"]' in application_logger_js
    assert "Congrats! You've successfully applied and created a profile!" not in application_logger_js
    assert 'button[aria-label="Quick apply"]' in application_logger_js
    assert 'rhcl-button[component-title="Quick apply"]' in application_logger_js
    assert 'rhcl-job-card[data-testid="job-details"][cta-type="quick-apply"]' in application_logger_js
    assert 'rhcl-job-card[data-testid="job-details"][applied=""]' in application_logger_js
    assert 'rhcl-job-card[data-testid="job-details"][applied="true"]' in application_logger_js
    assert 'rhcl-job-card[selected="true"][applied=""]' in application_logger_js
    assert 'captureOpportunity: diceWizardOpportunity' in application_logger_js
    assert '/^\\/job-applications\\/([^/]+)\\/wizard(?:\\/success)?\\/?$/' in application_logger_js
    assert '/\\/job-applications\\/[^/]+\\/wizard\\/success\\/?$/' in application_logger_js
    assert "diceDetailOpportunity" in application_logger_js
    assert 'script[type="application/ld+json"]' in application_logger_js
    assert 'type === "JobPosting"' in application_logger_js
    assert "message.opportunity || pending?.opportunity" in background_js
    assert "document.body" not in application_logger_js

    assert "job-application-dice-cover-letter-panel" in dice_wizard_assistant_js
    assert "START_DRAFT_JOB" in dice_wizard_assistant_js
    assert "START_PDF_EXPORT" in dice_wizard_assistant_js
    assert "LOOKUP_DRAFT" in dice_wizard_assistant_js
    assert "REVEAL_PDF" in dice_wizard_assistant_js
    assert "Open PDF" in dice_wizard_assistant_js
    assert "Show in Finder" in dice_wizard_assistant_js
    assert "Generate PDF" in dice_wizard_assistant_js
    assert "pollForResumeStep" in dice_wizard_assistant_js
    assert "installRouteWatcher" in dice_wizard_assistant_js
    assert "isDiceWizardSuccessStep" in dice_wizard_assistant_js
    assert "removePanel" in dice_wizard_assistant_js
    assert "patchedHistoryMethod" in dice_wizard_assistant_js
    assert 'window.setInterval(() => handleRouteChange(), 1000)' in dice_wizard_assistant_js
    assert "autoStartedForJobId" in dice_wizard_assistant_js
    assert "MutationObserver" not in dice_wizard_assistant_js
    assert "coverLetterFileInput" not in dice_wizard_assistant_js
    assert "DOWNLOAD_PDF" not in dice_wizard_assistant_js
    assert "input.files = transfer.files" not in dice_wizard_assistant_js
    assert "DataTransfer" not in dice_wizard_assistant_js
