'use client';

/**
 * Frame-accurate video frame extraction using FFmpeg.wasm.
 *
 * Strategy:
 * - Load FFmpeg.wasm once (singleton) and keep it alive.
 * - For each requested (videoFile, timestamp) pair, run:
 *     ffmpeg -ss <pts> -i input.mp4 -frames:v 1 -q:v 2 frame.jpg
 *   The `-ss` flag placed BEFORE `-i` uses fast keyframe seek, then
 *   FFmpeg decodes forward to the exact PTS — giving true frame accuracy.
 * - Return a blob URL for the extracted JPEG.
 * - Cache extracted frames by (fileId + frameNumber) to avoid re-extraction.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ─── Singleton FFmpeg instance ────────────────────────────────────────────────

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

export type FFmpegLoadState = 'idle' | 'loading' | 'ready' | 'error';

async function getFFmpeg(
    onProgress?: (ratio: number) => void
): Promise<FFmpeg> {
    if (ffmpegInstance?.loaded) return ffmpegInstance;

    if (!loadPromise) {
        const ff = new FFmpeg();

        if (onProgress) {
            ff.on('progress', ({ progress }) => onProgress(progress));
        }

        loadPromise = (async () => {
            // Use CDN-hosted WASM/JS so we don't need to copy files to /public
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
            await ff.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });
            ffmpegInstance = ff;
        })();
    }

    await loadPromise;
    return ffmpegInstance!;
}

// ─── Frame cache ──────────────────────────────────────────────────────────────

// key: `${videoFileId}:${frameNumber}`
const frameCache = new Map<string, string>(); // value: blob URL

// Track which video file is currently loaded in FFmpeg's virtual FS
let loadedVideoId: string | null = null;
const INPUT_NAME = 'input_video';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ExtractFrameOptions {
    /** The video File object */
    file: File;
    /** Unique ID for the video (used for caching) */
    fileId: string;
    /** Exact timestamp in seconds (should already be frame-snapped) */
    timestamp: number;
    /** Video frame rate (used to compute frame number for cache key) */
    fps: number;
    /** Optional progress callback for FFmpeg load (0–1) */
    onLoadProgress?: (ratio: number) => void;
}

export interface ExtractFrameResult {
    /** Blob URL of the extracted JPEG frame */
    url: string;
    /** The exact timestamp that was extracted */
    timestamp: number;
}

/**
 * Extract a single frame at the given timestamp using FFmpeg.wasm.
 * Returns a blob URL. The caller is responsible for revoking it when done.
 */
export async function extractFrame(
    opts: ExtractFrameOptions
): Promise<ExtractFrameResult> {
    const { file, fileId, timestamp, fps, onLoadProgress } = opts;

    // Round to nearest frame for cache key
    const frameNumber = Math.round(timestamp * fps);
    const cacheKey = `${fileId}:${frameNumber}`;

    if (frameCache.has(cacheKey)) {
        return { url: frameCache.get(cacheKey)!, timestamp };
    }

    const ff = await getFFmpeg(onLoadProgress);

    // Write video to FFmpeg virtual FS only if it changed
    if (loadedVideoId !== fileId) {
        // Clean up previous video if any
        if (loadedVideoId !== null) {
            try { await ff.deleteFile(INPUT_NAME); } catch { /* ignore */ }
        }
        await ff.writeFile(INPUT_NAME, await fetchFile(file));
        loadedVideoId = fileId;
    }

    const outputName = `frame_${frameNumber}.jpg`;

    // -ss before -i = fast keyframe seek, then decode forward to exact PTS
    // -frames:v 1 = extract exactly one frame
    // -q:v 2 = high quality JPEG (1=best, 31=worst)
    await ff.exec([
        '-ss', timestamp.toFixed(6),
        '-i', INPUT_NAME,
        '-frames:v', '1',
        '-q:v', '2',
        outputName,
    ]);

    const data = await ff.readFile(outputName);
    await ff.deleteFile(outputName);

    // FFmpeg returns Uint8Array backed by SharedArrayBuffer (due to COOP/COEP).
    // Blob constructor requires a plain ArrayBuffer — copy via slice into a new ArrayBuffer.
    let blobSource: ArrayBuffer;
    if (data instanceof Uint8Array) {
        // slice() on ArrayBufferLike always returns a plain ArrayBuffer copy
        blobSource = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    } else {
        blobSource = new TextEncoder().encode(data as string).buffer as ArrayBuffer;
    }
    const blob = new Blob([blobSource], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);

    frameCache.set(cacheKey, url);
    return { url, timestamp };
}

/**
 * Preload FFmpeg.wasm in the background.
 * Call this early (e.g. when the user enters the Edit Text step) so it's
 * ready by the time they need frame-accurate seeking.
 */
export async function preloadFFmpeg(onProgress?: (ratio: number) => void): Promise<void> {
    await getFFmpeg(onProgress);
}

/**
 * Check if FFmpeg is already loaded and ready.
 */
export function isFFmpegReady(): boolean {
    return ffmpegInstance?.loaded ?? false;
}

/**
 * Revoke all cached blob URLs and clear the cache.
 * Call this when the video changes or the component unmounts.
 */
export function clearFrameCache(): void {
    for (const url of frameCache.values()) {
        URL.revokeObjectURL(url);
    }
    frameCache.clear();
    loadedVideoId = null;
}
