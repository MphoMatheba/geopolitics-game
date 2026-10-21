#!/usr/bin/env python3
"""Generates the artwork for the Log in / Sign up brick wall:

  wwwroot/img/brick-red.svg, brick-purple.svg   cartoon brick tiles (seamless)
  Views/Shared/_Wall.cshtml                     graffiti, painter, rappellers, floor and rubble
  Views/Shared/_WallCracks.cshtml               the plaster patch and cracks behind the sign

Everything uses a fixed random seed, so running it again gives the same pictures.
Needs:  pip install fonttools   (drips are placed under real letters, using the font's widths)
Run:    python3 tools/make-wall-art.py
"""
import math, random, pathlib
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'Geopolitics.Web'
FONT = TTFont(ROOT / 'wwwroot' / 'fonts' / 'PermanentMarker-Regular.ttf')
CMAP, HMTX, UPEM = FONT.getBestCmap(), FONT['hmtx'], FONT['head'].unitsPerEm

# ---------------------------------------------------------------- bricks
THEMES = {
    'red': dict(mortar='#1d1411', outline='#140c0b',
                bricks=['#b5452f', '#a33b28', '#c1523a', '#9a3524', '#b04a35', '#a8412c'],
                accent=['#7e3a35', '#6c302b'], grey=['#7b7d89', '#6e7280']),
    'purple': dict(mortar='#1a1220', outline='#120a18',
                   bricks=['#8a47b8', '#7b3fa8', '#9654c4', '#8341b0', '#9250bd', '#7a3ca6'],
                   accent=['#5a2f80', '#4d2870'], grey=['#8f77a8', '#836a9c']),
}
BW, BH, GAP = 92, 40, 6
PX, PY = BW + GAP, BH + GAP
COLS, ROWS = 5, 6
TW, TH = PX * COLS, PY * ROWS


def shade(hex_colour, k):
    r, g, b = (int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    f = lambda v: max(0, min(255, int(v * k)))
    return '#%02x%02x%02x' % (f(r), f(g), f(b))


def brick_tile(name, th):
    rnd = random.Random(11 if name == 'red' else 23)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{TW}" height="{TH}" viewBox="0 0 {TW} {TH}">',
           f'<rect width="{TW}" height="{TH}" fill="{th["mortar"]}"/>']
    for r in range(ROWS):
        off = (r % 2) * PX / 2
        for c in range(COLS):
            roll = rnd.random()
            if roll < 0.12:
                base = rnd.choice(th['accent'])
            elif roll < 0.20:
                base = rnd.choice(th['grey'])
            else:
                base = rnd.choice(th['bricks'])
            parts = []
            parts.append(f'<rect width="{BW}" height="{BH}" rx="8" fill="{base}" stroke="{th["outline"]}" stroke-width="3"/>')
            parts.append(f'<rect x="5" y="4" width="{BW - 10}" height="7" rx="3" fill="#fff" fill-opacity=".14"/>')
            parts.append(f'<rect x="5" y="{BH - 10}" width="{BW - 10}" height="6" rx="3" fill="#000" fill-opacity=".16"/>')
            for _ in range(rnd.randint(1, 4)):                                   # chips
                parts.append(f'<circle cx="{rnd.uniform(8, BW - 8):.1f}" cy="{rnd.uniform(8, BH - 8):.1f}" r="{rnd.uniform(1, 2.6):.1f}" fill="{th["outline"]}" fill-opacity=".45"/>')
            for _ in range(rnd.randint(0, 2)):                                   # scratches
                x, y = rnd.uniform(10, BW - 24), rnd.uniform(8, BH - 10)
                parts.append(f'<path d="M{x:.1f} {y:.1f} l{rnd.uniform(8, 18):.1f} {rnd.uniform(-5, 5):.1f}" stroke="{th["outline"]}" stroke-opacity=".5" stroke-width="1.3" fill="none" stroke-linecap="round"/>')
            if rnd.random() < 0.10:                                              # broken corner
                s = rnd.uniform(11, 18)
                corner = rnd.choice(['tl', 'tr', 'bl', 'br'])
                pts = {'tl': f'0,0 {s:.0f},0 0,{s:.0f}', 'tr': f'{BW},0 {BW - s:.0f},0 {BW},{s:.0f}',
                       'bl': f'0,{BH} {s:.0f},{BH} 0,{BH - s:.0f}', 'br': f'{BW},{BH} {BW - s:.0f},{BH} {BW},{BH - s:.0f}'}[corner]
                parts.append(f'<polygon points="{pts}" fill="{th["mortar"]}"/>')
            x = c * PX + off
            y = r * PY + GAP / 2
            for dx in (-TW, 0, TW):                                              # wrap so the tile repeats seamlessly
                if -BW < x + dx < TW:
                    out.append(f'<g transform="translate({x + dx:.1f} {y:.1f})">{"".join(parts)}</g>')
    for _ in range(7):                                                           # long cracks across a few bricks
        x, y = rnd.uniform(40, TW - 120), rnd.uniform(20, TH - 20)
        pts = [(x, y)]
        for _ in range(rnd.randint(3, 5)):
            x += rnd.uniform(8, 22); y += rnd.uniform(-14, 14); pts.append((x, y))
        d = 'M' + ' L'.join(f'{px:.1f} {py:.1f}' for px, py in pts)
        out.append(f'<path d="{d}" stroke="{th["outline"]}" stroke-width="2" fill="none" stroke-linejoin="round" stroke-opacity=".8"/>')
    out.append('</svg>')
    return '\n'.join(out)


for name, th in THEMES.items():
    (ROOT / 'wwwroot' / 'img' / f'brick-{name}.svg').write_text(brick_tile(name, th))

# ---------------------------------------------------------------- lettering helpers
def centres(text, size, cx):
    adv = [HMTX[CMAP[ord(c)]][0] * size / UPEM for c in text]
    x = cx - sum(adv) / 2
    out = []
    for a in adv:
        out.append(x + a / 2); x += a
    return out, sum(adv)


def drips(text, size, cx, baseline, picks):
    cs, _ = centres(text, size, cx)
    return ''.join(f'        <rect class="drip" x="{cs[i] - w / 2:.0f}" y="{baseline - 6}" width="{w}" height="{h}" rx="{w / 2}" />\n'
                   for i, h, w in picks)


def block_text(text, x, y, size, depth=9):
    """Block letters: a stack of dark copies (the 3D side), a thick outline, then the colour on top."""
    t = lambda cls, extra='': f'        <text class="{cls}" x="{x + extra[0] if extra else x}" y="{y + extra[1] if extra else y}" font-size="{size}">{text}</text>\n'
    s = t('glow')
    for i in range(depth, 0, -1):
        s += t('ext', (i * 0.9, i * 1.1))
    s += t('stroke') + t('fill')
    return s


# ---------------------------------------------------------------- the graffiti partial
rnd = random.Random(5)

def rock(cx, cy, r, fill):
    n = 11
    pts = []
    for i in range(n):
        a = i / n * math.tau
        k = rnd.uniform(0.72, 1.08)
        pts.append((cx + math.cos(a) * r * k * 1.25, cy + math.sin(a) * r * k * 0.8))
    d = 'M' + ' L'.join(f'{x:.0f} {y:.0f}' for x, y in pts) + ' Z'
    return (f'<path d="{d}" fill="{fill}" stroke="#241c10" stroke-width="3" stroke-linejoin="round"/>'
            f'<path d="M{cx - r * .6:.0f} {cy - r * .1:.0f} q{r * .3:.0f} {-r * .45:.0f} {r * .8:.0f} {-r * .1:.0f}" stroke="#fff" stroke-opacity=".28" stroke-width="3" fill="none" stroke-linecap="round"/>')

rubble = ''
for cx, cy, r, f in [(60, 640, 34, '#a29a6c'), (120, 650, 22, '#b3aa7a'), (195, 645, 30, '#9a9266'), (260, 655, 18, '#b3aa7a'),
                     (330, 652, 26, '#a29a6c'), (445, 660, 16, '#b3aa7a'), (760, 656, 20, '#a29a6c'), (830, 648, 32, '#b3aa7a'),
                     (905, 655, 22, '#9a9266'), (975, 642, 36, '#a29a6c'), (1050, 652, 26, '#b3aa7a'), (1115, 645, 30, '#9a9266'),
                     (95, 622, 17, '#b3aa7a'), (1010, 618, 18, '#9a9266'), (160, 668, 12, '#a29a6c'), (1170, 660, 20, '#a29a6c')]:
    rubble += '        ' + rock(cx, cy, r, f) + '\n'

planks = ''
for x in range(-120, 1400, 190):
    planks += f'        <path d="M{x} 652 L{x + (x - 600) * 0.28:.0f} 720" stroke="#2a211e" stroke-width="3" />\n'
for y, x0 in ((684, 0), (702, 90)):
    for x in range(x0, 1300, 270):
        planks += f'        <path d="M{x} {y} h120" stroke="#2a211e" stroke-opacity=".6" stroke-width="2" />\n'

big_drips = drips('GEOPOLITICS', 116, 600, 140, [(1, 62, 7), (4, 36, 6), (7, 84, 8), (9, 48, 6)])
con_drips = drips('CONQUER', 44, 268, 452, [(1, 40, 6), (4, 58, 7), (6, 32, 5)])
bor_drips = drips('BORDERS', 46, 915, 312, [(1, 50, 6), (3, 36, 7), (6, 64, 6)])

wall = f'''@* The animated artwork for the brick wall (Log in / Sign up). Decorative only.
   GENERATED by tools/make-wall-art.py: edit the script, not this file.
   Side artwork stays between x=165 and x=1035 so it is not cropped in a narrow window. *@
<svg class="graffiti" viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
        <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" />
        </filter>
        <filter id="blur" x="-10%" y="-20%" width="120%" height="140%">
            <feGaussianBlur stdDeviation="7" />
        </filter>
        <linearGradient id="floor-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#000" stop-opacity=".35" />
            <stop offset="1" stop-color="#000" stop-opacity="0" />
        </linearGradient>
    </defs>

    <!-- rappelling figures (they slide up and down their ropes) -->
    <g transform="translate(190 0)">
        <g class="rappel">
            <line x1="0" y1="-1000" x2="0" y2="6" stroke="#2a2030" stroke-width="1.6" />
            <circle cx="0" cy="0" r="6" fill="#14101a" />
            <path d="M0 6 L0 28 M0 12 L-8 -2 M0 28 L-10 42 M0 28 L9 40" stroke="#14101a" stroke-width="5" stroke-linecap="round" fill="none" />
        </g>
    </g>
    <g transform="translate(1025 0)">
        <g class="rappel slow">
            <line x1="0" y1="-1000" x2="0" y2="6" stroke="#2a2030" stroke-width="1.6" />
            <circle cx="0" cy="0" r="6" fill="#14101a" />
            <path d="M0 6 L0 28 M0 12 L8 -2 M0 28 L10 42 M0 28 L-9 40" stroke="#14101a" stroke-width="5" stroke-linecap="round" fill="none" />
        </g>
    </g>

    <!-- big block-letter tag across the top -->
    <g class="tag" style="--c:#ffd23f;--d:0s" transform="rotate(-4 600 130)">
{block_text('GEOPOLITICS', 600, 140, 116)}{big_drips}    </g>

    <!-- left: globe doodle, CONQUER, arrow -->
    <g class="doodle" style="--d:2.5s" transform="translate(280 292)">
        <circle class="line" r="62" />
        <ellipse class="line" rx="26" ry="62" />
        <path class="line" d="M-62 0 H62" />
        <path class="line" d="M-54 -28 Q0 -17 54 -28" />
        <path class="line" d="M-54 28 Q0 39 54 28" />
    </g>
    <g class="tag" style="--c:#ff4f9a;--d:4s" transform="rotate(-7 268 440)">
{block_text('CONQUER', 268, 452, 44, 6)}{con_drips}    </g>
    <g class="doodle pink" style="--d:6s">
        <path class="line" d="M190 540 Q270 575 350 545" />
        <path class="line" d="M334 530 L352 545 L330 558" />
    </g>

    <!-- right: NO BORDERS -->
    <g class="tag" style="--c:#3be8ff;--d:3s" transform="rotate(5 915 270)">
{block_text('NO', 915, 258, 46, 7)}{block_text('BORDERS', 915, 312, 46, 7)}{bor_drips}    </g>

    <!-- floor and rubble -->
    <g class="floor">
        <rect x="0" y="652" width="1200" height="68" fill="#b3a396" />
{planks}        <rect x="0" y="652" width="1200" height="30" fill="url(#floor-shade)" />
        <path d="M0 652 H1200" stroke="#1a1318" stroke-width="6" />
    </g>
    <g class="rubble">
{rubble}    </g>

    <!-- the painter, spraying the last two lines -->
    <g class="doodle white-tag" style="--d:7s" transform="translate(0 0)">
        <text class="paint" x="852" y="458" font-size="28">10 NATIONS</text>
        <text class="paint" x="852" y="494" font-size="28">1 WINNER</text>
    </g>
    <g transform="translate(895 504)">
        <g class="painter">
            <path d="M30 60 C28 22 92 16 96 62 C98 88 92 100 88 112 L40 112 C34 96 28 80 30 60 Z" fill="#15111a" stroke="#2d2535" stroke-width="2" />
            <path d="M8 130 C40 104 96 104 126 126 L146 230 L-8 230 Z" fill="#1a1520" stroke="#2d2535" stroke-width="2" />
            <g class="arm">
                <path d="M34 134 Q-4 132 -34 84 L-58 66" stroke="#1a1520" stroke-width="20" stroke-linecap="round" fill="none" />
                <rect x="-80" y="38" width="22" height="42" rx="4" fill="#9aa3ad" stroke="#2d2535" stroke-width="2" />
                <rect x="-79" y="30" width="20" height="11" rx="3" fill="#e04b4b" />
                <rect x="-88" y="34" width="9" height="6" rx="2" fill="#d6dbe0" />
                <g class="spray">
                    <circle style="--i:0s" cx="-92" cy="37" r="5" />
                    <circle style="--i:.18s" cx="-92" cy="37" r="6" />
                    <circle style="--i:.36s" cx="-92" cy="37" r="4" />
                    <circle style="--i:.54s" cx="-92" cy="37" r="7" />
                    <circle style="--i:.72s" cx="-92" cy="37" r="5" />
                </g>
            </g>
        </g>
    </g>
</svg>

@* On a phone the big tag cannot fit, so a simple painted title takes its place. *@
<div class="wall-title" aria-hidden="true">Geopolitics</div>
'''
(ROOT / 'Views' / 'Shared' / '_Wall.cshtml').write_text(wall)

# ---------------------------------------------------------------- cracks behind the sign
rnd = random.Random(21)
CX, CY, VW, VH = 380, 350, 760, 700
FX = 0.74   # cracks spread less sideways than up and down

def rim(rx, ry, lo, hi, n=46):
    pts = []
    for i in range(n):
        a = i / n * math.tau
        k = rnd.uniform(lo, hi)
        pts.append((CX + math.cos(a) * rx * k, CY + math.sin(a) * ry * k))
    return 'M' + ' L'.join(f'{x:.0f} {y:.0f}' for x, y in pts) + ' Z'

main, branch = [], []
N = 14
for i in range(N):
    ang = i / N * math.tau + rnd.uniform(-0.12, 0.12)
    r = 70
    x, y = CX + math.cos(ang) * r * FX, CY + math.sin(ang) * r
    pts = [(x, y)]
    target = rnd.uniform(300, 360)
    while r < target:
        r += rnd.uniform(36, 66)
        ang += rnd.uniform(-0.22, 0.22)
        x, y = CX + math.cos(ang) * r * FX, CY + math.sin(ang) * r
        x, y = max(6, min(VW - 6, x)), max(6, min(VH - 6, y))
        pts.append((x, y))
        if r > 190 and rnd.random() < 0.45:
            ba = ang + rnd.choice((-1, 1)) * rnd.uniform(0.55, 1.0)
            bl = rnd.uniform(38, 90)
            bx, by = max(6, min(VW - 6, x + math.cos(ba) * bl * FX)), max(6, min(VH - 6, y + math.sin(ba) * bl))
            branch.append(f'M{x:.0f} {y:.0f} L{bx:.0f} {by:.0f}')
    main.append('M' + ' L'.join(f'{px:.0f} {py:.0f}' for px, py in pts))

cracks = f'''@* The broken plaster and cracks behind the sign. GENERATED by tools/make-wall-art.py. *@
<svg class="wall-cracks" viewBox="0 0 {VW} {VH}" aria-hidden="true" focusable="false">
    <path class="rim shadow" d="{rim(262, 272, 0.94, 1.1)}" />
    <path class="rim plaster" d="{rim(240, 250, 0.92, 1.04)}" />
{chr(10).join(f'    <path class="crack" pathLength="1" d="{d}" />' for d in main)}
{chr(10).join(f'    <path class="crack thin" pathLength="1" d="{d}" />' for d in branch)}
{chr(10).join(f'    <circle class="puff" style="--dx:{math.cos(a) * 70:.0f}px;--dy:{math.sin(a) * 60 - 20:.0f}px" cx="{CX + math.cos(a) * 235:.0f}" cy="{CY + math.sin(a) * 200:.0f}" r="26" />' for a in [i / 9 * math.tau + .3 for i in range(9)])}
</svg>
'''
(ROOT / 'Views' / 'Shared' / '_WallCracks.cshtml').write_text(cracks)
print('wrote brick-red.svg, brick-purple.svg, _Wall.cshtml, _WallCracks.cshtml')
