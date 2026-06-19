from __future__ import annotations

import json
from pathlib import Path
import sqlite3

from upwork_proposal_assistant.models import ContextSelection, DraftRequest, DraftResponse, StoredDraft


class DraftStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def init(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                create table if not exists drafts (
                    id text primary key,
                    created_at text not null,
                    request_json text not null,
                    selection_json text not null,
                    first_pass_json text not null,
                    final_pass_json text not null
                )
                """
            )

    def insert(self, draft: StoredDraft) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                insert into drafts (id, created_at, request_json, selection_json, first_pass_json, final_pass_json)
                values (?, ?, ?, ?, ?, ?)
                """,
                (
                    draft.id,
                    draft.created_at,
                    draft.request.model_dump_json(),
                    draft.selection.model_dump_json(),
                    json.dumps(draft.first_pass),
                    json.dumps(draft.final_pass),
                ),
            )

    def get_response(self, draft_id: str) -> DraftResponse | None:
        with self._connect() as conn:
            row = conn.execute(
                "select id, created_at, final_pass_json from drafts where id = ?",
                (draft_id,),
            ).fetchone()
        if row is None:
            return None
        final_pass = json.loads(str(row["final_pass_json"]))
        primary_text = str(final_pass.get("primary_text") or final_pass.get("proposal", ""))
        return DraftResponse(
            id=str(row["id"]),
            proposal=str(final_pass.get("proposal") or primary_text),
            primary_text=primary_text,
            draft_type=final_pass.get("draft_type", "cover_letter"),
            subject_line=str(final_pass.get("subject_line", "")),
            short_message=str(final_pass.get("short_message", "")),
            question_answers=final_pass.get("question_answers", []),
            angle=str(final_pass.get("angle", "")),
            selected_projects=[str(item) for item in final_pass.get("selected_projects", [])],
            decisions=final_pass.get("decisions", []),
            claims=final_pass.get("claims", []),
            warnings=[str(item) for item in final_pass.get("warnings", [])],
            created_at=str(row["created_at"]),
        )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn


def make_stored_draft(
    request: DraftRequest,
    selection: ContextSelection,
    first_pass: dict[str, object],
    final_pass: dict[str, object],
) -> StoredDraft:
    return StoredDraft(request=request, selection=selection, first_pass=first_pass, final_pass=final_pass)
