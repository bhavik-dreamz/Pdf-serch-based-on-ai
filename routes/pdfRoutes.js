const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdf = require("pdf-parse");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { pineconeClient, embeddingClient } = require("../clients");

const router = express.Router();
const Pdf = require("../models/pdfModel");

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// File filter for PDFs
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Upload PDF route
router.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Read PDF content
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdf(dataBuffer);
    const pdfContent = pdfData.text;

    // Create PDF document in MongoDB
    const pdfDoc = new Pdf({
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      content: pdfContent,
    });

    await pdfDoc.save();

    // Process text for vector embeddings
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await textSplitter.createDocuments([pdfContent]);

    // Get embeddings from the external API and prepare vectors for Pinecone
    const vectors = [];

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      try {
        const embedding = await embeddingClient.getEmbeddings(doc.pageContent);

        vectors.push({
          id: `pdf_${pdfDoc._id.toString()}_${i}`,
          values: embedding,
          sparseValues: {
            indices: [1, 5],
            values: [0.5, 0.5],
          },
          metadata: {
            text: doc.pageContent,
            pdfId: pdfDoc._id.toString(),
            pageNumber: doc.metadata?.pageNumber || 1,
            chunk: i,
          },
        });
      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error);
        continue;
      }
    }

    if (vectors.length === 0) {
      throw new Error("No valid embeddings were generated");
    }

    // Log vectors to a file
    const debugPath = path.join(__dirname, "..", "debug");
    if (!fs.existsSync(debugPath)) {
      fs.mkdirSync(debugPath);
    }

    try {
      const index = await pineconeClient();

      console.log("Starting vector upload process...");

      // console.log(batch);
      const response = await index.namespace("default").upsert(vectors);
      console.log("Vector upload response:", response);


      const vectorsFile = path.join(debugPath, `vectors_${Date.now()}.json`);
      fs.writeFileSync(vectorsFile, JSON.stringify(vectors, null, 2));
      console.log("Vectors saved to:", vectorsFile);

      console.log("Vector upload process completed successfully");

      res.status(201).json({
        message: "PDF uploaded successfully",
        pdf: {
          id: pdfDoc._id,
          filename: pdfDoc.originalname,
          chunks: vectors.length,
        },
      });
    } catch (error) {
      console.error("Vector upload process failed:", error);
      res.status(500).json({
        message: "Failed to upload PDF",
        error: error.message,
      });
    }
  } catch (error) {
    console.error("Error uploading PDF:", error);
    res
      .status(500)
      .json({ message: "Error uploading PDF", error: error.message });
  }
});

// Get all PDFs
router.get("/", async (req, res) => {
  try {
    const pdfs = await Pdf.find().select("originalname createdAt _id");
    res.json(pdfs);
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    res
      .status(500)
      .json({ message: "Error fetching PDFs", error: error.message });
  }
});

// Delete PDF
router.delete("/:id", async (req, res) => {
  try {
    const pdf = await Pdf.findById(req.params.id);
    if (!pdf) {
      return res.status(404).json({ message: "PDF not found" });
    }

    // Delete file from filesystem
    if (fs.existsSync(pdf.path)) {
      fs.unlinkSync(pdf.path);
    }

    // Delete from MongoDB
    await Pdf.findByIdAndDelete(req.params.id);

    // Delete vectors from Pinecone
    const index = pineconeClient();
    await index.deleteMany({
      filter: {
        pdfId: req.params.id,
      },
    });

    res.json({ message: "PDF deleted successfully" });
  } catch (error) {
    console.error("Error deleting PDF:", error);
    res
      .status(500)
      .json({ message: "Error deleting PDF", error: error.message });
  }
});

module.exports = router;
