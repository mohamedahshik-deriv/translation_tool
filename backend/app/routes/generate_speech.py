"""
POST /api/generate-speech

Calls the ElevenLabs Text-to-Speech API and returns raw audio/mpeg bytes.
Used by the Custom TTS pipeline in the Dub step.
"""

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, field_validator

from app.config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

LANGUAGE_MAP: dict[str, str] = {
    "EN": "en",
    "ES": "es",
    "PT": "pt",
    "AR": "ar",
    "FR": "fr",
}


class SpeechRequest(BaseModel):
    text: str
    voiceId: str
    languageCode: str = "EN"
    modelId: str = "eleven_multilingual_v2"

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be empty")
        return v


@router.post("/generate-speech")
@limiter.limit("30/minute")
async def generate_speech(request: Request, body: SpeechRequest) -> Response:
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")

    eleven_lang = LANGUAGE_MAP.get(body.languageCode.upper(), "en")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{body.voiceId}"

    payload: dict[str, Any] = {
        "text": body.text,
        "model_id": body.modelId,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.8,
            "style": 0.0,
            "use_speaker_boost": True,
        },
        "language_code": eleven_lang,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json=payload,
        )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"ElevenLabs TTS failed: {resp.text}",
        )

    return Response(
        content=resp.content,
        media_type="audio/mpeg",
        headers={"Content-Length": str(len(resp.content))},
    )
