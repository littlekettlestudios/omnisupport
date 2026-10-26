"""Cut face-screen textures out of the reference renders. Runs inside Blender (numpy):

    blender -b --factory-startup -P pipeline/face_crops.py -- \
        --out build/face idle=input/poses/idle.png happy=input/poses/happy.png \
        thinking=input/poses/thinking.png sorry=input/poses/sorry.png

For each image: find the dark screen in the upper part of the picture, crop it with a
margin, keep only the glowing features (transparent elsewhere), shrink them a little toward the\ncentre, and save a 512x384 PNG. The renderer puts these on the FaceScreen
patch that autorig.py adds to the rig.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
import numpy as np


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", default="512x384")
    ap.add_argument("--feature-offset-y", type=float, default=0.02, help="move the features down by this fraction of the screen height")
    ap.add_argument("--feature-scale", type=float, default=0.95, help="shrink the features toward the screen centre (references draw the eyes larger than the model)")
    ap.add_argument("pairs", nargs="+", help="mood=path.png")
    return ap.parse_args(argv)


def load(path: Path) -> np.ndarray:
    img = bpy.data.images.load(str(path))
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(img)
    return px[::-1]  # Blender stores bottom-up; work top-down


def save(path: Path, rgba: np.ndarray) -> None:
    h, w, _ = rgba.shape
    img = bpy.data.images.new(path.stem, w, h, alpha=True)
    img.pixels[:] = rgba[::-1].astype(np.float32).ravel()
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def screen_bbox(px: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of the dark screen: the largest connected dark region in the top 60%
    of the image (the glowing eyes are holes inside it, so they do not cut it short)."""
    h, w, _ = px.shape
    lum = px[..., :3].mean(axis=2)
    dark = lum < 0.22
    dark[int(h * 0.6):] = False
    # Work on a 4x downsampled mask; flood-fill components with a stack.
    f = 4
    small = dark[: h - h % f, : w - w % f].reshape(h // f, f, w // f, f).mean(axis=(1, 3)) > 0.5
    sh, sw = small.shape
    seen = np.zeros_like(small, dtype=bool)
    best: tuple[int, tuple[int, int, int, int]] = (0, (0, 0, 0, 0))
    for sy in range(sh):
        for sx in range(sw):
            if not small[sy, sx] or seen[sy, sx]:
                continue
            stack = [(sy, sx)]; seen[sy, sx] = True
            n = 0; y0 = y1 = sy; x0 = x1 = sx
            while stack:
                cy, cx = stack.pop(); n += 1
                y0, y1, x0, x1 = min(y0, cy), max(y1, cy), min(x0, cx), max(x1, cx)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; stack.append((ny, nx))
            if n > best[0]:
                best = (n, (x0, y0, x1, y1))
    x0, y0, x1, y1 = best[1]
    return x0 * f, y0 * f, (x1 + 1) * f - 1, (y1 + 1) * f - 1


def resize(rgba: np.ndarray, W: int, H: int) -> np.ndarray:
    h, w, _ = rgba.shape
    ys = (np.arange(H) * h / H).astype(int)
    xs = (np.arange(W) * w / W).astype(int)
    return rgba[ys][:, xs]


def main() -> None:
    args = parse_args()
    out = Path(args.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    W, H = (int(v) for v in args.size.split("x"))
    for pair in args.pairs:
        mood, path = pair.split("=", 1)
        px = load(Path(path).resolve())
        x0, y0, x1, y1 = screen_bbox(px)
        crop = px[y0:y1 + 1, x0:x1 + 1].copy()      # the dark screen, edge to edge
        # Only the glowing features (eyes, brows, mouth) are kept; the model keeps its own
        # screen and bezel underneath. Alpha from brightness, gated to cyan-ish pixels.
        rgb = crop[..., :3]
        mx = rgb.max(axis=2)
        cyan = (rgb[..., 2] > rgb[..., 0] + 0.22) & (rgb[..., 1] > rgb[..., 0] + 0.12)  # the glow, not greyish reflections
        alpha = np.clip((mx - 0.30) / 0.22, 0, 1) * cyan
        alpha = (alpha + np.roll(alpha, 1, 0) + np.roll(alpha, -1, 0) + np.roll(alpha, 1, 1) + np.roll(alpha, -1, 1)) / 5
        crop[..., 3] = alpha
        # Zoom out by feature-scale around the centre; the border samples clamp to the edge.
        h, w, _ = crop.shape
        k = args.feature_scale
        ys = np.clip(((np.arange(H) + 0.5) / H - 0.5 - args.feature_offset_y) / k * h + h / 2, 0, h - 1).astype(int)
        xs = np.clip(((np.arange(W) + 0.5) / W - 0.5) / k * w + w / 2, 0, w - 1).astype(int)
        crop = crop[ys][:, xs]
        # Nothing outside the screen's rounded rectangle, whatever the clamp brought in.
        yy, xx = np.mgrid[0:H, 0:W]
        u = (xx + 0.5) / W * 2 - 1
        v = (yy + 0.5) / H * 2 - 1
        r = (np.abs(u) ** 3.2 + np.abs(v) ** 3.2) ** (1 / 3.2)
        crop[..., 3] *= 1.0 - np.clip((r - 0.78) / 0.08, 0, 1)
        save(out / f"{mood}.png", crop)
        print(f"FACE_OK {mood} bbox=({x0},{y0},{x1},{y1}) -> {out / (mood + '.png')}")


if __name__ == "__main__":
    main()
