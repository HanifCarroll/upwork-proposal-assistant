from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_extension_has_no_stale_compatibility_path() -> None:
    content_script = (REPO_ROOT / "extension" / "content_script.js").read_text(encoding="utf-8")
    popup = (REPO_ROOT / "extension" / "popup.js").read_text(encoding="utf-8")

    assert "leg" + "acy" not in content_script.lower()
    assert "UPWORK_PROPOSAL_EXTRACT" not in content_script
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


def test_popup_uses_unified_source_aware_snapshot_form() -> None:
    popup_html = (REPO_ROOT / "extension" / "popup.html").read_text(encoding="utf-8")
    popup_js = (REPO_ROOT / "extension" / "popup.js").read_text(encoding="utf-8")

    for field_id in [
        "source-url",
        "employment-type",
        "remote-status",
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
