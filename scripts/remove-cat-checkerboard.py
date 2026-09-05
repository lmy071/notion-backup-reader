"""Remove this atlas's neutral checkerboard without keying out ivory cat fur.
Run with a Python environment providing Pillow and NumPy. Source is never overwritten.
"""
from pathlib import Path
import sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/remove-cat-checkerboard.py SOURCE.png')
source = Path(sys.argv[1]).resolve()
target = source.with_name(source.stem + '-transparent.png')
image = Image.open(source).convert('RGB')
rgb = np.asarray(image).astype(np.int16)
h, w = rgb.shape[:2]
# Ivory is warm and chromatic; the baked checkerboard is bright neutral gray.
neutral = (rgb.max(axis=2) - rgb.min(axis=2) <= 12) & (rgb.min(axis=2) >= 175)
seen = np.zeros((h, w), dtype=bool)
background = np.zeros((h, w), dtype=bool)
removed_regions = 0
for y, x in zip(*np.nonzero(neutral)):
    if seen[y, x]:
        continue
    queue = deque([(int(y), int(x))])
    seen[y, x] = True
    pixels = []
    touches_edge = False
    while queue:
        cy, cx = queue.popleft()
        pixels.append((cy, cx))
        touches_edge |= cy == 0 or cx == 0 or cy == h - 1 or cx == w - 1
        for ny, nx in ((cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)):
            if 0 <= ny < h and 0 <= nx < w and neutral[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    yy, xx = np.array(pixels).T
    values = rgb[yy, xx, 0]
    # Enclosed checkerboard holes (e.g. under handles) contain both gray shades.
    # Small enclosed highlights in the eyes remain opaque.
    checker_hole = len(pixels) >= 40 and values.min() <= 243 and values.max() >= 250
    if touches_edge or checker_hole:
        background[yy, xx] = True
        removed_regions += 1
rgba = np.dstack([rgb.astype(np.uint8), np.where(background, 0, 255).astype(np.uint8)])
rgba[background, :3] = 0
result = Image.fromarray(rgba)
result.save(target, optimize=True)
qa = ROOT / '.codex/qa'
qa.mkdir(parents=True, exist_ok=True)
for name, color in [('dark', '#263127'), ('pink', '#f2c4d5')]:
    canvas = Image.new('RGBA', image.size, color)
    canvas.alpha_composite(result)
    canvas.convert('RGB').save(qa / f'cat-alpha-{name}.png')
print(f'Saved {target}; removed {background.sum()} background pixels across {removed_regions} regions')


