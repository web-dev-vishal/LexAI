/**
 * Text Extractor
 *
 * Extracts plain text from uploaded files (PDF, DOCX, TXT).
 * The original file is NOT retained after extraction — only the text is stored.
 *
 * Uses:
 *   - pdf-parse for PDF files
 *   - mammoth for DOCX files
 *   - Raw buffer.toString() for plain text
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extract text from a file buffer based on its MIME type.
 * @param {Buffer} buffer - Raw file buffer from multer
 * @param {string} mimeType - e.g., 'application/pdf'
 * @returns {Promise<string>} Extracted text content
 * @throws {Error} If the MIME type is unsupported or extraction fails
 */
async function extractText(buffer, mimeType) {
    switch (mimeType) {
        case 'application/pdf':
            return extractFromPDF(buffer);

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return extractFromDOCX(buffer);

        case 'text/plain':
            return buffer.toString('utf-8').trim();

        default:
            throw new Error(`Unsupported file type: ${mimeType}`);
    }
}

/**
 * Extract text from a PDF buffer.
 */
async function extractFromPDF(buffer) {
    const data = await pdfParse(buffer);
    const text = data.text?.trim();

    if (!text || text.length === 0) {
        throw new Error('PDF appears to be empty or contains only images (no extractable text)');
    }

    return text;
}

/**
 * Extract text from a DOCX buffer.
 */
async function extractFromDOCX(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim();

    if (!text || text.length === 0) {
        throw new Error('DOCX appears to be empty (no extractable text)');
    }

    // Log any conversion warnings (non-fatal)
    if (result.messages?.length > 0) {
        const logger = require('./logger');
        result.messages.forEach((msg) => logger.debug('Mammoth warning:', msg));
    }

    return text;
}

module.exports = { extractText };
