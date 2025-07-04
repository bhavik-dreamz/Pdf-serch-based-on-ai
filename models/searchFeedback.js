const mongoose = require('mongoose');

const searchFeedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  query: {
    type: String,
    required: true
  },
  resultId: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  interaction: {
    type: String,
    enum: ['click', 'download', 'view', 'skip', 'bookmark', 'share'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  sessionId: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  }
});

// Indexes for better query performance
searchFeedbackSchema.index({ user: 1, timestamp: -1 });
searchFeedbackSchema.index({ query: 1 });
searchFeedbackSchema.index({ resultId: 1 });

module.exports = mongoose.model('SearchFeedback', searchFeedbackSchema);
