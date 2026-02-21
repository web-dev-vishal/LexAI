/**
 * Analysis Model
 *
 * Stores AI analysis results for a specific contract version.
 * The analysis includes risk scoring, clause-by-clause flagging,
 * obligation summary, and key dates — all returned as structured JSON
 * from the OpenRouter LLM.
 */

const mongoose = require('mongoose');

const clauseSchema = new mongoose.Schema(
    {
        title: String,
        content: String,
        flag: { type: String, enum: ['green', 'yellow', 'red'] },
        explanation: String,
        suggestion: String,
    },
    { _id: false }
);

const analysisSchema = new mongoose.Schema(
    {
        contractId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Contract',
            required: true,
        },
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
        },
        version: { type: Number, required: true },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending',
        },

        // AI Output
        summary: String, // Single plain-English paragraph
        riskScore: { type: Number, min: 0, max: 100 },
        riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] },

        clauses: [clauseSchema],

        obligations: {
            yourObligations: [String],
            otherPartyObligations: [String],
        },

        keyDates: {
            effectiveDate: String,
            expiryDate: String,
            renewalDate: String,
            noticePeriod: String,
        },

        // Processing metadata
        aiModel: String,
        tokensUsed: Number,
        processingTimeMs: Number,
        failureReason: String,
        retryCount: { type: Number, default: 0 },
        cacheKey: String,
    },
    {
        timestamps: true,
        toJSON: {
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
analysisSchema.index({ contractId: 1, version: 1 });
analysisSchema.index({ orgId: 1 });
analysisSchema.index({ status: 1 });

const Analysis = mongoose.model('Analysis', analysisSchema);

module.exports = Analysis;
