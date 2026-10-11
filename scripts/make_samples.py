"""
Generates every image the project needs, so no dataset has to be downloaded.

  public/samples/forward_*.png   WhatsApp-style forward screenshots (demo buttons + OCR test)
  public/samples/photo_*.jpg     one original and one edited photo for the demo
  data/ocr/truth.json            the exact text inside each screenshot
  data/forensics/{tune,test}/    original vs edited photos with known answers
  public/icons/                  app icons for the installable web app

Run:  python scripts/make_samples.py
"""

import io
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "public" / "samples"
ICONS = ROOT / "public" / "icons"
OCR_DIR = ROOT / "data" / "ocr"
FORENSICS = ROOT / "data" / "forensics"

FONT_DIR = Path("C:/Windows/Fonts")
# Nirmala UI covers Latin, Devanagari and Telugu on Windows
FONT_CANDIDATES = ["Nirmala.ttc", "Nirmala.ttf", "segoeui.ttf", "arial.ttf"]

FORWARDS = [
    {
        "id": "gps_chip",
        "lang": "en",
        "lines": [
            "BREAKING: The new Rs 2000 note has a",
            "GPS nano chip inside. It can be tracked",
            "even 120 metres under the ground.",
            "Black money hoarders will be caught!",
            "Please share with all groups.",
        ],
    },
    {
        "id": "hot_water",
        "lang": "en",
        "lines": [
            "Doctors from AIIMS say: drinking hot",
            "water every 15 minutes kills the",
            "corona virus in your throat.",
            "Forward to everyone you love!",
        ],
    },
    {
        "id": "whatsapp_fee",
        "lang": "en",
        "lines": [
            "WhatsApp will start charging Rs 499 per",
            "month from tomorrow. Forward this message",
            "to 10 contacts and your logo will turn",
            "blue so your account stays free.",
        ],
    },
    {
        "id": "rbi_2000",
        "lang": "en",
        "lines": [
            "RBI has announced that Rs 2000 notes",
            "are being withdrawn from circulation.",
            "They can be deposited or exchanged",
            "at any bank branch.",
        ],
    },
    {
        "id": "hindi_coins",
        "lang": "hi",
        "lines": [
            "सावधान! RBI ने 10 रुपये के सिक्के",
            "बंद कर दिए हैं। दुकानदार अब इन्हें",
            "नहीं लेंगे। सबको बताएं।",
        ],
    },
    {
        "id": "telugu_anthem",
        "lang": "te",
        "lines": [
            "యునెస్కో జనగణమనను ప్రపంచంలోనే",
            "అత్యుత్తమ జాతీయ గీతంగా ప్రకటించింది.",
            "అందరికీ షేర్ చేయండి.",
        ],
    },
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for name in FONT_CANDIDATES:
        path = FONT_DIR / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size)


def draw_forward(lines: list[str]) -> Image.Image:
    """A phone-width chat screenshot with one forwarded message bubble."""
    width, pad, line_h = 720, 28, 46
    body, small = font(30), font(22)
    bubble_h = 70 + line_h * len(lines) + 40
    height = 150 + bubble_h + 60
    img = Image.new("RGB", (width, height), (236, 229, 221))
    d = ImageDraw.Draw(img)
    # header bar
    d.rectangle((0, 0, width, 96), fill=(7, 94, 84))
    d.ellipse((24, 22, 76, 74), fill=(200, 214, 210))
    d.text((96, 22), "Family Group", font=font(30), fill=(255, 255, 255))
    d.text((96, 58), "Amma, Nanna, Ravi, +18", font=small, fill=(210, 235, 230))
    # bubble
    top, left, right = 130, pad, width - 90
    d.rounded_rectangle((left, top, right, top + bubble_h), radius=18, fill=(255, 255, 255))
    d.text((left + 22, top + 18), "Forwarded many times", font=small, fill=(130, 130, 130))
    y = top + 62
    for line in lines:
        d.text((left + 22, y), line, font=body, fill=(17, 27, 33))
        y += line_h
    d.text((right - 92, top + bubble_h - 36), "9:41 PM", font=small, fill=(140, 140, 140))
    return img


def make_forwards() -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    OCR_DIR.mkdir(parents=True, exist_ok=True)
    truth = []
    for item in FORWARDS:
        path = SAMPLES / f"forward_{item['id']}.png"
        draw_forward(item["lines"]).save(path, optimize=True)
        truth.append({"file": f"public/samples/{path.name}", "lang": item["lang"], "text": "\n".join(item["lines"])})
    (OCR_DIR / "truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(truth)} forward screenshots")


# ---------- photos for image forensics ----------


def synthetic_photo(rng: random.Random, size=(640, 480)) -> Image.Image:
    """A photo-like scene: soft gradient sky, ground, shapes, sensor noise and a little blur."""
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    sky = [rng.randint(90, 200) for _ in range(3)]
    ground = [rng.randint(40, 140) for _ in range(3)]
    horizon = rng.randint(h // 3, 2 * h // 3)
    for y in range(h):
        base, t = (sky, y / horizon) if y < horizon else (ground, (y - horizon) / (h - horizon))
        d.line([(0, y), (w, y)], fill=tuple(int(c * (0.75 + 0.35 * t)) for c in base))
    for _ in range(rng.randint(6, 14)):
        x0, y0 = rng.randint(-50, w), rng.randint(-50, h)
        x1, y1 = x0 + rng.randint(30, 220), y0 + rng.randint(30, 220)
        color = tuple(rng.randint(20, 235) for _ in range(3))
        (d.ellipse if rng.random() < 0.5 else d.rectangle)((x0, y0, x1, y1), fill=color)
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.8, 2.0)))
    noise = Image.effect_noise(size, rng.uniform(10, 22)).convert("RGB")
    return Image.blend(img, noise, 0.08)


def jpeg_roundtrip(img: Image.Image, quality: int) -> Image.Image:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def make_pair(rng: random.Random, tampered: bool, whatsapp: bool) -> tuple[Image.Image, dict]:
    """
    Original: a photo saved at web/phone quality (60-80), then opened and
    re-exported at high quality (90-95) without changes.
    Edited: same, but a patch from another, uncompressed picture is pasted in
    before the re-export, so that patch never had the first, coarse compression.
    whatsapp=True: the result is compressed once more (70-80), as WhatsApp does.
    """
    first_q, export_q, whatsapp_q = rng.randint(60, 80), rng.randint(90, 95), rng.randint(70, 80)
    img = jpeg_roundtrip(synthetic_photo(rng), first_q)
    box = None
    if tampered:
        donor = synthetic_photo(rng)
        pw, ph = rng.randint(90, 200), rng.randint(90, 200)
        sx, sy = rng.randint(0, 640 - pw), rng.randint(0, 480 - ph)
        dx, dy = rng.randint(0, 640 - pw), rng.randint(0, 480 - ph)
        img.paste(donor.crop((sx, sy, sx + pw, sy + ph)), (dx, dy))
        box = {"x": dx, "y": dy, "width": pw, "height": ph}
    final_q = export_q
    if whatsapp:
        img = jpeg_roundtrip(img, export_q)
        final_q = whatsapp_q
    return img, {"first_quality": first_q, "final_quality": final_q, "whatsapp": whatsapp, "box": box}


def make_forensics(per_case: int = 30) -> None:
    for split, seed in (("tune", 11), ("test", 29)):
        rng = random.Random(seed)
        out = FORENSICS / split
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob("*.jpg"):
            old.unlink()
        labels = []
        for case in ("fresh", "whatsapp"):
            for i in range(per_case):
                tampered = i % 2 == 1
                img, meta = make_pair(rng, tampered, case == "whatsapp")
                name = f"{case}_{'edited' if tampered else 'original'}_{i:02d}.jpg"
                img.save(out / name, "JPEG", quality=meta["final_quality"])
                labels.append({"file": name, "edited": tampered, "case": case, **meta})
        (out / "labels.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    print(f"wrote {per_case * 4} forensics photos")

    # demo pair: the same scene with and without a pasted patch (seed picked so ELA shows it clearly)
    for tampered, name, seed in ((False, "photo_original.jpg", 318), (True, "photo_edited.jpg", 318)):
        img, meta = make_pair(random.Random(seed), tampered, False)
        img.save(SAMPLES / name, "JPEG", quality=meta["final_quality"])


# ---------- app icons ----------


def make_icons() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        img = Image.new("RGB", (size, size), (245, 240, 230))
        d = ImageDraw.Draw(img)
        s = size / 512
        d.ellipse((96 * s, 96 * s, 336 * s, 336 * s), outline=(20, 20, 20), width=int(34 * s))
        d.line((300 * s, 300 * s, 420 * s, 420 * s), fill=(20, 20, 20), width=int(48 * s))
        d.line((160 * s, 216 * s, 204 * s, 262 * s), fill=(196, 40, 28), width=int(30 * s))
        d.line((200 * s, 262 * s, 280 * s, 166 * s), fill=(196, 40, 28), width=int(30 * s))
        img.save(ICONS / f"icon-{size}.png", optimize=True)
    print("wrote icons")


if __name__ == "__main__":
    make_forwards()
    make_forensics()
    make_icons()
