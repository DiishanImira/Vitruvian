'use strict';

require('dotenv').config();

const express = require('express');
const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────

// Parse JSON (for ElevenLabs /llm requests)
app.use(express.json());

// Parse URL-encoded form data (for Twilio webhooks)
app.use(express.urlencoded({ extended: false }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────

// Healthcheck — Replit requires GET / to return 200
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Gyasi AI Coach' }));

// ElevenLabs custom LLM endpoint
const elevenLabsRouter = require('./routes/elevenlabs');
app.use('/llm', elevenLabsRouter);

// Twilio voice + SMS webhooks
const twilioRouter = require('./routes/twilio');
app.use('/webhook', twilioRouter);

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'alive',
    service: 'Gyasi AI Coach',
    version: '1.0.0',
    phase: 1,
    endpoints: {
      llm: 'POST /llm (ElevenLabs custom LLM)',
      voice: 'POST /webhook/voice (Twilio voice webhook)',
      sms: 'POST /webhook/sms (Twilio SMS webhook)',
    },
  });
});

// Debug: list members (remove in production)
if (process.env.NODE_ENV !== 'production') {
  const { listMembers } = require('./services/member');
  app.get('/debug/members', (req, res) => {
    res.json(listMembers());
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║       Gyasi AI Coach — Phase 1       ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  🎙  Server running on port ${PORT}`);
  console.log(`  📱  SMS webhook:   POST /webhook/sms`);
  console.log(`  📞  Voice webhook: POST /webhook/voice`);
  console.log(`  🤖  LLM endpoint:  POST /llm`);
  console.log('');

  // Validate required env vars
  const required = [
    'ANTHROPIC_API_KEY',
    'ELEVENLABS_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn('  ⚠️  Missing env vars:', missing.join(', '));
  }

  if (!process.env.ELEVENLABS_AGENT_ID) {
    console.warn('  ⚠️  ELEVENLABS_AGENT_ID not set — voice calls will use fallback TwiML');
    console.warn('     Run: node scripts/create-agent.js to create the ElevenLabs agent');
  }

  console.log('');
});

module.exports = app;
