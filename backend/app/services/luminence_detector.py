"""
Luminance detector using FFmpeg signalstats filter.

Samples 1 frame per second from the video (or the last N seconds),
averages the Y-channel (luma) across all sampled frames using ITU-R BT.601,
then returns a suggested text colour:

  luminance > 128  →  bright video  →  "#181C25"  (dark slate text)
  luminance ≤ 128  →  dark video    →  "#ffffff"   (white text)

No OpenCV or NumPy required — only the ffprobe binary that is already a
dependency of the project.

Note: ffprobe does not support the -vf flag. All filter chains must be
expressed via the lavfi demuxer (-f lavfi -i "...").
"""

from __future__ import annotations

import subprocess


_DARK_TEXT = "#181C25"
_LIGHT_TEXT = "#ffffff"
_LUMINANCE_THRESHOLD = 128.0


def get_suggested_text_color(video_path: str) -> str:
    """
    Return the suggested text colour based on the whole video's average luminance.

    Samples the entire video at 1 fps via the lavfi movie filter and averages
    YAVG across all frames. Falls back to white on any error.
    """
    movie_filter = f"movie={video_path},fps=1,signalstats"
    return _run_signalstats(movie_filter)


def get_suggested_outro_text_color(video_path: str, duration: float, window_seconds: float = 5.0) -> str:
    """
    Return the suggested text colour based on the last `window_seconds` of the video.

    Seeks to (duration - window_seconds) via the movie filter's seek_point, then
    resets PTS with setpts=PTS-STARTPTS before trimming so that trim=end=N works
    correctly (without the reset, frames carry their original timestamps and are
    all dropped by trim). Falls back to white on any error.
    """
    seek_point = max(0.0, duration - window_seconds)
    movie_filter = (
        f"movie={video_path}:seek_point={seek_point:.3f},"
        f"fps=1,setpts=PTS-STARTPTS,trim=end={window_seconds:.3f},signalstats"
    )
    return _run_signalstats(movie_filter)


def _run_signalstats(movie_filter: str) -> str:
    """Run ffprobe with the given lavfi filter chain and return a text colour."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-f", "lavfi",
                "-i", movie_filter,
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
