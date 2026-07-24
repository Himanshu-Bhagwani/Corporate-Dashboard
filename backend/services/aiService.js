const ollamaProvider = require('./ollamaProvider');
const geminiProvider = require('./geminiProvider');

// Preferred provider: Gemini when a key is configured (fast, no local setup),
// otherwise local Ollama. The other provider acts as a fallback either way.
const getProviders = () => {
  if (process.env.GEMINI_API_KEY) {
    return [
      { name: 'Gemini', provider: geminiProvider },
      { name: 'Ollama', provider: ollamaProvider },
    ];
  }
  return [
    { name: 'Ollama', provider: ollamaProvider },
    { name: 'Gemini', provider: geminiProvider },
  ];
};

const generateResponse = async (prompt, systemPrompt = '', jsonFormat = false) => {
  const providers = getProviders();
  let lastErr;
  for (const { name, provider } of providers) {
    try {
      console.log(`[AI Service] generate via ${name}`);
      return await provider.generate(prompt, systemPrompt, jsonFormat);
    } catch (err) {
      lastErr = err;
      console.error(`[AI Service] ${name} generate failed:`, err.message);
    }
  }
  throw lastErr || new Error('No AI provider available');
};

const generateStreamResponse = async (prompt, systemPrompt = '') => {
  const providers = getProviders();
  let lastErr;
  for (const { name, provider } of providers) {
    try {
      console.log(`[AI Service] stream via ${name}`);
      return await provider.stream(prompt, systemPrompt);
    } catch (err) {
      lastErr = err;
      console.error(`[AI Service] ${name} stream failed:`, err.message);
    }
  }
  throw lastErr || new Error('No AI provider available');
};

module.exports = {
  generateResponse,
  generateStreamResponse
};
