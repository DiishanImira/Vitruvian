'use strict';

const express = require('express');
const router = express.Router();
const { streamClaude } = require('../services/claude');
const { buildGyasiPrompt } = require('../prompts/gyasi');

/**
 * POST /llm
 *
 * ElevenLabs Conversational AI custom LLM endpoint.
 * ElevenLabs sends conversation history in OpenAI format and expects
 * a streaming SSE response in OpenAI streaming format.
 *
 * Request body (from ElevenLabs):
 * {
 *   model: "...",
 *   messages: [{role: "user", content: "..."}, ...],
 *   stream: true
 * }
 *
 * Response: Server-Sent Events (SSE) in OpenAI streaming format:
 * data: {"choices":[{"delta":{"content":"Hey..."}}]}
 * data: [DONE]
 */
router.post('/', async (req, res) => {
  const { messages = [] } = req.body;

  console.log(`[elevenlabs/llm] Incoming request — ${messages.length} messages`);

  // Set SSE headers — ElevenLabs expects OpenAI streaming format
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if applicable
  res.flushHeaders();

  try {
    // Filter out any system messages ElevenLabs might send — we provide our own
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Build Gyasi system prompt (no member context for voice — anon caller)
    // In Phase 2, we could look up caller ID from ElevenLabs metadata
    const systemPrompt = buildGyasiPrompt(null);

    // Stream from Claude
    const stream = await streamClaude(systemPrompt, conversationMessages);

    // Forward Claude stream as OpenAI-format SSE
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;

        // OpenAI streaming format
        const payload = JSON.stringify({
          choices: [
            {
              delta: { content: text },
              index: 0,
              finish_reason: null,
            },
          ],
        });

        res.write(`data: ${payload}\n\n`);
      }
    }

    // Signal end of stream
    res.write('data: [DONE]\n\n');
    res.end();

    console.log('[elevenlabs/llm] Stream complete');
  } catch (err) {
    console.error('[elevenlabs/llm] Error:', err.message);

    // Try to send an error event before closing
    if (!res.writableEnded) {
      const errorPayload = JSON.stringify({
        choices: [
          {
            delta: {
              content: "I'm having a moment. Give me a second and let's try again.",
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
      });
      res.write(`data: ${errorPayload}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

module.exports = router;
