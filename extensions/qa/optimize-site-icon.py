"""Derive a small browser icon; never alter the upstream branding source."""

from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[2]
source = root / "packages/web/public/tadazz-favicon-z-20261108.png"
target = root / "extensions/site-assets/favicon-z-64-20261110.png"
with Image.open(source) as image:
    resized = ImageOps.contain(image.convert("RGBA"), (64, 64), Image.Resampling.LANCZOS)
    icon = Image.new("RGBA", (64, 64))
    icon.alpha_composite(resized, ((64 - resized.width) // 2, (64 - resized.height) // 2))
    icon.save(target, optimize=True, compress_level=9)
print(f"Original {source.stat().st_size} bytes; derived {target.stat().st_size} bytes")
