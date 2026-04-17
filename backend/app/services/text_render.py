"""
Text-layer PNG renderer using Pillow.

Renders a single TextLayerConfig as a fully-transparent PNG of the given
video dimensions. FFmpeg then overlays this PNG on the scene clip.

Arabic/RTL support:
  - arabic_reshaper reshapes Arabic glyphs into Unicode Presentation Forms
  - python-bidi applies the Unicode Bidi Algorithm (RTL ordering)
  - NotoSansArabic-ExtraBold renders Arabic glyphs (751 Presentation Forms)
  - Inter renders Latin/numeric characters as fallback — same strategy as the browser

Font strategy (mirrors the frontend):
  - Arabic characters   → NotoSansArabic-ExtraBold (primary)
  - Latin / fallback    → Inter Bold / Inter Regular
  Per-character font selection ensures mixed strings like "USDT والمزيد" render
  with the correct font for each script, exactly as the browser does automatically.
"""

from __future__ import annotations

import io
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display as bidi_display
    _ARABIC_AVAILABLE = True
except ImportError:
    _ARABIC_AVAILABLE = False


# ── Rich-text helpers ─────────────────────────────────────────────────────────

_COLOR_MAP = {'white': '#ffffff', 'red': '#ff444f', 'dark': '#181C25'}


def strip_rich_markup(text: str) -> str:
    """Remove {color:text} and [color:text] markup — keep only the inner text."""
    text = re.sub(r'\{[^}:]+:([^}]*)\}', r'\1', text)
    text = re.sub(r'\[([^\]:]+):([^\]]+)\]', r'\2', text)
    return text


def _parse_rich_segments(content: str, default_color: str) -> list[tuple[str, str]]:
    """
    Parse {color:text} / [color:text] markup into (text, color) pairs.
    Undecorated text uses default_color. Preserves spaces between segments.
    """
    # Normalise square-bracket form → curly-bracket form
    normalised = re.sub(r'\[([^\]:]+):([^\]]+)\]', r'{\1:\2}', content)

    regex = re.compile(r'\{(#[0-9a-fA-F]{6}|white|red|dark):([^}]+)\}')
    segments: list[tuple[str, str]] = []
    last_idx = 0

    for m in regex.finditer(normalised):
        if m.start() > last_idx:
            segments.append((normalised[last_idx:m.start()], default_color))
        color_key = m.group(1).lower()
        color = _COLOR_MAP.get(color_key, m.group(1))
        segments.append((m.group(2), color))
        last_idx = m.end()

    if last_idx < len(normalised):
        segments.append((normalised[last_idx:], default_color))

    if not segments:
        segments.append((content, default_color))

    return segments


def _build_word_color_list(content: str, default_color: str) -> list[tuple[str, str]]:
    """
    Return a flat ordered list of (word, color) derived from rich-markup content.
    Splits on regular spaces only — \\u00A0 keeps tokens glued.
    """
    word_colors: list[tuple[str, str]] = []
    for text, color in _parse_rich_segments(content, default_color):
        for word in _split_words(text):
            if word:
                word_colors.append((word, color))
    return word_colors


def _build_char_color_map(content: str, default_color: str) -> list[str]:
    """
    Return a per-character color list for the plain text derived from rich markup.

    Index i corresponds to the i-th character of strip_rich_markup(content).
    Used by the Arabic path: bidi reordering changes word order, so positional
    word-index mapping breaks. Per-character mapping survives reshaping because
    arabic_reshaper is a 1-to-1 character transform and python-bidi only
    reorders existing characters.
    """
    colors: list[str] = []
    for text, color in _parse_rich_segments(content, default_color):
        for ch in text:
            colors.append(color)
    return colors


def _color_for_char(ch: str, char_colors: list[str], plain: str, default_color: str) -> str:
    """Return the markup color for a single display character.

    Arabic/space characters get default_color. Latin/digit/symbol characters
    are matched back to the original plain text to find their markup color.
    """
    if ch.isspace():
        return default_color
    cp = ord(ch)
    if 0x0600 <= cp <= 0x06FF or 0xFB50 <= cp <= 0xFEFF:
        return default_color
    for j, pch in enumerate(plain):
        if pch == ch and j < len(char_colors) and char_colors[j] != default_color:
            return char_colors[j]
    return default_color


def _split_run_by_color(
    run_text: str,
    run_font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    char_colors: list[str],
    plain: str,
    default_color: str,
) -> list[tuple[str, ImageFont.FreeTypeFont | ImageFont.ImageFont, str]]:
    """Split a single font-run into sub-runs that share the same color.

    Returns (text, font, color) triples. Adjacent characters with the same
    color are grouped together so drawing calls stay minimal and glyph
    shaping within a sub-run is preserved.
    """
    if not run_text:
        return []

    sub_runs: list[tuple[str, ImageFont.FreeTypeFont | ImageFont.ImageFont, str]] = []
    current_text = ""
    current_color: str | None = None

    for ch in run_text:
        c = _color_for_char(ch, char_colors, plain, default_color)
        if c == current_color:
            current_text += ch
        else:
            if current_text and current_color is not None:
                sub_runs.append((current_text, run_font, current_color))
            current_text = ch
            current_color = c

    if current_text and current_color is not None:
        sub_runs.append((current_text, run_font, current_color))

    return sub_runs


def _is_rtl_text(text: str) -> bool:
    """Return True if the text contains Arabic/Hebrew characters."""
    for ch in text:
        if '\u0600' <= ch <= '\u06ff' or '\u0590' <= ch <= '\u05ff':
            return True
    return False


def _split_words(text: str) -> list[str]:
    """Split on regular spaces only — preserves \\u00A0 (non-breaking space) within tokens."""
    return [w for w in text.split(' ') if w]


def _reshape_arabic(text: str) -> str:
    """
    Apply Arabic reshaping + bidi reordering.

    arabic_reshaper converts each Arabic character to its contextual
    Unicode Presentation Form (initial / medial / final / isolated).
    python-bidi reorders the string for correct RTL visual display.
    """
    if not _ARABIC_AVAILABLE or not _is_rtl_text(text):
        return text
    reshaped = arabic_reshaper.reshape(text)
    return bidi_display(reshaped)


# ── Font loading ──────────────────────────────────────────────────────────────

_FONTS_DIR = Path(__file__).parent / "fonts"
_ASSETS_FONTS_DIR = Path(__file__).resolve().parents[2] / "assets"


def _find_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Load Inter for Latin/default text."""
    if bold:
        candidates = [
            str(_FONTS_DIR / "Inter-ExtraBold.ttf"),
            str(_FONTS_DIR / "Inter-Bold.ttf"),
            str(_FONTS_DIR / "Inter-Regular.ttf"),
            "/Library/Fonts/Inter-ExtraBold.otf",
            "/Library/Fonts/Inter-Bold.otf",
            "/Library/Fonts/Inter Bold.ttf",
            "/usr/share/fonts/truetype/inter/Inter-ExtraBold.ttf",
            "/usr/share/fonts/truetype/inter/Inter-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
    else:
        candidates = [
            str(_FONTS_DIR / "Inter-Regular.ttf"),
            str(_FONTS_DIR / "Inter-ExtraBold.ttf"),
            str(_FONTS_DIR / "Inter-Bold.ttf"),
            "/Library/Fonts/Inter-Regular.otf",
            "/Library/Fonts/Inter.otf",
            "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]

    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue

    return ImageFont.load_default()


def _find_arabic_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """
    Load NotoSansArabic-ExtraBold for Arabic glyphs.

    ExtraBold contains 751 Arabic Presentation Form glyphs — all forms
    produced by arabic_reshaper — but only 16 Basic Latin glyphs.
    Latin characters in mixed text fall back to Inter via _split_font_runs().
    """
    candidates = [
        str(_ASSETS_FONTS_DIR / "NotoSansArabic-ExtraBold.ttf"),
        str(_FONTS_DIR / "NotoSansArabic-ExtraBold.ttf"),
        "/usr/share/fonts/truetype/noto/NotoSansArabic-ExtraBold.ttf",
        "/usr/share/fonts/noto/NotoSansArabic-ExtraBold.ttf",
        # fallback to Regular if ExtraBold unavailable
        str(_ASSETS_FONTS_DIR / "NotoSansArabic-Regular.ttf"),
        str(_FONTS_DIR / "NotoSansArabic-Regular.ttf"),
        str(_FONTS_DIR / "NotoSansArabic-Variable.ttf"),
    ]

    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue

    return _find_font(size, bold)


# ── Per-character font fallback (mirrors browser behaviour) ───────────────────

# Build a cmap set for the Arabic font once, so glyph lookup is O(1).
_arabic_cmap_cache: dict[str, set[int]] = {}


def _get_arabic_cmap(font_path: str) -> set[int]:
    """Return the set of Unicode code points covered by the font at font_path."""
    if font_path not in _arabic_cmap_cache:
        try:
            import fontTools  # noqa: F401 — only used for cmap inspection
            from fontTools.ttLib import TTFont
            tt = TTFont(font_path, lazy=True)
            _arabic_cmap_cache[font_path] = set(tt.getBestCmap().keys())
        except Exception:
            # If fontTools is unavailable, assume font covers all chars
            _arabic_cmap_cache[font_path] = set(range(0x10FFFF))
    return _arabic_cmap_cache[font_path]


def _arabic_font_path(bold: bool = True) -> str | None:
    """Return the file path of the best available Arabic font."""
    candidates = [
        str(_ASSETS_FONTS_DIR / "NotoSansArabic-ExtraBold.ttf"),
        str(_FONTS_DIR / "NotoSansArabic-ExtraBold.ttf"),
        str(_ASSETS_FONTS_DIR / "NotoSansArabic-Regular.ttf"),
        str(_FONTS_DIR / "NotoSansArabic-Regular.ttf"),
        str(_FONTS_DIR / "NotoSansArabic-Variable.ttf"),
    ]
    for path in candidates:
        if Path(path).exists():
            return path
    return None


def _split_font_runs(
    text: str,
    arabic_font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    latin_font:  ImageFont.FreeTypeFont | ImageFont.ImageFont,
    arabic_cmap: set[int],
) -> list[tuple[str, ImageFont.FreeTypeFont | ImageFont.ImageFont]]:
    """
    Split `text` into consecutive runs that share the same font.

    Characters present in the Arabic font cmap use arabic_font;
    everything else falls back to latin_font — exactly like the browser.
    """
    if not text:
        return []

    runs: list[tuple[str, ImageFont.FreeTypeFont | ImageFont.ImageFont]] = []
    current_text = ""
    current_font = None

    for ch in text:
        font = arabic_font if ord(ch) in arabic_cmap else latin_font
        if font is current_font:
            current_text += ch
        else:
            if current_text and current_font is not None:
                runs.append((current_text, current_font))
            current_text = ch
            current_font = font

    if current_text and current_font is not None:
        runs.append((current_text, current_font))

    return runs


def _measure_runs(
    draw: ImageDraw.ImageDraw,
    runs: list[tuple[str, ImageFont.FreeTypeFont | ImageFont.ImageFont]],
) -> int:
    """Return the total pixel width of all font runs combined."""
    return sum(int(draw.textlength(text, font=font)) for text, font in runs)


# ── Mixed-font text wrapping ──────────────────────────────────────────────────

def _measure_line_mixed(
    draw: ImageDraw.ImageDraw,
    line: str,
    arabic_font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    latin_font:  ImageFont.FreeTypeFont | ImageFont.ImageFont,
    arabic_cmap: set[int],
) -> int:
    """Measure pixel width of a line using per-character font selection.

    For Arabic text, measures the reshaped (contextual) forms so that width
    matches the actual rendered output. Plain isolated-form characters are
    typically wider than their connected counterparts, which would otherwise
    cause premature line wrapping.
    """
    display_line = _reshape_arabic(line) if _is_rtl_text(line) else line
    runs = _split_font_runs(display_line, arabic_font, latin_font, arabic_cmap)
    return _measure_runs(draw, runs)


def _wrap_text_mixed(
    draw: ImageDraw.ImageDraw,
    text: str,
    arabic_font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    latin_font:  ImageFont.FreeTypeFont | ImageFont.ImageFont,
    arabic_cmap: set[int],
    max_width: int,
    max_lines: int = 2,
) -> list[str]:
    """Word-wrap text using per-character font measurement for accuracy.

    Splits on regular spaces only — \\u00A0 (non-breaking space) keeps tokens glued together.
    """
    words = _split_words(text)
    if not words:
        return []

    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        w = _measure_line_mixed(draw, candidate, arabic_font, latin_font, arabic_cmap)
        if w > max_width and current:
            lines.append(current)
            if len(lines) >= max_lines:
                break
            current = word
        else:
            current = candidate

    if current and len(lines) < max_lines:
        lines.append(current)

    return lines


# ── Single-font text wrapping (Latin-only path) ───────────────────────────────

def _wrap_text(
    draw: ImageDraw.ImageDraw,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    text: str,
    max_width: int,
    max_lines: int = 2,
) -> list[str]:
    """Wrap text into lines that fit within max_width pixels (single-font path).

    Splits on regular spaces only — \\u00A0 (non-breaking space) keeps tokens glued together.
    """
    words = _split_words(text)
    if not words:
        return []

    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        bbox = draw.textbbox((0, 0), candidate, font=font)
        w = bbox[2] - bbox[0]
        if w > max_width and current:
            lines.append(current)
            if len(lines) >= max_lines:
                break
            current = word
        else:
            current = candidate

    if current and len(lines) < max_lines:
        lines.append(current)

    return lines


# ── Config dataclass (mirrors TypeScript TextLayerConfig) ─────────────────────

@dataclass
class TextLayerConfig:
    content: str
    position_x: float        # px in native video resolution
    position_y: float        # px in native video resolution
    position_anchor: str     # 'top' | 'middle' | 'bottom'
    font_size: int
    font_weight: int          # 400 = normal, 800 = bold
    color: str                # CSS hex e.g. "#ffffff"
    background_color: str | None
    start_time: float
    end_time: float
    max_lines: int = 2        # 0 = unlimited (e.g. disclaimer)


# ── Main render function ──────────────────────────────────────────────────────

def render_text_layer_to_png(
    layer: TextLayerConfig,
    video_width: int,
    video_height: int,
) -> bytes:
    """
    Render a single TextLayerConfig as a transparent PNG (video_width × video_height).
    Returns raw PNG bytes.
    """
    canvas = Image.new("RGBA", (video_width, video_height), (0, 0, 0, 0))
    draw   = ImageDraw.Draw(canvas)
    # #region agent log
    _debug_log_path = "/Users/mohamedahshik/Documents/projects/Translation Tool/POD Translation Automation_26__03_2026/.cursor/debug-54472a.log"
    def _dbg(hypothesis_id: str, message: str, data: dict) -> None:
        try:
            with open(_debug_log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "sessionId": "54472a",
                    "runId": "preview-vs-export",
                    "hypothesisId": hypothesis_id,
                    "location": "text_render.py:render_text_layer_to_png",
                    "message": message,
                    "data": data,
                    "timestamp": int(time.time() * 1000),
                }, ensure_ascii=False) + "\n")
        except Exception:
            pass
    # #endregion

    plain = strip_rich_markup(layer.content or "")
    raw_content = layer.content or ""
    if not plain.strip():
        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        return buf.getvalue()

    is_arabic = _is_rtl_text(plain)
    is_bold   = True if is_arabic else (layer.font_weight or 800) > 400
    max_width = int(video_width * 0.76)
    # max_lines=0 means unlimited (used for disclaimer); treat as a large cap internally
    MAX_LINES = layer.max_lines if layer.max_lines > 0 else 9999
    text_color = layer.color or "#ffffff"


    short_side = min(video_width, video_height)
    base_size  = max(8, round(layer.font_size * (short_side / 1080)))
    # #region agent log
    _dbg("H3", "export_render_input", {
        "is_arabic": is_arabic,
        "layer_font_size": layer.font_size,
        "base_size": base_size,
        "max_width": max_width,
        "max_lines": layer.max_lines,
        "position_anchor": layer.position_anchor,
        "content_length": len(plain),
        "raw_content_length": len(raw_content),
        "has_markup_tokens": ("{" in raw_content and "}" in raw_content) or ("[" in raw_content and "]" in raw_content),
    })
    # #endregion

    # ── Arabic path: ExtraBold + Inter fallback ───────────────────────────────
    if is_arabic:
        ar_path      = _arabic_font_path(bold=True)
        ar_cmap      = _get_arabic_cmap(ar_path) if ar_path else set()

        # Binary-search for the largest size that keeps text within MAX_LINES
        # (skipped for unlimited disclaimer — use base_size directly)
        if layer.max_lines > 0:
            lo, hi = 8, base_size
            best_size = 8
            while lo <= hi:
                mid = (lo + hi) // 2
                ar_font  = _find_arabic_font(mid, bold=True)
                lat_font = _find_font(mid, bold=is_bold)
                wrapped  = _wrap_text_mixed(draw, plain, ar_font, lat_font, ar_cmap, max_width, MAX_LINES + 5)
                if len(wrapped) <= MAX_LINES:
                    best_size = mid
                    lo = mid + 1
                else:
                    hi = mid - 1
        else:
            best_size = base_size

        ar_font  = _find_arabic_font(best_size, bold=True)
        lat_font = _find_font(best_size, bold=is_bold)
        logical_lines = _wrap_text_mixed(draw, plain, ar_font, lat_font, ar_cmap, max_width, MAX_LINES)
        lines = [_reshape_arabic(ln) for ln in logical_lines]
        # #region agent log
        plain_w_full = sum(int(draw.textlength(ch, font=ar_font)) for ch in plain if not ch.isspace())
        reshaped_full = _reshape_arabic(plain)
        reshaped_w_full = sum(int(draw.textlength(ch, font=ar_font)) for ch in reshaped_full if not ch.isspace())
        _dbg("H5", "export_render_arabic_layout", {
            "best_size": best_size,
            "line_count": len(lines),
            "logical_lines": logical_lines,
            "plain_char_width_sum": plain_w_full,
            "reshaped_char_width_sum": reshaped_w_full,
            "max_width": max_width,
        })
        # #endregion

        if not lines:
            buf = io.BytesIO()
            canvas.save(buf, format="PNG")
            return buf.getvalue()

        line_h  = int(best_size * 1.3)
        total_h = len(lines) * line_h

        pos_y_px = layer.position_y
        anchor = (layer.position_anchor or 'middle').lower()
        if anchor == 'top':
            start_y = int(pos_y_px)
        elif anchor == 'bottom':
            start_y = int(pos_y_px - total_h)
        else:
            start_y = int(pos_y_px - total_h / 2)

        center_x = video_width // 2

        # Optional background box — width based on widest line
        if layer.background_color:
            max_line_w = max(
                _measure_line_mixed(draw, ln, ar_font, lat_font, ar_cmap)
                for ln in lines
            )
            pad_x, pad_y, radius = 14, 6, 6
            bw = min(max_line_w, max_width) + pad_x * 2
            bh = total_h + pad_y * 2
            draw.rounded_rectangle(
                [center_x - bw // 2, start_y - pad_y,
                 center_x + bw // 2, start_y - pad_y + bh],
                radius=radius,
                fill=layer.background_color,
            )

        # Per-character color map from the original markup. Bidi reordering changes
        # word order, so positional word-index mapping is unreliable. Each font-run
        # is further split into sub-runs by color so that only the marked characters
        # (e.g. "1:800") get the highlight color while Arabic text stays default.
        char_colors = _build_char_color_map(layer.content or "", text_color)

        # Draw each line — split into font runs, then sub-split by color
        for i, line in enumerate(lines):
            runs      = _split_font_runs(line, ar_font, lat_font, ar_cmap)
            line_w    = _measure_runs(draw, runs)
            x         = center_x - line_w // 2
            y         = start_y + i * line_h

            # Align all runs to a shared baseline so mixed fonts sit on the same line
            max_ascent = max(run_font.getmetrics()[0] for _, run_font in runs)

            for run_text, run_font in runs:
                color_sub_runs = _split_run_by_color(
                    run_text, run_font, char_colors, plain, text_color,
                )
                for sub_text, sub_font, sub_color in color_sub_runs:
                    ascent = sub_font.getmetrics()[0]
                    y_adj  = y + (max_ascent - ascent)
                    draw.text((x, y_adj), sub_text, font=sub_font, fill=sub_color)
                    x     += int(draw.textlength(sub_text, font=sub_font))

        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        return buf.getvalue()

    # ── Latin-only path ───────────────────────────────────────────────────────
    font_loader  = _find_font
    display_text = plain

    if layer.max_lines > 0:
        lo, hi = 8, base_size
        best_size = 8
        while lo <= hi:
            mid  = (lo + hi) // 2
            font = font_loader(mid, bold=is_bold)
            wrapped = _wrap_text(draw, font, display_text, max_width, MAX_LINES + 5)
            if len(wrapped) <= MAX_LINES:
                best_size = mid
                lo = mid + 1
            else:
                hi = mid - 1
    else:
        best_size = base_size

    font  = font_loader(best_size, bold=is_bold)
    lines = _wrap_text(draw, font, display_text, max_width, MAX_LINES)
    # #region agent log
    _dbg("H4", "export_render_latin_layout", {
        "best_size": best_size,
        "line_count": len(lines),
        "lines": lines,
    })
    # #endregion

    if not lines:
        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        return buf.getvalue()

    line_h  = int(best_size * 1.3)
    total_h = len(lines) * line_h

    pos_y_px = layer.position_y
    anchor = (layer.position_anchor or 'middle').lower()
    if anchor == 'top':
        start_y = pos_y_px
    elif anchor == 'bottom':
        start_y = pos_y_px - total_h
    else:
        start_y = pos_y_px - total_h / 2

    center_x = video_width // 2

    if layer.background_color:
        max_line_w = max(
            draw.textbbox((0, 0), ln, font=font)[2] - draw.textbbox((0, 0), ln, font=font)[0]
            for ln in lines
        )
        pad_x, pad_y, radius = 14, 6, 6
        bw = min(max_line_w, max_width) + pad_x * 2
        bh = total_h + pad_y * 2
        draw.rounded_rectangle(
            [center_x - bw // 2, int(start_y) - pad_y,
             center_x + bw // 2, int(start_y) - pad_y + bh],
            radius=radius,
            fill=layer.background_color,
        )

    # Build word→color mapping from rich markup (mirrors frontend parseRichText)
    word_color_list = _build_word_color_list(layer.content or "", text_color)
    word_idx = 0

    for i, line in enumerate(lines):
        bbox   = draw.textbbox((0, 0), line, font=font)
        text_w = bbox[2] - bbox[0]
        x = center_x - text_w // 2
        y = int(start_y) + i * line_h

        line_words = _split_words(line)
        for j, word in enumerate(line_words):
            word_color = word_color_list[word_idx][1] if word_idx < len(word_color_list) else text_color
            word_idx += 1
            draw.text((x, y), word, font=font, fill=word_color)
            sep = " " if j < len(line_words) - 1 else ""
            x += int(draw.textlength(word + sep, font=font))

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()
