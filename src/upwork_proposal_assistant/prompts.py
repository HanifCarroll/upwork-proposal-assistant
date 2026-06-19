from __future__ import annotations

import json

from upwork_proposal_assistant.models import ContextSelection, DraftRequest


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
    }
    return f"""You write job application drafts from a verified context packet.

Use only the supplied source evidence. Do not invent experience, metrics, tools, client names, timelines, or outcomes.

Return JSON matching the provided schema.

Rules:
- Set `draft_type` to the requested draft_type.
- Put the main answer in both `primary_text` and `proposal` for compatibility.
- For `cover_letter`, write a concise cover letter: 180-260 words unless the opportunity clearly needs less.
- For `short_application_message`, write 80-140 words.
- For `upwork_proposal`, write 120-180 words and end with a simple next-step question.
- For `question_answers`, answer each supplied application question in `question_answers[]` and put a short intro in `primary_text`.
- Open on the employer's role/problem, not a biography.
- Mention 1-2 relevant proof points only if they are supported by source_evidence.
- Include one concrete first step or working approach.
- Avoid "Dear hiring manager", "I am excited to apply", generic flattery, desperate sales language, and unsupported claims.
- Every application claim must appear in `claims[]` with `caused_by` refs from source_evidence.
- Every meaningful drafting decision must appear in `decisions[]` with `caused_by` refs from source_evidence.
- Preserve the provided selection decisions by including equivalent decision entries or stricter refinements.

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
