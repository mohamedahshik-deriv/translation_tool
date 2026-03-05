"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Upload, Scan, Type, Languages, Mic, Film, Download,
    ChevronDown, ChevronUp, Check, Lock, Loader2, Settings,
    ArrowRight, Plus, Trash2, Play, Pause, RotateCcw, Volume2, VolumeX,
    Scissors, GripVertical, Clock, FileText, X, BookOpen,
    SkipBack, SkipForward
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/store/app-store";
import { AppStep, APP_STEPS, SUPPORTED_LANGUAGES, VideoSegment, Timecode, AnimationType, TextLayer } from "@/types";
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
        <motion.div
            layout
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
        </motion.div>
    );
}

// ============================================
// Step Content Components
// ============================================

function UploadStepContent() {
    const { video, setVideo, setCurrentStep, script, setScript, setShouldAutoAnalyze } = useAppStore();
    const [isDragging, setIsDragging] = useState(false);
    const [isScriptDragging, setIsScriptDragging] = useState(false);
    const [isParsingScript, setIsParsingScript] = useState(false);
    const [scriptError, setScriptError] = useState<string | null>(null);

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

    // Convert seconds → frame number string e.g. "F42"
    const formatTime = (s: number) => `F${Math.round(s * FPS)}`;

    // Shorter label for ruler ticks
    const formatTimeShort = (s: number) => `F${Math.round(s * FPS)}`;

    // Generate scene colors - more vibrant
    const sceneColors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
    const allCuts = [0, ...cutPoints, duration];

    // Generate frame-based time markers
    // Pick a marker interval in frames so we get ~6-10 ticks across the timeline
    const totalFrames = Math.round(duration * FPS);
    const rawFrameInterval = totalFrames / 8;
    // Round to a "nice" frame count: 1, 5, 10, 15, 30, 60, 90, 120, 150, 300 …
    const niceIntervals = [1, 5, 10, 15, 30, 60, 90, 120, 150, 300, 600];
    const frameInterval = niceIntervals.find(n => n >= rawFrameInterval) ?? niceIntervals[niceIntervals.length - 1];
    const timeMarkers: number[] = [];
    for (let f = 0; f <= totalFrames; f += frameInterval) {
        timeMarkers.push(f / FPS); // store as seconds for positioning
    }

    return (
        <div className="space-y-2 bg-surface-elevated rounded-xl p-4 border border-border">
            {/* Header with instructions */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Scene Timeline</span>
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
                                    {Math.round(sceneDuration * FPS)}f
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
                        <span className="text-muted-foreground">F0</span>
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
        </div>
    );
}

function AnalyzeStepContent() {
    const { video, segments, setSegments, setCurrentStep, isAnalyzing, setIsAnalyzing, script, setScriptEntries, setScriptAutoPopulated, shouldAutoAnalyze, setShouldAutoAnalyze, setOutroConfig } = useAppStore();
    const [progress, setProgress] = useState(0);
    const [cutPoints, setCutPoints] = useState<number[]>([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [previewingScene, setPreviewingScene] = useState<number | null>(null);
    const videoPreviewRef = useRef<HTMLVideoElement>(null);
    const wasPlayingBeforeScrub = useRef(false);

    const duration = video?.duration ?? 0;
    const FPS = video?.frameRate ?? 30;

    // Snap a time value to the nearest frame boundary
    const snapToFrame = useCallback((time: number) => {
        return Math.round(time * FPS) / FPS;
    }, [FPS]);

    // Sync cut points from segments when they exist
    useEffect(() => {
        if (segments.length > 1) {
            const points = segments.slice(0, -1).map(s => s.timecode.endTime);
            setCutPoints(points);
        }
    }, []);

    // Build segments from cut points — preserves existing text layers at matching indices
    const buildSegments = useCallback((cuts: number[]) => {
        if (!video) return;
        const allPoints = [0, ...cuts.sort((a, b) => a - b), duration];
        const existingSegments = useAppStore.getState().segments;
        const newSegments: VideoSegment[] = [];

        for (let i = 0; i < allPoints.length - 1; i++) {
            // Preserve text layers from the same index if they exist
            const existingLayers = existingSegments[i]?.textLayers ?? [];
            newSegments.push({
                id: `segment-${i}`,
                videoId: video.id,
                timecode: {
                    id: `tc-${i}`,
                    startTime: allPoints[i],
                    endTime: allPoints[i + 1],
                    segmentIndex: i,
                    description: `Scene ${i + 1}`,
                },
                textLayers: existingLayers,
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
        setCutPoints(prev => [...prev, time].sort((a, b) => a - b));
    }, []);

    const handleRemoveCut = useCallback((index: number) => {
        setCutPoints(prev => prev.filter((_, i) => i !== index));
    }, []);

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

        try {
            setProgress(10);
            const { uploadVideo, getPublicUrl, STORAGE_BUCKETS, analyzeScenes, matchScriptToScenes, isSupabaseConfigured } = await import("@/lib/supabase");
            const { sessionId } = useAppStore.getState();

            if (!isSupabaseConfigured()) {
                throw new Error("Supabase is not configured. Please set up your .env.local file.");
            }

            console.log("Uploading video to Supabase Storage...");
            const storagePath = await uploadVideo(video.file, sessionId);
            console.log("Upload complete. Storage path:", storagePath);

            const videoUrl = getPublicUrl(STORAGE_BUCKETS.VIDEOS, storagePath);
            console.log("Public URL:", videoUrl);
            setProgress(30);

            if (script) {
                // Use script-matching edge function when script is available
                console.log("Calling match-script-to-scenes Edge Function with script...");
                const result = await matchScriptToScenes(videoUrl, video.duration, script.extractedText);
                console.log("Script match result:", JSON.stringify(result));
                setProgress(80);

                // Reset auto-populate guards so EditTextStep re-populates with fresh AI data
                _scriptAutoPopulateLock = false;
                setScriptAutoPopulated(false);

                // Extract cut points from AI results — snap to nearest frame
                const aiCutPoints = result.scenes.slice(0, -1).map(s => snapToFrame(s.endTime));
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
                // Debug: log disclaimer for each scene
                entries.forEach((e, i) => {
                    console.log(`[ScriptEntry ${i}] textOnScreen="${e.textOnScreen}" disclaimer="${e.disclaimer.slice(0, 60)}"`);
                });

                // Auto-fill outroConfig.disclaimerText:
                // Use AI-returned disclaimer from the last scene; fall back to client-side extraction
                const lastEntry = entries[entries.length - 1];
                const aiDisclaimer = lastEntry?.disclaimer || '';
                const rawClientDisclaimer = aiDisclaimer || (script ? extractDisclaimerFromScript(script.extractedText) : '');
                const clientDisclaimer = stripDisclaimerPrefix(rawClientDisclaimer);
                if (clientDisclaimer) {
                    setOutroConfig({ disclaimerText: clientDisclaimer });
                    console.log(`[Disclaimer] Auto-filled outroConfig.disclaimerText (${aiDisclaimer ? 'from AI' : 'from client fallback'}): "${clientDisclaimer.slice(0, 80)}..."`);
                } else {
                    console.log('[Disclaimer] No disclaimer found in AI response or script text');
                }
            } else {
                // Use standard scene analysis when no script
                console.log("Calling analyze-scenes Edge Function...");
                const result = await analyzeScenes(videoUrl, video.duration);
                console.log("Analysis result:", JSON.stringify(result));
                setProgress(80);

                // Extract cut points from AI results (all endTimes except the last) — snap to nearest frame
                const aiCutPoints = result.scenes.slice(0, -1).map(s => snapToFrame(s.endTime));
                setCutPoints(aiCutPoints);
            }

            setProgress(100);
        } catch (err) {
            console.error('Analysis failed:', err);
            alert(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Auto-trigger analysis when navigating from Upload step with Continue button
    useEffect(() => {
        if (shouldAutoAnalyze && video && !isAnalyzing) {
            setShouldAutoAnalyze(false); // Reset flag so it doesn't re-trigger
            startAnalysis();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldAutoAnalyze, video]);

    const allScenes = cutPoints.length > 0
        ? [0, ...cutPoints.sort((a, b) => a - b), duration].reduce<{ start: number; end: number }[]>((acc, point, i, arr) => {
            if (i < arr.length - 1) acc.push({ start: point, end: arr[i + 1] });
            return acc;
        }, [])
        : [];

    const formatTime = (s: number) => `F${Math.round(s * FPS)}`;
    const formatTimeSec = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 10);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    };

    return (
        <div className="pt-4 space-y-4">
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
                                <Play className="w-6 h-6 text-gray-900 ml-0.5" />
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
                            <span className="ml-1 text-xs opacity-60">({formatTimeSec(currentTime)})</span>
                        </Button>
                    </>
                )}
            </div>

            {/* Scene list */}
            {allScenes.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{allScenes.length} scenes</span>
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
                            const scriptEntry = useAppStore.getState().scriptEntries[i];
                            return (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex flex-col gap-1 p-2 rounded-lg border transition-colors cursor-pointer",
                                        previewingScene === i
                                            ? "border-primary bg-primary/10"
                                            : "border-border bg-surface-elevated hover:border-muted-foreground/30"
                                    )}
                                    onClick={() => {
                                        setPreviewingScene(i);
                                        handleSeek(scene.start);
                                    }}
                                >
                                    {/* Scene header row */}
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-3 h-3 rounded-full shrink-0"
                                            style={{ backgroundColor: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'][i % 8] }}
                                        />
                                        <span className="text-sm font-medium">
                                            {i === allScenes.length - 1 ? '🎬 Outro' : `Scene ${i + 1}`}
                                        </span>
                                        <span className="text-xs text-muted-foreground font-mono ml-auto">
                                            {formatTime(scene.start)} – {formatTime(scene.end)}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            ({Math.round((scene.end - scene.start) * FPS)}f)
                                        </span>
                                        {/* Remove cut button (for cuts between scenes, not first/last) */}
                                        {i < cutPoints.length && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveCut(i);
                                                }}
                                                className="p-1 text-muted-foreground hover:text-red-400 shrink-0"
                                                title="Remove this cut point"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    {/* Script matched text preview */}
                                    {scriptEntry && scriptEntry.textOnScreen && (
                                        <div className="flex items-start gap-1.5 pl-5">
                                            <Type className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                                            <p className="text-xs text-primary truncate">{scriptEntry.textOnScreen}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

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
    positionX: number;
    positionY: number;
    fontSize: number;
    fontWeight?: number; // defaults to 800 if not set
    color: string;
    backgroundColor?: string;
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

// AutoFitText: renders text at maxFontSize and shrinks until it fits within maxLines.
// Uses a ResizeObserver + hidden off-screen div to binary-search the right size.
function AutoFitText({
    content,
    defaultColor,
    maxFontSize,
    lineHeight,
    maxLines,
    backgroundColor,
    textAlign,
    animClass,
    opacity,
    fontWeight = 800,
    noClamp = false,
}: {
    content: string;
    defaultColor: string;
    maxFontSize: number;
    lineHeight: number;
    maxLines: number;
    backgroundColor?: string;
    textAlign: 'left' | 'center' | 'right';
    animClass: string;
    opacity?: number;
    fontWeight?: number;
    noClamp?: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [fittedSize, setFittedSize] = useState(maxFontSize);

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
            'font-family:Inter,sans-serif',
        ].join(';');
        document.body.appendChild(probe);

        const minSize = 10;
        let lo = minSize;
        let hi = maxFontSize;
        let best = minSize;

        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            probe.style.fontSize = `${mid}px`;
            probe.style.lineHeight = `${lineHeight}`;
            probe.textContent = content;

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
    }, [content, maxFontSize, lineHeight, maxLines]);

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
        <div ref={containerRef} style={{ width: '100%' }}>
            <div
                className={cn('inline-block', animClass)}
                style={{
                    fontSize: `${fittedSize}px`,
                    color: defaultColor,
                    backgroundColor: backgroundColor || 'transparent',
                    padding: backgroundColor ? '6px 14px' : '0',
                    borderRadius: backgroundColor ? '6px' : '0',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: fontWeight,
                    maxWidth: '100%',
                    width: '100%',
                    textAlign: textAlign,
                    wordBreak: 'break-word' as const,
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
}: {
    videoUrl: string;
    startTime: number;
    endTime: number;
    textLayers?: TextLayerOverlay[];
    fps?: number;
    videoFile?: File | null;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rVFCHandle = useRef<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(startTime);
    const [isLooping, setIsLooping] = useState(true);
    const [isMuted, setIsMuted] = useState(false);

    // Frame-accurate overlay state
    const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);
    const [isExtractingFrame, setIsExtractingFrame] = useState(false);
    const [ffmpegReady, setFfmpegReady] = useState(false);
    const [ffmpegLoadProgress, setFfmpegLoadProgress] = useState(0);
    const frameExtractionAbort = useRef<AbortController | null>(null);

    const FPS = fps;
    const FRAME = 1 / FPS;
    const duration = endTime - startTime;
    const progress = ((currentTime - startTime) / duration) * 100;

    // Snap time to nearest frame
    const snapToFrame = useCallback((t: number) => Math.round(t * FPS) / FPS, [FPS]);

    // Preload FFmpeg.wasm in the background when component mounts
    useEffect(() => {
        if (!videoFile) return;
        let cancelled = false;
        import('@/lib/frame-extractor').then(({ preloadFFmpeg, isFFmpegReady }) => {
            if (isFFmpegReady()) {
                if (!cancelled) setFfmpegReady(true);
                return;
            }
            preloadFFmpeg((ratio) => {
                if (!cancelled) setFfmpegLoadProgress(Math.round(ratio * 100));
            }).then(() => {
                if (!cancelled) setFfmpegReady(true);
            }).catch(() => {/* FFmpeg load failed — fall back to native seeking */ });
        });
        return () => { cancelled = true; };
    }, [videoFile]);

    // Extract frame at current time when paused (frame-accurate overlay)
    const extractCurrentFrame = useCallback(async (time: number) => {
        if (!videoFile || !ffmpegReady) return;

        // Cancel any in-flight extraction
        frameExtractionAbort.current?.abort();
        const abort = new AbortController();
        frameExtractionAbort.current = abort;

        setIsExtractingFrame(true);
        try {
            const { extractFrame } = await import('@/lib/frame-extractor');
            if (abort.signal.aborted) return;
            const result = await extractFrame({
                file: videoFile,
                fileId: videoFile.name + '_' + videoFile.size,
                timestamp: snapToFrame(time),
                fps: FPS,
            });
            if (!abort.signal.aborted) {
                setFrameImageUrl(result.url);
            }
        } catch {
            // Extraction failed — fall back to native video display
        } finally {
            if (!abort.signal.aborted) setIsExtractingFrame(false);
        }
    }, [videoFile, ffmpegReady, FPS, snapToFrame]);

    // Use requestVideoFrameCallback for frame-accurate currentTime tracking
    const startRVFC = useCallback(() => {
        const video = videoRef.current;
        if (!video || !('requestVideoFrameCallback' in video)) return;
        const tick = (_now: number, meta: { mediaTime: number }) => {
            const snapped = snapToFrame(meta.mediaTime);
            setCurrentTime(snapped);
            // Loop check
            if (snapped >= endTime) {
                if (isLooping) {
                    video.currentTime = startTime;
                    video.play();
                } else {
                    video.pause();
                    setIsPlaying(false);
                    return;
                }
            }
            rVFCHandle.current = (video as any).requestVideoFrameCallback(tick);
        };
        rVFCHandle.current = (video as any).requestVideoFrameCallback(tick);
    }, [FPS, startTime, endTime, isLooping, snapToFrame]);

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
            setFrameImageUrl(null);
            video.pause();
            // Extract the first frame of the new scene (if FFmpeg is ready)
            extractCurrentFrame(snapped);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startTime, endTime]);

    // When FFmpeg becomes ready, re-extract the current frame if we're paused
    // (handles the case where scene changed before FFmpeg finished loading)
    useEffect(() => {
        if (ffmpegReady && !isPlaying) {
            extractCurrentFrame(currentTime);
        }
        // Only run when ffmpegReady transitions to true
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ffmpegReady]);

    // Fallback: Handle time updates via onTimeUpdate when rVFC not available
    const handleTimeUpdate = useCallback(() => {
        const video = videoRef.current as HTMLVideoElement | null;
        if (!video) return;
        if ('requestVideoFrameCallback' in video) return; // rVFC handles it

        const snapped = snapToFrame(video.currentTime);
        setCurrentTime(snapped);

        // Loop back to start when reaching end of scene
        if (video.currentTime >= endTime) {
            if (isLooping) {
                video.currentTime = snapToFrame(startTime);
                video.play();
            } else {
                video.pause();
                setIsPlaying(false);
            }
        }
    }, [startTime, endTime, isLooping, snapToFrame]);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isPlaying) {
            video.pause();
            stopRVFC();
            setIsPlaying(false);
            // Extract frame at current paused position
            extractCurrentFrame(currentTime);
        } else {
            // Hide frame overlay when playing
            setFrameImageUrl(null);
            // Ensure we start from the scene start if at the end
            if (video.currentTime >= endTime || video.currentTime < startTime) {
                video.currentTime = snapToFrame(startTime);
            }
            video.play();
            setIsPlaying(true);
            startRVFC();
        }
    }, [isPlaying, startTime, endTime, currentTime, snapToFrame, startRVFC, stopRVFC, extractCurrentFrame]);

    const restartScene = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        stopRVFC();
        setFrameImageUrl(null);
        video.currentTime = snapToFrame(startTime);
        setCurrentTime(snapToFrame(startTime));
        video.play();
        setIsPlaying(true);
        startRVFC();
    }, [startTime, snapToFrame, startRVFC, stopRVFC]);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !isMuted;
        setIsMuted(!isMuted);
    }, [isMuted]);

    const goToFirstFrame = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        stopRVFC();
        setIsPlaying(false);
        video.pause();
        const snapped = snapToFrame(startTime);
        video.currentTime = snapped;
        setCurrentTime(snapped);
        extractCurrentFrame(snapped);
    }, [startTime, snapToFrame, stopRVFC, extractCurrentFrame]);

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
        extractCurrentFrame(snapped);
    }, [endTime, FRAME, snapToFrame, stopRVFC, extractCurrentFrame]);

    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const video = videoRef.current;
        if (!video) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const rawTime = startTime + (percentage * duration);
        const snapped = snapToFrame(Math.max(startTime, Math.min(endTime, rawTime)));
        video.currentTime = snapped;
        setCurrentTime(snapped);
        // Extract frame at clicked position
        if (!isPlaying) {
            extractCurrentFrame(snapped);
        }
    }, [startTime, endTime, duration, snapToFrame, isPlaying, extractCurrentFrame]);

    // Cleanup rVFC and abort on unmount
    useEffect(() => {
        return () => {
            stopRVFC();
            frameExtractionAbort.current?.abort();
        };
    }, [stopRVFC]);

    // Format relative frame within scene
    const formatRelFrame = (seconds: number) => `F${Math.round(seconds * FPS)}`;

    // Calculate relative time within the scene (0 to duration)
    const relativeTime = Math.max(0, currentTime - startTime);

    // Check if a text layer should be visible based on timing
    // Always show if startTime is 0 and we're at the beginning
    const isLayerVisible = (layer: TextLayerOverlay) => {
        const rt = Math.max(0, relativeTime);
        return rt >= layer.startTime && rt <= layer.endTime;
    };

    return (
        <div
            ref={containerRef}
            className="flex justify-center"
        >
            {/* Video Container - maintains 9:16 aspect ratio */}
            <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '9/16', maxHeight: '500px', width: 'auto' }}>
                {/* Video Element — always rendered for playback, hidden behind frame overlay when paused */}
                <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-cover"
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    playsInline
                    muted={isMuted}
                    onClick={() => togglePlay()}
                />

                {/* Frame-accurate overlay: shown when paused and FFmpeg has extracted the frame */}
                {frameImageUrl && !isPlaying && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={frameImageUrl}
                        alt={`Frame at ${formatRelFrame(currentTime - startTime)}`}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ zIndex: 2 }}
                        onClick={() => togglePlay()}
                    />
                )}

                {/* FFmpeg loading indicator — shown while loading WASM or extracting frame */}
                {videoFile && (!ffmpegReady || isExtractingFrame) && (
                    <div
                        className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/70 text-white text-xs px-2 py-1 rounded-full"
                        style={{ zIndex: 15 }}
                    >
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {!ffmpegReady
                            ? `Loading decoder${ffmpegLoadProgress > 0 ? ` ${ffmpegLoadProgress}%` : '...'}`
                            : 'Extracting frame...'}
                    </div>
                )}

                {/* Text Layer Overlays - positioned relative to video content only */}
                {/* containerType inline-size enables cqw units so font sizes scale with player width */}
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10, containerType: 'inline-size' }}>
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

                        // Hide text only if we have no frame to show yet (no frame overlay and never played)
                        // Once a frame is extracted (frameImageUrl set), show text at the correct time
                        const neverPlayed = !isPlaying && !frameImageUrl && currentTime === startTime;

                        if (neverPlayed) {
                            // No frame extracted yet — hide all text to avoid ghosting
                            animState = 'hidden-before';
                        } else if (relativeTime < enterStart) {
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

                        // Determine text alignment based on horizontal position
                        const textAlign: 'left' | 'center' | 'right' = layer.positionX <= 20 ? 'left' : layer.positionX >= 80 ? 'right' : 'center';
                        // Determine vertical transform based on position
                        const translateY = layer.positionY <= 20 ? '0%' : layer.positionY >= 80 ? '-100%' : '-50%';

                        return (
                            <div
                                key={layer.id}
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    // Horizontal: always span the safe area (12% to 88%), use text-align for positioning
                                    left: '12%',
                                    right: '12%',
                                    top: `${layer.positionY}%`,
                                    transform: `translateY(${translateY})`,
                                    zIndex: 20,
                                    userSelect: 'none',
                                    textAlign: textAlign,
                                    // Smooth position changes when using preset grid
                                    transition: 'top 0.3s ease, transform 0.3s ease',
                                }}
                            >
                                {((layer.fontWeight ?? 800) <= 400 || layer.id.includes('disclaimer')) ? (
                                    // Disclaimer layer: fine-print
                                    // Use transform scale to bypass browser minimum font-size restrictions
                                    // Renders at 14px then scales to 50% = visually 7px
                                    <div
                                        style={{
                                            width: '100%',
                                            overflow: 'visible',
                                            opacity: !isInTimeRange ? 0 : undefined,
                                        }}
                                    >
                                        <div
                                            className={cn(isInTimeRange ? getAnimClass() : 'text-anim-hidden')}
                                            style={{
                                                fontSize: '14px',
                                                lineHeight: 1.4,
                                                fontWeight: 400,
                                                fontFamily: 'Inter, sans-serif',
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
                                        maxFontSize={Math.max(12, layer.fontSize * 0.5)}
                                        lineHeight={1.3}
                                        maxLines={2}
                                        backgroundColor={layer.backgroundColor}
                                        textAlign={textAlign}
                                        animClass={isInTimeRange ? getAnimClass() : 'text-anim-hidden'}
                                        opacity={!isInTimeRange ? 0 : undefined}
                                        fontWeight={layer.fontWeight ?? 800}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

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
                    {/* Progress Bar */}
                    <div
                        className="h-1.5 bg-white/30 rounded-full mb-2 cursor-pointer group"
                        onClick={handleProgressClick}
                    >
                        <div
                            className="h-full bg-primary rounded-full relative transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
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
                        </div>

                        <span className="font-mono">
                            {formatRelFrame(currentTime - startTime)} / {formatRelFrame(duration)}
                        </span>

                        <button
                            onClick={() => setIsLooping(!isLooping)}
                            className={cn(
                                "px-2 py-1 rounded text-xs font-medium transition-colors",
                                isLooping ? "bg-primary text-white" : "bg-white/20 text-white/70"
                            )}
                        >
                            Loop
                        </button>
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
    const { video, segments, setSegments, setCurrentStep, addTextLayer, removeTextLayer, updateTextLayer, scriptEntries, scriptAutoPopulated, setScriptAutoPopulated } = useAppStore();
    const [activeSegment, setActiveSegment] = useState(0);
    const [editingLayerId, setEditingLayerId] = useState<string | null>(null);

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
        const lastIdx = segments.length - 1;
        const updatedSegments = segments.map((seg, i) => {
            const entry = scriptEntries[i];
            const isOutro = i === lastIdx;

            // Skip if no entry, or segment already has layers
            if (!entry || seg.textLayers.length > 0) return seg;
            // For outro: always proceed (we always create a disclaimer layer even if empty)
            // For other scenes: skip if no textOnScreen
            if (!isOutro && !entry.textOnScreen) return seg;

            const positionY = isOutro ? 49.22 : 7;
            const fontSize = isOutro ? 40 : 64;
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
                    positionX: 50,
                    positionY,
                    fontFamily: "Inter",
                    fontSize,
                    color: isOutro ? "#181C25" : "#ffffff",
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
                    positionX: 50,
                    positionY: 76.67, // 1472px from top on 1080×1920
                    fontFamily: "Inter",
                    fontSize: 24, // 24 * 0.5 preview scale = 12px rendered
                    fontWeight: 400, // Inter Regular
                    color: "#181C25",
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
            addTextLayer(segments[activeSegment].id, {
                id: newLayerId,
                segmentId: segments[activeSegment].id,
                content: "Your text here",
                positionX: 50,
                positionY: 7,
                fontFamily: "Inter",
                fontSize: 64,
                color: "#ffffff",
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
            const isOutro = i === clearedSegments.length - 1;
            if (!entry) return seg;
            // For outro: always proceed (we always create a disclaimer layer even if empty)
            // For other scenes: skip if no textOnScreen
            if (!isOutro && !entry.textOnScreen) return seg;

            // Outro CTA: 945px from TOP on 1080×1920 = 49.22% from top, 40px font, starts at 2s
            const positionY = isOutro ? 49.22 : 7;
            const fontSize = isOutro ? 40 : 64;
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
                positionX: 50,
                positionY,
                fontFamily: "Inter",
                fontSize,
                color: isOutro ? "#181C25" : "#ffffff",
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
                positionX: 50,
                positionY: 76.67, // 1472px from top on 1080×1920
                fontFamily: "Inter",
                fontSize: 24, // 24 * 0.5 preview scale = 12px rendered
                fontWeight: 400, // Inter Regular
                color: "#181C25",
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
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight ?? 800,
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
                        <span className="text-xs text-muted-foreground font-mono">
                            F{Math.round(startTime * (video.frameRate ?? 30))} – F{Math.round(endTime * (video.frameRate ?? 30))}
                        </span>
                    </div>
                    <SceneVideoPlayer
                        videoUrl={video.url}
                        startTime={startTime}
                        endTime={endTime}
                        textLayers={textLayerOverlays}
                        fps={video.frameRate ?? 30}
                        videoFile={video.file}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                        Use position grid to place text • Play to preview animations • Safe area: 128px from edges
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
            <div className="flex gap-2 overflow-x-auto pb-2">
                {segments.map((seg, i) => {
                    const isOutro = i === segments.length - 1;
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
            {activeSegment === segments.length - 1 && segments.length > 0 && (
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

                                {/* Style controls row */}
                                <div className="grid grid-cols-3 gap-2">
                                    {/* Font size */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Size</label>
                                        <select
                                            value={layer.fontSize}
                                            onChange={(e) => updateTextLayer(currentSegment!.id, layer.id, { fontSize: Number(e.target.value) })}
                                            className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs"
                                        >
                                            {[16, 20, 24, 28, 32, 40, 48, 56, 64].map(size => (
                                                <option key={size} value={size}>{size}px</option>
                                            ))}
                                        </select>
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

                                {/* Position Grid - 3x3 preset positions within safe area */}
                                <div className="space-y-2">
                                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Position</label>
                                    <div className="grid grid-cols-3 gap-1 w-fit">
                                        {/* Safe area: 128px from edges on 1080x1920 = ~12% horizontal, ~7% vertical */}
                                        {[
                                            { x: 12, y: 7, label: 'TL' },   // Top Left
                                            { x: 50, y: 7, label: 'TC' },   // Top Center
                                            { x: 88, y: 7, label: 'TR' },   // Top Right
                                            { x: 12, y: 50, label: 'ML' },  // Middle Left
                                            { x: 50, y: 50, label: 'MC' },  // Middle Center
                                            { x: 88, y: 50, label: 'MR' },  // Middle Right
                                            { x: 12, y: 93, label: 'BL' },  // Bottom Left
                                            { x: 50, y: 93, label: 'BC' },  // Bottom Center
                                            { x: 88, y: 93, label: 'BR' },  // Bottom Right
                                        ].map((pos) => {
                                            const isSelected = Math.abs(layer.positionX - pos.x) < 5 && Math.abs(layer.positionY - pos.y) < 5;
                                            return (
                                                <button
                                                    key={pos.label}
                                                    type="button"
                                                    onClick={() => updateTextLayer(currentSegment!.id, layer.id, { positionX: pos.x, positionY: pos.y })}
                                                    className={cn(
                                                        "w-8 h-8 rounded border text-[10px] font-medium transition-all",
                                                        isSelected
                                                            ? "bg-primary text-white border-primary"
                                                            : "bg-background border-border hover:border-primary hover:bg-primary/10"
                                                    )}
                                                    title={`${pos.label === 'TL' ? 'Top Left' : pos.label === 'TC' ? 'Top Center' : pos.label === 'TR' ? 'Top Right' : pos.label === 'ML' ? 'Middle Left' : pos.label === 'MC' ? 'Middle Center' : pos.label === 'MR' ? 'Middle Right' : pos.label === 'BL' ? 'Bottom Left' : pos.label === 'BC' ? 'Bottom Center' : 'Bottom Right'}`}
                                                >
                                                    {pos.label}
                                                </button>
                                            );
                                        })}
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
            </div>

            {segments.some(s => s.textLayers.length > 0) && (
                <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => setCurrentStep('translate')}
                >
                    Continue to Translation
                    <ArrowRight className="w-4 h-4 ml-2" />
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
    } = useAppStore();

    const [translateProgress, setTranslateProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({});
    const [activePreviewLang, setActivePreviewLang] = useState<string>('EN');
    const [activePreviewScene, setActivePreviewScene] = useState(0);
    // editingTranslation: key is `${layerId}-${langCode}`
    const [editingTranslation, setEditingTranslation] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<string>('');
    const translationsDone = Object.keys(translateProgress).length > 0 &&
        Object.values(translateProgress).every(s => s === 'done' || s === 'error');

    // Collect all text layers across all segments
    const allLayers = segments.flatMap(seg => seg.textLayers.map(l => ({ ...l, segmentId: seg.id })));

    const startTranslation = async () => {
        if (selectedLanguages.length === 0 || allLayers.length === 0) return;
        setIsTranslating(true);

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

        // Target langs = selected minus EN (EN is source)
        const targetLangs = selectedLanguages.filter(l => l !== 'EN');

        // Init progress
        const initProgress: Record<string, 'pending' | 'done' | 'error'> = {};
        targetLangs.forEach(l => { initProgress[l] = 'pending'; });
        if (selectedLanguages.includes('EN')) initProgress['EN'] = 'pending';
        setTranslateProgress(initProgress);

        try {
            const { translateTexts } = await import('@/lib/supabase');

            // EN: just store original content
            if (selectedLanguages.includes('EN')) {
                allLayers.forEach(layer => {
                    setTranslations(layer.id, [{
                        id: `tr-${layer.id}-EN`,
                        textLayerId: layer.id,
                        languageCode: 'EN',
                        translatedContent: layer.content,
                    }]);
                });
                setTranslateProgress(prev => ({ ...prev, EN: 'done' }));
            }

            if (targetLangs.length > 0) {
                const result = await translateTexts(batchTexts, 'EN', targetLangs);

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
            fontSize: layer.fontSize,
            fontWeight: layer.fontWeight ?? 800,
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
                        <>Translate to {selectedLanguages.filter(l => l !== 'EN').length} Language{selectedLanguages.filter(l => l !== 'EN').length !== 1 ? 's' : ''} <ArrowRight className="w-4 h-4 ml-2" /></>
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

                    {/* Scene tabs */}
                    <div className="flex gap-1.5 flex-wrap">
                        {segments.map((_, i) => (
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
                                {i === segments.length - 1 ? '🎬 Outro' : `Scene ${i + 1}`}
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
                                    {/* Original text */}
                                    <div>
                                        <span className="text-muted-foreground">Original: </span>
                                        <span className="text-foreground">{layer.content.replace(/\{(?:red|white|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$1')}</span>
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
                                                    {tr.translatedContent.replace(/\{(?:red|white|dark|#[0-9a-fA-F]{6}):([^}]+)\}/g, '$1')}
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
                    onClick={() => setCurrentStep('dub')}
                >
                    Continue to Dubbing
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            )}
        </div>
    );
}

function DubStepContent() {
    const { setCurrentStep, voiceClone, setVoiceClone } = useAppStore();

    return (
        <div className="pt-4 space-y-4">
            <div className="p-4 rounded-lg bg-surface-elevated border border-border">
                <div className="flex items-center gap-3 mb-3">
                    <Mic className="w-5 h-5 text-primary" />
                    <span className="font-medium">Voice Cloning</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                    Upload a voice sample to clone your voice for all languages.
                </p>
                <Button variant="outline" size="sm">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Voice Sample
                </Button>
            </div>

            <Button
                variant="gradient"
                className="w-full"
                onClick={() => setCurrentStep('outro')}
            >
                Continue to Outro
                <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
        </div>
    );
}

function OutroStepContent() {
    const { setCurrentStep, outroConfig, setOutroConfig, segments, setSegments, video, scriptEntries } = useAppStore();

    // Pre-populate disclaimer from script entries if not already set
    useEffect(() => {
        if (outroConfig.disclaimerText) return; // already has content
        const lastIdx = segments.length - 1;
        const outroEntry = scriptEntries[lastIdx];
        if (outroEntry?.disclaimer) {
            setOutroConfig({ disclaimerText: outroEntry.disclaimer });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segments.length, scriptEntries.length]);

    // Build live preview text layers from current outroConfig values
    const outroSeg = segments.length > 0 ? segments[segments.length - 1] : null;
    const previewLayers: TextLayerOverlay[] = [];
    if (outroConfig.ctaText.trim()) {
        previewLayers.push({
            id: 'preview-cta',
            content: outroConfig.ctaText,
            positionX: 50,
            positionY: 49.22,
            fontSize: 40,
            color: '#181C25',
            backgroundColor: undefined,
            animationType: 'slide-up',
            startTime: 0,
            endTime: -1,
        });
    }
    if (outroConfig.disclaimerText.trim()) {
        previewLayers.push({
            id: 'preview-disclaimer',
            content: outroConfig.disclaimerText,
            positionX: 50,
            positionY: 76.67,
            fontSize: 24,
            fontWeight: 400,
            color: '#181C25',
            backgroundColor: undefined,
            animationType: 'fade',
            startTime: 0,
            endTime: -1,
        });
    }

    const handleContinue = () => {
        // Apply CTA and disclaimer as text layers on the outro (last) segment
        if (segments.length > 0) {
            const outroIdx = segments.length - 1;
            const outroSegment = segments[outroIdx];

            // Build layers: start with non-outro-managed layers (preserve any manual ones)
            const existingLayers = outroSegment.textLayers.filter(
                (l) => !l.id.startsWith('text-outro-cta-') && !l.id.startsWith('text-outro-disclaimer-')
            );

            const newLayers = [...existingLayers];

            if (outroConfig.ctaText.trim()) {
                newLayers.push({
                    id: `text-outro-cta-${Date.now()}`,
                    segmentId: outroSegment.id,
                    content: outroConfig.ctaText,
                    positionX: 50,
                    positionY: 49.22, // 945px from top on 1080×1920
                    fontFamily: "Inter",
                    fontSize: 40,
                    color: "#181C25",
                    animationType: "slide-up" as const,
                    animationDuration: 0.5,
                    startTime: 2,
                    endTime: -1,
                });
            }

            if (outroConfig.disclaimerText.trim()) {
                newLayers.push({
                    id: `text-outro-disclaimer-${Date.now()}`,
                    segmentId: outroSegment.id,
                    content: outroConfig.disclaimerText,
                    positionX: 50,
                    positionY: 76.67, // 1472px from top on 1080×1920
                    fontFamily: "Inter",
                    fontSize: 24, // 24 * 0.5 preview scale = 12px rendered
                    fontWeight: 400, // Inter Regular
                    color: "#181C25",
                    animationType: "fade" as const,
                    animationDuration: 0.5,
                    startTime: 2,
                    endTime: -1,
                });
            }

            const updatedSegments = segments.map((seg, i) =>
                i === outroIdx ? { ...seg, textLayers: newLayers } : seg
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
                        <span className="text-xs text-muted-foreground ml-auto">49% from top • 40px • slide-up at 2s</span>
                    </div>
                    <input
                        type="text"
                        placeholder="Enter your call-to-action..."
                        value={outroConfig.ctaText}
                        onChange={(e) => setOutroConfig({ ctaText: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm"
                    />
                </div>

                {/* Layer 2 — Disclaimer */}
                <div className="p-3 rounded-lg bg-surface-elevated border border-border space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-amber-400">2</span>
                        </div>
                        <label className="text-sm font-medium">Disclaimer Text</label>
                        <span className="text-xs text-muted-foreground ml-auto">77% from top • 14px • fade at 2s</span>
                    </div>
                    {scriptEntries[segments.length - 1]?.disclaimer && !outroConfig.disclaimerText && (
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
                    <p className="text-[10px] text-muted-foreground">
                        If a script was uploaded with a disclaimer section, it will be auto-filled here.
                    </p>
                </div>
            </div>

            <Button
                variant="gradient"
                className="w-full"
                onClick={handleContinue}
            >
                Continue to Export
                <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
        </div>
    );
}

function ExportStepContent() {
    const { selectedLanguages, isExporting, setIsExporting } = useAppStore();
    const [exportProgress, setExportProgress] = useState<Record<string, number>>({});

    const startExport = () => {
        setIsExporting(true);
        // Simulate export progress
        selectedLanguages.forEach((lang, i) => {
            setTimeout(() => {
                const interval = setInterval(() => {
                    setExportProgress(prev => {
                        const current = prev[lang] || 0;
                        if (current >= 100) {
                            clearInterval(interval);
                            return prev;
                        }
                        return { ...prev, [lang]: current + 10 };
                    });
                }, 200);
            }, i * 500);
        });
    };

    return (
        <div className="pt-4 space-y-4">
            <div className="space-y-2">
                {selectedLanguages.map((lang) => {
                    const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === lang);
                    const progress = exportProgress[lang] || 0;

                    return (
                        <div key={lang} className="p-3 rounded-lg bg-surface-elevated border border-border">
                            <div className="flex items-center gap-2 mb-2">
                                <span>{langInfo?.flag}</span>
                                <span className="font-medium text-sm">{langInfo?.name}</span>
                                {progress === 100 && <Check className="w-4 h-4 text-success ml-auto" />}
                                {progress > 0 && progress < 100 && (
                                    <span className="text-xs text-muted-foreground ml-auto">{progress}%</span>
                                )}
                            </div>
                            {progress > 0 && <Progress value={progress} className="h-1" />}
                        </div>
                    );
                })}
            </div>

            <Button
                variant="gradient"
                className="w-full"
                onClick={startExport}
                disabled={isExporting}
            >
                {isExporting ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Exporting...
                    </>
                ) : (
                    <>
                        <Download className="w-4 h-4 mr-2" />
                        Export All Videos
                    </>
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

    const stepOrder: AppStep[] = ['upload', 'analyze', 'edit-text', 'translate', 'dub', 'outro', 'export'];
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
        { id: 'upload' as AppStep, title: 'Upload Video', description: 'Upload your video file', icon: <Upload className="w-4 h-4" />, content: <UploadStepContent /> },
        { id: 'analyze' as AppStep, title: 'Analyze Scenes', description: 'AI detects scene changes', icon: <Scan className="w-4 h-4" />, content: <AnalyzeStepContent /> },
        { id: 'edit-text' as AppStep, title: 'Edit Text', description: 'Add text overlays with animations', icon: <Type className="w-4 h-4" />, content: <EditTextStepContent /> },
        { id: 'translate' as AppStep, title: 'Translate', description: 'Select languages for translation', icon: <Languages className="w-4 h-4" />, content: <TranslateStepContent /> },
        { id: 'dub' as AppStep, title: 'Voice Dubbing', description: 'Clone voice and generate audio', icon: <Mic className="w-4 h-4" />, content: <DubStepContent /> },
        { id: 'outro' as AppStep, title: 'Outro', description: 'Add CTA and disclaimer', icon: <Film className="w-4 h-4" />, content: <OutroStepContent /> },
        { id: 'export' as AppStep, title: 'Export', description: 'Download all translated videos', icon: <Download className="w-4 h-4" />, content: <ExportStepContent /> },
    ];

    return (
        <main className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
                <div className="max-w-3xl mx-auto px-4 py-4">
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
            <div className="max-w-3xl mx-auto px-4 py-6">
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
