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
    /** 🟠 Content top rectangle — width from left frame edge x=0 (px). When set, renders a rect (0,0)→(contentTopWidth, contentTop) instead of the margin band */
    contentTopWidth?: number;
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
    /** 🟦 Subtitle zone — explicit width (px). When set, zone is centered in frame; omit to span margin-to-margin */
    subtitleWidth?: number;
    /** 🟩 Content bottom rectangle — width (px). When set, renders a rect from bottom upward */
    contentBottomWidth?: number;
    /** 🟩 Content bottom rectangle — height (px). Defaults to subtitleBottom when omitted */
    contentBottomHeight?: number;
    /** 🟩 Content bottom rectangle — which side to anchor to (default: 'left') */
    contentBottomAlign?: 'left' | 'right';
    /** 🟨 Note/disclaimer zone — distance from bottom of frame to the BOTTOM of the note band (px) */
    noteBottom: number;
    /** 🟨 Note/disclaimer zone — height of the note band (px) */
    noteHeight: number;
    /** 🟨 Note zone — explicit width (px). When set, zone is centered in frame; omit to span margin-to-margin */
    noteWidth?: number;
}

export const SAFE_ZONES: Record<VideoResolution, SafeZoneConfig> = {
    '1080x1080': {
        marginTop:          64,
        contentTop:         192,
        contentTopWidth:    300,
        marginBottom:       64,
        marginLeft:         64,
        marginRight:        64,
        subtitleBottom:      160,
        subtitleHeight:      62,
        subtitleWidth:       690,
        contentBottomWidth:  300,
        contentBottomHeight: 222,
        noteBottom:          64,
        noteHeight:         82,
        noteWidth:          598,
    },
    '1080x1920': {
        marginTop:           160,
        contentTop:          160,
        marginBottom:        508,
        marginLeft:          128,
        marginRight:         128,
        subtitleBottom:      414,
        subtitleHeight:      94,
        subtitleWidth:       690,
        contentBottomWidth:  192,
        contentBottomHeight: 608,
        contentBottomAlign:  'right',
        noteBottom:          320,
        noteHeight:          82,
        noteWidth:           598,
    },
    '1920x1080': {
        marginTop:           64,
        contentTop:          192,
        contentTopWidth:     300,
        marginBottom:        64,
        marginLeft:          64,
        marginRight:         64,
        subtitleBottom:      159,
        subtitleHeight:      94,
        subtitleWidth:       690,
        contentBottomWidth:  300,
        contentBottomHeight: 253,
        contentBottomAlign:  'left',
        noteBottom:          64,
        noteHeight:          90,
        noteWidth:           700,
    },
    '1080x1350': {
        marginTop:          64,
        contentTop:         192,
        contentTopWidth:    300,
        marginBottom:       64,
        marginLeft:         64,
        marginRight:        64,
        subtitleBottom:      159,
        subtitleHeight:      94,
        subtitleWidth:       690,
        contentBottomWidth:  300,
        contentBottomHeight: 253,
        noteBottom:          64,
        noteHeight:          82,
        noteWidth:           598,
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
// Position Grid Types
// ============================================

export type GridPosition = 'TL' | 'TC' | 'TR' | 'ML' | 'MC' | 'MR' | 'BL' | 'BC' | 'BR';

/** Ordered labels for rendering the 3×3 grid left-to-right, top-to-bottom. */
export const GRID_ORDER: GridPosition[] = ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'];

export const GRID_POSITION_LABELS: Record<GridPosition, string> = {
    TL: 'Top Left', TC: 'Top Center', TR: 'Top Right',
    ML: 'Middle Left', MC: 'Middle Center', MR: 'Middle Right',
    BL: 'Bottom Left', BC: 'Bottom Center', BR: 'Bottom Right',
};

export interface GridPositionConfig {
    x: number;                          // px from left edge of native frame
    y: number;                          // px from top edge of native frame
    anchor: 'top' | 'middle' | 'bottom'; // vertical alignment anchor
}

/**
 * Pixel-exact grid positions per resolution, derived from SAFE_ZONES margins.
 * x/y are in the native video coordinate space (e.g. 1080×1920).
 */
export const POSITION_GRID: Record<VideoResolution, Record<GridPosition, GridPositionConfig>> = {
    '1080x1920': {
        TL: { x: 128,  y: 160,  anchor: 'top'    },
        TC: { x: 540,  y: 160,  anchor: 'top'    },
        TR: { x: 952,  y: 160,  anchor: 'top'    },
        ML: { x: 128,  y: 960,  anchor: 'middle' },
        MC: { x: 540,  y: 960,  anchor: 'middle' },
        MR: { x: 952,  y: 960,  anchor: 'middle' },
        BL: { x: 128,  y: 1412, anchor: 'bottom' },
        BC: { x: 540,  y: 1412, anchor: 'bottom' },
        BR: { x: 952,  y: 1412, anchor: 'bottom' },
    },
    '1920x1080': {
        TL: { x: 64,   y: 64,   anchor: 'top'    },
        TC: { x: 960,  y: 64,   anchor: 'top'    },
        TR: { x: 1856, y: 64,   anchor: 'top'    },
        ML: { x: 64,   y: 540,  anchor: 'middle' },
        MC: { x: 960,  y: 540,  anchor: 'middle' },
        MR: { x: 1856, y: 540,  anchor: 'middle' },
        BL: { x: 64,   y: 1016, anchor: 'bottom' },
        BC: { x: 960,  y: 1016, anchor: 'bottom' },
        BR: { x: 1856, y: 1016, anchor: 'bottom' },
    },
    '1080x1080': {
        TL: { x: 64,   y: 192,  anchor: 'top'    }, // below 300×192 content-top-left block
        TC: { x: 540,  y: 192,  anchor: 'top'    }, // same top boundary as TL for visual consistency
        TR: { x: 1016, y: 192,  anchor: 'top'    }, // same top boundary
        ML: { x: 64,   y: 540,  anchor: 'middle' },
        MC: { x: 540,  y: 540,  anchor: 'middle' },
        MR: { x: 1016, y: 540,  anchor: 'middle' },
        BL: { x: 64,   y: 858,  anchor: 'bottom' }, // above 300×222 content-bottom block & subtitle zone
        BC: { x: 540,  y: 858,  anchor: 'bottom' },
        BR: { x: 1016, y: 858,  anchor: 'bottom' },
    },
    '1080x1350': {
        TL: { x: 64,   y: 64,   anchor: 'top'    },
        TC: { x: 540,  y: 64,   anchor: 'top'    },
        TR: { x: 1016, y: 64,   anchor: 'top'    },
        ML: { x: 64,   y: 675,  anchor: 'middle' },
        MC: { x: 540,  y: 675,  anchor: 'middle' },
        MR: { x: 1016, y: 675,  anchor: 'middle' },
        BL: { x: 64,   y: 1286, anchor: 'bottom' },
        BC: { x: 540,  y: 1286, anchor: 'bottom' },
        BR: { x: 1016, y: 1286, anchor: 'bottom' },
    },
};

/**
 * Which grid positions are available for each resolution.
 * Blocked positions render as disabled (greyed-out) in the UI.
 */
export const POSITION_CONSTRAINTS: Record<VideoResolution, GridPosition[]> = {
    '1080x1920': ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'],
    '1920x1080': ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'],
    '1080x1080': ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'],
    '1080x1350': ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'],
};

// ============================================
// Text Layer Types
// ============================================

export type AnimationType = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale';

export interface TextLayer {
    id: string;
    segmentId: string;
    content: string;
    positionX: number; // px in native video resolution
    positionY: number; // px in native video resolution
    positionAnchor?: 'top' | 'middle' | 'bottom'; // vertical alignment anchor
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
    positionX: 540,
    positionY: 160,
    positionAnchor: 'top',
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
