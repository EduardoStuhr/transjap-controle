from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "logoapp.png"
PUBLIC = ROOT / "public"
IOS_ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
APP_ICON = IOS_ASSETS / "AppIcon.appiconset"
SPLASH = IOS_ASSETS / "Splash.imageset"

ICON_SPECS = [
    ("Icon-20@1x.png", "iphone", "20x20", "1x", 20),
    ("Icon-20@2x.png", "iphone", "20x20", "2x", 40),
    ("Icon-20@3x.png", "iphone", "20x20", "3x", 60),
    ("Icon-29@1x.png", "iphone", "29x29", "1x", 29),
    ("Icon-29@2x.png", "iphone", "29x29", "2x", 58),
    ("Icon-29@3x.png", "iphone", "29x29", "3x", 87),
    ("Icon-40@2x.png", "iphone", "40x40", "2x", 80),
    ("Icon-40@3x.png", "iphone", "40x40", "3x", 120),
    ("Icon-60@2x.png", "iphone", "60x60", "2x", 120),
    ("Icon-60@3x.png", "iphone", "60x60", "3x", 180),
    ("Icon-20-ipad@1x.png", "ipad", "20x20", "1x", 20),
    ("Icon-20-ipad@2x.png", "ipad", "20x20", "2x", 40),
    ("Icon-29-ipad@1x.png", "ipad", "29x29", "1x", 29),
    ("Icon-29-ipad@2x.png", "ipad", "29x29", "2x", 58),
    ("Icon-40-ipad@1x.png", "ipad", "40x40", "1x", 40),
    ("Icon-40-ipad@2x.png", "ipad", "40x40", "2x", 80),
    ("Icon-76@1x.png", "ipad", "76x76", "1x", 76),
    ("Icon-76@2x.png", "ipad", "76x76", "2x", 152),
    ("Icon-83.5@2x.png", "ipad", "83.5x83.5", "2x", 167),
    ("Icon-1024.png", "ios-marketing", "1024x1024", "1x", 1024),
]


def ensure(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def save_png(image: Image.Image, path: Path) -> None:
    ensure(path.parent)
    image.save(path, "PNG", optimize=True)


def icon_canvas(source: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    image = source.copy()
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(image.convert("RGBA"), ((size - image.width) // 2, (size - image.height) // 2))
    return canvas.convert("RGB")


def font_for(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in [
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def make_splash(source: Image.Image, size: int, scale: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), "#05070cff")
    draw = ImageDraw.Draw(canvas)

    for radius, alpha, color in [
        (int(size * 0.58), 54, (24, 75, 158)),
        (int(size * 0.38), 42, (230, 177, 58)),
    ]:
        overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        cx = size // 2
        cy = int(size * 0.36)
        overlay_draw.ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            fill=(*color, alpha),
        )
        canvas.alpha_composite(overlay)

    logo = source.copy().convert("RGBA")
    logo.thumbnail((int(size * 0.34), int(size * 0.34)), Image.Resampling.LANCZOS)
    logo_x = (size - logo.width) // 2
    logo_y = int(size * 0.245)
    canvas.alpha_composite(logo, (logo_x, logo_y))

    title = "TransJap Manager"
    font = font_for(max(30, int(44 * scale)))
    box = draw.textbbox((0, 0), title, font=font)
    draw.text(((size - (box[2] - box[0])) // 2, logo_y + logo.height + int(size * 0.05)), title, fill="#f8fafcff", font=font)
    return canvas


def write_json(path: Path, content: str) -> None:
    path.write_text(content.strip() + "\n", encoding="utf-8")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")

    save_png(icon_canvas(source, 180), PUBLIC / "apple-touch-icon.png")
    save_png(icon_canvas(source, 192), PUBLIC / "pwa-icon-192.png")
    save_png(icon_canvas(source, 512), PUBLIC / "pwa-icon-512.png")
    save_png(icon_canvas(source, 1024), PUBLIC / "app-store-icon.png")

    ensure(APP_ICON)
    for filename, _, _, _, pixels in ICON_SPECS:
        save_png(icon_canvas(source, pixels), APP_ICON / filename)

    images = []
    for filename, idiom, size, scale, _ in ICON_SPECS:
        images.append(
            f'    {{ "filename": "{filename}", "idiom": "{idiom}", "scale": "{scale}", "size": "{size}" }}'
        )
    write_json(
        APP_ICON / "Contents.json",
        """
{
  "images": [
%s
  ],
  "info": { "author": "xcode", "version": 1 }
}
""" % ",\n".join(images),
    )

    ensure(SPLASH)
    for scale, filename in [(1, "splash-2732x2732-1x.png"), (2, "splash-2732x2732-2x.png"), (3, "splash-2732x2732-3x.png")]:
        save_png(make_splash(source, 2732, scale), SPLASH / filename)

    write_json(
        SPLASH / "Contents.json",
        """
{
  "images": [
    { "filename": "splash-2732x2732-1x.png", "idiom": "universal", "scale": "1x" },
    { "filename": "splash-2732x2732-2x.png", "idiom": "universal", "scale": "2x" },
    { "filename": "splash-2732x2732-3x.png", "idiom": "universal", "scale": "3x" }
  ],
  "info": { "author": "xcode", "version": 1 }
}
""",
    )

    print("iOS, PWA and App Store icon assets generated.")


if __name__ == "__main__":
    main()
