'use strict';

/**
 * Server Tool Routes
 * 
 * These endpoints are called by ElevenLabs Conversational AI agent
 * during a live call. They must respond fast (<2 seconds).
 */

const express = require('express');
const router = express.Router();
const memory = require('../services/memory');
const twilio = require('twilio');

// ─── get_member_context ───────────────────────────────────────────────────
// Called at the start of every call. Returns everything the agent needs.

router.post('/get-context', (req, res) => {
  const { phone_number } = req.body;

  if (!phone_number) {
    return res.json({ known_member: false, error: 'No phone number provided' });
  }

  console.log(`[tool/get-context] Looking up ${phone_number}`);
  const context = memory.getFullContext(phone_number);

  if (context.known_member) {
    console.log(`[tool/get-context] Found: ${context.name} (${context.calls} calls)`);
  } else {
    console.log(`[tool/get-context] Unknown caller: ${phone_number}`);
  }

  res.json(context);
});

// ─── save_note ────────────────────────────────────────────────────────────
// Mid-call: agent saves an observation for post-call story rewrite

router.post('/save-note', (req, res) => {
  const { phone_number, note } = req.body;

  if (!phone_number || !note) {
    return res.json({ success: false, error: 'Missing phone_number or note' });
  }

  console.log(`[tool/save-note] ${phone_number}: "${note}"`);
  memory.saveNote(phone_number, note);

  res.json({ success: true });
});

// ─── log_mood ─────────────────────────────────────────────────────────────
// Mid-call: agent records emotional state

router.post('/log-mood', (req, res) => {
  const { phone_number, mood, context } = req.body;

  if (!phone_number || !mood) {
    return res.json({ success: false, error: 'Missing phone_number or mood' });
  }

  console.log(`[tool/log-mood] ${phone_number}: ${mood} — ${context || ''}`);
  memory.saveNote(phone_number, `MOOD: ${mood}${context ? ' — ' + context : ''}`);

  res.json({ success: true });
});

// ─── update_progress ──────────────────────────────────────────────────────
// Mid-call: member reports milestone (days clean, module progress)

router.post('/update-progress', (req, res) => {
  const { phone_number, days_clean, current_module } = req.body;

  if (!phone_number) {
    return res.json({ success: false, error: 'Missing phone_number' });
  }

  console.log(`[tool/update-progress] ${phone_number}: days_clean=${days_clean}, module=${current_module}`);

  const updates = {};
  if (days_clean !== undefined) updates.daysSober = days_clean;
  if (current_module !== undefined) updates.currentModule = current_module;

  memory.upsertMember(phone_number, updates);

  res.json({ success: true, updated: updates });
});

// ─── send_sms ─────────────────────────────────────────────────────────────
// Mid-call: send a resource via SMS

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

module.exports = router;
