import { create } from 'zustand';
import {
    AppStep,
    VideoFile,
    VideoSegment,
    TextLayer,
    Translation,
    LanguageCode,
    VoiceClone,
    DubbingTrack,
    OutroConfig,
    ExportJob,
    DEFAULT_OUTRO_CONFIG,
    ScriptFile,
    ScriptEntry,
} from '@/types';

interface AppState {
    // Session
    sessionId: string;

    // Current step
    currentStep: AppStep;
    setCurrentStep: (step: AppStep) => void;

    // Video
    video: VideoFile | null;
    setVideo: (video: VideoFile | null) => void;

    // Script
    script: ScriptFile | null;
    setScript: (script: ScriptFile | null) => void;
    scriptEntries: ScriptEntry[];
    setScriptEntries: (entries: ScriptEntry[]) => void;
    scriptAutoPopulated: boolean;
    setScriptAutoPopulated: (value: boolean) => void;

    // Auto-trigger analysis after upload
    shouldAutoAnalyze: boolean;
    setShouldAutoAnalyze: (value: boolean) => void;

    // Segments
    segments: VideoSegment[];
    setSegments: (segments: VideoSegment[]) => void;
    addSegment: (segment: VideoSegment) => void;
    updateSegment: (id: string, updates: Partial<VideoSegment>) => void;

    // Active segment for editing
    activeSegmentId: string | null;
    setActiveSegmentId: (id: string | null) => void;

    // Text layers
    addTextLayer: (segmentId: string, textLayer: TextLayer) => void;
    updateTextLayer: (segmentId: string, layerId: string, updates: Partial<TextLayer>) => void;
    removeTextLayer: (segmentId: string, layerId: string) => void;

    // Selected languages
    selectedLanguages: LanguageCode[];
    setSelectedLanguages: (languages: LanguageCode[]) => void;
    toggleLanguage: (language: LanguageCode) => void;

    // Translations
    translations: Map<string, Translation[]>; // key: textLayerId
    setTranslations: (textLayerId: string, translations: Translation[]) => void;
    updateTranslation: (textLayerId: string, languageCode: LanguageCode, content: string) => void;

    // Voice clone
    voiceClone: VoiceClone | null;
    setVoiceClone: (voiceClone: VoiceClone | null) => void;

    // Dubbing tracks
    dubbingTracks: DubbingTrack[];
    setDubbingTracks: (tracks: DubbingTrack[]) => void;
    updateDubbingTrack: (id: string, updates: Partial<DubbingTrack>) => void;

    // Outro config
    outroConfig: OutroConfig;
    setOutroConfig: (config: Partial<OutroConfig>) => void;

    // Export jobs
    exportJobs: ExportJob[];
    setExportJobs: (jobs: ExportJob[]) => void;
    updateExportJob: (id: string, updates: Partial<ExportJob>) => void;

    // Loading states
    isAnalyzing: boolean;
    setIsAnalyzing: (value: boolean) => void;
    isTranslating: boolean;
    setIsTranslating: (value: boolean) => void;
    isGeneratingDubbing: boolean;
    setIsGeneratingDubbing: (value: boolean) => void;
    isExporting: boolean;
    setIsExporting: (value: boolean) => void;

    // Reset
    reset: () => void;
}

// Generate a unique session ID
const generateSessionId = () => {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const initialState = {
    sessionId: generateSessionId(),
    currentStep: 'upload' as AppStep,
    video: null,
    script: null,
    scriptEntries: [] as ScriptEntry[],
    scriptAutoPopulated: false,
    shouldAutoAnalyze: false,
    segments: [],
    activeSegmentId: null,
    selectedLanguages: ['EN'] as LanguageCode[],
    translations: new Map(),
    voiceClone: null,
    dubbingTracks: [],
    outroConfig: DEFAULT_OUTRO_CONFIG,
    exportJobs: [],
    isAnalyzing: false,
    isTranslating: false,
    isGeneratingDubbing: false,
    isExporting: false,
};

export const useAppStore = create<AppState>((set, get) => ({
    ...initialState,

    setCurrentStep: (step) => set({ currentStep: step }),

    setVideo: (video) => set({ video }),

    setScript: (script) => set({ script }),

    setScriptEntries: (scriptEntries) => set({ scriptEntries }),

    setScriptAutoPopulated: (scriptAutoPopulated) => set({ scriptAutoPopulated }),

    setShouldAutoAnalyze: (shouldAutoAnalyze) => set({ shouldAutoAnalyze }),

    setSegments: (segments) => set({ segments }),

    addSegment: (segment) => set((state) => ({
        segments: [...state.segments, segment]
    })),

    updateSegment: (id, updates) => set((state) => ({
        segments: state.segments.map((seg) =>
            seg.id === id ? { ...seg, ...updates } : seg
        ),
    })),

    setActiveSegmentId: (id) => set({ activeSegmentId: id }),

    addTextLayer: (segmentId, textLayer) => set((state) => ({
        segments: state.segments.map((seg) =>
            seg.id === segmentId
                ? { ...seg, textLayers: [...seg.textLayers, textLayer] }
                : seg
        ),
    })),

    updateTextLayer: (segmentId, layerId, updates) => set((state) => ({
        segments: state.segments.map((seg) =>
            seg.id === segmentId
                ? {
                    ...seg,
                    textLayers: seg.textLayers.map((layer) =>
                        layer.id === layerId ? { ...layer, ...updates } : layer
                    ),
                }
                : seg
        ),
    })),

    removeTextLayer: (segmentId, layerId) => set((state) => ({
        segments: state.segments.map((seg) =>
            seg.id === segmentId
                ? { ...seg, textLayers: seg.textLayers.filter((l) => l.id !== layerId) }
                : seg
        ),
    })),

    setSelectedLanguages: (languages) => set({ selectedLanguages: languages }),

    toggleLanguage: (language) => set((state) => {
        const isSelected = state.selectedLanguages.includes(language);
        if (isSelected) {
            // Don't allow removing the last language
            if (state.selectedLanguages.length === 1) return state;
            return {
                selectedLanguages: state.selectedLanguages.filter((l) => l !== language),
            };
        }
        return {
            selectedLanguages: [...state.selectedLanguages, language],
        };
    }),

    setTranslations: (textLayerId, translations) => set((state) => {
        const newTranslations = new Map(state.translations);
        newTranslations.set(textLayerId, translations);
        return { translations: newTranslations };
    }),

    updateTranslation: (textLayerId, languageCode, content) => set((state) => {
        const newTranslations = new Map(state.translations);
        const layerTranslations = newTranslations.get(textLayerId) || [];
        const updatedTranslations = layerTranslations.map((t) =>
            t.languageCode === languageCode ? { ...t, translatedContent: content } : t
        );
        newTranslations.set(textLayerId, updatedTranslations);
        return { translations: newTranslations };
    }),

    setVoiceClone: (voiceClone) => set({ voiceClone }),

    setDubbingTracks: (tracks) => set({ dubbingTracks: tracks }),

    updateDubbingTrack: (id, updates) => set((state) => ({
        dubbingTracks: state.dubbingTracks.map((track) =>
            track.id === id ? { ...track, ...updates } : track
        ),
    })),

    setOutroConfig: (config) => set((state) => ({
        outroConfig: { ...state.outroConfig, ...config },
    })),

    setExportJobs: (jobs) => set({ exportJobs: jobs }),

    updateExportJob: (id, updates) => set((state) => ({
        exportJobs: state.exportJobs.map((job) =>
            job.id === id ? { ...job, ...updates } : job
        ),
    })),

    setIsAnalyzing: (value) => set({ isAnalyzing: value }),
    setIsTranslating: (value) => set({ isTranslating: value }),
    setIsGeneratingDubbing: (value) => set({ isGeneratingDubbing: value }),
    setIsExporting: (value) => set({ isExporting: value }),

    reset: () => set({ ...initialState, sessionId: generateSessionId() }),
}));
