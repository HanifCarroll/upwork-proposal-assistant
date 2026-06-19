# Upwork Proposal Assistant

A local Chrome extension and Python backend for drafting auditable Upwork proposals with `codex exec`.

The extension extracts the current Upwork job snapshot, lets you review it, and sends it to a local FastAPI service. The backend selects relevant personal context, asks Codex for a structured draft, runs a second Codex pass through `$humanizer`, and stores the proposal with an audit trail. The extension never submits proposals to Upwork.

This project is not affiliated with Upwork.

## Features

- Extracts title, description, budget, skills, and URL from Upwork job/proposal pages.
- Lets you edit the extracted job snapshot before drafting.
- Uses local saved context about you: profile, service offers, and project proof points.
- Runs two Codex passes: draft generation, then `$humanizer`.
- Returns structured audit data for decisions, claims, source evidence, and warnings.
- Persists draft jobs in SQLite so long Codex runs can be polled.
- Keeps popup state in `chrome.storage.local`, so closing and reopening the popup resumes an active job.
- Provides a Chrome options page for configuring the local backend URL.

## Architecture

```text
Chrome popup
  -> content script extracts Upwork job details
  -> background service worker starts a draft job
  -> FastAPI backend persists and runs the job
  -> context selector chooses profile/projects/offers
  -> codex exec draft pass
  -> codex exec $humanizer pass
  -> SQLite stores request, context selection, first pass, final pass
  -> popup polls job status and displays proposal + audit trail
```

## Requirements

- Python 3.13
- `uv`
- Chrome or another Chromium browser that supports Manifest V3 extensions
- OpenAI Codex CLI available as `codex` on your `PATH`
- A local `$humanizer` skill directory, by default `~/.codex/skills/humanizer`

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
| `UPWORK_PROPOSAL_CODEX_TIMEOUT_SECONDS` | `180` | Timeout per Codex pass. |
| `UPWORK_PROPOSAL_HUMANIZER_SKILL` | `~/.codex/skills/humanizer` | Skill directory symlinked into Codex run workspaces. |

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
- `selecting_context`
- `codex_draft`
- `humanizer`
- `saving`
- `done`
- `failed`

`GET /draft-jobs/{job_id}` also returns privacy-safe timing instrumentation under `timings`: queue time, per-stage durations, and per-`codex exec` subprocess metrics such as duration, exit code, timeout flag, output size, and JSON parse time. It does not include prompts, Upwork descriptions, proposal text, or personal context.

## Auditability

Every draft response includes:

- `decisions[]`: why the system chose an angle or proof point.
- `claims[]`: factual claims used in the proposal.
- `caused_by[]`: source refs that support each decision or claim.
- `warnings[]`: issues the model surfaced during drafting.

The backend stores the original request, deterministic context selection, first Codex pass, and final humanized pass. That makes it possible to trace proposal language back to the Upwork snapshot, personal context, or user notes that caused it.

## Privacy And Data Retention

This is a local-first tool, but it does store sensitive working data.

Stored locally:

- Chrome extension state in `chrome.storage.local`: current request, job id, progress, proposal text, and audit text.
- SQLite data in `.runtime/drafts.db`: Upwork job details, user notes, selected context, first Codex pass, final proposal, and audit trail.
- Codex run workspaces in `.runtime/codex-runs/`: final JSON messages from individual Codex runs.
- Generated context in `data/context/`: profile, offers, and project proof points derived from your configured context source.

Not intentionally stored or sent:

- The extension does not submit proposals to Upwork.
- The backend does not call Upwork APIs.
- The project does not include analytics.

Important inference note:

- Drafting uses `codex exec`. Proposal inputs are sent through whatever Codex/OpenAI account and runtime you have configured locally.

To wipe local data:

```bash
rm -rf .runtime data/context
```

To clear extension state, open the extension's options/details in Chrome and clear extension site data, or remove and reload the unpacked extension.

Before publishing your fork, make sure `.runtime/`, `data/context/`, `.env`, and any personal context source directories are not committed.

## Development

Run checks:

```bash
uv run mypy src tests
uv run pytest
node --check extension/background.js
node --check extension/popup.js
node --check extension/content_script.js
node --check extension/options.js
python -m json.tool extension/manifest.json >/dev/null
python -m json.tool schemas/draft_response.schema.json >/dev/null
```

The repository includes a GitHub Actions workflow that runs these checks on pushes and pull requests.

## License

MIT
