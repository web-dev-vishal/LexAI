/**
 * Contract Model
 *
 * The core document of LexAI. Stores extracted text (original file is NOT retained),
 * version history, AI-extracted dates, jurisdiction data, and alert configuration.
 *
 * Key design decisions:
 *   - Versions are embedded as an array (not separate documents) since contracts
 *     typically have < 20 versions and we always load them together.
 *   - Soft delete via isDeleted flag preserves the audit trail.
 *   - Full-text index on content, title, and tags with weighted scoring.
 *     Title matches are boosted 10x, tag matches 5x over content matches.
 */

import mongoose from 'mongoose';

// ─── Sub-schemas ───────────────────────────────────────────────────

// Each version captures a snapshot of the contract text at a point in time
const versionSchema = new mongoose.Schema(
    {
        versionNumber: { type: Number, required: true },
        content: { type: String, required: true },
        contentHash: { type: String, required: true },  // SHA-256 for cache/dedup
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now },
        changeNote: String,  // Optional note describing what changed
    },
    { _id: false } // No separate _id for embedded docs — saves space
);

// Parties extracted by AI from the contract text
const partySchema = new mongoose.Schema(
    {
        name: String,   // e.g., "Acme Corp"
        role: String,   // e.g., "Vendor", "Client"
    },
    { _id: false }
);

// ─── Main Contract Schema ──────────────────────────────────────────

const contractSchema = new mongoose.Schema(
    {
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,  // Every contract belongs to exactly one org (multi-tenancy)
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        title: {
            type: String,
            required: [true, 'Contract title is required'],
            trim: true,
            maxlength: 300,
        },
        type: {
            type: String,
            enum: ['NDA', 'Vendor', 'Employment', 'SaaS', 'Other'],
            default: 'Other',
        },
        tags: [{ type: String, trim: true, lowercase: true }], // User-defined labels

        // ─── Content ─────────────────────────────────────────────
        content: { type: String, required: true },       // Current version's full text
        contentHash: { type: String, required: true },   // SHA-256 hash for cache/dedup

        // File metadata — the original file is discarded after text extraction
        fileSize: Number,
        mimeType: String,

        // ─── Version History ─────────────────────────────────────
        versions: [versionSchema],
        currentVersion: { type: Number, default: 1 },

        // ─── AI-Extracted Key Dates ──────────────────────────────
        parties: [partySchema],
        effectiveDate: Date,
        expiryDate: Date,
        renewalDate: Date,
        noticePeriodDays: Number,

        // ─── Alert Configuration ────────────────────────────────
        // Days before expiry to send alerts — customizable per contract
        alertDays: {
            type: [Number],
            default: [90, 60, 30, 7],
        },
        // Track which alerts have already been sent to prevent duplicates
        alertsSent: [
            {
                daysBeforeExpiry: Number,
                sentAt: Date,
                _id: false,
            },
        ],

        // ─── Jurisdiction Enrichment ─────────────────────────────
        // Populated from REST Countries API based on AI-detected jurisdiction
        jurisdiction: {
            country: String,
            region: String,
            currency: String,
        },

        // ─── Soft Delete ────────────────────────────────────────
        isDeleted: { type: Boolean, default: false },
        deletedAt: Date,
        deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true, // Include computed properties in JSON output
            transform(doc, ret) {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
    }
);

// ─── Indexes ──────────────────────────────────────────────────────
contractSchema.index({ orgId: 1, isDeleted: 1 });         // List contracts by org
contractSchema.index({ expiryDate: 1, isDeleted: 1 });    // Expiry cron scan
contractSchema.index({ contentHash: 1 });                  // Deduplication lookups

// Full-text search index with weighted fields
// Title matches score 10x, tag matches 5x over body content matches
contractSchema.index(
    { content: 'text', title: 'text', tags: 'text' },
    { weights: { title: 10, tags: 5, content: 1 } }
);

// ─── Virtuals ─────────────────────────────────────────────────────

/**
 * Computed property: days until this contract expires.
 * Returns null if no expiryDate is set.
 * Negative values mean the contract has already expired.
 */
contractSchema.virtual('daysUntilExpiry').get(function () {
    if (!this.expiryDate) return null;
    const diffMs = new Date(this.expiryDate).getTime() - Date.now();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
});

const Contract = mongoose.model('Contract', contractSchema);

export default Contract;
