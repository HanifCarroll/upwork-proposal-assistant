from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
import sqlite3
from uuid import uuid4

from pydantic import BaseModel

from upwork_proposal_assistant.models import (
    CodexRunTiming,
    ContextSelection,
    DraftJobCreated,
    DraftJobStage,
    DraftJobState,
    DraftJobTimings,
    DraftRequest,
    StageTiming,
)


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


class DraftJobRecord(BaseModel):
    id: str
    status: DraftJobState
    stage: DraftJobStage
    request: DraftRequest
    selection: ContextSelection | None = None
    result_draft_id: str | None = None
    error: str | None = None
    timings: DraftJobTimings
    created_at: str
    updated_at: str


class DraftJobStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def init(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                create table if not exists draft_jobs (
                    id text primary key,
                    status text not null,
                    stage text not null,
                    request_json text not null,
                    selection_json text,
                    result_draft_id text,
                    error text,
                    timing_json text,
                    created_at text not null,
                    updated_at text not null
                )
                """
            )
            self._ensure_column(conn, "draft_jobs", "timing_json", "text")

    def create(self, request: DraftRequest) -> DraftJobCreated:
        job_id = uuid4().hex
        now = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                insert into draft_jobs (
                    id, status, stage, request_json, selection_json, result_draft_id, error, timing_json, created_at, updated_at
                )
                values (?, ?, ?, ?, null, null, null, ?, ?, ?)
                """,
                (job_id, "queued", "queued", request.model_dump_json(), DraftJobTimings().model_dump_json(), now, now),
            )
        return DraftJobCreated(id=job_id, status="queued", stage="queued", created_at=now, updated_at=now)

    def get(self, job_id: str) -> DraftJobRecord | None:
        with self._connect() as conn:
            row = conn.execute("select * from draft_jobs where id = ?", (job_id,)).fetchone()
        if row is None:
            return None
        return self._record_from_row(row)

    def update_stage(self, job_id: str, stage: DraftJobStage) -> None:
        with self._connect() as conn:
            conn.execute(
                "update draft_jobs set status = ?, stage = ?, updated_at = ? where id = ?",
                ("running", stage, utc_now_iso(), job_id),
            )

    def save_selection(self, job_id: str, selection: ContextSelection, stage: DraftJobStage) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                update draft_jobs
                set status = ?, stage = ?, selection_json = ?, updated_at = ?
                where id = ?
                """,
                ("running", stage, selection.model_dump_json(), utc_now_iso(), job_id),
            )

    def complete(self, job_id: str, draft_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                update draft_jobs
                set status = ?, stage = ?, result_draft_id = ?, error = null, updated_at = ?
                where id = ?
                """,
                ("succeeded", "done", draft_id, utc_now_iso(), job_id),
            )

    def record_stage_timing(self, job_id: str, stage: DraftJobStage, timing: StageTiming) -> None:
        with self._connect() as conn:
            row = conn.execute("select created_at, timing_json from draft_jobs where id = ?", (job_id,)).fetchone()
            if row is None:
                return
            timings = self._timings_from_json(row["timing_json"])
            timings.stages[stage] = timing
            if stage == "selecting_context":
                timings.queue_ms = _duration_between_ms(str(row["created_at"]), timing.started_at)
            conn.execute(
                "update draft_jobs set timing_json = ?, updated_at = ? where id = ?",
                (timings.model_dump_json(), utc_now_iso(), job_id),
            )

    def record_codex_timing(self, job_id: str, timing: CodexRunTiming) -> None:
        with self._connect() as conn:
            row = conn.execute("select timing_json from draft_jobs where id = ?", (job_id,)).fetchone()
            if row is None:
                return
            timings = self._timings_from_json(row["timing_json"])
            timings.codex_runs.append(timing)
            conn.execute(
                "update draft_jobs set timing_json = ?, updated_at = ? where id = ?",
                (timings.model_dump_json(), utc_now_iso(), job_id),
            )

    def fail(self, job_id: str, error: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                update draft_jobs
                set status = ?, stage = ?, error = ?, updated_at = ?
                where id = ?
                """,
                ("failed", "failed", error, utc_now_iso(), job_id),
            )

    def fail_active(self, error: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                update draft_jobs
                set status = ?, stage = ?, error = ?, updated_at = ?
                where status in ('queued', 'running')
                """,
                ("failed", "failed", error, utc_now_iso()),
            )

    def _record_from_row(self, row: sqlite3.Row) -> DraftJobRecord:
        selection_json = row["selection_json"]
        selection = ContextSelection.model_validate_json(str(selection_json)) if selection_json is not None else None
        return DraftJobRecord(
            id=str(row["id"]),
            status=row["status"],
            stage=row["stage"],
            request=DraftRequest.model_validate_json(str(row["request_json"])),
            selection=selection,
            result_draft_id=str(row["result_draft_id"]) if row["result_draft_id"] is not None else None,
            error=str(row["error"]) if row["error"] is not None else None,
            timings=self._timings_from_json(row["timing_json"]),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    def _timings_from_json(self, raw: object) -> DraftJobTimings:
        if raw is None:
            return DraftJobTimings()
        return DraftJobTimings.model_validate_json(str(raw))

    def _ensure_column(self, conn: sqlite3.Connection, table: str, column: str, column_type: str) -> None:
        rows = conn.execute(f"pragma table_info({table})").fetchall()
        existing = {str(row["name"]) for row in rows}
        if column not in existing:
            conn.execute(f"alter table {table} add column {column} {column_type}")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn


def _duration_between_ms(started_at: str, finished_at: str) -> int | None:
    try:
        started = datetime.fromisoformat(started_at)
        finished = datetime.fromisoformat(finished_at)
    except ValueError:
        return None
    return max(0, round((finished - started).total_seconds() * 1000))
