from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from html import escape
from pathlib import Path
import re
import subprocess
import sys

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

from upwork_proposal_assistant.models import PdfExportResponse, StoredDraft


class PdfExportError(Exception):
    pass


@dataclass(frozen=True)
class ResumeHeader:
    name: str = ""
    headline: str = ""
    contacts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def export_cover_letter_pdf(stored: StoredDraft, output_dir: Path, resume_pdf_path: Path) -> PdfExportResponse:
    if stored.draft.draft_type != "cover_letter":
        raise PdfExportError("PDF export is only available for cover letters.")
    if not stored.draft.draft_text.strip():
        raise PdfExportError("Cover letter draft is empty.")

    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = _pdf_path_for(stored, output_dir)
    header = extract_resume_header(resume_pdf_path)
    _render_pdf(stored, header, pdf_path)

    return PdfExportResponse(
        draft_id=stored.id,
        filename=pdf_path.name,
        pdf_path=str(pdf_path),
        download_url=f"/drafts/{stored.id}/pdf",
        warnings=header.warnings,
    )


def reveal_pdf(pdf_path: Path, output_dir: Path) -> bool:
    resolved_pdf = pdf_path.resolve()
    resolved_dir = output_dir.resolve()
    if not resolved_pdf.is_file():
        raise PdfExportError("Generated PDF file was not found.")
    if not resolved_pdf.is_relative_to(resolved_dir):
        raise PdfExportError("Generated PDF path is outside the configured output directory.")
    if sys.platform != "darwin":
        raise PdfExportError("Opening the containing folder is currently supported on macOS only.")

    try:
        subprocess.run(["open", "-R", str(resolved_pdf)], check=True)
    except subprocess.CalledProcessError as exc:
        raise PdfExportError("Finder could not reveal the generated PDF.") from exc
    return True


def extract_resume_header(resume_pdf_path: Path) -> ResumeHeader:
    warnings: list[str] = []
    if not resume_pdf_path.is_file():
        return ResumeHeader(warnings=[f"Resume PDF was not found at {resume_pdf_path}."])

    try:
        reader = PdfReader(str(resume_pdf_path))
        page_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        return ResumeHeader(warnings=[f"Could not read resume PDF header: {exc}"])

    lines = [_clean_line(line) for line in page_text.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return ResumeHeader(warnings=["Resume PDF did not contain extractable text."])

    header_lines = lines[:12]
    headline = _headline_line(header_lines)
    name = _name_from_header_lines(header_lines, headline)
    contact_line = _contact_line(header_lines)
    contacts = _contact_items(contact_line)
    if not name:
        warnings.append("Resume header did not include an exportable name.")
    if not contacts:
        warnings.append("Resume contact line did not include exportable non-phone contact fields.")

    return ResumeHeader(name=name, headline=headline, contacts=contacts, warnings=warnings)


def _render_pdf(stored: StoredDraft, header: ResumeHeader, pdf_path: Path) -> None:
    opportunity = stored.request.opportunity_snapshot()
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        rightMargin=0.78 * inch,
        leftMargin=0.78 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title=f"Cover Letter - {opportunity.company or opportunity.title or stored.id}",
        author=header.name,
    )
    styles = _styles()
    story: list[object] = []

    if header.name:
        story.append(Paragraph(escape(header.name), styles["name"]))
    if header.headline:
        story.append(Paragraph(escape(header.headline), styles["headline"]))
    if header.contacts:
        story.append(Paragraph(escape(" | ".join(header.contacts)), styles["contact"]))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#6f7a74"), spaceAfter=16))

    date_text = _date_text(stored.created_at)
    if date_text:
        story.append(Paragraph(escape(date_text), styles["meta"]))
        story.append(Spacer(1, 10))

    recipient_lines = _recipient_lines(opportunity.company, opportunity.title)
    if recipient_lines:
        story.append(Paragraph("<br/>".join(escape(line) for line in recipient_lines), styles["meta"]))
        story.append(Spacer(1, 14))

    for paragraph in _draft_paragraphs(stored.draft.draft_text):
        story.append(Paragraph(_paragraph_markup(paragraph), styles["body"]))
        story.append(Spacer(1, 9))

    doc.build(story)


def _styles() -> dict[str, ParagraphStyle]:
    body_font = "Times-Roman"
    return {
        "name": ParagraphStyle(
            "LetterheadName",
            fontName="Helvetica-Bold",
            fontSize=17,
            leading=20,
            textColor=colors.HexColor("#17201c"),
            alignment=TA_LEFT,
            spaceAfter=2,
        ),
        "headline": ParagraphStyle(
            "LetterheadHeadline",
            fontName="Helvetica",
            fontSize=9.5,
            leading=12,
            textColor=colors.HexColor("#35423b"),
            alignment=TA_LEFT,
            spaceAfter=2,
        ),
        "contact": ParagraphStyle(
            "LetterheadContact",
            fontName="Helvetica",
            fontSize=8.7,
            leading=11,
            textColor=colors.HexColor("#596861"),
            alignment=TA_LEFT,
        ),
        "meta": ParagraphStyle(
            "CoverLetterMeta",
            fontName=body_font,
            fontSize=10.6,
            leading=14,
            textColor=colors.HexColor("#17201c"),
            alignment=TA_LEFT,
        ),
        "body": ParagraphStyle(
            "CoverLetterBody",
            fontName=body_font,
            fontSize=10.8,
            leading=15,
            firstLineIndent=0,
            textColor=colors.HexColor("#17201c"),
            alignment=TA_LEFT,
        ),
    }


def _pdf_path_for(stored: StoredDraft, output_dir: Path) -> Path:
    opportunity = stored.request.opportunity_snapshot()
    company = _filename_part(opportunity.company, "Company")
    title = _filename_part(opportunity.title, "Role")
    name = f"Hanif-Carroll-Cover-Letter-{company}-{title}-{stored.id[:8]}.pdf"
    return output_dir / name


def _filename_part(value: str, default: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", value.strip()).strip("-")
    return cleaned or default


def _date_text(created_at: str) -> str:
    try:
        parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return f"{parsed.strftime('%B')} {parsed.day}, {parsed.year}"


def _recipient_lines(company: str, title: str) -> list[str]:
    lines: list[str] = []
    if company.strip():
        lines.append(company.strip())
    if title.strip():
        lines.append(f"Re: {title.strip()}")
    return lines


def _draft_paragraphs(text: str) -> list[str]:
    return [paragraph.strip() for paragraph in re.split(r"\n\s*\n", text.strip()) if paragraph.strip()]


def _paragraph_markup(paragraph: str) -> str:
    escaped_lines = [escape(line.strip()) for line in paragraph.splitlines() if line.strip()]
    return "<br/>".join(escaped_lines)


def _contact_line(lines: list[str]) -> str:
    for line in lines:
        if "|" in line and "@" in line:
            return line
    return ""


def _headline_line(lines: list[str]) -> str:
    for line in lines:
        if "|" in line and "@" not in line:
            return line
    return lines[1] if len(lines) > 1 else ""


def _name_from_header_lines(lines: list[str], headline: str) -> str:
    if headline and headline in lines:
        candidate_lines = lines[: lines.index(headline)]
    else:
        candidate_lines = lines[:1]
    if not candidate_lines:
        return ""
    if all(" " not in line and len(line) <= 8 for line in candidate_lines):
        joined = "".join(candidate_lines)
        return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", joined).strip()
    return " ".join(candidate_lines).strip()


def _contact_items(line: str) -> list[str]:
    items: list[str] = []
    for item in line.split("|"):
        cleaned = _clean_line(item)
        if cleaned and not _is_phone_item(cleaned):
            items.append(cleaned)
    return items


def _is_phone_item(value: str) -> bool:
    digits = re.sub(r"\D", "", value)
    has_letters = any(char.isalpha() for char in value)
    return len(digits) >= 7 and not has_letters


def _clean_line(value: str) -> str:
    return " ".join(value.split()).strip()
