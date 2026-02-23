/**
 * Analysis Model
 *
 * Stores AI analysis results for a specific contract version.
 * The analysis includes risk scoring, clause-by-clause flagging,
 * obligation summary, and key dates — all returned as structured JSON
 * from the OpenRouter LLM.
 *
 * Lifecycle: pending → processing → completed | failed
 *
 * Cache key links this analysis to a Redis cache entry so that
 * identical contract content returns cached results instantly.
 */

import mongoose from 'mongoose';

// Individual clause analysis — each clause gets flagged green/yellow/red
const clauseSchema = new mongoose.Schema(
    {
        title: String,        // e.g., "Termination Clause"
        content: String,      // The actual clause text
        flag: { type: String, enum: ['green', 'yellow', 'red'] }, // Risk level
        explanation: String,  // Plain-English explanation of what this clause means
        suggestion: String,   // What to negotiate or watch out for
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
            required: true,  // For org-scoped access control
        },
        version: { type: Number, required: true }, // Which contract version was analyzed

        // Processing lifecycle
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending',
        },

        // ─── AI Output ──────────────────────────────────────────
        summary: String,  // Single plain-English paragraph summarizing the contract
        riskScore: { type: Number, min: 0, max: 100 },  // 0 = safe, 100 = dangerous
        riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] },

        clauses: [clauseSchema],  // Clause-by-clause risk analysis

        obligations: {
            yourObligations: [String],         // What the signing party must do
            otherPartyObligations: [String],   // What the other party must do
        },

        keyDates: {
            effectiveDate: String,
            expiryDate: String,
            renewalDate: String,
            noticePeriod: String,
        },

        // ─── Processing Metadata ────────────────────────────────
        aiModel: String,           // Which LLM model produced this result
        tokensUsed: Number,        // Total tokens consumed (input + output)
        processingTimeMs: Number,  // How long the AI call took
        failureReason: String,     // Error message if status is 'failed'
        retryCount: { type: Number, default: 0 },  // How many times we retried
        cacheKey: String,          // Content hash — links to Redis cache entry
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
analysisSchema.index({ contractId: 1, version: 1 });       // Look up analysis by contract+version
analysisSchema.index({ orgId: 1, createdAt: -1 });         // Paginated org-scoped analysis listing
analysisSchema.index({ orgId: 1, status: 1 });             // Find org-specific pending/processing jobs
analysisSchema.index({ status: 1 });                        // Global status queries (admin dashboard)

const Analysis = mongoose.model('Analysis', analysisSchema);

export default Analysis;
