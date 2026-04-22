import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
    if (_supabase) return _supabase;

    // Vite exposes env vars via import.meta.env.VITE_* (not process.env.NEXT_PUBLIC_*)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your_supabase_url') {
        throw new Error(
            'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
        );
    }

    _supabase = createClient(supabaseUrl, supabaseAnonKey);
    return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
    get(_, prop) {
        return (getSupabase() as unknown as Record<string, unknown>)[prop as string];
    },
});

export function isSupabaseConfigured(): boolean {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    return !!url && url !== 'your_supabase_url' && url.startsWith('http');
}

export const STORAGE_BUCKETS = {
    VIDEOS: 'videos',
    SEGMENTS: 'segments',
    AUDIO: 'audio',
    EXPORTS: 'exports',
} as const;

// ============================================
// Storage Operations
// ============================================

export async function uploadVideo(file: File, sessionId: string): Promise<string> {
    const client = getSupabase();
    const fileName = `${sessionId}/${Date.now()}-${file.name}`;

    const { data, error } = await client.storage
        .from(STORAGE_BUCKETS.VIDEOS)
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
        });

    if (error) throw new Error(`Failed to upload video: ${error.message}`);
    return data.path;
}

export function getPublicUrl(bucket: string, path: string): string {
    const client = getSupabase();
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
}

export async function uploadExtractedAudio(file: File, sessionId: string): Promise<string> {
    const client = getSupabase();
    const fileName = `${sessionId}/extracted-${Date.now()}.mp3`;

    const { data, error } = await client.storage
        .from(STORAGE_BUCKETS.AUDIO)
        .upload(fileName, file, {
            contentType: 'audio/mpeg',
            cacheControl: '3600',
            upsert: false,
        });

    if (error) throw new Error(`Failed to upload extracted audio: ${error.message}`);
    return data.path;
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
    const client = getSupabase();
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) throw new Error(`Failed to delete file: ${error.message}`);
}

export async function uploadAudio(
    audioBlob: Blob,
    sessionId: string,
    languageCode: string,
    segmentId: string
): Promise<string> {
    const client = getSupabase();
    const fileName = `${sessionId}/${languageCode}/${segmentId}-${Date.now()}.mp3`;

    const { data, error } = await client.storage
        .from(STORAGE_BUCKETS.AUDIO)
        .upload(fileName, audioBlob, {
            contentType: 'audio/mpeg',
            cacheControl: '3600',
            upsert: false,
        });

    if (error) throw new Error(`Failed to upload audio: ${error.message}`);
    return data.path;
}

export async function uploadExport(
    videoBlob: Blob,
    sessionId: string,
    languageCode: string
): Promise<string> {
    const client = getSupabase();
    const fileName = `${sessionId}/${languageCode}-export-${Date.now()}.mp4`;

    const { data, error } = await client.storage
        .from(STORAGE_BUCKETS.EXPORTS)
        .upload(fileName, videoBlob, {
            contentType: 'video/mp4',
            cacheControl: '3600',
            upsert: false,
        });

    if (error) throw new Error(`Failed to upload export: ${error.message}`);
    return data.path;
}

// ============================================
// Edge Function Calls
// ============================================

export async function callEdgeFunction<T>(
    functionName: string,
    body: Record<string, unknown>,
    timeoutMs = 300_000,
): Promise<T> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase is not configured');
    }

    const url = `${supabaseUrl}/functions/v1/${functionName}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'apikey': supabaseAnonKey,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            let errMsg = `HTTP ${response.status}`;
            try {
                const errBody = await response.json();
                errMsg = errBody?.error ?? errBody?.message ?? errMsg;
            } catch { /* ignore parse error */ }
            throw new Error(`Edge function ${functionName} failed: ${errMsg}`);
        }

        return await response.json() as T;
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`Edge function ${functionName} timed out after ${timeoutMs / 1000}s`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

export async function analyzeScenes(
    videoUrl: string,
    audioUrl: string,
    videoDuration: number,
    hasAudio = true,
    scriptText?: string,
    originalVideoUrl?: string,
) {
    return callEdgeFunction<{
        timecodes: number[];
        hasVoiceover: boolean;
        detectedLanguage: string;
        detectedLanguageName: string;
        scenes: {
            startTime: number;
            endTime: number;
            narrativeStart: number;
            narrativeEnd: number;
            spokenText: string;
            textOnScreen: string;
        }[];
    }>('analyze-scenes-3-task-gem3Flash', { videoUrl, audioUrl, videoDuration, hasAudio, scriptText, originalVideoUrl });
}

export async function verifySceneTimings(
    videoUrl: string,
    videoDuration: number,
    scenes: {
        startTime: number;
        endTime: number;
        narrativeStart: number;
        narrativeEnd: number;
        spokenText: string;
        textOnScreen: string;
    }[],
    originalVideoUrl?: string,
    hasAudio = true,
) {
    return callEdgeFunction<{
        timecodes: number[];
        hasVoiceover: boolean;
        detectedLanguage: string;
        detectedLanguageName: string;
        scenes: {
            startTime: number;
            endTime: number;
            narrativeStart: number;
            narrativeEnd: number;
            spokenText: string;
            textOnScreen: string;
        }[];
        correctionsSummary: { total: number; corrected: number };
    }>('verify-scene-timings', {
        videoUrl,
        videoDuration,
        scenes,
        originalVideoUrl,
        hasAudio,
    });
}

export async function matchScriptToScenes(
    videoUrl: string,
    videoDuration: number,
    scriptText: string
) {
    return callEdgeFunction<{
        timecodes: number[];
        scenes: {
            startTime: number;
            endTime: number;
            description: string;
            textOnScreen?: string;
            voiceover?: string;
            disclaimer?: string;
            suggestedPosition?: 'top' | 'center' | 'bottom';
        }[];
    }>('match-script-to-scenes', { videoUrl, videoDuration, scriptText });
}

export async function translateTexts(
    texts: string[],
    sourceLang: string,
    targetLangs: string[]
) {
    return callEdgeFunction<{
        translations: Record<string, string[]>;
    }>('translate', { texts, sourceLang, targetLangs });
}

export async function cloneVoice(audioFile: File, name: string) {
    const client = getSupabase();
    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('name', name);

    const { data, error } = await client.functions.invoke('clone-voice', {
        body: formData,
    });

    if (error) throw new Error(`Voice cloning failed: ${error.message}`);
    return data as { voiceId: string; name: string };
}

export async function generateSpeech(
    text: string,
    voiceId: string,
    languageCode: string
): Promise<Blob> {
    const client = getSupabase();
    const { data, error } = await client.functions.invoke('generate-speech', {
        body: { text, voiceId, languageCode },
    });

    if (error) throw new Error(`Speech generation failed: ${error.message}`);

    if (data instanceof Blob) return data;
    return new Blob([data], { type: 'audio/mpeg' });
}

// ============================================
// Copywriting
// ============================================

export interface CopywriteResult {
    original: string;
    heroWord: string;
    trustAnchor: string;
    visualStrategy: string;
    formattedSentence: string; // uses {red:word} markup for the hero word
}

export async function copywriteOverlays(overlays: string[]): Promise<CopywriteResult[]> {
    const { results } = await callEdgeFunction<{ results: CopywriteResult[] }>(
        'copywrite-overlays',
        { overlays }
    );
    return results;
}

// ============================================
// Copywrite translate markup
// ============================================

export interface MarkupPair {
    layerId: string;
    source: string;       // English text with {red:PHRASE} markup
    translation: string;  // Target-language plain text
}

export interface MarkupResult {
    layerId: string;
    marked: string;       // Translation with {red:...} applied
}

export async function copywriteTranslateMarkup(
    pairs: MarkupPair[],
    targetLang: string
): Promise<MarkupResult[]> {
    const { results } = await callEdgeFunction<{ results: MarkupResult[] }>(
        'copywrite-translate-markup',
        { pairs, targetLang }
    );
    return results;
}
