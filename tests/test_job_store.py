from __future__ import annotations

from pathlib import Path

from upwork_proposal_assistant.job_store import DraftJobStore
from upwork_proposal_assistant.jobs import build_job_status
from upwork_proposal_assistant.models import CodexRunTiming, ContextSelection, DraftRequest, OfferAngle, StageTiming, UpworkProject
from upwork_proposal_assistant.storage import DraftStore, make_stored_draft


def test_job_store_tracks_selection_and_completion(tmp_path: Path) -> None:
    db_path = tmp_path / "drafts.db"
    draft_store = DraftStore(db_path)
    draft_store.init()
    job_store = DraftJobStore(db_path)
    job_store.init()
    request = DraftRequest(project=UpworkProject(title="Build a SaaS workflow"))
    angle = OfferAngle(key="saas", label="SaaS", use_when=["saas"], promise="Stabilize SaaS", source_ref="offer.saas")
    selection = ContextSelection(angle=angle, projects=[], source_evidence=[], selection_decisions=[])
    final: dict[str, object] = {
        "proposal": "I would stabilize the riskiest workflow first.",
        "angle": "saas",
        "selected_projects": [],
        "decisions": [],
        "claims": [],
        "warnings": [],
    }

    job = job_store.create(request)
    job_store.save_selection(job.id, selection, "codex_draft")
    job_store.record_stage_timing(
        job.id,
        "selecting_context",
        StageTiming(
            started_at="2026-01-01T00:00:00.100000+00:00",
            finished_at="2026-01-01T00:00:00.125000+00:00",
            duration_ms=25,
        ),
    )
    job_store.record_codex_timing(
        job.id,
        CodexRunTiming(
            phase="draft",
            started_at="2026-01-01T00:00:00.125000+00:00",
            finished_at="2026-01-01T00:00:01.625000+00:00",
            duration_ms=1500,
            return_code=0,
            prompt_chars=1200,
            stdout_bytes=50,
            stderr_bytes=10,
            output_bytes=600,
            parse_duration_ms=2,
        ),
    )
    draft = make_stored_draft(request, selection, first_pass=final, final_pass=final)
    draft_store.insert(draft)
    job_store.complete(job.id, draft.id)

    record = job_store.get(job.id)

    assert record is not None
    status = build_job_status(record, draft_store)
    assert status.status == "succeeded"
    assert status.stage == "done"
    assert status.selected_angle == "SaaS"
    assert status.result is not None
    assert status.result.proposal == "I would stabilize the riskiest workflow first."
    assert status.timings.stages["selecting_context"].duration_ms == 25
    assert status.timings.codex_runs[0].phase == "draft"
    assert status.timings.codex_runs[0].duration_ms == 1500


def test_fail_active_marks_stale_jobs_failed(tmp_path: Path) -> None:
    job_store = DraftJobStore(tmp_path / "drafts.db")
    job_store.init()
    job = job_store.create(DraftRequest(project=UpworkProject(title="Job")))
    job_store.update_stage(job.id, "humanizer")

    job_store.fail_active("Server restarted.")
    record = job_store.get(job.id)

    assert record is not None
    assert record.status == "failed"
    assert record.stage == "failed"
    assert record.error == "Server restarted."
