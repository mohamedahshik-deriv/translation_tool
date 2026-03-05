"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileVideo, X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/store/app-store";
import { VideoFile, SUPPORTED_RESOLUTIONS, VideoResolution } from "@/types";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FORMATS = {
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
    "video/webm": [".webm"],
};

function getVideoResolution(width: number, height: number): VideoResolution | null {
    for (const res of SUPPORTED_RESOLUTIONS) {
        if (
            (res.width === width && res.height === height) ||
            (Math.abs(res.width - width) < 10 && Math.abs(res.height - height) < 10)
        ) {
            return res.key;
        }
    }
    return null;
}

function getVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";

        video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            resolve({
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
            });
        };

        video.onerror = () => {
            URL.revokeObjectURL(video.src);
            reject(new Error("Failed to load video metadata"));
        };

        video.src = URL.createObjectURL(file);
    });
}

export function VideoUploader() {
    const { setVideo, setCurrentStep } = useAppStore();
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewVideo, setPreviewVideo] = useState<VideoFile | null>(null);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setError(null);
        setIsProcessing(true);
        setUploadProgress(0);

        try {
            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                throw new Error(`File size exceeds 50MB limit. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB`);
            }

            // Simulate upload progress
            const progressInterval = setInterval(() => {
                setUploadProgress((prev) => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return 90;
                    }
                    return prev + 10;
                });
            }, 200);

            // Get video metadata
            const metadata = await getVideoMetadata(file);

            clearInterval(progressInterval);
            setUploadProgress(95);

            // Validate resolution
            const resolution = getVideoResolution(metadata.width, metadata.height);
            if (!resolution) {
                throw new Error(
                    `Unsupported resolution: ${metadata.width}x${metadata.height}. Supported: 1080x1920, 1920x1080, 1080x1080, 1080x1350`
                );
            }

            const videoFile: VideoFile = {
                id: `video-${Date.now()}`,
                file,
                url: URL.createObjectURL(file),
                name: file.name,
                size: file.size,
                duration: metadata.duration,
                width: metadata.width,
                height: metadata.height,
                resolution,
            };

            setUploadProgress(100);
            setPreviewVideo(videoFile);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to process video");
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const handleConfirm = () => {
        if (previewVideo) {
            setVideo(previewVideo);
            setCurrentStep("analyze");
        }
    };

    const handleRemove = () => {
        if (previewVideo) {
            URL.revokeObjectURL(previewVideo.url);
        }
        setPreviewVideo(null);
        setUploadProgress(0);
        setError(null);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: ACCEPTED_FORMATS,
        maxFiles: 1,
        disabled: isProcessing,
    });

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-2xl"
            >
                {/* Title */}
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold mb-2">
                        <span className="gradient-text">Upload Your Video</span>
                    </h2>
                    <p className="text-muted-foreground">
                        Upload a video to get started with translation and dubbing
                    </p>
                </div>

                <AnimatePresence mode="wait">
                    {!previewVideo ? (
                        <motion.div
                            key="dropzone"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            {/* Drop zone */}
                            <div
                                {...getRootProps()}
                                className={cn(
                                    "dropzone flex flex-col items-center justify-center min-h-[300px] cursor-pointer",
                                    isDragActive && "active",
                                    isProcessing && "pointer-events-none opacity-60",
                                )}
                            >
                                <input {...getInputProps()} />

                                <motion.div
                                    animate={isDragActive ? { scale: 1.1, y: -10 } : { scale: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col items-center gap-4"
                                >
                                    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20">
                                        <Upload className="w-8 h-8 text-primary" />
                                    </div>

                                    <div className="text-center">
                                        <p className="text-lg font-medium text-foreground mb-1">
                                            {isDragActive ? "Drop your video here" : "Drag & drop your video"}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            or click to browse files
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                                        <span className="text-xs px-2 py-1 rounded-md bg-surface border border-border text-muted-foreground">
                                            MP4
                                        </span>
                                        <span className="text-xs px-2 py-1 rounded-md bg-surface border border-border text-muted-foreground">
                                            MOV
                                        </span>
                                        <span className="text-xs px-2 py-1 rounded-md bg-surface border border-border text-muted-foreground">
                                            WebM
                                        </span>
                                        <span className="text-xs px-2 py-1 rounded-md bg-surface border border-border text-muted-foreground">
                                            Max 50MB
                                        </span>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Upload progress */}
                            {isProcessing && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-muted-foreground">Processing video...</span>
                                        <span className="text-sm font-medium text-foreground">{uploadProgress}%</span>
                                    </div>
                                    <Progress value={uploadProgress} />
                                </motion.div>
                            )}

                            {/* Error message */}
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                                >
                                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                                    <p className="text-sm text-destructive">{error}</p>
                                </motion.div>
                            )}

                            {/* Supported resolutions */}
                            <div className="mt-6 p-4 rounded-xl bg-surface border border-border">
                                <p className="text-xs font-medium text-muted-foreground mb-3">SUPPORTED RESOLUTIONS</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {SUPPORTED_RESOLUTIONS.map((res) => (
                                        <div
                                            key={res.key}
                                            className="flex flex-col items-center p-3 rounded-lg bg-surface-elevated border border-border"
                                        >
                                            <div
                                                className="border border-muted-foreground/30 rounded mb-2"
                                                style={{
                                                    width: res.width > res.height ? 40 : (40 * res.width) / res.height,
                                                    height: res.height > res.width ? 40 : (40 * res.height) / res.width,
                                                }}
                                            />
                                            <span className="text-xs font-medium text-foreground">{res.key}</span>
                                            <span className="text-[10px] text-muted-foreground">{res.aspectRatio} {res.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="preview"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="space-y-4"
                        >
                            {/* Video preview */}
                            <div className="relative rounded-xl overflow-hidden bg-black border border-border">
                                <video
                                    src={previewVideo.url}
                                    controls
                                    className="w-full max-h-[400px] object-contain"
                                />
                                <button
                                    onClick={handleRemove}
                                    className="absolute top-3 right-3 p-2 rounded-lg bg-black/60 hover:bg-black/80 transition-colors"
                                >
                                    <X className="w-4 h-4 text-white" />
                                </button>
                            </div>

                            {/* Video info */}
                            <div className="p-4 rounded-xl bg-surface border border-border">
                                <div className="flex items-center gap-3 mb-3">
                                    <FileVideo className="w-5 h-5 text-primary" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{previewVideo.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {(previewVideo.size / (1024 * 1024)).toFixed(1)}MB
                                        </p>
                                    </div>
                                    <CheckCircle className="w-5 h-5 text-success" />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-2 rounded-lg bg-surface-elevated text-center">
                                        <p className="text-xs text-muted-foreground">Resolution</p>
                                        <p className="text-sm font-medium text-foreground">{previewVideo.resolution}</p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-surface-elevated text-center">
                                        <p className="text-xs text-muted-foreground">Duration</p>
                                        <p className="text-sm font-medium text-foreground">
                                            {Math.floor(previewVideo.duration / 60)}:{String(Math.floor(previewVideo.duration % 60)).padStart(2, "0")}
                                        </p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-surface-elevated text-center">
                                        <p className="text-xs text-muted-foreground">Dimensions</p>
                                        <p className="text-sm font-medium text-foreground">
                                            {previewVideo.width}×{previewVideo.height}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={handleRemove} className="flex-1">
                                    Choose Different Video
                                </Button>
                                <Button variant="gradient" onClick={handleConfirm} className="flex-1">
                                    Continue to Analysis
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
