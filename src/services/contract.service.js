/**
 * Contract Service
 *
 * Business logic for contract CRUD, versioning, pagination,
 * and full-text search. Enforces plan limits and org isolation.
 */

const Contract = require('../models/Contract.model');
const Organization = require('../models/Organization.model');
const { hashContent } = require('../utils/hashHelper');
const { extractText } = require('../utils/textExtractor');
const { buildPaginationMeta } = require('../utils/apiResponse');
const { getPlanLimits } = require('../constants/plans');
const auditService = require('./audit.service');

/**
 * Upload a new contract. Extracts text from file or accepts raw text.
 */
async function createContract({ orgId, userId, title, type, tags, content, file }) {
    // Check contract storage limit
    const org = await Organization.findById(orgId);
    const planLimits = getPlanLimits(org.plan);

    if (planLimits.maxContracts !== Infinity && org.contractCount >= planLimits.maxContracts) {
        const error = new Error(`Your ${org.plan} plan allows a maximum of ${planLimits.maxContracts} contracts. Upgrade your plan.`);
        error.statusCode = 403;
        error.code = 'PLAN_LIMIT';
        throw error;
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

    if (!contractText || contractText.trim().length < 50) {
        const error = new Error('Contract content is too short. Provide at least 50 characters of text.');
        error.statusCode = 400;
        error.code = 'CONTENT_TOO_SHORT';
        throw error;
    }

    const contentHash = hashContent(contractText);

    // Parse tags if they came as a comma-separated string
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

    // Increment org contract count
    await Organization.findByIdAndUpdate(orgId, { $inc: { contractCount: 1 } });

    // Audit log
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
 */
async function listContracts(orgId, query = {}) {
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc', type, tag, search } = query;

    const filter = { orgId, isDeleted: false };

    if (type) filter.type = type;
    if (tag) filter.tags = tag;

    // Full-text search using MongoDB $text index
    if (search) {
        filter.$text = { $search: search };
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortOptions = {};

    // If searching, sort by text score relevance first
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
 */
async function getContractById(contractId, orgId) {
    const contract = await Contract.findOne({
        _id: contractId,
        orgId,
        isDeleted: false,
    }).lean();

    if (!contract) {
        const error = new Error('Contract not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
    }

    return contract;
}

/**
 * Update contract metadata (title, tags, alert config).
 */
async function updateContract(contractId, orgId, updates) {
    const contract = await Contract.findOneAndUpdate(
        { _id: contractId, orgId, isDeleted: false },
        { $set: updates },
        { new: true, runValidators: true }
    );

    if (!contract) {
        const error = new Error('Contract not found.');
        error.statusCode = 404;
        throw error;
    }

    return contract;
}

/**
 * Upload a new version of an existing contract.
 */
async function addVersion(contractId, orgId, userId, { content, changeNote }) {
    const contract = await Contract.findOne({ _id: contractId, orgId, isDeleted: false });

    if (!contract) {
        const error = new Error('Contract not found.');
        error.statusCode = 404;
        throw error;
    }

    const newVersion = contract.currentVersion + 1;
    const contentHash = hashContent(content);

    contract.versions.push({
        versionNumber: newVersion,
        content,
        contentHash,
        uploadedBy: userId,
        uploadedAt: new Date(),
        changeNote,
    });

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
 * Get version history for a contract.
 */
async function getVersions(contractId, orgId) {
    const contract = await Contract.findOne({ _id: contractId, orgId, isDeleted: false })
        .select('versions currentVersion title')
        .lean();

    if (!contract) {
        const error = new Error('Contract not found.');
        error.statusCode = 404;
        throw error;
    }

    return contract.versions.map((v) => ({
        versionNumber: v.versionNumber,
        uploadedAt: v.uploadedAt,
        changeNote: v.changeNote,
        contentHash: v.contentHash,
    }));
}

/**
 * Soft delete a contract.
 */
async function deleteContract(contractId, orgId, userId) {
    const contract = await Contract.findOneAndUpdate(
        { _id: contractId, orgId, isDeleted: false },
        { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
        { new: true }
    );

    if (!contract) {
        const error = new Error('Contract not found.');
        error.statusCode = 404;
        throw error;
    }

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

module.exports = {
    createContract,
    listContracts,
    getContractById,
    updateContract,
    addVersion,
    getVersions,
    deleteContract,
};
