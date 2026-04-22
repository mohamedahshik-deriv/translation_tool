import { useState, useEffect } from "react";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:8000';
const api = (path: string) => `${BACKEND_URL}${path}`;
import { motion, AnimatePresence } from "framer-motion";
import { analyzeScenes, uploadVideo, getPublicUrl, STORAGE_BUCKETS, isSupabaseConfigured } from "@/lib/supabase";
import { Scan, Play, Pause, ChevronLeft, ChevronRight, Plus, Trash2, Check, AlertCircle, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/store/app-store";
import { VideoSegment, Timecode } from "@/types";
import { cn } from "@/lib/utils";

export function SceneAnalyzer() {
    const {
        video,
        sessionId,
        setVideo,
        setSegments,
        setCurrentStep,
        isAnalyzing,
        setIsAnalyzing,
        segments,
        setSuggestedTextColor,
    } = useAppStore();

    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'complete' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [detectedScenes, setDetectedScenes] = useState<{ startTime: number; endTime: number; spokenText: string; textOnScreen: string }[]>([]);
    const [timecodes, setTimecodes] = useState<number[]>([]);
    const [editingTimecodes, setEditingTimecodes] = useState(false);
    const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Start analysis when component mounts
    useEffect(() => {
        if (video && status === 'idle') {
            startAnalysis();
        }
    }, [video]);

    const startAnalysis = async () => {
        if (!video) return;

        setStatus('uploading');
        setProgress(0);
        setError(null);
        setIsAnalyzing(true);

        try {
            // Step 1: Process video locally (strip audio → silent MP4, extract audio → MP3)
            setProgress(10);
            const processForm = new FormData();
            processForm.append('video', video.file);
            const processResp = await fetch(api('/api/process-video'), { method: 'POST', body: processForm });
            if (!processResp.ok) throw new Error('Video processing failed');

            // Update video dimensions from server-detected values (authoritative)
            const serverWidth = parseInt(processResp.headers.get('X-Video-Width') || '0', 10);
            const serverHeight = parseInt(processResp.headers.get('X-Video-Height') || '0', 10);
            if (serverWidth > 0 && serverHeight > 0 && video) {
                setVideo({ ...video, width: serverWidth, height: serverHeight });
            }

            const suggestedColor = processResp.headers.get('X-Suggested-Text-Color') || '#ffffff';
            setSuggestedTextColor(suggestedColor);

            const processedFormData = await processResp.formData();
            const silentBlob = processedFormData.get('silent') as File | null;
            const audioBlob = processedFormData.get('audio') as File | null;
            if (!silentBlob || !audioBlob) throw new Error('Video processing returned incomplete data');
            const silentFile = new File([silentBlob], 'silent.mp4', { type: 'video/mp4' });
            const audioFile = new File([audioBlob], 'audio.mp3', { type: 'audio/mpeg' });

            // Step 2: Upload processed files + original to Supabase in parallel
            setProgress(20);
            const { uploadExtractedAudio } = await import('@/lib/supabase');
            const [silentPath, audioPath] = await Promise.all([
                uploadVideo(silentFile, sessionId),
                uploadExtractedAudio(audioFile, sessionId),
            ]);
            const videoUrl = getPublicUrl(STORAGE_BUCKETS.VIDEOS, silentPath);
            const audioUrl = getPublicUrl(STORAGE_BUCKETS.AUDIO, audioPath);

            setProgress(30);
            setStatus('analyzing');

            // Step 3: Call Gemini Edge Function with pre-separated files
            const result = await analyzeScenes(videoUrl, audioUrl, video.duration);

            setProgress(80);

            setTimecodes(result.timecodes);
            setDetectedScenes(result.scenes);

            setProgress(100);
            setStatus('complete');
        } catch (err) {
            console.error('Analysis failed:', err);
            setError(err instanceof Error ? err.message : 'Failed to analyze video');
            setStatus('error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleAddTimecode = () => {
        // Add a new timecode at the midpoint of the longest segment
        if (timecodes.length < 2) return;

        let maxGap = 0;
        let insertIndex = 1;

        for (let i = 1; i < timecodes.length; i++) {
            const gap = timecodes[i] - timecodes[i - 1];
            if (gap > maxGap) {
                maxGap = gap;
                insertIndex = i;
            }
        }

        const newTimecode = (timecodes[insertIndex - 1] + timecodes[insertIndex]) / 2;
        const newTimecodes = [...timecodes];
        newTimecodes.splice(insertIndex, 0, newTimecode);
        setTimecodes(newTimecodes);
    };

    const handleRemoveTimecode = (index: number) => {
        if (index === 0 || index === timecodes.length - 1) return; // Can't remove first or last
        const newTimecodes = timecodes.filter((_, i) => i !== index);
        setTimecodes(newTimecodes);
    };

    const handleConfirmSegments = () => {
        if (!video || timecodes.length < 2) return;

        // Create segments from timecodes
        const newSegments: VideoSegment[] = [];

        for (let i = 0; i < timecodes.length - 1; i++) {
            const timecode: Timecode = {
                id: `timecode-${i}`,
                startTime: timecodes[i],
                endTime: timecodes[i + 1],
                segmentIndex: i,
                description: detectedScenes[i]?.spokenText || `Segment ${i + 1}`,
            };

            newSegments.push({
                id: `segment-${i}`,
                videoId: video.id,
                timecode,
                textLayers: [],
            });
        }

        setSegments(newSegments);
        setCurrentStep('edit-text');
    };

    const formatTime = (seconds: number) => {
        const h    = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms   = Math.floor((seconds % 1) * 1000);
        const hStr = h > 0 ? `${String(h).padStart(2, '0')}:` : '';
        return `${hStr}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    if (!video) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] p-6">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">No Video Selected</h2>
                    <p className="text-muted-foreground mb-4">Please upload a video first</p>
                    <Button onClick={() => setCurrentStep('upload')}>Go to Upload</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-8rem)] p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-5xl mx-auto w-full"
            >
                {/* Header */}
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">
                        <span className="gradient-text">Scene Analysis</span>
                    </h2>
                    <p className="text-muted-foreground">
                        AI is detecting scene changes in your video
                    </p>
                </div>

                {/* Main content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Video Preview */}
                    <div className="lg:col-span-2">
                        <div className="rounded-xl overflow-hidden bg-black border border-transparent">
                            <video
                                src={video.url}
                                controls
                                className="w-full aspect-video object-contain"
                            />
                        </div>

                        {/* Progress/Status */}
                        <AnimatePresence mode="wait">
                            {(status === 'uploading' || status === 'analyzing') && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="mt-4 p-4 rounded-xl glass-subtle"
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                        <span className="text-sm font-medium">
                                            {status === 'uploading' ? 'Uploading video...' : 'Analyzing scenes with AI...'}
                                        </span>
                                        <span className="ml-auto text-sm text-muted-foreground">{progress}%</span>
                                    </div>
                                    <Progress value={progress} />
                                </motion.div>
                            )}

                            {status === 'error' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20"
                                >
                                    <div className="flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-destructive" />
                                        <span className="text-sm text-destructive">{error}</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-3"
                                        onClick={startAnalysis}
                                    >
                                        Retry Analysis
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Right panel — status + actions */}
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl glass-subtle">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <Scan className="w-4 h-4 text-primary" />
                                    Detected Scenes
                                </h3>
                                {status === 'complete' && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-success/20 text-success">
                                        {timecodes.length - 1} scenes
                                    </span>
                                )}
                            </div>

                            {status === 'complete' ? (
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingTimecodes(!editingTimecodes)}
                                        className="flex-1"
                                    >
                                        {editingTimecodes ? 'Done Editing' : 'Edit Timecodes'}
                                    </Button>
                                    {editingTimecodes && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleAddTimecode}
                                        >
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    {(status === 'idle' || status === 'uploading' || status === 'analyzing') && (
                                        <>
                                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                                                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                            </div>
                                            <p className="text-sm text-muted-foreground">Analyzing video...</p>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {status === 'complete' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-2"
                            >
                                <Button
                                    variant="gradient"
                                    className="w-full"
                                    onClick={handleConfirmSegments}
                                >
                                    <Check className="w-4 h-4 mr-2" />
                                    Confirm {timecodes.length - 1} Segments
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={startAnalysis}
                                >
                                    Re-analyze Video
                                </Button>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Full-width scene table */}
                {status === 'complete' && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 rounded-xl glass-subtle overflow-hidden"
                    >
                        <div className="overflow-auto max-h-[420px]">
                            <table className="w-full text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '36px' }} />
                                    <col style={{ width: '100px' }} />
                                    <col style={{ width: '100px' }} />
                                    <col style={{ width: '52px' }} />
                                    <col />
                                    {editingTimecodes && <col style={{ width: '32px' }} />}
                                </colgroup>
                                <thead className="sticky top-0 bg-white/60 backdrop-blur-sm z-10">
                                    <tr className="border-b border-white/50 text-muted-foreground">
                                        <th className="text-right px-2 py-2.5 font-medium">#</th>
                                        <th className="text-left px-2 py-2.5 font-medium font-mono">In</th>
                                        <th className="text-left px-2 py-2.5 font-medium font-mono">Out</th>
                                        <th className="text-right px-2 py-2.5 font-medium">Dur</th>
                                        <th className="text-left px-2 py-2.5 font-medium">Transcript</th>
                                        {editingTimecodes && <th />}
                                    </tr>
                                </thead>
                                <tbody>
                                    {timecodes.slice(0, -1).map((tc, index) => {
                                        const outTc = timecodes[index + 1];
                                        const dur = outTc - tc;
                                        const transcript = detectedScenes[index]?.spokenText || '';
                                        return (
                                            <motion.tr
                                                key={index}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: index * 0.02 }}
                                                className={cn(
                                                    "border-b border-white/40 hover:bg-white/30 transition-colors",
                                                    index === 0 ? "bg-blue-50/60" : ""
                                                )}
                                            >
                                                <td className="text-right px-2 py-1.5 text-muted-foreground font-mono">{index + 1}</td>
                                                <td className="px-2 py-1.5 font-mono text-foreground truncate">{formatTime(tc)}</td>
                                                <td className="px-2 py-1.5 font-mono text-foreground truncate">{formatTime(outTc)}</td>
                                                <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{dur.toFixed(1)}s</td>
                                                <td className="px-2 py-1.5 text-foreground overflow-hidden">
                                                    <span className="line-clamp-2 leading-snug">
                                                        {transcript || <span className="text-muted-foreground italic">—</span>}
                                                    </span>
                                                </td>
                                                {editingTimecodes && (
                                                    <td className="px-1 py-1.5 text-center">
                                                        {index !== 0 && (
                                                            <button
                                                                onClick={() => handleRemoveTimecode(index)}
                                                                className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </motion.tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {/* Timeline visualization */}
                {status === 'complete' && video && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 rounded-xl glass-subtle"
                    >
                        <h3 className="text-sm font-medium mb-3">Timeline</h3>
                        <div className="relative h-12 bg-white/50 rounded-lg overflow-hidden border border-white/60">
                            {/* Segments */}
                            {timecodes.slice(0, -1).map((tc, index) => {
                                const startPercent = (tc / video.duration) * 100;
                                const endPercent = (timecodes[index + 1] / video.duration) * 100;
                                const width = endPercent - startPercent;

                                return (
                                    <div
                                        key={index}
                                        className={cn(
                                            "absolute top-0 bottom-0 border-r border-white/40",
                                            index % 2 === 0 ? "bg-primary/20" : "bg-secondary/20"
                                        )}
                                        style={{
                                            left: `${startPercent}%`,
                                            width: `${width}%`,
                                        }}
                                    >
                                        <span className="absolute bottom-1 left-1 text-[10px] text-muted-foreground">
                                            {index + 1}
                                        </span>
                                    </div>
                                );
                            })}

                            {/* Timecode markers */}
                            {timecodes.map((tc, index) => (
                                <div
                                    key={`marker-${index}`}
                                    className="absolute top-0 bottom-0 w-0.5 bg-foreground/50"
                                    style={{ left: `${(tc / video.duration) * 100}%` }}
                                />
                            ))}
                        </div>

                        {/* Time labels */}
                        <div className="flex justify-between mt-1">
                            <span className="text-xs text-muted-foreground">0:00</span>
                            <span className="text-xs text-muted-foreground">{formatTime(video.duration)}</span>
                        </div>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
