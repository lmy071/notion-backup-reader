"""Create transparent APNGs and static fallbacks from the approved cat atlas."""
from pathlib import Path
import math
import re
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/assets/images/cat-frames'
OUT.mkdir(parents=True, exist_ok=True)
atlas = Image.open(ROOT / 'src/assets/images/pixel-cat-poses-transparent.png').convert('RGBA')
poses = re.findall(r"label: '([^']+)', motion: '([^']+)'", (ROOT / 'src/data/catPoses.ts').read_text(encoding='utf-8'))
assert len(poses) == 20
edges = [0, 280, 558, 822, 1122]
SIZE, COUNT, DURATION = 192, 24, 120
report = []
for index, (label, motion) in enumerate(poses):
    col, row = index % 5, index // 5
    tile = atlas.crop((round(col * atlas.width / 5), edges[row], round((col + 1) * atlas.width / 5), edges[row+1]))
    # Preserve square pixels; transparent margins reserve room for every motion.
    art = ImageOps.contain(tile, (160, 160), Image.Resampling.NEAREST)
    frames = []
    for frame in range(COUNT):
        phase = 2 * math.pi * frame / COUNT
        sprite = art.copy()
        dy = 0
        if motion == 'sway':
            sprite = sprite.rotate(3 * math.sin(phase), resample=Image.Resampling.NEAREST, expand=True)
        elif motion == 'hop':
            dy = -round(12 * max(0, math.sin(phase)))
        elif motion == 'breathe':
            amount = (1 - math.cos(phase)) / 2
            sprite = sprite.resize((art.width + round(3 * amount), art.height + round(5 * amount)), Image.Resampling.NEAREST)
        elif motion == 'float':
            dy = -round(8 * (1 - math.cos(phase)) / 2)
        canvas = Image.new('RGBA', (SIZE, SIZE))
        canvas.alpha_composite(sprite, ((SIZE-sprite.width)//2, 176-sprite.height+dy))
        frames.append(canvas)
    name = f'cat-{index+1:02d}'
    frames[0].save(OUT / f'{name}-still.png', optimize=True)
    frames[0].save(OUT / f'{name}.png', save_all=True, append_images=frames[1:], duration=DURATION, loop=0, disposal=0, blend=0, optimize=True)
    with Image.open(OUT / f'{name}.png') as check:
        assert check.is_animated and check.n_frames >= 4
        assert check.info['loop'] == 0
        total_duration = 0
        for number in range(check.n_frames):
            check.seek(number)
            rgba = check.convert('RGBA')
            alpha = rgba.getchannel('A')
            assert alpha.getextrema() == (0, 255)
            bounds = alpha.getbbox()
            assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < SIZE and bounds[3] < SIZE
            total_duration += check.info['duration']
        assert total_duration == COUNT * DURATION
        report.append(f'{name}: {label}, {check.n_frames} frames, {int(total_duration)}ms, alpha verified')
print('\n'.join(report))
