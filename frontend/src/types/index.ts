// ============================================
// Core Application Types
// ============================================

// Supported languages
export type LanguageCode = 'EN' | 'ES' | 'PT' | 'AR' | 'FR';

export interface Language {
    code: LanguageCode;
    name: string;
    flag: string;
    deeplCode: string;
    elevenLabsCode: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
    { code: 'EN', name: 'English', flag: '🇬🇧', deeplCode: 'EN', elevenLabsCode: 'en' },
    { code: 'ES', name: 'Spanish', flag: '🇪🇸', deeplCode: 'ES', elevenLabsCode: 'es' },
    { code: 'PT', name: 'Portuguese', flag: '🇧🇷', deeplCode: 'PT', elevenLabsCode: 'pt' },
    { code: 'AR', name: 'Arabic', flag: '🇸🇦', deeplCode: 'AR', elevenLabsCode: 'ar' },
    { code: 'FR', name: 'French', flag: '🇫🇷', deeplCode: 'FR', elevenLabsCode: 'fr' },
];

// Supported resolutions
export type VideoResolution = '1080x1920' | '1920x1080' | '1080x1080' | '1080x1350';

export interface Resolution {
    key: VideoResolution;
    width: number;
    height: number;
    label: string;
    aspectRatio: string;
}

export const SUPPORTED_RESOLUTIONS: Resolution[] = [
    { key: '1080x1920', width: 1080, height: 1920, label: 'Vertical', aspectRatio: '9:16' },
    { key: '1920x1080', width: 1920, height: 1080, label: 'Horizontal', aspectRatio: '16:9' },
    { key: '1080x1080', width: 1080, height: 1080, label: 'Square', aspectRatio: '1:1' },
    { key: '1080x1350', width: 1080, height: 1350, label: 'Portrait', aspectRatio: '4:5' },
];

// ============================================
// Safe Zone Types
// ============================================

export interface SafeZoneConfig {
    /** 🔴 Action safe — top edge (px from top of frame) */
    marginTop: number;
    /** 🟠 Top content margin — text must not start above this (px from top of frame, >= marginTop) */
    contentTop: number;
    /** 🔴 Action safe — bottom edge (px from bottom of frame) */
    marginBottom: number;
    /** 🔴 Action safe — left edge (px from left of frame) */
    marginLeft: number;
    /** 🔴 Action safe — right edge (px from right of frame) */
    marginRight: number;
    /** 🟦 Subtitle zone — distance from bottom of frame to the BOTTOM of the subtitle band (px) */
    subtitleBottom: number;
    /** 🟦 Subtitle zone — height of the subtitle band (px) */
    subtitleHeight: number;
    /** 🟨 Note/disclaimer zone — distance from bottom of frame to the BOTTOM of the note band (px) */
    noteBottom: number;
    /** 🟨 Note/disclaimer zone — height of the note band (px) */
    noteHeight: number;
}

export const SAFE_ZONES: Record<VideoResolution, SafeZoneConfig> = {
    '1080x1080': {
        marginTop:      64,
        contentTop:     192,
        marginBottom:   64,
        marginLeft:     64,
        marginRight:    64,
        subtitleBottom: 222,
        subtitleHeight: 80,   // TODO: confirm exact height
        noteBottom:     64,   // TODO: confirm (currently equals marginBottom)
        noteHeight:     80,   // TODO: confirm exact height
    },
    '1080x1920': {
        marginTop:      160,
        contentTop:     160,
        marginBottom:   320,
        marginLeft:     128,
        marginRight:    128,
        subtitleBottom: 428,
        subtitleHeight: 80,
        noteBottom:     320,
        noteHeight:     80,
    },
    '1920x1080': {
        marginTop:      64,
        contentTop:     64,
        marginBottom:   64,
        marginLeft:     64,
        marginRight:    64,
        subtitleBottom: 173,
        subtitleHeight: 80,
        noteBottom:     64,
        noteHeight:     80,
    },
    '1080x1350': {
        marginTop:      64,
        contentTop:     192,
        marginBottom:   64,
        marginLeft:     64,
        marginRight:    64,
        subtitleBottom: 173,
        subtitleHeight: 80,
        noteBottom:     64,
        noteHeight:     80,
    },
};

// ============================================
// Video Types
// ============================================

export interface VideoFile {
    id: string;
    file: File;
    url: string;
    name: string;
    size: number;
    duration: number;
    width: number;
    height: number;
    frameRate: number; // frames per second detected from the video
    resolution: VideoResolution;
    storagePath?: string;
}

export interface Timecode {
    id: string;
    startTime: number;
    endTime: number;
    segmentIndex: number;
    description?: string;
}

export interface VideoSegment {
    id: string;
    videoId: string;
    timecode: Timecode;
    blobUrl?: string;
    thumbnailUrl?: string;
    textLayers: TextLayer[];
    isOutro?: boolean;
}

// ============================================
// Text Layer Types
// ============================================

export type AnimationType = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale';

export interface TextLayer {
    id: string;
    segmentId: string;
    content: string;
    positionX: number; // percentage 0-100
    positionY: number; // percentage 0-100
    fontFamily: string;
    fontSize: number;
    fontWeight?: number; // defaults to 800 (bold); use 400 for regular
    textStyle?: 'headline' | 'body'; // 'headline' = ExtraBold 64–128px, 'body' = Regular 24–32px
    color: string;
    backgroundColor?: string;
    animationType: AnimationType;
    animationDuration: number; // seconds
    startTime: number; // relative to segment start
    endTime: number; // relative to segment start
}

export const DEFAULT_TEXT_LAYER: Omit<TextLayer, 'id' | 'segmentId'> = {
    content: 'Enter text here',
    positionX: 50,
    positionY: 80,
    fontFamily: 'Inter',
    fontSize: 64,
    fontWeight: 800,
    textStyle: 'headline',
    color: '#ffffff',
    backgroundColor: undefined,
    animationType: 'slide-up',
    animationDuration: 0.5,
    startTime: 0,
    endTime: 3,
};

// ============================================
// Translation Types
// ============================================

export interface Translation {
    id: string;
    textLayerId: string;
    languageCode: LanguageCode;
    translatedContent: string;
    audioPath?: string;
    audioBlobUrl?: string;
}

export interface TranslationSet {
    languageCode: LanguageCode;
    translations: Translation[];
}

// ============================================
// Voice Cloning Types
// ============================================

export interface VoiceClone {
    voiceId: string;
    name: string;
    sampleUrl?: string;
    status: 'pending' | 'processing' | 'ready' | 'error';
}

export interface DubbingTrack {
    id: string;
    segmentId: string;
    languageCode: LanguageCode;
    audioUrl?: string;
    audioBlobUrl?: string;
    status: 'pending' | 'generating' | 'ready' | 'error';
    duration?: number;
}

// ============================================
// Outro Types
// ============================================

export interface OutroConfig {
    ctaText: string;
    disclaimerText: string;
    ctaPositionY: number;
    disclaimerPositionY: number;
    ctaFontSize: number;
    disclaimerFontSize: number;
    ctaColor: string;
    disclaimerColor: string;
    translations: {
        [key in LanguageCode]?: {
            ctaText: string;
            disclaimerText: string;
        };
    };
}

export const DEFAULT_OUTRO_CONFIG: OutroConfig = {
    ctaText: '',
    disclaimerText: '',
    ctaPositionY: 40,
    disclaimerPositionY: 76.67,
    ctaFontSize: 56,
    disclaimerFontSize: 24,
    ctaColor: '#181C25',
    disclaimerColor: '#181C25',
    translations: {},
};

// ============================================
// Export Types
// ============================================

export interface ExportJob {
    id: string;
    languageCode: LanguageCode;
    status: 'pending' | 'processing' | 'complete' | 'error';
    progress: number; // 0-100
    outputUrl?: string;
    outputBlobUrl?: string;
    error?: string;
}

// ============================================
// App State Types
// ============================================

export type AppStep =
    | 'upload'
    | 'analyze'
    | 'edit-text'
    | 'translate'
    | 'translate-voiceover'
    | 'dub'
    | 'outro'
    | 'export';

export interface StepConfig {
    id: AppStep;
    label: string;
    description: string;
    icon: string;
}

export const APP_STEPS: StepConfig[] = [
    { id: 'upload', label: 'Upload', description: 'Upload your video', icon: 'Upload' },
    { id: 'analyze', label: 'Analyze', description: 'AI scene detection', icon: 'Scan' },
    { id: 'edit-text', label: 'Edit Text', description: 'Add text layers', icon: 'Type' },
    { id: 'translate', label: 'Translate Text', description: 'Translate text overlays', icon: 'Languages' },
    { id: 'translate-voiceover', label: 'Translate Voiceover', description: 'Translate spoken script', icon: 'Mic2' },
    { id: 'dub', label: 'Dub', description: 'Voice dubbing', icon: 'Mic' },
    { id: 'outro', label: 'Outro', description: 'CTA & Disclaimer', icon: 'Film' },
    { id: 'export', label: 'Export', description: 'Download videos', icon: 'Download' },
];

// ============================================
// Script Types
// ============================================

export type ScriptFileType = 'txt' | 'pdf' | 'docx';

export interface ScriptFile {
    id: string;
    file: File;
    name: string;
    size: number;
    type: ScriptFileType;
    extractedText: string; // Plain text extracted from the file
}

export interface ScriptEntry {
    sceneIndex: number;
    textOnScreen: string;      // Text to display as overlay
    voiceover: string;         // Voiceover/spoken script text
    disclaimer?: string;       // Disclaimer text for the outro scene (optional)
    suggestedPosition: 'top' | 'center' | 'bottom';
    suggestedFontSize: 'small' | 'medium' | 'large';
}

// A single row parsed directly from a structured DOCX/CSV table.
// Columns: Voiceover | Text on Visual | Visual (scene description)
export interface ScriptTableRow {
    voiceover: string;
    textOnScreen: string;
    visual: string; // scene description — for context, not directly used
}

// ============================================
// API Response Types
// ============================================

export interface SceneAnalysisResponse {
    timecodes: number[];
    scenes: {
        startTime: number;
        endTime: number;
        description: string;
    }[];
}

export interface ScriptMatchResponse {
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
}

export interface TranslationResponse {
    translations: {
        [langCode: string]: string[];
    };
}

export interface VoiceCloneResponse {
    voiceId: string;
    name: string;
}

export interface SpeechGenerationResponse {
    audioUrl: string;
    duration: number;
}
