'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files (signup page)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Gyasi AI Coach — Vitruvian Man',
    version: '2.0.0',
    endpoints: {
      signup: 'GET /signup.html | POST /api/signup',
      tools: 'POST /api/tools/*',
      webhooks: 'POST /webhooks/*',
      sms: 'POST /webhook/sms',
    },
  });
});

// Root → redirect to signup page
app.get('/', (req, res) => {
  res.redirect('/signup.html');
});

// Signup
const signupRouter = require('./routes/signup');
app.use('/api', signupRouter);

// ElevenLabs server tools
const toolsRouter = require('./routes/tools');
app.use('/api/tools', toolsRouter);

// Webhooks (ElevenLabs post-call + Twilio status)
const webhooksRouter = require('./routes/webhooks');
app.use('/webhooks', webhooksRouter);

// Twilio SMS webhook (legacy — keep for existing config)
const twilioRouter = require('./routes/twilio');
app.use('/webhook', twilioRouter);

// Debug endpoints (non-production)
if (process.env.NODE_ENV !== 'production') {
  const memory = require('./services/memory');

  app.get('/debug/members', (req, res) => {
    res.json(memory.listMembers());
  });

  app.get('/debug/story/:phone', (req, res) => {
    const phone = '+' + req.params.phone.replace(/[^0-9]/g, '');
    const story = memory.getStory(phone);
    if (story) {
      res.type('text/markdown').send(story);
    } else {
      res.status(404).json({ error: 'No story found for ' + phone });
    }
  });

  app.get('/debug/calls/:phone', (req, res) => {
    const phone = '+' + req.params.phone.replace(/[^0-9]/g, '');
    res.json(memory.getRecentCalls(phone, 10));
  });
}

// Temporary admin: delete a member and all their data
app.delete('/admin/delete-member/:phone', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const memory = require('./services/memory');
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const phone = '+' + req.params.phone.replace(/[^0-9]/g, '');

  const index = memory.listMembers();
  const existed = !!index[phone];
  delete index[phone];
  fs.writeFileSync(path.join(DATA_DIR, 'members.json'), JSON.stringify(index, null, 2));

  const storyFile = path.join(DATA_DIR, 'stories', `${phone}.md`);
  if (fs.existsSync(storyFile)) fs.unlinkSync(storyFile);

  const callsDir = path.join(DATA_DIR, 'calls', phone);
  if (fs.existsSync(callsDir)) fs.rmSync(callsDir, { recursive: true, force: true });

  const notesFile = path.join(DATA_DIR, 'notes', `${phone}_current.json`);
  if (fs.existsSync(notesFile)) fs.unlinkSync(notesFile);

  console.log(`[admin] Deleted all data for ${phone}`);
  res.json({ success: true, phone, existed });
});

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
  console.log('  ║     Gyasi AI Coach — Vitruvian Man   ║');
  console.log('  ║         Narrative Memory v2.0         ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  🌐  Server:     http://localhost:${PORT}`);
  console.log(`  📝  Signup:     http://localhost:${PORT}/signup.html`);
  console.log(`  🔧  Tools:     POST /api/tools/*`);
  console.log(`  📡  Webhooks:  POST /webhooks/*`);
  console.log(`  📱  SMS:       POST /webhook/sms`);
  console.log('');

  const required = ['ANTHROPIC_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn('  ⚠️  Missing env vars:', missing.join(', '));
  }
  console.log('');
});

module.exports = app;
