"""
POST /api/translate-voiceover

Translates voiceover / spoken script text using the DeepL API.
Used by the Custom TTS pipeline for single-language voiceover translation.
(Text overlay batch translation uses the Supabase `translate` Edge Function instead.)
"""

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator

from app.config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

DEEPL_LANG_MAP: dict[str, str] = {
    "EN": "EN",
    "ES": "ES",
    "PT": "PT-BR",
    "AR": "AR",
    "FR": "FR",
}

DEEPL_FREE_URL = "https://api-free.deepl.com/v2/translate"
DEEPL_PAID_URL = "https://api.deepl.com/v2/translate"


class TranslateRequest(BaseModel):
    texts: list[str]
    sourceLang: str
    targetLang: str

    @field_validator("texts")
    @classmethod
    def texts_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("texts must not be empty")
        return v


@router.post("/translate-voiceover")
@limiter.limit("30/minute")
async def translate_voiceover(request: Request, body: TranslateRequest) -> dict[str, Any]:
    if not settings.deepl_api_key:
        raise HTTPException(status_code=500, detail="DEEPL_API_KEY not configured")

    deepl_target = DEEPL_LANG_MAP.get(body.targetLang.upper(), body.targetLang.upper())
    deepl_source = DEEPL_LANG_MAP.get(body.sourceLang.upper(), body.sourceLang.upper()).split("-")[0]

    payload: dict[str, Any] = {
        "text": body.texts,
        "target_lang": deepl_target,
        "source_lang": deepl_source,
        "preserve_formatting": True,
        "context": (
            "Short marketing tagline or spoken script for a financial trading video. "
            "Translate concisely and directly."
        ),
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Try free API first, fall back to paid
        for url in [DEEPL_FREE_URL, DEEPL_PAID_URL]:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"DeepL-Auth-Key {settings.deepl_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code == 200:
                data = resp.json()
                translations = [t["text"] for t in data["translations"]]
                return {"translations": translations}

        raise HTTPException(
            status_code=resp.status_code,
            detail=f"DeepL translation failed: {resp.text}",
        )
