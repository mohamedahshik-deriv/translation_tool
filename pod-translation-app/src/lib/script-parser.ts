/**
 * Script Parser Utility
 * Extracts plain text from TXT, PDF, and DOCX files on the client side.
 */

import { ScriptFileType } from '@/types';

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
    // Dynamically import mammoth to avoid SSR issues
    const mammoth = await import('mammoth');

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
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
