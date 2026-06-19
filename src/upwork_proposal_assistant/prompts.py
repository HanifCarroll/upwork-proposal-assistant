from __future__ import annotations

import json

from upwork_proposal_assistant.models import ContextBundle, ContextSelection, DraftRequest


def build_selection_prompt(request: DraftRequest, context: ContextBundle) -> str:
    opportunity = request.opportunity_snapshot()
    packet = {
        "profile": context.profile,
        "opportunity": opportunity.model_dump(),
        "draft_type": request.draft_type,
        "user_notes": request.user_notes,
        "style": request.style or request.proposal_style,
        "available_offers": [offer.model_dump() for offer in context.offers],
        "available_projects": [project.model_dump() for project in context.projects],
    }
    return f"""You select job-application strategy from a complete context packet.

You are the selection layer. Do not draft the application yet.

Use the whole supplied context. Do not rely on keyword counts or string matches. Reason about the actual role, buyer, seniority, work shape, and available proof.

Source rules:
- Use only supplied context. Do not invent experience, metrics, tools, client names, timelines, or outcomes.
- `profile` is source ref `profile`.
- Opportunity fields are source refs like `opportunity.description`, `opportunity.skills`, `opportunity.company_context`, and `opportunity.recruiter_or_client_context`.
- Offer refs use each offer's `source_ref`.
- Project refs use each project's `source_refs` keys, plus `project.<slug>.claim` and `project.<slug>.technologies`.

Selection rules:
- Return JSON matching the provided schema.
- Classify the role in `role_classification` in concrete terms, such as "frontend staff augmentation", "founder MVP build", or "AI workflow automation".
- Choose the strongest application angle for this job. You may reuse an available offer, narrow it, or create a custom angle when the offers do not fit.
- Set `selected_angle.key` to an available offer key when reusing one; otherwise set a short custom key such as "frontend_staff_augmentation".
- Choose 0-3 project slugs from `available_projects`; prefer 1-2. Use no project if none is genuinely relevant.
- Include rejected projects when they are plausible by surface keywords but strategically weak.
- Put only application-safe factual claims in `allowed_claims[]`. Each claim must have source refs in `caused_by`.
- When direct stack or domain proof is weak but the supplied profile/projects show broad, relevant adaptation across tools, domains, or product constraints, include one honest adaptability claim with concrete source refs.
- Add warnings for weak evidence, noisy extraction, missing job details, or a role that should not use a project proof point.
- Every important selection choice must appear in `decisions[]` with `caused_by` refs.

Context packet:
```json
{json.dumps(packet, indent=2)}
```
"""


def build_draft_prompt(request: DraftRequest, selection: ContextSelection, profile: str) -> str:
    opportunity = request.opportunity_snapshot()
    packet = {
        "profile": profile,
        "opportunity": opportunity.model_dump(),
        "draft_type": request.draft_type,
        "user_notes": request.user_notes,
        "style": request.style or request.proposal_style,
        "selected_angle": selection.angle.model_dump(),
        "selected_projects": [project.model_dump() for project in selection.projects],
        "source_evidence": [evidence.model_dump() for evidence in selection.source_evidence],
        "selection_decisions": [decision.model_dump() for decision in selection.selection_decisions],
        "role_classification": selection.role_classification,
        "application_strategy": selection.application_strategy,
        "allowed_claims": [claim.model_dump() for claim in selection.allowed_claims],
        "rejected_projects": [project.model_dump() for project in selection.rejected_projects],
        "selection_warnings": selection.warnings,
    }
    return f"""You write job application drafts from a verified context packet.

Use only the supplied source evidence. Do not invent experience, metrics, tools, client names, timelines, or outcomes.

Return JSON matching the provided schema.

Rules:
- Set `draft_type` to the requested draft_type.
- Put the main answer in both `primary_text` and `proposal` for compatibility.
- For `short_application_message`, write 80-140 words.
- For `upwork_proposal`, write 120-180 words and end with a simple next-step question.
- For `question_answers`, answer each supplied application question in `question_answers[]` and put a short intro in `primary_text`.
- Treat `allowed_claims[]` as the preferred claim whitelist. Omit claims that do not help this application.
- Follow `application_strategy`; it was selected from the complete portfolio context before drafting.
- Do not resurrect rejected projects or angles.
- Every application claim must appear in `claims[]` with `caused_by` refs from source_evidence.
- Every meaningful drafting decision must appear in `decisions[]` with `caused_by` refs from source_evidence.
- Preserve the model selection decisions by including equivalent decision entries or stricter refinements.

Cover-letter target:
- For `cover_letter`, write a concise employer-facing job-platform cover letter for Dice, Indeed, ZipRecruiter, recruiter portals, or similar job boards.
- Use 3-4 short paragraphs and 160-240 words unless the opportunity clearly needs less.
- Address the hiring team directly and professionally.
- Open with the role and the strongest supported reason this background fits.
- Connect 1-2 specific experience points to the job requirements.
- Add useful context beyond a resume: working style, adjacent domain fit, availability, contract setup, or ability to adapt to new tools and domains.
- When the named stack or domain is not a direct match, keep the letter shorter, emphasize transferable experience honestly, and mention adaptability only if it is supported by `allowed_claims[]` or source evidence.
- Close with interest in discussing fit for the role.

Tone:
- Sound like a qualified applicant writing to a recruiter or hiring manager.
- Use clear sentences, concrete nouns, and direct claims supported by the source evidence.
- Prefer framing like "I am applying for this role because..." and "My closest relevant experience is..." when it fits the opportunity.

Context packet:
```json
{json.dumps(packet, indent=2)}
```
"""


def build_humanizer_prompt(first_pass_json: dict[str, object], selection: ContextSelection) -> str:
    return f"""$humanizer

Humanize this job application draft.

Constraints:
- Return JSON matching the same schema.
- Rewrite only `primary_text`, `proposal`, `short_message`, `subject_line`, `question_answers`, and wording-level rationale if needed.
- Preserve factual meaning.
- Preserve auditability: every decision and claim must keep source refs in `caused_by`.
- Do not add new claims.
- Do not remove selected project slugs.
- Do not run or request any extra validation step.

Source refs available:
```json
{json.dumps([evidence.model_dump() for evidence in selection.source_evidence], indent=2)}
```

Draft JSON:
```json
{json.dumps(first_pass_json, indent=2)}
```
"""
