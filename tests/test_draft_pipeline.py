from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import cast

from upwork_proposal_assistant.codex_provider import CodexProvider
from upwork_proposal_assistant.config import AppPaths
from upwork_proposal_assistant.draft_pipeline import run_draft_pipeline
from upwork_proposal_assistant.models import (
    CodexRunTiming,
    ContextBundle,
    ContextProject,
    DraftRequest,
    OfferAngle,
    OpportunitySnapshot,
)
from upwork_proposal_assistant.storage import DraftStore


class FakeCodex:
    def __init__(self, paths: AppPaths) -> None:
        self.paths = paths
        self.calls: list[tuple[str, str, Path | None]] = []

    def generate(
        self,
        prompt: str,
        phase: str = "unknown",
        on_timing: Callable[[CodexRunTiming], None] | None = None,
        schema_path: Path | None = None,
    ) -> dict[str, object]:
        self.calls.append((phase, prompt, schema_path))
        if phase == "context_selection":
            return {
                "role_classification": "frontend staff augmentation",
                "selected_angle": {
                    "key": "frontend_staff_augmentation",
                    "label": "Frontend staff augmentation",
                    "promise": "Add dependable TypeScript, React, and Next.js capacity inside the existing team.",
                    "caused_by": ["opportunity.description", "opportunity.skills", "profile"],
                },
                "selected_project_slugs": ["genrupt"],
                "rejected_projects": [
                    {
                        "slug": "mucho-hangouts",
                        "reason": "Relevant React proof, but weaker than Genrupt for Next.js-specific work.",
                        "caused_by": ["project.mucho-hangouts.technologies", "project.genrupt.technologies"],
                    }
                ],
                "application_strategy": "Lead with hands-on frontend execution for an existing team, not MVP launch work.",
                "allowed_claims": [
                    {
                        "text": "Hanif has production Next.js and TypeScript experience from Genrupt.",
                        "caused_by": ["project.genrupt.technologies", "project.genrupt.solution"],
                    }
                ],
                "decisions": [
                    {
                        "audit_id": "model-select-role",
                        "decision": "Classify this as frontend staff augmentation.",
                        "caused_by": ["opportunity.description"],
                        "rationale": "The role asks for one additional hands-on frontend resource on an existing team.",
                    }
                ],
                "warnings": [],
            }
        if phase == "draft":
            return _draft_json("Draft from frontend staff augmentation.")
        return _draft_json("Humanized frontend staff augmentation.")


def test_pipeline_uses_model_led_context_selection(tmp_path: Path) -> None:
    paths = AppPaths(runtime_dir=tmp_path, codex_runs_dir=tmp_path / "codex-runs")
    codex = FakeCodex(paths)
    store = DraftStore(tmp_path / "drafts.db")
    store.init()
    context = _context_bundle()
    request = DraftRequest(
        opportunity=OpportunitySnapshot.model_validate(
            {
                "source": "dice",
                "title": "Senior Software Engineer",
                "company": "Motion Recruitment Partners, LLC",
                "description": (
                    "The client is looking to add one additional resource to support an existing team member. "
                    "This is not a lead or stakeholder-facing role. The primary need is TypeScript, React, NextJS, "
                    "Jira, and roadmap execution."
                ),
                "skills": ["React", "TypeScript"],
                "source_text": "Similar job says launch your career, but that text is unrelated page chrome.",
            }
        )
    )

    result = run_draft_pipeline(
        request=request,
        context=context,
        codex=cast(CodexProvider, codex),
        store=store,
    )

    assert [call[0] for call in codex.calls] == ["context_selection", "draft"]
    assert codex.calls[0][2] == paths.selection_schema_path
    assert '"available_projects"' in codex.calls[0][1]
    assert "mucho-hangouts" in codex.calls[0][1]
    assert "source_text" not in codex.calls[0][1]
    assert "unrelated page chrome" not in codex.calls[0][1]
    assert result.stored.first_pass["proposal"] == "Draft from frontend staff augmentation."
    assert result.stored.final_pass["proposal"] == "Draft from frontend staff augmentation."
    assert result.selection.angle.key == "frontend_staff_augmentation"
    assert [project.slug for project in result.selection.projects] == ["genrupt"]
    assert result.selection.role_classification == "frontend staff augmentation"
    assert result.selection.rejected_projects[0].slug == "mucho-hangouts"


def _context_bundle() -> ContextBundle:
    return ContextBundle(
        profile="# Hanif\n\nBased in Buenos Aires, works US hours, contracts through HC Studio LLC.",
        offers=[
            OfferAngle(
                key="mvp_launch",
                label="MVP launch",
                use_when=["mvp", "launch"],
                promise="Cut and ship the first useful version.",
                source_ref="portfolio.service_offers.mvp",
            )
        ],
        projects=[
            ContextProject(
                slug="mucho-hangouts",
                title="Social Events Platform",
                track="mvp_build",
                proof_type="client",
                service="Fractional CTO",
                technologies=["Node.js", "TypeScript", "React"],
                best_for=["launch", "team support"],
                claim="Helped a live React product stabilize.",
                source_refs={
                    "project.mucho-hangouts.solution": "Improved typed patterns and messaging flows.",
                    "project.mucho-hangouts.technologies": "Node.js TypeScript React",
                },
            ),
            ContextProject(
                slug="genrupt",
                title="Amazon Creative Ops Platform",
                track="ai_systems",
                proof_type="client",
                service="Product engineering",
                technologies=["Next.js", "TypeScript", "React", "Zustand"],
                best_for=["ai", "automation"],
                claim="Helped clean up a production Next.js product.",
                source_refs={
                    "project.genrupt.solution": "Cleaned up routes, services, client state, and request ownership.",
                    "project.genrupt.technologies": "Next.js TypeScript React Zustand",
                },
            ),
        ],
    )


def _draft_json(text: str) -> dict[str, object]:
    return {
        "proposal": text,
        "primary_text": text,
        "draft_type": "cover_letter",
        "subject_line": "",
        "short_message": "",
        "question_answers": [],
        "angle": "Frontend staff augmentation",
        "selected_projects": ["genrupt"],
        "decisions": [],
        "claims": [],
        "warnings": [],
    }
