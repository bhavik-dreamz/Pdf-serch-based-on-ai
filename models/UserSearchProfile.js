const mongoose = require('mongoose');

const userSearchProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // User's search preferences learned over time
  preferredSkills: [{
    skill: String,
    frequency: Number,
    lastSearched: Date
  }],
  preferredRoles: [{
    role: String,
    frequency: Number,
    lastSearched: Date
  }],
  searchPatterns: {
    avgQueryLength: Number,
    mostCommonQueryType: String,
    avgResultsViewed: Number,
    avgSessionDuration: Number
  },
  // User's feedback patterns
  feedbackProfile: {
    avgRating: Number,
    totalFeedbacks: Number,
    preferredResultTypes: [String],
    commonInteractions: [{
      action: String,
      frequency: Number
    }]
  },
  // Learning scores
  searchSuccessRate: {
    type: Number,
    default: 0
  },
  personalizationScore: {
    type: Number,
    default: 0
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
});

// Update lastUpdated on save
userSearchProfileSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('UserSearchProfile', userSearchProfileSchema);
