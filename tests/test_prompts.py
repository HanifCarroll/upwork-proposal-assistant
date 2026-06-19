from __future__ import annotations

import json
from pathlib import Path

from upwork_proposal_assistant.models import ContextBundle, DraftRequest, OpportunitySnapshot
from upwork_proposal_assistant.prompts import build_draft_prompt


def test_full_draft_prompt_requests_supported_adaptability_claims() -> None:
    prompt = build_draft_prompt(
        DraftRequest(opportunity=OpportunitySnapshot(title="Software Engineer")),
        ContextBundle(profile="Adapts across product constraints.", offers=[], projects=[]),
    )

    assert "Use the full supplied context to choose the application strategy and write the draft in one pass" in prompt
    assert "include one honest adaptability claim" in prompt
    assert "concrete source refs" in prompt
    assert "Put the generated application body in `draft_text`" in prompt
    assert "primary_text" not in prompt
    assert "`proposal`" not in prompt


def test_cover_letter_prompt_targets_job_platform_letters() -> None:
    prompt = build_draft_prompt(
        DraftRequest(opportunity=OpportunitySnapshot(source="dice", title="Software Engineer")),
        ContextBundle(profile="Product-minded full-stack engineer.", offers=[], projects=[]),
    )

    assert "employer-facing job-platform cover letter" in prompt
    assert "Dice, Indeed, ZipRecruiter" in prompt
    assert "ability to adapt to new tools and domains" in prompt
    assert "When the named stack or domain is not a direct match" in prompt
    assert "Technical proof-point translation" in prompt
    assert "plain business or product language" in prompt
    assert "Name only the 1-2 technical details" in prompt
    assert "implementation inventory" in prompt
    assert "Adjacent-match framing" in prompt
    assert "adaptability across unfamiliar tools, stacks, or domains" in prompt
    assert "clear and concise" in prompt


def test_draft_schema_rejects_old_output_fields() -> None:
    schema = json.loads(Path("schemas/draft_response.schema.json").read_text(encoding="utf-8"))

    assert "draft_text" in schema["required"]
    assert "draft_text" in schema["properties"]
    assert "primary_text" not in schema["properties"]
    assert "proposal" not in schema["properties"]
    assert "short_message" not in schema["properties"]
