// Supabase Edge Function: generate-speech
// This function uses ElevenLabs API to generate speech from text using a cloned voice

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Language code mapping for ElevenLabs
const LANGUAGE_MAP: Record<string, string> = {
    EN: "en",
    ES: "es",
    PT: "pt",
    AR: "ar",
    FR: "fr",
};

interface SpeechRequest {
    text: string;
    voiceId: string;
    languageCode: string;
    modelId?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
        if (!ELEVENLABS_API_KEY) {
            throw new Error("ELEVENLABS_API_KEY not configured");
        }

        const { text, voiceId, languageCode, modelId }: SpeechRequest = await req.json();

        if (!text || !voiceId) {
            throw new Error("text and voiceId are required");
        }

        const elevenLabsLang = LANGUAGE_MAP[languageCode.toUpperCase()] || "en";

        // Generate speech using ElevenLabs
        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
                method: "POST",
                headers: {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                body: JSON.stringify({
                    text,
                    model_id: modelId || "eleven_multilingual_v2",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.8,
                        style: 0.0,
                        use_speaker_boost: true,
                    },
                    language_code: elevenLabsLang,
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs TTS failed: ${errorText}`);
        }

        // Return the audio as a binary response
        const audioBuffer = await response.arrayBuffer();

        return new Response(audioBuffer, {
            headers: {
                ...corsHeaders,
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.byteLength.toString(),
            },
            status: 200,
        });
    } catch (error) {
        console.error("Error in generate-speech:", error);
        return new Response(
            JSON.stringify({ error: (error as Error).message || "Speech generation failed" }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
