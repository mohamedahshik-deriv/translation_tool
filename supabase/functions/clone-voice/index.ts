// Supabase Edge Function: clone-voice
// This function uses ElevenLabs API to clone a voice from an audio sample

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
        if (!ELEVENLABS_API_KEY) {
            throw new Error("ELEVENLABS_API_KEY not configured");
        }

        // Get the form data with audio file
        const formData = await req.formData();
        const audioFile = formData.get("audio") as File;
        const voiceName = formData.get("name") as string || "Cloned Voice";

        if (!audioFile) {
            throw new Error("Audio file is required for voice cloning");
        }

        // Create voice clone via ElevenLabs API
        const cloneFormData = new FormData();
        cloneFormData.append("name", voiceName);
        cloneFormData.append("description", "Voice cloned for POD Translation Automation");
        cloneFormData.append("files", audioFile);

        const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
            method: "POST",
            headers: {
                "xi-api-key": ELEVENLABS_API_KEY,
            },
            body: cloneFormData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs voice cloning failed: ${errorText}`);
        }

        const data = await response.json();

        return new Response(
            JSON.stringify({
                voiceId: data.voice_id,
                name: voiceName,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (error) {
        console.error("Error in clone-voice:", error);
        return new Response(
            JSON.stringify({ error: (error as Error).message || "Voice cloning failed" }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
