/**
 * Text Extractor
 *
 * Extracts plain text from uploaded files (PDF, DOCX, TXT).
 * The original file is NOT retained after extraction — only the
 * extracted text is stored in MongoDB.
 *
 * Supported MIME types:
 *   - application/pdf → pdf-parse
 *   - application/vnd.openxmlformats-officedocument.wordprocessingml.document → mammoth
 *   - text/plain → raw string decode
 *
 * All other types are rejected with an error.
 */

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import logger from './logger.js';

/**
 * Extract text from a file buffer based on its MIME type.
 *
 * @param {Buffer} buffer - Raw file buffer from multer (in-memory upload)
 * @param {string} mimeType - MIME type of the uploaded file
 * @returns {Promise<string>} Extracted plain text content
 * @throws {Error} If the MIME type is unsupported or extraction fails
 */
export async function extractText(buffer, mimeType) {
    switch (mimeType) {
        case 'application/pdf':
            return extractFromPDF(buffer);

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return extractFromDOCX(buffer);

        case 'text/plain':
            // Plain text files just need encoding — no parsing library needed
            return buffer.toString('utf-8').trim();

        default:
            // Reject anything we can't extract text from (e.g., images, spreadsheets)
            throw new Error(`Unsupported file type: ${mimeType}`);
    }
}

/**
 * Extract text from a PDF buffer.
 * Throws if the PDF is empty or image-only (scanned docs without OCR).
 */
async function extractFromPDF(buffer) {
    const data = await pdfParse(buffer);
    const text = data.text?.trim();

    if (!text || text.length === 0) {
        // This happens with scanned PDFs — the user needs to OCR them first
        throw new Error('PDF appears to be empty or contains only images (no extractable text)');
    }

    return text;
}

/**
 * Extract text from a DOCX buffer.
 * Logs any non-fatal conversion warnings from mammoth (e.g., unsupported formatting).
 */
async function extractFromDOCX(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim();

    if (!text || text.length === 0) {
        throw new Error('DOCX appears to be empty (no extractable text)');
    }

    // Log any conversion warnings — these are non-fatal but useful for debugging
    if (result.messages?.length > 0) {
        result.messages.forEach((msg) => logger.debug('Mammoth warning:', msg));
    }

    return text;
}
