'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');

const { callClaude } = require('../services/claude');
const { sendSMS } = require('../services/twilio');
const memory = require('../services/memory');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'gyasi-system.md'),
  'utf-8'
);

function getSignedUrl(agentId, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse ElevenLabs response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

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

  const streamUrl = `wss://api.elevenlabs.io/v1/convai/twilio?agent_id=${agentId}`;

  console.log(`[twilio/voice] Connecting to ElevenLabs agent: ${agentId}`);

  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="xi_api_key" value="${elevenLabsKey}" />
    </Stream>
  </Connect>
</Response>`);
});

router.post('/sms', async (req, res) => {
  const from = req.body.From;
  const incomingText = (req.body.Body || '').trim();

  console.log(`[twilio/sms] Message from ${from}: "${incomingText}"`);

  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`);

  setImmediate(async () => {
    try {
      const member = memory.getMember(from);
      const story = memory.getStory(from);
      const recentCalls = memory.getRecentCalls(from, 3);

      let contextBlock = '';
      if (member) {
        contextBlock = `\n\nMEMBER CONTEXT (this person is texting you via SMS):\nName: ${member.name}\nPhone: ${from}\nTier: ${member.tier || 'foundation'}\nCalls: ${member.calls || 0}\nDays clean: ${member.daysSober || 0}\n`;
        if (story) {
          contextBlock += `\nMEMBER STORY:\n${story}\n`;
        }
        if (recentCalls.length > 0) {
          const summaries = recentCalls
            .filter(c => c.summary)
            .map(c => `- ${c.date}: ${c.summary}`)
            .join('\n');
          if (summaries) {
            contextBlock += `\nRECENT CALL SUMMARIES:\n${summaries}\n`;
          }
        }
      } else {
        contextBlock = `\n\nMEMBER CONTEXT: Unknown number (${from}). This is either a new person or someone who hasn't signed up yet. Be warm and welcoming. If they seem like they want coaching, suggest they sign up at the website first, or just start the conversation.\n`;
      }

      const smsSystemPrompt = SYSTEM_PROMPT + contextBlock +
        '\n\nIMPORTANT: You are responding via SMS text message. Keep responses concise — 2-4 sentences max. Be warm but brief. No long paragraphs.';

      const messages = [{ role: 'user', content: incomingText }];

      const reply = await callClaude(smsSystemPrompt, messages);

      const chunks = splitSMS(reply);

      for (const chunk of chunks) {
        await sendSMS(from, chunk);
      }

      console.log(`[twilio/sms] Replied to ${from} — ${chunks.length} message(s)`);
    } catch (err) {
      console.error(`[twilio/sms] Error processing message from ${from}:`, err.message);

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

function splitSMS(text, maxLen = 1600) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
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
