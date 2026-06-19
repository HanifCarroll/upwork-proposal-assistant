from __future__ import annotations

from collections.abc import Callable
import json
import os
from pathlib import Path
import subprocess
from time import perf_counter
from uuid import uuid4

from upwork_proposal_assistant.config import AppPaths
from upwork_proposal_assistant.models import CodexRunTiming


class CodexProviderError(RuntimeError):
    pass


class CodexProvider:
    def __init__(self, paths: AppPaths, timeout_seconds: int | None = None) -> None:
        self.paths = paths
        self.timeout_seconds = timeout_seconds or paths.codex_timeout_seconds

    def generate(
        self,
        prompt: str,
        phase: str = "unknown",
        on_timing: Callable[[CodexRunTiming], None] | None = None,
    ) -> dict[str, object]:
        self.paths.ensure_runtime()
        run_dir = self._prepare_run_workspace()
        output_path = run_dir / "last-message.json"
        cmd = [
            self.paths.codex_binary,
            "--ask-for-approval",
            "never",
            "exec",
            "-",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--color",
            "never",
            "-C",
            str(run_dir),
            "--output-schema",
            str(self.paths.draft_schema_path),
            "--output-last-message",
            str(output_path),
        ]
        started_at = _utc_now_iso()
        started = perf_counter()
        return_code: int | None = None
        timed_out = False
        stdout_bytes = 0
        stderr_bytes = 0
        output_bytes: int | None = None
        parse_duration_ms: int | None = None
        try:
            result = subprocess.run(
                cmd,
                input=prompt,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
                check=False,
            )
            return_code = result.returncode
            stdout_bytes = _byte_len(result.stdout)
            stderr_bytes = _byte_len(result.stderr)
            if result.returncode != 0:
                raise CodexProviderError(result.stderr.strip() or result.stdout.strip() or "codex exec failed")
            if not output_path.exists():
                raise CodexProviderError("codex exec did not write an output message")
            raw = output_path.read_text(encoding="utf-8")
            output_bytes = _byte_len(raw)
            parse_started = perf_counter()
            parsed = _parse_json_message(raw)
            parse_duration_ms = _elapsed_ms(parse_started)
            return parsed
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            stdout_bytes = _byte_len(exc.stdout)
            stderr_bytes = _byte_len(exc.stderr)
            raise CodexProviderError(f"codex exec timed out after {self.timeout_seconds} seconds") from exc
        finally:
            timing = CodexRunTiming(
                phase=phase,
                started_at=started_at,
                finished_at=_utc_now_iso(),
                duration_ms=_elapsed_ms(started),
                return_code=return_code,
                timed_out=timed_out,
                prompt_chars=len(prompt),
                stdout_bytes=stdout_bytes,
                stderr_bytes=stderr_bytes,
                output_bytes=output_bytes,
                parse_duration_ms=parse_duration_ms,
            )
            if on_timing is not None:
                on_timing(timing)

    def _prepare_run_workspace(self) -> Path:
        run_dir = self.paths.codex_runs_dir / uuid4().hex
        skills_dir = run_dir / ".agents" / "skills"
        skills_dir.mkdir(parents=True, exist_ok=True)
        target = skills_dir / "humanizer"
        if self.paths.humanizer_skill_dir.exists() and not target.exists():
            os.symlink(self.paths.humanizer_skill_dir, target, target_is_directory=True)
        return run_dir


def _parse_json_message(raw: str) -> dict[str, object]:
    text = raw.strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise CodexProviderError("codex output was not JSON") from None
        value = json.loads(text[start : end + 1])
    if not isinstance(value, dict):
        raise CodexProviderError("codex output JSON was not an object")
    return value


def _byte_len(value: str | bytes | None) -> int:
    if value is None:
        return 0
    if isinstance(value, bytes):
        return len(value)
    return len(value.encode("utf-8"))


def _elapsed_ms(started: float) -> int:
    return round((perf_counter() - started) * 1000)


def _utc_now_iso() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()
