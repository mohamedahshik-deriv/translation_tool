/**
 * Script Parser Utility
 * Extracts plain text from TXT, PDF, and DOCX files on the client side.
 * For DOCX files that contain a structured table, also parses column data
 * (Voiceover | Text on Visual | Visual) into ScriptTableRow[].
 */

import { ScriptFileType, ScriptTableRow } from '@/types';

/**
 * Detect the file type from a File object
 */
export function detectScriptFileType(file: File): ScriptFileType | null {
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();

    if (name.endsWith('.txt') || type === 'text/plain') return 'txt';
    if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
    if (
        name.endsWith('.docx') ||
        type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
        return 'docx';

    return null;
}

/**
 * Extract plain text from a TXT file
 */
async function extractFromTxt(file: File): Promise<string> {
    return await file.text();
}

/**
 * Extract plain text from a PDF file using pdfjs-dist
 */
async function extractFromPdf(file: File): Promise<string> {
    // Dynamically import pdfjs-dist to avoid SSR issues
    const pdfjsLib = await import('pdfjs-dist');

    // Set the worker source - use the bundled worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ');
        textParts.push(pageText);
    }

    return textParts.join('\n\n');
}

/**
 * Extract plain text from a DOCX file using mammoth
 */
async function extractFromDocx(file: File): Promise<string> {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

/**
 * Parse a DOCX table into structured ScriptTableRow[].
 *
 * Expected column order (case-insensitive header matching):
 *   Column 1: Voiceover
 *   Column 2: Text on Visual / Text on Screen / Text Overlay / Caption
 *   Column 3: Visual / Scene / Description  (optional — stored but not used)
 *
 * Returns null if no table is detected in the document.
 */
export async function parseDocxTable(file: File): Promise<ScriptTableRow[] | null> {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();

    // Convert to HTML to preserve table structure
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

    // Use DOMParser (available in browser) to walk the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tables = doc.querySelectorAll('table');

    if (tables.length === 0) return null;

    // Use the first table found
    const table = tables[0];
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) return null; // Need at least a header + one data row

    // Detect column indices from header row
    const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(
        (td) => td.textContent?.trim().toLowerCase() ?? ''
    );

    const voiceoverKeywords = ['voiceover', 'voice over', 'vo', 'narration', 'script', 'spoken'];
    const textOnScreenKeywords = ['text on visual', 'text on screen', 'text overlay', 'caption', 'title', 'lower third', 'on screen text', 'overlay'];
    const visualKeywords = ['visual', 'scene', 'description', 'visual description', 'shot'];

    const findCol = (keywords: string[]) =>
        headerCells.findIndex((h) => keywords.some((k) => h.includes(k)));

    let voiceoverCol = findCol(voiceoverKeywords);
    let textOnScreenCol = findCol(textOnScreenKeywords);
    let visualCol = findCol(visualKeywords);

    // If header detection fails, fall back to positional: col 0 = voiceover, col 1 = text, col 2 = visual
    const hasHeaders = voiceoverCol !== -1 || textOnScreenCol !== -1;
    if (!hasHeaders) {
        voiceoverCol = 0;
        textOnScreenCol = 1;
        visualCol = 2;
    }

    const dataRows = hasHeaders ? rows.slice(1) : rows;
    const result: ScriptTableRow[] = [];

    for (const row of dataRows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length === 0) continue;

        const getCellText = (colIdx: number) =>
            colIdx >= 0 && colIdx < cells.length
                ? (cells[colIdx].textContent?.trim() ?? '')
                : '';

        const voiceover = getCellText(voiceoverCol);
        const textOnScreen = getCellText(textOnScreenCol);
        const visual = getCellText(visualCol);

        // Skip completely empty rows
        if (!voiceover && !textOnScreen && !visual) continue;

        result.push({ voiceover, textOnScreen, visual });
    }

    return result.length > 0 ? result : null;
}

/**
 * Main function: extract plain text from any supported script file
 */
export async function extractScriptText(file: File): Promise<string> {
    const fileType = detectScriptFileType(file);

    if (!fileType) {
        throw new Error(
            `Unsupported file type: ${file.name}. Please upload a TXT, PDF, or DOCX file.`
        );
    }

    switch (fileType) {
        case 'txt':
            return extractFromTxt(file);
        case 'pdf':
            return extractFromPdf(file);
        case 'docx':
            return extractFromDocx(file);
        default:
            throw new Error(`Unsupported file type: ${fileType}`);
    }
}

/**
 * Validate that a file is a supported script format
 */
export function isValidScriptFile(file: File): boolean {
    return detectScriptFileType(file) !== null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extract disclaimer text from a script's raw text content.
 * Looks for common disclaimer/legal notice patterns and returns the full text block.
 * Returns empty string if no disclaimer is found.
 */
export function extractDisclaimerFromScript(scriptText: string): string {
    if (!scriptText) return '';

    // Common disclaimer section header patterns (case-insensitive)
    const headerPatterns = [
        /disclaimer[:\s]/i,
        /legal\s+disclaimer[:\s]/i,
        /risk\s+warning[:\s]/i,
        /risk\s+disclosure[:\s]/i,
        /important\s+notice[:\s]/i,
        /legal\s+notice[:\s]/i,
        /regulatory\s+notice[:\s]/i,
        /terms\s+and\s+conditions[:\s]/i,
        /fine\s+print[:\s]/i,
    ];

    // Legal content keywords — if a paragraph contains several of these, it's likely a disclaimer
    const legalKeywords = [
        'past performance', 'capital at risk', 'not financial advice',
        'trading involves risk', 'losses may exceed', 'regulated by',
        'cfds', 'leveraged products', 'retail investors', 'complex instruments',
        'financial conduct authority', 'fca', 'cysec', 'mifid',
        'no guarantee', 'investment risk', 'may lose', 'speculative',
        'not suitable', 'seek independent', 'professional advice',
    ];

    const lines = scriptText.split('\n');

    // Strategy 1: Find a labeled disclaimer section header and grab everything after it
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (headerPatterns.some(p => p.test(line))) {
            // Collect all lines from this header to the end (or next major section)
            const disclaimerLines: string[] = [];
            // Include the header line itself if it has content beyond the label
            const headerContent = line.replace(/^(disclaimer|legal\s+disclaimer|risk\s+warning|risk\s+disclosure|important\s+notice|legal\s+notice|regulatory\s+notice|terms\s+and\s+conditions|fine\s+print)[:\s]*/i, '').trim();
            if (headerContent) disclaimerLines.push(headerContent);

            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j].trim();
                // Stop if we hit another major section header (all-caps line or new labeled section)
                if (nextLine && /^[A-Z\s]{5,}$/.test(nextLine) && !disclaimerLines.length) break;
                disclaimerLines.push(nextLine);
            }

            const result = disclaimerLines.join(' ').replace(/\s+/g, ' ').trim();
            if (result.length > 20) return result;
        }
    }

    // Strategy 2: Find paragraphs containing multiple legal keywords
    const paragraphs = scriptText.split(/\n\s*\n/);
    for (const para of paragraphs) {
        const lower = para.toLowerCase();
        const matchCount = legalKeywords.filter(kw => lower.includes(kw)).length;
        if (matchCount >= 2) {
            const raw = para.replace(/\s+/g, ' ').trim();
            return raw.replace(/^(legal\s+disclaimer|risk\s+warning|risk\s+disclosure|important\s+notice|legal\s+notice|regulatory\s+notice|terms\s+and\s+conditions|fine\s+print|disclaimer)\s*[:\-–—]\s*/i, '').trim();
        }
    }

    // Strategy 3: Check the last paragraph — disclaimers often appear at the very end
    const lastParagraph = paragraphs[paragraphs.length - 1]?.trim();
    if (lastParagraph && lastParagraph.length > 50) {
        const lower = lastParagraph.toLowerCase();
        if (legalKeywords.some(kw => lower.includes(kw))) {
            const raw = lastParagraph.replace(/\s+/g, ' ').trim();
            return raw.replace(/^(legal\s+disclaimer|risk\s+warning|risk\s+disclosure|important\s+notice|legal\s+notice|regulatory\s+notice|terms\s+and\s+conditions|fine\s+print|disclaimer)\s*[:\-–—]\s*/i, '').trim();
        }
    }

    return '';
}
