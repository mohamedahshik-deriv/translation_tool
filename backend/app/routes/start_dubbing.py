"""
POST /api/start-dubbing

Forwards a video file + dubbing parameters to the ElevenLabs Dubbing API
and returns the dubbing job ID.
"""

from typing import Any

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

ELEVENLABS_DUBBING_URL = "https://api.elevenlabs.io/v1/dubbing"


@router.post("/start-dubbing")
@limiter.limit("10/minute")
async def start_dubbing(
    request: Request,
    file: UploadFile = File(...),
    target_lang: str = Form(...),
    source_lang: str = Form("en"),
    name: str = Form("POD Dubbing"),
) -> dict[str, Any]:
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")

    if not target_lang:
        raise HTTPException(status_code=400, detail="target_lang is required")

    file_bytes = await file.read()
    filename = file.filename or "video.mp4"
    content_type = file.content_type or "video/mp4"

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            ELEVENLABS_DUBBING_URL,
            headers={"xi-api-key": settings.elevenlabs_api_key},
            data={
                "target_lang": target_lang,
                "source_lang": source_lang,
                "name": name,
                "num_speakers": "0",
                "watermark": "false",
                "highest_resolution": "false",
            },
            files={"file": (filename, file_bytes, content_type)},
        )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"ElevenLabs dubbing failed: {resp.text}",
        )

    return resp.json()
