/**
 * Diff Service
 *
 * Compares two versions of a contract:
 *   1. Text-level diff (line-by-line comparison)
 *   2. AI-powered explanation of changes (queued via RabbitMQ)
 *
 * Available to Pro and Enterprise plans only — plan checks happen here.
 */

import Contract from '../models/Contract.model.js';
import Organization from '../models/Organization.model.js';
import { getPlanLimits } from '../constants/plans.js';
import { publishToQueue } from '../config/rabbitmq.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

/**
 * Generate a simple text diff between two strings.
 * Returns a unified-diff-style output showing added/removed lines.
 *
 * Note: This is a basic line-by-line comparison, not a proper diff algorithm
 * (no LCS or Myers). Good enough for showing changes to the user before
 * the AI explanation comes back.
 */
export function generateTextDiff(textA, textB) {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const diff = [];

    const maxLines = Math.max(linesA.length, linesB.length);

    for (let i = 0; i < maxLines; i++) {
        const lineA = linesA[i] || '';
        const lineB = linesB[i] || '';

        if (lineA === lineB) {
            diff.push(`  ${lineA}`);  // Unchanged line (leading spaces = context)
        } else {
            if (lineA) diff.push(`- ${lineA}`);  // Removed from version A
            if (lineB) diff.push(`+ ${lineB}`);  // Added in version B
        }
    }

    return diff.join('\n');
}

/**
 * Compare two versions of a contract.
 * Generates a text diff immediately and queues an AI explanation job.
 *
 * @returns {{ jobId: string }} Job ID for polling the AI explanation result
 */
export async function compareVersions({ contractId, orgId, userId, versionA, versionB }) {
    // Check plan access — only Pro and Enterprise can compare versions
    const org = await Organization.findById(orgId).lean();
    const planLimits = getPlanLimits(org.plan);

    if (!planLimits.versionComparison) {
        throw new AppError(
            'Version comparison is available on Pro and Enterprise plans only.',
            403,
            'FORBIDDEN'
        );
    }

    // Fetch contract with full version history
    const contract = await Contract.findOne({ _id: contractId, orgId, isDeleted: false });
    if (!contract) {
        throw new AppError('Contract not found.', 404, 'NOT_FOUND');
    }

    // Find both requested versions
    const verA = contract.versions.find((v) => v.versionNumber === versionA);
    const verB = contract.versions.find((v) => v.versionNumber === versionB);

    if (!verA || !verB) {
        const available = contract.versions.map((v) => v.versionNumber).join(', ');
        throw new AppError(
            `One or both versions not found. Available versions: ${available}`,
            404,
            'VERSION_NOT_FOUND'
        );
    }

    // Generate text diff for immediate return
    const diffText = generateTextDiff(verA.content, verB.content);

    // Queue AI explanation job — result will arrive via Socket.io
    const jobId = uuidv4();
    publishToQueue(process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue', {
        jobId,
        type: 'diff', // Worker uses this to route to diff handler instead of analysis handler
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
