'use strict';

const express = require('express');
const router = express.Router();
const { callClaude } = require('../services/claude');
const { sendSMS } = require('../services/twilio');
const { buildGyasiPrompt } = require('../prompts/gyasi');
const {
  getMember,
  appendHistory,
  getHistory,
} = require('../services/member');

/**
 * POST /webhook/voice
 *
 * Called by Twilio when someone dials the Twilio number.
 * Responds with TwiML that connects the call to ElevenLabs
 * Conversational AI via WebSocket stream.
 *
 * The agent_id must be set in ELEVENLABS_AGENT_ID env var.
 */
router.post('/voice', async (req, res) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const callerNumber = req.body.From || 'unknown';

  console.log(`[twilio/voice] Incoming call from ${callerNumber}`);

  if (!agentId) {
    console.error('[twilio/voice] ELEVENLABS_AGENT_ID not set!');
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hey, this is Gyasi. The system is still getting set up — please text me and I'll respond right away.</Say>
</Response>`);
    return;
  }

  try {
    // Get a signed WebSocket URL from ElevenLabs (avoids embedding API key in TwiML)
    const sigResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      { headers: { 'xi-api-key': elevenLabsKey } }
    );
    const sigData = await sigResponse.json();

    if (!sigData.signed_url) {
      throw new Error(`No signed_url in response: ${JSON.stringify(sigData)}`);
    }

    // ElevenLabs returns a wss://...conversation?... URL — swap path to /twilio for Twilio streams
    const streamUrl = sigData.signed_url.replace('/convai/conversation?', '/convai/twilio?');

    console.log(`[twilio/voice] Using signed stream URL for agent: ${agentId}`);

    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`);
  } catch (err) {
    console.error('[twilio/voice] Failed to get signed URL:', err.message);
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hey, this is Gyasi. I'm having a technical issue right now — please text me instead and I'll respond right away.</Say>
</Response>`);
  }
});

/**
 * POST /webhook/sms
 *
 * Called by Twilio when someone texts the Twilio number.
 * Loads member context, calls Claude as Gyasi, sends SMS reply.
 *
 * Twilio sends form-encoded body with:
 *   From: '+13055551234'
 *   Body: 'the message text'
 */
router.post('/sms', async (req, res) => {
  const from = req.body.From;
  const incomingText = (req.body.Body || '').trim();

  console.log(`[twilio/sms] Message from ${from}: "${incomingText}"`);

  // Respond to Twilio immediately (empty TwiML) — we'll send SMS via API
  // This avoids Twilio's 15s timeout for webhook responses
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`);

  // Process asynchronously after responding
  setImmediate(async () => {
    try {
      // Load member context
      const member = getMember(from);

      // Append incoming message to history
      appendHistory(from, 'user', incomingText);

      // Build prompt with member context (excluding history — passed separately)
      const memberContext = {
        phone: member.phone,
        name: member.name,
        streak: member.streak,
        intake: member.intake,
        joinedAt: member.joinedAt,
      };
      const systemPrompt = buildGyasiPrompt(memberContext);

      // Build conversation messages (last 20 messages)
      const messages = getHistory(from, 20);

      // Ensure the last message is the user's current message
      // (appendHistory already added it, getHistory returns it)
      if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
        messages.push({ role: 'user', content: incomingText });
      }

      // Call Claude (non-streaming for SMS)
      const reply = await callClaude(systemPrompt, messages);

      // Append Gyasi's reply to history
      appendHistory(from, 'assistant', reply);

      // SMS has a 1600 char limit — split if needed
      const chunks = splitSMS(reply);

      for (const chunk of chunks) {
        await sendSMS(from, chunk);
      }

      console.log(`[twilio/sms] Replied to ${from} — ${chunks.length} message(s)`);
    } catch (err) {
      console.error(`[twilio/sms] Error processing message from ${from}:`, err.message);

      // Best-effort fallback SMS
      try {
        await sendSMS(
          from,
          "Hey, I hit a snag on my end. Give me a minute and text me again — I'm here."
        );
      } catch (fallbackErr) {
        console.error('[twilio/sms] Fallback SMS also failed:', fallbackErr.message);
      }
    }
  });
});

/**
 * Split a long message into SMS-sized chunks (max 1600 chars each).
 * Tries to split on sentence boundaries.
 * @param {string} text
 * @returns {string[]}
 */
function splitSMS(text, maxLen = 1600) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to find a sentence boundary
    let splitAt = remaining.lastIndexOf('. ', maxLen);
    if (splitAt === -1) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt === -1) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt + 1).trim());
    remaining = remaining.slice(splitAt + 1).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

module.exports = router;
