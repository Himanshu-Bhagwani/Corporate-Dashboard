const ollamaProvider = require('./ollamaProvider');
const geminiProvider = require('./geminiProvider');

// Dynamically select provider based on GEMINI_API_KEY existence
const getProvider = () => {
  if (process.env.GEMINI_API_KEY) {
    console.log('[AI Service] Using Google Gemini API provider');
    return geminiProvider;
  } else {
    console.log('[AI Service] Using local Ollama provider');
    return ollamaProvider;
  }
};

const generateResponse = async (prompt, systemPrompt = '', jsonFormat = false) => {
  const provider = getProvider();
  return provider.generate(prompt, systemPrompt, jsonFormat);
};

const generateStreamResponse = async (prompt, systemPrompt = '') => {
  const provider = getProvider();
  return provider.stream(prompt, systemPrompt);
};

module.exports = {
  generateResponse,
  generateStreamResponse
};
