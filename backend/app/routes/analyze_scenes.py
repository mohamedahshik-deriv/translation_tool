"""
POST /api/analyze-scenes

Local-backend replacement for the Supabase 'analyze-scenes' edge function.

Accepts the two pre-processed files that /api/process-video already
produced (silent MP4 + extracted audio MP3) as a multipart form upload,
then runs three parallel Gemini calls:

  Task 1 — scene cut detection      (silent video)
  Task 2 — audio transcription      (audio only)
  Task 3 — on-screen text detection (silent video)

Returns the same JSON shape as the Supabase edge function so the
frontend SceneAnalyzer component needs only a single URL swap.
"""

import asyncio
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import settings
from app.services.gemini_client import gemini_client

router = APIRouter()

MAX_VIDEO_BYTES = 200 * 1024 * 1024  # 200 MB
MAX_AUDIO_BYTES = 50 * 1024 * 1024   #  50 MB


# ── Response schema ────────────────────────────────────────────────────────────

class Scene(BaseModel):
    startTime: float
    endTime: float
    description: str
    spokenText: str
    textOnScreen: str


class AnalyzeScenesResponse(BaseModel):
    timecodes: list[float]
    scenes: list[Scene]
    hasVoiceover: bool


# ── Route ──────────────────────────────────────────────────────────────────────

@router.post("/analyze-scenes", response_model=AnalyzeScenesResponse)
async def analyze_scenes(
    silent: UploadFile = File(..., description="Silent MP4 (audio stripped)"),
    audio: UploadFile = File(..., description="Extracted audio MP3"),
    videoDuration: float = Form(..., description="Original video duration in seconds"),
) -> AnalyzeScenesResponse:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured on the server",
        )

    silent_bytes = await silent.read()
    audio_bytes = await audio.read()

    if len(silent_bytes) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="Silent video too large (max 200 MB)")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 50 MB)")

    try:
        # ── 1. Upload both files to Gemini in parallel ─────────────────────────
        silent_id, audio_id = await asyncio.gather(
            gemini_client.upload_file(silent_bytes, "video/mp4"),
            gemini_client.upload_file(audio_bytes, "audio/mpeg"),
        )

        # ── 2. Run three Gemini tasks in parallel ──────────────────────────────
        task1_prompt = f"""Analyze this {videoDuration}-second video and identify every scene change (cut).

For each scene provide:
- startTime: exact start timestamp in seconds (3 decimal places)
- endTime: exact end timestamp in seconds (3 decimal places)
- description: brief description of the visual content

Rules:
- First scene starts at 0.000, last scene ends at {videoDuration:.3f}
- Each scene must be at least 1 second long
- Timestamps must be chronological and contiguous

Respond ONLY with valid JSON:
{{"scenes": [{{"startTime": 0.0, "endTime": 5.0, "description": "..."}}]}}"""

        task2_prompt = f"""Listen to this audio (extracted from a {videoDuration}-second video) and transcribe all spoken speech.

For each spoken segment return:
- startTime: when speech starts (seconds, 3 decimal places)
- endTime: when speech ends (seconds, 3 decimal places)
- text: exact words spoken

Set hasVoiceover to true if ANY speech is detected, false if none.
If there is no speech, return hasVoiceover: false and an empty speechSegments array.

Respond ONLY with valid JSON:
{{"hasVoiceover": true, "speechSegments": [{{"startTime": 0.0, "endTime": 2.5, "text": "..."}}]}}"""

        task3_prompt = f"""Watch this {videoDuration}-second video and extract all text that appears VISUALLY on screen.

Include: titles, captions, lower-thirds, graphics, subtitles, text overlays, on-screen numbers.
Do NOT transcribe spoken audio — only read text that is visually displayed.

For each text element return:
- startTime: when text first appears (seconds, 3 decimal places)
- endTime: when text disappears (seconds, 3 decimal places)
- text: exact text as written on screen

If one word visually stands out (different color/size/boldness), wrap it as {{red:word}}.
If no text appears at all, return an empty textSegments array.

Respond ONLY with valid JSON:
{{"textSegments": [{{"startTime": 0.0, "endTime": 3.0, "text": "..."}}]}}"""

        raw1, raw2, raw3 = await asyncio.gather(
            gemini_client.complete_with_files(
                task1_prompt, [(silent_id, "video/mp4")], json_mode=True
            ),
            gemini_client.complete_with_files(
                task2_prompt, [(audio_id, "audio/mpeg")], json_mode=True
            ),
            gemini_client.complete_with_files(
                task3_prompt, [(silent_id, "video/mp4")], json_mode=True
            ),
        )

        data1 = _parse_json(raw1)
        data2 = _parse_json(raw2)
        data3 = _parse_json(raw3)

        # ── 3. Post-process scene boundaries ──────────────────────────────────
        raw_scenes = sorted(
            data1.get("scenes", []), key=lambda s: s.get("startTime", 0)
        )
        merged_base = _merge_scenes(raw_scenes, videoDuration)

        # ── 4. Aggregate speech and on-screen text per scene ──────────────────
        speech_segs: list[dict] = data2.get("speechSegments", [])
        text_segs: list[dict] = data3.get("textSegments", [])
        has_voiceover: bool = bool(data2.get("hasVoiceover", False))

        final_scenes: list[Scene] = []
        for scene in merged_base:
            s_start = scene["startTime"]
            s_end = scene["endTime"]

            spoken = " ".join(
                seg["text"].strip()
                for seg in speech_segs
                if seg.get("startTime", 0) >= s_start
                and seg.get("startTime", 0) < s_end
                and seg.get("text", "").strip()
            )

            raw_texts = [
                t["text"].strip()
                for t in text_segs
                if t.get("startTime", 0) < s_end
                and t.get("endTime", 0) > s_start
                and t.get("text", "").strip()
            ]
            unique_texts = [
                t for i, t in enumerate(raw_texts)
                if i == 0 or t != raw_texts[i - 1]
            ]

            final_scenes.append(Scene(
                startTime=s_start,
                endTime=s_end,
                description=scene.get("description", f"Scene {len(final_scenes) + 1}"),
                spokenText=spoken,
                textOnScreen=" | ".join(unique_texts),
            ))

        # Build unique sorted timecodes list
        tc_set = dict.fromkeys([0.0] + [s.endTime for s in final_scenes])
        timecodes = sorted(tc_set.keys())

        return AnalyzeScenesResponse(
            timecodes=timecodes,
            scenes=final_scenes,
            hasVoiceover=has_voiceover,
        )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Scene analysis failed: {exc}",
        ) from exc


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Parse JSON, stripping markdown code fences if the model added them."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # Strip opening fence (```json or ```) and closing fence (```)
        start = 1
        end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[start:end])
    return json.loads(text)


def _merge_scenes(
    raw: list[dict],
    duration: float,
    min_duration: float = 0.5,
) -> list[dict]:
    """
    Make scene boundaries contiguous and merge scenes that are too short
    (same logic as the original Supabase edge function).
    """
    if not raw:
        return [{"startTime": 0.0, "endTime": duration, "description": "Full video"}]

    # Step 1: make contiguous
    contiguous: list[dict] = []
    for i, scene in enumerate(raw):
        s = dict(scene)
        s["startTime"] = 0.0 if i == 0 else contiguous[-1]["endTime"]
        if s["endTime"] <= s["startTime"]:
            s["endTime"] = s["startTime"] + 0.5
        contiguous.append(s)
    contiguous[-1]["endTime"] = duration

    # Step 2: merge short scenes into the preceding one
    merged: list[dict] = []
    for scene in contiguous:
        dur = scene["endTime"] - scene["startTime"]
        if dur < min_duration and merged:
            merged[-1]["endTime"] = scene["endTime"]
        else:
            if merged:
                scene["startTime"] = merged[-1]["endTime"]
            merged.append(scene)

    # Step 3: re-align boundaries after merges
    for i in range(1, len(merged)):
        merged[i]["startTime"] = merged[i - 1]["endTime"]
    if merged:
        merged[0]["startTime"] = 0.0
        merged[-1]["endTime"] = duration

    return merged
