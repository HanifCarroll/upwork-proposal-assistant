from __future__ import annotations

from upwork_proposal_assistant.models import (
    AuditDecision,
    ContextBundle,
    ContextProject,
    ContextSelection,
    ContextSelectionPlan,
    DraftRequest,
    OfferAngle,
    SourceEvidence,
)


def selection_from_plan(bundle: ContextBundle, request: DraftRequest, plan: ContextSelectionPlan) -> ContextSelection:
    projects_by_slug = {project.slug: project for project in bundle.projects}
    selected_projects: list[ContextProject] = []
    missing_slugs: list[str] = []
    for slug in _unique(plan.selected_project_slugs):
        project = projects_by_slug.get(slug)
        if project is None:
            missing_slugs.append(slug)
            continue
        selected_projects.append(project)

    warnings = list(plan.warnings)
    if missing_slugs:
        warnings.append(f"Model selected unknown project slug(s): {', '.join(missing_slugs)}.")

    angle = OfferAngle(
        key=plan.selected_angle.key,
        label=plan.selected_angle.label,
        use_when=[],
        promise=plan.selected_angle.promise,
        source_ref="model.selection.selected_angle",
    )
    decisions = list(plan.decisions)
    if not decisions:
        decisions.append(
            AuditDecision(
                audit_id="model-selection",
                decision=f"Use {plan.selected_angle.label} angle",
                caused_by=plan.selected_angle.caused_by or ["opportunity.description", "profile"],
                rationale=plan.application_strategy,
            )
        )
    if missing_slugs:
        decisions.append(
            AuditDecision(
                audit_id="model-selection-validation",
                decision="Ignore project slugs that were not present in the portfolio context.",
                caused_by=["model.selection.selected_project_slugs"],
                rationale=f"Unknown project slug(s): {', '.join(missing_slugs)}.",
            )
        )

    evidence = _build_evidence(angle, selected_projects, request, profile=bundle.profile, plan=plan)
    _append_plan_caused_by_evidence(evidence, bundle, request, plan)
    return ContextSelection(
        angle=angle,
        projects=selected_projects,
        source_evidence=evidence,
        selection_decisions=decisions,
        role_classification=plan.role_classification,
        application_strategy=plan.application_strategy,
        allowed_claims=plan.allowed_claims,
        rejected_projects=plan.rejected_projects,
        warnings=warnings,
    )


def _build_evidence(
    angle: OfferAngle,
    projects: list[ContextProject],
    request: DraftRequest,
    profile: str = "",
    plan: ContextSelectionPlan | None = None,
) -> list[SourceEvidence]:
    opportunity = request.opportunity_snapshot()
    evidence = [
        SourceEvidence(ref="profile", text=profile),
        SourceEvidence(ref="opportunity.source", text=opportunity.source),
        SourceEvidence(ref="opportunity.url", text=opportunity.source_url),
        SourceEvidence(ref="opportunity.title", text=opportunity.title),
        SourceEvidence(ref="opportunity.company", text=opportunity.company),
        SourceEvidence(ref="opportunity.location", text=opportunity.location),
        SourceEvidence(ref="opportunity.compensation", text=opportunity.compensation),
        SourceEvidence(ref="opportunity.employment_type", text=opportunity.employment_type),
        SourceEvidence(ref="opportunity.remote_status", text=opportunity.remote_status),
        SourceEvidence(ref="opportunity.description", text=opportunity.description),
        SourceEvidence(ref="opportunity.responsibilities", text=" ".join(opportunity.responsibilities)),
        SourceEvidence(ref="opportunity.requirements", text=" ".join(opportunity.requirements)),
        SourceEvidence(ref="opportunity.skills", text=", ".join(opportunity.skills)),
        SourceEvidence(ref="opportunity.application_questions", text=" ".join(opportunity.application_questions)),
        SourceEvidence(ref="opportunity.recruiter_or_client_context", text=opportunity.recruiter_or_client_context),
        SourceEvidence(ref="opportunity.source_text", text=opportunity.source_text),
        SourceEvidence(ref="user.notes", text=request.user_notes),
        SourceEvidence(ref=angle.source_ref, text=f"{angle.label}: {angle.promise}"),
    ]
    if plan is not None:
        evidence.extend(
            [
                SourceEvidence(ref="model.selection.role_classification", text=plan.role_classification),
                SourceEvidence(ref="model.selection.application_strategy", text=plan.application_strategy),
                SourceEvidence(
                    ref="model.selection.selected_angle",
                    text=f"{plan.selected_angle.label}: {plan.selected_angle.promise}",
                ),
            ]
        )
        for index, claim in enumerate(plan.allowed_claims, start=1):
            evidence.append(SourceEvidence(ref=f"model.selection.allowed_claims.{index}", text=claim.text))
        for rejected in plan.rejected_projects:
            evidence.append(SourceEvidence(ref=f"model.selection.rejected_projects.{rejected.slug}", text=rejected.reason))
        for index, warning in enumerate(plan.warnings, start=1):
            evidence.append(SourceEvidence(ref=f"model.selection.warnings.{index}", text=warning))
    for project in projects:
        evidence.append(SourceEvidence(ref=f"project.{project.slug}.claim", text=project.claim))
        evidence.append(SourceEvidence(ref=f"project.{project.slug}.technologies", text=", ".join(project.technologies)))
        for ref, text in project.source_refs.items():
            if text:
                evidence.append(SourceEvidence(ref=ref, text=text))
    return evidence


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique_values.append(value)
    return unique_values


def _append_plan_caused_by_evidence(
    evidence: list[SourceEvidence],
    bundle: ContextBundle,
    request: DraftRequest,
    plan: ContextSelectionPlan,
) -> None:
    existing_refs = {item.ref for item in evidence}
    source_map = _source_map(bundle, request)
    plan_refs = [
        *plan.selected_angle.caused_by,
        *[ref for claim in plan.allowed_claims for ref in claim.caused_by],
        *[ref for decision in plan.decisions for ref in decision.caused_by],
        *[ref for rejected in plan.rejected_projects for ref in rejected.caused_by],
    ]
    for ref in _unique(plan_refs):
        if ref in existing_refs:
            continue
        text = source_map.get(ref)
        if text is None:
            continue
        evidence.append(SourceEvidence(ref=ref, text=text))
        existing_refs.add(ref)


def _source_map(bundle: ContextBundle, request: DraftRequest) -> dict[str, str]:
    opportunity = request.opportunity_snapshot()
    sources = {
        "profile": bundle.profile,
        "opportunity.source": opportunity.source,
        "opportunity.url": opportunity.source_url,
        "opportunity.title": opportunity.title,
        "opportunity.company": opportunity.company,
        "opportunity.location": opportunity.location,
        "opportunity.compensation": opportunity.compensation,
        "opportunity.employment_type": opportunity.employment_type,
        "opportunity.remote_status": opportunity.remote_status,
        "opportunity.description": opportunity.description,
        "opportunity.responsibilities": " ".join(opportunity.responsibilities),
        "opportunity.requirements": " ".join(opportunity.requirements),
        "opportunity.nice_to_haves": " ".join(opportunity.nice_to_haves),
        "opportunity.skills": ", ".join(opportunity.skills),
        "opportunity.application_questions": " ".join(opportunity.application_questions),
        "opportunity.recruiter_or_client_context": opportunity.recruiter_or_client_context,
        "opportunity.source_text": opportunity.source_text,
        "user.notes": request.user_notes,
    }
    for offer in bundle.offers:
        sources[offer.source_ref] = f"{offer.label}: {offer.promise}"
    for project in bundle.projects:
        sources[f"project.{project.slug}.claim"] = project.claim
        sources[f"project.{project.slug}.technologies"] = ", ".join(project.technologies)
        sources.update(project.source_refs)
    return sources
