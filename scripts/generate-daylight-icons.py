#!/usr/bin/env python3
"""Build Scene's Daylight icon from the bundled, licensed Manrope font.

Requires fonttools and Pillow. SVGs contain glyph outlines,
so rendering never depends on a locally installed font or network access.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.basePen import BasePen
from fontTools.pens.transformPen import TransformPen
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'icons'
FONT = ROOT / 'public' / 'fonts' / 'manrope' / 'manrope-800.ttf'
font = TTFont(FONT)
glyphs = font.getGlyphSet()
glyph_name = font.getBestCmap()[ord('s')]
# Source glyph bounds: (80, -30, 1014, 1110). Draw at 240 px high with
# its visible top-left at (148, 150), within the maskable safe-area circle.
scale = 240 / 1140
pen = SVGPathPen(glyphs)
glyphs[glyph_name].draw(TransformPen(pen, (scale, 0, 0, -scale,
                                         148 - 80 * scale, 150 + 1110 * scale)))
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Scene">
  <rect width="512" height="512" fill="#faf9f7"/>
  <path d="{pen.getCommands()}" fill="#0c0f1c"/>
  <rect x="352" y="122" width="44" height="44" rx="8" fill="#1851ef"/>
</svg>
'''
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'scene-daylight.svg').write_text(svg)
# Rasterize the same outline at 4x; the s is a single contour without holes.
# BasePen converts quadratic font curves to cubic segments for this renderer.
source = Image.new('RGB', (2048, 2048), '#faf9f7')
draw = ImageDraw.Draw(source)
class RasterPen(BasePen):
    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.points = []
    def _moveTo(self, point):
        self.points = [point]
    def _lineTo(self, point):
        self.points.append(point)
    def _curveToOne(self, p1, p2, p3):
        p0 = self._getCurrentPoint()
        for step in range(1, 33):
            t = step / 32
            self.points.append(tuple((1-t)**3*p0[k] + 3*(1-t)**2*t*p1[k]
                               + 3*(1-t)*t*t*p2[k] + t**3*p3[k] for k in (0,1)))
    def _closePath(self):
        draw.polygon([(round(x*4),round(y*4)) for x,y in self.points], fill='#0c0f1c')
    def _endPath(self):
        self._closePath()
raster_pen = RasterPen(glyphs)
glyphs[glyph_name].draw(TransformPen(raster_pen, (scale, 0, 0, -scale,
                                                148-80*scale, 150+1110*scale)))
draw.rounded_rectangle((352*4,122*4,396*4,166*4), radius=8*4, fill='#1851ef')
for size in (32, 180, 192, 512):
    source.resize((size, size), Image.Resampling.LANCZOS).save(
        OUT / f'scene-daylight-{size}.png', optimize=True)
source.resize((512, 512), Image.Resampling.LANCZOS).save(
    OUT / 'scene-daylight-maskable-512.png', optimize=True)
print('Generated Daylight SVG and PNG icons (32, 180, 192, 512, maskable 512).')
