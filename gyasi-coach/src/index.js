'use strict';

require('dotenv').config();

// Must be required before any console.log calls so the buffer captures everything
require('./services/log-buffer');

const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Gyasi AI Coach — Vitruvian Man',
    version: '2.0.0',
    endpoints: {
      signup:   'GET /signup.html | POST /api/signup',
      tools:    'POST /api/tools/*',
      webhooks: 'POST /webhooks/*',
      sms:      'POST /webhook/sms',
      admin:    'GET|DELETE /admin/* (Bearer token required)',
    },
  });
});

app.get('/', (req, res) => res.redirect('/signup.html'));

const signupRouter  = require('./routes/signup');
app.use('/api', signupRouter);

const toolsRouter = require('./routes/tools');
app.use('/api/tools', toolsRouter);

const webhooksRouter = require('./routes/webhooks');
app.use('/webhooks', webhooksRouter);

const twilioRouter = require('./routes/twilio');
app.use('/webhook', twilioRouter);

const adminRouter = require('./routes/admin');
app.use('/admin', adminRouter);

// ── Debug endpoints (non-production only) ────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  const db = require('./services/db');

  app.get('/debug/members', async (req, res) => {
    const members = await db.listMembers();
    res.json(members);
  });

  app.get('/debug/story/:phone', async (req, res) => {
    const phone = '+' + req.params.phone.replace(/[^0-9]/g, '');
    const story = await db.getStory(phone);
    if (story) {
      res.type('text/markdown').send(story);
    } else {
      res.status(404).json({ error: 'No story found for ' + phone });
    }
  });

  app.get('/debug/calls/:phone', async (req, res) => {
    const phone = '+' + req.params.phone.replace(/[^0-9]/g, '');
    const calls = await db.getRecentCalls(phone, 10);
    res.json(calls);
  });

  app.get('/debug/notes/:phone', async (req, res) => {
    const phone = '+' + req.params.phone.replace(/[^0-9]/g, '');
    const notes = await db.listAllNotes(phone, 200);
    res.json(notes);
  });
}

// ── Error handlers ───────────────────────────────────────────────────────────

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
const db   = require('./services/db');

db.initDb()
  .then(() => {
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
      console.log(`  🔐  Admin:     GET|DELETE /admin/* (ADMIN_API_KEY required)`);
      console.log('');

      const required = ['ANTHROPIC_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'ADMIN_API_KEY'];
      const missing  = required.filter(k => !process.env[k]);
      if (missing.length > 0) {
        console.warn('  ⚠️  Missing env vars:', missing.join(', '));
      }
      console.log('');
    });
  })
  .catch(err => {
    console.error('[startup] DB init failed:', err.message);
    process.exit(1);
  });

module.exports = app;
