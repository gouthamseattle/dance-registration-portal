#!/usr/bin/env python3
"""
GouMo Dance Chronicles - Instructor Poster Generator
Generates a premium 8x10 poster image matching the original design spec.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageChops
from rembg import remove
import math
import random
import os

# ============================================================
# CONFIGURATION
# ============================================================

POSTER_W = 2400  # 8 inches at 300 DPI
POSTER_H = 3000  # 10 inches at 300 DPI
SAFE_MARGIN = 75  # 0.25 inch safe zone

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(BASE_DIR, 'fonts')
MEDIA_DIR = os.path.join(BASE_DIR, '..', 'media')

PHOTO_PATH = os.path.join(MEDIA_DIR, 'supriya.jpg')
OUTPUT_PATH = os.path.join(BASE_DIR, 'supriya-poster.png')

# Colors
BLACK = (10, 10, 10)
DARK = (18, 18, 18)
CHARCOAL = (30, 30, 30)
WHITE = (255, 255, 255)
SILVER = (192, 192, 192)
LIGHT_SILVER = (220, 220, 220)
NEON_LIME = (184, 212, 0)
NEON_LIME_GLOW = (160, 190, 0)
GOLD = (255, 215, 0)
DARK_GOLD = (184, 134, 11)

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def create_radial_gradient(size, center, radius, color_center, color_edge):
    """Create a radial gradient image."""
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = center
    for i in range(radius, 0, -1):
        ratio = i / radius
        r = int(color_edge[0] + (color_center[0] - color_edge[0]) * (1 - ratio))
        g = int(color_edge[1] + (color_center[1] - color_edge[1]) * (1 - ratio))
        b = int(color_edge[2] + (color_center[2] - color_edge[2]) * (1 - ratio))
        a = int(color_edge[3] + (color_center[3] - color_edge[3]) * (1 - ratio))
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(r, g, b, a))
    return img


def create_elliptical_gradient(size, center, rx, ry, color_center, color_edge):
    """Create an elliptical gradient image."""
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = center
    steps = max(rx, ry)
    for i in range(steps, 0, -1):
        ratio = i / steps
        cur_rx = int(rx * ratio)
        cur_ry = int(ry * ratio)
        r = int(color_edge[0] + (color_center[0] - color_edge[0]) * (1 - ratio))
        g = int(color_edge[1] + (color_center[1] - color_edge[1]) * (1 - ratio))
        b = int(color_edge[2] + (color_center[2] - color_edge[2]) * (1 - ratio))
        a = int(color_edge[3] + (color_center[3] - color_edge[3]) * (1 - ratio))
        draw.ellipse([cx - cur_rx, cy - cur_ry, cx + cur_rx, cy + cur_ry], fill=(r, g, b, a))
    return img


def create_vignette_mask(size, strength=0.8, center_brightness=1.0):
    """Create a vignette mask for blending."""
    w, h = size
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    cx, cy = w // 2, int(h * 0.4)  # Slightly above center
    max_r = max(w, h)
    
    for i in range(max_r, 0, -2):
        ratio = i / max_r
        # Use a smooth curve for natural falloff
        brightness = int(255 * center_brightness * (ratio ** 0.5) * (1 - strength + strength * ratio))
        rx = int(i * 0.7)
        ry = int(i * 0.85)
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=brightness)
    
    return mask


def add_noise_texture(img, opacity=15):
    """Add subtle noise texture to an image."""
    w, h = img.size
    noise = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    random.seed(42)  # Consistent noise
    pixels = noise.load()
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            v = random.randint(0, 40)
            a = random.randint(0, opacity)
            pixels[x, y] = (v, v, v, a)
            if x + 1 < w:
                pixels[x + 1, y] = (v, v, v, a)
            if y + 1 < h:
                pixels[x, y + 1] = (v, v, v, a)
                if x + 1 < w:
                    pixels[x + 1, y + 1] = (v, v, v, a)
    return Image.alpha_composite(img.convert('RGBA'), noise)


def draw_text_with_shadow(draw, pos, text, font, fill, shadow_offset=(4, 4), shadow_color=(0, 0, 0, 180)):
    """Draw text with a shadow."""
    x, y = pos
    sx, sy = shadow_offset
    # Shadow
    draw.text((x + sx, y + sy), text, font=font, fill=shadow_color, anchor='mm')
    # Slightly softer shadow
    draw.text((x + sx//2, y + sy//2), text, font=font, fill=(shadow_color[0], shadow_color[1], shadow_color[2], shadow_color[3]//2), anchor='mm')
    # Main text
    draw.text((x, y), text, font=font, fill=fill, anchor='mm')


def draw_paint_splatters(draw, center_x, center_y, color, count=8, spread=60):
    """Draw paint splatter dots."""
    random.seed(center_x + center_y)
    for _ in range(count):
        dx = random.randint(-spread, spread)
        dy = random.randint(-spread, spread)
        r = random.randint(3, 12)
        alpha = random.randint(100, 220)
        c = (color[0], color[1], color[2], alpha)
        draw.ellipse([center_x + dx - r, center_y + dy - r, center_x + dx + r, center_y + dy + r], fill=c)


def draw_crown(draw, center_x, top_y, width=80, height=50):
    """Draw a golden crown."""
    # Crown points
    points = [
        (center_x - width//2, top_y + height),      # bottom left
        (center_x - width//2 + 5, top_y + height//3),  # left peak
        (center_x - width//4, top_y + height * 0.6),    # left valley
        (center_x, top_y),                              # center peak
        (center_x + width//4, top_y + height * 0.6),    # right valley
        (center_x + width//2 - 5, top_y + height//3),  # right peak
        (center_x + width//2, top_y + height),          # bottom right
    ]
    
    # Crown body
    draw.polygon(points, fill=(255, 215, 0, 220), outline=(184, 134, 11, 200))
    
    # Crown jewels (circles at peaks)
    for px, py in [(center_x - width//2 + 5, top_y + height//3),
                   (center_x, top_y),
                   (center_x + width//2 - 5, top_y + height//3)]:
        draw.ellipse([px - 5, py - 5, px + 5, py + 5], fill=(255, 223, 0, 240), outline=(184, 134, 11, 200))
    
    # Crown base
    draw.rectangle([center_x - width//2, top_y + height, center_x + width//2, top_y + height + 8],
                   fill=(255, 215, 0, 220), outline=(184, 134, 11, 180))


# ============================================================
# MAIN POSTER GENERATION
# ============================================================

def generate_poster():
    print("🎨 Generating GouMo Dance Chronicles Instructor Poster...")
    
    # Load fonts
    try:
        font_goumo = ImageFont.truetype(os.path.join(FONT_DIR, 'BlackOpsOne.ttf'), 160)
        font_subtitle = ImageFont.truetype(os.path.join(FONT_DIR, 'BebasNeue.ttf'), 68)
        font_badge = ImageFont.truetype(os.path.join(FONT_DIR, 'BebasNeue.ttf'), 48)
        font_name = ImageFont.truetype(os.path.join(FONT_DIR, 'PlayfairDisplay.ttf'), 220)
        font_instructor = ImageFont.truetype(os.path.join(FONT_DIR, 'PermanentMarker.ttf'), 155)
        font_watermark = ImageFont.truetype(os.path.join(FONT_DIR, 'PermanentMarker.ttf'), 500)
        font_watermark_sub = ImageFont.truetype(os.path.join(FONT_DIR, 'PermanentMarker.ttf'), 160)
    except Exception as e:
        print(f"Font loading error: {e}")
        return
    
    # ---- STEP 1: Create dark background ----
    print("  → Building background...")
    poster = Image.new('RGBA', (POSTER_W, POSTER_H), BLACK + (255,))
    draw = ImageDraw.Draw(poster)
    
    # Subtle dark gradient from center
    bg_glow = create_elliptical_gradient(
        (POSTER_W, POSTER_H),
        (POSTER_W // 2, int(POSTER_H * 0.35)),
        900, 1100,
        CHARCOAL + (255,),
        BLACK + (255,)
    )
    poster = Image.alpha_composite(poster, bg_glow)
    
    # ---- STEP 2: Add concrete/wall texture ----
    print("  → Adding wall texture...")
    texture = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    tex_draw = ImageDraw.Draw(texture)
    random.seed(123)
    for _ in range(50000):
        x = random.randint(0, POSTER_W - 1)
        y = random.randint(0, POSTER_H - 1)
        v = random.randint(20, 50)
        a = random.randint(5, 25)
        size = random.randint(1, 3)
        tex_draw.rectangle([x, y, x + size, y + size], fill=(v, v, v, a))
    poster = Image.alpha_composite(poster, texture)
    
    # ---- STEP 3: Graffiti watermark ----
    print("  → Painting graffiti watermark...")
    watermark_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    wm_draw = ImageDraw.Draw(watermark_layer)
    
    # Main "GouMo" watermark - large
    wm_draw.text((POSTER_W // 2, 650), 'GouMo', font=font_watermark, 
                 fill=(255, 255, 255, 18), anchor='mm')
    
    # "Dance Chronicles" sub-watermark
    wm_draw.text((POSTER_W // 2, 920), 'Dance Chronicles', font=font_watermark_sub,
                 fill=(255, 255, 255, 10), anchor='mm')
    
    # Second ghost watermark layer (rotated feel)
    wm_draw.text((POSTER_W // 2 - 30, 800), 'GouMo', 
                 font=ImageFont.truetype(os.path.join(FONT_DIR, 'PermanentMarker.ttf'), 350),
                 fill=(255, 255, 255, 8), anchor='mm')
    
    poster = Image.alpha_composite(poster, watermark_layer)
    
    # ---- STEP 4: Brush strokes ----
    print("  → Adding brush strokes...")
    brush_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    brush_draw = ImageDraw.Draw(brush_layer)
    random.seed(456)
    for _ in range(15):
        y = random.randint(200, POSTER_H - 200)
        x_start = random.randint(-100, 500)
        length = random.randint(300, 800)
        thickness = random.randint(3, 10)
        alpha = random.randint(3, 12)
        brush_draw.line([(x_start, y), (x_start + length, y + random.randint(-30, 30))],
                       fill=(255, 255, 255, alpha), width=thickness)
    poster = Image.alpha_composite(poster, brush_layer)
    
    # ---- STEP 5: Spotlights ----
    print("  → Adding cinematic lighting...")
    # Top-left warm spotlight
    spotlight_l = create_elliptical_gradient(
        (POSTER_W, POSTER_H),
        (300, 0),
        800, 800,
        (255, 230, 180, 22),
        (0, 0, 0, 0)
    )
    poster = Image.alpha_composite(poster, spotlight_l)
    
    # Top-right warm spotlight
    spotlight_r = create_elliptical_gradient(
        (POSTER_W, POSTER_H),
        (POSTER_W - 300, 0),
        800, 800,
        (255, 230, 180, 18),
        (0, 0, 0, 0)
    )
    poster = Image.alpha_composite(poster, spotlight_r)
    
    # Ambient glow behind subject (subtle neon lime)
    subject_glow = create_elliptical_gradient(
        (POSTER_W, POSTER_H),
        (POSTER_W // 2, 1100),
        700, 800,
        (NEON_LIME[0], NEON_LIME[1], NEON_LIME[2], 16),
        (0, 0, 0, 0)
    )
    poster = Image.alpha_composite(poster, subject_glow)
    
    # ---- STEP 6: Load and process portrait photo ----
    print("  → Processing portrait...")
    print("    ↳ Removing background (this may take a moment)...")
    
    # Load original photo
    photo_original = Image.open(PHOTO_PATH).convert('RGBA')
    
    # Remove background using rembg AI
    cutout_path = os.path.join(BASE_DIR, 'supriya-cutout.png')
    if os.path.exists(cutout_path):
        print("    ↳ Using cached cutout...")
        photo = Image.open(cutout_path).convert('RGBA')
    else:
        photo = remove(photo_original)
        photo.save(cutout_path, 'PNG')
        print("    ↳ Background removed and cached!")
    
    # Enhance the photo - increase contrast for cinematic feel
    # Work on RGB channels only, preserve alpha
    r, g, b, a = photo.split()
    photo_rgb = Image.merge('RGB', (r, g, b))
    enhancer = ImageEnhance.Contrast(photo_rgb)
    photo_rgb = enhancer.enhance(1.25)
    enhancer = ImageEnhance.Brightness(photo_rgb)
    photo_rgb = enhancer.enhance(1.0)
    enhancer = ImageEnhance.Color(photo_rgb)
    photo_rgb = enhancer.enhance(0.85)  # Slight desaturation for cinematic look
    r2, g2, b2 = photo_rgb.split()
    photo = Image.merge('RGBA', (r2, g2, b2, a))
    
    # Resize photo to fit poster (55% of poster height)
    portrait_h = int(POSTER_H * 0.55)  # 1650px
    photo_ratio = photo.width / photo.height
    portrait_w = int(portrait_h * photo_ratio)
    
    # If too wide, constrain by width
    max_portrait_w = int(POSTER_W * 0.80)
    if portrait_w > max_portrait_w:
        portrait_w = max_portrait_w
        portrait_h = int(portrait_w / photo_ratio)
    
    photo = photo.resize((portrait_w, portrait_h), Image.LANCZOS)
    
    # Soften the edges of the cutout slightly for natural blending
    alpha_channel = photo.split()[3]
    alpha_channel = alpha_channel.filter(ImageFilter.GaussianBlur(radius=2))
    photo.putalpha(alpha_channel)
    
    # Position photo on poster (centered)
    photo_x = (POSTER_W - portrait_w) // 2
    photo_y = 380
    
    # Composite the cutout onto the poster (preserves transparency)
    photo_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    photo_layer.paste(photo, (photo_x, photo_y), photo)
    poster = Image.alpha_composite(poster, photo_layer)
    
    # Add subtle shadow under the subject for grounding
    shadow_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    s_draw_shadow = ImageDraw.Draw(shadow_layer)
    shadow_cx = POSTER_W // 2
    shadow_cy = photo_y + portrait_h - 20
    for i in range(400, 0, -2):
        ratio = i / 400
        alpha = int(50 * (1 - ratio))
        rx = int(i * 1.2)
        ry = int(i * 0.25)
        s_draw_shadow.ellipse([shadow_cx - rx, shadow_cy - ry, shadow_cx + rx, shadow_cy + ry],
                             fill=(0, 0, 0, alpha))
    poster = Image.alpha_composite(poster, shadow_layer)
    
    # ---- STEP 7: Smoke / atmosphere at bottom ----
    print("  → Adding atmosphere...")
    smoke = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    smoke_glow1 = create_elliptical_gradient(
        (POSTER_W, POSTER_H),
        (600, 1800),
        500, 300,
        (40, 40, 40, 40),
        (0, 0, 0, 0)
    )
    smoke_glow2 = create_elliptical_gradient(
        (POSTER_W, POSTER_H),
        (1800, 1700),
        400, 250,
        (35, 35, 35, 35),
        (0, 0, 0, 0)
    )
    poster = Image.alpha_composite(poster, smoke_glow1)
    poster = Image.alpha_composite(poster, smoke_glow2)
    
    # ---- STEP 8: Dark gradient at bottom for text area ----
    print("  → Building text area...")
    bottom_grad = Image.new('RGBA', (POSTER_W, 1000), (0, 0, 0, 0))
    for y in range(1000):
        ratio = y / 1000
        alpha = int(255 * (ratio ** 1.5))
        for x in range(POSTER_W):
            bottom_grad.putpixel((x, y), (BLACK[0], BLACK[1], BLACK[2], alpha))
    poster.paste(Image.alpha_composite(
        Image.new('RGBA', (POSTER_W, 1000), (0, 0, 0, 0)), bottom_grad
    ), (0, POSTER_H - 1000), bottom_grad)
    
    # Solid dark at very bottom
    solid_bottom = Image.new('RGBA', (POSTER_W, 400), BLACK + (250,))
    poster = Image.alpha_composite(poster, Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0)))
    bottom_overlay = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    bottom_overlay.paste(solid_bottom, (0, POSTER_H - 400))
    poster = Image.alpha_composite(poster, bottom_overlay)
    
    # ---- STEP 9: Add noise texture ----
    print("  → Adding grain texture...")
    poster = add_noise_texture(poster, opacity=12)
    
    # ---- STEP 10: Light particles ----
    print("  → Sprinkling light particles...")
    particle_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    p_draw = ImageDraw.Draw(particle_layer)
    random.seed(789)
    for _ in range(30):
        x = random.randint(100, POSTER_W - 100)
        y = random.randint(100, int(POSTER_H * 0.6))
        r = random.randint(2, 5)
        a = random.randint(30, 90)
        p_draw.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
    poster = Image.alpha_composite(poster, particle_layer)
    
    # ---- STEP 11: GouMo Logo at top ----
    print("  → Rendering GouMo branding...")
    text_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    t_draw = ImageDraw.Draw(text_layer)
    
    logo_center_x = POSTER_W // 2
    logo_top_y = SAFE_MARGIN + 40
    
    # GM Badge circle
    badge_y = logo_top_y + 55
    badge_r = 55
    # Dark circle with silver border
    t_draw.ellipse([logo_center_x - badge_r, badge_y - badge_r, 
                    logo_center_x + badge_r, badge_y + badge_r],
                   fill=(25, 25, 25, 240), outline=SILVER + (200,), width=4)
    # GM text
    t_draw.text((logo_center_x, badge_y), 'GM', font=font_badge,
               fill=LIGHT_SILVER + (220,), anchor='mm')
    
    # "GouMo" title - chrome/silver effect
    goumo_y = badge_y + badge_r + 85
    # Shadow
    t_draw.text((logo_center_x + 4, goumo_y + 4), 'GouMo', font=font_goumo,
               fill=(0, 0, 0, 180), anchor='mm')
    # Main text (silver gradient simulated with white)
    t_draw.text((logo_center_x, goumo_y), 'GouMo', font=font_goumo,
               fill=WHITE + (240,), anchor='mm')
    # Slight highlight pass
    t_draw.text((logo_center_x - 1, goumo_y - 1), 'GouMo', font=font_goumo,
               fill=(240, 240, 245, 40), anchor='mm')
    
    # "DANCE CHRONICLES" subtitle
    subtitle_y = goumo_y + 75
    t_draw.text((logo_center_x + 3, subtitle_y + 3), 'DANCE CHRONICLES', font=font_subtitle,
               fill=(0, 0, 0, 150), anchor='mm')
    t_draw.text((logo_center_x, subtitle_y), 'DANCE CHRONICLES', font=font_subtitle,
               fill=SILVER + (200,), anchor='mm')
    
    poster = Image.alpha_composite(poster, text_layer)
    
    # ---- STEP 12: Instructor Name ----
    print("  → Adding instructor name...")
    name_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    n_draw = ImageDraw.Draw(name_layer)
    
    name_y = POSTER_H - 500
    
    # Shadow
    n_draw.text((logo_center_x + 6, name_y + 8), 'SUPRIYA', font=font_name,
               fill=(0, 0, 0, 200), anchor='mm')
    # Outer glow
    n_draw.text((logo_center_x, name_y), 'SUPRIYA', font=font_name,
               fill=(0, 0, 0, 100), anchor='mm')
    # Main text - white with slight metallic
    n_draw.text((logo_center_x, name_y), 'SUPRIYA', font=font_name,
               fill=WHITE + (245,), anchor='mm')
    # Subtle top highlight
    n_draw.text((logo_center_x, name_y - 1), 'SUPRIYA', font=font_name,
               fill=(245, 245, 250, 30), anchor='mm')
    
    poster = Image.alpha_composite(poster, name_layer)
    
    # ---- STEP 13: Gold Crown ----
    print("  → Adding gold crown...")
    crown_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    c_draw = ImageDraw.Draw(crown_layer)
    
    crown_y = name_y + 60
    draw_crown(c_draw, logo_center_x, crown_y, width=90, height=55)
    
    poster = Image.alpha_composite(poster, crown_layer)
    
    # ---- STEP 14: INSTRUCTOR title (graffiti brush) ----
    print("  → Painting INSTRUCTOR title...")
    inst_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    i_draw = ImageDraw.Draw(inst_layer)
    
    inst_y = POSTER_H - SAFE_MARGIN - 160
    
    # Dark shadow
    i_draw.text((logo_center_x + 5, inst_y + 6), 'INSTRUCTOR', font=font_instructor,
               fill=(0, 0, 0, 220), anchor='mm')
    # Neon glow (spread)
    for offset in [(0, 0), (-2, 0), (2, 0), (0, -2), (0, 2)]:
        i_draw.text((logo_center_x + offset[0], inst_y + offset[1]), 'INSTRUCTOR', 
                   font=font_instructor, fill=(NEON_LIME[0], NEON_LIME[1], NEON_LIME[2], 30), anchor='mm')
    # Main neon lime text
    i_draw.text((logo_center_x, inst_y), 'INSTRUCTOR', font=font_instructor,
               fill=NEON_LIME + (255,), anchor='mm')
    
    poster = Image.alpha_composite(poster, inst_layer)
    
    # ---- STEP 15: Paint splatters ----
    print("  → Adding paint splatters...")
    splatter_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(splatter_layer)
    
    # Splatters around INSTRUCTOR text
    draw_paint_splatters(s_draw, 350, inst_y - 20, NEON_LIME, count=10, spread=80)
    draw_paint_splatters(s_draw, POSTER_W - 350, inst_y + 10, NEON_LIME, count=10, spread=80)
    draw_paint_splatters(s_draw, 500, inst_y + 60, NEON_LIME, count=6, spread=50)
    draw_paint_splatters(s_draw, POSTER_W - 500, inst_y - 40, NEON_LIME, count=6, spread=50)
    
    # Subtle splatters in mid area
    draw_paint_splatters(s_draw, 300, 1400, NEON_LIME, count=4, spread=40)
    draw_paint_splatters(s_draw, POSTER_W - 350, 900, NEON_LIME, count=4, spread=40)
    
    poster = Image.alpha_composite(poster, splatter_layer)
    
    # ---- STEP 16: Final neon glow behind INSTRUCTOR ----
    glow_layer = Image.new('RGBA', (POSTER_W, POSTER_H), (0, 0, 0, 0))
    glow = create_elliptical_gradient(
        (POSTER_W, POSTER_H),
        (POSTER_W // 2, inst_y),
        600, 120,
        (NEON_LIME[0], NEON_LIME[1], NEON_LIME[2], 25),
        (0, 0, 0, 0)
    )
    poster = Image.alpha_composite(poster, glow)
    
    # ---- SAVE ----
    print("  → Saving poster...")
    final = poster.convert('RGB')
    final.save(OUTPUT_PATH, 'PNG', dpi=(300, 300))
    
    # Also save JPEG for easier printing
    jpeg_path = OUTPUT_PATH.replace('.png', '.jpg')
    final.save(jpeg_path, 'JPEG', quality=95, dpi=(300, 300))
    
    print(f"\n✅ Poster saved!")
    print(f"   PNG: {OUTPUT_PATH}")
    print(f"   JPG: {jpeg_path}")
    print(f"   Size: {POSTER_W}x{POSTER_H}px (8×10\" at 300 DPI)")
    print(f"   Safe margin: {SAFE_MARGIN}px ({SAFE_MARGIN/300:.2f}\" from edges)")


if __name__ == '__main__':
    generate_poster()
