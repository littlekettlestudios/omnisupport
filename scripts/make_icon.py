"""Build the app icon from square tile artwork (resources/icon-art.jpg).

The artwork may come with its own dark backdrop and rounded corners; this finds the tile,
trims its edge, and fits it to Apple's macOS icon grid (an 824 px rounded square with a
soft shadow on a 1024 px canvas) so it sits at the same size as other Dock icons.

Writes resources/icon.png (also the Dock icon when run from source) and resources/icon.icns
(the packaged app's icon). Needs Pillow and macOS's iconutil:

    python3 -m pip install pillow
    python3 scripts/make_icon.py [path/to/artwork]
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'resources'

SIZE = 1024
TILE = 824
RADIUS = 185
INSET = 0.03        # trim this fraction off each side of the found tile to drop its own edge


def tile_box(art: Image.Image) -> tuple[int, int, int, int]:
    """Bounding box of the bright tile on the artwork's dark backdrop."""
    lum = art.convert('L').point(lambda v: 255 if v > 60 else 0)
    box = lum.getbbox() or (0, 0, *art.size)
    w, h = box[2] - box[0], box[3] - box[1]
    side = min(w, h)
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    half = side * (0.5 - INSET)
    return round(cx - half), round(cy - half), round(cx + half), round(cy + half)


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / 'icon-art.jpg'
    art = Image.open(src).convert('RGBA')
    art = art.crop(tile_box(art)).resize((TILE, TILE), Image.LANCZOS)

    o = (SIZE - TILE) // 2
    mask = Image.new('L', (TILE, TILE))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, TILE - 1, TILE - 1), RADIUS, fill=255)
    icon = Image.new('RGBA', (SIZE, SIZE))
    shadow = Image.new('RGBA', (SIZE, SIZE))
    ImageDraw.Draw(shadow).rounded_rectangle((o, o + 12, o + TILE, o + TILE + 12), RADIUS, fill=(0, 0, 0, 90))
    icon.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    icon.paste(art, (o, o), mask)
    OUT.mkdir(exist_ok=True)
    icon.save(OUT / 'icon.png')

    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / 'icon.iconset'
        iconset.mkdir()
        for px in (16, 32, 128, 256, 512):
            icon.resize((px, px), Image.LANCZOS).save(iconset / f'icon_{px}x{px}.png')
            icon.resize((px * 2, px * 2), Image.LANCZOS).save(iconset / f'icon_{px}x{px}@2x.png')
        subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(OUT / 'icon.icns')], check=True)
    print('wrote', OUT / 'icon.png', 'and', OUT / 'icon.icns')


if __name__ == '__main__':
    main()
