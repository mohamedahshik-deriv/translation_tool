// Supabase Edge Function: analyze-scenes-3-task-gem3Flash
// Task 1 only: gemini-3-flash-preview — multimodal scene + narrative sync + transcript
// Output shape: identical to analyze-scenes-3-task (SceneAnalysisResponse)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai@1.43.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Scene {
    startTime: number;
    endTime: number;
    narrativeStart: number;
    narrativeEnd: number;
    spokenText: string;
    textOnScreen: string;
}

interface SceneAnalysisResponse {
    timecodes: number[];
    scenes: Scene[];
    hasVoiceover: boolean;
    detectedLanguage: string;
    detectedLanguageName: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    let silentFilePath = "";
    let originalFilePath = "";

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const { videoUrl, videoDuration, hasAudio = true, scriptText, originalVideoUrl } = await req.json();
        if (!videoUrl) throw new Error("videoUrl is required");

        const scriptRowCount: number | undefined = scriptText
            ? (() => {
                const nonSeparatorRows = (scriptText as string)
                    .split('\n')
                    .filter((l: string) => {
                        const trimmed = l.trim();
                        if (!trimmed.startsWith('|')) return false;
                        const inner = trimmed.replace(/\|/g, '').replace(/[-:\s]/g, '');
                        return inner.length > 0;
                    });
                return nonSeparatorRows.length > 1 ? nonSeparatorRows.length - 1 : undefined;
            })()
            : undefined;

        console.log(`Duration: ${videoDuration}s, hasAudio: ${hasAudio}, scriptRows: ${scriptRowCount ?? 'none'}`);

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // ─────────────────────────────────────────────────────────────
        // Download files
        // ─────────────────────────────────────────────────────────────
        console.log("Downloading silent video...");
        const silentResp = await fetch(videoUrl);
        if (!silentResp.ok) throw new Error(`Failed to download silent video: ${silentResp.statusText}`);
        const silentData = new Uint8Array(await silentResp.arrayBuffer());
        silentFilePath = await Deno.makeTempFile({ suffix: "_silent.mp4" });
        await Deno.writeFile(silentFilePath, silentData);
        console.log(`Silent video: ${silentData.length} bytes`);

        // Download original video (with audio) for Task 1 transcription — falls back to silent if not provided
        if (originalVideoUrl) {
            console.log("Downloading original video (with audio) for Task 1...");
            const originalResp = await fetch(originalVideoUrl);
            if (!originalResp.ok) throw new Error(`Failed to download original video: ${originalResp.statusText}`);
            const originalData = new Uint8Array(await originalResp.arrayBuffer());
            originalFilePath = await Deno.makeTempFile({ suffix: "_original.mp4" });
            await Deno.writeFile(originalFilePath, originalData);
            console.log(`Original video: ${originalData.length} bytes`);
        } else {
            console.log("No originalVideoUrl provided — Task 1 will use silent video (transcript may be inaccurate)");
        }

        // ─────────────────────────────────────────────────────────────
        // Upload to Gemini File API
        // ─────────────────────────────────────────────────────────────
        console.log("Uploading to Gemini File API...");
        const uploadPromises: Promise<Awaited<ReturnType<typeof ai.files.upload>>>[] = [
            ai.files.upload({
                file: silentFilePath,
                config: { mimeType: "video/mp4", displayName: "Silent Video" },
            }),
        ];

        // Upload original video for Task 1 if available
        const originalUploadPromise = originalFilePath
            ? ai.files.upload({
                file: originalFilePath,
                config: { mimeType: "video/mp4", displayName: "Original Video (with audio)" },
            })
            : null;

        const [uploadResults, uploadOriginal] = await Promise.all([
            Promise.all(uploadPromises),
            originalUploadPromise,
        ]);
        const uploadSilent = uploadResults[0];
        console.log(`Silent upload: ${uploadSilent.name}${uploadOriginal ? `, Original upload: ${uploadOriginal.name}` : ""}`);

        // Poll until ACTIVE
        const pollFile = async (name: string) => {
            let f = await ai.files.get({ name });
            let count = 0;
            while (f.state === "PROCESSING" && count < 30) {
                await new Promise((r) => setTimeout(r, 2000));
                f = await ai.files.get({ name });
                count++;
                console.log(`Poll ${name} (${count}): ${f.state}`);
            }
            if (f.state === "FAILED") throw new Error(`File processing failed: ${name}`);
            if (f.state === "PROCESSING") throw new Error(`File processing timeout: ${name}`);
            return f;
        };

        const pollPromises = [pollFile(uploadSilent.name!)];
        if (uploadOriginal) pollPromises.push(pollFile(uploadOriginal.name!));
        const polled = await Promise.all(pollPromises);

        const fileSilent = polled[0];
        const fileOriginal = uploadOriginal ? polled[1] : null;

        const silentPart = { fileData: { fileUri: fileSilent.uri!, mimeType: "video/mp4" } };
        // Task 1 uses original video (has audio for accurate transcription); falls back to silent
        const task1Part = fileOriginal
            ? { fileData: { fileUri: fileOriginal.uri!, mimeType: "video/mp4" } }
            : silentPart;

        // ─────────────────────────────────────────────────────────────
        // TASK 1: Enhanced multimodal scene + narrative sync analysis
        // Model: gemini-3-flash-preview
        // ─────────────────────────────────────────────────────────────
        console.log("Running Task 1...");

        const res1 = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{
                role: "user",
                parts: [
                    task1Part,
                    {
                        text: `Act as a professional Video Editor and Metadata Specialist. Your task is to perform a high-precision multimodal frame-and-phoneme sync analysis on this ${videoDuration}-second video.

Definitions:
- Visual Scene: The exact frame where a cut, fade, or transition occurs, changing the primary on-screen content.
- Narrative Segment: The exact millisecond the narrator begins the first syllable and finishes the final breath of a topic-specific sentence.

For each scene, extract:
- startTime: visual scene start in seconds (3 decimal places). First scene must be 0.000.
- endTime: visual scene end in seconds (3 decimal places). Last scene must be ${videoDuration.toFixed(3)}.
- narrativeStart: exact timestamp in seconds (3 decimal places = millisecond precision) when the narrator begins the first syllable for this scene's topic. First narrative segment must be 0.000.
- narrativeEnd: exact timestamp in seconds (3 decimal places = millisecond precision) when the narrator finishes the final word for this scene's topic. Last narrative segment must be ${videoDuration.toFixed(3)}.
- offsetMs: audio-visual offset in milliseconds. Negative = audio leads video. Positive = audio lags video.
- sceneDescription: concise description of the visual environment or graphics shown.
- directTranscript: exact verbatim text spoken during the narrative interval for this scene, in the original spoken language.

Precision constraints:
- All timestamps accurate to 3 decimal places.
- Contextual boundary: if the narrator is still speaking about topic A while the visual has switched to topic B, the narrativeEnd for scene A must be marked at the exact moment topic A's thought concludes, regardless of the visual cut.
- Zero-gap: no unaccounted-for milliseconds between scenes unless there is a literal black frame or dead silence.
- Every scene must be at least 0.500 seconds long. Merge shorter scenes into adjacent ones.
- First scene startTime = 0.000. Last scene endTime = ${videoDuration.toFixed(3)}.

${scriptText && scriptRowCount
    ? `Script guidance: exactly ${scriptRowCount} scenes expected. Use visual transitions to align with these ${scriptRowCount} segments.\n\n---SCRIPT START---\n${scriptText}\n---SCRIPT END---`
    : 'No script provided. Determine scenes purely from visual transitions (hard cuts and fades).'}`,
                    },
                ],
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        scenes: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    startTime: { type: "number" },
                                    endTime: { type: "number" },
                                    narrativeStart: { type: "number" },
                                    narrativeEnd: { type: "number" },
                                    offsetMs: { type: "number" },
                                    sceneDescription: { type: "string" },
                                    directTranscript: { type: "string" },
                                },
                                required: ["startTime", "endTime", "narrativeStart", "narrativeEnd", "offsetMs", "sceneDescription", "directTranscript"],
                            },
                        },
                    },
                    required: ["scenes"],
                },
            },
        });

        const sceneData = JSON.parse(res1.text!);
        console.log(`Task 1 complete: ${sceneData.scenes?.length ?? 0} scenes detected`);

        // ─────────────────────────────────────────────────────────────
        // Post-process Task 1: sort → make contiguous
        // ─────────────────────────────────────────────────────────────
        type RichScene = {
            startTime: number;
            endTime: number;
            narrativeStart: number;
            narrativeEnd: number;
            offsetMs: number;
            sceneDescription: string;
            directTranscript: string;
        };

        const rawScenes = (sceneData.scenes as RichScene[]).sort((a, b) => a.startTime - b.startTime);

        // No audio track — wipe any hallucinated transcripts before post-processing
        if (!hasAudio) {
            rawScenes.forEach(s => { s.directTranscript = ""; });
        }

        const contiguousScenes: RichScene[] = [];
        for (let i = 0; i < rawScenes.length; i++) {
            const scene = { ...rawScenes[i] };
            scene.startTime = i === 0 ? 0 : contiguousScenes[i - 1].endTime;
            if (scene.endTime <= scene.startTime) scene.endTime = scene.startTime + 0.5;
            contiguousScenes.push(scene);
        }
        if (contiguousScenes.length > 0) {
            contiguousScenes[contiguousScenes.length - 1].endTime = videoDuration;
        }

        // Build final scenes — textOnScreen empty (Task 3 removed)
        const mergedScenes: Scene[] = contiguousScenes.map((scene) => ({
            startTime: scene.startTime,
            endTime: scene.endTime,
            narrativeStart: scene.narrativeStart,
            narrativeEnd: scene.narrativeEnd,
            spokenText: scene.directTranscript ?? "",
            textOnScreen: "",
        }));

        console.log(`Final: ${mergedScenes.length} scenes`);

        const timecodes = [0, ...mergedScenes.map((s) => s.endTime)];
        const uniqueTimecodes = [...new Set(timecodes)].sort((a, b) => a - b);

        // hasVoiceover derived from whether any transcript text was captured
        const hasVoiceover = hasAudio && mergedScenes.some(s => s.spokenText.trim().length > 0);

        const result: SceneAnalysisResponse = {
            timecodes: uniqueTimecodes,
            scenes: mergedScenes,
            hasVoiceover,
            detectedLanguage: "",
            detectedLanguageName: "",
        };

        // Cleanup Gemini uploads
        try { await ai.files.delete({ name: uploadSilent.name! }); } catch { /* ignore */ }
        if (uploadOriginal) try { await ai.files.delete({ name: uploadOriginal.name! }); } catch { /* ignore */ }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error) {
        console.error("=== ERROR ===", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to analyze video";
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    } finally {
        if (silentFilePath) try { await Deno.remove(silentFilePath); } catch { /* ignore */ }
        if (originalFilePath) try { await Deno.remove(originalFilePath); } catch { /* ignore */ }
    }
});
