from __future__ import annotations

from upwork_proposal_assistant.models import (
    ContextBundle,
    ContextSelection,
    DraftRequest,
    OfferAngle,
    OpportunitySnapshot,
)
from upwork_proposal_assistant.prompts import build_draft_prompt, build_selection_prompt


def test_selection_prompt_requests_supported_adaptability_claims() -> None:
    prompt = build_selection_prompt(
        DraftRequest(opportunity=OpportunitySnapshot(title="Software Engineer")),
        ContextBundle(profile="Adapts across product constraints.", offers=[], projects=[]),
    )

    assert "include one honest adaptability claim" in prompt
    assert "concrete source refs" in prompt


def test_cover_letter_prompt_targets_job_platform_letters() -> None:
    selection = ContextSelection(
        angle=OfferAngle(
            key="backend_platform",
            label="Backend platform",
            use_when=[],
            promise="Maintain core services.",
            source_ref="offer.backend_platform",
        ),
        projects=[],
        source_evidence=[],
        selection_decisions=[],
    )
    prompt = build_draft_prompt(
        DraftRequest(opportunity=OpportunitySnapshot(source="dice", title="Software Engineer")),
        selection,
        profile="Product-minded full-stack engineer.",
    )

    assert "employer-facing job-platform cover letter" in prompt
    assert "Dice, Indeed, ZipRecruiter" in prompt
    assert "ability to adapt to new tools and domains" in prompt
    assert "When the named stack or domain is not a direct match" in prompt
