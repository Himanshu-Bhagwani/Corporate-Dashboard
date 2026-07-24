const fetch = require('node-fetch');
const { Transform } = require('stream');

// Free-tier quotas are tracked per model, so when the primary model is rate
// limited (429) another model in this list usually still has headroom.
const MODEL_CANDIDATES = () => [
  process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
].filter((m, i, arr) => arr.indexOf(m) === i);

class GeminiProvider {
  async generate(prompt, systemPrompt = '', jsonFormat = false) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not defined.');
    }

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    if (jsonFormat) {
      body.generationConfig = {
        responseMimeType: 'application/json'
      };
    }

    let lastError;
    for (const model of MODEL_CANDIDATES()) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errorText = await response.text();
          // Quota / model errors: try the next model. Anything else is fatal.
          if (response.status === 429 || response.status === 404 || response.status === 503) {
            lastError = new Error(`Gemini ${model}: ${response.status} ${response.statusText}`);
            console.warn(`[Gemini] ${model} unavailable (${response.status}), trying next model...`);
            continue;
          }
          throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text === undefined) {
          throw new Error('Gemini API returned empty candidate response.');
        }

        if (jsonFormat) {
          // Strip markdown code blocks if the model wrapped the response in them
          text = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
        }

        return text;
      } catch (err) {
        // Network-level failure — record and try next model.
        lastError = err;
        if (!String(err.message).startsWith('Gemini')) {
          console.warn(`[Gemini] ${model} failed: ${err.message}`);
        }
      }
    }
    throw lastError || new Error('All Gemini models failed');
  }

  async stream(prompt, systemPrompt = '') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not defined.');
    }

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    let response = null;
    let lastError;
    for (const model of MODEL_CANDIDATES()) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      try {
        const attempt = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!attempt.ok) {
          const errorText = await attempt.text();
          if (attempt.status === 429 || attempt.status === 404 || attempt.status === 503) {
            lastError = new Error(`Gemini ${model}: ${attempt.status} ${attempt.statusText}`);
            console.warn(`[Gemini] stream ${model} unavailable (${attempt.status}), trying next model...`);
            continue;
          }
          throw new Error(`Gemini API error: ${attempt.statusText} - ${errorText}`);
        }
        response = attempt;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!response) {
      throw lastError || new Error('All Gemini models failed');
    }

    // Transform stream that converts Gemini SSE format to plain text tokens
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
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr) {
              try {
                const data = JSON.parse(jsonStr);
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (text) {
                  this.push(text);
                }
              } catch (err) {
                // Skip parse errors for incomplete JSON
              }
            }
          }
        }
        callback();
      },
      flush(callback) {
        if (this.buffer.trim().startsWith('data:')) {
          const jsonStr = this.buffer.trim().slice(5).trim();
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              this.push(text);
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

module.exports = new GeminiProvider();
