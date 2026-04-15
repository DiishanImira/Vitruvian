'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { callClaude } = require('../services/claude');
const { sendSMS } = require('../services/twilio');
const db = require('../services/db');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'gyasi-system.md'),
  'utf-8'
);

router.post('/voice', async (req, res) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const from = req.body.From || 'unknown';

  console.log(`[twilio/voice] Incoming call from ${from}`);

  if (!agentId) {
    console.error('[twilio/voice] ELEVENLABS_AGENT_ID not set!');
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hey, this is Gyasi. The system is still getting set up — please text me and I'll respond right away.</Say>
</Response>`);
    return;
  }

  let firstMessage;
  let contextOverride = '';

  try {
    const [member, story, recentCalls] = await Promise.all([
      db.getMember(from),
      db.getStory(from),
      db.getRecentCalls(from, 3),
    ]);

    if (member) {
      const firstName = member.name ? member.name.split(' ')[0] : 'brother';
      firstMessage = `Hey ${firstName}, good to hear from you.`;

      contextOverride = `\n\n═══════════════════════════════════════\nCALLER CONTEXT (loaded before call — use this immediately):\nName: ${member.name}\nPhone: ${from}\nDays clean: ${member.daysSober || 'unknown'}\nTotal calls: ${member.calls || 0}\n`;

      if (story) {
        contextOverride += `\nMEMBER STORY:\n${story}\n`;
      }

      if (recentCalls.length > 0) {
        const summaries = recentCalls
          .filter(c => c.summary)
          .map(c => `- ${c.date}: ${c.summary}`)
          .join('\n');
        if (summaries) contextOverride += `\nRECENT CALLS:\n${summaries}\n`;
      }

      contextOverride += '═══════════════════════════════════════\n';
      console.log(`[twilio/voice] Known member: ${member.name} — context injected`);
    } else {
      firstMessage = "Hey, this is Gyasi. What's your name, brother?";
      console.log(`[twilio/voice] Unknown caller: ${from}`);
    }
  } catch (err) {
    console.error('[twilio/voice] Context lookup error:', err.message);
    firstMessage = "Hey, this is Gyasi. What's your name, brother?";
  }

  const streamUrl = `wss://api.elevenlabs.io/v1/convai/twilio?agent_id=${agentId}`;

  // Only pass first_message override — small enough for Twilio
  // Full context (story, hypotheses) lives in ElevenLabs agent prompt already
  const configOverride = JSON.stringify({
    agent: { first_message: firstMessage }
  });

  console.log(`[twilio/voice] Connecting to ElevenLabs agent: ${agentId} — first_message: "${firstMessage}"`);

  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="agent_id" value="${agentId}"/>
      <Parameter name="conversation_config_override" value="${configOverride.replace(/"/g, '&quot;')}"/>
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
      const [member, story, recentCalls] = await Promise.all([
        db.getMember(from),
        db.getStory(from),
        db.getRecentCalls(from, 3),
      ]);

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
          if (summaries) contextBlock += `\nRECENT CALL SUMMARIES:\n${summaries}\n`;
        }
      } else {
        contextBlock = `\n\nMEMBER CONTEXT: Unknown number (${from}). This is either a new person or someone who hasn't signed up yet. Be warm and welcoming. If they seem like they want coaching, suggest they sign up at the website first, or just start the conversation.\n`;
      }

      const smsSystemPrompt = SYSTEM_PROMPT + contextBlock +
        '\n\nIMPORTANT: You are responding via SMS text message. Keep responses concise — 2-4 sentences max. Be warm but brief. No long paragraphs.';

      const reply = await callClaude(smsSystemPrompt, [{ role: 'user', content: incomingText }]);
      const chunks = splitSMS(reply);

      for (const chunk of chunks) {
        await sendSMS(from, chunk);
      }

      console.log(`[twilio/sms] Replied to ${from} — ${chunks.length} message(s)`);
    } catch (err) {
      console.error(`[twilio/sms] Error processing message from ${from}:`, err.message);
      try {
        await sendSMS(from, "Hey, I hit a snag on my end. Give me a minute and text me again — I'm here.");
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
