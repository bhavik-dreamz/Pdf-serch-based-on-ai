const getEmbeddings = require('../clients/jina');
const {pineconeClientCached} = require('../clients/pinecone');

function sanitizeMetadata(metadata) {
  const result = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.every(v => typeof v === "string"))
    ) {
      result[key] = value;
    } else {
      // Convert objects/arrays to JSON string
      result[key] = JSON.stringify(value);
    }
  }
  return result;
}

const pineconeClientStoreEmbeddings = async (textChunks, metadata = []) => {
  try {
    const pineconeResponses = [];
    console.log("Generating embeddings for", textChunks.length, "text chunks...");
    
    // Get embeddings from Jina API
    const embeddings = await getEmbeddings(textChunks);
    console.log("Received", embeddings.length, "embeddings from Jina API");
    
    // Prepare vectors for Pinecone
    const vectors = embeddings.map((embedding, index) => ({
      id: `chunk-${Date.now()}-${index}`, // Generate unique IDs
      values: embedding.embedding, // Jina API returns embeddings in 'embedding' field
      metadata: {
        text: textChunks[index],
        timestamp: new Date().toISOString(),
        ...sanitizeMetadata(metadata),
        // pdfId will be included if present in metadata argument
      }
    }));
    console.log("Prepared", vectors.length, "vectors for Pinecone");

    console.log("Storing", vectors.length, "embeddings in Pinecone...");
    const index = await pineconeClientCached();
    
    // Batch upsert - Pinecone recommends batches of 100-1000 vectors
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      console.log(`Upserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(vectors.length/batchSize)}`);
      const response = await index.namespace('default').upsert(batch);
      pineconeResponses.push(response);
    }
    
    console.log("Successfully stored all embeddings in Pinecone");
    return {
      vectors,
      embeddings,
      pineconeResponse: pineconeResponses
    };
    
  } catch (error) {
    console.error("Error storing embeddings:", error);
    throw error;
  }
};


module.exports = pineconeClientStoreEmbeddings;

