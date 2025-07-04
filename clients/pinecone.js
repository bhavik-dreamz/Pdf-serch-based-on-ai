const { Pinecone } = require("@pinecone-database/pinecone");

const pineconeClient = async () => {
  try {
    // Validate environment variables
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY environment variable is not set");
    }
    
    if (!process.env.PINECONE_INDEX_NAME) {
      throw new Error("PINECONE_INDEX_NAME environment variable is not set");
    }

    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    console.log("Pinecone client initialized");
    
    // Get the index - this doesn't actually connect, just creates a reference
    const index = pc.index(process.env.PINECONE_INDEX_NAME);
    
    // Optional: Test the connection by describing the index
    try {
      const indexStats = await index.describeIndexStats();
      console.log("Connected to Pinecone index:", process.env.PINECONE_INDEX_NAME);
      console.log("Index stats:", {
        totalVectorCount: indexStats.totalVectorCount,
        dimension: indexStats.dimension
      });
    } catch (describeError) {
      console.warn("Warning: Could not describe index (index might not exist or no permission):", describeError.message);
      // Don't throw here - the index reference might still work for operations
    }

    return index;
    
  } catch (error) {
    console.error("Failed to initialize Pinecone client:", error.message);
    throw error;
  }
};

// Alternative version with connection caching to avoid recreating clients
let cachedIndex = null;

const pineconeClientCached = async () => {
  if (cachedIndex) {
    return cachedIndex;
  }

  try {
    if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
      throw new Error("Missing required Pinecone environment variables");
    }

    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    const index = pc.index(process.env.PINECONE_INDEX_NAME);
    
    // Test the connection
    await index.describeIndexStats();
    console.log("Pinecone connection established and cached");
    
    cachedIndex = index;
    return index;
    
  } catch (error) {
    console.error("Pinecone connection failed:", error.message);
    cachedIndex = null; // Reset cache on error
    throw error;
  }
};

module.exports = {
  pineconeClient,
  pineconeClientCached
};