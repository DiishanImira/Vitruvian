#!/usr/bin/env node
'use strict';

/**
 * create-agent.js
 *
 * Creates the ElevenLabs Conversational AI agent for Gyasi.
 * Run this once to get your agent_id (or re-run to create a new agent).
 *
 * Usage:
 *   node scripts/create-agent.js
 *
 * IMPORTANT NOTE on Custom LLM:
 * The Gyasi voice (VcnjiECS8LNCkWQkd4p8) is an Instant Voice Clone (IVC).
 * ElevenLabs does NOT allow Custom LLM endpoints with IVC voices.
 * This script uses ElevenLabs' native Claude integration (claude-3-5-sonnet)
 * with the full Gyasi system prompt embedded directly.
 *
 * To use a Custom LLM (/llm endpoint), Diishan would need to upgrade
 * Gyasi's voice clone to a Professional Voice Clone (PVC) in ElevenLabs.
 * See: https://elevenlabs.io/voice-lab
 *
 * After running, copy the agent_id into your .env:
 *   ELEVENLABS_AGENT_ID=<agent_id>
 */

require('dotenv').config();

const { buildGyasiPrompt } = require('../src/prompts/gyasi');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'VcnjiECS8LNCkWQkd4p8';

if (!ELEVENLABS_API_KEY) {
  console.error('Error: ELEVENLABS_API_KEY not set in .env');
  process.exit(1);
}

async function createAgent() {
  // Build the full Gyasi prompt (no member context for voice — anonymous caller)
  const systemPrompt = buildGyasiPrompt(null);

  console.log('Creating ElevenLabs Conversational AI agent...');
  console.log(`Voice ID: ${VOICE_ID}`);
  console.log(`LLM: claude-3-5-sonnet (ElevenLabs native — required for IVC voices)`);
  console.log('');

  const payload = {
    name: 'Gyasi Hantman — Vitruvian Man Coach',
    conversation_config: {
      agent: {
        first_message: "Hey, this is Gyasi. I'm glad you called. How are you doing right now?",
        language: 'en',
        prompt: {
          prompt: systemPrompt,
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

    console.log('✅ Agent created successfully!');
    console.log('');
    console.log(`Agent ID: ${agentId}`);
    console.log('');
    console.log('Next steps:');
    console.log(`1. Add to your .env file:`);
    console.log(`   ELEVENLABS_AGENT_ID=${agentId}`);
    console.log('');
    console.log('2. Set Twilio webhook URLs (after Replit deploy):');
    console.log('   Voice: https://YOUR_REPLIT_URL.repl.co/webhook/voice');
    console.log('   SMS:   https://YOUR_REPLIT_URL.repl.co/webhook/sms');
    console.log('');
    console.log('3. To upgrade to Custom LLM (more control, member context on calls):');
    console.log('   → Upgrade Gyasi\'s voice to Professional Voice Clone in ElevenLabs');
    console.log('   → Then update the agent to use llm: "custom-llm" with your /llm URL');
    console.log('');
    console.log('Full response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to create agent:', err.message);
    process.exit(1);
  }
}

createAgent();
