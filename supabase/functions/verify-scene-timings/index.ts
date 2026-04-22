// Supabase Edge Function: verify-scene-timings
// Takes pre-detected scenes and verifies/corrects their timing against the actual video.
// Uses gemini-2.5-flash to audit each scene's visual & narrative boundaries.
// Output shape: identical to analyze-scenes-3-task-gem3Flash (SceneAnalysisResponse)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai@1.43.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SceneInput {
    startTime: number;
    endTime: number;
    narrativeStart: number;
    narrativeEnd: number;
    spokenText: string;
    textOnScreen: string;
}

interface SceneOutput {
    startTime: number;
    endTime: number;
    narrativeStart: number;
    narrativeEnd: number;
    spokenText: string;
    textOnScreen: string;
}

interface SceneAnalysisResponse {
    timecodes: number[];
    scenes: SceneOutput[];
    hasVoiceover: boolean;
    detectedLanguage: string;
    detectedLanguageName: string;
    correctionsSummary: { total: number; corrected: number };
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    let silentFilePath = "";
    let originalFilePath = "";

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const {
            videoUrl,
            videoDuration,
            hasAudio = true,
            originalVideoUrl,
            scenes,
        } = await req.json();

        if (!videoUrl) throw new Error("videoUrl is required");
        if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
            throw new Error("scenes array is required and must not be empty");
        }

        const inputScenes = scenes as SceneInput[];
        const N = inputScenes.length;

        console.log(`verify-scene-timings: ${N} scenes, duration ${videoDuration}s, hasAudio: ${hasAudio}`);

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

        if (originalVideoUrl) {
            console.log("Downloading original video (with audio)...");
            const originalResp = await fetch(originalVideoUrl);
            if (!originalResp.ok) throw new Error(`Failed to download original video: ${originalResp.statusText}`);
            const originalData = new Uint8Array(await originalResp.arrayBuffer());
            originalFilePath = await Deno.makeTempFile({ suffix: "_original.mp4" });
            await Deno.writeFile(originalFilePath, originalData);
            console.log(`Original video: ${originalData.length} bytes`);
        } else {
            console.log("No originalVideoUrl — will use silent video (transcript correction may be limited)");
        }

        // ─────────────────────────────────────────────────────────────
        // Upload to Gemini File API
        // ─────────────────────────────────────────────────────────────
        console.log("Uploading to Gemini File API...");

        const uploadPromises: Promise<Awaited<ReturnType<typeof ai.files.upload>>>[] = [
            ai.files.upload({
                file: silentFilePath,
                config: { mimeType: "video/mp4", displayName: "Silent Video (QC)" },
            }),
        ];

        const originalUploadPromise = originalFilePath
            ? ai.files.upload({
                file: originalFilePath,
                config: { mimeType: "video/mp4", displayName: "Original Video with Audio (QC)" },
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

        // Use original video for audio verification if available, else fall back to silent
        const videoPart = fileOriginal
            ? { fileData: { fileUri: fileOriginal.uri!, mimeType: "video/mp4" } }
            : { fileData: { fileUri: fileSilent.uri!, mimeType: "video/mp4" } };

        // ─────────────────────────────────────────────────────────────
        // Build the scene table for the prompt
        // ─────────────────────────────────────────────────────────────
        const sceneTable = [
            "| # | startTime | endTime | narrativeStart | narrativeEnd | spokenText |",
            "|---|-----------|---------|----------------|--------------|------------|",
            ...inputScenes.map((s, i) =>
                `| ${i + 1} | ${s.startTime.toFixed(3)} | ${s.endTime.toFixed(3)} | ${s.narrativeStart.toFixed(3)} | ${s.narrativeEnd.toFixed(3)} | ${s.spokenText.replace(/\|/g, "/")} |`
            ),
        ].join("\n");

        // ─────────────────────────────────────────────────────────────
        // Gemini call: verify & correct timings
        // ─────────────────────────────────────────────────────────────
        console.log("Calling gemini-2.5-flash for timing verification...");

        const verifyPrompt = `You are a video QC specialist. Your job is to verify the timing accuracy of pre-detected scenes from a ${videoDuration.toFixed(3)}-second video.

You are given ${N} scenes. Watch the video carefully and verify each scene's timing against what you actually observe.

EXISTING SCENES:
${sceneTable}

━━━ WHAT TO VERIFY ━━━

1. startTime / endTime (visual boundaries)
   - Verify that the visual cut actually occurs at the provided timestamp.
   - Correct ONLY if you observe the cut at a clearly different frame.
   - A valid reason example: "Visual cut observed at 4.210, not 4.580 as provided."

2. narrativeStart / narrativeEnd (speech boundaries)
   - Verify that the narrator begins/ends speaking at the provided timestamp.
   - Correct ONLY if you hear the speech boundary at a clearly different time.
   - IMPORTANT: narrativeEnd is allowed to exceed endTime, and narrativeStart is allowed to be less than startTime. These represent audio-visual overlap and are NOT errors. Do NOT correct narrative timestamps simply because they cross a visual scene boundary.
   - A valid reason example: "Narrator begins at 2.340, not 2.000 as provided."

3. directTranscript (spoken text)
   - Correct ONLY if the words are factually wrong (wrong words heard).
   - Do NOT shorten or truncate the transcript because it seems long for the visual window. The transcript covers the full narrative segment, which may extend beyond the visual cut.
   - A valid reason example: "Heard 'leverage up to 1:500' not '1:800' as provided."

━━━ STRICT RULES ━━━

- Output EXACTLY ${N} scenes in the same order. No merging, splitting, adding, or removing scenes under any circumstances.
- All timestamps in seconds, 3 decimal places.
- First scene startTime must be 0.000.
- Last scene endTime must be ${videoDuration.toFixed(3)}.
- No scene shorter than 0.500 seconds (startTime to endTime).
- No gaps between consecutive visual scenes (endTime[i] must equal startTime[i+1]).
- If a scene is correct: set wasCorrected=false and correctionReason="".
- If a scene is changed: set wasCorrected=true and correctionReason must contain a specific, observable reason. Vague reasons like "timing seemed off" are not acceptable.`;

        const geminiResp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                role: "user",
                parts: [
                    videoPart,
                    { text: verifyPrompt },
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
                                    startTime:        { type: "number" },
                                    endTime:          { type: "number" },
                                    narrativeStart:   { type: "number" },
                                    narrativeEnd:     { type: "number" },
                                    directTranscript: { type: "string" },
                                    wasCorrected:     { type: "boolean" },
                                    correctionReason: { type: "string" },
                                },
                                required: [
                                    "startTime", "endTime",
                                    "narrativeStart", "narrativeEnd",
                                    "directTranscript",
                                    "wasCorrected", "correctionReason",
                                ],
                            },
                        },
                    },
                    required: ["scenes"],
                },
            },
        });

        const verifiedData = JSON.parse(geminiResp.text!);
        console.log(`Gemini returned ${verifiedData.scenes?.length ?? 0} scenes`);

        if (!verifiedData.scenes || verifiedData.scenes.length !== N) {
            throw new Error(
                `Scene count mismatch: expected ${N}, got ${verifiedData.scenes?.length ?? 0}. ` +
                "The model must return exactly the same number of scenes."
            );
        }

        // ─────────────────────────────────────────────────────────────
        // Post-process: enforce contiguous boundaries & hard limits
        // ─────────────────────────────────────────────────────────────
        type VerifiedScene = {
            startTime: number;
            endTime: number;
            narrativeStart: number;
            narrativeEnd: number;
            directTranscript: string;
            wasCorrected: boolean;
            correctionReason: string;
        };

        const rawVerified = verifiedData.scenes as VerifiedScene[];

        // Wipe transcripts if no audio track
        if (!hasAudio) {
            rawVerified.forEach(s => { s.directTranscript = ""; });
        }

        // Make visual boundaries strictly contiguous
        const contiguous: VerifiedScene[] = [];
        for (let i = 0; i < rawVerified.length; i++) {
            const scene = { ...rawVerified[i] };
            scene.startTime = i === 0 ? 0 : contiguous[i - 1].endTime;
            if (scene.endTime <= scene.startTime) scene.endTime = scene.startTime + 0.5;
            contiguous.push(scene);
        }
        if (contiguous.length > 0) {
            contiguous[0].startTime = 0;
            contiguous[contiguous.length - 1].endTime = videoDuration;
        }

        // Log corrections
        let correctedCount = 0;
        contiguous.forEach((s, i) => {
            if (s.wasCorrected) {
                correctedCount++;
                console.log(`Scene ${i + 1} corrected: ${s.correctionReason}`);
            }
        });
        console.log(`Corrections: ${correctedCount} of ${N} scenes`);

        // Map to output shape (preserves textOnScreen="" from original)
        const outputScenes: SceneOutput[] = contiguous.map((scene, i) => ({
            startTime:     scene.startTime,
            endTime:       scene.endTime,
            narrativeStart: scene.narrativeStart,
            narrativeEnd:  scene.narrativeEnd,
            spokenText:    scene.directTranscript ?? inputScenes[i].spokenText,
            textOnScreen:  inputScenes[i].textOnScreen,
        }));

        const timecodes = [0, ...outputScenes.map(s => s.endTime)];
        const uniqueTimecodes = [...new Set(timecodes)].sort((a, b) => a - b);

        const hasVoiceover = hasAudio && outputScenes.some(s => s.spokenText.trim().length > 0);

        const result: SceneAnalysisResponse = {
            timecodes: uniqueTimecodes,
            scenes: outputScenes,
            hasVoiceover,
            detectedLanguage: "",
            detectedLanguageName: "",
            correctionsSummary: { total: N, corrected: correctedCount },
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
        const errorMessage = error instanceof Error ? error.message : "Failed to verify scene timings";
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    } finally {
        if (silentFilePath) try { await Deno.remove(silentFilePath); } catch { /* ignore */ }
        if (originalFilePath) try { await Deno.remove(originalFilePath); } catch { /* ignore */ }
    }
});
