"""
POST /api/export-video

Accepts:
  - video  : original video file (multipart)
  - config : JSON string with ExportConfig
  - audio_0, audio_1, ... : per-scene dubbed audio blobs (optional)

For each scene:
  1. Renders text layers as transparent PNGs (Pillow)
  2. Processes scene with FFmpeg (trim + text overlay + audio)
Concatenates all scenes into a final MP4 and returns it.
"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import ffmpeg as ffmpeg_probe
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from app.services.text_render import TextLayerConfig, render_text_layer_to_png
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Per-scene and concat FFmpeg timeout (seconds)
SCENE_TIMEOUT = 600
CONCAT_TIMEOUT = 300
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


# ── Config dataclasses ────────────────────────────────────────────────────────

@dataclass
class TextLayerCfg:
    content: str
    positionX: float           # px in native video resolution
    positionY: float           # px in native video resolution
    positionAnchor: str        # 'top' | 'middle' | 'bottom'
    fontSize: int
    fontWeight: int
    color: str
    backgroundColor: Optional[str]
    animationType: str
    stayTillEnd: bool
    startTime: float
    endTime: float
    maxLines: int = 2          # 0 = unlimited (disclaimer)
    overlayFileKey: Optional[str] = None


@dataclass
class SceneCfg:
    index: int
    startTime: float
    endTime: float
    playbackRate: float
    hasAudio: bool
    textLayers: list[TextLayerCfg] = field(default_factory=list)


@dataclass
class ExportCfg:
    lang: str
    scenes: list[SceneCfg]
    videoWidth: int
    videoHeight: int
    fps: float
    videoHasAudio: bool


def _parse_config(raw: str) -> ExportCfg:
    d: dict[str, Any] = json.loads(raw)
    scenes = [
        SceneCfg(
            index=s["index"],
            startTime=s["startTime"],
            endTime=s["endTime"],
            playbackRate=s.get("playbackRate", 1.0),
            hasAudio=s.get("hasAudio", True),
            textLayers=[
                TextLayerCfg(
                    content=tl["content"],
                    positionX=tl["positionX"],
                    positionY=tl["positionY"],
                    positionAnchor=tl.get("positionAnchor", "middle"),
                    fontSize=tl["fontSize"],
                    fontWeight=tl.get("fontWeight", 800),
                    color=tl["color"],
                    backgroundColor=tl.get("backgroundColor"),
                    animationType=tl.get("animationType", "fade"),
                    stayTillEnd=tl.get("stayTillEnd", False),
                    startTime=tl["startTime"],
                    endTime=tl["endTime"],
                    maxLines=tl.get("maxLines", 2),
                    overlayFileKey=tl.get("overlayFileKey"),
                )
                for tl in s.get("textLayers", [])
            ],
        )
        for s in d["scenes"]
    ]
    return ExportCfg(
        lang=d["lang"],
        scenes=scenes,
        videoWidth=d["videoWidth"],
        videoHeight=d["videoHeight"],
        fps=d.get("fps", 30),
        videoHasAudio=d.get("videoHasAudio", True),
    )


# ── Async FFmpeg runner ───────────────────────────────────────────────────────

async def _run_ffmpeg(cmd_args: list[str], label: str, timeout: int) -> None:
    """Run FFmpeg as a non-blocking async subprocess with a timeout."""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", *cmd_args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise RuntimeError(f"{label} timed out after {timeout}s")

    if proc.returncode != 0:
        raise RuntimeError(f"{label} FFmpeg failed:\n{stderr.decode(errors='replace')}")


# ── Scene processing ──────────────────────────────────────────────────────────

async def _process_scene(
    *,
    video_path: str,
    audio_path: Optional[str],
    video_has_audio: bool,
    scene: SceneCfg,
    video_width: int,
    video_height: int,
    output_path: str,
    fps: float,
    work_dir: Path,
    overlay_paths_by_key: dict[str, str],
) -> None:
    scene_dur = scene.endTime - scene.startTime
    rate = max(0.5, min(2.0, scene.playbackRate))
    pts_factor = 1.0 / rate
    output_dur = scene_dur * pts_factor

    preroll = min(scene.startTime, 2.0)
    seek_pos = scene.startTime - preroll
    trim_start = preroll
    trim_end = preroll + scene_dur

    # Render each text layer as a transparent PNG (CPU-bound but fast)
    png_layers: list[tuple[str, TextLayerCfg]] = []
    for li, tl in enumerate(scene.textLayers):
        if tl.overlayFileKey and tl.overlayFileKey in overlay_paths_by_key:
            png_layers.append((overlay_paths_by_key[tl.overlayFileKey], tl))
            continue
        from app.services.text_render import strip_rich_markup
        plain = strip_rich_markup(tl.content or "").strip()
        if not plain:
            continue
        try:
            cfg = TextLayerConfig(
                content=tl.content,
                position_x=tl.positionX,
                position_y=tl.positionY,
                position_anchor=tl.positionAnchor,
                font_size=tl.fontSize,
                font_weight=tl.fontWeight,
                color=tl.color,
                background_color=tl.backgroundColor,
                start_time=tl.startTime,
                end_time=tl.endTime,
                max_lines=tl.maxLines,
            )
            png_bytes = render_text_layer_to_png(cfg, video_width, video_height)
            png_path = str(work_dir / f"txt_{scene.index}_{li}.png")
            Path(png_path).write_bytes(png_bytes)
            png_layers.append((png_path, tl))
        except Exception as exc:
            print(f"[export] text layer {li} render failed: {exc}")

    # Build filter_complex
    parts: list[str] = []

    audio_input_idx = -1
    if audio_path:
        audio_input_idx = 1

    png_start_idx = 2 if audio_path else 1

    # 1. Trim + speed
    parts.append(
        f"[0:v]trim=start={trim_start:.3f}:end={trim_end:.3f},"
        f"setpts=(PTS-STARTPTS)*{pts_factor}[trimmed]"
    )

    # 2. Chain PNG overlays with per-layer animation (fade / slide-up / slide-down).
    #    PNG inputs are looped at the scene framerate so their stream PTS advances
    #    with the main video — fade st= values therefore fire at the correct moment.
    #    Slide offset: ~4.2% of video height (≈ 80 px on 1920 h, 45 px on 1080 h).
    slide_px = round(video_height * 0.042)
    v_label = "trimmed"
    for i, (_, tl) in enumerate(png_layers):
        input_idx = png_start_idx + i
        next_label = f"vlayer{i}" if i < len(png_layers) - 1 else "vout"

        ST = tl.startTime
        ET = tl.endTime
        anim_type = (tl.animationType or "fade").lower()

        # Exit animation only when text has an explicit end before the scene ends.
        has_exit_anim = (not tl.stayTillEnd) and (ET < output_dur - 0.05) and (ET > ST + 1.0)

        # ── fade filter applied to the PNG stream ──────────────────────────────
        # 'none' → no fade, text pops on/off at enable boundaries.
        filtered_label = f"fltpng{i}"
        if anim_type == "none":
            parts.append(f"[{input_idx}:v]format=rgba[{filtered_label}]")
        else:
            fade_chain = f"format=rgba,fade=t=in:st={ST:.3f}:d=0.5:alpha=1"
            if has_exit_anim:
                fade_chain += f",fade=t=out:st={ET - 0.5:.3f}:d=0.5:alpha=1"
            parts.append(f"[{input_idx}:v]{fade_chain}[{filtered_label}]")

        # ── animated y expression for slide animations ─────────────────────────
        # t in overlay expressions is OUTPUT time, which aligns with startTime
        # because the main video PTS starts at 0 after setpts=(PTS-STARTPTS).
        y_expr = "0"
        if anim_type == "slide-up":
            # Enter: text rises from +slide_px below → final position
            enter = f"if(lt(t,{ST + 0.5:.3f}),round({slide_px}*(1-(t-{ST:.3f})/0.5))"
            if has_exit_anim:
                # Exit: text continues rising above final position
                y_expr = f"{enter},if(gt(t,{ET - 0.5:.3f}),round(-{slide_px}*((t-{ET - 0.5:.3f})/0.5)),0))"
            else:
                y_expr = f"{enter},0)"
        elif anim_type == "slide-down":
            # Enter: text drops from -slide_px above → final position
            enter = f"if(lt(t,{ST + 0.5:.3f}),round(-{slide_px}*(1-(t-{ST:.3f})/0.5))"
            if has_exit_anim:
                # Exit: text continues downward below final position
                y_expr = f"{enter},if(gt(t,{ET - 0.5:.3f}),round({slide_px}*((t-{ET - 0.5:.3f})/0.5)),0))"
            else:
                y_expr = f"{enter},0)"

        enable_expr = f"between(t,{ST:.3f},{ET:.3f})"
        parts.append(
            f"[{v_label}][{filtered_label}]overlay=x=0:y='{y_expr}':enable='{enable_expr}'[{next_label}]"
        )
        v_label = next_label

    video_out_label = "vout" if png_layers else "trimmed"

    # 3. Audio — use dubbed audio if available, otherwise silence.
    # Never extract [0:a] from the input video to prevent English audio leaking.
    if audio_path:
        audio_map = f"{audio_input_idx}:a"
        audio_filter_map = None
    else:
        parts.append(
            f"anullsrc=r=44100:cl=stereo,atrim=end={output_dur:.3f}[aout]"
        )
        audio_map = None
        audio_filter_map = "[aout]"

    filter_complex = "; ".join(parts)

    cmd_args = ["-y", "-ss", f"{seek_pos:.3f}", "-i", video_path]
    if audio_path:
        cmd_args += ["-i", audio_path]
    # PNG inputs: -loop 1 + -framerate gives each PNG a looping video stream
    # with proper PTS so the fade filter's st= parameter fires at the right time.
    for png_path, _ in png_layers:
        cmd_args += ["-loop", "1", "-framerate", str(int(fps)), "-i", png_path]
    cmd_args += ["-filter_complex", filter_complex]
    cmd_args += ["-map", f"[{video_out_label}]"]
    if audio_map:
        cmd_args += ["-map", audio_map]
    elif audio_filter_map:
        cmd_args += ["-map", audio_filter_map]
    cmd_args += [
        "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-r", str(fps),
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-t", f"{output_dur:.3f}",
        "-avoid_negative_ts", "make_zero",
        output_path,
    ]

    await _run_ffmpeg(cmd_args, f"Scene {scene.index}", SCENE_TIMEOUT)


async def _concatenate_scenes(scene_paths: list[str], output_path: str, fps: float) -> None:
    if len(scene_paths) == 1:
        shutil.copy2(scene_paths[0], output_path)
        return

    n = len(scene_paths)
    inputs_label = "".join(f"[{i}:v][{i}:a]" for i in range(n))
    filter_complex = f"{inputs_label}concat=n={n}:v=1:a=1[v][a]"

    cmd_args = ["-y"]
    for p in scene_paths:
        cmd_args += ["-i", p]
    cmd_args += [
        "-filter_complex", filter_complex,
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-r", str(fps),
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart",
        output_path,
    ]

    await _run_ffmpeg(cmd_args, "Concat", CONCAT_TIMEOUT)


# ── Route handler ─────────────────────────────────────────────────────────────

@router.post("/export-video")
@limiter.limit("5/minute")
async def export_video(
    request: Request,
    video: UploadFile = File(...),
    config: str = Form(...),
) -> Response:
    work_dir = Path(tempfile.gettempdir()) / f"export-{uuid.uuid4().hex}"
    work_dir.mkdir(parents=True, exist_ok=True)
    original_stem = Path(video.filename or "export").stem

    try:
        cfg = _parse_config(config)

        video_path = str(work_dir / "input.mp4")
        Path(video_path).write_bytes(await video.read())

        # Probe the actual video file for authoritative dimensions — ignore client-sent values
        try:
            probe = ffmpeg_probe.probe(video_path)
            vs = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), {})
            video_width = int(vs.get("width", cfg.videoWidth))
            video_height = int(vs.get("height", cfg.videoHeight))
        except Exception:
            video_width = cfg.videoWidth
            video_height = cfg.videoHeight
        print(f"[export-video] detected dimensions: {video_width}x{video_height}")

        # Collect per-scene audio blobs from the multipart form
        form = await request.form()
        audio_paths: dict[int, str] = {}
        overlay_paths_by_key: dict[str, str] = {}
        overlay_key_re = re.compile(r"^overlay_\d+_\d+$")
        for i in range(len(cfg.scenes)):
            key = f"audio_{i}"
            audio_file = form.get(key)
            if audio_file and hasattr(audio_file, "read"):
                audio_bytes = await audio_file.read()  # type: ignore[union-attr]
                p = str(work_dir / f"audio_{i}.mp3")
                Path(p).write_bytes(audio_bytes)
                audio_paths[i] = p
        for key, value in form.items():
            if not overlay_key_re.match(str(key)):
                continue
            if not hasattr(value, "read"):
                continue
            overlay_bytes = await value.read()  # type: ignore[union-attr]
            if len(overlay_bytes) > 8 * 1024 * 1024:
                raise HTTPException(status_code=400, detail=f"Overlay file too large: {key}")
            if not overlay_bytes.startswith(PNG_MAGIC):
                raise HTTPException(status_code=400, detail=f"Overlay file is not PNG: {key}")
            overlay_path = str(work_dir / f"{key}.png")
            Path(overlay_path).write_bytes(overlay_bytes)
            overlay_paths_by_key[str(key)] = overlay_path

        expected_overlay_keys = {
            tl.overlayFileKey
            for scene in cfg.scenes
            for tl in scene.textLayers
            if tl.overlayFileKey
        }
        missing_keys = sorted(k for k in expected_overlay_keys if k not in overlay_paths_by_key)
        if missing_keys:
            missing_preview = ", ".join(missing_keys[:5])
            extra = f" (+{len(missing_keys) - 5} more)" if len(missing_keys) > 5 else ""
            raise HTTPException(
                status_code=400,
                detail=f"Missing overlay files for export: {missing_preview}{extra}",
            )

        scene_paths: list[str] = []
        for i, scene in enumerate(cfg.scenes):
            scene_out = str(work_dir / f"scene_{i}.mp4")
            await _process_scene(
                video_path=video_path,
                audio_path=audio_paths.get(i),
                video_has_audio=cfg.videoHasAudio,
                scene=scene,
                video_width=video_width,
                video_height=video_height,
                output_path=scene_out,
                fps=cfg.fps,
                work_dir=work_dir,
                overlay_paths_by_key=overlay_paths_by_key,
            )
            scene_paths.append(scene_out)
            print(f"[export-video] scene {i + 1}/{len(cfg.scenes)} done")

        final_path = str(work_dir / f"final_{cfg.lang}.mp4")
        await _concatenate_scenes(scene_paths, final_path, cfg.fps)

        final_bytes = Path(final_path).read_bytes()
        return Response(
            content=final_bytes,
            media_type="video/mp4",
            headers={
                "Content-Disposition": f'attachment; filename="{original_stem}_{cfg.lang}.mp4"',
                "Content-Length": str(len(final_bytes)),
            },
        )

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid config JSON")
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}")
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
