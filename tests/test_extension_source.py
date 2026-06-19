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


def test_dice_extraction_does_not_send_page_wide_text() -> None:
    content_script = (REPO_ROOT / "extension" / "content_script.js").read_text(encoding="utf-8")
    dice_block = content_script.split("const diceAdapter = {", 1)[1].split("const indeedAdapter = {", 1)[0]

    assert "visibleText()" not in dice_block
    assert "fullText" not in dice_block
    assert 'const rawText = clean([headerText, description].filter(Boolean).join(" "));' in dice_block
    assert "raw_text: rawText || description || headerText" in dice_block
