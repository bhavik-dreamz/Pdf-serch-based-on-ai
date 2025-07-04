const mongoose = require('mongoose');

const searchAnalyticsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  // Daily aggregated stats
  totalSearches: {
    type: Number,
    default: 0
  },
  uniqueUsers: {
    type: Number,
    default: 0
  },
  avgResultsPerQuery: {
    type: Number,
    default: 0
  },
  avgQueryConfidence: {
    type: Number,
    default: 0
  },
  // Query type breakdown
  queryTypeBreakdown: {
    name_search: Number,
    skill_based: Number,
    experience_based: Number,
    role_based: Number,
    general: Number
  },
  // Top searched terms
  topSkills: [{
    skill: String,
    count: Number
  }],
  topRoles: [{
    role: String,
    count: Number
  }],
  // Performance metrics
  cacheHitRate: {
    type: Number,
    default: 0
  },
  avgResponseTime: {
    type: Number,
    default: 0
  },
  // User satisfaction
  avgUserRating: {
    type: Number,
    default: 0
  },
  totalFeedbacks: {
    type: Number,
    default: 0
  }
});

// Ensure one document per day
searchAnalyticsSchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('SearchAnalytics', searchAnalyticsSchema);