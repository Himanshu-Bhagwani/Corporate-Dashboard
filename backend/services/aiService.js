const fetch = require('node-fetch'); // Ensure node-fetch is available in Node 18+ it is native, but just in case we use native fetch.

const OLLAMA_URL = 'http://ollama:11434/api/generate';
const MODEL = 'llama3.2:1b';

const generateResponse = async (prompt, systemPrompt = '', jsonFormat = false) => {
  try {
    const payload = {
      model: MODEL,
      prompt: prompt,
      system: systemPrompt,
      stream: false,
    };
    
    if (jsonFormat) {
      payload.format = 'json';
    }

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('AI Service Error:', error);
    throw error;
  }
};

module.exports = {
  generateResponse
};
