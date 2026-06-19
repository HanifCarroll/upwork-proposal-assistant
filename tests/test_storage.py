from __future__ import annotations

from pathlib import Path

from upwork_proposal_assistant.models import DraftRequest, UpworkProject
from upwork_proposal_assistant.storage import DraftStore, make_stored_draft


def test_store_round_trips_draft_response(tmp_path: Path) -> None:
    store = DraftStore(tmp_path / "drafts.db")
    store.init()
    request = DraftRequest(project=UpworkProject(title="Job"))
    draft = make_stored_draft(
        request,
        {
            "draft_text": "I can help with this.",
            "draft_type": "cover_letter",
            "subject_line": "",
            "question_answers": [],
            "selected_angle": {
                "key": "ai",
                "label": "AI",
                "promise": "AI",
                "caused_by": ["offer.ai"],
            },
            "role_classification": "AI workflow",
            "application_strategy": "Lead with relevant workflow proof.",
            "selected_projects": [],
            "rejected_projects": [],
            "decisions": [],
            "claims": [],
            "warnings": [],
        },
    )

    store.insert(draft)
    response = store.get_response(draft.id)

    assert response is not None
    assert response.draft_text == "I can help with this."
    assert response.selected_angle.label == "AI"
