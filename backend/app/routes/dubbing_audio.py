"""
GET /api/get-dubbing-audio?dubbing_id=...&language_code=...

Fetches the dubbed audio file from ElevenLabs and streams it back to the client.
"""

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from app.config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/get-dubbing-audio")
@limiter.limit("30/minute")
async def get_dubbing_audio(
    request: Request,
    dubbing_id: str = Query(...),
    language_code: str = Query(...),
) -> Response:
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")

    url = f"https://api.elevenlabs.io/v1/dubbing/{dubbing_id}/audio/{language_code}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url, headers={"xi-api-key": settings.elevenlabs_api_key})

    if resp.status_code == 425:
        raise HTTPException(status_code=425, detail="Dubbing not ready yet")

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Failed to fetch dubbed audio: {resp.text}",
        )

    content_type = resp.headers.get("content-type", "application/octet-stream")
    return Response(
        content=resp.content,
        media_type=content_type,
        headers={"Content-Length": str(len(resp.content))},
    )
