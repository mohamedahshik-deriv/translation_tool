// Supabase Edge Function: generate-background-music
// Generates background music using the ElevenLabs /v1/music/detailed API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MusicRequest {
    prompt: string;
    music_length_ms: number;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLAB_API_KEY");
        if (!ELEVENLABS_API_KEY) {
            throw new Error("ELEVENLAB_API_KEY not configured");
        }

        const body: MusicRequest = await req.json();
        const { prompt, music_length_ms } = body;

        if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
            throw new Error("prompt is required and must be a non-empty string");
        }

        if (
            !music_length_ms ||
            typeof music_length_ms !== "number" ||
            music_length_ms <= 0
        ) {
            throw new Error("music_length_ms is required and must be a positive number");
        }

        const elevenLabsResponse = await fetch(
            "https://api.elevenlabs.io/v1/music/detailed",
            {
                method: "POST",
                headers: {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    music_length_ms,
                }),
            }
        );

        if (!elevenLabsResponse.ok) {
            const errorText = await elevenLabsResponse.text();
            throw new Error(`ElevenLabs music generation failed: ${errorText}`);
        }

        const audioBuffer = await elevenLabsResponse.arrayBuffer();

        return new Response(audioBuffer, {
            headers: {
                ...corsHeaders,
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.byteLength.toString(),
            },
            status: 200,
        });
    } catch (error) {
        console.error("Error in generate-background-music:", error);
        return new Response(
            JSON.stringify({
                error: (error as Error).message || "Music generation failed",
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
