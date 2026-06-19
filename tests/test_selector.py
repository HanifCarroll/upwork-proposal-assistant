from __future__ import annotations

from upwork_proposal_assistant.models import (
    ContextBundle,
    ContextProject,
    ContextSelectionPlan,
    DraftRequest,
    OfferAngle,
    OpportunitySnapshot,
)
from upwork_proposal_assistant.selector import selection_from_plan


def test_selection_from_plan_uses_model_selected_angle_and_projects() -> None:
    bundle = ContextBundle(
        profile="Profile",
        offers=[
            OfferAngle(key="mvp_launch", label="MVP", use_when=["mvp"], promise="Launch", source_ref="offer.mvp"),
            OfferAngle(
                key="ai_workflow_system",
                label="AI workflow",
                use_when=["playwright", "openai", "automation"],
                promise="Auditable AI",
                source_ref="offer.ai",
            ),
        ],
        projects=[
            ContextProject(
                slug="site",
                title="Website",
                track="launch_site",
                proof_type="client",
                service="Site",
                technologies=["WordPress"],
                best_for=["website"],
                claim="Built a website.",
            ),
            ContextProject(
                slug="apartment-finder",
                title="Apartment Finder",
                track="ai_systems",
                proof_type="experiment",
                service="AI Prototype",
                technologies=["Playwright", "OpenAI"],
                best_for=["automation", "audit trail"],
                claim="Built an auditable listing triage workflow.",
            ),
        ],
    )
    request = DraftRequest(
        opportunity=OpportunitySnapshot(
            title="Need Playwright automation",
            description="Use OpenAI to review scraped listing evidence.",
            company_context="Company builds workflow automation tools.",
            skills=["Playwright", "OpenAI"],
        )
    )
    plan = ContextSelectionPlan.model_validate(
        {
            "role_classification": "AI workflow automation",
            "selected_angle": {
                "key": "ai_workflow_system",
                "label": "AI workflow",
                "promise": "Auditable AI",
                "caused_by": ["opportunity.description", "opportunity.skills"],
            },
            "selected_project_slugs": ["apartment-finder"],
            "rejected_projects": [
                {
                    "slug": "site",
                    "reason": "Website launch proof is weaker for automation work.",
                    "caused_by": ["project.site.claim"],
                }
            ],
            "application_strategy": "Lead with automation evidence.",
            "allowed_claims": [],
            "decisions": [],
            "warnings": [],
        }
    )

    selection = selection_from_plan(bundle, request, plan)

    assert selection.angle.key == "ai_workflow_system"
    assert selection.projects[0].slug == "apartment-finder"
    assert selection.rejected_projects[0].slug == "site"
    assert selection.selection_decisions[0].audit_id == "model-selection"
    refs = {evidence.ref for evidence in selection.source_evidence}
    assert "opportunity.company_context" in refs
    assert "opportunity.nice_to_haves" in refs
    assert "opportunity.source_text" not in refs
