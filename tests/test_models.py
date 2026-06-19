from __future__ import annotations

from upwork_proposal_assistant.models import OpportunitySnapshot


def test_opportunity_snapshot_ignores_removed_raw_text_field() -> None:
    snapshot = OpportunitySnapshot.model_validate(
        {
            "title": "Frontend contractor",
            "description": "React and TypeScript work.",
            "raw_text": "Old page-wide text should not reach prompts.",
        }
    )

    assert "raw_text" not in snapshot.model_dump()
    assert "Old page-wide text" not in snapshot.search_text()
