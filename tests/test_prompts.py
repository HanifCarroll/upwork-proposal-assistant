from __future__ import annotations

import json
from pathlib import Path

from job_application_draft_assistant.models import ContextBundle, DraftRequest, OpportunitySnapshot, ResumeContext
from job_application_draft_assistant.drafts.prompts import build_draft_prompt


SECTION_HEADINGS = {
    "Information rules:",
    "Writing rules:",
    "Draft-type rules:",
    "Explain experience simply:",
    "Audit fields only:",
    "Context packet:",
}

APPLICANT_FACING_SECTIONS = [
    "Writing rules",
    "Draft-type rules",
    "Explain experience simply",
]

REQUIRED_AUDIT_FIELDS = ["claims[]", "decisions[]", "warnings", "caused_by"]

BANNED_APPLICANT_FACING_TERMS = [
    "supplied context",
    "source evidence",
    "source refs",
    "proof",
    "claim",
    "claims[]",
    "decisions[]",
    "warnings",
    "caused_by",
    "audit",
    "source-tracking",
]


def test_prompt_contract_includes_required_output_fields() -> None:
    prompt = _prompt()

    assert "information below" in prompt
    assert "Do not invent" in prompt
    assert "`draft_type`" in prompt
    assert "`draft_text`" in prompt
    assert "`cover_letter`" in prompt
    assert "`upwork_proposal`" in prompt
    assert "`selected_angle.key`" in prompt
    assert "primary_text" not in prompt
    assert "`proposal`" not in prompt
    assert "short_application_message" not in prompt
    assert "question_answers[]" not in prompt


def test_prompt_includes_resume_context_and_source_label() -> None:
    prompt = _prompt()

    assert '"resume"' in prompt
    assert "Senior product engineer with Python systems work." in prompt
    assert "`resume.text`" in prompt


def test_prompt_contract_separates_applicant_copy_from_audit_fields() -> None:
    sections = _sections(_prompt())
    applicant_copy_sections = "\n".join(sections[name] for name in APPLICANT_FACING_SECTIONS)
    audit_section = sections["Audit fields only"]

    for term in BANNED_APPLICANT_FACING_TERMS:
        assert term not in applicant_copy_sections.lower()

    for field in REQUIRED_AUDIT_FIELDS:
        assert field in audit_section

    assert "where it came from" in audit_section
    assert "applicant-facing draft" in audit_section


def test_draft_type_prompt_targets_job_platform_contracts() -> None:
    sections = _sections(_prompt())
    draft_type_rules = sections["Draft-type rules"]

    for required in ["cover letter", "Dice", "Indeed", "ZipRecruiter", "real applicant", "plain language"]:
        assert required in draft_type_rules

    for required in ["exactly match", "named tool or industry", "do not apologize", "closest real experience"]:
        assert required in draft_type_rules

    assert "Best,\nHanif Carroll" in draft_type_rules
    assert "Upwork client" in draft_type_rules
    assert "next-step question" in draft_type_rules
    assert "compliance report" in draft_type_rules
    assert "Prefer framing like" not in "\n".join(sections.values())


def test_draft_schema_rejects_old_output_fields() -> None:
    schema = json.loads(Path("schemas/draft_response.schema.json").read_text(encoding="utf-8"))

    assert "draft_text" in schema["required"]
    assert "draft_text" in schema["properties"]
    assert "primary_text" not in schema["properties"]
    assert "proposal" not in schema["properties"]
    assert "short_message" not in schema["properties"]
    assert "question_answers" not in schema["required"]
    assert "question_answers" not in schema["properties"]
    assert schema["properties"]["draft_type"]["enum"] == ["cover_letter", "upwork_proposal"]


def _prompt() -> str:
    return build_draft_prompt(
        DraftRequest(opportunity=OpportunitySnapshot(source="dice", title="Software Engineer")),
        ContextBundle(
            profile="Product-minded full-stack engineer.",
            resume=ResumeContext(text="Senior product engineer with Python systems work."),
            offers=[],
            projects=[],
        ),
    )


def _sections(prompt: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {"Preamble": []}
    current = "Preamble"
    for line in prompt.splitlines():
        stripped = line.strip()
        if stripped in SECTION_HEADINGS:
            current = stripped.removesuffix(":")
            sections[current] = []
            continue
        sections[current].append(line)
    return {name: "\n".join(lines) for name, lines in sections.items()}
