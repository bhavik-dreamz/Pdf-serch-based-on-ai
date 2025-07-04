const mongoose = require('mongoose');

const queryLogSchema = new mongoose.Schema({
  query: {
    type: String,
    required: true
  },
  rewrittenQuery: {
    type: String // Store the AI-enhanced version
  },
  embedding: {
    type: [Number],
    required: true
  },
  results: [{
    type: String
  }],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  // New fields for enhanced tracking
  confidence: {
    type: Number,
    default: 0.5
  },
  resultCount: {
    type: Number,
    default: 0
  },
  queryFeatures: {
    hasName: Boolean,
    hasSkills: [String],
    hasRole: [String],
    hasExperience: Boolean,
    queryLength: Number,
    queryType: String
  },
  searchDuration: {
    type: Number // in milliseconds
  },
  filteringStage: {
    originalResults: Number,
    afterFiltering: Number,
    finalResults: Number
  },
  // Track user interaction with results
  interactions: [{
    resultId: String,
    action: String, // 'click', 'download', 'view', etc.
    timestamp: Date,
    duration: Number // time spent on result
  }],
  sessionId: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  }
});

// Indexes for analytics
queryLogSchema.index({ user: 1, timestamp: -1 });
queryLogSchema.index({ 'queryFeatures.queryType': 1 });
queryLogSchema.index({ confidence: -1 });
queryLogSchema.index({ resultCount: -1 });
queryLogSchema.index({ sessionId: 1 });

module.exports = mongoose.model('QueryLog', queryLogSchema);