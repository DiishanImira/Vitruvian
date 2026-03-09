#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'prompts', 'gyasi-system.md'),
  'utf-8'
);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'ta5vPsZm54WOCYibe6OP';

if (!ELEVENLABS_API_KEY) {
  console.error('Error: ELEVENLABS_API_KEY not set in .env');
  process.exit(1);
}

async function createAgent() {
  console.log('Creating ElevenLabs Conversational AI agent...');
  console.log(`Voice ID: ${VOICE_ID}`);
  console.log(`LLM: claude-3-5-sonnet (ElevenLabs native)`);
  console.log('');

  const payload = {
    name: 'Gyasi Hantman — Vitruvian Man Coach',
    conversation_config: {
      agent: {
        first_message: "Hey brother, what's up, how you feeling?",
        language: 'en',
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: 'claude-3-5-sonnet',
        },
      },
      tts: {
        voice_id: VOICE_ID,
        model_id: 'eleven_turbo_v2',
        optimize_streaming_latency: 3,
      },
    },
  };

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('ElevenLabs API error:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const agentId = data.agent_id;

    console.log('Agent created successfully!');
    console.log('');
    console.log(`Agent ID: ${agentId}`);
    console.log('');
    console.log('Next steps:');
    console.log(`1. Add to your .env file:`);
    console.log(`   ELEVENLABS_AGENT_ID=${agentId}`);
    console.log('');
    console.log('2. Configure ElevenLabs server tools pointing to your deployed URL:');
    console.log('   - get_member_context: POST /api/tools/get-context');
    console.log('   - save_note: POST /api/tools/save-note');
    console.log('   - log_mood: POST /api/tools/log-mood');
    console.log('   - update_progress: POST /api/tools/update-progress');
    console.log('   - send_sms: POST /api/tools/send-sms');
    console.log('');
    console.log('3. Set ElevenLabs post-call webhook:');
    console.log('   POST https://YOUR_URL/webhooks/conversation-end');
    console.log('');
    console.log('4. Set Twilio webhook URLs:');
    console.log('   Voice: https://YOUR_URL/webhook/voice');
    console.log('   SMS:   https://YOUR_URL/webhook/sms');
    console.log('');
    console.log('Full response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to create agent:', err.message);
    process.exit(1);
  }
}

createAgent();
