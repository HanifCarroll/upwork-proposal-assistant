from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


DraftType = Literal["upwork_proposal", "cover_letter", "short_application_message", "question_answers"]


class OpportunitySnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str = "unknown"
    source_url: str = ""
    captured_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    title: str = ""
    company: str = ""
    location: str = ""
    employment_type: str = ""
    remote_status: str = ""
    description: str = ""
    responsibilities: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    nice_to_haves: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    application_questions: list[str] = Field(default_factory=list)
    company_context: str = ""
    recruiter_or_client_context: str = ""
    extraction_warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def discard_obsolete_freeform_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        cleaned = dict(value)
        for field in ("raw_text", "source_text", "extraction_confidence", "compensation"):
            cleaned.pop(field, None)
        return cleaned

    def search_text(self) -> str:
        return " ".join(
            [
                self.title,
                self.company,
                self.location,
                self.employment_type,
                self.remote_status,
                self.description,
                " ".join(self.responsibilities),
                " ".join(self.requirements),
                " ".join(self.nice_to_haves),
                " ".join(self.skills),
                " ".join(self.application_questions),
                self.company_context,
                self.recruiter_or_client_context,
            ]
        )


class UpworkProject(BaseModel):
    model_config = ConfigDict(extra="allow")

    title: str = ""
    description: str = ""
    budget: str = ""
    skills: list[str] = Field(default_factory=list)
    client_context: str = ""
    url: str = ""
    captured_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())

    def search_text(self) -> str:
        return " ".join([self.title, self.description, " ".join(self.skills), self.client_context])

    def to_opportunity(self) -> OpportunitySnapshot:
        return OpportunitySnapshot(
            source="upwork",
            source_url=self.url,
            captured_at=self.captured_at,
            title=self.title,
            description=self.description,
            skills=self.skills,
            recruiter_or_client_context=self.client_context,
        )


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opportunity: OpportunitySnapshot | None = None
    project: UpworkProject | None = None
    draft_type: DraftType = "cover_letter"
    user_notes: str = ""
    proposal_style: str = "concise"
    style: str = "concise"

    @model_validator(mode="after")
    def require_opportunity_or_project(self) -> "DraftRequest":
        if self.opportunity is None and self.project is None:
            raise ValueError("DraftRequest requires either opportunity or project")
        return self

    def opportunity_snapshot(self) -> OpportunitySnapshot:
        if self.opportunity is not None:
            return self.opportunity
        if self.project is not None:
            return self.project.to_opportunity()
        raise ValueError("DraftRequest requires either opportunity or project")


class OfferAngle(BaseModel):
    key: str
    label: str
    use_when: list[str]
    promise: str
    source_ref: str


class ContextProject(BaseModel):
    slug: str
    title: str
    track: str
    proof_type: str
    service: str
    role: str = ""
    timeline: str = ""
    technologies: list[str] = Field(default_factory=list)
    best_for: list[str] = Field(default_factory=list)
    claim: str
    source_url: str = ""
    source_refs: dict[str, str] = Field(default_factory=dict)

    def search_text(self) -> str:
        return " ".join([self.title, self.track, self.service, self.role, " ".join(self.technologies), " ".join(self.best_for), self.claim])


class ContextBundle(BaseModel):
    profile: str
    offers: list[OfferAngle]
    projects: list[ContextProject]


class SourceEvidence(BaseModel):
    ref: str
    text: str


class AuditDecision(BaseModel):
    audit_id: str
    decision: str
    caused_by: list[str]
    rationale: str


class ClaimTrace(BaseModel):
    text: str
    caused_by: list[str]


class SelectedAngle(BaseModel):
    key: str
    label: str
    promise: str
    caused_by: list[str] = Field(default_factory=list)


class RejectedProject(BaseModel):
    slug: str
    reason: str
    caused_by: list[str] = Field(default_factory=list)


class ContextSelectionPlan(BaseModel):
    role_classification: str
    selected_angle: SelectedAngle
    selected_project_slugs: list[str] = Field(default_factory=list)
    rejected_projects: list[RejectedProject] = Field(default_factory=list)
    application_strategy: str
    allowed_claims: list[ClaimTrace] = Field(default_factory=list)
    decisions: list[AuditDecision] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ContextSelection(BaseModel):
    angle: OfferAngle
    projects: list[ContextProject]
    source_evidence: list[SourceEvidence]
    selection_decisions: list[AuditDecision]
    role_classification: str = ""
    application_strategy: str = ""
    allowed_claims: list[ClaimTrace] = Field(default_factory=list)
    rejected_projects: list[RejectedProject] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class QuestionAnswer(BaseModel):
    question: str
    answer: str
    caused_by: list[str] = Field(default_factory=list)


class DraftResult(BaseModel):
    proposal: str
    primary_text: str = ""
    draft_type: DraftType = "cover_letter"
    subject_line: str = ""
    short_message: str = ""
    question_answers: list[QuestionAnswer] = Field(default_factory=list)
    angle: str
    selected_projects: list[str]
    decisions: list[AuditDecision]
    claims: list[ClaimTrace]
    warnings: list[str] = Field(default_factory=list)

    @classmethod
    def empty(cls) -> "DraftResult":
        return cls(proposal="", angle="", selected_projects=[], decisions=[], claims=[], warnings=[])


class StoredDraft(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    request: DraftRequest
    selection: ContextSelection
    first_pass: dict[str, Any]
    final_pass: dict[str, Any]
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class DraftResponse(BaseModel):
    id: str
    proposal: str
    primary_text: str = ""
    draft_type: DraftType = "cover_letter"
    subject_line: str = ""
    short_message: str = ""
    question_answers: list[QuestionAnswer] = Field(default_factory=list)
    angle: str
    selected_projects: list[str]
    decisions: list[AuditDecision]
    claims: list[ClaimTrace]
    warnings: list[str] = Field(default_factory=list)
    created_at: str


class StageTiming(BaseModel):
    started_at: str
    finished_at: str | None = None
    duration_ms: int | None = None


class CodexRunTiming(BaseModel):
    phase: str
    started_at: str
    finished_at: str | None = None
    duration_ms: int | None = None
    return_code: int | None = None
    timed_out: bool = False
    prompt_chars: int = 0
    stdout_bytes: int = 0
    stderr_bytes: int = 0
    output_bytes: int | None = None
    parse_duration_ms: int | None = None


class DraftJobTimings(BaseModel):
    queue_ms: int | None = None
    stages: dict[str, StageTiming] = Field(default_factory=dict)
    codex_runs: list[CodexRunTiming] = Field(default_factory=list)


DraftJobState = Literal["queued", "running", "succeeded", "failed"]
DraftJobStage = Literal["queued", "selecting_context", "codex_draft", "humanizer", "saving", "done", "failed"]


class DraftJobCreated(BaseModel):
    id: str
    status: DraftJobState
    stage: DraftJobStage
    created_at: str
    updated_at: str


class DraftJobStatus(BaseModel):
    id: str
    status: DraftJobState
    stage: DraftJobStage
    elapsed_seconds: float
    selected_angle: str = ""
    selected_projects: list[str] = Field(default_factory=list)
    result: DraftResponse | None = None
    error: str | None = None
    timings: DraftJobTimings = Field(default_factory=DraftJobTimings)
    created_at: str
    updated_at: str


class ReindexResponse(BaseModel):
    project_count: int
    context_dir: str
