const fetch = require('node-fetch');
const { Transform } = require('stream');

class GeminiProvider {
  async generate(prompt, systemPrompt = '', jsonFormat = false) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not defined.');
    }

    // Default to gemini-2.0-flash
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
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

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
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
  }

  async stream(prompt, systemPrompt = '') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not defined.');
    }

    // Default to gemini-2.0-flash
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

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

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
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
