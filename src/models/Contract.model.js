/**
 * Contract Model
 *
 * The core document of LexAI. Stores extracted text (original file is NOT retained),
 * version history, AI-extracted dates, jurisdiction data, and alert configuration.
 *
 * Key design decisions:
 *   - Versions are embedded as an array (not separate documents) since contracts
 *     typically have < 20 versions and we always load them together.
 *   - Soft delete via isDeleted flag preserves audit trail.
 *   - Full-text index on content, title, and tags with weighted scoring.
 */

const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema(
    {
        versionNumber: { type: Number, required: true },
        content: { type: String, required: true },
        contentHash: { type: String, required: true },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now },
        changeNote: String,
    },
    { _id: false }
);

const partySchema = new mongoose.Schema(
    {
        name: String,
        role: String,
    },
    { _id: false }
);

const contractSchema = new mongoose.Schema(
    {
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
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
        tags: [{ type: String, trim: true, lowercase: true }],

        // Current version's full text
        content: { type: String, required: true },
        contentHash: { type: String, required: true },

        // File metadata (original file not retained)
        fileSize: Number,
        mimeType: String,

        // Version history
        versions: [versionSchema],
        currentVersion: { type: Number, default: 1 },

        // AI-extracted key dates
        parties: [partySchema],
        effectiveDate: Date,
        expiryDate: Date,
        renewalDate: Date,
        noticePeriodDays: Number,

        // Alert configuration per contract
        alertDays: {
            type: [Number],
            default: [90, 60, 30, 7],
        },
        alertsSent: [
            {
                daysBeforeExpiry: Number,
                sentAt: Date,
                _id: false,
            },
        ],

        // Jurisdiction enrichment from REST Countries API
        jurisdiction: {
            country: String,
            region: String,
            currency: String,
        },

        // Soft delete
        isDeleted: { type: Boolean, default: false },
        deletedAt: Date,
        deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
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
contractSchema.index({ orgId: 1, isDeleted: 1 });
contractSchema.index({ expiryDate: 1, isDeleted: 1 });
contractSchema.index({ contentHash: 1 });

// Full-text search index with weighted fields
contractSchema.index(
    { content: 'text', title: 'text', tags: 'text' },
    { weights: { title: 10, tags: 5, content: 1 } }
);

// ─── Virtuals ─────────────────────────────────────────────────────

/**
 * Computed property: days until this contract expires.
 * Returns null if no expiryDate is set.
 */
contractSchema.virtual('daysUntilExpiry').get(function () {
    if (!this.expiryDate) return null;
    const diffMs = new Date(this.expiryDate).getTime() - Date.now();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
});

const Contract = mongoose.model('Contract', contractSchema);

module.exports = Contract;
