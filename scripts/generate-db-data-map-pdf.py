#!/usr/bin/env python3
"""docs/db-data-map.md → docs/db-data-map.pdf (한글 표 레이아웃)"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MD = ROOT / "docs" / "db-data-map.md"
PDF = ROOT / "docs" / "db-data-map.pdf"
FONT = Path("/tmp/noto-kr/NotoSansKR-Regular.otf")
FONT_BOLD = Path("/tmp/noto-kr/NotoSansKR-Bold.otf")
VENV = ROOT / "docs" / ".pdf-venv"


def ensure_fpdf() -> None:
    py = VENV / "bin" / "python"
    if not py.exists():
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)])
    subprocess.check_call([str(VENV / "bin" / "pip"), "install", "-q", "fpdf2"])
    lib = next((VENV / "lib").glob("python*/site-packages"))
    sys.path.insert(0, str(lib))


def strip_md(text: str) -> str:
    text = text.replace("`", "")
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    return text.strip()


def parse(md: str) -> list[dict]:
    blocks: list[dict] = []
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?\s*-+", lines[i + 1]):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                if not re.match(r"^\|?\s*-+", lines[i]):
                    cells = [strip_md(c) for c in lines[i].strip().strip("|").split("|")]
                    rows.append(cells)
                i += 1
            blocks.append({"type": "table", "rows": rows})
            continue
        if line.startswith("# "):
            blocks.append({"type": "h1", "text": strip_md(line[2:])})
        elif line.startswith("## "):
            blocks.append({"type": "h2", "text": strip_md(line[3:])})
        elif line.startswith("### "):
            blocks.append({"type": "h3", "text": strip_md(line[4:])})
        elif line.startswith("#### "):
            blocks.append({"type": "h4", "text": strip_md(line[5:])})
        elif line.startswith("- "):
            blocks.append({"type": "li", "text": strip_md(line[2:])})
        elif line.startswith("*") and line.endswith("*"):
            blocks.append({"type": "note", "text": strip_md(line)})
        elif line.strip() == "---":
            blocks.append({"type": "hr"})
        else:
            blocks.append({"type": "p", "text": strip_md(line)})
        i += 1
    return blocks


def main() -> None:
    ensure_fpdf()
    from fpdf import FPDF

    if not MD.is_file():
        raise SystemExit(f"missing {MD}")
    if not FONT.is_file() or not FONT_BOLD.is_file():
        raise SystemExit(f"font missing: {FONT} / {FONT_BOLD}")

    pdf = FPDF(format="A4", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(14, 16, 14)
    pdf.add_page()
    pdf.add_font("Noto", "", str(FONT))
    pdf.add_font("Noto", "B", str(FONT_BOLD))
    usable = pdf.epw

    def left() -> None:
        pdf.set_x(pdf.l_margin)

    def heading(text: str, size: int, gap_before: float, color: tuple[int, int, int]) -> None:
        pdf.ln(gap_before)
        left()
        pdf.set_text_color(*color)
        pdf.set_font("Noto", "B", size)
        pdf.multi_cell(usable, size * 0.55, text, align="L")
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Noto", size=9)

    for block in parse(MD.read_text(encoding="utf-8")):
        kind = block["type"]
        if kind == "h1":
            heading(block["text"], 16, 0, (15, 40, 80))
        elif kind == "h2":
            heading(block["text"], 13, 4, (20, 70, 50))
        elif kind == "h3":
            heading(block["text"], 11, 3, (30, 30, 30))
        elif kind == "h4":
            heading(block["text"], 10, 2, (50, 50, 50))
        elif kind == "hr":
            y = pdf.get_y() + 1
            pdf.set_draw_color(200, 200, 200)
            pdf.line(pdf.l_margin, y, pdf.l_margin + usable, y)
            pdf.ln(3)
        elif kind == "li":
            left()
            pdf.set_font("Noto", size=9)
            pdf.multi_cell(usable, 5, "·  " + block["text"], align="L")
        elif kind == "note":
            left()
            pdf.set_font("Noto", size=8)
            pdf.set_text_color(90, 90, 90)
            pdf.multi_cell(usable, 4.5, block["text"], align="L")
            pdf.set_text_color(30, 30, 30)
            pdf.set_font("Noto", size=9)
        elif kind == "p":
            left()
            pdf.set_font("Noto", size=9)
            pdf.multi_cell(usable, 5, block["text"], align="L")
            pdf.ln(1)
        elif kind == "table":
            rows = block["rows"]
            if not rows:
                continue
            cols = max(len(r) for r in rows)
            # 열 너비: 첫 열은 조금 좁게, 나머지는 균등
            if cols == 2:
                widths = (usable * 0.32, usable * 0.68)
            elif cols == 3:
                widths = (usable * 0.28, usable * 0.28, usable * 0.44)
            else:
                widths = tuple(usable / cols for _ in range(cols))
            pdf.ln(1)
            left()
            pdf.set_font("Noto", size=8)
            with pdf.table(
                col_widths=widths,
                line_height=4.6,
                text_align="LEFT",
                borders_layout="ALL",
                cell_fill_color=(232, 240, 248),
                cell_fill_mode="ROWS",
                first_row_as_headings=True,
                width=usable,
            ) as table:
                for index, row in enumerate(rows):
                    padded = row + [""] * (cols - len(row))
                    data = table.row()
                    for cell in padded:
                        data.cell(cell, align="L")
                    if index == 0:
                        pass
            pdf.ln(2)

    PDF.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(PDF))
    print(PDF)


if __name__ == "__main__":
    main()
