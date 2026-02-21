/**
 * Diff Service
 *
 * Compares two versions of a contract:
 *   1. Text-level diff (line-by-line comparison)
 *   2. AI-powered explanation of changes
 *
 * Available to Pro and Enterprise plans only.
 */

const Contract = require('../models/Contract.model');
const Organization = require('../models/Organization.model');
const { getPlanLimits } = require('../constants/plans');
const { publishToQueue } = require('../config/rabbitmq');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Generate a simple text diff between two strings.
 * Returns a unified-diff-style output showing added/removed lines.
 */
function generateTextDiff(textA, textB) {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const diff = [];

    const maxLines = Math.max(linesA.length, linesB.length);

    for (let i = 0; i < maxLines; i++) {
        const lineA = linesA[i] || '';
        const lineB = linesB[i] || '';

        if (lineA === lineB) {
            diff.push(`  ${lineA}`);
        } else {
            if (lineA) diff.push(`- ${lineA}`);
            if (lineB) diff.push(`+ ${lineB}`);
        }
    }

    return diff.join('\n');
}

/**
 * Compare two versions of a contract. Queues an AI diff explanation job.
 */
async function compareVersions({ contractId, orgId, userId, versionA, versionB }) {
    // Check plan access
    const org = await Organization.findById(orgId).lean();
    const planLimits = getPlanLimits(org.plan);

    if (!planLimits.versionComparison) {
        const error = new Error('Version comparison is available on Pro and Enterprise plans only.');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
    }

    // Fetch contract
    const contract = await Contract.findOne({ _id: contractId, orgId, isDeleted: false });
    if (!contract) {
        const error = new Error('Contract not found.');
        error.statusCode = 404;
        throw error;
    }

    const verA = contract.versions.find((v) => v.versionNumber === versionA);
    const verB = contract.versions.find((v) => v.versionNumber === versionB);

    if (!verA || !verB) {
        const error = new Error(`One or both versions not found. Available versions: ${contract.versions.map((v) => v.versionNumber).join(', ')}`);
        error.statusCode = 404;
        throw error;
    }

    // Generate text diff
    const diffText = generateTextDiff(verA.content, verB.content);

    // Queue AI explanation job
    const jobId = uuidv4();
    publishToQueue(process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue', {
        jobId,
        type: 'diff',
        contractId: contractId.toString(),
        orgId: orgId.toString(),
        userId: userId.toString(),
        contractTitle: contract.title,
        diffText,
        versionA,
        versionB,
        queuedAt: new Date().toISOString(),
    });

    logger.info('Diff comparison job queued', { jobId, contractId, versionA, versionB });

    return { jobId };
}

module.exports = {
    compareVersions,
    generateTextDiff,
};
