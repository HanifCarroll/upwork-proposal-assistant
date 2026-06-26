from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

import job_application_draft_assistant.api as api
from job_application_draft_assistant.config import AppPaths


def test_lookup_misses_return_200_with_unmatched_payload(
    tmp_path: Path,
    monkeypatch,
) -> None:
    paths = AppPaths(
        context_dir=tmp_path / "context",
        runtime_dir=tmp_path / "runtime",
        db_path=tmp_path / "drafts.db",
        codex_runs_dir=tmp_path / "codex-runs",
        pdf_output_dir=tmp_path / "cover-letters",
        pdf_archive_dir=tmp_path / "cover-letters" / "archive",
    )
    monkeypatch.setattr(api, "AppPaths", lambda: paths)
    client = TestClient(api.create_app())

    application = client.get(
        "/applications/lookup",
        params={"source_url": "https://www.dice.com/job-detail/missing"},
    )
    draft = client.get(
        "/drafts/lookup",
        params={"source_url": "https://www.dice.com/job-detail/missing"},
    )

    assert application.status_code == 200
    assert application.json() == {"matched": False, "application": None}
    assert draft.status_code == 200
    assert draft.json() == {"matched": False, "draft": None}
