from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.routes import (
    process_video,
    export_video,
    translate_voiceover,
    start_dubbing,
    dubbing_status,
    dubbing_audio,
    generate_speech,
    analyze_scenes,
)

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="POD Translation Backend",
    description="Python FastAPI backend for video translation and dubbing automation",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# CORS — allow only the configured frontend origin(s)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-Has-Audio", "Content-Disposition", "X-Video-Width", "X-Video-Height", "X-Suggested-Text-Color", "X-Suggested-Outro-Text-Color"],
)

# ── API Router (/api prefix mirrors the Next.js route convention) ─────────────
app.include_router(process_video.router, prefix="/api")
app.include_router(export_video.router, prefix="/api")
app.include_router(translate_voiceover.router, prefix="/api")
app.include_router(start_dubbing.router, prefix="/api")
app.include_router(dubbing_status.router, prefix="/api")
app.include_router(dubbing_audio.router, prefix="/api")
app.include_router(generate_speech.router, prefix="/api")
app.include_router(analyze_scenes.router, prefix="/api")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": "An internal server error occurred"},
    )
