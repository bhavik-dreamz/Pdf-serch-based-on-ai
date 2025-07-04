const mongoose = require('mongoose');

const pdfSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    trim: true,
  },
  originalname: {
    type: String,
    required: true,
    trim: true,
  },
  path: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
    min: 0,
  },
  mimetype: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    default: '',
  },
  pdfText: {
    type: String,
    default: '',
  },
  parsedCV: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
    default: null
  },
  uploadId: {
    type: String,
    required: false,
    index: true,
  },

  // Embedding Status Tracking
  embeddingStatus: {
    type: String,
    enum: [
      'pending_processing',
      'pending_embeddings',
      'processing_embeddings',
      'completed',
      'failed'
    ],
    default: 'pending_processing'
  },
  embeddingData: {
    chunks: {
      type: Number,
      default: 0,
    },
    embeddingsProcessed: {
      type: Number,
      default: 0,
    },
    vectorsStored: {
      type: Number,
      default: 0,
    },
    processedAt: {
      type: Date,
    },
  },
  embeddingError: {
    type: String,
    default: '',
  },
  errorAt: {
    type: Date,
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Pdf', pdfSchema);
