"""Turn a grid sprite sheet (one pose per cell, transparent background) into a sprite pack
the app can load: atlas.json plus one sheet per clip, in the same format as
assets/sprites/omni3. Pick the pack's folder in Settings → 2D sprites → Choose sprite pack….

    python3 -m pip install pillow
    python3 scripts/make_sprite_pack.py layout.json out-folder/

layout.json describes the grid and which cells make up each clip; see
scripts/sprite-layout.example.json. Per clip:

    row / rows      the grid row (0-based), or {"W": row, "E": row, ...} for one row per
                    facing. Facings are compass points as seen on screen (S faces the viewer).
    facing          the facing of a single row (default "S").
    columns         the cells to use, in order (default: every column).
    fps or durations_ms   timing; durations_ms gives each frame its own hold.
    loop            true for state loops (idle, walk, thinking), false for one-shot reactions.
    stabilize       true for walk cycles: line every frame up on the body's centre of mass,
                    so art that drifts across its cells doesn't slide in place.

Art may spill over its cell (a jump, a sparkle). Each separate shape goes to the cell its
centre falls in, and frames get a margin so nothing is clipped. The character is taken to
be 1 m tall (its standing height in the idle clip), which is what the app's Size setting
scales.
"""
import json
import statistics
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ALPHA = 8           # pixels at least this opaque belong to a shape


def components(alpha: bytes, w: int, h: int) -> list[dict]:
    """Connected shapes in the alpha mask (8-connected): bbox, pixel count and centroid."""
    seen = bytearray(w * h)
    found = []
    for start in range(w * h):
        if seen[start] or alpha[start] < ALPHA:
            continue
        seen[start] = 1
        queue = deque([start])
        x0 = y0 = 1 << 30
        x1 = y1 = n = sx = sy = 0
        while queue:
            p = queue.popleft()
            y, x = divmod(p, w)
            n += 1; sx += x; sy += y
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
            for dy in (-1, 0, 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    continue
                for dx in (-1, 0, 1):
                    xx = x + dx
                    if 0 <= xx < w:
                        q = yy * w + xx
                        if not seen[q] and alpha[q] >= ALPHA:
                            seen[q] = 1
                            queue.append(q)
        found.append({'box': (x0, y0, x1 + 1, y1 + 1), 'n': n, 'cx': sx / n, 'cy': sy / n})
    return found


def main() -> None:
    layout_path, out = Path(sys.argv[1]), Path(sys.argv[2])
    layout = json.loads(layout_path.read_text())
    sheet = Image.open(layout_path.parent / layout['sheet']).convert('RGBA')
    cols, rows = layout['columns'], layout['rows']
    cw, ch = sheet.width // cols, sheet.height // rows

    # Every shape goes to the cell its centroid falls in.
    cells: dict[tuple[int, int], list[dict]] = {}
    for c in components(sheet.getchannel('A').tobytes(), sheet.width, sheet.height):
        key = (min(int(c['cy'] // ch), rows - 1), min(int(c['cx'] // cw), cols - 1))
        cells.setdefault(key, []).append(c)

    # One frame per (clip, facing, column), with its content box relative to the cell.
    clips = {}
    for name, spec in layout['clips'].items():
        rows_by_facing = spec['rows'] if 'rows' in spec else {spec.get('facing', 'S'): spec['row']}
        columns = spec.get('columns', list(range(cols)))
        frames = {}
        for facing, r in rows_by_facing.items():
            frames[facing] = []
            for c in columns:
                shapes = cells.get((r, c), [])
                if not shapes:
                    sys.exit(f'{name}: cell row {r} column {c} is empty')
                body = max(shapes, key=lambda s: s['n'])
                frames[facing].append({'r': r, 'c': c, 'shapes': shapes, 'body': body, 'shift': 0})
        if spec.get('stabilize'):
            for fl in frames.values():
                mean = statistics.mean(f['body']['cx'] - f['c'] * cw for f in fl)
                for f in fl:
                    f['shift'] = round(mean - (f['body']['cx'] - f['c'] * cw))
        clips[name] = (spec, frames)

    # Shared margin so spill-over fits in every frame.
    left = top = right = bottom = 0
    for spec, frames in clips.values():
        for fl in frames.values():
            for f in fl:
                for s in f['shapes']:
                    x0, y0, x1, y1 = s['box']
                    left = max(left, f['c'] * cw - (x0 + f['shift']))
                    right = max(right, x1 + f['shift'] - (f['c'] + 1) * cw)
                    top = max(top, f['r'] * ch - y0)
                    bottom = max(bottom, y1 - (f['r'] + 1) * ch)
    fw, fh = cw + left + right, ch + top + bottom + 16     # room for rows moved down onto the ground line

    standing = [f['body']['box'] for f in clips['idle'][1][next(iter(clips['idle'][1]))]]
    ppm = round(statistics.median(b[3] - b[1] for b in standing), 1)

    out.mkdir(parents=True, exist_ok=True)
    atlas = {'pixels_per_metre': ppm, 'pixel_art': False, 'facings': sorted({f for _, fr in clips.values() for f in fr}), 'clips': {}}
    for name, (spec, frames) in clips.items():
        n = len(next(iter(frames.values())))
        img = Image.new('RGBA', (fw * n, fh * len(frames)))
        # Each facing row stands on the clip's lowest ground line, so turning doesn't hop.
        row_ground = {facing: max(f['body']['box'][3] - (f['r'] * ch - top) for f in fl) for facing, fl in frames.items()}
        ground = max(row_ground.values())
        centres = []
        for ri, (facing, fl) in enumerate(frames.items()):
            dy = ground - row_ground[facing]
            for i, f in enumerate(fl):
                # Copy only this cell's shapes, so a neighbour's spill-over stays out.
                mask = Image.new('L', sheet.size)
                for s in f['shapes']:
                    mask.paste(sheet.getchannel('A').crop(s['box']), s['box'][:2])
                ox, oy = f['c'] * cw - left, f['r'] * ch - top
                part = sheet.crop((ox, oy, ox + fw, oy + fh))
                part.putalpha(mask.crop((ox, oy, ox + fw, oy + fh)))
                img.alpha_composite(part, (i * fw + f['shift'], ri * fh + dy))
                centres.append(f['body']['cx'] - ox + f['shift'])
        img.save(out / f'sheet_{name}.png', optimize=True)
        durations = spec.get('durations_ms') or [round(1000 / spec.get('fps', 8))] * n
        if len(durations) != n:
            sys.exit(f'{name}: {len(durations)} durations for {n} frames')
        clip = {
            'sheet': f'sheet_{name}.png', 'frames': n, 'frame_w': fw, 'frame_h': fh,
            'loop': bool(spec.get('loop', True)), 'durations_ms': durations, 'emote': None,
            'origin': [round(statistics.median(centres), 1), ground],
            'rows': {facing: ri for ri, facing in enumerate(frames)},
        }
        if 'ground_speed_m_s' in spec:
            clip['ground_speed_px_s'] = round(spec['ground_speed_m_s'] * ppm, 1)
        atlas['clips'][name] = clip
    (out / 'atlas.json').write_text(json.dumps(atlas, indent=1))
    print(f'wrote {len(clips)} clips to {out} ({fw}x{fh} frames, {ppm} px per metre)')


if __name__ == '__main__':
    main()
