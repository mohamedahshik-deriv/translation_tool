// Supabase Edge Function: translate
// This function uses DeepL API to translate text content

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranslationRequest {
    texts: string[];
    sourceLang: string;
    targetLangs: string[];
}

interface TranslationResponse {
    translations: Record<string, string[]>;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const DEEPL_API_KEY = Deno.env.get("DEEPL_API_KEY");
        if (!DEEPL_API_KEY) {
            throw new Error("DEEPL_API_KEY not configured");
        }

        const { texts, sourceLang, targetLangs }: TranslationRequest = await req.json();

        if (!texts || !texts.length || !targetLangs || !targetLangs.length) {
            throw new Error("texts and targetLangs are required");
        }

        const translations: Record<string, string[]> = {};

        // Translate to each target language
        for (const targetLang of targetLangs) {
            // Skip if source and target are the same
            if (targetLang.toUpperCase() === sourceLang.toUpperCase()) {
                translations[targetLang] = texts;
                continue;
            }

            const response = await fetch("https://api-free.deepl.com/v2/translate", {
                method: "POST",
                headers: {
                    "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: texts,
                    source_lang: sourceLang.toUpperCase(),
                    target_lang: targetLang.toUpperCase(),
                    preserve_formatting: true,
                    context: "Short marketing tagline or on-screen text for a financial trading video. Translate concisely and directly — do not add extra words, explanations, or expand the phrase.",
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`DeepL API error for ${targetLang}:`, errorText);

                // If free API fails, try the paid API endpoint
                const paidResponse = await fetch("https://api.deepl.com/v2/translate", {
                    method: "POST",
                    headers: {
                        "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        text: texts,
                        source_lang: sourceLang.toUpperCase(),
                        target_lang: targetLang.toUpperCase(),
                        preserve_formatting: true,
                        context: "Short marketing tagline or on-screen text for a financial trading video. Translate concisely and directly — do not add extra words, explanations, or expand the phrase.",
                    }),
                });

                if (!paidResponse.ok) {
                    throw new Error(`DeepL translation failed for ${targetLang}: ${errorText}`);
                }

                const paidData = await paidResponse.json();
                translations[targetLang] = paidData.translations.map((t: { text: string }) => t.text);
                continue;
            }

            const data = await response.json();
            translations[targetLang] = data.translations.map((t: { text: string }) => t.text);
        }

        const result: TranslationResponse = { translations };

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error) {
        console.error("Error in translate:", error);
        return new Response(
            JSON.stringify({ error: (error as Error).message || "Translation failed" }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
