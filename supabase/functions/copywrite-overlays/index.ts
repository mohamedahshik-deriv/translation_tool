// Supabase Edge Function: copywrite-overlays
// Calls Gemini 2.5 Flash acting as a Senior Direct-Response Copywriter
// to identify Hero Words, Trust Anchors, and Visual Strategies for text overlays.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai@1.43.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export interface CopywriteResult {
    original: string;
    heroWord: string;
    trustAnchor: string;
    visualStrategy: string;
    formattedSentence: string; // uses {red:word} markup for hero word
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const body = await req.json();
        const { overlays } = body as { overlays: string[] };

        if (!overlays || !Array.isArray(overlays) || overlays.length === 0) {
            throw new Error("overlays array is required and must not be empty");
        }

        // Strip {color:word} markup from overlay content before sending to Gemini
        const cleanedOverlays = overlays.map((text: string) =>
            text.replace(/\{[^}:]+:([^}]+)\}/g, '$1').trim()
        ).filter((t) => t.length > 0);

        if (cleanedOverlays.length === 0) {
            throw new Error("No non-empty overlay text found after stripping markup");
        }

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const overlaysList = cleanedOverlays
            .map((text: string, i: number) => `${i + 1}. "${text}"`)
            .join('\n');

        const prompt = `Role: Act as a Senior Direct-Response Copywriter with 15 years of experience in the Fintech and Online Brokerage industry. Your expertise is in "Visual Information Architecture"—knowing exactly which words to highlight to trigger a "buy" response while maintaining brand authority.

Task: I will provide you with a list of marketing claims. For each claim, you must:

1. Identify the "Hero Word/Value": The single most persuasive element that should be bolded or enlarged to grab attention.
2. Identify the "Trust Anchor": The word that provides context or legitimacy to the claim.
3. Provide the "Visual Strategy": One concise sentence explaining how to style the sentence (e.g., font size, color contrast) to ensure the user's eye hits the most important part first.
4. Provide the "Formatted Sentence": The original sentence with the Hero Word/Value wrapped in {red:...} markup to signal it should be highlighted.

Goal: Maximize the perceived value of the offer while making the text "scannable" for a high-frequency trader.

Input Sentences:
${overlaysList}

CRITICAL INSTRUCTIONS:
- Return ONLY a raw JSON array. No markdown fences, no explanation text, no code blocks.
- The array must contain exactly ${cleanedOverlays.length} object(s), one per input sentence, in the same order.
- Each object must have these exact keys: "original", "heroWord", "trustAnchor", "visualStrategy", "formattedSentence".
- "formattedSentence" must use {red:WORD} syntax to highlight exactly the heroWord within the original sentence.
- Example: "Leverage up to {red:1:800}"`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                temperature: 0.3,
            },
        });

        const rawText = response.text ?? "";

        // Strip markdown code fences if model wrapped the response
        const cleaned = rawText
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '');

        let results: CopywriteResult[];
        try {
            results = JSON.parse(cleaned);
        } catch {
            console.error("Raw Gemini response:", rawText.substring(0, 500));
            throw new Error(`Failed to parse Gemini response as JSON. Preview: ${rawText.substring(0, 200)}`);
        }

        if (!Array.isArray(results)) {
            throw new Error("Gemini returned a non-array JSON response");
        }

        return new Response(JSON.stringify({ results }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("copywrite-overlays error:", message);
        return new Response(
            JSON.stringify({ error: message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
