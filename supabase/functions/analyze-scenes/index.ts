// Supabase Edge Function: analyze-scenes
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai@1.43.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Scene {
    startTime: number;
    endTime: number;
    description: string;
}

interface SceneAnalysisResponse {
    timecodes: number[];
    scenes: Scene[];
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    let tempFilePath = "";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const { videoUrl, videoDuration } = await req.json();
        if (!videoUrl) throw new Error("videoUrl is required");

        console.log(`Analyzing video: ${videoUrl}, duration: ${videoDuration}s`);

        // 1. Initialize the Google GenAI client
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        console.log("GoogleGenAI client initialized");

        // 2. Download video to Deno's temp directory
        console.log("Downloading video...");
        const videoResp = await fetch(videoUrl);
        if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.statusText}`);

        const videoData = new Uint8Array(await videoResp.arrayBuffer());
        tempFilePath = await Deno.makeTempFile({ suffix: ".mp4" });
        await Deno.writeFile(tempFilePath, videoData);
        console.log(`Video saved to ${tempFilePath}, size: ${videoData.length} bytes`);

        // 3. Upload using File Manager
        console.log("Uploading to Gemini File API...");
        const uploadResult = await ai.files.upload({
            file: tempFilePath,
            config: {
                mimeType: "video/mp4",
                displayName: "Scene Analysis",
            },
        });
        console.log(`Upload complete. File: ${uploadResult.name}`);

        // 4. Poll until video is processed
        console.log("Waiting for video processing...");
        let file = await ai.files.get({ name: uploadResult.name! });
        let pollCount = 0;
        const maxPolls = 30;

        while (file.state === "PROCESSING" && pollCount < maxPolls) {
            await new Promise((r) => setTimeout(r, 2000));
            file = await ai.files.get({ name: uploadResult.name! });
            pollCount++;
            console.log(`Poll ${pollCount}: state = ${file.state}`);
        }

        if (file.state === "FAILED") throw new Error("Gemini video processing failed");
        if (file.state === "PROCESSING") throw new Error("Video processing timeout");

        console.log("Video is ACTIVE, generating content...");

        // 5. Generate scene analysis with structured output
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{
                role: "user",
                parts: [
                    { fileData: { fileUri: file.uri!, mimeType: file.mimeType! } },
                    {
                        text: `Analyze this ${videoDuration}-second video. Find every hard cut where the visual content abruptly changes.

A hard cut means: one frame shows one thing, the very next frame shows something completely different. The entire frame changes instantly.

Examples of hard cuts to DETECT:
- Abrupt switch from one shot/location to another
- Sudden full-screen color or graphic filling the frame
- Instant transition to a completely different visual

NOT a scene change (IGNORE these):
- Objects or people moving within the same shot
- Camera zoom, pan, or tilt (continuous motion)
- Text or graphics appearing over the same background
- Gradual fades or dissolves

Timestamps in seconds with 3 decimal places (e.g., 4.567).
First scene starts at 0.000, last scene ends at ${videoDuration.toFixed(3)}.
Each scene must be at least 1 second long.`
                    }
                ]
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
                                    description: { type: "string" }
                                },
                                required: ["startTime", "endTime", "description"]
                            }
                        }
                    },
                    required: ["scenes"]
                }
            }
        });

        console.log("=== GEMINI RESPONSE ===");
        const responseText = response.text;
        console.log(responseText);

        let parsedResult = JSON.parse(responseText!);
        console.log(`Parsed ${parsedResult.scenes.length} scenes from Gemini`);

        // Post-processing: Ensure contiguous scenes with no gaps
        // Step 1: Sort scenes by startTime and fix any gaps
        const rawScenes = parsedResult.scenes.sort((a: Scene, b: Scene) => a.startTime - b.startTime);

        // Step 2: Make scenes contiguous (no gaps, no overlaps)
        const contiguousScenes: Scene[] = [];
        for (let i = 0; i < rawScenes.length; i++) {
            const scene = { ...rawScenes[i] };

            if (i === 0) {
                // First scene must start at 0
                scene.startTime = 0;
            } else {
                // Each scene starts where the previous one ended
                scene.startTime = contiguousScenes[i - 1].endTime;
            }

            // Ensure endTime is after startTime
            if (scene.endTime <= scene.startTime) {
                scene.endTime = scene.startTime + 0.5; // Minimum half second
            }

            contiguousScenes.push(scene);
        }

        // Step 3: Ensure last scene ends at video duration
        if (contiguousScenes.length > 0) {
            contiguousScenes[contiguousScenes.length - 1].endTime = videoDuration;
        }

        // Step 4: Merge very short scenes (< 0.5s) into neighbors
        const MIN_SCENE_DURATION = 0.5;
        const mergedScenes: Scene[] = [];

        for (const scene of contiguousScenes) {
            const duration = scene.endTime - scene.startTime;

            if (duration < MIN_SCENE_DURATION && mergedScenes.length > 0) {
                // Merge into previous scene by extending its endTime
                mergedScenes[mergedScenes.length - 1].endTime = scene.endTime;
                console.log(`Merged short scene (${duration.toFixed(3)}s) into previous`);
            } else {
                // Ensure this scene starts where previous ended
                if (mergedScenes.length > 0) {
                    scene.startTime = mergedScenes[mergedScenes.length - 1].endTime;
                }
                mergedScenes.push(scene);
            }
        }

        // Final safety check: ensure no gaps
        for (let i = 1; i < mergedScenes.length; i++) {
            mergedScenes[i].startTime = mergedScenes[i - 1].endTime;
        }
        if (mergedScenes.length > 0) {
            mergedScenes[0].startTime = 0;
            mergedScenes[mergedScenes.length - 1].endTime = videoDuration;
        }

        console.log(`After processing: ${mergedScenes.length} scenes (original: ${rawScenes.length})`);

        // Extract timecodes from merged scenes
        const timecodes = [0, ...mergedScenes.map((s: Scene) => s.endTime)];
        const uniqueTimecodes = [...new Set(timecodes)].sort((a: number, b: number) => a - b);

        const result: SceneAnalysisResponse = {
            timecodes: uniqueTimecodes,
            scenes: mergedScenes,
        };

        // 6. Cleanup (Local file & Google Cloud file)
        console.log("Cleaning up...");
        try { await Deno.remove(tempFilePath); } catch { /* ignore */ }
        try { await ai.files.delete({ name: uploadResult.name! }); } catch { /* ignore */ }
        console.log("Cleanup complete");

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error) {
        console.error("=== ERROR ===");
        console.error(error);

        // Cleanup on error
        if (tempFilePath) {
            try {
                await Deno.remove(tempFilePath);
                console.log("Temp file cleaned up");
            } catch (_e) {
                console.error("Failed to cleanup temp file:", _e);
            }
        }

        const errorMessage = error instanceof Error ? error.message : "Failed to analyze video";
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
