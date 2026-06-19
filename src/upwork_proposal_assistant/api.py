from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from upwork_proposal_assistant.codex_provider import CodexProvider, CodexProviderError
from upwork_proposal_assistant.config import AppPaths
from upwork_proposal_assistant.context.indexer import build_context, ensure_context
from upwork_proposal_assistant.draft_pipeline import run_draft_pipeline
from upwork_proposal_assistant.job_store import DraftJobStore
from upwork_proposal_assistant.jobs import DraftJobRunner, build_job_status
from upwork_proposal_assistant.models import DraftJobCreated, DraftJobStatus, DraftRequest, DraftResponse, ReindexResponse
from upwork_proposal_assistant.storage import DraftStore


def create_app() -> FastAPI:
    paths = AppPaths()
    paths.ensure_runtime()
    store = DraftStore(paths.db_path)
    store.init()
    job_store = DraftJobStore(paths.db_path)
    job_store.init()
    job_store.fail_active("Server restarted before this draft job completed.")
    context = ensure_context(paths.portfolio_root, paths.context_dir)
    codex = CodexProvider(paths)
    runner = DraftJobRunner(context=context, codex=codex, draft_store=store, job_store=job_store)

    app = FastAPI(title="Application Draft Assistant", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("shutdown")
    def shutdown() -> None:
        runner.shutdown()

    @app.get("/health")
    def health() -> dict[str, object]:
        return {
            "ok": True,
            "project_count": len(context.projects),
            "humanizer_skill": str(paths.humanizer_skill_dir),
        }

    @app.post("/context/reindex")
    def reindex() -> ReindexResponse:
        refreshed = build_context(paths.portfolio_root, paths.context_dir)
        context.profile = refreshed.profile
        context.offers = refreshed.offers
        context.projects = refreshed.projects
        return ReindexResponse(project_count=len(context.projects), context_dir=str(paths.context_dir))

    @app.post("/draft")
    def draft(request: DraftRequest) -> DraftResponse:
        try:
            result = run_draft_pipeline(request=request, context=context, codex=codex, store=store)
        except CodexProviderError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        response = store.get_response(result.stored.id)
        if response is None:
            raise HTTPException(status_code=500, detail="Draft was not stored")
        return response

    @app.post("/draft-jobs", status_code=202)
    def create_draft_job(request: DraftRequest) -> DraftJobCreated:
        return runner.enqueue(request)

    @app.get("/draft-jobs/{job_id}")
    def get_draft_job(job_id: str) -> DraftJobStatus:
        record = job_store.get(job_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Draft job not found")
        return build_job_status(record, store)

    @app.get("/drafts/{draft_id}")
    def get_draft(draft_id: str) -> DraftResponse:
        response = store.get_response(draft_id)
        if response is None:
            raise HTTPException(status_code=404, detail="Draft not found")
        return response

    return app
