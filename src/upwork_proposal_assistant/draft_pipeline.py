from __future__ import annotations

from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from time import perf_counter
from typing import Iterator

from upwork_proposal_assistant.codex_provider import CodexProvider
from upwork_proposal_assistant.models import (
    CodexRunTiming,
    ContextBundle,
    ContextSelection,
    ContextSelectionPlan,
    DraftJobStage,
    DraftRequest,
    StageTiming,
    StoredDraft,
)
from upwork_proposal_assistant.prompts import build_draft_prompt, build_selection_prompt
from upwork_proposal_assistant.selector import selection_from_plan
from upwork_proposal_assistant.storage import DraftStore, make_stored_draft


StageCallback = Callable[[DraftJobStage, ContextSelection | None], None]
StageTimingCallback = Callable[[DraftJobStage, StageTiming], None]
CodexTimingCallback = Callable[[CodexRunTiming], None]


@dataclass(frozen=True)
class DraftPipelineResult:
    stored: StoredDraft
    selection: ContextSelection


def run_draft_pipeline(
    request: DraftRequest,
    context: ContextBundle,
    codex: CodexProvider,
    store: DraftStore,
    on_stage: StageCallback | None = None,
    on_stage_timing: StageTimingCallback | None = None,
    on_codex_timing: CodexTimingCallback | None = None,
) -> DraftPipelineResult:
    with _timed_stage("selecting_context", None, on_stage, on_stage_timing):
        selection_raw = codex.generate(
            build_selection_prompt(request, context),
            phase="context_selection",
            on_timing=on_codex_timing,
            schema_path=codex.paths.selection_schema_path,
        )
        selection_plan = ContextSelectionPlan.model_validate(selection_raw)
        selection = selection_from_plan(context, request, selection_plan)

    with _timed_stage("codex_draft", selection, on_stage, on_stage_timing):
        first_pass = codex.generate(
            build_draft_prompt(request, selection, context.profile),
            phase="draft",
            on_timing=on_codex_timing,
        )

    final_pass = first_pass
    # Humanizer is paused while first-pass cover-letter quality is evaluated.
    # Re-enable this block when the real humanizer skill is ready to own the final edit.
    # with _timed_stage("humanizer", selection, on_stage, on_stage_timing):
    #     final_pass = codex.generate(
    #         build_humanizer_prompt(first_pass, selection),
    #         phase="humanizer",
    #         on_timing=on_codex_timing,
    #     )

    with _timed_stage("saving", selection, on_stage, on_stage_timing):
        stored = make_stored_draft(request, selection, first_pass, final_pass)
        store.insert(stored)
    return DraftPipelineResult(stored=stored, selection=selection)


def _notify(callback: StageCallback | None, stage: DraftJobStage, selection: ContextSelection | None) -> None:
    if callback is not None:
        callback(stage, selection)


@contextmanager
def _timed_stage(
    stage: DraftJobStage,
    selection: ContextSelection | None,
    on_stage: StageCallback | None,
    on_stage_timing: StageTimingCallback | None,
) -> Iterator[None]:
    _notify(on_stage, stage, selection)
    started_at = _utc_now_iso()
    started = perf_counter()
    try:
        yield
    finally:
        if on_stage_timing is not None:
            on_stage_timing(
                stage,
                StageTiming(
                    started_at=started_at,
                    finished_at=_utc_now_iso(),
                    duration_ms=round((perf_counter() - started) * 1000),
                ),
            )


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()
