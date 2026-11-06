#!/usr/bin/env python3
"""Fill the qualification certificate PPTX. Usage: fill-recognition-certificate.py template.pptx out.pptx payload.json"""

import base64
import json
import sys
import zipfile
from datetime import date

PHOTO_OFF = (2269535, 1753175)
PHOTO_EXT = (2318930, 3186642)
INSET = 22000


def esc(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def spaced(value: str) -> str:
    chars = [ch for ch in value.strip() if not ch.isspace()]
    if not chars:
        return ""
    gap = "  " if len(chars) <= 4 else " "
    return gap.join(chars)


def date_parts(value: str):
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if len(digits) < 8:
        return None
    year, month, day = digits[:4], digits[4:6], digits[6:8]
    return year[:2], year[2:], month, day


def replace_nth_after(text: str, marker: str, old: str, new: str) -> str:
    start = text.find(marker)
    if start < 0:
        raise SystemExit(f"marker missing: {marker}")
    idx = text.find(old, start)
    if idx < 0:
        raise SystemExit(f"token missing after {marker}: {old}")
    return text[:idx] + new + text[idx + len(old) :]


def fill_slide(template: str, person: dict, photo_name: str | None) -> str:
    slide = template
    name = esc(spaced(str(person.get("name") or "")))
    department = esc(str(person.get("department") or "").strip())
    duty = esc(str(person.get("duty") or "").strip())
    issuer = str(person.get("issuer") or "대표이사 홍성호").strip()
    if issuer.startswith("대표이사"):
        issuer_name = issuer[len("대표이사") :].strip() or "홍성호"
    else:
        issuer_name = issuer or "홍성호"
    issuer_text = esc(f"                         대표이사      {spaced(issuer_name)}    ")

    replacements = [
        ("김  성  환", name or "홍  길  동"),
        ("품질관리부", department or " "),
        ("액분석", duty or " "),
        ("                         대표이사      홍 성 호    ", issuer_text),
    ]
    for old, new in replacements:
        if slide.count(old) != 1:
            raise SystemExit(f"template token count {old!r} = {slide.count(old)}")
        slide = slide.replace(old, new)

    join = date_parts(str(person.get("joinDate") or ""))
    if join:
        _, year, month, day = join
        slide = replace_nth_after(slide, "입사", "<a:t>22</a:t>", f"<a:t>{year}</a:t>")
        slide = replace_nth_after(slide, "입사", "<a:t>03</a:t>", f"<a:t>{month}</a:t>")
        slide = replace_nth_after(slide, "입사", "<a:t>11</a:t>", f"<a:t>{day}</a:t>")

    issue = date_parts(str(person.get("issueDate") or "")) or date_parts(date.today().isoformat())
    if issue:
        _, year, month, day = issue
        slide = replace_nth_after(slide, "위 자격을 인정함", "<a:t>26</a:t>", f"<a:t>{year}</a:t>")
        slide = replace_nth_after(slide, "위 자격을 인정함", "<a:t>01</a:t>", f"<a:t>{month}</a:t>")
        slide = replace_nth_after(slide, "위 자격을 인정함", "<a:t>05</a:t>", f"<a:t>{day}</a:t>")

    if photo_name:
        x = PHOTO_OFF[0] + INSET
        y = PHOTO_OFF[1] + INSET
        cx = PHOTO_EXT[0] - INSET * 2
        cy = PHOTO_EXT[1] - INSET * 2
        pic = (
            '<p:pic><p:nvPicPr><p:cNvPr id="20" name="증명사진"/>'
            '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
            '<p:blipFill><a:blip r:embed="rId5"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/>'
            "</a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr></p:pic>"
        )
        marker = '<p:cNvPr id="11" name="그림 10">'
        pos = slide.find(marker)
        if pos < 0:
            raise SystemExit("signature picture missing")
        pic_start = slide.rfind("<p:pic>", 0, pos)
        slide = slide[:pic_start] + pic + slide[pic_start:]
    return slide


def slide_rels(photo_name: str | None) -> str:
    extra = ""
    if photo_name:
        extra = (
            '<Relationship Id="rId5" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
            f'Target="../media/{photo_name}"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/>'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>'
        f"{extra}</Relationships>"
    )


def decode_photo(person: dict):
    raw = person.get("photoBase64") or ""
    if not isinstance(raw, str) or not raw.strip():
        return None
    if "," in raw and raw.strip().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception:
        return None
    if len(data) < 32:
        return None
    mime = str(person.get("photoMime") or "")
    ext = "png" if "png" in mime or data.startswith(b"\x89PNG") else "jpeg"
    return data, ext


def main():
    template_path, out_path, payload_path = sys.argv[1:4]
    payload = json.loads(open(payload_path, encoding="utf-8").read())
    people = payload.get("people") or []
    if not people:
        raise SystemExit("no people")

    zin = zipfile.ZipFile(template_path)
    base_slide = zin.read("ppt/slides/slide1.xml").decode("utf-8")
    files = {info.filename: zin.read(info.filename) for info in zin.infolist()}

    slides = []
    for index, person in enumerate(people):
        photo = decode_photo(person) if person.get("includePhoto") else None
        photo_name = None
        if photo:
            data, ext = photo
            photo_name = f"photo-{index + 1}.{ext}"
            files[f"ppt/media/{photo_name}"] = data
        slides.append(fill_slide(base_slide, person, photo_name))
        rel_name = f"ppt/slides/_rels/slide{index + 1}.xml.rels"
        files[rel_name] = slide_rels(photo_name).encode("utf-8")
        files[f"ppt/slides/slide{index + 1}.xml"] = slides[-1].encode("utf-8")

    pres = files["ppt/presentation.xml"].decode("utf-8")
    ids = []
    rel_extra = ""
    for index in range(len(slides)):
        if index == 0:
            ids.append('<p:sldId id="256" r:id="rId2"/>')
        else:
            rid = f"rId{20 + index}"
            ids.append(f'<p:sldId id="{256 + index}" r:id="{rid}"/>')
            rel_extra += (
                f'<Relationship Id="{rid}" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" '
                f'Target="slides/slide{index + 1}.xml"/>'
            )
    pres = pres.replace('<p:sldId id="256" r:id="rId2"/>', "".join(ids))
    files["ppt/presentation.xml"] = pres.encode("utf-8")

    rels = files["ppt/_rels/presentation.xml.rels"].decode("utf-8")
    rels = rels.replace("</Relationships>", rel_extra + "</Relationships>")
    files["ppt/_rels/presentation.xml.rels"] = rels.encode("utf-8")

    if len(slides) > 1:
        ctypes = files["[Content_Types].xml"].decode("utf-8")
        extra_types = "".join(
            '<Override PartName="/ppt/slides/slide%d.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
            % (index + 1)
            for index in range(1, len(slides))
        )
        ctypes = ctypes.replace("</Types>", extra_types + "</Types>")
        files["[Content_Types].xml"] = ctypes.encode("utf-8")

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for name, data in files.items():
            zout.writestr(name, data)


if __name__ == "__main__":
    main()
