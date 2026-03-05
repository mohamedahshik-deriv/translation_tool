// API Client for calling Supabase Edge Functions
import { supabase } from './supabase';

const FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
    'https://',
    'https://'
).replace('.supabase.co', '.supabase.co/functions/v1');

// ============================================
// Scene Analysis (Gemini)
// ============================================

export interface SceneAnalysisRequest {
    videoUrl: string;
    videoDuration: number;
}

export interface Scene {
    startTime: number;
    endTime: number;
    description: string;
}

export interface SceneAnalysisResponse {
    timecodes: number[];
    scenes: Scene[];
}

export async function analyzeScenes(
    videoUrl: string,
    videoDuration: number
): Promise<SceneAnalysisResponse> {
    const { data, error } = await supabase.functions.invoke('analyze-scenes', {
        body: { videoUrl, videoDuration },
    });

    if (error) throw new Error(`Scene analysis failed: ${error.message}`);
    return data;
}

// ============================================
// Translation (DeepL)
// ============================================

export interface TranslationRequest {
    texts: string[];
    sourceLang: string;
    targetLangs: string[];
}

export interface TranslationResponse {
    translations: {
        [langCode: string]: string[];
    };
}

export async function translateTexts(
    texts: string[],
    sourceLang: string,
    targetLangs: string[]
): Promise<TranslationResponse> {
    const { data, error } = await supabase.functions.invoke('translate', {
        body: { texts, sourceLang, targetLangs },
    });

    if (error) throw new Error(`Translation failed: ${error.message}`);
    return data;
}

// ============================================
// Voice Cloning (ElevenLabs)
// ============================================

export interface VoiceCloneRequest {
    audioUrl: string;
    voiceName: string;
}

export interface VoiceCloneResponse {
    voiceId: string;
    name: string;
}

export async function cloneVoice(
    audioUrl: string,
    voiceName: string
): Promise<VoiceCloneResponse> {
    const { data, error } = await supabase.functions.invoke('clone-voice', {
        body: { audioUrl, voiceName },
    });

    if (error) throw new Error(`Voice cloning failed: ${error.message}`);
    return data;
}

// ============================================
// Speech Generation (ElevenLabs)
// ============================================

export interface SpeechGenerationRequest {
    text: string;
    voiceId: string;
    languageCode: string;
}

export interface SpeechGenerationResponse {
    audioUrl: string;
    duration: number;
}

export async function generateSpeech(
    text: string,
    voiceId: string,
    languageCode: string
): Promise<SpeechGenerationResponse> {
    const { data, error } = await supabase.functions.invoke('generate-speech', {
        body: { text, voiceId, languageCode },
    });

    if (error) throw new Error(`Speech generation failed: ${error.message}`);
    return data;
}

// ============================================
// Batch Speech Generation
// ============================================

export async function generateSpeechBatch(
    requests: SpeechGenerationRequest[]
): Promise<SpeechGenerationResponse[]> {
    const promises = requests.map((req) =>
        generateSpeech(req.text, req.voiceId, req.languageCode)
    );
    return Promise.all(promises);
}
