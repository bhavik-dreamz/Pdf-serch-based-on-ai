const mongoose = require('mongoose');

const queryPatternSchema = new mongoose.Schema({
  originalQuery: {
    type: String,
    required: true,
    unique: true
  },
  rewrittenQuery: {
    type: String,
    required: true
  },
  queryType: {
    type: String,
    enum: ['name_search', 'skill_based', 'experience_based', 'role_based', 'general'],
    default: 'general'
  },
  totalUses: {
    type: Number,
    default: 0
  },
  successCount: {
    type: Number,
    default: 0
  },
  successRate: {
    type: Number,
    default: 0
  },
  avgResultsCount: {
    type: Number,
    default: 0
  },
  avgUserRating: {
    type: Number,
    default: 0
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Store common result patterns
  commonResults: [{
    resultId: String,
    frequency: Number,
    avgRating: Number
  }],
  // Store extracted features
  extractedFeatures: {
    hasName: Boolean,
    hasSkills: [String],
    hasRole: [String],
    hasExperience: Boolean,
    queryLength: Number,
    commonWords: [String]
  }
});

// Indexes
queryPatternSchema.index({ successRate: -1 });
queryPatternSchema.index({ totalUses: -1 });
queryPatternSchema.index({ queryType: 1 });

module.exports = mongoose.model('QueryPattern', queryPatternSchema);