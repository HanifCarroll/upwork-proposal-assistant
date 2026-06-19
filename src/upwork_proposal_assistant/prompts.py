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
    return f"""You write job application drafts from a complete verified context packet.

Use the full supplied context to choose the application strategy and write the draft in one pass.
Do not rely on keyword counts or broad text inference. Reason about the actual role, buyer, seniority, work shape, and available proof.

Source rules:
- Use only supplied context. Do not invent experience, metrics, tools, client names, timelines, or outcomes.
- `profile` is source ref `profile`.
- Opportunity fields are source refs like `opportunity.description`, `opportunity.skills`, `opportunity.company_context`, and `opportunity.recruiter_or_client_context`.
- Offer refs use each offer's `source_ref`.
- Project refs use each project's `source_refs` keys, plus `project.<slug>.claim` and `project.<slug>.technologies`.

Return JSON matching the provided schema.

Strategy and audit rules:
- Set `draft_type` to the requested draft_type.
- Put the generated application body in `draft_text`.
- Classify the role in `role_classification` in concrete terms, such as "frontend staff augmentation", "founder MVP build", or "AI workflow automation".
- Choose the strongest application angle for this job. You may reuse an available offer, narrow it, or create a custom angle when the offers do not fit.
- Set `selected_angle.key` to an available offer key when reusing one; otherwise set a short custom key such as "frontend_staff_augmentation".
- Choose 0-3 project slugs from `available_projects`; prefer 1-2. Use no project if none is genuinely relevant.
- Include rejected projects when they are plausible by surface keywords but strategically weak.
- Every application claim must appear in `claims[]` with source refs in `caused_by`.
- Every meaningful drafting or strategy decision must appear in `decisions[]` with source refs in `caused_by`.
- Add warnings for weak evidence, noisy extraction, missing job details, missing direct stack/domain proof, or a role that should not use a project proof point.
- When direct stack or domain proof is weak but the supplied profile/projects show broad, relevant adaptation across tools, domains, or product constraints, include one honest adaptability claim with concrete source refs.

Draft-type rules:
- For `short_application_message`, write 80-140 words.
- For `upwork_proposal`, write 120-180 words and end with a simple next-step question.
- For `question_answers`, answer each supplied application question in `question_answers[]` and put a short intro in `draft_text`; use an empty `draft_text` when no intro is useful.

Cover-letter target:
- For `cover_letter`, write a concise employer-facing job-platform cover letter for Dice, Indeed, ZipRecruiter, recruiter portals, or similar job boards.
- Use 3-4 short paragraphs and 160-240 words unless the opportunity clearly needs less.
- Address the hiring team directly and professionally.
- Open with the role and the strongest supported reason this background fits.
- Connect 1-2 specific experience points to the job requirements.
- Add useful context beyond a resume: working style, adjacent domain fit, availability, contract setup, or ability to adapt to new tools and domains.
- When the named stack or domain is not a direct match, keep the letter shorter, emphasize transferable experience honestly, and mention adaptability only if it is supported by claims or source evidence.
- Close with interest in discussing fit for the role.

Technical proof-point translation:
- Lead each proof point with the product, team, or business problem.
- Explain the applicant's responsibility in plain business or product language.
- Name only the 1-2 technical details that most directly connect to the role.
- Prefer outcomes, ownership, collaboration, and reliability over implementation inventory.
- Use specialist terms when they appear in the job post or are essential to the fit.
- Group many technical details under a simpler theme, such as access control, background processing, service reliability, data modeling, or role-based workflows.

Adjacent-match framing:
- State the transferable pattern clearly.
- Pair adjacent experience with adaptability across unfamiliar tools, stacks, or domains.
- Keep the comparison modest and confident.
- Show that the applicant understands the overlap and can ramp into the missing domain.

Tone:
- Sound like a qualified applicant writing to a recruiter or hiring manager.
- Keep the writing clear and concise, with direct claims supported by the source evidence.
- Prefer framing like "I am applying for this role because..." and "My closest relevant experience is..." when it fits the opportunity.

Context packet:
```json
{json.dumps(packet, indent=2)}
```
"""
