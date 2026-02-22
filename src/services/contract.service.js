/**
 * Contract Service
 *
 * Business logic for contract CRUD, versioning, pagination,
 * and full-text search. Enforces plan limits and org isolation.
 *
 * Key behaviors:
 *   - Every contract belongs to exactly one org (multi-tenant isolation)
 *   - Contract storage limit is enforced by subscription plan
 *   - Version history is embedded in the contract document
 *   - Soft delete preserves the audit trail
 *   - Full-text search uses MongoDB's $text index with weighted scoring
 */

import Contract from '../models/Contract.model.js';
import Organization from '../models/Organization.model.js';
import { hashContent } from '../utils/hashHelper.js';
import { extractText } from '../utils/textExtractor.js';
import { buildPaginationMeta } from '../utils/apiResponse.js';
import { getPlanLimits } from '../constants/plans.js';
import * as auditService from './audit.service.js';
import AppError from '../utils/AppError.js';

/**
 * Upload a new contract. Extracts text from file or accepts raw text.
 * Checks plan limits before creating the contract.
 */
export async function createContract({ orgId, userId, title, type, tags, content, file }) {
    // Check contract storage limit for the org's plan
    const org = await Organization.findById(orgId);
    const planLimits = getPlanLimits(org.plan);

    if (planLimits.maxContracts !== Infinity && org.contractCount >= planLimits.maxContracts) {
        throw new AppError(
            `Your ${org.plan} plan allows a maximum of ${planLimits.maxContracts} contracts. Upgrade your plan.`,
            403,
            'PLAN_LIMIT'
        );
    }

    // Extract text from file if provided, otherwise use raw content
    let contractText = content;
    let fileSize = null;
    let mimeType = null;

    if (file) {
        contractText = await extractText(file.buffer, file.mimetype);
        fileSize = file.size;
        mimeType = file.mimetype;
    }

    // Guard: ensure we have meaningful content to analyze
    if (!contractText || contractText.trim().length < 50) {
        throw new AppError(
            'Contract content is too short. Provide at least 50 characters of text.',
            400,
            'CONTENT_TOO_SHORT'
        );
    }

    // Hash for cache/dedup — same content produces the same hash
    const contentHash = hashContent(contractText);

    // Parse tags if they came as a comma-separated string from the form
    let parsedTags = tags;
    if (typeof tags === 'string') {
        parsedTags = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    }

    const contract = await Contract.create({
        orgId,
        uploadedBy: userId,
        title,
        type: type || 'Other',
        tags: parsedTags || [],
        content: contractText,
        contentHash,
        fileSize,
        mimeType,
        versions: [{
            versionNumber: 1,
            content: contractText,
            contentHash,
            uploadedBy: userId,
            uploadedAt: new Date(),
        }],
        currentVersion: 1,
    });

    // Increment the org's contract count for future plan limit checks
    await Organization.findByIdAndUpdate(orgId, { $inc: { contractCount: 1 } });

    // Record in audit trail
    await auditService.log({
        orgId,
        userId,
        action: 'contract.uploaded',
        resourceType: 'Contract',
        resourceId: contract._id,
        metadata: { title, type, contentLength: contractText.length },
    });

    return contract;
}

/**
 * List contracts with pagination, filtering, and full-text search.
 * Excludes heavy fields (content, versions) from list view for performance.
 */
export async function listContracts(orgId, query = {}) {
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc', type, tag, search } = query;

    // Base filter: org-scoped and not soft-deleted
    const filter = { orgId, isDeleted: false };

    if (type) filter.type = type;
    if (tag) filter.tags = tag;

    // Full-text search using MongoDB $text index
    if (search) {
        filter.$text = { $search: search };
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortOptions = {};

    // When searching, sort by text relevance score first
    if (search) {
        sortOptions.score = { $meta: 'textScore' };
    }
    sortOptions[sortBy] = sortOrder;

    const skip = (page - 1) * limit;

    const [contracts, total] = await Promise.all([
        Contract.find(filter, search ? { score: { $meta: 'textScore' } } : {})
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .select('-content -versions') // Exclude heavy fields from list view
            .lean(),
        Contract.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(total, page, limit);

    return { contracts, meta };
}

/**
 * Get a single contract by ID with full details.
 * Enforces org isolation — can't access contracts from other orgs.
 */
export async function getContractById(contractId, orgId) {
    const contract = await Contract.findOne({
        _id: contractId,
        orgId,
        isDeleted: false,
    }).lean();

    if (!contract) {
        throw new AppError('Contract not found.', 404, 'NOT_FOUND');
    }

    return contract;
}

/**
 * Update contract metadata (title, tags, alert config).
 * Does NOT update content — use addVersion for content changes.
 */
export async function updateContract(contractId, orgId, updates) {
    const contract = await Contract.findOneAndUpdate(
        { _id: contractId, orgId, isDeleted: false },
        { $set: updates },
        { new: true, runValidators: true }
    );

    if (!contract) {
        throw new AppError('Contract not found.', 404, 'NOT_FOUND');
    }

    return contract;
}

/**
 * Upload a new version of an existing contract.
 * Increments the version number and updates the current content/hash.
 */
export async function addVersion(contractId, orgId, userId, { content, changeNote }) {
    const contract = await Contract.findOne({ _id: contractId, orgId, isDeleted: false });

    if (!contract) {
        throw new AppError('Contract not found.', 404, 'NOT_FOUND');
    }

    const newVersion = contract.currentVersion + 1;
    const contentHash = hashContent(content);

    // Push new version onto the embedded array
    contract.versions.push({
        versionNumber: newVersion,
        content,
        contentHash,
        uploadedBy: userId,
        uploadedAt: new Date(),
        changeNote,
    });

    // Update the "current" snapshot
    contract.content = content;
    contract.contentHash = contentHash;
    contract.currentVersion = newVersion;
    await contract.save();

    await auditService.log({
        orgId,
        userId,
        action: 'contract.version_uploaded',
        resourceType: 'Contract',
        resourceId: contractId,
        metadata: { versionNumber: newVersion, changeNote },
    });

    return { versionNumber: newVersion, contractId };
}

/**
 * Get version history for a contract (metadata only, no content).
 */
export async function getVersions(contractId, orgId) {
    const contract = await Contract.findOne({ _id: contractId, orgId, isDeleted: false })
        .select('versions currentVersion title')
        .lean();

    if (!contract) {
        throw new AppError('Contract not found.', 404, 'NOT_FOUND');
    }

    // Return version metadata without the full content to keep the response light
    return contract.versions.map((v) => ({
        versionNumber: v.versionNumber,
        uploadedAt: v.uploadedAt,
        changeNote: v.changeNote,
        contentHash: v.contentHash,
    }));
}

/**
 * Soft delete a contract.
 * Preserves the document for audit trail — just sets isDeleted flag.
 * Also decrements the org's contract count.
 */
export async function deleteContract(contractId, orgId, userId) {
    const contract = await Contract.findOneAndUpdate(
        { _id: contractId, orgId, isDeleted: false },
        { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
        { new: true }
    );

    if (!contract) {
        throw new AppError('Contract not found.', 404, 'NOT_FOUND');
    }

    // Decrement the cached contract count
    await Organization.findByIdAndUpdate(orgId, { $inc: { contractCount: -1 } });

    await auditService.log({
        orgId,
        userId,
        action: 'contract.deleted',
        resourceType: 'Contract',
        resourceId: contractId,
    });

    return contract;
}
