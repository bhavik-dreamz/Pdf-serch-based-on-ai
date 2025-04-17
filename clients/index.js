const mongoose = require('mongoose');
const { Pinecone } = require('@pinecone-database/pinecone');
const axios = require('axios');

// MongoDB Client
const mongoClient = {
  connect: async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  },
  disconnect: async () => {
    try {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    } catch (error) {
      console.error('MongoDB disconnection error:', error);
      throw error;
    }
  }
};

// Pinecone Client
const pineconeClient = async() => {
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY, 
});
  
  console.log('Connected to Pinecone');
//  Add error handling and logging
  const index = pc.index(process.env.PINECONE_INDEX_NAME);
  // //console.log('Pinecone index initialized:', process.env.PINECONE_INDEX_NAME, index);.
  
  // await index.namespace('default').upsert([
  //   {
  //     id: 'vec1asdfasdf',
  //     values: exampleVector,
  //     sparseValues: {
  //         indices: [1, 5],
  //         values: [0.5, 0.5]
  //     },
  //     metadata: {'genre': 'drama'},
  //   },
  //   {
  //     id: 'vec2',
  //     values: exampleVector,
  //     metadata: {'genre': 'action'},
  //     sparseValues: {
  //         indices: [5, 6],
  //         values: [0.4, 0.5]
  //     }
  //   }
  // ])
  if (!index) {
    throw new Error('Failed to initialize Pinecone index');
  }
  return index;
};

// Embedding API Client
const embeddingClient = {
  getEmbeddings: async (text) => {
    try {
      const response = await axios.post('http://192.168.0.86:5000/embed', {
        text: text
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Log the raw response for debugging
      //console.log('Raw embedding response:', response.data);

      let embeddings = response.data;
 
      // Handle different response formats
      if (typeof embeddings === 'string') {
        try {
          embeddings = JSON.parse(embeddings);
        } catch (e) {
          console.error('Failed to parse embeddings string:', e);
          throw new Error('Invalid embedding format');
        }
      }

      // Ensure embeddings is an array of numbers
      if (!Array.isArray(embeddings)) {
        console.error('Embeddings is not an array:', embeddings);
        throw new Error('Embeddings must be an array');
      }

      // Verify each element is a number
      if (!embeddings.every(num => typeof num === 'number')) {
        console.error('Embeddings contains non-numeric values:', embeddings);
        throw new Error('Embeddings must be an array of numbers');
      }

      return embeddings;
    } catch (error) {
      console.error('Embedding API error:', error);
      throw error;
    }
  }
};

module.exports = {
  mongoClient,
  pineconeClient,
  embeddingClient
};