// Supabase Edge Function: copywrite-translate-markup
// Uses Gemini 2.5 Flash to:
//   1. Transfer {red:PHRASE} markup from English source text to translations
//   2. Insert non-breaking spaces (\u00A0) in Arabic translations between words
//      that should never be split across lines (numbers+units, preposition+object, etc.)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai@1.43.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

interface MarkupPair {
    layerId: string;
    source: string;      // English with {red:PHRASE} markup
    translation: string; // Target-language plain text
}

interface MarkupRequest {
    pairs: MarkupPair[];
    targetLang: string;  // e.g. "AR", "ES" — helps Gemini understand the script
}

interface MarkupResult {
    layerId: string;
    marked: string;      // Translation with {red:...} applied + \u00A0 for Arabic
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    try {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const { pairs, targetLang }: MarkupRequest = await req.json();

        if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
            throw new Error("pairs array is required and must not be empty");
        }
        if (!targetLang) {
            throw new Error("targetLang is required");
        }

        const isArabicTarget = targetLang.toUpperCase() === 'AR';

        // Pairs that need {red:...} markup transfer
        const markupPairs = pairs.filter(p =>
            p.source && p.translation && /\{red:[^}]+\}/.test(p.source)
        );

        // Arabic pairs that need non-breaking space insertion (exclude ones already in markupPairs)
        const markupLayerIds = new Set(markupPairs.map(p => p.layerId));
        const arabicOnlyPairs = isArabicTarget
            ? pairs.filter(p =>
                p.translation &&
                ARABIC_RE.test(p.translation) &&
                !markupLayerIds.has(p.layerId)
            )
            : [];

        const needsGemini = markupPairs.length > 0 || arabicOnlyPairs.length > 0;

        if (!needsGemini) {
            return new Response(
                JSON.stringify({ results: pairs.map(p => ({ layerId: p.layerId, marked: p.translation })) }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // Build combined list: markup pairs first, then arabic-only pairs
        const allGeminiPairs = [...markupPairs, ...arabicOnlyPairs];

        const pairsList = allGeminiPairs
            .map((p, i) => {
                const hasMarkup = markupLayerIds.has(p.layerId);
                const tasks: string[] = [];
                if (hasMarkup) tasks.push("apply {red:...} markup");
                if (isArabicTarget && ARABIC_RE.test(p.translation)) tasks.push("apply \\u00A0 non-breaking spaces");
                return `${i + 1}. Source: "${p.source}"\n   Translation (${targetLang}): "${p.translation}"\n   Tasks: ${tasks.join(" + ")}`;
            })
            .join('\n');

        const nbspInstructions = isArabicTarget ? `

ARABIC NON-BREAKING SPACES (applies to ALL Arabic translations):
For Arabic text, replace regular spaces with the literal \\u00A0 character (non-breaking space)
between word groups that should NEVER be visually separated onto different lines. This includes:
- Numbers and their currency/unit words: "18.42 دولار" → "18.42\\u00A0دولار"
- Prepositions and their objects: "من 18.42" → "من\\u00A018.42", "إلى 1:800" → "إلى\\u00A01:800"
- Adjective-noun pairs that form a single concept: "رافعة مالية" → "رافعة\\u00A0مالية"
- Compound proper nouns or technical terms
- IMPORTANT: Only join groups of 2-3 words. Do NOT join the entire sentence with \\u00A0.
  The goal is to prevent awkward line breaks, not to prevent ALL line breaks.
- IMPORTANT: Output the actual Unicode character \\u00A0 (code point 00A0), NOT the literal
  text "\\u00A0". In JSON this is encoded as the character itself between words.` : '';

        const prompt = `You process translated marketing text for video overlays.
${markupPairs.length > 0 ? `
TASK 1 — RED MARKUP TRANSFER:
The {red:...} wraps the most important marketing word or value in the English text.
Find the EXACT equivalent in each translation and wrap it with {red:...}.

Markup rules:
- Numbers, codes, and symbols (e.g. 1:800, $18.42, USDT, USDC) typically appear identically — wrap them directly
- If a phrase was translated into the target language, find and wrap the semantic equivalent
- If multiple words are grouped (e.g. "{red:USDT, USDC, LTC}"), wrap the whole corresponding group
- Do NOT add, remove, or change any translated text — only ADD the {red:...} wrapper
- If you cannot confidently identify the equivalent, return the translation UNCHANGED` : ''}
${nbspInstructions}

Examples:
Source: "Leverage up to {red:1:800}"
Translation (AR): "رافعة مالية تصل إلى 1:800"
Result (markup + \\u00A0): "رافعة\\u00A0مالية تصل إلى\\u00A0{red:1:800}"

Source: "{red:USDT, USDC, LTC} and more"
Translation (AR): "USDT، USDC، LTC والمزيد"
Result (markup + \\u00A0): "{red:USDT،\\u00A0USDC،\\u00A0LTC} والمزيد"

Source: "Spreads from {red:$18.42}"
Translation (AR): "فروق الاسعار من 18.42 دولار"
Result (markup + \\u00A0): "فروق الاسعار من\\u00A0{red:18.42}\\u00A0دولار"

Source: "Spreads from {red:$18.42}"
Translation (ES): "Spreads desde 18,42"
Result (markup only): "Spreads desde {red:18,42}"

Source: "Trade with {red:zero commission}"
Translation (ES): "Opera con cero comisiones"
Result (markup only): "Opera con {red:cero comisiones}"

Source: "Start trading today"
Translation (AR): "ابدأ التداول اليوم"
Result (\\u00A0 only): "ابدأ التداول اليوم"

- Return ONLY a raw JSON array — no markdown, no explanation, no code fences
- The \\u00A0 characters in your JSON output must be actual Unicode non-breaking space characters

Input pairs:
${pairsList}

Return a JSON array with exactly ${allGeminiPairs.length} string(s) in the same order:
["processed text 1", "processed text 2", ...]`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { temperature: 0.1 },
        });

        const rawText = response.text ?? "";

        // Strip markdown code fences if model wrapped the response
        const cleaned = rawText
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "");

        let geminiResults: string[];
        try {
            geminiResults = JSON.parse(cleaned);
        } catch {
            console.error("Raw Gemini response:", rawText.substring(0, 500));
            throw new Error(`Failed to parse Gemini response as JSON. Preview: ${rawText.substring(0, 200)}`);
        }

        if (!Array.isArray(geminiResults)) {
            throw new Error("Gemini returned a non-array JSON response");
        }

        // Gemini may return literal "\u00a0" as text instead of the actual character —
        // normalise any escaped sequences to real non-breaking spaces.
        geminiResults = geminiResults.map(s =>
            typeof s === 'string' ? s.replace(/\\u00[Aa]0/g, '\u00A0') : s
        );

        // Build layerId → processed text mapping
        const resultMap = new Map<string, string>();
        allGeminiPairs.forEach((p, i) => {
            const processed = typeof geminiResults[i] === 'string' ? geminiResults[i] : null;
            if (processed) resultMap.set(p.layerId, processed);
        });

        const finalResults: MarkupResult[] = pairs.map(p => ({
            layerId: p.layerId,
            marked: resultMap.get(p.layerId) ?? p.translation,
        }));

        return new Response(JSON.stringify({ results: finalResults }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("copywrite-translate-markup error:", message);
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
