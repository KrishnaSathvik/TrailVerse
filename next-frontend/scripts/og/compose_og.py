#!/usr/bin/env python3
"""Compose TrailVerse Open Graph images.

Artwork is a text-free monochrome plate. This script adds the logo, headline,
subtitle, and footer so type stays exact across pages.

Usage:
  python3 scripts/og/compose_og.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ART_DIR = Path(__file__).resolve().parent / "art"
FONT_PATH = Path(__file__).resolve().parent / "fonts" / "BricolageGrotesque-Variable.ttf"
LOGO_PATH = ROOT / "public" / "logo.png"
OUT_DIR = ROOT / "public" / "og"

WIDTH = 1200
HEIGHT = 630
MARGIN = 72
INK = (23, 23, 23)
MUTED = (139, 139, 139)
CANVAS = (244, 241, 234)
EYEBROW = "EXPLORE  •  DISCOVER  •  PLAN"
DOMAIN = "nationalparksexplorerusa.com"

PAGES = [
    {
        "art": "landing.jpg",
        "out": "landing.jpg",
        "headline": "Your next park trip starts here.",
        "subtitle": "Plan it with Trailie.",
        "url": "nationalparksexplorerusa.com",
        "photo": True,
    },
    {
        "art": "map.jpg",
        "out": "map.jpg",
        "headline": "Explore the Map",
        "subtitle": "National Park Service sites, on one map.",
        "index": "03",
    },
    {
        "art": "trailie.jpg",
        "out": "trailie.jpg",
        "headline": "Meet Trailie",
        "subtitle": "Your park trip planner.",
        "index": "09",
    },
    {
        "art": "arizona.jpg",
        "out": "states/arizona.jpg",
        "headline": "Explore Arizona's Parks & Sites",
        "subtitle": "National Park Service sites in Arizona.",
        "index": "AZ",
    },
]


def font(size: int, weight: int, opsz: int) -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(FONT_PATH), size)
    face.set_variation_by_axes([opsz, weight, 100])
    return face


def text_width(face: ImageFont.FreeTypeFont, text: str, tracking: float = 0) -> float:
    if not text:
        return 0
    return face.getlength(text) + tracking * (len(text) - 1)


def wrap_text(face: ImageFont.FreeTypeFont, text: str, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if text_width(face, trial) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, face, fill, tracking: float = 0) -> None:
    x, y = xy
    if tracking == 0:
        draw.text((x, y), text, font=face, fill=fill)
        return
    for char in text:
        draw.text((x, y), char, font=face, fill=fill)
        x += face.getlength(char) + tracking


def line_height(face: ImageFont.FreeTypeFont) -> int:
    box = face.getbbox("Hg")
    return box[3] - box[1]


def prepare_logo(height: int) -> Image.Image:
    logo = Image.open(LOGO_PATH).convert("RGBA")
    pixels = logo.load()
    for y in range(logo.height):
        for x in range(logo.width):
            red, green, blue, alpha = pixels[x, y]
            if red > 225 and green > 225 and blue > 225:
                pixels[x, y] = (red, green, blue, 0)
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)
    width = max(1, round(logo.width * (height / logo.height)))
    return logo.resize((width, height), Image.Resampling.LANCZOS)


def ink_bbox(image: Image.Image, threshold: int = 206):
    gray = image.convert("L")
    mask = gray.point(lambda pixel: 255 if pixel < threshold else 0)
    return mask.getbbox()


def cover_signature(image: Image.Image) -> Image.Image:
    """Drop the small corner mark the illustration model sometimes leaves."""
    plate = image.convert("RGB")
    draw = ImageDraw.Draw(plate)
    draw.rectangle((plate.width - 150, plate.height - 70, plate.width, plate.height), fill=plate.getpixel((4, 4)))
    return plate


def fade_left(image: Image.Image, distance: int) -> Image.Image:
    plate = image.convert("RGBA")
    alpha = Image.new("L", plate.size, 255)
    pixels = alpha.load()
    span = min(distance, plate.width)
    for x in range(span):
        value = int(255 * (x / span))
        for y in range(plate.height):
            pixels[x, y] = value
    plate.putalpha(alpha)
    return plate


def place_artwork(canvas: Image.Image, art_path: Path, box: tuple[int, int, int, int], cover_corner: bool) -> None:
    art = Image.open(art_path).convert("RGB")
    if cover_corner:
        art = cover_signature(art)
    bbox = ink_bbox(art)
    if not bbox:
        return
    pad = 12
    crop = art.crop((
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(art.width, bbox[2] + pad),
        min(art.height, bbox[3] + pad),
    ))
    x0, y0, x1, y1 = box
    box_w = x1 - x0
    box_h = y1 - y0
    scale = min(box_w / crop.width, box_h / crop.height)
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    crop = fade_left(crop, 56)
    pos = (x1 - crop.width, y0 + (box_h - crop.height) // 2)
    canvas.alpha_composite(crop, pos)


def place_photo(canvas: Image.Image, art_path: Path, left: int) -> None:
    """Full-height photograph on the right, faded into the paper panel."""
    art = Image.open(art_path).convert("RGB")
    target_w = WIDTH - left
    scale = max(target_w / art.width, HEIGHT / art.height)
    resized = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
        Image.Resampling.LANCZOS,
    )
    crop_x = max(0, (resized.width - target_w) // 2)
    crop_y = max(0, (resized.height - HEIGHT) // 2)
    photo = resized.crop((crop_x, crop_y, crop_x + target_w, crop_y + HEIGHT)).convert("RGBA")
    fade = 48
    alpha = Image.new("L", photo.size, 255)
    pixels = alpha.load()
    for x in range(min(fade, photo.width)):
        value = int(255 * (x / fade))
        for y in range(photo.height):
            pixels[x, y] = value
    photo.putalpha(alpha)
    canvas.alpha_composite(photo, (left, 0))


def compose(page: dict) -> Path:
    paper = (254, 252, 249) if page.get("photo") else CANVAS
    ink = (45, 43, 40) if page.get("photo") else INK
    muted = (120, 114, 106) if page.get("photo") else MUTED
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (*paper, 255))
    max_text = 400 if page.get("photo") else 560
    headline_face = font(48 if page.get("photo") else 52, 640, 72)
    lines = wrap_text(headline_face, page["headline"], max_text)
    if len(lines) > 2:
        headline_face = font(42, 640, 72)
        lines = wrap_text(headline_face, page["headline"], max_text)
    if page.get("photo"):
        place_photo(canvas, ART_DIR / page["art"], 560)
    else:
        art_left = 500 if len(lines) > 2 else 560
        place_artwork(
            canvas,
            ART_DIR / page["art"],
            (art_left, 28, WIDTH - 36, HEIGHT - 96),
            page.get("cover_corner", False),
        )
    draw = ImageDraw.Draw(canvas)

    logo = prepare_logo(40)
    logo_y = 58
    canvas.alpha_composite(logo, (MARGIN, logo_y))
    word_face = font(26, 560, 28)
    word_box = word_face.getbbox("TrailVerse")
    word_y = logo_y + (logo.height - (word_box[3] - word_box[1])) // 2 - word_box[1]
    draw_text(draw, (MARGIN + logo.width + 12, word_y), "TrailVerse", word_face, ink)

    if page.get("url"):
        headline_y = logo_y + logo.height + 56
    else:
        eyebrow_face = font(13, 520, 14)
        eyebrow_y = logo_y + logo.height + 34
        draw_text(draw, (MARGIN, eyebrow_y), EYEBROW, eyebrow_face, muted, tracking=1.6)
        headline_y = eyebrow_y + line_height(eyebrow_face) + 26
    gap = 8
    for line in lines:
        draw_text(draw, (MARGIN, headline_y), line, headline_face, ink)
        headline_y += line_height(headline_face) + gap

    subtitle_face = font(22, 430, 20)
    subtitle_y = headline_y + 10
    for line in wrap_text(subtitle_face, page["subtitle"], max_text):
        draw_text(draw, (MARGIN, subtitle_y), line, subtitle_face, ink)
        subtitle_y += line_height(subtitle_face) + 4

    footer_face = font(16, 480, 14)
    footer_y = HEIGHT - MARGIN + 6
    if page.get("url"):
        draw_text(draw, (MARGIN, footer_y), page["url"], footer_face, muted)
    else:
        draw_text(draw, (MARGIN, footer_y), DOMAIN, footer_face, INK)
        index = f"TRAILVERSE  /  {page['index']}"
        index_w = text_width(footer_face, index, tracking=0.8)
        draw_text(draw, (WIDTH - MARGIN - int(index_w), footer_y), index, footer_face, MUTED, tracking=0.8)

    out = OUT_DIR / page["out"]
    out.parent.mkdir(parents=True, exist_ok=True)
    rgb = canvas.convert("RGB")
    rgb.save(out, "JPEG", quality=90, optimize=True, subsampling=0, progressive=True)
    return out


def main() -> None:
    import sys
    wanted = set(sys.argv[1:])
    for page in PAGES:
        if wanted and page["out"] not in wanted and Path(page["out"]).stem not in wanted:
            continue
        if not (ART_DIR / page["art"]).exists():
            print(f"skip {page['out']} (no plate)")
            continue
        path = compose(page)
        with Image.open(path) as image:
            print(f"{path.relative_to(ROOT)} {image.size[0]}x{image.size[1]} {path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
