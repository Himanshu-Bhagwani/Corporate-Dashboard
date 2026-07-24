const fetch = require('node-fetch');
const { Transform } = require('stream');

// Configurable so the same code runs in docker (http://ollama:11434) and on a
// local dev machine (http://localhost:11434).
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

class OllamaProvider {
  async generate(prompt, systemPrompt = '', jsonFormat = false) {
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
  }

  async stream(prompt, systemPrompt = '') {
    const payload = {
      model: MODEL,
      prompt: prompt,
      system: systemPrompt,
      stream: true,
    };

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    // Transform stream that converts Ollama NDJSON chunks to plain text tokens
    const textDecoder = new Transform({
      writableObjectMode: false,
      readableObjectMode: false,
      construct(callback) {
        this.buffer = '';
        callback();
      },
      transform(chunk, encoding, callback) {
        this.buffer += chunk.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop(); // keep last incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              this.push(parsed.response);
            }
          } catch (err) {
            // Skip parse errors for incomplete JSON
          }
        }
        callback();
      },
      flush(callback) {
        if (this.buffer.trim()) {
          try {
            const parsed = JSON.parse(this.buffer);
            if (parsed.response) {
              this.push(parsed.response);
            }
          } catch (err) {
            // Ignore
          }
        }
        callback();
      }
    });

    return response.body.pipe(textDecoder);
  }
}

module.exports = new OllamaProvider();
