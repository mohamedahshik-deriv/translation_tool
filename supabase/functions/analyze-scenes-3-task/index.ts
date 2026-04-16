// Supabase Edge Function: analyze-scenes-3-task
// Receives pre-processed files (stripped locally via /api/process-video):
//   videoUrl  — video with no audio (for Tasks 1 & 3: scene detection + on-screen text)
//   audioUrl  — audio-only MP3 extracted from original (for Task 2: transcription)
//   hasAudio  — whether the original video had an audio track (skips Task 2 if false)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai@1.43.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Scene {
    startTime: number;
    endTime: number;
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
    let audioFilePath = "";

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const { videoUrl, audioUrl, videoDuration, hasAudio = true, scriptText } = await req.json();
        if (!videoUrl) throw new Error("videoUrl is required");
        if (hasAudio && !audioUrl) throw new Error("audioUrl is required when hasAudio is true");

        // Count data rows in the Markdown table (exclude header and separator lines like |---|---|)
        const scriptRowCount: number | undefined = scriptText
            ? (() => {
                const nonSeparatorRows = (scriptText as string)
                    .split('\n')
                    .filter((l: string) => {
                        const trimmed = l.trim();
                        if (!trimmed.startsWith('|')) return false;
                        // Separator rows contain only |, -, : and whitespace
                        const inner = trimmed.replace(/\|/g, '').replace(/[-:\s]/g, '');
                        return inner.length > 0;
                    });
                // nonSeparatorRows includes 1 header row + N data rows → subtract header
                return nonSeparatorRows.length > 1 ? nonSeparatorRows.length - 1 : undefined;
            })()
            : undefined;

        console.log(`Duration: ${videoDuration}s, hasAudio: ${hasAudio}, scriptRows: ${scriptRowCount ?? 'none'}`);

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // ─────────────────────────────────────────────────────────────
        // Download files (audio only if video has an audio track)
        // ─────────────────────────────────────────────────────────────
        console.log("Downloading silent video...");
        const silentResp = await fetch(videoUrl);
        if (!silentResp.ok) throw new Error(`Failed to download silent video: ${silentResp.statusText}`);
        const silentData = new Uint8Array(await silentResp.arrayBuffer());
        silentFilePath = await Deno.makeTempFile({ suffix: "_silent.mp4" });
        await Deno.writeFile(silentFilePath, silentData);
        console.log(`Silent video: ${silentData.length} bytes`);

        if (hasAudio) {
            console.log("Downloading audio...");
            const audioResp = await fetch(audioUrl);
            if (!audioResp.ok) throw new Error(`Failed to download audio: ${audioResp.statusText}`);
            const audioData = new Uint8Array(await audioResp.arrayBuffer());
            audioFilePath = await Deno.makeTempFile({ suffix: "_audio.mp3" });
            await Deno.writeFile(audioFilePath, audioData);
            console.log(`Audio: ${audioData.length} bytes`);
        } else {
            console.log("No audio track — Task 2 will be skipped");
        }

        // ─────────────────────────────────────────────────────────────
        // Upload files to Gemini File API
        // ─────────────────────────────────────────────────────────────
        console.log("Uploading to Gemini File API...");
        const uploadPromises: Promise<Awaited<ReturnType<typeof ai.files.upload>>>[] = [
            ai.files.upload({
                file: silentFilePath,
                config: { mimeType: "video/mp4", displayName: "Silent Video" },
            }),
        ];
        if (hasAudio) {
            uploadPromises.push(
                ai.files.upload({
                    file: audioFilePath,
                    config: { mimeType: "audio/mpeg", displayName: "Audio Track" },
                })
            );
        }
        const uploadResults = await Promise.all(uploadPromises);
        const uploadSilent = uploadResults[0];
        const uploadAudio = hasAudio ? uploadResults[1] : null;
        console.log(`Silent upload: ${uploadSilent.name}${uploadAudio ? `, Audio upload: ${uploadAudio.name}` : ""}`);

        // Poll until files are ACTIVE
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
        if (uploadAudio) pollPromises.push(pollFile(uploadAudio.name!));
        const polled = await Promise.all(pollPromises);

        const fileSilent = polled[0];
        const fileAudio = uploadAudio ? polled[1] : null;

        const silentPart = { fileData: { fileUri: fileSilent.uri!, mimeType: "video/mp4" } };
        const audioPart = fileAudio ? { fileData: { fileUri: fileAudio.uri!, mimeType: "audio/mpeg" } } : null;

        // ─────────────────────────────────────────────────────────────
        // TASKS 1–3: All Gemini calls are independent — run in parallel
        // ─────────────────────────────────────────────────────────────
        console.log("Running Tasks 1–3 in parallel...");

        const task1Promise = ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{
                role: "user",
                parts: [
                    silentPart,
                    {
                        text: `# Video Scene Analysis System

**Role:** Professional Video Metadata Specialist
**Objective:** Perform a frame-accurate analysis of a **${videoDuration}**-second video to identify scene transitions (hard cuts or fades).

## Analysis Rules
* **Transition Detection:** A new scene begins only when a hard cut or fade results in a visually different shot.
* **Duration Floor:** Every scene **must be at least 1.000 second long**. If a visual cut occurs in less than a second, merge it with the adjacent scene to maintain this constraint.
* **Timestamp Precision:** Use seconds with 3 decimal places (e.g., \`5.200\`).
* **Boundary Rules:**
  * The first scene starts at \`0.000\`.
  * The final scene must end at exactly \`${videoDuration.toFixed(3)}\`.

## Script Guidance (Optional)
${scriptText && scriptRowCount ? `
**A script is available for this video.** There are exactly **${scriptRowCount}** rows in the provided script, each representing one scene. Use the visual transitions to align with these **${scriptRowCount}** segments.

---
**SCRIPT START**
${scriptText}
**SCRIPT END**
---
` : `**No script provided.** Analyze the video based purely on visual transitions (hard cuts and fades) to determine the scene changes.`}

## Strict Output Format
Return **only** the timestamp ranges. Do not provide descriptions, labels, or commentary. Use the following structure:

0.000 - [End 1]
[Start 2] - [End 2]
...
[Start N] - ${videoDuration.toFixed(3)}`,
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
                                },
                                required: ["startTime", "endTime"],
                            },
                        },
                    },
                    required: ["scenes"],
                },
            },
        });

        // ─────────────────────────────────────────────────────────────
        // TASK 2: Audio transcription — skipped when video has no audio
        // ─────────────────────────────────────────────────────────────
        type AudioTranscript = {
            hasVoiceover: boolean;
            detectedLanguage: string;
            detectedLanguageName: string;
            speechSegments: { startTime: number; endTime: number; text: string }[];
        };

        const task2Promise: Promise<AudioTranscript> = (!hasAudio || !audioPart)
            ? (console.log("Skipping Task 2 (no audio track)"),
               Promise.resolve({ hasVoiceover: false, detectedLanguage: "", detectedLanguageName: "", speechSegments: [] }))
            : ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: [{
                    role: "user",
                    parts: [
                        audioPart,
                        {
                            text: `Listen to this audio (extracted from a ${videoDuration}-second video), detect the spoken language, and transcribe all speech.
${scriptText ? `\nFor reference, here is the script document — use it to improve transcription accuracy (correct spelling of brand names, proper nouns, financial terms, and domain-specific vocabulary):\n\n---SCRIPT START---\n${scriptText}\n---SCRIPT END---\n` : ''}
Return:
- detectedLanguage: ISO 639-1 code of the spoken language (e.g. "en", "ar", "es", "fr", "pt"). If no speech, return "".
- detectedLanguageName: Full English name of the language (e.g. "English", "Arabic", "Spanish"). If no speech, return "".
- hasVoiceover: true if ANY speech is detected, false otherwise.
- speechSegments: for each spoken segment return startTime (seconds, 3 decimal places), endTime (seconds, 3 decimal places), and text (exact words spoken, in the original language).

If there is no speech at all, return hasVoiceover: false, detectedLanguage: "", detectedLanguageName: "", and an empty speechSegments array.`,
                        },
                    ],
                }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "object",
                        properties: {
                            hasVoiceover: { type: "boolean" },
                            detectedLanguage: { type: "string" },
                            detectedLanguageName: { type: "string" },
                            speechSegments: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        startTime: { type: "number" },
                                        endTime: { type: "number" },
                                        text: { type: "string" },
                                    },
                                    required: ["startTime", "endTime", "text"],
                                },
                            },
                        },
                        required: ["hasVoiceover", "detectedLanguage", "detectedLanguageName", "speechSegments"],
                    },
                },
            }).then((r) => JSON.parse(r.text!) as AudioTranscript);

        // ─────────────────────────────────────────────────────────────
        // TASK 3: On-screen text detection — silent video (visual only)
        // Deduplicated: same text repeated across frames is returned once.
        // ─────────────────────────────────────────────────────────────
        const task3Promise = ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{
                role: "user",
                parts: [
                    silentPart,
                    {
                        text: `Watch this ${videoDuration}-second video and extract all text that appears VISUALLY on screen.

Include: titles, captions, lower-thirds, graphics, subtitles, text overlays, on-screen numbers.
For each UNIQUE text element return:
- startTime: when the text FIRST appears (seconds, 3 decimal places)
- endTime: when the text LAST disappears (seconds, 3 decimal places)
- text: the exact text as written on screen, in sentence case

DEDUPLICATION: If the same text appears multiple times or stays on screen continuously, return it ONLY ONCE using its first appearance and last disappearance time. Do NOT create separate entries for the same text.

WORD COLORING: If one word/number visually stands out (different color, larger, bold), wrap it with {red:word} notation. Maximum one word per text element.

If no text appears at all, return an empty textSegments array.
Do NOT transcribe spoken audio — only read text that is visually displayed.`,
                    },
                ],
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        textSegments: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    startTime: { type: "number" },
                                    endTime: { type: "number" },
                                    text: { type: "string" },
                                },
                                required: ["startTime", "endTime", "text"],
                            },
                        },
                    },
                    required: ["textSegments"],
                },
            },
        });

        // ─── Await all 3 tasks in parallel ───────────────────────────
        const [res1, audioTranscript, res3Raw] = await Promise.all([
            task1Promise,
            task2Promise,
            task3Promise,
        ]);
        console.log(`Task 1 complete: ${JSON.parse(res1.text!).scenes?.length ?? 0} scenes detected`);
        console.log(`Task 2 complete: hasVoiceover=${audioTranscript.hasVoiceover}, lang=${audioTranscript.detectedLanguage} (${audioTranscript.detectedLanguageName}), ${audioTranscript.speechSegments?.length ?? 0} segments`);
        console.log(`Task 3 complete: ${JSON.parse(res3Raw.text!).textSegments?.length ?? 0} on-screen text segments`);

        const sceneData = JSON.parse(res1.text!);
        const textData = JSON.parse(res3Raw.text!);

        // Post-process Task 1: sort → make contiguous → merge short scenes
        const rawScenes = (sceneData.scenes as { startTime: number; endTime: number }[])
            .sort((a, b) => a.startTime - b.startTime);

        const contiguousScenes: { startTime: number; endTime: number }[] = [];
        for (let i = 0; i < rawScenes.length; i++) {
            const scene = { ...rawScenes[i] };
            scene.startTime = i === 0 ? 0 : contiguousScenes[i - 1].endTime;
            if (scene.endTime <= scene.startTime) scene.endTime = scene.startTime + 0.5;
            contiguousScenes.push(scene);
        }
        if (contiguousScenes.length > 0) {
            contiguousScenes[contiguousScenes.length - 1].endTime = videoDuration;
        }

        const MIN_SCENE_DURATION = 0.5;
        const mergedBase: { startTime: number; endTime: number }[] = [];
        for (const scene of contiguousScenes) {
            const dur = scene.endTime - scene.startTime;
            if (dur < MIN_SCENE_DURATION && mergedBase.length > 0) {
                mergedBase[mergedBase.length - 1].endTime = scene.endTime;
                console.log(`Merged short scene (${dur.toFixed(3)}s) into previous`);
            } else {
                if (mergedBase.length > 0) scene.startTime = mergedBase[mergedBase.length - 1].endTime;
                mergedBase.push(scene);
            }
        }
        for (let i = 1; i < mergedBase.length; i++) mergedBase[i].startTime = mergedBase[i - 1].endTime;
        if (mergedBase.length > 0) {
            mergedBase[0].startTime = 0;
            mergedBase[mergedBase.length - 1].endTime = videoDuration;
        }

        // ─────────────────────────────────────────────────────────────
        // Aggregate: map speech and text segments onto scene boundaries
        // Each speech segment is assigned exclusively to the scene it
        // overlaps the most with, preventing sentences from bleeding into
        // the wrong scene when Gemini timestamps straddle a cut.
        // ─────────────────────────────────────────────────────────────
        const speechSegments = audioTranscript.speechSegments ?? [];
        const textSegments: { startTime: number; endTime: number; text: string }[] =
            textData.textSegments ?? [];

        // Pre-assign each speech segment to its best-matching scene (max overlap)
        const speechSceneMap = new Map<number, number>(); // segmentIndex → sceneIndex
        speechSegments.forEach((seg: { startTime: number; endTime: number; text: string }, segIdx: number) => {
            let maxOverlap = 0;
            let bestSceneIdx = -1;
            mergedBase.forEach((scene: { startTime: number; endTime: number }, sceneIdx: number) => {
                const overlapStart = Math.max(seg.startTime, scene.startTime);
                const overlapEnd = Math.min(seg.endTime, scene.endTime);
                const overlap = overlapEnd - overlapStart;
                if (overlap > maxOverlap) {
                    maxOverlap = overlap;
                    bestSceneIdx = sceneIdx;
                }
            });
            if (bestSceneIdx >= 0) speechSceneMap.set(segIdx, bestSceneIdx);
        });

        const mergedScenes: Scene[] = mergedBase.map((scene, sceneIdx) => {
            const spokenParts = speechSegments
                .filter((_: unknown, segIdx: number) => speechSceneMap.get(segIdx) === sceneIdx)
                .map((s: { text: string }) => s.text.trim())
                .filter(Boolean);

            const textParts = textSegments
                .filter((t) => t.startTime < scene.endTime && t.endTime > scene.startTime)
                .map((t) => t.text.trim())
                .filter(Boolean);

            const uniqueTextParts = textParts.filter((t, i, arr) => i === 0 || t !== arr[i - 1]);

            return {
                startTime: scene.startTime,
                endTime: scene.endTime,
                spokenText: spokenParts.join(" "),
                textOnScreen: uniqueTextParts.join(" | "),
            };
        });

        console.log(`Final: ${mergedScenes.length} scenes after aggregation`);

        const timecodes = [0, ...mergedScenes.map((s) => s.endTime)];
        const uniqueTimecodes = [...new Set(timecodes)].sort((a, b) => a - b);

        const result: SceneAnalysisResponse = {
            timecodes: uniqueTimecodes,
            scenes: mergedScenes,
            hasVoiceover: audioTranscript.hasVoiceover === true,
            detectedLanguage: audioTranscript.detectedLanguage ?? "",
            detectedLanguageName: audioTranscript.detectedLanguageName ?? "",
        };

        // Cleanup Gemini uploads
        try { await ai.files.delete({ name: uploadSilent.name! }); } catch { /* ignore */ }
        if (uploadAudio) try { await ai.files.delete({ name: uploadAudio.name! }); } catch { /* ignore */ }

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
        if (audioFilePath) try { await Deno.remove(audioFilePath); } catch { /* ignore */ }
    }
});
