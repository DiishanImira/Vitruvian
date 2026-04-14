'use strict';

/**
 * Server Tool Routes
 *
 * These endpoints are called by ElevenLabs Conversational AI agent
 * during a live call. They must respond fast (<2 seconds).
 */

const express = require('express');
const router = express.Router();
const db = require('../services/db');
const twilio = require('twilio');

// ─── get_member_context ───────────────────────────────────────────────────

router.post('/get-context', async (req, res) => {
  const { phone_number } = req.body;

  if (!phone_number) {
    return res.json({ known_member: false, error: 'No phone number provided' });
  }

  console.log(`[tool/get-context] Looking up ${phone_number}`);
  const context = await db.getFullContext(phone_number);

  if (context.known_member) {
    console.log(`[tool/get-context] Found: ${context.name} (${context.calls} calls)`);
  } else {
    console.log(`[tool/get-context] Unknown caller: ${phone_number}`);
  }

  res.json(context);
});

// ─── save_note ────────────────────────────────────────────────────────────

router.post('/save-note', (req, res) => {
  const { phone_number, note } = req.body;

  if (!phone_number || !note) {
    return res.json({ success: false, error: 'Missing phone_number or note' });
  }

  console.log(`[tool/save-note] ${phone_number}: "${note}"`);
  db.saveNote(phone_number, note);

  res.json({ success: true });
});

// ─── log_mood ─────────────────────────────────────────────────────────────

router.post('/log-mood', (req, res) => {
  const { phone_number, mood, context } = req.body;

  if (!phone_number || !mood) {
    return res.json({ success: false, error: 'Missing phone_number or mood' });
  }

  console.log(`[tool/log-mood] ${phone_number}: ${mood} — ${context || ''}`);
  db.saveNote(phone_number, `MOOD: ${mood}${context ? ' — ' + context : ''}`);

  res.json({ success: true });
});

// ─── update_progress ──────────────────────────────────────────────────────

router.post('/update-progress', async (req, res) => {
  const { phone_number, days_clean, current_module } = req.body;

  if (!phone_number) {
    return res.json({ success: false, error: 'Missing phone_number' });
  }

  console.log(`[tool/update-progress] ${phone_number}: days_clean=${days_clean}, module=${current_module}`);

  const updates = {};
  if (days_clean !== undefined) updates.daysSober = days_clean;
  if (current_module !== undefined) updates.currentModule = current_module;

  await db.upsertMember(phone_number, updates);

  res.json({ success: true, updated: updates });
});

// ─── send_sms ─────────────────────────────────────────────────────────────

router.post('/send-sms', async (req, res) => {
  const { phone_number, message } = req.body;

  if (!phone_number || !message) {
    return res.json({ success: false, error: 'Missing phone_number or message' });
  }

  console.log(`[tool/send-sms] Sending to ${phone_number}: "${message.slice(0, 50)}..."`);

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone_number,
    });

    console.log(`[tool/send-sms] Sent — SID: ${result.sid}`);
    res.json({ success: true, message_sid: result.sid });
  } catch (err) {
    console.error(`[tool/send-sms] Failed:`, err.message);
    res.json({ success: false, error: err.message });
  }
});

// POST /api/tools/search-history
// ElevenLabs server tool — search past call content by topic/theme
router.post('/search-history', async (req, res) => {
  const { phone_number, query } = req.body;

  console.log(`[tools/search-history] ${phone_number}: "${query}"`);

  if (!phone_number || !query) {
    return res.json({ found: false, message: 'Missing phone_number or query' });
  }

  try {
    const results = await db.searchCallHistory(phone_number, query);

    if (results.length === 0) {
      return res.json({
        found: false,
        message: `No call history found matching "${query}".`
      });
    }

    const formatted = results.map(r =>
      `[${r.date}] ${r.text}`
    ).join('\n\n---\n\n');

    return res.json({
      found: true,
      results: formatted,
      count: results.length,
    });
  } catch (err) {
    console.error('[tools/search-history] Error:', err.message);
    return res.json({ found: false, message: 'Search failed — try again.' });
  }
});

module.exports = router;
