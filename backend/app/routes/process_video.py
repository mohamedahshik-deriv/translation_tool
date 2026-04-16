"""
POST /api/process-video

Accepts a video file upload, uses FFmpeg to:
1. Strip audio → silent MP4
2. Extract audio → MP3 (or generate silence if no audio stream)

Returns a multipart/form-data response containing both files, plus the
X-Has-Audio header so the frontend knows whether the original had audio.
"""

import io
import tempfile
import uuid
from pathlib import Path

import ffmpeg
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.services.luminence_detector import get_suggested_text_color
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB


def _build_multipart(silent_bytes: bytes, audio_bytes: bytes, boundary: str) -> bytes:
    """Construct a multipart/form-data body with two named parts."""
    parts: list[bytes] = []

    def _part(name: str, filename: str, content_type: str, data: bytes) -> bytes:
        header = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode()
        return header + data + b"\r\n"

    parts.append(_part("silent", "silent.mp4", "video/mp4", silent_bytes))
    parts.append(_part("audio", "audio.mp3", "audio/mpeg", audio_bytes))
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts)


@router.post("/process-video")
async def process_video(video: UploadFile = File(...)) -> Response:
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a video")

    video_bytes = await video.read()
    if len(video_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Video file too large (max 200 MB)")

    uid = uuid.uuid4().hex
    tmp = Path(tempfile.gettempdir())
    input_path = tmp / f"input-{uid}.mp4"
    silent_path = tmp / f"silent-{uid}.mp4"
    audio_path = tmp / f"audio-{uid}.mp3"

    try:
        input_path.write_bytes(video_bytes)

        # Probe to detect audio stream and video dimensions
        try:
            probe = ffmpeg.probe(str(input_path))
            streams = probe.get("streams", [])
            has_audio = any(s.get("codec_type") == "audio" for s in streams)
            duration: float = float(probe.get("format", {}).get("duration", 10))
            vs = next((s for s in streams if s.get("codec_type") == "video"), {})
            video_width = int(vs.get("width", 0))
            video_height = int(vs.get("height", 0))
        except ffmpeg.Error:
            has_audio = False
            duration = 10.0
            video_width = 0
            video_height = 0

        # Run 1: strip audio → silent MP4
        try:
            (
                ffmpeg
                .input(str(input_path))
                .output(str(silent_path), an=None, vcodec="copy")
                .overwrite_output()
                .run(quiet=True)
            )
        except ffmpeg.Error as exc:
            raise HTTPException(status_code=500, detail=f"FFmpeg silent strip failed: {exc.stderr.decode() if exc.stderr else str(exc)}")

        # Run 2a: extract audio if present, else generate silence
        try:
            if has_audio:
                (
                    ffmpeg
                    .input(str(input_path))
                    .output(str(audio_path), vn=None, acodec="libmp3lame", audio_bitrate="128k")
                    .overwrite_output()
                    .run(quiet=True)
                )
            else:
                (
                    ffmpeg
                    .input("anullsrc=r=44100:cl=mono", format="lavfi", t=duration)
                    .output(str(audio_path), acodec="libmp3lame", audio_bitrate="64k")
                    .overwrite_output()
                    .run(quiet=True)
                )
        except ffmpeg.Error as exc:
            raise HTTPException(status_code=500, detail=f"FFmpeg audio extraction failed: {exc.stderr.decode() if exc.stderr else str(exc)}")

        silent_bytes = silent_path.read_bytes()
        audio_bytes = audio_path.read_bytes()

        suggested_text_color = get_suggested_text_color(str(input_path))

        boundary = f"boundary-{uid}"
        body = _build_multipart(silent_bytes, audio_bytes, boundary)

        return Response(
            content=body,
            media_type=f"multipart/form-data; boundary={boundary}",
            headers={
                "X-Has-Audio": "true" if has_audio else "false",
                "X-Video-Width": str(video_width),
                "X-Video-Height": str(video_height),
                "X-Suggested-Text-Color": suggested_text_color,
            },
        )

    finally:
        for p in [input_path, silent_path, audio_path]:
            p.unlink(missing_ok=True)
