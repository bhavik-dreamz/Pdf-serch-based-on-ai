const ollama = require('../clients/ollama');

const parseCV = async (text) => {
  const prompt = `
Extract the following information from this CV/resume:
- Name
- Email
- Phone
- Education
- Work Experience
- Skills

Return the result as a JSON object.

CV:
${text}
  `;
  
  const response = await ollama.generate(prompt);

  console.log(
    "chatCompletion.choices[0].message",
    response
  );

  // The model's output is in response.generated_text
  try {
    // Try to extract JSON from the output
    const jsonStart = response.indexOf("{");
    const jsonEnd = response.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonString = response.substring(jsonStart, jsonEnd + 1);
      return JSON.parse(jsonString);
    }
    return { raw: response };
  } catch (e) {
    return { raw: response };
  }
};

const textgenerator = async (jsonData, question) => {
  const prompt = `You are an AI assistant that helps users find information from a provided JSON dataset.
The JSON data will be provided below. Search through this data to answer the user's question.
When you answer, reference the relevant JSON fields or objects that support your answer.

Return your answer as a JSON object with the following format:
{
  "answer": "<your answer here>",
  "references": [
    {
      "field": "<JSON field or path>",
      "value": "<value from JSON>"
    }
    // ... more references if relevant
  ]
}

JSON Data: ${JSON.stringify(jsonData, null, 2)}

Question: ${question}

Answer:`;

  const response = await ollama.generate(prompt);

  try {
    // Try to parse the whole response as JSON
    return JSON.parse(response);
  } catch (e) {
    // Fallback: try to extract JSON substring
    const jsonStart = response.indexOf("{");
    const jsonEnd = response.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonString = response.substring(jsonStart, jsonEnd + 1);
      try {
        return JSON.parse(jsonString);
      } catch (e2) {
        // Still failed, return raw
      }
    }
    return { 
      raw: response,
      error: "Failed to parse response as JSON"
    };
  }
};

module.exports ={
  parseCV,
  textgenerator
};
