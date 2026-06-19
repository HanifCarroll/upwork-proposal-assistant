# Application Draft Assistant

A local Chrome extension and Python backend for drafting auditable job applications with `codex exec`.

The extension extracts the current job opportunity, lets you review it, and sends it to a local FastAPI service. The backend sends the full saved context to Codex for a structured draft with strategy and audit metadata in one pass. The extension never submits applications.

This project is not affiliated with Upwork, Dice, Indeed, ZipRecruiter, Robert Half, or any other job platform.

This is a personal local tool shared as-is for people who want to use or adapt it. No support is guaranteed.

## Features

- Extracts title, company, location, compensation, description, skills, and URL from supported job pages.
- Supports Upwork, Dice, Indeed, ZipRecruiter, and Robert Half.
- Lets you edit the extracted job snapshot before drafting.
- Uses local saved context about you: profile, service offers, and project proof points.
- Runs one Codex pass over the full portfolio context to choose strategy and generate the draft.
- Returns structured audit data for decisions, claims, source evidence, and warnings.
- Persists draft jobs in SQLite so long Codex runs can be polled.
- Keeps popup state in `chrome.storage.local`, so closing and reopening the popup resumes an active job.
- Provides a Chrome options page for configuring the local backend URL.
- Drafts cover letters, short application messages, application-question answers, and Upwork proposals.

## Architecture

```text
Chrome popup
  -> content script chooses a site adapter
  -> adapter extracts a normalized OpportunitySnapshot
  -> background service worker starts a draft job
  -> FastAPI backend persists and runs the job
  -> codex exec draft pass sees profile, all offers, all projects, and the opportunity
  -> SQLite stores request and draft JSON
  -> popup polls job status and displays draft + audit trail
```

## Requirements

- Python 3.13
- `uv`
- Chrome or another Chromium browser that supports Manifest V3 extensions
- OpenAI Codex CLI available as `codex` on your `PATH`

## Quick Start

```bash
git clone https://github.com/HanifCarroll/upwork-proposal-assistant.git
cd upwork-proposal-assistant
uv sync
uv run upa reindex
uv run upa serve
```

Then load the Chrome extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the repository's `extension/` directory.
5. Open the extension options page and confirm the backend URL, usually `http://127.0.0.1:8787`.

The checked-in `examples/portfolio` directory is only sample data. Replace it with your own context before using the tool seriously.

## Supported Sites

The extension uses site adapters that convert each page into the same normalized opportunity model.

| Site | Supported page shape |
| --- | --- |
| Upwork | Job feed cards and proposal/job-detail pages. |
| Dice | Job-detail pages, using `JobPosting` JSON-LD when available. |
| Indeed | Search result pages with the selected job detail panel. |
| ZipRecruiter | Search result pages with the selected job detail pane. |
| Robert Half | Search result pages with the selected job detail card. |

The extension reads the job page you are viewing. It does not crawl job boards or submit applications.

## Configuration

Copy `.env.example` if you want local overrides:

```bash
cp .env.example .env
```

Supported environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPWORK_PROPOSAL_PORTFOLIO_ROOT` | `examples/portfolio` | Source directory for profile, offers, and project proof points. |
| `UPWORK_PROPOSAL_CONTEXT_DIR` | `data/context` | Generated context cache. |
| `UPWORK_PROPOSAL_RUNTIME_DIR` | `.runtime` | Runtime directory for local backend artifacts. |
| `UPWORK_PROPOSAL_DB_PATH` | `.runtime/drafts.db` | SQLite database path. |
| `UPWORK_PROPOSAL_CODEX_RUNS_DIR` | `.runtime/codex-runs` | Per-run Codex workspaces. |
| `UPWORK_PROPOSAL_CODEX_BINARY` | `codex` | Codex CLI executable. |
| `UPWORK_PROPOSAL_CODEX_MODEL` | `gpt-5.5` | Model passed explicitly to `codex exec`. |
| `UPWORK_PROPOSAL_CODEX_REASONING_EFFORT` | `low` | Reasoning effort passed explicitly to `codex exec`. |
| `UPWORK_PROPOSAL_CODEX_TIMEOUT_SECONDS` | `180` | Timeout per Codex pass. |
| `UPWORK_PROPOSAL_MAX_WORKERS` | `5` | Maximum concurrent async draft jobs. |

Example:

```bash
UPWORK_PROPOSAL_PORTFOLIO_ROOT=/path/to/my/context uv run upa reindex
uv run upa serve
```

## Context Source Format

The context source directory can contain:

```text
my-context/
  profile.md
  offers.json
  projects/
    project-one.json
    project-two.json
```

`profile.md` is freeform Markdown about your positioning and working style.

`offers.json` is an array of proposal angles:

```json
[
  {
    "key": "saas_stabilization",
    "label": "SaaS stabilization",
    "use_when": ["production", "saas", "existing codebase"],
    "promise": "Stabilize production workflows through small, well-tested fixes.",
    "source_ref": "offers.saas_stabilization"
  }
]
```

Each project JSON should include proof points the proposal system is allowed to use:

```json
{
  "slug": "saas-stabilization",
  "title": "Production SaaS Stabilization",
  "description": "Took over an existing SaaS app and shipped targeted reliability fixes.",
  "proofType": "client",
  "service": "Full-stack product engineering",
  "track": "workflow_automation",
  "role": "Senior full-stack engineer",
  "timeline": "Ongoing",
  "technologies": ["React", "TypeScript", "PostgreSQL"],
  "result": ["Improved critical flows without a rewrite."],
  "deliveryHighlights": ["Repo audit", "Bug triage", "Targeted tests"],
  "sourceUrl": "https://example.com/projects/saas-stabilization"
}
```

The generated cache in `data/context` is intentionally ignored by Git. Rebuild it with:

```bash
uv run upa reindex
```

The backend runs `codex exec` with `--ignore-user-config` and `--ignore-rules` so unrelated local MCP servers, plugins, hooks, or execpolicy files do not slow down or destabilize proposal generation. Model and reasoning effort are passed explicitly through the environment variables above.

## API

Useful local endpoints:

- `GET /health`: backend health and context count.
- `POST /context/reindex`: rebuild context from the configured source.
- `POST /draft-jobs`: create an async draft job.
- `GET /draft-jobs/{job_id}`: poll job status and result.
- `POST /draft`: synchronous draft endpoint for debugging.
- `GET /drafts/{draft_id}`: fetch a stored completed draft.

Job stages:

- `queued`
- `codex_draft`
- `saving`
- `done`
- `failed`

`POST /draft-jobs` accepts a normalized `opportunity` and `draft_type`. Supported draft types are `cover_letter`, `short_application_message`, `question_answers`, and `upwork_proposal`.

`GET /draft-jobs/{job_id}` also returns privacy-safe timing instrumentation under `timings`: queue time, per-stage durations, and per-`codex exec` subprocess metrics such as duration, exit code, timeout flag, output size, and JSON parse time. It does not include prompts, job descriptions, draft text, or personal context.

## Auditability

Every draft response includes:

- `draft_text`: the generated application body.
- `selected_angle`: the chosen application angle.
- `selected_projects[]`: project proof points used in the draft.
- `rejected_projects[]`: plausible but intentionally skipped proof points.
- `role_classification`: the model's concrete classification of the role.
- `application_strategy`: the drafting strategy used.
- `decisions[]`: why the system chose an angle or proof point.
- `claims[]`: factual claims used in the draft.
- `caused_by[]`: source refs that support each decision or claim.
- `warnings[]`: issues the model surfaced during drafting.

The backend stores the original request and one draft JSON payload. The draft includes role classification, application strategy, selected and rejected projects, decisions, claims, and warnings. That makes it possible to trace application language back to the job snapshot, personal context, or user notes that caused it.

## Privacy And Data Retention

This is a local-first tool, but it does store sensitive working data.

Stored locally:

- Chrome extension state in `chrome.storage.local`: current request, job id, progress, draft text, and audit text.
- SQLite data in `.runtime/drafts.db`: job details, user notes, draft text, and audit trail.
- Codex run workspaces in `.runtime/codex-runs/`: final JSON messages from individual Codex runs.
- Generated context in `data/context/`: profile, offers, and project proof points derived from your configured context source.

Not intentionally stored or sent:

- The extension does not submit applications or proposals.
- The backend does not call job-board APIs.
- The project does not include analytics.

Important data note:

- Drafting uses `codex exec`. Job/application inputs are sent through whatever Codex/OpenAI account and runtime you have configured locally.

To wipe local data:

```bash
rm -rf .runtime data/context
```

To clear extension state, open the extension's options/details in Chrome and clear extension site data, or remove and reload the unpacked extension.

Before publishing your fork, make sure `.runtime/`, `data/context/`, `.env`, and any personal context source directories are not committed.

## Development

Run checks:

```bash
scripts/check
```

## License

MIT
