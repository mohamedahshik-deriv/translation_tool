import React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

class StepErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    componentDidCatch(error: Error) { console.error('[StepErrorBoundary]', error); }
    render() {
        if (this.state.error) {
            return (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    <p className="font-bold mb-1">Render Error</p>
                    <pre className="text-xs whitespace-pre-wrap">{this.state.error.message}</pre>
                    <button
                        className="mt-2 px-3 py-1 rounded bg-red-500/20 text-red-300 text-xs"
                        onClick={() => this.setState({ error: null })}
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// Backend URL — set VITE_BACKEND_URL in .env.local for production
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:8000';
/** Prepend the backend host to a relative API path */
const api = (path: string) => `${BACKEND_URL}${path}`;
import { motion, AnimatePresence } from "framer-motion";
import {
    Upload, Scan, Type, Languages, Mic, Film, Download,
    ChevronDown, ChevronUp, Check, Lock, Loader2, Settings,
    ArrowRight, Plus, Trash2, Play, Pause, RotateCcw, Volume2, VolumeX,
    Scissors, GripVertical, Clock, FileText, X, BookOpen,
    SkipBack, SkipForward, CheckCircle2, AlertCircle, RefreshCw,
    ChevronRight, Settings2, Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/store/app-store";
import { AppStep, APP_STEPS, SUPPORTED_LANGUAGES, VideoSegment, Timecode, AnimationType, TextLayer, SAFE_ZONES, VideoResolution, POSITION_GRID, POSITION_CONSTRAINTS, GRID_ORDER, GRID_POSITION_LABELS, GridPosition } from "@/types";
import { cn } from "@/lib/utils";
import { extractScriptText, isValidScriptFile, formatFileSize, detectScriptFileType, extractDisclaimerFromScript } from "@/lib/script-parser";

// ============================================
// Step Section Component (Accordion Item)
// ============================================

interface StepSectionProps {
    stepId: AppStep;
    title: string;
    description: string;
    icon: React.ReactNode;
    isCompleted: boolean;
    isActive: boolean;
    isLocked: boolean;
    isExpanded: boolean;
    isProcessing?: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

function StepSection({
    stepId,
    title,
    description,
    icon,
    isCompleted,
    isActive,
    isLocked,
    isExpanded,
    isProcessing,
    onToggle,
    children
}: StepSectionProps) {
    return (
        <div
            className={cn(
                "rounded-xl border overflow-hidden transition-all duration-300",
                isActive && !isCompleted && "border-primary/50 bg-surface shadow-lg shadow-primary/5",
                isCompleted && "border-success/30 bg-success/5",
                isLocked && "border-border/50 bg-muted/10 opacity-50",
                !isActive && !isCompleted && !isLocked && "border-border bg-surface"
            )}
        >
            {/* Header */}
            <button
                onClick={onToggle}
                disabled={isLocked}
                className={cn(
                    "w-full flex items-center gap-4 p-4 text-left transition-colors",
                    !isLocked && "hover:bg-muted/20",
                    isLocked && "cursor-not-allowed"
                )}
            >
                {/* Status indicator */}
                <div
                    className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-all shrink-0",
                        isCompleted && "bg-success text-white",
                        isActive && !isCompleted && "bg-primary text-white",
                        isProcessing && "bg-primary text-white animate-pulse",
                        isLocked && "bg-muted text-muted-foreground",
                        !isActive && !isCompleted && !isLocked && "bg-muted text-muted-foreground"
                    )}
                >
                    {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isCompleted ? (
                        <Check className="w-4 h-4" />
                    ) : isLocked ? (
                        <Lock className="w-4 h-4" />
                    ) : (
                        icon
                    )}
                </div>

                {/* Title and description */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className={cn(
                            "font-semibold text-base",
                            isCompleted && "text-success",
                            isActive && !isCompleted && "text-foreground",
                            isLocked && "text-muted-foreground"
                        )}>
                            {title}
                        </h3>
                        {isCompleted && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success font-medium">
                                ✓ Done
                            </span>
                        )}
                        {isProcessing && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                                Processing...
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>

                {/* Expand icon */}
                {!isLocked && (
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-muted-foreground shrink-0"
                    >
                        <ChevronDown className="w-5 h-5" />
                    </motion.div>
                )}
            </button>

            {/* Content */}
            <AnimatePresence initial={false}>
                {isExpanded && !isLocked && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                        <div className="px-4 pb-4 border-t border-border/50">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================
// Step Content Components
// ============================================

function UploadStepContent() {
    const { video, setVideo, setSegments, setCutPoints, setCurrentStep, script, setScript, setShouldAutoAnalyze } = useAppStore();
    const [isDragging, setIsDragging] = useState(false);
    const [isScriptDragging, setIsScriptDragging] = useState(false);
    const [isParsingScript, setIsParsingScript] = useState(false);
    const [scriptError, setScriptError] = useState<string | null>(null);
    const [dummyResolution, setDummyResolution] = useState<VideoResolution>('1080x1920');

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('video/')) {
            await processVideo(file);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await processVideo(file);
        }
    };

    const processVideo = async (file: File) => {
        const objectUrl = URL.createObjectURL(file);

        // Detect frame rate by counting requestVideoFrameCallback calls over ~0.5s
        const detectFPS = (): Promise<number> => new Promise((resolve) => {
            const v = document.createElement('video');
            v.muted = true;
            v.preload = 'auto';
            v.src = objectUrl;

            // Fallback: resolve 30fps after 3s if detection stalls
            const fallbackTimer = setTimeout(() => resolve(30), 3000);

            v.oncanplay = () => {
                if (!('requestVideoFrameCallback' in v)) {
                    clearTimeout(fallbackTimer);
                    resolve(30); // browser doesn't support rVFC
                    return;
                }
                let frameCount = 0;
                let startTime = -1;
                const SAMPLE_DURATION = 0.5; // seconds to sample

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const countFrame = (_now: number, meta: any) => {
                    if (startTime < 0) startTime = meta.mediaTime as number;
                    frameCount++;
                    const elapsed = (meta.mediaTime as number) - startTime;
                    if (elapsed < SAMPLE_DURATION) {
                        (v as any).requestVideoFrameCallback(countFrame);
                    } else {
                        clearTimeout(fallbackTimer);
                        v.pause();
                        const detectedFPS = Math.round(frameCount / elapsed);
                        // Snap to common frame rates
                        const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
                        const snapped = common.reduce((a, b) => Math.abs(b - detectedFPS) < Math.abs(a - detectedFPS) ? b : a);
                        resolve(Math.round(snapped));
                    }
                };
                (v as any).requestVideoFrameCallback(countFrame);
                v.play().catch(() => { clearTimeout(fallbackTimer); resolve(30); });
            };
            v.onerror = () => { clearTimeout(fallbackTimer); resolve(30); };
        });

        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = async () => {
            const frameRate = await detectFPS();
            const videoFile = {
                id: `video-${Date.now()}`,
                file,
                url: objectUrl,
                name: file.name,
                size: file.size,
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
                frameRate,
                resolution: `${video.videoWidth}x${video.videoHeight}` as any,
            };
            setVideo(videoFile);
        };

        video.src = objectUrl;
    };

    const handleScriptDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsScriptDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            await processScript(file);
        }
    };

    const handleScriptFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await processScript(file);
        }
    };

    const processScript = async (file: File) => {
        setScriptError(null);

        if (!isValidScriptFile(file)) {
            setScriptError('Unsupported file type. Please upload a TXT, PDF, or DOCX file.');
            return;
        }

        setIsParsingScript(true);
        try {
            const extractedText = await extractScriptText(file);
            const fileType = detectScriptFileType(file)!;

            setScript({
                id: `script-${Date.now()}`,
                file,
                name: file.name,
                size: file.size,
                type: fileType,
                extractedText,
            });
        } catch (err) {
            setScriptError(err instanceof Error ? err.message : 'Failed to parse script file');
        } finally {
            setIsParsingScript(false);
        }
    };

    const handleUseDummyData = () => {
        const DUMMY_DURATION = 30;
        const [dummyWidth, dummyHeight] = dummyResolution.split('x').map(Number);
        const dummyFile = new File([''], 'dummy-video.mp4', { type: 'video/mp4' });
        // Use a blob URL so the <video> element doesn't try to load the current page
        const dummyUrl = URL.createObjectURL(dummyFile);
        const dummyVideo = {
            id: `video-dummy-${Date.now()}`,
            file: dummyFile,
            url: dummyUrl,
            name: 'dummy-video.mp4',
            size: 0,
            duration: DUMMY_DURATION,
            width: dummyWidth,
            height: dummyHeight,
            frameRate: 30,
            resolution: dummyResolution,
        };
        const timecodes = [0, 7.5, 15, 22.5, DUMMY_DURATION];
        const dummySegments: VideoSegment[] = timecodes.slice(0, -1).map((tc, i) => ({
            id: `segment-${i}`,
            videoId: dummyVideo.id,
            timecode: {
                id: `timecode-${i}`,
                startTime: tc,
                endTime: timecodes[i + 1],
                segmentIndex: i,
                description: `Scene ${i + 1}`,
            },
            textLayers: [],
        }));
        setVideo(dummyVideo);
        setCutPoints([7.5, 15, 22.5]);
        setSegments(dummySegments);
        setCurrentStep('edit-text');
    };

    return (
        <div className="pt-4 space-y-4">
            {/* Video Upload */}
            {video ? (
                <div className="flex items-center gap-4 p-3 rounded-lg bg-surface-elevated border border-border">
                    <video
                        src={video.url}
                        className="w-24 h-16 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{video.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {video.resolution} • {Math.floor(video.duration)}s • {(video.size / 1024 / 1024).toFixed(1)}MB
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVideo(null)}
                    >
                        Change
                    </Button>
                </div>
            ) : (
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={cn(
                        "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                        isDragging ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/50"
                    )}
                >
                    <input
                        type="file"
                        accept="video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="video-upload"
                    />
                    <label htmlFor="video-upload" className="cursor-pointer">
                        <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="font-medium mb-1">Drop your video here or click to browse</p>
                        <p className="text-sm text-muted-foreground">MP4, MOV, WebM • Max 50MB</p>
                    </label>
                </div>
            )}

            {/* Dev shortcut — skip upload & analysis */}
            {!video && (
                <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                    <p className="text-xs text-muted-foreground text-center font-medium">Use Dummy Data (Dev)</p>
                    <div className="grid grid-cols-4 gap-1.5">
                        {(['1080x1080', '1080x1350', '1080x1920', '1920x1080'] as VideoResolution[]).map((res) => (
                            <button
                                key={res}
                                type="button"
                                onClick={() => setDummyResolution(res)}
                                className={cn(
                                    "text-xs rounded-md px-2 py-1.5 border transition-colors",
                                    dummyResolution === res
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border text-muted-foreground hover:border-muted-foreground/50"
                                )}
                            >
                                {res}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={handleUseDummyData}
                        className="w-full text-xs text-primary border border-primary/40 rounded-md px-4 py-2 hover:bg-primary/10 transition-colors"
                    >
                        Load Dummy Data →
                    </button>
                </div>
            )}

            {/* Script Upload — Optional */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Script File</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Optional</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Upload a script with "Text on Screen" and "Voiceover" sections. AI will automatically match and populate text layers for each scene.
                </p>

                {script ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated border border-border">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                            <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{script.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {script.type.toUpperCase()} • {formatFileSize(script.size)} • {script.extractedText.length} chars extracted
                            </p>
                        </div>
                        <button
                            onClick={() => setScript(null)}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                            title="Remove script"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsScriptDragging(true); }}
                        onDragLeave={() => setIsScriptDragging(false)}
                        onDrop={handleScriptDrop}
                        className={cn(
                            "border-2 border-dashed rounded-xl p-5 text-center transition-all",
                            isScriptDragging ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/50",
                            isParsingScript && "opacity-60 pointer-events-none"
                        )}
                    >
                        <input
                            type="file"
                            accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                            onChange={handleScriptFileSelect}
                            className="hidden"
                            id="script-upload"
                            disabled={isParsingScript}
                        />
                        <label htmlFor="script-upload" className="cursor-pointer">
                            {isParsingScript ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin" />
                                    <p className="text-sm text-muted-foreground">Extracting text from script...</p>
                                </div>
                            ) : (
                                <>
                                    <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                    <p className="text-sm font-medium mb-1">Drop your script here or click to browse</p>
                                    <p className="text-xs text-muted-foreground">TXT, PDF, DOCX supported</p>
                                </>
                            )}
                        </label>
                    </div>
                )}

                {scriptError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                        <X className="w-3 h-3" />
                        {scriptError}
                    </p>
                )}
            </div>

            {/* Continue button — only show when video is uploaded */}
            {video && (
                <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => {
                        setShouldAutoAnalyze(true);
                        setCurrentStep('analyze');
                    }}
                >
                    {script ? 'Continue with Video & Script' : 'Continue with Video'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            )}
        </div>
    );
}

// Visual Timeline with cut points - Enhanced version
function SceneTimeline({
    duration,
    cutPoints,
    onAddCut,
    onRemoveCut,
    onMoveCut,
    currentTime,
    onSeek,
    onScrub,
    fps,
    transcripts,
    hasAudio,
}: {
    duration: number;
    cutPoints: number[];
    onAddCut: (time: number) => void;
    onRemoveCut: (index: number) => void;
    onMoveCut: (index: number, newTime: number) => void;
    currentTime: number;
    onSeek: (time: number) => void;
    onScrub?: (time: number | null) => void;
    fps?: number;
    transcripts?: string[];
    hasAudio?: boolean;
}) {
    const timelineRef = useRef<HTMLDivElement>(null);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [selectedCutIndex, setSelectedCutIndex] = useState<number | null>(null);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const FPS = fps ?? 30;
    const FRAME = 1 / FPS; // one frame at detected fps

    // Snap a time value to the nearest frame boundary
    const snapToFrame = useCallback((time: number) => {
        return Math.round(time * FPS) / FPS;
    }, [FPS]);

    const getTimeFromX = useCallback((clientX: number) => {
        const rect = timelineRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        return snapToFrame((x / rect.width) * duration);
    }, [duration, snapToFrame]);

    const handleTimelineClick = useCallback((e: React.MouseEvent) => {
        if (draggingIndex !== null) return;
        // Clicking the bare timeline deselects any selected cut and seeks
        setSelectedCutIndex(null);
        const time = getTimeFromX(e.clientX);
        onSeek(time);
    }, [getTimeFromX, onSeek, draggingIndex]);

    const handleTimelineDoubleClick = useCallback((e: React.MouseEvent) => {
        const time = getTimeFromX(e.clientX); // already snapped
        const tooClose = cutPoints.some(cp => Math.abs(cp - time) < 0.5);
        if (!tooClose && time > 0.5 && time < duration - 0.5) {
            onAddCut(time);
        }
    }, [getTimeFromX, cutPoints, duration, onAddCut]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const time = getTimeFromX(e.clientX); // already snapped
        setHoverTime(time);

        // Real-time scrubbing preview - update video position as user hovers/drags
        if (onScrub && (isScrubbing || draggingIndex !== null)) {
            onScrub(time);
        }

        if (draggingIndex !== null) {
            const minTime = draggingIndex === 0 ? 0.5 : cutPoints[draggingIndex - 1] + 0.5;
            const maxTime = draggingIndex === cutPoints.length - 1 ? duration - 0.5 : cutPoints[draggingIndex + 1] - 0.5;
            const clampedTime = Math.max(minTime, Math.min(maxTime, time));
            onMoveCut(draggingIndex, clampedTime);
        }
    }, [getTimeFromX, draggingIndex, cutPoints, duration, onMoveCut, onScrub, isScrubbing]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Start scrubbing on mouse down (not on cut handles)
        if (draggingIndex === null) {
            setIsScrubbing(true);
            const time = getTimeFromX(e.clientX);
            if (onScrub) onScrub(time);
        }
    }, [draggingIndex, getTimeFromX, onScrub]);

    const handleMouseUp = useCallback(() => {
        setDraggingIndex(null);
        setIsScrubbing(false);
        if (onScrub) onScrub(null); // Signal end of scrubbing
    }, [onScrub]);

    const handleMouseLeave = useCallback(() => {
        setHoverTime(null);
        if (draggingIndex === null && !isScrubbing) {
            // Only clear scrub if not actively dragging
        }
    }, [draggingIndex, isScrubbing]);

    // Global mouse up handler for drag/scrub release
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setDraggingIndex(null);
            setIsScrubbing(false);
            if (onScrub) onScrub(null);
        };
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (isScrubbing || draggingIndex !== null) {
                const time = getTimeFromX(e.clientX);
                setHoverTime(time);
                if (onScrub && isScrubbing) onScrub(time);
                if (draggingIndex !== null) {
                    const minTime = draggingIndex === 0 ? 0.5 : cutPoints[draggingIndex - 1] + 0.5;
                    const maxTime = draggingIndex === cutPoints.length - 1 ? duration - 0.5 : cutPoints[draggingIndex + 1] - 0.5;
                    const clampedTime = Math.max(minTime, Math.min(maxTime, time));
                    onMoveCut(draggingIndex, clampedTime);
                    if (onScrub) onScrub(clampedTime);
                }
            }
        };
        if (draggingIndex !== null || isScrubbing) {
            window.addEventListener('mouseup', handleGlobalMouseUp);
            window.addEventListener('mousemove', handleGlobalMouseMove);
            return () => {
                window.removeEventListener('mouseup', handleGlobalMouseUp);
                window.removeEventListener('mousemove', handleGlobalMouseMove);
            };
        }
    }, [draggingIndex, isScrubbing, onScrub, getTimeFromX, cutPoints, duration, onMoveCut]);

    // Convert seconds → HH:MM:SS.cs
    const formatTime = (s: number) => {
        const h  = Math.floor(s / 3600);
        const m  = Math.floor((s % 3600) / 60);
        const ss = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    // Shorter MM:SS label for ruler ticks
    const formatTimeShort = (s: number) => {
        const m  = Math.floor(s / 60);
        const ss = Math.floor(s % 60);
        return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };

    // Generate scene colors - more vibrant
    const sceneColors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
    const allCuts = [0, ...cutPoints, duration];

    // Generate second-based time markers so we get ~6-10 ticks across the timeline
    const niceSecondsIntervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const rawSecondsInterval = duration / 8;
    const tickInterval = niceSecondsIntervals.find(n => n >= rawSecondsInterval) ?? niceSecondsIntervals[niceSecondsIntervals.length - 1];
    const timeMarkers: number[] = [];
    for (let t = 0; t <= duration; t += tickInterval) {
        timeMarkers.push(t);
    }

    return (
        <div className="space-y-2 bg-surface-elevated rounded-xl p-4 border border-border">
            {/* Header with instructions */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Scene Timeline</span>
                    {hasAudio !== undefined && (
                        <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            hasAudio
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                        )}>
                            {hasAudio ? "Narrative timing" : "Scene timing"}
                        </span>
                    )}
                </div>
                <span className="text-xs text-muted-foreground">
                    Double-click to add cut • Drag handles to adjust
                </span>
            </div>

            {/* Time markers row */}
            <div className="relative h-5 mb-1">
                {timeMarkers.map((t) => (
                    <div
                        key={t}
                        className="absolute text-[10px] text-muted-foreground font-mono -translate-x-1/2"
                        style={{ left: `${(t / duration) * 100}%` }}
                    >
                        {formatTimeShort(t)}
                    </div>
                ))}
            </div>

            {/* Main timeline container */}
            <div
                ref={timelineRef}
                className={cn(
                    "relative h-20 rounded-xl overflow-visible cursor-crosshair select-none",
                    "border-2 border-border/50",
                    (draggingIndex !== null || isScrubbing) && "ring-2 ring-primary/50"
                )}
                onClick={handleTimelineClick}
                onDoubleClick={handleTimelineDoubleClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            >
                {/* Background grid lines */}
                <div className="absolute inset-0 pointer-events-none">
                    {timeMarkers.map((t) => (
                        <div
                            key={t}
                            className="absolute top-0 bottom-0 w-px bg-white/10"
                            style={{ left: `${(t / duration) * 100}%` }}
                        />
                    ))}
                </div>

                {/* Scene segments with colors */}
                {allCuts.slice(0, -1).map((start, i) => {
                    const end = allCuts[i + 1];
                    const left = (start / duration) * 100;
                    const width = ((end - start) / duration) * 100;
                    const sceneDuration = end - start;
                    return (
                        <div
                            key={i}
                            className="absolute top-0 bottom-0 flex flex-col items-center justify-center text-white transition-all hover:brightness-110"
                            style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                backgroundColor: sceneColors[i % sceneColors.length],
                            }}
                        >
                            <span className="text-sm font-bold drop-shadow-md">
                                {width > 6 ? `Scene ${i + 1}` : i + 1}
                            </span>
                            {width > 10 && (
                                <span className="text-xs opacity-80 font-mono">
                                    {sceneDuration.toFixed(1)}s
                                </span>
                            )}
                        </div>
                    );
                })}

                {/* Cut point markers (draggable + selectable) */}
                {cutPoints.map((cp, i) => {
                    const isSelected = selectedCutIndex === i;
                    const isDragging = draggingIndex === i;
                    const isActive = isSelected || isDragging;
                    return (
                        <div
                            key={`cut-${i}`}
                            className={cn(
                                "absolute top-0 bottom-0 cursor-col-resize z-10 group",
                                "w-6 -ml-3",
                                isDragging && "z-30",
                                isSelected && !isDragging && "z-20"
                            )}
                            style={{ left: `${(cp / duration) * 100}%` }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                setDraggingIndex(i);
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                // Toggle selection: click selects, click again deselects
                                setSelectedCutIndex(prev => prev === i ? null : i);
                                // Also seek to this cut point so the frame is visible
                                onSeek(cp);
                            }}
                        >
                            {/* Visible cut line */}
                            <div className={cn(
                                "absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 transition-all",
                                isDragging ? "bg-red-400 w-1.5" : isSelected ? "bg-yellow-400 w-1.5" : "bg-white/90"
                            )} />

                            {/* Top handle */}
                            <div className={cn(
                                "absolute -top-3 left-1/2 -translate-x-1/2 transition-all",
                                "w-8 h-8 rounded-lg shadow-xl flex items-center justify-center",
                                "border-2",
                                isDragging
                                    ? "bg-red-500 border-red-300 scale-110"
                                    : isSelected
                                        ? "bg-yellow-400 border-yellow-300 scale-110"
                                        : "bg-white border-red-500 hover:scale-110 hover:bg-red-50"
                            )}>
                                <Scissors className={cn(
                                    "w-4 h-4 transition-colors",
                                    isActive ? "text-white" : "text-red-500"
                                )} />
                            </div>

                            {/* Bottom handle */}
                            <div className={cn(
                                "absolute -bottom-3 left-1/2 -translate-x-1/2 transition-all",
                                "w-6 h-6 rounded-full shadow-lg flex items-center justify-center",
                                "border-2",
                                isDragging
                                    ? "bg-red-500 border-red-300 scale-110"
                                    : isSelected
                                        ? "bg-yellow-400 border-yellow-300 scale-110"
                                        : "bg-white border-red-500 hover:scale-110"
                            )}>
                                <GripVertical className={cn(
                                    "w-3 h-3",
                                    isActive ? "text-white" : "text-red-500"
                                )} />
                            </div>

                            {/* Time tooltip */}
                            <div className={cn(
                                "absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg whitespace-nowrap transition-opacity",
                                "bg-black text-white text-sm font-mono shadow-xl",
                                isDragging || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}>
                                {formatTime(cp)}
                            </div>
                        </div>
                    );
                })}

                {/* Current time indicator - playhead */}
                <div
                    className="absolute top-0 bottom-0 w-1 bg-yellow-400 z-20 pointer-events-none shadow-lg"
                    style={{ left: `${(currentTime / duration) * 100}%`, transform: 'translateX(-50%)' }}
                >
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-yellow-400 rounded-sm rotate-45" />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-yellow-400 rounded-sm rotate-45" />
                </div>

                {/* Hover indicator with time */}
                {hoverTime !== null && draggingIndex === null && (
                    <div
                        className="absolute top-0 bottom-0 w-px bg-white/60 pointer-events-none z-15"
                        style={{ left: `${(hoverTime / duration) * 100}%` }}
                    >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap font-mono">
                            {formatTime(hoverTime)}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom bar: cut-selected mode vs playhead mode */}
            <div className="flex justify-between items-center text-xs font-mono px-1 mt-1">
                {selectedCutIndex !== null && cutPoints[selectedCutIndex] !== undefined ? (
                    // ── Cut selected: nudge + delete controls ──
                    <>
                        <span className="text-yellow-400 font-medium text-[10px]">Cut {selectedCutIndex + 1} selected</span>
                        <div className="flex items-center gap-1">
                            {/* Prev frame */}
                            <button
                                type="button"
                                title="Move cut back 1 frame (1/30s)"
                                onClick={() => {
                                    const newTime = Math.max(0.5, cutPoints[selectedCutIndex] - FRAME);
                                    onMoveCut(selectedCutIndex, newTime);
                                    onSeek(newTime);
                                }}
                                className="flex items-center justify-center w-6 h-6 rounded hover:bg-yellow-400/20 transition-colors text-yellow-400"
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                    <rect x="1" y="2" width="2" height="8" rx="0.5" />
                                    <path d="M10 2L4 6l6 4V2z" />
                                </svg>
                            </button>
                            <Scissors className="w-3 h-3 text-yellow-400" />
                            <span className="font-medium mx-1 text-yellow-400">{formatTime(cutPoints[selectedCutIndex])}</span>
                            {/* Next frame */}
                            <button
                                type="button"
                                title="Move cut forward 1 frame (1/30s)"
                                onClick={() => {
                                    const newTime = Math.min(duration - 0.5, cutPoints[selectedCutIndex] + FRAME);
                                    onMoveCut(selectedCutIndex, newTime);
                                    onSeek(newTime);
                                }}
                                className="flex items-center justify-center w-6 h-6 rounded hover:bg-yellow-400/20 transition-colors text-yellow-400"
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                    <rect x="9" y="2" width="2" height="8" rx="0.5" />
                                    <path d="M2 2l6 4-6 4V2z" />
                                </svg>
                            </button>
                            {/* Delete cut */}
                            <button
                                type="button"
                                title="Delete this cut"
                                onClick={() => {
                                    onRemoveCut(selectedCutIndex);
                                    setSelectedCutIndex(null);
                                }}
                                className="flex items-center justify-center w-6 h-6 rounded hover:bg-red-500/20 transition-colors text-red-400 ml-1"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedCutIndex(null)}
                            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Deselect
                        </button>
                    </>
                ) : (
                    // ── No cut selected: playhead frame controls ──
                    <>
                        <span className="text-muted-foreground">00:00:00.00</span>
                        <div className="flex items-center gap-1 text-primary">
                            <button
                                type="button"
                                title="Previous frame (1/30s)"
                                onClick={() => onSeek(Math.max(0, currentTime - FRAME))}
                                className="flex items-center justify-center w-6 h-6 rounded hover:bg-primary/20 transition-colors text-primary disabled:opacity-30"
                                disabled={currentTime <= 0}
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                    <rect x="1" y="2" width="2" height="8" rx="0.5" />
                                    <path d="M10 2L4 6l6 4V2z" />
                                </svg>
                            </button>
                            <Clock className="w-3 h-3 ml-1" />
                            <span className="font-medium mx-1">{formatTime(currentTime)}</span>
                            <button
                                type="button"
                                title="Next frame (1/30s)"
                                onClick={() => onSeek(Math.min(duration, currentTime + FRAME))}
                                className="flex items-center justify-center w-6 h-6 rounded hover:bg-primary/20 transition-colors text-primary disabled:opacity-30"
                                disabled={currentTime >= duration}
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                    <rect x="9" y="2" width="2" height="8" rx="0.5" />
                                    <path d="M2 2l6 4-6 4V2z" />
                                </svg>
                            </button>
                        </div>
                        <span className="text-muted-foreground">{formatTime(duration)} ({duration.toFixed(1)}s)</span>
                    </>
                )}
            </div>

            {/* Scene table */}
            {allCuts.length > 1 && (
                <div className="mt-3 rounded-lg border border-border overflow-hidden text-xs font-mono">
                    <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '40px' }} />
                            <col style={{ width: '100px' }} />
                            <col style={{ width: '100px' }} />
                            <col style={{ width: '50px' }} />
                            <col />
                        </colgroup>
                        <thead>
                            <tr className="bg-surface text-muted-foreground">
                                <th className="py-1.5 px-3 text-left font-medium">#</th>
                                <th className="py-1.5 px-3 text-left font-medium">In</th>
                                <th className="py-1.5 px-3 text-left font-medium">Out</th>
                                <th className="py-1.5 px-3 text-right font-medium">Dur</th>
                                <th className="py-1.5 px-3 text-left font-medium font-sans">Transcript</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allCuts.slice(0, -1).map((start, i) => {
                                const end = allCuts[i + 1];
                                const dur = end - start;
                                const isActive = currentTime >= start && currentTime < end;
                                const transcript = transcripts?.[i] || '';
                                return (
                                    <tr
                                        key={i}
                                        onClick={() => onSeek(start)}
                                        className={cn(
                                            "cursor-pointer border-t border-border transition-colors",
                                            isActive
                                                ? "bg-primary/20 text-primary"
                                                : "hover:bg-surface-elevated text-foreground"
                                        )}
                                    >
                                        <td className="py-1 px-3">
                                            <span className={cn("font-bold", isActive && "text-primary")}>
                                                {isActive ? "▶" : " "} {i + 1}
                                            </span>
                                        </td>
                                        <td className="py-1 px-3 truncate">{formatTime(start)}</td>
                                        <td className="py-1 px-3 truncate">{formatTime(end)}</td>
                                        <td className="py-1 px-3 text-right text-muted-foreground">{dur.toFixed(1)}s</td>
                                        <td className="py-1 px-3 font-sans overflow-hidden">
                                            <span className="line-clamp-1">{transcript || <span className="text-muted-foreground italic">—</span>}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function AnalyzeStepContent() {
    const { video, segments, setSegments, setCurrentStep, isAnalyzing, setIsAnalyzing, script, setScriptEntries, updateScriptEntry, setScriptAutoPopulated, shouldAutoAnalyze, setShouldAutoAnalyze, setOutroConfig, videoHasAudio, setVideoHasAudio, setSuggestedTextColor, setSuggestedOutroTextColor, detectedVoiceoverLanguage, setDetectedVoiceoverLanguage, setOutroSegment, setManualOutroId, scriptEntries, cutPoints, setCutPoints } = useAppStore();
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [detectedVoiceover, setDetectedVoiceover] = useState<boolean | null>(null); // null = not analyzed yet
    const [previewingScene, setPreviewingScene] = useState<number | null>(null);
    const videoPreviewRef = useRef<HTMLVideoElement>(null);
    const wasPlayingBeforeScrub = useRef(false);
    const removedCutRef = useRef<number | null>(null);
    const analysisStartedRef = useRef(false);

    const duration = video?.duration ?? 0;
    const FPS = video?.frameRate ?? 30;

    // Snap a time value to the nearest frame boundary
    const snapToFrame = useCallback((time: number) => {
        return Math.round(time * FPS) / FPS;
    }, [FPS]);

    // Build segments from cut points — preserves existing text layers at matching indices
    const buildSegments = useCallback((cuts: number[]) => {
        if (!video) return;
        const allPoints = [0, ...cuts.sort((a, b) => a - b), duration];
        const existingSegments = useAppStore.getState().segments;
        const manualOutroId = useAppStore.getState().manualOutroId;
        const newSegments: VideoSegment[] = [];

        // When a cut was removed, existingSegments has one more entry than allPoints-1.
        // removedCutRef tells us which cut index was removed so we can merge layers.
        const mergeAtIdx = removedCutRef.current;
        if (mergeAtIdx !== null) removedCutRef.current = null;

        for (let i = 0; i < allPoints.length - 1; i++) {
            const segId = `segment-${i}`;
            // Preserve text layers from the same index if they exist.
            // If a cut was removed at mergeAtIdx, the new segment at mergeAtIdx also
            // absorbs the layers from the old segment at mergeAtIdx+1.
            let existingLayers = existingSegments[i]?.textLayers ?? [];
            if (mergeAtIdx !== null && i === mergeAtIdx && existingSegments[mergeAtIdx + 1]?.textLayers?.length) {
                const absorbedLayers = existingSegments[mergeAtIdx + 1].textLayers.map(l => ({ ...l, segmentId: segId }));
                existingLayers = [...existingLayers, ...absorbedLayers];
            }
            // If user manually picked an outro, honour it; otherwise default to last segment
            const isOutro = manualOutroId
                ? segId === manualOutroId
                : i === allPoints.length - 2;
            newSegments.push({
                id: segId,
                videoId: video.id,
                timecode: {
                    id: `tc-${i}`,
                    startTime: allPoints[i],
                    endTime: allPoints[i + 1],
                    segmentIndex: i,
                    description: `Scene ${i + 1}`,
                },
                textLayers: existingLayers,
                isOutro,
            });
        }

        setSegments(newSegments);
    }, [video, duration, setSegments]);

    // Update segments whenever cut points change
    useEffect(() => {
        if (cutPoints.length > 0 || segments.length > 0) {
            buildSegments(cutPoints);
        }
    }, [cutPoints]);

    const handleAddCut = useCallback((time: number) => {
        const prevCuts = useAppStore.getState().cutPoints;
        const sorted = [...prevCuts, time].sort((a, b) => a - b);
        const insertedIndex = sorted.indexOf(time);
        setCutPoints(sorted);

        const entries = [...useAppStore.getState().scriptEntries];
        if (entries.length > 0) {
            const splitIdx = insertedIndex;
            const original = entries[splitIdx];
            if (original) {
                const newEntry = {
                    sceneIndex: splitIdx + 1,
                    voiceover: '',
                    textOnScreen: '',
                    disclaimer: '',
                    suggestedPosition: original.suggestedPosition ?? ('bottom' as const),
                    suggestedFontSize: original.suggestedFontSize ?? ('medium' as const),
                };
                entries.splice(splitIdx + 1, 0, newEntry);
                for (let i = splitIdx + 1; i < entries.length; i++) {
                    entries[i] = { ...entries[i], sceneIndex: i };
                }
            } else {
                entries.splice(splitIdx + 1, 0, {
                    sceneIndex: splitIdx + 1,
                    voiceover: '',
                    textOnScreen: '',
                    disclaimer: '',
                    suggestedPosition: 'bottom' as const,
                    suggestedFontSize: 'medium' as const,
                });
            }
            setScriptEntries(entries);
        }
    }, [setScriptEntries]);

    const handleRemoveCut = useCallback((index: number) => {
        // Store which cut is being removed so buildSegments can merge layers correctly
        removedCutRef.current = index;
        // Remove the cut point
        setCutPoints(prev => prev.filter((_, i) => i !== index));

        // Merge scriptEntries for the two scenes that are combining:
        // cut[index] sits between scene[index] and scene[index+1]
        const entries = [...useAppStore.getState().scriptEntries];
        const a = entries[index];
        const b = entries[index + 1];
        if (a || b) {
            entries[index] = {
                sceneIndex: index,
                voiceover: [a?.voiceover, b?.voiceover].filter(Boolean).join(' '),
                textOnScreen: [a?.textOnScreen, b?.textOnScreen].filter(Boolean).join(' '),
                disclaimer: a?.disclaimer || b?.disclaimer || '',
                suggestedPosition: a?.suggestedPosition ?? 'bottom',
                suggestedFontSize: a?.suggestedFontSize ?? 'medium',
            };
            entries.splice(index + 1, 1);
            // Re-index sceneIndex for all entries after the merge
            for (let i = index; i < entries.length; i++) {
                entries[i] = { ...entries[i], sceneIndex: i };
            }
            setScriptEntries(entries);
        }
    }, [setScriptEntries]);

    const handleMoveCut = useCallback((index: number, newTime: number) => {
        setCutPoints(prev => {
            const updated = [...prev];
            updated[index] = newTime;
            return updated;
        });
    }, []);

    const handleSeek = useCallback((time: number) => {
        setCurrentTime(time);
        if (videoPreviewRef.current) {
            videoPreviewRef.current.currentTime = time;
        }
    }, []);

    // Real-time scrubbing: update video frame as user drags on timeline
    const handleScrub = useCallback((time: number | null) => {
        const v = videoPreviewRef.current;
        if (!v) return;

        if (time === null) {
            // Scrub ended - resume playback if it was playing before
            if (wasPlayingBeforeScrub.current) {
                v.play();
                wasPlayingBeforeScrub.current = false;
            }
            return;
        }

        // Pause video during scrubbing for smooth frame preview
        if (!v.paused) {
            wasPlayingBeforeScrub.current = true;
            v.pause();
        }

        // Update video position in real-time
        v.currentTime = time;
        setCurrentTime(time);
    }, []);

    const handleAddCutAtCurrentTime = useCallback(() => {
        const snapped = snapToFrame(currentTime);
        if (snapped > 0.5 && snapped < duration - 0.5) {
            const tooClose = cutPoints.some(cp => Math.abs(cp - snapped) < 0.5);
            if (!tooClose) {
                handleAddCut(snapped);
            }
        }
    }, [currentTime, duration, cutPoints, handleAddCut, snapToFrame]);

    const startAnalysis = async () => {
        if (!video) return;

        setIsAnalyzing(true);
        setProgress(0);
        setDetectedVoiceover(null);
        setDetectedVoiceoverLanguage(null);

        try {
            setProgress(5);
            const { uploadVideo, getPublicUrl, STORAGE_BUCKETS, analyzeScenes, matchScriptToScenes, isSupabaseConfigured } = await import("@/lib/supabase");
            const { sessionId } = useAppStore.getState();

            if (!isSupabaseConfigured()) {
                throw new Error("Supabase is not configured. Please set up your .env.local file.");
            }

            // Step 1: Process video locally — strip audio (silent MP4) and extract audio (MP3)
            console.log("Processing video locally (stripping audio / extracting audio)...");
            setProgress(10);
            const processForm = new FormData();
            processForm.append('video', video.file);
            const processResp = await fetch(api('/api/process-video'), { method: 'POST', body: processForm });
            if (!processResp.ok) {
                const errText = await processResp.text();
                throw new Error(`Video processing failed: ${errText}`);
            }
            // Read whether the original video has audio (set by ffprobe in the API route)
            const videoHasAudio = processResp.headers.get('X-Has-Audio') === 'true';
            setVideoHasAudio(videoHasAudio);
            const suggestedColor = processResp.headers.get('X-Suggested-Text-Color');
            if (suggestedColor) setSuggestedTextColor(suggestedColor);
            const suggestedOutroColor = processResp.headers.get('X-Suggested-Outro-Text-Color');
            if (suggestedOutroColor) setSuggestedOutroTextColor(suggestedOutroColor);
            console.log(`[process-video] videoHasAudio: ${videoHasAudio}, suggestedTextColor: ${suggestedColor ?? 'not set'}, suggestedOutroTextColor: ${suggestedOutroColor ?? 'not set'}`);
            // Parse multipart response to get silent video + audio blobs
            const processedFormData = await processResp.formData();
            const silentBlob = processedFormData.get('silent') as File | null;
            const audioBlob = processedFormData.get('audio') as File | null;
            if (!silentBlob || !audioBlob) {
                throw new Error('Video processing returned incomplete data');
            }
            const silentFile = new File([silentBlob], 'silent.mp4', { type: 'video/mp4' });
            const audioFile = new File([audioBlob], 'audio.mp3', { type: 'audio/mpeg' });
            console.log(`Silent video: ${(silentFile.size / 1024 / 1024).toFixed(2)} MB, Audio: ${(audioFile.size / 1024).toFixed(0)} KB`);
            setProgress(20);

            // Step 2: Upload both processed files + original to Supabase in parallel
            console.log("Uploading processed files to Supabase Storage...");
            const { uploadExtractedAudio } = await import("@/lib/supabase");
            const [silentPath, audioPath, originalPath] = await Promise.all([
                uploadVideo(silentFile, sessionId),
                uploadExtractedAudio(audioFile, sessionId),
                uploadVideo(video.file, sessionId),
            ]);

            const videoUrl = getPublicUrl(STORAGE_BUCKETS.VIDEOS, silentPath);
            const audioUrl = getPublicUrl(STORAGE_BUCKETS.AUDIO, audioPath);
            const originalVideoUrl = getPublicUrl(STORAGE_BUCKETS.VIDEOS, originalPath);
            console.log("Silent video URL (as videoUrl):", videoUrl);
            console.log("Audio URL:", audioUrl);
            console.log("Original video URL:", originalVideoUrl);
            setProgress(30);

            if (script) {
                // Attempt structured table parsing for DOCX files first
                let tableRows: import('@/types').ScriptTableRow[] | null = null;
                if (script.type === 'docx') {
                    const { parseDocxTable } = await import('@/lib/script-parser');
                    tableRows = await parseDocxTable(script.file);
                    if (tableRows) {
                        console.log(`[DOCX Table] Parsed ${tableRows.length} rows directly from table columns.`);
                    } else {
                        console.log('[DOCX Table] No structured table found, falling back to AI script matching.');
                    }
                }

                if (tableRows) {
                    // We have structured table data — use analyzeScenes just for timing/cut points,
                    // then overlay table row data (voiceover + textOnScreen) by scene order.
                    console.log("Using structured table data. Running scene detection for timing...");
                    const sceneResult = await analyzeScenes(videoUrl, audioUrl, video.duration, videoHasAudio, undefined, originalVideoUrl);
                    setProgress(80);

                    if (sceneResult.detectedLanguage) {
                        setDetectedVoiceoverLanguage({
                            code: sceneResult.detectedLanguage,
                            name: sceneResult.detectedLanguageName || sceneResult.detectedLanguage,
                        });
                    } else {
                        setDetectedVoiceoverLanguage(null);
                    }

                    // TODO: remove debug logging
                    console.log('\n===== [analyzeScenes/DOCX] Supabase response =====');
                    console.log('timecodes:', sceneResult.timecodes);
                    console.log('scenes:', JSON.stringify(sceneResult.scenes, null, 2));
                    console.log('===================================================\n');

                    _scriptAutoPopulateLock = false;
                    setScriptAutoPopulated(false);

                    const aiCutPoints = sceneResult.scenes.slice(0, -1).map((s: { endTime: number }) => snapToFrame(s.endTime));
                    setManualOutroId(null);
                    setCutPoints(aiCutPoints);

                    // Map table rows → script entries by index (row N → scene N)
                    const sceneCount = sceneResult.scenes.length;
                    const entries = Array.from({ length: sceneCount }, (_, i) => {
                        const row = tableRows![i] ?? { voiceover: '', textOnScreen: '', visual: '' };
                        return {
                            sceneIndex: i,
                            textOnScreen: row.textOnScreen,
                            voiceover: row.voiceover,
                            disclaimer: i === sceneCount - 1 ? stripDisclaimerPrefix(extractDisclaimerFromScript(script.extractedText)) : '',
                            suggestedPosition: 'bottom' as const,
                            suggestedFontSize: 'medium' as const,
                        };
                    });
                    setScriptEntries(entries);
                    console.log(`[DOCX Table] Stored ${entries.length} script entries from structured table.`);
                    entries.forEach((e, i) => {
                        console.log(`[ScriptEntry ${i}] voiceover="${e.voiceover.slice(0, 60)}" textOnScreen="${e.textOnScreen.slice(0, 60)}"`);
                    });

                    const clientDisclaimer = stripDisclaimerPrefix(extractDisclaimerFromScript(script.extractedText));
                    if (clientDisclaimer) {
                        setOutroConfig({ disclaimerText: clientDisclaimer });
                        console.log(`[Disclaimer] Auto-filled from script text: "${clientDisclaimer.slice(0, 80)}..."`);
                    }
                } else {
                    // Use script-matching edge function when script is available
                    console.log("Calling match-script-to-scenes Edge Function with script...");
                    const result = await matchScriptToScenes(originalVideoUrl, video.duration, script.extractedText);
                    console.log("Script match result:", JSON.stringify(result));
                    setProgress(80);

                    // Reset auto-populate guards so EditTextStep re-populates with fresh AI data
                    _scriptAutoPopulateLock = false;
                    setScriptAutoPopulated(false);

                    // With audio: use narrativeEnd so cuts align with speech boundaries.
                    // Without audio: use visual endTime (no narrative to align to).
                    const aiCutPoints = result.scenes.slice(0, -1).map(s => {
                        const t = (videoHasAudio && s.narrativeEnd && s.narrativeEnd > 0)
                            ? s.narrativeEnd
                            : s.endTime;
                        return snapToFrame(t);
                    }).sort((a, b) => a - b).filter((t, i, arr) => i === 0 || t !== arr[i - 1]);
                    setManualOutroId(null);
                    setCutPoints(aiCutPoints);

                    // Store script entries for auto-populating text layers
                    const entries = result.scenes.map((scene, i) => ({
                        sceneIndex: i,
                        textOnScreen: scene.textOnScreen || '',
                        voiceover: scene.voiceover || '',
                        disclaimer: stripDisclaimerPrefix(scene.disclaimer || ''),
                        suggestedPosition: (scene.suggestedPosition || 'bottom') as 'top' | 'center' | 'bottom',
                        suggestedFontSize: 'medium' as 'small' | 'medium' | 'large',
                    }));
                    setScriptEntries(entries);
                    console.log(`Stored ${entries.length} script entries for text layer auto-population`);
                    entries.forEach((e, i) => {
                        console.log(`[ScriptEntry ${i}] textOnScreen="${e.textOnScreen}" disclaimer="${e.disclaimer.slice(0, 60)}"`);
                    });

                    // Auto-fill outroConfig.disclaimerText
                    const lastEntry = entries[entries.length - 1];
                    const aiDisclaimer = lastEntry?.disclaimer || '';
                    const rawClientDisclaimer = aiDisclaimer || extractDisclaimerFromScript(script.extractedText);
                    const clientDisclaimer = stripDisclaimerPrefix(rawClientDisclaimer);
                    if (clientDisclaimer) {
                        setOutroConfig({ disclaimerText: clientDisclaimer });
                        console.log(`[Disclaimer] Auto-filled outroConfig.disclaimerText (${aiDisclaimer ? 'from AI' : 'from client fallback'}): "${clientDisclaimer.slice(0, 80)}..."`);
                    } else {
                        console.log('[Disclaimer] No disclaimer found in AI response or script text');
                    }
                }
            } else {
                // Use standard scene analysis: silent video for visual tasks, audio file for transcription
                const result = await analyzeScenes(videoUrl, audioUrl, video.duration, videoHasAudio, undefined, originalVideoUrl);
                setProgress(80);

                // TODO: remove debug logging
                console.log('\n===== [analyzeScenes] Supabase response =====');
                console.log('hasVoiceover:', result.hasVoiceover);
                console.log('timecodes:', result.timecodes);
                console.log('scenes:', JSON.stringify(result.scenes, null, 2));
                console.log('=============================================\n');

                // Track whether voiceover was detected
                setDetectedVoiceover(result.hasVoiceover === true);

                if (result.detectedLanguage) {
                    setDetectedVoiceoverLanguage({
                        code: result.detectedLanguage,
                        name: result.detectedLanguageName || result.detectedLanguage,
                    });
                } else {
                    setDetectedVoiceoverLanguage(null);
                }

                // With audio: use narrativeEnd so cuts align with speech boundaries.
                // Without audio: use visual endTime (no narrative to align to).
                const aiCutPoints = result.scenes.slice(0, -1).map((s: { endTime: number; narrativeEnd?: number }) => {
                    const t = (videoHasAudio && s.narrativeEnd && s.narrativeEnd > 0)
                        ? s.narrativeEnd
                        : s.endTime;
                    return snapToFrame(t);
                }).sort((a: number, b: number) => a - b).filter((t: number, i: number, arr: number[]) => i === 0 || t !== arr[i - 1]);
                setManualOutroId(null);
                setCutPoints(aiCutPoints);

                // Reset auto-populate guards so EditTextStep can populate with AI-detected text
                _scriptAutoPopulateLock = false;
                setScriptAutoPopulated(false);

                // Build script entries from detected voiceover/on-screen text
                // Use spokenText as voiceover, textOnScreen as the overlay text
                const entries = result.scenes.map((scene: { spokenText?: string; textOnScreen?: string }, i: number) => ({
                    sceneIndex: i,
                    textOnScreen: scene.textOnScreen || '',
                    voiceover: scene.spokenText || '',
                    disclaimer: '',
                    suggestedPosition: 'top' as const,
                    suggestedFontSize: 'medium' as const,
                }));
                setScriptEntries(entries);
            }

            setProgress(100);
        } catch (err) {
            console.error('Analysis failed:', err);
            alert(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsAnalyzing(false);
            analysisStartedRef.current = false;
        }
    };

    // Auto-trigger analysis when navigating from Upload step with Continue button
    useEffect(() => {
        if (shouldAutoAnalyze && video && !isAnalyzing && !analysisStartedRef.current) {
            analysisStartedRef.current = true;
            setShouldAutoAnalyze(false);
            startAnalysis();
        }
    }, [shouldAutoAnalyze, video]);

    const allScenes = cutPoints.length > 0
        ? [0, ...cutPoints.sort((a, b) => a - b), duration].reduce<{ start: number; end: number }[]>((acc, point, i, arr) => {
            if (i < arr.length - 1) acc.push({ start: point, end: arr[i + 1] });
            return acc;
        }, [])
        : [];

    // Drag-and-drop state for voiceover rows
    const [draggingVoiceoverIdx, setDraggingVoiceoverIdx] = useState<number | null>(null);
    const [dragOverSceneIdx, setDragOverSceneIdx] = useState<number | null>(null);
    // Pending drop: waiting for user to choose prepend or append
    const [pendingDrop, setPendingDrop] = useState<{ fromIdx: number; toIdx: number } | null>(null);
    // Inline edit state for voiceover
    const [editingVoiceoverIdx, setEditingVoiceoverIdx] = useState<number | null>(null);
    const [editingVoiceoverValue, setEditingVoiceoverValue] = useState('');

    const formatTime = (s: number) => {
        const h  = Math.floor(s / 3600);
        const m  = Math.floor((s % 3600) / 60);
        const ss = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    return (
        <div className="pt-4 space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
                {/* LEFT COL: video + timeline + script banner + action buttons */}
                <div className="space-y-3">
                    {/* Video Preview with timeline */}
                    {video && (
                        <div className="space-y-3">
                            {/* Mini video preview */}
                            <div className="rounded-lg overflow-hidden bg-black relative">
                                <video
                                    ref={videoPreviewRef}
                                    src={video.url}
                                    className="w-full aspect-video max-h-[250px] object-contain bg-black"
                                    onTimeUpdate={() => {
                                        if (videoPreviewRef.current) {
                                            setCurrentTime(videoPreviewRef.current.currentTime);
                                        }
                                    }}
                                    onPlay={() => setIsVideoPlaying(true)}
                                    onPause={() => setIsVideoPlaying(false)}
                                    playsInline
                                />
                                {/* Current time overlay */}
                                <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
                                    {formatTime(currentTime)}
                                </div>
                                {/* Play/Pause overlay */}
                                <button
                                    onClick={() => {
                                        const v = videoPreviewRef.current;
                                        if (v) v.paused ? v.play() : v.pause();
                                    }}
                                    className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20"
                                >
                                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                                        {isVideoPlaying
                                            ? <Pause className="w-6 h-6 text-gray-900" />
                                            : <Play className="w-6 h-6 text-gray-900 ml-0.5" />
                                        }
                                    </div>
                                </button>
                            </div>

                            {/* Timeline with cut points */}
                            <SceneTimeline
                                duration={duration}
                                cutPoints={cutPoints}
                                onAddCut={handleAddCut}
                                onRemoveCut={handleRemoveCut}
                                onMoveCut={handleMoveCut}
                                currentTime={currentTime}
                                onSeek={handleSeek}
                                onScrub={handleScrub}
                                fps={video?.frameRate}
                                transcripts={scriptEntries.map(e => e?.voiceover || '')}
                                hasAudio={videoHasAudio ?? undefined}
                            />


                        </div>
                    )}

                    {/* Script indicator banner */}
                    {script && (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                            <FileText className="w-4 h-4 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-primary">Script loaded: {script.name}</p>
                                <p className="text-xs text-muted-foreground">AI will match script content to detected scenes</p>
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        {isAnalyzing ? (
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    <span className="text-sm">{script ? 'Analyzing video & matching script...' : 'Analyzing with AI...'}</span>
                                    <span className="ml-auto text-sm text-muted-foreground">{progress}%</span>
                                </div>
                                <Progress value={progress} />
                            </div>
                        ) : (
                            <>
                                <Button onClick={startAnalysis} variant="outline" size="sm" className="flex-1">
                                    <Scan className="w-4 h-4 mr-2" />
                                    {script ? 'AI Auto-Detect with Script' : 'AI Auto-Detect'}
                                </Button>
                                <Button onClick={handleAddCutAtCurrentTime} variant="outline" size="sm" className="flex-1">
                                    <Scissors className="w-4 h-4 mr-2" />
                                    Cut at {formatTime(currentTime)}
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT COL: scene list */}
                {allScenes.length > 0 && (
                <div className="space-y-2 overflow-y-auto max-h-[70vh] pr-1">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{allScenes.length} scenes</span>
                            {/* Voiceover detection badge — only shown after a no-script analysis */}
                            {!script && detectedVoiceover === true && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                                    <Mic className="w-3 h-3 shrink-0" />
                                    <span>
                                        Voiceover detected
                                        {detectedVoiceoverLanguage?.name
                                            ? ` (${detectedVoiceoverLanguage.name})`
                                            : ''}
                                    </span>
                                </span>
                            )}
                            {!script && detectedVoiceover === false && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    <Type className="w-3 h-3" /> No voiceover — text extracted
                                </span>
                            )}
                        </div>
                        {cutPoints.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCutPoints([])}
                                className="text-xs text-muted-foreground"
                            >
                                Clear all cuts
                            </Button>
                        )}
                    </div>

                    <div className="space-y-1">
                        {allScenes.map((scene, i) => {
                            const scriptEntry = scriptEntries[i];
                            const hasSpoken = !!scriptEntry?.voiceover?.trim();
                            const hasTextOnScreen = !!scriptEntry?.textOnScreen?.trim();
                            const isDropTarget = dragOverSceneIdx === i && draggingVoiceoverIdx !== null && draggingVoiceoverIdx !== i;
                            return (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex flex-col gap-1 p-2 rounded-lg border transition-colors cursor-pointer",
                                        previewingScene === i
                                            ? "border-primary bg-primary/10"
                                            : "border-border bg-surface-elevated hover:border-muted-foreground/30",
                                        isDropTarget && "ring-2 ring-green-400 border-green-400 bg-green-400/5"
                                    )}
                                    onClick={() => {
                                        setPreviewingScene(i);
                                        handleSeek(scene.start);
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (draggingVoiceoverIdx !== null && draggingVoiceoverIdx !== i) {
                                            setDragOverSceneIdx(i);
                                        }
                                    }}
                                    onDragLeave={(e) => {
                                        e.stopPropagation();
                                        setDragOverSceneIdx(null);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const fromIdx = draggingVoiceoverIdx;
                                        if (fromIdx === null || fromIdx === i) return;
                                        const toText = scriptEntries[i]?.voiceover ?? '';
                                        setDraggingVoiceoverIdx(null);
                                        setDragOverSceneIdx(null);
                                        if (toText.trim()) {
                                            // Target already has voiceover — ask user where to place it
                                            setPendingDrop({ fromIdx, toIdx: i });
                                        } else {
                                            // Target is empty — place directly, no ambiguity
                                            updateScriptEntry(i, { voiceover: scriptEntries[fromIdx]?.voiceover ?? '' });
                                            updateScriptEntry(fromIdx, { voiceover: '' });
                                        }
                                    }}
                                >
                                    {/* Scene header row */}
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-3 h-3 rounded-full shrink-0"
                                            style={{ backgroundColor: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'][i % 8] }}
                                        />
                                        <span className="text-sm font-medium">
                                            {segments[i]?.isOutro ? '🎬 Outro' : `Scene ${i + 1}`}
                                        </span>
                                        <span className="text-xs text-muted-foreground font-mono ml-auto">
                                            {formatTime(scene.start)} – {formatTime(scene.end)}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            ({Math.round((scene.end - scene.start) * FPS)}f)
                                        </span>
                                        {/* Outro toggle — only one segment can be the Outro */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (segments[i] && !segments[i].isOutro) {
                                                    setOutroSegment(segments[i].id);
                                                }
                                            }}
                                            className={cn(
                                                'text-xs px-1.5 py-0.5 rounded border transition-colors shrink-0',
                                                segments[i]?.isOutro
                                                    ? 'border-amber-500 text-amber-400 bg-amber-500/10 cursor-default'
                                                    : 'border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-400'
                                            )}
                                            title={segments[i]?.isOutro ? 'This is the Outro' : 'Set as Outro'}
                                        >
                                            🎬
                                        </button>
                                        {/* Remove cut / merge-with-previous button */}
                                        {(i < cutPoints.length || (i === cutPoints.length && cutPoints.length > 0)) && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Last segment: remove the cut before it (merges into previous)
                                                    handleRemoveCut(i < cutPoints.length ? i : i - 1);
                                                }}
                                                className="p-1 text-muted-foreground hover:text-red-400 shrink-0"
                                                title={i === cutPoints.length ? "Merge with previous scene" : "Remove this cut point"}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Detected voiceover transcription — draggable + editable + addable */}
                                    <div className="flex flex-col gap-1">
                                        {editingVoiceoverIdx === i ? (
                                            /* ── Edit mode (works for both new and existing voiceover) ── */
                                                <div
                                                    className="flex flex-col gap-1.5 pl-2"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <Mic className="w-3 h-3 text-green-400 shrink-0" />
                                                        <span className="text-[10px] text-muted-foreground">Editing voiceover</span>
                                                    </div>
                                                    <textarea
                                                        autoFocus
                                                        value={editingVoiceoverValue}
                                                        onChange={(e) => setEditingVoiceoverValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Escape') {
                                                                setEditingVoiceoverIdx(null);
                                                                setEditingVoiceoverValue('');
                                                            }
                                                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                                                updateScriptEntry(i, { voiceover: editingVoiceoverValue.trim() });
                                                                setEditingVoiceoverIdx(null);
                                                                setEditingVoiceoverValue('');
                                                            }
                                                        }}
                                                        className="w-full text-xs text-green-400 bg-surface border border-green-400/30 rounded p-1.5 resize-none focus:outline-none focus:border-green-400/60"
                                                        rows={3}
                                                    />
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 border border-green-400/50 text-green-400 hover:bg-green-500/30 transition-colors"
                                                            onClick={() => {
                                                                updateScriptEntry(i, { voiceover: editingVoiceoverValue.trim() });
                                                                setEditingVoiceoverIdx(null);
                                                                setEditingVoiceoverValue('');
                                                            }}
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/50 transition-colors"
                                                            onClick={() => {
                                                                setEditingVoiceoverIdx(null);
                                                                setEditingVoiceoverValue('');
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : hasSpoken ? (
                                                /* ── Display mode ── */
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.stopPropagation();
                                                        setDraggingVoiceoverIdx(i);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onDragEnd={() => {
                                                        setDraggingVoiceoverIdx(null);
                                                        setDragOverSceneIdx(null);
                                                    }}
                                                    className={cn(
                                                        "flex items-start gap-1.5 pl-2 rounded cursor-grab active:cursor-grabbing group select-none",
                                                        "hover:bg-green-400/10 transition-colors",
                                                        draggingVoiceoverIdx === i && "opacity-40"
                                                    )}
                                                    title="Drag to move • Double-click to edit"
                                                    onClick={(e) => e.stopPropagation()}
                                                    onDoubleClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingVoiceoverIdx(i);
                                                        setEditingVoiceoverValue(scriptEntry?.voiceover ?? '');
                                                    }}
                                                >
                                                    <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-60 shrink-0 mt-0.5 transition-opacity" />
                                                    <Mic className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-green-400 leading-relaxed flex-1">
                                                        &ldquo;{scriptEntry?.voiceover}&rdquo;
                                                    </p>
                                                    <button
                                                        className="opacity-0 group-hover:opacity-60 shrink-0 ml-1 hover:opacity-100 transition-opacity text-muted-foreground hover:text-green-400"
                                                        title="Edit voiceover"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingVoiceoverIdx(i);
                                                            setEditingVoiceoverValue(scriptEntry?.voiceover ?? '');
                                                        }}
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                /* ── No voiceover yet — show add button ── */
                                                <button
                                                    className="flex items-center gap-1.5 pl-2 text-[10px] text-muted-foreground hover:text-green-400 transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingVoiceoverIdx(i);
                                                        setEditingVoiceoverValue('');
                                                    }}
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    Add voiceover
                                                </button>
                                            )}

                                            {/* Prepend / Append choice — shown only for the drop target */}
                                            {pendingDrop?.toIdx === i && (
                                                <div
                                                    className="flex items-center gap-2 pl-2 pt-1"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <span className="text-[10px] text-muted-foreground">Place dragged text:</span>
                                                    <button
                                                        className="text-[10px] px-2 py-0.5 rounded border border-green-400/50 text-green-400 hover:bg-green-400/10 transition-colors"
                                                        onClick={() => {
                                                            const { fromIdx, toIdx } = pendingDrop;
                                                            const fromText = scriptEntries[fromIdx]?.voiceover ?? '';
                                                            const toText = scriptEntries[toIdx]?.voiceover ?? '';
                                                            updateScriptEntry(toIdx, { voiceover: [fromText, toText].filter(Boolean).join(' ') });
                                                            updateScriptEntry(fromIdx, { voiceover: '' });
                                                            setPendingDrop(null);
                                                        }}
                                                    >
                                                        Before
                                                    </button>
                                                    <button
                                                        className="text-[10px] px-2 py-0.5 rounded border border-green-400/50 text-green-400 hover:bg-green-400/10 transition-colors"
                                                        onClick={() => {
                                                            const { fromIdx, toIdx } = pendingDrop;
                                                            const fromText = scriptEntries[fromIdx]?.voiceover ?? '';
                                                            const toText = scriptEntries[toIdx]?.voiceover ?? '';
                                                            updateScriptEntry(toIdx, { voiceover: [toText, fromText].filter(Boolean).join(' ') });
                                                            updateScriptEntry(fromIdx, { voiceover: '' });
                                                            setPendingDrop(null);
                                                        }}
                                                    >
                                                        After
                                                    </button>
                                                    <button
                                                        className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/50 transition-colors ml-auto"
                                                        onClick={() => setPendingDrop(null)}
                                                        title="Cancel"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                    {/* Detected on-screen text (from script match or no-script AI) */}
                                    {hasTextOnScreen && (
                                        <div className="flex items-start gap-1.5 pl-5">
                                            <Type className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                                            <p className="text-xs text-primary line-clamp-1">
                                                {scriptEntry.textOnScreen.replace(/\{[^:]+:([^}]+)\}/g, '$1')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                )}
            </div>

            {/* Continue button */}
            {allScenes.length > 0 && (
                <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => {
                        buildSegments(cutPoints);
                        setCurrentStep('edit-text');
                    }}
                >
                    Continue with {allScenes.length} scenes
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            )}
        </div>
    );
}

// Text Layer type for the player
interface TextLayerOverlay {
    id: string;
    content: string;
    positionX: number;                          // px in native video resolution
    positionY: number;                          // px in native video resolution
    positionAnchor?: 'top' | 'middle' | 'bottom';
    fontSize: number;
    fontWeight?: number; // defaults to 800 if not set
    textStyle?: 'headline' | 'body' | 'disclaimer' | 'cta'; // used to clamp auto-fit range; 'disclaimer' = 24px default, 16px if >3 lines, no clamp; 'cta' = ExtraBold 56–72px
    maxLines?: number; // override for per-layer line limit (0 = unlimited)
    color: string;
    backgroundColor?: string;
    textShadow?: string;
    animationType: string;
    startTime: number;
    endTime: number; // If endTime === -1, text stays visible until end of scene
}

// Parse rich text with color markup: {red:text} or {#ff444f:text}
// Returns array of { text: string, color?: string }
// Strip common disclaimer/legal prefix labels from extracted disclaimer text
// e.g. "Disclaimer: ..." → "...", "Risk Warning: ..." → "..."
function stripDisclaimerPrefix(text: string): string {
    if (!text) return text;
    return text
        .replace(/^(legal\s+disclaimer|risk\s+warning|risk\s+disclosure|important\s+notice|legal\s+notice|regulatory\s+notice|terms\s+and\s+conditions|fine\s+print|disclaimer)\s*[:\-–—]\s*/i, '')
        .trim();
}

function parseRichText(content: string, defaultColor: string): { text: string; color: string }[] {
    const parts: { text: string; color: string }[] = [];
    const colorMap: Record<string, string> = {
        'white': '#ffffff',
        'red': '#ff444f',
        'dark': '#181C25',
    };

    // Normalise [red:word] → {red:word} (square-bracket form stored by some code paths)
    const normalised = content.replace(/\[([^\]:]+):([^\]]+)\]/g, '{$1:$2}');

    // Regex to match {color:text} patterns
    const regex = /\{(#[0-9a-fA-F]{6}|white|red|dark):([^}]+)\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(normalised)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push({ text: normalised.slice(lastIndex, match.index), color: defaultColor });
        }

        // Add the colored text
        const colorKey = match[1].toLowerCase();
        const color = colorMap[colorKey] || match[1]; // Use mapped color or hex value
        parts.push({ text: match[2], color });

        lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < normalised.length) {
        parts.push({ text: normalised.slice(lastIndex), color: defaultColor });
    }

    // If no parts, return the whole content
    if (parts.length === 0) {
        parts.push({ text: content, color: defaultColor });
    }

    return parts;
}

// Render rich text content as colored spans
function RichTextContent({ content, defaultColor }: { content: string; defaultColor: string }) {
    const parts = parseRichText(content, defaultColor);

    return (
        <>
            {parts.map((part, i) => (
                <span key={i} style={{ color: part.color }}>{part.text}</span>
            ))}
        </>
    );
}

type ExportOverlayLayer = {
    id: string;
    content: string;
    positionX: number;
    positionY: number;
    positionAnchor?: 'top' | 'middle' | 'bottom';
    fontSize: number;
    fontWeight?: number;
    color: string;
    backgroundColor?: string;
    maxLines: number;
    textStyle?: 'headline' | 'body' | 'disclaimer' | 'cta';
};

type RichToken = { text: string; color: string };
type OverlayRenderResult = { blob: Blob | null; resolvedFontSize: number | null };
type OverlayCacheEntry = { blob: Blob; resolvedFontSize: number | null };

const OVERLAY_CACHE_MAX_ENTRIES = 400;
const OVERLAY_RENDER_CONCURRENCY = 3;
const OVERLAY_RENDER_DEBOUNCE_MS = 100;
let overlayFontsReadyPromise: Promise<void> | null = null;
const overlayRenderCache = new Map<string, OverlayCacheEntry>();
const overlayRenderInflight = new Map<string, Promise<OverlayRenderResult>>();

function buildOverlayKey(sceneIndex: number, layerIndex: number): string {
    return `overlay_${sceneIndex}_${layerIndex}`;
}

function getHorizontalBounds(positionX: number, videoWidth: number): { left: number; right: number; align: 'left' | 'center' | 'right' } {
    if (positionX <= videoWidth * 0.20) {
        return { left: positionX, right: videoWidth * 0.88, align: 'left' };
    }
    if (positionX >= videoWidth * 0.80) {
        return { left: videoWidth * 0.12, right: positionX, align: 'right' };
    }
    return { left: videoWidth * 0.12, right: videoWidth * 0.88, align: 'center' };
}

function tokenizeRichParts(content: string, defaultColor: string): RichToken[] {
    const tokens: RichToken[] = [];
    for (const part of parseRichText(content, defaultColor)) {
        const pieces = part.text.split(/(\s+)/).filter((p) => p.length > 0);
        for (const piece of pieces) tokens.push({ text: piece, color: part.color });
    }
    return tokens;
}

function wrapRichTokens(
    ctx: CanvasRenderingContext2D,
    tokens: RichToken[],
    maxWidth: number,
    maxLines: number
): RichToken[][] {
    const lines: RichToken[][] = [];
    let current: RichToken[] = [];
    const safeMaxWidth = Math.max(1, maxWidth);
    const effectiveMaxLines = maxLines <= 0 ? Number.MAX_SAFE_INTEGER : maxLines;
    const lineText = (line: RichToken[]) => line.map((t) => t.text).join('');

    for (const token of tokens) {
        const isSpace = /^\s+$/.test(token.text);
        if (isSpace && current.length === 0) continue;

        const candidate = lineText(current) + token.text;
        if (!isSpace && current.length > 0 && ctx.measureText(candidate).width > safeMaxWidth) {
            lines.push(current);
            if (lines.length >= effectiveMaxLines) return lines;
            current = [{ ...token, text: token.text.replace(/^\s+/, '') }];
            continue;
        }
        current.push(token);
    }

    if (current.length > 0 && lines.length < effectiveMaxLines) lines.push(current);
    return lines;
}

async function waitForOverlayFonts(): Promise<void> {
    if (overlayFontsReadyPromise) return overlayFontsReadyPromise;
    overlayFontsReadyPromise = (async () => {
        if (!('fonts' in document)) return;
        try {
            await Promise.all([
                document.fonts.load('800 64px Inter'),
                document.fonts.load('400 24px Inter'),
                document.fonts.load('800 64px "Noto Sans Arabic"'),
            ]);
            await document.fonts.ready;
        } catch {
            // Keep export robust if browser font API fails; fallback fonts still render.
        }
    })();
    return overlayFontsReadyPromise;
}

function buildOverlayRenderCacheKey(
    layer: ExportOverlayLayer,
    videoWidth: number,
    videoHeight: number
): string {
    return [
        videoWidth,
        videoHeight,
        layer.content ?? '',
        layer.positionX,
        layer.positionY,
        layer.positionAnchor ?? 'middle',
        layer.fontSize ?? 0,
        layer.fontWeight ?? 800,
        layer.color ?? '',
        layer.backgroundColor ?? '',
        layer.maxLines ?? 2,
        layer.textStyle ?? '',
    ].join('|');
}

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
) {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function renderLayerOverlayToPng(
    layer: ExportOverlayLayer,
    videoWidth: number,
    videoHeight: number
): Promise<OverlayRenderResult> {
    const plainContent = parseRichText(layer.content ?? '', layer.color ?? '#ffffff').map((p) => p.text).join('').trim();
    if (!plainContent) return { blob: null, resolvedFontSize: null };

    await waitForOverlayFonts();

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(videoWidth));
    canvas.height = Math.max(1, Math.round(videoHeight));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: null, resolvedFontSize: null };
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isArabic = hasArabicScript(layer.content ?? '');
    const fontFamily = isArabic ? ARABIC_FONT_STACK : DEFAULT_FONT_STACK;
    const fontWeight = isArabic ? ARABIC_BOLD_WEIGHT : (layer.fontWeight ?? 800);
    const textDirection: 'rtl' | 'ltr' = isArabic ? 'rtl' : 'ltr';
    const bounds = getHorizontalBounds(layer.positionX, canvas.width);
    const maxWidth = Math.max(1, bounds.right - bounds.left);
    const resolveFittedFontSize = (): number => {
        const maxLines = layer.maxLines <= 0 ? Number.MAX_SAFE_INTEGER : layer.maxLines;
        if (layer.textStyle === 'disclaimer' || layer.maxLines === 0) {
            const testDisclaimer = (size: number) => {
                ctx.font = `${400} ${size}px ${fontFamily}`;
                const wrapped = wrapRichTokens(ctx, tokenizeRichParts(layer.content, layer.color || '#ffffff'), maxWidth, Number.MAX_SAFE_INTEGER);
                return wrapped.length;
            };
            return testDisclaimer(24) > 3 ? 16 : 24;
        }

        const byStyle = layer.textStyle === 'headline'
            ? { min: 64, max: 128 }
            : layer.textStyle === 'body'
                ? { min: 24, max: 32 }
                : layer.textStyle === 'cta'
                    ? { min: 56, max: 72 }
                    : { min: Math.max(8, Math.round(layer.fontSize || 24)), max: Math.max(8, Math.round(layer.fontSize || 24)) };

        let lo = byStyle.min;
        let hi = byStyle.max;
        let best = byStyle.min;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            ctx.font = `${fontWeight} ${mid}px ${fontFamily}`;
            const wrapped = wrapRichTokens(ctx, tokenizeRichParts(layer.content, layer.color || '#ffffff'), maxWidth, maxLines + 8);
            if (wrapped.length <= maxLines) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return best;
    };

    const fontSize = Math.max(8, resolveFittedFontSize());
    const lineHeight = (layer.textStyle === 'disclaimer' || layer.maxLines === 0) ? 1.4 : 1.0;
    const lineHeightPx = Math.max(1, fontSize * lineHeight);

    ctx.textBaseline = 'top';
    (ctx as CanvasRenderingContext2D & { direction?: 'ltr' | 'rtl' }).direction = textDirection;
    ctx.textAlign = isArabic ? 'right' : 'left';
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const lines = wrapRichTokens(ctx, tokenizeRichParts(layer.content, layer.color || '#ffffff'), maxWidth, layer.maxLines);
    if (lines.length === 0) return { blob: null, resolvedFontSize: fontSize };

    const lineWidths = lines.map((line) => ctx.measureText(line.map((t) => t.text).join('')).width);
    const totalHeight = lineHeightPx * lines.length;
    const anchor = layer.positionAnchor ?? 'middle';
    const startY =
        anchor === 'top'
            ? layer.positionY
            : anchor === 'bottom'
                ? layer.positionY - totalHeight
                : layer.positionY - totalHeight / 2;

    if (layer.backgroundColor) {
        const blockWidth = Math.min(maxWidth, Math.max(...lineWidths));
        const left = bounds.align === 'left'
            ? bounds.left
            : bounds.align === 'right'
                ? bounds.right - blockWidth
                : bounds.left + (maxWidth - blockWidth) / 2;
        drawRoundedRect(ctx, left - 14, startY - 6, blockWidth + 28, totalHeight + 12, 6);
        ctx.fillStyle = layer.backgroundColor;
        ctx.fill();
    }

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const width = lineWidths[i];
        const y = startY + (i * lineHeightPx);
        if (isArabic) {
            let x = bounds.align === 'left'
                ? bounds.left + width
                : bounds.align === 'right'
                    ? bounds.right
                    : bounds.left + ((maxWidth + width) / 2);
            for (const token of line) {
                ctx.fillStyle = token.color || layer.color || '#ffffff';
                ctx.fillText(token.text, x, y);
                x -= ctx.measureText(token.text).width;
            }
        } else {
            let x = bounds.align === 'left'
                ? bounds.left
                : bounds.align === 'right'
                    ? bounds.right - width
                    : bounds.left + (maxWidth - width) / 2;
            for (const token of line) {
                ctx.fillStyle = token.color || layer.color || '#ffffff';
                ctx.fillText(token.text, x, y);
                x += ctx.measureText(token.text).width;
            }
        }
    }

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), 'image/png');
    });
    return { blob, resolvedFontSize: fontSize };
}

async function renderLayerOverlayCached(
    layer: ExportOverlayLayer,
    videoWidth: number,
    videoHeight: number
): Promise<OverlayRenderResult> {
    const cacheKey = buildOverlayRenderCacheKey(layer, videoWidth, videoHeight);
    const cached = overlayRenderCache.get(cacheKey);
    if (cached) return { blob: cached.blob, resolvedFontSize: cached.resolvedFontSize };

    const inflight = overlayRenderInflight.get(cacheKey);
    if (inflight) return inflight;

    const promise = renderLayerOverlayToPng(layer, videoWidth, videoHeight)
        .then((result) => {
            if (result.blob) {
                overlayRenderCache.set(cacheKey, {
                    blob: result.blob,
                    resolvedFontSize: result.resolvedFontSize,
                });
                if (overlayRenderCache.size > OVERLAY_CACHE_MAX_ENTRIES) {
                    const firstKey = overlayRenderCache.keys().next().value;
                    if (firstKey) overlayRenderCache.delete(firstKey);
                }
            }
            return result;
        })
        .finally(() => {
            overlayRenderInflight.delete(cacheKey);
        });

    overlayRenderInflight.set(cacheKey, promise);
    return promise;
}

const DEFAULT_FONT_STACK = 'Inter, sans-serif';
const ARABIC_FONT_STACK = '"Noto Sans Arabic", sans-serif';
const ARABIC_BOLD_WEIGHT = 800;

function hasArabicScript(text: string): boolean {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

// AutoFitText: renders text at maxFontSize and shrinks until it fits within maxLines.
// Uses a ResizeObserver + hidden off-screen div to binary-search the right size.
function AutoFitText({
    content,
    defaultColor,
    maxFontSize,
    minFontSize = 10,
    lineHeight,
    maxLines,
    backgroundColor,
    textAlign,
    animClass,
    opacity,
    fontWeight = 800,
    fontFamily = DEFAULT_FONT_STACK,
    noClamp = false,
    textShadow,
    onFontSizeResolved,
}: {
    content: string;
    defaultColor: string;
    maxFontSize: number;
    minFontSize?: number;
    lineHeight: number;
    maxLines: number;
    backgroundColor?: string;
    textAlign: 'left' | 'center' | 'right';
    animClass: string;
    opacity?: number;
    fontWeight?: number;
    fontFamily?: string;
    noClamp?: boolean;
    textShadow?: string;
    onFontSizeResolved?: (size: number) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [fittedSize, setFittedSize] = useState(maxFontSize);
    const lastEmittedSize = useRef<number | null>(null);
    const onFontSizeResolvedRef = useRef(onFontSizeResolved);
    onFontSizeResolvedRef.current = onFontSizeResolved;
    const plainMeasureContent = useMemo(
        () => parseRichText(content, defaultColor).map(p => p.text).join(''),
        [content, defaultColor]
    );

    const computeFit = useCallback((width: number) => {
        if (width <= 0) return;

        // Use a temporary off-screen span for measurement
        const probe = document.createElement('div');
        probe.style.cssText = [
            'position:fixed',
            'top:-9999px',
            'left:-9999px',
            'visibility:hidden',
            'pointer-events:none',
            `width:${width}px`,
            'white-space:normal',
            'word-break:break-word',
            `font-weight:${fontWeight}`,
            `font-family:${fontFamily}`,
        ].join(';');
        document.body.appendChild(probe);

        const minSize = minFontSize;
        let lo = minSize;
        let hi = maxFontSize;
        let best = minSize;

        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            probe.style.fontSize = `${mid}px`;
            probe.style.lineHeight = `${lineHeight}`;
            probe.textContent = plainMeasureContent;

            const maxHeightPx = mid * lineHeight * maxLines + 2; // +2px tolerance
            if (probe.scrollHeight <= maxHeightPx) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        document.body.removeChild(probe);
        setFittedSize(best);
        if (onFontSizeResolvedRef.current && best !== lastEmittedSize.current) {
            lastEmittedSize.current = best;
            onFontSizeResolvedRef.current(best);
        }
    }, [plainMeasureContent, maxFontSize, minFontSize, lineHeight, maxLines, fontWeight, fontFamily]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        // Measure immediately if width is already available
        if (el.offsetWidth > 0) {
            computeFit(el.offsetWidth);
        }

        // Also observe for when the container gets a real width (e.g. after layout)
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width ?? 0;
            if (w > 0) computeFit(w);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [computeFit]);

    return (
        <div ref={containerRef} style={{ width: '100%', lineHeight: 0 }}>
            <div
                className={cn('inline-block', animClass)}
                style={{
                    fontSize: `${fittedSize}px`,
                    color: defaultColor,
                    backgroundColor: backgroundColor || 'transparent',
                    padding: backgroundColor ? '6px 14px' : '0',
                    borderRadius: backgroundColor ? '6px' : '0',
                    fontFamily: fontFamily,
                    fontWeight: fontWeight,
                    maxWidth: '100%',
                    width: '100%',
                    textAlign: textAlign,
                    wordBreak: 'break-word' as const,
                    verticalAlign: 'top',
                    ...(noClamp ? {
                        // Show all lines — no truncation
                        display: 'block',
                        overflow: 'visible',
                    } : {
                        display: '-webkit-box',
                        WebkitLineClamp: maxLines,
                        WebkitBoxOrient: 'vertical' as const,
                        overflow: 'hidden',
                    }),
                    lineHeight: lineHeight,
                    opacity: opacity,
                    textShadow: textShadow,
                    transition: 'font-size 0.1s ease',
                }}
            >
                <RichTextContent content={content} defaultColor={defaultColor} />
            </div>
        </div>
    );
}

// DisclaimerAutoFont: renders at 24px by default; switches to 16px when text
// exceeds 3 lines at 24px. No line clamping — all lines are shown.
// Measures at native resolution (nativeVideoWidth) and renders scaled to preview.
function DisclaimerAutoFont({
    content,
    defaultColor,
    nativeVideoWidth,
    previewScale,
    textAlign,
    animClass,
    opacity,
    fontFamily = DEFAULT_FONT_STACK,
    textShadow,
    onFontSizeResolved,
}: {
    content: string;
    defaultColor: string;
    nativeVideoWidth: number;
    previewScale: number;
    textAlign: 'left' | 'center' | 'right';
    animClass: string;
    opacity?: number;
    fontFamily?: string;
    textShadow?: string;
    onFontSizeResolved?: (nativePx: number) => void;
}) {
    const [nativeFontSize, setNativeFontSize] = useState(24);
    const onFontSizeResolvedRef = useRef(onFontSizeResolved);
    onFontSizeResolvedRef.current = onFontSizeResolved;
    const lastEmittedRef = useRef<number | null>(null);

    useEffect(() => {
        if (nativeVideoWidth <= 0) return;

        // Measure at native resolution: 76% of native width (safe area) at 24px
        const nativeSafeWidth = Math.round(nativeVideoWidth * 0.76);
        const probe = document.createElement('div');
        probe.style.cssText = [
            'position:fixed',
            'top:-9999px',
            'left:-9999px',
            'visibility:hidden',
            'pointer-events:none',
            `width:${nativeSafeWidth}px`,
            'white-space:normal',
            'word-break:break-word',
            `font-family:${fontFamily}`,
            'font-weight:400',
            'font-size:24px',
            'line-height:1.4',
        ].join(';');
        probe.textContent = content;
        document.body.appendChild(probe);
        const lineH = 24 * 1.4;
        const lines = Math.round(probe.scrollHeight / lineH);
        document.body.removeChild(probe);

        const resolved = lines > 3 ? 16 : 24;
        setNativeFontSize(resolved);
        if (onFontSizeResolvedRef.current && resolved !== lastEmittedRef.current) {
            lastEmittedRef.current = resolved;
            onFontSizeResolvedRef.current(resolved);
        }
    }, [content, nativeVideoWidth, fontFamily]);

    const previewFontSize = Math.max(6, Math.round(nativeFontSize * previewScale));

    return (
        <div style={{ width: '100%', lineHeight: 0 }}>
            <div
                className={animClass}
                style={{
                    fontSize: `${previewFontSize}px`,
                    color: defaultColor,
                    fontFamily,
                    fontWeight: 400,
                    maxWidth: '100%',
                    width: '100%',
                    textAlign,
                    wordBreak: 'break-word' as const,
                    display: 'block',
                    overflow: 'visible',
                    lineHeight: 1.4,
                    opacity: opacity ?? 1,
                    textShadow: textShadow,
                    transition: 'font-size 0.1s ease',
                }}
            >
                <RichTextContent content={content} defaultColor={defaultColor} />
            </div>
        </div>
    );
}

// Scene Video Player Component - plays video within scene time boundaries
function SceneVideoPlayer({
    videoUrl,
    startTime,
    endTime,
    textLayers = [],
    fps = 30,
    videoFile,
    onPlayStateChange,
    onVideoTimeUpdate,
    onSceneEnd,
    defaultLoop = false,
    forceMuted,
    playbackRate = 1.0,
    getPlaybackRate,
    showSafeArea = false,
    videoWidth,
    videoHeight,
    onLayerFontSizeResolved,
    overlayRenderMode = 'dom',
}: {
    videoUrl: string;
    startTime: number;
    endTime: number;
    textLayers?: TextLayerOverlay[];
    fps?: number;
    videoFile?: File | null;
    onPlayStateChange?: (playing: boolean, videoTime: number) => void;
    onVideoTimeUpdate?: (videoTime: number) => void;
    onSceneEnd?: () => void;
    defaultLoop?: boolean;
    forceMuted?: boolean;
    playbackRate?: number;
    showSafeArea?: boolean;
    // Optional: dynamically compute playback rate per video time (used in export preview
    // where each scene may have a different rate). Called every frame inside rVFC — must
    // be stable (useCallback) to avoid recreating the rVFC loop.
    getPlaybackRate?: (videoTime: number) => number;
    /** Known video dimensions — used to set the correct aspect ratio before the video loads (e.g. dummy data). */
    videoWidth?: number;
    videoHeight?: number;
    /** Called when AutoFitText resolves a fitted font size for a layer. layerId + native-resolution px. */
    onLayerFontSizeResolved?: (layerId: string, nativePx: number) => void;
    /** 'canvas' renders pre-rasterized overlays (closer to export), 'dom' uses live DOM text. */
    overlayRenderMode?: 'dom' | 'canvas';
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const [videoDims, setVideoDims] = useState({ width: videoWidth ?? 9, height: videoHeight ?? 16 });
    const [displayRect, setDisplayRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
    const [playerHeight, setPlayerHeight] = useState(500);
    const rVFCHandle = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const wasPlayingRef = useRef(false);
    const lastResolvedFontByLayerRef = useRef<Record<string, number>>({});
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(startTime);
    const [isLooping, setIsLooping] = useState(defaultLoop);
    const [canvasOverlayUrls, setCanvasOverlayUrls] = useState<Record<string, string>>({});
    const isLoopingRef = useRef(defaultLoop);
    // Keep ref in sync so rVFC tick always reads the latest value without stale closure
    useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);
    const [isMuted, setIsMuted] = useState(false);
    const effectiveMuted = forceMuted ?? isMuted;
    // React cannot reliably update the `muted` DOM property via JSX after mount —
    // it must be set imperatively whenever the value changes.
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = effectiveMuted;
        }
    }, [effectiveMuted]);
    // Slow video when dubbed audio is longer than the scene
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    // Compute the actual displayed video rect inside the responsive container.
    // With object-contain, this rect can be letterboxed; overlays should use
    // this rect (not the full container) to match export composition.
    const recomputeVideoLayout = useCallback(() => {
        const container = playerContainerRef.current;
        if (!container) return;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw <= 0 || ch <= 0) return;

        const vw = Math.max(1, videoDims.width);
        const vh = Math.max(1, videoDims.height);
        const videoAspect = vw / vh;
        const containerAspect = cw / ch;

        let renderW: number;
        let renderH: number;
        let left = 0;
        let top = 0;

        if (videoAspect > containerAspect) {
            renderW = cw;
            renderH = cw / videoAspect;
            top = (ch - renderH) / 2;
        } else {
            renderH = ch;
            renderW = ch * videoAspect;
            left = (cw - renderW) / 2;
        }

        setDisplayRect({ left, top, width: renderW, height: renderH });
        setPlayerHeight(renderH);
    }, [videoDims.width, videoDims.height]);

    // Track container resize to keep layout accurate for any input ratio.
    useEffect(() => {
        const el = playerContainerRef.current;
        if (!el) return;
        recomputeVideoLayout();
        const ro = new ResizeObserver(() => recomputeVideoLayout());
        ro.observe(el);
        return () => ro.disconnect();
    }, [recomputeVideoLayout]);

    const handleLoadedMetadata = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            setVideoDims({ width: video.videoWidth, height: video.videoHeight });
        }
        requestAnimationFrame(() => recomputeVideoLayout());
    }, [recomputeVideoLayout]);

    const currentTimeRef = useRef(currentTime);
    currentTimeRef.current = currentTime;

    // Notify parent only on actual play/pause transitions (not every frame)
    useEffect(() => {
        onPlayStateChange?.(isPlaying, currentTimeRef.current);
    }, [isPlaying, onPlayStateChange]);

    const FPS = fps;
    const FRAME = 1 / FPS;
    const duration = endTime - startTime;
    const progress = ((currentTime - startTime) / duration) * 100;

    // Snap time to nearest frame
    const snapToFrame = useCallback((t: number) => Math.round(t * FPS) / FPS, [FPS]);

    // Use requestVideoFrameCallback for frame-accurate currentTime tracking
    const startRVFC = useCallback(() => {
        const video = videoRef.current;
        if (!video || !('requestVideoFrameCallback' in video)) return;
        const tick = (_now: number, meta: { mediaTime: number }) => {
            const snapped = snapToFrame(meta.mediaTime);
            setCurrentTime(snapped);
            onVideoTimeUpdate?.(snapped);
            // Dynamic per-scene playback rate (used in continuous export preview)
            if (getPlaybackRate) {
                const rate = getPlaybackRate(snapped);
                if (Math.abs(video.playbackRate - rate) > 0.01) {
                    video.playbackRate = rate;
                }
            }
            // Loop check — use ref to avoid stale closure
            if (snapped >= endTime) {
                if (isLoopingRef.current) {
                    video.currentTime = startTime;
                    video.play();
                } else {
                    video.pause();
                    setIsPlaying(false);
                    onSceneEnd?.();
                    return;
                }
            }
            rVFCHandle.current = (video as any).requestVideoFrameCallback(tick);
        };
        rVFCHandle.current = (video as any).requestVideoFrameCallback(tick);
    }, [FPS, startTime, endTime, snapToFrame, onVideoTimeUpdate, onSceneEnd, getPlaybackRate]);

    const stopRVFC = useCallback(() => {
        const video = videoRef.current;
        if (video && rVFCHandle.current !== null && 'cancelVideoFrameCallback' in video) {
            (video as any).cancelVideoFrameCallback(rVFCHandle.current);
            rVFCHandle.current = null;
        }
    }, []);

    // Reset video position when scene changes
    useEffect(() => {
        const video = videoRef.current;
        if (video) {
            stopRVFC();
            const snapped = snapToFrame(startTime);
            video.currentTime = snapped;
            setCurrentTime(snapped);
        setIsPlaying(false);
        video.pause();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startTime, endTime]);

    // Fallback: Handle time updates via onTimeUpdate when rVFC not available
    const handleTimeUpdate = useCallback(() => {
        const video = videoRef.current as HTMLVideoElement | null;
        if (!video) return;
        if ('requestVideoFrameCallback' in video) return; // rVFC handles it

        const videoEl = video as HTMLVideoElement;
        const snapped = snapToFrame(videoEl.currentTime);
        setCurrentTime(snapped);
        onVideoTimeUpdate?.(snapped);

        // Loop back to start when reaching end of scene — use ref to avoid stale closure
        if (videoEl.currentTime >= endTime) {
            if (isLoopingRef.current) {
                videoEl.currentTime = snapToFrame(startTime);
                videoEl.play();
            } else {
                videoEl.pause();
                setIsPlaying(false);
                onSceneEnd?.();
            }
        }
    }, [startTime, endTime, snapToFrame, onVideoTimeUpdate, onSceneEnd]);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isPlaying) {
            video.pause();
            stopRVFC();
            setIsPlaying(false);
        } else {
            // Ensure we start from the scene start if at the end
            if (video.currentTime >= endTime || video.currentTime < startTime) {
                const snapped = snapToFrame(startTime);
                video.currentTime = snapped;
                setCurrentTime(snapped);
            }
        video.play();
        setIsPlaying(true);
        startRVFC();
        }
    }, [isPlaying, startTime, endTime, currentTime, snapToFrame, startRVFC, stopRVFC]);

    const restartScene = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        stopRVFC();
        video.currentTime = snapToFrame(startTime);
        setCurrentTime(snapToFrame(startTime));
        video.play();
        setIsPlaying(true);
        startRVFC();
    }, [startTime, snapToFrame, startRVFC, stopRVFC]);

    const toggleMute = useCallback(() => {
        if (forceMuted !== undefined) return;
        const video = videoRef.current;
        if (!video) return;
        video.muted = !isMuted;
        setIsMuted(!isMuted);
    }, [isMuted, forceMuted]);

    const goToFirstFrame = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        stopRVFC();
        setIsPlaying(false);
        video.pause();
        const snapped = snapToFrame(startTime);
        video.currentTime = snapped;
        setCurrentTime(snapped);
    }, [startTime, snapToFrame, stopRVFC]);

    const goToLastFrame = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        stopRVFC();
        setIsPlaying(false);
        video.pause();
        // Last frame = endTime minus one frame
        const snapped = snapToFrame(endTime - FRAME);
        video.currentTime = snapped;
        setCurrentTime(snapped);
    }, [endTime, FRAME, snapToFrame, stopRVFC]);

    // Shared helper: resolve time from a pointer X position over the progress bar
    const timeFromPointerX = useCallback((clientX: number): number => {
        const bar = progressBarRef.current;
        if (!bar) return currentTimeRef.current;
        const rect = bar.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return snapToFrame(startTime + pct * duration);
    }, [startTime, duration, snapToFrame]);

    const scrubTo = useCallback((time: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = time;
        setCurrentTime(time);
    }, []);

    const handleProgressPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        isDraggingRef.current = true;
        wasPlayingRef.current = isPlaying;

        // Pause while scrubbing so seeking is responsive
        if (isPlaying) {
            videoRef.current?.pause();
            stopRVFC();
            setIsPlaying(false);
        }

        const time = timeFromPointerX(e.clientX);
        scrubTo(time);
    }, [isPlaying, stopRVFC, timeFromPointerX, scrubTo]);

    const handleProgressPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current) return;
        scrubTo(timeFromPointerX(e.clientX));
    }, [timeFromPointerX, scrubTo]);

    const handleProgressPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);

        const time = timeFromPointerX(e.clientX);
        scrubTo(time);

        // Resume playing if it was playing before the drag
        if (wasPlayingRef.current) {
            videoRef.current?.play();
            setIsPlaying(true);
            startRVFC();
        }
    }, [timeFromPointerX, scrubTo, startRVFC]);

    // Cleanup rVFC on unmount
    useEffect(() => {
        return () => {
            stopRVFC();
        };
    }, [stopRVFC]);

    // Format relative frame within scene
    const formatRelFrame = (seconds: number) => `F${Math.round(seconds * FPS)}`;

    // Calculate relative time within the scene (0 to duration)
    const relativeTime = Math.max(0, currentTime - startTime);
    const previewShortSide = Math.max(
        1,
        Math.min(
            displayRect.width > 0 ? displayRect.width : videoDims.width,
            displayRect.height > 0 ? displayRect.height : videoDims.height
        )
    );

    useEffect(() => {
        if (overlayRenderMode !== 'canvas') {
            setCanvasOverlayUrls((prev) => {
                Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
                return {};
            });
            return;
        }

        let cancelled = false;

        const renderAll = async () => {
            const next: Record<string, string> = {};
            const vW = Math.max(1, Math.round(videoDims.width || videoWidth || 1080));
            const vH = Math.max(1, Math.round(videoDims.height || videoHeight || 1920));
            const layers = textLayers.map((layer) => ({
                id: layer.id,
                content: layer.content,
                positionX: layer.positionX,
                positionY: layer.positionY,
                positionAnchor: layer.positionAnchor ?? 'middle',
                fontSize: layer.fontSize,
                fontWeight: layer.fontWeight ?? 800,
                color: layer.color,
                backgroundColor: layer.backgroundColor,
                maxLines: layer.maxLines ?? (layer.textStyle === 'disclaimer' ? 0 : 2),
                textStyle: layer.textStyle,
            }));
            let idx = 0;
            const worker = async () => {
                while (!cancelled) {
                    const current = idx;
                    idx += 1;
                    if (current >= layers.length) break;
                    const layer = layers[current];
                    const rendered = await renderLayerOverlayCached(layer, vW, vH);
                    if (
                        rendered.resolvedFontSize !== null &&
                        onLayerFontSizeResolved &&
                        lastResolvedFontByLayerRef.current[layer.id] !== rendered.resolvedFontSize
                    ) {
                        lastResolvedFontByLayerRef.current[layer.id] = rendered.resolvedFontSize;
                        onLayerFontSizeResolved(layer.id, rendered.resolvedFontSize);
                    }
                    if (cancelled || !rendered.blob) continue;
                    next[layer.id] = URL.createObjectURL(rendered.blob);
                }
            };
            await Promise.all(
                Array.from({ length: Math.max(1, Math.min(OVERLAY_RENDER_CONCURRENCY, layers.length)) }, () => worker())
            );

            if (cancelled) {
                Object.values(next).forEach((u) => URL.revokeObjectURL(u));
                return;
            }

            setCanvasOverlayUrls((prev) => {
                Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
                return next;
            });
        };

        const t = window.setTimeout(() => {
            renderAll();
        }, OVERLAY_RENDER_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [overlayRenderMode, textLayers, videoDims.width, videoDims.height, videoWidth, videoHeight, onLayerFontSizeResolved]);

    return (
        <div
            ref={containerRef}
            className="flex justify-center"
        >
            {/* Video Container - uses actual input video aspect ratio */}
            <div
                ref={playerContainerRef}
                className="relative rounded-xl overflow-hidden bg-black"
                style={{ aspectRatio: `${videoDims.width} / ${videoDims.height}`, maxHeight: '500px', width: 'auto' }}
            >
                {/* Video Element — always rendered for playback, hidden behind frame overlay when paused */}
                <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-contain"
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    onLoadedMetadata={handleLoadedMetadata}
                    playsInline
                    muted={effectiveMuted}
                    onClick={() => togglePlay()}
                />

                {/* Text Layer Overlays - positioned relative to video content only */}
                {/* containerType inline-size enables cqw units so font sizes scale with player width */}
                <div
                    className="absolute pointer-events-none"
                    style={{
                        zIndex: 10,
                        containerType: 'inline-size',
                        left: `${displayRect.left}px`,
                        top: `${displayRect.top}px`,
                        width: `${displayRect.width}px`,
                        height: `${displayRect.height}px`,
                    }}
                >
                    {textLayers.map((layer) => {

                        // endTime of -1 means "stay until end of scene"
                        const effectiveEndTime = layer.endTime === -1 ? duration : layer.endTime;

                        // Calculate animation state based on timing
                        // Enter animation: 0.5s from startTime with ease-in
                        // Exit animation: 0.5s before endTime with ease-out (optional)
                        const enterStart = layer.startTime;
                        const enterEnd = layer.startTime + 0.5; // 0.5s enter animation

                        // Exit only if endTime is explicitly set (not -1) and there's enough time
                        const hasExitAnimation = layer.endTime !== -1 && effectiveEndTime > layer.startTime + 1;
                        const exitStart = effectiveEndTime - 0.5; // 0.5s exit animation
                        const exitEnd = effectiveEndTime;

                        let animState: 'hidden-before' | 'entering' | 'visible' | 'exiting' | 'hidden-after' = 'hidden-before';

                        if (relativeTime < enterStart) {
                            animState = 'hidden-before';
                        } else if (!isPlaying && relativeTime >= enterStart && relativeTime < enterEnd) {
                            // Paused during enter window — show statically (no animation)
                            animState = 'visible';
                        } else if (isPlaying && relativeTime >= enterStart && relativeTime < enterEnd) {
                            animState = 'entering';
                        } else if (relativeTime >= enterEnd && (!hasExitAnimation || relativeTime < exitStart)) {
                            animState = 'visible';
                        } else if (isPlaying && hasExitAnimation && relativeTime >= exitStart && relativeTime < exitEnd) {
                            animState = 'exiting';
                        } else if (!isPlaying && hasExitAnimation && relativeTime >= exitStart && relativeTime < exitEnd) {
                            // Paused during exit window — show statically
                            animState = 'visible';
                        } else if (relativeTime >= exitEnd) {
                            animState = hasExitAnimation ? 'hidden-after' : 'visible';
                        }

                        // Get animation class based on state and animation type
                        const getAnimClass = () => {
                            const animType = layer.animationType || 'fade';
                            switch (animState) {
                                case 'entering':
                                    return `text-anim-enter-${animType}`;
                                case 'exiting':
                                    return `text-anim-exit-${animType}`;
                                case 'visible':
                                    return 'text-anim-visible';
                                case 'hidden-before':
                                case 'hidden-after':
                                default:
                                    return 'text-anim-hidden';
                            }
                        };

                        // In editor mode, only show layers when in their time range (no ghosting)
                        const isInTimeRange = relativeTime >= layer.startTime && relativeTime <= effectiveEndTime;
                        const animClass = isInTimeRange ? getAnimClass() : 'text-anim-hidden';

                        if (overlayRenderMode === 'canvas') {
                            const overlayUrl = canvasOverlayUrls[layer.id];
                            return (
                                <div
                                    key={layer.id}
                                    className="pointer-events-none absolute inset-0"
                                    style={{ zIndex: 20, userSelect: 'none' }}
                                >
                                    {overlayUrl && (
                                        <img
                                            src={overlayUrl}
                                            alt=""
                                            draggable={false}
                                            className={cn('w-full h-full pointer-events-none select-none', animClass)}
                                        />
                                    )}
                                </div>
                            );
                        }

                        // Determine text alignment based on horizontal position (px thresholds)
                        const vW = videoDims.width;
                        const vH = videoDims.height;
                        const textAlign: 'left' | 'center' | 'right' = layer.positionX <= vW * 0.20 ? 'left' : layer.positionX >= vW * 0.80 ? 'right' : 'center';
                        // Vertical transform: use explicit anchor when set, else derive from position
                        const translateY = layer.positionAnchor === 'top'    ? '0%'
                                         : layer.positionAnchor === 'bottom' ? '-100%'
                                         : layer.positionAnchor === 'middle' ? '-50%'
                                         : layer.positionY <= vH * 0.30 ? '0%' : layer.positionY >= vH * 0.70 ? '-100%' : '-50%';
                        // Convert native px → CSS % relative to the displayed video rect
                        const topPct = (layer.positionY / vH) * 100;

                        // Derive horizontal bounds from positionX so left-/right-aligned
                        // text anchors to the grid x coordinate, not the fixed 12% safe margin.
                        const xPct = (layer.positionX / vW) * 100;
                        const horizStyle = textAlign === 'left'
                            ? { left: `${xPct}%`,        right: '12%' }
                            : textAlign === 'right'
                            ? { left: '12%',              right: `${100 - xPct}%` }
                            : { left: '12%',              right: '12%' }; // center: span safe area

                        return (
                            <div
                                key={layer.id}
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    ...horizStyle,
                                    top: `${topPct}%`,
                                    transform: `translateY(${translateY})`,
                                    zIndex: 20,
                                    userSelect: 'none',
                                    textAlign: textAlign,
                                    // Smooth position changes when using preset grid
                                    transition: 'top 0.3s ease, transform 0.3s ease',
                                }}
                            >
                                {(() => {
                                    const isArabicLayer = hasArabicScript(layer.content ?? '');
                                    const layerFontFamily = isArabicLayer ? ARABIC_FONT_STACK : DEFAULT_FONT_STACK;
                                    const layerFontWeight = isArabicLayer ? ARABIC_BOLD_WEIGHT : (layer.fontWeight ?? 800);
                                    return layer.textStyle === 'disclaimer' ? (
                                        <DisclaimerAutoFont
                                            content={layer.content}
                                            defaultColor={layer.color}
                                            nativeVideoWidth={videoDims.width || 1080}
                                            previewScale={previewShortSide / (videoDims.width || 1080)}
                                            textAlign={textAlign}
                                            animClass={animClass}
                                            opacity={!isInTimeRange ? 0 : undefined}
                                            fontFamily={layerFontFamily}
                                            textShadow={layer.textShadow}
                                            onFontSizeResolved={onLayerFontSizeResolved ? (nativePx) => {
                                                onLayerFontSizeResolved(layer.id, nativePx);
                                            } : undefined}
                                        />
                                    ) : ((layer.fontWeight ?? 800) <= 400 || layer.id.includes('disclaimer')) ? (
                                        // Legacy fine-print path: renders at 14px then scales to 50%
                                        <div style={{ width: '100%', overflow: 'visible', opacity: !isInTimeRange ? 0 : undefined }}>
                                            <div
                                                className={cn(animClass)}
                                                style={{
                                                    fontSize: '14px',
                                                    lineHeight: 1.4,
                                                    fontWeight: isArabicLayer ? ARABIC_BOLD_WEIGHT : 400,
                                                    fontFamily: layerFontFamily,
                                                    color: layer.color,
                                                    textAlign: textAlign,
                                                    wordBreak: 'break-word',
                                                    whiteSpace: 'normal',
                                                    display: 'block',
                                                    overflow: 'visible',
                                                    transform: 'scale(0.5)',
                                                    transformOrigin: textAlign === 'left' ? 'top left' : textAlign === 'right' ? 'top right' : 'top center',
                                                    width: '200%',
                                                    marginLeft: textAlign === 'center' ? '-50%' : textAlign === 'right' ? '-100%' : '0',
                                                }}
                                            >
                                                {layer.content}
                                            </div>
                                        </div>
                                    ) : (
                                        <AutoFitText
                                            content={layer.content}
                                            defaultColor={layer.color}
                                            maxFontSize={Math.max(12, Math.round(
                                                (layer.textStyle === 'headline' ? 128 : layer.textStyle === 'body' ? 32 : layer.textStyle === 'cta' ? 72 : layer.fontSize)
                                                * (previewShortSide / 1080)
                                            ))}
                                            minFontSize={Math.max(6, Math.round(
                                                (layer.textStyle === 'headline' ? 64 : layer.textStyle === 'body' ? 24 : layer.textStyle === 'cta' ? 56 : 10)
                                                * (previewShortSide / 1080)
                                            ))}
                                            lineHeight={1}
                                            maxLines={2}
                                            backgroundColor={layer.backgroundColor}
                                            textAlign={textAlign}
                                            animClass={animClass}
                                            opacity={!isInTimeRange ? 0 : undefined}
                                            fontWeight={layerFontWeight}
                                            fontFamily={layerFontFamily}
                                            textShadow={layer.textShadow}
                                            onFontSizeResolved={(fittedPreviewPx) => {
                                                const scale = previewShortSide > 0 ? 1080 / previewShortSide : 1;
                                                const nativePx = Math.round(fittedPreviewPx * scale);
                                                if (onLayerFontSizeResolved) onLayerFontSizeResolved(layer.id, nativePx);
                                            }}
                                        />
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>

                {/* Safe area overlay — per-resolution zones from SAFE_ZONES config */}
                {showSafeArea && (() => {
                    const vw = videoDims.width || 1080;
                    const vh = videoDims.height || 1920;
                    const resKey = `${vw}x${vh}` as VideoResolution;
                    const z = SAFE_ZONES[resKey] ?? SAFE_ZONES['1080x1920'];

                    // Convert px values to % of canvas dimensions
                    const pctTop        = (z.marginTop    / vh) * 100;
                    const pctContentTop = (z.contentTop   / vh) * 100;
                    const pctBottom     = (z.marginBottom / vh) * 100;
                    const pctLeft       = (z.marginLeft   / vw) * 100;
                    const pctRight      = (z.marginRight  / vw) * 100;

                    const subtitleBottom = (z.subtitleBottom / vh) * 100;
                    const subtitleTop    = subtitleBottom + (z.subtitleHeight / vh) * 100;
                    const subtitleLeft   = z.subtitleWidth ? (((vw - z.subtitleWidth) / 2) / vw) * 100 : pctLeft;
                    const subtitleRight  = z.subtitleWidth ? (((vw - z.subtitleWidth) / 2) / vw) * 100 : pctRight;

                    const noteBottom = (z.noteBottom / vh) * 100;
                    const noteTop    = noteBottom + (z.noteHeight / vh) * 100;
                    const noteLeft   = z.noteWidth ? (((vw - z.noteWidth) / 2) / vw) * 100 : pctLeft;
                    const noteRight  = z.noteWidth ? (((vw - z.noteWidth) / 2) / vw) * 100 : pctRight;

                    // Optional content-top / content-bottom rectangles
                    const contentTopRectW      = z.contentTopWidth    ? (z.contentTopWidth    / vw) * 100 : null;
                    const contentBottomRectW   = z.contentBottomWidth ? (z.contentBottomWidth / vw) * 100 : null;
                    const contentBottomH       = ((z.contentBottomHeight ?? z.subtitleBottom) / vh) * 100;
                    const contentBottomIsRight = z.contentBottomAlign === 'right';

                    return (
                        <div
                            className="absolute inset-0 pointer-events-none"
                            style={{ zIndex: 20 }}
                        >
                            {/* 🔴 Action safe — box-shadow paints red outside the safe rect */}
                            <div
                                className="absolute"
                                style={{
                                    top: `${pctTop}%`,
                                    left: `${pctLeft}%`,
                                    right: `${pctRight}%`,
                                    bottom: `${pctBottom}%`,
                                    background: 'transparent',
                                    boxShadow: '0 0 0 9999px rgba(239,68,68,0.22)',
                                    border: '1.5px dashed rgba(239,68,68,0.9)',
                                }}
                            />
                            {/* 🔴 Action safe label */}
                            <div
                                className="absolute text-[6px] font-mono text-red-400/80 px-1"
                                style={{ top: `${pctTop + 0.5}%`, left: `${pctLeft + 0.5}%` }}
                            >
                                Safe ({z.marginTop}px top / {z.marginLeft}px sides)
                            </div>

                            {/* 🟠 Content top zone — rect (0,0)→(contentTopWidth, contentTop) or band between marginTop and contentTop */}
                            {contentTopRectW !== null ? (
                                <>
                                    <div
                                        className="absolute"
                                        style={{
                                            top: 0,
                                            left: 0,
                                            width: `${contentTopRectW}%`,
                                            height: `${pctContentTop}%`,
                                            background: 'rgba(251,146,60,0.20)',
                                            borderRight: '1.5px dashed rgba(251,146,60,0.9)',
                                            borderBottom: '1.5px dashed rgba(251,146,60,0.9)',
                                        }}
                                    />
                                    <div
                                        className="absolute text-[6px] font-mono text-orange-400/90 px-1"
                                        style={{ top: `${pctContentTop + 0.5}%`, left: '0.5%' }}
                                    >
                                        Content top ({z.contentTopWidth}×{z.contentTop}px)
                                    </div>
                                </>
                            ) : z.contentTop > z.marginTop && (
                                <>
                                    <div
                                        className="absolute"
                                        style={{
                                            top: `${pctTop}%`,
                                            left: `${pctLeft}%`,
                                            right: `${pctRight}%`,
                                            bottom: `${100 - pctContentTop}%`,
                                            background: 'rgba(251,146,60,0.20)',
                                            borderLeft: '1px solid rgba(251,146,60,0.7)',
                                            borderRight: '1px solid rgba(251,146,60,0.7)',
                                            borderBottom: '1.5px dashed rgba(251,146,60,0.9)',
                                        }}
                                    />
                                    <div
                                        className="absolute text-[6px] font-mono text-orange-400/90 px-1"
                                        style={{ top: `${pctContentTop + 0.5}%`, left: `${pctLeft + 0.5}%` }}
                                    >
                                        Content ({z.contentTop}px from top)
                                    </div>
                                </>
                            )}

                            {/* 🟦 Subtitle zone band — centered when subtitleWidth is set */}
                            <div
                                className="absolute"
                                style={{
                                    top: `${100 - subtitleTop}%`,
                                    left: `${subtitleLeft}%`,
                                    right: `${subtitleRight}%`,
                                    bottom: `${subtitleBottom}%`,
                                    background: 'rgba(20,184,166,0.18)',
                                    border: '1px solid rgba(20,184,166,0.6)',
                                }}
                            />
                            <div
                                className="absolute text-[6px] font-mono text-teal-400/90 px-1"
                                style={{ bottom: `${subtitleTop + 0.5}%`, left: `${subtitleLeft + 0.5}%` }}
                            >
                                Subtitle · {z.subtitleWidth ?? ''}×{z.subtitleHeight}px · {z.subtitleBottom + z.subtitleHeight}px from bottom
                            </div>

                            {/* 🟩 Content bottom rectangle — anchored bottom-left or bottom-right */}
                            {contentBottomRectW !== null && (
                                <>
                                    <div
                                        className="absolute"
                                        style={{
                                            bottom: 0,
                                            ...(contentBottomIsRight
                                                ? { right: 0, borderLeft: '1.5px dashed rgba(34,197,94,0.8)' }
                                                : { left:  0, borderRight: '1.5px dashed rgba(34,197,94,0.8)' }
                                            ),
                                            width: `${contentBottomRectW}%`,
                                            height: `${contentBottomH}%`,
                                            background: 'rgba(34,197,94,0.15)',
                                            borderTop: '1.5px dashed rgba(34,197,94,0.8)',
                                        }}
                                    />
                                    <div
                                        className="absolute text-[6px] font-mono text-green-400/90 px-1"
                                        style={{
                                            bottom: `${contentBottomH + 0.3}%`,
                                            ...(contentBottomIsRight ? { right: '0.5%' } : { left: '0.5%' }),
                                        }}
                                    >
                                        Content bottom<br />{z.contentBottomWidth}×{z.contentBottomHeight ?? z.subtitleBottom}px
                                    </div>
                                </>
                            )}

                            {/* 🟨 Note / disclaimer zone band — centered when noteWidth is set */}
                            <div
                                className="absolute"
                                style={{
                                    top: `${100 - noteTop}%`,
                                    left: `${noteLeft}%`,
                                    right: `${noteRight}%`,
                                    bottom: `${noteBottom}%`,
                                    background: 'rgba(234,179,8,0.18)',
                                    border: '1px solid rgba(234,179,8,0.6)',
                                }}
                            />
                            <div
                                className="absolute text-[6px] font-mono text-yellow-400/90 px-1"
                                style={{ bottom: `${noteTop + 0.3}%`, left: `${noteLeft + 0.5}%` }}
                            >
                                Note · {z.noteWidth ?? ''}×{z.noteHeight}px · {z.noteBottom}px from bottom
                            </div>

                        </div>
                    );
                })()}

                {/* Play/Pause button - only show when no text layers */}
                {textLayers.length === 0 && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePlay();
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
                        style={{ zIndex: 5 }}
                    >
                        <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                            {isPlaying ? (
                                <Pause className="w-8 h-8 text-gray-900" />
                            ) : (
                                <Play className="w-8 h-8 text-gray-900 ml-1" />
                            )}
                        </div>
                    </button>
                )}

                {/* Controls Bar */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    {/* Progress Bar — supports click + drag */}
                    <div
                        ref={progressBarRef}
                        className="h-3 flex items-center mb-2 cursor-pointer group touch-none"
                        onPointerDown={handleProgressPointerDown}
                        onPointerMove={handleProgressPointerMove}
                        onPointerUp={handleProgressPointerUp}
                        onPointerCancel={handleProgressPointerUp}
                    >
                        <div className="relative w-full h-1.5 bg-white/30 rounded-full">
                            <div
                                className="h-full bg-primary rounded-full relative"
                                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow transition-transform group-hover:scale-125" />
                            </div>
                        </div>
                    </div>

                    {/* Time and Controls */}
                    <div className="flex items-center justify-between text-white text-xs">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={goToFirstFrame}
                                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                                title="Go to first frame"
                                disabled={isPlaying}
                            >
                                <SkipBack className="w-4 h-4" />
                            </button>
                            <button
                                onClick={togglePlay}
                                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                            >
                                {isPlaying ? (
                                    <Pause className="w-4 h-4" />
                                ) : (
                                    <Play className="w-4 h-4" />
                                )}
                            </button>
                            <button
                                onClick={goToLastFrame}
                                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                                title="Go to last frame"
                                disabled={isPlaying}
                            >
                                <SkipForward className="w-4 h-4" />
                            </button>
                            <button
                                onClick={restartScene}
                                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                                title="Restart scene"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                            {forceMuted ? (
                                // Audio is controlled externally (e.g. dubbed track) — show a
                                // non-interactive indicator so the user knows audio is active
                                <span className="p-1.5 opacity-40" title="Audio controlled by dubbed track">
                                    <Volume2 className="w-4 h-4" />
                                </span>
                            ) : (
                                <button
                                    onClick={toggleMute}
                                    className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                                    title={isMuted ? "Unmute" : "Mute"}
                                >
                                    {isMuted ? (
                                        <VolumeX className="w-4 h-4" />
                                    ) : (
                                        <Volume2 className="w-4 h-4" />
                                    )}
                                </button>
                            )}
                        </div>

                        <span className="font-mono">
                            {formatRelFrame(currentTime - startTime)} / {formatRelFrame(duration)}
                        </span>

                    </div>
                </div>
            </div>
        </div>
    );
}

// Module-level lock — survives React Strict Mode double-invocation and component remounts.
// Reset when scriptEntries are cleared (new session / new analysis).
let _scriptAutoPopulateLock = false;

function EditTextStepContent() {
    const { video, segments, setSegments, setCurrentStep, addTextLayer, removeTextLayer, updateTextLayer, scriptEntries, scriptAutoPopulated, setScriptAutoPopulated, outroConfig, suggestedTextColor, suggestedOutroTextColor } = useAppStore();
    const [activeSegment, setActiveSegment] = useState(0);
    const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
    const [showSafeArea, setShowSafeArea] = useState(false);

    // Copywriting state
    const [isCopywriting, setIsCopywriting] = useState(false);
    const [copywriteError, setCopywriteError] = useState<string | null>(null);

    const currentSegment = segments[activeSegment];
    const startTime = currentSegment?.timecode.startTime ?? 0;
    const endTime = currentSegment?.timecode.endTime ?? 0;
    const currentScriptEntry = scriptEntries[activeSegment];

    // Reset the module-level lock whenever scriptEntries are cleared so a new
    // analysis run can auto-populate again.
    useEffect(() => {
        if (scriptEntries.length === 0) {
            _scriptAutoPopulateLock = false;
        }
    }, [scriptEntries.length]);

    // Auto-populate text layers from script entries — guarded by both the
    // module-level synchronous lock (survives Strict Mode double-invoke) and
    // the store-level flag (survives full component remounts).
    useEffect(() => {
        if (_scriptAutoPopulateLock || scriptAutoPopulated) return;
        if (scriptEntries.length === 0 || segments.length === 0) return;

        // Acquire the synchronous lock immediately — before any async state update
        _scriptAutoPopulateLock = true;
        setScriptAutoPopulated(true);

        // Build all new layers in one pass, then apply with a single setSegments call
        // (avoids Zustand stale-state issue when addTextLayer is called multiple times
        //  in the same synchronous block — each call would read the pre-update snapshot)
        const updatedSegments = segments.map((seg, i) => {
            const entry = scriptEntries[i];
            const isOutro = seg.isOutro ?? false;

            // Skip if no entry, or segment already has layers
            if (!entry || seg.textLayers.length > 0) return seg;
            // For outro: always proceed (we always create a disclaimer layer even if empty)
            // For other scenes: skip if no textOnScreen
            if (!isOutro && !entry.textOnScreen) return seg;

            const vH = video?.height ?? 1920;
            const vW = video?.width ?? 1080;
            const resKey = `${vW}x${vH}` as VideoResolution;
            const tcPos = (POSITION_GRID[resKey] ?? POSITION_GRID['1080x1920']).TC;
            // Outro positions: CTA centered at ~49% of frame height, disclaimer at ~77%
            const outroCta  = { x: Math.round(vW / 2), y: Math.round(vH * 0.4922), anchor: 'middle' as const };
            const outroDisc = { x: Math.round(vW / 2), y: Math.round(vH * 0.7667), anchor: 'middle' as const };
            const mainPos = isOutro ? outroCta : tcPos;
            const fontSize = isOutro ? outroConfig.ctaFontSize : 128;
            const startTime = isOutro ? 2 : 0;

            const newLayers: TextLayer[] = [...seg.textLayers];

            // CTA / main text layer
            if (entry.textOnScreen) {
                // Outro: strip all color markup — only plain #181C25 text allowed
                const ctaContent = isOutro
                    ? entry.textOnScreen.replace(/\{(?:red|white|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$1')
                    : entry.textOnScreen;
                newLayers.push({
                    id: `text-script-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    segmentId: seg.id,
                    content: ctaContent,
                    positionX: mainPos.x,
                    positionY: mainPos.y,
                    positionAnchor: mainPos.anchor,
                    fontFamily: "Inter",
                    fontSize,
                    fontWeight: isOutro ? undefined : 800,
                    textStyle: isOutro ? undefined : 'headline',
                    color: isOutro ? suggestedOutroTextColor : suggestedTextColor,
                    animationType: "slide-up",
                    animationDuration: 0.5,
                    startTime,
                    endTime: -1,
                });
            }

            // Outro: always add disclaimer layer (even if empty so user can fill it in)
            if (isOutro) {
                newLayers.push({
                    id: `text-disclaimer-${i}-${Date.now() + 1}-${Math.random().toString(36).slice(2, 7)}`,
                    segmentId: seg.id,
                    // Strip any color markup from disclaimer too
                    content: stripDisclaimerPrefix(entry.disclaimer || '').replace(/\{(?:red|white|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$1'),
                    positionX: outroDisc.x,
                    positionY: outroDisc.y,
                    positionAnchor: outroDisc.anchor,
                    fontFamily: "Inter",
                    fontSize: 24,
                    fontWeight: 400, // Inter Regular
                    color: suggestedOutroTextColor,
                    animationType: "fade",
                    animationDuration: 0.5,
                    startTime: 2,
                    endTime: -1,
                });
            }

            return { ...seg, textLayers: newLayers };
        });
        setSegments(updatedSegments);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segments.length, scriptEntries.length]);

    const handleAddText = () => {
        if (segments[activeSegment]) {
            const newLayerId = `text-${Date.now()}`;
            const resKey = (video ? `${video.width}x${video.height}` : '1080x1920') as VideoResolution;
            const defaultPos = (POSITION_GRID[resKey] ?? POSITION_GRID['1080x1920']).TC;
            addTextLayer(segments[activeSegment].id, {
                id: newLayerId,
                segmentId: segments[activeSegment].id,
                content: "Your text here",
                positionX: defaultPos.x,
                positionY: defaultPos.y,
                positionAnchor: defaultPos.anchor,
                fontFamily: "Inter",
                fontSize: 128,
                fontWeight: 800,
                textStyle: 'headline',
                color: suggestedTextColor,
                animationType: "slide-up",
                animationDuration: 0.5,
                startTime: 0,
                endTime: 3,
            });
            setEditingLayerId(newLayerId);
        }
    };

    // Re-apply AI data: clears all AI-generated text layers and re-populates from scriptEntries
    const handleReapplyAIData = () => {
        if (scriptEntries.length === 0) return;

        // Clear all existing text layers on all segments
        const clearedSegments = segments.map(seg => ({ ...seg, textLayers: [] }));
        setSegments(clearedSegments);

        // Reset locks so auto-populate runs again
        _scriptAutoPopulateLock = false;
        setScriptAutoPopulated(false);

        // Immediately re-populate (synchronously, using the cleared segments)
        _scriptAutoPopulateLock = true;
        setScriptAutoPopulated(true);

        const updatedSegments = clearedSegments.map((seg, i) => {
            const entry = scriptEntries[i];
            // Skip if no entry at all
            const isOutro = seg.isOutro ?? false;
            if (!entry) return seg;
            // For outro: always proceed (we always create a disclaimer layer even if empty)
            // For other scenes: skip if no textOnScreen
            if (!isOutro && !entry.textOnScreen) return seg;

            const vH2 = video?.height ?? 1920;
            const vW2 = video?.width ?? 1080;
            const resKey2 = `${vW2}x${vH2}` as VideoResolution;
            const tcPos2 = (POSITION_GRID[resKey2] ?? POSITION_GRID['1080x1920']).TC;
            const outroCta2  = { x: Math.round(vW2 / 2), y: Math.round(vH2 * 0.4922), anchor: 'middle' as const };
            const outroDisc2 = { x: Math.round(vW2 / 2), y: Math.round(vH2 * 0.7667), anchor: 'middle' as const };
            const mainPos2 = isOutro ? outroCta2 : tcPos2;
            const fontSize = isOutro ? 40 : 128;
            const startTime = isOutro ? 2 : 0;

            // CTA layer — only if textOnScreen is present
            // Outro: strip all color markup — only plain #181C25 text allowed
            const ctaContent = (isOutro && entry.textOnScreen)
                ? entry.textOnScreen.replace(/\{(?:red|white|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$1')
                : entry.textOnScreen;
            const ctaLayers = entry.textOnScreen ? [{
                id: `text-script-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                segmentId: seg.id,
                content: ctaContent,
                positionX: mainPos2.x,
                positionY: mainPos2.y,
                positionAnchor: mainPos2.anchor,
                fontFamily: "Inter",
                fontSize,
                fontWeight: isOutro ? undefined : 800,
                textStyle: isOutro ? undefined : 'headline' as const,
                color: isOutro ? suggestedOutroTextColor : suggestedTextColor,
                animationType: "slide-up" as const,
                animationDuration: 0.5,
                startTime,
                endTime: -1 as number,
            }] : [];

            // Outro: always add disclaimer layer (even if empty so user can fill it in)
            const disclaimerLayers = isOutro ? [{
                id: `text-disclaimer-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                segmentId: seg.id,
                // Strip any color markup from disclaimer too
                content: stripDisclaimerPrefix(entry.disclaimer || '').replace(/\{(?:red|white|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$1'),
                positionX: outroDisc2.x,
                positionY: outroDisc2.y,
                positionAnchor: outroDisc2.anchor,
                fontFamily: "Inter",
                fontSize: 24,
                fontWeight: 400, // Inter Regular
                color: suggestedOutroTextColor,
                animationType: "fade" as const,
                animationDuration: 0.5,
                startTime: 2,
                endTime: -1 as number,
            }] : [];

            return {
                ...seg,
                textLayers: [...ctaLayers, ...disclaimerLayers],
            };
        });
        setSegments(updatedSegments);
        setEditingLayerId(null);
    };

    const handleTextChange = (layerId: string, content: string) => {
        if (currentSegment) {
            updateTextLayer(currentSegment.id, layerId, { content });
        }
    };

    const handleDeleteLayer = (layerId: string) => {
        if (currentSegment) {
            removeTextLayer(currentSegment.id, layerId);
            if (editingLayerId === layerId) {
                setEditingLayerId(null);
            }
        }
    };

    // Convert text layers to overlay format
    const textLayerOverlays: TextLayerOverlay[] = currentSegment?.textLayers.map(layer => ({
        id: layer.id,
        content: layer.content,
        positionX: layer.positionX,
        positionY: layer.positionY,
        positionAnchor: layer.positionAnchor,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight ?? 800,
        textStyle: layer.textStyle,
        color: layer.color,
        backgroundColor: layer.backgroundColor,
        animationType: layer.animationType,
        startTime: layer.startTime,
        endTime: layer.endTime,
    })) ?? [];

    return (
        <div className="pt-4 space-y-4">
            {/* Auto-populate banner with Re-apply button */}
            {scriptEntries.length > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20">
                    <Check className="w-4 h-4 text-success shrink-0" />
                    <p className="text-xs text-success font-medium flex-1">
                        {scriptAutoPopulated
                            ? "Text layers auto-populated from script. Review and edit as needed."
                            : "Script data available — click Re-apply to populate text layers."}
                    </p>
                    <button
                        type="button"
                        onClick={handleReapplyAIData}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-[11px] font-medium transition-colors shrink-0"
                        title="Clear all text layers and re-populate from latest AI analysis"
                    >
                        <Scan className="w-3 h-3" />
                        Re-apply AI data
                    </button>
                </div>
            )}

            {/* Scene Video Preview with Text Overlays */}
            {video && currentSegment && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                            Scene {activeSegment + 1} Preview
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSafeArea(v => !v)}
                                className={cn(
                                    "flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors",
                                    showSafeArea
                                        ? "border-red-400/60 text-red-400 bg-red-400/10"
                                        : "border-border text-muted-foreground hover:border-red-400/40 hover:text-red-400"
                                )}
                                title="Toggle safe area overlay"
                            >
                                <Settings2 className="w-3 h-3" />
                                Safe Area
                            </button>
                            <span className="text-xs text-muted-foreground font-mono">
                                F{Math.round(startTime * (video.frameRate ?? 30))} – F{Math.round(endTime * (video.frameRate ?? 30))}
                            </span>
                        </div>
                    </div>
                    <SceneVideoPlayer
                        videoUrl={video.url}
                        startTime={startTime}
                        endTime={endTime}
                        textLayers={textLayerOverlays}
                        fps={video.frameRate ?? 30}
                        videoFile={video.file}
                        showSafeArea={showSafeArea}
                        videoWidth={video.width}
                        videoHeight={video.height}
                        overlayRenderMode="canvas"
                        onLayerFontSizeResolved={(layerId, nativePx) => {
                            if (currentSegment) {
                                const layer = currentSegment.textLayers.find(l => l.id === layerId);
                                if (layer?.textStyle) {
                                    updateTextLayer(currentSegment.id, layerId, { fontSize: nativePx });
                                }
                            }
                        }}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                        {(() => {
                            const resKey = video ? `${video.width}x${video.height}` as VideoResolution : '1080x1920';
                            const z = SAFE_ZONES[resKey] ?? SAFE_ZONES['1080x1920'];
                            return `Use position grid to place text • Safe: ${z.marginTop}px top / ${z.marginBottom}px bottom / ${z.marginLeft}px sides • Content from ${z.contentTop}px top • Subtitle: ${z.subtitleBottom}px from bottom`;
                        })()}
                    </p>
                </div>
            )}

            {/* Voiceover reference for current scene */}
            {currentScriptEntry && currentScriptEntry.voiceover && (
                <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                    <div className="flex items-center gap-2 mb-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Voiceover Reference</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-auto">Scene {activeSegment + 1}</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{currentScriptEntry.voiceover}</p>
                </div>
            )}

            {/* Segment selector */}
            <div className="flex gap-2 flex-wrap pb-2">
                {segments.map((seg, i) => {
                    const isOutro = seg.isOutro ?? false;
                    return (
                        <button
                            key={seg.id}
                            onClick={() => {
                                setActiveSegment(i);
                                setEditingLayerId(null);
                            }}
                            className={cn(
                                "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                                activeSegment === i
                                    ? isOutro ? "bg-amber-500 text-white" : "bg-primary text-white"
                                    : "bg-surface-elevated hover:bg-muted"
                            )}
                        >
                            {isOutro ? '🎬 Outro' : `Scene ${i + 1}`}
                            {seg.textLayers.length > 0 && (
                                <span className="ml-1 text-xs opacity-70">({seg.textLayers.length})</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Outro scene indicator */}
            {segments[activeSegment]?.isOutro && segments.length > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <span className="text-base">🎬</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-400">Outro Scene — CTA Text</p>
                        <p className="text-xs text-muted-foreground">CTA centered horizontally • 945px from top (49.2%) • 40px font • animation starts at 2s</p>
                    </div>
                </div>
            )}

            {/* Text layers for active segment */}
            <div className="space-y-2">
                {currentSegment?.textLayers.map((layer) => (
                    <div
                        key={layer.id}
                        className={cn(
                            "p-3 rounded-lg bg-surface-elevated border transition-colors",
                            editingLayerId === layer.id ? "border-primary" : "border-border"
                        )}
                    >
                        {editingLayerId === layer.id ? (
                            <div className="space-y-3">
                                {/* Text content with color tag support */}
                                <div className="space-y-1.5">
                                    <textarea
                                        id={`text-input-${layer.id}`}
                                        value={layer.content}
                                        onChange={(e) => handleTextChange(layer.id, e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm resize-none"
                                        placeholder="Enter text... Use {red:word} for colored words"
                                        rows={2}
                                    />
                                    {/* Word color buttons - select text then click to colorize */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">Word color:</span>
                                        {[
                                            { tag: 'white', color: '#ffffff', label: 'W' },
                                            { tag: 'red', color: '#ff444f', label: 'R' },
                                            { tag: 'dark', color: '#181C25', label: 'D' },
                                        ].map((c) => (
                                            <button
                                                key={c.tag}
                                                type="button"
                                                onClick={() => {
                                                    const textarea = document.getElementById(`text-input-${layer.id}`) as HTMLTextAreaElement;
                                                    if (!textarea) return;
                                                    const start = textarea.selectionStart;
                                                    const end = textarea.selectionEnd;
                                                    const text = layer.content;
                                                    if (start === end) {
                                                        // No selection - insert placeholder
                                                        const newText = text.slice(0, start) + `{${c.tag}:text}` + text.slice(end);
                                                        handleTextChange(layer.id, newText);
                                                    } else {
                                                        // Wrap selected text
                                                        const selected = text.slice(start, end);
                                                        const newText = text.slice(0, start) + `{${c.tag}:${selected}}` + text.slice(end);
                                                        handleTextChange(layer.id, newText);
                                                    }
                                                    // Refocus textarea
                                                    setTimeout(() => textarea.focus(), 50);
                                                }}
                                                className="w-6 h-6 rounded-full border border-border hover:border-primary transition-all flex items-center justify-center text-[9px] font-bold"
                                                style={{ backgroundColor: c.color, color: c.color === '#ffffff' ? '#333' : '#fff' }}
                                                title={`Color selected text ${c.label === 'W' ? 'white' : c.label === 'R' ? 'red' : 'dark'}`}
                                            />
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                // Remove all color tags from content
                                                const cleaned = layer.content.replace(/\{(white|red|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$2');
                                                handleTextChange(layer.id, cleaned);
                                            }}
                                            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border hover:border-primary transition-colors"
                                            title="Remove all color formatting"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-muted-foreground">
                                        Select text then click a color circle, or type <code className="bg-muted px-1 rounded">{'{red:word}'}</code>
                                    </p>
                                </div>

                                {/* Text style radio buttons */}
                                {(() => {
                                    const effectiveStyle = layer.textStyle ?? 'headline';
                                    const headlineSizes = [64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124, 128];
                                    const bodySizes = [24, 28, 32];
                                    return (
                                        <>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Text Style</label>
                                                <div className="flex gap-3">
                                                    {/* Headlines & Subheadlines */}
                                                    <label className={cn(
                                                        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all flex-1",
                                                        effectiveStyle === 'headline'
                                                            ? "border-primary bg-primary/10"
                                                            : "border-border hover:border-muted-foreground"
                                                    )}>
                                                        <input
                                                            type="radio"
                                                            name={`text-style-${layer.id}`}
                                                            value="headline"
                                                            checked={effectiveStyle === 'headline'}
                                                            onChange={() => updateTextLayer(currentSegment!.id, layer.id, {
                                                                textStyle: 'headline',
                                                                fontSize: 128,
                                                                fontWeight: 800,
                                                            })}
                                                            className="accent-primary"
                                                        />
                                                        <span className="text-xs font-extrabold tracking-tight leading-none">Headlines</span>
                                                    </label>
                                                    {/* Body Text */}
                                                    <label className={cn(
                                                        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all flex-1",
                                                        effectiveStyle === 'body'
                                                            ? "border-primary bg-primary/10"
                                                            : "border-border hover:border-muted-foreground"
                                                    )}>
                                                        <input
                                                            type="radio"
                                                            name={`text-style-${layer.id}`}
                                                            value="body"
                                                            checked={effectiveStyle === 'body'}
                                                            onChange={() => updateTextLayer(currentSegment!.id, layer.id, {
                                                                textStyle: 'body',
                                                                fontSize: 32,
                                                                fontWeight: 400,
                                                            })}
                                                            className="accent-primary"
                                                        />
                                                        <span className="text-xs font-normal tracking-tight leading-none">Body Text</span>
                                                    </label>
                                                </div>
                                                {/* Font preview */}
                                                <p className={cn(
                                                    "text-[11px] text-muted-foreground pl-0.5",
                                                    effectiveStyle === 'headline' ? "font-extrabold" : "font-normal"
                                                )}>
                                                    {effectiveStyle === 'headline' ? 'Inter ExtraBold' : 'Inter Regular'}
                                                </p>
                                            </div>

                                            {/* Style controls row */}
                                            <div className="grid grid-cols-3 gap-2">
                                                {/* Font size — auto-fit display when textStyle set, manual dropdown otherwise */}
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Size</label>
                                                    {layer.textStyle ? (
                                                        <div
                                                            className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-muted-foreground"
                                                            title={`Auto-fit: ${effectiveStyle === 'headline' ? '64–128' : '24–32'}px range`}
                                                        >
                                                            {layer.fontSize}px <span className="text-[9px] opacity-60">auto</span>
                                                        </div>
                                                    ) : (
                                                        <select
                                                            value={layer.fontSize}
                                                            onChange={(e) => updateTextLayer(currentSegment!.id, layer.id, { fontSize: Number(e.target.value) })}
                                                            className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs"
                                                        >
                                                            {(effectiveStyle === 'headline' ? headlineSizes : bodySizes).map(size => (
                                                                <option key={size} value={size}>{size}px</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>

                                                {/* Base Color */}
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Base Color</label>
                                                    <div className="flex gap-2">
                                                        {[
                                                            { value: '#ffffff', label: 'White' },
                                                            { value: '#ff444f', label: 'Red' },
                                                            { value: '#181C25', label: 'Dark' },
                                                        ].map((color) => (
                                                            <button
                                                                key={color.value}
                                                                type="button"
                                                                onClick={() => updateTextLayer(currentSegment!.id, layer.id, { color: color.value })}
                                                                className={cn(
                                                                    "w-8 h-8 rounded-full border-2 transition-all",
                                                                    layer.color === color.value
                                                                        ? "border-primary ring-2 ring-primary/30 scale-110"
                                                                        : "border-border hover:border-muted-foreground"
                                                                )}
                                                                style={{ backgroundColor: color.value }}
                                                                title={color.label}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Animation */}
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Animation</label>
                                                    <select
                                                        value={layer.animationType}
                                                        onChange={(e) => updateTextLayer(currentSegment!.id, layer.id, { animationType: e.target.value as AnimationType })}
                                                        className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs"
                                                    >
                                                        <option value="none">None</option>
                                                        <option value="fade">Fade</option>
                                                        <option value="slide-up">Slide Up</option>
                                                        <option value="slide-down">Slide Down</option>
                                                        <option value="scale">Scale</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}

                                {/* Timing controls */}
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Start (s)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={endTime - startTime}
                                                step={0.1}
                                                value={layer.startTime}
                                                onChange={(e) => updateTextLayer(currentSegment!.id, layer.id, { startTime: Number(e.target.value) })}
                                                className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs font-mono"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                                End (s) {layer.endTime === -1 && <span className="text-primary">∞</span>}
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={endTime - startTime}
                                                step={0.1}
                                                value={layer.endTime === -1 ? '' : layer.endTime}
                                                placeholder="∞"
                                                disabled={layer.endTime === -1}
                                                onChange={(e) => updateTextLayer(currentSegment!.id, layer.id, { endTime: Number(e.target.value) })}
                                                className={cn(
                                                    "w-full px-2 py-1.5 rounded bg-background border border-border text-xs font-mono",
                                                    layer.endTime === -1 && "opacity-50"
                                                )}
                                            />
                                        </div>
                                    </div>
                                    {/* Stay until end toggle */}
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={layer.endTime === -1}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    updateTextLayer(currentSegment!.id, layer.id, { endTime: -1 });
                                                } else {
                                                    // Set to scene duration when unchecked
                                                    updateTextLayer(currentSegment!.id, layer.id, { endTime: Math.min(3, endTime - startTime) });
                                                }
                                            }}
                                            className="w-3.5 h-3.5 rounded border-border accent-primary"
                                        />
                                        <span className="text-xs text-muted-foreground">Stay until end of scene (no exit animation)</span>
                                    </label>
                                </div>

                                {/* Position Grid - 3x3 preset positions, pixel-exact per resolution */}
                                <div className="space-y-2">
                                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Position</label>
                                    <div className="grid grid-cols-3 gap-1 w-fit">
                                        {(() => {
                                            const resKey = video ? `${video.width}x${video.height}` as VideoResolution : '1080x1920';
                                            const posGrid = POSITION_GRID[resKey] ?? POSITION_GRID['1080x1920'];
                                            const allowedPos = POSITION_CONSTRAINTS[resKey] ?? GRID_ORDER;
                                            return GRID_ORDER.map((label) => {
                                                const pos = posGrid[label];
                                                const isSelected = Math.abs(layer.positionX - pos.x) < 20 && Math.abs(layer.positionY - pos.y) < 20;
                                                const isAllowed = (allowedPos as GridPosition[]).includes(label);
                                                return (
                                                    <button
                                                        key={label}
                                                        type="button"
                                                        disabled={!isAllowed}
                                                        onClick={() => isAllowed && updateTextLayer(currentSegment!.id, layer.id, { positionX: pos.x, positionY: pos.y, positionAnchor: pos.anchor })}
                                                        className={cn(
                                                            "w-8 h-8 rounded border text-[10px] font-medium transition-all",
                                                            isSelected
                                                                ? "bg-primary text-white border-primary"
                                                                : isAllowed
                                                                    ? "bg-background border-border hover:border-primary hover:bg-primary/10"
                                                                    : "bg-muted/30 border-border/30 text-muted-foreground/30 cursor-not-allowed"
                                                        )}
                                                        title={`${GRID_POSITION_LABELS[label]}${!isAllowed ? ' — not available for this resolution' : ''}`}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>

                                {/* Delete button */}
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => handleDeleteLayer(layer.id)}
                                        className="text-red-400 hover:text-red-300 p-1 flex items-center gap-1 text-xs"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Delete</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => setEditingLayerId(layer.id)}
                            >
                                <Type className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="flex-1 text-sm truncate">{layer.content.replace(/\{(white|red|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$2')}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{layer.animationType}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteLayer(layer.id);
                                    }}
                                    className="text-muted-foreground hover:text-red-400 p-1 shrink-0"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                <Button variant="outline" size="sm" onClick={handleAddText} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Text Layer
                </Button>

                {segments.some(s => s.textLayers.length > 0) && (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-red-400 border-red-400/30 hover:bg-red-400/10 hover:border-red-400/50"
                            onClick={() => {
                                if (window.confirm('Remove all text overlays from all scenes?')) {
                                    setSegments(segments.map(seg => ({ ...seg, textLayers: [] })));
                                }
                            }}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Clear All Text Overlays
                        </Button>

                        {/* Dedicated copywrite button — auto-applies results directly to layers */}
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-purple-400 border-purple-400/30 hover:bg-purple-400/10 hover:border-purple-400/50"
                            disabled={isCopywriting}
                            onClick={async () => {
                                const allOverlays = segments
                                    .filter(s => !s.isOutro)
                                    .flatMap(s => s.textLayers)
                                    .map(l => l.content.replace(/\{[^}:]+:([^}]+)\}/g, '$1').trim())
                                    .filter(t => t.length > 0);

                                if (allOverlays.length === 0) return;

                                setCopywriteError(null);
                                setIsCopywriting(true);
                                try {
                                    const { copywriteOverlays } = await import('@/lib/supabase');
                                    const results = await copywriteOverlays(allOverlays);
                                    const resultMap = new Map(
                                        results.map(r => [r.original.trim(), r.formattedSentence])
                                    );
                                    setSegments(segments.map(seg => ({
                                        ...seg,
                                        textLayers: seg.textLayers.map(layer => {
                                            const plain = layer.content.replace(/\{[^}:]+:([^}]+)\}/g, '$1').trim();
                                            const suggestion = resultMap.get(plain);
                                            return suggestion ? { ...layer, content: suggestion } : layer;
                                        }),
                                    })));
                                } catch (err) {
                                    setCopywriteError(err instanceof Error ? err.message : String(err));
                                } finally {
                                    setIsCopywriting(false);
                                }
                            }}
                        >
                            {isCopywriting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Analysing copy…
                                </>
                            ) : (
                                <>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Add Copywrite
                                </>
                            )}
                        </Button>
                    </>
                )}
            </div>

            {/* Error banner */}
            {copywriteError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{copywriteError}</span>
                    <button onClick={() => setCopywriteError(null)} className="ml-auto">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {segments.some(s => s.textLayers.length > 0) ? (
                <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => setCurrentStep('translate')}
                >
                    Continue to Translation
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            ) : segments.length > 0 && (
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setCurrentStep('translate-voiceover')}
                >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    No text overlays — go to Translate Voiceover
                </Button>
            )}
        </div>
    );
}

// Strip {color:word} / [color:word] markup and return plain text + the original red word/phrase
function stripColorMarkup(text: string): { plain: string; redWord: string | null } {
    // Normalise square-bracket form → curly-bracket form first
    const normalised = text.replace(/\[([^\]:]+):([^\]]+)\]/g, '{$1:$2}');
    let redWord: string | null = null;
    const plain = normalised
        .replace(/\{red:([^}]+)\}/g, (_, word) => { redWord = word; return word; })
        .replace(/\{(?:white|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$1');
    return { plain, redWord };
}

// Re-apply red markup: find the translated red word in the translated sentence and wrap it
function reapplyRedMarkup(translated: string, translatedRedWord: string | null): string {
    if (!translatedRedWord) return translated;
    // Case-insensitive search for the translated red word in the sentence
    const escaped = translatedRedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return translated.replace(new RegExp(`(${escaped})`, 'i'), '{red:$1}');
}

function TranslateStepContent() {
    const {
        selectedLanguages, toggleLanguage, setCurrentStep,
        segments, video, translations, setTranslations, updateTranslation, isTranslating, setIsTranslating,
        detectedVoiceoverLanguage, outroConfig, setOutroConfig,
    } = useAppStore();

    // Derive source language from task 2; fall back to EN when unknown
    const textSrcLangCode = (detectedVoiceoverLanguage?.code ?? 'en').toUpperCase() as import('@/types').LanguageCode;

    const [translateProgress, setTranslateProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({});
    const [activePreviewLang, setActivePreviewLang] = useState<string>(textSrcLangCode);
    const [activePreviewScene, setActivePreviewScene] = useState(0);
    // editingTranslation: key is `${layerId}-${langCode}`
    const [editingTranslation, setEditingTranslation] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<string>('');
    const translationsDone = Object.keys(translateProgress).length > 0 &&
        Object.values(translateProgress).every(s => s === 'done' || s === 'error');

    // Per-language highlight state: 'idle' | 'running' | 'done' | 'error'
    const [highlightStatus, setHighlightStatus] = useState<Record<string, 'idle' | 'running' | 'done' | 'error'>>({});
    const [highlightError, setHighlightError] = useState<string | null>(null);

    // Derived helpers
    const isApplyingHighlights = Object.values(highlightStatus).some(s => s === 'running');
    const highlightDone = new Set(Object.entries(highlightStatus).filter(([, s]) => s === 'done').map(([k]) => k));

    // Collect all text layers across all segments, excluding the outro which has its own
    // dedicated translation flow via outroConfig.translations in OutroStepContent.
    const allLayers = segments.filter(seg => !seg.isOutro).flatMap(seg => seg.textLayers.map(l => ({ ...l, segmentId: seg.id })));

    // Run Gemini markup + \u00A0 processing for a single language.
    // Safe to call concurrently for multiple languages — no shared lock.
    const applyHighlightsToTranslations = async (langCode: string) => {
        setHighlightStatus(prev => ({ ...prev, [langCode]: 'running' }));
        setHighlightError(null);

        try {
            const { copywriteTranslateMarkup } = await import('@/lib/supabase');

            const isArabicLang = langCode.toUpperCase() === 'AR';

            // For Arabic: send ALL layers (red markup + non-breaking space insertion).
            // For other languages: send only layers with {red:...} markup.
            const pairs = allLayers
                .filter(layer => {
                    if (/\{red:[^}]+\}/.test(layer.content)) return true;
                    if (isArabicLang) {
                        const tr = (useAppStore.getState().translations.get(layer.id) ?? [])
                            .find(t => t.languageCode === langCode);
                        return tr?.translatedContent && /[\u0600-\u06FF]/.test(tr.translatedContent);
                    }
                    return false;
                })
                .map(layer => {
                    const tr = (useAppStore.getState().translations.get(layer.id) ?? [])
                        .find(t => t.languageCode === langCode);
                    return {
                        layerId: layer.id,
                        source: layer.content,
                        translation: tr?.translatedContent ?? layer.content,
                    };
                });

            if (pairs.length === 0) {
                setHighlightStatus(prev => ({ ...prev, [langCode]: 'done' }));
                return;
            }

            const results = await copywriteTranslateMarkup(pairs, langCode);

            results.forEach(({ layerId, marked }) => {
                updateTranslation(layerId, langCode as import('@/types').LanguageCode, marked);
            });

            setHighlightStatus(prev => ({ ...prev, [langCode]: 'done' }));
        } catch (err) {
            setHighlightStatus(prev => ({ ...prev, [langCode]: 'error' }));
            setHighlightError(err instanceof Error ? err.message : 'Failed to apply highlights');
        }
    };

    const startTranslation = async () => {
        if (selectedLanguages.length === 0 || allLayers.length === 0) return;
        setIsTranslating(true);
        setHighlightStatus({});
        setHighlightError(null);

        // Build plain-text array and extract red words (strip color markup for DeepL)
        const parsed = allLayers.map(l => stripColorMarkup(l.content));
        const plainTexts = parsed.map(p => p.plain);
        const redWords = parsed.map(p => p.redWord);

        // Non-null red words to translate alongside main texts
        // We track which layer indices have red words so we can map back
        const redWordLayerIndices: number[] = [];
        const redWordTexts: string[] = [];
        redWords.forEach((rw, i) => {
            if (rw) {
                redWordLayerIndices.push(i);
                redWordTexts.push(rw);
            }
        });

        // Combined batch: [plainTexts..., redWordTexts...]
        const batchTexts = [...plainTexts, ...redWordTexts];

        // Target langs = all selected languages except the detected source
        const targetLangs = selectedLanguages.filter(l => l !== textSrcLangCode);

        // Init progress
        const initProgress: Record<string, 'pending' | 'done' | 'error'> = {};
        targetLangs.forEach(l => { initProgress[l] = 'pending'; });
        // Source lang slot: just copy originals, no translation needed
        initProgress[textSrcLangCode] = 'pending';
        setTranslateProgress(initProgress);

        try {
            const { translateTexts } = await import('@/lib/supabase');

            // Source lang: store original content as-is
            allLayers.forEach(layer => {
                setTranslations(layer.id, [{
                    id: `tr-${layer.id}-${textSrcLangCode}`,
                    textLayerId: layer.id,
                    languageCode: textSrcLangCode,
                    translatedContent: layer.content,
                }]);
            });
            setTranslateProgress(prev => ({ ...prev, [textSrcLangCode]: 'done' }));

            if (targetLangs.length > 0) {
                const result = await translateTexts(batchTexts, textSrcLangCode, targetLangs);

                for (const lang of targetLangs) {
                    const langTranslations = result.translations[lang];
                    if (!langTranslations) {
                        setTranslateProgress(prev => ({ ...prev, [lang]: 'error' }));
                        continue;
                    }
                    // Split results back: first plainTexts.length are main translations,
                    // the rest are translated red words
                    const translatedMains = langTranslations.slice(0, plainTexts.length);
                    const translatedRedWords = langTranslations.slice(plainTexts.length);

                    // Build a map: layerIndex → translated red word
                    const translatedRedWordMap = new Map<number, string>();
                    redWordLayerIndices.forEach((layerIdx, j) => {
                        if (translatedRedWords[j]) {
                            translatedRedWordMap.set(layerIdx, translatedRedWords[j]);
                        }
                    });

                    allLayers.forEach((layer, i) => {
                        const translated = translatedMains[i] ?? layer.content;
                        const translatedRedWord = translatedRedWordMap.get(i) ?? null;
                        const withColor = reapplyRedMarkup(translated, translatedRedWord);
                        const existing = useAppStore.getState().translations.get(layer.id) ?? [];
                        const filtered = existing.filter(t => t.languageCode !== lang);
                        setTranslations(layer.id, [...filtered, {
                            id: `tr-${layer.id}-${lang}`,
                            textLayerId: layer.id,
                            languageCode: lang as import('@/types').LanguageCode,
                            translatedContent: withColor,
                        }]);
                    });
                    setTranslateProgress(prev => ({ ...prev, [lang]: 'done' }));
                }

                // Translate outroConfig CTA + disclaimer for each target language
                const outroTexts: string[] = [];
                if (outroConfig.ctaText.trim()) outroTexts.push(outroConfig.ctaText);
                if (outroConfig.disclaimerText.trim()) outroTexts.push(outroConfig.disclaimerText);

                if (outroTexts.length > 0) {
                    try {
                        const outroResult = await translateTexts(outroTexts, textSrcLangCode, targetLangs);
                        const updatedOutroTranslations = { ...outroConfig.translations };
                        for (const lang of targetLangs) {
                            const translated = outroResult.translations[lang];
                            if (!translated) continue;
                            let idx = 0;
                            updatedOutroTranslations[lang as import('@/types').LanguageCode] = {
                                ctaText: outroConfig.ctaText.trim() ? (translated[idx++] ?? outroConfig.ctaText) : outroConfig.ctaText,
                                disclaimerText: outroConfig.disclaimerText.trim() ? (translated[idx++] ?? outroConfig.disclaimerText) : outroConfig.disclaimerText,
                            };
                        }
                        setOutroConfig({ translations: updatedOutroTranslations });
                    } catch {
                        // Non-fatal — outro will fall back to source language text
                    }
                }
            }
            // After all translations are stored, fire Gemini markup + \u00A0 post-processing
            // for every target language concurrently (each language is independent).
            if (targetLangs.length > 0) {
                Promise.all(targetLangs.map(lang => applyHighlightsToTranslations(lang)));
            }
        } catch (err) {
            console.error('Translation failed:', err);
            alert(`Translation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            targetLangs.forEach(l => setTranslateProgress(prev => ({ ...prev, [l]: 'error' })));
        } finally {
            setIsTranslating(false);
        }
    };

    // Build preview text layers for the active scene + language
    const previewSegment = segments[activePreviewScene];
    const previewTextLayers: TextLayerOverlay[] = previewSegment?.textLayers.map(layer => {
        const langTranslations = translations.get(layer.id);
        const tr = langTranslations?.find(t => t.languageCode === activePreviewLang);
        return {
            id: layer.id,
            content: tr?.translatedContent ?? layer.content,
            positionX: layer.positionX,
            positionY: layer.positionY,
            positionAnchor: layer.positionAnchor,
            fontSize: layer.fontSize,
            fontWeight: layer.fontWeight ?? 800,
            textStyle: layer.textStyle,
            color: layer.color,
            backgroundColor: layer.backgroundColor,
            animationType: layer.animationType,
            startTime: layer.startTime,
            endTime: layer.endTime,
        };
    }) ?? [];

    const langInfo = (code: string) => SUPPORTED_LANGUAGES.find(l => l.code === code);

    return (
        <div className="pt-4 space-y-4">
            {/* Language selection */}
            <p className="text-sm text-muted-foreground">Select target languages for translation:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => {
                    const status = translateProgress[lang.code];
                    return (
                        <button
                            key={lang.code}
                            onClick={() => !isTranslating && toggleLanguage(lang.code)}
                            disabled={isTranslating}
                            className={cn(
                                "flex items-center gap-2 p-3 rounded-lg border transition-all",
                                selectedLanguages.includes(lang.code)
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border hover:border-muted-foreground/50",
                                isTranslating && "opacity-60 cursor-not-allowed"
                            )}
                        >
                            <span className="text-lg">{lang.flag}</span>
                            <span className="text-sm font-medium">{lang.name}</span>
                            {status === 'pending' && <Loader2 className="w-3.5 h-3.5 ml-auto animate-spin text-primary" />}
                            {status === 'done' && <Check className="w-3.5 h-3.5 ml-auto text-success" />}
                            {status === 'error' && <X className="w-3.5 h-3.5 ml-auto text-red-400" />}
                            {!status && selectedLanguages.includes(lang.code) && <Check className="w-4 h-4 ml-auto" />}
                        </button>
                    );
                })}
            </div>

            {/* Translate button */}
            {!translationsDone && (
                <Button
                    variant="gradient"
                    className="w-full"
                    onClick={startTranslation}
                    disabled={isTranslating || selectedLanguages.length === 0 || allLayers.length === 0}
                >
                    {isTranslating ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Translating...</>
                    ) : (
                        <>Translate to {selectedLanguages.filter(l => l !== textSrcLangCode).length} Language{selectedLanguages.filter(l => l !== textSrcLangCode).length !== 1 ? 's' : ''} <ArrowRight className="w-4 h-4 ml-2" /></>
                    )}
                </Button>
            )}

            {/* Live preview — shown after translation */}
            {translationsDone && video && segments.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Live Preview</span>
                        <Button variant="outline" size="sm" onClick={startTranslation} disabled={isTranslating}>
                            <Scan className="w-3.5 h-3.5 mr-1.5" />
                            Re-translate
                        </Button>
                    </div>

                    {/* Language tabs */}
                    <div className="flex gap-1.5 flex-wrap">
                        {selectedLanguages.map(code => {
                            const info = langInfo(code);
                            return (
                                <button
                                    key={code}
                                    onClick={() => setActivePreviewLang(code)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                        activePreviewLang === code
                                            ? "bg-primary text-white border-primary"
                                            : "border-border hover:border-primary/50 text-muted-foreground"
                                    )}
                                >
                                    <span>{info?.flag}</span>
                                    <span>{info?.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Copywrite highlights — runs automatically after translation for all languages */}
                    {(() => {
                        const isSourceLang = activePreviewLang === textSrcLangCode;
                        if (isSourceLang) return null;
                        const langStatus = highlightStatus[activePreviewLang] ?? 'idle';
                        if (langStatus === 'running') return (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-purple-400">
                                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                                <span>Applying copywrite highlights…</span>
                            </div>
                        );
                        if (langStatus === 'error') return (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{highlightError ?? 'Failed to apply highlights'}</span>
                                <button
                                    onClick={() => applyHighlightsToTranslations(activePreviewLang)}
                                    className="ml-auto underline hover:no-underline"
                                >
                                    Retry
                                </button>
                                <button onClick={() => setHighlightError(null)}>
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        );
                        return null;
                    })()}

                    {/* Scene tabs */}
                    <div className="flex gap-1.5 flex-wrap">
                        {segments.map((seg, i) => (
                            <button
                                key={i}
                                onClick={() => setActivePreviewScene(i)}
                                className={cn(
                                    "px-3 py-1 rounded-lg text-xs font-medium border transition-all",
                                    activePreviewScene === i
                                        ? "bg-primary/20 border-primary text-primary"
                                        : "border-border hover:border-primary/50 text-muted-foreground"
                                )}
                            >
                                {seg.isOutro ? '🎬 Outro' : `Scene ${i + 1}`}
                            </button>
                        ))}
                    </div>

                    {/* Video preview */}
                    {previewSegment && (
                        <SceneVideoPlayer
                            videoUrl={video.url}
                            startTime={previewSegment.timecode.startTime}
                            endTime={previewSegment.timecode.endTime}
                            textLayers={previewTextLayers}
                            fps={video.frameRate ?? 30}
                            videoFile={video.file}
                            overlayRenderMode="canvas"
                        />
                    )}

                    {/* Translated text list for current scene */}
                    <div className="space-y-1.5">
                        {previewSegment?.textLayers.map(layer => {
                            const langTranslations = translations.get(layer.id);
                            const tr = langTranslations?.find(t => t.languageCode === activePreviewLang);
                            const editKey = `${layer.id}-${activePreviewLang}`;
                            const isEditing = editingTranslation === editKey;
                            return (
                                <div key={layer.id} className="p-2.5 rounded-lg bg-surface-elevated border border-border text-xs space-y-1.5">
                                    {/* Original text — render rich markup so red highlights are visible */}
                                    <div>
                                        <span className="text-muted-foreground">Original: </span>
                                        <span className="text-foreground font-medium">
                                            <RichTextContent content={layer.content} defaultColor="currentColor" />
                                        </span>
                                    </div>

                                    {/* Translation row */}
                                    {tr && (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground shrink-0">
                                                    {langInfo(activePreviewLang)?.flag} {langInfo(activePreviewLang)?.name}:
                                                </span>
                                                {!isEditing && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingTranslation(editKey);
                                                            setEditingValue(tr.translatedContent);
                                                        }}
                                                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:border-primary hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
                                                        title="Edit translation"
                                                    >
                                                        <Type className="w-3 h-3" />
                                                        <span>Edit</span>
                                                    </button>
                                                )}
                                            </div>

                                            {isEditing ? (
                                                <div className="space-y-1.5">
                                                    <textarea
                                                        value={editingValue}
                                                        onChange={(e) => setEditingValue(e.target.value)}
                                                        rows={3}
                                                        autoFocus
                                                        className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-primary focus:outline-none text-xs resize-none font-medium text-foreground"
                                                        placeholder="Enter translation..."
                                                    />
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                updateTranslation(layer.id, activePreviewLang as import('@/types').LanguageCode, editingValue);
                                                                setEditingTranslation(null);
                                                            }}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 transition-colors"
                                                        >
                                                            <Check className="w-3 h-3" />
                                                            Save
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingTranslation(null)}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded border border-border text-muted-foreground text-[11px] hover:border-primary/50 transition-colors"
                                                        >
                                                            <X className="w-3 h-3" />
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-primary font-medium block">
                                                    <RichTextContent content={tr.translatedContent} defaultColor="#a78bfa" />
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Continue button */}
            {translationsDone && (
                <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => setCurrentStep('translate-voiceover')}
                >
                    Continue to Voiceover Translation
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// Translate Voiceover Step
// Translates the spoken script (voiceover) per scene for each language.
// ─────────────────────────────────────────────────────────
function TranslateVoiceoverStepContent() {
    const {
        selectedLanguages, toggleLanguage, setCurrentStep,
        segments,
        scriptEntries, voiceoverTranslations, setVoiceoverTranslation,
        isTranslating, setIsTranslating,
        detectedVoiceoverLanguage,
    } = useAppStore();

    const skippedTranslateText = segments.length > 0 && segments.every(s => s.textLayers.length === 0);

    const [translateProgress, setTranslateProgress] = useState<Record<string, 'pending' | 'translating' | 'done' | 'error'>>({});
    const [activeScene, setActiveScene] = useState(0);

    // Derive source language from task 2 detection; fall back to EN if unknown
    const sourceLangCode = (detectedVoiceoverLanguage?.code ?? 'en').toUpperCase() as import('@/types').LanguageCode;
    const sourceLangName = detectedVoiceoverLanguage?.name ?? 'English';

    // Scenes that have voiceover text
    const voiceoverScenes = scriptEntries
        .map((e, i) => ({ index: i, text: e.voiceover?.trim() || '' }))
        .filter(s => s.text.length > 0);

    // Source language is never a translation target
    const targetLangs = selectedLanguages.filter(l => l !== sourceLangCode);
    const allDone = Object.keys(translateProgress).length > 0 &&
        Object.values(translateProgress).every(s => s === 'done' || s === 'error');

    const startTranslation = async () => {
        if (voiceoverScenes.length === 0) {
            // No voiceover — skip straight to dubbing
            setCurrentStep('dub');
            return;
        }
        setIsTranslating(true);
        const initProgress: Record<string, 'pending' | 'translating' | 'done' | 'error'> = {};
        targetLangs.forEach(l => { initProgress[l] = 'pending'; });
        // Mark source language slot as done immediately (no translation needed)
        initProgress[sourceLangCode] = 'pending';
        setTranslateProgress(initProgress);

        try {
            const { translateTexts } = await import('@/lib/supabase');
            // Read from the source-language key; fall back to EN key (legacy) then raw text
            const texts = voiceoverScenes.map(s =>
                voiceoverTranslations.get(`${s.index}-${sourceLangCode}`) ??
                voiceoverTranslations.get(`${s.index}-EN`) ??
                s.text
            );

            // Store source originals (or edited values) immediately under the detected language key
            voiceoverScenes.forEach((s, i) => {
                setVoiceoverTranslation(s.index, sourceLangCode, texts[i]);
            });
            setTranslateProgress(prev => ({ ...prev, [sourceLangCode]: 'done' }));

            if (targetLangs.length > 0) {
                const result = await translateTexts(texts, sourceLangCode, targetLangs);
                for (const lang of targetLangs) {
                    const translated = result.translations[lang];
                    if (!translated) {
                        setTranslateProgress(prev => ({ ...prev, [lang]: 'error' }));
                        continue;
                    }
                    voiceoverScenes.forEach((s, i) => {
                        setVoiceoverTranslation(s.index, lang as import('@/types').LanguageCode, translated[i] ?? s.text);
                    });
                    setTranslateProgress(prev => ({ ...prev, [lang]: 'done' }));
                }
            }
        } catch (err) {
            console.error('Voiceover translation failed:', err);
            alert(`Voiceover translation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            targetLangs.forEach(l => setTranslateProgress(prev => ({ ...prev, [l]: 'error' })));
        } finally {
            setIsTranslating(false);
        }
    };

    const activeLangs = selectedLanguages;

    return (
        <div className="space-y-4">
            {/* Header info */}
            <div className="rounded-lg border border-border bg-surface-elevated p-4 space-y-1">
                <p className="text-sm font-medium">Voiceover Translation</p>
                <p className="text-xs text-muted-foreground">
                    Translate the spoken script detected in each scene. These translations will be used for voice dubbing in each language.
                </p>
            </div>

            {/* Language picker — shown when the user skipped the Translate Text step */}
            {skippedTranslateText && Object.keys(translateProgress).length === 0 && (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Select target languages for translation:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {SUPPORTED_LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => !isTranslating && toggleLanguage(lang.code)}
                                disabled={isTranslating}
                                className={cn(
                                    "flex items-center gap-2 p-3 rounded-lg border transition-all",
                                    selectedLanguages.includes(lang.code)
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border hover:border-muted-foreground/50",
                                    isTranslating && "opacity-60 cursor-not-allowed"
                                )}
                            >
                                <span className="text-lg">{lang.flag}</span>
                                <span className="text-sm font-medium">{lang.name}</span>
                                {selectedLanguages.includes(lang.code) && (
                                    <Check className="w-4 h-4 ml-auto" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {voiceoverScenes.length === 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center space-y-2">
                    <p className="text-sm text-amber-400 font-medium">No voiceover detected</p>
                    <p className="text-xs text-muted-foreground">No spoken audio was found in the analyzed scenes. You can still dub the video manually in the next step.</p>
                    <Button variant="gradient" className="w-full mt-2" onClick={() => setCurrentStep('dub')}>
                        Continue to Dubbing
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            ) : (
                <>
                    {/* Translate button */}
                    {Object.keys(translateProgress).length === 0 && (
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={startTranslation}
                            disabled={isTranslating || targetLangs.length === 0}
                        >
                            {isTranslating ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Translating voiceover...</>
                            ) : (
                                <><Languages className="w-4 h-4 mr-2" />Translate Voiceover ({targetLangs.length} {targetLangs.length === 1 ? 'language' : 'languages'})</>
                            )}
                        </Button>
                    )}

                    {/* Progress badges + Re-translate */}
                    {Object.keys(translateProgress).length > 0 && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                                {activeLangs.map(lang => {
                                    const status = translateProgress[lang];
                                    const langMeta = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                                    return (
                                        <div key={lang} className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border",
                                            status === 'done' ? "border-green-500/40 bg-green-500/10 text-green-400" :
                                            status === 'error' ? "border-red-500/40 bg-red-500/10 text-red-400" :
                                            "border-border bg-surface text-muted-foreground"
                                        )}>
                                            <span>{langMeta?.flag}</span>
                                            <span>{langMeta?.name}</span>
                                            {status === 'translating' && <Loader2 className="w-3 h-3 animate-spin" />}
                                            {status === 'done' && <Check className="w-3 h-3" />}
                                            {status === 'error' && <span>✗</span>}
                                        </div>
                                    );
                                })}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={startTranslation}
                                disabled={isTranslating || targetLangs.length === 0}
                            >
                                {isTranslating ? (
                                    <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Retranslating...</>
                                ) : (
                                    <><RefreshCw className="w-3.5 h-3.5 mr-2" />Re-translate</>
                                )}
                            </Button>
                        </div>
                    )}

                    {/* Scene viewer */}
                    {voiceoverScenes.length > 0 && (
                        <div className="space-y-2">
                            {/* Scene tabs */}
                            <div className="flex gap-1 overflow-x-auto pb-1">
                                {voiceoverScenes.map(s => (
                                    <button
                                        key={s.index}
                                        onClick={() => setActiveScene(s.index)}
                                        className={cn(
                                            "shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors",
                                            activeScene === s.index
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Scene {s.index + 1}
                                    </button>
                                ))}
                            </div>

                            {/* Original — editable so mistakes can be fixed before TTS */}
                            <div className="rounded-lg border border-border bg-surface-elevated p-3 space-y-1.5">
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">🎤 Original ({sourceLangName})</p>
                                <textarea
                                    className="w-full bg-transparent text-sm resize-none outline-none focus:ring-1 focus:ring-primary/50 rounded px-1 -mx-1 leading-relaxed"
                                    rows={2}
                                    value={
                                        voiceoverTranslations.get(`${activeScene}-${sourceLangCode}`) ??
                                        voiceoverTranslations.get(`${activeScene}-EN`) ??
                                        scriptEntries[activeScene]?.voiceover ?? ''
                                    }
                                    onChange={e => setVoiceoverTranslation(activeScene, sourceLangCode, e.target.value)}
                                    placeholder={`Enter ${sourceLangName} voiceover text…`}
                                />
                            </div>

                            {/* Translations — editable */}
                            {activeLangs.filter(l => l !== sourceLangCode).map(lang => {
                                const langMeta = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                                const translated = voiceoverTranslations.get(`${activeScene}-${lang}`);
                                return (
                                    <div key={lang} className="rounded-lg border border-border bg-surface-elevated p-3 space-y-1.5">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                            {langMeta?.flag} {langMeta?.name}
                                        </p>
                                        {translated !== undefined ? (
                                            <textarea
                                                className="w-full bg-transparent text-sm resize-none outline-none focus:ring-1 focus:ring-primary/50 rounded px-1 -mx-1 leading-relaxed"
                                                rows={2}
                                                value={translated}
                                                onChange={e => setVoiceoverTranslation(activeScene, lang as import('@/types').LanguageCode, e.target.value)}
                                            />
                                        ) : (
                                            <p className="text-sm text-muted-foreground italic">Not yet translated</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Continue */}
                    {allDone && (
                        <Button
                            variant="gradient"
                            className="w-full"
                            onClick={() => setCurrentStep('dub')}
                        >
                            Continue to Dubbing
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </>
            )}
        </div>
    );
}

// Preset voice IDs for Custom TTS (ElevenLabs multilingual voices)
const PRESET_VOICES: Record<string, Record<string, string>> = {
    male: {
        EN: 'mhgBlD8CmCSdwLDOIJpA', // Pulse
        ES: 'Nh2zY9kknu6z4pZy6FhD', // David Martin
        FR: 'j9RedbMRSNQ74PyikQwD', // Louis Boutin
        AR: 'rPNcQ53R703tTmtue1AT', // Mazen
        PT: 'zNEsdgTUa3ndwKry8Xcq', // Elvis
    },
    female: {
        EN: 'tnSpp4vdxKPjI9w0GnoV', // Hope
        ES: 'rEVYTKPqwSMhytFPayIb', // Sandra
        FR: 'b6nVfb3l2zshrLZTvqbs', // Sarah
        AR: 'qi4PkV9c01kb869Vh7Su', // Asmaa
        PT: 'ohZOfA9iwlZ5nOsoY7LB', // Roberta
    },
};

type DubMode = 'select' | 'auto' | 'custom';
type SpeakerGender = 'male' | 'female';

function DubPreviewPlayer({
    tracks,
    videoUrl,
    videoFile,
    videoFrameRate,
    segments: segs,
    translations: trans,
    videoHasAudio,
}: {
    tracks: import('@/types').DubbingTrack[];
    videoUrl: string;
    videoFile?: File | null;
    videoFrameRate?: number;
    segments: VideoSegment[];
    translations: Map<string, import('@/types').Translation[]>;
    videoHasAudio?: boolean | null;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [previewLang, setPreviewLang] = useState<string | null>(null);
    const [activeScene, setActiveScene] = useState(0);
    const readyTracks = tracks.filter(t => t.status === 'ready' && t.audioBlobUrl);
    const dubbedLanguages = [...new Set(readyTracks.map(t => t.languageCode))];
    // Show only languages that actually have dubbed tracks; don't force-inject EN
    const languages = dubbedLanguages;

    // Measure audio durations for all ready tracks (async, runs once tracks are ready)
    const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
    useEffect(() => {
        if (readyTracks.length === 0) return;
        let cancelled = false;
        const measure = async () => {
            const durations: Record<string, number> = {};
            await Promise.all(
                readyTracks.map(track => new Promise<void>(resolve => {
                    if (!track.audioBlobUrl) { resolve(); return; }
                    const a = new Audio();
                    a.preload = 'metadata';
                    a.onloadedmetadata = () => {
                        durations[track.id] = a.duration;
                        resolve();
                    };
                    a.onerror = () => resolve();
                    a.src = track.audioBlobUrl!;
                }))
            );
            if (!cancelled) setAudioDurations(durations);
        };
        measure();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readyTracks.length]);

    useEffect(() => {
        if (languages.length > 0 && !previewLang) {
            setPreviewLang(languages[0]);
        }
    }, [languages.length]);

    if (readyTracks.length === 0 || segs.length === 0) return null;

    const previewSegment = segs[activeScene];
    const isFullVideo = readyTracks.some(t => t.segmentId === 'full-video');

    // Calculate playback rate: slow video when dubbed audio is longer than the scene
    const currentAudioTrackForRate = previewLang
        ? readyTracks.find(t =>
            t.languageCode === previewLang &&
            (t.segmentId === previewSegment?.id || t.segmentId === 'full-video')
        )
        : null;
    const sceneDuration = previewSegment
        ? previewSegment.timecode.endTime - previewSegment.timecode.startTime
        : 0;
    const audioDur = currentAudioTrackForRate ? audioDurations[currentAudioTrackForRate.id] ?? 0 : 0;
    const computedPlaybackRate = (audioDur > sceneDuration && sceneDuration > 0)
        ? Math.max(0.5, sceneDuration / audioDur)
        : 1.0;

    // Build text layers with translated content for the selected language
    const previewTextLayers: TextLayerOverlay[] = previewSegment?.textLayers.map(layer => {
        const langTranslations = trans.get(layer.id);
        const tr = langTranslations?.find(t => t.languageCode === previewLang);
        return {
            id: layer.id,
            content: tr?.translatedContent ?? layer.content,
            positionX: layer.positionX,
            positionY: layer.positionY,
            positionAnchor: layer.positionAnchor,
            fontSize: layer.fontSize,
            fontWeight: layer.fontWeight ?? 800,
            textStyle: layer.textStyle,
            color: layer.color,
            backgroundColor: layer.backgroundColor,
            animationType: layer.animationType,
            startTime: layer.startTime,
            endTime: layer.endTime,
        };
    }) ?? [];

    // Get the audio track for the current scene + language
    const currentAudioTrack = previewLang
        ? readyTracks.find(t =>
            t.languageCode === previewLang &&
            (t.segmentId === previewSegment?.id || t.segmentId === 'full-video')
        )
        : null;

    // Sync dubbed audio with video play/pause, using the video's current time
    const handlePlayStateChange = useCallback((playing: boolean, videoTime: number) => {
        const aud = audioRef.current;
        if (!aud) return;
        if (playing) {
            if (isFullVideo) {
                aud.currentTime = videoTime;
            } else {
                const segStart = previewSegment?.timecode.startTime ?? 0;
                aud.currentTime = videoTime - segStart;
            }
            aud.play().catch(() => {});
        } else {
            // Only pause audio on a manual user pause — not when the video reaches scene end
            // (onSceneEnd handles that case by letting audio play to completion)
            if (!sceneEndedRef.current) {
                aud.pause();
            }
            sceneEndedRef.current = false;
        }
    }, [isFullVideo, previewSegment?.timecode.startTime]);

    // Fired when the video naturally reaches the end of the scene.
    // We let the dubbed audio keep playing until it finishes on its own.
    const sceneEndedRef = useRef(false);
    const handleSceneEnd = useCallback(() => {
        sceneEndedRef.current = true;
        // Audio keeps playing — nothing to do here; onEnded on <audio> will clean up
    }, []);

    return (
        <div className="p-4 rounded-lg bg-surface-elevated border border-border space-y-3">
            <div className="flex items-center gap-3">
                <Play className="w-5 h-5 text-primary" />
                <span className="font-medium">Preview Dubbed Video</span>
            </div>

            {/* Language tabs */}
            <div className="flex flex-wrap gap-1.5">
                {languages.map(lang => {
                    const info = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                    return (
                        <button
                            key={lang}
                            onClick={() => {
                                setPreviewLang(lang);
                                audioRef.current?.pause();
                            }}
                            className={cn(
                                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                                previewLang === lang
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50'
                            )}
                        >
                            {info?.flag} {info?.name ?? lang}
                        </button>
                    );
                })}
            </div>

            {/* Scene tabs (only for per-segment tracks, not full-video) */}
            {!isFullVideo && segs.length > 1 && (
                <div className="flex gap-1.5 flex-wrap">
                    {segs.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => {
                                setActiveScene(i);
                                audioRef.current?.pause();
                            }}
                            className={cn(
                                'px-3 py-1 rounded-lg text-xs font-medium border transition-all',
                                activeScene === i
                                    ? 'bg-primary/20 border-primary text-primary'
                                    : 'border-border hover:border-primary/50 text-muted-foreground'
                            )}
                        >
                            {segs[i]?.isOutro ? 'Outro' : `Scene ${i + 1}`}
                        </button>
                    ))}
                </div>
            )}

            {/* Video preview with text overlays — plays dubbed audio when video plays */}
            {previewSegment && (() => {
                // Force-mute whenever a dubbed track exists to avoid original+dubbed overlap.
                const shouldForceMute = !!currentAudioTrack;
                return (
                    <SceneVideoPlayer
                        videoUrl={videoUrl}
                        startTime={previewSegment.timecode.startTime}
                        endTime={previewSegment.timecode.endTime}
                        textLayers={previewTextLayers}
                        fps={videoFrameRate ?? 30}
                        videoFile={videoFile ?? null}
                        onPlayStateChange={handlePlayStateChange}
                        onSceneEnd={handleSceneEnd}
                        forceMuted={shouldForceMute ? true : undefined}
                        playbackRate={computedPlaybackRate}
                        overlayRenderMode="canvas"
                    />
                );
            })()}

            {/* Hidden audio element for synced dubbed audio (non-EN or EN with generated TTS).
                key forces a clean remount when switching languages so the browser loads the new source. */}
            {currentAudioTrack?.audioBlobUrl && (
                <audio
                    key={currentAudioTrack.id}
                    ref={audioRef}
                    src={currentAudioTrack.audioBlobUrl}
                    preload="auto"
                    onEnded={() => { sceneEndedRef.current = false; }}
                />
            )}
        </div>
    );
}

function DubStepContent() {
    const {
        setCurrentStep, video, voiceClone, setVoiceClone,
        segments, selectedLanguages, translations, scriptEntries,
        voiceoverTranslations, videoHasAudio,
        dubbingTracks, setDubbingTracks, updateDubbingTrack,
        isGeneratingDubbing, setIsGeneratingDubbing,
        detectedVoiceoverLanguage,
    } = useAppStore();

    const [dubMode, setDubMode] = useState<DubMode>('select');
    const [speakerGender, setSpeakerGender] = useState<SpeakerGender>('male');
    const [dubError, setDubError] = useState<string | null>(null);
    const [dubProgress, setDubProgress] = useState({ done: 0, total: 0 });
    const customTtsRunIdRef = useRef(0);

    // Auto-dubbing state
    const [autoDubJobs, setAutoDubJobs] = useState<Record<string, { dubbingId: string; status: string }>>({});

    const hasScript = scriptEntries.length > 0 && scriptEntries.some(e => e.voiceover || e.textOnScreen);
    const sourceLangCode = (detectedVoiceoverLanguage?.code ?? 'en').toUpperCase();
    // All selected languages are dub targets; source exclusion is handled per-pipeline below.
    const dubLangs = selectedLanguages;

    // Get the voiceover text for a segment + language.
    // Priority: voiceoverTranslations (covers manual edits) → scriptEntries fallback for source lang.
    const getDubText = (segment: VideoSegment, lang: string): string => {
        const sceneIdx = segment.timecode.segmentIndex;
        const voKey = `${sceneIdx}-${lang}`;
        const voText = voiceoverTranslations.get(voKey);
        if (voText) return voText;
        // Fallback for source language: original voiceover from script entries
        if (lang === sourceLangCode || lang === 'EN') {
            return scriptEntries[sceneIdx]?.voiceover || '';
        }
        return '';
    };

    // ── Auto Dubbing (ElevenLabs Dubbing API) ──
    const handleAutoDubbing = async () => {
        if (!video) return;
        setIsGeneratingDubbing(true);
        setDubError(null);
        const jobs: Record<string, { dubbingId: string; status: string }> = {};

        try {
            // ElevenLabs dubbing translates from the detected source language to every selected target.
            // Exclude the source language itself — it doesn't need to be dubbed.
            const autoDubTargetLangs = selectedLanguages.filter(l => l !== sourceLangCode);
            const sourceLangMeta = SUPPORTED_LANGUAGES.find(l => l.code === sourceLangCode);
            const elevenLabsSourceLang = sourceLangMeta?.elevenLabsCode || sourceLangCode.toLowerCase();

            // Start dubbing for each target language
            for (const lang of autoDubTargetLangs) {
                const langMeta = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                const form = new FormData();
                form.append('file', video.file);
                form.append('target_lang', langMeta?.elevenLabsCode || lang.toLowerCase());
                form.append('source_lang', elevenLabsSourceLang);
                form.append('name', `${video.name} – ${langMeta?.name ?? lang}`);

                const res = await fetch(api('/api/start-dubbing'), { method: 'POST', body: form });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || `Failed to start dubbing for ${lang}`);
                }
                const data = await res.json();
                jobs[lang] = { dubbingId: data.dubbing_id, status: 'dubbing' };
            }

            setAutoDubJobs({ ...jobs });

            // Poll until all complete
            const pending = new Set(Object.keys(jobs));
            while (pending.size > 0) {
                await new Promise(r => setTimeout(r, 5000));
                for (const lang of [...pending]) {
                    const job = jobs[lang];
                    const res = await fetch(api(`/api/get-dubbing-status?dubbing_id=${encodeURIComponent(job.dubbingId)}`));
                    if (!res.ok) continue;
                    const data = await res.json();
                    jobs[lang] = { ...job, status: data.status };
                    if (data.status === 'dubbed' || data.status === 'failed') {
                        pending.delete(lang);
                    }
                }
                setAutoDubJobs({ ...jobs });
            }

            // Fetch audio for successful dubs
            const tracks: import('@/types').DubbingTrack[] = [];
            for (const lang of autoDubTargetLangs) {
                const job = jobs[lang];
                if (job.status === 'dubbed') {
                    const langMeta = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                    const audioRes = await fetch(
                        api(`/api/get-dubbing-audio?dubbing_id=${encodeURIComponent(job.dubbingId)}&language_code=${encodeURIComponent(langMeta?.elevenLabsCode || lang.toLowerCase())}`)
                    );
                    if (audioRes.ok) {
                        const blob = await audioRes.blob();
                        tracks.push({
                            id: `auto-dub-${lang}`,
                            segmentId: 'full-video',
                            languageCode: lang as import('@/types').LanguageCode,
                            audioBlobUrl: URL.createObjectURL(blob),
                            status: 'ready',
                        });
                    } else {
                        tracks.push({
                            id: `auto-dub-${lang}`,
                            segmentId: 'full-video',
                            languageCode: lang as import('@/types').LanguageCode,
                            status: 'error',
                        });
                    }
                } else {
                    tracks.push({
                        id: `auto-dub-${lang}`,
                        segmentId: 'full-video',
                        languageCode: lang as import('@/types').LanguageCode,
                        status: 'error',
                    });
                }
            }
            setDubbingTracks(tracks);
        } catch (err) {
            setDubError(err instanceof Error ? err.message : 'Auto dubbing failed');
        } finally {
            setIsGeneratingDubbing(false);
        }
    };

    // ── Custom TTS Pipeline ──
    const handleCustomTTS = async () => {
        if (isGeneratingDubbing) return;
        const capturedGender = speakerGender; // capture once — immutable for this entire run
        const runId = ++customTtsRunIdRef.current;
        setIsGeneratingDubbing(true);
        setDubError(null);

        // Build tasks: for each segment × selected language (including EN).
        const tasks: { trackId: string; segmentId: string; lang: string; text: string }[] = [];
        for (const seg of segments) {
            for (const lang of dubLangs) {
                const text = getDubText(seg, lang);
                if (text.trim()) {
                    tasks.push({ trackId: `tts-${seg.id}-${lang}`, segmentId: seg.id, lang, text });
                }
            }
        }

        if (tasks.length === 0) {
            setDubError('No text found to generate speech. Make sure scenes have voiceover text.');
            if (runId === customTtsRunIdRef.current) {
                setIsGeneratingDubbing(false);
            }
            return;
        }

        setDubbingTracks(
            tasks.map((t) => ({
                id: t.trackId,
                segmentId: t.segmentId,
                languageCode: t.lang as import('@/types').LanguageCode,
                status: 'pending' as const,
            }))
        );
        setDubProgress({ done: 0, total: tasks.length });

        let done = 0;
        try {
            for (const task of tasks) {
                if (runId !== customTtsRunIdRef.current) break;
                updateDubbingTrack(task.trackId, { status: 'generating' });
                try {
                    // Source language text needs no translation; other languages do.
                    let translatedText = task.text;
                    if (task.lang !== sourceLangCode) {
                        const translateRes = await fetch(api('/api/translate-voiceover'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ texts: [task.text], sourceLang: sourceLangCode, targetLang: task.lang }),
                        });
                        if (translateRes.ok) {
                            const translateData = await translateRes.json();
                            translatedText = translateData.translations?.[0] || task.text;
                        }
                    }

                    // Generate speech with preset voice
                    const voiceId = PRESET_VOICES[capturedGender]?.[task.lang] || PRESET_VOICES[capturedGender].EN;
                    const speechRes = await fetch(api('/api/generate-speech'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: translatedText, voiceId, languageCode: task.lang }),
                    });

                    if (!speechRes.ok) {
                        throw new Error('TTS generation failed');
                    }

                    const blob = await speechRes.blob();
                    if (runId === customTtsRunIdRef.current) {
                        updateDubbingTrack(task.trackId, { status: 'ready', audioBlobUrl: URL.createObjectURL(blob) });
                    }
                } catch {
                    if (runId === customTtsRunIdRef.current) {
                        updateDubbingTrack(task.trackId, { status: 'error' });
                    }
                }
                done++;
                if (runId === customTtsRunIdRef.current) {
                    setDubProgress({ done, total: tasks.length });
                }
            }
        } finally {
            if (runId === customTtsRunIdRef.current) {
                setIsGeneratingDubbing(false);
            }
        }
    };

    const allDone =
        dubbingTracks.length > 0 &&
        dubbingTracks.every((t) => t.status === 'ready' || t.status === 'error');

    // ── Mode Selection Screen ──
    if (dubMode === 'select') {
        return (
            <div className="pt-4 space-y-4">
                {/* Header */}
                <div className="p-4 rounded-lg bg-surface-elevated border border-border">
                    <div className="flex items-center gap-3 mb-2">
                        <Mic className="w-5 h-5 text-primary" />
                        <span className="font-medium">Voice Dubbing</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                        Choose how to generate dubbed audio for your video. You can use the automatic ElevenLabs pipeline or the Custom TTS pipeline for full control over transcription, translation, and speech generation.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {dubLangs.map(lang => {
                            const info = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                            return (
                                <span key={lang} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                                    {info?.flag} {info?.name}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {/* Auto Dubbing Card */}
                <button
                    onClick={() => setDubMode('auto')}
                    className="w-full text-left p-4 rounded-lg bg-surface-elevated border border-border hover:border-primary/50 transition-colors group"
                >
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 p-2 rounded-full bg-primary/10">
                                <Mic className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="font-medium mb-1">Auto Dubbing (ElevenLabs Voice Clone)</p>
                                <p className="text-sm text-muted-foreground">
                                    ElevenLabs auto-detects the speaker, clones their voice, translates, and dubs. Uses ElevenLabs&apos; own AI voices — <strong>not</strong> the preset voices below.
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-2.5">
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">Fast</span>
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">Less Control</span>
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">Own Voices</span>
                                </div>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-1 shrink-0" />
                    </div>
                </button>

                {/* Custom TTS Card */}
                <button
                    onClick={() => setDubMode('custom')}
                    className="w-full text-left p-4 rounded-lg bg-surface-elevated border border-border hover:border-primary/50 transition-colors group"
                >
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 p-2 rounded-full bg-muted">
                                <Settings2 className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="font-medium mb-1">Custom TTS (Preset Voices)</p>
                                <p className="text-sm text-muted-foreground">
                                    Uses your script → translates with length control → generates TTS per segment. Uses the <strong className="text-primary">preset {speakerGender}</strong> voices below for each language.
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-2.5">
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">Better Pacing</span>
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">Automated</span>
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">Preset Voices</span>
                                    {hasScript && (
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">Script detected</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-1 shrink-0" />
                    </div>
                </button>

                {/* Speaker Gender */}
                <div className="p-4 rounded-lg bg-surface-elevated border border-border">
                    <div className="flex items-center gap-3 mb-2">
                        <Volume2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">Speaker Gender</span>
                        <span className="text-xs text-muted-foreground">(for Custom TTS)</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                        Select the speaker gender. The Custom TTS Pipeline will use the matching preset voice for each language automatically.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setSpeakerGender('male')}
                            className={cn(
                                'py-2.5 rounded-lg text-sm font-medium transition-colors border',
                                speakerGender === 'male'
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-surface-elevated border-border hover:border-muted-foreground text-foreground'
                            )}
                        >
                            ♂ Male
                        </button>
                        <button
                            onClick={() => setSpeakerGender('female')}
                            className={cn(
                                'py-2.5 rounded-lg text-sm font-medium transition-colors border',
                                speakerGender === 'female'
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-surface-elevated border-border hover:border-muted-foreground text-foreground'
                            )}
                        >
                            ♀ Female
                        </button>
                    </div>
                </div>

                {/* Skip */}
                <button
                    onClick={() => setCurrentStep('outro')}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                >
                    Skip dubbing → Continue to Outro
                </button>
            </div>
        );
    }

    // ── Auto Dubbing Pipeline ──
    if (dubMode === 'auto') {
        return (
            <div className="pt-4 space-y-4">
                <div className="p-4 rounded-lg bg-surface-elevated border border-border">
                    <div className="flex items-center gap-3 mb-3">
                        <Mic className="w-5 h-5 text-primary" />
                        <span className="font-medium">Auto Dubbing</span>
                        <button onClick={() => { setDubMode('select'); setDubbingTracks([]); setDubError(null); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                            ← Back
                        </button>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                        ElevenLabs will auto-detect speakers, clone their voices, translate, and generate dubbed audio for each language.
                    </p>

                    {!isGeneratingDubbing && dubbingTracks.length === 0 && (
                        <Button variant="gradient" onClick={handleAutoDubbing}>
                            <Mic className="w-4 h-4 mr-2" />Start Auto Dubbing ({dubLangs.length} language{dubLangs.length !== 1 ? 's' : ''})
                        </Button>
                    )}

                    {(isGeneratingDubbing || Object.keys(autoDubJobs).length > 0) && (
                        <div className="space-y-2 mt-3">
                            {dubLangs.map(lang => {
                                const info = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                                const job = autoDubJobs[lang];
                                const track = dubbingTracks.find(t => t.languageCode === lang);
                                return (
                                    <div key={lang} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30">
                                        <span className="text-base">{info?.flag}</span>
                                        <span className="text-sm font-medium w-20">{info?.name ?? lang}</span>
                                        <span className="text-xs text-muted-foreground flex-1">
                                            {!job && 'Queued…'}
                                            {job?.status === 'dubbing' && 'Processing…'}
                                            {job?.status === 'dubbed' && !track && 'Fetching audio…'}
                                            {track?.status === 'ready' && 'Ready'}
                                            {(job?.status === 'failed' || track?.status === 'error') && 'Failed'}
                                        </span>
                                        {(!job || job.status === 'dubbing') && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                                        {track?.status === 'ready' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                        {(job?.status === 'failed' || track?.status === 'error') && <AlertCircle className="w-4 h-4 text-destructive" />}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {dubError && (
                        <p className="text-sm text-destructive mt-3 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{dubError}</p>
                    )}
                </div>

                {/* Video + Audio Preview */}
                {video && allDone && (
                    <DubPreviewPlayer
                        tracks={dubbingTracks}
                        videoUrl={video.url}
                        videoFile={video.file}
                        videoFrameRate={video.frameRate}
                        segments={segments}
                        translations={translations}
                        videoHasAudio={videoHasAudio}
                    />
                )}

                <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => setCurrentStep('outro')}
                    disabled={isGeneratingDubbing}
                >
                    {allDone ? 'Continue to Outro' : 'Skip & Continue to Outro'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>
        );
    }

    // ── Custom TTS Pipeline ──
    return (
        <div className="pt-4 space-y-4">
            <div className="p-4 rounded-lg bg-surface-elevated border border-border">
                <div className="flex items-center gap-3 mb-3">
                    <Settings2 className="w-5 h-5 text-primary" />
                    <span className="font-medium">Custom TTS (Preset Voices)</span>
                    <button onClick={() => { setDubMode('select'); setDubbingTracks([]); setDubError(null); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                        ← Back
                    </button>
                </div>

                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-muted-foreground">Speaker:</span>
                    <button
                        onClick={() => setSpeakerGender(speakerGender === 'male' ? 'female' : 'male')}
                        className="text-xs px-2 py-0.5 rounded border border-border hover:border-primary text-foreground transition-colors"
                    >
                        {speakerGender === 'male' ? '♂ Male' : '♀ Female'}
                    </button>
                </div>

                <p className="text-sm text-muted-foreground mb-3">
                    Translates voiceover text per scene via DeepL, then generates speech with preset {speakerGender} voices.
                    {segments.length > 0 && ` ${segments.length} scene${segments.length !== 1 ? 's' : ''} × ${dubLangs.length} language${dubLangs.length !== 1 ? 's' : ''}.`}
                </p>

                {!isGeneratingDubbing && dubbingTracks.length === 0 && (
                    <Button variant="gradient" onClick={handleCustomTTS}>
                        <Volume2 className="w-4 h-4 mr-2" />Generate Custom TTS
                    </Button>
                )}

                {isGeneratingDubbing && (
                    <div className="mb-3">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Translating & generating audio…</span>
                            <span>{dubProgress.done} / {dubProgress.total}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${dubProgress.total > 0 ? (dubProgress.done / dubProgress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                )}

                {dubbingTracks.length > 0 && (
                    <div className="space-y-2">
                        {dubLangs.map((lang) => {
                            const langTracks = dubbingTracks.filter((t) => t.languageCode === lang);
                            const readyCount = langTracks.filter((t) => t.status === 'ready').length;
                            const errCount = langTracks.filter((t) => t.status === 'error').length;
                            const isActive = langTracks.some((t) => t.status === 'generating');
                            const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === lang);

                            return (
                                <div key={lang} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30">
                                    <span className="text-base">{langInfo?.flag}</span>
                                    <span className="text-sm font-medium w-20">{langInfo?.name ?? lang}</span>
                                    <span className="text-xs text-muted-foreground flex-1">
                                        {readyCount} / {langTracks.length} scenes ready
                                        {errCount > 0 && <span className="text-destructive ml-1">({errCount} failed)</span>}
                                    </span>
                                    {isActive && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                                    {!isActive && readyCount === langTracks.length && langTracks.length > 0 && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                    {!isActive && errCount > 0 && readyCount + errCount === langTracks.length && <AlertCircle className="w-4 h-4 text-destructive" />}
                                </div>
                            );
                        })}
                    </div>
                )}

                {allDone && !isGeneratingDubbing && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={handleCustomTTS}>
                        <RefreshCw className="w-4 h-4 mr-2" />Regenerate
                    </Button>
                )}

                {dubError && (
                    <p className="text-sm text-destructive mt-3 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{dubError}</p>
                )}
            </div>

            {/* Video + Audio Preview */}
            {video && allDone && (
                <DubPreviewPlayer
                    tracks={dubbingTracks}
                    videoUrl={video.url}
                    videoFile={video.file}
                    videoFrameRate={video.frameRate}
                    segments={segments}
                    translations={translations}
                    videoHasAudio={videoHasAudio}
                />
            )}

            <Button
                variant="gradient"
                className="w-full"
                onClick={() => setCurrentStep('outro')}
                disabled={isGeneratingDubbing}
            >
                {allDone ? 'Continue to Outro' : 'Skip & Continue to Outro'}
                <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
        </div>
    );
}

function OutroStepContent() {
    const { setCurrentStep, outroConfig, setOutroConfig, segments, setSegments, video, scriptEntries, selectedLanguages, detectedVoiceoverLanguage, suggestedOutroTextColor } = useAppStore();
    const [ctaFontSize, setCtaFontSize] = useState<number>(64);
    const [resolvedDisclaimerFontSize, setResolvedDisclaimerFontSize] = useState<number>(24);

    // Pre-populate CTA + disclaimer from script entries / existing segment layers if not already set
    useEffect(() => {
        const outroIdx = segments.findIndex(s => s.isOutro);
        const resolvedIdx = outroIdx >= 0 ? outroIdx : segments.length - 1;
        const outroEntry = scriptEntries[resolvedIdx];
        const outroSeg = segments[resolvedIdx];

        if (!outroConfig.ctaText) {
            const fromScript = outroEntry?.textOnScreen
                ? outroEntry.textOnScreen.replace(/\{(?:red|white|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$1').trim()
                : '';
            const fromLayer = outroSeg?.textLayers.find(l => l.id.startsWith('text-script-'))?.content ?? '';
            const seed = fromScript || fromLayer;
            if (seed) setOutroConfig({ ctaText: seed });
        }

        if (!outroConfig.disclaimerText) {
            const fromScript = outroEntry?.disclaimer ?? '';
            const fromLayer = outroSeg?.textLayers.find(l => l.id.startsWith('text-disclaimer-'))?.content ?? '';
            const seed = fromScript || fromLayer;
            if (seed) setOutroConfig({ disclaimerText: seed });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segments.length, scriptEntries.length]);

    // Build live preview text layers from current outroConfig values
    const outroSeg = segments.find(s => s.isOutro) ?? (segments.length > 0 ? segments[segments.length - 1] : null);
    const _outroVH = video?.height ?? 1920;
    const _outroVW = video?.width ?? 1080;
    const previewLayers: TextLayerOverlay[] = [];
    if (outroConfig.ctaText.trim()) {
        previewLayers.push({
            id: 'preview-cta',
            content: outroConfig.ctaText,
            positionX: Math.round(_outroVW / 2),
            positionY: Math.round(_outroVH * 0.4922),
            positionAnchor: 'middle',
            fontSize: ctaFontSize,
            fontWeight: 800,
            color: suggestedOutroTextColor,
            textShadow: '0 1px 6px rgba(255,255,255,0.8), 0 0 12px rgba(255,255,255,0.5)',
            animationType: 'slide-up',
            startTime: 2,
            endTime: -1,
        });
    }
    if (outroConfig.disclaimerText.trim()) {
        previewLayers.push({
            id: 'preview-disclaimer',
            content: outroConfig.disclaimerText,
            positionX: Math.round(_outroVW / 2),
            positionY: Math.round(_outroVH * 0.7667),
            positionAnchor: 'middle',
            fontSize: 24,
            fontWeight: 400,
            textStyle: 'disclaimer',
            color: suggestedOutroTextColor,
            textShadow: '0 1px 4px rgba(255,255,255,0.8), 0 0 8px rgba(255,255,255,0.5)',
            animationType: 'fade',
            startTime: 2,
            endTime: -1,
        });
    }

    const [isSavingOutro, setIsSavingOutro] = useState(false);
    const [outroTranslateError, setOutroTranslateError] = useState<string | null>(null);

    const handleContinue = async () => {
        setOutroTranslateError(null);
        const srcLangCode = (detectedVoiceoverLanguage?.code ?? 'en').toUpperCase() as import('@/types').LanguageCode;
        const targetLangs = selectedLanguages.filter(l => l !== srcLangCode);

        const hasCta = outroConfig.ctaText.trim().length > 0;
        const hasDisclaimer = outroConfig.disclaimerText.trim().length > 0;
        const outroTexts = [
            ...(hasCta ? [outroConfig.ctaText] : []),
            ...(hasDisclaimer ? [outroConfig.disclaimerText] : []),
        ];

        // Re-translate if: any target lang missing, OR existing translation was built from
        // different text (user edited CTA/disclaimer after prior translation ran).
        const needsTranslation =
            outroTexts.length > 0 &&
            targetLangs.length > 0 &&
            targetLangs.some(l => {
                const existing = outroConfig.translations[l as import('@/types').LanguageCode];
                if (!existing) return true;
                // Re-translate if text changed since last translation
                const ctaMismatch = hasCta && existing.ctaText.trim() === '';
                const disclaimerMismatch = hasDisclaimer && existing.disclaimerText.trim() === '';
                return ctaMismatch || disclaimerMismatch;
            });

        if (needsTranslation) {
            setIsSavingOutro(true);
            try {
                const { translateTexts } = await import('@/lib/supabase');
                const outroResult = await translateTexts(outroTexts, srcLangCode, targetLangs);
                const updatedOutroTranslations = { ...outroConfig.translations };
                for (const lang of targetLangs) {
                    const translated = outroResult.translations[lang];
                    if (!translated) continue;
                    let idx = 0;
                    updatedOutroTranslations[lang as import('@/types').LanguageCode] = {
                        ctaText: hasCta ? (translated[idx++] ?? outroConfig.ctaText) : outroConfig.ctaText,
                        disclaimerText: hasDisclaimer ? (translated[idx++] ?? outroConfig.disclaimerText) : outroConfig.disclaimerText,
                    };
                }
                setOutroConfig({ translations: updatedOutroTranslations });
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                console.error('[Outro] Translation failed:', msg);
                setOutroTranslateError(`Outro translation failed: ${msg}. Export will use source-language text.`);
                // Don't return — still let user proceed to export with fallback English text
            } finally {
                setIsSavingOutro(false);
            }
        }

        // Apply CTA and disclaimer as text layers on the outro segment.
        // Only update segment layers when at least one field has content — this prevents
        // accidentally wiping script-populated layers if the user skips through with blank fields.
        const outroIdx = segments.findIndex(s => s.isOutro);
        const resolvedOutroIdx = outroIdx >= 0 ? outroIdx : segments.length - 1;
        if (segments.length > 0 && (hasCta || hasDisclaimer)) {
            const outroSegment = segments[resolvedOutroIdx];

            // Outro segment should only contain the managed CTA + disclaimer layers.
            // Drop all existing layers (including any from edit-text step) to prevent
            // double-rendering when both English and translated layers would otherwise stack.
            const newLayers: TextLayer[] = [];

            const _saveVH = video?.height ?? 1920;
            const _saveVW = video?.width ?? 1080;
            if (hasCta) {
                newLayers.push({
                    id: `text-outro-cta-${Date.now()}`,
                    segmentId: outroSegment.id,
                    content: outroConfig.ctaText,
                    positionX: Math.round(_saveVW / 2),
                    positionY: Math.round(_saveVH * 0.4922),
                    positionAnchor: 'middle' as const,
                    fontFamily: "Inter",
                    fontSize: ctaFontSize,
                    fontWeight: 800,
                    color: suggestedOutroTextColor,
                    animationType: "slide-up" as const,
                    animationDuration: 0.5,
                    startTime: 2,
                    endTime: -1,
                });
            }

            if (hasDisclaimer) {
                newLayers.push({
                    id: `text-outro-disclaimer-${Date.now()}`,
                    segmentId: outroSegment.id,
                    content: outroConfig.disclaimerText,
                    positionX: Math.round(_saveVW / 2),
                    positionY: Math.round(_saveVH * 0.7667),
                    positionAnchor: 'middle' as const,
                    fontFamily: "Inter",
                    fontSize: resolvedDisclaimerFontSize,
                    fontWeight: 400,
                    textStyle: 'disclaimer' as const,
                    color: suggestedOutroTextColor,
                    animationType: "fade" as const,
                    animationDuration: 0.5,
                    startTime: 2,
                    endTime: -1,
                });
            }

            const updatedSegments = segments.map((seg, i) =>
                i === resolvedOutroIdx ? { ...seg, textLayers: newLayers } : seg
            );
            setSegments(updatedSegments);
        }

        setCurrentStep('export');
    };

    return (
        <div className="pt-4 space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <span className="text-base shrink-0">🎬</span>
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-400">Two text layers will be added to the Outro</p>
                    <p className="text-xs text-muted-foreground">Layer 1 — CTA (49% from top, 40px) • Layer 2 — Disclaimer (77% from top, 12px, Inter Regular)</p>
                </div>
            </div>

            {/* Live preview */}
            {video && outroSeg && (previewLayers.length > 0) && (
                <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Live Preview</span>
                    <SceneVideoPlayer
                        videoUrl={video.url}
                        startTime={outroSeg.timecode.startTime}
                        endTime={outroSeg.timecode.endTime}
                        textLayers={previewLayers}
                        fps={video.frameRate ?? 30}
                        videoFile={video.file}
                        overlayRenderMode="canvas"
                        onLayerFontSizeResolved={(layerId, nativePx) => {
                            if (layerId === 'preview-disclaimer') {
                                setResolvedDisclaimerFontSize(nativePx);
                            }
                        }}
                    />
                </div>
            )}

            <div className="space-y-3">
                {/* Layer 1 — CTA */}
                <div className="p-3 rounded-lg bg-surface-elevated border border-border space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-primary">1</span>
                        </div>
                        <label className="text-sm font-medium">CTA Text</label>
                        <span className="text-xs text-muted-foreground ml-auto">49% from top • {ctaFontSize}px • slide-up at 2s</span>
                    </div>
                    <input
                        type="text"
                        placeholder="Enter your call-to-action..."
                        value={outroConfig.ctaText}
                        onChange={(e) => setOutroConfig({ ctaText: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm"
                    />
                    {/* CTA font controls — manual size selection */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Size</span>
                        <select
                            value={ctaFontSize}
                            onChange={(e) => setCtaFontSize(Number(e.target.value))}
                            className="px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                        >
                            {[56, 58, 60, 62, 64, 66, 68, 70, 72].map(s => (
                                <option key={s} value={s}>{s}px</option>
                            ))}
                        </select>
                        <span className="text-xs font-extrabold text-muted-foreground">Inter ExtraBold</span>
                    </div>
                </div>

                {/* Layer 2 — Disclaimer */}
                <div className="p-3 rounded-lg bg-surface-elevated border border-border space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-amber-400">2</span>
                        </div>
                        <label className="text-sm font-medium">Disclaimer Text</label>
                        <span className="text-xs text-muted-foreground ml-auto">77% from top • {resolvedDisclaimerFontSize}px auto • fade at 2s</span>
                    </div>
                    {scriptEntries[segments.findIndex(s => s.isOutro) >= 0 ? segments.findIndex(s => s.isOutro) : segments.length - 1]?.disclaimer && !outroConfig.disclaimerText && (
                        <div className="flex items-center gap-1.5 text-xs text-primary">
                            <Check className="w-3 h-3" />
                            <span>Auto-populated from script</span>
                        </div>
                    )}
                    <textarea
                        placeholder="Enter disclaimer text... (auto-populated from script if available)"
                        value={outroConfig.disclaimerText}
                        onChange={(e) => setOutroConfig({ disclaimerText: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none resize-none text-sm"
                    />
                    {/* Disclaimer font info — auto-computed */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Size</span>
                        <div
                            className="px-2 py-1.5 rounded bg-background border border-border text-xs text-muted-foreground"
                            title="24px default; switches to 16px if text exceeds 3 lines"
                        >
                            {resolvedDisclaimerFontSize}px <span className="text-[9px] opacity-60">auto</span>
                        </div>
                        <span className="text-xs font-normal text-muted-foreground">Inter Regular</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        If a script was uploaded with a disclaimer section, it will be auto-filled here.
                    </p>
                </div>
            </div>

            {outroTranslateError && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400">{outroTranslateError}</p>
                </div>
            )}

            <Button
                variant="gradient"
                className="w-full"
                onClick={handleContinue}
                disabled={isSavingOutro}
            >
                {isSavingOutro ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Translating Outro...</>
                ) : (
                    <>Continue to Export<ArrowRight className="w-4 h-4 ml-2" /></>
                )}
            </Button>
        </div>
    );
}

function ExportStepContent() {
    const {
        selectedLanguages, isExporting, setIsExporting,
        video, segments, translations, dubbingTracks, videoHasAudio, outroConfig,
    } = useAppStore();

    // Single source of truth: rendered blob URL per language (preview + download reuse the same blob)
    const [renderedBlobs, setRenderedBlobs] = useState<Record<string, string>>({});
    const [renderProgress, setRenderProgress] = useState<Record<string, number>>({});
    const [renderErrors, setRenderErrors] = useState<Record<string, string>>({});
    const [renderingLangs, setRenderingLangs] = useState<Set<string>>(new Set());

    const allReadyTracks = dubbingTracks.filter(t => t.status === 'ready' && t.audioBlobUrl);

    // Measure audio durations — still needed to compute per-scene playbackRate for FFmpeg
    const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
    useEffect(() => {
        if (allReadyTracks.length === 0) return;
        let cancelled = false;
        const measure = async () => {
            const durations: Record<string, number> = {};
            await Promise.all(allReadyTracks.map(track => new Promise<void>(resolve => {
                if (!track.audioBlobUrl) { resolve(); return; }
                const a = new Audio();
                a.preload = 'metadata';
                a.onloadedmetadata = () => { durations[track.id] = a.duration; resolve(); };
                a.onerror = () => resolve();
                a.src = track.audioBlobUrl!;
            })));
            if (!cancelled) setAudioDurations(durations);
        };
        measure();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allReadyTracks.length]);

    // Render one language via the backend. Returns the blob URL on success.
    const renderLanguage = async (lang: string): Promise<string | null> => {
        if (!video) return null;

        setRenderingLangs(prev => new Set([...prev, lang]));
        setRenderErrors(prev => { const n = { ...prev }; delete n[lang]; return n; });
        setRenderProgress(prev => ({ ...prev, [lang]: 1 }));

        try {
            const langTracks = allReadyTracks.filter(t => t.languageCode === lang);

            const audioBlobsPerScene: (Blob | null)[] = await Promise.all(
                segments.map(async (seg) => {
                    const track = langTracks.find(t => t.segmentId === seg.id);
                    if (!track?.audioBlobUrl) return null;
                    try {
                        const r = await fetch(track.audioBlobUrl);
                        return await r.blob();
                    } catch { return null; }
                })
            );

            const sceneConfigs = segments.map((seg, i) => {
                const track = langTracks.find(t => t.segmentId === seg.id);
                const audioDur = track ? (audioDurations[track.id] ?? 0) : 0;
                const sceneDur = seg.timecode.endTime - seg.timecode.startTime;
                const playbackRate = (audioDur > 0 && audioDur > sceneDur && sceneDur > 0)
                    ? Math.max(0.5, sceneDur / audioDur)
                    : 1.0;
                const outputDuration = sceneDur / playbackRate;
                const scale = 1.0 / playbackRate;

                const tLayers = seg.textLayers
                    .filter(layer => (layer.content ?? '').trim().length > 0)
                    .map(layer => {
                        const tr = translations.get(layer.id)?.find(t => t.languageCode === lang);
                        // For outro-managed layers, prefer outroConfig.translations over the generic map
                        let content = tr?.translatedContent || layer.content;
                        const outroLangTr = outroConfig.translations[lang as import('@/types').LanguageCode];
                        if (outroLangTr) {
                            if (layer.id.startsWith('text-outro-cta-')) {
                                content = outroLangTr.ctaText || content;
                            } else if (layer.id.startsWith('text-outro-disclaimer-')) {
                                content = outroLangTr.disclaimerText || content;
                            }
                        }
                        return {
                            content,
                            positionX: layer.positionX,
                            positionY: layer.positionY,
                            positionAnchor: layer.positionAnchor ?? 'middle',
                            fontSize: layer.fontSize,
                            fontWeight: layer.fontWeight ?? 800,
                            color: layer.color,
                            backgroundColor: layer.backgroundColor ?? undefined,
                            animationType: layer.animationType ?? 'fade',
                            stayTillEnd: layer.endTime === -1,
                            startTime: layer.startTime * scale,
                            endTime: layer.endTime === -1 ? outputDuration : layer.endTime * scale,
                            maxLines: layer.textStyle === 'disclaimer' ? 0 : 2,
                            textStyle: layer.textStyle,
                        };
                    });

                return {
                    index: i,
                    startTime: seg.timecode.startTime,
                    endTime: seg.timecode.endTime,
                    playbackRate,
                    hasAudio: !!audioBlobsPerScene[i],
                    textLayers: tLayers,
                };
            });

            const overlayUploads: { key: string; blob: Blob }[] = [];
            for (const sceneCfg of sceneConfigs) {
                for (let li = 0; li < sceneCfg.textLayers.length; li += 1) {
                    const textLayer = sceneCfg.textLayers[li] as ExportOverlayLayer & { overlayFileKey?: string };
                    const rendered = await renderLayerOverlayCached(textLayer, video.width, video.height);
                    if (rendered.resolvedFontSize !== null) {
                        textLayer.fontSize = rendered.resolvedFontSize;
                    }
                    if (!rendered.blob) continue;
                    const overlayKey = buildOverlayKey(sceneCfg.index, li);
                    textLayer.overlayFileKey = overlayKey;
                    overlayUploads.push({ key: overlayKey, blob: rendered.blob });
                }
            }

            const formData = new FormData();
            formData.append('video', video.file);
            audioBlobsPerScene.forEach((blob, i) => {
                if (blob) formData.append(`audio_${i}`, blob, `audio_${i}.mp3`);
            });
            overlayUploads.forEach((overlay) => {
                formData.append(overlay.key, overlay.blob, `${overlay.key}.png`);
            });
            formData.append('config', JSON.stringify({
                lang,
                scenes: sceneConfigs,
                videoWidth: video.width,
                videoHeight: video.height,
                fps: video.frameRate ?? 30,
                videoHasAudio: videoHasAudio ?? false,
            }));

            const progressInterval = setInterval(() => {
                setRenderProgress(prev => ({
                    ...prev,
                    [lang]: Math.min(88, (prev[lang] ?? 1) + 2),
                }));
            }, 1500);

            const response = await fetch(api('/api/export-video'), {
                method: 'POST',
                body: formData,
            });
            clearInterval(progressInterval);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `HTTP ${response.status}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setRenderedBlobs(prev => ({ ...prev, [lang]: url }));
            setRenderProgress(prev => ({ ...prev, [lang]: 100 }));
            return url;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Render failed';
            console.error(`[export] ${lang}:`, msg);
            setRenderErrors(prev => ({ ...prev, [lang]: msg }));
            setRenderProgress(prev => ({ ...prev, [lang]: 0 }));
            return null;
        } finally {
            setRenderingLangs(prev => { const n = new Set(prev); n.delete(lang); return n; });
        }
    };

    const exportAll = async () => {
        setIsExporting(true);
        for (const lang of selectedLanguages) {
            const url = renderedBlobs[lang] ?? await renderLanguage(lang);
            if (url) {
                const stem = (video?.file.name ?? 'export').replace(/\.[^/.]+$/, '');
                const a = document.createElement('a');
                a.href = url;
                a.download = `${stem}_${lang}.mp4`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }
        setIsExporting(false);
    };

    const anyRendering = renderingLangs.size > 0;

    return (
        <div className="pt-4 space-y-3">
            {selectedLanguages.map((lang) => {
                const info = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                const isRendering = renderingLangs.has(lang);
                const progress = renderProgress[lang] ?? 0;
                const blobUrl = renderedBlobs[lang];
                const error = renderErrors[lang];
                const isDone = progress === 100 && !error && !!blobUrl;

                return (
                    <div
                        key={lang}
                        className={cn(
                            'rounded-xl border overflow-hidden',
                            isDone ? 'border-success/30 bg-success/5' : 'border-border bg-surface-elevated'
                        )}
                    >
                        {/* Card header */}
                        <div className="flex items-center gap-2 px-4 py-3">
                            <span className="text-lg">{info?.flag}</span>
                            <span className="font-semibold text-sm">{info?.name}</span>
                            {isDone && <Check className="w-4 h-4 text-success ml-auto" />}
                            {isRendering && (
                                <span className="text-xs text-muted-foreground ml-auto">{progress}%</span>
                            )}
                            {error && <AlertCircle className="w-4 h-4 text-red-400 ml-auto" />}
                        </div>

                        {/* Progress bar */}
                        {isRendering && (
                            <div className="px-4 pb-2">
                                <Progress value={progress} className="h-1" />
                            </div>
                        )}

                        {/* Error message */}
                        {error && (
                            <p className="px-4 pb-2 text-xs text-red-400 leading-tight">{error}</p>
                        )}

                        {/* Rendered video preview — the actual FFmpeg output, no sync hacks */}
                        {blobUrl && (
                            <div className="px-4 pb-3">
                                <video
                                    src={blobUrl}
                                    controls
                                    className="w-full rounded-lg bg-black"
                                    style={{ maxHeight: '360px' }}
                                />
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2 px-4 pb-3">
                            <Button
                                variant={isDone ? 'outline' : 'gradient'}
                                size="sm"
                                className="flex-1"
                                onClick={() => renderLanguage(lang)}
                                disabled={isRendering || isExporting}
                            >
                                {isRendering ? (
                                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Rendering...</>
                                ) : isDone ? (
                                    <><Film className="w-3.5 h-3.5 mr-1.5" />Re-render</>
                                ) : (
                                    <><Film className="w-3.5 h-3.5 mr-1.5" />Render Preview</>
                                )}
                            </Button>

                            {blobUrl && (
                                <a href={blobUrl} download={`export_${lang}.mp4`}>
                                    <Button variant="outline" size="sm" className="gap-1.5">
                                        <Download className="w-3.5 h-3.5" />
                                        Download
                                    </Button>
                                </a>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Export All — renders any unrendered languages, then downloads all */}
            <Button
                variant="gradient"
                className="w-full"
                onClick={exportAll}
                disabled={isExporting || anyRendering}
            >
                {isExporting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting...</>
                ) : (
                    <><Download className="w-4 h-4 mr-2" />Export All Videos</>
                )}
            </Button>
        </div>
    );
}

// ============================================
// Main Page Component
// ============================================

export default function Home() {
    const { currentStep, video, segments, isAnalyzing, isTranslating, isGeneratingDubbing, isExporting } = useAppStore();
    const [expandedSteps, setExpandedSteps] = useState<Set<AppStep>>(new Set(['upload']));

    const stepOrder: AppStep[] = ['upload', 'analyze', 'edit-text', 'translate', 'translate-voiceover', 'dub', 'outro', 'export'];
    const currentIndex = stepOrder.indexOf(currentStep);

    // Auto-expand current step
    useEffect(() => {
        setExpandedSteps(prev => new Set([...prev, currentStep]));
    }, [currentStep]);

    const getStepStatus = (stepId: AppStep) => {
        const stepIndex = stepOrder.indexOf(stepId);

        const isCompleted = (() => {
            switch (stepId) {
                case 'upload': return !!video;
                case 'analyze': return segments.length > 0;
                case 'edit-text': return segments.some(s => s.textLayers.length > 0);
                default: return stepIndex < currentIndex;
            }
        })();

        const isActive = stepId === currentStep;
        const isLocked = stepIndex > currentIndex + 1;
        const isProcessing =
            (stepId === 'analyze' && isAnalyzing) ||
            (stepId === 'translate' && isTranslating) ||
            (stepId === 'translate-voiceover' && isTranslating) ||
            (stepId === 'dub' && isGeneratingDubbing) ||
            (stepId === 'export' && isExporting);

        return { isCompleted, isActive, isLocked, isProcessing };
    };

    const toggleStep = (stepId: AppStep) => {
        const { isLocked } = getStepStatus(stepId);
        if (isLocked) return;

        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) {
                next.delete(stepId);
            } else {
                next.add(stepId);
            }
            return next;
        });
    };

    const stepConfigs = [
        { id: 'upload' as AppStep, title: 'Upload Video', description: 'Upload your video file', icon: <Upload className="w-4 h-4" />, content: <StepErrorBoundary><UploadStepContent /></StepErrorBoundary> },
        { id: 'analyze' as AppStep, title: 'Analyze Scenes', description: 'AI detects scene changes', icon: <Scan className="w-4 h-4" />, content: <StepErrorBoundary><AnalyzeStepContent /></StepErrorBoundary> },
        { id: 'edit-text' as AppStep, title: 'Edit Text Overlays', description: 'Add text overlays with animations', icon: <Type className="w-4 h-4" />, content: <StepErrorBoundary><EditTextStepContent /></StepErrorBoundary> },
        { id: 'translate' as AppStep, title: 'Translate Text', description: 'Translate text overlays to other languages', icon: <Languages className="w-4 h-4" />, content: <StepErrorBoundary><TranslateStepContent /></StepErrorBoundary> },
        { id: 'translate-voiceover' as AppStep, title: 'Translate Voiceover', description: 'Translate spoken script for dubbing', icon: <Mic className="w-4 h-4" />, content: <StepErrorBoundary><TranslateVoiceoverStepContent /></StepErrorBoundary> },
        { id: 'dub' as AppStep, title: 'Voice Dubbing', description: 'Clone voice and generate dubbed audio', icon: <Mic className="w-4 h-4" />, content: <StepErrorBoundary><DubStepContent /></StepErrorBoundary> },
        { id: 'outro' as AppStep, title: 'Outro', description: 'Add CTA and disclaimer', icon: <Film className="w-4 h-4" />, content: <StepErrorBoundary><OutroStepContent /></StepErrorBoundary> },
        { id: 'export' as AppStep, title: 'Export', description: 'Download all translated videos', icon: <Download className="w-4 h-4" />, content: <StepErrorBoundary><ExportStepContent /></StepErrorBoundary> },
    ];

    return (
        <main className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                            <Film className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg">POD Translation</h1>
                            <p className="text-xs text-muted-foreground">Video Automation Tool</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <div className="max-w-6xl mx-auto px-4 py-6">
                <div className="space-y-3">
                    {stepConfigs.map((step) => {
                        const { isCompleted, isActive, isLocked, isProcessing } = getStepStatus(step.id);
                        const isExpanded = expandedSteps.has(step.id);

                        return (
                            <StepSection
                                key={step.id}
                                stepId={step.id}
                                title={step.title}
                                description={step.description}
                                icon={step.icon}
                                isCompleted={isCompleted}
                                isActive={isActive}
                                isLocked={isLocked}
                                isExpanded={isExpanded}
                                isProcessing={isProcessing}
                                onToggle={() => toggleStep(step.id)}
                            >
                                {step.content}
                            </StepSection>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
