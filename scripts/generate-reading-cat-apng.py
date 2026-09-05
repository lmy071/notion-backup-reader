"""Animate a prone reading cat with a right-to-left page turn, transparent APNG."""
from pathlib import Path
import math
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/images/heading-cat-frames'
source=Image.open(OUT/'lying-reading-source-transparent.png').convert('RGBA')
bounds=source.getchannel('A').getbbox()
# Crop transparent padding; preserve original coordinates for book articulation.
crop=source.crop(bounds)
scale=288/crop.width
art=crop.resize((288,round(crop.height*scale)),Image.Resampling.NEAREST)
canvas_size=(320,260)
offset=(16,(260-art.height)//2)
def point(x,y):
    return (round((x-bounds[0])*scale+offset[0]),round((y-bounds[1])*scale+offset[1]))
base=Image.new('RGBA',canvas_size)
base.alpha_composite(art,offset)
frames=[]
for index in range(44):
    frame=base.copy()
    # Eight idle time slices, then 36 distinct page positions.
    if index>=8:
        t=(index-8)/35
        s=(1-math.cos(math.pi*t))/2
        lift=math.sin(math.pi*t)
        hinge_top=point(551,831)
        hinge_bottom=point(414,977)
        free_top=point(907*(1-s)+181*s, 837*(1-s)+821*s-130*lift)
        free_bottom=point(797*(1-s)+91*s,978*(1-s)+939*s-110*lift)
        pen=ImageDraw.Draw(frame)
        shade=round(9*lift)
        pen.polygon([hinge_top,free_top,free_bottom,hinge_bottom],fill=(255-shade,245-shade,223-shade,255))
        pen.line([hinge_top,free_top,free_bottom,hinge_bottom],fill=(194,163,111,255),width=1)
        pen.line([hinge_top,hinge_bottom],fill=(170,140,89,255),width=1)
        # Fine page-grain lines follow the moving sheet in perspective.
        for fraction in (.76,.86):
            a=(round(hinge_top[0]*(1-fraction)+hinge_bottom[0]*fraction),round(hinge_top[1]*(1-fraction)+hinge_bottom[1]*fraction))
            b=(round(free_top[0]*(1-fraction)+free_bottom[0]*fraction),round(free_top[1]*(1-fraction)+free_bottom[1]*fraction))
            pen.line([a,b],fill=(226,207,170,255),width=1)
    frames.append(frame)
frames[0].save(OUT/'heading-cat-reading-still.png',optimize=True)
frames[0].save(OUT/'heading-cat-reading.png',save_all=True,append_images=frames[1:],duration=110,loop=0,disposal=0,blend=0,optimize=True)
with Image.open(OUT/'heading-cat-reading.png') as im:
    assert im.is_animated and im.n_frames>=30
    unique=set()
    heads=set()
    duration=0
    for i in range(im.n_frames):
        im.seek(i)
        rgba=im.convert('RGBA')
        unique.add(rgba.tobytes())
        heads.add(rgba.crop((*point(320,320),*point(740,660))).tobytes())
        assert rgba.getchannel('A').getextrema()==(0,255)
        duration+=im.info['duration']
    print('Verification:', len(unique), len(heads), duration)
    assert len(unique)>=30 and len(heads)==1 and duration==4840
    print(f'PASS: {im.n_frames} encoded frames, {len(unique)} unique frames, stable head, alpha, 4840ms loop')
contact=Image.new('RGBA',(1280,260),'#f2c4d5')
for col,i in enumerate([0,17,26,39]):
    contact.alpha_composite(frames[i],(320*col,0))
qa = ROOT/'.codex/qa'
qa.mkdir(parents=True, exist_ok=True)
contact.convert('RGB').save(qa/'cat-reading-frames.png')


