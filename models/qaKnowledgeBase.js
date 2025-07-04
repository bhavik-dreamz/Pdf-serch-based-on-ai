// Enhanced qaKnowledgeBase.js (update existing model)
const mongoose = require('mongoose');

const qaKnowledgeBaseSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  answer: {
    type: String,
    required: true
  },
  embedding: {
    type: [Number],
    required: true
  },
  references: [{
    type: String
  }],
  // New fields for enhanced learning
  confidence: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  queryFeatures: {
    hasName: Boolean,
    hasSkills: [String],
    hasRole: [String],
    hasExperience: Boolean,
    queryLength: Number,
    queryType: String
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  avgUserRating: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Track which users found this helpful
  userFeedback: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: Number,
    timestamp: Date
  }],
  // Categories for better organization
  category: {
    type: String,
    enum: ['name_search', 'skill_search', 'role_search', 'experience_search', 'general'],
    default: 'general'
  }
});

// Indexes for better performance
qaKnowledgeBaseSchema.index({ usageCount: -1 });
qaKnowledgeBaseSchema.index({ avgUserRating: -1 });
qaKnowledgeBaseSchema.index({ category: 1 });
qaKnowledgeBaseSchema.index({ 'queryFeatures.queryType': 1 });

module.exports = mongoose.model('QAKnowledgeBase', qaKnowledgeBaseSchema);
