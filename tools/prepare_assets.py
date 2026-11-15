#!/usr/bin/env python3
"""
PROBE THE BASE - asset pipeline.

Turns the raw exports in assets/originals/ into the 21 game-ready files in
assets/images/ that js/assets.js expects. Run it again whenever art changes:

    pip install pillow numpy
    python3 tools/prepare_assets.py

What it does
  1. Full-screen art  -> exactly 1280x720, real format that matches the
     extension (several originals are JPEG data saved as ".png").
  2. Sprites          -> black background turned transparent, cropped tight.
  3. menu_buttons.png -> the portrait 1080x1350 button sheet is re-laid out on
     a transparent 1280x720 canvas (START / OPTIONS / QUIT in a row) so it can
     be placed at (640, 360) with setDisplaySize(1280, 720). The click zones in
     js/assets.js (MENU_BUTTON_ZONES) match MENU_LAYOUT below.
  4. select_mars/moon -> label banners (the text cut from the original card
     on a glass pill), shown under the planet sprites.
  5. Four UI assets that had no original art are drawn procedurally:
     subsystem_icons.png, settings_header.png, settings_ui.png, badge_success.png
  6. The two flare cockpits (mars_cockpit_alert.jpg / moon_cockpit_alert.jpg)
     are normalised to 1280x720.

The script never writes double extensions: every output name is built from
the stem plus exactly one extension chosen from the real output format.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'originals')
DST = os.path.join(ROOT, 'assets', 'images')

W, H = 1280, 720
BLACK_CUTOFF = 4
SOFT_RANGE = 20
PAD = 6

# Palette shared with the original art
GLASS = (42, 34, 64)
GLASS_DARK = (26, 21, 42)
OUTLINE = (236, 236, 244)
CYAN = (0, 240, 255)
RED = (239, 68, 68)
GREEN = (52, 211, 153)

# Must match MENU_BUTTON_ZONES in js/assets.js
MENU_LAYOUT = {
    'width': 230,
    'y': 612,
    'xs': [390, 640, 890],
}

FONT_CANDIDATES = [
    '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/Library/Fonts/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
]


def font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def out_path(stem, ext):
    """Single, explicit extension: protects against 'x.png.png' / 'x.jpg.jpeg'."""
    stem = os.path.splitext(os.path.basename(stem))[0]
    return os.path.join(DST, f'{stem}.{ext}')


def save_jpg(img, stem):
    p = out_path(stem, 'jpg')
    img.convert('RGB').save(p, 'JPEG', quality=90, optimize=True, progressive=True)
    print(f'jpg     {os.path.basename(p):26s} {img.size}')


def save_png(img, stem):
    p = out_path(stem, 'png')
    img.save(p, 'PNG', optimize=True)
    print(f'png     {os.path.basename(p):26s} {img.size}')


def load(name):
    path = os.path.join(SRC, name)
    if not os.path.exists(path):
        sys.exit(f'Missing original: {path}')
    return Image.open(path)


def cover_1280x720(img):
    """Scale to cover 1280x720 then centre-crop (no distortion)."""
    img = img.convert('RGB')
    s = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x0 = (img.width - W) // 2
    y0 = (img.height - H) // 2
    return img.crop((x0, y0, x0 + W, y0 + H))


def black_to_alpha(img):
    rgb = np.asarray(img.convert('RGB'), dtype=np.float32)
    peak = rgb.max(axis=2)
    alpha = np.clip((peak - BLACK_CUTOFF) / SOFT_RANGE, 0, 1)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')


def crop_to_content(img, pad=PAD):
    alpha = np.asarray(img)[:, :, 3]
    ys, xs = np.where(alpha > 128)
    if len(xs) == 0:
        return img
    return img.crop((max(0, xs.min() - pad), max(0, ys.min() - pad),
                     min(img.width, xs.max() + pad + 1), min(img.height, ys.max() + pad + 1)))


def pad_square(img):
    side = max(img.width, img.height)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas


def rows_with_content(img, min_gap=20):
    alpha = np.asarray(img)[:, :, 3]
    has = (alpha > 128).any(axis=1)
    bands, start, gap = [], None, 0
    for y, v in enumerate(has):
        if v:
            if start is None:
                start = y
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                bands.append((start, y - gap + 1))
                start, gap = None, 0
    if start is not None:
        bands.append((start, len(has)))
    return bands


def supersample(size, draw_fn, factor=4):
    """Draw at 4x and downsample for smooth anti-aliased procedural art."""
    big = Image.new('RGBA', (size[0] * factor, size[1] * factor), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(big), factor, big)
    return big.resize(size, Image.LANCZOS)


def glow(img, radius=6, strength=0.8):
    """Adds a soft cyan halo; the canvas is padded first so the halo is never clipped."""
    pad = radius * 3
    padded = Image.new('RGBA', (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    padded.alpha_composite(img, (pad, pad))
    img = padded
    a = img.split()[3].filter(ImageFilter.GaussianBlur(radius))
    a = a.point(lambda v: int(v * strength))
    halo = Image.new('RGBA', img.size, CYAN + (0,))
    halo.putalpha(a)
    return Image.alpha_composite(halo, img)


# --------------------------------------------------------------------------- #
# 1. full-screen art
# --------------------------------------------------------------------------- #
def build_fullscreen():
    for name in ['logo_title.jpg', 'mars_cockpit.jpg', 'moon_cockpit.jpg',
                 'mars_cockpit_alert.jpg', 'moon_cockpit_alert.jpg']:
        save_jpg(cover_1280x720(load(name)), name)
    # settings_frame is opaque art; saved as a REAL png (original was JPEG data)
    save_png(cover_1280x720(load('settings_frame.png')).convert('RGB'), 'settings_frame')


# --------------------------------------------------------------------------- #
# 2. sprites
# --------------------------------------------------------------------------- #
def build_sprites():
    for name in ['badge_alert.png', 'badge_complete.png', 'card_failed.png', 'card_success.png',
                 'card_welcome.png', 'dialog_box.png']:
        save_png(crop_to_content(black_to_alpha(load(name))), name)
    for name in ['mars_planet.png', 'moon_planet.png']:
        save_png(pad_square(crop_to_content(black_to_alpha(load(name)), pad=2)), name)


# --------------------------------------------------------------------------- #
# 3. menu buttons on a 1280x720 transparent layout
# --------------------------------------------------------------------------- #
def build_menu_layout():
    sheet = black_to_alpha(load('menu_buttons.png'))
    bands = rows_with_content(sheet)
    if len(bands) != 3:
        sys.exit(f'Expected 3 buttons in menu_buttons.png, found {len(bands)}')
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    zones = []
    for (y0, y1), cx in zip(bands, MENU_LAYOUT['xs']):
        btn = crop_to_content(sheet.crop((0, max(0, y0 - PAD), sheet.width, min(sheet.height, y1 + PAD))), pad=2)
        s = MENU_LAYOUT['width'] / btn.width
        btn = btn.resize((round(btn.width * s), round(btn.height * s)), Image.LANCZOS)
        x = cx - btn.width // 2
        y = MENU_LAYOUT['y'] - btn.height // 2
        canvas.alpha_composite(btn, (x, y))
        zones.append((cx, MENU_LAYOUT['y'], btn.width, btn.height))
    save_png(canvas, 'menu_buttons')
    print('        menu zones (cx, cy, w, h):', zones)


# --------------------------------------------------------------------------- #
# 4. label banners for the planet choices
# --------------------------------------------------------------------------- #
def build_select_banners():
    for name in ['select_mars.png', 'select_moon.png']:
        img = black_to_alpha(load(name))
        bands = rows_with_content(img, min_gap=8)
        y0, y1 = bands[-1]                      # last band = the text label
        label = crop_to_content(img.crop((0, y0 - 4, img.width, y1 + 4)), pad=0)
        pad_x, pad_y = 46, 18
        bw, bh = label.width + pad_x * 2, label.height + pad_y * 2

        def draw(d, f, big):
            r = bh * f // 2
            d.rounded_rectangle((3 * f, 3 * f, bw * f - 3 * f, bh * f - 3 * f), radius=r,
                                fill=GLASS + (235,), outline=OUTLINE + (255,), width=4 * f)

        banner = supersample((bw, bh), draw)
        banner.alpha_composite(label, (pad_x, pad_y))
        save_png(banner, name)


# --------------------------------------------------------------------------- #
# 5. procedural UI art
# --------------------------------------------------------------------------- #
def build_subsystem_icons():
    """512x128 sheet, 4 frames of 128x128: life support, shielding, research, comms."""
    cell = 128
    colors = [GREEN, CYAN, (192, 132, 252), (251, 191, 36)]

    def draw(d, f, big):
        for i, col in enumerate(colors):
            ox = i * cell * f
            c = (ox + 64 * f, 64 * f)
            d.ellipse((ox + 6 * f, 6 * f, ox + 122 * f, 122 * f), fill=GLASS + (240,),
                      outline=col + (255,), width=5 * f)
            lw = 7 * f
            if i == 0:      # life support: O2 droplet with heartbeat line
                d.polygon([(c[0], 26 * f), (c[0] - 26 * f, 70 * f), (c[0] + 26 * f, 70 * f)], fill=col + (255,))
                d.ellipse((c[0] - 27 * f, 50 * f, c[0] + 27 * f, 102 * f), fill=col + (255,))
                d.line([(c[0] - 20 * f, 78 * f), (c[0] - 8 * f, 78 * f), (c[0] - 2 * f, 66 * f),
                        (c[0] + 6 * f, 90 * f), (c[0] + 12 * f, 78 * f), (c[0] + 20 * f, 78 * f)],
                       fill=GLASS_DARK + (255,), width=5 * f, joint='curve')
            elif i == 1:    # shielding: shield
                pts = [(c[0], 24 * f), (c[0] + 36 * f, 36 * f), (c[0] + 32 * f, 74 * f),
                       (c[0], 104 * f), (c[0] - 32 * f, 74 * f), (c[0] - 36 * f, 36 * f)]
                d.polygon(pts, fill=col + (255,))
                d.line([(c[0] - 14 * f, 62 * f), (c[0] - 3 * f, 74 * f), (c[0] + 16 * f, 50 * f)],
                       fill=GLASS_DARK + (255,), width=lw, joint='curve')
            elif i == 2:    # research: atom
                for ang in (0, 60, 120):
                    orb = Image.new('RGBA', (cell * f, cell * f), (0, 0, 0, 0))
                    od = ImageDraw.Draw(orb)
                    od.ellipse((14 * f, 46 * f, 114 * f, 82 * f), outline=col + (255,), width=5 * f)
                    orb = orb.rotate(ang, resample=Image.BICUBIC)
                    big.alpha_composite(orb, (ox, 0))
                d.ellipse((c[0] - 10 * f, 54 * f, c[0] + 10 * f, 74 * f), fill=col + (255,))
            else:           # comms: dish + waves
                d.pieslice((c[0] - 40 * f, 40 * f, c[0] + 24 * f, 104 * f), 100, 280, fill=col + (255,))
                d.line([(c[0] - 8 * f, 72 * f), (c[0] + 10 * f, 54 * f)], fill=col + (255,), width=5 * f)
                for r in (14, 26, 38):
                    d.arc((c[0] + 10 * f - r * f, 54 * f - r * f, c[0] + 10 * f + r * f, 54 * f + r * f),
                          -80, 10, fill=col + (255,), width=5 * f)

    save_png(supersample((cell * 4, cell), draw), 'subsystem_icons')


def build_settings_header():
    w, h = 760, 84
    txt = 'MISSION OPTIONS'

    def draw(d, f, big):
        d.rounded_rectangle((4 * f, 4 * f, (w - 4) * f, (h - 4) * f), radius=(h // 2) * f,
                            fill=GLASS_DARK + (240,), outline=CYAN + (255,), width=3 * f)
        fnt = font(34 * f)
        tw = d.textlength(txt, font=fnt)
        d.text(((w * f - tw) / 2, (h * f) / 2), txt, font=fnt, fill=OUTLINE + (255,), anchor='lm')
        for sx in (60, w - 60):
            d.ellipse(((sx - 7) * f, (h / 2 - 7) * f, (sx + 7) * f, (h / 2 + 7) * f), fill=CYAN + (255,))

    save_png(glow(supersample((w, h), draw), 8, 0.6), 'settings_header')


def build_settings_ui():
    """Glass row used behind every option (text + value drawn by Phaser on top)."""
    w, h = 760, 86

    def draw(d, f, big):
        d.rounded_rectangle((3 * f, 3 * f, (w - 3) * f, (h - 3) * f), radius=22 * f,
                            fill=GLASS + (225,), outline=OUTLINE + (200,), width=3 * f)
        d.rounded_rectangle(((w - 250) * f, 18 * f, (w - 20) * f, (h - 18) * f), radius=24 * f,
                            fill=GLASS_DARK + (255,), outline=CYAN + (220,), width=3 * f)

    save_png(supersample((w, h), draw), 'settings_ui')


def build_badge_success():
    import math
    size = 256

    def draw(d, f, big):
        c = size * f / 2
        d.ellipse((10 * f, 10 * f, (size - 10) * f, (size - 10) * f), fill=GLASS + (255,),
                  outline=GREEN + (255,), width=10 * f)
        d.ellipse((34 * f, 34 * f, (size - 34) * f, (size - 34) * f), outline=OUTLINE + (200,), width=3 * f)
        pts = []
        for k in range(10):
            r = (54 if k % 2 == 0 else 23) * f
            a = math.radians(-90 + k * 36)
            pts.append((c + r * math.cos(a), c - 18 * f + r * math.sin(a)))
        d.polygon(pts, fill=(250, 204, 21, 255))
        fnt = font(21 * f)
        txt = 'SUCCESS'
        tw = d.textlength(txt, font=fnt)
        d.text((c - tw / 2, c + 50 * f), txt, font=fnt, fill=OUTLINE + (255,), anchor='lm')

    save_png(glow(supersample((size, size), draw), 8, 0.5), 'badge_success')


def main():
    if not os.path.isdir(SRC):
        sys.exit(f'Put the original exports in {SRC}')
    os.makedirs(DST, exist_ok=True)
    build_fullscreen()
    build_sprites()
    build_menu_layout()
    build_select_banners()
    build_subsystem_icons()
    build_settings_header()
    build_settings_ui()
    build_badge_success()
    print('\nDone. assets/images now holds', len([f for f in os.listdir(DST) if not f.startswith('.')]), 'files.')


if __name__ == '__main__':
    main()
