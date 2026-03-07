'use strict';

/**
 * Webhook Routes
 * 
 * POST /webhooks/conversation-end — ElevenLabs fires this after every call.
 * Triggers the full post-call pipeline:
 *   1. Save transcript
 *   2. Generate summary
 *   3. Rewrite member story
 *   4. Update index
 */

const express = require('express');
const router = express.Router();
const memory = require('../services/memory');
const { summarizeTranscript, rewriteStory } = require('../services/story-writer');

router.post('/conversation-end', async (req, res) => {
  const {
    conversation_id,
    agent_id,
    call_duration_secs,
    transcript,
    dynamic_variables,
  } = req.body;

  // Respond immediately — processing happens async
  res.json({ received: true });

  // Determine phone number
  const phone = dynamic_variables?.phone_number
    || dynamic_variables?.system__caller_id
    || req.body.caller_id;

  if (!phone) {
    console.error('[webhook/conversation-end] No phone number found in payload');
    return;
  }

  console.log(`[webhook/conversation-end] Call ended: ${conversation_id} (${phone}, ${call_duration_secs}s)`);

  const member = memory.getMember(phone);
  const memberName = member?.name || 'Unknown';

  // ── Step 1: Save raw call data ──
  const callData = {
    conversation_id,
    phone,
    date: new Date().toISOString().slice(0, 10),
    started_at: new Date().toISOString(),
    duration_secs: call_duration_secs,
    outcome: 'completed',
    transcript: transcript || '',
    summary: null,
    mood: null,
    tools_used: [],
  };

  // ── Step 2: Generate summary ──
  if (transcript) {
    try {
      console.log(`[webhook] Generating summary for ${memberName}...`);
      callData.summary = await summarizeTranscript(transcript, memberName);
      console.log(`[webhook] Summary generated (${callData.summary.length} chars)`);
    } catch (err) {
      console.error(`[webhook] Summary generation failed:`, err.message);
      callData.summary = `Call on ${callData.date}. Duration: ${call_duration_secs}s. Summary generation failed.`;
    }
  }

  // Save call to archive
  const filename = memory.saveCall(phone, callData);
  console.log(`[webhook] Call saved: ${filename}`);

  // ── Step 3: Rewrite member story ──
  if (member && transcript) {
    try {
      console.log(`[webhook] Rewriting story for ${memberName}...`);

      const previousStory = memory.getStory(phone) || '';
      const allCalls = memory.getRecentCalls(phone, 50); // Get all calls
      const callSummaries = allCalls.map(c => ({
        date: c.date,
        summary: c.summary || 'No summary.',
      }));
      const midCallNotes = memory.getNotes(phone);

      const newStory = await rewriteStory(member, previousStory, callSummaries, midCallNotes);
      memory.writeStory(phone, newStory);
      console.log(`[webhook] Story rewritten for ${memberName} (${newStory.length} chars)`);

      // Clear mid-call notes after processing
      memory.clearNotes(phone);
    } catch (err) {
      console.error(`[webhook] Story rewrite failed:`, err.message);
    }
  }

  // ── Step 4: Update index ──
  const callCount = memory.getCallCount(phone);
  memory.upsertMember(phone, {
    calls: callCount,
    lastCall: new Date().toISOString().slice(0, 10),
    lastOutcome: 'completed',
    status: 'active',
  });

  console.log(`[webhook] Post-call pipeline complete for ${memberName} (${phone})`);
});

// Twilio call status (optional — for tracking)
router.post('/call-status', (req, res) => {
  const { CallSid, CallStatus, To, Duration } = req.body;
  console.log(`[webhook/call-status] ${CallSid}: ${CallStatus} → ${To} (${Duration || 0}s)`);
  res.sendStatus(200);
});

module.exports = router;
