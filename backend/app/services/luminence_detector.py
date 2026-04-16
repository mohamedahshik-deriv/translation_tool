"""
Luminance detector using FFmpeg signalstats filter.

Samples 1 frame per second from the video, averages the Y-channel (luma)
across all sampled frames using ITU-R BT.601, then returns a suggested
text colour:

  luminance > 128  →  bright video  →  "#181C25"  (dark slate text)
  luminance ≤ 128  →  dark video    →  "#ffffff"   (white text)

No OpenCV or NumPy required — only the ffprobe binary that is already a
dependency of the project.
"""

from __future__ import annotations

import subprocess


_DARK_TEXT = "#181C25"
_LIGHT_TEXT = "#ffffff"
_LUMINANCE_THRESHOLD = 128.0


def get_suggested_text_color(video_path: str) -> str:
    """
    Return the suggested text colour based on the video's average luminance.

    Uses ffprobe with the lavfi movie + fps + signalstats filter chain to
    extract per-frame YAVG (average luma, 0–255) at 1 fps, then averages
    across all sampled frames.

    Falls back to white text on any error so the caller never raises.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-f", "lavfi",
                "-i", f"movie={video_path},fps=1,signalstats",
                "-show_entries", "frame_tags=lavfi.signalstats.YAVG",
                "-of", "default=noprint_wrappers=1:nokey=1",
                "-v", "quiet",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )

        values = [
            float(v)
            for v in result.stdout.strip().splitlines()
            if v.strip()
        ]

        if not values:
            return _LIGHT_TEXT

        avg_luminance = sum(values) / len(values)
        return _DARK_TEXT if avg_luminance > _LUMINANCE_THRESHOLD else _LIGHT_TEXT

    except Exception:
        return _LIGHT_TEXT
