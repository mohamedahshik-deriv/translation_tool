"""
GET /api/get-dubbing-status?dubbing_id=...

Polls the ElevenLabs API for the status of a dubbing job.
"""

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from app.config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/get-dubbing-status")
@limiter.limit("60/minute")
async def get_dubbing_status(
    request: Request,
    dubbing_id: str = Query(..., description="ElevenLabs dubbing job ID"),
) -> dict[str, Any]:
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")

    url = f"https://api.elevenlabs.io/v1/dubbing/{dubbing_id}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers={"xi-api-key": settings.elevenlabs_api_key})

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"ElevenLabs status check failed: {resp.text}",
        )

    return resp.json()
