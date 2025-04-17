const express = require('express');
const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');

const router = express.Router();
const Pdf = require('../models/pdfModel');
const { pineconeClient, embeddingClient } = require('../clients');

// Chat with PDF endpoint
router.post('/:pdfId', async (req, res) => {
  try {
    const { pdfId } = req.params;
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ message: 'Query is required' });
    }
    
    // Check if PDF exists
    // const pdf = await Pdf.findById(pdfId);
    // if (!pdf) {
    //   return res.status(404).json({ message: 'PDF not found' });
    // }

    // Get query embedding
    const queryEmbedding = await embeddingClient.getEmbeddings(query);

    // Search similar vectors in Pinecone
    const index = await pineconeClient();
    const queryResponse = await index.namespace("default").query({
      vector: queryEmbedding,
      topK: 3,
      includeMetadata: true,
      includeValues: true
    });

    // Extract relevant text from the matches
    const contexts = queryResponse.matches.map(match => match.metadata.text).join('\n\n');
    
    // Create language model
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo",
      temperature: 0.2
    });
    
    // Create the prompt template
    const template = `
      You are an AI assistant that helps users find information in documents.
      Use the following pieces of context to answer the question at the end.
      If you don't know the answer, just say that you don't know, don't try to make up an answer.
      
      Context: {context}
      
      Question: {question}
      
      Answer:
    `;
    
    const promptTemplate = new PromptTemplate({
      template,
      inputVariables: ["context", "question"]
    });

    // Generate the prompt
    const prompt = await promptTemplate.format({
      context: contexts,
      question: query
    });

    // Get AI response
    const response = await model.invoke(prompt);
    
    res.json({
      answer: response.content,
      sources: queryResponse.matches.map(match => ({
        content: match.metadata.text,
        score: match.score,
        metadata: {
          pageNumber: match.metadata.pageNumber,
          chunk: match.metadata.chunk
        }
      }))
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ message: 'Error processing chat query', error: error.message });
  }
});

// Chat across multiple PDFs endpoint
router.post('/', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ message: 'Query is required' });
    }

    // Get query embedding
    const queryEmbedding = await embeddingClient.getEmbeddings(query);

    // Search similar vectors in Pinecone
    const index = await pineconeClient();
    const queryResponse = await index.namespace("default").query({
      vector: queryEmbedding,
      topK: 5,
      includeValues: true,
      includeMetadata: true
    });

    // Fetch PDF details from MongoDB for matched sources
    const uniquePdfIds = [...new Set(queryResponse.matches.map(match => match.metadata.pdfId))];
    const pdfs = await Pdf.find({ _id: { $in: uniquePdfIds } });
    
    // Create a map of PDF IDs to their details
    const pdfMap = pdfs.reduce((acc, pdf) => {
      acc[pdf._id.toString()] = pdf;
      return acc;
    }, {});

    // Extract relevant text and source information with PDF names
    const contexts = queryResponse.matches.map(match => {
      const pdf = pdfMap[match.metadata.pdfId];
      return `Source: ${pdf ? pdf.originalname : 'Unknown PDF'} (Page ${match.metadata.pageNumber})\n${match.metadata.text}`;
    }).join('\n\n');
    
    // Create language model and prompt (existing code)
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo",
      temperature: 0.2
    });

    // Updated prompt template with better source formatting
    const template = `
      You are an AI assistant that helps users find information across multiple PDF documents.
      Use the following pieces of context to answer the question at the end.
      Include relevant source information in your answer by mentioning the PDF name and page number.
      If you don't know the answer, just say that you don't know, don't try to make up an answer.
      
      Context: {context}
      
      Question: {question}
      
      Answer (including relevant sources):
    `;
    
    // Generate response (existing code)
    const promptTemplate = new PromptTemplate({
      template,
      inputVariables: ["context", "question"]
    });

    const prompt = await promptTemplate.format({
      context: contexts,
      question: query
    });

    const response = await model.invoke(prompt);
    
    // Return response with enhanced source information
    res.json({
      answer: response.content,
      sources: queryResponse.matches.map(match => {
        const pdf = pdfMap[match.metadata.pdfId];
        return {
          content: match.metadata.text,
          score: match.score,
          metadata: {
            pdfId: match.metadata.pdfId,
            pdfName: pdf ? pdf.originalname : 'Unknown PDF',
            pageNumber: match.metadata.pageNumber,
            chunk: match.metadata.chunk
          }
        };
      })
    });

  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ 
      message: 'Error processing chat query', 
      error: error.message 
    });
  }
});

module.exports = router;