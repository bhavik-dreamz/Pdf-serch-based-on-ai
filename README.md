# PDF Chat with AI

This application allows users to upload PDFs, which are then stored in MongoDB and indexed in Pinecone as vector embeddings. Users can chat with the PDFs using AI through a simple web interface.

## Features

- PDF upload to MongoDB
- Text extraction from PDFs
- Vector embedding generation using OpenAI
- Vector storage in Pinecone
- Chat interface for querying PDF content
- Retrieval-augmented generation (RAG) using Langchain

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or remote)
- OpenAI API key
- Pinecone API key and environment

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/pdf-chat
   OPENAI_API_KEY=your-openai-api-key
   PINECONE_API_KEY=your-pinecone-api-key
   PINECONE_ENVIRONMENT=your-pinecone-environment
   PINECONE_INDEX_NAME=pdf-chat-index
   ```
4. Setup Pinecone:
   - Create an account on Pinecone (https://www.pinecone.io/)
   - Create an index with the name specified in your `.env` file
   - Set the dimension to 1536 for OpenAI embeddings
   - Copy your API key and environment to the `.env` file

## Usage

1. Start the server:
   ```
   npm start
   ```
2. Open your browser and navigate to `http://localhost:3000`
3. Upload PDFs through the web interface
4. Select a PDF from the list to start chatting
5. Ask questions about the PDF content

## How It Works

1. When a PDF is uploaded, the application:
   - Stores the file in the `uploads` directory
   - Extracts text content using pdf-parse
   - Saves the PDF metadata and content to MongoDB
   - Splits the content into chunks
   - Generates vector embeddings for each chunk using OpenAI
   - Stores these vectors in Pinecone

2. When a chat query is received:
   - The query is converted to a vector embedding
   - Similar vectors are retrieved from Pinecone
   - The retrieved content is used as context for the AI model
   - The AI generates a relevant response based on the context and query

## Technologies Used

- Node.js and Express
- MongoDB and Mongoose
- OpenAI API
- Pinecone Vector Database
- Langchain
- Multer for file uploads
- Bootstrap for UI 