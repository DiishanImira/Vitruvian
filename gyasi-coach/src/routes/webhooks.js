'use strict';

/**
 * Webhook Routes
 *
 * POST /webhooks/conversation-end — ElevenLabs fires this after every call.
 * Triggers the full post-call pipeline:
 *   1. Save transcript to call_transcripts
 *   2. Generate summary → save to call_summaries
 *   3. Rewrite member story
 *   4. Update member profile
 */

const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { summarizeTranscript, rewriteStory } = require('../services/story-writer');

router.post('/conversation-end', async (req, res) => {
  const {
    conversation_id,
    agent_id,
    call_duration_secs,
    transcript,
    dynamic_variables,
  } = req.body;

  res.json({ received: true });

  const phone = dynamic_variables?.phone_number
    || dynamic_variables?.system__caller_id
    || req.body.caller_id;

  if (!phone) {
    console.error('[webhook/conversation-end] No phone number found in payload');
    return;
  }

  console.log(`[webhook/conversation-end] Call ended: ${conversation_id} (${phone}, ${call_duration_secs}s)`);

  const member = await db.getMember(phone);
  const memberName = member?.name || 'Unknown';

  if (!member) {
    console.log(`[webhook/conversation-end] Unknown caller ${phone} — skipping post-call pipeline`);
    return;
  }

  const callData = {
    conversation_id,
    phone,
    date: new Date().toISOString().slice(0, 10),
    started_at: new Date().toISOString(),
    duration_secs: call_duration_secs,
    outcome: 'completed',
    transcript: transcript || '',
    summary: null,
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

  // ── Step 1 + 2 combined: Save transcript + summary to DB ──
  await db.saveCall(phone, callData);
  console.log(`[webhook] Call saved to DB (${conversation_id})`);

  // ── Step 3: Rewrite member story ──
  if (member && transcript) {
    try {
      console.log(`[webhook] Rewriting story for ${memberName}...`);

      const [previousStory, callSummaries, midCallNotes] = await Promise.all([
        db.getStory(phone),
        db.getRecentCalls(phone, 50),
        Promise.resolve(db.getNotes(phone)),
      ]);

      const newStory = await rewriteStory(
        member,
        previousStory || '',
        callSummaries.map(c => ({ date: c.date, summary: c.summary || 'No summary.' })),
        midCallNotes
      );

      await db.writeStory(phone, newStory);
      console.log(`[webhook] Story rewritten for ${memberName} (${newStory.length} chars)`);

      db.clearNotes(phone);
    } catch (err) {
      console.error(`[webhook] Story rewrite failed:`, err.message);
    }
  }

  // ── Step 4: Update member profile ──
  const callCount = await db.getCallCount(phone);
  await db.upsertMember(phone, {
    calls: callCount,
    lastCall: new Date().toISOString().slice(0, 10),
    lastOutcome: 'completed',
    status: 'active',
  });

  console.log(`[webhook] Post-call pipeline complete for ${memberName} (${phone})`);
});

router.post('/call-status', (req, res) => {
  const { CallSid, CallStatus, To, Duration } = req.body;
  console.log(`[webhook/call-status] ${CallSid}: ${CallStatus} → ${To} (${Duration || 0}s)`);
  res.sendStatus(200);
});

module.exports = router;
