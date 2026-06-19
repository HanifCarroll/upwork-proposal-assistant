from __future__ import annotations

import json

from upwork_proposal_assistant.models import ContextBundle, DraftRequest


def build_draft_prompt(request: DraftRequest, context: ContextBundle) -> str:
    opportunity = request.opportunity_snapshot()
    packet = {
        "profile": context.profile,
        "opportunity": opportunity.model_dump(),
        "draft_type": request.draft_type,
        "user_notes": request.user_notes,
        "style": request.style,
        "available_offers": [offer.model_dump() for offer in context.offers],
        "available_projects": [project.model_dump() for project in context.projects],
    }
    return f"""You write job application drafts from the information below.

Information rules:
- Use only the information below. Do not invent experience, metrics, tools, client names, timelines, or outcomes.

Return JSON matching the provided schema.

Writing rules:
- Set `draft_type` to the requested draft_type.
- Put the generated application body in `draft_text`.
- Classify the role in `role_classification` in plain terms, such as "frontend staff augmentation", "founder MVP build", or "AI workflow automation".
- Choose the strongest angle for this job. You may reuse an available offer, narrow it, or create a custom angle when the offers do not fit.
- Choose 0-3 project slugs from `available_projects`; prefer 1-2. Use no project if none is genuinely relevant.
- Keep audit and source-tracking language in the JSON audit fields, not in the applicant-facing draft.

Draft-type rules:
- For `short_application_message`, write 80-140 words.
- For `upwork_proposal`, write 120-180 words and end with a simple next-step question.
- For `question_answers`, answer each supplied application question in `question_answers[]` and put a short intro in `draft_text`; use an empty `draft_text` when no intro is useful.

Cover-letter target:
- For `cover_letter`, write a concise employer-facing job-platform cover letter for Dice, Indeed, ZipRecruiter, recruiter portals, or similar job boards.
- Use 3-4 short paragraphs and 160-240 words unless the opportunity clearly needs less.
- Address the hiring team directly and professionally.
- Write like a real applicant to a recruiter. Be direct, calm, and specific. Use plain language. Do not sound like a compliance report.
- Open with the role and the strongest honest reason this background fits.
- Connect 1-2 specific experience points to the job requirements.
- Add useful context beyond a resume: working style, similar domain fit, availability, contract setup, or ability to adapt to new tools and domains.
- If the background does not exactly match a named tool or industry, do not apologize or list what is missing. Instead, connect the closest real experience and keep the claim modest.
- Close with interest in discussing fit for the role.

Explain experience simply:
- Lead each example with the product, team, or business problem.
- Explain the applicant's responsibility in plain business or product language.
- Name only the 1-2 technical details that most directly connect to the role.
- Prefer outcomes, ownership, collaboration, and reliability over implementation inventory.
- Use specialist terms when they appear in the job post or are essential to the fit.
- Group many technical details under a simpler theme, such as access control, background processing, service reliability, data modeling, or role-based workflows.

Audit fields only:
- Set `selected_angle.key` to an available offer key when reusing one; otherwise set a short custom key such as "frontend_staff_augmentation".
- Include rejected projects when they seem plausible from surface wording but are strategically weak.
- Every application claim must appear in `claims[]` with where it came from in `caused_by`.
- Every meaningful drafting or strategy decision must appear in `decisions[]` with where it came from in `caused_by`.
- Add warnings for weak experience matches, noisy extraction, missing job details, missing exact tool or industry matches, or a role that should not use a project example.
- When exact tool or industry experience is weak but the profile or projects show relevant adaptation across tools, domains, or product constraints, include one honest adaptability claim with where it came from.
- Use these labels in `caused_by`: `profile`, opportunity fields like `opportunity.description`, offer `source_ref` values, and project labels from each project's `source_refs`, `project.<slug>.claim`, and `project.<slug>.technologies`.

Context packet:
```json
{json.dumps(packet, indent=2)}
```
"""
