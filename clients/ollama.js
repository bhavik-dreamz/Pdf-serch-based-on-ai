const fetch = require('node-fetch');

class OllamaAI {
    constructor(model = 'llama3.2') {
        this.baseUrl = 'http://localhost:11434';
        this.model = model;
    }

    async generate(prompt) {
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            const data = await response.json();
            // Ollama returns the result in the 'response' field
            return data.response;
        } catch (error) {
            throw new Error(`Failed to connect to Ollama: ${error.message}`);
        }
    }

    async isAvailable() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            return response.ok;
        } catch {
            return false;
        }
    }
}

const ollama = new OllamaAI('llama3.2');

module.exports = ollama;