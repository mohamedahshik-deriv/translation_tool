// Supabase Edge Function: match-script-to-scenes
// Analyzes a video AND a script document together using Gemini,
// then matches script entries (text-on-screen, voiceover) to detected video scenes.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai@1.43.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SceneWithScript {
    startTime: number;
    endTime: number;
    description: string;
    textOnScreen?: string;
    voiceover?: string;
    suggestedPosition?: "top" | "center" | "bottom";
    disclaimer?: string;
}

interface ScriptMatchResponse {
    timecodes: number[];
    scenes: SceneWithScript[];
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    let tempFilePath = "";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const { videoUrl, videoDuration, scriptText } = await req.json();
        if (!videoUrl) throw new Error("videoUrl is required");
        if (!scriptText) throw new Error("scriptText is required");

        console.log(`Analyzing video: ${videoUrl}, duration: ${videoDuration}s`);
        console.log(`Script text length: ${scriptText.length} characters`);

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
                displayName: "Script Scene Matching",
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

        console.log("Video is ACTIVE, generating content with script matching...");

        // 5. Generate scene analysis WITH script matching
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{
                role: "user",
                parts: [
                    { fileData: { fileUri: file.uri!, mimeType: file.mimeType! } },
                    {
                        text: `You are analyzing a ${videoDuration}-second video alongside a script document.

## TASK 1: Detect Scene Cuts
Find every hard cut where the visual content abruptly changes.
- A hard cut: one frame shows one thing, the very next frame shows something completely different
- NOT a scene change: objects moving, camera zoom/pan, text appearing over same background, gradual fades

## TASK 2: Match Script to Scenes
Here is the script document:

---SCRIPT START---
${scriptText}
---SCRIPT END---

For each detected scene, find the most relevant part of the script and extract:
1. "textOnScreen": The text that should appear as an overlay on screen for this scene. This could be labeled as "Text on Screen", "On Screen Text", "Caption", "Title", "Lower Third", or similar in the script. Keep it concise (max 2-3 lines).
   SENTENCE CASE: Write the text in normal sentence case (capitalize only the first word and proper nouns). Do NOT use ALL CAPS.
   WORD COLORING: Pick exactly ONE word or number that is the single most impactful or key word in the entire text. Wrap ONLY that one word using the notation [red:word]. Example: "Leverage up to [red:1:800]" or "Earn [red:10x] more today". Never color more than one word/token.
2. "voiceover": The voiceover or narration text for this scene. This could be labeled as "Voiceover", "VO", "Narration", "Script", or similar. Do NOT add color notation to voiceover.
3. "suggestedPosition": Always use "top".
4. "disclaimer": CRITICAL FIELD — ONLY for the LAST scene (outro). You MUST search the ENTIRE script document thoroughly for ANY of the following:
   - Text labeled: "Disclaimer", "Legal Disclaimer", "Risk Warning", "Risk Disclosure", "Terms", "Fine Print", "Important Notice", "Legal Notice", "Regulatory Notice", "Warning"
   - Any block of text that contains legal/regulatory language such as: "past performance", "capital at risk", "not financial advice", "trading involves risk", "losses may exceed", "regulated by", "CFDs", "leveraged products", "retail investors", "complex instruments"
   - Any paragraph that appears at the very end of the document after the main script content
   - Any text that is noticeably smaller, italicized, or formatted differently from the main script
   Extract the COMPLETE disclaimer text verbatim — do NOT summarize or truncate it. Preserve every sentence.
   If you find ANY such text anywhere in the document, you MUST put it in this field.
   For all non-last scenes, always use an empty string "".

If the script doesn't have a clear match for a scene, leave textOnScreen and voiceover as empty strings.

## RULES:
- Timestamps in seconds with 3 decimal places (e.g., 4.567)
- First scene starts at 0.000, last scene ends at ${videoDuration.toFixed(3)}
- Each scene must be at least 1 second long
- Match script entries to scenes in order (scene 1 gets first script entry, etc.)
- If there are more scenes than script entries, leave extra scenes with empty text
- If there are more script entries than scenes, combine them into the last scene`
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
                                    description: { type: "string" },
                                    textOnScreen: { type: "string" },
                                    voiceover: { type: "string" },
                                    suggestedPosition: {
                                        type: "string",
                                        enum: ["top", "center", "bottom"]
                                    },
                                    disclaimer: { type: "string" }
                                },
                                required: ["startTime", "endTime", "description", "textOnScreen", "voiceover", "suggestedPosition", "disclaimer"]
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

        // Convert [red:word] notation → {red:word} for the frontend rich-text renderer
        for (const scene of parsedResult.scenes) {
            if (scene.textOnScreen) {
                scene.textOnScreen = scene.textOnScreen.replace(/\[red:([^\]]+)\]/g, '{red:$1}');
            }
        }

        // Post-processing: Ensure contiguous scenes with no gaps
        const rawScenes = parsedResult.scenes.sort(
            (a: SceneWithScript, b: SceneWithScript) => a.startTime - b.startTime
        );

        const contiguousScenes: SceneWithScript[] = [];
        for (let i = 0; i < rawScenes.length; i++) {
            const scene = { ...rawScenes[i] };

            if (i === 0) {
                scene.startTime = 0;
            } else {
                scene.startTime = contiguousScenes[i - 1].endTime;
            }

            if (scene.endTime <= scene.startTime) {
                scene.endTime = scene.startTime + 0.5;
            }

            contiguousScenes.push(scene);
        }

        if (contiguousScenes.length > 0) {
            contiguousScenes[contiguousScenes.length - 1].endTime = videoDuration;
        }

        // Merge very short scenes (< 0.5s) into neighbors
        const MIN_SCENE_DURATION = 0.5;
        const mergedScenes: SceneWithScript[] = [];

        for (const scene of contiguousScenes) {
            const duration = scene.endTime - scene.startTime;

            if (duration < MIN_SCENE_DURATION && mergedScenes.length > 0) {
                mergedScenes[mergedScenes.length - 1].endTime = scene.endTime;
                // Merge text content if the short scene had content
                if (scene.textOnScreen && !mergedScenes[mergedScenes.length - 1].textOnScreen) {
                    mergedScenes[mergedScenes.length - 1].textOnScreen = scene.textOnScreen;
                    mergedScenes[mergedScenes.length - 1].voiceover = scene.voiceover;
                    mergedScenes[mergedScenes.length - 1].suggestedPosition = scene.suggestedPosition;
                }
                // Always preserve disclaimer from the short scene (outro disclaimer must not be lost)
                if (scene.disclaimer && !mergedScenes[mergedScenes.length - 1].disclaimer) {
                    mergedScenes[mergedScenes.length - 1].disclaimer = scene.disclaimer;
                }
                console.log(`Merged short scene (${duration.toFixed(3)}s) into previous`);
            } else {
                if (mergedScenes.length > 0) {
                    scene.startTime = mergedScenes[mergedScenes.length - 1].endTime;
                }
                mergedScenes.push(scene);
            }
        }

        // Final safety check
        for (let i = 1; i < mergedScenes.length; i++) {
            mergedScenes[i].startTime = mergedScenes[i - 1].endTime;
        }
        if (mergedScenes.length > 0) {
            mergedScenes[0].startTime = 0;
            mergedScenes[mergedScenes.length - 1].endTime = videoDuration;
        }

        console.log(`After processing: ${mergedScenes.length} scenes`);

        // Extract timecodes
        const timecodes = [0, ...mergedScenes.map((s: SceneWithScript) => s.endTime)];
        const uniqueTimecodes = [...new Set(timecodes)].sort((a: number, b: number) => a - b);

        const result: ScriptMatchResponse = {
            timecodes: uniqueTimecodes,
            scenes: mergedScenes,
        };

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } finally {
        // Clean up temp file
        if (tempFilePath) {
            try {
                await Deno.remove(tempFilePath);
                console.log("Temp file cleaned up");
            } catch {
                // Ignore cleanup errors
            }
        }
    }
});
