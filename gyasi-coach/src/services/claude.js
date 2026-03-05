'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

/**
 * Non-streaming Claude call — used for SMS responses.
 *
 * @param {string} systemPrompt - Gyasi system prompt with member context
 * @param {Array<{role: string, content: string}>} messages - conversation history
 * @returns {Promise<string>} - assistant reply text
 */
async function callClaude(systemPrompt, messages) {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    });

    return response.content[0].text;
  } catch (err) {
    console.error('[claude] Error calling Claude API:', err.message);
    throw err;
  }
}

/**
 * Streaming Claude call — used for ElevenLabs /llm endpoint.
 * Returns an async iterable of text chunks.
 *
 * @param {string} systemPrompt
 * @param {Array<{role: string, content: string}>} messages
 * @returns {AsyncIterable} - stream of text chunks
 */
async function streamClaude(systemPrompt, messages) {
  try {
    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    });

    return stream;
  } catch (err) {
    console.error('[claude] Error starting Claude stream:', err.message);
    throw err;
  }
}

module.exports = { callClaude, streamClaude };
