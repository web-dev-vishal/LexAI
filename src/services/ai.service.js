/**
 * AI Service
 *
 * Handles all communication with OpenRouter API for LLM-based analysis.
 * Implements:
 *   - Structured prompt building for contract analysis
 *   - Fallback model chain (primary → fallback)
 *   - Response validation and parsing
 *   - Retry with exponential backoff on rate limits
 */

const axios = require('axios');
const logger = require('../utils/logger');

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;

/**
 * Analyze a contract using OpenRouter LLM.
 * Tries the primary model first; falls back if it fails.
 *
 * @param {string} content - Full contract text
 * @returns {Promise<object>} Structured analysis result
 */
async function analyzeContract(content) {
    const primaryModel = process.env.AI_PRIMARY_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
    const fallbackModel = process.env.AI_FALLBACK_MODEL || 'mistralai/mistral-7b-instruct:free';

    // Try primary model
    try {
        const result = await callOpenRouter(content, primaryModel);
        return { ...result, aiModel: primaryModel };
    } catch (err) {
        logger.warn(`Primary model failed (${primaryModel}): ${err.message}. Trying fallback...`);
    }

    // Try fallback model
    try {
        const result = await callOpenRouter(content, fallbackModel);
        return { ...result, aiModel: fallbackModel };
    } catch (err) {
        logger.error(`Fallback model also failed (${fallbackModel}): ${err.message}`);
        throw new Error(`AI analysis failed with both models. Last error: ${err.message}`);
    }
}

/**
 * Call OpenRouter API with retry logic.
 */
async function callOpenRouter(content, model, attempt = 1) {
    const startTime = Date.now();

    try {
        const response = await axios.post(
            `${process.env.OPENROUTER_BASE_URL}/chat/completions`,
            {
                model,
                messages: [
                    { role: 'system', content: buildSystemPrompt() },
                    { role: 'user', content: buildUserPrompt(content) },
                ],
                temperature: 0.2,
                max_tokens: 4096,
                response_format: { type: 'json_object' },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://lexai.io',
                    'X-Title': 'LexAI Contract Analysis',
                },
                timeout: 60000,
            }
        );

        const rawContent = response.data?.choices?.[0]?.message?.content;
        if (!rawContent) throw new Error('Empty response from AI model');

        const parsed = parseAIResponse(rawContent);
        parsed.tokensUsed = response.data?.usage?.total_tokens || 0;
        parsed.processingTimeMs = Date.now() - startTime;

        return parsed;
    } catch (err) {
        // Retry on rate limit (429) or server errors (500+)
        const status = err.response?.status;
        if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            logger.warn(`OpenRouter ${status} error. Retry ${attempt}/${MAX_RETRIES} in ${delay}ms`);
            await sleep(delay);
            return callOpenRouter(content, model, attempt + 1);
        }

        throw err;
    }
}

/**
 * Build the system prompt for contract analysis.
 */
function buildSystemPrompt() {
    return `You are a legal contract analyst. Your job is to analyze contracts and return structured JSON. Never give legal advice. Always label output as "AI analysis, not legal advice." Always return valid JSON.`;
}

/**
 * Build the user prompt with the contract content.
 */
function buildUserPrompt(content) {
    // Truncate very long contracts to avoid token limits
    const truncated = content.length > 15000 ? content.substring(0, 15000) + '\n\n[Content truncated for analysis]' : content;

    return `Analyze the following contract and return ONLY a JSON object with this exact structure:
{
  "summary": "A single plain-English paragraph summarizing the contract, its key risk areas, and what the signing party should be aware of. This is NOT a bullet list.",
  "riskScore": <number 0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "clauses": [
    {
      "title": "Clause title",
      "content": "Relevant clause text",
      "flag": "<green|yellow|red>",
      "explanation": "Plain English explanation of what this clause means",
      "suggestion": "What the signing party should negotiate or watch out for"
    }
  ],
  "obligations": {
    "yourObligations": ["List of obligations for the signing party"],
    "otherPartyObligations": ["List of obligations for the other party"]
  },
  "keyDates": {
    "effectiveDate": "YYYY-MM-DD or empty string",
    "expiryDate": "YYYY-MM-DD or empty string",
    "renewalDate": "YYYY-MM-DD or empty string",
    "noticePeriod": "e.g. 30 days or empty string"
  },
  "parties": [
    { "name": "Party name", "role": "Party role (e.g. Vendor, Client)" }
  ]
}

Contract text:
${truncated}`;
}

/**
 * Parse and validate the AI's JSON response.
 */
function parseAIResponse(rawContent) {
    let parsed;

    try {
        // Try direct JSON parse
        parsed = JSON.parse(rawContent);
    } catch {
        // Try extracting JSON from markdown code blocks
        const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1]);
        } else {
            // Last resort: find first { and last }
            const start = rawContent.indexOf('{');
            const end = rawContent.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                parsed = JSON.parse(rawContent.substring(start, end + 1));
            } else {
                throw new Error('Could not extract valid JSON from AI response');
            }
        }
    }

    // Validate required fields
    if (typeof parsed.riskScore !== 'number') parsed.riskScore = 50;
    if (!['low', 'medium', 'high', 'critical'].includes(parsed.riskLevel)) {
        parsed.riskLevel = parsed.riskScore <= 25 ? 'low'
            : parsed.riskScore <= 50 ? 'medium'
                : parsed.riskScore <= 75 ? 'high'
                    : 'critical';
    }
    if (!parsed.summary || typeof parsed.summary !== 'string') {
        parsed.summary = 'AI analysis could not generate a summary for this contract.';
    }
    if (!Array.isArray(parsed.clauses)) parsed.clauses = [];
    if (!parsed.obligations) parsed.obligations = { yourObligations: [], otherPartyObligations: [] };
    if (!parsed.keyDates) parsed.keyDates = {};
    if (!Array.isArray(parsed.parties)) parsed.parties = [];

    return parsed;
}

/**
 * Generate an AI explanation for a contract version diff.
 */
async function explainDiff(diffText, contractTitle) {
    const diffModel = 'google/gemma-2-9b-it:free';

    const prompt = `You are a legal contract analyst. Below is a diff between two versions of the contract titled "${contractTitle}". Analyze the changes and return a JSON object:

{
  "summary": "A paragraph explaining what changed between the two versions",
  "changesAnalysis": [
    {
      "change": "Description of the change",
      "impact": "Whether this change favors or hurts the signing party",
      "severity": "<positive|neutral|negative>"
    }
  ],
  "newRisks": ["Any newly introduced risky clauses"],
  "recommendation": "Overall recommendation about this version update"
}

Diff:
${diffText}`;

    try {
        const response = await axios.post(
            `${process.env.OPENROUTER_BASE_URL}/chat/completions`,
            {
                model: diffModel,
                messages: [
                    { role: 'system', content: 'You are a legal contract analyst. Return only valid JSON. Label all output as AI analysis, not legal advice.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.2,
                max_tokens: 2048,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 60000,
            }
        );

        const rawContent = response.data?.choices?.[0]?.message?.content;
        return parseAIResponse(rawContent);
    } catch (err) {
        logger.error('Diff AI explanation failed:', err.message);
        throw new Error('AI diff explanation failed: ' + err.message);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    analyzeContract,
    explainDiff,
};
