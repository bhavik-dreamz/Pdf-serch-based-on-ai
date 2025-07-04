const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdf = require("pdf-parse");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const pineconeClient = require("../clients/pinecone");
const { parseCV } = require("../actions/parseCV");
const pineconeClientStoreEmbeddings = require("../actions/StoreEmbeddings");

const router = express.Router();
const Pdf = require("../models/pdfModel");

// Store upload status in memory (consider Redis for production)
const uploadStatus = new Map();

// Queue for background processing
const embeddingQueue = new Set();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'pdf-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// Enhanced file filter for PDFs
const fileFilter = (req, file, cb) => {
  console.log('File filter - mimetype:', file.mimetype, 'originalname:', file.originalname);
  
  const allowedMimeTypes = [
    'application/pdf',
    'application/x-pdf',
    'application/acrobat',
    'applications/vnd.pdf',
    'text/pdf',
    'text/x-pdf'
  ];
  
  const isPdfExtension = path.extname(file.originalname).toLowerCase() === '.pdf';
  const isPdfMimeType = allowedMimeTypes.includes(file.mimetype);
  
  if (isPdfExtension && (isPdfMimeType || file.mimetype === 'application/octet-stream')) {
    cb(null, true);
  } else {
    cb(new Error(`Only PDF files are allowed. Received: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Only allow 1 file
  },
});

// Helper function to update status
const updateStatus = (uploadId, status, progress = 0, message = '', data = null) => {
  const statusObj = {
    status,
    progress,
    message,
    data,
    timestamp: new Date()
  };
  uploadStatus.set(uploadId, statusObj);
  console.log(`Status Update [${uploadId}]: ${status} - ${progress}% - ${message}`);
};

// Helper function to clean up uploaded file
const cleanupFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Cleaned up file:', filePath);
    }
  } catch (error) {
    console.error('Error cleaning up file:', error);
  }
};

// GET endpoint to check upload status
router.get("/upload/status/:uploadId", (req, res) => {
  const status = uploadStatus.get(req.params.uploadId);
  if (!status) {
    return res.status(404).json({ message: "Upload ID not found" });
  }
  res.json(status);
});

// STAGE 1: Quick Upload & Store (Main Upload Route)
router.post("/upload", (req, res) => {
  const uploadId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  
  updateStatus(uploadId, 'started', 0, 'Upload started');
  
  upload.single("pdf")(req, res, async (uploadError) => {
    if (uploadError) {
      console.error("❌ Multer Error:", uploadError);
      
      let errorMessage = "File upload failed";
      if (uploadError.code === 'LIMIT_FILE_SIZE') {
        errorMessage = "File too large (max 10MB)";
      } else if (uploadError.code === 'LIMIT_UNEXPECTED_FILE') {
        errorMessage = "Unexpected file field";
      } else if (uploadError.message.includes('PDF')) {
        errorMessage = uploadError.message;
      }
      
      updateStatus(uploadId, 'error', 0, errorMessage);
      return res.status(400).json({ 
        message: errorMessage,
        uploadId,
        error: uploadError.message 
      });
    }

    // Process quick upload
    await processQuickUpload(req, res, uploadId);
  });
});

// STAGE 1: Quick Upload Processing
async function processQuickUpload(req, res, uploadId) {
  let filePath = null;
  
  try {
    // Check if file was uploaded
    if (!req.file) {
      updateStatus(uploadId, 'error', 0, 'No file uploaded');
      return res.status(400).json({ 
        message: "No file uploaded",
        uploadId 
      });
    }

    filePath = req.file.path;
    console.log('Quick processing file:', filePath);

    updateStatus(uploadId, 'processing', 5, 'File uploaded, saving to database');

    // Validate file exists and is readable
    if (!fs.existsSync(filePath)) {
      throw new Error('Uploaded file not found');
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new Error('Uploaded file is empty');
    }

    // Save PDF with status "pending_processing"
    let pdfDoc = null;
    try {
      pdfDoc = new Pdf({
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype,
        createdAt: new Date(),
        embeddingStatus: 'pending_processing', // New field to track processing status
        uploadId: uploadId
      });

      await pdfDoc.save();
      console.log("PDF saved in MongoDB with pending processing:", pdfDoc._id);
    } catch (dbError) {
      console.error('Database save error:', dbError);
      throw new Error(`Failed to save to database: ${dbError.message}`);
    }

    updateStatus(uploadId, 'uploaded', 10, 'PDF uploaded and saved successfully. Processing will run in background.');

    // Queue for background processing
    embeddingQueue.add(pdfDoc._id.toString());
    
    // Start background processing (don't wait for it)
    processAllInBackground(pdfDoc._id.toString(), uploadId);

    // Quick Success Response
    res.status(201).json({
      message: "PDF uploaded successfully. Processing will run in background.",
      uploadId: uploadId,
      pdfId: pdfDoc._id,
      pdf: {
        id: pdfDoc._id,
        filename: req.file.originalname,
        size: req.file.size,
        embeddingStatus: 'pending_processing'
      },
      status: 'uploaded'
    });

  } catch (error) {
    console.error("❌ Quick Upload Error:", error);
    
    // Clean up file on error
    if (filePath) {
      cleanupFile(filePath);
    }
    
    updateStatus(uploadId, 'error', 0, error.message);

    res.status(500).json({
      message: "Error uploading PDF",
      error: error.message,
      uploadId,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// New: Background processing for parsing and embeddings
async function processAllInBackground(pdfId, uploadId) {
  try {
    console.log(`🔄 Starting background processing for PDF ${pdfId}`);
    updateStatus(uploadId, 'processing', 85, 'Parsing and embedding in background');

    // Get PDF from database
    const pdfDoc = await Pdf.findById(pdfId);
    if (!pdfDoc) {
      throw new Error('PDF not found in database');
    }

    // Read and parse PDF
    let pdfContent = '';
    let pdfData = null;
    try {
      const dataBuffer = fs.readFileSync(pdfDoc.path);
      pdfData = await pdf(dataBuffer);
      pdfContent = pdfData.text;
      if (!pdfContent || pdfContent.trim().length === 0) {
        throw new Error('PDF appears to be empty or contains no extractable text');
      }
      console.log('PDF content length:', pdfContent.length);
    } catch (pdfError) {
      console.error('PDF parsing error:', pdfError);
      throw new Error(`Failed to parse PDF: ${pdfError.message}`);
    }

    // Extract structured CV data
    let parsedCV = null;
    try {
      parsedCV = await parseCV(pdfContent);
      console.log("Parsed CV:", parsedCV);
      if (!parsedCV) {
        throw new Error('Failed to parse CV data');
      }
    } catch (cvError) {
      console.error('CV parsing error:', cvError);
      throw new Error(`Failed to parse CV: ${cvError.message}`);
    }

    // Update PDF with parsed data and text
    await Pdf.findByIdAndUpdate(pdfId, {
      pdfText: pdfContent,
      parsedCV: parsedCV,
      embeddingStatus: 'pending_embeddings'
    });

    // Split PDF content into chunks
    let chunkTexts = [];
    try {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const docs = await splitter.createDocuments([pdfContent]);
      chunkTexts = docs.map((doc) => doc.pageContent);
      if (chunkTexts.length === 0) {
        throw new Error('No content chunks generated');
      }
    } catch (splitterError) {
      console.error('Text splitting error:', splitterError);
      throw new Error(`Failed to split text: ${splitterError.message}`);
    }

    updateStatus(uploadId, 'processing_embeddings', 90, `Generating embeddings for ${chunkTexts.length} chunks`);

    // Store embeddings
    let vectors = [];
    let embeddings = [];
    let pineconeResponse = [];
    try {
      const embeddingResult = await pineconeClientStoreEmbeddings(
        chunkTexts,
        { ...parsedCV, pdfId: pdfId }
      );
      vectors = embeddingResult.vectors || [];
      embeddings = embeddingResult.embeddings || [];
      pineconeResponse = embeddingResult.pineconeResponse || [];
    } catch (embeddingError) {
      console.error('Embedding storage error:', embeddingError);
      throw new Error(`Failed to store embeddings: ${embeddingError.message}`);
    }

    // Update PDF status to completed
    await Pdf.findByIdAndUpdate(pdfId, { 
      embeddingStatus: 'completed',
      embeddingData: {
        chunks: vectors.length,
        embeddingsProcessed: embeddings.length,
        vectorsStored: vectors.length,
        processedAt: new Date()
      }
    });

    // Remove from queue
    embeddingQueue.delete(pdfId);

    // Final success status
    const finalData = {
      pdf: {
        id: pdfId,
        filename: pdfDoc.originalname,
        chunks: vectors.length,
        embeddingsProcessed: embeddings.length,
        parsedCV: parsedCV
      },
      pinecone: {
        batchesUploaded: pineconeResponse.length,
        vectorsStored: vectors.length
      }
    };

    updateStatus(uploadId, 'completed', 100, 'PDF and embeddings processed successfully', finalData);

    console.log(`✅ Background processing completed for PDF ${pdfId}`);

  } catch (error) {
    console.error(`❌ Background processing failed for PDF ${pdfId}:`, error);
    await Pdf.findByIdAndUpdate(pdfId, { 
      embeddingStatus: 'failed',
      embeddingError: error.message,
      errorAt: new Date()
    }).catch(dbError => {
      console.error('Failed to update PDF status:', dbError);
    });
    embeddingQueue.delete(pdfId);
    updateStatus(uploadId, 'embedding_failed', 0, `Processing failed: ${error.message}`);
  }
}

// STAGE 2: Manual Trigger for Embedding Processing (Alternative API)
router.post("/process-embeddings/:pdfId", async (req, res) => {
  try {
    const pdfId = req.params.pdfId;
    const uploadId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    // Check if PDF exists
    const pdfDoc = await Pdf.findById(pdfId);
    if (!pdfDoc) {
      return res.status(404).json({ message: "PDF not found" });
    }

    // Check if already processing
    if (embeddingQueue.has(pdfId)) {
      return res.status(409).json({ 
        message: "Embeddings are already being processed for this PDF",
        pdfId,
        status: pdfDoc.embeddingStatus
      });
    }

    // Add to queue and start processing
    embeddingQueue.add(pdfId);
    processAllInBackground(pdfId, uploadId);

    res.json({
      message: "Embedding processing started",
      pdfId,
      uploadId,
      status: 'processing_embeddings'
    });

  } catch (error) {
    console.error("Error starting embedding processing:", error);
    res.status(500).json({ 
      message: "Error starting embedding processing", 
      error: error.message 
    });
  }
});

// Get embedding status for a PDF
router.get("/embedding-status/:pdfId", async (req, res) => {
  try {
    const pdfDoc = await Pdf.findById(req.params.pdfId)
      .select('embeddingStatus embeddingData embeddingError errorAt');
    
    if (!pdfDoc) {
      return res.status(404).json({ message: "PDF not found" });
    }

    const isInQueue = embeddingQueue.has(req.params.pdfId);

    res.json({
      pdfId: req.params.pdfId,
      embeddingStatus: pdfDoc.embeddingStatus,
      embeddingData: pdfDoc.embeddingData,
      embeddingError: pdfDoc.embeddingError,
      errorAt: pdfDoc.errorAt,
      inQueue: isInQueue
    });

  } catch (error) {
    console.error("Error fetching embedding status:", error);
    res.status(500).json({ 
      message: "Error fetching embedding status", 
      error: error.message 
    });
  }
});

// Alternative: Server-Sent Events (SSE) for real-time updates
router.get("/upload-stream/:uploadId", (req, res) => {
  const uploadId = req.params.uploadId;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', uploadId })}\n\n`);

  const interval = setInterval(() => {
    const status = uploadStatus.get(uploadId);
    if (status) {
      res.write(`data: ${JSON.stringify(status)}\n\n`);
      
      if (status.status === 'completed' || status.status === 'error' || status.status === 'embedding_failed') {
        clearInterval(interval);
        res.end();
      }
    } else {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', uploadId })}\n\n`);
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
  
  req.on('error', (err) => {
    console.error('SSE connection error:', err);
    clearInterval(interval);
  });
});

// Clean up old status entries
setInterval(() => {
  const now = new Date();
  for (const [key, value] of uploadStatus.entries()) {
    if (now - value.timestamp > 3600000) { // 1 hour
      uploadStatus.delete(key);
    }
  }
}, 300000); // Every 5 minutes

// Get all PDFs with embedding status
router.get("/", async (req, res) => {
  try {
    const pdfs = await Pdf.find()
      .select("originalname createdAt _id size parsedCV.name parsedCV.email embeddingStatus embeddingData")
      .sort({ createdAt: -1 })
      .lean();
    res.json(pdfs);
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    res.status(500).json({ 
      message: "Error fetching PDFs", 
      error: error.message 
    });
  }
});

// Get single PDF details
router.get("/:id", async (req, res) => {
  try {
    const pdf = await Pdf.findById(req.params.id);
    if (!pdf) {
      return res.status(404).json({ message: "PDF not found" });
    }
    res.json(pdf);
  } catch (error) {
    console.error("Error fetching PDF:", error);
    res.status(500).json({ 
      message: "Error fetching PDF", 
      error: error.message 
    });
  }
});

// Delete PDF
router.delete("/:id", async (req, res) => {
  try {
    const pdf = await Pdf.findById(req.params.id);
    if (!pdf) {
      return res.status(404).json({ message: "PDF not found" });
    }

    // Remove from embedding queue if present
    embeddingQueue.delete(req.params.id);

    // Delete file from filesystem
    cleanupFile(pdf.path);

    // Delete from MongoDB
    await Pdf.findByIdAndDelete(req.params.id);

    // Delete vectors from Pinecone
    try {
      const index = await pineconeClient();
      await index.namespace('default').deleteMany({
        filter: {
          pdfId: { $eq: req.params.id }
        }
      });
      console.log(`Deleted vectors for PDF ${req.params.id} from Pinecone`);
    } catch (pineconeError) {
      console.error("Error deleting from Pinecone:", pineconeError);
    }

    res.json({ 
      message: "PDF deleted successfully",
      pdfId: req.params.id 
    });
  } catch (error) {
    console.error("Error deleting PDF:", error);
    res.status(500).json({ 
      message: "Error deleting PDF", 
      error: error.message 
    });
  }
});

// Health check endpoint
router.get("/health/check", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date(),
    uploadsDir: uploadsDir,
    activeUploads: uploadStatus.size,
    embeddingQueue: embeddingQueue.size
  });
});

module.exports = router;