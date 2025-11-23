const mongoose = require('mongoose');

// ============================================
// REPORT SCHEMA
// ============================================
const reportSchema = new mongoose.Schema({
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { 
        type: String, 
        enum: ['spam', 'harassment', 'inappropriate', 'misinformation', 'other'],
        required: true 
    },
    description: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'reviewed', 'resolved', 'dismissed', 'escalated'],
        default: 'pending' 
    },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminNotes: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null }
});

const Report = mongoose.model('Report', reportSchema);

// ============================================
// USER RESTRICTION SCHEMA
// ============================================
const userRestrictionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    restrictedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    restrictionType: { 
        type: String, 
        enum: ['warning', 'temporary_ban', 'permanent_ban'],
        required: true 
    },
    reason: { type: String, required: true },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null }, // null for permanent bans
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const UserRestriction = mongoose.model('UserRestriction', userRestrictionSchema);

// ============================================
// POST MODERATION SCHEMA
// ============================================
const postModerationSchema = new mongoose.Schema({
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { 
        type: String, 
        enum: ['hidden', 'deleted', 'approved'],
        required: true 
    },
    reason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const PostModeration = mongoose.model('PostModeration', postModerationSchema);

// ============================================
// UPDATE POST SCHEMA (add these fields)
// ============================================
// Add to your existing Post schema:
// isHidden: { type: Boolean, default: false },
// hiddenReason: { type: String, default: '' }

// ============================================
// UPDATE USER SCHEMA (add these fields)
// ============================================
// Add to your existing User schema:
// isRestricted: { type: Boolean, default: false },
// restrictionEnd: { type: Date, default: null }

module.exports = { Report, UserRestriction, PostModeration };
