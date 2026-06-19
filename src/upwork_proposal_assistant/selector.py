from __future__ import annotations

import re

from upwork_proposal_assistant.models import (
    AuditDecision,
    ContextBundle,
    ContextProject,
    ContextSelection,
    DraftRequest,
    OfferAngle,
    SourceEvidence,
)


TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#.-]*")


def select_context(bundle: ContextBundle, request: DraftRequest, max_projects: int = 2) -> ContextSelection:
    opportunity = request.opportunity_snapshot()
    job_text = f"{opportunity.search_text()} {request.user_notes}".lower()
    angle = _best_angle(bundle.offers, job_text)
    projects = _best_projects(bundle.projects, job_text, max_projects=max_projects)
    evidence = _build_evidence(angle, projects, request)
    decisions = [
        AuditDecision(
            audit_id="select-angle",
            decision=f"Use {angle.label} angle",
            caused_by=["opportunity.title", "opportunity.description", angle.source_ref],
            rationale=f"Matched job language against offer triggers: {', '.join(_matched_terms(angle.use_when, job_text)[:6]) or 'default product-engineering fit'}.",
        ),
        AuditDecision(
            audit_id="select-projects",
            decision=f"Use proof from {', '.join(project.slug for project in projects)}",
            caused_by=["opportunity.description", *[f"project.{project.slug}.claim" for project in projects]],
            rationale="Selected the highest-scoring portfolio proof points for the job text and user notes.",
        ),
    ]
    return ContextSelection(angle=angle, projects=projects, source_evidence=evidence, selection_decisions=decisions)


def _best_angle(offers: list[OfferAngle], job_text: str) -> OfferAngle:
    scored = [(_score_terms(offer.use_when, job_text), offer) for offer in offers]
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def _best_projects(projects: list[ContextProject], job_text: str, max_projects: int) -> list[ContextProject]:
    job_tokens = set(TOKEN_RE.findall(job_text))
    scored: list[tuple[int, ContextProject]] = []
    for project in projects:
        project_tokens = set(TOKEN_RE.findall(project.search_text().lower()))
        overlap = len(job_tokens & project_tokens)
        exact_bonus = _score_terms(project.best_for + project.technologies, job_text)
        scored.append((overlap + exact_bonus * 3, project))
    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [project for score, project in scored if score > 0][:max_projects]
    return selected or projects[:max_projects]


def _build_evidence(angle: OfferAngle, projects: list[ContextProject], request: DraftRequest) -> list[SourceEvidence]:
    opportunity = request.opportunity_snapshot()
    evidence = [
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
        SourceEvidence(ref="user.notes", text=request.user_notes),
        SourceEvidence(ref=angle.source_ref, text=f"{angle.label}: {angle.promise}"),
    ]
    for project in projects:
        evidence.append(SourceEvidence(ref=f"project.{project.slug}.claim", text=project.claim))
        evidence.append(SourceEvidence(ref=f"project.{project.slug}.technologies", text=", ".join(project.technologies)))
        for ref, text in project.source_refs.items():
            if text:
                evidence.append(SourceEvidence(ref=ref, text=text))
    return evidence


def _score_terms(terms: list[str], text: str) -> int:
    lowered = text.lower()
    return sum(1 for term in terms if term.lower() in lowered)


def _matched_terms(terms: list[str], text: str) -> list[str]:
    lowered = text.lower()
    return [term for term in terms if term.lower() in lowered]
