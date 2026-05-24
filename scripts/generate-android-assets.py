from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "logoapp.png"
PUBLIC_FOREGROUND = ROOT / "public" / "app-icon-foreground.png"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

MIPMAP_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

SPLASH_SIZES = {
    "drawable-mdpi": 220,
    "drawable-hdpi": 330,
    "drawable-xhdpi": 440,
    "drawable-xxhdpi": 660,
    "drawable-xxxhdpi": 880,
}


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def extract_symbol() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    if source.getbbox() is None:
        raise RuntimeError("Could not find logo content in source image.")
    return source


def contain(image: Image.Image, size: int, padding_ratio: float, background) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), background)
    max_size = int(size * (1 - padding_ratio * 2))
    copy = image.copy()
    copy.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    x = (size - copy.width) // 2
    y = (size - copy.height) // 2
    canvas.alpha_composite(copy, (x, y))
    return canvas


def font_for(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def make_splash(image: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    logo = image.copy()
    logo.thumbnail((int(size * 0.46), int(size * 0.46)), Image.Resampling.LANCZOS)
    logo_x = (size - logo.width) // 2
    logo_y = int(size * 0.18)
    canvas.alpha_composite(logo, (logo_x, logo_y))

    draw = ImageDraw.Draw(canvas)
    text = "Transjap Sistema"
    font = font_for(max(15, int(size * 0.054)))
    text_box = draw.textbbox((0, 0), text, font=font)
    text_width = text_box[2] - text_box[0]
    text_x = (size - text_width) // 2
    text_y = logo_y + logo.height + int(size * 0.065)
    draw.text((text_x, text_y), text, fill=(255, 255, 255, 245), font=font)
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    ensure_dir(path.parent)
    image.save(path, "PNG", optimize=True)


def write_xml(path: Path, content: str) -> None:
    ensure_dir(path.parent)
    path.write_text(content.strip() + "\n", encoding="utf-8")


def main() -> None:
    symbol = extract_symbol()
    save_png(contain(symbol, 512, 0.0, (0, 0, 0, 0)), PUBLIC_FOREGROUND)

    if not ANDROID_RES.exists():
        print("Android project not found yet; generated public/app-icon-foreground.png only.")
        return

    for folder, size in MIPMAP_SIZES.items():
        icon = contain(symbol, size, 0.0, (255, 255, 255, 255)).convert("RGBA")
        save_png(icon, ANDROID_RES / folder / "ic_launcher.png")
        save_png(ImageOps.expand(icon, border=0), ANDROID_RES / folder / "ic_launcher_round.png")

    for folder, size in FOREGROUND_SIZES.items():
        foreground = contain(symbol, size, 0.0, (0, 0, 0, 0))
        save_png(foreground, ANDROID_RES / folder / "ic_launcher_foreground.png")

    for folder, size in SPLASH_SIZES.items():
        splash = make_splash(symbol, size)
        save_png(splash, ANDROID_RES / folder / "splash.png")

    write_xml(
        ANDROID_RES / "values" / "ic_launcher_background.xml",
        """
        <?xml version="1.0" encoding="utf-8"?>
        <resources>
            <color name="ic_launcher_background">#FFFFFF</color>
        </resources>
        """,
    )

    write_xml(
        ANDROID_RES / "mipmap-anydpi-v26" / "ic_launcher.xml",
        """
        <?xml version="1.0" encoding="utf-8"?>
        <adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
            <background android:drawable="@color/ic_launcher_background"/>
            <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
        </adaptive-icon>
        """,
    )

    write_xml(
        ANDROID_RES / "mipmap-anydpi-v26" / "ic_launcher_round.xml",
        """
        <?xml version="1.0" encoding="utf-8"?>
        <adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
            <background android:drawable="@color/ic_launcher_background"/>
            <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
        </adaptive-icon>
        """,
    )

    print("Android launcher and splash assets generated.")


if __name__ == "__main__":
    main()
