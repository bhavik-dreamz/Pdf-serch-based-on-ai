const axios = require("axios");

const getEmbeddings = async (texts) => {
    // texts: array of strings (chunks)
    try {
      const input = texts.map((text) => ({ text }));
      const response = await axios.post(
        "https://api.jina.ai/v1/embeddings",
        {
          model: "jina-embeddings-v4",
          task: "text-matching",
          "dimensions": 1024,
          input,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.JINA_API_KEY}`, // Store your key in .env
          },
        }
      );
      // response.data.data is an array of embeddings
      return response.data.data;
    } catch (error) {
      console.error("Jina Embedding API error:", error.response?.data || error);
      throw error;
    }
};


// Exporting the getEmbeddings function
module.exports =  getEmbeddings;